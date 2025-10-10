"""
Legacy-compatible domain highlighting helpers for v1 quality package.
Prefer using backend.services.processing.keyword_highlighter in new code.
"""

from __future__ import annotations

from typing import List


def apply_domain_highlighting_to_quote(quote: str, domain_keywords: List[str]) -> str:
    """Apply simple bold highlighting for provided domain keywords.
    This is a minimal helper intended for editor/static analysis compatibility.
    """
    try:
        import re
        highlighted = quote
        for kw in sorted(set(k.lower() for k in domain_keywords or []), key=len, reverse=True):
            if not kw or len(kw) < 2:
                continue
            pattern = r"\b" + re.escape(kw) + r"\b"
            highlighted = re.sub(pattern, lambda m: f"**{m.group(0)}**", highlighted, flags=re.IGNORECASE)
        return highlighted
    except Exception:
        return quote

