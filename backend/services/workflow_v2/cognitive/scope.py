"""Pure scope projection, literal owner-span validation and requirement authority checks."""

from __future__ import annotations
import hashlib
import re
from backend.domain.workflow_v2.contracts import (
    ASSISTANT_CONTEXT_TRUNCATION_MARKER,
    AcceptedDeliverableProfileV1,
    AcceptedDeliverableRequirementV1,
    CompileScopeInputV3,
    DeliverableAcceptanceCriterionV1,
    EvidenceRequirement,
    ResearchResultV2,
    ScopeArtifactV2,
    SourceSpan,
    TopicAnchor,
    canonical_hash,
    canonical_json,
    render_assistant_context_request,
    utf16_length,
    utf16_ordinal_sorted,
    utf16_slice,
)
from typing import Any, Sequence
from urllib.parse import unquote
from uuid import UUID
from backend.services.workflow_v2.cognitive.models import (
    DraftAcceptanceCriterion,
    DraftDeliverableProfile,
    DraftSpan,
    ScopeAuthoritySegmentV1,
    ScopeDraft,
    ScopeRevisionDraft,
    ScopeV3DraftContext,
    _execution_agent_prompt_value,
)
from backend.services.workflow_v2.cognitive.policy import (
    _BROAD_PLAN_DELIVERABLE_TERM,
    _CHECKLIST_PLAN_ARTIFACT_TYPES,
    _DIRECT_CHECKLIST_TERM,
    _EU_REGULATION_CELEX_URL,
    _EU_REGULATION_CONSLEG_URL,
    _EU_REGULATION_ELI_URL,
    _EXPLICIT_ENUMERATION,
    _EXPLICIT_EU_REGULATION_NUMBER_YEAR,
    _EXPLICIT_EU_REGULATION_YEAR_NUMBER,
    _EXPLICIT_PUBLISHER_RESTRICTION,
    _NONSTATUTORY_AUTHORITY_SEMANTICS,
    _NONSTATUTORY_AUTHORITY_SOURCE_TYPES,
    _NON_ENUMERATION_COUNT_UNIT,
    _OPERATIONAL_PLAN_DELIVERABLE_TERM,
    _OWNER_ARTIFACT_CONVERSION,
    _OWNER_ARTIFACT_DIRECTIVE,
    _OWNER_ARTIFACT_TERMS,
    _PLANNING_ARTIFACT_TYPES,
    _PRD_BASELINE_SECTIONS,
    _PRD_REQUIRED_SECTION_ALIASES,
    _RAW_EVIDENCE_MARKER,
    _SOFTWARE_PRD_BASELINE_SECTIONS,
    _STATUTORY_SEMANTICS,
    _STATUTORY_SOURCE_TYPES,
    _UNAMBIGUOUS_STATUTORY_CLAIM_TYPES,
)


def _effective_requirement_blocking(
    scope: ScopeArtifactV2,
    requirement: EvidenceRequirement,
) -> bool:
    artifact_type = scope.deliverable_profile.artifact_type
    future_authorization_exemption = (
        artifact_type != "launch_authorization"
        and requirement.evidence_role == "future_authorization_proof"
    )
    planning_grounded_claim_exemption = (
        artifact_type in _PLANNING_ARTIFACT_TYPES
        and requirement.evidence_role == "grounded_claim"
    )
    return (
        requirement.criticality == "blocking"
        and not future_authorization_exemption
        and not planning_grounded_claim_exemption
    )


def _permitted_nonblocking_evidence_gap_requirement_ids(
    scope: ScopeArtifactV2,
    research: ResearchResultV2,
) -> set[str]:
    """Map exact nonblocking research gaps onto their deliverable requirement IDs."""
    missing_nonblocking_ids = {
        finding.requirement_id
        for finding in research.findings
        if finding.status == "missing" and not finding.blocking
    }
    evidence_by_description: dict[str, list[EvidenceRequirement]] = {}
    for requirement in scope.evidence_requirements:
        evidence_by_description.setdefault(requirement.description, []).append(
            requirement
        )
    deliverable_by_description: dict[str, list[AcceptedDeliverableRequirementV1]] = {}
    for requirement in scope.requirements:
        if requirement.category == "evidence":
            deliverable_by_description.setdefault(requirement.description, []).append(
                requirement
            )

    permitted: set[str] = set()
    for description, evidence_requirements in evidence_by_description.items():
        # Duplicate descriptions are only safe to map when every underlying evidence
        # requirement is the same kind of unresolved nonblocking gap.
        if evidence_requirements and all(
            requirement.id in missing_nonblocking_ids
            for requirement in evidence_requirements
        ):
            permitted.update(
                requirement.id
                for requirement in deliverable_by_description.get(description, [])
            )
    return permitted


