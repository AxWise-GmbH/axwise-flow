"""
Industry detection utilities.

This module provides utilities for detecting industry context
from interview content using LLM analysis.
"""

import json
import logging
from typing import Any, List, Optional

logger = logging.getLogger(__name__)


# Valid industries for classification
VALID_INDUSTRIES: List[str] = [
    "healthcare",
    "tech",
    "finance",
    "military",
    "education",
    "hospitality",
    "retail",
    "manufacturing",
    "legal",
    "insurance",
    "agriculture",
    "non_profit",
]


class IndustryDetector:
    """Detector for industry context from interview content."""

    def __init__(self, valid_industries: Optional[List[str]] = None):
        """
        Initialize the industry detector.

        Args:
            valid_industries: List of valid industry names. Defaults to VALID_INDUSTRIES.
        """
        self.valid_industries = valid_industries or VALID_INDUSTRIES

    async def detect(self, text: str, llm_service: Any) -> str:
        """
        Detect industry from interview content.

        Args:
            text: The interview text
            llm_service: LLM service to use for detection

        Returns:
            Detected industry name
        """
        if not text or not text.strip():
            return "general"

        try:
            prompt = self._build_prompt(text)
            response = await llm_service.analyze({
                "task": "text_generation",
                "text": prompt,
                "enforce_json": True,
                "temperature": 0.0,
                "response_mime_type": "application/json",
            })

            industry = self._parse_response(response)
            return industry

        except Exception as e:
            logger.error(f"Error detecting industry: {str(e)}")
            return "general"

    def _build_prompt(self, text: str) -> str:
        """Build the industry detection prompt."""
        industries_list = ", ".join(self.valid_industries)
        return f"""
You are an expert industry analyst. Analyze the following interview transcript and determine the most likely industry context.

INTERVIEW SAMPLE:
{text[:5000]}...

TASK:
1. Identify the primary industry that best matches the context of this interview.
2. Choose from these specific industries: {industries_list}.
3. Provide a brief explanation of why you selected this industry (2-3 sentences).
4. List 3-5 key terms or phrases from the text that indicate this industry.

FORMAT YOUR RESPONSE AS JSON with the following structure:
{{
  "industry": "selected_industry_name",
  "explanation": "Brief explanation of why this industry was selected",
  "key_indicators": ["term1", "term2", "term3"],
  "confidence": 0.8
}}
"""

    def _parse_response(self, response: Any) -> str:
        """Parse the LLM response to extract industry."""
        if isinstance(response, dict):
            if "industry" in response:
                return self._validate_industry(response["industry"])
            elif "text" in response:
                return self._parse_text_response(response["text"])
        elif isinstance(response, str):
            return self._parse_text_response(response)

        return "general"

    def _parse_text_response(self, text: str) -> str:
        """Parse a text response to extract industry."""
        text = text.strip()
        if text.startswith("{") and text.endswith("}"):
            try:
                data = json.loads(text)
                if "industry" in data:
                    return self._validate_industry(data["industry"])
            except json.JSONDecodeError:
                pass

        # Look for industry names in text
        text_lower = text.lower()
        for industry in self.valid_industries:
            if industry in text_lower:
                return industry

        return "general"

    def _validate_industry(self, industry: str) -> str:
        """Validate and normalize industry name."""
        industry = industry.strip().lower()
        if industry in self.valid_industries:
            return industry

        # Try partial matching
        for valid in self.valid_industries:
            if valid in industry:
                return valid

        return "general"


# Module-level function for convenience
async def detect_industry(text: str, llm_service: Any) -> str:
    """Detect industry from interview content."""
    detector = IndustryDetector()
    return await detector.detect(text, llm_service)

