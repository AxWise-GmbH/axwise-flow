"""Speaker-based filtering helpers for persona formation V1.

These helpers centralize exclusion of non-interviewee content when aggregating
text for stakeholder-specific persona generation. Behavior mirrors the legacy
inline logic in persona_formation_service.py.
"""
from __future__ import annotations
from typing import Iterable, Tuple, Set, Any

_EXCLUDED_SPEAKERS = {"researcher", "interviewer", "moderator"}

def aggregate_stakeholder_text_excluding_non_interviewers(
    segments: Iterable[Any],
) -> Tuple[str, Set[str]]:
    """Aggregate text for a stakeholder while excluding non-interviewee speakers.

    Accepts either dict-like segments with keys {"text", "speaker"} or objects
    with attributes `.text` and optional `.speaker`.

    Returns a tuple of (aggregated_text, unique_speakers_set).
    """
    stakeholder_text_parts: list[str] = []
    speakers: Set[str] = set()

    for segment in segments:
        if isinstance(segment, dict):
            text = segment.get("text", "") or ""
            speaker = (segment.get("speaker") or "Unknown").strip()
        else:
            text = getattr(segment, "text", "") or ""
            speaker = (getattr(segment, "speaker", "Unknown") or "Unknown").strip()

        if speaker.lower() in _EXCLUDED_SPEAKERS:
            continue

        if speaker:
            speakers.add(speaker)
        if text:
            stakeholder_text_parts.append(f"\n{text}")

    aggregated = "".join(stakeholder_text_parts).strip()
    return aggregated, speakers

