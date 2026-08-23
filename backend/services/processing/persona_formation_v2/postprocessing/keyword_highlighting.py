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


_EVIDENCE_TEXT_KEYS = ("quote", "text", "dialogue", "excerpt", "content")


def _evidence_text(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        for key in _EVIDENCE_TEXT_KEYS:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _replace_evidence_text(item: Any, highlighted: str) -> Any:
    if isinstance(item, str):
        return highlighted
    if isinstance(item, dict):
        updated = dict(item)
        for key in _EVIDENCE_TEXT_KEYS:
            if isinstance(updated.get(key), str) and updated[key].strip():
                updated[key] = highlighted
                return updated
    return item


def _trait_value_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("value", "description", "name"):
            nested = value.get(key)
            if isinstance(nested, str):
                return nested
    return ""


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

        context = context or {}
        highlighter = ContextAwareKeywordHighlighter()

        # Build a small sample content for domain detection from existing evidence
        sample_parts: List[str] = []
        for p in personas:
            for trait in self.TRAITS_TO_ENHANCE:
                td = p.get(trait)
                if isinstance(td, dict):
                    ev = td.get("evidence") or []
                    if isinstance(ev, list):
                        sample_parts.extend(
                            text for item in ev if (text := _evidence_text(item))
                        )
        sample_content = "\n".join(sample_parts)[:3000]

        # Nothing can be highlighted without usable source evidence. Avoid a
        # pure-latency Gemini classification call in this common empty case.
        if not sample_content.strip():
            return personas

        performance_profile = getattr(
            context.get("performance_profile"),
            "value",
            context.get("performance_profile"),
        )
        # quality_fast preserves deterministic trait/source highlighting but
        # skips this optional model classification. It is presentation-only and
        # must not erase the profile's latency/token advantage.
        if str(performance_profile or "").strip().casefold() != "quality_fast":
            try:
                _ = await highlighter.detect_research_domain_and_keywords(
                    sample_content
                )
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
                evidence_texts = [
                    text for item in evidence if (text := _evidence_text(item))
                ]
                if not evidence_texts:
                    continue
                trait_value_str = _trait_value_text(td.get("value"))
                try:
                    highlighted_texts = highlighter.enhance_evidence_highlighting(
                        evidence_texts, trait, trait_value_str
                    )
                    highlighted_iter = iter(highlighted_texts)
                    td["evidence"] = [
                        _replace_evidence_text(item, next(highlighted_iter))
                        if _evidence_text(item)
                        else item
                        for item in evidence
                    ]
                except Exception:
                    # Fail open for any issues
                    pass

        return personas
