"""Bounded draft projections and final/blocked report preparation; preserves evidence gaps."""

from __future__ import annotations
import html
import re
from backend.domain.workflow_v2.contracts import (
    ReaderOutputContractV1,
    RequirementCoverageV1,
    ResearchResultV2,
    utf16_ordinal_sorted,
)
from collections import Counter
from typing import Callable
from backend.services.workflow_v2.cognitive.evidence import (
    _assertions_share_explicit_polarity,
    _claims_align_with_assertion,
    _deterministic_evidence_integrity_defects,
    _evidence_clause_fragments,
    _expanded_support_tokens,
    _handled_task_evidence_defect,
    _is_bounded_specific_verification_action,
    _is_hard_task_evidence_defect,
    _is_pure_statutory_locator,
    _materially_matches_unresolved_requirement,
    _precision_values,
    _split_unresolved_assertions,
    _support_tokens,
    has_positive_launch_readiness_claim,
)
from backend.services.workflow_v2.cognitive.markdown import (
    _deterministic_structural_integrity_defects,
    _fenced_markdown_line_indexes,
    _final_repair_topology,
    _final_repair_topology_defects,
    _has_server_owned_immutable_gap_bullet,
    _immutable_gap_bullet,
    _incomplete_given_when_then_acceptance_blocks,
    _is_evidence_status_heading,
    _is_server_owned_source_heading,
    _markdown_heading_identities,
    _markdown_heading_level,
    _markdown_headings,
    _markdown_with_fenced_bodies_blanked,
    _markdown_without_matching_lines,
    _required_section_identities,
    _task_fragment_parts,
)
from backend.services.workflow_v2.cognitive.models import (
    EvaluationDraft,
    SynthesisContext,
    SynthesisDraft,
    TaskDraft,
)
from backend.services.workflow_v2.cognitive.policy import (
    _ACTION_ASSERTED_TAIL,
    _ASCII_DECISION_DIAGRAM,
    _DIRECT_CHECKLIST_TERM,
    _DISPLAY_REQUIREMENT_ID,
    _EVIDENCE_CLAIM_ID,
    _EVIDENCE_SENSITIVE_ASSERTION,
    _FENCED_GATE_LABEL,
    _FENCED_ROADMAP_ACTIVITY,
    _FENCED_ROADMAP_LABEL,
    _FENCED_TREE_ROADMAP_ACTIVITY,
    _FENCED_TREE_ROADMAP_PERIOD,
    _FORMULA_MARKER,
    _IMMUTABLE_GAP_SECTION_HEADINGS,
    _MARKDOWN_HEADING,
    _NONPROVISIONAL_AUTHORITY_ASSERTION,
    _NUMBERED_GATE_LINE,
    _OVERBROAD_PUBLICATION_GROUNDING_CLAIM,
    _PROJECTED_STATUTORY_LOCATOR_HEADER,
    _PUBLICATION_EVIDENCE_STATUS_BLOCK,
    _PUBLICATION_UNKNOWN_PENDING_PREFIX,
    _RAW_EVIDENCE_MARKER,
    _REVIEW_AGAINST_AUTHORITY,
    _REVIEW_AUTHORITY_LOWERCASE_WORDS,
    _REVIEW_AUTHORITY_TERMINAL,
    _REVIEW_COORDINATED_TAIL,
    _SERVER_UNVERIFIED_VALIDATION_TARGET,
    _SERVER_UNVERIFIED_VALIDATION_TARGET_INLINE,
    _SERVER_UNVERIFIED_VALIDATION_TARGET_PARTS,
    _STATUTORY_LOCATOR_COLUMN,
    _TOP_LEVEL_MARKDOWN_CHECKLIST_ITEM,
    _UNRESOLVED_AUTHORITY_QUALIFIER,
)
from backend.services.workflow_v2.cognitive.validation import (
    SynthesisValidationError,
    _deterministic_quality_defects,
    _is_advisory_planning_evidence_defect,
    _validate_task_draft,
)


def _with_advisory_planning_review(
    context: SynthesisContext,
    draft: SynthesisDraft,
    review: EvaluationDraft | None = None,
) -> str:
    """Render review observations as attributed text, never a pass certificate."""
    findings = [
        ("Unverified claim — review required", defect.partition(": ")[2])
        for defect in _deterministic_evidence_integrity_defects(
            draft.markdown,
            context.allowed_claim_texts,
            artifact_type=context.artifact_type,
            immutable_gap_labels=context.required_gap_labels,
            unresolved_evidence_requirements=context.unresolved_evidence_requirements,
            excerpt_limit=None,
            defect_limit=None,
        )
        if _is_advisory_planning_evidence_defect(context, defect)
    ]
    if review is not None:
        for field, label in (
            ("unsupported_precision", "Evidence concern"),
            ("contradictions", "Consistency concern"),
            ("stale_topic_references", "Relevance concern"),
            ("readiness_violations", "Readiness concern"),
            ("substantive_content_defects", "Content concern"),
            ("practicality_defects", "Practicality concern"),
            ("repair_instructions", "Suggested revision"),
        ):
            findings.extend((label, text) for text in getattr(review, field))
    body, source_heading, source_body = draft.markdown.partition("\n\n## Sources\n")
    lines = [
        body.rstrip(),
        "",
        "## Review notes — advisory",
        "",
        "> **Draft for human review.** Proposed decisions and automated review "
        "comments are not implementation verification or launch approval. "
        "Resolve open questions before putting this plan into operation.",
        "",
    ]
    if findings:
        lines.append(
            "Automated observations below may include false positives. They remain "
            "review items, not verified facts or proof that all other issues were found."
        )
        lines.append("")
        for label, text in findings:
            # Render provider prose literally: no active links, raw HTML, source
            # markers, headings, or accidental authority in the review appendix.
            literal = html.escape(
                " ".join(text.split()).replace("[", "［").replace("]", "］"),
                quote=False,
            )
            literal = re.sub(r"([\\`*_{}\[\]()#+.!|>~-])", r"\\\1", literal)
            lines.append(f"- **{label}:** {literal}")
    elif review is None:
        lines.append(
            "Review history is recorded separately; this draft still requires human review."
        )
    else:
        lines.append(
            "No concerns were identified by this automated review; correctness "
            "remains unverified."
        )
    # The source appendix is canonical and must remain the final section.
    return "\n".join(lines) + source_heading + source_body


def _with_immutable_gap_labels(
    context: SynthesisContext,
    draft: TaskDraft | SynthesisDraft,
) -> TaskDraft | SynthesisDraft:
    """Preserve exact research gaps without asking the model to copy immutable facts."""

    if context.evidence_readiness not in {"ready_with_gaps", "blocked"}:
        return draft
    seen: set[str] = set()
    missing: list[str] = []
    for label in context.required_gap_labels:
        canonical = label.casefold()
        canonical_bullet = _immutable_gap_bullet(label)
        if canonical in seen or _has_server_owned_immutable_gap_bullet(
            draft.markdown, canonical_bullet
        ):
            continue
        seen.add(canonical)
        missing.append(label)
    if not missing:
        return draft
    missing = utf16_ordinal_sorted(missing)
    lines = draft.markdown.rstrip().splitlines()
    for index, line in enumerate(lines):
        stripped = line.strip()
        heading = _MARKDOWN_HEADING.fullmatch(stripped)
        if (
            heading is None
            or heading.group(1).strip() not in _IMMUTABLE_GAP_SECTION_HEADINGS
        ):
            continue
        insert_at = len(lines)
        for later_index in range(index + 1, len(lines)):
            later_stripped = lines[later_index].strip()
            later_heading = _MARKDOWN_HEADING.fullmatch(later_stripped)
            if later_heading is not None:
                insert_at = later_index
                break
        additions = [*(_immutable_gap_bullet(label) for label in missing)]
        if insert_at > 0 and lines[insert_at - 1].strip():
            additions.insert(0, "")
        if insert_at < len(lines) and lines[insert_at].strip():
            additions.append("")
        lines[insert_at:insert_at] = additions
        return draft.model_copy(update={"markdown": "\n".join(lines)})
    markdown = "\n".join(
        [
            draft.markdown.rstrip(),
            "",
            "## Immutable evidence gaps and assumptions",
            "",
            (
                "These immutable gaps remain unresolved. They do not establish launch, "
                "legal, safety, certification, or market clearance."
            ),
            "",
            *(_immutable_gap_bullet(label) for label in missing),
        ]
    )
    return draft.model_copy(update={"markdown": markdown})


def _without_forbidden_task_launch_claim_lines(
    context: SynthesisContext,
    draft: TaskDraft,
) -> TaskDraft:
    """Delete unsafe child-task assertions before they enter immutable lineage."""

    if (
        context.evidence_readiness == "ready"
        and context.artifact_type == "launch_authorization"
    ):
        return draft
    markdown = _markdown_without_matching_lines(
        draft.markdown, has_positive_launch_readiness_claim
    )
    if markdown == draft.markdown:
        return draft
    return draft.model_copy(update={"markdown": markdown.strip()})


def _as_unresolved_validation_action(fragment: str, *, table_cell: bool = False) -> str:
    """Reclassify one unsafe assertion as a specific verification action."""

    list_prefix, role_prefix, role, body = _task_fragment_parts(fragment)
    body = body.strip().rstrip(" .;:")
    action = (
        "Validation target (all following content is unverified until pre-adoption "
        "review): "
        f"{body}."
    )
    if role:
        return f"{list_prefix}{role_prefix}{action}"
    if table_cell:
        return action
    return f"{list_prefix}{action}"


def _as_unverified_repair_assumption(fragment: str, *, table_cell: bool = False) -> str:
    """Preserve a non-authority proposition without presenting it as verified fact."""

    list_prefix, role_prefix, _role, body = _task_fragment_parts(fragment)
    body = body.strip().rstrip(" .;:")
    assumption = f"Unverified assumption: {body}."
    if role_prefix:
        return f"{list_prefix}{role_prefix}{assumption}"
    if table_cell:
        return assumption
    return f"{list_prefix}{assumption}"


