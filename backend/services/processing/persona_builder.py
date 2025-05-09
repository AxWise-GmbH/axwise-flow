"""
Persona builder module for constructing personas from attributes.

This module provides functionality for:
1. Building persona objects from attributes
2. Creating fallback personas
3. Validating personas
"""

from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass, field, asdict
import logging
from datetime import datetime
from pydantic import ValidationError

# Import Pydantic schema for validation
try:
    from schemas import Persona as PersonaSchema
except ImportError:
    try:
        from schemas import Persona as PersonaSchema
    except ImportError:
        logger = logging.getLogger(__name__)
        logger.warning("Could not import PersonaSchema, validation will be limited")
        # We'll define a minimal schema later if needed

# Configure logging
logger = logging.getLogger(__name__)


@dataclass
class PersonaTrait:
    """A trait of a persona with evidence and confidence"""
    value: Union[str, dict, list]
    confidence: float
    evidence: List[str] = field(default_factory=list)


@dataclass
class Persona:
    """A user persona derived from interview data"""
    name: str
    description: str
    role_context: PersonaTrait
    key_responsibilities: PersonaTrait
    tools_used: PersonaTrait
    collaboration_style: PersonaTrait
    analysis_approach: PersonaTrait
    pain_points: PersonaTrait
    patterns: List[str] = field(default_factory=list)
    confidence: float = 0.7  # Default confidence
    evidence: List[str] = field(default_factory=list)
    persona_metadata: Optional[Dict[str, Any]] = None  # Changed from metadata
    role_in_interview: str = "Participant"  # Default role in the interview (Interviewee, Interviewer, etc.)

    # New fields
    archetype: str = "Unknown"
    demographics: Optional[PersonaTrait] = None
    goals_and_motivations: Optional[PersonaTrait] = None
    skills_and_expertise: Optional[PersonaTrait] = None
    workflow_and_environment: Optional[PersonaTrait] = None
    challenges_and_frustrations: Optional[PersonaTrait] = None
    needs_and_desires: Optional[PersonaTrait] = None
    technology_and_tools: Optional[PersonaTrait] = None
    attitude_towards_research: Optional[PersonaTrait] = None
    attitude_towards_ai: Optional[PersonaTrait] = None
    key_quotes: Optional[PersonaTrait] = None


def persona_to_dict(persona: Persona) -> Dict[str, Any]:
    """
    Convert a Persona object to a dictionary.

    Args:
        persona: Persona object

    Returns:
        Dictionary representation of the persona
    """
    # Check if persona is None
    if persona is None:
        logger = logging.getLogger(__name__)
        logger.warning("Received None persona in persona_to_dict, returning empty dict")
        return {
            "name": "Unknown",
            "description": "No persona data available",
            "confidence": 0.0,
            "evidence": ["No data available"],
            "metadata": {"error": "No persona data available"}
        }

    # Convert to dictionary using dataclasses.asdict
    persona_dict = asdict(persona)

    # Rename metadata field for backward compatibility
    if "persona_metadata" in persona_dict:
        persona_dict["metadata"] = persona_dict.pop("persona_metadata")

    # Add aliases for backward compatibility
    persona_dict["overall_confidence"] = persona_dict["confidence"]
    persona_dict["supporting_evidence_summary"] = persona_dict["evidence"]

    return persona_dict


