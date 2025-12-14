"""
Persona Formation V2 — Domain Keyword Highlighting (flagged, default ON)

Thin adapter around ContextAwareKeywordHighlighter to enhance evidence quotes
for selected persona traits while failing open on any error.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.services.processing.keyword_highlighter import (
    ContextAwareKeywordHighlighter,
)


class PersonaKeywordHighlighter:
    """Post-processor to enhance evidence highlighting across personas."""

    TRAITS_TO_ENHANCE = [
        "demographics",
        "goals_and_motivations",
        "challenges_and_frustrations",
        # Optionally include key_quotes if desired; keep conservative initially
        # "key_quotes",
    ]

    async def enhance(
        self, personas: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        if not personas:
            return personas

        highlighter = ContextAwareKeywordHighlighter()

        # Build a small sample content for domain detection from existing evidence
        sample_parts: List[str] = []
        for p in personas:
            for trait in self.TRAITS_TO_ENHANCE:
                td = p.get(trait)
                if isinstance(td, dict):
                    ev = td.get("evidence") or []
                    if isinstance(ev, list):
                        sample_parts.extend([str(q) for q in ev if isinstance(q, str)])
        sample_content = "\n".join(sample_parts)[:3000]

        # Detect domain keywords (fails open)
        try:
            _ = await highlighter.detect_research_domain_and_keywords(sample_content)
        except Exception:
            pass

        # Enhance evidence for selected traits
        for p in personas:
            for trait in self.TRAITS_TO_ENHANCE:
                td = p.get(trait)
                if not isinstance(td, dict):
                    continue
                evidence = td.get("evidence")
                if not isinstance(evidence, list) or not evidence:
                    continue
                trait_value = td.get("value")
                trait_value_str = str(trait_value) if trait_value is not None else ""
                try:
                    enhanced = highlighter.enhance_evidence_highlighting(
                        evidence, trait, trait_value_str
                    )
                    td["evidence"] = enhanced
                except Exception:
                    # Fail open for any issues
                    pass

        return personas

