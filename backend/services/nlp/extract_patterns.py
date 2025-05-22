"""
Extract patterns method for the NLPProcessor class.

This module provides the extract_patterns method for the NLPProcessor class,
which uses the new PatternService to generate patterns from text data.
"""

import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

async def extract_patterns(self, transcript, themes=None, industry=None):
    """
    Extract patterns from transcript and themes.

    Args:
        transcript: Structured transcript
        themes: Optional themes to use for pattern generation
        industry: Optional industry context

    Returns:
        Dictionary with patterns
    """
    try:
        logger.info(f"Extracting patterns from transcript with {len(themes) if themes else 0} themes")

        # Combine all dialogue into a single text
        combined_text = self._combine_transcript_text(transcript)
        if not combined_text:
            logger.warning("No text found in transcript for pattern extraction")
            return {"patterns": []}

        # Use the new pattern service if available
        try:
            from backend.services.processing.pattern_service import PatternService
            
            # Create pattern service
            pattern_service = PatternService()
            
            # Generate patterns
            pattern_response = await pattern_service.generate_patterns(
                text=combined_text,
                industry=industry,
                themes=themes
            )
            
            # Convert to dictionary format for backward compatibility
            patterns_dict = {"patterns": []}
            
            for pattern in pattern_response.patterns:
                patterns_dict["patterns"].append({
                    "name": pattern.name,
                    "category": pattern.category,
                    "description": pattern.description,
                    "frequency": pattern.frequency,
                    "sentiment": pattern.sentiment,
                    "evidence": pattern.evidence,
                    "impact": pattern.impact,
                    "suggested_actions": pattern.suggested_actions
                })
            
            logger.info(f"Extracted {len(patterns_dict['patterns'])} patterns using PatternService")
            return patterns_dict
            
        except ImportError:
            logger.warning("PatternService not available, falling back to legacy pattern extraction")
            
            # Fall back to legacy pattern extraction
            # Get filename if available
            filename = None
            if isinstance(transcript, list) and len(transcript) > 0 and isinstance(transcript[0], dict):
                # Try to extract filename from metadata
                if "metadata" in transcript[0] and isinstance(transcript[0]["metadata"], dict):
                    filename = transcript[0]["metadata"].get("filename")

            # Initialize results
            patterns_result = {"patterns": []}
            has_patterns = False

            # If we have themes, try to extract patterns from them first
            if themes and len(themes) > 0:
                logger.info(f"Attempting to extract patterns from {len(themes)} themes")

                # Extract patterns from themes
                theme_patterns = await self._extract_patterns_from_themes(combined_text, themes, self.llm_service)

                if theme_patterns and len(theme_patterns) > 0:
                    logger.info(f"Successfully extracted {len(theme_patterns)} patterns from themes")
                    patterns_result["patterns"] = theme_patterns
                    has_patterns = True
                else:
                    logger.warning("Failed to extract patterns from themes")

            # If we don't have patterns from themes, try direct pattern recognition
            if not has_patterns:
                logger.info("Attempting direct pattern recognition")

                # Detect industry from the text
                detected_industry = await self._detect_industry(combined_text, self.llm_service)
                logger.info(f"Detected industry: {detected_industry}")

                # Use provided industry if available, otherwise use detected industry
                industry_to_use = industry or detected_industry

                # Create pattern recognition payload with filename if available
                pattern_payload = {
                    "task": "pattern_recognition",
                    "text": combined_text,
                    "industry": industry_to_use
                }

                # Add filename to payload if available
                if filename:
                    pattern_payload["filename"] = filename
                    logger.info(f"Adding filename to pattern recognition payload: {filename}")

                # Call LLM for pattern recognition
                try:
                    pattern_response = await self.llm_service.analyze(pattern_payload)

                    # Check if we got a valid response with patterns
                    if isinstance(pattern_response, dict) and "patterns" in pattern_response:
                        patterns = pattern_response["patterns"]
                        if patterns and len(patterns) > 0:
                            logger.info(f"Successfully extracted {len(patterns)} patterns directly")
                            patterns_result["patterns"] = patterns
                            has_patterns = True
                        else:
                            logger.warning("No patterns found in LLM response")
                    else:
                        logger.warning(f"Invalid pattern response format: {type(pattern_response)}")
                except Exception as e:
                    logger.error(f"Error in pattern recognition: {str(e)}")

                # Generate fallback patterns if needed
                if not has_patterns:
                    logger.warning("No patterns found from LLM, attempting to generate fallback patterns from themes")

                    # Generate fallback patterns from themes
                    fallback_patterns = await self._generate_fallback_patterns(
                        combined_text,
                        themes,
                        self.llm_service
                    )

                    if fallback_patterns and len(fallback_patterns) > 0:
                        logger.info(f"Successfully generated {len(fallback_patterns)} fallback patterns from themes")
                        patterns_result["patterns"] = fallback_patterns
                    else:
                        logger.warning("Failed to generate fallback patterns, returning empty patterns array")
                        patterns_result["patterns"] = []

            return patterns_result
            
    except Exception as e:
        logger.error(f"Error extracting patterns: {str(e)}")
        return {"patterns": []}
