"""
Pattern grouping utilities for persona formation.

Extracted from PersonaFormationService._group_patterns; keeps grouping logic pure.
"""
from typing import Any, Dict, List


def group_patterns(patterns: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Group patterns by similarity (type/category), preserving legacy behavior."""
    # Simple grouping by pattern type
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for pattern in patterns:
        pattern_type = pattern.get("type", "unknown")
        if not pattern_type or pattern_type == "unknown":
            pattern_type = pattern.get("category", "unknown")

        grouped.setdefault(pattern_type, []).append(pattern)

    # Convert to list of groups
    return list(grouped.values())