class PersonaBuilder:
    """
    Builds persona objects from attributes.
    """

    def __init__(self):
        """Initialize the persona builder."""
        logger.info("Initialized PersonaBuilder")

    def build_persona_from_attributes(
        self, attributes: Dict[str, Any], name_override: str = "", role: str = "Participant"
    ) -> Persona:
        """
        Build a persona object from attributes.

        Args:
            attributes: Persona attributes
            name_override: Optional name to override the one in attributes
            role: Role of the person in the interview

        Returns:
            Persona object
        """
        logger.info(f"Building persona from attributes for {role}")

        try:
            # Extract name from attributes or use override
            name = name_override if name_override else attributes.get("name", role)

            # Log the attributes for debugging
            logger.info(f"Building persona with name: {name}, role: {role}")
            logger.info(f"Attribute keys: {list(attributes.keys())}")

            # Handle key_quotes specially - it can be a string, list, or dict
            key_quotes_data = attributes.get("key_quotes", {})
            if isinstance(key_quotes_data, list):
                # Convert list of quotes to a trait
                key_quotes_value = ", ".join(key_quotes_data[:5])  # Take first 5 quotes
                key_quotes_data = {
                    "value": key_quotes_value,
                    "confidence": 0.9,
                    "evidence": key_quotes_data
                }
            elif isinstance(key_quotes_data, str):
                # Convert string to a trait
                key_quotes_data = {
                    "value": key_quotes_data,
                    "confidence": 0.8,
                    "evidence": [key_quotes_data]
                }
            elif not isinstance(key_quotes_data, dict):
                key_quotes_data = {
                    "value": str(key_quotes_data),
                    "confidence": 0.5,
                    "evidence": []
                }

            # Get overall confidence score if available (for simplified format)
            overall_confidence = 0.7  # Default confidence
            if "overall_confidence_score" in attributes and isinstance(attributes["overall_confidence_score"], (int, float)):
                overall_confidence = float(attributes["overall_confidence_score"])
            elif "overall_confidence" in attributes and isinstance(attributes["overall_confidence"], (int, float)):
                overall_confidence = float(attributes["overall_confidence"])

            # Get key quotes for evidence (for simplified format)
            key_quotes_list = []
            if isinstance(key_quotes_data, dict) and "evidence" in key_quotes_data and isinstance(key_quotes_data["evidence"], list):
                key_quotes_list = key_quotes_data["evidence"]
            elif isinstance(attributes.get("key_quotes"), list):
                key_quotes_list = attributes["key_quotes"]

            # Process trait fields with robust error handling
            trait_fields = {
                "role_context": attributes.get("role_context", {}),
                "key_responsibilities": attributes.get("key_responsibilities", {}),
                "tools_used": attributes.get("tools_used", {}),
                "collaboration_style": attributes.get("collaboration_style", {}),
                "analysis_approach": attributes.get("analysis_approach", {}),
                "pain_points": attributes.get("pain_points", {}),
                "demographics": attributes.get("demographics", {}),
                "goals_and_motivations": attributes.get("goals_and_motivations", {}),
                "skills_and_expertise": attributes.get("skills_and_expertise", {}),
                "workflow_and_environment": attributes.get("workflow_and_environment", {}),
                "challenges_and_frustrations": attributes.get("challenges_and_frustrations", {}),
                "needs_and_desires": attributes.get("needs_and_desires", {}),
                "technology_and_tools": attributes.get("technology_and_tools", {}),
                "attitude_towards_research": attributes.get("attitude_towards_research", {}),
                "attitude_towards_ai": attributes.get("attitude_towards_ai", {})
            }

            # Process each trait field to ensure proper format
            processed_traits = {}
            for field_name, field_data in trait_fields.items():
                if isinstance(field_data, dict) and "value" in field_data:
                    # Standard format - already a dict with value, confidence, evidence
                    processed_traits[field_name] = field_data
                elif isinstance(field_data, str):
                    # String format - convert to dict (simplified format)
                    processed_traits[field_name] = {
                        "value": field_data,
                        "confidence": overall_confidence,
                        "evidence": key_quotes_list[:2] if key_quotes_list else []  # Use key quotes as evidence
                    }
                elif isinstance(field_data, list):
                    # List format - convert to dict
                    processed_traits[field_name] = {
                        "value": ", ".join(str(item) for item in field_data[:3]),  # Take first 3 items
                        "confidence": overall_confidence,
                        "evidence": key_quotes_list[:2] if key_quotes_list else []  # Use key quotes as evidence
                    }
                else:
                    # Default empty dict
                    processed_traits[field_name] = {
                        "value": "",
                        "confidence": 0.5,
                        "evidence": []
                    }

            # Add key_quotes to processed traits
            processed_traits["key_quotes"] = key_quotes_data

            # Extract patterns and evidence
            patterns = attributes.get("patterns", [])
            if isinstance(patterns, str):
                # Split string by commas or newlines
                patterns = [p.strip() for p in re.split(r'[,\n]', patterns) if p.strip()]
            elif not isinstance(patterns, list):
                patterns = []

            evidence = attributes.get("evidence", [])
            if isinstance(evidence, str):
                # Split string by commas or newlines
                evidence = [e.strip() for e in re.split(r'[,\n]', evidence) if e.strip()]
            elif not isinstance(evidence, list):
                evidence = []

            # Extract confidence
            confidence = attributes.get("confidence", 0.7)
            if not isinstance(confidence, (int, float)):
                try:
                    confidence = float(confidence)
                except (ValueError, TypeError):
                    confidence = 0.7

            # Ensure confidence is between 0 and 1
            confidence = max(0.0, min(1.0, confidence))

            # Create Persona object
            persona = Persona(
                name=name,
                description=attributes.get("description", "No description provided."),
                archetype=attributes.get("archetype", "Unknown"),

                # Create PersonaTrait instances from processed data
                role_context=PersonaTrait(
                    value=processed_traits["role_context"].get("value", ""),
                    confidence=float(processed_traits["role_context"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["role_context"].get("evidence", [])),
                ),
                key_responsibilities=PersonaTrait(
                    value=processed_traits["key_responsibilities"].get("value", ""),
                    confidence=float(processed_traits["key_responsibilities"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["key_responsibilities"].get("evidence", [])),
                ),
                tools_used=PersonaTrait(
                    value=processed_traits["tools_used"].get("value", ""),
                    confidence=float(processed_traits["tools_used"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["tools_used"].get("evidence", [])),
                ),
                collaboration_style=PersonaTrait(
                    value=processed_traits["collaboration_style"].get("value", ""),
                    confidence=float(processed_traits["collaboration_style"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["collaboration_style"].get("evidence", [])),
                ),
                analysis_approach=PersonaTrait(
                    value=processed_traits["analysis_approach"].get("value", ""),
                    confidence=float(processed_traits["analysis_approach"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["analysis_approach"].get("evidence", [])),
                ),
                pain_points=PersonaTrait(
                    value=processed_traits["pain_points"].get("value", ""),
                    confidence=float(processed_traits["pain_points"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["pain_points"].get("evidence", [])),
                ),

                # Create PersonaTrait instances for new fields
                demographics=PersonaTrait(
                    value=processed_traits["demographics"].get("value", ""),
                    confidence=float(processed_traits["demographics"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["demographics"].get("evidence", [])),
                ),
                goals_and_motivations=PersonaTrait(
                    value=processed_traits["goals_and_motivations"].get("value", ""),
                    confidence=float(processed_traits["goals_and_motivations"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["goals_and_motivations"].get("evidence", [])),
                ),
                skills_and_expertise=PersonaTrait(
                    value=processed_traits["skills_and_expertise"].get("value", ""),
                    confidence=float(processed_traits["skills_and_expertise"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["skills_and_expertise"].get("evidence", [])),
                ),
                workflow_and_environment=PersonaTrait(
                    value=processed_traits["workflow_and_environment"].get("value", ""),
                    confidence=float(processed_traits["workflow_and_environment"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["workflow_and_environment"].get("evidence", [])),
                ),
                challenges_and_frustrations=PersonaTrait(
                    value=processed_traits["challenges_and_frustrations"].get("value", ""),
                    confidence=float(processed_traits["challenges_and_frustrations"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["challenges_and_frustrations"].get("evidence", [])),
                ),
                needs_and_desires=PersonaTrait(
                    value=processed_traits["needs_and_desires"].get("value", ""),
                    confidence=float(processed_traits["needs_and_desires"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["needs_and_desires"].get("evidence", [])),
                ),
                technology_and_tools=PersonaTrait(
                    value=processed_traits["technology_and_tools"].get("value", ""),
                    confidence=float(processed_traits["technology_and_tools"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["technology_and_tools"].get("evidence", [])),
                ),
                attitude_towards_research=PersonaTrait(
                    value=processed_traits["attitude_towards_research"].get("value", ""),
                    confidence=float(processed_traits["attitude_towards_research"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["attitude_towards_research"].get("evidence", [])),
                ),
                attitude_towards_ai=PersonaTrait(
                    value=processed_traits["attitude_towards_ai"].get("value", ""),
                    confidence=float(processed_traits["attitude_towards_ai"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["attitude_towards_ai"].get("evidence", [])),
                ),
                key_quotes=PersonaTrait(
                    value=processed_traits["key_quotes"].get("value", ""),
                    confidence=float(processed_traits["key_quotes"].get("confidence", 0.7)),
                    evidence=self._clean_evidence_list(processed_traits["key_quotes"].get("evidence", [])),
                ),

                # Set other fields
                patterns=patterns,
                confidence=confidence,
                evidence=evidence,
                persona_metadata=self._create_metadata(attributes, role),
                role_in_interview=role
            )

            # Calculate overall confidence based on trait confidences
            trait_confidences = [
                persona.role_context.confidence,
                persona.key_responsibilities.confidence,
                persona.tools_used.confidence,
                persona.collaboration_style.confidence,
                persona.analysis_approach.confidence,
                persona.pain_points.confidence,
                persona.demographics.confidence,
                persona.goals_and_motivations.confidence,
                persona.skills_and_expertise.confidence,
                persona.workflow_and_environment.confidence,
                persona.challenges_and_frustrations.confidence,
                persona.needs_and_desires.confidence,
                persona.technology_and_tools.confidence,
                persona.attitude_towards_research.confidence,
                persona.attitude_towards_ai.confidence,
                persona.key_quotes.confidence
            ]

            # Filter out zero confidences
            valid_confidences = [c for c in trait_confidences if c > 0]
            if valid_confidences:
                persona.confidence = sum(valid_confidences) / len(valid_confidences)

            # Ensure we have at least some evidence
            if not persona.evidence:
                # Collect evidence from traits
                all_evidence = []
                for field_name in processed_traits:
                    trait = getattr(persona, field_name)
                    if trait and trait.evidence:
                        all_evidence.extend(trait.evidence[:2])  # Take up to 2 pieces of evidence from each trait

                # Use the collected evidence
                if all_evidence:
                    persona.evidence = all_evidence[:10]  # Limit to 10 pieces of evidence

            # Validate persona with Pydantic if available
            try:
                if 'PersonaSchema' in globals():
                    persona_dict = persona_to_dict(persona)
                    validated_persona = PersonaSchema(**persona_dict)
                    logger.info(f"Successfully validated persona: {persona.name}")
            except ValidationError as e:
                logger.warning(f"Persona validation failed: {str(e)}")

            logger.info(f"Successfully built persona: {persona.name}")
            return persona

        except Exception as e:
            logger.error(f"Error building persona from attributes: {str(e)}", exc_info=True)
            return self.create_fallback_persona(role, name_override)

    def create_fallback_persona(self, role: str = "Participant", name: str = "") -> Persona:
        """
        Create a fallback persona when building fails.

        Args:
            role: Role of the person in the interview
            name: Optional name for the persona (defaults to "Default {role}")

        Returns:
            Fallback persona
        """
        logger.info(f"Creating fallback persona for {role}")

        # Create a minimal trait
        minimal_trait = PersonaTrait(
            value="Unknown",
            confidence=0.3,
            evidence=["Fallback due to processing error"]
        )

        # Use provided name or generate default name
        persona_name = name if name else f"Default {role}"

        # Create fallback persona
        return Persona(
            name=persona_name,
            description=f"Default {role} due to processing error",
            archetype="Unknown",
            # Legacy fields
            role_context=minimal_trait,
            key_responsibilities=minimal_trait,
            tools_used=minimal_trait,
            collaboration_style=minimal_trait,
            analysis_approach=minimal_trait,
            pain_points=minimal_trait,
            # New fields
            demographics=minimal_trait,
            goals_and_motivations=minimal_trait,
            skills_and_expertise=minimal_trait,
            workflow_and_environment=minimal_trait,
            challenges_and_frustrations=minimal_trait,
            needs_and_desires=minimal_trait,
            technology_and_tools=minimal_trait,
            attitude_towards_research=minimal_trait,
            attitude_towards_ai=minimal_trait,
            key_quotes=minimal_trait,
            # Other fields
            patterns=[],
            confidence=0.3,
            evidence=["Fallback due to processing error"],
            persona_metadata={
                "source": "fallback_persona",
                "timestamp": datetime.now().isoformat(),
                "role": role
            },
            role_in_interview=role
        )

    def _clean_evidence_list(self, evidence: Any) -> List[str]:
        """
        Clean and validate evidence list.

        Args:
            evidence: Evidence data

        Returns:
            Cleaned evidence list
        """
        if not evidence:
            return []

        if isinstance(evidence, str):
            return [evidence]

        if isinstance(evidence, list):
            return [str(e) for e in evidence if e]

        return []

    def _create_metadata(self, attributes: Dict[str, Any], role: str) -> Dict[str, Any]:
        """
        Create metadata for persona.

        Args:
            attributes: Persona attributes
            role: Role of the person in the interview

        Returns:
            Metadata dictionary
        """
        metadata = {
            "timestamp": datetime.now().isoformat(),
            "source": "attribute_extraction",
            "role": role
        }

        # Include existing metadata if available
        if "metadata" in attributes and isinstance(attributes["metadata"], dict):
            metadata.update(attributes["metadata"])

        # Include persona_metadata if available (for backward compatibility)
        if "persona_metadata" in attributes and isinstance(attributes["persona_metadata"], dict):
            metadata.update(attributes["persona_metadata"])

        return metadata