def _normalized_semantic_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def _canonical_required_sections(
    artifact_type: str, values: Sequence[str]
) -> list[str]:
    """Collapse only known PRD aliases while retaining custom section authority."""

    baseline_sections = (
        _SOFTWARE_PRD_BASELINE_SECTIONS
        if artifact_type == "software_prd"
        else _PRD_BASELINE_SECTIONS if artifact_type == "product_prd" else frozenset()
    )
    if not baseline_sections:
        return utf16_ordinal_sorted(set(values))

    sections_by_identity: dict[str, str] = {}
    for value in utf16_ordinal_sorted({*values, *baseline_sections}):
        stripped = value.strip()
        normalized = _normalized_semantic_text(stripped)
        canonical = _PRD_REQUIRED_SECTION_ALIASES.get(normalized, stripped)
        identity = _normalized_semantic_text(canonical)
        existing = sections_by_identity.get(identity)
        if existing is None or canonical.encode("utf-16-be") < existing.encode(
            "utf-16-be"
        ):
            sections_by_identity[identity] = canonical
    return utf16_ordinal_sorted(sections_by_identity.values())


def _first_owner_artifact_mention(value: str) -> tuple[str, bool] | None:
    candidates: list[tuple[int, int, str, bool]] = []
    for priority, (artifact_type, is_checklist, pattern) in enumerate(
        _OWNER_ARTIFACT_TERMS
    ):
        match = pattern.search(value)
        if match is not None:
            candidates.append((match.start(), priority, artifact_type, is_checklist))
    if not candidates:
        return None
    _start, _priority, artifact_type, is_checklist = min(candidates)
    return artifact_type, is_checklist


def _explicit_owner_artifact_intent(value: str) -> tuple[str, bool] | None:
    """Return the last explicit owner request/conversion target in the message."""

    candidates: list[tuple[int, tuple[str, bool]]] = []
    for pattern in (_OWNER_ARTIFACT_DIRECTIVE, _OWNER_ARTIFACT_CONVERSION):
        for directive in pattern.finditer(value):
            intent = _first_owner_artifact_mention(directive.group("body"))
            if intent is not None:
                candidates.append((directive.start(), intent))
    if not candidates:
        return None
    return max(candidates, key=lambda candidate: candidate[0])[1]


def _standalone_checklist_deliverable(deliverables: Sequence[str]) -> bool:
    return (
        len(deliverables) == 1
        and _DIRECT_CHECKLIST_TERM.search(deliverables[0]) is not None
        and _BROAD_PLAN_DELIVERABLE_TERM.search(deliverables[0]) is None
    )


