from __future__ import annotations

import hashlib
import json
from types import SimpleNamespace

import pytest
from pydantic_ai import ModelRetry, PromptedOutput
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.models.test import TestModel

import backend.services.workflow_v2.exact_span_extractor as extractor_module
from backend.services.workflow_v2.exact_span_extractor import (
    BoundedFetchedDocument,
    DraftCodePointSpan,
    ExactSpanExtractionFailure,
    ExactSpanExtractionRequest,
    ExactSpanRequirementQuery,
    ExactSpanSelectionDraft,
    MAX_EXTRACTED_SPAN_CODE_POINTS,
    PydanticAIExactSpanExtractor,
    assemble_exact_span_result,
    validate_span_selection,
)


pytestmark = pytest.mark.contract


def extraction_request(
    *,
    text: str = "The 🐈 product must carry the required feed label in Estonia.",
) -> ExactSpanExtractionRequest:
    return ExactSpanExtractionRequest(
        requirement_query=ExactSpanRequirementQuery(
            requirement_id="estonia-feed-label",
            requirement="Verify the applicable Estonia feed-labelling obligation.",
            applies_when="When assessing Estonia pet-food market entry.",
            query="Estonia official feed labelling requirements cat food",
        ),
        documents=[
            BoundedFetchedDocument(
                document_id="doc-01",
                title="Official feed labelling guidance",
                text=text,
            )
        ],
    )


def test_model_output_schema_cannot_supply_claim_text_or_urls() -> None:
    fields = set(ExactSpanSelectionDraft.model_fields)

    assert fields == {"document_id", "spans"}
    assert "text" not in fields
    assert "url" not in fields


def test_extractor_uses_prompted_output_two_retries_and_output_validator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class CapturingAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def output_validator(self, function):
            captured["validator"] = function
            return function

    monkeypatch.setattr(extractor_module, "Agent", CapturingAgent)
    PydanticAIExactSpanExtractor(object())

    assert isinstance(captured["output_type"], PromptedOutput)
    assert captured["retries"] == {"output": 2}
    system_prompt = str(captured["system_prompt"])
    assert "Use no outside knowledge" in system_prompt
    assert "zero-based Python Unicode code-point" in system_prompt
    assert "Never return, paraphrase, or invent claim" in system_prompt
    assert "exact accepted APPLIES_WHEN gate" in system_prompt


@pytest.mark.asyncio
async def test_extractor_prompt_carries_exact_server_applicability() -> None:
    captured: dict[str, object] = {}

    class CapturingRunAgent:
        async def run(self, prompt, *, deps):
            captured["prompt"] = json.loads(prompt)
            assert deps.requirement_query.applies_when == (
                "When assessing Estonia pet-food market entry."
            )
            return SimpleNamespace(
                output=ExactSpanSelectionDraft(document_id=None, spans=[]),
                usage=SimpleNamespace(input_tokens=4, output_tokens=2),
            )

    extractor = PydanticAIExactSpanExtractor(
        TestModel(profile={"supports_json_schema_output": True})
    )
    extractor.agent = CapturingRunAgent()

    result = await extractor.extract(extraction_request())

    assert result.chosen_document is None
    requirement = captured["prompt"]["SERVER_REQUIREMENT"]
    assert requirement == {
        "appliesWhen": "When assessing Estonia pet-food market entry.",
        "requirementId": "estonia-feed-label",
        "text": "Verify the applicable Estonia feed-labelling obligation.",
    }


@pytest.mark.asyncio
async def test_output_validator_rejects_duplicate_spans_with_model_retry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class CapturingAgent:
        def __init__(self, **_kwargs):
            pass

        def output_validator(self, function):
            captured["validator"] = function
            return function

    monkeypatch.setattr(extractor_module, "Agent", CapturingAgent)
    PydanticAIExactSpanExtractor(object())
    validator = captured["validator"]
    request = extraction_request(text="direct evidence")

    with pytest.raises(ModelRetry, match="spans must be unique"):
        await validator(
            SimpleNamespace(deps=request),
            ExactSpanSelectionDraft(
                document_id="doc-01",
                spans=[
                    DraftCodePointSpan(start=0, end=6),
                    DraftCodePointSpan(start=0, end=6),
                ],
            ),
        )


