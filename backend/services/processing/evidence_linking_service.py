"""
Evidence linking service for persona formation.

This module provides functionality for:
1. Finding the most relevant quotes for persona attributes
2. Linking quotes directly to specific attributes
3. Including quote context when necessary
"""

from typing import Dict, Any, List, Optional, Tuple
import logging
import re
import json
try:
    # Try to import from backend structure
    from domain.interfaces.llm_unified import ILLMService
    from backend.services.llm.prompts.tasks.evidence_linking import EvidenceLinkingPrompts
except ImportError:
    try:
        # Try to import from regular structure
        from backend.domain.interfaces.llm_unified import ILLMService
        from backend.services.llm.prompts.tasks.evidence_linking import EvidenceLinkingPrompts
    except ImportError:
        # Create a minimal interface if both fail
        class ILLMService:
            """Minimal LLM service interface"""
            async def analyze(self, *args, **kwargs):
                raise NotImplementedError("This is a minimal interface")

        # Create a minimal prompt class
        class EvidenceLinkingPrompts:
            """Minimal prompt class"""
            @staticmethod
            def get_prompt(data):
                return ""

# Configure logging
logger = logging.getLogger(__name__)


class EvidenceLinkingService:
    """
    Service for linking evidence to persona attributes.

    This service uses targeted LLM calls to find the most relevant quotes
    for each attribute in a persona.
    """

    def __init__(self, llm_service: ILLMService):
        """
        Initialize the evidence linking service.

        Args:
            llm_service: LLM service for finding relevant quotes
        """
        self.llm_service = llm_service
        logger.info("Initialized EvidenceLinkingService")

    async def link_evidence_to_attributes(
        self, attributes: Dict[str, Any], full_text: str
    ) -> Dict[str, Any]:
        """
        Link evidence to persona attributes.

        Args:
            attributes: Persona attributes (can be simple strings or nested dicts)
            full_text: Full text to extract evidence from

        Returns:
            Enhanced persona attributes with evidence
        """
        logger.info("Linking evidence to attributes")

        # List of trait fields to enhance with evidence
        trait_fields = [
            "demographics", "goals_and_motivations", "skills_and_expertise",
            "workflow_and_environment", "challenges_and_frustrations",
            "needs_and_desires", "technology_and_tools", "attitude_towards_research",
            "attitude_towards_ai", "key_quotes", "role_context", "key_responsibilities",
            "tools_used", "collaboration_style", "analysis_approach", "pain_points"
        ]

        # Create a new dictionary to store the enhanced attributes
        enhanced_attributes = attributes.copy()

        # Process each trait field
        for field in trait_fields:
            if field in attributes:
                try:
                    # Handle both simple string values and nested dict structures
                    trait_value = ""

                    if isinstance(attributes[field], dict) and "value" in attributes[field]:
                        # Nested structure
                        trait_value = attributes[field]["value"]
                    elif isinstance(attributes[field], str):
                        # Simple string value
                        trait_value = attributes[field]

                    # Skip if the trait value is empty or default
                    if not trait_value or trait_value.startswith("Unknown") or trait_value.startswith("Default"):
                        continue

                    # Find relevant quotes for this trait
                    quotes = await self._find_relevant_quotes(field, trait_value, full_text)

                    # Update the evidence if quotes were found
                    if quotes:
                        # If the attribute is already a dict with evidence field, update it
                        if isinstance(enhanced_attributes[field], dict) and "evidence" in enhanced_attributes[field]:
                            enhanced_attributes[field]["evidence"] = quotes
                            # Increase confidence slightly since we found supporting evidence
                            enhanced_attributes[field]["confidence"] = min(
                                enhanced_attributes[field].get("confidence", 0.7) + 0.1, 1.0
                            )
                        else:
                            # For simple string values, convert to dict structure with evidence
                            enhanced_attributes[field] = {
                                "value": trait_value,
                                "confidence": 0.8,  # Good confidence since we have evidence
                                "evidence": quotes
                            }

                        logger.info(f"Added {len(quotes)} quotes as evidence for {field}")
                    else:
                        # If no quotes found but we need to maintain the dict structure
                        if not isinstance(enhanced_attributes[field], dict):
                            enhanced_attributes[field] = {
                                "value": trait_value,
                                "confidence": 0.7,
                                "evidence": []
                            }
                        logger.warning(f"No relevant quotes found for {field}")
                except Exception as e:
                    logger.error(f"Error linking evidence for {field}: {str(e)}", exc_info=True)

        return enhanced_attributes

    async def _find_relevant_quotes(
        self, field: str, trait_value: str, full_text: str
    ) -> List[str]:
        """
        Find relevant quotes for a trait using LLM.

        Args:
            field: Trait field name
            trait_value: Trait value
            full_text: Full text to extract quotes from

        Returns:
            List of relevant quotes with context
        """
        try:
            # Create a prompt for finding relevant quotes
            prompt = self._create_quote_finding_prompt(field, trait_value)

            # Limit text length for LLM processing
            text_to_analyze = full_text
            if len(full_text) > 16000:
                logger.info(f"Text is very long ({len(full_text)} chars), using first 16000 chars")
                text_to_analyze = full_text[:16000]

            # Call LLM to find relevant quotes
            llm_response = await self.llm_service.analyze({
                "task": "evidence_linking",
                "text": text_to_analyze,
                "prompt": prompt,
                "enforce_json": True,
                "temperature": 0.0  # Use deterministic output for consistent results
            })

            # Parse the response
            quotes = self._parse_llm_response(llm_response)

            # If LLM failed to find quotes, fall back to regex-based approach
            if not quotes:
                logger.info(f"LLM failed to find quotes for {field}, falling back to regex approach")
                quotes = self._find_quotes_with_regex(trait_value, full_text)

            # Limit to 2-3 most relevant quotes
            return quotes[:3]

        except Exception as e:
            logger.error(f"Error finding quotes for {field}: {str(e)}", exc_info=True)
            # Fall back to regex-based approach on error
            return self._find_quotes_with_regex(trait_value, full_text)

    def _create_quote_finding_prompt(self, field: str, trait_value: str) -> str:
        """
        Create a prompt for finding relevant quotes.

        Args:
            field: Trait field name
            trait_value: Trait value

        Returns:
            Prompt string
        """
        # Format field name for better readability
        formatted_field = field.replace("_", " ").title()

        # Use the prompt from the EvidenceLinkingPrompts class
        return EvidenceLinkingPrompts.get_prompt({
            "field": field,
            "trait_value": trait_value
        })

    def _parse_llm_response(self, llm_response: Any) -> List[str]:
        """
        Parse LLM response to extract quotes.

        Args:
            llm_response: Response from LLM

        Returns:
            List of quotes
        """
        try:
            # Handle different response types
            if isinstance(llm_response, list):
                # Response is already a list of quotes
                return [str(quote) for quote in llm_response if quote]
            elif isinstance(llm_response, dict) and "quotes" in llm_response:
                # Response is a dictionary with a "quotes" key (new format)
                quotes = llm_response["quotes"]
                if isinstance(quotes, list):
                    return [str(quote) for quote in quotes if quote]
            elif isinstance(llm_response, str):
                # Try to parse as JSON
                try:
                    parsed_json = json.loads(llm_response)
                    if isinstance(parsed_json, list):
                        # Old format: direct list of quotes
                        return [str(quote) for quote in parsed_json if quote]
                    elif isinstance(parsed_json, dict) and "quotes" in parsed_json:
                        # New format: dictionary with "quotes" key
                        quotes = parsed_json["quotes"]
                        if isinstance(quotes, list):
                            return [str(quote) for quote in quotes if quote]
                except json.JSONDecodeError:
                    # If not valid JSON, try to extract quotes using regex
                    return self._extract_quotes_from_text(llm_response)

            # Default empty list if parsing fails
            return []

        except Exception as e:
            logger.error(f"Error parsing LLM response: {str(e)}", exc_info=True)
            return []

    def _extract_quotes_from_text(self, text: str) -> List[str]:
        """
        Extract quotes from text using regex.

        Args:
            text: Text to extract quotes from

        Returns:
            List of quotes
        """
        # Try to extract quotes enclosed in quotation marks
        quotes = re.findall(r'"([^"]+)"', text)

        # If no quotes found, try to extract lines that look like quotes
        if not quotes:
            lines = text.split('\n')
            quotes = [line.strip() for line in lines if len(line.strip()) > 15 and not line.startswith(('```', '#', '/*', '*/', '//'))]

        return quotes

    def _find_quotes_with_regex(self, trait_value: str, full_text: str) -> List[str]:
        """
        Find quotes using regex pattern matching.

        Args:
            trait_value: Trait value to find evidence for
            full_text: Full text to search in

        Returns:
            List of quotes
        """
        # Extract key terms from the trait value
        key_terms = []

        # Split by common delimiters
        for delimiter in [',', '.', ';', ':', '-', '(', ')', '&']:
            if delimiter in trait_value:
                key_terms.extend([term.strip() for term in trait_value.split(delimiter)])

        # If no terms found with delimiters, use the whole trait value
        if not key_terms:
            key_terms = [trait_value]

        # Filter out short terms and duplicates
        key_terms = list(set([term for term in key_terms if len(term) > 5]))

        # Find sentences containing key terms
        quotes = []
        sentences = re.split(r'(?<=[.!?])\s+', full_text)

        for term in key_terms:
            term_quotes = []
            for i, sentence in enumerate(sentences):
                if term.lower() in sentence.lower():
                    # Get context (previous and next sentence if available)
                    start_idx = max(0, i - 1)
                    end_idx = min(len(sentences), i + 2)
                    context = ' '.join(sentences[start_idx:end_idx])
                    term_quotes.append(context)

            # Sort by length (prefer longer quotes with more context)
            term_quotes.sort(key=len, reverse=True)

            # Take the top 1-2 quotes for this term
            quotes.extend(term_quotes[:2])

            # Limit to 3 quotes total
            if len(quotes) >= 3:
                break

        return quotes[:3]