def _canonical_artifact_type(
    current_owner_text: str,
    profile: DraftDeliverableProfile,
    deliverables: Sequence[str],
    *,
    owner_prior_texts: Sequence[str] = (),
    prior_artifact_type: str | None = None,
) -> str:
    """Resolve checklist/plan type only from validated owner-authority text.

    CompileScopeV3 supplies the exact current/prior owner source-span text and never
    assistant-reference text. Current owner intent wins. A revision without an explicit
    artifact intent retains the sealed prior type rather than accepting model drift.
    """

    current_intent = _explicit_owner_artifact_intent(current_owner_text)
    if current_intent is not None:
        artifact_type, is_checklist = current_intent
        if is_checklist and profile.artifact_type in _CHECKLIST_PLAN_ARTIFACT_TYPES:
            if _standalone_checklist_deliverable(deliverables):
                return "content_artifact"
            if any(
                _OPERATIONAL_PLAN_DELIVERABLE_TERM.search(deliverable) is not None
                for deliverable in deliverables
            ):
                return "operational_plan"
        elif (
            artifact_type == "operational_plan"
            and profile.artifact_type in _CHECKLIST_PLAN_ARTIFACT_TYPES
        ):
            return "operational_plan"
        # Any other explicit artifact request is outside this narrow correction;
        # retain the typed model classification (including launch authorization).
        return profile.artifact_type

    if prior_artifact_type is not None:
        return prior_artifact_type

    for owner_text in reversed(tuple(owner_prior_texts)):
        prior_intent = _explicit_owner_artifact_intent(owner_text)
        if prior_intent is None:
            continue
        artifact_type, is_checklist = prior_intent
        if (
            is_checklist
            and profile.artifact_type in _CHECKLIST_PLAN_ARTIFACT_TYPES
            and _standalone_checklist_deliverable(deliverables)
        ):
            return "content_artifact"
        if (
            is_checklist
            and profile.artifact_type in _CHECKLIST_PLAN_ARTIFACT_TYPES
            and any(
                _OPERATIONAL_PLAN_DELIVERABLE_TERM.search(deliverable) is not None
                for deliverable in deliverables
            )
        ):
            return "operational_plan"
        if (
            artifact_type == "operational_plan"
            and profile.artifact_type in _CHECKLIST_PLAN_ARTIFACT_TYPES
        ):
            return "operational_plan"
        break
    return profile.artifact_type


def _project_deliverable_contract(
    *,
    authority_text: str,
    current_owner_text: str | None = None,
    owner_prior_texts: Sequence[str] = (),
    profile: DraftDeliverableProfile,
    evidence_requirements: list[EvidenceRequirement],
    deliverables: list[str],
    personas: list[str],
    interview_requirements: list[str],
    prd_requirements: list[str],
    limits: list[str],
    policies: list[str],
    draft_criteria: list[DraftAcceptanceCriterion],
    safe_default_values: set[str] | None = None,
    prior_scope: ScopeArtifactV2 | None = None,
) -> tuple[
    AcceptedDeliverableProfileV1,
    list[AcceptedDeliverableRequirementV1],
    list[DeliverableAcceptanceCriterionV1],
]:
    artifact_type = _canonical_artifact_type(
        authority_text if current_owner_text is None else current_owner_text,
        profile,
        deliverables,
        owner_prior_texts=owner_prior_texts,
        prior_artifact_type=(
            prior_scope.deliverable_profile.artifact_type if prior_scope else None
        ),
    )
    direct_checklist = (
        artifact_type == "content_artifact"
        and _standalone_checklist_deliverable(deliverables)
    )
    accepted_profile = AcceptedDeliverableProfileV1(
        schema_version="axwise.deliverable-profile.v1",
        artifact_type=artifact_type,
        domain=profile.domain.strip(),
        problem=profile.problem.strip(),
        desired_outcome=profile.desired_outcome.strip(),
        audiences=utf16_ordinal_sorted(set(profile.audiences)),
        non_goals=utf16_ordinal_sorted(set(profile.non_goals)),
        required_sections=(
            ["Checklist"]
            if direct_checklist
            else _canonical_required_sections(artifact_type, profile.required_sections)
        ),
    )
    default_values = {
        _normalized_semantic_text(value) for value in safe_default_values or set()
    }
    prior_by_semantics = {
        (item.category, item.description): item
        for item in (prior_scope.requirements if prior_scope else [])
    }
    raw_projection: list[tuple[str, str, str]] = []
    for category, values, priority in (
        ("deliverable", deliverables, "P0"),
        ("persona", personas, "P1"),
        ("interview", interview_requirements, "P1"),
        ("prd", prd_requirements, "P0"),
        ("limit", limits, "P0"),
        ("policy", policies, "P0"),
    ):
        raw_projection.extend((category, value, priority) for value in values)
    raw_projection.extend(
        (
            "evidence",
            requirement.description,
            "P0" if requirement.criticality == "blocking" else "P1",
        )
        for requirement in evidence_requirements
    )
    if len(
        {(category, description) for category, description, _ in raw_projection}
    ) != len(raw_projection):
        raise ValueError("accepted scope semantic lists contain duplicate requirements")

    normalized_authority = _normalized_semantic_text(authority_text)
    requirements: list[AcceptedDeliverableRequirementV1] = []
    for category, description, inferred_priority in raw_projection:
        prior = prior_by_semantics.get((category, description))
        normalized_description = _normalized_semantic_text(description)
        authority = (
            "owner"
            if normalized_description in normalized_authority
            else (
                "safe_default"
                if normalized_description in default_values
                else prior.authority if prior is not None else "axwise_derived"
            )
        )
        priority = prior.priority if prior is not None else inferred_priority
        semantic = {
            "category": category,
            "description": description,
            "priority": priority,
            "authority": authority,
        }
        requirements.append(
            AcceptedDeliverableRequirementV1(
                id=f"req-{canonical_hash(semantic)[:16]}",
                **semantic,
            )
        )
    requirements.sort(key=lambda item: item.id.encode("utf-16-be"))

    by_id = {item.id: item.id for item in requirements}
    prior_ids = {item.id for item in prior_scope.requirements} if prior_scope else set()
    by_description = {item.description: item.id for item in requirements}
    by_category: dict[str, list[str]] = {}
    for item in requirements:
        by_category.setdefault(item.category, []).append(item.id)
    criteria: list[DeliverableAcceptanceCriterionV1] = []
    for draft in draft_criteria:
        supports: set[str] = set()
        for reference in draft.supports:
            if reference in by_id:
                supports.add(reference)
            elif reference in by_description:
                supports.add(by_description[reference])
            elif reference in by_category:
                supports.update(by_category[reference])
            elif reference in prior_ids:
                # A correction may remove or semantically change a prior requirement.
                # Its stale criterion edge is invalidated rather than retargeted.
                continue
            else:
                raise ValueError(
                    "acceptance criterion support must name an accepted requirement, "
                    "description or category"
                )
        sorted_supports = utf16_ordinal_sorted(supports)
        if not sorted_supports:
            continue
        semantic = {
            "given": draft.given.strip(),
            "when": draft.when.strip(),
            "then": draft.then.strip(),
            "supports": sorted_supports,
        }
        criteria.append(
            DeliverableAcceptanceCriterionV1(
                id=f"acc-{canonical_hash(semantic)[:16]}",
                **semantic,
            )
        )
    covered = {item for criterion in criteria for item in criterion.supports}
    for requirement in requirements:
        if requirement.id in covered:
            continue
        semantic = {
            "given": "The accepted deliverable profile and immutable evidence boundary",
            "when": "The candidate artifact is evaluated against the accepted scope",
            "then": requirement.description,
            "supports": [requirement.id],
        }
        criteria.append(
            DeliverableAcceptanceCriterionV1(
                id=f"acc-{canonical_hash(semantic)[:16]}",
                **semantic,
            )
        )
    criteria = sorted(
        {item.id: item for item in criteria}.values(),
        key=lambda item: item.id.encode("utf-16-be"),
    )
    return accepted_profile, requirements, criteria


