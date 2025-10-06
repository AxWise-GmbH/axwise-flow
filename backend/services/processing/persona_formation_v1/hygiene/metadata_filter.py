"""Metadata helpers for persona formation V1.

Centralizes common metadata enrichment patterns for generated personas.
"""
from __future__ import annotations
import time
from typing import Any, Dict, Optional


def add_generation_metadata(
    persona: Dict[str, Any],
    *,
    speaker: Optional[str],
    generation_method: str,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Add a standard metadata block to a persona dictionary in-place and return it.

    - Always sets speaker, generation_method, timestamp
    - Merges any extra fields provided
    """
    meta = {
        "speaker": speaker,
        "generation_method": generation_method,
        "timestamp": time.time(),
    }
    if extra:
        try:
            meta.update({k: v for k, v in extra.items() if v is not None})
        except Exception:
            pass
    persona["metadata"] = meta
    return persona

