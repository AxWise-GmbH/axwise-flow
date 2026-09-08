"""Assistant claim projection keeps assertions, not provider Markdown fragments."""

from __future__ import annotations

import copy
import hashlib

import pytest

from backend.domain.workflow_v2.contracts import OperationMetrics
from backend.services.workflow_v2.assistant.claim_spans import (
    normalize_assistant_claims,
)
from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure


pytestmark = pytest.mark.contract
SOURCE = "https://docs.example.org/reference"


def grounded_response(
    text: str,
    supports: list[str | tuple[int, int]],
    *,
    urls: list[str] | None = None,
    parts: list[str] | None = None,
    part_index: int = 0,
) -> dict:
    """Build the actual Gemini adapter's exact response-part provenance shape."""
    parts = parts or [text]
    part = parts[part_index]
    hashes = [hashlib.sha256(value.encode("utf-8")).hexdigest() for value in parts]
    response_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    urls = urls or [SOURCE] * len(supports)
    claims = []
    for support, url in zip(supports, urls, strict=True):
        if isinstance(support, str):
            start = part.index(support)
            end = start + len(support)
        else:
            start, end = support
        claims.append(
            {
                "text": part[start:end],
                "source_urls": [url],
                "provider": "gemini_google_search",
                "provider_response_hash": response_hash,
                "provider_query_ids": ["query-id"],
                "provider_queries": ["reference question"],
                "grounding_chunk_indices": [0],
                "segment_start": len(part[:start].encode("utf-8")),
                "segment_end": len(part[:end].encode("utf-8")),
                "part_index": part_index,
                "offset_unit": "utf8_bytes",
                "span_target": "provider_response_part",
                "provenance_artifact": {
                    "artifact_type": "provider_response_part",
                    "part_index": part_index,
                    "text": part,
                    "sha256": hashes[part_index],
                    "response_parts_sha256": hashlib.sha256(
                        "\n".join(hashes).encode("ascii")
                    ).hexdigest(),
                    "response_part_hashes": hashes,
                    "response_parts": parts,
                    "provider_response_text": text,
                    "provider_response_sha256": response_hash,
                },
                "confidence_scores": [0.9],
            }
        )
    return {
        "text": text,
        "provider": "gemini_google_search",
        "provider_response_hash": response_hash,
        "claims": claims,
        "sources": [{"title": "Reference", "url": url} for url in sorted(set(urls))],
        "runtime_diagnostics": {"route": "gemini_google_search", "status": "ok"},
    }


def project(raw: dict):
    return project_assistant_result(
        raw,
        response_mode="one_shot",
        source_type_classifier=lambda _url, _title: {"grounded_web"},
        usage_reader=lambda _raw: (0, 0, 0, 0),
        metrics_factory=lambda **_kwargs: OperationMetrics(latency_ms=0),
    )


def test_inline_code_and_markdown_fragments_do_not_become_supported_facts() -> None:
    valid = "The current request is available in `$json.body.text`."
    text = (
        "# Request reference\n\n"
        f"{valid}\n\n"
        "Set the expression to `{{ $json.body.text.trim() }}`.\n\n"
        "```javascript\nconst body = item.body;\nreturn {json: {trimmed: body.text.trim()}};\n```\n\n"
        "| Setting | Value |\n| --- | --- |\n| Method | POST |\n"
    )
    raw = grounded_response(
        text,
        [valid, "body", "trim() }}", "const body = item.body;", "| --- | --- |"],
    )
    original = copy.deepcopy(raw)

    result = project(raw)

    assert [fact.statement for fact in result.response.facts] == [valid]
    assert result.response.markdown == text.strip()
    assert raw == original, "raw provider evidence must remain immutable"


def test_contiguous_provider_supports_can_recover_one_complete_assertion() -> None:
    text = "Read `$json.body.text` from the current request."
    split = text.index("body")
    raw = grounded_response(text, [(0, split), (split, len(text))])

    assert [fact.statement for fact in project(raw).response.facts] == [text]


