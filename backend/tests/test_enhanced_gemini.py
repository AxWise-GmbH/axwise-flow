"""
Test script for the enhanced Gemini LLM service.
"""

import asyncio
import os
import logging
from typing import Dict, Any

from backend.services.llm import LLMServiceFactory
from backend.services.llm.enhanced_gemini_llm_service import EnhancedGeminiLLMService
from backend.services.llm.config.genai_config import TaskType

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_text_generation():
    """Test basic text generation."""
    try:
        # Create the enhanced Gemini service
        service = LLMServiceFactory.create("enhanced_gemini")
        
        # Verify it's the right type
        if not isinstance(service, EnhancedGeminiLLMService):
            logger.error(f"Wrong service type: {type(service)}")
            return False
        
        # Test text generation
        prompt = "Write a short poem about coding."
        result = await service.generate_text(prompt)
        
        logger.info(f"Text generation result: {result}")
        return len(result) > 0
    except Exception as e:
        logger.error(f"Error in text generation test: {str(e)}")
        return False

async def test_pattern_recognition():
    """Test pattern recognition."""
    try:
        # Create the enhanced Gemini service
        service = LLMServiceFactory.create("enhanced_gemini")
        
        # Test data
        interview_data = [{
            "text": """
            Interviewer: How do you approach designing a new user interface?
            Participant: I always start by understanding the user needs. I interview users, create personas, and map out user journeys. Then I sketch some initial ideas, get feedback from stakeholders, and iterate based on that feedback. I also like to test early prototypes with real users to see if my assumptions are correct.
            
            Interviewer: What tools do you use in your design process?
            Participant: I primarily use Figma for UI design. For wireframing, I sometimes use pen and paper or Balsamiq if I need to share with the team. For prototyping, I use Figma's prototyping features or sometimes Principle for more complex animations. I also use Miro for collaborative workshops and user journey mapping.
            
            Interviewer: How do you handle feedback on your designs?
            Participant: I try not to take feedback personally. I document all feedback in a structured way, categorizing it by source and priority. Then I evaluate each piece of feedback against the user needs and project goals. I'm not afraid to push back on feedback if I think it doesn't align with user needs, but I always explain my reasoning. I find that involving stakeholders early and often helps reduce major feedback issues later.
            """
        }]
        
        # Test pattern recognition
        result = await service.analyze_patterns(interview_data)
        
        # Check if patterns were generated
        patterns = result.get("patterns", [])
        logger.info(f"Generated {len(patterns)} patterns")
        if patterns:
            logger.info(f"First pattern: {patterns[0].get('name')}")
        
        return len(patterns) > 0
    except Exception as e:
        logger.error(f"Error in pattern recognition test: {str(e)}")
        return False

async def run_tests():
    """Run all tests."""
    text_result = await test_text_generation()
    pattern_result = await test_pattern_recognition()
    
    logger.info(f"Text generation test: {'PASSED' if text_result else 'FAILED'}")
    logger.info(f"Pattern recognition test: {'PASSED' if pattern_result else 'FAILED'}")
    
    return text_result and pattern_result

if __name__ == "__main__":
    result = asyncio.run(run_tests())
    exit(0 if result else 1)
