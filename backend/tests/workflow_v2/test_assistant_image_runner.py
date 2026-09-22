from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai import types

from backend.services.workflow_v2.assistant.image_runner import (
    AssistantImageGenerationError,
    GeminiAssistantImageRunner,
    decode_input_image,
)


PNG = b"\x89PNG\r\n\x1a\n" + b"generated"
JPEG = b"\xff\xd8\xff" + b"input"
pytestmark = pytest.mark.contract


def fake_client(response):
    generate = AsyncMock(return_value=response)
    client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )
    return client, generate


def response_with_image(data=PNG, mime_type="image/png"):
    return types.GenerateContentResponse(
        model_version="gemini-3.1-flash-image-001",
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=11,
            candidates_token_count=7,
            total_token_count=18,
        ),
        candidates=[
            types.Candidate(
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part(
                            inline_data=types.Blob(data=data, mime_type=mime_type)
                        )
                    ],
                )
            )
        ],
    )


@pytest.mark.asyncio
async def test_generates_one_bounded_image_with_exact_model_and_config():
    client, generate = fake_client(response_with_image())
    runner = GeminiAssistantImageRunner(client=client)

    result = await runner.generate("A calm blue product illustration", aspect_ratio="16:9")

    assert result.data == PNG
    assert result.mime_type == "image/png"
    assert result.model == "gemini-3.1-flash-image"
    assert result.model_version == "gemini-3.1-flash-image-001"
    assert result.input_tokens == 11 and result.output_tokens == 7
    call = generate.await_args.kwargs
    assert call["model"] == "gemini-3.1-flash-image"
    assert call["config"].response_modalities == ["IMAGE"]
    assert call["config"].image_config.aspect_ratio == "16:9"
    assert call["config"].image_config.image_size == "1K"
    assert len(call["contents"][0].parts) == 1
    assert call["contents"][0].parts[0].text == "A calm blue product illustration"


@pytest.mark.asyncio
async def test_edit_places_validated_reference_before_prompt():
    client, generate = fake_client(response_with_image())
    runner = GeminiAssistantImageRunner(client=client)
    reference = decode_input_image(
        "/9j/aW5wdXQ=", "image/jpeg"
    )

    await runner.generate("Make the background white", input_image=reference)

    parts = generate.await_args.kwargs["contents"][0].parts
    assert parts[0].inline_data.data == JPEG
    assert parts[0].inline_data.mime_type == "image/jpeg"
    assert parts[1].text == "Make the background white"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        types.GenerateContentResponse(candidates=[]),
        types.GenerateContentResponse(
            candidates=[
                types.Candidate(
                    content=types.Content(
                        role="model", parts=[types.Part.from_text(text="not an image")]
                    )
                )
            ]
        ),
        response_with_image(b"not-png", "image/png"),
    ],
)
async def test_rejects_missing_or_invalid_image_output(response):
    client, _generate = fake_client(response)
    runner = GeminiAssistantImageRunner(client=client)

    with pytest.raises(AssistantImageGenerationError) as error:
        await runner.generate("Generate an image")

    assert error.value.code == "AXWISE_ASSISTANT_IMAGE_INVALID_OUTPUT"
    assert error.value.retryable is True


@pytest.mark.asyncio
async def test_safety_and_policy_finish_reasons_are_permanent_refusals():
    response = types.GenerateContentResponse(
        candidates=[types.Candidate(finish_reason=types.FinishReason.IMAGE_SAFETY)]
    )
    client, _generate = fake_client(response)

    with pytest.raises(AssistantImageGenerationError) as error:
        await GeminiAssistantImageRunner(client=client).generate("Generate an image")

    assert error.value.code == "AXWISE_ASSISTANT_IMAGE_REFUSED"
    assert error.value.retryable is False


@pytest.mark.asyncio
async def test_prompt_feedback_safety_block_without_candidates_is_permanent_refusal():
    response = types.GenerateContentResponse(
        candidates=[],
        prompt_feedback=types.GenerateContentResponsePromptFeedback(
            block_reason=types.BlockedReason.SAFETY
        ),
    )
    client, _generate = fake_client(response)

    with pytest.raises(AssistantImageGenerationError) as error:
        await GeminiAssistantImageRunner(client=client).generate("Generate an image")

    assert error.value.code == "AXWISE_ASSISTANT_IMAGE_REFUSED"
    assert error.value.retryable is False


@pytest.mark.asyncio
async def test_timeout_is_sanitized_and_cancellation_is_not_swallowed():
    timeout_client, timeout_generate = fake_client(response_with_image())
    timeout_generate.side_effect = asyncio.TimeoutError
    with pytest.raises(AssistantImageGenerationError) as error:
        await GeminiAssistantImageRunner(client=timeout_client).generate("Generate")
    assert error.value.code == "AXWISE_ASSISTANT_IMAGE_DEADLINE"

    cancelled_client, cancelled_generate = fake_client(response_with_image())
    cancelled_generate.side_effect = asyncio.CancelledError
    with pytest.raises(asyncio.CancelledError):
        await GeminiAssistantImageRunner(client=cancelled_client).generate("Generate")


def test_input_image_requires_canonical_base64_and_matching_magic_bytes():
    with pytest.raises(ValueError, match="canonical base64"):
        decode_input_image("not base64", "image/png")
    with pytest.raises(ValueError, match="declared MIME"):
        decode_input_image("bm90LXBuZw==", "image/png")
