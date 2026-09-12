"""Closed final-validation metadata; no provider/database/model calls."""

from __future__ import annotations

import json
import hashlib
from types import SimpleNamespace
from uuid import UUID

import pytest

from backend.services.workflow_v2.cognitive import validation
from backend.services.workflow_v2.cognitive.models import (
    FinalRepairTopology,
    SynthesisContext,
    SynthesisDraft,
)
from backend.services.workflow_v2.cognitive.policy import (
    _SAFE_SYNTHESIS_VALIDATION_REASONS,
)

pytestmark = pytest.mark.contract
PRIVATE = "PRIVATE_DOCUMENT_SENTINEL_7bf8"


def context(**updates):
    return SynthesisContext(
        required_sections=["Result"],
        evidence_readiness="ready",
        allowed_claim_ids=[],
        required_gap_labels=[],
        artifact_type="general_artifact",
    ).model_copy(update=updates)


def draft(markdown="# Result\n\nBounded planning content."):
    return SynthesisDraft(title="Synthetic test", markdown=markdown)


def details_for(ctx, value):
    with pytest.raises(ValueError) as caught:
        validation._validate_synthesis(ctx, value)
    details = validation.safe_synthesis_validation_details(caught.value)
    assert PRIVATE not in json.dumps(details)
    assert set(details) == {"reason", "counts"}
    return caught.value, details


def test_missing_sections_preserve_valueerror_text_but_only_count_is_exposed():
    error, details = details_for(
        context(required_sections=[PRIVATE, "Another required section"]), draft()
    )
    assert isinstance(error, validation.SynthesisValidationError)
    assert str(error) == (
        "required Markdown sections are missing: "
        + PRIVATE
        + ", Another required section"
    )
    assert details == {
        "reason": "REQUIRED_SECTIONS_MISSING",
        "counts": {"required_sections": 2},
    }


@pytest.mark.parametrize(
    "changes,markdown,reason",
    [
        (
            {},
            "# Result\n\nText.\n\n## Sources\n\n" + PRIVATE,
            "SOURCE_APPENDIX_FORBIDDEN",
        ),
        ({}, "# Result\n\n[evidence:garbage] " + PRIVATE, "EVIDENCE_MARKER_INVALID"),
        (
            {},
            "# Result\n\n[evidence:" + "a" * 64 + "] " + PRIVATE,
            "EVIDENCE_CLAIM_NOT_ALLOWED",
        ),
        (
            {"allowed_claim_ids": ["a" * 64]},
            "# Result\n\n" + PRIVATE,
            "EVIDENCE_CITATION_MISSING",
        ),
        (
            {"evidence_readiness": "ready_with_gaps"},
            "# Result\n\n" + PRIVATE,
            "EVIDENCE_STATUS_SECTION_MISSING",
        ),
        (
            {"evidence_readiness": "ready_with_gaps", "required_gap_labels": [PRIVATE]},
            "# Result\n\nText.\n\n## Evidence gaps\n\nPending verification.",
            "EVIDENCE_GAP_LABEL_MISSING",
        ),
        (
            {"evidence_readiness": "blocked"},
            "# Result\n\nText.\n\n## Evidence gaps\n\nPending verification.",
            "BLOCKED_DECISION_MISSING",
        ),
        (
            {"evidence_readiness": "blocked"},
            "# Result\n\nBlocked.\n\n## Evidence gaps\n\nPending verification.",
            "BLOCKED_REMEDIATION_HEADING_MISSING",
        ),
        (
            {},
            "# Result\n\nValidation target (all following content is unverified until pre-adoption review): "
            + PRIVATE,
            "FINAL_SCAFFOLDING_FORBIDDEN",
        ),
    ],
)
def test_real_validation_paths_map_only_closed_categories(changes, markdown, reason):
    _error, details = details_for(context(**changes), draft(markdown))
    assert details == {"reason": reason, "counts": {}}


@pytest.mark.parametrize("readiness", ["ready", "ready_with_gaps"])
def test_both_non_authorizing_launch_claim_paths_share_safe_reason(
    monkeypatch, readiness
):
    monkeypatch.setattr(
        validation, "has_positive_launch_readiness_claim", lambda _: True
    )
    _error, details = details_for(context(evidence_readiness=readiness), draft())
    assert details == {"reason": "LAUNCH_READY_CLAIM_FORBIDDEN", "counts": {}}


