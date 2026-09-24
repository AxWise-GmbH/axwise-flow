"""Bounded Gemini image generation for explicit Assistant V2 capabilities."""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import os
import re
from dataclasses import dataclass
from typing import Any

from google import genai
from google.genai import types


IMAGE_MODEL = "gemini-3.1-flash-image"
IMAGE_MODEL_RESOURCE = f"models/{IMAGE_MODEL}"
MAX_INPUT_IMAGE_BYTES = 1024 * 1024
MAX_OUTPUT_IMAGE_BYTES = 10 * 1024 * 1024
DEFAULT_IMAGE_DEADLINE_SECONDS = 120.0
SUPPORTED_IMAGE_MIME_TYPES = frozenset(
    {"image/png", "image/jpeg", "image/webp"}
)
SUPPORTED_ASPECT_RATIOS = frozenset(
    {"1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"}
)
PERMANENT_REFUSAL_REASONS = frozenset(
    {
        "BLOCKLIST",
        "IMAGE_PROHIBITED_CONTENT",
        "IMAGE_RECITATION",
        "IMAGE_SAFETY",
        "JAILBREAK",
        "LANGUAGE",
        "MODEL_ARMOR",
        "PROHIBITED_CONTENT",
        "RECITATION",
        "SAFETY",
        "SPII",
    }
)


class AssistantImageGenerationError(RuntimeError):
    """Sanitized provider failure suitable for the cognitive operation boundary."""

    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class AssistantInputImage:
    data: bytes
    mime_type: str


@dataclass(frozen=True)
class AssistantGeneratedImage:
    data: bytes
    mime_type: str
    sha256: str
    model: str
    model_version: str | None
    input_tokens: int | None
    output_tokens: int | None

    @property
    def data_base64(self) -> str:
        return base64.b64encode(self.data).decode("ascii")


def decode_input_image(data_base64: str, mime_type: str) -> AssistantInputImage:
    if mime_type not in SUPPORTED_IMAGE_MIME_TYPES:
        raise ValueError("unsupported assistant input image MIME type")
    try:
        data = base64.b64decode(data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("assistant input image must be canonical base64") from None
    if base64.b64encode(data).decode("ascii") != data_base64:
        raise ValueError("assistant input image must use canonical base64 encoding")
    _validate_image_bytes(data, mime_type, MAX_INPUT_IMAGE_BYTES)
    return AssistantInputImage(data=data, mime_type=mime_type)


def _validate_image_bytes(data: bytes, mime_type: str, maximum: int) -> None:
    if not data or len(data) > maximum:
        raise ValueError("assistant image exceeds its byte boundary")
    signatures = {
        "image/png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg": data.startswith(b"\xff\xd8\xff"),
        "image/webp": len(data) >= 12
        and data.startswith(b"RIFF")
        and data[8:12] == b"WEBP",
    }
    if mime_type not in SUPPORTED_IMAGE_MIME_TYPES or not signatures[mime_type]:
        raise ValueError("assistant image bytes do not match the declared MIME type")


def _parts(response: Any) -> list[Any]:
    direct = getattr(response, "parts", None)
    if direct:
        return list(direct)
    parts: list[Any] = []
    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        parts.extend(getattr(content, "parts", None) or [])
    return parts


def _usage_value(response: Any, name: str) -> int | None:
    usage = getattr(response, "usage_metadata", None)
    value = getattr(usage, name, None)
    return value if type(value) is int and value >= 0 else None


def _normalized_reason_name(reason: Any) -> str | None:
    value = getattr(reason, "value", reason)
    if not isinstance(value, str):
        return None
    normalized = value.rsplit(".", 1)[-1].strip().upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9_]{0,63}", normalized):
        return None
    return normalized


def _finish_reason_name(candidate: Any) -> str | None:
    return _normalized_reason_name(getattr(candidate, "finish_reason", None))


def _prompt_block_reason_name(response: Any) -> str | None:
    prompt_feedback = getattr(response, "prompt_feedback", None)
    return _normalized_reason_name(getattr(prompt_feedback, "block_reason", None))


