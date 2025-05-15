"""
Test script for the evidence linking service.

This script demonstrates how the evidence linking service works with a sample transcript.
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
from backend.services.processing.evidence_linking_service import EvidenceLinkingService
from backend.services.processing.trait_formatting_service import TraitFormattingService
from backend.services.processing.attribute_extractor import AttributeExtractor
from backend.services.llm.gemini_service import GeminiService


async def main():
    """Run the test script."""
    logger.info("Starting evidence linking test")

    # Load sample transcript
    project_root = Path(__file__).parent.parent.parent
    sample_path = os.path.join(project_root, "sample-data", "interview_transcript.txt")
    with open(sample_path, "r") as f:
        sample_text = f.read()

    logger.info(f"Loaded sample transcript with {len(sample_text)} characters")

    # Create a sample attribute dictionary
    sample_attributes = {
        "name": "Product Designer",
        "description": "A product designer focused on user experience",
        "archetype": "Creative Problem-Solver",
        "demographics": {
            "value": "Experienced designer with focus on minimalist approach",
            "confidence": 0.8,
            "evidence": []
        },
        "goals_and_motivations": {
            "value": "Creating intuitive interfaces that solve real user problems",
            "confidence": 0.7,
            "evidence": []
        },
        "skills_and_expertise": {
            "value": "Proficient in design tools, user research, and prototyping",
            "confidence": 0.9,
            "evidence": []
        },
        "technology_and_tools": {
            "value": "Uses mobile apps and desktop tools for design work",
            "confidence": 0.8,
            "evidence": []
        }
    }

    # Initialize the LLM service
    # Note: This requires a valid API key in the environment
    llm_service = GeminiService()

    # Initialize our services
    evidence_linking_service = EvidenceLinkingService(llm_service)
    trait_formatting_service = TraitFormattingService(llm_service)
    attribute_extractor = AttributeExtractor(llm_service)

    # Test evidence linking
    logger.info("Testing evidence linking service")
    try:
        enhanced_attributes = await evidence_linking_service.link_evidence_to_attributes(
            sample_attributes, sample_text
        )
        
        logger.info("Evidence linking results:")
        for field, trait in enhanced_attributes.items():
            if isinstance(trait, dict) and "evidence" in trait:
                logger.info(f"{field}: {len(trait['evidence'])} pieces of evidence")
                for i, evidence in enumerate(trait["evidence"]):
                    logger.info(f"  Evidence {i+1}: {evidence[:100]}...")
    except Exception as e:
        logger.error(f"Error testing evidence linking: {str(e)}", exc_info=True)

    # Test trait formatting
    logger.info("\nTesting trait formatting service")
    try:
        formatted_attributes = await trait_formatting_service.format_trait_values(
            sample_attributes
        )
        
        logger.info("Trait formatting results:")
        for field, trait in formatted_attributes.items():
            if isinstance(trait, dict) and "value" in trait:
                logger.info(f"{field}: {trait['value']}")
    except Exception as e:
        logger.error(f"Error testing trait formatting: {str(e)}", exc_info=True)

    # Test attribute extraction with new services
    logger.info("\nTesting attribute extraction with new services")
    try:
        extracted_attributes = await attribute_extractor.extract_attributes_from_text(
            sample_text, "Interviewee"
        )
        
        logger.info("Attribute extraction results:")
        for field, trait in extracted_attributes.items():
            if isinstance(trait, dict) and "value" in trait:
                logger.info(f"{field}: {trait['value']}")
                if "evidence" in trait and trait["evidence"]:
                    logger.info(f"  Evidence: {trait['evidence'][0][:100]}...")
    except Exception as e:
        logger.error(f"Error testing attribute extraction: {str(e)}", exc_info=True)

    logger.info("Test completed")


if __name__ == "__main__":
    asyncio.run(main())