@pytest.mark.parametrize(
    "counts",
    [
        {"evidence_integrity": 2, "substantive": 0, "practicality": 0, "topology": 0},
        {"evidence_integrity": 0, "substantive": 3, "practicality": 0, "topology": 0},
        {"evidence_integrity": 0, "substantive": 0, "practicality": 4, "topology": 0},
        {"evidence_integrity": 0, "substantive": 0, "practicality": 0, "topology": 1},
        {"evidence_integrity": 2, "substantive": 3, "practicality": 4, "topology": 1},
    ],
)
def test_quality_failure_separates_all_four_defect_counts_without_prose(
    monkeypatch, counts
):
    monkeypatch.setattr(
        validation,
        "_deterministic_evidence_integrity_defects",
        lambda *_args, **_kwargs: [PRIVATE] * counts["evidence_integrity"],
    )
    monkeypatch.setattr(
        validation,
        "_deterministic_quality_defects",
        lambda *_args, **_kwargs: (
            [PRIVATE] * counts["substantive"],
            [PRIVATE] * counts["practicality"],
        ),
    )
    monkeypatch.setattr(
        validation,
        "_final_repair_topology_defects",
        lambda *_args, **_kwargs: [PRIVATE] * counts["topology"],
    )
    error, details = details_for(
        context(
            quality_gate_required=True, final_repair_topology=FinalRepairTopology()
        ),
        draft(),
    )
    assert str(error).startswith("final artifact failed substantive/practical quality:")
    assert PRIVATE in str(
        error
    )  # Retained only for existing validator retry compatibility.
    assert details == {"reason": "QUALITY_GATE_FAILED", "counts": counts}


@pytest.mark.parametrize("prefix,reason", _SAFE_SYNTHESIS_VALIDATION_REASONS)
def test_legacy_valueerrors_reuse_existing_closed_prefix_map(prefix, reason):
    value = validation.safe_synthesis_validation_details(ValueError(prefix + PRIVATE))
    assert value == {"reason": reason, "counts": {}}
    assert PRIVATE not in json.dumps(value)


@pytest.mark.parametrize(
    "error",
    [
        ValueError(PRIVATE),
        RuntimeError(PRIVATE),
        ValueError({"body": PRIVATE}),
        ValueError("reason", PRIVATE),
    ],
)
def test_unknown_exception_content_is_not_exposed_or_guessed(error):
    assert validation.safe_synthesis_validation_details(error) == {
        "reason": "VALIDATOR_REJECTED",
        "counts": {},
    }


def test_mapper_never_calls_custom_exception_stringification():
    class HostileError(ValueError):
        def __str__(self):
            raise AssertionError("must not render exception content")

    assert validation.safe_synthesis_validation_details(HostileError(PRIVATE)) == {
        "reason": "VALIDATOR_REJECTED",
        "counts": {},
    }


@pytest.mark.parametrize(
    "counts",
    [
        {"substantive": True},
        {"topology": -1},
        {"evidence_integrity": 1_000_001},
        {"practicality": PRIVATE},
        {PRIVATE: 1},
        [PRIVATE],
    ],
)
def test_invalid_counts_are_rejected_at_construction_and_rechecked_at_export(counts):
    with pytest.raises(ValueError, match="invalid synthesis validation counts"):
        validation.SynthesisValidationError(
            PRIVATE, reason="QUALITY_GATE_FAILED", counts=counts
        )
    error = validation.SynthesisValidationError(PRIVATE, reason="QUALITY_GATE_FAILED")
    error.counts = counts
    assert validation.safe_synthesis_validation_details(error) == {
        "reason": "VALIDATOR_REJECTED",
        "counts": {},
    }


def test_unknown_reason_never_becomes_an_operator_field():
    with pytest.raises(ValueError, match="invalid synthesis validation reason"):
        validation.SynthesisValidationError(PRIVATE, reason=PRIVATE)
    error = validation.SynthesisValidationError(PRIVATE, reason="QUALITY_GATE_FAILED")
    error.reason = PRIVATE
    assert validation.safe_synthesis_validation_details(error) == {
        "reason": "VALIDATOR_REJECTED",
        "counts": {},
    }


