"""Project exact grounding spans onto complete Markdown assertions.

Provider grounding segments can stop inside inline code or consist entirely of
table syntax. Their byte attribution is valid, but they are not standalone facts.
Keep only complete units already covered by one support, or by overlapping or
contiguous supports with the same sources. Never expand across unsupported bytes.
This is structural claim eligibility, not a test that a source entails a claim.
"""

from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from typing import Any


_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
_HEADING = re.compile(r"^ {0,3}#{1,6}(?:\s|$)")
_LIST_PREFIX = re.compile(r"^ {0,3}(?:[-+*]|\d+[.)])\s+")
_CHECKBOX_PREFIX = re.compile(r"\[[ xX]\][ \t]+")
_QUOTE_PREFIX = re.compile(r"^ {0,3}(?:> ?)+")
_BACKTICKS = re.compile(r"`+")
_SENTENCE_END = re.compile(r"[.!?]+[\"'\u201d\u2019)\]*_~]*(?=\s|$)")
_MAX_CLAIMS = 50
_MAX_FACT_CHARACTERS = 4_000


def _trim_span(text: str, start: int, end: int) -> tuple[int, int]:
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end - 1].isspace():
        end -= 1
    return start, end


def _table_separator(line: str) -> bool:
    cells = line.strip().strip("|").split("|")
    return bool(cells) and all(re.fullmatch(r"\s*:?-{3,}:?\s*", cell) for cell in cells)


def _inline_code_mask(text: str) -> bytearray:
    """Protect variable-length code spans, including dots within expressions."""
    mask = bytearray(len(text))
    cursor = 0
    while match := _BACKTICKS.search(text, cursor):
        start, opener_end = match.span()
        backslashes = 0
        while start > backslashes and text[start - backslashes - 1] == "\\":
            backslashes += 1
        if backslashes % 2:
            cursor = opener_end
            continue
        marker = text[start:opener_end]
        closing = re.compile(r"(?<!`)" + re.escape(marker) + r"(?!`)").search(
            text, opener_end
        )
        if closing is None:
            # An unfinished code span cannot lend its tokens to a prose claim.
            end = text.find("\n", opener_end)
            end = len(text) if end < 0 else end
        else:
            end = closing.end()
        mask[start:end] = b"\1" * (end - start)
        cursor = end
    for match in re.finditer(r"\{\{[^\n]*?\}\}", text):
        mask[match.start() : match.end()] = b"\1" * (match.end() - match.start())
    for match in re.finditer(r"https?://[^\s<>`)\]]+", text):
        end = match.end()
        while end > match.start() and text[end - 1] in ".,;!?":
            end -= 1
        mask[match.start() : end] = b"\1" * (end - match.start())
    return mask


def _sentence_core(statement: str) -> str | None:
    """Allow uncited terminal punctuation without adding it to the claim span."""
    punctuation = re.search(r"[.!?]+$", statement)
    if punctuation is None:
        return None
    mask = _inline_code_mask(statement)
    if any(mask[punctuation.start() :]) or any(
        character == "|" and not mask[index]
        for index, character in enumerate(statement)
    ):
        return None  # Code tokens and table cells keep their full-unit boundary.
    return statement[: punctuation.start()] or None