@pytest.mark.parametrize(
    ("selection", "error"),
    [
        (
            ExactSpanSelectionDraft(
                document_id="missing-doc",
                spans=[DraftCodePointSpan(start=0, end=1)],
            ),
            "not in the supplied documents",
        ),
        (
            ExactSpanSelectionDraft(
                document_id="doc-01",
                spans=[DraftCodePointSpan(start=0, end=999)],
            ),
            "non-empty in-range",
        ),
        (
            ExactSpanSelectionDraft(
                document_id="doc-01",
                spans=[
                    DraftCodePointSpan(start=0, end=1),
                    DraftCodePointSpan(start=0, end=1),
                ],
            ),
            "spans must be unique",
        ),
        (
            ExactSpanSelectionDraft.model_construct(
                document_id="doc-01",
                spans=[DraftCodePointSpan.model_construct(start=2, end=2)],
            ),
            "non-empty in-range",
        ),
        (
            ExactSpanSelectionDraft(
                document_id="doc-01",
                spans=[
                    DraftCodePointSpan(
                        start=0,
                        end=MAX_EXTRACTED_SPAN_CODE_POINTS + 1,
                    )
                ],
            ),
            "exact-claim length bound",
        ),
    ],
)
def test_selection_rejects_unknown_out_of_range_duplicate_and_empty_spans(
    selection: ExactSpanSelectionDraft,
    error: str,
) -> None:
    source_text = (
        "x" * (MAX_EXTRACTED_SPAN_CODE_POINTS + 1)
        if error == "exact-claim length bound"
        else "direct evidence"
    )
    with pytest.raises(ValueError, match=error):
        validate_span_selection(extraction_request(text=source_text), selection)


def test_server_assembles_exact_python_code_point_slice_and_hash() -> None:
    text = "A🐈 Estonia obligation applies."
    request = extraction_request(text=text)
    start = text.index("🐈")
    end = text.index(" obligation")

    result = assemble_exact_span_result(
        request,
        ExactSpanSelectionDraft(
            document_id="doc-01",
            spans=[DraftCodePointSpan(start=start, end=end)],
        ),
        input_tokens=13,
        output_tokens=5,
    )

    assert result.chosen_document == request.documents[0]
    assert len(result.spans) == 1
    assert result.spans[0].start == 1
    assert result.spans[0].text == "🐈 Estonia"
    assert result.spans[0].text_sha256 == hashlib.sha256(
        "🐈 Estonia".encode("utf-8")
    ).hexdigest()
    assert (result.input_tokens, result.output_tokens) == (13, 5)


@pytest.mark.asyncio
async def test_test_model_run_returns_only_server_derived_text() -> None:
    text = "Preface. Estonia requires an applicable feed label. Appendix."
    selected_text = "Estonia requires an applicable feed label."
    start = text.index(selected_text)
    output = {
        "document_id": "doc-01",
        "spans": [{"start": start, "end": start + len(selected_text)}],
    }
    extractor = PydanticAIExactSpanExtractor(
        TestModel(
            custom_output_text=json.dumps(output),
            profile={"supports_json_schema_output": True},
        )
    )

    result = await extractor.extract(extraction_request(text=text))

    assert result.chosen_document is not None
    assert result.chosen_document.document_id == "doc-01"
    assert [span.text for span in result.spans] == [selected_text]
    assert result.input_tokens >= 0
    assert result.output_tokens >= 0


@pytest.mark.asyncio
async def test_terminal_output_retry_exhaustion_becomes_content_free_failure() -> None:
    secret_model_text = "raw model response must never escape"

    class ExhaustedAgent:
        async def run(self, _prompt, *, deps):
            assert deps.requirement_query.requirement_id == "estonia-feed-label"
            try:
                raise ModelRetry(secret_model_text)
            except ModelRetry as validation_error:
                raise UnexpectedModelBehavior(
                    "Exceeded maximum output retries (2)"
                ) from validation_error

    extractor = PydanticAIExactSpanExtractor(
        TestModel(profile={"supports_json_schema_output": True})
    )
    extractor.agent = ExhaustedAgent()

    with pytest.raises(ExactSpanExtractionFailure) as raised:
        await extractor.extract(extraction_request())

    assert raised.value.code == "AXWISE_EXACT_SPAN_OUTPUT_RETRIES_EXHAUSTED"
    assert raised.value.retryable is True
    assert secret_model_text not in str(raised.value)
    assert raised.value.__suppress_context__ is True


@pytest.mark.asyncio
async def test_post_run_validation_is_repeated_and_content_free() -> None:
    class InvalidResultAgent:
        async def run(self, _prompt, *, deps):
            assert deps.documents[0].document_id == "doc-01"
            return SimpleNamespace(
                output=ExactSpanSelectionDraft.model_construct(
                    document_id="doc-01",
                    spans=[DraftCodePointSpan.model_construct(start=0, end=999_999)],
                ),
                usage=SimpleNamespace(input_tokens=8, output_tokens=3),
            )

    extractor = PydanticAIExactSpanExtractor(
        TestModel(profile={"supports_json_schema_output": True})
    )
    extractor.agent = InvalidResultAgent()

    with pytest.raises(ExactSpanExtractionFailure) as raised:
        await extractor.extract(extraction_request())

    assert raised.value.code == "AXWISE_EXACT_SPAN_POST_VALIDATION_FAILED"
    assert str(raised.value) == "AXWISE_EXACT_SPAN_POST_VALIDATION_FAILED"
