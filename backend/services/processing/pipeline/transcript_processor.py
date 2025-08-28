"""
Transcript processor implementation.

This module provides an implementation of the transcript processor, which is
responsible for parsing and structuring raw transcript data.
"""

import logging
import re
import json
from typing import Any, Dict, List, Optional, Union, Type

from backend.models.transcript import (
    TranscriptSegment,
    TranscriptMetadata,
    StructuredTranscript,
)
from backend.services.processing.pipeline.base_processor import BaseProcessor
from backend.services.processing.transcript_structuring_service import (
    TranscriptStructuringPrompts,
)
from backend.services.processing.content_type_detector import ContentTypeDetector
from backend.services.processing.request_builder import RequestBuilder
from backend.services.processing.llm_request_cache import LLMRequestCache
from backend.utils.json import JSONProcessor

logger = logging.getLogger(__name__)


class TranscriptProcessor(BaseProcessor):
    """
    Implementation of the transcript processor.

    This class provides an implementation of the transcript processor, which is
    responsible for parsing and structuring raw transcript data. It handles
    different input formats, detects content types, extracts speakers and their
    roles, and structures the transcript into a standardized format.
    """

    def __init__(self, llm_service=None):
        """
        Initialize the processor.

        Args:
            llm_service: LLM service to use for transcript structuring
        """
        super().__init__(
            name="TranscriptProcessor",
            description="Processes raw transcript data into a structured format",
            version="1.0.0",
        )
        self._llm_service = llm_service

    async def _process_impl(self, data: Any, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process the input data and return the structured transcript.

        Args:
            data: The input data to process (raw text, dict, or list)
            context: Context information for the processing

        Returns:
            Dictionary with structured transcript data
        """
        # Extract raw text from the input data
        raw_text, filename = self._extract_text_and_filename(data)

        if not raw_text or not raw_text.strip():
            logger.warning("Empty or whitespace-only transcript provided")
            return {"segments": [], "metadata": {"filename": filename}}

        # Detect content type
        content_info = self._detect_content_type(raw_text)

        # Add content info to context for use by other processors
        context["content_info"] = content_info

        # Structure the transcript
        structured_segments = await self._structure_transcript(
            raw_text, filename, content_info
        )

        # Create metadata
        metadata = self._create_metadata(filename, content_info, context)

        # Return structured transcript
        return {"segments": structured_segments, "metadata": metadata}

    def _extract_text_and_filename(self, data: Any) -> tuple:
        """
        Extract raw text and filename from the input data.

        Args:
            data: The input data (raw text, dict, or list)

        Returns:
            Tuple of (raw_text, filename)
        """
        raw_text = ""
        filename = None

        if isinstance(data, str):
            # Input is raw text
            raw_text = data
        elif isinstance(data, dict):
            # Input is a dictionary
            if "text" in data:
                raw_text = data["text"]
            elif "content" in data:
                raw_text = data["content"]
            elif "free_text" in data:
                raw_text = data["free_text"]
            elif "original_data" in data:
                raw_text = data["original_data"]

            # Extract filename if available
            if "filename" in data:
                filename = data["filename"]
            elif "metadata" in data and isinstance(data["metadata"], dict):
                filename = data["metadata"].get("filename")
        elif isinstance(data, list):
            # Input is a list, try to extract text from each item
            if all(isinstance(item, dict) for item in data):
                # List of dictionaries, try to extract dialogue
                dialogues = []
                for item in data:
                    if "dialogue" in item:
                        speaker = item.get("speaker_id", "Unknown")
                        dialogues.append(f"{speaker}: {item['dialogue']}")
                    elif "text" in item:
                        dialogues.append(item["text"])

                raw_text = "\n".join(dialogues)

        return raw_text, filename

    def _detect_content_type(self, raw_text: str) -> Dict[str, Any]:
        """
        Analyze the content to detect its type and characteristics.

        Args:
            raw_text: Raw interview transcript text

        Returns:
            Dictionary with content type information
        """
        # Use the dedicated ContentTypeDetector class
        return ContentTypeDetector.detect(raw_text)

    async def _structure_transcript(
        self, raw_text: str, filename: str, content_info: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """
        Structure a raw interview transcript.

        Args:
            raw_text: Raw interview transcript text
            filename: Optional filename
            content_info: Content type information

        Returns:
            List of structured transcript segments
        """
        # If the LLM service is not available, use manual extraction
        if not self._llm_service:
            logger.warning("LLM service not available, using manual extraction")
            return self._extract_transcript_manually(raw_text)

        try:
            # Get the prompt for transcript structuring
            prompt = TranscriptStructuringPrompts.get_prompt()

            # Log the length of the raw text
            logger.info(f"Structuring transcript with {len(raw_text)} characters")

            # Add special instructions based on content type
            if content_info["is_problem_focused"]:
                logger.info(
                    "Detected problem-focused interview content. Using special handling."
                )
                prompt = (
                    prompt
                    + "\n\nIMPORTANT: This appears to be a problem-focused interview. Focus on accurately structuring the dialogue without interpreting the content. Ensure the output is a valid JSON array with proper speaker_id, role, and dialogue fields."
                )

            if content_info["has_timestamps"]:
                logger.info(
                    "Detected timestamps in interview content. Using special handling."
                )
                prompt = (
                    prompt
                    + "\n\nIMPORTANT: This transcript contains timestamps. Please preserve the timestamps in the speaker_id field or add them to a separate timestamp field for each dialogue segment."
                )

            # Build the request using the RequestBuilder
            request_data = RequestBuilder.build_transcript_request(
                text=raw_text,
                prompt=prompt,
                content_info=content_info,
                filename=filename,
            )

            # Call the LLM service with caching
            llm_response = await LLMRequestCache.get_or_compute(
                request_data, self._llm_service
            )

            # Parse the LLM response
            structured_transcript = self._parse_llm_response(llm_response)

            # If problem-focused content and still no valid structure, try fallback method
            if content_info["is_problem_focused"] and not structured_transcript:
                logger.warning(
                    "Problem-focused content failed to structure. Trying fallback method."
                )
                structured_transcript = self._extract_transcript_manually(raw_text)

            # If high complexity content and still no valid structure, try fallback method
            if (
                content_info["content_complexity"] == "high"
                and not structured_transcript
            ):
                logger.warning(
                    "High complexity content failed to structure. Trying fallback method."
                )
                structured_transcript = self._extract_transcript_manually(raw_text)

            # If we still don't have a valid structure, try manual extraction
            if not structured_transcript:
                logger.warning(
                    "LLM structuring failed. Falling back to manual extraction."
                )
                structured_transcript = self._extract_transcript_manually(raw_text)

            return structured_transcript
        except Exception as e:
            logger.error(f"Error structuring transcript: {str(e)}", exc_info=True)
            # Fall back to manual extraction
            return self._extract_transcript_manually(raw_text)

    def _parse_llm_response(self, llm_response: Any) -> List[Dict[str, str]]:
        """
        Parse the LLM response into a structured transcript.

        Args:
            llm_response: Response from the LLM service

        Returns:
            List of structured transcript segments
        """
        if not llm_response:
            logger.warning("Empty LLM response received")
            return []

        try:
            # Use JSONProcessor to parse the response
            parsed_data = JSONProcessor.parse_transcript(llm_response)

            # Check if we have a valid transcript
            if isinstance(parsed_data, dict) and "segments" in parsed_data:
                segments = parsed_data["segments"]
                return self._validate_and_fix_segments(segments)
            elif isinstance(parsed_data, list):
                return self._validate_and_fix_segments(parsed_data)
            else:
                logger.warning(f"Unexpected response format: {type(parsed_data)}")
                # Try to extract structured data from unstructured response
                return self._extract_from_unstructured_response(llm_response)
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {str(e)}")
            # Try to repair the JSON
            return self._repair_json_response(llm_response)
        except KeyError as e:
            logger.error(f"Missing key in response: {str(e)}")
            # Try to extract what we can
            return self._extract_partial_response(llm_response)
        except Exception as e:
            logger.error(f"Error parsing LLM response: {str(e)}", exc_info=True)
            return []

    def _validate_and_fix_segments(
        self, segments: List[Dict[str, Any]]
    ) -> List[Dict[str, str]]:
        """
        Validate and fix transcript segments.

        Args:
            segments: List of transcript segments

        Returns:
            Validated and fixed segments
        """
        if not segments:
            return []

        valid_segments = []
        for segment in segments:
            # Ensure required fields are present
            if "speaker_id" not in segment:
                segment["speaker_id"] = "Unknown"

            if "role" not in segment:
                segment["role"] = "Participant"

            if "dialogue" not in segment:
                # Skip segments without dialogue
                continue

            # Validate role
            if segment["role"] not in ["Interviewer", "Interviewee", "Participant"]:
                segment["role"] = "Participant"

            valid_segments.append(
                {
                    "speaker_id": str(segment["speaker_id"]),
                    "role": str(segment["role"]),
                    "dialogue": str(segment["dialogue"]),
                }
            )

        return valid_segments

    def _repair_json_response(self, response: str) -> List[Dict[str, str]]:
        """
        Attempt to repair a malformed JSON response.

        Args:
            response: Malformed JSON response

        Returns:
            Repaired transcript segments
        """
        try:
            # Try to use JSONProcessor's repair functionality
            repaired_json = JSONProcessor.repair_json(response)
            parsed_data = json.loads(repaired_json)

            if isinstance(parsed_data, dict) and "segments" in parsed_data:
                return self._validate_and_fix_segments(parsed_data["segments"])
            elif isinstance(parsed_data, list):
                return self._validate_and_fix_segments(parsed_data)
            else:
                logger.warning("Repaired JSON has unexpected format")
                return []
        except Exception as e:
            logger.error(f"Error repairing JSON: {str(e)}")
            return []

    def _extract_partial_response(self, response: Any) -> List[Dict[str, str]]:
        """
        Extract partial data from a response with missing keys.

        Args:
            response: Response with missing keys

        Returns:
            Extracted transcript segments
        """
        try:
            # If response is a string, try to parse it
            if isinstance(response, str):
                try:
                    response = json.loads(response)
                except:
                    pass

            # If response is a dict, look for any list that might contain segments
            if isinstance(response, dict):
                for key, value in response.items():
                    if isinstance(value, list) and len(value) > 0:
                        if all(isinstance(item, dict) for item in value):
                            return self._validate_and_fix_segments(value)

            # If response is a list, try to use it directly
            if isinstance(response, list):
                return self._validate_and_fix_segments(response)

            logger.warning("Could not extract partial data from response")
            return []
        except Exception as e:
            logger.error(f"Error extracting partial data: {str(e)}")
            return []

    def _extract_from_unstructured_response(
        self, response: str
    ) -> List[Dict[str, str]]:
        """
        Extract structured data from an unstructured response.

        Args:
            response: Unstructured response

        Returns:
            Extracted transcript segments
        """
        try:
            # If it's not a string, convert it to one
            if not isinstance(response, str):
                response = str(response)

            # Try to find JSON-like structures in the response
            json_pattern = r"(\[|\{).*?(\]|\})"
            matches = re.findall(json_pattern, response, re.DOTALL)

            for match in matches:
                try:
                    # Try to parse the match as JSON
                    json_str = response[
                        response.find(match[0]) : response.rfind(match[1]) + 1
                    ]
                    parsed = json.loads(json_str)

                    if isinstance(parsed, dict) and "segments" in parsed:
                        return self._validate_and_fix_segments(parsed["segments"])
                    elif isinstance(parsed, list):
                        return self._validate_and_fix_segments(parsed)
                except:
                    continue

            # If no JSON-like structures found, fall back to manual extraction
            return self._extract_transcript_manually(response)
        except Exception as e:
            logger.error(f"Error extracting from unstructured response: {str(e)}")
            return []

    def _extract_transcript_manually(self, text: str) -> List[Dict[str, str]]:
        """
        Extract transcript segments manually when LLM processing fails.

        Args:
            text: Raw transcript text

        Returns:
            List of structured transcript segments
        """
        try:
            # Preprocess the text
            content_text = self._preprocess_transcript_text(text)

            # Extract speaker turns
            matches = self._extract_speaker_turns(content_text)

            if matches:
                logger.info(f"Manually extracted {len(matches)} speaker turns")

                # Analyze speakers
                speakers = self._analyze_speakers(matches)

                # Determine roles
                roles = self._determine_speaker_roles(speakers)

                # Create structured transcript
                return self._create_structured_transcript(matches, roles)

            # If no matches found, create a fallback transcript
            return self._create_fallback_transcript(text)
        except Exception as e:
            logger.error(
                f"Error in manual transcript extraction: {str(e)}", exc_info=True
            )
            # Return a minimal transcript with the entire text
            return self._create_fallback_transcript(text)

    def _preprocess_transcript_text(self, text: str) -> str:
        """
        Preprocess transcript text by removing headers and normalizing format.

        Args:
            text: Raw transcript text

        Returns:
            Preprocessed text
        """
        # Detect if this is a transcript with a header section
        lines = text.split("\n")
        content_lines = []

        # Check for common header patterns
        has_header = False
        header_keywords = [
            "transcript",
            "interview",
            "conversation",
            "date:",
            "attendees:",
        ]
        header_line_count = 0

        # Count potential header lines
        for i, line in enumerate(lines[:10]):  # Check first 10 lines
            if any(keyword in line.lower() for keyword in header_keywords):
                has_header = True
                header_line_count = i + 1

        # Skip header lines if detected
        if has_header:
            logger.info(
                f"Detected header section with {header_line_count} lines, skipping for content extraction"
            )
            content_lines = lines[header_line_count:]
        else:
            content_lines = lines

        # Join the content lines
        return "\n".join(content_lines)

    def _extract_speaker_turns(self, text: str) -> List[tuple]:
        """
        Extract speaker turns from the text using regex patterns.

        Args:
            text: Preprocessed transcript text

        Returns:
            List of (speaker, dialogue) tuples
        """
        # Try different regex patterns for speaker extraction
        # First try the standard "Name: Text" format
        pattern1 = re.compile(r"([^:]+):\s*(.+?)(?=\n[^:]+:|$)", re.DOTALL)
        matches1 = pattern1.findall(text)

        # Also try timestamp pattern "[00:00:00] Name: Text"
        pattern2 = re.compile(
            r"\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*([^:]+):\s*(.+?)(?=\n\[?\d{1,2}:\d{2}|$)",
            re.DOTALL,
        )
        matches2 = pattern2.findall(text)

        # Use the pattern that found more matches
        return matches1 if len(matches1) >= len(matches2) else matches2

    def _analyze_speakers(self, matches: List[tuple]) -> Dict[str, Dict[str, Any]]:
        """
        Analyze speakers to determine their characteristics.

        Args:
            matches: List of (speaker, dialogue) tuples

        Returns:
            Dictionary mapping speakers to their characteristics
        """
        speakers = {}
        for speaker, dialogue in matches:
            speaker_clean = speaker.strip()
            # Remove timestamps if present
            speaker_clean = re.sub(
                r"\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*", "", speaker_clean
            )

            if speaker_clean not in speakers:
                speakers[speaker_clean] = {
                    "count": 0,
                    "avg_length": 0,
                    "question_marks": 0,
                }

            speakers[speaker_clean]["count"] += 1
            speakers[speaker_clean]["avg_length"] += len(dialogue)
            speakers[speaker_clean]["question_marks"] += dialogue.count("?")

        # Calculate averages
        for speaker in speakers:
            if speakers[speaker]["count"] > 0:
                speakers[speaker]["avg_length"] /= speakers[speaker]["count"]

        return speakers

    def _determine_speaker_roles(
        self, speakers: Dict[str, Dict[str, Any]]
    ) -> Dict[str, str]:
        """
        Determine roles for speakers based on their characteristics.

        Args:
            speakers: Dictionary mapping speakers to their characteristics

        Returns:
            Dictionary mapping speakers to their roles
        """
        roles = {}

        # If we have exactly 2 speakers, assume interviewer/interviewee
        if len(speakers) == 2:
            # The interviewer typically asks more questions and has shorter responses
            speaker_list = list(speakers.keys())
            speaker1 = speaker_list[0]
            speaker2 = speaker_list[1]

            # Compare question frequency
            if (
                speakers[speaker1]["question_marks"]
                > speakers[speaker2]["question_marks"]
            ):
                roles[speaker1] = "Interviewer"
                roles[speaker2] = "Interviewee"
            elif (
                speakers[speaker2]["question_marks"]
                > speakers[speaker1]["question_marks"]
            ):
                roles[speaker1] = "Interviewee"
                roles[speaker2] = "Interviewer"
            # If question counts are equal, compare response length
            elif speakers[speaker1]["avg_length"] < speakers[speaker2]["avg_length"]:
                roles[speaker1] = "Interviewer"
                roles[speaker2] = "Interviewee"
            else:
                roles[speaker1] = "Interviewee"
                roles[speaker2] = "Interviewer"
        else:
            # For more than 2 speakers, use heuristics
            for speaker in speakers:
                # Check for interviewer keywords in speaker name
                if any(
                    keyword in speaker.lower()
                    for keyword in ["interviewer", "moderator", "facilitator"]
                ):
                    roles[speaker] = "Interviewer"
                # Check for interviewee keywords in speaker name
                elif any(
                    keyword in speaker.lower()
                    for keyword in ["interviewee", "participant", "respondent"]
                ):
                    roles[speaker] = "Interviewee"
                # Otherwise, determine based on question frequency and response length
                elif (
                    speakers[speaker]["question_marks"]
                    / max(speakers[speaker]["count"], 1)
                    > 0.5
                ):
                    roles[speaker] = "Interviewer"
                else:
                    roles[speaker] = "Participant"

        return roles

    def _create_structured_transcript(
        self, matches: List[tuple], roles: Dict[str, str]
    ) -> List[Dict[str, str]]:
        """
        Create a structured transcript from matches and roles.

        Args:
            matches: List of (speaker, dialogue) tuples
            roles: Dictionary mapping speakers to their roles

        Returns:
            List of structured transcript segments
        """
        structured_transcript = []
        for speaker, dialogue in matches:
            speaker_clean = speaker.strip()
            # Remove timestamps if present
            speaker_clean = re.sub(
                r"\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*", "", speaker_clean
            )

            # Get role for this speaker
            role = roles.get(speaker_clean, "Participant")

            structured_transcript.append(
                {
                    "speaker_id": speaker_clean,
                    "role": role,
                    "dialogue": dialogue.strip(),
                }
            )

        return structured_transcript

    def _create_fallback_transcript(self, text: str) -> List[Dict[str, str]]:
        """
        Create a fallback transcript when extraction fails.

        Args:
            text: Raw transcript text

        Returns:
            List with a single transcript segment
        """
        logger.warning("Could not extract structured transcript, creating single entry")
        return [
            {"speaker_id": "Unknown", "role": "Participant", "dialogue": text.strip()}
        ]

    def _create_metadata(
        self, filename: str, content_info: Dict[str, Any], context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create metadata for the transcript.

        Args:
            filename: Filename of the transcript
            content_info: Content type information
            context: Context information

        Returns:
            Metadata dictionary
        """
        metadata = {
            "filename": filename,
            "content_type": content_info,
            "source_type": "interview",  # Default source type
        }

        # Add industry if available in context
        if "industry" in context:
            metadata["industry"] = context["industry"]

        # Infer source type from content
        if content_info["estimated_speakers"] > 2:
            metadata["source_type"] = "focus_group"

        return metadata

    def supports_input_type(self, input_type: Type) -> bool:
        """
        Check if the processor supports the given input type.

        Args:
            input_type: The input type to check

        Returns:
            True if the processor supports the input type, False otherwise
        """
        # This processor supports string, dict, and list input types
        return input_type in [str, dict, list]

    def get_output_type(self) -> Type:
        """
        Get the output type of the processor.

        Returns:
            The output type of the processor
        """
        return dict
