"""
Demographic Intelligence Module

Extracts demographic information using contextual understanding rather than rigid patterns,
solving the age extraction and demographic data failures.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import logging
import re
from .speaker_intelligence import SpeakerProfile

logger = logging.getLogger(__name__)


class DemographicData(BaseModel):
    """Comprehensive demographic information with evidence"""

    # Core demographics
    age: Optional[int] = Field(default=None, description="Exact age if mentioned")
    age_range: Optional[str] = Field(
        default=None, description="Age range or generation"
    )
    gender: Optional[str] = Field(default=None)
    location: Optional[str] = Field(default=None, description="City, state, or country")

    # Professional information
    profession: Optional[str] = Field(default=None)
    industry: Optional[str] = Field(default=None)
    experience_years: Optional[int] = Field(default=None)
    company: Optional[str] = Field(default=None)
    job_title: Optional[str] = Field(default=None)

    # Education
    education_level: Optional[str] = Field(default=None)
    degrees: List[str] = Field(default_factory=list)
    institutions: List[str] = Field(default_factory=list)

    # Personal context
    family_status: Optional[str] = Field(default=None)
    marital_status: Optional[str] = Field(default=None)
    children_count: Optional[int] = Field(default=None)
    income_bracket: Optional[str] = Field(default=None)
    cultural_background: Optional[str] = Field(default=None)

    # Evidence and confidence
    evidence: Dict[str, List[str]] = Field(
        default_factory=dict, description="Supporting quotes per field"
    )
    confidence_scores: Dict[str, float] = Field(
        default_factory=dict, description="Confidence per field"
    )
    overall_confidence: float = Field(default=0.7, ge=0.0, le=1.0)

    # Source tracking
    speaker_id: str = Field(default="", description="Associated speaker ID")
    extracted_from_header: bool = Field(
        default=False, description="Whether extracted from header/intro"
    )


class DemographicIntelligence:
    """
    Extracts demographic information using LLM's natural language understanding
    to handle various formats and implicit mentions, replacing rigid regex patterns.
    """

    def __init__(self, llm_service):
        self.llm_service = llm_service

        self.extraction_prompt = """
        Extract ALL demographic information for {speaker_id} from this text.

        COMPREHENSIVE EXTRACTION INSTRUCTIONS:

        AGE EXTRACTION (CRITICAL - look for ALL formats):
        - Explicit: "32 years old", "age 32", "I'm 32", "32 yo", "aged 32"
        - Header formats: "Interviewee 1 (Age: 32)", "Participant, 28 years old"
        - Contextual: "in my thirties", "millennial", "gen X", "boomer"
        - Implicit: "graduated 10 years ago" (estimate ~32), "retired last year" (estimate ~65)
        - Family context: "my teenage kids" (estimate 40-55), "grandchildren" (estimate 55+)

        LOCATION EXTRACTION:
        - Explicit: "I live in Seattle", "from New York"
        - Contextual: "here in California", "our Berlin office"
        - Cultural: "as an Indian", "being European"

        PROFESSION/CAREER:
        - Job titles: "product manager", "software engineer"
        - Industry: "work in tech", "healthcare sector"
        - Experience: "10 years in the field", "just started", "senior position"
        - Company: "at Google", "work for a startup"

        FAMILY STATUS:
        - Marital: "married", "single", "divorced", "my husband/wife"
        - Children: "my kids", "two daughters", "no children"
        - Family size: "family of four"

        EDUCATION:
        - Degrees: "MBA", "bachelor's", "PhD"
        - Institutions: "Stanford graduate", "went to MIT"
        - Level: "high school", "college educated"

        IMPORTANT:
        - Extract EXACT ages from headers like "Age: 32" or "(32 years old)"
        - If multiple age indicators exist, prefer explicit numbers
        - Include confidence scores for each extracted field
        - Provide evidence quotes for every extraction

        Text to analyze:
        {text}

        Additional context about speaker:
        {speaker_context}

        Return comprehensive DemographicData with all found information and evidence.
        """

        # Comprehensive regex patterns as fallback
        self.age_patterns = [
            # Header/intro patterns (high priority)
            r"(?i)(?:age|aged)\s*[:\-=]?\s*(\d{1,2})",
            r"(?i)\((?:age|aged)\s*[:\-]?\s*(\d{1,2})\)",
            r"(?i)interviewee\s+\d+\s*\([^)]*?(\d{2})[^)]*?\)",
            r"(?i)participant[^,]*?,\s*(\d{2})\s*(?:years?\s*old|yo|y/?o)",
            # Direct age statements
            r"(?i)\b(\d{1,2})\s*(?:years?\s*old|yrs?\s*old|y/?o)\b",
            r"(?i)\b(?:i\'?m|i\s+am)\s+(\d{1,2})\b",
            r"(?i)\bage[ds]?\s+(\d{1,2})\b",
            # Bracketed age
            r"\[(\d{2})\]",
            r"\((\d{2})\)",
            # Hyphenated forms
            r"(?i)(\d{1,2})-?years?-?old",
        ]

    async def extract_demographics(
        self, text: str, speaker: SpeakerProfile, include_header_search: bool = True
    ) -> DemographicData:
        """
        Extract demographics using NLU with pattern fallback.

        Args:
            text: Text containing potential demographic information
            speaker: Speaker profile for context
            include_header_search: Whether to search document headers

        Returns:
            Comprehensive demographic data with evidence
        """
        try:
            # Try LLM extraction first
            demographics = await self._llm_extract(text, speaker)

            # Validate and enhance with patterns
            demographics = self._validate_and_enhance(demographics, text)

            # Normalize age data
            demographics = self._normalize_age_data(demographics)

            # Set speaker association
            demographics.speaker_id = speaker.unique_identifier

            logger.info(
                f"Extracted demographics for {speaker.speaker_id}: "
                f"age={demographics.age}, location={demographics.location}, "
                f"profession={demographics.profession}"
            )

            return demographics

        except Exception as e:
            logger.error(f"Error extracting demographics: {e}")
            return self._fallback_extraction(text, speaker)

    async def _llm_extract(self, text: str, speaker: SpeakerProfile) -> DemographicData:
        """Perform LLM-based demographic extraction"""

        # Build speaker context
        speaker_context = {
            "role": speaker.role.value,
            "session": speaker.interview_session,
            "characteristics": speaker.characteristics,
            "demographic_hints": speaker.demographic_hints,
        }

        # Create extraction prompt
        prompt = self.extraction_prompt.format(
            speaker_id=speaker.speaker_id,
            text=text[:8000],  # Limit for context
            speaker_context=speaker_context,
        )

        try:
            # Call LLM for extraction
            response = await self.llm_service.analyze(
                {
                    "task": "demographic_extraction",
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.1,
                    "response_mime_type": "application/json",
                }
            )

            if isinstance(response, dict):
                return self._parse_llm_demographics(response)
            else:
                logger.warning("LLM response was not a dictionary")
                return self._fallback_extraction(text, speaker)

        except Exception as e:
            logger.error(f"LLM extraction failed: {e}")
            return self._fallback_extraction(text, speaker)

    def _parse_llm_demographics(self, response: Dict) -> DemographicData:
        """Parse LLM response into DemographicData"""

        demographics = DemographicData()

        # Extract core demographics
        demographics.age = response.get("age")
        demographics.age_range = response.get("age_range")
        demographics.gender = response.get("gender")
        demographics.location = response.get("location")

        # Professional info
        demographics.profession = response.get("profession")
        demographics.industry = response.get("industry")
        demographics.experience_years = response.get("experience_years")
        demographics.company = response.get("company")
        demographics.job_title = response.get("job_title")

        # Education
        demographics.education_level = response.get("education_level")
        demographics.degrees = response.get("degrees", [])
        demographics.institutions = response.get("institutions", [])

        # Personal context
        demographics.family_status = response.get("family_status")
        demographics.marital_status = response.get("marital_status")
        demographics.children_count = response.get("children_count")
        demographics.income_bracket = response.get("income_bracket")
        demographics.cultural_background = response.get("cultural_background")

        # Evidence and confidence
        demographics.evidence = response.get("evidence", {})
        demographics.confidence_scores = response.get("confidence_scores", {})
        demographics.overall_confidence = response.get("overall_confidence", 0.7)

        return demographics

    def _validate_and_enhance(
        self, demographics: DemographicData, text: str
    ) -> DemographicData:
        """Validate LLM extraction and enhance with pattern matching"""

        # If no age found by LLM, try comprehensive patterns
        if not demographics.age:
            age = self._extract_age_with_patterns(text)
            if age:
                demographics.age = age
                demographics.confidence_scores["age"] = (
                    0.9  # High confidence for exact match
                )

                # Add evidence
                if "age" not in demographics.evidence:
                    demographics.evidence["age"] = []

                # Find the context around the age mention
                for pattern in self.age_patterns:
                    match = re.search(pattern, text)
                    if match:
                        start = max(0, match.start() - 50)
                        end = min(len(text), match.end() + 50)
                        context = text[start:end].strip()
                        demographics.evidence["age"].append(f"...{context}...")
                        demographics.extracted_from_header = (
                            start < 200
                        )  # Likely from header
                        break

        # Validate age is reasonable
        if demographics.age:
            if demographics.age < 14 or demographics.age > 100:
                logger.warning(f"Unusual age extracted: {demographics.age}")
                demographics.confidence_scores["age"] = 0.5

        # Extract location from common patterns if not found
        if not demographics.location:
            location_patterns = [
                r"(?i)(?:from|in|at|based in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
                r"(?i)(?:live|living|located)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
            ]
            for pattern in location_patterns:
                match = re.search(pattern, text)
                if match:
                    demographics.location = match.group(1)
                    demographics.confidence_scores["location"] = 0.7
                    break

        return demographics

    def _extract_age_with_patterns(self, text: str) -> Optional[int]:
        """Extract age using comprehensive regex patterns"""

        # Try each pattern
        for pattern in self.age_patterns:
            matches = re.findall(pattern, text)
            if matches:
                for match in matches:
                    try:
                        age = int(match)
                        if 14 <= age <= 100:  # Reasonable age range
                            logger.info(f"Extracted age {age} using pattern: {pattern}")
                            return age
                    except (ValueError, TypeError):
                        continue

        return None

    def _normalize_age_data(self, demographics: DemographicData) -> DemographicData:
        """Normalize age into standard ranges"""

        if demographics.age and not demographics.age_range:
            age = demographics.age

            # Standard age ranges
            if 18 <= age < 25:
                demographics.age_range = "18-24"
            elif 25 <= age < 30:
                demographics.age_range = "25-29"
            elif 30 <= age < 35:
                demographics.age_range = "30-34"
            elif 35 <= age < 40:
                demographics.age_range = "35-39"
            elif 40 <= age < 45:
                demographics.age_range = "40-44"
            elif 45 <= age < 50:
                demographics.age_range = "45-49"
            elif 50 <= age < 55:
                demographics.age_range = "50-54"
            elif 55 <= age < 60:
                demographics.age_range = "55-59"
            elif 60 <= age < 65:
                demographics.age_range = "60-64"
            elif age >= 65:
                demographics.age_range = "65+"
            else:
                demographics.age_range = f"Under 18"

        # Handle generation labels
        elif demographics.age_range and not demographics.age:
            range_lower = demographics.age_range.lower()
            if "millennial" in range_lower:
                demographics.age_range = "28-43"  # As of 2025
            elif "gen z" in range_lower:
                demographics.age_range = "13-27"
            elif "gen x" in range_lower:
                demographics.age_range = "44-59"
            elif "boomer" in range_lower:
                demographics.age_range = "60-78"

        return demographics

    def _fallback_extraction(
        self, text: str, speaker: SpeakerProfile
    ) -> DemographicData:
        """Fallback pattern-based extraction"""
        logger.info("Using fallback pattern-based demographic extraction")

        demographics = DemographicData(
            speaker_id=speaker.unique_identifier, overall_confidence=0.5
        )

        # Try to extract age
        age = self._extract_age_with_patterns(text)
        if age:
            demographics.age = age
            demographics.confidence_scores["age"] = 0.8

        # Try to extract gender
        gender_patterns = {
            "male": r"\b(?:he|him|his|man|male|guy|gentleman)\b",
            "female": r"\b(?:she|her|hers|woman|female|lady|gal)\b",
        }

        for gender, pattern in gender_patterns.items():
            if re.search(pattern, text[:1000], re.IGNORECASE):
                demographics.gender = gender
                demographics.confidence_scores["gender"] = 0.6
                break

        # Try to extract profession
        profession_patterns = [
            r"(?i)(?:work as|i am|i\'m)\s+(?:a|an)\s+([a-z\s]+?)(?:\.|,|;|\s+at|\s+in)",
            r"(?i)(?:position|role|job)\s+(?:is|as)\s+([a-z\s]+?)(?:\.|,|;)",
        ]

        for pattern in profession_patterns:
            match = re.search(pattern, text)
            if match:
                demographics.profession = match.group(1).strip()
                demographics.confidence_scores["profession"] = 0.7
                break

        # Normalize age data
        demographics = self._normalize_age_data(demographics)

        return demographics

    async def extract_all_demographics(
        self, text: str, speakers: List[SpeakerProfile]
    ) -> Dict[str, DemographicData]:
        """
        Extract demographics for all speakers.

        Args:
            text: Full document text
            speakers: List of identified speakers

        Returns:
            Dictionary mapping speaker ID to demographic data
        """
        demographics_map = {}

        for speaker in speakers:
            # Skip researchers/interviewers
            if speaker.is_researcher:
                logger.debug(
                    f"Skipping demographic extraction for researcher: {speaker.speaker_id}"
                )
                continue

            # Extract demographics for this speaker
            demographics = await self.extract_demographics(text, speaker)
            demographics_map[speaker.unique_identifier] = demographics

            # Log extraction results
            if demographics.age:
                logger.info(
                    f"Successfully extracted age {demographics.age} for {speaker.speaker_id}"
                )
            else:
                logger.warning(f"No age found for {speaker.speaker_id}")

        return demographics_map
