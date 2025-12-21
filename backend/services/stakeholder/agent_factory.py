import os
import logging
from typing import List, Dict, Any

from pydantic_ai import Agent
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

# Schema types used by Agents
from backend.schemas import (
    ConsensusArea,
    ConflictZone,
    InfluenceNetwork,
    MultiStakeholderSummary,
)

logger = logging.getLogger(__name__)


class StakeholderAgentFactory:
    """Factory for creating specialized stakeholder analysis agents.

    This encapsulates PydanticAI Agent construction, model selection, and
    memoizes agents for reuse. It allows StakeholderAnalysisService to
    remain agnostic of model wiring and makes refactoring safer.
    """

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Missing GEMINI_API_KEY or GOOGLE_API_KEY")

        # Prefer models/gemini-3-flash-preview for speed and quality balance
        model_name = os.getenv("STAKEHOLDER_GEMINI_MODEL", "models/gemini-3-flash-preview")
        provider = GoogleProvider(api_key=api_key)
        self.gemini_model = GoogleModel(model_name, provider=provider)
        self._agent_cache: Dict[str, Agent] = {}
        logger.info(
            f"[AGENT_FACTORY] Initialized StakeholderAgentFactory with model {model_name}"
        )

    def get_consensus_agent(self) -> Agent:
        if "consensus" not in self._agent_cache:
            self._agent_cache["consensus"] = Agent(
                model=self.gemini_model,
                output_type=List[ConsensusArea],
                system_prompt=(
                    "You are a stakeholder consensus analyst. Analyze stakeholder data to identify areas where stakeholders agree.\n\n"
                    "For each consensus area, provide:\n"
                    "- topic: Clear topic name where stakeholders agree\n"
                    "- participating_stakeholders: List of stakeholder IDs who agree\n"
                    "- shared_insights: List of common insights or viewpoints\n"
                    "- business_impact: Assessment of business impact\n\n"
                    "Focus on genuine agreement patterns, not forced consensus."
                ),
            )
        return self._agent_cache["consensus"]

    def get_conflict_agent(self) -> Agent:
        if "conflict" not in self._agent_cache:
            self._agent_cache["conflict"] = Agent(
                model=self.gemini_model,
                output_type=List[ConflictZone],
                system_prompt=(
                    "You are a stakeholder conflict analyst. Identify areas where stakeholders disagree or have conflicting interests.\n\n"
                    "For each conflict zone, provide:\n"
                    "- topic: Clear topic name where conflict exists\n"
                    "- conflicting_stakeholders: List of stakeholder IDs in conflict\n"
                    "- conflict_severity: Level as \"low\", \"medium\", \"high\", or \"critical\"\n"
                    "- potential_resolutions: List of potential resolution strategies\n"
                    "- business_risk: Assessment of business risk from this conflict\n\n"
                    "Focus on real tensions and disagreements, not minor differences."
                ),
            )
        return self._agent_cache["conflict"]

    def get_influence_agent(self) -> Agent:
        if "influence" not in self._agent_cache:
            self._agent_cache["influence"] = Agent(
                model=self.gemini_model,
                output_type=List[InfluenceNetwork],
                system_prompt=(
                    "You are a stakeholder influence analyst. Map how stakeholders influence each other's decisions and opinions.\n\n"
                    "For each influence relationship, provide:\n"
                    "- influencer: Stakeholder ID who has influence\n"
                    "- influenced: List of stakeholder IDs who are influenced\n"
                    "- influence_type: Type as \"decision\", \"opinion\", \"adoption\", or \"resistance\"\n"
                    "- strength: Influence strength from 0.0 to 1.0\n"
                    "- pathway: Description of how influence flows\n\n"
                    "Focus on real power dynamics and influence patterns."
                ),
            )
        return self._agent_cache["influence"]

    def get_summary_agent(self) -> Agent:
        if "summary" not in self._agent_cache:
            self._agent_cache["summary"] = Agent(
                model=self.gemini_model,
                output_type=MultiStakeholderSummary,
                system_prompt=(
                    "You are a multi-stakeholder business analyst. Generate comprehensive insights and actionable recommendations based on stakeholder intelligence and cross-stakeholder patterns.\n\n"
                    "Analyze the provided stakeholder data and cross-stakeholder patterns to create:\n\n"
                    "1. **Key Insights**: 3-5 critical insights that emerge from the multi-stakeholder analysis\n"
                    "2. **Implementation Recommendations**: 3-5 specific, actionable recommendations for moving forward\n"
                    "3. **Risk Assessment**: Identify and assess key risks with mitigation strategies\n"
                    "4. **Success Metrics**: Define measurable success criteria\n"
                    "5. **Next Steps**: Prioritized action items for stakeholder engagement\n\n"
                    "Focus on business impact, alignment, feasibility, risks, and specificity."
                ),
            )
        return self._agent_cache["summary"]

    def get_theme_agent(self) -> Agent:
        if "theme" not in self._agent_cache:
            self._agent_cache["theme"] = Agent(
                model=self.gemini_model,
                output_type=Dict[str, Any],
                system_prompt=(
                    "You are a theme-stakeholder attribution analyst. Analyze themes and determine which stakeholders contributed to each theme and their distribution.\n\n"
                    "Return a JSON object with:\n"
                    "- stakeholder_contributions: List of {stakeholder_id, contribution_strength, context}\n"
                    "- theme_distribution: Analysis of how the theme spreads across stakeholder types\n"
                    "- dominant_stakeholder: The stakeholder who contributed most to this theme\n"
                    "- theme_consensus_level: How much stakeholders agree on this theme (0.0 to 1.0)\n"
                ),
            )
        return self._agent_cache["theme"]

