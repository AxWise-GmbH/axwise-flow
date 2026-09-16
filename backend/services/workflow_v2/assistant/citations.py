"""Render citation placeholders from admitted exact spans, never from their IDs.

The provider response, its hashes, and claim statements remain untouched. A
separate Markdown view replaces citation syntax only when the original statement
has a verified binding and an admitted source. This is not source entailment.
"""

from __future__ import annotations

import html
import re
import string
from collections import defaultdict
from collections.abc import Collection
from dataclasses import dataclass
from typing import Any

from backend.domain.workflow_v2.contracts import (
    is_canonical_public_https_url,
    utf16_ordinal_sorted,
)
from backend.services.workflow_v2.assistant.claim_spans import (
    _markdown_assertions,
    _verified_provider_part,
    normalize_assistant_claims,
)
from backend.services.workflow_v2.assistant.markdown_links import (
    normalize_reader_link_destination,
    reader_inline_link_checker,
    reader_link_destinations,
)


_CITATION = re.compile(
    r"\[\[[^\]\n]{1,80}\]\]"
    r"|\[\^[A-Za-z0-9_.:-]{1,80}\]"
    r"|\[\d+(?:\.\d+)*(?:[ \t]*[,;][ \t]*\d+(?:\.\d+)*)*\]"
    r"(?:\((?:<[^>\n]+>|[^)\n]+)\))?"
)
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
_BACKTICKS = re.compile(r"`+")


@dataclass(frozen=True)
class AssistantCitationRendering:
    markdown: str
    issues: tuple[str, ...] = ()
    rendered_citation_count: int = 0


@dataclass(frozen=True)
class _ProseLink:
    start: int
    end: int
    label: str
    destination: str
    kind: str


def _escaped(text: str, start: int) -> bool:
    count = 0
    while start > count and text[start - count - 1] == "\\":
        count += 1
    return bool(count % 2)


def _literal_mask(text: str) -> bytearray:
    """Mask actual Markdown code, not code-looking prose or template syntax."""
    mask = bytearray(len(text))
    offset = 0
    fence: str | None = None
    fence_quote_depth = 0
    fence_list_indent = 0
    paragraph = False
    quote_depth = 0
    list_indent = 0
    html_block: str | None = None
    inline_blocks = bytearray(len(text))
    block = 1
    for raw_line in text.splitlines(keepends=True):
        original_line = raw_line.rstrip("\r\n").expandtabs(4)
        quote = re.match(r"^ {0,3}(?:> ?)+", original_line)
        depth = quote[0].count(">") if quote else 0
        line = original_line[quote.end() :] if quote else original_line
        indentation = len(line) - len(line.lstrip(" "))
        if fence is not None and (
            depth < fence_quote_depth
            or (line.strip() and indentation < fence_list_indent)
        ):
            fence = None  # An ended list/quote cannot hide following prose.
        if fence is not None:
            line = line[fence_list_indent:]
        else:
            if depth != quote_depth:
                paragraph, list_indent = False, 0
            quote_depth = depth
            bullet = re.match(r"^( {0,3})([-+*]|\d+[.)])( +)", line)
            if bullet:
                spaces = len(bullet[3])
                list_indent = (
                    len(bullet[1]) + len(bullet[2]) + (spaces if spaces <= 4 else 1)
                )
                line = line[list_indent:]
                paragraph = False
            elif line.strip() and list_indent:
                if indentation >= list_indent:
                    line = line[list_indent:]
                else:
                    list_indent, paragraph = 0, False
        marker = _FENCE.match(line)
        valid_opener = marker is not None and not (
            marker[1][0] == "`" and "`" in marker[2]
        )
        protected = False
        if fence is not None:
            protected = True
            if (
                marker
                and marker[1][0] == fence[0]
                and len(marker[1]) >= len(fence)
                and not marker[2].strip()
            ):
                fence = None
        elif html_block is not None:
            protected = True
            if re.search(rf"</{html_block}\s*>", line, re.I):
                html_block = None
        elif valid_opener:
            fence = marker[1]
            fence_quote_depth, fence_list_indent = depth, list_indent
            protected = True
        elif not paragraph and line.startswith("    "):
            protected = True
        elif (
            not depth
            and not list_indent
            and (
                html_open := re.match(
                    r"^ {0,3}<(pre|script|style|textarea)(?:\s|>|$)", line, re.I
                )
            )
        ):
            # A real HTML block is not parsed for Markdown links by the reader.
            protected = True
            tag = html_open[1].casefold()
            if not re.search(rf"</{tag}\s*>", line, re.I):
                html_block = tag
        if protected:
            mask[offset : offset + len(raw_line)] = b"\1" * len(raw_line)
            paragraph = False
            block = (block % 254) + 1
        elif not line.strip():
            paragraph = False
            block = (block % 254) + 1
        else:
            if not paragraph:
                block = (block % 254) + 1
            inline_blocks[offset : offset + len(raw_line)] = bytes([block]) * len(
                raw_line
            )
            paragraph = not (
                re.match(r"^ {0,3}#{1,6}(?:\s|$)", line)
                or re.fullmatch(r" {0,3}(?:[-*_]\s*){3,}", line)
            )
        offset += len(raw_line)
    cursor = 0
    while match := _BACKTICKS.search(text, cursor):
        start, end = match.span()
        if mask[start] or _escaped(text, start):
            cursor = end
            continue
        closing = re.compile(r"(?<!`)" + re.escape(match[0]) + r"(?!`)").search(
            text, end
        )
        if (
            closing is None
            or not inline_blocks[start]
            or any(
                value != inline_blocks[start]
                for value in inline_blocks[start : closing.end()]
            )
        ):
            cursor = end  # An unmatched run is literal punctuation, not code.
            continue
        end = closing.end()
        mask[start:end] = b"\1" * (end - start)
        cursor = end
    return mask