def _scope_v3_draft_context(input_value: CompileScopeInputV3) -> ScopeV3DraftContext:
    context = input_value.assistant_context
    request = render_assistant_context_request(context)
    if request != input_value.request:
        raise ValueError(
            "CompileScopeV3 request is not the canonical context rendering"
        )

    segments: list[ScopeAuthoritySegmentV1] = []
    current_end = utf16_length(context.instruction.content)
    segments.append(ScopeAuthoritySegmentV1(0, current_end, "owner_current"))
    cursor = current_end
    owner_parts = [context.instruction.content]
    for turn in context.turns:
        owner_prefix = "\n\nOWNER_PRIOR\n"
        cursor += utf16_length(owner_prefix)
        owner_end = cursor + utf16_length(turn.user.content)
        if turn.user.truncated:
            owner_end -= utf16_length(ASSISTANT_CONTEXT_TRUNCATION_MARKER)
        segments.append(ScopeAuthoritySegmentV1(cursor, owner_end, "owner_prior"))
        cursor += utf16_length(turn.user.content)
        owner_parts.append(f"OWNER_PRIOR\n{turn.user.content}")

        assistant_prefix = "\n\nASSISTANT_REFERENCE\n"
        cursor += utf16_length(assistant_prefix)
        assistant_end = cursor + utf16_length(turn.assistant.content)
        if turn.assistant.truncated:
            assistant_end -= utf16_length(ASSISTANT_CONTEXT_TRUNCATION_MARKER)
        segments.append(
            ScopeAuthoritySegmentV1(cursor, assistant_end, "assistant_reference")
        )
        cursor += utf16_length(turn.assistant.content)
    if cursor != utf16_length(request):
        raise ValueError("CompileScopeV3 authority projection length is inconsistent")
    return ScopeV3DraftContext(
        request=request,
        owner_authority_text="\n\n".join(owner_parts),
        source_segments=tuple(segments),
        safe_default_constraints=frozenset(
            _normalized_semantic_text(value)
            for value in (
                *input_value.safe_defaults.limits,
                *input_value.safe_defaults.policies,
            )
        ),
        execution_agent=_execution_agent_prompt_value(input_value),
    )


