#!/usr/bin/env python
"""
Test script for validating the AttributeExtractor in isolation.

This script initializes the AttributeExtractor with a Gemini LLM service
and tests it with sample speaker text from structured transcripts to validate
the attribute extraction process.

Usage:
    python backend/tests/manual/test_attribute_extractor.py

The script will process sample speaker text and display the extracted attributes
for manual verification.
"""

import os
import sys
import json
import asyncio
import logging
from typing import List, Dict, Any
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import the required modules
from backend.services.processing.attribute_extractor import AttributeExtractor
from backend.services.llm.gemini_service import GeminiService

def load_structured_transcripts():
    """Load structured transcripts from output files."""
    import os

    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts", "output")
    transcripts = []

    # List of structured transcript files to test
    transcript_files = [
        "structured_interview_transcript.json",
        "structured_fakeCallTeams.json",
        "structured_Interview __ Zuzanna - Vitalijs - 2025_03_21 12_59 CET - Transcript.json"
    ]

    for filename in transcript_files:
        file_path = os.path.join(output_dir, filename)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = json.load(f)
                transcripts.append({
                    "name": filename,
                    "content": content
                })
                logger.info(f"Loaded structured transcript from {filename}")
        except Exception as e:
            logger.error(f"Error loading structured transcript from {filename}: {str(e)}")

    return transcripts

def extract_speaker_text(structured_transcript: List[Dict[str, Any]], role: str = None) -> Dict[str, Any]:
    """
    Extract text for each speaker from a structured transcript.

    Args:
        structured_transcript: Structured transcript
        role: Optional role to filter by (e.g., "Interviewer", "Interviewee")

    Returns:
        Dictionary mapping speaker_id to their consolidated text
    """
    speaker_text = {}
    speaker_roles = {}

    for segment in structured_transcript:
        speaker_id = segment["speaker_id"]
        dialogue = segment["dialogue"]
        speaker_role = segment["role"]

        # Skip if we're filtering by role and this doesn't match
        if role and speaker_role != role:
            continue

        # Initialize if this is the first time seeing this speaker
        if speaker_id not in speaker_text:
            speaker_text[speaker_id] = ""
            speaker_roles[speaker_id] = speaker_role

        # Add this dialogue to the speaker's text
        speaker_text[speaker_id] += dialogue + "\n\n"

    # Create a result with both text and role
    result = {}
    for speaker_id, text in speaker_text.items():
        result[speaker_id] = {
            "text": text.strip(),
            "role": speaker_roles[speaker_id]
        }

    return result

async def test_attribute_extractor():
    """Test the AttributeExtractor with sample speaker text."""
    # Load environment variables
    load_dotenv()

    # Initialize the LLM service
    llm_service = GeminiService({"temperature": 0.0})

    # Initialize the AttributeExtractor
    attribute_extractor = AttributeExtractor(llm_service)

    # Load structured transcripts
    structured_transcripts = load_structured_transcripts()

    # Process each structured transcript
    for transcript_data in structured_transcripts:
        transcript_name = transcript_data["name"]
        structured_transcript = transcript_data["content"]

        logger.info(f"\n\n{'='*80}\nProcessing Structured Transcript: {transcript_name}\n{'='*80}")

        # Extract text for each speaker
        speaker_text = extract_speaker_text(structured_transcript)

        # Process one speaker from each transcript
        # Choose the first speaker with the "Interviewee" role
        interviewee_speaker = None
        for speaker_id, data in speaker_text.items():
            if data["role"] == "Interviewee":
                interviewee_speaker = speaker_id
                break

        if not interviewee_speaker:
            logger.warning(f"No interviewee found in {transcript_name}")
            continue

        logger.info(f"Processing speaker: {interviewee_speaker} (Role: {speaker_text[interviewee_speaker]['role']})")

        # Log a sample of the speaker text
        sample_text = speaker_text[interviewee_speaker]["text"][:500] + "..." if len(speaker_text[interviewee_speaker]["text"]) > 500 else speaker_text[interviewee_speaker]["text"]
        logger.info(f"Speaker text sample:\n{sample_text}\n")

        try:
            # Extract attributes for this speaker
            attributes = await attribute_extractor.extract_attributes_from_text(
                speaker_text[interviewee_speaker]["text"],
                speaker_text[interviewee_speaker]["role"]
            )

            # Save the attributes to a file for easier analysis
            output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "scripts", "output")
            os.makedirs(output_dir, exist_ok=True)

            output_file = os.path.join(output_dir, f"attributes_{os.path.splitext(transcript_name)[0]}.json")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(attributes, f, indent=2)

            logger.info(f"Saved attributes to {output_file}")

            # Display a summary of the attributes
            logger.info(f"\nAttribute Summary:")

            # Check if we got a valid attributes dictionary
            if not attributes or not isinstance(attributes, dict):
                logger.error(f"Invalid attributes returned: {attributes}")
                continue

            # Log basic attributes
            basic_attrs = ["name", "description", "archetype"]
            for attr in basic_attrs:
                if attr in attributes:
                    logger.info(f"- {attr}: {attributes[attr]}")

            # Log trait attributes with their confidence
            trait_attrs = [
                "demographics", "goals_and_motivations", "skills_and_expertise",
                "workflow_and_environment", "challenges_and_frustrations",
                "needs_and_desires", "technology_and_tools",
                "attitude_towards_research", "attitude_towards_ai", "key_quotes"
            ]

            logger.info(f"\nTrait Attributes:")
            for attr in trait_attrs:
                if attr in attributes and isinstance(attributes[attr], dict):
                    trait = attributes[attr]
                    value = trait.get("value", "N/A")
                    confidence = trait.get("confidence", 0.0)
                    evidence_count = len(trait.get("evidence", []))

                    # Truncate long values
                    if isinstance(value, str) and len(value) > 100:
                        value = value[:100] + "..."

                    logger.info(f"- {attr}: {value}")
                    logger.info(f"  Confidence: {confidence:.2f}, Evidence: {evidence_count} items")

                    # Log a sample of evidence if available
                    if "evidence" in trait and trait["evidence"]:
                        sample_evidence = trait["evidence"][0] if trait["evidence"] else "N/A"
                        if isinstance(sample_evidence, str) and len(sample_evidence) > 100:
                            sample_evidence = sample_evidence[:100] + "..."
                        logger.info(f"  Sample evidence: {sample_evidence}")

            # Overall quality assessment
            logger.info(f"\nAttribute Quality Check:")
            logger.info(f"- Attributes extracted: {len(attributes)}")
            logger.info(f"- Trait attributes: {sum(1 for attr in trait_attrs if attr in attributes)}/{len(trait_attrs)}")

        except Exception as e:
            logger.error(f"Error processing speaker {interviewee_speaker}: {str(e)}", exc_info=True)

if __name__ == "__main__":
    asyncio.run(test_attribute_extractor())
