from __future__ import annotations

import json
from dataclasses import replace

import pytest

from backend.domain.workflow_v2.contracts import (
    OperationFailed,
    OperationFailureDiagnostics,
)
from backend.services.workflow_v2.operation_service import (
    CognitiveExecutionFailure,
    response_for,
    sanitize_failure_diagnostics,
)
from backend.services.workflow_v2.operation_store import OperationRecord
from backend.services.workflow_v2.research_diagnostics import (
    research_evidence_from_runtime_diagnostics,
    sanitize_research_evidence_diagnostics,
)
from backend.tests.workflow_v2.test_operation_service import envelope


pytestmark = pytest.mark.contract


@pytest.mark.parametrize(
    "stage", ["context", "discovery", "admission", "fetch", "extraction"]
)
def test_operator_diagnostics_preserve_only_actual_known_primitives(stage):
    original = {
        "stage": stage,
        "query_complete": False,
        "discovery_result_count": 0,
        "discovery_invalid_result_count": 10_000,
        "candidate_count": 3,
        "fetched_count": 2,
        "fetch_error_count": 1,
        "validation_incomplete_count": 0,
        "rejected_candidate_count": 4,
        "malformed_candidate_count": 1,
        "omitted_candidate_count": 0,
        "claim_count": 0,
        "primary_provider_query_count": 1,
    }
    actual = sanitize_research_evidence_diagnostics(original)
    assert actual == original
    assert actual is not original
    original["candidate_count"] = 999
    assert actual["candidate_count"] == 3


@pytest.mark.parametrize(
    "stage",
    [
        None,
        "",
        "finished",
        "https://private.invalid",
        1,
        True,
        [],
        {},
        "admission\nsecret",
    ],
)
def test_operator_diagnostics_require_exact_known_stage(stage):
    assert (
        sanitize_research_evidence_diagnostics({"stage": stage, "candidate_count": 1})
        is None
    )


@pytest.mark.parametrize("value", [None, False, "private", 3, [], ()])
def test_operator_diagnostics_reject_non_mapping(value):
    assert sanitize_research_evidence_diagnostics(value) is None


@pytest.mark.parametrize(
    "value",
    [None, True, False, -1, 10_001, 1.0, "1", float("nan"), float("inf"), [], {}],
)
def test_operator_counts_never_coerce_or_clamp_invalid_values(value):
    assert sanitize_research_evidence_diagnostics(
        {
            "stage": "fetch",
            "fetched_count": value,
            "query_complete": value,
        }
    ) == (
        {"stage": "fetch", "query_complete": value}
        if type(value) is bool
        else {"stage": "fetch"}
    )


def test_unknown_counts_stay_absent_and_extra_content_is_discarded():
    assert sanitize_research_evidence_diagnostics(
        {
            "stage": "admission",
            "query_complete": True,
            "candidateCount": 3,
            "prompt": "PRIVATE",
            "url": "https://secret.invalid",
            "provider_body": {"Authorization": "PRIVATE"},
            "reason": "PRIVATE",
            "nested": {"stage": "fetch", "fetched_count": 1},
        }
    ) == {"stage": "admission", "query_complete": True}