@pytest.mark.parametrize("different_sources", [False, True])
def test_partial_support_never_expands_into_uncited_assertion(
    different_sources: bool,
) -> None:
    text = "Read `$json.body.text` from the current request."
    split = text.index("body")
    supports = [(0, split), (split if different_sources else split + 1, len(text))]
    raw = grounded_response(
        text,
        supports,
        urls=[
            SOURCE,
            "https://other.example.org/reference" if different_sources else SOURCE,
        ],
    )

    with pytest.raises(CognitiveExecutionFailure) as raised:
        project(raw)

    assert raised.value.error_class == "AXWISE_ASSISTANT_UNGROUNDED_RESPONSE"


def test_unicode_multipart_projection_retains_exact_byte_and_hash_attribution() -> None:
    part = "The café uses `reader.body.text.trim()` for Unicode input."
    prefix = "Earlier part 🧭.\n\n"
    split = part.index("body")
    raw = grounded_response(
        prefix + part,
        [(0, split), (split, len(part))],
        parts=[prefix, part],
        part_index=1,
    )
    raw["claims"][1]["grounding_chunk_indices"] = [1]
    original = copy.deepcopy(raw)

    claims = normalize_assistant_claims(raw)

    assert len(claims) == 1
    claim = claims[0]
    assert claim["text"] == part
    assert claim["part_index"] == 1
    assert claim["offset_unit"] == "utf8_bytes"
    assert (claim["segment_start"], claim["segment_end"]) == (
        0,
        len(part.encode("utf-8")),
    )
    assert claim["provenance_artifact"] == raw["claims"][0]["provenance_artifact"]
    assert (
        claim["provider_response_hash"]
        == hashlib.sha256(raw["text"].encode("utf-8")).hexdigest()
    )
    assert claim["grounding_chunk_indices"] == [0, 1]
    assert claim["supporting_segments"] == [
        {"start": item["segment_start"], "end": item["segment_end"]}
        for item in raw["claims"]
    ]
    assert raw == original


@pytest.mark.parametrize(
    "tamper", ["response_hash", "part_hash", "manifest", "span", "part_index"]
)
def test_invalid_provider_provenance_cannot_become_a_fact(tamper: str) -> None:
    raw = grounded_response("Évidence is preserved.", ["Évidence is preserved."])
    claim = raw["claims"][0]
    if tamper == "response_hash":
        raw["provider_response_hash"] = "0" * 64
    elif tamper == "part_hash":
        claim["provenance_artifact"]["sha256"] = "0" * 64
    elif tamper == "manifest":
        claim["provenance_artifact"]["response_parts_sha256"] = "0" * 64
    elif tamper == "span":
        claim["segment_start"] = 1  # Inside the UTF-8 encoding of É.
    else:
        claim["part_index"] = True

    assert normalize_assistant_claims(raw) == []


def test_supported_table_row_is_kept_without_header_separator_or_isolated_cell() -> (
    None
):
    header = "| Request setting | Value |"
    separator = "| :--- | ---: |"
    row = "| Request method | POST |"
    text = f"{header}\n{separator}\n{row}\n"
    raw = grounded_response(text, [header, separator, "POST", row])

    assert [fact.statement for fact in project(raw).response.facts] == [row]


@pytest.mark.parametrize(
    "statement",
    [
        "Berlin.",
        "Yes.",
        "Version 2.9.0 supports this mode.",
        "Read ``a`b.body`` as one inline expression.",
    ],
)
def test_named_facts_and_complete_inline_code_assertions_are_not_hidden(
    statement: str,
) -> None:
    assert [
        fact.statement
        for fact in project(grounded_response(statement, [statement])).response.facts
    ] == [statement]


def test_fully_supported_paragraph_projects_exact_sentences_without_added_content() -> (
    None
):
    first, second = "The field is optional.", "Its default is `false`."
    text = f"{first} {second}"
    raw = grounded_response(text, [text])

    claims = normalize_assistant_claims(raw)

    assert [item["text"] for item in claims] == [first, second]
    for claim in claims:
        assert (
            text.encode("utf-8")[claim["segment_start"] : claim["segment_end"]].decode(
                "utf-8"
            )
            == claim["text"]
        )


