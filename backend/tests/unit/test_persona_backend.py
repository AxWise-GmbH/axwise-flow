#!/usr/bin/env python3
"""
Quick test to verify persona generation is working with the restarted backend.
"""

import asyncio
import logging
import os
import sys

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath("."))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_persona_generation():
    """Test persona generation with the restarted backend."""

    # Load test data
    with open("persona.txt", "r") as f:
        text = f.read()

    logger.info(f"Loaded persona.txt with {len(text)} characters")

    # Test the LLM service directly
    try:
        from backend.services.llm import LLMServiceFactory

        logger.info("Testing LLMServiceFactory.create('enhanced_gemini')...")

        # Create the enhanced gemini service
        llm_service = LLMServiceFactory.create("enhanced_gemini")
        logger.info(f"✅ Created LLM service: {llm_service.__class__.__name__}")

        # Test persona generation directly
        result = await llm_service.analyze(
            {
                "task": "persona_formation",
                "text": text,
                "enforce_json": True,
                "industry": "general",
            }
        )

        logger.info(f"✅ LLM service result keys: {list(result.keys())}")

        if "personas" in result and result["personas"]:
            logger.info(f"✅ Found {len(result['personas'])} personas")
            first_persona = result["personas"][0]
            logger.info(
                f"✅ First persona name: {first_persona.get('name', 'Unknown')}"
            )
            logger.info("🎉 PERSONA GENERATION IS WORKING!")
        else:
            logger.error("❌ No personas found in result")

    except Exception as e:
        logger.error(f"❌ Error testing LLM service: {str(e)}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_persona_generation())
