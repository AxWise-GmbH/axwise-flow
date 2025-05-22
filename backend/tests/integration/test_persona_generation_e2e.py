#!/usr/bin/env python
"""
Test script for direct text-to-persona generation functionality.
This script tests the persona generation in isolation to diagnose issues.
"""

import asyncio
import json
import logging
import os
import sys
from typing import Dict, Any, List

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Sample interview text for testing
SAMPLE_INTERVIEW = """
[09:04 AM] Interviewer: Haha, a makeover on demand – I like that! But, um, what pushed you guys to build something like this? Was it just a spur-of-the-moment idea or…?
[09:05 AM] Interviewee: (laughs) Oh, definitely not a spur-of-the-moment thing. We noticed users were kind of bored with the same old profiles, so we thought, "Hey, why not let people spice things up a bit?" It was all about boosting engagement and letting folks express themselves more.
[09:06 AM] Interviewer: That makes sense. So, um, how does the whole process work? Like, what happens when a user decides to change their profile?
[09:07 AM] Interviewee: It's pretty intuitive, actually. Users head over to a settings panel – and I'll admit, at first it can seem a little overwhelming with all the options. But once you get the hang of it, you select your themes, rearrange your widgets, and boom – the interface updates in real time. It's almost like magic… if magic were written in code!
[09:08 AM] Interviewer: (chuckles) Magic in code, I love that! Now, were there any, um, hiccups along the way? I bet there were some funny mishaps.
[09:09 AM] Interviewee: Oh, for sure. There were moments when nothing seemed to work. I remember one time, every time someone tried to change a theme, the profile would suddenly switch to Comic Sans. It was both hilarious and a total nightmare to debug!
[09:10 AM] Interviewer: Comic Sans? No way! That's like the design equivalent of a dad joke. How did you fix that?
[09:11 AM] Interviewee: We had to double down on testing – both automated and manual. We eventually tracked down the glitch in our code that was causing the fallback font issue. It took some late nights and, um, plenty of coffee.
"""


class PersonaSchema:
    """Schema definition for the LLM persona response."""

    name: str
    description: str
    role_context: str
    key_responsibilities: str
    tools_used: str
    collaboration_style: str
    analysis_approach: str
    pain_points: str


async def test_gemini_direct():
    """Test direct Gemini API connection for persona generation using client.aio pattern."""
    try:
        logger.info("Testing direct Gemini API connection for persona generation")

        # Load environment variables or config
        GEMINI_API_KEY=***REMOVED***"GEMINI_API_KEY")
        if not gemini_api_key:
            logger.error("GEMINI_API_KEY environment variable not set")
            return False

        # Import Gemini library
        try:
            import google.genai as genai
            from google.genai import types

            logger.info("Using google.genai package")
        except ImportError:
            logger.error(
                "google-genai package is not installed. Install with: pip install google-genai"
            )
            return False

        # Create Gemini client
        logger.info("Creating Gemini client")
        client = genai.Client(api_key=gemini_api_key)

        # Create system instruction
        system_instruction = """You are a persona generation assistant.
        Create detailed personas based on interview transcripts in JSON format."""

        # Create prompt for persona generation
        prompt = f"""
        Given this interview transcript, create a detailed persona profile for the main participant (interviewee).

        INTERVIEW TRANSCRIPT:
        {SAMPLE_INTERVIEW}

        Create a detailed persona with a descriptive role-based name, a brief summary of who this person is,
        their primary job role, their main tasks and responsibilities, tools they use, their collaboration style,
        how they approach problems, and their pain points or challenges.

        Format your response as a JSON object with the following structure:
        {{
          "name": "Descriptive Role-Based Name",
          "description": "Brief summary of who this person is",
          "role_context": "Their primary job role and context",
          "key_responsibilities": "Their main tasks and responsibilities",
          "tools_used": "Tools, technologies, or resources they use",
          "collaboration_style": "How they work with others",
          "analysis_approach": "How they approach problems or tasks",
          "pain_points": "Their challenges or difficulties"
        }}

        Return ONLY the JSON with no additional text, explanation, or markdown formatting.
        """

        # Generate response using client.aio.models.generate_content
        logger.info("Sending request to Gemini using client.aio.models.generate_content...")

        # Create a dictionary for the GenerateContentConfig fields
        config_fields = {
            "temperature": 0.0,
            "top_p": 0.95,
            "top_k": 1,
            "max_output_tokens": 65536,
            "response_mime_type": "application/json"
        }

        # Create Content objects with role="user" (Gemini API only accepts "user" and "model" roles)
        system_content = types.Content(parts=[{"text": "System instruction: " + system_instruction}], role="user")
        user_content = types.Content(parts=[{"text": prompt}], role="user")
        contents = [system_content, user_content]

        # Create safety settings
        safety_settings = [
            types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_NONE"),
            types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_NONE"),
        ]

        # Do NOT add safety settings to the config
        # Safety settings are not supported in GenerationConfig

        # Create the final GenerateContentConfig object
        # Remove automatic_function_calling as it's causing validation errors
        generation_config = types.GenerateContentConfig(**config_fields)

        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash-preview-04-17",
            contents=contents,
            config=generation_config
        )

        logger.info("Received response")
        # Print the response text for debugging
        logger.info(f"Response text: {response.text[:500]}...")

        # Try to parse the response as JSON
        try:
            response_json = json.loads(response.text)
            logger.info("Successfully parsed JSON response")
            logger.info(f"Generated Persona: {json.dumps(response_json, indent=2)}")
            return True
        except json.JSONDecodeError:
            logger.error("Failed to parse response as JSON")
            # Try to extract JSON from the text (in case it's wrapped in markdown or other text)
            try:
                import re

                logger.info("Attempting to extract JSON from code block")
                # Look for JSON code block with or without language specifier
                json_match = re.search(
                    r"```(?:json)?\s*(.*?)\s*```", response.text, re.DOTALL
                )
                if json_match:
                    json_text = json_match.group(1).strip()
                    logger.info(f"Extracted text from code block: {json_text[:100]}...")
                    response_json = json.loads(json_text)
                    logger.info("Successfully extracted JSON from code block")
                    logger.info(
                        f"Generated Persona: {json.dumps(response_json, indent=2)}"
                    )
                    return True
                else:
                    # Try a more lenient approach - look for anything that looks like JSON
                    logger.info(
                        "No code block found, trying to extract any JSON-like content"
                    )
                    # Look for a pattern that starts with { and ends with }
                    json_match = re.search(r"(\{.*\})", response.text, re.DOTALL)
                    if json_match:
                        json_text = json_match.group(1).strip()
                        logger.info(
                            f"Extracted potential JSON content: {json_text[:100]}..."
                        )
                        response_json = json.loads(json_text)
                        logger.info("Successfully extracted JSON from content")
                        logger.info(
                            f"Generated Persona: {json.dumps(response_json, indent=2)}"
                        )
                        return True
                    else:
                        logger.error("Could not find any JSON content in response")
                        return False
            except Exception as e:
                logger.error(f"Error extracting JSON: {str(e)}")
                return False

    except Exception as e:
        logger.error(f"Error in test_gemini_direct: {str(e)}")
        return False


