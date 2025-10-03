"""
Fallback attribute construction helpers for Persona Formation.

Extracted from PersonaFormationService to keep the service thin and focused on
orchestration. Functions here are pure and do not depend on service state.
"""
from typing import Any, Dict, List
import logging

logger = logging.getLogger(__name__)


def create_fallback_attributes(patterns: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create fallback persona attributes from pattern analysis failure.

    Mirrors the legacy service behavior to preserve parity.
    """
    logger.info("Creating fallback attributes from patterns")

    # Default trait used for all fields in fallback mode
    default_trait = {
        "value": "Unknown",
        "confidence": 0.3,
        "evidence": ["Fallback due to analysis error"],
    }

    # Extract pattern descriptions for evidence/context
    pattern_descriptions = [
        p.get("description", "Unknown pattern") for p in patterns if p.get("description")
    ]

    # Structure compatible with downstream persona builder
    return {
        # Basic information
        "name": "Default Persona",
        "archetype": "Unknown",
        "description": "Default persona due to analysis error or low confidence",
        # Detailed attributes (new fields)
        "demographics": default_trait,
        "goals_and_motivations": default_trait,
        "skills_and_expertise": default_trait,
        "workflow_and_environment": default_trait,
        "challenges_and_frustrations": default_trait,
        "technology_and_tools": default_trait,
        "key_quotes": default_trait,
        # Legacy fields
        "role_context": default_trait,
        "key_responsibilities": default_trait,
        "tools_used": default_trait,
        "collaboration_style": default_trait,
        "analysis_approach": default_trait,
        "pain_points": default_trait,
        # Overall persona information
        "patterns": pattern_descriptions[:5],
        "confidence": 0.3,
        "evidence": ["Fallback due to analysis error"],
    }

