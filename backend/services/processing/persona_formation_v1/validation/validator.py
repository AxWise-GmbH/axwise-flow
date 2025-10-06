"""Thin wrappers for validation and fallback creation used by converters.

This module helps keep persona_formation_service.py slimmer by centralizing
how converter callbacks are created, without changing behavior.
"""
from __future__ import annotations
from typing import Any, Callable, Dict, List


def make_converter_callbacks(service: Any) -> Dict[str, Callable[..., Any]]:
    """Return the callbacks expected by simplified_to_full_converter.convert(...).

    All functions are delegated to the provided service instance, preserving
    existing behavior.
    """
    return {
        "validate_structured_demographics_fn": service._validate_structured_demographics,
        "create_clean_fallback_fn": service._create_clean_fallback_demographics,
        "create_minimal_fallback_fn": service._create_minimal_fallback_demographics,
        "assess_content_quality_fn": service._assess_content_quality,
        "assess_evidence_quality_fn": service._assess_evidence_quality,
        "extract_evidence_from_description_fn": service._extract_evidence_from_description,
    }

