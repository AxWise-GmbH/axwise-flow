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
            name = name_override
            if not name:
                # Get name from attributes, ensuring it's a string
                attr_name = attributes.get("name", role)
                if isinstance(attr_name, str):
                    name = attr_name
                else:
                    # If name is not a string, use role as fallback
                    logger.warning(f"Name is not a string: {attr_name}, using role as fallback")
                    name = role

            # Log the attributes for debugging
            logger.info(f"Building persona with name: {name}, role: {role}")
            logger.info(f"Attribute keys: {list(attributes.keys())}")

            # Get overall confidence score if available (for simplified format)
            overall_confidence = 0.7  # Default confidence
            if "overall_confidence_score" in attributes and isinstance(attributes["overall_confidence_score"], (int, float)):
                overall_confidence = float(attributes["overall_confidence_score"])
            elif "overall_confidence" in attributes and isinstance(attributes["overall_confidence"], (int, float)):
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
                    "evidence": key_quotes_data  # Use the quotes as evidence
                }
                logger.info(f"Converted key_quotes list to trait: {len(key_quotes_list)} quotes")
            elif isinstance(key_quotes_data, str):
                # Convert string to a trait
                key_quotes_list = [key_quotes_data]
                key_quotes_data = {
                    "value": key_quotes_data,
                    "confidence": overall_confidence,  # Use overall confidence
                    "evidence": [key_quotes_data]
                }
                logger.info(f"Converted key_quotes string to trait")
            elif isinstance(key_quotes_data, dict) and "value" in key_quotes_data:
                # Already in trait format
                if "evidence" in key_quotes_data and isinstance(key_quotes_data["evidence"], list):
                    key_quotes_list = key_quotes_data["evidence"]
                # Ensure confidence uses overall_confidence if not specified
                if "confidence" not in key_quotes_data:
                    key_quotes_data["confidence"] = overall_confidence
            else:
                # Default empty trait
                key_quotes_data = {
                    "value": "",
                    "confidence": overall_confidence,
                    "evidence": []
                }
                logger.info(f"Created default key_quotes trait")

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
                    processed_trait = field_data.copy()
                    # Ensure confidence uses overall_confidence if not specified
                    if "confidence" not in processed_trait:
                        processed_trait["confidence"] = overall_confidence
                    # Ensure evidence is a list
                    if "evidence" not in processed_trait or not isinstance(processed_trait["evidence"], list):
                        processed_trait["evidence"] = key_quotes_list[:2] if key_quotes_list else []

                    # Special processing for demographics field
                    if field_name == "demographics" and "value" in processed_trait:
                        # Enhance demographics value with more structured information
                        demo_value = processed_trait["value"]
                        if demo_value:
                            # Extract demographic information from evidence if available
                            demo_evidence = processed_trait.get("evidence", [])
                            gender_terms = ["male", "female", "man", "woman", "non-binary", "they", "she", "he"]
                            experience_terms = ["senior", "junior", "mid", "lead", "manager", "director", "executive", "entry"]

                            # Try to extract gender and experience level from evidence
                            gender = ""
                            experience = ""
                            for evidence_item in demo_evidence:
                                evidence_lower = evidence_item.lower()
                                # Check for gender terms
                                for term in gender_terms:
                                    if term in evidence_lower:
                                        gender = term.capitalize()
                                        break
                                # Check for experience terms
                                for term in experience_terms:
                                    if term in evidence_lower:
                                        experience = term.capitalize()
                                        break

                            # Format demographics in a more structured way
                            structured_demo = []
                            if gender:
                                structured_demo.append(f"Gender: {gender}")
                            if experience:
                                structured_demo.append(f"Experience Level: {experience}")

                            # Add any other demographic information from the original value
                            if demo_value and not any(item in demo_value for item in structured_demo):
                                structured_demo.append(f"Profile: {demo_value}")

                            # Update the value with the structured format
                            if structured_demo:
                                processed_trait["value"] = " | ".join(structured_demo)

                    processed_traits[field_name] = processed_trait
                    logger.debug(f"Field {field_name} already in trait format")
                elif isinstance(field_data, str) and field_data.strip():
                    # String format - convert to dict (simplified format)
                    processed_traits[field_name] = {
                        "value": field_data,
                        "confidence": overall_confidence,
                        "evidence": key_quotes_list[:2] if key_quotes_list else []  # Use key quotes as evidence
                    }
                    logger.debug(f"Converted string field {field_name} to trait")
                elif isinstance(field_data, list) and field_data:
                    # List format - convert to dict
                    processed_traits[field_name] = {
                        "value": ", ".join(str(item) for item in field_data[:3]),  # Take first 3 items
                        "confidence": overall_confidence,
                        "evidence": key_quotes_list[:2] if key_quotes_list else []  # Use key quotes as evidence
                    }
                    logger.debug(f"Converted list field {field_name} to trait")
                else:
                    # Default empty dict
                    processed_traits[field_name] = {
                        "value": "",
                        "confidence": overall_confidence,  # Use overall confidence
                        "evidence": []
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
                    if field_name != "key_quotes" and isinstance(field_data, dict) and "evidence" in field_data:
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
                    logger.info(f"Collected {len(unique_quotes)} quotes from other fields")
                    # Format the value field to be a descriptive summary
                    value_summary = "Key representative quotes that capture the persona's authentic voice and perspective"
                    processed_traits["key_quotes"] = {
                        "value": value_summary,
                        "confidence": overall_confidence,
                        "evidence": unique_quotes[:7]  # Limit to 7 quotes
                    }

            # Extract patterns and evidence
            patterns = attributes.get("patterns", [])
            if isinstance(patterns, str):
                # Split string by commas or newlines
                patterns = [p.strip() for p in re.split(r'[,\n]', patterns) if p.strip()]
            elif not isinstance(patterns, list):
                patterns = []

            # Enhance patterns with more structure if possible
            structured_patterns = []
            if patterns:
                # Try to extract patterns from other fields if patterns list is too short
                if len(patterns) < 3:
                    # Look for patterns in other fields' evidence
                    pattern_keywords = ["always", "often", "tends to", "prefers", "values", "struggles with", "focuses on"]
                    for field_name, field_data in processed_traits.items():
                        if isinstance(field_data, dict) and "evidence" in field_data:
                            for evidence in field_data.get("evidence", []):
                                for keyword in pattern_keywords:
                                    if keyword in evidence.lower():
                                        potential_pattern = evidence.strip()
                                        if potential_pattern and potential_pattern not in patterns:
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
                description=self._get_string_value(attributes.get("description"), "No description provided."),
                archetype=self._get_string_value(attributes.get("archetype"), "Unknown"),

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

            # For simplified format, use the overall_confidence_score directly if available
            if "overall_confidence_score" in attributes and isinstance(attributes["overall_confidence_score"], (int, float)):
                persona.confidence = float(attributes["overall_confidence_score"])
                logger.info(f"Using overall_confidence_score directly: {persona.confidence}")
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
                    logger.info(f"Calculated average confidence from traits: {persona.confidence}")

            # Ensure we have at least some evidence
            if not persona.evidence or len(persona.evidence) < 3 or all(e.startswith("Fallback") for e in persona.evidence):
                # Collect evidence from traits
                all_evidence = []

                # Prioritize certain fields for evidence collection
                priority_fields = ["key_quotes", "pain_points", "skills_and_expertise", "goals_and_motivations", "challenges_and_frustrations"]

                # First collect from priority fields
                for field_name in priority_fields:
                    if field_name in processed_traits:
                        trait = getattr(persona, field_name)
                        if trait and trait.evidence:
                            # Get the most representative evidence from this trait
                            best_evidence = sorted(trait.evidence, key=len, reverse=True)[:2]  # Take up to 2 longest pieces of evidence
                            all_evidence.extend(best_evidence)

                # Then collect from other fields if needed
                if len(all_evidence) < 5:
                    for field_name in processed_traits:
                        if field_name not in priority_fields:
                            trait = getattr(persona, field_name)
                            if trait and trait.evidence:
                                # Get one piece of evidence from each non-priority field
                                best_evidence = sorted(trait.evidence, key=len, reverse=True)[:1]
                                all_evidence.extend(best_evidence)

                                # Stop if we have enough evidence
                                if len(all_evidence) >= 10:
                                    break

                # Remove duplicates while preserving order
                unique_evidence = []
                for e in all_evidence:
                    if e and e not in unique_evidence and len(e) > 20:  # Only include substantial evidence
                        unique_evidence.append(e)

                # Use the collected evidence
                if unique_evidence:
                    persona.evidence = unique_evidence[:10]  # Limit to 10 pieces of evidence

                    # Add descriptive labels to evidence for better context
                    labeled_evidence = []
                    for i, e in enumerate(persona.evidence):
                        if i < len(priority_fields) and i < len(persona.evidence):
                            field = priority_fields[i].replace("_", " ").title()
                            labeled_evidence.append(f"{field}: {e}")
                        else:
                            labeled_evidence.append(e)

                    persona.evidence = labeled_evidence

            # Validate persona with Pydantic if available
            try:
                if 'PersonaSchema' in globals():
                    persona_dict = persona_to_dict(persona)
                    validated_persona = PersonaSchema(**persona_dict)
                    logger.info(f"Successfully validated persona: {persona.name}")
            except ValidationError as e:
                logger.warning(f"Persona validation failed: {str(e)}")

            # Log evidence counts for debugging
            evidence_counts = {}
            for field_name in processed_traits:
                trait = getattr(persona, field_name)
                if trait and hasattr(trait, 'evidence') and trait.evidence:
                    evidence_counts[field_name] = len(trait.evidence)

            logger.info(f"Evidence counts for persona {persona.name}: {evidence_counts}")
            logger.info(f"Successfully built persona: {persona.name}")

            # Ensure evidence is preserved in the persona_to_dict conversion
            test_dict = persona_to_dict(persona)
            for field_name, count in evidence_counts.items():
                if field_name in test_dict and isinstance(test_dict[field_name], dict) and 'evidence' in test_dict[field_name]:
                    actual_count = len(test_dict[field_name]['evidence'])
                    if actual_count != count:
                        logger.warning(f"Evidence count mismatch for {field_name}: {count} in persona object, {actual_count} in dict")

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
            key_quotes=PersonaTrait(
                value="No quotes available",
                confidence=0.3,
                evidence=["Fallback due to processing error"]
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
                "overall_confidence_score": 0.3
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
            "role": role
        }

        # Include existing metadata if available
        if "metadata" in attributes and isinstance(attributes["metadata"], dict):
            metadata.update(attributes["metadata"])

        # Include persona_metadata if available (for backward compatibility)
        if "persona_metadata" in attributes and isinstance(attributes["persona_metadata"], dict):
            metadata.update(attributes["persona_metadata"])

        return metadata
