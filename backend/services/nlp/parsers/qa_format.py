"""
Q/A format parsing utilities.

This module provides utilities for parsing structured Q/A format transcripts.
"""

import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class QAFormatParser:
    """Parser for structured Q/A format transcripts."""

    def parse(self, data: Any) -> List[Dict[str, str]]:
        """
        Parse Q/A format data into a list of question-answer pairs.

        Handles multiple input formats:
        - List of dicts with 'question'/'answer' keys
        - List of dicts with 'q'/'a' keys
        - Dict with 'questions' and 'answers' lists
        - Dict with 'qa_pairs' list

        Args:
            data: Q/A format data

        Returns:
            List of question-answer pair dictionaries
        """
        if not data:
            return []

        if isinstance(data, list):
            return self._parse_list(data)
        elif isinstance(data, dict):
            return self._parse_dict(data)
        elif isinstance(data, str):
            return self._parse_string(data)

        logger.warning(f"Unsupported Q/A format type: {type(data)}")
        return []

    def _parse_list(self, data: List) -> List[Dict[str, str]]:
        """Parse list format Q/A data."""
        qa_pairs = []
        for item in data:
            if isinstance(item, dict):
                pair = self._extract_pair_from_dict(item)
                if pair:
                    qa_pairs.append(pair)
            elif isinstance(item, str):
                # Treat as answer with generic question
                qa_pairs.append({
                    "question": "Please describe your experience.",
                    "answer": item.strip(),
                })
        return qa_pairs

    def _parse_dict(self, data: Dict) -> List[Dict[str, str]]:
        """Parse dict format Q/A data."""
        # Check for qa_pairs key
        if "qa_pairs" in data:
            return self._parse_list(data["qa_pairs"])

        # Check for parallel questions/answers lists
        if "questions" in data and "answers" in data:
            questions = data["questions"]
            answers = data["answers"]
            return [
                {"question": q, "answer": a}
                for q, a in zip(questions, answers)
            ]

        # Check for single pair
        pair = self._extract_pair_from_dict(data)
        if pair:
            return [pair]

        return []

    def _parse_string(self, data: str) -> List[Dict[str, str]]:
        """Parse string format Q/A data."""
        # Try to parse as Q: A: format
        pattern = re.compile(
            r"(?:Q|Question)[:.\s]+(.*?)(?:\n)(?:A|Answer)[:.\s]+(.*?)(?=(?:\n)(?:Q|Question)|$)",
            re.DOTALL,
        )
        matches = pattern.findall(data)
        if matches:
            return [{"question": q.strip(), "answer": a.strip()} for q, a in matches]

        # Fallback to single response
        return [{"question": "Please describe your experience.", "answer": data.strip()}]

    def _extract_pair_from_dict(self, item: Dict) -> Optional[Dict[str, str]]:
        """Extract a Q/A pair from a dictionary."""
        question = None
        answer = None

        # Try different key variations
        for q_key in ["question", "q", "Q", "Question"]:
            if q_key in item:
                question = str(item[q_key]).strip()
                break

        for a_key in ["answer", "a", "A", "Answer", "response", "Response"]:
            if a_key in item:
                answer = str(item[a_key]).strip()
                break

        if question and answer:
            return {"question": question, "answer": answer}
        elif answer:
            return {"question": "Please describe your experience.", "answer": answer}

        return None

