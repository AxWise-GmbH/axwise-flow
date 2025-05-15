"""
Test script for the adaptive tool recognition service.

This script demonstrates how the adaptive tool recognition service works with a sample transcript.
"""

import os
import sys
import asyncio
import json
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Import our services
from backend.services.processing.adaptive_tool_recognition_service import AdaptiveToolRecognitionService
from backend.services.llm.gemini_service import GeminiService


async def main():
    """Run the test script."""
    logger.info("Starting adaptive tool recognition test")

    # Create a sample text with tool mentions and transcription errors
    sample_text = """
    I've been working as a UX researcher for about 5 years now. I use a variety of tools in my work.
    
    For collaborative work, we use Mirrorboards a lot. It's great for brainstorming sessions.
    
    I also use Figma for creating wireframes and prototypes. Sometimes I'll use Sketch as well,
    but I've mostly transitioned to Figma.
    
    For user testing, I rely on UserTesting.com and sometimes Lookback. We also use SurveyMonkey
    for gathering quantitative data.
    
    Our team tracks work in Jira, and we use Confluence for documentation. For presentations,
    I typically use Google Slides or sometimes PowerPoint.
    
    In healthcare projects, I've used Epik for accessing patient data and Meditech for documentation.
    """

    logger.info(f"Created sample text with {len(sample_text)} characters")

    # Initialize the LLM service
    # Note: This requires a valid API key in the environment
    llm_service = GeminiService()

    # Initialize our service
    tool_recognition_service = AdaptiveToolRecognitionService(
        llm_service=llm_service,
        similarity_threshold=0.75,
        learning_enabled=True
    )

    # Test industry detection
    logger.info("\nTesting industry detection")
    try:
        industry_data = await tool_recognition_service.identify_industry(sample_text)
        logger.info(f"Detected industry: {industry_data.get('industry')} with confidence {industry_data.get('confidence')}")
        logger.info(f"Reasoning: {industry_data.get('reasoning')}")
    except Exception as e:
        logger.error(f"Error detecting industry: {str(e)}", exc_info=True)

    # Test tool identification
    logger.info("\nTesting tool identification")
    try:
        identified_tools = await tool_recognition_service.identify_tools_in_text(sample_text)
        
        logger.info(f"Identified {len(identified_tools)} tools:")
        for i, tool in enumerate(identified_tools):
            logger.info(f"  Tool {i+1}: {tool.get('tool_name')} (from '{tool.get('original_mention')}') - Confidence: {tool.get('confidence')}")
            if tool.get("is_misspelling"):
                logger.info(f"    Correction note: {tool.get('correction_note')}")
        
        # Format tools for persona
        formatted_tools = tool_recognition_service.format_tools_for_persona(identified_tools, "bullet")
        logger.info("\nFormatted tools for persona:")
        logger.info(formatted_tools)
    except Exception as e:
        logger.error(f"Error identifying tools: {str(e)}", exc_info=True)

    # Test learning from corrections
    logger.info("\nTesting learning from corrections")
    try:
        # Add a correction
        tool_recognition_service.learn_from_correction("Mirrorboards", "Miro", 0.95)
        
        # Test the correction
        identified_tools = await tool_recognition_service.identify_tools_in_text("We use Mirrorboards for collaboration")
        
        logger.info("Identified tools after learning correction:")
        for tool in identified_tools:
            logger.info(f"  {tool.get('tool_name')} (from '{tool.get('original_mention')}') - Confidence: {tool.get('confidence')}")
            if tool.get("correction_note"):
                logger.info(f"    Correction note: {tool.get('correction_note')}")
    except Exception as e:
        logger.error(f"Error testing learning: {str(e)}", exc_info=True)

    # Test with different industries
    logger.info("\nTesting with different industries")
    try:
        # Healthcare sample
        healthcare_sample = """
        As a clinical researcher, I use REDCap for data collection and SPSS for statistical analysis.
        We store patient records in Epic and use PowerChart for reviewing clinical data.
        For team collaboration, we use Microsoft Teams and SharePoint.
        """
        
        # Detect industry
        industry_data = await tool_recognition_service.identify_industry(healthcare_sample)
        logger.info(f"Detected industry: {industry_data.get('industry')} with confidence {industry_data.get('confidence')}")
        
        # Identify tools
        identified_tools = await tool_recognition_service.identify_tools_in_text(healthcare_sample)
        
        logger.info(f"Identified {len(identified_tools)} healthcare tools:")
        for tool in identified_tools:
            logger.info(f"  {tool.get('tool_name')} (from '{tool.get('original_mention')}') - Confidence: {tool.get('confidence')}")
    except Exception as e:
        logger.error(f"Error testing with different industries: {str(e)}", exc_info=True)

    logger.info("Test completed")


if __name__ == "__main__":
    asyncio.run(main())
