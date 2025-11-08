import os
import base64
from typing import Optional


class GeminiImageService:
    """Thin wrapper around Google Gemini image generation.

    Returns a base64 PNG string on success, or None if the SDK or env are not available.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self._client = None
        try:
            # Lazy import so environments without the SDK still work
            from google import genai  # type: ignore

            if self.api_key:
                self._client = genai.Client(api_key=self.api_key)
        except Exception:
            self._client = None

    def is_available(self) -> bool:
        return bool(self._client)

    def generate_avatar_base64(self, prompt: str, temperature: float = 0.8) -> Optional[str]:
        """Generate an avatar image (base64 PNG) using Gemini. Returns None on failure."""
        if not self._client:
            return None
        try:
            from google.genai import types  # type: ignore

            # Use latest recommended defaults per docs
            model_name = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
            cfg = types.GenerateContentConfig(
                temperature=temperature,
                response_modalities=["Image"],  # image-only response
            )

            # The SDK supports a bare string or a list of parts; prefer list
            resp = self._client.models.generate_content(
                model=model_name,
                contents=[prompt],
                config=cfg,
            )

            # Newer SDKs expose top-level parts; keep backward compatibility
            parts = getattr(resp, "parts", None)
            if not parts:
                cand = (getattr(resp, "candidates", None) or [None])[0]
                if not cand:
                    return None
                content = getattr(cand, "content", cand)
                parts = getattr(content, "parts", None)
            if not parts:
                return None

            for part in parts:
                inline = getattr(part, "inline_data", None)
                data = getattr(inline, "data", None)
                if data:
                    # Gemini SDK returns raw bytes; we need base64 string
                    if isinstance(data, bytes):
                        return base64.b64encode(data).decode('ascii')
                    # If it's already a string (base64), return as-is
                    elif isinstance(data, str):
                        return data
                    # Fallback: convert to string representation
                    else:
                        return str(data)
        except Exception:
            return None
        return None

