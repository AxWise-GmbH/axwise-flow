"""
Enhanced Persona Models with Stakeholder Intelligence Integration

This module defines the unified persona model that combines behavioral insights
with stakeholder intelligence features, eliminating duplication between personas
and stakeholder entities.
"""

from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel, Field


# This is the ONLY model for a field with evidence.
class AttributedField(BaseModel):
    """A container for a single value and its specific supporting evidence."""

    value: Optional[str] = Field(description="The extracted piece of information.")
    evidence: List[str] = Field(
        default=[],
        description="A list of direct quotes that specifically support this value.",
    )


# This is the ONLY model for the demographics section.
# IT MUST NOT HAVE a top-level 'value' object.
# IT MUST NOT HAVE a top-level 'evidence' list.
class StructuredDemographics(BaseModel):
    """Holds all demographic data. Each field is an object with a value and its evidence."""

    experience_level: Optional[AttributedField]
    industry: Optional[AttributedField]
    location: Optional[AttributedField]
    professional_context: Optional[AttributedField]
    roles: Optional[AttributedField]
    age_range: Optional[AttributedField]

    confidence: float


class PersonaTrait(BaseModel):
    """Basic persona trait model"""

    value: str = Field(..., description="The trait value or description")
    confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Confidence level in this trait (0.0-1.0)",
    )
    evidence: List[str] = Field(
        default_factory=list, description="Supporting evidence for this trait"
    )


class Persona(BaseModel):
    """Basic persona model for backward compatibility"""

    name: str = Field(..., description="Persona name")
    demographics: str = Field(..., description="Demographic information")
    goals: str = Field(..., description="Goals and motivations")
    challenges: str = Field(..., description="Challenges and frustrations")
    quotes: str = Field(..., description="Key quotes")


# NOTE: SimplifiedPersona and SimplifiedPersonaModel are now defined in
# backend.models.enhanced_persona_models to avoid conflicts and ensure
# the correct StructuredDemographics model is used.


class InfluenceMetrics(BaseModel):
    """Stakeholder influence metrics for personas"""

    decision_power: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Influence on decision-making (0.0-1.0)",
    )
    technical_influence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Technical expertise influence (0.0-1.0)",
    )
    budget_influence: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Budget/financial decision influence (0.0-1.0)",
    )


class PersonaRelationship(BaseModel):
    """Relationship between personas"""

    target_persona_id: str = Field(..., description="ID of the related persona")
    relationship_type: str = Field(
        ...,
        description="Type of relationship (collaborates_with, reports_to, influences, conflicts_with)",
    )
    strength: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Strength of the relationship (0.0-1.0)",
    )
    description: str = Field(default="", description="Description of the relationship")


class ConflictIndicator(BaseModel):
    """Areas of disagreement or tension"""

    topic: str = Field(..., description="Topic or area of conflict")
    severity: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Severity of the conflict (0.0-1.0)"
    )
    description: str = Field(default="", description="Description of the conflict")
    evidence: List[str] = Field(
        default_factory=list, description="Supporting evidence for the conflict"
    )


class ConsensusLevel(BaseModel):
    """Agreement levels on themes/patterns"""

    theme_or_pattern: str = Field(..., description="Theme or pattern being evaluated")
    agreement_score: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Level of agreement (0.0-1.0)"
    )
    supporting_evidence: List[str] = Field(
        default_factory=list, description="Evidence supporting the consensus level"
    )


class StakeholderIntelligence(BaseModel):
    """Stakeholder intelligence features for personas"""

    stakeholder_type: str = Field(
        default="primary_customer",
        description="Stakeholder classification (primary_customer, secondary_user, decision_maker, influencer)",
    )
    influence_metrics: InfluenceMetrics = Field(
        default_factory=InfluenceMetrics,
        description="Influence metrics for this persona",
    )
    relationships: List[PersonaRelationship] = Field(
        default_factory=list, description="Relationships with other personas"
    )
    conflict_indicators: List[ConflictIndicator] = Field(
        default_factory=list, description="Areas of disagreement or tension"
    )
    consensus_levels: List[ConsensusLevel] = Field(
        default_factory=list, description="Agreement levels on key themes/patterns"
    )


class EnhancedPersonaTrait(BaseModel):
    """Enhanced persona trait with stakeholder context"""

    value: Union[str, Dict[str, Any]] = Field(
        ...,
        description="The trait value or description - can be string or structured data",
    )
    confidence: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Confidence in this trait (0.0-1.0)"
    )
    evidence: List[str] = Field(
        default_factory=list, description="Supporting evidence for this trait"
    )
    stakeholder_context: Optional[Dict[str, Any]] = Field(
        default=None, description="Additional stakeholder context for this trait"
    )


class EnhancedPersona(BaseModel):
    """
    Enhanced Persona model that combines behavioral insights with stakeholder intelligence.

    This unified model eliminates duplication between personas and stakeholder entities
    by integrating stakeholder features directly into persona objects.
    """

    # Core persona information (existing fields)
    name: str = Field(..., description="Name of the persona")
    description: str = Field(..., description="Description of the persona")
    archetype: Optional[str] = Field(None, description="Archetype of the persona")

    # Enhanced persona traits
    demographics: Optional[EnhancedPersonaTrait] = Field(
        None, description="Demographic information"
    )
    goals_and_motivations: Optional[EnhancedPersonaTrait] = Field(
        None, description="Goals and motivations"
    )
    challenges_and_frustrations: Optional[EnhancedPersonaTrait] = Field(
        None, description="Challenges and frustrations"
    )

    # Stakeholder intelligence integration (NEW)
    stakeholder_intelligence: StakeholderIntelligence = Field(
        default_factory=StakeholderIntelligence,
        description="Integrated stakeholder intelligence features",
    )

    # Overall persona metadata
    overall_confidence: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Overall confidence score"
    )
    supporting_evidence_summary: List[str] = Field(
        default_factory=list, description="Key supporting evidence"
    )
    persona_metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata"
    )

    # Legacy compatibility fields
    patterns: List[str] = Field(default_factory=list, description="Behavioral patterns")

    def get_stakeholder_type(self) -> str:
        """Get the stakeholder type for this persona"""
        return self.stakeholder_intelligence.stakeholder_type

    def get_influence_score(self, metric_type: str = "decision_power") -> float:
        """Get a specific influence metric"""
        return getattr(
            self.stakeholder_intelligence.influence_metrics, metric_type, 0.5
        )

    def has_conflicts(self) -> bool:
        """Check if this persona has any conflict indicators"""
        return len(self.stakeholder_intelligence.conflict_indicators) > 0

    def get_relationships(
        self, relationship_type: Optional[str] = None
    ) -> List[PersonaRelationship]:
        """Get relationships, optionally filtered by type"""
        if relationship_type:
            return [
                r
                for r in self.stakeholder_intelligence.relationships
                if r.relationship_type == relationship_type
            ]
        return self.stakeholder_intelligence.relationships


class PersonaEnhancementResult(BaseModel):
    """Result of persona enhancement with stakeholder intelligence"""

    enhanced_personas: List[EnhancedPersona] = Field(
        default_factory=list, description="List of enhanced personas"
    )
    processing_metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Metadata about the enhancement process"
    )
    relationships_created: int = Field(
        default=0, description="Number of relationships created between personas"
    )
    conflicts_identified: int = Field(
        default=0, description="Number of conflicts identified"
    )
