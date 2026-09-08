"""Markdown structure, acceptance topology and source appendix formatting."""

from __future__ import annotations
import re
from backend.domain.workflow_v2.contracts import (
    EvidenceClaimV1,
    ReaderOutputContractV1,
    ResearchResultV2,
    ResearchSourceV1,
    SourceAppendixEntryV1,
    utf16_ordinal_sorted,
)
from collections import Counter
from typing import Any, Callable, Sequence
from backend.services.workflow_v2.cognitive.models import (
    FinalRepairTopology,
)
from backend.services.workflow_v2.cognitive.policy import (
    _ACCEPTANCE_CRITERIA_SECTION_HEADING,
    _DISPLAY_REQUIREMENT_ID,
    _EVIDENCE_CLAIM_ID,
    _EVIDENCE_STATUS_HEADING,
    _EXPLICIT_ACCEPTANCE_BLOCK_HEADING,
    _FINAL_REPAIR_NUMBERED_LABEL,
    _GIVEN_WHEN_THEN_INLINE_ROLE,
    _GIVEN_WHEN_THEN_ROLE_LINE,
    _IMMUTABLE_GAP_SECTION_HEADINGS,
    _JTBD_LABEL,
    _MARKDOWN_HEADING,
    _MARKDOWN_HEADING_ORDINAL,
    _MARKDOWN_HEADING_TRAILING_QUALIFIER,
    _MARKDOWN_LIST_ITEM,
    _MARKDOWN_TABLE_SEPARATOR_CELL,
    _PRD_REQUIRED_SECTION_ALIASES,
    _RAW_EVIDENCE_MARKER,
    _SERVER_OWNED_SOURCE_HEADING,
    _SOURCE_CLASS_PRIORITY,
    _TASK_FRAGMENT_PREFIX,
    _TOP_LEVEL_MARKDOWN_CHECKLIST_ITEM,
    _TOP_LEVEL_MARKDOWN_ITEM,
)
from backend.services.workflow_v2.cognitive.scope import (
    _normalized_semantic_text,
)


def _markdown_heading_fragments(value: str) -> list[str]:
    """Return bounded semantic labels from one rendered Markdown heading.

    Numbering is presentation, not output-contract semantics. The full label and its
    primary label before one trailing parenthetical are retained. The parenthetical is
    never an independent identity: only explicit PRD aliases may collapse overlapping
    contract sections. We do not use substring or fuzzy matching.
    """

    primary = value.strip().strip("*_`~ ")
    primary = _MARKDOWN_HEADING_ORDINAL.sub("", primary, count=1).strip()
    primary = primary.strip("*_`~ ")
    full = primary
    qualifier_match = _MARKDOWN_HEADING_TRAILING_QUALIFIER.search(primary)
    fragments = [full]
    if qualifier_match is not None:
        primary_without_qualifier = primary[: qualifier_match.start()].strip()
        primary_without_qualifier = primary_without_qualifier.strip("*_`~ ")
        fragments = [primary_without_qualifier, full]
    return list(dict.fromkeys(fragment for fragment in fragments if fragment))


def _markdown_heading_identities(
    value: str, *, artifact_type: str | None = None
) -> set[str]:
    """Project one rendered heading into bounded semantic identities."""

    identities: set[str] = set()
    for fragment in _markdown_heading_fragments(value):
        normalized = re.sub(r"\s+", " ", fragment).strip().lower()
        if normalized:
            identities.add(normalized)
        if artifact_type in {"product_prd", "software_prd"}:
            alias = _PRD_REQUIRED_SECTION_ALIASES.get(
                _normalized_semantic_text(fragment)
            )
            if alias is not None:
                identities.add(re.sub(r"\s+", " ", alias).strip().lower())
    return identities


def _required_section_identities(
    value: str, *, artifact_type: str | None = None
) -> set[str]:
    """Project one authoritative required label without splitting its semantics."""

    label = value.strip().strip("*_`~ ")
    label = _MARKDOWN_HEADING_ORDINAL.sub("", label, count=1).strip()
    label = label.strip("*_`~ ")
    normalized = re.sub(r"\s+", " ", label).strip().lower()
    identities = {normalized} if normalized else set()
    if artifact_type in {"product_prd", "software_prd"}:
        alias = _PRD_REQUIRED_SECTION_ALIASES.get(_normalized_semantic_text(label))
        if alias is not None:
            identities.add(re.sub(r"\s+", " ", alias).strip().lower())
    return identities