def test_known_span_inside_code_does_not_match_same_word_elsewhere_in_response() -> (
    None
):
    text = "body\n\nRead `$json.body.text` from the request."
    start = text.index("body", text.index("Read"))
    raw = grounded_response(text, [(start, start + len("body"))])

    assert normalize_assistant_claims(raw) == []


def test_long_assertion_is_not_truncated_into_a_different_supported_claim() -> None:
    text = "The " + "documented " * 450 + "setting is optional."

    assert normalize_assistant_claims(grounded_response(text, [text])) == []


def test_indented_list_continuation_is_part_of_the_supported_assertion() -> None:
    statement = "The response uses\n    `$json.body.text` as its input."
    text = "- " + statement

    assert [
        fact.statement
        for fact in project(grounded_response(text, [statement])).response.facts
    ] == [statement]


def test_quoted_fences_are_not_claims_but_following_prose_remains_available() -> None:
    statement = "The result is returned as JSON."
    text = "> ```javascript\n> return {json: {ok: true}};\n> ```\n\n" + statement
    raw = grounded_response(text, ["return {json: {ok: true}};", statement])

    assert [fact.statement for fact in project(raw).response.facts] == [statement]


def test_direct_fetch_excerpts_remain_owned_by_the_existing_verification_path() -> None:
    # A verified publisher excerpt need not be a whole prose sentence.
    claim = {"text": "inside a longer sentence", "segment_start": 7, "segment_end": 31}
    raw = {"provider": "searxng_direct_fetch", "claims": [claim]}

    assert normalize_assistant_claims(raw) == [claim]


def test_inline_link_destination_does_not_swallow_the_next_assertion() -> None:
    first = "See the [request reference](https://docs.example.org/request)."
    second = "The current field is optional."
    text = f"{first} {second}"
    raw = grounded_response(text, [first, second])

    assert [fact.statement for fact in project(raw).response.facts] == [first, second]


@pytest.mark.parametrize("punctuation", [".", "!", "?", "..."])
def test_exact_supported_core_can_omit_only_terminal_sentence_punctuation(
    punctuation: str,
) -> None:
    core = "Webhook accepts POST"
    raw = grounded_response(core + punctuation, [core])
    original = copy.deepcopy(raw)

    claims = normalize_assistant_claims(raw)

    assert len(claims) == 1
    assert claims[0] == raw["claims"][0]
    assert claims[0]["text"] == core
    assert claims[0]["segment_end"] == len(core.encode("utf-8"))
    assert raw == original


def test_fully_supported_punctuation_is_preferred_without_duplicate_core_fact() -> None:
    core = "The café reads `$json.body.text`"
    full = core + "."
    raw = grounded_response(full, [core, full])

    claims = normalize_assistant_claims(raw)

    assert [claim["text"] for claim in claims] == [full]
    assert claims[0]["segment_end"] == len(full.encode("utf-8"))


@pytest.mark.parametrize(
    ("text", "support"),
    [
        ("Webhook accepts POST.", "Webhook accepts"),
        ("The request uses `$json.body.text`.", "The request uses `$json.body.text"),
        ("The request uses `$json.body.text.`", "The request uses `$json.body.text"),
        ("The request uses `$json.body.text.", "The request uses `$json.body.text"),
        (
            "| Name | Meaning |\n| --- | --- |\n| `body` | Input object.\n",
            "Input object",
        ),
    ],
)
def test_punctuation_exception_never_covers_missing_words_code_markers_or_cells(
    text: str,
    support: str,
) -> None:
    assert normalize_assistant_claims(grounded_response(text, [support])) == []


@pytest.mark.parametrize("prefix", ["- [ ] ", "* [x] "])
def test_checkbox_prefix_is_syntax_not_part_of_the_supported_assertion(
    prefix: str,
) -> None:
    core = "The request body contains JSON"
    raw = grounded_response(prefix + core + ".", [core])

    assert [claim["text"] for claim in normalize_assistant_claims(raw)] == [core]
