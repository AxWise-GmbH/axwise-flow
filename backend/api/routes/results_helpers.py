"""
Helper functions for results endpoints.

Extracted from app.py to improve maintainability.
"""

import os
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


def build_concat_and_spans(transcript: Optional[List[Dict[str, Any]]]) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Build concatenated text and document spans from transcript segments.
    
    Args:
        transcript: List of transcript segment dictionaries
        
    Returns:
        Tuple of (concatenated_text, document_spans)
    """
    try:
        order = []
        buckets: Dict[str, List[str]] = {}
        for seg in transcript or []:
            if not isinstance(seg, dict):
                continue
            did = seg.get("document_id") or "original_text"
            if did not in buckets:
                buckets[did] = []
                order.append(did)
            dlg = seg.get("dialogue") or seg.get("text") or ""
            if dlg:
                buckets[did].append(str(dlg))
        
        pieces, spans, cursor = [], [], 0
        sep = "\n\n"
        for did in order:
            block = "\n".join(buckets.get(did) or [])
            start, end = cursor, cursor + len(block)
            spans.append({"document_id": did, "start": start, "end": end})
            pieces.append(block)
            cursor = end + len(sep)
        return sep.join(pieces), spans
    except (TypeError, KeyError, AttributeError):
        return "", []


def should_hydrate_personas() -> bool:
    """Check if persona hydration is enabled via environment variable."""
    return str(
        os.getenv("ENABLE_FULL_RESULTS_PERSONAS_HYDRATION", "true")
    ).lower() in {"1", "true", "yes"}


def should_revalidate_personas() -> bool:
    """Check if on-read persona revalidation is enabled via environment variable."""
    return str(
        os.getenv("ENABLE_ON_READ_PERSONAS_REVALIDATION", "true")
    ).lower() in {"1", "true", "yes"}


def hydrate_persona_evidence(
    personas: List[Dict[str, Any]],
    scoped_text: str,
    doc_spans: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """
    Hydrate persona evidence with document IDs and offsets.
    
    Modifies personas in place.
    
    Args:
        personas: List of persona dictionaries
        scoped_text: The source text to search for evidence
        doc_spans: Optional document span information
    """
    if not scoped_text or not scoped_text.strip():
        return
        
    try:
        from backend.services.processing.evidence_linking_service import (
            EvidenceLinkingService,
        )

        svc = EvidenceLinkingService(None)
        svc.enable_v2 = True
        scope_meta = {
            "speaker": "Interviewee",
            "speaker_role": "Interviewee",
            "document_id": "original_text",
        }
        if doc_spans:
            scope_meta["doc_spans"] = doc_spans

        trait_names = [
            "demographics",
            "goals_and_motivations",
            "challenges_and_frustrations",
            "key_quotes",
        ]

        for p in personas:
            try:
                attributes = {
                    tn: {"value": (p.get(tn, {}) or {}).get("value", "")}
                    for tn in trait_names
                }
                _, ev_map = svc.link_evidence_to_attributes_v2(
                    attributes,
                    scoped_text=scoped_text,
                    scope_meta=scope_meta,
                    protect_key_quotes=True,
                )
                for tn in trait_names:
                    trait = p.get(tn) or {}
                    items = ev_map.get(tn) or []
                    if items:
                        safe_items = _ensure_document_ids(items)
                        trait["evidence"] = safe_items
                        p[tn] = trait
                        _hydrate_populated_traits(p, tn, safe_items)
            except (KeyError, TypeError, AttributeError):
                continue
    except ImportError:
        logger.warning("[HYDRATION] EvidenceLinkingService not available")


def _ensure_document_ids(items: List[Any]) -> List[Any]:
    """Ensure all items have non-empty document_id."""
    safe_items = []
    for it in items:
        if isinstance(it, dict):
            it2 = dict(it)
            if not (it2.get("document_id") or "").strip():
                it2["document_id"] = "original_text"
            safe_items.append(it2)
        else:
            safe_items.append(it)
    return safe_items


def _hydrate_populated_traits(
    persona: Dict[str, Any], trait_name: str, items: List[Any]
) -> None:
    """Hydrate populated_traits section if present."""
    try:
        if isinstance(persona.get("populated_traits"), dict):
            pt = dict(persona.get("populated_traits") or {})
            if isinstance(pt.get(trait_name), dict):
                pt[trait_name] = dict(pt[trait_name])
                pt[trait_name]["evidence"] = items
                persona["populated_traits"] = pt
    except (KeyError, TypeError, AttributeError):
        pass

