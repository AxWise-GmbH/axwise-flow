"""
Transcript structuring service for processing raw interview transcripts.

This service uses an LLM to convert raw interview transcripts into a structured
JSON format with speaker identification and role inference.
"""

import json
import logging
import re
from typing import Dict, Any, List, Optional, Union

from pydantic import ValidationError

from backend.utils.json.json_repair import (
    repair_json,
    parse_json_safely,
    parse_json_array_safely,
)
from backend.models.transcript import TranscriptSegment, StructuredTranscript

from backend.domain.interfaces.llm_unified import ILLMService
from backend.services.llm.prompts.tasks.transcript_structuring import (
    TranscriptStructuringPrompts,
)

# Configure logging
logger = logging.getLogger(__name__)


class TranscriptStructuringService:
    """
    Service for structuring raw interview transcripts using LLM.
    """

    def __init__(self, llm_service: ILLMService):
        """
        Initialize the transcript structuring service.

        Args:
            llm_service: LLM service for transcript structuring
        """
        self.llm_service = llm_service
        logger.info("Initialized TranscriptStructuringService")

    def _detect_content_type(self, raw_text: str) -> Dict[str, Any]:
        """
        Analyze the content to detect its type and characteristics.

        Args:
            raw_text: Raw interview transcript text

        Returns:
            Dictionary with content type information
        """
        content_info = {
            "is_problem_focused": False,
            "is_structured": False,
            "has_timestamps": False,
            "has_speaker_labels": False,
            "estimated_speakers": 0,
            "content_complexity": "medium",
            "is_multi_interview": False,
            "interview_count": 1,
        }

        # Check if this is a problem-focused interview
        problem_indicators = [
            "problem",
            "issue",
            "challenge",
            "difficulty",
            "pain point",
            "frustration",
            "struggle",
            "obstacle",
            "barrier",
            "limitation",
        ]

        problem_count = sum(
            1 for indicator in problem_indicators if indicator in raw_text.lower()
        )
        content_info["is_problem_focused"] = problem_count >= 2

        # Check if the content has timestamps
        timestamp_patterns = [
            r"\[\d{2}:\d{2}:\d{2}\]",  # [00:00:00]
            r"\[\d{2}:\d{2}\]",  # [00:00]
            r"\d{2}:\d{2}:\d{2}",  # 00:00:00
            r"\d{2}:\d{2} [AP]M",  # 00:00 AM/PM
        ]

        for pattern in timestamp_patterns:
            if re.search(pattern, raw_text):
                content_info["has_timestamps"] = True
                break

        # Check if the content has speaker labels
        speaker_patterns = [
            r"([A-Z][a-z]+):\s",  # Name:
            r"([A-Z][a-z]+ [A-Z][a-z]+):\s",  # First Last:
            r"(Interviewer|Interviewee|Participant):\s",  # Role:
        ]

        speakers = set()
        for pattern in speaker_patterns:
            matches = re.findall(pattern, raw_text)
            speakers.update(matches)

        content_info["has_speaker_labels"] = len(speakers) > 0
        content_info["estimated_speakers"] = len(speakers)

        # Check for multi-interview files
        multi_interview_patterns = [
            r"INTERVIEW\s+\d+\s+OF\s+\d+",  # "INTERVIEW 1 OF 25"
            r"Interview\s+\d+:",  # "Interview 1:"
            r"INTERVIEW\s+#?\d+",  # "INTERVIEW #1" or "INTERVIEW 1"
            r"===.*INTERVIEW.*===",  # "=== INTERVIEW 1 ==="
        ]

        interview_markers = []
        for pattern in multi_interview_patterns:
            matches = re.findall(pattern, raw_text, re.IGNORECASE)
            interview_markers.extend(matches)

        if interview_markers:
            content_info["is_multi_interview"] = True
            content_info["interview_count"] = len(interview_markers)
            logger.info(
                f"Detected multi-interview file with {len(interview_markers)} interviews: {interview_markers[:3]}..."
            )

        # Check if the content is already structured (e.g., JSON format)
        content_info["is_structured"] = (
            raw_text.strip().startswith("{") and raw_text.strip().endswith("}")
        ) or (raw_text.strip().startswith("[") and raw_text.strip().endswith("]"))

        # Estimate content complexity
        word_count = len(raw_text.split())
        if word_count > 2000:
            content_info["content_complexity"] = "high"
        elif word_count < 500:
            content_info["content_complexity"] = "low"

        logger.info(f"Content type detection results: {content_info}")
        return content_info

    async def structure_transcript(
        self, raw_text: str, filename: str = None
    ) -> List[Dict[str, str]]:
        """
        Structure a raw interview transcript using LLM.

        Args:
            raw_text: Raw interview transcript text
            filename: Optional filename (not used for content type detection)

        Returns:
            List of structured transcript segments with speaker_id, role, and dialogue
        """
        if not raw_text or not raw_text.strip():
            logger.warning("Empty or whitespace-only transcript provided")
            return []

        try:
            # Get the prompt for transcript structuring
            prompt = TranscriptStructuringPrompts.get_prompt()

            # Log the length of the raw text
            logger.info(f"Structuring transcript with {len(raw_text)} characters")

            # Detect content type based on the actual content
            content_info = self._detect_content_type(raw_text)

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
                    "Detected timestamps in content. Adding special handling instructions."
                )
                prompt = (
                    prompt
                    + "\n\nNOTE: This transcript contains timestamps. Remember to exclude timestamps from the speaker_id and dialogue fields."
                )

            if content_info["content_complexity"] == "high":
                logger.info(
                    "Detected high complexity content. Adding special handling instructions."
                )
                prompt = (
                    prompt
                    + "\n\nNOTE: This is a complex transcript. Pay special attention to maintaining the correct sequence of dialogue and ensuring all speakers are consistently identified."
                )

            if content_info["is_multi_interview"]:
                logger.info(
                    f"Detected multi-interview file with {content_info['interview_count']} interviews. Adding special handling instructions."
                )
                prompt = (
                    prompt
                    + f"\n\nCRITICAL: This file contains {content_info['interview_count']} SEPARATE INTERVIEWS. Each interview has its own unique participants. "
                    + "You MUST create unique speaker_id values for each interview to avoid merging different people. "
                    + "For example, use 'Interviewee_1', 'Interviewee_2', 'Researcher_1', 'Researcher_2', etc. "
                    + "DO NOT use generic names like 'Interviewee' or 'Researcher' that would merge different people together. "
                    + "Each interview represents a different person with unique characteristics and responses."
                )

            # Create a response schema using the TranscriptSegment model
            # This helps Gemini understand the expected output structure
            response_schema = {
                "type": "array",
                "items": TranscriptSegment.model_json_schema(),
            }

            logger.info(
                f"Using response schema for transcript structuring: {response_schema}"
            )

            # Call LLM to structure the transcript with enhanced JSON configuration
            llm_response = await self.llm_service.analyze(
                {
                    "task": "transcript_structuring",
                    "text": raw_text,
                    "prompt": prompt,
                    "enforce_json": True,  # Crucial for Gemini to output JSON
                    "temperature": 0.0,  # For deterministic structuring
                    "response_mime_type": "application/json",  # Explicitly enforce JSON output
                    "response_schema": response_schema,  # Provide the schema for structured output
                    "content_info": content_info,  # Pass content info instead of relying on filename
                }
            )

            # Parse the LLM response
            structured_transcript = self._parse_llm_response(llm_response)

            # Check if the response indicates a timeout or API error
            if self._is_timeout_or_api_error(llm_response):
                logger.warning(
                    "LLM API timeout or error detected. Using manual extraction fallback."
                )
                structured_transcript = self._extract_transcript_manually(raw_text)

            # If problem-focused content and still no valid structure, try fallback method
            elif content_info["is_problem_focused"] and not structured_transcript:
                logger.warning(
                    "Problem-focused content failed to structure. Trying fallback method."
                )
                structured_transcript = self._extract_transcript_manually(raw_text)

            # Validate the structured transcript using Pydantic
            validated_segments = []
            for segment in structured_transcript:
                try:
                    # Validate each segment against the TranscriptSegment model
                    validated_segment = TranscriptSegment(**segment)
                    validated_segments.append(validated_segment.model_dump())
                except ValidationError as e:
                    logger.warning(f"Validation error for segment: {e}")
                    # Try to fix common issues
                    if "role" in segment and segment["role"] not in [
                        "Interviewer",
                        "Interviewee",
                        "Participant",
                    ]:
                        segment["role"] = "Participant"
                        try:
                            validated_segment = TranscriptSegment(**segment)
                            validated_segments.append(validated_segment.model_dump())
                            logger.info(f"Fixed invalid role in segment")
                        except ValidationError:
                            logger.warning(
                                f"Could not fix segment even after role correction"
                            )

            structured_transcript = validated_segments
            # Normalize roles consistently across the transcript (infer interviewer vs interviewee)
            try:
                structured_transcript = self._normalize_roles(structured_transcript)
            except Exception:
                logger.warning(
                    "Role normalization failed; continuing with original roles"
                )

            if structured_transcript:
                logger.info(
                    f"Successfully structured transcript with {len(structured_transcript)} segments"
                )
                # Log a sample of the structured transcript
                if structured_transcript:
                    logger.info(f"Sample segment: {structured_transcript[0]}")
            else:
                logger.warning("Failed to structure transcript - empty result")

            return structured_transcript

        except Exception as e:
            logger.error(f"Error structuring transcript: {str(e)}", exc_info=True)
            return []

    def _is_timeout_or_api_error(
        self, llm_response: Union[str, Dict[str, Any], List[Dict[str, Any]]]
    ) -> bool:
        """
        Check if the LLM response indicates a timeout or API error.

        Args:
            llm_response: The response from the LLM service

        Returns:
            True if the response indicates a timeout or API error
        """
        if not llm_response:
            return True

        # Check for error indicators in dict responses
        if isinstance(llm_response, dict):
            error_msg = llm_response.get("error", "")
            if error_msg and (
                "timeout" in error_msg.lower() or "api call" in error_msg.lower()
            ):
                return True

            # Check if segments are empty due to error
            segments = llm_response.get("segments", [])
            if (
                isinstance(segments, list)
                and len(segments) == 0
                and "error" in llm_response
            ):
                return True

        # Check for error indicators in string responses
        if isinstance(llm_response, str):
            error_indicators = [
                "api call timed out",
                "timeout error",
                "connection timeout",
                "request timeout",
                "api error",
            ]
            llm_response_lower = llm_response.lower()
            if any(indicator in llm_response_lower for indicator in error_indicators):
                return True

        return False

    def _parse_llm_response(
        self, llm_response: Union[str, Dict[str, Any], List[Dict[str, Any]]]
    ) -> List[Dict[str, str]]:
        """
        Parse the LLM response into a structured transcript.

        Args:
            llm_response: LLM response (string, dict, or list)

        Returns:
            List of structured transcript segments
        """
        logger.info(
            f"TranscriptStructuringService._parse_llm_response received type: {type(llm_response)}, content (first 500 chars): {str(llm_response)[:500]}"
        )

        structured_transcript = []

        if not llm_response:
            logger.error("LLM returned empty response for transcript structuring")
            return []

        try:
            # If llm_response is already a dict/list due to parsing in LLMService
            if isinstance(llm_response, (list, dict)):
                parsed_data = llm_response
            else:  # If it's a string, parse it
                parsed_data = json.loads(llm_response)

            # Try to validate the entire response as a StructuredTranscript
            if isinstance(parsed_data, dict) and "segments" in parsed_data:
                try:
                    # Validate against the StructuredTranscript model
                    validated_transcript = StructuredTranscript(**parsed_data)
                    logger.info(
                        f"Successfully validated response as StructuredTranscript with {len(validated_transcript.segments)} segments"
                    )
                    # Convert to list of dicts for consistency with the rest of the code
                    return [
                        segment.model_dump()
                        for segment in validated_transcript.segments
                    ]
                except ValidationError as e:
                    logger.warning(
                        f"Response matched StructuredTranscript schema but validation failed: {e}"
                    )
                    # Continue with regular parsing

            if isinstance(parsed_data, list):
                # Try to validate each item as a TranscriptSegment
                for item in parsed_data:
                    try:
                        if isinstance(item, dict):
                            # Validate against the TranscriptSegment model
                            validated_segment = TranscriptSegment(**item)
                            structured_transcript.append(validated_segment.model_dump())
                        else:
                            logger.warning(
                                f"Skipping non-dict item in structured transcript: {item}"
                            )
                    except ValidationError as e:
                        logger.warning(f"Validation error for segment: {e}")
                        # Try to fix common issues before skipping
                        if isinstance(item, dict):
                            if all(
                                k in item for k in ["speaker_id", "role", "dialogue"]
                            ):
                                # Fix role if it's invalid
                                if item["role"] not in [
                                    "Interviewer",
                                    "Interviewee",
                                    "Participant",
                                ]:
                                    item["role"] = "Participant"
                                    try:
                                        validated_segment = TranscriptSegment(**item)
                                        structured_transcript.append(
                                            validated_segment.model_dump()
                                        )
                                        logger.info(f"Fixed invalid role in segment")
                                    except ValidationError:
                                        logger.warning(
                                            f"Could not fix segment even after role correction"
                                        )
                            else:
                                logger.warning(
                                    f"Skipping malformed item in structured transcript: {item}"
                                )

                if (
                    not structured_transcript and parsed_data
                ):  # If all items were malformed but list wasn't empty
                    logger.error(
                        "LLM returned a list, but no items matched the expected structure"
                    )
                    # Try to repair the data if possible
                    structured_transcript = self._repair_transcript_data(parsed_data)
            else:
                logger.error(
                    f"LLM response for structuring was not a JSON list as expected. Type: {type(parsed_data)}"
                )
                # Handle cases where it might be a dict with a key containing the list
                if isinstance(parsed_data, dict):
                    # Check common wrapper keys
                    for key in [
                        "transcript",
                        "transcript_segments",
                        "segments",
                        "turns",
                        "dialogue",
                        "result",
                        "data",
                    ]:
                        if key in parsed_data and isinstance(parsed_data[key], list):
                            logger.info(f"Found transcript segments under '{key}' key")
                            # Try to validate each item as a TranscriptSegment
                            for item in parsed_data[key]:
                                try:
                                    if isinstance(item, dict):
                                        # Validate against the TranscriptSegment model
                                        validated_segment = TranscriptSegment(**item)
                                        structured_transcript.append(
                                            validated_segment.model_dump()
                                        )
                                    else:
                                        logger.warning(
                                            f"Skipping non-dict item in structured transcript: {item}"
                                        )
                                except ValidationError as e:
                                    logger.warning(
                                        f"Validation error for segment under '{key}': {e}"
                                    )
                                    # Try to fix common issues before skipping
                                    if isinstance(item, dict) and all(
                                        k in item
                                        for k in ["speaker_id", "role", "dialogue"]
                                    ):
                                        # Fix role if it's invalid
                                        if item["role"] not in [
                                            "Interviewer",
                                            "Interviewee",
                                            "Participant",
                                        ]:
                                            item["role"] = "Participant"
                                            try:
                                                validated_segment = TranscriptSegment(
                                                    **item
                                                )
                                                structured_transcript.append(
                                                    validated_segment.model_dump()
                                                )
                                                logger.info(
                                                    f"Fixed invalid role in segment under '{key}'"
                                                )
                                            except ValidationError:
                                                logger.warning(
                                                    f"Could not fix segment under '{key}' even after role correction"
                                                )
                            break

                    # If still empty, try to repair
                    if not structured_transcript:
                        logger.warning(
                            f"Could not find a list of segments under expected keys in the LLM response dictionary. "
                            f"Dict keys: {list(parsed_data.keys()) if isinstance(parsed_data, dict) else 'N/A'}. "
                            f"Dict content (first 500 chars): {str(parsed_data)[:500]}"
                        )
                        structured_transcript = self._repair_transcript_data(
                            parsed_data
                        )

        except json.JSONDecodeError as e:
            logger.error(
                f"Failed to decode JSON from LLM for transcript structuring: {e}"
            )
            logger.debug(f"LLM Raw Response for structuring: {llm_response[:500]}...")
            # Try to extract JSON from markdown code blocks or other formats
            structured_transcript = self._extract_json_from_text(llm_response)
        except Exception as e:
            logger.error(f"Unexpected error parsing LLM response for structuring: {e}")
            return []

        return structured_transcript

    def _repair_transcript_data(self, data: Any) -> List[Dict[str, str]]:
        """
        Attempt to repair malformed transcript data.

        Args:
            data: Malformed transcript data

        Returns:
            Repaired transcript data as a list of dicts
        """
        repaired_data = []

        try:
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        # Try to extract required fields with different possible keys
                        speaker_id = None
                        for key in ["speaker_id", "speaker", "name", "person", "user"]:
                            if key in item and item[key]:
                                speaker_id = str(item[key])
                                break

                        role = None
                        for key in ["role", "speaker_role", "type", "speaker_type"]:
                            if key in item and item[key]:
                                role = str(item[key])
                                break

                        dialogue = None
                        for key in ["dialogue", "text", "content", "message", "speech"]:
                            if key in item and item[key]:
                                dialogue = str(item[key])
                                break

                        if speaker_id and dialogue:  # Role can default if missing
                            if not role or role not in [
                                "Interviewer",
                                "Interviewee",
                                "Participant",
                            ]:
                                role = "Participant"

                            # Create a repaired segment
                            repaired_segment = {
                                "speaker_id": speaker_id,
                                "role": role,
                                "dialogue": dialogue,
                            }

                            # Validate the repaired segment
                            try:
                                validated_segment = TranscriptSegment(
                                    **repaired_segment
                                )
                                repaired_data.append(validated_segment.model_dump())
                                logger.info(
                                    f"Successfully repaired and validated segment for speaker: {speaker_id}"
                                )
                            except ValidationError as e:
                                logger.warning(
                                    f"Repaired segment failed validation: {e}"
                                )
                                # Add it anyway as a best effort
                                repaired_data.append(repaired_segment)
                                logger.info(
                                    f"Added non-validated repaired segment as best effort"
                                )
            elif isinstance(data, dict):
                # Check if this might be a StructuredTranscript with a different key
                for segments_key in ["segments", "transcript", "turns", "dialogue"]:
                    if segments_key in data and isinstance(data[segments_key], list):
                        # Try to validate as a StructuredTranscript
                        try:
                            # Create a proper structure
                            structured_data = {"segments": data[segments_key]}
                            if "metadata" in data and isinstance(
                                data["metadata"], dict
                            ):
                                structured_data["metadata"] = data["metadata"]

                            # Validate
                            validated_transcript = StructuredTranscript(
                                **structured_data
                            )
                            logger.info(
                                f"Successfully repaired and validated as StructuredTranscript with {len(validated_transcript.segments)} segments"
                            )
                            return [
                                segment.model_dump()
                                for segment in validated_transcript.segments
                            ]
                        except ValidationError:
                            # Try to repair the segments individually
                            logger.info(
                                f"Found segments under '{segments_key}' but validation failed. Trying to repair segments individually."
                            )
                            list_repair_result = self._repair_transcript_data(
                                data[segments_key]
                            )
                            if list_repair_result:
                                return list_repair_result

                # Try to extract a list of turns from the dict structure
                for key, value in data.items():
                    if isinstance(value, list) and len(value) > 0:
                        # Recursively try to repair this list
                        list_repair_result = self._repair_transcript_data(value)
                        if list_repair_result:
                            return list_repair_result

        except Exception as e:
            logger.error(f"Error repairing transcript data: {e}")

        return repaired_data

    def _extract_json_from_text(self, text: str) -> List[Dict[str, str]]:
        """
        Extract JSON from text that might contain markdown or other formatting.

        Args:
            text: Text that might contain JSON

        Returns:
            Extracted JSON as a list of dicts
        """
        import re

        # Try to extract JSON from markdown code blocks
        json_matches = re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        logger.debug(
            f"_extract_json_from_text: Found {len(json_matches)} markdown JSON blocks."
        )

        for i, json_str in enumerate(json_matches):
            logger.debug(
                f"_extract_json_from_text: Processing markdown block {i+1}/{len(json_matches)}."
            )
            try:
                data = json.loads(json_str)
                logger.debug(
                    f"_extract_json_from_text: MD block {i+1} initial parse success. Type: {type(data)}, Len: {len(data) if isinstance(data, (list,dict)) else 'N/A'}"
                )
                if isinstance(data, list) and len(data) > 0:
                    # Pass the already parsed Python object
                    result = self._parse_llm_response(data)
                    logger.debug(
                        f"_extract_json_from_text: Recursive _parse_llm_response for MD block {i+1} (initial) returned {len(result)} segments."
                    )
                    if result:
                        logger.info(
                            "Successfully extracted JSON from markdown code block"
                        )
                        return result
            except json.JSONDecodeError as e_initial:
                logger.debug(
                    f"_extract_json_from_text: MD block {i+1} initial parse failed: {e_initial}. Attempting repair."
                )
                try:
                    # Fix trailing commas in arrays and objects
                    fixed_json = re.sub(r",\s*([}\]])", r"\1", json_str)
                    # Fix missing quotes around property names
                    fixed_json = re.sub(
                        r"([{,]\s*)(\w+)(\s*:)", r'\1"\2"\3', fixed_json
                    )
                    # Fix single quotes used instead of double quotes
                    fixed_json = fixed_json.replace("'", '"')
                    # Add more specific logging for repair if needed, e.g. logger.debug(f"Repaired JSON string: {fixed_json[:300]}")

                    data = json.loads(fixed_json)
                    logger.debug(
                        f"_extract_json_from_text: MD block {i+1} repaired parse success. Type: {type(data)}, Len: {len(data) if isinstance(data, (list,dict)) else 'N/A'}"
                    )
                    if isinstance(data, list) and len(data) > 0:
                        # Pass the already parsed Python object
                        result = self._parse_llm_response(data)
                        logger.debug(
                            f"_extract_json_from_text: Recursive _parse_llm_response for MD block {i+1} (repaired) returned {len(result)} segments."
                        )
                        if result:
                            logger.info(
                                "Successfully extracted JSON from markdown code block after repair"
                            )
                            return result
                except Exception as e_repair:
                    logger.debug(
                        f"_extract_json_from_text: MD block {i+1} repair/parse failed: {e_repair}"
                    )
                    continue

        # Try to find JSON array directly
        logger.debug(
            "_extract_json_from_text: No valid JSON found in markdown blocks. Trying direct array match."
        )
        array_matches = re.findall(r"\[\s*{[\s\S]*}\s*\]", text)
        for json_str in array_matches:
            try:
                data = json.loads(json_str)
                if isinstance(data, list) and len(data) > 0:
                    # Validate and process
                    result = self._parse_llm_response(data)
                    if result:
                        logger.info(
                            "Successfully extracted JSON array directly from text"
                        )
                        return result
            except json.JSONDecodeError:
                # Try to repair common JSON syntax errors
                try:
                    # Fix trailing commas in arrays and objects
                    fixed_json = re.sub(r",\s*([}\]])", r"\1", json_str)
                    # Fix missing quotes around property names
                    fixed_json = re.sub(
                        r"([{,]\s*)(\w+)(\s*:)", r'\1"\2"\3', fixed_json
                    )
                    # Fix single quotes used instead of double quotes
                    fixed_json = fixed_json.replace("'", '"')

                    data = json.loads(fixed_json)
                    if isinstance(data, list) and len(data) > 0:
                        result = self._parse_llm_response(data)
                        if result:
                            logger.info(
                                "Successfully extracted JSON array directly from text after repair"
                            )
                            return result
                except Exception:
                    continue

        # Try to extract a JSON-like structure and convert it to proper JSON
        try:
            # Use simpler regex patterns to identify speaker turns
            # First try to find "speaker_id": "Name", "role": "Role", "dialogue": "Text" patterns
            speaker_pattern = re.compile(
                r'"(?:speaker_id|speaker|name)"\s*:\s*"([^"]+)"', re.IGNORECASE
            )
            role_pattern = re.compile(r'"(?:role|type)"\s*:\s*"([^"]+)"', re.IGNORECASE)
            dialogue_pattern = re.compile(
                r'"(?:dialogue|text|content)"\s*:\s*"([^"]+)"', re.IGNORECASE
            )

            # Find all matches
            speakers = speaker_pattern.findall(text)
            roles = role_pattern.findall(text)
            dialogues = dialogue_pattern.findall(text)

            # If we have at least speakers and dialogues, try to create structured data
            if speakers and dialogues and len(speakers) == len(dialogues):
                logger.info(
                    f"Found {len(speakers)} potential speaker turns using simple regex patterns"
                )
                structured_data = []

                # If roles list is shorter, pad it with "Participant"
                if len(roles) < len(speakers):
                    roles.extend(["Participant"] * (len(speakers) - len(roles)))

                for i in range(len(speakers)):
                    speaker = speakers[i]
                    dialogue = dialogues[i]
                    role = roles[i] if i < len(roles) else "Participant"

                    # Validate role
                    role = (
                        role
                        if role in ["Interviewer", "Interviewee", "Participant"]
                        else "Participant"
                    )

                    structured_data.append(
                        {
                            "speaker_id": speaker.strip(),
                            "role": role.strip(),
                            "dialogue": dialogue.strip(),
                        }
                    )

                if structured_data:
                    logger.info(
                        f"Created {len(structured_data)} structured transcript entries from regex extraction"
                    )
                    return structured_data

            # If the above approach fails, try a simpler pattern for "Speaker: Text" format
            simple_pattern = re.compile(r"([^:]+):\s*(.+?)(?=\n[^:]+:|$)", re.DOTALL)
            simple_matches = simple_pattern.findall(text)

            if simple_matches:
                logger.info(
                    f"Found {len(simple_matches)} potential speaker turns using simple Speaker: Text pattern"
                )
                structured_data = []

                for speaker, dialogue in simple_matches:
                    # Infer role based on simple heuristics
                    role = "Participant"
                    if "interview" in speaker.lower():
                        role = "Interviewer"

                    structured_data.append(
                        {
                            "speaker_id": speaker.strip(),
                            "role": role,
                            "dialogue": dialogue.strip(),
                        }
                    )

                if structured_data:
                    logger.info(
                        f"Created {len(structured_data)} structured transcript entries from simple pattern"
                    )
                    return structured_data

        except Exception as e:
            logger.error(f"Error extracting transcript structure with regex: {e}")

        # As a last resort, try to use a more lenient JSON parser
        try:
            import json5

            data = json5.loads(text)
            if isinstance(data, list) and len(data) > 0:
                result = self._parse_llm_response(data)
                if result:
                    logger.info(
                        "Successfully parsed text using json5 (lenient JSON parser)"
                    )
                    return result
        except ImportError:
            logger.warning("json5 package not available for lenient JSON parsing")
        except Exception as e:
            logger.error(f"Error parsing with json5: {e}")

        return []

    def _extract_transcript_manually(self, raw_text: str) -> List[Dict[str, str]]:
        """
        Manually extract transcript structure for problematic content.
        This is a fallback method for content that the LLM fails to structure properly.

        Args:
            raw_text: Raw interview transcript text

        Returns:
            List of structured transcript segments with speaker_id, role, and dialogue
        """
        logger.info("Attempting manual transcript extraction as fallback")
        structured_data = []

        try:
            # Detect if this is a transcript with a header section
            lines = raw_text.split("\n")
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

            # Check for "Transcript" marker which often indicates the start of actual content
            transcript_started = False
            filtered_lines = []
            for line in content_lines:
                if not transcript_started and line.strip() == "Transcript":
                    transcript_started = True
                    continue
                if transcript_started or not has_header:
                    filtered_lines.append(line)

            # Use filtered lines if transcript marker was found, otherwise use content_lines
            if transcript_started:
                content_text = "\n".join(filtered_lines)
            else:
                content_text = "\n".join(content_lines)

            # Try different regex patterns for speaker extraction
            # First try the standard "Name: Text" format
            pattern1 = re.compile(r"([^:]+):\s*(.+?)(?=\n[^:]+:|$)", re.DOTALL)
            matches1 = pattern1.findall(content_text)

            # Also try timestamp pattern "[00:00:00] Name: Text"
            pattern2 = re.compile(
                r"\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*([^:]+):\s*(.+?)(?=\n\[?\d{1,2}:\d{2}|$)",
                re.DOTALL,
            )
            matches2 = pattern2.findall(content_text)

            # Use the pattern that found more matches
            matches = matches1 if len(matches1) >= len(matches2) else matches2

            if not matches:
                # Try a more lenient pattern for dialogue without clear speaker markers
                pattern3 = re.compile(
                    r"([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?:\s*[-:])?\s*(.+?)(?=\n[A-Z][a-z]+(?:\s[A-Z][a-z]+)?(?:\s*[-:])?|$)",
                    re.DOTALL,
                )
                matches = pattern3.findall(content_text)

            if matches:
                logger.info(f"Manually extracted {len(matches)} speaker turns")

                # Analyze speakers to determine roles
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

                # Determine interviewer based on question frequency and shorter responses
                interviewer = None
                max_question_ratio = 0

                for speaker in speakers:
                    if speakers[speaker]["count"] > 0:
                        question_ratio = (
                            speakers[speaker]["question_marks"]
                            / speakers[speaker]["count"]
                        )
                        if question_ratio > max_question_ratio:
                            max_question_ratio = question_ratio
                            interviewer = speaker

                # If no clear interviewer found, use the speaker with shortest average responses
                if not interviewer:
                    min_length = float("inf")
                    for speaker in speakers:
                        if speakers[speaker]["avg_length"] < min_length:
                            min_length = speakers[speaker]["avg_length"]
                            interviewer = speaker

                logger.info(f"Identified '{interviewer}' as the likely interviewer")

                for speaker, dialogue in matches:
                    # Clean up speaker name and dialogue
                    speaker_id = speaker.strip()
                    # Remove timestamps if present
                    speaker_id = re.sub(
                        r"\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*", "", speaker_id
                    )
                    dialogue_text = dialogue.strip()

                    # Infer role based on speaker analysis
                    if speaker_id == interviewer:
                        role = "Interviewer"
                    else:
                        role = "Interviewee"

                    # Create a segment
                    segment_data = {
                        "speaker_id": speaker_id,
                        "role": role,
                        "dialogue": dialogue_text,
                    }

                    # Validate the segment
                    try:
                        validated_segment = TranscriptSegment(**segment_data)
                        structured_data.append(validated_segment.model_dump())
                        logger.debug(
                            f"Successfully validated manually extracted segment for speaker: {speaker_id}"
                        )
                    except ValidationError as e:
                        logger.warning(
                            f"Manually extracted segment failed validation: {e}"
                        )
                        # Add it anyway as a best effort
                        structured_data.append(segment_data)
                        logger.info(
                            f"Added non-validated manually extracted segment as best effort"
                        )

                logger.info(
                    f"Successfully created {len(structured_data)} structured transcript entries manually"
                )

                # Try to create a StructuredTranscript for validation
                try:
                    validated_transcript = StructuredTranscript(
                        segments=structured_data
                    )
                    logger.info(
                        f"Successfully validated manually extracted transcript with {len(validated_transcript.segments)} segments"
                    )

                    # We don't need to return this since we already have the structured_data list
                except ValidationError as e:
                    logger.warning(
                        f"Manually extracted transcript failed validation as a whole: {e}"
                    )
            else:
                logger.warning("Manual extraction failed to find any speaker turns")
        except Exception as e:
            logger.error(f"Error in manual transcript extraction: {e}")

        return structured_data

    def _normalize_roles(self, segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Infer a consistent interviewer vs interviewee role per speaker and normalize.
        - If any segments explicitly marked as Interviewer, prefer that speaker.
        - Else choose the speaker with highest question ratio as Interviewer; ties -> shortest avg length.
        - All other speakers become Interviewee. If only one speaker, mark as Interviewee.
        """
        try:
            if not segments:
                return segments
            # Gather per-speaker stats
            speakers: Dict[str, Dict[str, float]] = {}
            explicit_interviewer_counts: Dict[str, int] = {}
            for seg in segments:
                spk = str(seg.get("speaker_id") or seg.get("speaker") or "").strip()
                if not spk:
                    # Skip segments without a speaker id
                    continue
                txt = str(seg.get("dialogue") or seg.get("text") or "")
                role = str(seg.get("role") or "").strip()
                d = speakers.setdefault(
                    spk, {"count": 0, "avg_length": 0.0, "qmarks": 0}
                )
                d["count"] += 1
                d["avg_length"] += len(txt)
                d["qmarks"] += txt.count("?")
                if role.lower() == "interviewer":
                    explicit_interviewer_counts[spk] = (
                        explicit_interviewer_counts.get(spk, 0) + 1
                    )
            # Compute averages
            for spk, d in speakers.items():
                if d["count"] > 0:
                    d["avg_length"] = d["avg_length"] / d["count"]
            interviewer: Optional[str] = None
            # Prefer explicit interviewer labels
            if explicit_interviewer_counts:
                interviewer = max(
                    explicit_interviewer_counts.items(), key=lambda kv: kv[1]
                )[0]
            # Else choose by question ratio
            if not interviewer and speakers:
                best_spk = None
                best_ratio = -1.0
                for spk, d in speakers.items():
                    ratio = (d["qmarks"] / d["count"]) if d["count"] else 0.0
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_spk = spk
                interviewer = best_spk
            # If still none (unlikely), choose shortest avg length
            if not interviewer and speakers:
                interviewer = min(speakers.items(), key=lambda kv: kv[1]["avg_length"])[
                    0
                ]
            # Normalize roles on segments
            if len(speakers) <= 1:
                # Single-speaker transcript -> keep original roles
                return segments
            if interviewer:
                for seg in segments:
                    spk = str(seg.get("speaker_id") or seg.get("speaker") or "").strip()
                    if not spk:
                        continue
                    # Only override ambiguous/default roles; keep explicit non-ambiguous ones
                    current = str(seg.get("role") or "").strip().lower()
                    if current in {"", "participant", "unknown"}:
                        seg["role"] = (
                            "Interviewer" if spk == interviewer else "Interviewee"
                        )
            return segments
        except Exception:
            return segments