def _span_is_inside_source_content(
    span: DraftSpan, source_segments: Sequence[ScopeAuthoritySegmentV1]
) -> bool:
    return any(
        span.start >= segment.start and span.end <= segment.end
        for segment in source_segments
    )


def _validate_draft(
    request: str,
    draft: ScopeDraft,
    *,
    source_segments: Sequence[ScopeAuthoritySegmentV1] | None = None,
    owner_authority_text: str | None = None,
    current_owner_text: str | None = None,
    owner_prior_texts: Sequence[str] = (),
    safe_default_constraints: frozenset[str] | None = None,
) -> None:
    if len({item.id for item in draft.evidence_requirements}) != len(
        draft.evidence_requirements
    ):
        raise ValueError("evidence requirements must have unique IDs")
    spans = [*draft.objective_source_spans]
    for topic in draft.topic_anchors:
        spans.extend(topic.source_spans)
        cited = " ".join(
            utf16_slice(request, span.start, span.end) for span in topic.source_spans
        )
        if topic.value.casefold() not in cited.casefold():
            raise ValueError(f"topic anchor {topic.value!r} is not literal cited input")
    for span in spans:
        utf16_slice(request, span.start, span.end)
        if source_segments is not None and not _span_is_inside_source_content(
            span, source_segments
        ):
            raise ValueError(
                "scope source spans must stay inside canonical message content"
            )
    if safe_default_constraints is not None:
        normalized_owner = _normalized_semantic_text(owner_authority_text or "")
        for field, values in (("limit", draft.limits), ("policy", draft.policies)):
            for value in values:
                normalized_value = _normalized_semantic_text(value)
                if (
                    normalized_value not in normalized_owner
                    and normalized_value not in safe_default_constraints
                ):
                    raise ValueError(
                        f"CompileScopeV3 {field} must be literal owner text or an approved safe default"
                    )
    _validate_allowed_source_host_authority(
        owner_authority_text or request,
        draft.evidence_requirements,
        accepted_hosts=set(),
    )
    _validate_atomic_evidence_requirements(draft.evidence_requirements)
    _project_deliverable_contract(
        authority_text=owner_authority_text or request,
        current_owner_text=(
            request if current_owner_text is None else current_owner_text
        ),
        owner_prior_texts=owner_prior_texts,
        profile=draft.deliverable_profile,
        evidence_requirements=draft.evidence_requirements,
        deliverables=draft.deliverables,
        personas=draft.personas,
        interview_requirements=draft.interview_requirements,
        prd_requirements=draft.prd_requirements,
        limits=draft.limits,
        policies=draft.policies,
        draft_criteria=draft.acceptance_criteria,
    )


def _validate_v3_draft(input_value: CompileScopeInputV3, draft: ScopeDraft) -> None:
    context = _scope_v3_draft_context(input_value)
    assistant_context = input_value.assistant_context
    _validate_draft(
        context.request,
        draft,
        source_segments=context.source_segments,
        owner_authority_text=context.owner_authority_text,
        current_owner_text=assistant_context.instruction.source_span.text,
        owner_prior_texts=tuple(
            turn.user.source_span.text for turn in assistant_context.turns
        ),
        safe_default_constraints=context.safe_default_constraints,
    )


def _validate_allowed_source_host_authority(
    authority_text: str,
    requirements: list[EvidenceRequirement],
    *,
    accepted_hosts: set[str],
) -> None:
    proposed_hosts = {
        host
        for requirement in requirements
        for host in requirement.allowed_source_hosts
    }
    if proposed_hosts - accepted_hosts and not _EXPLICIT_PUBLISHER_RESTRICTION.search(
        authority_text
    ):
        raise ValueError(
            "allowedSourceHosts require an explicit publisher/source restriction"
        )


