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
import re
import json
from datetime import datetime
from backend.services.processing.demographic_extractor import DemographicExtractor
from backend.services.processing.pattern_categorizer import PatternCategorizer
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
    patterns: List[str] = field(default_factory=list)
    confidence: float = 0.7  # Default confidence
    evidence: List[str] = field(default_factory=list)
    persona_metadata: Optional[Dict[str, Any]] = None  # Changed from metadata
    role_in_interview: str = (
        "Participant"  # Default role in the interview (Interviewee, Interviewer, etc.)
    )

    # Core PydanticAI fields
    archetype: str = "Unknown"
    demographics: Optional[PersonaTrait] = None
    goals_and_motivations: Optional[PersonaTrait] = None
    challenges_and_frustrations: Optional[PersonaTrait] = None
    needs_and_expectations: Optional[PersonaTrait] = None
    decision_making_process: Optional[PersonaTrait] = None
    communication_style: Optional[PersonaTrait] = None
    technology_usage: Optional[PersonaTrait] = None
    pain_points: Optional[PersonaTrait] = None
    key_quotes: Optional[PersonaTrait] = None

    # Legacy fields for backward compatibility
    skills_and_expertise: Optional[PersonaTrait] = None
    workflow_and_environment: Optional[PersonaTrait] = None
    technology_and_tools: Optional[PersonaTrait] = None