def _prepare_task_unresolved_actions(
    context: SynthesisContext,
    draft: TaskDraft | SynthesisDraft,
    *,
    include_generic: bool = False,
    allow_composite_authority_targets: bool = False,
) -> TaskDraft | SynthesisDraft:
    """Withhold unsupported task claims without discarding the useful artifact.

    Non-authorizing, evidence-gapped work may retain an uncited unresolved-authority
    proposition only as an explicit verification action. Generic precision and citation
    defects remain unchanged for evaluation and final repair. Final-artifact repair leaves
    a causal or coordinator tail for the bounded model retry. Task drafting may instead
    wrap the entire composite authority proposition in one server-owned validation target;
    every following clause is then explicitly unverified and remains available to later
    evaluation and synthesis.
    Strict validation and promotion checks remain authoritative when exact targeting
    cannot be proven safe.
    """

    if context.artifact_type == "launch_authorization":
        return draft
    if include_generic:
        if context.evidence_readiness not in {"ready", "ready_with_gaps"}:
            return draft
    elif context.evidence_readiness != "ready_with_gaps":
        return draft

    current = draft.markdown

    def present_required_headings(markdown: str) -> set[str]:
        headings = {
            identity
            for _, raw_name, _ in _markdown_headings(markdown)
            for identity in _markdown_heading_identities(
                raw_name, artifact_type=context.artifact_type
            )
        }
        return {
            section.strip().lower()
            for section in context.required_sections
            if not _is_server_owned_source_heading(section)
            and _required_section_identities(
                section, artifact_type=context.artifact_type
            ).intersection(headings)
        }

    def fenced_line_indexes(markdown: str) -> set[int]:
        indexes: set[int] = set()
        fence_character = ""
        fence_length = 0
        for index, line in enumerate(markdown.splitlines()):
            fence = re.match(r"^\s*(`{3,}|~{3,})", line)
            if fence is not None:
                marker = fence.group(1)
                indexes.add(index)
                if not fence_character:
                    fence_character = marker[0]
                    fence_length = len(marker)
                elif marker[0] == fence_character and len(marker) >= fence_length:
                    fence_character = ""
                    fence_length = 0
                continue
            if fence_character:
                indexes.add(index)
        return indexes

    for _pass in range(max(1, len(current.splitlines()) * 2)):
        defects = _deterministic_evidence_integrity_defects(
            current,
            context.allowed_claim_texts,
            artifact_type=context.artifact_type,
            immutable_gap_labels=context.required_gap_labels,
            unresolved_evidence_requirements=context.unresolved_evidence_requirements,
            defect_limit=None,
            excerpt_limit=None,
            preserve_duplicate_occurrences=True,
        )
        handled = [
            value
            for defect in defects
            if (
                value := _handled_task_evidence_defect(
                    defect, include_generic=include_generic
                )
            )
            is not None
        ]
        if not handled:
            break

        changed = False
        lines = current.splitlines()
        fenced_indexes = fenced_line_indexes(current)
        for line_index, line in enumerate(lines):
            if line_index in fenced_indexes:
                continue
            is_table_line = "|" in line
            units = line.split("|") if is_table_line else [line]
            for unit_index, unit in enumerate(units):
                candidate_base = unit.strip()
                heading = _MARKDOWN_HEADING.fullmatch(candidate_base)
                if heading is not None:
                    candidate_base = heading.group(1).strip()
                fragments = (
                    [candidate_base]
                    if is_table_line
                    else _evidence_clause_fragments(candidate_base)
                )
                candidates = [
                    candidate
                    for fragment in fragments
                    for candidate in (
                        _split_unresolved_assertions(fragment)
                        if _UNRESOLVED_AUTHORITY_QUALIFIER.search(fragment)
                        else [fragment.strip()]
                    )
                    if candidate
                ]
                for candidate in candidates:
                    candidate_index = unit.find(candidate)
                    if candidate_index < 0:
                        continue
                    markerless = _RAW_EVIDENCE_MARKER.sub("", candidate)
                    normalized = re.sub(r"\s+", " ", markerless).strip()
                    target_end = candidate_index + len(candidate)
                    trailing = unit[target_end:]
                    adjacent_marker = re.match(
                        r"^[\s.,;:!?()`*_~-]*(\[evidence:[^\]\r\n]+\])",
                        trailing,
                    )
                    locally_cited = _RAW_EVIDENCE_MARKER.search(candidate) is not None
                    target = next(
                        (
                            item
                            for item in handled
                            if normalized == item[0] and locally_cited == item[2]
                        ),
                        None,
                    )
                    if target is None:
                        continue

                    if adjacent_marker is not None:
                        target_end += adjacent_marker.end()
                    _target_excerpt, unresolved_authority, _cited_defect = target
                    if (
                        _ACTION_ASSERTED_TAIL.search(markerless)
                        and not allow_composite_authority_targets
                    ):
                        # A wrapper must not retain an independently asserted causal or
                        # coordinator tail. Strict validation requests a coherent retry.
                        continue
                    use_validation_action = unresolved_authority or (
                        include_generic
                        and (
                            _EVIDENCE_SENSITIVE_ASSERTION.search(markerless) is not None
                            or _NONPROVISIONAL_AUTHORITY_ASSERTION.search(markerless)
                            is not None
                        )
                    )
                    replacement = (
                        _as_unresolved_validation_action(
                            markerless, table_cell=is_table_line
                        )
                        if use_validation_action
                        else _as_unverified_repair_assumption(
                            markerless, table_cell=is_table_line
                        )
                    )
                    trial_unit = (
                        unit[:candidate_index] + replacement + unit[target_end:]
                    )
                    trial_units = [*units]
                    trial_units[unit_index] = trial_unit
                    trial_lines = [*lines]
                    trial_lines[line_index] = "|".join(trial_units)
                    trial = "\n".join(trial_lines)
                    if set(
                        _deterministic_structural_integrity_defects(trial)
                    ).difference(_deterministic_structural_integrity_defects(current)):
                        continue
                    if present_required_headings(current).difference(
                        present_required_headings(trial)
                    ):
                        continue
                    if set(
                        _incomplete_given_when_then_acceptance_blocks(trial)
                    ).difference(
                        _incomplete_given_when_then_acceptance_blocks(current)
                    ):
                        continue
                    trial_defects = _deterministic_evidence_integrity_defects(
                        trial,
                        context.allowed_claim_texts,
                        artifact_type=context.artifact_type,
                        immutable_gap_labels=context.required_gap_labels,
                        unresolved_evidence_requirements=(
                            context.unresolved_evidence_requirements
                        ),
                        defect_limit=None,
                        excerpt_limit=None,
                        preserve_duplicate_occurrences=True,
                    )
                    trial_handled = [
                        value
                        for defect in trial_defects
                        if (
                            value := _handled_task_evidence_defect(
                                defect, include_generic=include_generic
                            )
                        )
                        is not None
                    ]
                    if len(trial_handled) >= len(handled):
                        continue
                    if set(trial_defects).difference(defects):
                        continue
                    current = trial
                    changed = True
                    break
                if changed:
                    break
            if changed:
                break
        if not changed:
            break

    if current == draft.markdown:
        return draft
    if set(_deterministic_structural_integrity_defects(current)).difference(
        _deterministic_structural_integrity_defects(draft.markdown)
    ):
        return draft
    return draft.model_copy(update={"markdown": current})


