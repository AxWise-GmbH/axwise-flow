"""
Enhanced Persona Models with Stakeholder Intelligence Integration

This module defines the unified persona model that combines behavioral insights
with stakeholder intelligence features, eliminating duplication between personas
and stakeholder entities.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

# Import the new AttributedField and StructuredDemographics models
from backend.domain.models.persona_schema import AttributedField, StructuredDemographics


class PersonaMetadata(BaseModel):
    """Structured persona metadata to avoid additionalProperties issues"""

    generation_method: Optional[str] = Field(
        default=None, description="Method used to generate persona"
    )
    stakeholder_category: Optional[str] = Field(
        default=None, description="Stakeholder category"
    )
    confidence_factors: List[str] = Field(
        default_factory=list, description="Factors affecting confidence"
    )
    processing_notes: Optional[str] = Field(
        default=None, description="Processing notes"
    )
    preserved_key_quotes: Optional[Dict[str, Any]] = Field(
        default=None, description="Preserved quotes"
    )


class StakeholderContext(BaseModel):
    """Structured stakeholder context to avoid additionalProperties issues"""

    stakeholder_type: Optional[str] = Field(
        default=None, description="Type of stakeholder"
    )
    influence_level: Optional[float] = Field(
        default=None, description="Influence level"
    )
    relationship_notes: Optional[str] = Field(
        default=None, description="Relationship notes"
    )


class PersonaTrait(BaseModel):
    """Basic persona trait model"""

    value: str = Field(..., description="The trait value or description")
    confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Confidence level in this trait (0.0-1.0)",
    )


class Persona(BaseModel):
    """Basic persona model for backward compatibility"""

    name: str = Field(..., description="Persona name")
    demographics: str = Field(..., description="Demographic information")
    goals: str = Field(..., description="Goals and motivations")
    challenges: str = Field(..., description="Challenges and frustrations")
    quotes: str = Field(..., description="Key quotes")


class SimplifiedPersona(BaseModel):
    """
    Simplified persona model for initial generation with AttributedField support.

    This model uses AttributedField for core design thinking fields to ensure
    perfect evidence traceability and prevent data bleeding between fields.
    """

    name: str = Field(..., description="Persona name")
    description: str = Field(..., description="Persona description")
    archetype: str = Field(..., description="Persona archetype")

    # Core design thinking fields with AttributedField for evidence traceability
    demographics: StructuredDemographics = Field(
        ...,
        description="Structured demographic information with evidence attribution for each field",
    )

    goals_and_motivations: AttributedField = Field(
        ..., description="Goals and motivations with specific supporting evidence"
    )

    challenges_and_frustrations: AttributedField = Field(
        ..., description="Challenges and frustrations with specific supporting evidence"
    )

    key_quotes: AttributedField = Field(
        ..., description="Key representative quotes with context evidence"
    )

    # Overall persona metadata
    overall_confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Overall confidence score for the entire persona (0.0-1.0)",
    )

    persona_metadata: Optional[PersonaMetadata] = Field(
        default=None,
        description="Structured metadata about the persona creation process",
    )

    # Backward compatibility properties
    @property
    def demographics_confidence(self) -> float:
        """Backward compatibility: return demographics confidence"""
        return self.demographics.confidence if self.demographics else 0.7

    @property
    def goals_confidence(self) -> float:
        """Backward compatibility: return goals confidence (use overall confidence)"""
        return self.overall_confidence

    @property
    def challenges_confidence(self) -> float:
        """Backward compatibility: return challenges confidence (use overall confidence)"""
        return self.overall_confidence

    @property
    def goals(self) -> str:
        """Backward compatibility: return goals as string"""
        return self.goals_and_motivations.value if self.goals_and_motivations else ""

    @property
    def challenges(self) -> str:
        """Backward compatibility: return challenges as string"""
        return (
            self.challenges_and_frustrations.value
            if self.challenges_and_frustrations
            else ""
        )

    @property
    def quotes(self) -> str:
        """Backward compatibility: return quotes as string"""
        return self.key_quotes.value if self.key_quotes else ""


# Alias for backward compatibility
SimplifiedPersonaModel = SimplifiedPersona


class DirectPersonaTrait(BaseModel):
    """
    Direct persona trait model that matches the frontend PersonaTrait structure.

    This eliminates the need for conversion from SimplifiedPersona to full Persona format.
    """

    value: str = Field(..., description="The trait value or description")
    confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Confidence level in this trait (0.0-1.0)",
    )
    evidence: List[str] = Field(
        default_factory=list,
        description="Supporting evidence quotes for this trait",
    )


class DirectPersona(BaseModel):
    """
    Direct persona model that can be generated by PydanticAI without conversion.

    This model produces the exact structure expected by the frontend, eliminating
    the fragile two-step conversion process that was causing corruption.
    """

    # Basic information
    name: str = Field(..., description="Persona name")
    description: str = Field(..., description="Persona description")
    archetype: str = Field(..., description="Persona archetype")

    # Core design thinking fields as DirectPersonaTrait objects
    demographics: DirectPersonaTrait = Field(
        ..., description="Demographic information with evidence"
    )

    goals_and_motivations: DirectPersonaTrait = Field(
        ..., description="Goals and motivations with evidence"
    )

    challenges_and_frustrations: DirectPersonaTrait = Field(
        ..., description="Challenges and frustrations with evidence"
    )

    key_quotes: DirectPersonaTrait = Field(
        ..., description="Key representative quotes with evidence"
    )

    # Additional traits that the frontend expects
    skills_and_expertise: Optional[DirectPersonaTrait] = Field(
        None, description="Skills and expertise with evidence"
    )

    workflow_and_environment: Optional[DirectPersonaTrait] = Field(
        None, description="Workflow and environment with evidence"
    )

    technology_and_tools: Optional[DirectPersonaTrait] = Field(
        None, description="Technology and tools with evidence"
    )

    pain_points: Optional[DirectPersonaTrait] = Field(
        None, description="Pain points with evidence"
    )

    # Overall persona metadata
    patterns: List[str] = Field(
        default_factory=list,
        description="Behavioral patterns associated with this persona",
    )

    overall_confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Overall confidence score for the entire persona (0.0-1.0)",
        alias="confidence",  # For backward compatibility
    )

    evidence: List[str] = Field(
        default_factory=list,
        description="Overall supporting evidence for the persona",
    )

    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Additional metadata about the persona",
    )


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

    value: str = Field(..., description="The trait value or description")
    confidence: float = Field(
        default=0.7, ge=0.0, le=1.0, description="Confidence in this trait (0.0-1.0)"
    )
    evidence: List[str] = Field(
        default_factory=list, description="Supporting evidence for this trait"
    )
    stakeholder_context: Optional[StakeholderContext] = Field(
        default=None, description="Structured stakeholder context for this trait"
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
    persona_metadata: Optional[PersonaMetadata] = Field(
        default=None, description="Structured metadata"
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
