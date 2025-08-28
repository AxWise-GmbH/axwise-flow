"""
Production-Ready Persona Model for DesignThinkingAgentAI

This module defines the unified ProductionPersona model that resolves schema conflicts
and ensures compatibility between PydanticAI, JSON serialization, and frontend expectations.

Key Features:
- Consistent PersonaTrait structure throughout
- No nested AttributedField complications
- Direct PydanticAI compatibility
- Frontend-ready JSON output
- Evidence attribution for each trait
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, field_validator
import json


class PersonaTrait(BaseModel):
    """
    Unified persona trait model that matches frontend expectations exactly.

    This model ensures consistency across the entire system by using the same
    structure for all trait fields (demographics, goals, challenges, etc.)
    """

    value: str = Field(..., description="The trait value or description")
    confidence: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Confidence level in this trait (0.0-1.0)",
    )
    evidence: List[str] = Field(
        default_factory=list, description="Supporting evidence quotes for this trait"
    )

    @field_validator("evidence")
    def validate_evidence(cls, v):
        """Ensure evidence contains authentic quotes, not placeholders"""
        if not v:
            return []

        # Filter out generic placeholders
        generic_patterns = [
            "no specific information provided",
            "inferred from interview",
            "general context",
            "derived from overall conversation",
        ]

        filtered_evidence = []
        for evidence_item in v:
            if isinstance(evidence_item, str):
                evidence_lower = evidence_item.lower()
                if not any(pattern in evidence_lower for pattern in generic_patterns):
                    filtered_evidence.append(evidence_item)

        return filtered_evidence


class ProductionPersona(BaseModel):
    """
    Production-ready persona model that matches frontend expectations exactly.

    This unified model eliminates schema conflicts by using consistent PersonaTrait
    structure for all trait fields, ensuring seamless PydanticAI generation and
    frontend consumption.
    """

    # Core identification
    name: str = Field(..., description="Persona name")
    description: str = Field(..., description="Persona description")
    archetype: str = Field(..., description="Persona archetype")

    # Core design thinking fields using consistent PersonaTrait structure
    demographics: PersonaTrait = Field(..., description="Demographics with evidence")
    goals_and_motivations: PersonaTrait = Field(..., description="Goals with evidence")
    challenges_and_frustrations: PersonaTrait = Field(
        ..., description="Challenges with evidence"
    )
    key_quotes: PersonaTrait = Field(..., description="Key quotes with evidence")

    # Optional extended traits for comprehensive analysis
    skills_and_expertise: Optional[PersonaTrait] = Field(
        None, description="Professional skills and areas of expertise"
    )
    workflow_and_environment: Optional[PersonaTrait] = Field(
        None, description="Work environment and workflow preferences"
    )
    technology_and_tools: Optional[PersonaTrait] = Field(
        None, description="Technology usage and tool preferences"
    )
    pain_points: Optional[PersonaTrait] = Field(
        None, description="Specific pain points and frustrations"
    )

    # Metadata and confidence
    overall_confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    patterns: List[str] = Field(default_factory=list)
    persona_metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    def validate_name(cls, v):
        """Ensure persona has a meaningful name"""
        if not v or v.strip() == "":
            raise ValueError("Persona name cannot be empty")
        return v.strip()

    @field_validator("overall_confidence")
    def validate_confidence_threshold(cls, v):
        """Ensure minimum confidence threshold for production use"""
        if v < 0.3:  # Allow lower threshold based on memory guidance
            return 0.3  # Set minimum acceptable confidence
        return v

    def to_frontend_dict(self) -> Dict[str, Any]:
        """
        Convert to frontend-compatible dictionary format.

        This method ensures the output matches exactly what the frontend expects,
        preventing any schema mismatches.
        """
        result = self.model_dump()

        # Add legacy compatibility fields if needed
        result["confidence"] = self.overall_confidence
        result["evidence"] = []

        # Collect all evidence for legacy support
        for field_name in [
            "demographics",
            "goals_and_motivations",
            "challenges_and_frustrations",
            "key_quotes",
        ]:
            field_value = getattr(self, field_name, None)
            if field_value and hasattr(field_value, "evidence"):
                result["evidence"].extend(field_value.evidence)

        return result

    def get_quality_score(self) -> float:
        """
        Calculate quality score based on evidence and content completeness.

        Returns a score between 0.0 and 1.0 indicating persona quality.
        """
        scores = []

        # Check core fields for evidence quality
        core_fields = [
            self.demographics,
            self.goals_and_motivations,
            self.challenges_and_frustrations,
            self.key_quotes,
        ]

        for field in core_fields:
            if field:
                # Score based on evidence count and confidence
                evidence_score = min(
                    len(field.evidence) / 3.0, 1.0
                )  # Target 3+ evidence items
                field_score = (field.confidence + evidence_score) / 2.0
                scores.append(field_score)

        return sum(scores) / len(scores) if scores else 0.0


class PersonaAPIResponse(BaseModel):
    """
    API response model for persona data that ensures frontend compatibility.
    """

    personas: List[Dict[str, Any]] = Field(..., description="Generated personas")
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("personas")
    def validate_persona_structure(cls, v):
        """Validate each persona has required structure for frontend compatibility"""
        for persona in v:
            required_fields = [
                "name",
                "description",
                "archetype",
                "demographics",
                "goals_and_motivations",
                "challenges_and_frustrations",
                "key_quotes",
            ]

            for field in required_fields:
                if field not in persona:
                    raise ValueError(f"Missing required field: {field}")

                # Validate PersonaTrait structure for trait fields
                if field in [
                    "demographics",
                    "goals_and_motivations",
                    "challenges_and_frustrations",
                    "key_quotes",
                ]:
                    trait = persona[field]
                    if not isinstance(trait, dict) or "value" not in trait:
                        raise ValueError(f"Invalid trait structure for {field}")

                    # Ensure evidence is present and authentic
                    if "evidence" not in trait or not isinstance(
                        trait["evidence"], list
                    ):
                        raise ValueError(f"Missing or invalid evidence for {field}")

        return v


def validate_persona_data_safe(persona_data: Any) -> bool:
    """
    Safely validate persona data without corruption from str() calls.

    This function uses proper JSON serialization to avoid the constructor
    syntax corruption that was causing frontend display issues.
    """
    try:
        # Use JSON serialization instead of str() to avoid constructor syntax
        if hasattr(persona_data, "model_dump_json"):
            serialized = persona_data.model_dump_json()
        elif hasattr(persona_data, "model_dump"):
            serialized = json.dumps(persona_data.model_dump())
        else:
            serialized = json.dumps(persona_data)

        # Check for corruption indicators
        corruption_patterns = [
            "AttributedField(",
            "StructuredDemographics(",
            "experience_level=",
            "industry=",
            "evidence=['",
            "value='",
            "confidence=",
        ]

        has_corruption = any(pattern in serialized for pattern in corruption_patterns)

        if has_corruption:
            return False

        # Additional validation for minimum quality
        if hasattr(persona_data, "get_quality_score"):
            quality_score = persona_data.get_quality_score()
            return quality_score >= 0.3  # Lowered threshold per memory guidance

        return True

    except Exception as e:
        return False


def transform_to_frontend_format(persona_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Transform persona data to ensure frontend compatibility.

    This function handles any legacy format conversion and ensures
    the output matches frontend expectations exactly.
    """
    if not isinstance(persona_data, dict):
        return {}

    # If already in correct format, return as-is
    required_fields = [
        "name",
        "description",
        "archetype",
        "demographics",
        "goals_and_motivations",
    ]
    if all(field in persona_data for field in required_fields):
        # Validate PersonaTrait structure
        for field in [
            "demographics",
            "goals_and_motivations",
            "challenges_and_frustrations",
            "key_quotes",
        ]:
            if field in persona_data:
                trait = persona_data[field]
                if isinstance(trait, dict) and "value" in trait:
                    continue  # Already correct format
                else:
                    # Convert to PersonaTrait format
                    persona_data[field] = {
                        "value": str(trait) if trait else "",
                        "confidence": 0.7,
                        "evidence": [],
                    }

    # CRITICAL: Ensure key_quotes field is always present
    if "key_quotes" not in persona_data:
        # Create fallback key_quotes from other evidence
        fallback_evidence = []

        # Collect evidence from other trait fields
        for field_name in [
            "demographics",
            "goals_and_motivations",
            "challenges_and_frustrations",
        ]:
            if field_name in persona_data and isinstance(
                persona_data[field_name], dict
            ):
                field_evidence = persona_data[field_name].get("evidence", [])
                if isinstance(field_evidence, list):
                    fallback_evidence.extend(
                        field_evidence[:2]
                    )  # Take up to 2 quotes per field

        # Use up to 5 quotes as fallback evidence
        fallback_evidence = fallback_evidence[:5]

        persona_data["key_quotes"] = {
            "value": "Representative quotes derived from interview analysis",
            "confidence": 0.6,  # Lower confidence for fallback
            "evidence": (
                fallback_evidence
                if fallback_evidence
                else ["No specific quotes available from analysis"]
            ),
        }

    # Generate structured_demographics from demographics field if available
    import logging

    logger = logging.getLogger(__name__)
    logger.info(
        f"[STRUCTURED_DEMOGRAPHICS_FIX] Processing persona: {persona_data.get('name', 'Unknown')}"
    )

    demographics_field = persona_data.get("demographics")
    logger.info(
        f"[STRUCTURED_DEMOGRAPHICS_FIX] Demographics field type: {type(demographics_field)}"
    )
    logger.info(
        f"[STRUCTURED_DEMOGRAPHICS_FIX] Demographics field content: {demographics_field}"
    )

    if demographics_field and isinstance(demographics_field, dict):
        logger.info(
            f"[STRUCTURED_DEMOGRAPHICS_FIX] Demographics is dict, checking structure..."
        )
        try:
            # Check if it's in PersonaTrait format (value, confidence, evidence)
            if demographics_field.get("value") and demographics_field.get("evidence"):
                # Import here to avoid circular imports
                from backend.services.processing.persona_builder import PersonaBuilder
                from backend.domain.models.persona_schema import PersonaTrait

                # Convert to PersonaTrait first
                demographics_trait = PersonaTrait(
                    value=demographics_field.get("value", ""),
                    confidence=demographics_field.get("confidence", 0.7),
                    evidence=demographics_field.get("evidence", []),
                )

                # Convert to StructuredDemographics
                builder = PersonaBuilder()
                structured_demographics = builder._convert_demographics_to_structured(
                    demographics_trait
                )

                # Add to persona data
                persona_data["structured_demographics"] = (
                    structured_demographics.model_dump()
                )

                # Log success
                import logging

                logger = logging.getLogger(__name__)
                logger.info(
                    f"Generated structured_demographics for persona: {persona_data.get('name', 'Unknown')}"
                )

        except Exception as e:
            # Log error but don't fail the entire transformation
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to generate structured_demographics: {e}")

    return persona_data
