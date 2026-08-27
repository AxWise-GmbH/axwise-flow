from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    EvidenceAcquisitionPassV1,
    EvidenceClaimV1,
    EvidenceRequirement,
    SourceSpan,
    artifact_content_hash,
    canonical_hash,
    canonical_json,
    utf16_slice,
)


pytestmark = pytest.mark.contract
GOLDEN = Path(__file__).with_name("fixtures") / "canonical_v1_golden.json"
COMPILE_SCOPE_ENVELOPE = (
    Path(__file__).with_name("fixtures") / "compile_scope_envelope_v2.json"
)


def test_canonical_v1_shared_golden_vectors_and_utf16_span() -> None:
    fixture = json.loads(GOLDEN.read_text(encoding="utf-8"))
    for vector in fixture["vectors"]:
        assert canonical_json(vector["value"]) == vector["canonical"]
        assert canonical_hash(vector["value"]) == vector["sha256"]

    span = fixture["sourceSpan"]
    exact = utf16_slice(span["source"], span["start"], span["end"])
    assert exact == span["text"]
    assert hashlib.sha256(exact.encode("utf-8")).hexdigest() == span["sha256"]
    assert SourceSpan.model_validate(
        {key: value for key, value in span.items() if key != "source"}
    ).offset_unit == "utf16_code_units"


@pytest.mark.parametrize(
    "value",
    [
        1.5,
        9_007_199_254_740_992,
        "\ud800",
        "\udc00",
        {"\ud800": "bad"},
        ("tuple-is-not-json",),
    ],
)
def test_canonical_v1_rejects_cross_language_ambiguity(value) -> None:
    with pytest.raises(TypeError):
        canonical_json(value)


def test_compile_scope_envelope_matches_shared_javascript_fixture() -> None:
    fixture = json.loads(COMPILE_SCOPE_ENVELOPE.read_text(encoding="utf-8"))
    envelope = AxWiseOperationEnvelope.model_validate(fixture)

    assert envelope.operation_type == "CompileScopeV2"
    assert "mode" not in fixture["input"]
    assert fixture["input"]["safeDefaults"] == {
        "geography": [],
        "acceptedSourceTypes": [],
        "assumptions": [],
        "limits": [],
        "policies": [],
    }
    assert canonical_hash(fixture["input"]) == fixture["canonicalInputHash"]


def _claim(text: str, response: str) -> dict:
    source_types = ["grounded_web"]
    source_urls = ["https://example.test/source"]
    response_bytes = response.encode("utf-8")
    claim_bytes = text.encode("utf-8")
    start = response_bytes.index(claim_bytes)
    return {
        "claimId": canonical_hash(
            {"text": text, "sourceTypes": source_types, "sourceUrls": source_urls}
        ),
        "text": text,
        "textSha256": hashlib.sha256(claim_bytes).hexdigest(),
        "sourceUrls": source_urls,
        "sourceTypes": source_types,
        "providerResponseHash": hashlib.sha256(response_bytes).hexdigest(),
        "segmentStart": start,
        "segmentEnd": start + len(claim_bytes),
        "offsetUnit": "utf8_bytes",
    }


def test_acquisition_claim_proves_exact_utf8_provider_response_slice() -> None:
    response = "Prefix — exact 😀 claim — suffix"
    claim = _claim("exact 😀 claim", response)
    parsed = EvidenceAcquisitionPassV1.model_validate(
        {
            "requirementId": "market-fact",
            "passNumber": 0,
            "queryHash": "a" * 64,
            "providerResponseHash": hashlib.sha256(response.encode("utf-8")).hexdigest(),
            "providerResponseText": response,
            "claims": [claim],
            "sourceTypesSeen": ["grounded_web"],
        }
    )
    assert parsed.claims == [EvidenceClaimV1.model_validate(claim)]

    changed = parsed.model_dump(mode="json", by_alias=True)
    changed["providerResponseText"] = response.replace("claim", "claimX")
    with pytest.raises(ValidationError, match="provider response hash"):
        EvidenceAcquisitionPassV1.model_validate(changed)


def test_evidence_claim_rejects_noncanonical_or_private_source_url() -> None:
    claim = _claim("Exact claim", "Exact claim")
    claim["sourceUrls"] = ["https://127.0.0.1/private"]
    claim["claimId"] = canonical_hash(
        {
            "text": claim["text"],
            "sourceTypes": claim["sourceTypes"],
            "sourceUrls": claim["sourceUrls"],
        }
    )

    with pytest.raises(ValidationError, match="canonical public HTTPS"):
        EvidenceClaimV1.model_validate(claim)


def test_blocking_requirement_needs_an_authoritative_source_class() -> None:
    with pytest.raises(ValidationError, match="authoritative accepted source"):
        EvidenceRequirement.model_validate(
            {
                "id": "unsafe-block",
                "claimType": "commercial_offer",
                "description": "A commercial detail cannot globally block delivery.",
                "criticality": "blocking",
                "appliesWhen": "always",
                "acceptedSourceTypes": ["grounded_web", "industry"],
            }
        )


def test_artifact_hash_is_exact_content_envelope_not_payload_only() -> None:
    payload = {"markdown": "# Hé😀"}
    assert artifact_content_hash(
        content_type="text/markdown", payload=payload, markdown="# Hé😀"
    ) == "6d43ff830cee40ccaee305ce2b5c8b227385f05823db241a0071f52accff9cf8"
    assert canonical_hash(payload) != artifact_content_hash(
        content_type="text/markdown", payload=payload, markdown="# Hé😀"
    )
