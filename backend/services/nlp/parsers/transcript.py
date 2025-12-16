"""
Transcript combination utilities.

This module provides utilities for combining transcript text from various formats
into a single string for processing.
"""

import logging
from typing import Dict, List, Union

logger = logging.getLogger(__name__)


def combine_transcript_text(transcript: Union[str, List, Dict, None]) -> str:
    """
    Combine transcript text from various formats into a single string.

    Handles multiple input formats:
    - String: Returns as-is
    - List of dicts with 'text' key
    - List of dicts with 'question'/'answer' keys
    - List of strings
    - Dict with 'text' key
    - Dict with 'question'/'answer' keys

    Args:
        transcript: Transcript data in various formats

    Returns:
        Combined text string
    """
    if not transcript:
        return ""

    texts = []

    if isinstance(transcript, str):
        return transcript
    elif isinstance(transcript, list):
        for item in transcript:
            if isinstance(item, dict):
                if "text" in item:
                    texts.append(item["text"])
                elif "question" in item and "answer" in item:
                    texts.append(f"Q: {item['question']}\nA: {item['answer']}")
            elif isinstance(item, str):
                texts.append(item)
    elif isinstance(transcript, dict):
        if "text" in transcript:
            texts.append(transcript["text"])
        elif "question" in transcript and "answer" in transcript:
            texts.append(f"Q: {transcript['question']}\nA: {transcript['answer']}")

    return "\n\n".join(filter(None, texts))