def _citation_tokens(text: str) -> list[tuple[int, int]]:
    mask = _literal_mask(text)
    # Expressions can contain numeric array access without being Markdown code.
    # Only opaque-token recognition uses this; visible links are always scanned.
    for expression in re.finditer(
        r"\{\{[ \t]*[A-Za-z_$][\w$]*[ \t]*[.\[(][^\n]*?\}\}", text
    ):
        mask[expression.start() : expression.end()] = b"\1" * len(expression[0])
    urls = [match.span() for match in re.finditer(r"https?://[^\s<>]+", text)]
    tokens = []
    for match in _CITATION.finditer(text):
        start, end = match.span()
        label_end = text.index("]", start) + 1
        if _escaped(text, start) or any(mask[start:label_end]):
            continue
        if any(left <= start < right for left, right in urls):
            continue  # Brackets inside a URL are a destination literal.
        # A quoted marker is an example/literal, not an evidence assertion.
        if start and end < len(text) and text[start - 1] in "\"'":
            if text[end] == text[start - 1]:
                continue
        tokens.append((start, end))
    return tokens


def _citation_view(text: str) -> str:
    characters = list(text)
    for start, end in _citation_tokens(text):
        characters[start:end] = " " * (end - start)
    return "".join(characters)


def assistant_citation_display_statement(
    statement: str, *, source_markdown: str | None = None
) -> str:
    """Remove citation syntax for display only, after a successful render gate.

    Do not use this string as an exact claim or replace any provenance field with
    it. Only token-adjacent horizontal whitespace is adjusted; code and literals
    are preserved verbatim.
    """
    prose_links = _prose_links(statement, source_markdown=source_markdown)
    token_spans = [
        (start, end)
        for start, end in _citation_tokens(statement)
        if not any(link.start < end and link.end > start for link in prose_links)
    ]
    token_spans.extend(
        (link.start, link.end) for link in prose_links if _placeholder_label(link.label)
    )
    edits = []
    for start, end in sorted(token_spans):
        left, right = start, end
        if end == len(statement) or statement[end] in ".,;:!?)]}\n\r":
            while left > 0 and statement[left - 1] in " \t":
                left -= 1
        elif start == 0 or (statement[start - 1] in " \t" and statement[end] in " \t"):
            while right < len(statement) and statement[right] in " \t":
                right += 1
        if edits and left <= edits[-1][1]:
            edits[-1] = (edits[-1][0], max(right, edits[-1][1]))
        else:
            edits.append((left, right))
    replacements = []
    for start, end in reversed(edits):
        if end == len(statement) or statement[end] in ".,;:!?)]}\n\r":
            while start > 0 and statement[start - 1] in " \t":
                start -= 1
        replacements.append((start, end, ""))
    for link in prose_links:
        if not _placeholder_label(link.label):
            label = (
                _code_literal(link.destination)
                if link.kind == "autolink"
                else link.label
            )
            replacements.append((link.start, link.end, label))
    displayed = statement
    for start, end, replacement in sorted(replacements, reverse=True):
        displayed = displayed[:start] + replacement + displayed[end:]
    return displayed