def _validate_atomic_evidence_requirements(
    requirements: list[EvidenceRequirement],
) -> None:
    for requirement in requirements:
        source_types = set(requirement.accepted_source_types)
        mixes_statutory_and_other_authority = bool(
            source_types.intersection(_STATUTORY_SOURCE_TYPES)
            and source_types.intersection(_NONSTATUTORY_AUTHORITY_SOURCE_TYPES)
        )
        description = re.sub(r"[_-]+", " ", requirement.description)
        if (
            mixes_statutory_and_other_authority
            and _requirement_has_statutory_force(requirement)
            and _NONSTATUTORY_AUTHORITY_SEMANTICS.search(description)
        ):
            raise ValueError(
                "mixed statutory and non-statutory evidence assertions must be split "
                "into independently verifiable requirements"
            )
        explicit_regulations = {
            (match.group("year"), str(int(match.group("number"))))
            for pattern in (
                _EXPLICIT_EU_REGULATION_NUMBER_YEAR,
                _EXPLICIT_EU_REGULATION_YEAR_NUMBER,
            )
            for match in pattern.finditer(requirement.description)
        }
        if (
            requirement.evidence_role == "grounded_claim"
            and requirement.verification_basis == "grounded_claims"
            and "primary_law" in source_types
            and len(explicit_regulations) > 1
        ):
            raise ValueError(
                "explicit legal instruments must be split into independently "
                "verifiable requirements"
            )


def _requirement_has_statutory_force(requirement: EvidenceRequirement) -> bool:
    claim_type = re.sub(r"[-\s]+", "_", requirement.claim_type.casefold())
    description = re.sub(r"[_-]+", " ", requirement.description)
    return (
        "primary_law" in requirement.accepted_source_types
        or claim_type in _UNAMBIGUOUS_STATUTORY_CLAIM_TYPES
        or _STATUTORY_SEMANTICS.search(description) is not None
    )


def _explicit_eu_regulation_identities(value: str) -> set[tuple[str, str]]:
    """Return explicit EU regulation identities as canonical ``(year, number)`` pairs."""

    return {
        (match.group("year"), str(int(match.group("number"))))
        for pattern in (
            _EXPLICIT_EU_REGULATION_NUMBER_YEAR,
            _EXPLICIT_EU_REGULATION_YEAR_NUMBER,
        )
        for match in pattern.finditer(value)
    }


def _explicit_eu_regulation_url_identities(url: str) -> set[tuple[str, str]]:
    """Read only positively encoded EU regulation identities from publisher URLs."""

    decoded = unquote(url)
    return {
        (match.group("year"), str(int(match.group("number"))))
        for pattern in (
            _EU_REGULATION_CELEX_URL,
            _EU_REGULATION_CONSLEG_URL,
            _EU_REGULATION_ELI_URL,
        )
        for match in pattern.finditer(decoded)
    }


def _has_explicit_enumeration_mismatch(value: str) -> bool:
    """Reject a bounded explicit count only when its own comma-list contradicts it."""

    without_markers = _RAW_EVIDENCE_MARKER.sub("", value)
    for match in _EXPLICIT_ENUMERATION.finditer(without_markers):
        count_prefix = without_markers[match.start() : match.start("count")]
        if re.search(
            r"\b(?:art(?:icle)?s?\.?|annex(?:es)?|paragraphs?|sections?|chapters?|"
            r"recitals?|points?)\s*$",
            count_prefix,
            re.IGNORECASE,
        ):
            continue
        if _NON_ENUMERATION_COUNT_UNIT.search(match.group("label")) is not None:
            continue
        raw_items = match.group("items")
        if "," not in raw_items:
            continue
        pieces = [piece.strip(" *_`\t\r\n") for piece in raw_items.split(",")]
        pieces = [piece for piece in pieces if piece]
        if not pieces:
            continue
        final = re.split(r"\s+(?:and|or)\s+", pieces[-1], maxsplit=1, flags=re.I)
        pieces = [*pieces[:-1], *(piece.strip() for piece in final if piece.strip())]
        # This check is deliberately limited to clear, compact enumerations. It does
        # not infer counts from prose, ranges, semicolon clauses, or implicit lists.
        if len(pieces) >= 3 and all(len(piece.split()) <= 12 for piece in pieces):
            if int(match.group("count")) != len(pieces):
                return True
    return False


