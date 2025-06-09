"""
Industry and Stakeholder analysis models for Research API V3.

This module contains models for industry classification, stakeholder detection,
and multi-stakeholder analysis with V1 feature preservation.
"""

from typing import Dict, List, Optional, Literal, Any
from pydantic import BaseModel, Field, field_validator, model_validator


class IndustryAnalysis(BaseModel):
    """Comprehensive industry classification with guidance and methodology recommendations."""

    primary_industry: Literal[
        "healthcare", "fintech", "saas", "ecommerce", "edtech",
        "manufacturing", "automotive", "real_estate", "ux_research",
        "product_management", "consulting", "media", "gaming", "general"
    ] = Field(..., description="Primary industry classification")

    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in industry classification")
    reasoning: str = Field(..., min_length=20, description="Reasoning for industry classification")

    # Industry details
    sub_categories: List[str] = Field(
        default_factory=list, max_items=5, description="Specific sub-categories within the industry"
    )
    market_characteristics: List[str] = Field(
        default_factory=list, description="Key characteristics of this market"
    )

    # Research methodology recommendations
    relevant_methodologies: List[str] = Field(
        default_factory=list, description="Recommended research methodologies for this industry"
    )
    industry_specific_considerations: List[str] = Field(
        default_factory=list, description="Special considerations for this industry"
    )

    # Guidance integration
    industry_guidance: str = Field(default="", description="Specific guidance for this industry")
    regulatory_considerations: Optional[str] = Field(
        None, description="Regulatory or compliance considerations"
    )

    @field_validator('relevant_methodologies')
    @classmethod
    def set_default_methodologies(cls, v, info):
        """Set default methodologies if not provided."""
        if not v:
            industry = info.data.get('primary_industry', 'general')

            methodology_mapping = {
                "healthcare": ["clinical_validation", "regulatory_compliance", "patient_safety"],
                "fintech": ["security_validation", "regulatory_compliance", "trust_building"],
                "saas": ["customer_development", "product_market_fit", "usage_analytics"],
                "ecommerce": ["conversion_optimization", "customer_journey", "purchase_behavior"],
                "edtech": ["learning_outcomes", "engagement_metrics", "accessibility"],
                "ux_research": ["usability_testing", "user_interviews", "design_thinking"],
                "product_management": ["customer_development", "feature_validation", "roadmap_prioritization"],
                "general": ["customer_development", "design_thinking", "lean_startup"]
            }

            return methodology_mapping.get(industry, methodology_mapping["general"])
        return v

    @field_validator('industry_guidance')
    @classmethod
    def get_industry_guidance(cls, v, info):
        """Auto-populate industry-specific guidance if not provided."""
        if v and len(v) > 10:  # If guidance is already provided
            return v

        industry = info.data.get('primary_industry', 'general')

        guidance_templates = {
            "healthcare": """
            For healthcare businesses, focus on:
            - Patient safety and clinical outcomes
            - Regulatory compliance (HIPAA, FDA, etc.)
            - Provider workflow integration
            - Evidence-based validation
            - Privacy and security concerns
            - Adoption barriers in healthcare settings
            """,
            "fintech": """
            For fintech businesses, focus on:
            - Trust and security perceptions
            - Regulatory compliance requirements
            - Integration with existing financial systems
            - User financial behavior and decision-making
            - Risk tolerance and fraud prevention
            - Accessibility and financial inclusion
            """,
            "saas": """
            For SaaS businesses, focus on:
            - User adoption and onboarding experience
            - Feature usage and engagement metrics
            - Integration needs with existing tools
            - Pricing sensitivity and value perception
            - Churn reasons and retention factors
            - Scalability and performance requirements
            """,
            "ecommerce": """
            For e-commerce businesses, focus on:
            - Purchase decision factors and barriers
            - Shopping behavior and preferences
            - Price sensitivity and comparison shopping
            - Trust indicators and security concerns
            - Post-purchase experience and loyalty
            - Mobile vs desktop usage patterns
            """,
            "ux_research": """
            For UX research tools, focus on:
            - Research methodology effectiveness
            - Integration with design workflows
            - Collaboration and sharing capabilities
            - Data analysis and insight generation
            - Stakeholder communication and buy-in
            - Research operations and scaling
            """,
            "general": """
            For this business, focus on:
            - Core value proposition validation
            - User adoption and engagement patterns
            - Competitive landscape and differentiation
            - Pricing and business model validation
            - Scalability and growth potential
            - Market timing and readiness
            """
        }

        return guidance_templates.get(industry, guidance_templates["general"]).strip()