def _markdown_heading_primary_identity(
    value: str, *, artifact_type: str | None = None
) -> str:
    """Return the stable identity used for duplicate-heading checks."""

    fragments = _markdown_heading_fragments(value)
    if not fragments:
        return ""
    primary = fragments[0]
    if artifact_type in {"product_prd", "software_prd"}:
        primary = _PRD_REQUIRED_SECTION_ALIASES.get(
            _normalized_semantic_text(primary), primary
        )
    return re.sub(r"\s+", " ", primary).strip().lower()


def _markdown_heading_level(value: re.Match[str] | str) -> int:
    """Return the ATX level while allowing CommonMark's three-space indent."""

    line = value.group(0) if isinstance(value, re.Match) else value
    unindented = line.lstrip(" ")
    return len(unindented) - len(unindented.lstrip("#"))


def _is_server_owned_source_heading(value: str, *, rendered: bool = False) -> bool:
    identities = (
        _markdown_heading_identities(value)
        if rendered
        else _required_section_identities(value)
    )
    return any(
        _SERVER_OWNED_SOURCE_HEADING.fullmatch(identity) is not None
        for identity in identities
    )


def _markdown_headings(markdown: str) -> list[tuple[int, str, str]]:
    unfenced = _markdown_with_fenced_bodies_blanked(markdown)
    return [
        (match.start(), match.group(1).strip(), match.group(1).strip().lower())
        for match in _MARKDOWN_HEADING.finditer(unfenced)
    ]


def _model_owned_required_sections(values: list[str]) -> list[str]:
    retained = utf16_ordinal_sorted(
        set(value for value in values if not _is_server_owned_source_heading(value))
    )
    return retained or ["Artifact"]


def _evidence_markers(markdown: str) -> list[re.Match[str]]:
    markers = list(_RAW_EVIDENCE_MARKER.finditer(markdown))
    if any(_EVIDENCE_CLAIM_ID.fullmatch(marker.group(1)) is None for marker in markers):
        raise ValueError(
            "evidence marker must contain one exact lowercase immutable claim ID"
        )
    return markers


def _is_evidence_status_heading(heading: str) -> bool:
    return _EVIDENCE_STATUS_HEADING.search(heading) is not None


def _immutable_gap_bullet(label: str) -> str:
    return f"- {label}"


def _has_server_owned_immutable_gap_bullet(markdown: str, bullet: str) -> bool:
    current_heading = ""
    for line in markdown.splitlines():
        stripped = line.strip()
        heading = re.match(r"^#{1,6}\s+(.+?)\s*#*$", stripped)
        if heading:
            current_heading = heading.group(1).strip()
            continue
        if current_heading in _IMMUTABLE_GAP_SECTION_HEADINGS and stripped == bullet:
            return True
    return False


def _markdown_without_matching_lines(
    markdown: str,
    should_remove: Callable[[str], bool],
    *,
    protected_indexes: Sequence[int] = (),
) -> str:
    """Remove unsafe lines without leaving a corrupted fenced structure behind."""

    lines = markdown.splitlines()
    protected = set(protected_indexes)
    target_indexes = {
        index
        for index, line in enumerate(lines)
        if index not in protected and should_remove(line)
    }
    if not target_indexes:
        return markdown

    fenced_ranges: list[tuple[int, int]] = []
    fence_start: int | None = None
    fence_character = ""
    fence_length = 0
    for index, line in enumerate(lines):
        match = re.match(r"^\s*(`{3,}|~{3,})", line)
        if match is None:
            continue
        marker = match.group(1)
        if fence_start is None:
            fence_start = index
            fence_character = marker[0]
            fence_length = len(marker)
            continue
        if marker[0] == fence_character and len(marker) >= fence_length:
            fenced_ranges.append((fence_start, index))
            fence_start = None
            fence_character = ""
            fence_length = 0
    if fence_start is not None:
        fenced_ranges.append((fence_start, len(lines) - 1))

    removed = set(target_indexes)
    for start, end in fenced_ranges:
        if any(start <= index <= end for index in target_indexes):
            removed.update(range(start, end + 1))
    return "\n".join(line for index, line in enumerate(lines) if index not in removed)


