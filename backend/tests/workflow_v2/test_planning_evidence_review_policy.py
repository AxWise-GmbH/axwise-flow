"""Draft-first policy regressions following the retained real webhook rejection."""

import pytest

from backend.services.workflow_v2.cognitive.evidence import (
    _deterministic_evidence_integrity_defects,
)
from backend.services.workflow_v2.cognitive.models import (
    EvaluationDraft,
    SynthesisContext,
    SynthesisDraft,
)
from backend.services.workflow_v2.cognitive.publication import (
    _decorate_publication_draft,
    _with_advisory_planning_review,
    _with_immutable_gap_labels,
)
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


def test_real_rejected_draft_boundary_is_preserved_without_keyword_warning():
    ctx, value = context(), draft(REAL_DRAFT_BOUNDARY)
    detected = findings(ctx, value)
    assert len(detected) == 1
    assert detected[0].startswith("An unresolved evidence requirement")
    _validate_synthesis(ctx, value)
    published = _with_advisory_planning_review(ctx, value)
    assert REAL_DRAFT_BOUNDARY in published
    assert published == value.markdown
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
    # Raw findings cannot hide a hard error, but keyword flags do not become
    # reader-facing review claims without a substantive reviewer observation.
    clean = draft(body)
    assert _with_advisory_planning_review(context(), clean) == clean.markdown


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


def test_real_immutable_provider_assumption_is_not_unfinished_content():
    # Exact approved-scope assumption from the real preview rerun, not recovered
    # final-candidate text. The server must append it before final validation.
    assumption = (
        "Billing provider is unselected; provider-specific integrations and "
        "behaviors are treated as placeholder assumptions."
    )
    ctx = context(required_gap_labels=[GAP, assumption])
    value = _with_immutable_gap_labels(ctx, draft("Review the proposed delivery design."))
    assert value.markdown.count(assumption) == 1
    assert "## Open decisions" in value.markdown
    _validate_synthesis(ctx, value)


def test_illustrative_fenced_placeholders_are_not_document_stubs():
    value = draft(
        'Illustrative payload only:\n\n```json\n'
        '{"event_id": "placeholder", "description": "insert content"}\n```'
    )
    _validate_synthesis(context(), value)


@pytest.mark.parametrize(
    "stub",
    [
        "[placeholder]",
        "- **placeholder**",
        "1. [insert content]",
        "`to be completed`",
        "This placeholder must be replaced.",
        "Lorem ipsum dolor sit amet.",
    ],
)
def test_explicit_unfinished_document_stubs_still_reject(stub):
    with pytest.raises(SynthesisValidationError) as caught:
        _validate_synthesis(context(), draft(stub))
    assert caught.value.reason == "QUALITY_GATE_FAILED"
    assert "The candidate contains placeholder content." in str(caught.value)


@pytest.mark.parametrize("review", [None, EvaluationDraft(note="No concrete issues found.")])
def test_absent_or_empty_review_preserves_publication_bytes(review):
    value = SynthesisDraft(
        title="Delivery plan",
        markdown="# Delivery plan\n\nUse stable event identities.  \n\n## Sources\n\n- Original source row.\n",
    )
    assert _with_advisory_planning_review(context(), value, review) == value.markdown


def test_review_suggestions_deduplicate_observations_and_preserve_source_bytes():
    source_appendix = "\n\n## Sources\n\n- Original source [1](https://example.invalid/source).  \n"
    value = SynthesisDraft(
        title="Delivery plan",
        markdown="# Delivery plan\n\nUse stable event identities." + source_appendix,
    )
    observation = 'Check [claim](https://example.invalid) <script>alert("x")</script>.'
    review = EvaluationDraft(
        unsupported_precision=[observation],
        contradictions=[observation],
        repair_instructions=["Use one attempt count in the formula and table."],
        note="Concrete review observations, not a correctness certificate.",
    )

    rendered = _with_advisory_planning_review(context(), value, review)

    assert rendered.endswith(source_appendix)
    assert rendered.count("## Review suggestions") == 1
    assert rendered.count("- **Evidence:**") == 1
    assert "- **Consistency:**" not in rendered
    assert "- **Revision:** Use one attempt count in the formula and table\\." in rendered
    assert r'［claim］\(https://example\.invalid\)' in rendered
    assert r'&lt;script&gt;alert\("x"\)&lt;/script&gt;\.' in rendered
    assert "[claim](https://example.invalid)" not in rendered
    assert "<script>" not in rendered
    assert review.note not in rendered