def _placeholder_label(label: str) -> bool:
    return not label.strip() or _CITATION.fullmatch(f"[{label}]") is not None


def _code_literal(value: str) -> str:
    ticks = "`" * (
        max((len(match[0]) for match in _BACKTICKS.finditer(value)), default=0) + 1
    )
    return f"{ticks}{value}{ticks}"


def _canonical_destination(url: str) -> str:
    # Markdown decodes character references even inside <angle destinations>.
    return url.replace("&", "&amp;")


def _unescape_markdown(value: str) -> str:
    return html.unescape(
        re.sub(
            r"\\(.)",
            lambda match: match[1] if match[1] in string.punctuation else match[0],
            value,
        )
    )


def _link_destination(text: str, start: int) -> tuple[str, int] | None:
    while start < len(text) and text[start] in " \t\r\n":
        if text[start] == "\n" and re.match(r"\n[ \t]*\n", text[start:]):
            return None
        start += 1
    if start >= len(text):
        return None
    cursor = start
    angled = text[start] == "<"
    if angled:
        cursor += 1
        start = cursor
    depth = 0
    while cursor < len(text):
        character = text[cursor]
        if character == "\\" and cursor + 1 < len(text):
            cursor += 2
            continue
        if angled and character == ">":
            return _unescape_markdown(text[start:cursor]), cursor + 1
        if character in "\r\n":
            if angled or depth:
                return None
            break
        if angled and character == "<":
            return None
        if not angled:
            if character.isspace() or (character == ")" and depth == 0):
                break
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
        cursor += 1
    if angled or depth or start == cursor:
        return None
    return _unescape_markdown(text[start:cursor]), cursor


def _closing_bracket(text: str, start: int) -> int | None:
    depth = 1
    cursor = start + 1
    while cursor < len(text):
        if text[cursor] == "\n" and re.match(r"\n[ \t]*\n", text[cursor:]):
            return None
        if text[cursor] == "\\":
            cursor += 2
            continue
        if text[cursor] == "[":
            depth += 1
        elif text[cursor] == "]":
            depth -= 1
            if depth == 0:
                return cursor
        cursor += 1
    return None


def _reference_definitions(
    markdown: str,
) -> tuple[dict[str, str], list[tuple[int, int]]]:
    mask = _literal_mask(markdown)
    references: dict[str, str] = {}
    definition_spans = []
    for match in re.finditer(r"^ {0,3}\[([^\]\n]{1,200})\]:[ \t]*", markdown, re.M):
        if any(mask[match.start() : match.end()]) or match[1].startswith("^"):
            continue
        destination = _link_destination(markdown, match.end())
        if destination is not None:
            line_end = markdown.find("\n", destination[1])
            line_end = len(markdown) if line_end < 0 else line_end
            if not re.fullmatch(
                r"[ \t]*(?:\"(?:\\.|[^\"\n])*\"|'(?:\\.|[^'\n])*'|\((?:\\.|[^()\n])*\))?[ \t]*",
                markdown[destination[1] : line_end],
            ):
                continue
            references.setdefault(_reference_label(match[1]), destination[0])
            definition_spans.append((match.start(), line_end))
    return references, definition_spans


def _reference_label(value: str) -> str:
    return " ".join(_unescape_markdown(value).split()).casefold()


