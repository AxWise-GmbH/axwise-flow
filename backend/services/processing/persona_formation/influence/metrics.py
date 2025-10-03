"""
Influence metric calculations for personas.

Extracted from PersonaFormationService._calculate_persona_influence_metrics to keep
logic pure and testable.
"""
from typing import Any, Dict
import logging

logger = logging.getLogger(__name__)


def calculate_persona_influence_metrics(persona: Dict[str, Any]) -> Dict[str, float]:
    """Calculate differentiated stakeholder influence metrics based on persona characteristics.

    Returns a dict with decision_power, technical_influence, and budget_influence in [0.0, 1.0].
    Mirrors legacy service behavior for parity.
    """
    try:
        # Extract persona characteristics
        name = str(persona.get("name", "")).lower()
        description = str(persona.get("description", "")).lower()
        archetype = str(persona.get("archetype", "")).lower()

        # Extract demographics information for additional context
        demographics = persona.get("demographics", {})
        roles_info = ""
        professional_context = ""

        if isinstance(demographics, dict):
            # Handle structured demographics
            if "roles" in demographics:
                roles_data = demographics["roles"]
                if isinstance(roles_data, dict) and "value" in roles_data:
                    roles_info = str(roles_data["value"]).lower()
                elif isinstance(roles_data, str):
                    roles_info = roles_data.lower()

            if "professional_context" in demographics:
                context_data = demographics["professional_context"]
                if isinstance(context_data, dict) and "value" in context_data:
                    professional_context = str(context_data["value"]).lower()
                elif isinstance(context_data, str):
                    professional_context = context_data.lower()

        # Combine all text for analysis
        combined_text = f"{name} {description} {archetype} {roles_info} {professional_context}".lower()

        # Initialize default scores
        decision_power = 0.5
        technical_influence = 0.5
        budget_influence = 0.5

        # Mobile Gaming/Publishing Industry Leaders (high decision power, high budget influence)
        if any(
            keyword in combined_text
            for keyword in [
                "publishing lead",
                "hypercasual",
                "mobile publishing",
                "game publishing",
                "publishing director",
                "publishing manager",
            ]
        ):
            decision_power = 0.95
            budget_influence = 0.9
            technical_influence = 0.7

        # Mobile Marketing/Brand Campaign Managers (high decision power, moderate budget influence)
        elif any(
            keyword in combined_text
            for keyword in [
                "brand campaign manager",
                "mobile brand",
                "campaign manager",
                "mobile marketing",
                "marketing director",
                "brand manager",
            ]
        ):
            decision_power = 0.85
            budget_influence = 0.8
            technical_influence = 0.6

        # Business Development Leaders (high decision power, high budget influence)
        elif any(
            keyword in combined_text
            for keyword in [
                "business development lead",
                "bd lead",
                "business development",
                "partnership",
                "strategic",
            ]
        ):
            decision_power = 0.9
            budget_influence = 0.85
            technical_influence = 0.5

        # Creative Agency Directors (high decision power, high budget influence)
        elif any(
            keyword in combined_text
            for keyword in [
                "agency director",
                "creative agency",
                "digital agency",
                "creative director",
                "agency lead",
            ]
        ):
            decision_power = 0.9
            budget_influence = 0.9
            technical_influence = 0.7

        # General Decision makers (high decision power, high budget influence)
        elif any(
            keyword in combined_text
            for keyword in [
                "manager",
                "director",
                "ceo",
                "owner",
                "executive",
                "leader",
                "boss",
                "decision maker",
                "authority",
                "supervisor",
                "head of",
                "chief",
            ]
        ):
            decision_power = 0.9
            budget_influence = 0.9
            technical_influence = 0.6

        # Real estate agents and professionals (high decision power, moderate budget influence)
        elif any(
            keyword in combined_text
            for keyword in [
                "agent",
                "real estate",
                "broker",
                "property",
                "sales",
                "advisor",
                "consultant",
                "professional",
                "expert",
            ]
        ):
            decision_power = 0.8
            technical_influence = 0.7
            budget_influence = 0.6

        # Elderly or retired individuals (moderate decision power, high budget influence)
        elif any(
            keyword in combined_text
            for keyword in [
                "elderly",
                "retired",
                "senior",
                "aging",
                "older",
                "pension",
                "grandmother",
                "grandfather",
            ]
        ):
            decision_power = 0.7
            technical_influence = 0.3
            budget_influence = 0.8

        # Adult children managing parents' property (high budget influence, moderate decision power)
        elif any(
            keyword in combined_text
            for keyword in [
                "adult child",
                "daughter",
                "son",
                "coordinator",
                "manager",
                "caregiver",
                "overburdened",
                "managing",
                "responsible for",
            ]
        ):
            decision_power = 0.4
            technical_influence = 0.5
            budget_influence = 0.9

        # Technical professionals (high technical influence)
        elif any(
            keyword in combined_text
            for keyword in [
                "architect",
                "engineer",
                "technical",
                "it",
                "developer",
                "designer",
                "specialist",
                "technician",
            ]
        ):
            decision_power = 0.6
            technical_influence = 0.9
            budget_influence = 0.5

        # Homeowners and property owners (moderate across all metrics)
        elif any(
            keyword in combined_text
            for keyword in [
                "homeowner",
                "property owner",
                "resident",
                "home",
                "house",
                "property",
            ]
        ):
            decision_power = 0.6
            technical_influence = 0.4
            budget_influence = 0.7

        # Default for primary customers
        else:
            decision_power = 0.5
            technical_influence = 0.4
            budget_influence = 0.6

        # Log the calculated influence metrics for debugging
        persona_name = persona.get("name", "Unknown")
        logger.info(
            f"[INFLUENCE_CALCULATION] {persona_name}: "
            f"decision_power={decision_power:.2f}, "
            f"technical_influence={technical_influence:.2f}, "
            f"budget_influence={budget_influence:.2f} "
            f"(based on: {combined_text[:100]}...)"
        )

        return {
            "decision_power": decision_power,
            "technical_influence": technical_influence,
            "budget_influence": budget_influence,
        }

    except Exception as e:
        logger.error(f"Error calculating persona influence metrics: {str(e)}")
        # Return default values on error
        return {
            "decision_power": 0.5,
            "technical_influence": 0.5,
            "budget_influence": 0.5,
        }