@pytest.mark.parametrize("heading", ["Open decisions", "Open Decisions"])
def test_open_decisions_merges_exact_missing_labels_once_without_rewriting_choices(heading):
    labels = ["Choose the billing provider.", "Confirm the expected daily event volume."]
    ctx = context(required_gap_labels=[labels[1], labels[0], labels[1]], required_sections=["Result"])
    value = SynthesisDraft(
        title="Delivery plan",
        markdown=(
            "# Result\n\nUse an asynchronous dispatcher with stable event identities.\n\n"
            f"## {heading}\n\n- Choose the billing provider.\n"
            "- Ask the integration owner to select the receiver contract.\n\n"
            "## Next steps\n\nImplement the event store and delivery worker."
        ),
    )

    prepared = _with_immutable_gap_labels(ctx, value)

    assert prepared.markdown.count(f"## {heading}") == 1
    assert all(prepared.markdown.count(label) == 1 for label in labels)
    assert "Ask the integration owner to select the receiver contract." in prepared.markdown
    assert prepared.markdown.index(labels[1]) < prepared.markdown.index("## Next steps")
    assert "These immutable gaps remain unresolved" not in prepared.markdown
    assert _with_immutable_gap_labels(ctx, prepared) == prepared


def test_open_decisions_heading_does_not_hide_a_missing_required_gap():
    ctx = context(required_sections=["Result"], quality_gate_required=False)
    value = SynthesisDraft(
        title="Delivery plan",
        markdown="# Result\n\nUse stable event identities.\n\n## Open decisions\n\nChoose the billing provider.",
    )
    with pytest.raises(SynthesisValidationError) as caught:
        _validate_synthesis(ctx, value)
    assert caught.value.reason == "EVIDENCE_GAP_LABEL_MISSING"
    prepared = _with_immutable_gap_labels(ctx, value)
    assert prepared.markdown.count(GAP) == 1
    _validate_synthesis(ctx, prepared)


@pytest.mark.parametrize(
    "changes,heading,introduction,banner",
    [
        ({}, "## Open decisions", False, False),
        ({"artifact_type": "content_artifact"}, "## Immutable evidence gaps and assumptions", True, True),
        ({"evidence_readiness": "blocked", "purpose": "blocked_report"}, "## Immutable evidence gaps and assumptions", True, False),
    ],
)
def test_gap_presentation_changes_only_nonblocked_planning(changes, heading, introduction, banner):
    ctx = context(required_sections=["Result"], **changes)
    before = ctx.model_dump()
    value = SynthesisDraft(title="Delivery plan", markdown="# Result\n\nUse stable event identities.")

    prepared = _decorate_publication_draft(ctx, value)

    assert heading in prepared.markdown
    assert prepared.markdown.count(GAP) == 1
    assert ("These immutable gaps remain unresolved" in prepared.markdown) is introduction
    assert ("**Evidence status: completed with evidence gaps.**" in prepared.markdown) is banner
    assert ctx.model_dump() == before


def test_ready_artifact_does_not_gain_stale_gap_or_warning_sections():
    ctx = context(evidence_readiness="ready")
    value = SynthesisDraft(title="Delivery plan", markdown="# Result\n\nUse stable event identities.\n")
    assert _decorate_publication_draft(ctx, value) == value


@pytest.mark.parametrize(
    "changes",
    [{"artifact_type": "content_artifact"}, {"evidence_readiness": "blocked", "purpose": "blocked_report"}],
)
def test_nonplanning_and_blocked_still_require_evidence_status_section(changes):
    ctx = context(required_sections=["Result"], required_gap_labels=[], quality_gate_required=False, **changes)
    value = SynthesisDraft(title="Delivery plan", markdown="# Result\n\nUse stable event identities.")
    with pytest.raises(SynthesisValidationError) as caught:
        _validate_synthesis(ctx, value)
    assert caught.value.reason == "EVIDENCE_STATUS_SECTION_MISSING"
