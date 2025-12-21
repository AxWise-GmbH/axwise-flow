"""
Influence Metrics Calculator Module

Handles cross-stakeholder pattern analysis and influence metrics calculation.
Extracts influence calculation logic from the monolithic service.
"""

from typing import List, Dict, Any, Optional
import logging

from backend.domain.interfaces.llm_unified import ILLMService
from backend.schemas import (
    DetectedStakeholder,
    CrossStakeholderPatterns,
    ConsensusArea,
    ConflictZone,
    InfluenceNetwork,
)

logger = logging.getLogger(__name__)


class InfluenceMetricsCalculator:
    """
    Modular influence calculator that handles cross-stakeholder pattern analysis
    and influence metrics computation.
    """

    def __init__(self, llm_service: ILLMService):
        self.llm_service = llm_service
        self.pydantic_ai_available = False
        self.patterns_agent = None

        # Initialize PydanticAI agent if available
        self._initialize_patterns_agent()

    def _initialize_patterns_agent(self):
        """Initialize PydanticAI agent for cross-stakeholder pattern analysis."""
        try:
            import os
            from pydantic_ai import Agent, ModelSettings
            from pydantic_ai.models.google import GoogleModel
            from pydantic_ai.providers.google import GoogleProvider

            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if not api_key:
                logger.warning("No GEMINI_API_KEY found - patterns agent unavailable")
                return

            provider = GoogleProvider(api_key=api_key)
            # Create cross-stakeholder patterns agent
            self.patterns_agent = Agent(
                model=GoogleModel("models/gemini-3-flash-preview", provider=provider),
                system_prompt=self._get_patterns_analysis_prompt(),
                model_settings=ModelSettings(timeout=300),
                temperature=0,
            )
            self.pydantic_ai_available = True
            logger.info("Cross-stakeholder patterns agent initialized successfully")

        except Exception as e:
            logger.warning(f"Failed to initialize patterns agent: {e}")
            self.pydantic_ai_available = False

    def _get_patterns_analysis_prompt(self) -> str:
        """Get the system prompt for cross-stakeholder pattern analysis."""
        return """
You are an expert analyst specializing in cross-stakeholder pattern analysis.

Analyze the provided stakeholder data to identify:

1. **Consensus Areas**: Topics where stakeholders agree or align
2. **Conflict Zones**: Areas of disagreement or tension between stakeholders
3. **Influence Networks**: Power dynamics and influence relationships

For each pattern, provide:
- Clear description of the pattern
- Stakeholders involved
- Strength/intensity of the pattern (0.0 to 1.0)
- Business impact assessment
- Recommendations for addressing the pattern

Return structured JSON with consensus_areas, conflict_zones, and influence_networks arrays.
Focus on authentic, evidence-based patterns rather than generic responses.
"""

    async def analyze_patterns(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        files: List[Any],
    ) -> CrossStakeholderPatterns:
        """
        Analyze cross-stakeholder patterns and calculate influence metrics.

        Args:
            detected_stakeholders: Stakeholders to analyze patterns for
            files: Source files for pattern analysis

        Returns:
            Cross-stakeholder patterns analysis
        """
        logger.info(f"Analyzing patterns for {len(detected_stakeholders)} stakeholders")

        if len(detected_stakeholders) < 2:
            logger.warning("Insufficient stakeholders for pattern analysis")
            return self._create_minimal_patterns(detected_stakeholders)

        try:
            # Analyze consensus areas
            consensus_areas = await self._analyze_consensus_areas(
                detected_stakeholders, files
            )

            # Analyze conflict zones
            conflict_zones = await self._analyze_conflict_zones(
                detected_stakeholders, files
            )

            # Analyze influence networks
            influence_networks = await self._analyze_influence_networks(
                detected_stakeholders, files
            )

            # Calculate overall metrics
            pattern_metrics = self._calculate_pattern_metrics(
                consensus_areas, conflict_zones, influence_networks
            )

            return CrossStakeholderPatterns(
                consensus_areas=consensus_areas,
                conflict_zones=conflict_zones,
                influence_networks=influence_networks,
                pattern_strength=pattern_metrics["overall_strength"],
                analysis_confidence=pattern_metrics["confidence"],
                metadata=pattern_metrics,
            )

        except Exception as e:
            logger.error(f"Cross-stakeholder pattern analysis failed: {e}")
            return self._create_minimal_patterns(detected_stakeholders)

    async def _analyze_consensus_areas(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        files: List[Any],
    ) -> List[ConsensusArea]:
        """Analyze areas where stakeholders have consensus."""

        consensus_areas = []

        try:
            if self.pydantic_ai_available and self.patterns_agent:
                # Use LLM-based analysis
                consensus_areas = await self._llm_analyze_consensus(
                    detected_stakeholders, files
                )
            else:
                # Use heuristic-based analysis
                consensus_areas = self._heuristic_analyze_consensus(
                    detected_stakeholders
                )

        except Exception as e:
            logger.warning(f"Consensus analysis failed: {e}")
            consensus_areas = self._heuristic_analyze_consensus(detected_stakeholders)

        return consensus_areas

    async def _analyze_conflict_zones(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        files: List[Any],
    ) -> List[ConflictZone]:
        """Analyze areas where stakeholders have conflicts."""

        conflict_zones = []

        try:
            if self.pydantic_ai_available and self.patterns_agent:
                # Use LLM-based analysis
                conflict_zones = await self._llm_analyze_conflicts(
                    detected_stakeholders, files
                )
            else:
                # Use heuristic-based analysis
                conflict_zones = self._heuristic_analyze_conflicts(
                    detected_stakeholders
                )

        except Exception as e:
            logger.warning(f"Conflict analysis failed: {e}")
            conflict_zones = self._heuristic_analyze_conflicts(detected_stakeholders)

        return conflict_zones

    async def _analyze_influence_networks(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        files: List[Any],
    ) -> List[InfluenceNetwork]:
        """Analyze influence relationships between stakeholders."""

        influence_networks = []

        try:
            # Calculate influence relationships
            for i, stakeholder_a in enumerate(detected_stakeholders):
                for stakeholder_b in detected_stakeholders[i + 1 :]:
                    influence_relationship = self._calculate_influence_relationship(
                        stakeholder_a, stakeholder_b
                    )
                    if influence_relationship:
                        influence_networks.append(influence_relationship)

        except Exception as e:
            logger.warning(f"Influence network analysis failed: {e}")

        return influence_networks

    async def _llm_analyze_consensus(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        files: List[Any],
    ) -> List[ConsensusArea]:
        """Use LLM to analyze consensus areas."""

        try:
            # Prepare context for LLM analysis
            context = self._prepare_stakeholder_context(detected_stakeholders, files)
            context += (
                "\n\nFocus on identifying areas where stakeholders agree or align."
            )

            # Run LLM analysis
            result = await self.patterns_agent.run(context)

            # Parse consensus areas from result
            consensus_areas = self._parse_consensus_areas(result)
            return consensus_areas

        except Exception as e:
            logger.error(f"LLM consensus analysis failed: {e}")
            return []

    async def _llm_analyze_conflicts(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        files: List[Any],
    ) -> List[ConflictZone]:
        """Use LLM to analyze conflict zones."""

        try:
            # Prepare context for LLM analysis
            context = self._prepare_stakeholder_context(detected_stakeholders, files)
            context += "\n\nFocus on identifying areas of disagreement or tension between stakeholders."

            # Run LLM analysis
            result = await self.patterns_agent.run(context)

            # Parse conflict zones from result
            conflict_zones = self._parse_conflict_zones(result)
            return conflict_zones

        except Exception as e:
            logger.error(f"LLM conflict analysis failed: {e}")
            return []

    def _heuristic_analyze_consensus(
        self, detected_stakeholders: List[DetectedStakeholder]
    ) -> List[ConsensusArea]:
        """Heuristic-based consensus analysis as fallback."""

        consensus_areas = []

        # Find common concerns across stakeholders
        all_concerns = []
        for stakeholder in detected_stakeholders:
            all_concerns.extend(stakeholder.key_concerns)

        # Group similar concerns
        concern_groups = self._group_similar_concerns(all_concerns)

        # Create consensus areas for common concerns
        for concern_group in concern_groups:
            if len(concern_group) >= 2:  # At least 2 stakeholders share this concern
                consensus_area = ConsensusArea(
                    area_name=f"Shared Concern: {concern_group[0][:50]}...",
                    description=f"Multiple stakeholders share similar concerns",
                    participating_stakeholders=[
                        s.stakeholder_id
                        for s in detected_stakeholders[: len(concern_group)]
                    ],
                    consensus_strength=min(
                        len(concern_group) / len(detected_stakeholders), 1.0
                    ),
                    evidence_count=len(concern_group),
                )
                consensus_areas.append(consensus_area)

        return consensus_areas[:3]  # Limit to top 3

    def _heuristic_analyze_conflicts(
        self, detected_stakeholders: List[DetectedStakeholder]
    ) -> List[ConflictZone]:
        """Heuristic-based conflict analysis as fallback."""

        conflict_zones = []

        # Identify potential conflicts based on stakeholder types
        stakeholder_types = [s.stakeholder_type for s in detected_stakeholders]
        unique_types = list(set(stakeholder_types))

        if len(unique_types) >= 2:
            # Create generic conflict zone for different stakeholder types
            conflict_zone = ConflictZone(
                conflict_area=f"Stakeholder Type Differences",
                description=f"Potential conflicts between different stakeholder types: {', '.join(unique_types)}",
                involved_stakeholders=[s.stakeholder_id for s in detected_stakeholders],
                conflict_intensity=0.5,  # Moderate intensity
                resolution_suggestions=[
                    "Facilitate cross-stakeholder communication",
                    "Identify common ground",
                ],
            )
            conflict_zones.append(conflict_zone)

        return conflict_zones

    def _calculate_influence_relationship(
        self, stakeholder_a: DetectedStakeholder, stakeholder_b: DetectedStakeholder
    ) -> Optional[InfluenceNetwork]:
        """Calculate influence relationship between two stakeholders."""

        # Simple influence calculation based on influence levels
        influence_diff = stakeholder_a.influence_level - stakeholder_b.influence_level

        if abs(influence_diff) > 0.2:  # Significant influence difference
            if influence_diff > 0:
                influencer = stakeholder_a.stakeholder_id
                influenced = stakeholder_b.stakeholder_id
                strength = min(influence_diff, 1.0)
            else:
                influencer = stakeholder_b.stakeholder_id
                influenced = stakeholder_a.stakeholder_id
                strength = min(abs(influence_diff), 1.0)

            return InfluenceNetwork(
                influencer_id=influencer,
                influenced_id=influenced,
                influence_type="hierarchical",
                influence_strength=strength,
                relationship_description=f"Influence relationship based on stakeholder levels",
            )

        return None

    def _prepare_stakeholder_context(
        self, detected_stakeholders: List[DetectedStakeholder], files: List[Any]
    ) -> str:
        """Prepare context for LLM analysis."""

        context_parts = ["Stakeholder Analysis Context:\n"]

        for stakeholder in detected_stakeholders:
            context_parts.append(
                f"- {stakeholder.name} ({stakeholder.stakeholder_type})"
            )
            context_parts.append(f"  Role: {stakeholder.role}")
            context_parts.append(f"  Influence Level: {stakeholder.influence_level}")
            context_parts.append(
                f"  Key Concerns: {'; '.join(stakeholder.key_concerns)}"
            )
            context_parts.append("")

        return "\n".join(context_parts)

    def _group_similar_concerns(self, concerns: List[str]) -> List[List[str]]:
        """Group similar concerns together."""
        # Simple keyword-based grouping
        groups = []
        used_concerns = set()

        for concern in concerns:
            if concern in used_concerns:
                continue

            # Find similar concerns
            similar_group = [concern]
            concern_words = set(concern.lower().split())

            for other_concern in concerns:
                if other_concern != concern and other_concern not in used_concerns:
                    other_words = set(other_concern.lower().split())
                    # If they share at least 2 words, consider them similar
                    if len(concern_words.intersection(other_words)) >= 2:
                        similar_group.append(other_concern)
                        used_concerns.add(other_concern)

            if len(similar_group) > 1:
                groups.append(similar_group)
            used_concerns.add(concern)

        return groups

    def _parse_consensus_areas(self, result: Any) -> List[ConsensusArea]:
        """Parse consensus areas from LLM result."""
        # Simplified parsing - would need more sophisticated implementation
        return []

    def _parse_conflict_zones(self, result: Any) -> List[ConflictZone]:
        """Parse conflict zones from LLM result."""
        # Simplified parsing - would need more sophisticated implementation
        return []

    def _calculate_pattern_metrics(
        self,
        consensus_areas: List[ConsensusArea],
        conflict_zones: List[ConflictZone],
        influence_networks: List[InfluenceNetwork],
    ) -> Dict[str, Any]:
        """Calculate overall pattern metrics."""

        total_patterns = (
            len(consensus_areas) + len(conflict_zones) + len(influence_networks)
        )

        # Calculate overall strength
        consensus_strength = sum(area.consensus_strength for area in consensus_areas)
        conflict_strength = sum(zone.conflict_intensity for zone in conflict_zones)
        influence_strength = sum(net.influence_strength for net in influence_networks)

        overall_strength = (
            consensus_strength + conflict_strength + influence_strength
        ) / max(total_patterns, 1)

        return {
            "overall_strength": min(overall_strength, 1.0),
            "confidence": 0.8 if total_patterns > 0 else 0.3,
            "pattern_count": total_patterns,
            "consensus_count": len(consensus_areas),
            "conflict_count": len(conflict_zones),
            "influence_count": len(influence_networks),
        }

    def _create_minimal_patterns(
        self, detected_stakeholders: List[DetectedStakeholder]
    ) -> CrossStakeholderPatterns:
        """Create minimal patterns for fallback."""

        return CrossStakeholderPatterns(
            consensus_areas=[],
            conflict_zones=[],
            influence_networks=[],
            pattern_strength=0.3,
            analysis_confidence=0.5,
            metadata={
                "fallback": True,
                "stakeholder_count": len(detected_stakeholders),
            },
        )