def _validate_revision_draft(
    correction: str,
    draft: ScopeRevisionDraft,
    accepted_scope: ScopeArtifactV2 | None = None,
) -> None:
    if len({item.id for item in draft.evidence_requirements}) != len(
        draft.evidence_requirements
    ):
        raise ValueError("evidence requirements must have unique IDs")
    if draft.objective_changed:
        if not draft.objective or not draft.objective_source_spans:
            raise ValueError(
                "changed objective requires correction-backed objective spans"
            )
    elif draft.objective is not None or draft.objective_source_spans:
        raise ValueError("unchanged objective must not be regenerated")
    if draft.topic_changed:
        if not draft.topic_anchors:
            raise ValueError("changed topic requires replacement topic anchors")
    elif draft.topic_anchors:
        raise ValueError("unchanged topic must not be regenerated")
    spans = [*draft.objective_source_spans]
    for topic in draft.topic_anchors:
        spans.extend(topic.source_spans)
        cited = " ".join(
            utf16_slice(correction, span.start, span.end) for span in topic.source_spans
        )
        if topic.value.casefold() not in cited.casefold():
            raise ValueError(
                f"topic anchor {topic.value!r} is not literal cited correction"
            )
    for span in spans:
        utf16_slice(correction, span.start, span.end)
    _validate_allowed_source_host_authority(
        correction,
        draft.evidence_requirements,
        accepted_hosts=(
            {
                host
                for requirement in accepted_scope.evidence_requirements
                for host in requirement.allowed_source_hosts
            }
            if accepted_scope is not None
            else set()
        ),
    )
    _validate_atomic_evidence_requirements(draft.evidence_requirements)
    _project_deliverable_contract(
        authority_text=correction,
        profile=draft.deliverable_profile,
        evidence_requirements=draft.evidence_requirements,
        deliverables=draft.deliverables,
        personas=draft.personas,
        interview_requirements=draft.interview_requirements,
        prd_requirements=draft.prd_requirements,
        limits=draft.limits,
        policies=draft.policies,
        draft_criteria=draft.acceptance_criteria,
        prior_scope=accepted_scope,
    )


def _source_span(request: str, draft: DraftSpan) -> SourceSpan:
    text = utf16_slice(request, draft.start, draft.end)
    return SourceSpan(
        start=draft.start,
        end=draft.end,
        text=text,
        sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
    )


def _authority_payload(
    *,
    tenant_id: UUID,
    artifact_id: UUID,
    canonical_input_hash: str,
    research_input_hash: str,
) -> str:
    return canonical_json(
        {
            "tenantId": str(tenant_id),
            "artifactId": str(artifact_id),
            "canonicalInputHash": canonical_input_hash,
            "researchInputHash": research_input_hash,
        }
    )


def _scope_semantics_payload(
    *,
    topic_anchors: list[TopicAnchor],
    geography: list[str],
    evidence_requirements: list[EvidenceRequirement],
    deliverables: list[str],
    personas: list[str],
    interview_requirements: list[str],
    prd_requirements: list[str],
    limits: list[str],
    policies: list[str],
    deliverable_profile: AcceptedDeliverableProfileV1,
    requirements: list[AcceptedDeliverableRequirementV1],
    acceptance_criteria: list[DeliverableAcceptanceCriterionV1],
) -> dict[str, Any]:
    return {
        "topicAnchors": [
            item.model_dump(mode="json", by_alias=True) for item in topic_anchors
        ],
        "geography": geography,
        "evidenceRequirements": [
            item.model_dump(mode="json", by_alias=True)
            for item in evidence_requirements
        ],
        "deliverables": deliverables,
        "personas": personas,
        "interviewRequirements": interview_requirements,
        "prdRequirements": prd_requirements,
        "limits": limits,
        "policies": policies,
        "deliverableProfile": deliverable_profile.model_dump(
            mode="json", by_alias=True
        ),
        "requirements": [
            item.model_dump(mode="json", by_alias=True) for item in requirements
        ],
        "acceptanceCriteria": [
            item.model_dump(mode="json", by_alias=True) for item in acceptance_criteria
        ],
    }
