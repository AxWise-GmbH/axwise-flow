"""
Adaptive Tool Recognition Service for persona formation.

This module provides functionality for:
1. Identifying industry context from transcripts
2. Recognizing tools mentioned in text with industry awareness
3. Handling transcription errors and misspellings
4. Learning from corrections over time
"""

from typing import Dict, Any, List, Optional, Tuple
import logging
import re
import json
from difflib import SequenceMatcher

# Configure logging
logger = logging.getLogger(__name__)

# Try to import rapidfuzz for better performance
try:
    from rapidfuzz import fuzz, process
    USE_RAPIDFUZZ = True
    logger.info("Using rapidfuzz for string matching")
except ImportError:
    USE_RAPIDFUZZ = False
    logger.info("rapidfuzz not available, using difflib for string matching")


class AdaptiveToolRecognitionService:
    """
    Industry-aware tool recognition service that combines LLM knowledge with
    robust error correction to identify tools across diverse domains.
    """

    def __init__(self, llm_service, similarity_threshold=0.75, learning_enabled=True):
        """
        Initialize the adaptive tool recognition service.

        Args:
            llm_service: LLM service for industry detection and tool identification
            similarity_threshold: Threshold for fuzzy matching (0.0-1.0)
            learning_enabled: Whether to enable learning from corrections
        """
        self.llm_service = llm_service
        self.similarity_threshold = similarity_threshold
        self.learning_enabled = learning_enabled

        # Initialize learning database for corrections
        self.learned_corrections = self._load_learned_corrections()

        # Cache for industry detection
        self.industry_cache = {}

        # Cache for industry-specific tools
        self.industry_tools_cache = {}

        # Store rapidfuzz availability
        self.use_rapidfuzz = USE_RAPIDFUZZ

        logger.info(f"Initialized AdaptiveToolRecognitionService (similarity_threshold={similarity_threshold}, learning_enabled={learning_enabled})")

    def _load_learned_corrections(self):
        """Load learned corrections from previous sessions."""
        # SOLUTION 2: Initialize with predefined corrections for common tool name variations and misspellings

        # Start with common corrections that should always be applied
        predefined_corrections = {
            # Miro variations and misspellings
            "mirrorboards": {"tool_name": "Miro", "confidence": 0.95},
            "mirrorboard": {"tool_name": "Miro", "confidence": 0.95},
            "mirror board": {"tool_name": "Miro", "confidence": 0.95},
            "mirror boards": {"tool_name": "Miro", "confidence": 0.95},
            "miro board": {"tool_name": "Miro", "confidence": 0.98},
            "miro boards": {"tool_name": "Miro", "confidence": 0.98},

            # Figma variations
            "figma design": {"tool_name": "Figma", "confidence": 0.98},
            "figma designs": {"tool_name": "Figma", "confidence": 0.98},
            "figma file": {"tool_name": "Figma", "confidence": 0.98},
            "figma files": {"tool_name": "Figma", "confidence": 0.98},

            # Sketch variations
            "sketch app": {"tool_name": "Sketch", "confidence": 0.98},
            "sketch file": {"tool_name": "Sketch", "confidence": 0.98},
            "sketch files": {"tool_name": "Sketch", "confidence": 0.98},

            # Adobe XD variations
            "xd": {"tool_name": "Adobe XD", "confidence": 0.95},
            "adobe experience design": {"tool_name": "Adobe XD", "confidence": 0.98},

            # Jira variations
            "jira tickets": {"tool_name": "Jira", "confidence": 0.98},
            "jira board": {"tool_name": "Jira", "confidence": 0.98},
            "jira boards": {"tool_name": "Jira", "confidence": 0.98},

            # Confluence variations
            "confluence page": {"tool_name": "Confluence", "confidence": 0.98},
            "confluence pages": {"tool_name": "Confluence", "confidence": 0.98},
            "confluence wiki": {"tool_name": "Confluence", "confidence": 0.98},

            # Slack variations
            "slack channel": {"tool_name": "Slack", "confidence": 0.98},
            "slack channels": {"tool_name": "Slack", "confidence": 0.98},
            "slack message": {"tool_name": "Slack", "confidence": 0.98},
            "slack messages": {"tool_name": "Slack", "confidence": 0.98},

            # Microsoft Teams variations
            "ms teams": {"tool_name": "Microsoft Teams", "confidence": 0.98},
            "teams": {"tool_name": "Microsoft Teams", "confidence": 0.90},
            "teams call": {"tool_name": "Microsoft Teams", "confidence": 0.95},
            "teams meeting": {"tool_name": "Microsoft Teams", "confidence": 0.95},

            # Google variations
            "google docs": {"tool_name": "Google Docs", "confidence": 0.98},
            "google sheets": {"tool_name": "Google Sheets", "confidence": 0.98},
            "google slides": {"tool_name": "Google Slides", "confidence": 0.98},
            "gdocs": {"tool_name": "Google Docs", "confidence": 0.95},
            "gsheets": {"tool_name": "Google Sheets", "confidence": 0.95},
            "gslides": {"tool_name": "Google Slides", "confidence": 0.95}
        }

        # In production, this would load from a database and merge with predefined corrections
        logger.info(f"Loaded {len(predefined_corrections)} predefined tool name corrections")
        return predefined_corrections

    async def identify_industry(self, text):
        """
        Identify the industry context from text.

        Args:
            text: Text to analyze

        Returns:
            Identified industry and confidence score
        """
        # Check cache first
        cache_key = hash(text[:1000])  # Use first 1000 chars as cache key
        if cache_key in self.industry_cache:
            return self.industry_cache[cache_key]

        try:
            # Create prompt for industry detection
            prompt = """
You are an expert in identifying industry contexts from text. Your task is to determine the primary industry or domain being discussed in the provided text.

INSTRUCTIONS:
1. Read the text carefully.
2. Identify the primary industry or domain being discussed.
3. Select the most specific applicable industry from this list:
   - Healthcare
   - Finance
   - Education
   - Technology
   - Manufacturing
   - Retail
   - Hospitality
   - Government
   - Legal
   - Media & Entertainment
   - Transportation
   - Energy
   - Agriculture
   - Construction
   - Telecommunications
   - Pharmaceuticals
   - Aerospace
   - Automotive
   - Insurance
   - Real Estate
   - Non-profit
   - Other (specify)

4. Provide a confidence score (0.0-1.0) based on how clearly the industry is indicated.
5. Include brief reasoning for your selection.

FORMAT YOUR RESPONSE AS JSON:
{
  "industry": "Technology",
  "confidence": 0.85,
  "reasoning": "The text discusses software development, user interfaces, and digital product design, clearly indicating the technology industry."
}
"""

            # Call LLM to identify industry
            llm_response = await self.llm_service.analyze({
                "task": "industry_detection",
                "text": text[:5000],  # Use first 5000 chars for efficiency
                "prompt": prompt,
                "enforce_json": True,
                "temperature": 0.0  # Use deterministic output
            })

            # Parse the response
            if isinstance(llm_response, dict):
                industry_data = llm_response
            else:
                # Parse JSON response
                try:
                    industry_data = json.loads(llm_response)
                except (json.JSONDecodeError, TypeError, ValueError):
                    # Fallback to default
                    industry_data = {"industry": "Technology", "confidence": 0.5}

            # Cache the result
            self.industry_cache[cache_key] = industry_data

            logger.info(f"Identified industry: {industry_data.get('industry')} with confidence {industry_data.get('confidence')}")
            return industry_data

        except Exception as e:
            logger.error(f"Error identifying industry: {str(e)}", exc_info=True)
            # Return default
            return {"industry": "Technology", "confidence": 0.5}

    async def get_industry_tools(self, industry):
        """
        Get common tools for a specific industry using LLM.

        Args:
            industry: Industry name

        Returns:
            Dictionary of tools with variations and functions
        """
        # Check cache first
        if industry in self.industry_tools_cache:
            return self.industry_tools_cache[industry]

        try:
            # Create prompt for industry-specific tools
            prompt = f"""
You are an expert in {industry} tools, software, and platforms. Your task is to identify common tools used in this industry.

INSTRUCTIONS:
1. List 15-25 of the most common tools, software, platforms, or systems used in the {industry} industry.
2. For each tool, provide:
   - Common variations of the name (including misspellings and abbreviations)
   - Primary functions or use cases
   - Any industry-specific terminology related to the tool

FORMAT YOUR RESPONSE AS JSON:
{{
  "tools": [
    {{
      "name": "Epic",
      "variations": ["Epic Systems", "Epic EHR", "Epic EMR", "Epik", "Epicare"],
      "functions": ["electronic health records", "patient management", "clinical documentation"],
      "industry_terms": ["chart", "flowsheet", "MyChart"]
    }},
    // More tools...
  ]
}}
"""

            # Call LLM to get industry tools
            llm_response = await self.llm_service.analyze({
                "task": "industry_tools",
                "text": "",  # No text needed for this task
                "prompt": prompt,
                "enforce_json": True,
                "temperature": 0.1  # Slight variation for creativity
            })

            # Parse the response
            if isinstance(llm_response, dict) and "tools" in llm_response:
                tools_data = llm_response["tools"]
            else:
                # Parse JSON response
                try:
                    parsed_data = json.loads(llm_response)
                    tools_data = parsed_data.get("tools", [])
                except (json.JSONDecodeError, TypeError, ValueError):
                    # Fallback to empty list
                    tools_data = []

            # Convert to our internal format
            tools_dict = {}
            for tool in tools_data:
                name = tool.get("name", "").lower()
                if name:
                    tools_dict[name] = {
                        "variations": [v.lower() for v in tool.get("variations", [])],
                        "functions": tool.get("functions", []),
                        "industry_terms": tool.get("industry_terms", [])
                    }
                    # Add the name itself as a variation
                    if name not in tools_dict[name]["variations"]:
                        tools_dict[name]["variations"].append(name)

            # Cache the result
            self.industry_tools_cache[industry] = tools_dict

            logger.info(f"Retrieved {len(tools_dict)} tools for industry: {industry}")
            return tools_dict

        except Exception as e:
            logger.error(f"Error getting industry tools: {str(e)}", exc_info=True)
            # Return empty dict
            return {}

    async def identify_tools_in_text(self, text, surrounding_context=""):
        """
        Identify tools mentioned in text using industry context and LLM.

        Args:
            text: Text containing potential tool mentions
            surrounding_context: Optional surrounding text for context

        Returns:
            List of identified tools with confidence scores
        """
        if not text:
            return []

        try:
            # First, identify the industry context
            industry_data = await self.identify_industry(surrounding_context or text)
            industry = industry_data.get("industry", "Technology")

            # Get industry-specific tools
            industry_tools = await self.get_industry_tools(industry)

            # Create prompt for tool identification
            prompt = f"""
You are an expert in identifying tools, software, and platforms mentioned in text, especially in the {industry} industry.

INSTRUCTIONS:
1. Carefully read the provided text.
2. Identify all tools, software, platforms, or systems mentioned.
3. For each identified tool:
   - Provide the standard/correct name of the tool
   - Note the exact text mention from the original text
   - Provide a confidence score (0.0-1.0)
   - Indicate if this appears to be a misspelling or transcription error

4. Pay special attention to industry-specific tools that might be misspelled or transcribed incorrectly.
5. If you're unsure about a potential tool mention, include it with a lower confidence score.

FORMAT YOUR RESPONSE AS JSON:
{{
  "identified_tools": [
    {{
      "tool_name": "Miro",
      "original_mention": "mirror board",
      "confidence": 0.85,
      "is_misspelling": true,
      "correction_note": "Common transcription error for 'Miro board'"
    }},
    // More tools...
  ]
}}
"""

            # Call LLM to identify tools
            llm_response = await self.llm_service.analyze({
                "task": "tool_identification",
                "text": text,
                "prompt": prompt,
                "enforce_json": True,
                "temperature": 0.0  # Use deterministic output
            })

            # Parse the response
            identified_tools = []

            if isinstance(llm_response, dict) and "identified_tools" in llm_response:
                identified_tools = llm_response["identified_tools"]
            else:
                # Parse JSON response
                try:
                    parsed_data = json.loads(llm_response)
                    identified_tools = parsed_data.get("identified_tools", [])
                except (json.JSONDecodeError, TypeError, ValueError):
                    # Fallback to empty list
                    identified_tools = []

            # Apply learned corrections
            enhanced_tools = self._apply_learned_corrections(identified_tools, industry)

            # Apply fuzzy matching for low-confidence tools
            final_tools = self._enhance_with_fuzzy_matching(enhanced_tools, industry_tools)

            logger.info(f"Identified {len(final_tools)} tools in text")
            return final_tools

        except Exception as e:
            logger.error(f"Error identifying tools: {str(e)}", exc_info=True)
            # Return empty list
            return []

    def _apply_learned_corrections(self, identified_tools, industry):
        """
        Apply learned corrections to identified tools.

        Args:
            identified_tools: List of tools identified by LLM
            industry: Current industry context

        Returns:
            Enhanced list of tools with corrections applied
        """
        if not self.learning_enabled:
            return identified_tools

        enhanced_tools = []

        for tool in identified_tools:
            original_mention = tool.get("original_mention", "").lower()
            tool_name = tool.get("tool_name", "").lower()

            # Check if we have a learned correction for this mention
            if original_mention in self.learned_corrections:
                correction = self.learned_corrections[original_mention]

                # Apply the correction
                tool["tool_name"] = correction["tool_name"]
                tool["confidence"] = max(tool.get("confidence", 0.5), correction["confidence"])
                tool["is_misspelling"] = True
                tool["correction_note"] = f"Applied learned correction: '{original_mention}' → '{correction['tool_name']}'"

                enhanced_tools.append(tool)
            # Also check if the tool_name itself has a correction (for cases where the LLM already tried to correct)
            elif tool_name in self.learned_corrections:
                correction = self.learned_corrections[tool_name]

                # Apply the correction
                tool["tool_name"] = correction["tool_name"]
                tool["confidence"] = max(tool.get("confidence", 0.5), correction["confidence"])
                tool["is_misspelling"] = True
                tool["correction_note"] = f"Applied learned correction to tool name: '{tool_name}' → '{correction['tool_name']}'"

                enhanced_tools.append(tool)
            else:
                # Try to find a partial match in the learned corrections
                best_match = None
                best_score = 0.7  # Minimum threshold for partial matching

                for known_mention, correction in self.learned_corrections.items():
                    # Check if the original mention contains the known mention
                    if known_mention in original_mention:
                        score = len(known_mention) / len(original_mention)
                        if score > best_score:
                            best_score = score
                            best_match = correction
                    # Also check if the known mention contains the original mention
                    elif original_mention in known_mention:
                        score = len(original_mention) / len(known_mention)
                        if score > best_score:
                            best_score = score
                            best_match = correction

                if best_match:
                    # Apply the best matching correction
                    tool["tool_name"] = best_match["tool_name"]
                    tool["confidence"] = max(tool.get("confidence", 0.5), best_match["confidence"] * best_score)
                    tool["is_misspelling"] = True
                    tool["correction_note"] = f"Applied partial match correction: '{original_mention}' → '{best_match['tool_name']}' (score: {best_score:.2f})"

                    enhanced_tools.append(tool)
                else:
                    # No correction needed
                    enhanced_tools.append(tool)

        return enhanced_tools

    def _enhance_with_fuzzy_matching(self, identified_tools, industry_tools):
        """
        Enhance low-confidence tools with fuzzy matching against industry tools.

        Args:
            identified_tools: List of tools identified by LLM
            industry_tools: Dictionary of industry-specific tools

        Returns:
            Enhanced list of tools with improved confidence scores
        """
        enhanced_tools = []

        for tool in identified_tools:
            # Only apply fuzzy matching to low-confidence tools
            if tool.get("confidence", 1.0) < 0.7:
                original_mention = tool.get("original_mention", "").lower()
                tool_name = tool.get("tool_name", "").lower()

                # Try to find a better match in industry tools
                best_match = None
                best_score = 0.0

                for canonical, info in industry_tools.items():
                    # Check against canonical name
                    score = self._calculate_similarity(original_mention, canonical)
                    if score > best_score:
                        best_score = score
                        best_match = canonical

                    # Check against variations
                    for variation in info["variations"]:
                        score = self._calculate_similarity(original_mention, variation)
                        if score > best_score:
                            best_score = score
                            best_match = canonical

                # If we found a better match with sufficient confidence
                if best_match and best_score >= self.similarity_threshold:
                    # Update the tool
                    tool["tool_name"] = best_match
                    tool["confidence"] = best_score
                    tool["is_misspelling"] = True
                    tool["correction_note"] = f"Enhanced via fuzzy matching: '{original_mention}' → '{best_match}' (score: {best_score:.2f})"

            enhanced_tools.append(tool)

        return enhanced_tools

    def _calculate_similarity(self, s1, s2):
        """Calculate string similarity using the best available method."""
        if not s1 or not s2:
            return 0.0

        s1, s2 = s1.lower(), s2.lower()

        if self.use_rapidfuzz:
            # RapidFuzz is much faster and more accurate for this use case
            return fuzz.ratio(s1, s2) / 100.0
        else:
            # Fallback to SequenceMatcher
            return SequenceMatcher(None, s1, s2).ratio()

    def learn_from_correction(self, original_mention, correct_tool, confidence=0.9):
        """
        Learn from a correction to improve future recognition.

        Args:
            original_mention: The original text that was misidentified
            correct_tool: The correct tool name
            confidence: Confidence score for this correction
        """
        if not self.learning_enabled:
            return

        # Add to learned corrections
        self.learned_corrections[original_mention.lower()] = {
            "tool_name": correct_tool,
            "confidence": confidence
        }

        logger.info(f"Learned correction: '{original_mention}' → '{correct_tool}'")

        # In production, this would save to a database
        self._save_learned_corrections()

    def _save_learned_corrections(self):
        """Save learned corrections to persistent storage."""
        # In production, this would save to a database
        pass

    def format_tools_for_persona(self, identified_tools, format_type="bullet"):
        """
        Format identified tools for inclusion in a persona.

        Args:
            identified_tools: List of identified tools
            format_type: Format type ("bullet", "comma", "json")

        Returns:
            Formatted string or object representing the tools
        """
        if not identified_tools:
            return ""

        # Extract tool names, keeping only those with sufficient confidence
        tool_names = [t["tool_name"].title() for t in identified_tools
                     if t.get("confidence", 0) >= self.similarity_threshold]

        # Remove duplicates while preserving order
        unique_tools = []
        for tool in tool_names:
            if tool not in unique_tools:
                unique_tools.append(tool)

        if not unique_tools:
            return ""

        if format_type == "bullet":
            return "\n".join([f"• {name}" for name in unique_tools])
        elif format_type == "comma":
            return ", ".join(unique_tools)
        elif format_type == "json":
            return {"tools": unique_tools}
        else:
            return "\n".join([f"• {name}" for name in unique_tools])