def _repair_final_gwt_evidence_assertions(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Keep acceptance topology while turning a residual unsafe role into a check.

    Final validation never deletes a Given/When/Then role. For non-authorizing artifacts,
    reclassify only an unsafe ``When`` action as a bounded verification step. Never rewrite
    ``Given`` input semantics or a ``Then`` expected outcome. The evidence, structure and
    quality validators must all improve or remain unchanged; repeated server phrasing still
    trips the existing deliverable-placeholder quality gate.
    """

    if context.artifact_type == "launch_authorization":
        return draft
    current = draft.markdown
    for _pass in range(max(1, len(current.splitlines()))):
        defects = _deterministic_evidence_integrity_defects(
            current,
            context.allowed_claim_texts,
            artifact_type=context.artifact_type,
            immutable_gap_labels=context.required_gap_labels,
            unresolved_evidence_requirements=context.unresolved_evidence_requirements,
            defect_limit=None,
            excerpt_limit=None,
            preserve_duplicate_occurrences=True,
        )
        excerpts = [
            excerpt
            for defect in defects
            for _, separator, excerpt in [defect.partition(": ")]
            if separator and excerpt
        ]
        if not excerpts:
            break
        lines = current.splitlines()
        fenced = _fenced_markdown_line_indexes(current)
        before_structural = _deterministic_structural_integrity_defects(current)
        before_gwt = _incomplete_given_when_then_acceptance_blocks(current)
        before_substantive, before_practical = _deterministic_quality_defects(
            current,
            practical_output_required=context.practical_output_required,
            artifact_type=context.artifact_type,
            reader_output=context.reader_output,
        )
        changed = False
        for index, line in enumerate(lines):
            if index in fenced or "|" in line:
                continue
            list_prefix, role_prefix, role, body = _task_fragment_parts(line)
            if role != "when" or not body.strip():
                continue
            normalized = re.sub(r"\s+", " ", _RAW_EVIDENCE_MARKER.sub("", line)).strip()
            if not any(excerpt in normalized for excerpt in excerpts):
                continue
            body = _RAW_EVIDENCE_MARKER.sub("", body).strip().rstrip(" .;,: ")
            if not body:
                continue
            if body.casefold().startswith("confirm whether "):
                continue
            replacement = (
                f"{list_prefix}{role_prefix}confirm whether {body} before relying on "
                "the outcome."
            )
            if not _is_bounded_specific_verification_action(replacement):
                continue
            trial_lines = [*lines]
            trial_lines[index] = replacement
            trial = "\n".join(trial_lines)
            trial_defects = _deterministic_evidence_integrity_defects(
                trial,
                context.allowed_claim_texts,
                artifact_type=context.artifact_type,
                immutable_gap_labels=context.required_gap_labels,
                unresolved_evidence_requirements=(
                    context.unresolved_evidence_requirements
                ),
                defect_limit=None,
                excerpt_limit=None,
                preserve_duplicate_occurrences=True,
            )
            if len(trial_defects) >= len(defects) or set(trial_defects).difference(
                defects
            ):
                continue
            if set(_deterministic_structural_integrity_defects(trial)).difference(
                before_structural
            ) or set(_incomplete_given_when_then_acceptance_blocks(trial)).difference(
                before_gwt
            ):
                continue
            trial_substantive, trial_practical = _deterministic_quality_defects(
                trial,
                practical_output_required=context.practical_output_required,
                artifact_type=context.artifact_type,
                reader_output=context.reader_output,
            )
            if set(trial_substantive).difference(before_substantive) or set(
                trial_practical
            ).difference(before_practical):
                continue
            current = trial
            changed = True
            break
        if not changed:
            break
    return (
        draft
        if current == draft.markdown
        else draft.model_copy(update={"markdown": current})
    )


def _with_accepted_requirement_traceability(
    context: SynthesisContext, draft: TaskDraft | SynthesisDraft
) -> TaskDraft | SynthesisDraft:
    """Add missing immutable requirement IDs without asking the model to rewrite work."""

    if (
        context.artifact_type not in {"product_prd", "software_prd"}
        or not context.accepted_requirements
    ):
        return draft
    base = _markdown_with_fenced_bodies_blanked(draft.markdown).split(
        "\n\n## Sources\n", 1
    )[0]
    headings = list(_MARKDOWN_HEADING.finditer(base))
    prioritized_index = next(
        (
            index
            for index, match in enumerate(headings)
            if "prioritized requirements"
            in _markdown_heading_identities(
                match.group(1), artifact_type=context.artifact_type
            )
        ),
        None,
    )
    acceptance_index = next(
        (
            index
            for index, match in enumerate(headings)
            if "acceptance criteria"
            in _markdown_heading_identities(
                match.group(1), artifact_type=context.artifact_type
            )
        ),
        None,
    )
    if prioritized_index is None or acceptance_index is None:
        return draft

    def section_body(index: int) -> tuple[str, int]:
        match = headings[index]
        level = _markdown_heading_level(match)
        end = len(base)
        for later in headings[index + 1 :]:
            later_level = _markdown_heading_level(later)
            if later_level <= level:
                end = later.start()
                break
        return base[match.end() : end], end

    prioritized, insertion_offset = section_body(prioritized_index)
    acceptance, _acceptance_end = section_body(acceptance_index)
    prioritized_ids = {
        match.group(0).casefold()
        for match in _DISPLAY_REQUIREMENT_ID.finditer(prioritized)
    }
    acceptance_ids = {
        match.group(0).casefold()
        for match in _DISPLAY_REQUIREMENT_ID.finditer(acceptance)
    }
    requirements = {item.id: item for item in context.accepted_requirements}
    missing = [
        requirements[requirement_id]
        for requirement_id in utf16_ordinal_sorted(
            acceptance_ids.difference(prioritized_ids)
        )
        if requirement_id in requirements
    ]
    if not missing:
        return draft
    if len(missing) != len(acceptance_ids.difference(prioritized_ids)):
        return draft

    rows = [
        "**Accepted-scope traceability**",
        "",
        "| Priority | Requirement ID | Category | Immutable binding |",
        "| --- | --- | --- | --- |",
        *[
            "| "
            f"{item.priority} | `{item.id}` | `{item.category}` | "
            "Exact semantics remain bound to the immutable accepted scope. |"
            for item in missing
        ],
    ]
    insertion = "\n\n" + "\n".join(rows) + "\n"
    repaired = (
        draft.markdown[:insertion_offset].rstrip()
        + insertion
        + draft.markdown[insertion_offset:].lstrip("\n")
    )
    if set(_deterministic_structural_integrity_defects(repaired)).difference(
        _deterministic_structural_integrity_defects(draft.markdown)
    ):
        return draft
    return draft.model_copy(update={"markdown": repaired})


def _with_canonical_acceptance_criteria(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Render the accepted typed G/W/T contract for the strict final fallback.

    Model-authored operational scenarios may be richer, so the normal bounded repair
    keeps them. If that repair exhausts, however, the fallback must not fail because a
    model omitted a role or formatted the accepted criteria inconsistently. Replace
    only the Acceptance criteria section body with the exact Gate-1-bound criteria;
    never infer a mapping from prose back to a typed criterion.
    """

    if (
        context.purpose != "final_synthesis"
        or context.artifact_type not in {"product_prd", "software_prd"}
        or not context.accepted_acceptance_criteria
    ):
        return draft
    heading_matches = list(_MARKDOWN_HEADING.finditer(draft.markdown))
    acceptance_matches = [
        (index, match)
        for index, match in enumerate(heading_matches)
        if "acceptance criteria"
        in _markdown_heading_identities(
            match.group(1), artifact_type=context.artifact_type
        )
    ]
    if not acceptance_matches:
        return draft

    # A model may split the same required PRD section into two level-two
    # sections (for example, authored scenarios followed by additional scope
    # checks). The strict fallback renders the exact accepted typed contract, so
    # retaining both model-authored bodies would be both redundant and capable
    # of preserving contradictory acceptance semantics. Consolidate only
    # semantically identified peer sections; nested headings and every other
    # section remain untouched.
    acceptance_level = (
        2
        if any(_markdown_heading_level(match) == 2 for _, match in acceptance_matches)
        else min(_markdown_heading_level(match) for _, match in acceptance_matches)
    )
    peer_matches = [
        (index, match)
        for index, match in acceptance_matches
        if _markdown_heading_level(match) == acceptance_level
    ]
    if len(peer_matches) > 1:
        section_ranges: list[tuple[int, int]] = []
        for heading_index, heading in peer_matches:
            section_end = len(draft.markdown)
            for later in heading_matches[heading_index + 1 :]:
                if _markdown_heading_level(later) <= acceptance_level:
                    section_end = later.start()
                    break
            section_ranges.append((heading.start(), section_end))
        consolidated = draft.markdown
        for section_start, section_end in reversed(section_ranges[1:]):
            prefix = consolidated[:section_start].rstrip()
            suffix = consolidated[section_end:].lstrip("\n")
            consolidated = prefix + (("\n\n" + suffix) if suffix else "")
        draft = draft.model_copy(update={"markdown": consolidated})
        heading_matches = list(_MARKDOWN_HEADING.finditer(draft.markdown))
        peer_matches = [
            (index, match)
            for index, match in enumerate(heading_matches)
            if _markdown_heading_level(match) == acceptance_level
            and "acceptance criteria"
            in _markdown_heading_identities(
                match.group(1), artifact_type=context.artifact_type
            )
        ]
    if len(peer_matches) != 1:
        return draft

    heading_index, heading = peer_matches[0]
    heading_level = _markdown_heading_level(heading)
    section_end = len(draft.markdown)
    for later in heading_matches[heading_index + 1 :]:
        if _markdown_heading_level(later) <= heading_level:
            section_end = later.start()
            break

    criterion_level = min(heading_level + 1, 6)
    rows: list[str] = []
    for criterion in context.accepted_acceptance_criteria:
        rows.extend(
            [
                f"{'#' * criterion_level} `{criterion.id}`",
                "",
                f"- **Given** {criterion.given}",
                f"- **When** {criterion.when}",
                f"- **Then** {criterion.then}",
                "- **Supports** "
                + ", ".join(
                    f"`{requirement_id}`" for requirement_id in criterion.supports
                ),
                "",
            ]
        )
    canonical_body = "\n".join(rows).rstrip()
    suffix = draft.markdown[section_end:].lstrip("\n")
    repaired = draft.markdown[: heading.end()].rstrip() + "\n\n" + canonical_body
    if suffix:
        repaired += "\n\n" + suffix
    if repaired == draft.markdown:
        return draft
    return draft.model_copy(update={"markdown": repaired})


def _projection_evidence_defects(
    context: SynthesisContext,
    markdown: str,
    *,
    preserve_duplicate_occurrences: bool = False,
) -> list[str]:
    return _deterministic_evidence_integrity_defects(
        markdown,
        context.allowed_claim_texts,
        artifact_type=context.artifact_type,
        immutable_gap_labels=context.required_gap_labels,
        unresolved_evidence_requirements=context.unresolved_evidence_requirements,
        defect_limit=None,
        excerpt_limit=None,
        preserve_duplicate_occurrences=preserve_duplicate_occurrences,
    )


def _project_statutory_locator_tables(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Keep declaration tables while demoting unsupported legal locators."""

    if (
        context.artifact_type == "launch_authorization"
        or context.evidence_readiness == "blocked"
    ):
        return draft
    current = draft.markdown
    for _pass in range(max(1, len(current.splitlines()))):
        lines = current.splitlines()
        fenced_indexes = _fenced_markdown_line_indexes(current)
        changed = False
        before_defects = _projection_evidence_defects(
            context, current, preserve_duplicate_occurrences=True
        )
        for header_index, header_line in enumerate(lines[:-1]):
            if (
                header_index in fenced_indexes
                or header_index + 1 in fenced_indexes
                or "|" not in header_line
                or "\\|" in header_line
            ):
                continue
            header_cells = [
                cell.strip() for cell in header_line.strip().strip("|").split("|")
            ]
            separator_cells = [
                cell.strip()
                for cell in lines[header_index + 1].strip().strip("|").split("|")
            ]
            if len(header_cells) < 2 or len(separator_cells) != len(header_cells):
                continue
            if not all(
                re.fullmatch(r":?-{3,}:?", cell) is not None for cell in separator_cells
            ):
                continue
            locator_indexes = [
                index
                for index, cell in enumerate(header_cells)
                if _STATUTORY_LOCATOR_COLUMN.search(cell) is not None
            ]
            if len(locator_indexes) != 1:
                continue
            locator_index = locator_indexes[0]
            if (
                locator_index == 0
                or "unverified" in header_cells[locator_index].casefold()
            ):
                continue

            trial_lines = [*lines]
            trial_headers = [*header_cells]
            trial_headers[locator_index] = _PROJECTED_STATUTORY_LOCATOR_HEADER
            trial_lines[header_index] = "| " + " | ".join(trial_headers) + " |"
            row_index = header_index + 2
            table_invalid = False
            while row_index < len(lines) and lines[row_index].strip().startswith("|"):
                if row_index in fenced_indexes or "\\|" in lines[row_index]:
                    table_invalid = True
                    break
                row = [
                    cell.strip()
                    for cell in lines[row_index].strip().strip("|").split("|")
                ]
                if len(row) != len(header_cells):
                    table_invalid = True
                    break
                locator = row[locator_index]
                raw_marker_ids = [
                    match.group(1) for match in _RAW_EVIDENCE_MARKER.finditer(locator)
                ]
                if any(
                    claim_id not in context.allowed_claim_texts
                    or re.fullmatch(r"[a-f0-9]{64}", claim_id) is None
                    for claim_id in raw_marker_ids
                ):
                    table_invalid = True
                    break
                markerless_locator = re.sub(
                    r"\s+", " ", _RAW_EVIDENCE_MARKER.sub("", locator)
                ).strip()
                if not _is_pure_statutory_locator(markerless_locator):
                    table_invalid = True
                    break
                row[locator_index] = markerless_locator
                target_index = locator_index - 1
                if target_index >= 0:
                    target = _RAW_EVIDENCE_MARKER.sub("", row[target_index]).strip()
                    existing_target_ids = {
                        match.group(1)
                        for match in _RAW_EVIDENCE_MARKER.finditer(row[target_index])
                    }
                    retained_markers = []
                    for claim_id in raw_marker_ids:
                        if claim_id in existing_target_ids:
                            continue
                        claim_text = context.allowed_claim_texts[claim_id]
                        if not _assertions_share_explicit_polarity(target, claim_text):
                            continue
                        if _precision_values(target).difference(
                            _precision_values(claim_text)
                        ):
                            continue
                        target_tokens = _expanded_support_tokens(target)
                        claim_tokens = _expanded_support_tokens(claim_text)
                        if not target_tokens or not target_tokens.issubset(
                            claim_tokens
                        ):
                            continue
                        if not _claims_align_with_assertion(
                            target, [claim_text], minimum_matches=2
                        ):
                            continue
                        retained_markers.append(f"[evidence:{claim_id}]")
                    if retained_markers:
                        row[target_index] = (
                            row[target_index].rstrip()
                            + " "
                            + " ".join(retained_markers)
                        )
                trial_lines[row_index] = "| " + " | ".join(row) + " |"
                row_index += 1
            if table_invalid:
                continue

            trial = "\n".join(trial_lines)
            trial_defects = _projection_evidence_defects(
                context, trial, preserve_duplicate_occurrences=True
            )
            if len(trial_defects) >= len(before_defects):
                continue
            if set(trial_defects).difference(before_defects):
                continue
            if set(_deterministic_structural_integrity_defects(trial)).difference(
                _deterministic_structural_integrity_defects(current)
            ):
                continue
            if set(_incomplete_given_when_then_acceptance_blocks(trial)).difference(
                _incomplete_given_when_then_acceptance_blocks(current)
            ):
                continue
            current = trial
            changed = True
            break
        if not changed:
            break
    return (
        draft
        if current == draft.markdown
        else draft.model_copy(update={"markdown": current})
    )


def _is_pure_review_authority(value: str) -> bool:
    if (
        not value
        or len(value) > 500
        or re.search(r"[;!?]|\.\s+\S", value) is not None
        or _ACTION_ASSERTED_TAIL.search(value) is not None
        or _REVIEW_COORDINATED_TAIL.search(value) is not None
        or _REVIEW_AUTHORITY_TERMINAL.search(value) is None
        or re.search(
            r"\b(?:regulation|directive|decision|act|code|statute|authority|"
            r"board|agency|pta)\b|§",
            value,
            re.IGNORECASE,
        )
        is None
    ):
        return False
    words = re.findall(r"[^\W\d_]+", value, flags=re.UNICODE)
    return all(
        word.casefold() in _REVIEW_AUTHORITY_LOWERCASE_WORDS
        or word[:1].isupper()
        or word.isupper()
        for word in words
    )


def _project_pre_adoption_review_conditions(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Replace an unsupported authority citation in a When clause with a review step."""

    if (
        context.artifact_type == "launch_authorization"
        or context.evidence_readiness == "blocked"
    ):
        return draft
    current = draft.markdown
    for _pass in range(max(1, len(current.splitlines()))):
        lines = current.splitlines()
        fenced_indexes = _fenced_markdown_line_indexes(current)
        before_defects = _projection_evidence_defects(
            context, current, preserve_duplicate_occurrences=True
        )
        changed = False
        for index, line in enumerate(lines):
            if index in fenced_indexes:
                continue
            match = _REVIEW_AGAINST_AUTHORITY.match(line)
            if match is None or _RAW_EVIDENCE_MARKER.search(line) is not None:
                continue
            authority = match.group("authority").strip().rstrip(".,")
            if not _is_pure_review_authority(authority):
                # The projection may remove only the unsupported authority locator,
                # never a coordinated business or publication action in the same line.
                continue
            inflection = (
                "undergoes" if match.group("verb").casefold() == "is" else "undergo"
            )
            replacement = (
                f"{match.group('prefix')}{match.group('subject').strip()} {inflection} "
                "the pre-adoption legal and regulatory review defined in this artifact."
            )
            trial_lines = [*lines]
            trial_lines[index] = replacement
            trial = "\n".join(trial_lines)
            trial_defects = _projection_evidence_defects(
                context, trial, preserve_duplicate_occurrences=True
            )
            if len(trial_defects) >= len(before_defects):
                continue
            if set(trial_defects).difference(before_defects):
                continue
            if set(_incomplete_given_when_then_acceptance_blocks(trial)).difference(
                _incomplete_given_when_then_acceptance_blocks(current)
            ):
                continue
            if set(_deterministic_structural_integrity_defects(trial)).difference(
                _deterministic_structural_integrity_defects(current)
            ):
                continue
            current = trial
            changed = True
            break
        if not changed:
            break
    return (
        draft
        if current == draft.markdown
        else draft.model_copy(update={"markdown": current})
    )


def _project_redundant_unsupported_gate_diagrams(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Repair only a marker-free gate diagram whose labels repeat in adjacent prose."""

    if (
        context.artifact_type == "launch_authorization"
        or context.evidence_readiness == "blocked"
    ):
        return draft
    current = draft.markdown
    lines = current.splitlines()
    index = 0
    while index < len(lines):
        opening = re.match(r"^\s*(`{3,}|~{3,})", lines[index])
        if opening is None:
            index += 1
            continue
        marker = opening.group(1)[0]
        marker_length = len(opening.group(1))
        end = next(
            (
                later
                for later in range(index + 1, len(lines))
                if (
                    (closing := re.match(r"^\s*(`{3,}|~{3,})", lines[later]))
                    is not None
                    and closing.group(1)[0] == marker
                    and len(closing.group(1)) >= marker_length
                )
            ),
            None,
        )
        if end is None:
            break
        body = "\n".join(lines[index + 1 : end])
        gate_labels = _FENCED_GATE_LABEL.findall(body)
        following_gate_lines = [
            line
            for line in lines[end + 1 : min(len(lines), end + 31)]
            if _NUMBERED_GATE_LINE.search(line) is not None
        ]
        duplicated_in_order = (
            len(gate_labels) >= 2
            and len(following_gate_lines) >= len(gate_labels)
            and all(
                len(_support_tokens(label).intersection(_support_tokens(following)))
                >= 2
                for label, following in zip(
                    gate_labels,
                    following_gate_lines[: len(gate_labels)],
                    strict=True,
                )
            )
        )
        if (
            _ASCII_DECISION_DIAGRAM.search(body) is None
            or _RAW_EVIDENCE_MARKER.search(body) is not None
            or not duplicated_in_order
        ):
            index = end + 1
            continue
        body_lines = lines[index + 1 : end]

        def server_wrapped(line: str) -> bool:
            return (
                _SERVER_UNVERIFIED_VALIDATION_TARGET.fullmatch(
                    re.sub(r"[*_`]", "", line).strip()
                )
                is not None
            )

        substantive_extra_lines = []
        for line in body_lines:
            without_gate_labels = _FENCED_GATE_LABEL.sub("", line)
            without_connectors = _ASCII_DECISION_DIAGRAM.sub("", without_gate_labels)
            if _support_tokens(without_connectors):
                substantive_extra_lines.append(line)
        if substantive_extra_lines and all(
            server_wrapped(line) for line in body_lines if line.strip()
        ):
            index = end + 1
            continue
        if substantive_extra_lines:
            trial_lines = [*lines]
            prefix = (
                "Validation target (all following content is unverified until "
                "pre-adoption review): "
            )
            for body_index in range(index + 1, end):
                original = lines[body_index]
                if not original.strip() or server_wrapped(original):
                    continue
                indentation = original[: len(original) - len(original.lstrip())]
                trial_lines[body_index] = indentation + prefix + original.strip()
        else:
            trial_lines = [*lines[:index], *lines[end + 1 :]]
        trial = "\n".join(trial_lines)
        before_defects = _projection_evidence_defects(
            context, current, preserve_duplicate_occurrences=True
        )
        trial_defects = _projection_evidence_defects(
            context, trial, preserve_duplicate_occurrences=True
        )
        before_substantive, before_practical = _deterministic_quality_defects(
            current,
            practical_output_required=context.practical_output_required,
            artifact_type=context.artifact_type,
            reader_output=context.reader_output,
        )
        trial_substantive, trial_practical = _deterministic_quality_defects(
            trial,
            practical_output_required=context.practical_output_required,
            artifact_type=context.artifact_type,
            reader_output=context.reader_output,
        )
        if (
            len(trial_defects) >= len(before_defects)
            or set(trial_defects).difference(before_defects)
            or set(trial_substantive).difference(before_substantive)
            or set(trial_practical).difference(before_practical)
            or set(_deterministic_structural_integrity_defects(trial)).difference(
                _deterministic_structural_integrity_defects(current)
            )
            or set(_incomplete_given_when_then_acceptance_blocks(trial)).difference(
                _incomplete_given_when_then_acceptance_blocks(current)
            )
        ):
            index = end + 1
            continue
        lines = trial_lines
        current = trial
    return (
        draft
        if current == draft.markdown
        else draft.model_copy(update={"markdown": current})
    )


def _publication_unknown_item(fragment: str) -> str | None:
    """Turn one exact task-stage wrapper into an honest reader-facing gap item."""

    match = _SERVER_UNVERIFIED_VALIDATION_TARGET_PARTS.fullmatch(fragment)
    if match is None:
        return None
    body = match.group("body").strip()
    if not body:
        return None
    return (
        f"{match.group('list') or ''}{match.group('role_prefix') or ''}"
        "Unknown pending evidence (the complete following item is unverified and not "
        f"approved for execution): {body}"
    )


def _publication_unknown_item_inline(fragment: str) -> str:
    """Normalize an exact wrapper at the end of a larger rendering unit."""

    match = _SERVER_UNVERIFIED_VALIDATION_TARGET_INLINE.search(fragment)
    if match is None:
        return fragment
    body = match.group("body").strip()
    if not body:
        return fragment
    unknown_item = (
        "Unknown pending evidence (the complete following item is unverified and not "
        f"approved for execution): {body}"
    )
    return fragment[: match.start()] + unknown_item


def _project_server_validation_scaffolding(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Remove exact internal wrappers without weakening the publication validator."""

    if (
        context.artifact_type == "launch_authorization"
        or context.evidence_readiness == "blocked"
    ):
        return draft
    current = draft.markdown
    lines = current.splitlines()
    fenced_indexes = _fenced_markdown_line_indexes(current)
    changed = False
    for line_index, line in enumerate(lines):
        if line_index in fenced_indexes:
            continue
        is_table_line = "|" in line
        units = line.split("|") if is_table_line else [line]
        trial_units = [*units]
        line_changed = False
        for unit_index, unit in enumerate(units):
            pieces = re.split(r"(<br\s*/?>)", unit, flags=re.IGNORECASE)
            trial_pieces = [*pieces]
            for piece_index in range(0, len(pieces), 2):
                replacement = _publication_unknown_item(pieces[piece_index])
                if replacement is not None:
                    trial_pieces[piece_index] = replacement
                    line_changed = True
                    continue
                replacement = _publication_unknown_item_inline(pieces[piece_index])
                if replacement != pieces[piece_index]:
                    trial_pieces[piece_index] = replacement
                    line_changed = True
            if line_changed:
                trial_units[unit_index] = "".join(trial_pieces)
        if line_changed:
            lines[line_index] = "|".join(trial_units)
            changed = True
    if not changed:
        return draft
    projected = "\n".join(lines)
    if set(_deterministic_structural_integrity_defects(projected)).difference(
        _deterministic_structural_integrity_defects(current)
    ) or set(_incomplete_given_when_then_acceptance_blocks(projected)).difference(
        _incomplete_given_when_then_acceptance_blocks(current)
    ):
        return draft
    return draft.model_copy(update={"markdown": projected})


def _project_fenced_ascii_roadmaps(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Convert a recognized numbered ASCII roadmap into ordinary Markdown."""

    if (
        context.artifact_type == "launch_authorization"
        or context.evidence_readiness == "blocked"
    ):
        return draft
    current = draft.markdown
    lines = current.splitlines()
    index = 0
    while index < len(lines):
        opening = re.match(r"^\s*(`{3,}|~{3,})", lines[index])
        if opening is None:
            index += 1
            continue
        marker = opening.group(1)[0]
        marker_length = len(opening.group(1))
        end = next(
            (
                later
                for later in range(index + 1, len(lines))
                if (
                    (closing := re.match(r"^\s*(`{3,}|~{3,})", lines[later]))
                    is not None
                    and closing.group(1)[0] == marker
                    and len(closing.group(1)) >= marker_length
                )
            ),
            None,
        )
        if end is None:
            break
        body = "\n".join(lines[index + 1 : end])
        labels = [
            (int(match.group(2)), re.sub(r"\s+", " ", match.group(1)).strip())
            for match in _FENCED_ROADMAP_LABEL.finditer(body)
        ]
        is_ascii_table = (
            "|" in body and re.search(r"(?m)^\s*\+[-+]{3,}\+\s*$", body) is not None
        )
        table_recognized = (
            is_ascii_table
            and _ASCII_DECISION_DIAGRAM.search(body) is not None
            and _RAW_EVIDENCE_MARKER.search(body) is None
            and len(labels) >= 2
            and len(re.findall(r"\[[^\]]+\]", body)) == len(labels)
        )
        tree_periods = [
            match
            for line in body.splitlines()
            if (match := _FENCED_TREE_ROADMAP_PERIOD.fullmatch(line)) is not None
        ]
        tree_activities = [
            match
            for line in body.splitlines()
            if (match := _FENCED_TREE_ROADMAP_ACTIVITY.fullmatch(line)) is not None
        ]
        tree_numbers = sorted({int(match.group(2)) for match in tree_periods})
        tree_lines_are_bounded = all(
            not line.strip()
            or _FENCED_TREE_ROADMAP_PERIOD.fullmatch(line) is not None
            or _FENCED_TREE_ROADMAP_ACTIVITY.fullmatch(line) is not None
            for line in body.splitlines()
        )
        tree_recognized = (
            _ASCII_DECISION_DIAGRAM.search(body) is not None
            and _RAW_EVIDENCE_MARKER.search(body) is None
            and len(tree_periods) >= 2
            and len(tree_activities) >= 2
            and tree_numbers == list(range(1, max(tree_numbers) + 1))
            and tree_lines_are_bounded
        )
        recognized = table_recognized or tree_recognized
        if not recognized:
            index = end + 1
            continue
        replacement: list[str] = []
        retained_semantic_lines: list[str] = []
        for body_line in body.splitlines():
            stripped = body_line.strip()
            if not stripped or re.fullmatch(r"\+[-+]+\+", stripped) is not None:
                continue
            if tree_recognized:
                period = _FENCED_TREE_ROADMAP_PERIOD.fullmatch(body_line)
                if period is not None:
                    retained_semantic_lines.append(period.group(1))
                    replacement.append(f"- **{period.group(1)}**")
                    continue
                activity = _FENCED_TREE_ROADMAP_ACTIVITY.fullmatch(body_line)
                if activity is not None:
                    retained_semantic_lines.append(activity.group(1))
                    replacement.append(f"  - {activity.group(1)}")
                    continue
            content = stripped.strip("|").strip()
            if not content or re.fullmatch(r"[|vV^<>+\-=\s]+", content) is not None:
                continue
            retained_semantic_lines.append(content)
            if _FENCED_ROADMAP_LABEL.search(content) is not None:
                rendered = _FENCED_ROADMAP_LABEL.sub(
                    lambda match: "**"
                    + re.sub(r"\s+", " ", match.group(1)).strip()
                    + "**",
                    content,
                )
                replacement.append(f"- {rendered}")
                continue
            if _FENCED_ROADMAP_ACTIVITY.search(content) is not None:
                replacement.append(
                    "- Unknown pending evidence (the complete following item is "
                    "unverified and not approved for execution): " + content
                )
                continue
            replacement.append(f"**{content}**")
        if not replacement:
            index = end + 1
            continue
        retained_tokens = _support_tokens("\n".join(retained_semantic_lines))
        projected_tokens = _support_tokens("\n".join(replacement))
        if retained_tokens.difference(projected_tokens):
            index = end + 1
            continue
        trial_lines = [*lines[:index], *replacement, *lines[end + 1 :]]
        trial = "\n".join(trial_lines)
        before_evidence = _projection_evidence_defects(
            context, current, preserve_duplicate_occurrences=True
        )
        trial_evidence = _projection_evidence_defects(
            context, trial, preserve_duplicate_occurrences=True
        )
        before_substantive, before_practical = _deterministic_quality_defects(
            current,
            practical_output_required=context.practical_output_required,
            artifact_type=context.artifact_type,
            reader_output=context.reader_output,
        )
        trial_substantive, trial_practical = _deterministic_quality_defects(
            trial,
            practical_output_required=context.practical_output_required,
            artifact_type=context.artifact_type,
            reader_output=context.reader_output,
        )
        ascii_defect = (
            "The candidate uses an ASCII-art table inside a code fence instead of "
            "valid Markdown."
        )

        def evidence_signature(defect: str) -> tuple[str, ...]:
            _prefix, separator, excerpt = defect.partition(": ")
            return tuple(sorted(_support_tokens(excerpt if separator else defect)))

        evidence_regressed = (
            bool(set(trial_evidence).difference(before_evidence))
            if not tree_recognized
            else bool(
                Counter(map(evidence_signature, trial_evidence))
                - Counter(map(evidence_signature, before_evidence))
            )
        )
        if (
            evidence_regressed
            or set(trial_substantive).difference(before_substantive)
            or set(trial_practical).difference(before_practical)
            or (not tree_recognized and ascii_defect not in before_substantive)
            or ascii_defect in trial_substantive
            or set(_deterministic_structural_integrity_defects(trial)).difference(
                _deterministic_structural_integrity_defects(current)
            )
            or set(_incomplete_given_when_then_acceptance_blocks(trial)).difference(
                _incomplete_given_when_then_acceptance_blocks(current)
            )
        ):
            index = end + 1
            continue
        lines = trial_lines
        current = trial
        index += len(replacement)
    return (
        draft
        if current == draft.markdown
        else draft.model_copy(update={"markdown": current})
    )


def _as_publication_unknown_item(fragment: str) -> str:
    """Preserve one defect-bearing unit while making its status unambiguous."""

    list_prefix, role_prefix, _role, body = _task_fragment_parts(fragment)
    body = body.strip()
    return (
        f"{list_prefix}{role_prefix}"
        "Unknown pending evidence (the complete following item is unverified and not "
        f"approved for execution): {body}"
    )


def _project_remaining_evidence_defects(
    context: SynthesisContext,
    draft: SynthesisDraft,
    *,
    defect_selector: Callable[[str], bool] | None = None,
) -> SynthesisDraft:
    """Reclassify only exact residual defect units for a strict final fallback."""

    if (
        context.artifact_type == "launch_authorization"
        or context.evidence_readiness == "blocked"
    ):
        return draft
    current = draft.markdown
    for _pass in range(max(1, len(current.splitlines()) * 2)):
        defects = _projection_evidence_defects(
            context, current, preserve_duplicate_occurrences=True
        )
        if defect_selector is not None:
            defects = [defect for defect in defects if defect_selector(defect)]
        excerpts = [
            excerpt
            for defect in defects
            for _prefix, separator, excerpt in [defect.partition(": ")]
            if separator and excerpt
        ]
        if not excerpts:
            break
        normalized_excerpts = {
            re.sub(r"\s+", " ", excerpt).strip() for excerpt in excerpts
        }
        lines = current.splitlines()
        fenced_indexes = _fenced_markdown_line_indexes(current)
        before_topology = _final_repair_topology(current)
        before_structural = _deterministic_structural_integrity_defects(current)
        before_gwt = _incomplete_given_when_then_acceptance_blocks(current)
        before_substantive, before_practical = _deterministic_quality_defects(
            current,
            practical_output_required=context.practical_output_required,
            artifact_type=context.artifact_type,
            reader_output=context.reader_output,
        )
        changed = False
        for line_index, line in enumerate(lines):
            if line_index in fenced_indexes:
                continue
            stripped_line = line.strip()
            if not stripped_line or _MARKDOWN_HEADING.fullmatch(stripped_line):
                continue
            is_table_line = "|" in line
            units = line.split("|") if is_table_line else [line]
            for unit_index, unit in enumerate(units):
                pieces = re.split(r"(<br\s*/?>)", unit, flags=re.IGNORECASE)
                for piece_index in range(0, len(pieces), 2):
                    piece = pieces[piece_index]
                    if _RAW_EVIDENCE_MARKER.search(piece) is not None:
                        continue
                    fragments = _evidence_clause_fragments(piece.strip())
                    parsed_candidates = [
                        candidate
                        for fragment in fragments
                        for candidate in (
                            _split_unresolved_assertions(fragment)
                            if _UNRESOLVED_AUTHORITY_QUALIFIER.search(fragment)
                            else [fragment.strip()]
                        )
                        if candidate
                    ]
                    candidates = [
                        *[
                            fragment
                            for fragment in fragments
                            if any(excerpt in fragment for excerpt in excerpts)
                        ],
                        *[excerpt for excerpt in excerpts if excerpt in piece],
                        *parsed_candidates,
                    ]
                    for candidate in candidates:
                        normalized = re.sub(r"\s+", " ", candidate).strip()
                        if not any(
                            excerpt == normalized or excerpt in normalized
                            for excerpt in normalized_excerpts
                        ):
                            continue
                        candidate_index = piece.find(candidate)
                        if candidate_index < 0:
                            continue
                        replacement = _as_publication_unknown_item(candidate)
                        trial_pieces = [*pieces]
                        trial_pieces[piece_index] = (
                            piece[:candidate_index]
                            + replacement
                            + piece[candidate_index + len(candidate) :]
                        )
                        trial_units = [*units]
                        trial_units[unit_index] = "".join(trial_pieces)
                        trial_lines = [*lines]
                        trial_lines[line_index] = "|".join(trial_units)
                        trial = "\n".join(trial_lines)
                        trial_defects = _projection_evidence_defects(
                            context,
                            trial,
                            preserve_duplicate_occurrences=True,
                        )
                        if defect_selector is not None:
                            trial_defects = [
                                defect
                                for defect in trial_defects
                                if defect_selector(defect)
                            ]
                        trial_substantive, trial_practical = (
                            _deterministic_quality_defects(
                                trial,
                                practical_output_required=(
                                    context.practical_output_required
                                ),
                                artifact_type=context.artifact_type,
                                reader_output=context.reader_output,
                            )
                        )
                        if (
                            len(trial_defects) >= len(defects)
                            or Counter(trial_defects) - Counter(defects)
                            or _final_repair_topology_defects(before_topology, trial)
                            or set(
                                _deterministic_structural_integrity_defects(trial)
                            ).difference(before_structural)
                            or set(
                                _incomplete_given_when_then_acceptance_blocks(trial)
                            ).difference(before_gwt)
                            or set(trial_substantive).difference(before_substantive)
                            or set(trial_practical).difference(before_practical)
                        ):
                            continue
                        current = trial
                        changed = True
                        break
                    if changed:
                        break
                if changed:
                    break
            if changed:
                break
        if not changed:
            break
    return (
        draft
        if current == draft.markdown
        else draft.model_copy(update={"markdown": current})
    )


def _project_strict_final_fallback(
    context: SynthesisContext, projected: SynthesisDraft
) -> SynthesisDraft:
    """Build a conservative fallback while keeping normal validation authoritative."""

    fallback = _with_canonical_acceptance_criteria(context, projected)
    fallback = _project_server_validation_scaffolding(context, fallback)
    fallback = _project_fenced_ascii_roadmaps(context, fallback)
    fallback = _project_remaining_evidence_defects(context, fallback)
    fallback = _with_immutable_gap_labels(context, fallback)
    fallback = _with_accepted_requirement_traceability(context, fallback)
    return SynthesisDraft.model_validate(fallback)


def _without_empty_noncontract_subheadings(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Remove empty optional subheadings from the bounded final fallback.

    The immutable core artifact is not changed. Required contract headings and every
    level-two section remain authoritative; this only removes a level-three-or-deeper
    presentation label whose section has no substantive body. Capturing repair topology
    after this normalization lets a useful strict projection survive an exhausted model
    repair without inventing replacement prose.
    """

    lines = draft.markdown.splitlines()
    fenced_indexes = _fenced_markdown_line_indexes(draft.markdown)
    required_identities = {
        identity
        for section in context.required_sections
        for identity in _required_section_identities(
            section, artifact_type=context.artifact_type
        )
    }
    removable: set[int] = set()
    headings: list[tuple[int, int, str]] = []
    for index, line in enumerate(lines):
        if index in fenced_indexes:
            continue
        match = _MARKDOWN_HEADING.fullmatch(line.strip())
        if match is None:
            continue
        headings.append((index, _markdown_heading_level(line), match.group(1).strip()))

    for position, (line_index, level, raw_name) in enumerate(headings):
        if level < 3 or _markdown_heading_identities(
            raw_name, artifact_type=context.artifact_type
        ).intersection(required_identities):
            continue
        body_end = len(lines)
        for later_index, later_level, _later_name in headings[position + 1 :]:
            if later_level <= level:
                body_end = later_index
                break
        section_body = "\n".join(lines[line_index + 1 : body_end])
        section_body = _MARKDOWN_HEADING.sub("", section_body)
        if not re.search(r"\b[\w'-]+\b", section_body):
            removable.add(line_index)

    if not removable:
        return draft
    markdown = "\n".join(
        line for index, line in enumerate(lines) if index not in removable
    )
    return draft.model_copy(update={"markdown": markdown})


def _with_normalized_task_requirement_coverage(
    context: SynthesisContext, draft: TaskDraft
) -> TaskDraft:
    """Bind task coverage to the accepted plan without retrying model metadata."""

    expected = context.acceptance_requirement_ids
    by_requirement_id: dict[str, list[RequirementCoverageV1]] = {}
    for item in draft.requirement_coverage:
        if item.requirement_id in expected:
            by_requirement_id.setdefault(item.requirement_id, []).append(item)
    normalized: list[RequirementCoverageV1] = []
    for requirement_id in expected:
        candidates = by_requirement_id.get(requirement_id, [])
        gap = next((item for item in candidates if item.status == "gap"), None)
        statuses = {item.status for item in candidates}
        if gap is not None:
            normalized.append(gap)
        elif len(statuses) == 1:
            normalized.append(candidates[0])
        elif candidates:
            normalized.append(
                RequirementCoverageV1(
                    requirement_id=requirement_id,
                    status="gap",
                    note=(
                        "Conflicting duplicate coverage statuses were returned for this "
                        "accepted-plan requirement; retain it as an open gap."
                    ),
                )
            )
        else:
            normalized.append(
                RequirementCoverageV1(
                    requirement_id=requirement_id,
                    status="gap",
                    note=(
                        "The specialist output did not explicitly cover this accepted-plan "
                        "requirement; retain it as an open gap for downstream synthesis."
                    ),
                )
            )
    if normalized == draft.requirement_coverage:
        return draft
    return draft.model_copy(update={"requirement_coverage": normalized})


def _with_task_evidence_status_section(
    context: SynthesisContext, draft: TaskDraft
) -> TaskDraft:
    """Make inherited non-ready status explicit when a specialist omitted the heading."""

    if context.evidence_readiness != "ready_with_gaps":
        return draft
    headings = {
        identity
        for _, raw_name, _ in _markdown_headings(draft.markdown)
        for identity in _markdown_heading_identities(
            raw_name, artifact_type=context.artifact_type
        )
    }
    if any(_is_evidence_status_heading(heading) for heading in headings):
        return draft
    return draft.model_copy(
        update={
            "markdown": "\n".join(
                [
                    draft.markdown.rstrip(),
                    "",
                    "## Evidence gaps and assumptions",
                    "",
                    "- This specialist packet inherits unresolved evidence gaps. It is "
                    "planning input only and does not establish launch, legal, safety, "
                    "certification, or market clearance.",
                ]
            )
        }
    )


def _project_strict_task_fallback(
    context: SynthesisContext, draft: TaskDraft
) -> TaskDraft:
    """Reclassify residual unsupported task prose while preserving typed task facts."""

    if (
        context.purpose != "execute_task"
        or context.required_sections
        or context.artifact_type == "launch_authorization"
        or context.evidence_readiness == "blocked"
    ):
        return draft
    projected = _project_remaining_evidence_defects(
        context,
        SynthesisDraft(title=draft.title, markdown=draft.markdown),
        defect_selector=_is_hard_task_evidence_defect,
    )
    if projected.markdown == draft.markdown:
        return draft
    return draft.model_copy(update={"markdown": projected.markdown})


def _without_model_owned_task_appendix(
    draft: TaskDraft | SynthesisDraft,
) -> TaskDraft | SynthesisDraft:
    """Drop model-authored source sections; the server owns the exact appendix."""

    lines = draft.markdown.splitlines()
    fenced_indexes = _fenced_markdown_line_indexes(draft.markdown)
    headings: list[tuple[int, int, str]] = []
    for index, line in enumerate(lines):
        if index in fenced_indexes:
            continue
        match = _MARKDOWN_HEADING.fullmatch(line.strip())
        if match is None:
            continue
        headings.append((index, _markdown_heading_level(match), match.group(1).strip()))

    removed: set[int] = set()
    for heading_index, (start, level, name) in enumerate(headings):
        if not _is_server_owned_source_heading(name, rendered=True):
            continue
        end = len(lines)
        for later_start, later_level, _later_name in headings[heading_index + 1 :]:
            if later_level <= level:
                end = later_start
                break
        removed.update(range(start, end))
    if not removed:
        return draft
    markdown = "\n".join(
        line for index, line in enumerate(lines) if index not in removed
    ).strip()
    if not markdown:
        markdown = (
            "# Task draft\n\n"
            "No substantive task content remained after removing the model-authored "
            "source appendix."
        )
    return draft.model_copy(update={"markdown": markdown})


def _without_unbound_task_evidence_markers(
    context: SynthesisContext, draft: TaskDraft | SynthesisDraft
) -> TaskDraft | SynthesisDraft:
    """Remove malformed or foreign markers while preserving the draft for evaluation."""

    allowed = set(context.allowed_claim_ids)
    heading_positions = [
        position for position, _name, _folded in _markdown_headings(draft.markdown)
    ]
    first_heading = min(heading_positions) if heading_positions else len(draft.markdown)

    def replace(marker: re.Match[str]) -> str:
        claim_id = marker.group(1)
        if (
            marker.start() > first_heading
            and _EVIDENCE_CLAIM_ID.fullmatch(claim_id) is not None
            and claim_id in allowed
        ):
            return marker.group(0)
        return ""

    markdown = _RAW_EVIDENCE_MARKER.sub(replace, draft.markdown)
    return (
        draft
        if markdown == draft.markdown
        else draft.model_copy(update={"markdown": markdown})
    )


def _project_reader_output_draft(
    draft: SynthesisDraft, reader_output: ReaderOutputContractV1 | None
) -> SynthesisDraft:
    """Project a direct checklist to its requested reader-facing artifact.

    Analysis, traceability, and evidence disclosure remain typed/server-owned data. For a
    checklist contract the publication body is its title plus the model-authored checkbox
    items; the server appends any required disclosures after this measured body.
    """

    if reader_output is None or reader_output.reader_format.value != "checklist":
        return draft
    checklist_items = _TOP_LEVEL_MARKDOWN_CHECKLIST_ITEM.findall(draft.markdown)
    if not checklist_items:
        return draft
    heading = f"# {draft.title.strip()}"
    prior_lines = draft.markdown[: draft.markdown.find(checklist_items[0])].splitlines()
    checklist_headings = [
        match.group(1).strip()
        for line in prior_lines
        if (match := _MARKDOWN_HEADING.fullmatch(line.strip())) is not None
        and _DIRECT_CHECKLIST_TERM.search(match.group(1)) is not None
    ]
    if checklist_headings:
        heading = f"# {checklist_headings[-1]}"
    markdown = "\n\n".join((heading, "\n".join(checklist_items)))
    return draft.model_copy(update={"markdown": markdown})


def _immutable_claim_covers_publication_assertion(
    assertion: str, claim_text: str
) -> bool:
    """Require broad local token coverage, not one or two coincidental words."""

    assertion_tokens = _expanded_support_tokens(assertion)
    claim_tokens = _expanded_support_tokens(claim_text)
    if not assertion_tokens or not claim_tokens:
        return False
    matched = {
        left
        for left in assertion_tokens
        if any(
            left == right
            or (len(left) >= 6 and len(right) >= 6 and left[:6] == right[:6])
            for right in claim_tokens
        )
    }
    minimum_matches = min(2, len(assertion_tokens))
    return (
        len(matched) >= minimum_matches
        and len(matched) * 3 >= len(assertion_tokens) * 2
    )


def _without_mismatched_publication_evidence_markers(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Keep a marker only when its immutable claim supports the local assertion.

    This is deterministic provenance cleanup, not a semantic acceptance gate: an
    unrelated marker is removed and the useful prose remains available for publication.
    """

    def clean_fragment(fragment: str) -> str:
        marker_ids = [
            match.group(1) for match in _RAW_EVIDENCE_MARKER.finditer(fragment)
        ]
        if not marker_ids:
            return fragment
        assertion = _RAW_EVIDENCE_MARKER.sub("", fragment)
        assertion_values = _precision_values(assertion)
        sensitive = bool(
            _EVIDENCE_SENSITIVE_ASSERTION.search(assertion)
            or _NONPROVISIONAL_AUTHORITY_ASSERTION.search(assertion)
            or _materially_matches_unresolved_requirement(
                assertion, context.unresolved_evidence_requirements
            )
        )
        minimum_matches = (
            min(3, max(1, len(_support_tokens(assertion))))
            if _FORMULA_MARKER.search(assertion)
            else min(2, max(1, len(_support_tokens(assertion)))) if sensitive else 1
        )
        retained_ids = [
            claim_id
            for claim_id in marker_ids
            if claim_id in context.allowed_claim_texts
            and _assertions_share_explicit_polarity(
                assertion, context.allowed_claim_texts[claim_id]
            )
            and _immutable_claim_covers_publication_assertion(
                assertion, context.allowed_claim_texts[claim_id]
            )
        ]
        retained_texts = [context.allowed_claim_texts[item] for item in retained_ids]
        collectively_supported = bool(
            retained_texts
        ) and not assertion_values.difference(
            set().union(*(_precision_values(text) for text in retained_texts))
        )
        collectively_supported = (
            collectively_supported
            and _claims_align_with_assertion(
                assertion,
                retained_texts,
                minimum_matches=minimum_matches,
            )
        )
        retained = set(retained_ids if collectively_supported else [])
        cleaned = _RAW_EVIDENCE_MARKER.sub(
            lambda match: match.group(0) if match.group(1) in retained else "",
            fragment,
        )
        return re.sub(r"[ \t]+([.!?;])", r"\1", cleaned)

    lines: list[str] = []
    for line in draft.markdown.splitlines():
        table_units = re.split(r"((?<!\\)\|)", line)
        for unit_index in range(0, len(table_units), 2):
            pieces = re.split(r"(<br\s*/?>)", table_units[unit_index], flags=re.I)
            for piece_index in range(0, len(pieces), 2):
                piece = re.sub(
                    r"(?P<punct>[.!?;])(?P<spacing>[ \t]+)"
                    r"(?P<markers>(?:\[evidence:[^\]\r\n]+\][ \t]*)+)$",
                    lambda match: (
                        f"{match.group('spacing')}{match.group('markers').rstrip()}"
                        f"{match.group('punct')}"
                    ),
                    pieces[piece_index],
                )
                pieces[piece_index] = piece
                for fragment in _evidence_clause_fragments(piece):
                    if _RAW_EVIDENCE_MARKER.search(fragment) is None:
                        continue
                    pieces[piece_index] = pieces[piece_index].replace(
                        fragment, clean_fragment(fragment), 1
                    )
            table_units[unit_index] = "".join(pieces)
        lines.append("".join(table_units))
    markdown = "\n".join(lines)
    return (
        draft
        if markdown == draft.markdown
        else draft.model_copy(update={"markdown": markdown})
    )


def _normalize_reader_draft(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Normalize only the model-authored reader body before server disclosures.

    This boundary owns reader normalization and launch-authority protection. Evidence
    defects remain in the writer's text for validation instead of being reworded.
    Immutable gaps, traceability, evidence status, and Sources are appended later so V2
    presentation measurement never counts server-owned disclosure text.
    """

    prepared = SynthesisDraft.model_validate(draft)
    prepared = SynthesisDraft.model_validate(
        _without_model_owned_task_appendix(prepared)
    )
    # Preserve the writer's citation assertions for the hard validation boundary.
    # Removing a wrong marker here could disguise it as an uncited wording flag.
    if context.purpose != "blocked_report":
        supported = _without_mismatched_publication_evidence_markers(
            context, _without_unbound_task_evidence_markers(context, prepared)
        )
        if (
            [match.group(1) for match in _RAW_EVIDENCE_MARKER.finditer(supported.markdown)]
            != [match.group(1) for match in _RAW_EVIDENCE_MARKER.finditer(prepared.markdown)]
        ):
            raise SynthesisValidationError(
                "publication contains an unbound or locally unsupported evidence marker",
                reason="EVIDENCE_CLAIM_NOT_ALLOWED",
            )
    prepared = prepared.model_copy(
        update={
            "markdown": "\n".join(
                line
                for line in prepared.markdown.splitlines()
                if line.strip() != _PUBLICATION_EVIDENCE_STATUS_BLOCK
            )
        }
    )
    lines: list[str] = []
    for line in prepared.markdown.splitlines():
        heading_line = line.lstrip().startswith("#")
        replacement_prefix = "" if heading_line else "**Pending verification:** "
        cleaned = _SERVER_UNVERIFIED_VALIDATION_TARGET_INLINE.sub(
            lambda match: replacement_prefix + match.group("body"), line
        )
        cleaned = _PUBLICATION_UNKNOWN_PENDING_PREFIX.sub(replacement_prefix, cleaned)
        lines.append(cleaned)
    markdown = "\n".join(lines)

    def replace_overbroad_grounding_claim(match: re.Match[str]) -> str:
        subject = match.group("subject").capitalize()
        if context.evidence_readiness == "ready":
            return (
                f"{subject} carrying exact evidence markers are grounded in immutable "
                "sources; other statements are planning decisions or proposals."
            )
        return (
            f"{subject} combine accepted evidence with explicit unresolved gaps and "
            "are not fully verified."
        )

    markdown = _OVERBROAD_PUBLICATION_GROUNDING_CLAIM.sub(
        replace_overbroad_grounding_claim, markdown
    )
    if not (
        context.evidence_readiness == "ready"
        and context.artifact_type == "launch_authorization"
    ):
        if has_positive_launch_readiness_claim(markdown):
            markdown = _markdown_without_matching_lines(
                markdown, has_positive_launch_readiness_claim
            ).strip()

    return SynthesisDraft.model_validate(
        prepared.model_copy(update={"markdown": markdown})
    )


def _decorate_publication_draft(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Append immutable server-owned disclosure and traceability material."""

    prepared = SynthesisDraft.model_validate(draft)
    prepared = SynthesisDraft.model_validate(
        _with_immutable_gap_labels(context, prepared)
    )
    prepared = SynthesisDraft.model_validate(
        _with_accepted_requirement_traceability(context, prepared)
    )

    if context.evidence_readiness == "ready_with_gaps":
        markdown_lines = prepared.markdown.splitlines()
        if markdown_lines and markdown_lines[0].startswith("# "):
            first, remainder = markdown_lines[0], markdown_lines[1:]
            while remainder and not remainder[0].strip():
                remainder.pop(0)
            markdown_lines = [
                first,
                "",
                _PUBLICATION_EVIDENCE_STATUS_BLOCK,
                "",
                *remainder,
            ]
        else:
            while markdown_lines and not markdown_lines[0].strip():
                markdown_lines.pop(0)
            markdown_lines = [
                _PUBLICATION_EVIDENCE_STATUS_BLOCK,
                "",
                *markdown_lines,
            ]
        prepared = prepared.model_copy(update={"markdown": "\n".join(markdown_lines)})

    return SynthesisDraft.model_validate(prepared)


def _normalize_publication_draft(
    context: SynthesisContext, draft: SynthesisDraft
) -> SynthesisDraft:
    """Apply the complete non-rejecting AxWise publication boundary."""

    reader_draft = _normalize_reader_draft(context, draft)
    reader_draft = _project_reader_output_draft(reader_draft, context.reader_output)
    return _decorate_publication_draft(context, reader_draft)


def _prepare_task_draft_for_execution(
    context: SynthesisContext, draft: TaskDraft
) -> TaskDraft:
    """Prepare a typed draft for lineage without treating it as final publication."""

    prepared = _with_normalized_task_requirement_coverage(context, draft)
    prepared = _with_immutable_gap_labels(context, prepared)
    prepared = _with_task_evidence_status_section(context, prepared)
    prepared = _without_forbidden_task_launch_claim_lines(context, prepared)
    prepared = _without_model_owned_task_appendix(prepared)
    prepared = _without_unbound_task_evidence_markers(context, prepared)
    prepared = _with_accepted_requirement_traceability(context, prepared)
    return TaskDraft.model_validate(prepared)


def _prepare_task_draft_for_validation(
    context: SynthesisContext, draft: TaskDraft
) -> TaskDraft:
    """Compatibility helper for tests and explicit final-candidate validation."""

    prepared = _prepare_task_draft_for_execution(context, draft)
    prepared = _prepare_task_unresolved_actions(
        context,
        prepared,
        allow_composite_authority_targets=True,
    )
    prepared = _project_strict_task_fallback(context, prepared)
    try:
        _validate_task_draft(context, prepared)
    except ValueError as error:
        if not str(error).startswith("task artifact contradicts unresolved evidence"):
            raise
        prepared = _project_strict_task_fallback(context, prepared)
        _validate_task_draft(context, prepared)
    return prepared


def _project_final_repair_base(
    context: SynthesisContext, *, title: str, markdown: str
) -> SynthesisDraft:
    """Create a conservative repair input without weakening publication checks.

    The immutable task artifact remains unchanged. This projection reclassifies only an
    exactly targeted fragment or table cell, preserving headings, IDs, owners, list/table
    topology and Given/When/Then structure. Legal, safety and authority propositions become
    explicit verification actions; other unsupported propositions become unverified
    assumptions. Ambiguous or structurally unsafe matches remain unchanged for the bounded
    model repair. The normal strict synthesis validator remains the publication gate.
    """

    projected = SynthesisDraft(title=title, markdown=markdown)
    projected = _with_immutable_gap_labels(context, projected)
    projected = _project_statutory_locator_tables(context, projected)
    projected = _project_pre_adoption_review_conditions(context, projected)
    projected = _project_redundant_unsupported_gate_diagrams(context, projected)
    projected = _prepare_task_unresolved_actions(
        context, projected, include_generic=True
    )
    projected = _with_immutable_gap_labels(context, projected)
    projected = _with_accepted_requirement_traceability(context, projected)
    return SynthesisDraft.model_validate(projected)


def _deterministic_blocked_report(research: ResearchResultV2) -> SynthesisDraft:
    """Render an immutable no-go fact without another cognitive/provider decision."""

    blocking_findings = sorted(
        (
            finding
            for finding in research.findings
            if finding.status == "conflicting"
            or (finding.blocking and finding.status == "missing")
        ),
        key=lambda finding: finding.requirement_id.encode("utf-16-be"),
    )
    if research.readiness != "blocked" or not blocking_findings:
        raise ValueError("deterministic blocked report requires blocking findings")

    blocking_notes = {finding.note for finding in blocking_findings}
    all_gap_labels = {
        *research.assumptions,
        *research.gaps,
        *research.conflicts,
        *(
            finding.note
            for finding in research.findings
            if finding.status in {"missing", "conflicting"}
        ),
    }
    additional_labels = utf16_ordinal_sorted(all_gap_labels - blocking_notes)
    claims_by_id = {
        claim.claim_id: claim
        for claim in [
            *research.selected_claims,
            *(claim for entry in research.claim_ledger for claim in entry.claims),
        ]
    }
    sourced_claim_ids = {
        claim_id
        for source in research.source_catalogue
        for claim_id in source.supported_claim_ids
    }
    citable_claim_ids = utf16_ordinal_sorted(
        claim_id
        for claim_id, claim in claims_by_id.items()
        if claim_id in sourced_claim_ids
        and not has_positive_launch_readiness_claim(claim.text)
    )

    rows = [
        "# Evidence decision",
        "",
        "The evidence decision is **blocked** and remains a **no-go**. This report records "
        "the immutable evidence state; it is not product clearance, legal approval, a "
        "safety determination, or authorization to launch. Only reversible non-launch "
        "planning may continue while the blocking evidence is unresolved.",
        "",
        "## Blocking findings",
        "",
    ]
    rows.extend(
        f"- **Requirement `{finding.requirement_id}` ({finding.status})** — {finding.note}"
        for finding in blocking_findings
    )
    rows.extend(["", "## Other immutable gaps and assumptions", ""])
    rows.extend(
        (_immutable_gap_bullet(label) for label in additional_labels)
        if additional_labels
        else ["- No additional nonblocking gap or assumption is recorded."]
    )
    if citable_claim_ids:
        chosen_claim_id = citable_claim_ids[0]
        chosen_claim_text = (
            re.sub(r"\s+", " ", claims_by_id[chosen_claim_id].text)
            .strip()
            .replace("[evidence:", "［evidence:")
        )
        rows.extend(
            [
                "",
                "## Immutable supporting context",
                "",
                f"- {chosen_claim_text} [evidence:{chosen_claim_id}]",
                "- This verified context may inform bounded non-launch planning. It does "
                "not resolve the blocking findings or change readiness.",
            ]
        )
    rows.extend(
        [
            "",
            "# Remediation plan",
            "",
            *(
                f"- **Resolve `{finding.requirement_id}`:** obtain and bind authoritative "
                f"evidence that resolves this exact finding: {finding.note}"
                for finding in blocking_findings
            ),
            "- **Validation:** verify evidence identity, applicability, date, scope, "
            "provenance, and any required signatures before reevaluation.",
            "- **Acceptance check:** bind the exact immutable artifact and input hashes to "
            "a new evidence review; general web context cannot substitute for required "
            "product- or organization-specific proof.",
            "- **Conflict control:** if verified evidence conflicts, retain both immutable "
            "records and require the responsible legal or safety owner to resolve them.",
            "- **Execution boundary:** continue only reversible discovery and planning; do "
            "not launch, imply clearance, or represent the product as ready.",
            "- **Decision rule:** reassess only after every applicable blocking requirement "
            "is verified without unresolved conflict. Until then, readiness stays blocked.",
            "",
            "This remediation plan does not change evidence readiness or authorize a "
            "successor workflow stage. A future review must independently validate the new "
            "immutable evidence against the same accepted scope and requirement identifiers.",
        ]
    )
    return SynthesisDraft(
        title="Blocked decision and remediation report",
        markdown="\n".join(rows),
    )
