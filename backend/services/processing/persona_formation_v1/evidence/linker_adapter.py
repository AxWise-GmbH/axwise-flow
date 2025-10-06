"""Thin adapter around EvidenceLinkingService V2 for persona formation V1.

Centralizes calls to link_evidence_to_attributes_v2 so the monolith does not
import or depend on service internals directly. Behavior is unchanged.
"""

from __future__ import annotations
from typing import Any, Dict, Optional, Tuple


def link_evidence_v2(
    evidence_linking_service: Any,
    data: Dict[str, Any],
    *,
    scoped_text: Optional[str] = None,
    scope_meta: Optional[Dict[str, Any]] = None,
    **kwargs: Any,
) -> Tuple[Dict[str, Any], Any]:
    """Link evidence using the service's V2 method and return (data, evidence_map).

    This is a direct pass-through to EvidenceLinkingService.link_evidence_to_attributes_v2.
    It preserves the original return contract used by the monolith call sites.
    """
    return evidence_linking_service.link_evidence_to_attributes_v2(
        data, scoped_text=scoped_text, scope_meta=scope_meta, **kwargs
    )
