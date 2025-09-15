"""
Evidence Attribution Module

Correctly attributes evidence to speakers with metadata preservation,
solving the researcher contamination and misattribution problems.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Set, Tuple
import logging
import re
from datetime import datetime
from enum import Enum

from .speaker_intelligence import SpeakerProfile, SpeakerRole
from .demographic_intelligence import DemographicData

logger = logging.getLogger(__name__)


class EvidenceType(Enum):
    """Types of evidence to categorize"""

    STATEMENT = "statement"  # Direct statements from interviewee
    OPINION = "opinion"  # Opinions/beliefs expressed
    EXPERIENCE = "experience"  # Personal experiences shared
    PAIN_POINT = "pain_point"  # Problems/frustrations mentioned
    NEED = "need"  # Expressed needs/wants
    BEHAVIOR = "behavior"  # Described behaviors/actions
    EMOTION = "emotion"  # Emotional responses
    PREFERENCE = "preference"  # Stated preferences
    QUESTION = "question"  # Questions asked (usually researcher)
    CONTEXT = "context"  # Background/contextual information
    DEMOGRAPHIC = "demographic"  # Demographic information


class AttributedEvidence(BaseModel):
    """Evidence with complete attribution metadata"""

    # Core evidence
    text: str = Field(description="The actual evidence text")
    normalized_text: str = Field(description="Normalized version for matching")

    # Attribution
    speaker_id: str = Field(description="Unique speaker identifier")
    speaker_role: SpeakerRole = Field(description="Role of the speaker")
    is_researcher_content: bool = Field(
        default=False, description="Whether this is researcher content"
    )

    # Classification
    evidence_type: EvidenceType = Field(description="Type of evidence")
    subtypes: List[str] = Field(
        default_factory=list, description="Additional classifications"
    )

    # Context
    timestamp: Optional[str] = Field(default=None, description="When said")
    interview_session: Optional[str] = Field(
        default=None, description="Which interview"
    )
    preceding_context: Optional[str] = Field(
        default=None, description="What came before"
    )
    following_context: Optional[str] = Field(
        default=None, description="What came after"
    )

    # Metadata
    line_number: Optional[int] = Field(
        default=None, description="Line in original transcript"
    )
    confidence_score: float = Field(default=0.8, ge=0.0, le=1.0)
    extraction_timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Validation
    validated: bool = Field(default=False, description="Whether validated")
    validation_method: Optional[str] = Field(default=None)
    validation_score: Optional[float] = Field(default=None)

    # Demographics link
    demographics: Optional[DemographicData] = Field(
        default=None, description="Associated demographics"
    )

    # Tags and themes
    tags: List[str] = Field(default_factory=list, description="Evidence tags")
    themes: List[str] = Field(default_factory=list, description="Identified themes")


class EvidenceAttribution:
    """
    Attributes evidence to correct speakers with metadata preservation,
    preventing researcher contamination and maintaining context.
    """

    def __init__(self, llm_service):
        self.llm_service = llm_service

        self.attribution_prompt = """
        Analyze this transcript segment and attribute evidence correctly.

        CRITICAL ATTRIBUTION RULES:

        1. RESEARCHER IDENTIFICATION (HIGHEST PRIORITY):
           - Questions are USUALLY from researchers/interviewers
           - Look for: "What do you...", "Can you tell me...", "How would you..."
           - Leading statements: "So you're saying...", "Let me understand..."
           - Clarifications: "Could you elaborate...", "What about..."

        2. INTERVIEWEE IDENTIFICATION:
           - Answers to questions
           - Personal statements: "I think...", "In my experience...", "We do..."
           - Stories and examples
           - Opinions and feelings

        3. EVIDENCE TYPES TO EXTRACT:
           - STATEMENT: Direct factual statements
           - OPINION: "I believe...", "I think..."
           - EXPERIENCE: "When I...", "We had..."
           - PAIN_POINT: "The problem is...", "It's frustrating when..."
           - NEED: "I need...", "We want..."
           - BEHAVIOR: "I usually...", "We always..."
           - EMOTION: "I feel...", "It makes me..."
           - PREFERENCE: "I prefer...", "I like..."

        4. DO NOT EXTRACT:
           - Researcher questions as interviewee evidence
           - Transitional phrases: "um", "uh", "you know"
           - Meta-commentary: "Let's move on to..."
           - Administrative: "Recording started", timestamps

        Transcript segment:
        {transcript_segment}

        Speaker information:
        {speaker_info}

        Previous context:
        {previous_context}

        For each piece of evidence, provide:
        - Exact text
        - Speaker attribution
        - Evidence type
        - Whether it's researcher content
        - Confidence score
        - Contextual notes
        """

        # Pattern library for researcher detection
        self.researcher_patterns = [
            # Questions
            r"^(?:What|How|Why|When|Where|Who|Which|Can you|Could you|Would you)",
            r"^(?:Tell me|Describe|Explain|Share)",
            r"\?$",  # Ends with question mark
            # Leading/probing
            r"^(?:So|And|But|Now|Then|Next)",
            r"^(?:Let me|Let\'s|I\'d like to)",
            # Clarification
            r"^(?:You mean|You\'re saying|In other words)",
            r"^(?:Could you elaborate|Can you give)",
            # Transitional
            r"^(?:Moving on|Let\'s talk about|Now about)",
            r"^(?:Thank you|Great|Interesting|I see)",
        ]

        # Pattern library for evidence extraction
        self.evidence_patterns = {
            EvidenceType.PAIN_POINT: [
                r"(?:problem|issue|challenge|frustrat|difficult|hard|annoying|pain)",
                r"(?:struggle|obstacle|barrier|block|prevent)",
                r"(?:can\'t|cannot|unable|impossible|never works)",
            ],
            EvidenceType.NEED: [
                r"(?:need|want|require|must have|looking for|wish)",
                r"(?:would like|hope|desire|dream)",
                r"(?:if only|should be|ought to)",
            ],
            EvidenceType.BEHAVIOR: [
                r"(?:always|usually|often|sometimes|never|rarely)",
                r"(?:every day|weekly|monthly|regularly)",
                r"(?:I do|we do|tend to|used to)",
            ],
            EvidenceType.EMOTION: [
                r"(?:feel|feeling|felt|emotion)",
                r"(?:happy|sad|angry|frustrated|excited|worried|anxious)",
                r"(?:love|hate|like|dislike|enjoy|afraid)",
            ],
        }

    async def attribute_evidence(
        self,
        transcript_segment: str,
        speakers: Dict[str, SpeakerProfile],
        demographics: Dict[str, DemographicData],
        previous_context: str = "",
    ) -> List[AttributedEvidence]:
        """
        Attribute evidence from transcript segment to speakers.

        Args:
            transcript_segment: Segment of transcript to analyze
            speakers: Dictionary of speaker profiles
            demographics: Dictionary of demographic data
            previous_context: Previous transcript context

        Returns:
            List of attributed evidence with metadata
        """
        try:
            # First pass: LLM attribution
            evidence_list = await self._llm_attribution(
                transcript_segment, speakers, previous_context
            )

            # Second pass: Researcher filtering
            evidence_list = self._filter_researcher_content(evidence_list)

            # Third pass: Evidence enhancement
            evidence_list = self._enhance_evidence(evidence_list, demographics)

            # Fourth pass: Theme extraction
            evidence_list = await self._extract_themes(evidence_list)

            logger.info(
                f"Attributed {len(evidence_list)} pieces of evidence, "
                f"{sum(1 for e in evidence_list if e.is_researcher_content)} from researchers"
            )

            return evidence_list

        except Exception as e:
            logger.error(f"Error attributing evidence: {e}")
            return self._fallback_attribution(transcript_segment, speakers)

    async def _llm_attribution(
        self,
        transcript_segment: str,
        speakers: Dict[str, SpeakerProfile],
        previous_context: str,
    ) -> List[AttributedEvidence]:
        """Perform LLM-based evidence attribution"""

        # Build speaker info
        speaker_info = {
            speaker_id: {
                "role": profile.role.value,
                "is_researcher": profile.is_researcher,
                "characteristics": profile.characteristics,
            }
            for speaker_id, profile in speakers.items()
        }

        # Create attribution prompt
        prompt = self.attribution_prompt.format(
            transcript_segment=transcript_segment[:6000],
            speaker_info=speaker_info,
            previous_context=previous_context[-1000:] if previous_context else "None",
        )

        try:
            # Call LLM for attribution
            response = await self.llm_service.analyze(
                {
                    "task": "evidence_attribution",
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.1,
                    "response_mime_type": "application/json",
                }
            )

            if isinstance(response, dict) and "evidence" in response:
                return self._parse_llm_evidence(response["evidence"], speakers)
            else:
                logger.warning("Invalid LLM response format")
                return []

        except Exception as e:
            logger.error(f"LLM attribution failed: {e}")
            return []

    def _parse_llm_evidence(
        self, evidence_list: List[Dict], speakers: Dict[str, SpeakerProfile]
    ) -> List[AttributedEvidence]:
        """Parse LLM response into AttributedEvidence objects"""

        attributed_evidence = []

        for item in evidence_list:
            try:
                # Get speaker profile
                speaker_id = item.get("speaker_id", "")
                speaker_profile = speakers.get(speaker_id)

                if not speaker_profile:
                    logger.warning(f"Unknown speaker: {speaker_id}")
                    continue

                # Create attributed evidence
                evidence = AttributedEvidence(
                    text=item.get("text", ""),
                    normalized_text=self._normalize_text(item.get("text", "")),
                    speaker_id=speaker_profile.unique_identifier,
                    speaker_role=speaker_profile.role,
                    is_researcher_content=speaker_profile.is_researcher
                    or item.get("is_researcher", False),
                    evidence_type=EvidenceType(item.get("type", "statement")),
                    subtypes=item.get("subtypes", []),
                    timestamp=item.get("timestamp"),
                    interview_session=speaker_profile.interview_session,
                    preceding_context=item.get("preceding_context"),
                    following_context=item.get("following_context"),
                    line_number=item.get("line_number"),
                    confidence_score=item.get("confidence", 0.8),
                    tags=item.get("tags", []),
                    themes=item.get("themes", []),
                )

                attributed_evidence.append(evidence)

            except Exception as e:
                logger.error(f"Error parsing evidence item: {e}")
                continue

        return attributed_evidence

    def _filter_researcher_content(
        self, evidence_list: List[AttributedEvidence]
    ) -> List[AttributedEvidence]:
        """
        Filter out researcher questions and content.
        This is the critical fix for researcher contamination.
        """
        filtered_evidence = []

        for evidence in evidence_list:
            # Skip if already marked as researcher content
            if evidence.is_researcher_content:
                logger.debug(f"Filtering researcher content: {evidence.text[:50]}...")
                continue

            # Check against researcher patterns
            is_researcher = False
            for pattern in self.researcher_patterns:
                if re.match(pattern, evidence.text.strip(), re.IGNORECASE):
                    is_researcher = True
                    logger.debug(
                        f"Detected researcher pattern in: {evidence.text[:50]}..."
                    )
                    break

            # Additional checks
            if not is_researcher:
                # Check for question marks at the end
                if evidence.text.strip().endswith("?"):
                    # But allow rhetorical questions from interviewees
                    if not any(
                        phrase in evidence.text.lower()
                        for phrase in ["i wonder", "why do i", "how can i", "what if i"]
                    ):
                        is_researcher = True
                        logger.debug(f"Detected question: {evidence.text[:50]}...")

            # Mark as researcher content if detected
            if is_researcher:
                evidence.is_researcher_content = True
                evidence.evidence_type = EvidenceType.QUESTION
            else:
                filtered_evidence.append(evidence)

        logger.info(
            f"Filtered {len(evidence_list) - len(filtered_evidence)} researcher items"
        )
        return filtered_evidence

    def _enhance_evidence(
        self,
        evidence_list: List[AttributedEvidence],
        demographics: Dict[str, DemographicData],
    ) -> List[AttributedEvidence]:
        """Enhance evidence with demographic data and additional classification"""

        for evidence in evidence_list:
            # Link demographics
            if evidence.speaker_id in demographics:
                evidence.demographics = demographics[evidence.speaker_id]

            # Enhance evidence type classification
            text_lower = evidence.text.lower()

            # Check for pain points
            for pattern in self.evidence_patterns[EvidenceType.PAIN_POINT]:
                if re.search(pattern, text_lower):
                    if evidence.evidence_type == EvidenceType.STATEMENT:
                        evidence.evidence_type = EvidenceType.PAIN_POINT
                    evidence.subtypes.append("pain_point")
                    break

            # Check for needs
            for pattern in self.evidence_patterns[EvidenceType.NEED]:
                if re.search(pattern, text_lower):
                    if evidence.evidence_type == EvidenceType.STATEMENT:
                        evidence.evidence_type = EvidenceType.NEED
                    evidence.subtypes.append("need")
                    break

            # Check for behaviors
            for pattern in self.evidence_patterns[EvidenceType.BEHAVIOR]:
                if re.search(pattern, text_lower):
                    evidence.subtypes.append("behavior")
                    break

            # Check for emotions
            for pattern in self.evidence_patterns[EvidenceType.EMOTION]:
                if re.search(pattern, text_lower):
                    evidence.subtypes.append("emotional")
                    break

        return evidence_list

    async def _extract_themes(
        self, evidence_list: List[AttributedEvidence]
    ) -> List[AttributedEvidence]:
        """Extract themes from evidence using LLM"""

        if not evidence_list:
            return evidence_list

        # Batch evidence for theme extraction
        evidence_texts = [e.text for e in evidence_list[:20]]  # Limit for context

        prompt = f"""
        Extract key themes from these evidence statements:

        {chr(10).join(f"- {text}" for text in evidence_texts)}

        Return themes as a list of keywords/phrases.
        Focus on: pain points, needs, behaviors, preferences, emotions.
        """

        try:
            response = await self.llm_service.analyze(
                {"task": "theme_extraction", "prompt": prompt, "temperature": 0.3}
            )

            if isinstance(response, dict) and "themes" in response:
                themes = response["themes"]
                # Distribute themes to relevant evidence
                for evidence in evidence_list:
                    for theme in themes:
                        if theme.lower() in evidence.text.lower():
                            evidence.themes.append(theme)

        except Exception as e:
            logger.error(f"Theme extraction failed: {e}")

        return evidence_list

    def _normalize_text(self, text: str) -> str:
        """Normalize text for matching"""
        # Remove extra whitespace
        text = " ".join(text.split())
        # Remove punctuation for matching
        text = re.sub(r"[^\w\s]", "", text)
        # Lowercase
        text = text.lower()
        return text

    def _fallback_attribution(
        self, transcript_segment: str, speakers: Dict[str, SpeakerProfile]
    ) -> List[AttributedEvidence]:
        """Fallback pattern-based attribution"""
        logger.info("Using fallback pattern-based attribution")

        evidence_list = []
        lines = transcript_segment.split("\n")

        current_speaker = None
        current_speaker_profile = None

        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue

            # Try to identify speaker from line format
            # Format: "Speaker: Text" or "[Speaker] Text"
            speaker_match = re.match(r"^(?:\[([^\]]+)\]|([^:]+):)\s*(.+)", line)

            if speaker_match:
                speaker_name = speaker_match.group(1) or speaker_match.group(2)
                text = speaker_match.group(3)

                # Find matching speaker profile
                for sid, profile in speakers.items():
                    if profile.speaker_id.lower() in speaker_name.lower():
                        current_speaker = sid
                        current_speaker_profile = profile
                        break
            else:
                text = line

            if current_speaker_profile and text:
                # Check if it's a question (likely researcher)
                is_researcher = (
                    current_speaker_profile.is_researcher
                    or text.strip().endswith("?")
                    or any(
                        text.strip().startswith(word)
                        for word in [
                            "What",
                            "How",
                            "Why",
                            "When",
                            "Where",
                            "Can you",
                            "Could you",
                        ]
                    )
                )

                if not is_researcher:
                    evidence = AttributedEvidence(
                        text=text,
                        normalized_text=self._normalize_text(text),
                        speaker_id=current_speaker_profile.unique_identifier,
                        speaker_role=current_speaker_profile.role,
                        is_researcher_content=False,
                        evidence_type=EvidenceType.STATEMENT,
                        line_number=i,
                        confidence_score=0.6,
                    )
                    evidence_list.append(evidence)

        return evidence_list

    def validate_attribution(
        self, evidence: AttributedEvidence, original_text: str
    ) -> Tuple[bool, float]:
        """
        Validate that evidence attribution is correct.

        Args:
            evidence: Attributed evidence to validate
            original_text: Original transcript text

        Returns:
            Tuple of (is_valid, confidence_score)
        """
        # Check if evidence text exists in original
        if evidence.text not in original_text:
            logger.warning(
                f"Evidence text not found in original: {evidence.text[:50]}..."
            )
            return False, 0.0

        # Check for researcher patterns
        if not evidence.is_researcher_content:
            for pattern in self.researcher_patterns:
                if re.match(pattern, evidence.text.strip(), re.IGNORECASE):
                    logger.warning(
                        f"Researcher pattern found in non-researcher evidence: {evidence.text[:50]}..."
                    )
                    return False, 0.3

        # Validate evidence type makes sense
        text_lower = evidence.text.lower()

        if evidence.evidence_type == EvidenceType.PAIN_POINT:
            has_pain_indicator = any(
                word in text_lower
                for word in ["problem", "issue", "difficult", "frustrat", "challenge"]
            )
            if not has_pain_indicator:
                return True, 0.6  # Might be implicit

        if evidence.evidence_type == EvidenceType.NEED:
            has_need_indicator = any(
                word in text_lower
                for word in ["need", "want", "require", "must", "should"]
            )
            if not has_need_indicator:
                return True, 0.6  # Might be implicit

        return True, evidence.confidence_score