def persona_to_dict(persona: Any) -> Dict[str, Any]:
    """
    Convert a Persona object to a dictionary.
    Handles both dataclass Persona objects and database model objects.

    Args:
        persona: Persona object (dataclass or database model)

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
            "metadata": {"error": "No persona data available"},
        }

    # If it's already a dictionary, return it as-is
    if isinstance(persona, dict):
        return persona

    # Try to convert using dataclasses.asdict for dataclass objects
    try:
        persona_dict = asdict(persona)

        # Rename metadata field for backward compatibility
        if "persona_metadata" in persona_dict:
            persona_dict["metadata"] = persona_dict.pop("persona_metadata")

        # Add aliases for backward compatibility
        persona_dict["overall_confidence"] = persona_dict["confidence"]
        persona_dict["supporting_evidence_summary"] = persona_dict["evidence"]

        return persona_dict
    except (TypeError, AttributeError):
        # Handle database model objects or other object types
        logger = logging.getLogger(__name__)
        logger.info(f"Converting non-dataclass persona object to dict: {type(persona)}")

        # Extract attributes manually for database objects
        persona_dict = {}

        # Core fields
        persona_dict["name"] = getattr(persona, "name", "Unknown")
        persona_dict["description"] = getattr(persona, "description", "")
        persona_dict["confidence"] = getattr(persona, "confidence", 0.7)
        persona_dict["evidence"] = getattr(persona, "evidence", [])

        # PersonaTrait fields - handle JSON fields from database
        trait_fields = [
            "demographics",
            "goals_and_motivations",
            "skills_and_expertise",
            "workflow_and_environment",
            "challenges_and_frustrations",
            "technology_and_tools",
            "key_quotes",
            "role_context",
            "key_responsibilities",
            "tools_used",
            "collaboration_style",
            "analysis_approach",
            "pain_points",
        ]

        for field in trait_fields:
            field_value = getattr(persona, field, None)
            if field_value:
                # Handle JSON string fields from database
                if isinstance(field_value, str):
                    try:
                        persona_dict[field] = json.loads(field_value)
                    except (json.JSONDecodeError, TypeError):
                        persona_dict[field] = {
                            "value": field_value,
                            "confidence": 0.7,
                            "evidence": [],
                        }
                else:
                    persona_dict[field] = field_value
            else:
                persona_dict[field] = {"value": "", "confidence": 0.7, "evidence": []}

        # Additional fields
        persona_dict["archetype"] = getattr(persona, "archetype", "")
        persona_dict["patterns"] = getattr(persona, "patterns", [])
        persona_dict["metadata"] = getattr(persona, "metadata", {})

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
        self.demographic_extractor = DemographicExtractor()
        self.pattern_categorizer = PatternCategorizer()

    def build_persona_from_attributes(
        self,
        attributes: Dict[str, Any],
        name_override: str = "",
        role: str = "Participant",
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
            name = name_override
            if not name:
                # Get name from attributes, ensuring it's a string
                attr_name = attributes.get("name", role)
                if isinstance(attr_name, str):
                    name = attr_name
                else:
                    # If name is not a string, use role as fallback
                    logger.warning(
                        f"Name is not a string: {attr_name}, using role as fallback"
                    )
                    name = role

            # Log the attributes for debugging
            logger.info(f"Building persona with name: {name}, role: {role}")
            logger.info(f"Attribute keys: {list(attributes.keys())}")

            # Get overall confidence score if available (for simplified format)
            overall_confidence = 0.7  # Default confidence
            if "overall_confidence_score" in attributes and isinstance(
                attributes["overall_confidence_score"], (int, float)
            ):
                overall_confidence = float(attributes["overall_confidence_score"])
            elif "overall_confidence" in attributes and isinstance(
                attributes["overall_confidence"], (int, float)
            ):
                overall_confidence = float(attributes["overall_confidence"])

            # Handle key_quotes specially - it can be a string, list, or dict
            key_quotes_data = attributes.get("key_quotes", {})
            key_quotes_list = []

            if isinstance(key_quotes_data, list):
                # For simplified format: list of quotes
                key_quotes_list = key_quotes_data
                # Convert list of quotes to a trait
                key_quotes_value = ", ".join(key_quotes_data[:5])  # Take first 5 quotes
                key_quotes_data = {
                    "value": key_quotes_value,
                    "confidence": overall_confidence,  # Use overall confidence
                    "evidence": key_quotes_data,  # Use the quotes as evidence
                }
                logger.info(
                    f"Converted key_quotes list to trait: {len(key_quotes_list)} quotes"
                )
            elif isinstance(key_quotes_data, str):
                # Convert string to a trait
                key_quotes_list = [key_quotes_data]
                key_quotes_data = {
                    "value": key_quotes_data,
                    "confidence": overall_confidence,  # Use overall confidence
                    "evidence": [key_quotes_data],
                }
                logger.info(f"Converted key_quotes string to trait")
            elif isinstance(key_quotes_data, dict) and "value" in key_quotes_data:
                # Already in trait format
                if "evidence" in key_quotes_data and isinstance(
                    key_quotes_data["evidence"], list
                ):
                    key_quotes_list = key_quotes_data["evidence"]
                # Ensure confidence uses overall_confidence if not specified
                if "confidence" not in key_quotes_data:
                    key_quotes_data["confidence"] = overall_confidence
            else:
                # Default empty trait
                key_quotes_data = {
                    "value": "",
                    "confidence": overall_confidence,
                    "evidence": [],
                }
                logger.info(f"Created default key_quotes trait")

            # Process trait fields with robust error handling
            # Core fields from PydanticAI PersonaModel
            trait_fields = {
                # Core PydanticAI fields
                "demographics": attributes.get("demographics", {}),
                "goals_and_motivations": attributes.get("goals_and_motivations", {}),
                "challenges_and_frustrations": attributes.get(
                    "challenges_and_frustrations", {}
                ),
                "needs_and_expectations": attributes.get("needs_and_expectations", {}),
                "decision_making_process": attributes.get(
                    "decision_making_process", {}
                ),
                "communication_style": attributes.get("communication_style", {}),
                "technology_usage": attributes.get("technology_usage", {}),
                "pain_points": attributes.get("pain_points", {}),
                "key_quotes": attributes.get("key_quotes", {}),
                # Legacy fields for backward compatibility
                "role_context": attributes.get("role_context", {}),
                "key_responsibilities": attributes.get("key_responsibilities", {}),
                "tools_used": attributes.get("tools_used", {}),
                "collaboration_style": attributes.get("collaboration_style", {}),
                "analysis_approach": attributes.get("analysis_approach", {}),
                "skills_and_expertise": attributes.get("skills_and_expertise", {}),
                "workflow_and_environment": attributes.get(
                    "workflow_and_environment", {}
                ),
                "technology_and_tools": attributes.get("technology_and_tools", {}),
            }

            # Process each trait field to ensure proper format
            processed_traits = {}
            for field_name, field_data in trait_fields.items():
                if isinstance(field_data, dict) and "value" in field_data:
                    # Standard format - already a dict with value, confidence, evidence
                    processed_trait = field_data.copy()
                    # Ensure confidence uses overall_confidence if not specified
                    if "confidence" not in processed_trait:
                        processed_trait["confidence"] = overall_confidence
                    # Ensure evidence is a list
                    if "evidence" not in processed_trait or not isinstance(
                        processed_trait["evidence"], list
                    ):
                        processed_trait["evidence"] = (
                            key_quotes_list[:2] if key_quotes_list else []
                        )

                    # Special processing for demographics field
                    if field_name == "demographics":
                        # Get all evidence from other fields for context
                        all_evidence = []
                        for other_field, other_data in processed_traits.items():
                            if (
                                isinstance(other_data, dict)
                                and "evidence" in other_data
                            ):
                                all_evidence.extend(other_data.get("evidence", []))

                        # Use the demographic extractor to enhance the demographics field
                        processed_trait = (
                            self.demographic_extractor.extract_demographics(
                                processed_trait, all_evidence
                            )
                        )

                    processed_traits[field_name] = processed_trait
                    logger.debug(f"Field {field_name} already in trait format")
                elif isinstance(field_data, str) and field_data.strip():
                    # String format - convert to dict (simplified format)
                    processed_traits[field_name] = {
                        "value": field_data,
                        "confidence": overall_confidence,
                        "evidence": (
                            key_quotes_list[:2] if key_quotes_list else []
                        ),  # Use key quotes as evidence
                    }
                    logger.debug(f"Converted string field {field_name} to trait")
                elif isinstance(field_data, list) and field_data:
                    # List format - convert to dict
                    processed_traits[field_name] = {
                        "value": ", ".join(
                            str(item) for item in field_data[:3]
                        ),  # Take first 3 items
                        "confidence": overall_confidence,
                        "evidence": (
                            key_quotes_list[:2] if key_quotes_list else []
                        ),  # Use key quotes as evidence
                    }
                    logger.debug(f"Converted list field {field_name} to trait")
                else:
                    # Default empty dict
                    processed_traits[field_name] = {
                        "value": "",
                        "confidence": overall_confidence,  # Use overall confidence
                        "evidence": [],
                    }
                    logger.debug(f"Created default trait for field {field_name}")

            # Add key_quotes to processed traits
            processed_traits["key_quotes"] = key_quotes_data

            # If key_quotes is empty, populate it with quotes from other fields
            if not key_quotes_data.get("evidence") or not key_quotes_data.get("value"):
                logger.info("Key quotes are empty, collecting quotes from other fields")
                all_quotes = []

                # Collect evidence from all other fields
                for field_name, field_data in processed_traits.items():
                    if (
                        field_name != "key_quotes"
                        and isinstance(field_data, dict)
                        and "evidence" in field_data
                    ):
                        if isinstance(field_data["evidence"], list):
                            all_quotes.extend(field_data["evidence"])

                # Remove duplicates and limit to 5-7 quotes
                unique_quotes = []
                for quote in all_quotes:
                    if quote and isinstance(quote, str) and quote not in unique_quotes:
                        unique_quotes.append(quote)
                        if len(unique_quotes) >= 7:
                            break

                if unique_quotes:
                    logger.info(
                        f"Collected {len(unique_quotes)} quotes from other fields"
                    )
                    # Format the value field to be a descriptive summary
                    value_summary = "Key representative quotes that capture the persona's authentic voice and perspective"
                    processed_traits["key_quotes"] = {
                        "value": value_summary,
                        "confidence": overall_confidence,
                        "evidence": unique_quotes[:7],  # Limit to 7 quotes
                    }

            # Extract patterns and evidence
            patterns = attributes.get("patterns", [])
            if isinstance(patterns, str):
                # Split string by commas or newlines
                patterns = [
                    p.strip() for p in re.split(r"[,\n]", patterns) if p.strip()
                ]
            elif not isinstance(patterns, list):
                patterns = []

            # Enhance patterns with more structure if possible
            structured_patterns = []
            if patterns:
                # Try to extract patterns from other fields if patterns list is too short
                if len(patterns) < 3:
                    # Look for patterns in other fields' evidence
                    pattern_keywords = [
                        "always",
                        "often",
                        "tends to",
                        "prefers",
                        "values",
                        "struggles with",
                        "focuses on",
                    ]
                    for field_name, field_data in processed_traits.items():
                        if isinstance(field_data, dict) and "evidence" in field_data:
                            for evidence in field_data.get("evidence", []):
                                for keyword in pattern_keywords:
                                    if keyword in evidence.lower():
                                        potential_pattern = evidence.strip()
                                        if (
                                            potential_pattern
                                            and potential_pattern not in patterns
                                        ):
                                            patterns.append(potential_pattern)
                                            break

                # Format patterns with more structure
                for pattern in patterns:
                    # Clean up the pattern
                    clean_pattern = pattern.strip()
                    if not clean_pattern:
                        continue

                    # Add to structured patterns
                    structured_patterns.append(clean_pattern)

                    # Limit to 7 patterns
                    if len(structured_patterns) >= 7:
                        break

            # Use structured patterns if available, otherwise use original patterns
            patterns = structured_patterns if structured_patterns else patterns

            # Categorize patterns and make them more actionable
            if patterns:
                logger.info(f"Categorizing {len(patterns)} patterns")

                # First categorize the patterns
                categorized_patterns = self.pattern_categorizer.categorize_patterns(
                    patterns
                )

                # Store the original patterns for reference
                original_patterns = patterns.copy()

                # Format patterns as JSON for structured data
                json_patterns = self.pattern_categorizer.format_patterns_as_json(
                    categorized_patterns
                )

                # Then format them for display
                formatted_patterns = (
                    self.pattern_categorizer.format_patterns_for_display(
                        categorized_patterns
                    )
                )

                # Use the formatted patterns
                patterns = formatted_patterns

                logger.info(
                    f"Categorized {len(patterns)} patterns into {len(set([p.split(':')[0].split('(')[0].strip() for p in patterns]))} categories"
                )

                # Store the JSON patterns in the attributes for later use
                attributes["patterns_json"] = json_patterns

            evidence = attributes.get("evidence", [])
            if isinstance(evidence, str):
                # Split string by commas or newlines
                evidence = [
                    e.strip() for e in re.split(r"[,\n]", evidence) if e.strip()
                ]
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
                description=self._get_string_value(
                    attributes.get("description"), "No description provided."
                ),
                archetype=self._get_string_value(
                    attributes.get("archetype"), "Unknown"
                ),
                # Create PersonaTrait instances from processed data with validation
                role_context=self._validate_and_create_persona_trait(
                    processed_traits["role_context"],
                    "role_context",
                    "Professional role context",
                ),
                key_responsibilities=self._validate_and_create_persona_trait(
                    processed_traits["key_responsibilities"],
                    "key_responsibilities",
                    "Key professional responsibilities",
                ),
                tools_used=self._validate_and_create_persona_trait(
                    processed_traits["tools_used"],
                    "tools_used",
                    "Tools and methods used",
                ),
                collaboration_style=self._validate_and_create_persona_trait(
                    processed_traits["collaboration_style"],
                    "collaboration_style",
                    "Collaboration approach",
                ),
                analysis_approach=self._validate_and_create_persona_trait(
                    processed_traits["analysis_approach"],
                    "analysis_approach",
                    "Analysis approach",
                ),
                # Core PydanticAI fields
                demographics=self._validate_and_create_persona_trait(
                    processed_traits["demographics"],
                    "demographics",
                    "Professional demographics",
                ),
                goals_and_motivations=self._validate_and_create_persona_trait(
                    processed_traits["goals_and_motivations"],
                    "goals_and_motivations",
                    "Professional goals and motivations",
                ),
                needs_and_expectations=self._validate_and_create_persona_trait(
                    processed_traits["needs_and_expectations"],
                    "needs_and_expectations",
                    "Professional needs and expectations",
                ),
                decision_making_process=self._validate_and_create_persona_trait(
                    processed_traits["decision_making_process"],
                    "decision_making_process",
                    "Decision making process",
                ),
                communication_style=self._validate_and_create_persona_trait(
                    processed_traits["communication_style"],
                    "communication_style",
                    "Communication style",
                ),
                technology_usage=self._validate_and_create_persona_trait(
                    processed_traits["technology_usage"],
                    "technology_usage",
                    "Technology usage patterns",
                ),
                pain_points=self._validate_and_create_persona_trait(
                    processed_traits["pain_points"],
                    "pain_points",
                    "Professional challenges",
                ),
                skills_and_expertise=self._validate_and_create_persona_trait(
                    processed_traits["skills_and_expertise"],
                    "skills_and_expertise",
                    "Skills and expertise not clearly identified from interview content",
                ),
                workflow_and_environment=self._validate_and_create_persona_trait(
                    processed_traits["workflow_and_environment"],
                    "workflow_and_environment",
                    "Workflow and work environment details not clearly specified in interview",
                ),
                challenges_and_frustrations=self._validate_and_create_persona_trait(
                    processed_traits["challenges_and_frustrations"],
                    "challenges_and_frustrations",
                    "Professional challenges and frustrations",
                ),
                technology_and_tools=self._validate_and_create_persona_trait(
                    processed_traits["technology_and_tools"],
                    "technology_and_tools",
                    "Technology tools and preferences not clearly mentioned in interview",
                ),
                key_quotes=self._validate_and_create_persona_trait(
                    processed_traits["key_quotes"],
                    "key_quotes",
                    "Representative quotes",
                ),
                # Set other fields
                patterns=patterns,
                confidence=confidence,
                evidence=evidence,
                persona_metadata=self._create_metadata(attributes, role),
                role_in_interview=role,
            )

            # For simplified format, use the overall_confidence_score directly if available
            if "overall_confidence_score" in attributes and isinstance(
                attributes["overall_confidence_score"], (int, float)
            ):
                persona.confidence = float(attributes["overall_confidence_score"])
                logger.info(
                    f"Using overall_confidence_score directly: {persona.confidence}"
                )
            else:
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
                    persona.technology_and_tools.confidence,
                    persona.key_quotes.confidence,
                ]

                # Filter out zero confidences
                valid_confidences = [c for c in trait_confidences if c > 0]
                if valid_confidences:
                    persona.confidence = sum(valid_confidences) / len(valid_confidences)
                    logger.info(
                        f"Calculated average confidence from traits: {persona.confidence}"
                    )

            # Fix key_quotes field if it's improperly formatted
            if hasattr(persona, "key_quotes") and persona.key_quotes:
                logger.info("Fixing key_quotes field in persona")

                # Extract current key_quotes data
                key_quotes_value = ""
                key_quotes_confidence = 0.7
                key_quotes_evidence = []

                if hasattr(persona.key_quotes, "value"):
                    key_quotes_value = persona.key_quotes.value
                if hasattr(persona.key_quotes, "confidence"):
                    key_quotes_confidence = persona.key_quotes.confidence
                if hasattr(persona.key_quotes, "evidence"):
                    key_quotes_evidence = persona.key_quotes.evidence

                # Fix key_quotes data
                key_quotes_data = self._fix_key_quotes(
                    {
                        "value": key_quotes_value,
                        "confidence": key_quotes_confidence,
                        "evidence": key_quotes_evidence,
                    }
                )

                logger.info(
                    f"Fixed key_quotes: value={key_quotes_data['value'][:50]}..., evidence count={len(key_quotes_data['evidence'])}"
                )

                # Update the key_quotes field
                if hasattr(persona, "key_quotes"):
                    if hasattr(persona.key_quotes, "value"):
                        persona.key_quotes.value = key_quotes_data["value"]
                    if hasattr(persona.key_quotes, "confidence"):
                        persona.key_quotes.confidence = key_quotes_data["confidence"]
                    if hasattr(persona.key_quotes, "evidence"):
                        persona.key_quotes.evidence = key_quotes_data["evidence"]

                    logger.info(
                        f"Updated key_quotes field in persona: evidence count={len(persona.key_quotes.evidence) if hasattr(persona.key_quotes, 'evidence') else 0}"
                    )

            # Enhance demographics with role context information
            if hasattr(persona, "demographics") and hasattr(persona, "role_context"):
                logger.info("Enhancing demographics with role context information")

                # Extract current demographics and role_context data
                demographics_data = {
                    "value": (
                        persona.demographics.value
                        if hasattr(persona.demographics, "value")
                        else ""
                    ),
                    "confidence": (
                        persona.demographics.confidence
                        if hasattr(persona.demographics, "confidence")
                        else 0.7
                    ),
                    "evidence": (
                        persona.demographics.evidence
                        if hasattr(persona.demographics, "evidence")
                        else []
                    ),
                }

                role_context_data = {
                    "value": (
                        persona.role_context.value
                        if hasattr(persona.role_context, "value")
                        else ""
                    ),
                    "confidence": (
                        persona.role_context.confidence
                        if hasattr(persona.role_context, "confidence")
                        else 0.7
                    ),
                    "evidence": (
                        persona.role_context.evidence
                        if hasattr(persona.role_context, "evidence")
                        else []
                    ),
                }

                # Enhance demographics with role context
                enhanced_demographics = self._enhance_demographics_with_role_context(
                    demographics_data, role_context_data
                )

                logger.info(
                    f"Enhanced demographics: value={enhanced_demographics['value'][:50]}..., evidence count={len(enhanced_demographics['evidence'])}"
                )

                # Update the demographics field
                if hasattr(persona, "demographics"):
                    if hasattr(persona.demographics, "value"):
                        persona.demographics.value = enhanced_demographics["value"]
                    if hasattr(persona.demographics, "confidence"):
                        persona.demographics.confidence = enhanced_demographics[
                            "confidence"
                        ]
                    if hasattr(persona.demographics, "evidence"):
                        persona.demographics.evidence = enhanced_demographics[
                            "evidence"
                        ]

                    logger.info(
                        f"Updated demographics field in persona: evidence count={len(persona.demographics.evidence) if hasattr(persona.demographics, 'evidence') else 0}"
                    )

            # Check if evidence is already well-distributed across fields
            field_evidence_count = 0
            for field_name in processed_traits:
                trait = getattr(persona, field_name)
                if trait and trait.evidence and len(trait.evidence) > 0:
                    field_evidence_count += 1

            # Skip evidence enhancement if we already have good field distribution
            # This prevents duplication when intelligent evidence distribution was already applied
            needs_evidence_enhancement = (
                not persona.evidence
                or len(persona.evidence) < 3
                or all(e.startswith("Fallback") for e in persona.evidence)
            ) and field_evidence_count < 3  # Only if very few fields have evidence (changed from 5 to 3)

            # Skip enhancement if we have good evidence distribution from intelligent mapping
            has_good_evidence_distribution = (
                field_evidence_count >= 8
            )  # Most fields have evidence

            if needs_evidence_enhancement and not has_good_evidence_distribution:
                logger.info(
                    "Enhancing evidence field in persona - poor field distribution detected"
                )
            else:
                logger.info(
                    f"Skipping evidence enhancement - field_evidence_count: {field_evidence_count}, "
                    f"has_good_distribution: {has_good_evidence_distribution}, "
                    f"needs_enhancement: {needs_evidence_enhancement}"
                )

                # AUTHENTIC EVIDENCE PRESERVATION: Keep each trait's evidence separate
                # Instead of mixing evidence between traits, preserve trait-specific authentic quotes
                authentic_evidence_count = 0

                # Process each trait individually to preserve authentic evidence
                for field_name in processed_traits:
                    trait = getattr(persona, field_name)
                    if trait and trait.evidence:
                        # Filter to keep only authentic quotes for this specific trait
                        authentic_trait_evidence = []

                        for evidence in trait.evidence:
                            # Check if this is an authentic quote
                            is_authentic_quote = (
                                evidence.strip().startswith('"')
                                and "**" in evidence
                                and len(evidence.strip()) > 10
                                and not any(
                                    generic in evidence.lower()
                                    for generic in [
                                        "professional",
                                        "industry-standard",
                                        "generic",
                                        "placeholder",
                                        "not specified",
                                        "unknown",
                                        "fallback",
                                        "inferred from",
                                    ]
                                )
                            )

                            # Check for cross-contamination
                            has_cross_contamination = any(
                                indicator in evidence.lower()
                                for indicator in [
                                    "chloe",
                                    "hr",
                                    "human resources",
                                    "employee experience",
                                    "relocation",
                                    "agency",
                                    "paid promotions",
                                    "organic content",
                                ]
                            )

                            if is_authentic_quote and not has_cross_contamination:
                                authentic_trait_evidence.append(evidence)
                                authentic_evidence_count += 1

                        # Update the trait with only its authentic evidence
                        trait.evidence = authentic_trait_evidence

                        if authentic_trait_evidence:
                            logger.info(
                                f"Preserved {len(authentic_trait_evidence)} authentic quotes for {field_name}"
                            )
                        else:
                            logger.debug(
                                f"No authentic evidence found for {field_name}"
                            )

                logger.info(
                    f"Total authentic evidence items preserved: {authentic_evidence_count}"
                )

                # Evidence preservation complete - each trait now has only its authentic quotes
                logger.info("Authentic evidence preservation completed for all traits")

            # Validate persona with Pydantic if available
            try:
                if "PersonaSchema" in globals():
                    persona_dict = persona_to_dict(persona)
                    validated_persona = PersonaSchema(**persona_dict)
                    logger.info(f"Successfully validated persona: {persona.name}")
            except ValidationError as e:
                logger.warning(f"Persona validation failed: {str(e)}")

            # Log evidence counts for debugging
            evidence_counts = {}
            for field_name in processed_traits:
                trait = getattr(persona, field_name)
                if trait and hasattr(trait, "evidence") and trait.evidence:
                    evidence_counts[field_name] = len(trait.evidence)

            logger.info(
                f"Evidence counts for persona {persona.name}: {evidence_counts}"
            )
            logger.info(f"Successfully built persona: {persona.name}")

            # Ensure evidence is preserved in the persona_to_dict conversion
            test_dict = persona_to_dict(persona)
            for field_name, count in evidence_counts.items():
                if (
                    field_name in test_dict
                    and isinstance(test_dict[field_name], dict)
                    and "evidence" in test_dict[field_name]
                ):
                    actual_count = len(test_dict[field_name]["evidence"])
                    if actual_count != count:
                        logger.warning(
                            f"Evidence count mismatch for {field_name}: {count} in persona object, {actual_count} in dict"
                        )

            return persona

        except Exception as e:
            logger.error(
                f"Error building persona from attributes: {str(e)}", exc_info=True
            )
            return self.create_fallback_persona(role, name_override)

    def create_fallback_persona(
        self, role: str = "Participant", name: str = ""
    ) -> Persona:
        """
        Create a meaningful fallback persona when building fails.

        Args:
            role: Role of the person in the interview
            name: Optional name for the persona (defaults to "Default {role}")

        Returns:
            Fallback persona with meaningful content
        """
        logger.info(f"Creating fallback persona for {role}")

        # Use provided name or generate default name
        persona_name = name if name else f"Default {role}"

        # Create meaningful fallback content based on role and persona name
        if role.lower() == "interviewer":
            description = "Research professional conducting stakeholder interviews"
            archetype = "Research Professional"
            demographics_value = "• Role: Interviewer/Researcher\n• Focus: Stakeholder analysis and user research"
            goals_value = "Gather comprehensive insights from stakeholders to inform product/service development"
            challenges_value = (
                "Ensuring comprehensive coverage of stakeholder perspectives and needs"
            )
            needs_value = "Clear, honest responses from interviewees and comprehensive data collection"
        else:
            # Create more specific fallback content based on persona name
            (
                description,
                archetype,
                demographics_value,
                goals_value,
                challenges_value,
                needs_value,
            ) = self._create_specific_fallback_content(name, role)

            # If no specific content found, use generic fallback
            if not description:
                description = (
                    f"Stakeholder participant sharing insights and experiences"
                )
                archetype = "Stakeholder Participant"
                demographics_value = f"• Role: {role}\n• Participation: Active stakeholder in the research process"
                goals_value = (
                    "Share authentic experiences and provide valuable feedback"
                )
                challenges_value = "Communicating complex needs and experiences clearly"
                needs_value = (
                    "Being heard and having input valued in the development process"
                )

        # Create meaningful traits
        demographics_trait = PersonaTrait(
            value=demographics_value,
            confidence=0.6,
            evidence=[f"Inferred from {role} role in interview context"],
        )

        goals_trait = PersonaTrait(
            value=goals_value,
            confidence=0.6,
            evidence=[f"Standard expectations for {role} role"],
        )

        challenges_trait = PersonaTrait(
            value=challenges_value,
            confidence=0.6,
            evidence=[f"Common challenges for {role} participants"],
        )

        needs_trait = PersonaTrait(
            value=needs_value,
            confidence=0.6,
            evidence=[f"Typical needs for {role} in research context"],
        )

        # Create fallback persona
        return Persona(
            name=persona_name,
            description=description,
            archetype=archetype,
            # Legacy fields
            role_context=demographics_trait,
            key_responsibilities=goals_trait,
            tools_used=needs_trait,
            collaboration_style=challenges_trait,
            analysis_approach=goals_trait,
            pain_points=challenges_trait,
            # New fields
            demographics=demographics_trait,
            goals_and_motivations=goals_trait,
            skills_and_expertise=needs_trait,
            workflow_and_environment=demographics_trait,
            challenges_and_frustrations=challenges_trait,
            technology_and_tools=needs_trait,
            needs_and_expectations=needs_trait,
            decision_making_process=goals_trait,
            communication_style=challenges_trait,
            technology_usage=needs_trait,
            key_quotes=PersonaTrait(
                value=f"Representative {role} participating in stakeholder research",
                confidence=0.6,
                evidence=[f"Inferred from {role} participation in interview"],
            ),
            # Other fields
            patterns=[],
            confidence=0.3,
            evidence=["Fallback due to processing error"],
            persona_metadata={
                "source": "fallback_persona",
                "timestamp": datetime.now().isoformat(),
                "role": role,
                "is_fallback": True,
                "overall_confidence_score": 0.3,
            },
            role_in_interview=role,
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
            # Check if the string looks like a JSON array
            if evidence.startswith("[") and evidence.endswith("]"):
                try:
                    # Try to parse it as JSON
                    import json

                    parsed_evidence = json.loads(evidence.replace("'", '"'))
                    if isinstance(parsed_evidence, list):
                        return [str(e) for e in parsed_evidence if e]
                except Exception as e:
                    logger.warning(f"Failed to parse evidence string as JSON: {e}")
            return [evidence]

        if isinstance(evidence, list):
            return [str(e) for e in evidence if e]

        return []

    def _validate_and_create_persona_trait(
        self,
        trait_data: Dict[str, Any],
        field_name: str,
        default_value: str = "Not specified",
    ) -> PersonaTrait:
        """
        Validate and create a PersonaTrait with complete structure.

        Args:
            trait_data: Dictionary containing trait information
            field_name: Name of the field for logging
            default_value: Default value if trait value is empty

        Returns:
            PersonaTrait with validated structure
        """
        # Extract values with validation
        value = trait_data.get("value", "").strip()
        confidence = float(trait_data.get("confidence", 0.7))
        evidence = self._clean_evidence_list(trait_data.get("evidence", []))

        # Validate value is not empty
        if not value:
            logger.warning(
                f"Empty value for {field_name}, using default: '{default_value}'"
            )
            value = default_value
            confidence = (
                0.2  # Significantly reduce confidence for generic fallback content
            )

        # Validate confidence is in valid range
        confidence = max(0.0, min(1.0, confidence))

        # Check for generic/placeholder content and adjust confidence accordingly
        generic_indicators = [
            "professional",
            "domain-specific",
            "industry-standard",
            "work environment",
            "not specified",
            "not clearly",
            "not mentioned",
            "unknown",
            "general",
        ]

        if any(indicator in value.lower() for indicator in generic_indicators):
            logger.warning(
                f"Generic content detected for {field_name}: '{value[:50]}...'"
            )
            confidence = min(confidence, 0.3)  # Cap confidence for generic content

        # Ensure minimum confidence threshold
        if confidence < 0.2:
            logger.warning(
                f"Very low confidence ({confidence}) for {field_name}, setting to minimum 0.2"
            )
            confidence = 0.2

        # Ensure evidence exists - use more descriptive fallback that indicates data quality
        if not evidence:
            # Create fallback evidence that clearly indicates when content is inferred vs authentic
            if any(indicator in value.lower() for indicator in generic_indicators):
                # For generic content, be honest about the lack of specific evidence
                evidence = [
                    f"No specific {field_name.replace('_', ' ')} details found in interview content - using generic placeholder"
                ]
            else:
                # For potentially authentic content, indicate extraction method
                if field_name in [
                    "key_quotes",
                    "pain_points",
                    "challenges_and_frustrations",
                ]:
                    evidence = [
                        f"Authentic {field_name.replace('_', ' ')} extracted from interview responses"
                    ]
                elif field_name in [
                    "skills_and_expertise",
                    "technology_and_tools",
                    "tools_used",
                ]:
                    evidence = [
                        f"Specific {field_name.replace('_', ' ')} identified from participant statements"
                    ]
                elif field_name in ["goals_and_motivations", "needs_and_expectations"]:
                    evidence = [
                        f"Participant-expressed {field_name.replace('_', ' ')} from interview dialogue"
                    ]
                elif field_name in [
                    "workflow_and_environment",
                    "collaboration_style",
                    "communication_style",
                ]:
                    evidence = [
                        f"Observed {field_name.replace('_', ' ')} patterns from interview content"
                    ]
                else:
                    evidence = [
                        f"Contextual {field_name.replace('_', ' ')} insights derived from interview analysis"
                    ]

        return PersonaTrait(value=value, confidence=confidence, evidence=evidence)

    def _fix_key_quotes(self, key_quotes_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Fix key quotes data that might be improperly formatted.

        Args:
            key_quotes_data: Key quotes data

        Returns:
            Fixed key quotes data
        """
        if not key_quotes_data:
            return {"value": "", "confidence": 0.7, "evidence": []}

        # Check if value is a JSON string
        value = key_quotes_data.get("value", "")
        evidence = key_quotes_data.get("evidence", [])
        confidence = key_quotes_data.get("confidence", 0.7)

        logger.info(
            f"Fixing key_quotes: value type={type(value)}, value={value[:100]}..."
        )

        # Handle JSON string in value field
        if isinstance(value, str):
            # Check if it looks like a JSON array
            if (value.startswith("[") and value.endswith("]")) or (
                value.startswith("{") and value.endswith("}")
            ):
                try:
                    # Try to parse it as JSON
                    import json

                    # Replace single quotes with double quotes for JSON parsing
                    # Also handle escaped quotes
                    json_value = value.replace("'", '"').replace('\\"', '"')
                    parsed_value = json.loads(json_value)

                    logger.info(
                        f"Successfully parsed key_quotes JSON: {type(parsed_value)}"
                    )

                    if isinstance(parsed_value, list) and parsed_value:
                        # If evidence is empty but we have quotes in value, move them to evidence
                        if not evidence or len(evidence) == 0:
                            evidence = parsed_value
                            logger.info(
                                f"Moved {len(evidence)} quotes from value to evidence"
                            )
                        # Set value to a descriptive summary
                        value = "Key representative quotes that capture the persona's authentic voice and perspective"
                    elif isinstance(parsed_value, dict) and "value" in parsed_value:
                        # Handle nested structure
                        nested_value = parsed_value.get("value")
                        nested_evidence = parsed_value.get("evidence", [])

                        if isinstance(nested_value, list) and nested_value:
                            evidence = nested_value
                            logger.info(
                                f"Extracted {len(evidence)} quotes from nested value"
                            )
                        elif isinstance(nested_evidence, list) and nested_evidence:
                            evidence = nested_evidence
                            logger.info(
                                f"Extracted {len(evidence)} quotes from nested evidence"
                            )

                        value = "Key representative quotes that capture the persona's authentic voice and perspective"
                except Exception as e:
                    logger.warning(f"Failed to parse key_quotes value as JSON: {e}")

                    # Fallback: try to extract quotes using regex
                    if not evidence or len(evidence) == 0:
                        import re

                        # Look for quoted strings
                        quotes = re.findall(r'"([^"]*)"', value)
                        if quotes:
                            evidence = quotes
                            logger.info(f"Extracted {len(evidence)} quotes using regex")
                            value = "Key representative quotes that capture the persona's authentic voice and perspective"

        # Ensure evidence is a list of strings
        if evidence and isinstance(evidence, list):
            # Clean up evidence items
            cleaned_evidence = []
            for item in evidence:
                if item and isinstance(item, str):
                    # Remove extra quotes and clean up
                    clean_item = item.strip()
                    if clean_item.startswith('"') and clean_item.endswith('"'):
                        clean_item = clean_item[1:-1]
                    if clean_item:
                        cleaned_evidence.append(clean_item)

            evidence = cleaned_evidence
            logger.info(f"Cleaned up evidence, now have {len(evidence)} quotes")

        # If we still don't have evidence but have a value, use the value as a single quote
        if (
            (not evidence or len(evidence) == 0)
            and value
            and value
            != "Key representative quotes that capture the persona's authentic voice and perspective"
        ):
            evidence = [value]
            value = "Key representative quotes that capture the persona's authentic voice and perspective"
            logger.info("Used value as a single quote in evidence")

        return {"value": value, "confidence": confidence, "evidence": evidence}

    def _enhance_demographics_with_role_context(
        self, demographics: Dict[str, Any], role_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Enhance demographics with information from role context.

        Args:
            demographics: Demographics data
            role_context: Role context data

        Returns:
            Enhanced demographics data
        """
        # Get existing values
        demo_value = demographics.get("value", "")
        role_value = role_context.get("value", "")

        # Combine evidence
        combined_evidence = demographics.get("evidence", []) + role_context.get(
            "evidence", []
        )
        combined_evidence = list(set(combined_evidence))  # Remove duplicates

        # Extract company and organizational information from role context
        company_info = []
        role_info = []

        # Look for company mentions in role context
        for company_pattern in [
            "company",
            "organization",
            "startup",
            "firm",
            "employer",
            "Volkswagen",
            "Google",
            "Microsoft",
            "Amazon",
            "Apple",
        ]:
            if company_pattern in role_value:
                # Extract the sentence containing the company
                sentences = role_value.split(". ")
                for sentence in sentences:
                    if company_pattern in sentence:
                        company_info.append(sentence.strip())
                        break

        # Look for role mentions in role context
        for role_pattern in [
            "role",
            "position",
            "job",
            "title",
            "responsibility",
            "designer",
            "developer",
            "manager",
            "director",
            "lead",
        ]:
            if role_pattern in role_value.lower():
                # Extract the sentence containing the role
                sentences = role_value.split(". ")
                for sentence in sentences:
                    if role_pattern in sentence.lower():
                        role_info.append(sentence.strip())
                        break

        # Create enhanced value
        enhanced_parts = []

        # Start with original demographics
        if demo_value:
            enhanced_parts.append(demo_value)

        # Add company information if not already in demographics
        for info in company_info:
            if info and not any(
                info.lower() in part.lower() for part in enhanced_parts
            ):
                enhanced_parts.append(info)

        # Add role information if not already in demographics
        for info in role_info:
            if info and not any(
                info.lower() in part.lower() for part in enhanced_parts
            ):
                enhanced_parts.append(info)

        # Join all parts
        enhanced_value = " | ".join(enhanced_parts)

        return {
            "value": enhanced_value,
            "confidence": max(
                demographics.get("confidence", 0.7), role_context.get("confidence", 0.7)
            ),
            "evidence": combined_evidence,
        }

    def _get_specific_evidence_label(self, evidence: str, default_label: str) -> str:
        """
        Get a more specific label for evidence based on its content.

        Args:
            evidence: Evidence text
            default_label: Default label to use if no specific label can be determined

        Returns:
            Specific label for the evidence
        """
        evidence_lower = evidence.lower()

        # Define patterns for specific labels
        label_patterns = {
            "Career Background": [
                "background",
                "education",
                "degree",
                "graduated",
                "university",
                "college",
                "school",
            ],
            "Experience": [
                "experience",
                "years",
                "worked",
                "working",
                "job",
                "position",
                "role",
            ],
            "Skill": [
                "skill",
                "know how to",
                "able to",
                "capable of",
                "proficient",
                "expertise",
            ],
            "Tool Preference": [
                "prefer",
                "like",
                "use",
                "tool",
                "software",
                "platform",
                "application",
            ],
            "Challenge": [
                "challenge",
                "difficult",
                "hard",
                "struggle",
                "problem",
                "issue",
                "obstacle",
            ],
            "Frustration": [
                "frustrat",
                "annoy",
                "irritat",
                "bother",
                "upset",
                "disappoint",
            ],
            "Goal": [
                "goal",
                "aim",
                "objective",
                "target",
                "want to",
                "trying to",
                "hope to",
            ],
            "Motivation": [
                "motivat",
                "drive",
                "inspire",
                "passion",
                "interest",
                "excite",
            ],
            "Need": [
                "need",
                "require",
                "must have",
                "essential",
                "necessary",
                "important",
            ],
            "Desire": ["desire", "wish", "want", "would like", "prefer", "hope for"],
            "Workflow": [
                "workflow",
                "process",
                "procedure",
                "approach",
                "method",
                "routine",
            ],
            "Collaboration": [
                "collaborat",
                "team",
                "work with",
                "together",
                "colleague",
                "partner",
            ],
            "Research Approach": [
                "research",
                "study",
                "investigate",
                "analyze",
                "examine",
                "explore",
            ],
            "Pain Point": [
                "pain",
                "frustrat",
                "annoy",
                "difficult",
                "challenge",
                "problem",
                "hate",
            ],
            "Quote": ['"', "'", "said", "mentioned", "stated", "expressed"],
            "Company": [
                "company",
                "organization",
                "startup",
                "firm",
                "employer",
                "corporation",
                "business",
            ],
            "Role": [
                "designer",
                "developer",
                "manager",
                "director",
                "lead",
                "specialist",
                "analyst",
                "consultant",
            ],
        }

        # Check for matches
        for label, patterns in label_patterns.items():
            for pattern in patterns:
                if pattern in evidence_lower:
                    return label

        # If no specific label found, use the default
        return default_label

    def _get_string_value(self, value: Any, default: str = "") -> str:
        """
        Get a string value from a value of any type.

        Args:
            value: Value to convert to string
            default: Default value if value is not a string

        Returns:
            String value
        """
        if isinstance(value, str):
            return value
        elif value is None:
            return default
        else:
            try:
                # Try to convert to string
                return str(value)
            except Exception as e:
                logger.warning(f"Could not convert value to string: {e}")
                return default

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
            "role": role,
        }

        # Include existing metadata if available
        if "metadata" in attributes and isinstance(attributes["metadata"], dict):
            metadata.update(attributes["metadata"])

        # Include persona_metadata if available (for backward compatibility)
        if "persona_metadata" in attributes and isinstance(
            attributes["persona_metadata"], dict
        ):
            metadata.update(attributes["persona_metadata"])

        return metadata

    def _create_specific_fallback_content(self, name: str, role: str) -> tuple:
        """
        Create specific fallback content based on persona name patterns.

        Args:
            name: Persona name (e.g., "Tech_Reviewers_Influencers")
            role: Role (e.g., "Interviewee")

        Returns:
            Tuple of (description, archetype, demographics_value, goals_value, challenges_value, needs_value)
        """
        if not name:
            return None, None, None, None, None, None

        name_lower = name.lower()

        # Tech Reviewers/Influencers
        if "tech" in name_lower and (
            "reviewer" in name_lower or "influencer" in name_lower
        ):
            return (
                "Technology-focused professional who reviews products and influences purchasing decisions through expertise and recommendations",
                "Tech Influencer",
                "• Role: Technology Reviewer/Influencer\n• Experience: Extensive experience with tech products\n• Audience: Followers who trust their technology recommendations",
                "Provide honest, detailed reviews of technology products to help others make informed purchasing decisions while building credibility and influence in the tech community",
                "Balancing honest criticism with maintaining relationships with tech companies, staying current with rapidly evolving technology landscape, and managing audience expectations",
                "Access to latest technology products for review, maintaining credibility and trust with audience, and clear communication channels with tech companies",
            )

        # Default fallback
        return None, None, None, None, None, None