def _markdown_assertions(text: str) -> list[tuple[int, int]]:
    """Return exact character spans; never reinterpret a code fragment as prose."""
    lines: list[tuple[int, int, str]] = []
    offset = 0
    for line in text.splitlines(keepends=True):
        value = line.rstrip("\r\n")
        lines.append((offset, offset + len(value), value))
        offset += len(line)
    mask = _inline_code_mask(text)
    units: list[tuple[int, int]] = []
    paragraph: tuple[int, int] | None = None
    fence: str | None = None
    table = False

    def keep(start: int, end: int) -> None:
        start, end = _trim_span(text, start, end)
        if start < end and any(
            text[index].isalnum() and not mask[index] for index in range(start, end)
        ):
            units.append((start, end))

    def flush() -> None:
        nonlocal paragraph
        if paragraph is None:
            return
        start, end = paragraph
        cursor = start
        for match in _SENTENCE_END.finditer(text, start, end):
            if mask[match.start()]:
                continue
            keep(cursor, match.end())
            cursor = match.end()
        keep(cursor, end)
        paragraph = None

    for index, (start, end, line) in enumerate(lines):
        quote = _QUOTE_PREFIX.match(line)
        if quote:
            start += quote.end()
            line = line[quote.end() :]
        marker = _FENCE.match(line)
        if fence is not None:
            if (
                marker
                and marker[1][0] == fence[0]
                and len(marker[1]) >= len(fence)
                and not marker[2].strip()
            ):
                fence = None
            continue
        if marker:
            flush()
            fence = marker[1]
            table = False
            continue
        next_separator = index + 1 < len(lines) and _table_separator(
            lines[index + 1][2]
        )
        if "|" in line and next_separator:
            flush()
            table = True
            continue  # Column headers are context, not a supported assertion.
        if _table_separator(line) or re.fullmatch(r"\s*(?:[*_-]\s*){3,}", line):
            flush()
            continue
        if table and "|" in line:
            flush()
            keep(start, end)  # Require the complete key/value row, not one cell.
            continue
        table = False
        if (
            not line.strip()
            or _HEADING.match(line)
            or (paragraph is None and line.startswith(("    ", "\t")))
        ):
            flush()
            continue
        bullet = _LIST_PREFIX.match(line)
        if bullet:
            flush()
            start += bullet.end()
            checkbox = _CHECKBOX_PREFIX.match(text, start, end)
            if checkbox:
                start = checkbox.end()
        if paragraph is None:
            paragraph = (start, end)
        else:
            paragraph = (paragraph[0], end)
    flush()
    return units


def _verified_provider_part(raw: dict[str, Any], claim: dict[str, Any]) -> str | None:
    """Validate the original Gemini adapter's response/part/UTF-8 binding."""
    provenance = claim.get("provenance_artifact")
    if not isinstance(provenance, dict):
        return None
    text = raw.get("text")
    response_hash = raw.get("provider_response_hash")
    parts = provenance.get("response_parts")
    index = claim.get("part_index")
    start, end = claim.get("segment_start"), claim.get("segment_end")
    if (
        not isinstance(text, str)
        or hashlib.sha256(text.encode("utf-8")).hexdigest() != response_hash
        or claim.get("provider_response_hash") != response_hash
        or provenance.get("provider_response_sha256") != response_hash
        or provenance.get("provider_response_text") != text
        or provenance.get("artifact_type") != "provider_response_part"
        or not isinstance(parts, list)
        or not 1 <= len(parts) <= 50
        or not all(isinstance(part, str) for part in parts)
        or type(index) is not int
        or not 0 <= index < len(parts)
        or provenance.get("part_index") != index
        or type(start) is not int
        or type(end) is not int
        or claim.get("offset_unit") != "utf8_bytes"
        or claim.get("span_target") != "provider_response_part"
    ):
        return None
    part = parts[index]
    hashes = [hashlib.sha256(value.encode("utf-8")).hexdigest() for value in parts]
    if (
        provenance.get("text") != part
        or part not in text
        or provenance.get("sha256") != hashes[index]
        or provenance.get("response_part_hashes") != hashes
        or provenance.get("response_parts_sha256")
        != hashlib.sha256("\n".join(hashes).encode("ascii")).hexdigest()
    ):
        return None
    data = part.encode("utf-8")
    if not 0 <= start < end <= len(data):
        return None
    try:
        return part if data[start:end].decode("utf-8") == claim.get("text") else None
    except UnicodeDecodeError:
        return None


