"""Draft validation and content-free validation failures. Does not grant execution authority."""

from __future__ import annotations
import re
from backend.domain.workflow_v2.contracts import (
    ReaderOutputContractV1,
    utf16_ordinal_sorted,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from pydantic_ai import ModelRetry
from pydantic_ai.exceptions import ToolRetryError, UnexpectedModelBehavior
from typing import Literal
from backend.services.workflow_v2.cognitive.evidence import (
    _deterministic_evidence_integrity_defects,
    _evidence_clause_fragments,
    _is_bounded_specific_verification_action,
    _is_hard_task_evidence_defect,
    has_positive_launch_readiness_claim,
)
from backend.services.workflow_v2.cognitive.markdown import (
    _deterministic_structural_integrity_defects,
    _evidence_markers,
    _final_repair_topology_defects,
    _incomplete_given_when_then_acceptance_blocks,
    _is_evidence_status_heading,
    _is_server_owned_source_heading,
    _markdown_heading_identities,
    _markdown_heading_level,
    _markdown_heading_primary_identity,
    _markdown_headings,
    _markdown_with_fenced_bodies_blanked,
    _reader_output_defects,
    _required_section_identities,
    _task_fragment_parts,
)
from backend.services.workflow_v2.cognitive.models import (
    SynthesisContext,
    SynthesisDraft,
    TaskDraft,
)
from backend.services.workflow_v2.cognitive.policy import (
    _MARKDOWN_HEADING,
    _PRD_BASELINE_SECTIONS,
    _SAFE_SYNTHESIS_VALIDATION_REASONS,
    _SERVER_GWT_PLACEHOLDER_BODIES,
    _SERVER_SPECIFIC_VERIFICATION_ACTION,
    _SERVER_VALIDATION_ACTION,
)


_SAFE_FINAL_VALIDATION_PREFIXES = (
    *_SAFE_SYNTHESIS_VALIDATION_REASONS,
    (
        "non-authorizing artifact contains a launch-ready claim",
        "LAUNCH_READY_CLAIM_FORBIDDEN",
    ),
    (
        "final artifact contains server-generated validation scaffolding instead ",
        "FINAL_SCAFFOLDING_FORBIDDEN",
    ),
)
_FINAL_VALIDATION_REASON_CODES = frozenset(
    {"VALIDATOR_REJECTED", "READER_CONTRACT_FAILED"}.union(
        reason for _prefix, reason in _SAFE_FINAL_VALIDATION_PREFIXES
    )
)
_FINAL_VALIDATION_COUNT_KEYS = frozenset(
    {
        "required_sections",
        "reader_contract",
        "evidence_integrity",
        "substantive",
        "practicality",
        "topology",
    }
)
_MAX_FINAL_VALIDATION_COUNT = 1_000_000


class SynthesisValidationError(ValueError):
    """Keep validator retry text compatible; expose separate content-free metadata.

    The inherited message can include document content and must not be logged.
    Only ``safe_synthesis_validation_details`` is an operator logging boundary.
    """

    def __init__(
        self,
        message: str,
        *,
        reason: str,
        counts: dict[str, int] | None = None,
    ) -> None:
        if type(reason) is not str or reason not in _FINAL_VALIDATION_REASON_CODES:
            raise ValueError("invalid synthesis validation reason")
        values = {} if counts is None else counts
        if not _valid_final_validation_counts(values):
            raise ValueError("invalid synthesis validation counts")
        super().__init__(message)
        self.reason = reason
        self.counts = dict(values)


def _valid_final_validation_counts(value: object) -> bool:
    return type(value) is dict and all(
        type(key) is str
        and key in _FINAL_VALIDATION_COUNT_KEYS
        and type(count) is int
        and 0 <= count <= _MAX_FINAL_VALIDATION_COUNT
        for key, count in value.items()
    )


def safe_synthesis_validation_details(error: BaseException) -> dict[str, object]:
    """Return closed reason/count fields, never exception or document prose.

    Plain ValueErrors from existing validators/custom writers are categorized
    only by known prefixes. They have no reliable counts. Typed metadata is
    revalidated here so mutated exception attributes cannot leak into logs.
    """

    if isinstance(error, SynthesisValidationError):
        reason = getattr(error, "reason", None)
        counts = getattr(error, "counts", None)
        if (
            type(reason) is str
            and reason in _FINAL_VALIDATION_REASON_CODES
            and _valid_final_validation_counts(counts)
        ):
            return {"reason": reason, "counts": dict(counts)}
        return {"reason": "VALIDATOR_REJECTED", "counts": {}}
    # Avoid invoking arbitrary __str__ implementations or traversing exception
    # causes; neither is needed to expose a bounded category.
    if isinstance(error, ValueError) and len(error.args) == 1:
        message = error.args[0]
        if type(message) is str:
            for prefix, reason in _SAFE_FINAL_VALIDATION_PREFIXES:
                if message.startswith(prefix):
                    return {"reason": reason, "counts": {}}
    return {"reason": "VALIDATOR_REJECTED", "counts": {}}


def _validate_synthesis(context: SynthesisContext, draft: SynthesisDraft) -> None:
    folded = draft.markdown.lower()
    heading_facts = _markdown_headings(draft.markdown)
    headings = {
        identity
        for _, raw_name, _ in heading_facts
        for identity in _markdown_heading_identities(
            raw_name, artifact_type=context.artifact_type
        )
    }
    if any(
        _is_server_owned_source_heading(name, rendered=True)
        for _, name, _ in heading_facts
    ):
        raise SynthesisValidationError(
            "model output must not provide its own source appendix",
            reason="SOURCE_APPENDIX_FORBIDDEN",
        )
    missing = [
        section
        for section in context.required_sections
        if not _is_server_owned_source_heading(section)
        and not _required_section_identities(
            section, artifact_type=context.artifact_type
        ).intersection(headings)
    ]
    if missing:
        raise SynthesisValidationError(
            "required Markdown sections are missing: " + ", ".join(missing),
            reason="REQUIRED_SECTIONS_MISSING",
            counts={"required_sections": len(missing)},
        )
    positive_launch_claim = has_positive_launch_readiness_claim(draft.markdown)
    if positive_launch_claim and context.evidence_readiness != "ready":
        raise SynthesisValidationError(
            "evidence-gapped artifact contains a launch-ready claim",
            reason="LAUNCH_READY_CLAIM_FORBIDDEN",
        )
    if positive_launch_claim and context.artifact_type != "launch_authorization":
        raise SynthesisValidationError(
            "non-authorizing artifact contains a launch-ready claim",
            reason="LAUNCH_READY_CLAIM_FORBIDDEN",
        )
    citations = {marker.group(1) for marker in _evidence_markers(draft.markdown)}
    allowed = set(context.allowed_claim_ids)
    if citations - allowed:
        raise SynthesisValidationError(
            "Markdown cites evidence outside the immutable claim ledger",
            reason="EVIDENCE_CLAIM_NOT_ALLOWED",
        )
    if (
        allowed
        and not citations
        and not (context.purpose == "execute_task" and not context.required_sections)
    ):
        raise SynthesisValidationError(
            "evidence-backed Markdown must cite immutable claim IDs",
            reason="EVIDENCE_CITATION_MISSING",
        )
    if context.evidence_readiness in {"ready_with_gaps", "blocked"}:
        if not any(_is_evidence_status_heading(heading) for heading in headings):
            raise SynthesisValidationError(
                "non-ready Markdown requires an evidence-gap, assumption or blocking section",
                reason="EVIDENCE_STATUS_SECTION_MISSING",
            )
        missing_gaps = [
            label
            for label in context.required_gap_labels
            if label.casefold() not in folded
        ]
        if missing_gaps:
            raise SynthesisValidationError(
                "Markdown does not surface every immutable gap or assumption",
                reason="EVIDENCE_GAP_LABEL_MISSING",
            )
    if context.evidence_readiness == "blocked":
        if not re.search(r"\b(?:no[- ]go|blocked)\b", draft.markdown, re.IGNORECASE):
            raise SynthesisValidationError(
                "blocked report must state a no-go or blocked decision",
                reason="BLOCKED_DECISION_MISSING",
            )
        if not any("remediation" in heading for heading in headings):
            raise SynthesisValidationError(
                "blocked report requires a Remediation heading",
                reason="BLOCKED_REMEDIATION_HEADING_MISSING",
            )
    if context.purpose == "final_synthesis" and (
        _contains_server_unverified_validation_target(draft.markdown)
    ):
        raise SynthesisValidationError(
            "final artifact contains server-generated validation scaffolding instead "
            "of publication-ready prose",
            reason="FINAL_SCAFFOLDING_FORBIDDEN",
        )
    if context.quality_gate_required:
        evidence_integrity = _deterministic_evidence_integrity_defects(
            draft.markdown,
            context.allowed_claim_texts,
            artifact_type=context.artifact_type,
            immutable_gap_labels=context.required_gap_labels,
            unresolved_evidence_requirements=context.unresolved_evidence_requirements,
        )
        substantive, practicality = _deterministic_quality_defects(
            draft.markdown,
            practical_output_required=context.practical_output_required,
            artifact_type=context.artifact_type,
            reader_output=context.reader_output,
        )
        topology = (
            _final_repair_topology_defects(
                context.final_repair_topology, draft.markdown
            )
            if context.final_repair_topology is not None
            else []
        )
        if evidence_integrity or substantive or practicality or topology:
            raise SynthesisValidationError(
                "final artifact failed substantive/practical quality: "
                + "; ".join(
                    [*evidence_integrity, *substantive, *practicality, *topology]
                ),
                reason="QUALITY_GATE_FAILED",
                counts={
                    "evidence_integrity": len(evidence_integrity),
                    "substantive": len(substantive),
                    "practicality": len(practicality),
                    "topology": len(topology),
                },
            )


def _validate_task_draft(context: SynthesisContext, draft: TaskDraft) -> None:
    coverage_ids = [item.requirement_id for item in draft.requirement_coverage]
    if coverage_ids != context.acceptance_requirement_ids:
        raise ValueError(
            "task coverage must exactly match sorted acceptance requirement IDs"
        )
    _validate_synthesis(
        context,
        SynthesisDraft(title=draft.title, markdown=draft.markdown),
    )
    evidence_integrity = _deterministic_evidence_integrity_defects(
        draft.markdown,
        context.allowed_claim_texts,
        artifact_type=context.artifact_type,
        immutable_gap_labels=context.required_gap_labels,
        unresolved_evidence_requirements=context.unresolved_evidence_requirements,
    )
    unresolved_assertions = [
        defect
        for defect in evidence_integrity
        if (
            defect.startswith("An unresolved evidence requirement is asserted as fact")
            or "unresolved evidence assertion" in defect
        )
    ]
    if unresolved_assertions:
        raise ValueError(
            "task artifact contradicts unresolved evidence: "
            + "; ".join(unresolved_assertions)
        )
    hard_specialist_defects = [
        defect for defect in evidence_integrity if _is_hard_task_evidence_defect(defect)
    ]
    if not context.required_sections and hard_specialist_defects:
        raise ValueError(
            "specialist task contains residual unsupported evidence assertions: "
            + "; ".join(hard_specialist_defects)
        )


def _contains_server_deliverable_placeholder(markdown: str) -> bool:
    """Detect exact server fallback prose that is safe but not deliverable content."""

    unfenced = _markdown_with_fenced_bodies_blanked(markdown)
    specific_verification_actions = 0
    for line in unfenced.splitlines():
        units = line.split("|") if "|" in line else [line]
        for unit in units:
            for fragment in _evidence_clause_fragments(unit.strip()):
                cleaned = re.sub(r"[`]", "", fragment).strip()
                if not cleaned:
                    continue
                if _SERVER_VALIDATION_ACTION.fullmatch(re.sub(r"[*_]", "", cleaned)):
                    if re.search(r"\bverify\s+this\s+item\b", cleaned, re.IGNORECASE):
                        return True
                    # A content-specific whole-proposition verification action is
                    # publication-ready planning content, not generic server filler.
                    continue
                if _SERVER_SPECIFIC_VERIFICATION_ACTION.fullmatch(
                    re.sub(r"[*_]", "", cleaned)
                ) and _is_bounded_specific_verification_action(cleaned):
                    specific_verification_actions += 1
                    # A single bounded verification step can be useful. Repeated exact
                    # server phrasing is repair scaffolding, not final deliverable prose.
                    if specific_verification_actions >= 4:
                        return True
                _list_prefix, _role_prefix, role, body = _task_fragment_parts(cleaned)
                normalized_body = re.sub(r"[*_]", "", body).strip().rstrip(".;:")
                if (role, normalized_body.casefold()) in _SERVER_GWT_PLACEHOLDER_BODIES:
                    return True
    return False


def _contains_server_unverified_validation_target(markdown: str) -> bool:
    """Keep server-projected unverified authority content out of direct promotion."""

    unfenced = _markdown_with_fenced_bodies_blanked(markdown)
    server_marker = (
        "validation target (all following content is unverified until pre-adoption "
        "review):"
    )
    for line in unfenced.splitlines():
        units = line.split("|") if "|" in line else [line]
        for unit in units:
            candidate = unit.strip()
            heading = _MARKDOWN_HEADING.fullmatch(candidate)
            if heading is not None:
                candidate = heading.group(1).strip()
            normalized = (
                re.sub(r"\s+", " ", re.sub(r"[*_`]", "", candidate)).strip().casefold()
            )
            if server_marker in normalized:
                return True
    return False


def _deterministic_quality_defects(
    markdown: str,
    *,
    practical_output_required: bool,
    artifact_type: str | None = None,
    reader_output: ReaderOutputContractV1 | None = None,
) -> tuple[list[str], list[str]]:
    base = markdown.split("\n\n## Sources\n", 1)[0]
    words = re.findall(r"\b[\w'-]+\b", base)
    substantive: list[str] = []
    practical: list[str] = []
    if (
        artifact_type not in {"content_artifact", "general_artifact"}
        and len(words) < 120
    ):
        substantive.append(
            "The candidate is too thin to be a substantive full-contract artifact."
        )
    substantive.extend(_reader_output_defects(base, reader_output))
    shell_labels = sum(
        label in base.casefold()
        for label in (
            "accepted scope",
            "evidence status",
            "prd requirements",
            "accepted plan",
            "source artifacts",
        )
    )
    actionable_lines = sum(
        bool(re.match(r"^\s*(?:[-*]|\d+[.)])\s+\S", line)) for line in base.splitlines()
    )
    if shell_labels >= 3 and actionable_lines < 6:
        substantive.append(
            "The candidate mostly restates scope/plan metadata instead of delivering the work."
        )
    if re.search(
        r"\b(?:lorem ipsum|placeholder|insert (?:details|content)|to be completed)\b",
        base,
        re.IGNORECASE,
    ):
        substantive.append("The candidate contains placeholder content.")
    if _contains_server_deliverable_placeholder(base):
        substantive.append(
            "The candidate contains server-generated evidence-validation placeholders "
            "instead of substantive deliverable content."
        )
    heading_matches = list(
        _MARKDOWN_HEADING.finditer(_markdown_with_fenced_bodies_blanked(base))
    )
    heading_facts = [
        (
            match,
            _markdown_heading_level(match),
            match.group(1).strip(),
            match.group(1).strip().casefold(),
        )
        for match in heading_matches
    ]
    level_two_names = [
        _markdown_heading_primary_identity(raw, artifact_type=artifact_type)
        for _match, level, raw, _normalized in heading_facts
        if level == 2
    ]
    duplicate_level_two = utf16_ordinal_sorted(
        {name for name in level_two_names if level_two_names.count(name) > 1}
    )
    if duplicate_level_two:
        substantive.append(
            "The candidate repeats level-two sections: "
            + ", ".join(duplicate_level_two)
            + "."
        )
    for index, (match, level, raw_name, _normalized_name) in enumerate(heading_facts):
        if level < 2:
            continue
        content_end = len(base)
        for later_match, later_level, _later_raw, _later_normalized in heading_facts[
            index + 1 :
        ]:
            if later_level <= level:
                content_end = later_match.start()
                break
        section_body = _MARKDOWN_HEADING.sub("", base[match.end() : content_end])
        if len(re.findall(r"\b[\w'-]+\b", section_body)) < 3:
            practical.append(f"Markdown section {raw_name!r} is empty or too thin.")
    fenced_blocks = re.findall(r"(?ms)^\s*```[^\n]*\n(.*?)^\s*```\s*$", base)
    if any(
        "|" in block and re.search(r"(?m)^\s*\+[-+]{3,}\+\s*$", block)
        for block in fenced_blocks
    ):
        substantive.append(
            "The candidate uses an ASCII-art table inside a code fence instead of valid Markdown."
        )
    if re.search(
        r"\b(?:will\s+(?:succeed|win|dominate|guarantee)|guaranteed\s+to\s+(?:succeed|win|dominate))\b",
        base,
        re.IGNORECASE,
    ):
        substantive.append(
            "The candidate presents an unverified product or market success prediction as fact."
        )
    if practical_output_required:
        practical_terms = re.findall(
            r"\b(?:decision|action|acceptance|test|validate|validation|owner|risk|metric|milestone|next step|requirement)\w*\b",
            base,
            re.IGNORECASE,
        )
        if len(practical_terms) < 4 or actionable_lines < 3:
            practical.append(
                "The candidate lacks concrete decisions, actions, acceptance checks or validation steps."
            )
    practical.extend(_deterministic_structural_integrity_defects(base))
    if artifact_type in {"product_prd", "software_prd"}:
        headings = {
            identity
            for _position, raw_name, _normalized in _markdown_headings(base)
            for identity in _markdown_heading_identities(
                raw_name, artifact_type=artifact_type
            )
        }
        section_matches = heading_matches
        for index, section_match in enumerate(section_matches):
            raw_name = section_match.group(1).strip()
            heading_identities = _markdown_heading_identities(
                raw_name, artifact_type=artifact_type
            )
            if not heading_identities.intersection(
                {section.lower() for section in _PRD_BASELINE_SECTIONS}.union(
                    {"technical boundaries"}
                )
            ):
                continue
            section_level = _markdown_heading_level(section_match)
            content_end = len(base)
            for later_match in section_matches[index + 1 :]:
                later_level = _markdown_heading_level(later_match)
                if later_level <= section_level:
                    content_end = later_match.start()
                    break
            section_body = _MARKDOWN_HEADING.sub(
                "", base[section_match.end() : content_end]
            )
            if len(re.findall(r"\b[\w'-]+\b", section_body)) < 3:
                practical.append(f"PRD section {raw_name!r} is empty or too thin.")
        if not re.search(r"\bP[012]\b", base):
            practical.append("The PRD has no explicit P0/P1/P2 requirement priorities.")
        if not all(
            re.search(rf"\b{term}\b", base, re.IGNORECASE)
            for term in ("Given", "When", "Then")
        ):
            practical.append("The PRD lacks Given/When/Then acceptance traceability.")
        practical.extend(_incomplete_given_when_then_acceptance_blocks(base))
        if not {
            "metrics and validation",
            "next steps",
            "prioritized requirements",
        }.issubset(headings):
            practical.append(
                "The PRD lacks prioritized requirements, metrics/validation, or next steps."
            )
        if artifact_type == "software_prd" and "technical boundaries" not in headings:
            practical.append("The software PRD lacks explicit technical boundaries.")
    return utf16_ordinal_sorted(set(substantive)), utf16_ordinal_sorted(set(practical))


def _safe_synthesis_validation_failure(
    error: UnexpectedModelBehavior,
    *,
    phase: Literal["TASK", "EVALUATION", "FINAL", "BLOCKED_REPORT"],
) -> CognitiveExecutionFailure | None:
    """Translate only exhausted AxWise validators without retaining model content."""

    if error.message != "Exceeded maximum output retries (2)":
        return None
    current: BaseException | None = error.__cause__ or error.__context__
    seen: set[int] = set()
    structured_output_invalid = False
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, ModelRetry):
            reason = "VALIDATOR_REJECTED"
            for prefix, candidate in _SAFE_SYNTHESIS_VALIDATION_REASONS:
                if current.message.startswith(prefix):
                    reason = candidate
                    break
            return CognitiveExecutionFailure(
                f"AXWISE_{phase}_OUTPUT_VALIDATION_EXHAUSTED_{reason}",
                retryable=True,
            )
        if isinstance(current, ToolRetryError):
            structured_output_invalid = True
        current = current.__cause__ or current.__context__
    if structured_output_invalid:
        return CognitiveExecutionFailure(
            f"AXWISE_{phase}_OUTPUT_VALIDATION_EXHAUSTED_STRUCTURED_OUTPUT_INVALID",
            retryable=True,
        )
    return None
