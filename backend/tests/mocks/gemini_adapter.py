"""
Mock adapter for testing Gemini JSON parsing functionality.
This adapter simulates the JSON extraction functionality of the GeminiLLMService.
"""

import json
import re
import logging

logger = logging.getLogger(__name__)

class GeminiAdapter:
    """
    Mock adapter for testing Gemini JSON parsing functionality.
    """
    
    def __init__(self, config):
        """Initialize the adapter with configuration."""
        self.config = config
        logger.debug(f"Initialized GeminiAdapter with config: {config}")
    
    def _extract_json(self, text):
        """
        Extract JSON from text, handling various formats and edge cases.
        This is a simplified version of the extraction logic in GeminiLLMService.
        
        Args:
            text (str): Text that may contain JSON
            
        Returns:
            dict: Extracted JSON as a dictionary, or error information
        """
        if not text:
            logger.warning("Empty text provided to _extract_json")
            return {"error": "Empty response", "raw_response": text}
        
        # Try to find JSON in markdown code blocks
        json_block_pattern = r"```(?:json)?\s*([\s\S]*?)```"
        json_blocks = re.findall(json_block_pattern, text)
        
        if json_blocks:
            # Use the first JSON block found
            logger.debug(f"Found JSON block in markdown: {json_blocks[0][:100]}...")
            try:
                return json.loads(json_blocks[0])
            except json.JSONDecodeError as e:
                logger.warning(f"Error parsing JSON from markdown block: {e}")
                # Continue to try other methods
        
        # Try to extract JSON directly from the text
        try:
            # First, try to parse the entire text as JSON
            return json.loads(text)
        except json.JSONDecodeError:
            # If that fails, try to find JSON in the text
            json_pattern = r"{[\s\S]*}"
            json_match = re.search(json_pattern, text)
            
            if json_match:
                try:
                    return json.loads(json_match.group(0))
                except json.JSONDecodeError as e:
                    logger.warning(f"Error parsing JSON from text match: {e}")
            
            # If all attempts fail, return an error
            logger.error(f"Failed to extract JSON from text: {text[:100]}...")
            return {"error": "Failed to parse JSON", "raw_response": text}