def normalize_assistant_claims(raw: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep complete supported Markdown units without modifying the raw ledger.

    Direct-fetch claims remain exact excerpts: assistant_fallback_markdown owns
    that separate, stricter source/byte verification path. Unversioned adapters
    may retain exact complete units, but cannot join unprovenanced fragments.
    """
    claims = raw.get("claims")
    if not isinstance(claims, list):
        return []
    if raw.get("provider") == "searxng_direct_fetch":
        return claims[:_MAX_CLAIMS]
    groups: dict[tuple[str, int, tuple[str, ...]], list[dict[str, Any]]] = defaultdict(
        list
    )
    output: list[dict[str, Any]] = []
    text = raw.get("text")
    if not isinstance(text, str):
        return []
    fallback_units: set[str] | None = None
    for claim in claims[:_MAX_CLAIMS]:
        if not isinstance(claim, dict) or not isinstance(claim.get("text"), str):
            continue
        urls = claim.get("source_urls")
        if (
            not isinstance(urls, list)
            or not urls
            or not all(isinstance(url, str) and url for url in urls)
        ):
            continue
        if (
            raw.get("provider") == "gemini_google_search"
            or claim.get("provider") == "gemini_google_search"
        ):
            part = _verified_provider_part(raw, claim)
            if part is not None:
                groups[(part, claim["part_index"], tuple(sorted(set(urls))))].append(
                    claim
                )
        else:
            if fallback_units is None:
                fallback_units = {
                    text[start:end] for start, end in _markdown_assertions(text)
                }
            statement = claim["text"].strip()
            if statement in fallback_units and len(statement) <= _MAX_FACT_CHARACTERS:
                output.append({**claim, "text": statement})

    assertion_cache: dict[str, list[tuple[int, int, str]]] = {}
    for (part, _index, urls), supports in groups.items():
        byte_offsets = [0]
        for character in part:
            byte_offsets.append(byte_offsets[-1] + len(character.encode("utf-8")))
        if part not in assertion_cache:
            assertion_cache[part] = [
                (byte_offsets[start], byte_offsets[end], part[start:end])
                for start, end in _markdown_assertions(part)
            ]
        units = assertion_cache[part]
        covered: list[list[dict[str, Any]]] = []
        right = -1
        for support in sorted(
            supports, key=lambda item: (item["segment_start"], item["segment_end"])
        ):
            if support["segment_start"] > right:
                covered.append([])
            covered[-1].append(support)
            right = max(right, support["segment_end"])
        for run in covered:
            left = run[0]["segment_start"]
            right = max(item["segment_end"] for item in run)
            for start, end, statement in units:
                if not left <= start < end <= right:
                    core = _sentence_core(statement)
                    if core is None:
                        continue
                    # Prefer the original punctuated unit whenever it is fully
                    # supported; otherwise select only its exact supported core.
                    end -= len(statement[len(core) :].encode("utf-8"))
                    statement = core
                if (
                    not left <= start < end <= right
                    or len(statement) > _MAX_FACT_CHARACTERS
                ):
                    continue
                witnesses = [
                    item
                    for item in run
                    if item["segment_start"] < end and item["segment_end"] > start
                ]
                if len(witnesses) == 1 and (start, end) == (
                    witnesses[0]["segment_start"],
                    witnesses[0]["segment_end"],
                ):
                    output.append(dict(witnesses[0]))
                    continue
                output.append(
                    {
                        **witnesses[0],
                        "text": statement,
                        "source_urls": list(urls),
                        "segment_start": start,
                        "segment_end": end,
                        "grounding_chunk_indices": sorted(
                            {
                                index
                                for item in witnesses
                                for index in item.get("grounding_chunk_indices", [])
                                if type(index) is int
                            }
                        ),
                        "confidence_scores": [],  # Never invent aggregate confidence.
                        "span_projection": "covered_markdown_assertion_v1",
                        "supporting_segments": [
                            {"start": item["segment_start"], "end": item["segment_end"]}
                            for item in witnesses
                        ],
                    }
                )
    return output[:_MAX_CLAIMS]


__all__ = ["normalize_assistant_claims"]