def _bounded_source_section_label(sections: Sequence[str]) -> str:
    ordered = utf16_ordinal_sorted(set(sections))
    if not ordered:
        raise ValueError("source appendix citation has no Markdown section")
    retained: list[str] = []
    for index, section in enumerate(ordered):
        candidate = " · ".join([*retained, section])
        remaining = len(ordered) - index - 1
        suffix = f" · (+{remaining} more sections)" if remaining else ""
        if len(candidate + suffix) <= 500:
            retained.append(section)
            continue
        break
    if retained:
        remaining = len(ordered) - len(retained)
        suffix = f" · (+{remaining} more sections)" if remaining else ""
        return " · ".join(retained) + suffix
    suffix = f" · (+{len(ordered) - 1} more sections)" if len(ordered) > 1 else ""
    return ordered[0][: 500 - len(suffix) - 1].rstrip() + "…" + suffix


def _citation_sections(markdown: str) -> dict[str, list[str]]:
    headings = _markdown_headings(markdown)
    if any(
        _is_server_owned_source_heading(name, rendered=True) for _, name, _ in headings
    ):
        raise ValueError("model output must not provide its own source appendix")
    sections: dict[str, set[str]] = {}
    for marker in _evidence_markers(markdown):
        prior = [heading for heading in headings if heading[0] < marker.start()]
        if not prior:
            raise ValueError(
                "evidence marker must appear after a real Markdown heading"
            )
        current_section = prior[-1][1]
        sections.setdefault(marker.group(1), set()).add(current_section)
    return {
        claim_id: utf16_ordinal_sorted(values) for claim_id, values in sections.items()
    }


def _source_appendix_entries(
    markdown: str, research: ResearchResultV2
) -> list[SourceAppendixEntryV1]:
    sections_by_claim = _citation_sections(markdown)
    claims_by_id: dict[str, EvidenceClaimV1] = {}
    for claim in [
        *research.selected_claims,
        *[claim for entry in research.claim_ledger for claim in entry.claims],
    ]:
        claims_by_id[claim.claim_id] = claim
    sources_by_claim: dict[str, list[ResearchSourceV1]] = {}
    for source in research.source_catalogue:
        for claim_id in source.supported_claim_ids:
            sources_by_claim.setdefault(claim_id, []).append(source)
    appendix: list[SourceAppendixEntryV1] = []
    for claim_id in utf16_ordinal_sorted(sections_by_claim):
        claim = claims_by_id.get(claim_id)
        sources = sorted(
            sources_by_claim.get(claim_id, []), key=lambda item: item.source_id
        )
        if claim is None or not sources:
            raise ValueError("citation marker has no exact immutable source metadata")
        for section in sections_by_claim[claim_id]:
            for source in sorted(sources, key=lambda item: item.source_id):
                source_class = next(
                    value
                    for value in _SOURCE_CLASS_PRIORITY
                    if value in source.source_classes
                )
                appendix.append(
                    SourceAppendixEntryV1(
                        claim_id=claim_id,
                        source_title=source.source_title,
                        canonical_url=source.canonical_url,
                        source_class=source_class,
                        retrieval_date=source.retrieval_date,
                        supported_claim=claim.text,
                        supported_section=section,
                    )
                )
    if len(appendix) > 400:
        raise ValueError("source appendix exceeds the bounded contract")
    return sorted(
        appendix,
        key=lambda item: (
            item.claim_id.encode("utf-16-be"),
            item.canonical_url.encode("utf-16-be"),
            item.retrieval_date.encode("utf-16-be"),
            item.source_class.encode("utf-16-be"),
            item.source_title.encode("utf-16-be"),
            item.supported_section.encode("utf-16-be"),
        ),
    )