def _prose_links(
    markdown: str, *, source_markdown: str | None = None
) -> list[_ProseLink]:
    """One parser supplies both policy destinations and exact rendering spans."""
    mask = _literal_mask(markdown)
    references, definition_spans = _reference_definitions(markdown)
    if source_markdown is not None:
        context_references, _context_spans = _reference_definitions(source_markdown)
        references = {**references, **context_references}
    found: list[_ProseLink] = []
    cursor = 0
    while cursor < len(markdown):
        start = markdown.find("[", cursor)
        if start < 0:
            break
        cursor = start + 1
        if (
            mask[start]
            or _escaped(markdown, start)
            or any(left <= start < right for left, right in definition_spans)
        ):
            continue
        close = _closing_bracket(markdown, start)
        if close is None:
            continue
        visible_label = markdown[start + 1 : close]
        image = (
            start > 0
            and markdown[start - 1] == "!"
            and not _escaped(markdown, start - 1)
        )
        link_start = start - 1 if image else start
        after = close + 1
        if after < len(markdown) and markdown[after] == "(":
            destination = _link_destination(markdown, after + 1)
            if destination is None:
                continue
            url, end = destination
            tail = markdown[end:]
            closing = re.match(
                r"[ \t\r\n]*(?:(?:\"[^\"\n]*\"|'[^'\n]*'|\([^()\n]*\))[ \t\r\n]*)?\)",
                tail,
            )
            if closing is None:
                continue
            cursor = end + closing.end()
            found.append(
                _ProseLink(
                    link_start,
                    cursor,
                    visible_label,
                    url,
                    "image" if image else "inline",
                )
            )
        else:
            reference = markdown[start + 1 : close]
            if after < len(markdown) and markdown[after] == "[":
                reference_end = _closing_bracket(markdown, after)
                if reference_end is None:
                    continue
                reference = markdown[after + 1 : reference_end] or reference
                cursor = reference_end + 1
            if _reference_label(reference) in references:
                link_end = cursor if cursor > after else after
                found.append(
                    _ProseLink(
                        link_start,
                        link_end,
                        visible_label,
                        references[_reference_label(reference)],
                        "image" if image else "reference",
                    )
                )
                cursor = link_end
    for match in re.finditer(r"<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*)>", markdown):
        if (
            not mask[match.start()]
            and not _escaped(markdown, match.start())
            and not any(
                left <= match.start() < right for left, right in definition_spans
            )
            and not any(link.start <= match.start() < link.end for link in found)
        ):
            found.append(
                _ProseLink(
                    match.start(),
                    match.end(),
                    match[1],
                    _unescape_markdown(match[1]),
                    "autolink",
                )
            )
    return sorted(found, key=lambda link: (link.start, link.end))


def prose_link_destinations(markdown: str) -> tuple[str, ...]:
    """Read visible Markdown/autolink destinations, without trusting them.

    Local reference definitions are resolved only for links that use them.
    Destinations use Markdown unescaping/entity decoding so source policy sees
    the actual destination. Code and escaped link syntax remain literal.
    """
    return tuple(dict.fromkeys(reader_link_destinations(markdown)))


def _claim_key(claim: dict[str, Any]) -> tuple[Any, ...]:
    return tuple(
        claim.get(key)
        for key in (
            "text",
            "provider",
            "provider_response_hash",
            "part_index",
            "segment_start",
            "segment_end",
        )
    )


def _citation_units(text: str) -> list[tuple[int, int]]:
    """A syntax-only view supplies boundaries; every returned span is original."""
    view = _citation_view(text)
    units = []
    for start, end in _markdown_assertions(view):
        units.append((start, end))
        # Provider support may exclude both a terminal citation and punctuation.
        core_end = end
        while core_end > start and view[core_end - 1] in ".!?":
            core_end -= 1
        while core_end > start and view[core_end - 1].isspace():
            core_end -= 1
        if start < core_end < end:
            units.append((start, core_end))
    return units


def _has_assertion_content(statement: str, *, source_markdown: str) -> bool:
    """A link title or reference definition by itself is not a factual claim."""
    mask = _literal_mask(statement)
    _references, definitions = _reference_definitions(statement)
    for start, end in [
        *_citation_tokens(statement),
        *definitions,
        *(
            (link.start, link.end)
            for link in _prose_links(statement, source_markdown=source_markdown)
        ),
    ]:
        mask[start:end] = b"\1" * (end - start)
    return any(
        character.isalnum() and not mask[index]
        for index, character in enumerate(statement)
    )


