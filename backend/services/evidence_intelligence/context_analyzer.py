"""
Context Analyzer Module

Analyzes document structure and context using LLM understanding
instead of regex pattern matching.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum
import logging
import re

logger = logging.getLogger(__name__)


class DocumentType(str, Enum):
    """Document type classification"""

    SINGLE_INTERVIEW = "single_interview"
    MULTI_INTERVIEW = "multi_interview"
    FOCUS_GROUP = "focus_group"
    SURVEY_RESPONSES = "survey_responses"
    MIXED_FORMAT = "mixed_format"


class DocumentContext(BaseModel):
    """LLM-extracted document context"""

    document_type: DocumentType
    interview_count: int = Field(default=1, ge=1)
    has_timestamps: bool = Field(default=False)
    has_speaker_labels: bool = Field(default=False)
    language: str = Field(default="en")
    domain: str = Field(description="Industry or research domain")
    key_topics: List[str] = Field(default_factory=list)
    formatting_style: str = Field(default="conversational")
    metadata: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)

    # Additional fields for better context understanding
    estimated_speakers: int = Field(default=2, ge=1)
    interview_sections: List[Dict[str, Any]] = Field(default_factory=list)
    content_complexity: str = Field(default="medium")


class ContextAnalyzer:
    """
    Analyzes document structure and context using LLM understanding
    instead of regex pattern matching.
    """

    def __init__(self, llm_service):
        self.llm_service = llm_service
        self.analysis_prompt = """
        Analyze this document and extract comprehensive context information.

        Focus on:
        1. Document type (single interview, multi-interview, focus group, etc.)
        2. Number of distinct interviews or sessions
        3. Presence of timestamps and speaker labels
        4. Domain/industry context (technology, healthcare, education, etc.)
        5. Key topics and themes discussed
        6. Document formatting and structure
        7. Any special patterns or characteristics

        For multi-interview files, identify:
        - Clear interview boundaries (e.g., "INTERVIEW 1 OF 25")
        - Different participant sections
        - Session markers or separators

        Document to analyze:
        {document}

        Return as structured JSON matching the DocumentContext schema.
        """

        # Fallback regex patterns for validation
        self.multi_interview_patterns = [
            r"INTERVIEW\s+\d+\s+OF\s+\d+",
            r"Interview\s+\d+:",
            r"INTERVIEW\s+#?\d+",
            r"===.*INTERVIEW.*===",
            r"Interviewee\s+\d+\s*\(",
            r"Participant\s+\d+\s*:",
        ]

        self.timestamp_patterns = [
            r"\[\d{2}:\d{2}:\d{2}\]",
            r"\[\d{2}:\d{2}\]",
            r"\d{2}:\d{2}:\d{2}",
            r"\d{2}:\d{2}\s*[AP]M",
        ]

    async def analyze_context(self, raw_text: str) -> DocumentContext:
        """
        Extract document context using LLM understanding with fallback to patterns

        Args:
            raw_text: Raw document text

        Returns:
            DocumentContext with comprehensive analysis
        """
        try:
            # Try LLM analysis first
            context = await self._llm_analyze(raw_text)

            # Validate and enhance with pattern matching
            context = self._validate_and_enhance(context, raw_text)

            logger.info(
                f"Document context analysis complete: {context.document_type}, "
                f"{context.interview_count} interviews, "
                f"confidence: {context.confidence:.2f}"
            )

            return context

        except Exception as e:
            logger.error(f"Error in context analysis: {e}")
            # Fallback to pattern-based analysis
            return self._fallback_analysis(raw_text)

    async def _llm_analyze(self, raw_text: str) -> DocumentContext:
        """Perform LLM-based context analysis"""

        # Limit text for initial analysis (first 5000 chars should be enough)
        sample_text = raw_text[:5000]

        try:
            from pydantic_ai import Agent
            from backend.utils.pydantic_ai_retry import safe_pydantic_ai_call

            # Create prompt with document sample
            prompt = self.analysis_prompt.format(document=sample_text)

            # Use LLM to analyze context
            response = await self.llm_service.analyze(
                {
                    "task": "context_analysis",
                    "prompt": prompt,
                    "enforce_json": True,
                    "temperature": 0.1,
                    "response_mime_type": "application/json",
                }
            )

            # Parse response into DocumentContext
            if isinstance(response, dict):
                # Map response to DocumentContext fields
                context_data = {
                    "document_type": self._determine_document_type(response),
                    "interview_count": response.get("interview_count", 1),
                    "has_timestamps": response.get("has_timestamps", False),
                    "has_speaker_labels": response.get("has_speaker_labels", False),
                    "language": response.get("language", "en"),
                    "domain": response.get("domain", "general"),
                    "key_topics": response.get("key_topics", []),
                    "formatting_style": response.get(
                        "formatting_style", "conversational"
                    ),
                    "metadata": response.get("metadata", {}),
                    "estimated_speakers": response.get("estimated_speakers", 2),
                    "content_complexity": response.get("content_complexity", "medium"),
                }

                return DocumentContext(**context_data)
            else:
                logger.warning("LLM response was not a dictionary, using fallback")
                return self._fallback_analysis(raw_text)

        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            return self._fallback_analysis(raw_text)

    def _determine_document_type(self, response: Dict) -> DocumentType:
        """Determine document type from LLM response"""
        doc_type = response.get("document_type", "").lower()

        if "multi" in doc_type or response.get("interview_count", 1) > 1:
            return DocumentType.MULTI_INTERVIEW
        elif "focus" in doc_type or "group" in doc_type:
            return DocumentType.FOCUS_GROUP
        elif "survey" in doc_type:
            return DocumentType.SURVEY_RESPONSES
        elif "mixed" in doc_type:
            return DocumentType.MIXED_FORMAT
        else:
            return DocumentType.SINGLE_INTERVIEW

    def _validate_and_enhance(
        self, context: DocumentContext, raw_text: str
    ) -> DocumentContext:
        """Validate LLM analysis with pattern matching and enhance results"""

        # Check for multi-interview markers
        multi_interview_markers = []
        for pattern in self.multi_interview_patterns:
            matches = re.findall(pattern, raw_text, re.IGNORECASE)
            multi_interview_markers.extend(matches)

        if multi_interview_markers:
            # Found multi-interview markers
            actual_count = len(set(multi_interview_markers))
            if actual_count > context.interview_count:
                logger.info(
                    f"Pattern matching found {actual_count} interviews "
                    f"(LLM found {context.interview_count})"
                )
                context.interview_count = actual_count
                context.document_type = DocumentType.MULTI_INTERVIEW

            # Store interview markers in metadata
            context.metadata["interview_markers"] = multi_interview_markers[:10]

        # Check for timestamps
        if not context.has_timestamps:
            for pattern in self.timestamp_patterns:
                if re.search(pattern, raw_text[:2000]):  # Check first 2000 chars
                    context.has_timestamps = True
                    break

        # Check for speaker labels
        if not context.has_speaker_labels:
            speaker_patterns = [
                r"^[A-Z][a-z]+:",
                r"^(Interviewer|Interviewee|Participant|Moderator):",
                r"^Speaker\s*\d+:",
            ]
            for pattern in speaker_patterns:
                if re.search(pattern, raw_text[:2000], re.MULTILINE):
                    context.has_speaker_labels = True
                    break

        # Identify interview sections for multi-interview files
        if context.document_type == DocumentType.MULTI_INTERVIEW:
            context.interview_sections = self._identify_interview_sections(raw_text)

        # Adjust confidence based on validation
        if (
            multi_interview_markers
            and context.document_type == DocumentType.MULTI_INTERVIEW
        ):
            context.confidence = min(context.confidence + 0.1, 1.0)

        return context

    def _identify_interview_sections(self, raw_text: str) -> List[Dict[str, Any]]:
        """Identify boundaries of different interview sections"""
        sections = []

        # Look for clear interview markers
        interview_pattern = r"(INTERVIEW\s+(\d+)(?:\s+OF\s+\d+)?)"
        matches = list(re.finditer(interview_pattern, raw_text, re.IGNORECASE))

        for i, match in enumerate(matches):
            section = {
                "interview_number": int(match.group(2)),
                "start_position": match.start(),
                "marker_text": match.group(1),
            }

            # Find end position (start of next interview or end of document)
            if i < len(matches) - 1:
                section["end_position"] = matches[i + 1].start()
            else:
                section["end_position"] = len(raw_text)

            sections.append(section)

        # If no clear markers, try to identify by participant headers
        if not sections:
            participant_pattern = r"((?:Interviewee|Participant)\s+(\d+)[^\n]*)"
            matches = list(re.finditer(participant_pattern, raw_text, re.IGNORECASE))

            for i, match in enumerate(matches):
                section = {
                    "interview_number": int(match.group(2)),
                    "start_position": match.start(),
                    "marker_text": match.group(1),
                }

                if i < len(matches) - 1:
                    section["end_position"] = matches[i + 1].start()
                else:
                    section["end_position"] = len(raw_text)

                sections.append(section)

        return sections

    def _fallback_analysis(self, raw_text: str) -> DocumentContext:
        """Fallback pattern-based analysis when LLM fails"""
        logger.info("Using fallback pattern-based context analysis")

        # Basic analysis using patterns
        context_data = {
            "document_type": DocumentType.SINGLE_INTERVIEW,
            "interview_count": 1,
            "has_timestamps": False,
            "has_speaker_labels": False,
            "language": "en",
            "domain": "general",
            "key_topics": [],
            "formatting_style": "conversational",
            "metadata": {},
            "confidence": 0.5,
        }

        # Check for multi-interview
        multi_markers = []
        for pattern in self.multi_interview_patterns:
            matches = re.findall(pattern, raw_text, re.IGNORECASE)
            multi_markers.extend(matches)

        if multi_markers:
            context_data["document_type"] = DocumentType.MULTI_INTERVIEW
            context_data["interview_count"] = len(set(multi_markers))
            context_data["metadata"]["interview_markers"] = multi_markers[:10]

        # Check for timestamps
        for pattern in self.timestamp_patterns:
            if re.search(pattern, raw_text[:2000]):
                context_data["has_timestamps"] = True
                break

        # Check for speaker labels
        if re.search(r"^[A-Z][a-z]+:", raw_text[:2000], re.MULTILINE):
            context_data["has_speaker_labels"] = True

        # Estimate speakers
        speakers = set(re.findall(r"^([A-Z][a-z]+):", raw_text, re.MULTILINE))
        context_data["estimated_speakers"] = max(len(speakers), 2)

        # Determine complexity
        word_count = len(raw_text.split())
        if word_count > 5000:
            context_data["content_complexity"] = "high"
        elif word_count < 1000:
            context_data["content_complexity"] = "low"
        else:
            context_data["content_complexity"] = "medium"

        return DocumentContext(**context_data)

    def split_multi_interview(
        self, raw_text: str, context: DocumentContext
    ) -> List[str]:
        """
        Split multi-interview document into separate interview sections

        Args:
            raw_text: Full document text
            context: Document context with section information

        Returns:
            List of individual interview texts
        """
        if context.document_type != DocumentType.MULTI_INTERVIEW:
            return [raw_text]

        sections = []

        if context.interview_sections:
            # Use identified sections
            for section_info in context.interview_sections:
                start = section_info["start_position"]
                end = section_info["end_position"]
                section_text = raw_text[start:end].strip()
                if section_text:
                    sections.append(section_text)
        else:
            # Try to split by common patterns
            # First try numbered interview pattern
            parts = re.split(r"(?=INTERVIEW\s+\d+)", raw_text, flags=re.IGNORECASE)
            if len(parts) > 1:
                sections = [p.strip() for p in parts if p.strip()]
            else:
                # Try participant pattern
                parts = re.split(
                    r"(?=(?:Interviewee|Participant)\s+\d+)",
                    raw_text,
                    flags=re.IGNORECASE,
                )
                if len(parts) > 1:
                    sections = [p.strip() for p in parts if p.strip()]
                else:
                    # Last resort: return as single section
                    sections = [raw_text]

        logger.info(f"Split document into {len(sections)} interview sections")
        return sections