async def test_gemini_service_direct():
    """Test persona generation directly through GeminiLLMService."""
    try:
        logger.info("Testing GeminiLLMService directly for persona generation")

        # Import necessary modules from the project
        from backend.services.llm.gemini_service import GeminiService

        # Create LLM service directly
        llm_config = {
            "api_key": os.getenv("GEMINI_API_KEY"),
            "model": "gemini-2.5-flash-preview-05-20",
        }

        llm_service = GeminiService(llm_config)

        # Test direct text-to-persona generation
        logger.info("Generating persona from text using GeminiService...")
        request = {
            "task": "persona_formation",
            "text": SAMPLE_INTERVIEW,
            "data": {"transcript": SAMPLE_INTERVIEW}
        }
        persona_attributes = await llm_service.analyze(request)

        # Check results
        if persona_attributes:
            logger.info(f"Successfully generated persona attributes")
            logger.info(f"Persona: {json.dumps(persona_attributes, indent=2)}")
            return True
        else:
            logger.error("No persona attributes generated")
            return False

    except Exception as e:
        logger.error(f"Error in test_gemini_service_direct: {str(e)}")
        logger.error("Traceback:", exc_info=True)
        return False


async def test_persona_formation_service():
    """Test persona generation through PersonaFormationService."""
    try:
        logger.info(
            "Testing PersonaFormationService for direct text-to-persona generation"
        )

        # Import necessary modules from the project
        from backend.services.processing.persona_formation_service import PersonaFormationService
        from backend.services.llm.gemini_service import GeminiService

        # Create LLM service directly
        llm_config = {
            "api_key": os.getenv("GEMINI_API_KEY"),
            "model": "gemini-2.5-flash-preview-05-20",
        }

        llm_service = GeminiService(llm_config)

        # Create PersonaFormationService
        persona_service = PersonaFormationService(None, llm_service)

        # Test direct text-to-persona generation
        logger.info("Generating persona from text...")
        personas = await persona_service.generate_persona_from_text(SAMPLE_INTERVIEW)

        # Check results
        if personas and len(personas) > 0:
            logger.info(f"Successfully generated {len(personas)} personas")
            logger.info(f"First persona: {json.dumps(personas[0], indent=2)}")
            return True
        else:
            logger.error("No personas generated")
            return False

    except Exception as e:
        logger.error(f"Error in test_persona_formation_service: {str(e)}")
        logger.error("Traceback:", exc_info=True)
        return False


async def main():
    """Main function to run tests."""
    logger.info("Starting persona generation tests")

    # Test direct Gemini API connection
    direct_result = await test_gemini_direct()
    if direct_result:
        logger.info("✅ Direct Gemini API test passed")
    else:
        logger.error("❌ Direct Gemini API test failed")

    # Test GeminiLLMService directly
    service_direct_result = await test_gemini_service_direct()
    if service_direct_result:
        logger.info("✅ GeminiService direct test passed")
    else:
        logger.error("❌ GeminiService direct test failed")

    # Test PersonaFormationService
    service_result = await test_persona_formation_service()
    if service_result:
        logger.info("✅ PersonaFormationService test passed")
    else:
        logger.error("❌ PersonaFormationService test failed")

    logger.info("All tests completed")


if __name__ == "__main__":
    asyncio.run(main())