class GeminiAssistantImageRunner:
    """One explicit image call; no search, tools, OMP, JEV, or hidden retries."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        client: Any | None = None,
        deadline_seconds: float = DEFAULT_IMAGE_DEADLINE_SECONDS,
        model: str | None = None,
    ) -> None:
        configured = (model or os.getenv("GEMINI_IMAGE_MODEL") or IMAGE_MODEL).strip()
        normalized = configured.removeprefix("models/")
        if normalized != IMAGE_MODEL:
            raise RuntimeError(
                f"Assistant image generation requires {IMAGE_MODEL_RESOURCE}"
            )
        if deadline_seconds <= 0 or deadline_seconds > 300:
            raise ValueError("assistant image deadline must be within five minutes")
        self.model = IMAGE_MODEL
        self.deadline_seconds = deadline_seconds
        self._owns_client = client is None
        credential = api_key or os.getenv("GEMINI_API_KEY")
        if client is None and not credential:
            raise RuntimeError("GEMINI_API_KEY is required for image generation")
        self.client = client or genai.Client(api_key=credential)

    async def generate(
        self,
        prompt: str,
        *,
        aspect_ratio: str | None = None,
        image_size: str = "1K",
        input_image: AssistantInputImage | None = None,
    ) -> AssistantGeneratedImage:
        normalized_prompt = prompt.strip()
        if not normalized_prompt or len(normalized_prompt) > 24_000:
            raise ValueError("assistant image prompt is outside the accepted boundary")
        if aspect_ratio is not None and aspect_ratio not in SUPPORTED_ASPECT_RATIOS:
            raise ValueError("unsupported assistant image aspect ratio")
        # Keep the first release bounded. Larger outputs belong in authenticated
        # blob storage rather than durable operation/message JSON.
        if image_size != "1K":
            raise ValueError("assistant image output is currently limited to 1K")
        parts = [types.Part.from_text(text=normalized_prompt)]
        if input_image is not None:
            _validate_image_bytes(
                input_image.data, input_image.mime_type, MAX_INPUT_IMAGE_BYTES
            )
            parts.insert(
                0,
                types.Part.from_bytes(
                    data=input_image.data, mime_type=input_image.mime_type
                ),
            )
        config = types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(
                image_size=image_size,
                **({"aspect_ratio": aspect_ratio} if aspect_ratio else {}),
            ),
        )
        try:
            response = await asyncio.wait_for(
                self.client.aio.models.generate_content(
                    model=self.model,
                    contents=[types.Content(role="user", parts=parts)],
                    config=config,
                ),
                timeout=self.deadline_seconds,
            )
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            raise AssistantImageGenerationError(
                "AXWISE_ASSISTANT_IMAGE_DEADLINE", retryable=True
            ) from None
        except Exception:
            raise AssistantImageGenerationError(
                "AXWISE_ASSISTANT_IMAGE_PROVIDER_FAILED", retryable=True
            ) from None

        prompt_block_reason = _prompt_block_reason_name(response)
        if (
            prompt_block_reason in PERMANENT_REFUSAL_REASONS
            or any(
                _finish_reason_name(candidate) in PERMANENT_REFUSAL_REASONS
                for candidate in (getattr(response, "candidates", None) or [])
            )
        ):
            raise AssistantImageGenerationError(
                "AXWISE_ASSISTANT_IMAGE_REFUSED", retryable=False
            )

        images: list[tuple[bytes, str]] = []
        for part in _parts(response):
            inline = getattr(part, "inline_data", None)
            mime_type = getattr(inline, "mime_type", None)
            raw = getattr(inline, "data", None)
            if mime_type not in SUPPORTED_IMAGE_MIME_TYPES or raw is None:
                continue
            if isinstance(raw, str):
                try:
                    data = base64.b64decode(raw, validate=True)
                except (binascii.Error, ValueError):
                    raise AssistantImageGenerationError(
                        "AXWISE_ASSISTANT_IMAGE_INVALID_OUTPUT", retryable=True
                    ) from None
            elif isinstance(raw, bytes):
                data = raw
            else:
                raise AssistantImageGenerationError(
                    "AXWISE_ASSISTANT_IMAGE_INVALID_OUTPUT", retryable=True
                )
            try:
                _validate_image_bytes(data, mime_type, MAX_OUTPUT_IMAGE_BYTES)
            except ValueError:
                raise AssistantImageGenerationError(
                    "AXWISE_ASSISTANT_IMAGE_INVALID_OUTPUT", retryable=True
                ) from None
            images.append((data, mime_type))
        if len(images) != 1:
            raise AssistantImageGenerationError(
                "AXWISE_ASSISTANT_IMAGE_INVALID_OUTPUT", retryable=True
            )
        data, mime_type = images[0]
        model_version = getattr(response, "model_version", None)
        if not isinstance(model_version, str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}", model_version
        ):
            model_version = None
        return AssistantGeneratedImage(
            data=data,
            mime_type=mime_type,
            sha256=hashlib.sha256(data).hexdigest(),
            model=self.model,
            model_version=model_version,
            input_tokens=_usage_value(response, "prompt_token_count"),
            output_tokens=_usage_value(response, "candidates_token_count"),
        )

    async def close(self) -> None:
        if not self._owns_client:
            return
        close = getattr(getattr(self.client, "aio", None), "aclose", None)
        if callable(close):
            await close()
        sync_close = getattr(self.client, "close", None)
        if callable(sync_close):
            sync_close()


__all__ = [
    "AssistantGeneratedImage",
    "AssistantImageGenerationError",
    "AssistantInputImage",
    "GeminiAssistantImageRunner",
    "IMAGE_MODEL",
    "MAX_INPUT_IMAGE_BYTES",
    "MAX_OUTPUT_IMAGE_BYTES",
    "SUPPORTED_ASPECT_RATIOS",
    "SUPPORTED_IMAGE_MIME_TYPES",
    "decode_input_image",
]