def _markdown_with_source_appendix(
    markdown: str,
    appendix: list[SourceAppendixEntryV1],
    *,
    source_section_required: bool = False,
) -> str:
    if not appendix and not source_section_required:
        return markdown.rstrip()

    def clean(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip().replace("[evidence:", "［evidence:")

    rows = ["## Sources", ""]
    if not appendix:
        rows.append("_No immutable evidence sources were cited for this artifact._")
    grouped: dict[tuple[str, str, str, str, str, str], list[str]] = {}
    for entry in appendix:
        key = (
            entry.claim_id,
            entry.source_title,
            entry.canonical_url,
            entry.source_class,
            entry.retrieval_date,
            entry.supported_claim,
        )
        grouped.setdefault(key, []).append(entry.supported_section)
    for (
        claim_id,
        source_title,
        canonical_url,
        source_class,
        retrieval_date,
        supported_claim,
    ), supported_sections in grouped.items():
        rows.append(
            "- "
            f"`[evidence:{claim_id}]` — "
            f"{clean(source_title)} — {canonical_url} — "
            f"class: `{source_class}` — retrieved: `{retrieval_date}` — "
            f"section: {clean(_bounded_source_section_label(supported_sections))} — "
            f"supported claim: {clean(supported_claim)}"
        )
    return markdown.rstrip() + "\n\n" + "\n".join(rows) + "\n"


def _appendix_matches_research(
    markdown: str,
    appendix: list[SourceAppendixEntryV1],
    research: ResearchResultV2,
    *,
    rendered: bool,
) -> bool:
    marker = "\n\n## Sources\n"
    has_rendered_sources = markdown.count(marker) == 1
    if rendered:
        if appendix or has_rendered_sources:
            if not has_rendered_sources:
                return False
            base_markdown = markdown.split(marker, 1)[0]
        else:
            base_markdown = markdown
    else:
        if has_rendered_sources or markdown != markdown.rstrip():
            return False
        base_markdown = markdown
    try:
        expected = _source_appendix_entries(base_markdown, research)
    except ValueError:
        return False
    if appendix != expected:
        return False
    if not rendered:
        return True
    return markdown in {
        _markdown_with_source_appendix(base_markdown, appendix),
        _markdown_with_source_appendix(
            base_markdown, appendix, source_section_required=True
        ),
    }


def _task_fragment_parts(fragment: str) -> tuple[str, str, str, str]:
    """Split a task fragment while preserving list and formatted G/W/T topology."""

    match = _TASK_FRAGMENT_PREFIX.match(fragment)
    assert match is not None
    return (
        match.group("list") or "",
        match.group("role_prefix") or "",
        (match.group("role") or "").casefold(),
        match.group("body") or "",
    )


def _incomplete_given_when_then_acceptance_blocks(markdown: str) -> list[str]:
    """Find structurally incomplete Given/When/Then acceptance blocks.

    Evidence cleanup intentionally removes an entire unsafe Markdown line. A criterion
    must therefore be validated as one block after cleanup rather than by finding the
    three role words anywhere in the document. Explicit role labels are recognized at
    the beginning of plain, bulleted, or numbered lines; a compact one-line form may
    introduce later roles after commas or semicolons. Single role-like prose is ignored
    unless it appears under an explicit numbered criterion heading.
    """

    expected_roles = ("given", "when", "then")
    heading_stack: list[tuple[int, str]] = []
    active_roles: set[str] = set()
    active_heading: str | None = None
    active_in_acceptance_section = False
    active_continuation_indent: int | None = None
    current_list_label: str | None = None
    table_role_columns: dict[str, int] | None = None
    table_row_number = 0
    defects: list[str] = []
    fence_character = ""
    fence_length = 0

    def explicit_heading() -> str | None:
        return next(
            (
                name
                for _level, name in reversed(heading_stack)
                if _EXPLICIT_ACCEPTANCE_BLOCK_HEADING.search(name) is not None
            ),
            None,
        )

    def in_acceptance_section() -> bool:
        return any(
            _ACCEPTANCE_CRITERIA_SECTION_HEADING.search(name) is not None
            for _level, name in heading_stack
        )

    def record_missing(label: str, roles: set[str]) -> None:
        missing = [role.title() for role in expected_roles if role not in roles]
        if missing:
            defects.append(
                f"Acceptance criterion block {label!r} is incomplete; missing "
                + ", ".join(missing)
                + "."
            )

    def finish_block(*, clear_list_label: bool = False) -> None:
        nonlocal active_heading, active_in_acceptance_section
        nonlocal active_continuation_indent, current_list_label
        if active_roles and (
            active_heading is not None
            or (active_in_acceptance_section and len(active_roles) >= 2)
        ):
            record_missing(
                active_heading or "unheaded Given/When/Then block", active_roles
            )
        active_roles.clear()
        active_heading = None
        active_in_acceptance_section = False
        active_continuation_indent = None
        if clear_list_label:
            current_list_label = None

    def list_acceptance_label(line: str) -> tuple[str, int] | None:
        item = _MARKDOWN_LIST_ITEM.match(line)
        if item is None:
            return None
        label = item.group("content").strip()
        label = re.sub(r"^(?:\*\*|__)", "", label)
        label = re.sub(r"(?:\*\*|__)\s*$", "", label).strip().rstrip(":")
        if _EXPLICIT_ACCEPTANCE_BLOCK_HEADING.match(label) is None:
            return None
        return label, len(item.group("indent").expandtabs(4))

    def markdown_table_cells(line: str) -> list[str] | None:
        stripped = line.strip()
        if stripped.count("|") < 2:
            return None
        if stripped.startswith("|"):
            stripped = stripped[1:]
        if stripped.endswith("|"):
            stripped = stripped[:-1]
        return [cell.strip() for cell in stripped.split("|")]

    def table_cell_label(cell: str) -> str:
        return re.sub(r"[*_`]", "", cell).strip().rstrip(":").strip()

    for line in markdown.splitlines():
        fence = re.match(r"^\s*(`{3,}|~{3,})", line)
        if fence is not None:
            marker = fence.group(1)
            if not fence_character:
                finish_block(clear_list_label=True)
                fence_character = marker[0]
                fence_length = len(marker)
            elif marker[0] == fence_character and len(marker) >= fence_length:
                fence_character = ""
                fence_length = 0
            continue
        if fence_character:
            continue

        stripped = line.strip()
        heading = _MARKDOWN_HEADING.fullmatch(stripped)
        if heading is not None:
            finish_block(clear_list_label=True)
            table_role_columns = None
            table_row_number = 0
            level = _markdown_heading_level(stripped)
            heading_stack = [item for item in heading_stack if item[0] < level]
            heading_stack.append((level, heading.group(1).strip()))
            continue

        cells = markdown_table_cells(line)
        if cells is not None:
            normalized_cells = [table_cell_label(cell).casefold() for cell in cells]
            header_columns = {
                role: normalized_cells.index(role)
                for role in expected_roles
                if role in normalized_cells
            }
            if len(header_columns) == len(expected_roles):
                finish_block(clear_list_label=True)
                table_role_columns = header_columns
                table_row_number = 0
                continue
            if table_role_columns is not None:
                if all(
                    _MARKDOWN_TABLE_SEPARATOR_CELL.fullmatch(cell) is not None
                    for cell in normalized_cells
                ):
                    continue
                table_row_number += 1
                present_roles = {
                    role
                    for role, index in table_role_columns.items()
                    if index < len(cells) and bool(table_cell_label(cells[index]))
                }
                non_role_cells = [
                    table_cell_label(cell)
                    for index, cell in enumerate(cells)
                    if index not in table_role_columns.values()
                    and table_cell_label(cell)
                ]
                label = (
                    non_role_cells[0][:160]
                    if non_role_cells
                    else f"table row {table_row_number}"
                )
                record_missing(label, present_roles)
                continue
        table_role_columns = None
        table_row_number = 0

        listed_label = list_acceptance_label(line)
        if listed_label is not None:
            finish_block(clear_list_label=True)
            current_list_label, _label_indent = listed_label
            continue

        role_line = _GIVEN_WHEN_THEN_ROLE_LINE.match(line)
        if role_line is None:
            if not stripped:
                continue
            indentation = len(line) - len(line.lstrip(" \t"))
            if (
                active_roles
                and active_continuation_indent is not None
                and len(line[:indentation].expandtabs(4)) >= active_continuation_indent
            ):
                continue
            finish_block(clear_list_label=True)
            continue
        roles = {
            role_line.group("role").casefold(),
            *(
                match.group("role").casefold()
                for match in _GIVEN_WHEN_THEN_INLINE_ROLE.finditer(
                    line[role_line.end() :]
                )
            ),
        }
        if "given" in roles and active_roles:
            finish_block()
        if not active_roles:
            active_heading = current_list_label or explicit_heading()
            active_in_acceptance_section = in_acceptance_section()
            bullet = role_line.group("bullet")
            if bullet is not None:
                active_continuation_indent = len(
                    (
                        role_line.group("indent") + bullet + role_line.group("spacing")
                    ).expandtabs(4)
                )
        active_roles.update(roles)

    finish_block()
    return utf16_ordinal_sorted(set(defects))


def _markdown_with_fenced_bodies_blanked(markdown: str) -> str:
    """Blank fenced code without changing offsets or line boundaries."""

    result: list[str] = []
    fence_character = ""
    fence_length = 0

    def blank(line: str) -> str:
        return "".join(character if character in "\r\n" else " " for character in line)

    for line in markdown.splitlines(keepends=True):
        fence = re.match(r"^\s*(`{3,}|~{3,})", line)
        if fence is not None:
            marker = fence.group(1)
            if not fence_character:
                fence_character = marker[0]
                fence_length = len(marker)
                result.append(blank(line))
                continue
            if marker[0] == fence_character and len(marker) >= fence_length:
                fence_character = ""
                fence_length = 0
                result.append(blank(line))
                continue
        result.append(blank(line) if fence_character else line)
    return "".join(result)


def _final_repair_table_rows_by_header(markdown: str) -> dict[str, int]:
    rows_by_header: dict[str, int] = {}
    pending_header: str | None = None
    active_header: str | None = None
    for line in markdown.splitlines():
        stripped = line.strip()
        if not (stripped.startswith("|") and stripped.endswith("|")):
            pending_header = None
            active_header = None
            continue
        cells = [
            re.sub(r"[*_`]", "", cell.replace(r"\|", "|")).strip()
            for cell in re.split(r"(?<!\\)\|", stripped.strip("|"))
        ]
        if cells and all(
            _MARKDOWN_TABLE_SEPARATOR_CELL.fullmatch(cell) is not None for cell in cells
        ):
            active_header = pending_header
            pending_header = None
            if active_header is not None:
                rows_by_header.setdefault(active_header, 0)
            continue
        if active_header is not None:
            rows_by_header[active_header] += 1
            continue
        pending_header = _normalized_semantic_text(" | ".join(cells)) or None
    return dict(sorted(rows_by_header.items()))


def _final_repair_topology(markdown: str) -> FinalRepairTopology:
    """Capture only the Markdown structure the bounded final repair must retain."""

    unfenced = _markdown_with_fenced_bodies_blanked(markdown)
    gwt_roles: list[str] = []
    list_item_count = 0
    for line in unfenced.splitlines():
        if _MARKDOWN_LIST_ITEM.match(line) is not None:
            list_item_count += 1
        role_line = _GIVEN_WHEN_THEN_ROLE_LINE.match(line)
        if role_line is None:
            continue
        gwt_roles.append(role_line.group("role").casefold())
        gwt_roles.extend(
            match.group("role").casefold()
            for match in _GIVEN_WHEN_THEN_INLINE_ROLE.finditer(line[role_line.end() :])
        )
    return FinalRepairTopology(
        heading_levels=sorted(
            _markdown_heading_level(match)
            for match in _MARKDOWN_HEADING.finditer(unfenced)
        ),
        table_rows_by_header=_final_repair_table_rows_by_header(unfenced),
        list_item_count=list_item_count,
        gwt_roles=sorted(gwt_roles),
        requirement_ids=sorted(
            match.group(0).casefold()
            for match in _DISPLAY_REQUIREMENT_ID.finditer(unfenced)
        ),
        numbered_labels=sorted(
            f"{match.group('label').casefold()} {int(match.group('number'))}"
            for match in _FINAL_REPAIR_NUMBERED_LABEL.finditer(unfenced)
        ),
    )


def _final_repair_topology_defects(
    baseline: FinalRepairTopology, markdown: str
) -> list[str]:
    """Reject a final retry that removes structure from its immutable repair base."""

    candidate = _final_repair_topology(markdown)
    defects: list[str] = []

    def missing_values(expected: Sequence[Any], actual: Sequence[Any]) -> list[str]:
        missing = Counter(expected) - Counter(actual)
        return [
            f"{value} ({count} missing)" if count > 1 else str(value)
            for value, count in sorted(missing.items(), key=lambda item: str(item[0]))
        ]

    missing_headings = missing_values(baseline.heading_levels, candidate.heading_levels)
    if missing_headings:
        defects.append(
            "Final repair removed Markdown headings at levels: "
            + ", ".join(missing_headings)
            + "."
        )
    for header, expected_rows in baseline.table_rows_by_header.items():
        actual_rows = candidate.table_rows_by_header.get(header, 0)
        if actual_rows < expected_rows:
            defects.append(
                f"Final repair removed table rows under {header!r}: expected at least "
                f"{expected_rows}, found {actual_rows}."
            )
    if candidate.list_item_count < baseline.list_item_count:
        defects.append(
            "Final repair removed Markdown list items: expected at least "
            f"{baseline.list_item_count}, found {candidate.list_item_count}."
        )
    for label, expected, actual in (
        (
            "Given/When/Then roles",
            baseline.gwt_roles,
            candidate.gwt_roles,
        ),
        (
            "requirement IDs",
            baseline.requirement_ids,
            candidate.requirement_ids,
        ),
        (
            "numbered sequence labels",
            baseline.numbered_labels,
            candidate.numbered_labels,
        ),
    ):
        missing = missing_values(expected, actual)
        if missing:
            defects.append(f"Final repair removed {label}: {', '.join(missing)}.")
    return defects


def _deterministic_structural_integrity_defects(markdown: str) -> list[str]:
    """Reject traceability and ordered-sequence holes without fabricating content."""

    unfenced = _markdown_with_fenced_bodies_blanked(markdown)
    base = unfenced.split("\n\n## Sources\n", 1)[0]
    heading_matches = list(_MARKDOWN_HEADING.finditer(base))

    def section_body(name: str) -> str | None:
        wanted = _required_section_identities(name)
        for index, match in enumerate(heading_matches):
            if not _markdown_heading_identities(match.group(1)).intersection(wanted):
                continue
            level = _markdown_heading_level(match)
            end = len(base)
            for later in heading_matches[index + 1 :]:
                later_level = _markdown_heading_level(later)
                if later_level <= level:
                    end = later.start()
                    break
            return base[match.end() : end]
        return None

    defects: list[str] = []
    prioritized = section_body("Prioritized requirements")
    acceptance = section_body("Acceptance criteria")
    if prioritized is not None and acceptance is not None:
        prioritized_ids = {
            match.group(0).casefold()
            for match in _DISPLAY_REQUIREMENT_ID.finditer(prioritized)
        }
        acceptance_ids = {
            match.group(0).casefold()
            for match in _DISPLAY_REQUIREMENT_ID.finditer(acceptance)
        }
        if prioritized_ids or acceptance_ids:
            missing_from_priorities = acceptance_ids - prioritized_ids
            if missing_from_priorities:
                details = []
                details.append(
                    "missing from prioritized requirements: "
                    + ", ".join(utf16_ordinal_sorted(missing_from_priorities))
                )
                defects.append(
                    "An acceptance-criterion ID is absent from prioritized requirements ("
                    + "; ".join(details)
                    + ")."
                )

    jtbd_sequences: list[list[int]] = []
    active_jtbd: list[int] | None = None

    def is_jtbd_sequence_label(line: str) -> bool:
        stripped = line.strip()
        heading = _MARKDOWN_HEADING.fullmatch(stripped)
        if heading is not None:
            return _JTBD_LABEL.search(heading.group(1)) is not None
        normalized = re.sub(r"[*_`]", "", stripped).strip().rstrip(":").strip()
        return (
            re.match(
                r"^(?:proposed\s+)?(?:jtbd|jobs?[- ]to[- ]be[- ]done)\b",
                normalized,
                re.IGNORECASE,
            )
            is not None
        )

    for line in base.splitlines():
        if is_jtbd_sequence_label(line):
            if active_jtbd:
                jtbd_sequences.append(active_jtbd)
            active_jtbd = []
            continue
        if active_jtbd is None:
            continue
        numbered = re.match(r"^\s*(?P<number>[1-9]\d*)[.)]\s+\S", line)
        if numbered is not None:
            active_jtbd.append(int(numbered.group("number")))
            continue
        if not line.strip():
            continue
        if (
            _MARKDOWN_HEADING.fullmatch(line.strip()) is not None
            or re.match(r"^\s*[-+*]\s+", line) is not None
        ):
            if active_jtbd:
                jtbd_sequences.append(active_jtbd)
            active_jtbd = None
    if active_jtbd:
        jtbd_sequences.append(active_jtbd)
    for numbers in jtbd_sequences:
        unique = sorted(set(numbers))
        if unique != list(range(1, max(unique) + 1)):
            defects.append(
                "A numbered JTBD sequence has a missing leading or interior ordinal."
            )
            break

    roadmap_bodies: list[str] = []
    roadmap_heading = re.compile(
        r"\b(?:next\s+steps?|roadmap|execution\s+phases?)\b", re.IGNORECASE
    )
    for index, match in enumerate(heading_matches):
        if roadmap_heading.search(match.group(1)) is None:
            continue
        level = _markdown_heading_level(match)
        end = len(base)
        for later in heading_matches[index + 1 :]:
            later_level = _markdown_heading_level(later)
            if later_level <= level:
                end = later.start()
                break
        roadmap_bodies.append(base[match.end() : end])

    def explicit_phase_item_number(line: str) -> int | None:
        stripped = line.strip()
        if stripped.startswith("|"):
            cells = [cell.strip() for cell in stripped.strip("|").split("|")]
            candidate = next((cell for cell in cells if cell), "")
        else:
            candidate = re.sub(r"^(?:#{1,6}\s+|[-+*]\s+|\d+[.)]\s+)", "", stripped)
        candidate = re.sub(r"^[*_`\s]+", "", candidate)
        match = re.match(r"^phase\s+(?P<number>[1-9]\d*)\b", candidate, re.I)
        return int(match.group("number")) if match is not None else None

    phase_numbers = {
        number
        for body in roadmap_bodies
        for line in body.splitlines()
        if (number := explicit_phase_item_number(line)) is not None
    }
    if phase_numbers:
        ordered_phases = sorted(phase_numbers)
        if ordered_phases != list(range(1, max(ordered_phases) + 1)):
            defects.append(
                "An explicit Phase sequence has a missing leading or interior ordinal."
            )
    return utf16_ordinal_sorted(set(defects))


def _fenced_markdown_line_indexes(markdown: str) -> set[int]:
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


def _reader_output_defects(
    markdown: str, reader_output: ReaderOutputContractV1 | None
) -> list[str]:
    """Validate only the reader-authored body covered by the immutable V2 contract."""

    if reader_output is None:
        return []
    defects: list[str] = []
    word_limit = reader_output.word_limit
    if word_limit is not None:
        word_count = len(re.findall(r"\b[\w'-]+\b", markdown, re.UNICODE))
        if word_count > word_limit.maximum_words:
            defects.append(
                "Reader Markdown exceeds the accepted maximum of "
                f"{word_limit.maximum_words} words ({word_count} measured)."
            )
    item_limit = reader_output.item_limit
    all_items = _TOP_LEVEL_MARKDOWN_ITEM.findall(markdown)
    measured_items = all_items
    measured_item_label = "top-level Markdown items"
    if reader_output.reader_format.value == "checklist":
        checklist_items = _TOP_LEVEL_MARKDOWN_CHECKLIST_ITEM.findall(markdown)
        measured_items = checklist_items
        measured_item_label = "top-level checklist items"
        if not checklist_items:
            defects.append(
                "Reader Markdown must contain at least one top-level checklist item."
            )
        if len(all_items) != len(checklist_items):
            defects.append(
                "Reader Markdown must use top-level Markdown checklist items only."
            )
    if item_limit is not None and len(measured_items) != item_limit.exact_items:
        defects.append(
            "Reader Markdown must contain exactly "
            f"{item_limit.exact_items} {measured_item_label} "
            f"({len(measured_items)} measured)."
        )
    return defects
