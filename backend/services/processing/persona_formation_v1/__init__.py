"""
Persona Formation V1 - Legacy implementation preserved for backward compatibility.

This module contains the original persona formation logic which is used by:
- PatternPersonaOrchestrator (form_personas)
- StakeholderPersonaOrchestrator (form_personas_by_stakeholder)

The main entry point (persona_formation_service.py) delegates to V2 facade
for standard operations, falling back to V1 orchestrators for pattern-based
and stakeholder-aware persona formation.
"""

from .legacy_service import PersonaFormationService

__all__ = ["PersonaFormationService"]