def normalize_assistant_citation_claims(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Admit exact complete assertions even when citation metadata trails them.

    Normalization first validates the unmodified provider ledger. Citation IDs
    never supply source mappings, and masked characters never enter a fact.
    """
    output = [
        claim
        for claim in normalize_assistant_claims(raw)
        if _has_assertion_content(
            claim["text"], source_markdown=str(raw.get("text") or "")
        )
    ]
    text = raw.get("text")
    claims = raw.get("claims")
    if not isinstance(text, str) or not isinstance(claims, list):
        return output
    if raw.get("provider") == "searxng_direct_fetch" or not _citation_tokens(text):
        return output
    seen = {_claim_key(claim) + (tuple(claim["source_urls"]),) for claim in output}
    groups: dict[tuple[str, int, tuple[str, ...]], list[dict[str, Any]]] = defaultdict(
        list
    )
    for claim in claims[:50]:
        if not isinstance(claim, dict) or not isinstance(claim.get("text"), str):
            continue
        urls = claim.get("source_urls")
        if (
            not isinstance(urls, list)
            or not urls
            or not all(isinstance(url, str) for url in urls)
        ):
            continue
        gemini = "gemini_google_search" in (raw.get("provider"), claim.get("provider"))
        if gemini:
            part = _verified_provider_part(raw, claim)
            if part is not None:
                groups[(part, claim["part_index"], tuple(sorted(set(urls))))].append(
                    claim
                )
        else:
            statement = claim["text"]
            if text.count(statement) != 1 or not statement or len(statement) > 4000:
                continue
            if not _has_assertion_content(statement, source_markdown=text):
                continue
            if any(
                text[start:end] == statement for start, end in _citation_units(text)
            ):
                key = _claim_key(claim) + (tuple(urls),)
                if key not in seen:
                    output.append(dict(claim))
                    seen.add(key)
    for (part, _index, urls), supports in groups.items():
        byte_offsets = [0]
        for character in part:
            byte_offsets.append(byte_offsets[-1] + len(character.encode("utf-8")))
        runs: list[list[dict[str, Any]]] = []
        right = -1
        for support in sorted(
            supports, key=lambda item: (item["segment_start"], item["segment_end"])
        ):
            if support["segment_start"] > right:
                runs.append([])
            runs[-1].append(support)
            right = max(right, support["segment_end"])
        for start, end in _citation_units(part):
            statement = part[start:end]
            if not statement or len(statement) > 4000:
                continue
            if not _has_assertion_content(statement, source_markdown=text):
                continue
            left_byte, right_byte = byte_offsets[start], byte_offsets[end]
            if any(
                item.get("part_index") == _index
                and item.get("segment_start") == left_byte
                and isinstance(item.get("segment_end"), int)
                and item["segment_end"] >= right_byte
                and tuple(sorted(set(item["source_urls"]))) == urls
                for item in output
            ):
                continue  # Prefer a fully covered punctuated unit over its core.
            run = next(
                (
                    run
                    for run in runs
                    if run[0]["segment_start"]
                    <= left_byte
                    < right_byte
                    <= max(item["segment_end"] for item in run)
                ),
                None,
            )
            if run is None:
                continue
            witnesses = [
                item
                for item in run
                if item["segment_start"] < right_byte
                and item["segment_end"] > left_byte
            ]
            projected = {
                **witnesses[0],
                "text": statement,
                "source_urls": list(urls),
                "segment_start": left_byte,
                "segment_end": right_byte,
                "confidence_scores": [],
                "grounding_chunk_indices": sorted(
                    {
                        index
                        for item in witnesses
                        for index in item.get("grounding_chunk_indices", [])
                        if type(index) is int
                    }
                ),
                "span_projection": "covered_citation_assertion_v1",
                "supporting_segments": [
                    {"start": item["segment_start"], "end": item["segment_end"]}
                    for item in witnesses
                ],
            }
            key = _claim_key(projected) + (tuple(urls),)
            if key not in seen:
                output.append(projected)
                seen.add(key)
    return output[:50]


def _bound_span(raw: dict[str, Any], claim: dict[str, Any]) -> tuple[int, int] | None:
    text = raw["text"]
    if "gemini_google_search" in (raw.get("provider"), claim.get("provider")):
        part = _verified_provider_part(raw, claim)
        if part is None:
            return None
        parts = claim["provenance_artifact"]["response_parts"]
        if "".join(parts) != text:
            return None
        prefix = sum(len(value) for value in parts[: claim["part_index"]])
        data = part.encode("utf-8")
        start = prefix + len(data[: claim["segment_start"]].decode("utf-8"))
        end = prefix + len(data[: claim["segment_end"]].decode("utf-8"))
        return start, end
    statement = claim["text"]
    if statement and text.count(statement) == 1:
        start = text.index(statement)
        if (start, start + len(statement)) in _citation_units(text):
            return start, start + len(statement)
    return None


def render_assistant_citations(
    raw: dict[str, Any],
    *,
    admitted_claims: list[dict[str, Any]],
    admitted_source_urls: Collection[str],
) -> AssistantCitationRendering:
    """Return a separate canonical rendering, or unchanged text plus safe issues.

    Citation-free answers receive links only at admitted exact assertion spans.
    Repeated marker IDs have no identity or authority. Descriptive/resource links must name
    an actual locally admitted URL; never silently repoint a meaningful link.
    Callers must reject nonempty ``issues`` before publishing the answer.
    """
    text = raw.get("text")
    if not isinstance(text, str):
        return AssistantCitationRendering("", ("invalid_citation_response",))
    try:
        actual_destinations = reader_link_destinations(text)
        prose_links = _prose_links(text)
        parsed_destinations = tuple(
            normalize_reader_link_destination(link.destination) for link in prose_links
        )
        if prose_links:
            check_inline = reader_inline_link_checker(text)
            for link, destination in zip(prose_links, parsed_destinations, strict=True):
                if check_inline(text[link.start : link.end]) != (destination,):
                    return AssistantCitationRendering(
                        text, ("unresolved_citation_claim",)
                    )
                if link.kind not in {"autolink", "image"} and check_inline(link.label):
                    # A nested active label can swap local claim mappings even
                    # when the whole response contains the same ordered URLs.
                    return AssistantCitationRendering(
                        text, ("unresolved_citation_claim",)
                    )
    except ValueError:
        return AssistantCitationRendering(text, ("invalid_citation_response",))
    if actual_destinations != parsed_destinations:
        # The reader understands more Markdown than the exact-span renderer.
        # Never publish an active destination we cannot locate without guessing.
        return AssistantCitationRendering(text, ("unresolved_citation_claim",))
    _references, definition_spans = _reference_definitions(text)
    tokens = [
        _ProseLink(start, end, "", "", "opaque")
        for start, end in _citation_tokens(text)
        if not any(link.start < end and link.end > start for link in prose_links)
        and not any(left <= start < right for left, right in definition_spans)
    ]
    citations = sorted([*tokens, *prose_links], key=lambda link: (link.start, link.end))
    admitted_urls = {
        url
        for url in admitted_source_urls
        if isinstance(url, str)
        and is_canonical_public_https_url(url)
        and not any(
            character in "<>\\" or ord(character) < 32 or ord(character) == 127
            for character in url
        )
    }
    candidates = normalize_assistant_citation_claims(raw)
    bindings: dict[tuple[int, int], set[str]] = defaultdict(set)
    for admitted in admitted_claims[:50]:
        if not isinstance(admitted, dict) or not isinstance(
            admitted.get("source_urls"), list
        ):
            continue
        if not all(isinstance(url, str) for url in admitted["source_urls"]):
            continue
        for candidate in candidates:
            if _claim_key(candidate) != _claim_key(admitted):
                continue
            urls = (
                set(candidate["source_urls"])
                & set(admitted["source_urls"])
                & admitted_urls
            )
            if not urls:
                continue
            span = _bound_span(raw, candidate)
            if span is not None:
                bindings[span].update(urls)
    if not citations:
        # Google already supplies claim-to-source bindings. The model need not
        # manufacture matching Markdown links. Add citations to this reader
        # projection only; the provider text, hashes and claims remain intact.
        # Include the insertion point at EOF, including an unclosed code block.
        # A completed inline-code span ends before this sentinel; an open block
        # still masks it, so a link cannot be swallowed by literal content.
        mask = _literal_mask(text + " ")
        positions: dict[int, set[str]] = defaultdict(set)
        for (start, end), urls in bindings.items():
            position = end
            if (
                text[start:end].lstrip().startswith("|")
                and text[end - 1:end] == "|"
                and "\n" not in text[start:end]
                and not _escaped(text, end - 1)
            ):
                # A citation after the closing pipe would create an extra cell
                # that the Markdown reader may discard. Keep it in the row.
                position -= 1
            if (
                0 <= start < end <= len(text)
                and not mask[position]
                and any(not mask[index] and text[index].isalnum()
                        for index in range(start, end))
            ):
                positions[position].update(urls)
        used_urls = utf16_ordinal_sorted({url for urls in positions.values() for url in urls})
        labels = {url: index + 1 for index, url in enumerate(used_urls)}
        markdown = text
        for end, urls in sorted(positions.items(), reverse=True):
            links = " ".join(
                f"[{labels[url]}](<{_canonical_destination(url)}>)"
                for url in utf16_ordinal_sorted(urls)
            )
            markdown = markdown[:end] + " " + links + markdown[end:]
        try:
            expected_destinations = tuple(
                normalize_reader_link_destination(url)
                for _end, urls in sorted(positions.items())
                for url in utf16_ordinal_sorted(urls)
            )
            if reader_link_destinations(markdown) != expected_destinations:
                return AssistantCitationRendering(text, ("unresolved_citation_claim",))
        except ValueError:
            return AssistantCitationRendering(text, ("invalid_citation_response",))
        return AssistantCitationRendering(markdown, rendered_citation_count=len(positions))
    characters = list(text)
    for citation in citations:
        for index in range(citation.start, citation.end):
            if characters[index] not in "\r\n":
                characters[index] = " "
    view = "".join(characters)
    assignments: dict[tuple[int, int], list[_ProseLink]] = defaultdict(list)
    for citation in citations:
        start, end = citation.start, citation.end
        covering = [span for span in bindings if span[0] <= start < end <= span[1]]
        preceding = [
            span
            for span in bindings
            if span[1] <= start
            and re.fullmatch(r"[ \t]*(?:[.!?][ \t]*)?", view[span[1] : start])
        ]
        options = covering or preceding
        if not options:
            return AssistantCitationRendering(text, ("unresolved_citation_claim",))
        # Prefer the nearest complete assertion; never search by marker ID.
        selected = max(options, key=lambda span: (span[1], -span[0]))
        if citation.kind != "opaque" and not _placeholder_label(citation.label):
            if citation.destination not in bindings[selected]:
                return AssistantCitationRendering(text, ("unresolved_citation_claim",))
        assignments[selected].append(citation)
    used_urls = utf16_ordinal_sorted(
        {url for span in assignments for url in bindings[span]}
    )
    labels = {url: index + 1 for index, url in enumerate(used_urls)}
    edits = [(start, end, "") for start, end in definition_spans]
    for span, markers in assignments.items():
        links = " ".join(
            f"[{labels[url]}](<{_canonical_destination(url)}>)"
            for url in utf16_ordinal_sorted(bindings[span])
        )
        numbered = False
        for marker in markers:
            if marker.kind == "opaque" or _placeholder_label(marker.label):
                replacement = links if not numbered else ""
                numbered = True
            elif marker.kind == "autolink":
                replacement = f"<{_canonical_destination(marker.destination)}>"
            else:
                prefix = "!" if marker.kind == "image" else ""
                replacement = f"{prefix}[{marker.label}](<{_canonical_destination(marker.destination)}>)"
            edits.append((marker.start, marker.end, replacement))
    markdown = text
    for start, end, replacement in sorted(edits, reverse=True):
        markdown = markdown[:start] + replacement + markdown[end:]
    try:
        rendered_destinations = reader_link_destinations(markdown)
        allowed_destinations = {
            normalize_reader_link_destination(url) for url in admitted_urls
        }
    except ValueError:
        return AssistantCitationRendering(text, ("invalid_citation_response",))
    if any(url not in allowed_destinations for url in rendered_destinations):
        return AssistantCitationRendering(text, ("unresolved_citation_claim",))
    return AssistantCitationRendering(
        markdown, rendered_citation_count=len(assignments)
    )


__all__ = [
    "AssistantCitationRendering",
    "assistant_citation_display_statement",
    "normalize_assistant_citation_claims",
    "prose_link_destinations",
    "render_assistant_citations",
]
