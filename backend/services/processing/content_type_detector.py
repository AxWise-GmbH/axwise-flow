"""
Content type detector for transcript analysis.

This module provides functionality for detecting the type and characteristics
of transcript content, such as whether it's problem-focused, has timestamps,
or is already structured.
"""

import re
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class ContentTypeDetector:
    """
    Detector for transcript content types and characteristics.
    
    This class provides methods for analyzing transcript content to determine
    its type and characteristics, such as whether it's problem-focused, has
    timestamps, or is already structured.
    """
    
    # Problem indicators for detecting problem-focused content
    PROBLEM_INDICATORS = [
        "problem", "issue", "challenge", "difficulty", "pain point",
        "frustration", "struggle", "obstacle", "barrier", "limitation",
        "concern", "trouble", "hurdle", "complication", "drawback"
    ]
    
    # Timestamp patterns for detecting timestamps in content
    TIMESTAMP_PATTERNS = [
        r'\[\d{2}:\d{2}:\d{2}\]',  # [00:00:00]
        r'\[\d{2}:\d{2}\]',        # [00:00]
        r'\d{2}:\d{2}:\d{2}',      # 00:00:00
        r'\d{2}:\d{2} [AP]M'       # 00:00 AM/PM
    ]
    
    # Speaker patterns for detecting speaker labels
    SPEAKER_PATTERNS = [
        r'([A-Z][a-z]+):\s',       # Name:
        r'([A-Z][a-z]+ [A-Z][a-z]+):\s',  # First Last:
        r'(Interviewer|Interviewee|Participant|Moderator|User):\s'  # Role:
    ]
    
    @classmethod
    def detect(cls, raw_text: str) -> Dict[str, Any]:
        """
        Analyze the content to detect its type and characteristics.

        Args:
            raw_text: Raw interview transcript text

        Returns:
            Dictionary with content type information
        """
        if not raw_text or not isinstance(raw_text, str):
            logger.warning("Invalid input for content type detection")
            return cls._get_default_content_info()
            
        content_info = cls._get_default_content_info()
        
        # Check if this is a problem-focused interview
        content_info["is_problem_focused"] = cls._is_problem_focused(raw_text)
        
        # Check if the content has timestamps
        content_info["has_timestamps"] = cls._has_timestamps(raw_text)
        
        # Check if the content has speaker labels and estimate speakers
        speakers = cls._extract_speakers(raw_text)
        content_info["has_speaker_labels"] = len(speakers) > 0
        content_info["estimated_speakers"] = len(speakers)
        
        # Check if the content is already structured (e.g., JSON format)
        content_info["is_structured"] = cls._is_structured(raw_text)
        
        # Estimate content complexity
        content_info["content_complexity"] = cls._estimate_complexity(raw_text)
        
        logger.info(f"Content type detection results: {content_info}")
        return content_info
    
    @classmethod
    def _get_default_content_info(cls) -> Dict[str, Any]:
        """
        Get the default content info dictionary.
        
        Returns:
            Default content info dictionary
        """
        return {
            "is_problem_focused": False,
            "is_structured": False,
            "has_timestamps": False,
            "has_speaker_labels": False,
            "estimated_speakers": 0,
            "content_complexity": "medium"
        }
    
    @classmethod
    def _is_problem_focused(cls, text: str) -> bool:
        """
        Detect if the content is problem-focused.
        
        Args:
            text: Text to analyze
            
        Returns:
            True if the content is problem-focused, False otherwise
        """
        problem_count = sum(1 for indicator in cls.PROBLEM_INDICATORS if indicator in text.lower())
        
        # Consider it problem-focused if at least 2 problem indicators are found
        return problem_count >= 2
    
    @classmethod
    def _has_timestamps(cls, text: str) -> bool:
        """
        Detect if the content has timestamps.
        
        Args:
            text: Text to analyze
            
        Returns:
            True if the content has timestamps, False otherwise
        """
        for pattern in cls.TIMESTAMP_PATTERNS:
            if re.search(pattern, text):
                return True
        return False
    
    @classmethod
    def _extract_speakers(cls, text: str) -> set:
        """
        Extract speakers from the content.
        
        Args:
            text: Text to analyze
            
        Returns:
            Set of speaker names/identifiers
        """
        speakers = set()
        for pattern in cls.SPEAKER_PATTERNS:
            matches = re.findall(pattern, text)
            speakers.update(matches)
        return speakers
    
    @classmethod
    def _is_structured(cls, text: str) -> bool:
        """
        Detect if the content is already structured (e.g., JSON format).
        
        Args:
            text: Text to analyze
            
        Returns:
            True if the content is structured, False otherwise
        """
        text = text.strip()
        return (
            (text.startswith('{') and text.endswith('}')) or
            (text.startswith('[') and text.endswith(']'))
        )
    
    @classmethod
    def _estimate_complexity(cls, text: str) -> str:
        """
        Estimate the complexity of the content.
        
        Args:
            text: Text to analyze
            
        Returns:
            Complexity level: "low", "medium", or "high"
        """
        word_count = len(text.split())
        if word_count > 2000:
            return "high"
        elif word_count < 500:
            return "low"
        else:
            return "medium"
    
    @classmethod
    def detect_industry(cls, text: str) -> Optional[str]:
        """
        Attempt to detect the industry context from the content.
        
        Args:
            text: Text to analyze
            
        Returns:
            Detected industry or None if unable to determine
        """
        # This is a placeholder for future implementation
        # A more sophisticated implementation would use NLP techniques
        # or a dedicated LLM call to identify the industry
        return None