def test_metadata_export_returns_a_copy_and_validation_does_not_log(caplog):
    counts = {"substantive": 1}
    error = validation.SynthesisValidationError(
        PRIVATE, reason="QUALITY_GATE_FAILED", counts=counts
    )
    counts["substantive"] = 2
    exported = validation.safe_synthesis_validation_details(error)
    exported["counts"]["substantive"] = 3
    assert validation.safe_synthesis_validation_details(error)["counts"] == {
        "substantive": 1
    }
    assert caplog.records == []


def test_reader_contract_has_a_closed_category_and_count_without_prose():
    error = validation.SynthesisValidationError(
        PRIVATE, reason="READER_CONTRACT_FAILED", counts={"reader_contract": 2}
    )
    assert validation.safe_synthesis_validation_details(error) == {
        "reason": "READER_CONTRACT_FAILED",
        "counts": {"reader_contract": 2},
    }


@pytest.mark.parametrize("attribute", ["reason", "counts"])
def test_missing_typed_metadata_falls_back_safely(attribute):
    error = validation.SynthesisValidationError(PRIVATE, reason="QUALITY_GATE_FAILED")
    delattr(error, attribute)
    assert validation.safe_synthesis_validation_details(error) == {
        "reason": "VALIDATOR_REJECTED",
        "counts": {},
    }


def test_passing_validation_still_returns_none():
    assert validation._validate_synthesis(context(), draft()) is None


@pytest.mark.parametrize(
    "error,expected",
    [
        (
            validation.SynthesisValidationError(
                PRIVATE,
                reason="QUALITY_GATE_FAILED",
                counts={
                    "evidence_integrity": 1,
                    "substantive": 2,
                    "practicality": 0,
                    "topology": 0,
                },
            ),
            {
                "reason": "QUALITY_GATE_FAILED",
                "counts": {
                    "evidence_integrity": 1,
                    "substantive": 2,
                    "practicality": 0,
                    "topology": 0,
                },
            },
        ),
        (
            validation.SynthesisValidationError(
                PRIVATE, reason="READER_CONTRACT_FAILED", counts={"reader_contract": 3}
            ),
            {"reason": "READER_CONTRACT_FAILED", "counts": {"reader_contract": 3}},
        ),
        (ValueError(PRIVATE), {"reason": "VALIDATOR_REJECTED", "counts": {}}),
    ],
)
def test_executor_contract_log_binds_exact_candidate_hash_without_prose_or_tokens(
    error, expected, caplog
):
    from backend.services.workflow_v2.cognitive_executor import (
        _log_final_contract_failure,
    )

    operation_id = UUID("00000000-0000-4000-8000-000000007301")
    markdown = "# Private ä document\n\n" + PRIVATE + "\n"
    assert (
        _log_final_contract_failure(
            SimpleNamespace(operation_id=operation_id), markdown, error
        )
        is None
    )
    records = [
        r for r in caplog.records if r.message.startswith("final_contract_rejected ")
    ]
    assert len(records) == 1
    value = json.loads(records[0].message.removeprefix("final_contract_rejected "))
    assert value == {
        "operation_id": str(operation_id),
        "candidate_sha256": hashlib.sha256(markdown.encode("utf-8")).hexdigest(),
        **expected,
    }
    assert PRIVATE not in caplog.text
    assert "Private ä document" not in caplog.text
    assert set(value) == {"operation_id", "candidate_sha256", "reason", "counts"}
    assert records[0].exc_info is None


def test_new_operator_metadata_is_not_added_to_database_failure_diagnostics(caplog):
    from backend.services.workflow_v2.cognitive_executor import (
        _log_final_contract_failure,
        _logged_failure_diagnostics,
    )

    operation = SimpleNamespace(
        operation_id=UUID("00000000-0000-4000-8000-000000007302")
    )
    error = validation.SynthesisValidationError(
        PRIVATE, reason="READER_CONTRACT_FAILED", counts={"reader_contract": 1}
    )
    _log_final_contract_failure(operation, PRIVATE, error)
    assert _logged_failure_diagnostics(
        operation,
        route="final_synthesis",
        status="contract_rejected",
        input_tokens=4,
        output_tokens=2,
    ) == {"route": "final_synthesis", "status": "contract_rejected"}
    assert PRIVATE not in caplog.text