class StakeholderGroup(BaseModel):
    """Individual stakeholder group with detailed characteristics."""

    name: str = Field(..., min_length=3, max_length=50, description="Stakeholder group name")
    description: str = Field(..., min_length=10, max_length=200, description="Role and responsibilities")

    # Influence and decision-making
    influence_level: Literal["high", "medium", "low"] = Field(
        default="medium", description="Level of influence in decision-making"
    )
    decision_power: Literal["final", "influencer", "user", "gatekeeper"] = Field(
        default="user", description="Type of decision-making power"
    )

    # Research considerations
    research_priority: Literal["primary", "secondary", "optional"] = Field(
        default="secondary", description="Priority for research inclusion"
    )
    research_approach: Optional[str] = Field(
        None, description="Recommended approach for researching this group"
    )

    # Context
    pain_points: List[str] = Field(
        default_factory=list, description="Known pain points for this group"
    )
    success_metrics: List[str] = Field(
        default_factory=list, description="How this group measures success"
    )


class StakeholderAnalysis(BaseModel):
    """Comprehensive stakeholder detection and multi-stakeholder analysis."""

    primary_stakeholders: List[StakeholderGroup] = Field(
        ..., min_items=1, max_items=4, description="Primary stakeholders (decision makers, main users)"
    )
    secondary_stakeholders: List[StakeholderGroup] = Field(
        default_factory=list, max_items=4, description="Secondary stakeholders (influencers, supporters)"
    )

    # Analysis results
    multi_stakeholder_complexity: Literal["low", "medium", "high"] = Field(
        ..., description="Complexity of the stakeholder landscape"
    )
    decision_making_process: str = Field(
        ..., description="How decisions are typically made in this context"
    )

    # Research recommendations
    recommended_approach: str = Field(
        ..., description="Recommended research approach for these stakeholders"
    )
    interview_sequence: List[str] = Field(
        default_factory=list, description="Recommended order for stakeholder interviews"
    )

    # Industry and context
    industry_context: str = Field(
        ..., description="Industry-specific stakeholder considerations"
    )
    organizational_context: Optional[str] = Field(
        None, description="Organizational structure considerations"
    )

    # Metadata
    detection_confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence in stakeholder detection"
    )
    reasoning: str = Field(
        ..., min_length=20, description="Reasoning for stakeholder identification"
    )

    @field_validator('multi_stakeholder_complexity')
    @classmethod
    def determine_complexity(cls, v, info):
        """Auto-determine complexity based on stakeholder count and types."""
        primary = info.data.get('primary_stakeholders', [])
        secondary = info.data.get('secondary_stakeholders', [])

        total_stakeholders = len(primary) + len(secondary)

        # Check for high-influence stakeholders
        high_influence_count = sum(
            1 for group in primary + secondary
            if hasattr(group, 'influence_level') and group.influence_level == "high"
        )

        # Determine complexity
        if total_stakeholders >= 5 or high_influence_count >= 3:
            return "high"
        elif total_stakeholders >= 3 or high_influence_count >= 2:
            return "medium"
        else:
            return "low"

    @field_validator('interview_sequence')
    @classmethod
    def generate_interview_sequence(cls, v, info):
        """Generate recommended interview sequence if not provided."""
        if v:  # If sequence is already provided
            return v

        primary = info.data.get('primary_stakeholders', [])
        secondary = info.data.get('secondary_stakeholders', [])

        # Sort by decision power and influence
        all_stakeholders = primary + secondary

        # Prioritize by decision power
        decision_priority = {"final": 4, "gatekeeper": 3, "influencer": 2, "user": 1}
        influence_priority = {"high": 3, "medium": 2, "low": 1}

        sorted_stakeholders = sorted(
            all_stakeholders,
            key=lambda x: (
                decision_priority.get(getattr(x, 'decision_power', 'user'), 1),
                influence_priority.get(getattr(x, 'influence_level', 'medium'), 2)
            ),
            reverse=True
        )

        return [group.name for group in sorted_stakeholders[:6]]  # Limit to 6

    @model_validator(mode='after')
    def validate_stakeholder_logic(self):
        """Validate stakeholder analysis logic and completeness."""
        # Ensure we have at least one primary stakeholder
        if not self.primary_stakeholders:
            raise ValueError("At least one primary stakeholder is required")

        # Set research priorities
        for group in self.primary_stakeholders:
            if not hasattr(group, 'research_priority') or not group.research_priority:
                group.research_priority = "primary"

        for group in self.secondary_stakeholders:
            if not hasattr(group, 'research_priority') or not group.research_priority:
                group.research_priority = "secondary"

        return self
