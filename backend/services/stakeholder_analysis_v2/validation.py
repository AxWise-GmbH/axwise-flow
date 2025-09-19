"""
Stakeholder Analysis Validation Module

Handles validation of stakeholder analysis results and ensures schema compliance.
"""

from typing import List, Dict, Any, Optional
import logging

from backend.schemas import DetailedAnalysisResult, StakeholderIntelligence

logger = logging.getLogger(__name__)


class StakeholderAnalysisValidation:
    """
    Validation utilities for stakeholder analysis results.
    Ensures schema compliance and data quality.
    """

    def __init__(self):
        self.validation_rules = self._initialize_validation_rules()

    def _initialize_validation_rules(self) -> Dict[str, Any]:
        """Initialize validation rules for stakeholder analysis."""
        return {
            "min_stakeholders": 1,
            "max_stakeholders": 20,
            "min_confidence": 0.0,
            "max_confidence": 1.0,
            # Schema-aligned required fields
            "required_stakeholder_fields": [
                "stakeholder_id",
                "stakeholder_type",
                "confidence_score",
            ],
            "required_intelligence_fields": ["detected_stakeholders"],
        }

    def validate_analysis_result(
        self, analysis_result: DetailedAnalysisResult
    ) -> DetailedAnalysisResult:
        """
        Validate and potentially fix analysis result.

        Args:
            analysis_result: Analysis result to validate

        Returns:
            Validated analysis result
        """
        logger.info("Validating stakeholder analysis result")

        try:
            # Validate stakeholder intelligence if present
            if (
                hasattr(analysis_result, "stakeholder_intelligence")
                and analysis_result.stakeholder_intelligence
            ):
                validated_intelligence = self.validate_stakeholder_intelligence(
                    analysis_result.stakeholder_intelligence
                )
                analysis_result.stakeholder_intelligence = validated_intelligence

            # Validate themes if enhanced
            if hasattr(analysis_result, "themes") and analysis_result.themes:
                validated_themes = self.validate_enhanced_themes(analysis_result.themes)
                analysis_result.themes = validated_themes

            # Add validation metadata
            self._add_validation_metadata(analysis_result)

            logger.info("Stakeholder analysis result validation completed")
            return analysis_result

        except Exception as e:
            logger.error(f"Validation failed: {e}")
            return analysis_result

    def validate_stakeholder_intelligence(
        self, intelligence: StakeholderIntelligence
    ) -> StakeholderIntelligence:
        """
        Validate stakeholder intelligence data.

        Args:
            intelligence: Stakeholder intelligence to validate

        Returns:
            Validated stakeholder intelligence
        """
        try:
            # Validate detected stakeholders
            if intelligence.detected_stakeholders:
                validated_stakeholders = []
                for stakeholder in intelligence.detected_stakeholders:
                    if self._is_valid_stakeholder(stakeholder):
                        validated_stakeholders.append(stakeholder)
                    else:
                        logger.warning(
                            f"Invalid stakeholder filtered out: {stakeholder.stakeholder_id}"
                        )

                intelligence.detected_stakeholders = validated_stakeholders

            # Validate cross-stakeholder patterns
            if intelligence.cross_stakeholder_patterns:
                intelligence.cross_stakeholder_patterns = self._validate_cross_patterns(
                    intelligence.cross_stakeholder_patterns
                )

            # Validate multi-stakeholder summary
            if intelligence.multi_stakeholder_summary:
                intelligence.multi_stakeholder_summary = self._validate_multi_summary(
                    intelligence.multi_stakeholder_summary
                )

            return intelligence

        except Exception as e:
            logger.error(f"Stakeholder intelligence validation failed: {e}")
            return intelligence

    def validate_enhanced_themes(
        self, themes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Validate enhanced themes with stakeholder attribution.

        Args:
            themes: Enhanced themes to validate

        Returns:
            Validated themes
        """
        validated_themes = []

        for theme in themes:
            try:
                # Validate theme structure
                if self._is_valid_theme(theme):
                    # Validate stakeholder attribution if present
                    if "stakeholder_attribution" in theme:
                        theme["stakeholder_attribution"] = (
                            self._validate_theme_attribution(
                                theme["stakeholder_attribution"]
                            )
                        )
                    validated_themes.append(theme)
                else:
                    logger.warning(
                        f"Invalid theme filtered out: {theme.get('theme', 'Unknown')}"
                    )

            except Exception as e:
                logger.warning(f"Theme validation failed: {e}")
                # Keep original theme as fallback
                validated_themes.append(theme)

        return validated_themes

    def _is_valid_stakeholder(self, stakeholder: Any) -> bool:
        """Check if stakeholder meets validation criteria."""

        try:
            # Check required schema fields exist and are non-empty
            for field in self.validation_rules["required_stakeholder_fields"]:
                if not hasattr(stakeholder, field) or getattr(stakeholder, field) in (
                    None,
                    "",
                ):
                    return False

            # Check confidence bounds (schema field)
            if hasattr(stakeholder, "confidence_score"):
                try:
                    confidence = float(getattr(stakeholder, "confidence_score"))
                except Exception:
                    return False
                if not (
                    self.validation_rules["min_confidence"]
                    <= confidence
                    <= self.validation_rules["max_confidence"]
                ):
                    return False

            return True

        except Exception as e:
            logger.warning(f"Stakeholder validation check failed: {e}")
            return False

    def _validate_cross_patterns(self, patterns: Any) -> Any:
        """Validate cross-stakeholder patterns."""

        try:
            # Validate consensus areas
            if hasattr(patterns, "consensus_areas") and patterns.consensus_areas:
                validated_consensus = []
                for area in patterns.consensus_areas:
                    if self._is_valid_consensus_area(area):
                        validated_consensus.append(area)
                patterns.consensus_areas = validated_consensus

            # Validate conflict zones
            if hasattr(patterns, "conflict_zones") and patterns.conflict_zones:
                validated_conflicts = []
                for zone in patterns.conflict_zones:
                    if self._is_valid_conflict_zone(zone):
                        validated_conflicts.append(zone)
                patterns.conflict_zones = validated_conflicts

            # Validate influence networks
            if hasattr(patterns, "influence_networks") and patterns.influence_networks:
                validated_networks = []
                for network in patterns.influence_networks:
                    if self._is_valid_influence_network(network):
                        validated_networks.append(network)
                patterns.influence_networks = validated_networks

            return patterns

        except Exception as e:
            logger.warning(f"Cross-patterns validation failed: {e}")
            return patterns

    def _validate_multi_summary(self, summary: Any) -> Any:
        """Validate multi-stakeholder summary."""

        try:
            # Validate alignment score bounds
            if hasattr(summary, "stakeholder_alignment_score"):
                score = summary.stakeholder_alignment_score
                if not (0.0 <= score <= 1.0):
                    summary.stakeholder_alignment_score = max(0.0, min(1.0, score))

            # Validate confidence level bounds
            if hasattr(summary, "confidence_level"):
                confidence = summary.confidence_level
                if not (0.0 <= confidence <= 1.0):
                    summary.confidence_level = max(0.0, min(1.0, confidence))

            # Ensure lists are not None
            list_fields = [
                "key_insights",
                "implementation_recommendations",
                "success_metrics",
                "next_steps",
            ]
            for field in list_fields:
                if hasattr(summary, field) and getattr(summary, field) is None:
                    setattr(summary, field, [])

            return summary

        except Exception as e:
            logger.warning(f"Multi-summary validation failed: {e}")
            return summary

    def _is_valid_theme(self, theme: Dict[str, Any]) -> bool:
        """Check if theme meets validation criteria."""

        # Must have at least a theme name or identifier
        return bool(theme.get("theme") or theme.get("name") or theme.get("id"))

    def _validate_theme_attribution(
        self, attribution: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate theme attribution data."""

        try:
            # Validate stakeholder contributions
            if "stakeholder_contributions" in attribution:
                validated_contributions = []
                for contribution in attribution["stakeholder_contributions"]:
                    if self._is_valid_contribution(contribution):
                        validated_contributions.append(contribution)
                attribution["stakeholder_contributions"] = validated_contributions

            # Validate consensus level bounds
            if "theme_consensus_level" in attribution:
                consensus = attribution["theme_consensus_level"]
                if not (0.0 <= consensus <= 1.0):
                    attribution["theme_consensus_level"] = max(0.0, min(1.0, consensus))

            return attribution

        except Exception as e:
            logger.warning(f"Theme attribution validation failed: {e}")
            return attribution

    def _is_valid_contribution(self, contribution: Dict[str, Any]) -> bool:
        """Check if stakeholder contribution is valid."""

        try:
            # Must have stakeholder_id and contribution_strength
            if not contribution.get("stakeholder_id"):
                return False

            strength = contribution.get("contribution_strength", 0)
            if not (0.0 <= strength <= 1.0):
                return False

            return True

        except Exception:
            return False

    def _is_valid_consensus_area(self, area: Any) -> bool:
        """Check if consensus area is valid."""

        try:
            # Must have area name and participating stakeholders
            if not hasattr(area, "area_name") or not area.area_name:
                return False

            if (
                not hasattr(area, "participating_stakeholders")
                or not area.participating_stakeholders
            ):
                return False

            # Validate consensus strength bounds
            if hasattr(area, "consensus_strength"):
                strength = area.consensus_strength
                if not (0.0 <= strength <= 1.0):
                    return False

            return True

        except Exception:
            return False

    def _is_valid_conflict_zone(self, zone: Any) -> bool:
        """Check if conflict zone is valid."""

        try:
            # Must have conflict area and involved stakeholders
            if not hasattr(zone, "conflict_area") or not zone.conflict_area:
                return False

            if (
                not hasattr(zone, "involved_stakeholders")
                or not zone.involved_stakeholders
            ):
                return False

            # Validate conflict intensity bounds
            if hasattr(zone, "conflict_intensity"):
                intensity = zone.conflict_intensity
                if not (0.0 <= intensity <= 1.0):
                    return False

            return True

        except Exception:
            return False

    def _is_valid_influence_network(self, network: Any) -> bool:
        """Check if influence network is valid."""

        try:
            # Must have influencer and influenced IDs
            if not hasattr(network, "influencer_id") or not network.influencer_id:
                return False

            if not hasattr(network, "influenced_id") or not network.influenced_id:
                return False

            # Validate influence strength bounds
            if hasattr(network, "influence_strength"):
                strength = network.influence_strength
                if not (0.0 <= strength <= 1.0):
                    return False

            return True

        except Exception:
            return False

    def _add_validation_metadata(self, analysis_result: DetailedAnalysisResult):
        """Add validation metadata to analysis result."""

        try:
            if not hasattr(analysis_result, "metadata"):
                analysis_result.metadata = {}

            if analysis_result.metadata is None:
                analysis_result.metadata = {}

            analysis_result.metadata.update(
                {
                    "validation_completed": True,
                    "validation_timestamp": self._get_current_timestamp(),
                    "validation_version": "stakeholder_analysis_v2",
                }
            )

        except Exception as e:
            logger.warning(f"Failed to add validation metadata: {e}")

    def _get_current_timestamp(self) -> str:
        """Get current timestamp for metadata."""
        from datetime import datetime

        return datetime.utcnow().isoformat()
