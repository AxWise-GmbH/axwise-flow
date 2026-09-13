"""Draft-first policy regressions following the retained real webhook rejection."""

import pytest

from backend.services.workflow_v2.cognitive.evidence import (
    _deterministic_evidence_integrity_defects,
)
from backend.services.workflow_v2.cognitive.models import SynthesisContext, SynthesisDraft
from backend.services.workflow_v2.cognitive.publication import _with_advisory_planning_review
from backend.services.workflow_v2.cognitive.validation import (
    SynthesisValidationError,
    _is_advisory_planning_evidence_defect,
    _validate_synthesis,
)

pytestmark = pytest.mark.contract

# This real clause matches final-rejection fingerprint 0bd17689a731efed5dc245a6
# da485e5c8cae748572d3847ff027f8d896e39460, not merely an invented regression.
REAL_DRAFT_BOUNDARY = (
    "Deliverable must serve as an engineering draft for human review and "
    "implementation, not a verified implementation or launch approval."
)
UNRESOLVED = [
    "Production integration validation test report and launch authorization sign-off "
    "prior to connecting live billing accounts or initiating customer-facing deliveries."
]
GAP = "Production validation and launch sign-off remain unresolved."


def context(**updates):
    return SynthesisContext(
        purpose="final_synthesis",
        artifact_type="software_prd",
        required_sections=["Result", "Evidence gaps"],
        evidence_readiness="ready_with_gaps",
        allowed_claim_ids=[],
        required_gap_labels=[GAP],
        unresolved_evidence_requirements=UNRESOLVED,
        quality_gate_required=True,
    ).model_copy(update=updates)


def draft(body):
    return SynthesisDraft(
        title="Webhook engineering draft",
        markdown=(
            f"# Result\n\n{body}\n\n"
            "This proposed dispatcher receives billing events, stores delivery intent, "
            "and schedules outbound attempts. A stable event identity connects delivery "
            "history to receiver processing. The specification separates transport "
            "acknowledgement from completion of a business transaction. Operators can "
            "inspect failed attempts and decide how to handle exhausted deliveries.\n\n"
            "## Prioritized requirements\n\n"
            "- P0: retain event identity and attempt history across retries.\n"
            "- P1: show exhausted deliveries in an operator review queue.\n\n"
            "## Acceptance criteria\n\n"
            "- Given a stored event, When a receiver acknowledges delivery, Then mark "
            "its delivery complete and retain the recorded response.\n\n"
            "## Metrics and validation\n\n"
            "Measure delivery latency, queue age and exhausted attempts during future "
            "integration validation. The engineering owner records results against "
            "the chosen workload and revisits provisional retry settings.\n\n"
            "## Technical boundaries\n\n"
            "The sender stores transport state; the receiver owns business processing. "
            "Credentials stay outside payloads. Network failures leave an inspectable "
            "attempt record and a scheduled retry or terminal failure.\n\n"
            "## Next steps\n\n"
            "- Select the receiver contract with the integration owner.\n"
            "- Review the provisional policy before implementation.\n"
            f"\n## Evidence gaps\n\n{GAP}"
        ),
    )


def findings(ctx, value, **options):
    return _deterministic_evidence_integrity_defects(
        value.markdown,
        ctx.allowed_claim_texts,
        artifact_type=ctx.artifact_type,
        immutable_gap_labels=ctx.required_gap_labels,
        unresolved_evidence_requirements=ctx.unresolved_evidence_requirements,
        **options,
    )


def test_real_rejected_draft_boundary_is_preserved_with_visible_warning():
    ctx, value = context(), draft(REAL_DRAFT_BOUNDARY)
    detected = findings(ctx, value)
    assert len(detected) == 1
    assert detected[0].startswith("An unresolved evidence requirement")
    _validate_synthesis(ctx, value)
    published = _with_advisory_planning_review(ctx, value)
    assert REAL_DRAFT_BOUNDARY in published
    assert "**Unverified claim — review required:**" in published
    assert "**Draft for human review.**" in published
    assert GAP in published


@pytest.mark.parametrize(
    "changes",
    [
        {"artifact_type": "content_artifact"},
        {"evidence_readiness": "blocked"},
        {"purpose": "blocked_report"},
    ],
)
def test_advisory_policy_does_not_apply_outside_nonblocked_planning(changes):
    defect = findings(context(), draft(REAL_DRAFT_BOUNDARY))[0]
    assert not _is_advisory_planning_evidence_defect(context(**changes), defect)


def test_many_advisory_findings_cannot_hide_a_cited_value_mismatch():
    claim_id = "b" * 64
    ctx = context(
        allowed_claim_ids=[claim_id],
        allowed_claim_texts={claim_id: "Measured webhook delivery success is 95%."},
    )
    body = "\n\n".join(
        REAL_DRAFT_BOUNDARY.replace("implementation,", f"implementation of endpoint {i},")
        for i in range(45)
    )
    value = draft(body + f"\n\nMeasured webhook delivery success is 99.9% [evidence:{claim_id}].")
    all_findings = findings(ctx, value, defect_limit=None)
    assert sum(_is_advisory_planning_evidence_defect(ctx, d) for d in all_findings) == 45
    assert any(d.startswith("Cited immutable claims do not support every exact value") for d in all_findings)
    with pytest.raises(SynthesisValidationError) as caught:
        _validate_synthesis(ctx, value)
    assert caught.value.counts["evidence_integrity"] == 1
    # Warning presentation also preserves findings beyond the detector's old cap.
    warnings = _with_advisory_planning_review(context(), draft(body))
    assert warnings.count("**Unverified claim — review required:**") == 45


@pytest.mark.parametrize(
    "body,reason",
    [
        ("This plan is launch-ready.", "LAUNCH_READY_CLAIM_FORBIDDEN"),
        ("Verified delivery results [evidence:" + "a" * 64 + "].", "EVIDENCE_CLAIM_NOT_ALLOWED"),
    ],
)
def test_launch_claims_and_invented_citations_stay_hard(body, reason):
    with pytest.raises(SynthesisValidationError) as caught:
        _validate_synthesis(context(), draft(body))
    assert caught.value.reason == reason
