"""
Name extraction utilities for persona naming grounded in interview text.

Prefers names that actually appear in the dialogues; falls back gracefully.
"""
from typing import List, Tuple
import re
from collections import Counter

# Common speaker labels to ignore
_IGNORED_SPEAKERS = {"interviewer", "researcher", "moderator", "host", "system"}

# Common stopwords/role words not to treat as names
_ROLE_WORDS = {"the", "a", "an", "manager", "accountant", "engineer", "pm", "director", "owner"}


def _extract_speaker_prefix_names(dialogues: List[str]) -> List[str]:
    """Extract names that appear as speaker prefixes like 'Petra: ...'."""
    names: List[str] = []
    for line in dialogues:
        if not line:
            continue
        # "Name: text" at line start
        m = re.match(r"^\s*([A-Z][a-z]+)\s*:\s+", line)
        if m:
            name = m.group(1)
            if name and name.lower() not in _IGNORED_SPEAKERS:
                names.append(name)
    return names


def _extract_inline_introductions(dialogues: List[str]) -> List[str]:
    """Extract names from simple self-intro patterns like "I'm Petra"."""
    names: List[str] = []
    pat = re.compile(r"\b(?:I'm|I am|My name is)\s+([A-Z][a-z]+)\b")
    for line in dialogues:
        for m in pat.finditer(line or ""):
            name = m.group(1)
            if name and name.lower() not in _IGNORED_SPEAKERS:
                names.append(name)
    return names


def extract_person_name_candidates(dialogues: List[str]) -> List[str]:
    """Return likely person-name candidates from dialogues, most frequent first."""
    if not dialogues:
        return []
    candidates: List[str] = []
    candidates += _extract_speaker_prefix_names(dialogues)
    candidates += _extract_inline_introductions(dialogues)

    if not candidates:
        return []

    freq = Counter(candidates)
    # Sort by frequency desc then alphabetically for stability
    sorted_names = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
    return [n for n, _ in sorted_names]


def is_generic_archetype_name(name: str) -> bool:
    """Heuristic: names starting with 'The ' are archetype titles, not human names."""
    if not name:
        return True
    name = name.strip()
    if name.lower() in {"unknown", "untitled", "persona"}:
        return True
    return name.startswith("The ")

