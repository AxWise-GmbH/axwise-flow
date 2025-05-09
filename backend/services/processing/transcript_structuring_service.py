"""
Transcript structuring service for processing raw interview transcripts.

This service uses an LLM to convert raw interview transcripts into a structured
JSON format with speaker identification and role inference.
"""

import json
import logging
from typing import Dict, Any, List, Optional, Union

from domain.interfaces.llm_service import ILLMService
from backend.services.llm.prompts.tasks.transcript_structuring import TranscriptStructuringPrompts

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

    async def structure_transcript(self, raw_text: str) -> List[Dict[str, str]]:
        """
        Structure a raw interview transcript using LLM.

        Args:
            raw_text: Raw interview transcript text

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

            # Call LLM to structure the transcript
            llm_response = await self.llm_service.analyze({
                "task": "transcript_structuring",
                "text": raw_text,
                "prompt": prompt,
                "enforce_json": True,  # Crucial for Gemini to output JSON
                "temperature": 0.0  # For deterministic structuring
            })

            # Parse the LLM response
            structured_transcript = self._parse_llm_response(llm_response)

            if structured_transcript:
                logger.info(f"Successfully structured transcript with {len(structured_transcript)} segments")
                # Log a sample of the structured transcript
                if structured_transcript:
                    logger.info(f"Sample segment: {structured_transcript[0]}")
            else:
                logger.warning("Failed to structure transcript - empty result")

            return structured_transcript

        except Exception as e:
            logger.error(f"Error structuring transcript: {str(e)}", exc_info=True)
            return []

    def _parse_llm_response(self, llm_response: Union[str, Dict[str, Any], List[Dict[str, Any]]]) -> List[Dict[str, str]]:
        logger.info(f"TranscriptStructuringService._parse_llm_response received type: {type(llm_response)}, content (first 500 chars): {str(llm_response)[:500]}")
        """
        Parse the LLM response into a structured transcript.

        Args:
            llm_response: LLM response (string, dict, or list)

        Returns:
            List of structured transcript segments
        """
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

            if isinstance(parsed_data, list):
                # Validate basic structure of each item
                for item in parsed_data:
                    if isinstance(item, dict) and \
                       all(k in item for k in ["speaker_id", "role", "dialogue"]) and \
                       all(isinstance(item[k], str) for k in ["speaker_id", "role", "dialogue"]):
                        # Validate role value
                        if item["role"] not in ["Interviewer", "Interviewee", "Participant"]:
                            logger.warning(f"Invalid role '{item['role']}' in transcript segment, defaulting to 'Participant'")
                            item["role"] = "Participant"
                        structured_transcript.append(item)
                    else:
                        logger.warning(f"Skipping malformed item in structured transcript: {item}")

                if not structured_transcript and parsed_data:  # If all items were malformed but list wasn't empty
                    logger.error("LLM returned a list, but no items matched the expected structure")
                    # Try to repair the data if possible
                    structured_transcript = self._repair_transcript_data(parsed_data)
            else:
                logger.error(f"LLM response for structuring was not a JSON list as expected. Type: {type(parsed_data)}")
                # Handle cases where it might be a dict with a key containing the list
                if isinstance(parsed_data, dict):
                    # Check common wrapper keys
                    for key in ["transcript", "transcript_segments", "segments", "turns", "dialogue", "result", "data"]:
                        if key in parsed_data and isinstance(parsed_data[key], list):
                            logger.info(f"Found transcript segments under '{key}' key")
                            # Validate and process items
                            for item in parsed_data[key]:
                                if isinstance(item, dict) and \
                                   all(k in item for k in ["speaker_id", "role", "dialogue"]) and \
                                   all(isinstance(item[k], str) for k in ["speaker_id", "role", "dialogue"]):
                                    # Validate role value
                                    if item["role"] not in ["Interviewer", "Interviewee", "Participant"]:
                                        item["role"] = "Participant"
                                    structured_transcript.append(item)
                            break

                    # If still empty, try to repair
                    if not structured_transcript:
                        logger.warning(
                            f"Could not find a list of segments under expected keys in the LLM response dictionary. "
                            f"Dict keys: {list(parsed_data.keys()) if isinstance(parsed_data, dict) else 'N/A'}. "
                            f"Dict content (first 500 chars): {str(parsed_data)[:500]}"
                        )
                        structured_transcript = self._repair_transcript_data(parsed_data)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to decode JSON from LLM for transcript structuring: {e}")
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
                            if not role or role not in ["Interviewer", "Interviewee", "Participant"]:
                                role = "Participant"

                            repaired_data.append({
                                "speaker_id": speaker_id,
                                "role": role,
                                "dialogue": dialogue
                            })
            elif isinstance(data, dict):
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
        json_matches = re.findall(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        logger.debug(f"_extract_json_from_text: Found {len(json_matches)} markdown JSON blocks.")

        for i, json_str in enumerate(json_matches):
            logger.debug(f"_extract_json_from_text: Processing markdown block {i+1}/{len(json_matches)}.")
            try:
                data = json.loads(json_str)
                logger.debug(f"_extract_json_from_text: MD block {i+1} initial parse success. Type: {type(data)}, Len: {len(data) if isinstance(data, (list,dict)) else 'N/A'}")
                if isinstance(data, list) and len(data) > 0:
                    # Pass the already parsed Python object
                    result = self._parse_llm_response(data) 
                    logger.debug(f"_extract_json_from_text: Recursive _parse_llm_response for MD block {i+1} (initial) returned {len(result)} segments.")
                    if result:
                        logger.info("Successfully extracted JSON from markdown code block")
                        return result
            except json.JSONDecodeError as e_initial:
                logger.debug(f"_extract_json_from_text: MD block {i+1} initial parse failed: {e_initial}. Attempting repair.")
                try:
                    # Fix trailing commas in arrays and objects
                    fixed_json = re.sub(r',\s*([}\]])', r'\1', json_str)
                    # Fix missing quotes around property names
                    fixed_json = re.sub(r'([{,]\s*)(\w+)(\s*:)', r'\1"\2"\3', fixed_json)
                    # Fix single quotes used instead of double quotes
                    fixed_json = fixed_json.replace("'", '"')
                    # Add more specific logging for repair if needed, e.g. logger.debug(f"Repaired JSON string: {fixed_json[:300]}")

                    data = json.loads(fixed_json)
                    logger.debug(f"_extract_json_from_text: MD block {i+1} repaired parse success. Type: {type(data)}, Len: {len(data) if isinstance(data, (list,dict)) else 'N/A'}")
                    if isinstance(data, list) and len(data) > 0:
                        # Pass the already parsed Python object
                        result = self._parse_llm_response(data) 
                        logger.debug(f"_extract_json_from_text: Recursive _parse_llm_response for MD block {i+1} (repaired) returned {len(result)} segments.")
                        if result:
                            logger.info("Successfully extracted JSON from markdown code block after repair")
                            return result
                except Exception as e_repair:
                    logger.debug(f"_extract_json_from_text: MD block {i+1} repair/parse failed: {e_repair}")
                    continue

        # Try to find JSON array directly
        logger.debug("_extract_json_from_text: No valid JSON found in markdown blocks. Trying direct array match.")
        array_matches = re.findall(r'\[\s*{[\s\S]*}\s*\]', text)
        for json_str in array_matches:
            try:
                data = json.loads(json_str)
                if isinstance(data, list) and len(data) > 0:
                    # Validate and process
                    result = self._parse_llm_response(data)
                    if result:
                        logger.info("Successfully extracted JSON array directly from text")
                        return result
            except json.JSONDecodeError:
                # Try to repair common JSON syntax errors
                try:
                    # Fix trailing commas in arrays and objects
                    fixed_json = re.sub(r',\s*([}\]])', r'\1', json_str)
                    # Fix missing quotes around property names
                    fixed_json = re.sub(r'([{,]\s*)(\w+)(\s*:)', r'\1"\2"\3', fixed_json)
                    # Fix single quotes used instead of double quotes
                    fixed_json = fixed_json.replace("'", '"')

                    data = json.loads(fixed_json)
                    if isinstance(data, list) and len(data) > 0:
                        result = self._parse_llm_response(data)
                        if result:
                            logger.info("Successfully extracted JSON array directly from text after repair")
                            return result
                except Exception:
                    continue

        # Try to extract a JSON-like structure and convert it to proper JSON
        try:
            # Use simpler regex patterns to identify speaker turns
            # First try to find "speaker_id": "Name", "role": "Role", "dialogue": "Text" patterns
            speaker_pattern = re.compile(r'"(?:speaker_id|speaker|name)"\s*:\s*"([^"]+)"', re.IGNORECASE)
            role_pattern = re.compile(r'"(?:role|type)"\s*:\s*"([^"]+)"', re.IGNORECASE)
            dialogue_pattern = re.compile(r'"(?:dialogue|text|content)"\s*:\s*"([^"]+)"', re.IGNORECASE)

            # Find all matches
            speakers = speaker_pattern.findall(text)
            roles = role_pattern.findall(text)
            dialogues = dialogue_pattern.findall(text)

            # If we have at least speakers and dialogues, try to create structured data
            if speakers and dialogues and len(speakers) == len(dialogues):
                logger.info(f"Found {len(speakers)} potential speaker turns using simple regex patterns")
                structured_data = []

                # If roles list is shorter, pad it with "Participant"
                if len(roles) < len(speakers):
                    roles.extend(["Participant"] * (len(speakers) - len(roles)))

                for i in range(len(speakers)):
                    speaker = speakers[i]
                    dialogue = dialogues[i]
                    role = roles[i] if i < len(roles) else "Participant"

                    # Validate role
                    role = role if role in ["Interviewer", "Interviewee", "Participant"] else "Participant"

                    structured_data.append({
                        "speaker_id": speaker.strip(),
                        "role": role.strip(),
                        "dialogue": dialogue.strip()
                    })

                if structured_data:
                    logger.info(f"Created {len(structured_data)} structured transcript entries from regex extraction")
                    return structured_data

            # If the above approach fails, try a simpler pattern for "Speaker: Text" format
            simple_pattern = re.compile(r'([^:]+):\s*(.+?)(?=\n[^:]+:|$)', re.DOTALL)
            simple_matches = simple_pattern.findall(text)

            if simple_matches:
                logger.info(f"Found {len(simple_matches)} potential speaker turns using simple Speaker: Text pattern")
                structured_data = []

                for speaker, dialogue in simple_matches:
                    # Infer role based on simple heuristics
                    role = "Participant"
                    if "interview" in speaker.lower():
                        role = "Interviewer"

                    structured_data.append({
                        "speaker_id": speaker.strip(),
                        "role": role,
                        "dialogue": dialogue.strip()
                    })

                if structured_data:
                    logger.info(f"Created {len(structured_data)} structured transcript entries from simple pattern")
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
                    logger.info("Successfully parsed text using json5 (lenient JSON parser)")
                    return result
        except ImportError:
            logger.warning("json5 package not available for lenient JSON parsing")
        except Exception as e:
            logger.error(f"Error parsing with json5: {e}")

        return []