def test_operation_failure_snapshots_sidecar_without_changing_wire_or_stored_diagnostics():
    raw = {
        "route": "gemini_google_search",
        "status": "response_processing_error",
        "fallback_attempted": True,
        "fallback_used": False,
        "fallback": {
            "route": "searxng_direct_fetch",
            "status": "discovery_rows_incomplete",
        },
        "evidence": {
            "stage": "admission",
            "query_complete": True,
            "candidate_count": 0,
            "rejected_candidate_count": 3,
            "url": "https://secret.invalid",
            "query": "PRIVATE",
        },
    }
    public_before = sanitize_failure_diagnostics(
        {k: v for k, v in raw.items() if k != "evidence"}
    )
    error = CognitiveExecutionFailure(
        "AXWISE_ASSISTANT_EMPTY_RESPONSE", retryable=True, diagnostics=raw
    )
    assert error.diagnostics == public_before
    assert error.evidence_diagnostics == {
        "stage": "admission",
        "query_complete": True,
        "candidate_count": 0,
        "rejected_candidate_count": 3,
    }
    raw["evidence"]["candidate_count"] = 99
    assert error.evidence_diagnostics["candidate_count"] == 0
    operation = envelope()
    record = OperationRecord(
        operation_id=operation.operation_id,
        tenant_id=operation.owner.tenant_id,
        canonical_input_hash=operation.canonical_input_hash,
        status="failed",
        result_payload=None,
        retryable=True,
        error_class=error.error_class,
        failure_diagnostics=error.diagnostics,
    )
    payload = response_for(record, "https://unused.invalid").model_dump(
        mode="json",
        by_alias=True,
        exclude_none=True,
    )
    expected = response_for(
        replace(record, failure_diagnostics=public_before), "https://unused.invalid"
    ).model_dump(
        mode="json",
        by_alias=True,
        exclude_none=True,
    )
    assert payload == expected
    assert OperationFailed.model_validate(payload).status == "failed"
    for private in ("evidence", "candidate", "PRIVATE", "secret.invalid"):
        assert private not in json.dumps(payload)


def test_typed_public_failure_has_no_operator_sidecar():
    error = CognitiveExecutionFailure(
        "AXWISE_RESEARCH_UNAVAILABLE",
        retryable=True,
        diagnostics=OperationFailureDiagnostics(
            route="gemini_google_search", status="unavailable"
        ),
    )
    assert error.evidence_diagnostics is None
    assert error.diagnostics == {
        "route": "gemini_google_search",
        "status": "unavailable",
    }


def test_hostile_optional_mapping_access_cannot_change_existing_failure_behavior():
    class HostileDict(dict):
        def get(self, key, *args):
            if key == "evidence":
                raise ValueError("PRIVATE optional lookup")
            return super().get(key, *args)

        def __bool__(self):
            raise ValueError("PRIVATE optional truthiness")

    class HostileEvidence(dict):
        def get(self, *_args):
            raise ValueError("PRIVATE evidence lookup")

        def __bool__(self):
            raise ValueError("PRIVATE evidence truthiness")

    for raw in (
        HostileDict(
            route="gemini_google_search",
            status="unavailable",
            evidence={"stage": "fetch"},
        ),
        {
            "route": "gemini_google_search",
            "status": "unavailable",
            "evidence": HostileEvidence(stage="fetch"),
        },
    ):
        expected = sanitize_failure_diagnostics(raw)
        error = CognitiveExecutionFailure(
            "AXWISE_RESEARCH_UNAVAILABLE", retryable=True, diagnostics=raw
        )
        assert error.diagnostics == expected
        assert error.evidence_diagnostics is None
    assert (
        sanitize_research_evidence_diagnostics(HostileEvidence(stage="fetch")) is None
    )


@pytest.mark.parametrize("collision", ["stage", "candidate_count", "evidence"])
def test_optional_plain_dict_rejects_colliding_custom_keys_without_equality(collision):
    class HostileKey:
        def __hash__(self):
            return hash(collision)

        def __eq__(self, _other):
            raise ValueError("PRIVATE key comparison")

    unsafe = {HostileKey(): "PRIVATE"}
    assert sanitize_research_evidence_diagnostics(unsafe) is None
    assert research_evidence_from_runtime_diagnostics(unsafe) is None
    if collision == "evidence":
        raw = {"route": "gemini_google_search", "status": "unavailable"}
        raw.update(unsafe)
        expected = sanitize_failure_diagnostics(raw)
        error = CognitiveExecutionFailure(
            "AXWISE_RESEARCH_UNAVAILABLE", retryable=True, diagnostics=raw
        )
        assert error.diagnostics == expected
        assert error.evidence_diagnostics is None


def test_optional_mapping_size_is_bounded_without_truncating_into_known_facts():
    oversized = {f"field_{index}": index for index in range(64)}
    oversized["stage"] = "fetch"
    assert sanitize_research_evidence_diagnostics(oversized) is None
    assert research_evidence_from_runtime_diagnostics(oversized) is None
