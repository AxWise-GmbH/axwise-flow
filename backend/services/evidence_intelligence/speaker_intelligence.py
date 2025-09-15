"""
Speaker Intelligence Module

Intelligently identifies and tracks speakers across complex multi-interview documents,
solving the speaker conflation and attribution problems.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Set
from enum import Enum
import logging
import re
from .context_analyzer import DocumentContext, DocumentType

logger = logging.getLogger(__name__)


class SpeakerRole(str, Enum):
    """Speaker role classification"""

    INTERVIEWER = "Interviewer"
    INTERVIEWEE = "Interviewee"
    MODERATOR = "Moderator"
    PARTICIPANT = "Participant"
    RESEARCHER = "Researcher"
    OBSERVER = "Observer"


class SpeakerProfile(BaseModel):
    """LLM-extracted speaker profile with unique identification"""

    speaker_id: str = Field(description="Unique identifier for this speaker")
    name: Optional[str] = Field(default=None, description="Actual name if mentioned")
    role: SpeakerRole = Field(description="Speaker's role in the interview")
    interview_session: int = Field(
        default=1, description="Which interview session (1-based)"
    )

    # Characteristics for speaker identification
    characteristics: List[str] = Field(
        default_factory=list, description="Identifying characteristics"
    )
    speaking_style: Optional[str] = Field(
        default=None, description="Communication patterns"
    )
    demographic_hints: Dict[str, Any] = Field(
        default_factory=dict, description="Age, location, profession hints"
    )

    # Evidence for speaker identification
    quote_samples: List[str] = Field(
        default_factory=list, description="Representative quotes"
    )
    question_patterns: List[str] = Field(
        default_factory=list, description="Types of questions asked"
    )
    response_patterns: List[str] = Field(
        default_factory=list, description="Response patterns"
    )

    # Metadata
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    turn_count: int = Field(default=0, description="Number of speaking turns")
    avg_turn_length: float = Field(default=0, description="Average words per turn")

    # Unique identification fields to prevent conflation
    unique_identifier: str = Field(
        default="", description="Guaranteed unique ID across document"
    )
    is_researcher: bool = Field(
        default=False, description="Flag for researcher/interviewer"
    )


class SpeakerIntelligence:
    """
    Uses LLM to understand speaker patterns and maintain identity
    across document, preventing speaker conflation in multi-interview files.
    """

    def __init__(self, llm_service):
        self.llm_service = llm_service
        self.speaker_extraction_prompt = """
        Analyze this transcript section and identify all unique speakers.

        CRITICAL REQUIREMENTS:
        1. Each speaker in this section must have a UNIQUE identifier
        2. Different interview sessions have DIFFERENT people - never merge them
        3. Look for context clues like "Interview 1", "Participant 2", etc.
        4. Track who asks questions (interviewer/researcher) vs who answers (interviewee)

        For each speaker, extract:
        1. A unique identifier (create descriptive one if not labeled)
        2. Their role (Interviewer/Interviewee/Participant/Researcher)
        3. Which interview session they belong to
        4. Any demographic information mentioned (age, location, profession)
        5. Their speaking style and patterns
        6. Sample quotes that represent them
        7. Whether they primarily ask questions or give answers

        SPEAKER IDENTIFICATION RULES:
        - If someone asks "How do you..." they are likely the Interviewer/Researcher
        - If someone shares personal experiences, they are likely the Interviewee
        - Each new "Interview X" or "Participant X" is a DIFFERENT person
        - Use linguistic patterns to distinguish speakers

        This is interview session #{session_number}

        Transcript section:
        {transcript}

        Return detailed speaker profiles as JSON.
        """

        self.speaker_disambiguation_prompt = """
        Verify that these speakers are correctly identified as unique individuals.

        Check for:
        1. No conflation of different interviewees
        2. Correct separation of interviewer vs interviewee
        3. Unique IDs for each person

        Speakers identified:
        {speakers}

        Original text sample:
        {text_sample}

        Return validation result and any corrections needed.
        """

    async def identify_speakers(
        self, transcript: str, context: DocumentContext
    ) -> List[SpeakerProfile]:
        """
        Identify all unique speakers using LLM understanding.
        Ensures no conflation in multi-interview files.

        Args:
            transcript: Full transcript text
            context: Document context analysis

        Returns:
            List of unique speaker profiles
        """
        try:
            if context.document_type == DocumentType.MULTI_INTERVIEW:
                # Process each interview section separately to prevent conflation
                speakers = await self._process_multi_interview(transcript, context)
            else:
                # Process as single interview
                speakers = await self._extract_speakers_from_section(transcript, 1)

            # Ensure absolute uniqueness
            speakers = self._ensure_absolute_uniqueness(speakers)

            # Identify researchers/interviewers
            speakers = self._identify_researchers(speakers)

            # Validate speaker separation
            speakers = await self._validate_speaker_separation(speakers, transcript)

            logger.info(
                f"Identified {len(speakers)} unique speakers across "
                f"{context.interview_count} interview(s)"
            )

            return speakers

        except Exception as e:
            logger.error(f"Error identifying speakers: {e}")
            return self._fallback_speaker_identification(transcript, context)

    async def _process_multi_interview(
        self, transcript: str, context: DocumentContext
    ) -> List[SpeakerProfile]:
        """Process multi-interview file with strict separation"""
        speakers = []

        # Split into sections if possible
        if context.interview_sections:
            for i, section_info in enumerate(context.interview_sections, 1):
                start = section_info.get("start_position", 0)
                end = section_info.get("end_position", len(transcript))
                section_text = transcript[start:end]

                # Extract speakers from this section
                section_speakers = await self._extract_speakers_from_section(
                    section_text, section_info.get("interview_number", i)
                )

                # Ensure unique IDs include session number
                for speaker in section_speakers:
                    speaker.interview_session = section_info.get("interview_number", i)
                    speaker.unique_identifier = (
                        f"Session{speaker.interview_session}_{speaker.speaker_id}"
                    )

                speakers.extend(section_speakers)
        else:
            # Try to identify sections by patterns
            sections = self._split_by_interview_markers(transcript)
            for i, section_text in enumerate(sections, 1):
                section_speakers = await self._extract_speakers_from_section(
                    section_text, i
                )

                for speaker in section_speakers:
                    speaker.interview_session = i
                    speaker.unique_identifier = f"Session{i}_{speaker.speaker_id}"

                speakers.extend(section_speakers)

        return speakers

    async def _extract_speakers_from_section(
        self, text: str, session: int
    ) -> List[SpeakerProfile]:
        """Extract speakers from a single interview section"""

        try:
            # Create prompt with session context
            prompt = self.speaker_extraction_prompt.format(
                session_number=session, transcript=text[:8000]  # Limit for LLM context
            )

            # Call LLM for speaker extraction
            response = await self.llm_service.analyze(
                {
                    "task": "speaker_identification",
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.1,
                    "response_mime_type": "application/json",
                }
            )

            speakers = []

            if isinstance(response, list):
                for speaker_data in response:
                    speakers.append(self._create_speaker_profile(speaker_data, session))
            elif isinstance(response, dict) and "speakers" in response:
                for speaker_data in response["speakers"]:
                    speakers.append(self._create_speaker_profile(speaker_data, session))
            else:
                logger.warning(f"Unexpected LLM response format for session {session}")
                return self._fallback_section_speakers(text, session)

            return speakers

        except Exception as e:
            logger.error(f"Error extracting speakers from section {session}: {e}")
            return self._fallback_section_speakers(text, session)

    def _create_speaker_profile(self, data: Dict, session: int) -> SpeakerProfile:
        """Create SpeakerProfile from LLM response data"""

        # Determine role
        role_str = data.get("role", "Participant").upper()
        if "INTERVIEW" in role_str:
            role = SpeakerRole.INTERVIEWER
        elif "RESEARCH" in role_str:
            role = SpeakerRole.RESEARCHER
        elif "MODERAT" in role_str:
            role = SpeakerRole.MODERATOR
        elif "OBSERVE" in role_str:
            role = SpeakerRole.OBSERVER
        else:
            role = (
                SpeakerRole.INTERVIEWEE
                if "INTERVIEWEE" in role_str
                else SpeakerRole.PARTICIPANT
            )

        # Create unique speaker ID
        speaker_id = data.get("speaker_id", f"Speaker_{session}_{role.value}")

        # Build profile
        profile = SpeakerProfile(
            speaker_id=speaker_id,
            name=data.get("name"),
            role=role,
            interview_session=session,
            characteristics=data.get("characteristics", []),
            speaking_style=data.get("speaking_style"),
            demographic_hints=data.get("demographic_hints", {}),
            quote_samples=data.get("quote_samples", [])[:5],
            confidence=data.get("confidence", 0.8),
            unique_identifier=f"S{session}_{speaker_id}",
        )

        # Check if this is a researcher/interviewer
        profile.is_researcher = role in [
            SpeakerRole.INTERVIEWER,
            SpeakerRole.RESEARCHER,
            SpeakerRole.MODERATOR,
        ]

        return profile

    def _ensure_absolute_uniqueness(
        self, speakers: List[SpeakerProfile]
    ) -> List[SpeakerProfile]:
        """Ensure each speaker has an absolutely unique identifier"""
        seen_ids = set()
        unique_speakers = []

        for speaker in speakers:
            # Create unique ID combining session, role, and index
            base_id = f"S{speaker.interview_session}_{speaker.role.value}"

            # Make it unique if needed
            unique_id = base_id
            counter = 1
            while unique_id in seen_ids:
                unique_id = f"{base_id}_{counter}"
                counter += 1

            speaker.unique_identifier = unique_id
            speaker.speaker_id = unique_id  # Update speaker_id too
            seen_ids.add(unique_id)
            unique_speakers.append(speaker)

            logger.debug(
                f"Assigned unique ID: {unique_id} to speaker in session {speaker.interview_session}"
            )

        return unique_speakers

    def _identify_researchers(
        self, speakers: List[SpeakerProfile]
    ) -> List[SpeakerProfile]:
        """Identify and flag researchers/interviewers based on patterns"""

        for speaker in speakers:
            # Check question patterns
            question_indicators = [
                "how do you",
                "can you tell me",
                "what do you think",
                "could you describe",
                "why do you",
                "when did you",
                "have you ever",
            ]

            # Check if quotes contain many questions
            question_count = 0
            for quote in speaker.quote_samples:
                quote_lower = quote.lower()
                if any(indicator in quote_lower for indicator in question_indicators):
                    question_count += 1

            # If majority of quotes are questions, likely a researcher
            if (
                speaker.quote_samples
                and question_count / len(speaker.quote_samples) > 0.6
            ):
                speaker.is_researcher = True
                if speaker.role == SpeakerRole.PARTICIPANT:
                    speaker.role = SpeakerRole.INTERVIEWER
                    logger.info(
                        f"Identified {speaker.speaker_id} as researcher based on question patterns"
                    )

        return speakers

    async def _validate_speaker_separation(
        self, speakers: List[SpeakerProfile], transcript: str
    ) -> List[SpeakerProfile]:
        """Validate that speakers are correctly separated"""

        try:
            # Create validation prompt
            speakers_summary = [
                {
                    "id": s.unique_identifier,
                    "role": s.role.value,
                    "session": s.interview_session,
                    "is_researcher": s.is_researcher,
                }
                for s in speakers
            ]

            prompt = self.speaker_disambiguation_prompt.format(
                speakers=speakers_summary, text_sample=transcript[:2000]
            )

            # Validate with LLM
            validation = await self.llm_service.analyze(
                {"task": "speaker_validation", "prompt": prompt, "temperature": 0.0}
            )

            # Log validation result
            if isinstance(validation, dict):
                if validation.get("issues"):
                    logger.warning(f"Speaker validation issues: {validation['issues']}")
                if validation.get("confidence", 0) < 0.7:
                    logger.warning(
                        f"Low confidence in speaker separation: {validation.get('confidence')}"
                    )

            return speakers

        except Exception as e:
            logger.error(f"Error validating speakers: {e}")
            return speakers

    def _split_by_interview_markers(self, transcript: str) -> List[str]:
        """Split transcript by interview markers"""

        # Common interview separators
        patterns = [
            r"(?=INTERVIEW\s+\d+)",
            r"(?=Interview\s+\d+:)",
            r"(?=Participant\s+\d+[:\s])",
            r"(?=Interviewee\s+\d+[:\s\(])",
        ]

        for pattern in patterns:
            parts = re.split(pattern, transcript, flags=re.IGNORECASE)
            if len(parts) > 1:
                return [p.strip() for p in parts if p.strip()]

        # No clear separators found
        return [transcript]

    def _fallback_speaker_identification(
        self, transcript: str, context: DocumentContext
    ) -> List[SpeakerProfile]:
        """Fallback pattern-based speaker identification"""
        logger.info("Using fallback pattern-based speaker identification")

        speakers = []

        # Extract speaker labels from dialogue
        speaker_pattern = r"^([A-Z][A-Za-z\s]+):\s*(.+)"
        matches = re.findall(speaker_pattern, transcript, re.MULTILINE)

        speaker_names = {}
        for speaker_label, dialogue in matches:
            speaker_label = speaker_label.strip()

            # Determine role
            if any(
                word in speaker_label.lower()
                for word in ["interview", "research", "moderat"]
            ):
                role = SpeakerRole.INTERVIEWER
                is_researcher = True
            else:
                role = SpeakerRole.INTERVIEWEE
                is_researcher = False

            # Track unique speakers
            if speaker_label not in speaker_names:
                session = 1  # Default to session 1 for single interview

                # Try to extract session number
                session_match = re.search(r"\d+", speaker_label)
                if (
                    session_match
                    and context.document_type == DocumentType.MULTI_INTERVIEW
                ):
                    session = int(session_match.group())

                profile = SpeakerProfile(
                    speaker_id=speaker_label,
                    name=speaker_label if len(speaker_label) < 30 else None,
                    role=role,
                    interview_session=session,
                    is_researcher=is_researcher,
                    unique_identifier=f"S{session}_{speaker_label}",
                    confidence=0.6,
                )

                speaker_names[speaker_label] = profile
                speakers.append(profile)

        # If no speakers found, create defaults
        if not speakers:
            speakers = [
                SpeakerProfile(
                    speaker_id="Interviewer",
                    role=SpeakerRole.INTERVIEWER,
                    interview_session=1,
                    is_researcher=True,
                    unique_identifier="S1_Interviewer",
                    confidence=0.5,
                ),
                SpeakerProfile(
                    speaker_id="Interviewee",
                    role=SpeakerRole.INTERVIEWEE,
                    interview_session=1,
                    is_researcher=False,
                    unique_identifier="S1_Interviewee",
                    confidence=0.5,
                ),
            ]

        return speakers

    def _fallback_section_speakers(
        self, text: str, session: int
    ) -> List[SpeakerProfile]:
        """Create fallback speakers for a section"""
        return [
            SpeakerProfile(
                speaker_id=f"Interviewer_S{session}",
                role=SpeakerRole.INTERVIEWER,
                interview_session=session,
                is_researcher=True,
                unique_identifier=f"S{session}_Interviewer",
                confidence=0.5,
            ),
            SpeakerProfile(
                speaker_id=f"Interviewee_S{session}",
                role=SpeakerRole.INTERVIEWEE,
                interview_session=session,
                is_researcher=False,
                unique_identifier=f"S{session}_Interviewee",
                confidence=0.5,
            ),
        ]
