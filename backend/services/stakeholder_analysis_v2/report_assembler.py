"""
Stakeholder Report Assembler Module

Handles assembly of final stakeholder analysis reports and multi-stakeholder summaries.
Extracts report assembly logic from the monolithic service.
"""
from typing import List, Dict, Any, Optional
import logging

from backend.domain.interfaces.llm_unified import ILLMService
from backend.schemas import (
    DetectedStakeholder,
    CrossStakeholderPatterns,
    MultiStakeholderSummary,
    DetailedAnalysisResult,
    StakeholderIntelligence,
)

logger = logging.getLogger(__name__)


class StakeholderReportAssembler:
    """
    Modular report assembler that handles creation of multi-stakeholder summaries
    and final analysis result assembly.
    """

    def __init__(self, llm_service: ILLMService):
        self.llm_service = llm_service
        self.pydantic_ai_available = False
        self.summary_agent = None
        
        # Initialize PydanticAI agent if available
        self._initialize_summary_agent()

    def _initialize_summary_agent(self):
        """Initialize PydanticAI agent for multi-stakeholder summary generation."""
        try:
            from pydantic_ai import Agent
            from pydantic_ai.models.gemini import GeminiModel
            
            # Create multi-stakeholder summary agent
            self.summary_agent = Agent(
                model=GeminiModel("gemini-2.5-flash"),
                system_prompt=self._get_summary_generation_prompt(),
            )
            self.pydantic_ai_available = True
            logger.info("Multi-stakeholder summary agent initialized successfully")
            
        except Exception as e:
            logger.warning(f"Failed to initialize summary agent: {e}")
            self.pydantic_ai_available = False

    def _get_summary_generation_prompt(self) -> str:
        """Get the system prompt for multi-stakeholder summary generation."""
        return """
You are an expert business analyst specializing in multi-stakeholder analysis.

Analyze the provided stakeholder data and cross-stakeholder patterns to create:

1. **Key Insights**: 3-5 critical insights that emerge from the multi-stakeholder analysis
2. **Implementation Recommendations**: 3-5 specific, actionable recommendations for moving forward
3. **Risk Assessment**: Identify and assess key risks with mitigation strategies
4. **Success Metrics**: Define measurable success criteria
5. **Next Steps**: Prioritized action items for stakeholder engagement

Focus on:
- Business impact and value creation
- Stakeholder alignment and conflict resolution
- Implementation feasibility and timeline
- Risk mitigation and success factors
- Actionable, specific recommendations

Return structured JSON with the above sections.
"""

    async def generate_summary(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        cross_patterns: CrossStakeholderPatterns,
        files: List[Any],
    ) -> MultiStakeholderSummary:
        """
        Generate multi-stakeholder summary from analysis components.
        
        Args:
            detected_stakeholders: Detected stakeholders
            cross_patterns: Cross-stakeholder patterns
            files: Source files for context
            
        Returns:
            Multi-stakeholder summary
        """
        logger.info(f"Generating multi-stakeholder summary for {len(detected_stakeholders)} stakeholders")
        
        try:
            if self.pydantic_ai_available and self.summary_agent:
                # Use LLM-based summary generation
                summary = await self._llm_generate_summary(
                    detected_stakeholders, cross_patterns, files
                )
            else:
                # Use heuristic-based summary generation
                summary = self._heuristic_generate_summary(
                    detected_stakeholders, cross_patterns
                )
            
            return summary
            
        except Exception as e:
            logger.error(f"Multi-stakeholder summary generation failed: {e}")
            return self._create_fallback_summary(detected_stakeholders)

    async def _llm_generate_summary(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        cross_patterns: CrossStakeholderPatterns,
        files: List[Any],
    ) -> MultiStakeholderSummary:
        """Use LLM to generate comprehensive multi-stakeholder summary."""
        
        try:
            # Prepare context for LLM analysis
            context = self._prepare_summary_context(
                detected_stakeholders, cross_patterns, files
            )
            
            # Run LLM analysis
            result = await self.summary_agent.run(context)
            
            # Parse and structure the result
            summary_data = self._parse_summary_result(result)
            
            return MultiStakeholderSummary(
                key_insights=summary_data.get("key_insights", []),
                implementation_recommendations=summary_data.get("implementation_recommendations", []),
                risk_assessment=summary_data.get("risk_assessment", {}),
                success_metrics=summary_data.get("success_metrics", []),
                next_steps=summary_data.get("next_steps", []),
                stakeholder_alignment_score=self._calculate_alignment_score(cross_patterns),
                confidence_level=0.8,
            )
            
        except Exception as e:
            logger.error(f"LLM summary generation failed: {e}")
            return self._heuristic_generate_summary(detected_stakeholders, cross_patterns)

    def _heuristic_generate_summary(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        cross_patterns: CrossStakeholderPatterns,
    ) -> MultiStakeholderSummary:
        """Generate summary using heuristic approach as fallback."""
        
        # Generate key insights
        key_insights = self._generate_heuristic_insights(detected_stakeholders, cross_patterns)
        
        # Generate implementation recommendations
        recommendations = self._generate_heuristic_recommendations(detected_stakeholders, cross_patterns)
        
        # Generate risk assessment
        risk_assessment = self._generate_heuristic_risk_assessment(cross_patterns)
        
        # Generate success metrics
        success_metrics = self._generate_heuristic_success_metrics(detected_stakeholders)
        
        # Generate next steps
        next_steps = self._generate_heuristic_next_steps(detected_stakeholders, cross_patterns)
        
        return MultiStakeholderSummary(
            key_insights=key_insights,
            implementation_recommendations=recommendations,
            risk_assessment=risk_assessment,
            success_metrics=success_metrics,
            next_steps=next_steps,
            stakeholder_alignment_score=self._calculate_alignment_score(cross_patterns),
            confidence_level=0.6,  # Lower confidence for heuristic approach
        )

    def assemble_final_result(
        self,
        base_analysis: DetailedAnalysisResult,
        stakeholder_intelligence: StakeholderIntelligence,
        enhanced_themes: List[Dict[str, Any]],
        evidence: Dict[str, Any],
    ) -> DetailedAnalysisResult:
        """
        Assemble the final enhanced analysis result.
        
        Args:
            base_analysis: Original analysis result
            stakeholder_intelligence: Stakeholder intelligence data
            enhanced_themes: Themes enhanced with stakeholder attribution
            evidence: Aggregated evidence data
            
        Returns:
            Enhanced analysis result
        """
        logger.info("Assembling final stakeholder-enhanced analysis result")
        
        try:
            # Create enhanced analysis by copying base and adding stakeholder data
            enhanced_analysis = base_analysis.model_copy() if hasattr(base_analysis, 'model_copy') else base_analysis
            
            # Add stakeholder intelligence
            enhanced_analysis.stakeholder_intelligence = stakeholder_intelligence
            
            # Replace themes with enhanced versions
            if enhanced_themes:
                enhanced_analysis.themes = enhanced_themes
            
            # Add evidence metadata
            if hasattr(enhanced_analysis, 'metadata'):
                if not enhanced_analysis.metadata:
                    enhanced_analysis.metadata = {}
                enhanced_analysis.metadata.update({
                    "stakeholder_analysis_v2": True,
                    "evidence_summary": evidence,
                    "enhancement_timestamp": self._get_current_timestamp(),
                })
            
            logger.info("Final analysis result assembled successfully")
            return enhanced_analysis
            
        except Exception as e:
            logger.error(f"Failed to assemble final result: {e}")
            return base_analysis

    def _prepare_summary_context(
        self,
        detected_stakeholders: List[DetectedStakeholder],
        cross_patterns: CrossStakeholderPatterns,
        files: List[Any],
    ) -> str:
        """Prepare context for LLM summary generation."""
        
        context_parts = ["Multi-Stakeholder Analysis Context:\n"]
        
        # Add stakeholder information
        context_parts.append("Detected Stakeholders:")
        for stakeholder in detected_stakeholders:
            context_parts.append(f"- {stakeholder.name} ({stakeholder.stakeholder_type})")
            context_parts.append(f"  Role: {stakeholder.role}")
            context_parts.append(f"  Influence Level: {stakeholder.influence_level}")
            context_parts.append(f"  Key Concerns: {'; '.join(stakeholder.key_concerns)}")
        
        context_parts.append("\nCross-Stakeholder Patterns:")
        
        # Add consensus areas
        if cross_patterns.consensus_areas:
            context_parts.append("Consensus Areas:")
            for area in cross_patterns.consensus_areas:
                context_parts.append(f"- {area.area_name}: {area.description}")
        
        # Add conflict zones
        if cross_patterns.conflict_zones:
            context_parts.append("Conflict Zones:")
            for zone in cross_patterns.conflict_zones:
                context_parts.append(f"- {zone.conflict_area}: {zone.description}")
        
        # Add influence networks
        if cross_patterns.influence_networks:
            context_parts.append("Influence Networks:")
            for network in cross_patterns.influence_networks:
                context_parts.append(f"- {network.influencer_id} → {network.influenced_id} ({network.influence_type})")
        
        context_parts.append("\nPlease provide a comprehensive multi-stakeholder analysis summary.")
        
        return "\n".join(context_parts)

    def _parse_summary_result(self, result: Any) -> Dict[str, Any]:
        """Parse summary result from LLM response."""
        try:
            if hasattr(result, 'data'):
                return result.data
            elif isinstance(result, dict):
                return result
            else:
                # Try to parse as JSON string
                import json
                return json.loads(str(result))
        except Exception as e:
            logger.warning(f"Failed to parse summary result: {e}")
            return {}

    def _generate_heuristic_insights(
        self, detected_stakeholders: List[DetectedStakeholder], cross_patterns: CrossStakeholderPatterns
    ) -> List[str]:
        """Generate key insights using heuristic approach."""
        
        insights = []
        
        # Insight about stakeholder diversity
        stakeholder_types = list(set(s.stakeholder_type for s in detected_stakeholders))
        if len(stakeholder_types) > 1:
            insights.append(f"Analysis reveals {len(stakeholder_types)} distinct stakeholder types: {', '.join(stakeholder_types)}")
        
        # Insight about consensus areas
        if cross_patterns.consensus_areas:
            insights.append(f"Identified {len(cross_patterns.consensus_areas)} areas of stakeholder consensus")
        
        # Insight about conflicts
        if cross_patterns.conflict_zones:
            insights.append(f"Found {len(cross_patterns.conflict_zones)} potential conflict zones requiring attention")
        
        # Insight about influence
        high_influence_stakeholders = [s for s in detected_stakeholders if s.influence_level > 0.7]
        if high_influence_stakeholders:
            insights.append(f"{len(high_influence_stakeholders)} stakeholders identified as high-influence decision makers")
        
        return insights[:5]  # Limit to 5 insights

    def _generate_heuristic_recommendations(
        self, detected_stakeholders: List[DetectedStakeholder], cross_patterns: CrossStakeholderPatterns
    ) -> List[str]:
        """Generate implementation recommendations using heuristic approach."""
        
        recommendations = []
        
        # Recommendation for stakeholder engagement
        recommendations.append("Establish regular communication channels with all identified stakeholders")
        
        # Recommendation based on conflicts
        if cross_patterns.conflict_zones:
            recommendations.append("Address identified conflict zones through targeted stakeholder workshops")
        
        # Recommendation based on consensus
        if cross_patterns.consensus_areas:
            recommendations.append("Leverage consensus areas as foundation for stakeholder alignment")
        
        # Recommendation for high-influence stakeholders
        high_influence_stakeholders = [s for s in detected_stakeholders if s.influence_level > 0.7]
        if high_influence_stakeholders:
            recommendations.append("Prioritize engagement with high-influence stakeholders for decision-making")
        
        return recommendations[:5]  # Limit to 5 recommendations

    def _generate_heuristic_risk_assessment(self, cross_patterns: CrossStakeholderPatterns) -> Dict[str, Any]:
        """Generate risk assessment using heuristic approach."""
        
        risks = []
        
        # Risk from conflicts
        if cross_patterns.conflict_zones:
            risks.append({
                "risk": "Stakeholder conflicts may delay implementation",
                "severity": "Medium",
                "mitigation": "Early conflict resolution and stakeholder alignment sessions"
            })
        
        # Risk from low consensus
        if len(cross_patterns.consensus_areas) < 2:
            risks.append({
                "risk": "Limited stakeholder consensus may hinder progress",
                "severity": "Medium",
                "mitigation": "Focus on building common ground and shared objectives"
            })
        
        return {
            "identified_risks": risks,
            "overall_risk_level": "Medium" if risks else "Low",
        }

    def _generate_heuristic_success_metrics(self, detected_stakeholders: List[DetectedStakeholder]) -> List[str]:
        """Generate success metrics using heuristic approach."""
        
        metrics = [
            "Stakeholder satisfaction scores (target: >80%)",
            f"Engagement rate across all {len(detected_stakeholders)} stakeholder groups (target: >90%)",
            "Conflict resolution rate (target: 100% of identified conflicts addressed)",
            "Implementation milestone adherence (target: >95%)",
        ]
        
        return metrics

    def _generate_heuristic_next_steps(
        self, detected_stakeholders: List[DetectedStakeholder], cross_patterns: CrossStakeholderPatterns
    ) -> List[str]:
        """Generate next steps using heuristic approach."""
        
        next_steps = [
            "Schedule initial stakeholder alignment meeting",
            "Develop detailed stakeholder engagement plan",
        ]
        
        if cross_patterns.conflict_zones:
            next_steps.append("Conduct conflict resolution workshops")
        
        if cross_patterns.consensus_areas:
            next_steps.append("Build implementation roadmap based on consensus areas")
        
        next_steps.append("Establish regular stakeholder feedback mechanisms")
        
        return next_steps

    def _calculate_alignment_score(self, cross_patterns: CrossStakeholderPatterns) -> float:
        """Calculate stakeholder alignment score."""
        
        consensus_score = len(cross_patterns.consensus_areas) * 0.3
        conflict_penalty = len(cross_patterns.conflict_zones) * 0.2
        influence_bonus = len(cross_patterns.influence_networks) * 0.1
        
        alignment_score = max(0.0, min(1.0, 0.5 + consensus_score - conflict_penalty + influence_bonus))
        
        return round(alignment_score, 2)

    def _create_fallback_summary(self, detected_stakeholders: List[DetectedStakeholder]) -> MultiStakeholderSummary:
        """Create minimal fallback summary."""
        
        return MultiStakeholderSummary(
            key_insights=[f"Analysis identified {len(detected_stakeholders)} stakeholders"],
            implementation_recommendations=["Engage with identified stakeholders"],
            risk_assessment={"overall_risk_level": "Unknown"},
            success_metrics=["Stakeholder engagement completion"],
            next_steps=["Plan stakeholder engagement strategy"],
            stakeholder_alignment_score=0.5,
            confidence_level=0.3,
        )

    def _get_current_timestamp(self) -> str:
        """Get current timestamp for metadata."""
        from datetime import datetime
        return datetime.utcnow().isoformat()
