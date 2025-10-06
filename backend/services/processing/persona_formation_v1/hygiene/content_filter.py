"""Content hygiene helpers for persona formation V1.

Small, reusable checks and normalizations with zero behavior change.
"""
from __future__ import annotations
from typing import Optional


def is_empty_or_short_text(text: Optional[str], min_len: int = 10) -> bool:
    """True if text is None/empty or shorter than min_len once stripped."""
    if not isinstance(text, str):
        return True
    return len(text.strip()) < min_len

