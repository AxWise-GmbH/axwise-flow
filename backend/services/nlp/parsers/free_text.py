"""
Free text parsing utilities.

This module provides utilities for parsing free-text interview transcripts
to extract question-answer pairs.
"""

import logging
import re
from typing import Dict, List

logger = logging.getLogger(__name__)


class FreeTextParser:
    """Parser for free-text interview transcripts."""

    # Q/A format pattern (explicit Q: A: format)
    QA_PATTERN = re.compile(
        r"(?:^|\n)(?:Q|Question)[:.\s]+(.*?)(?:\n)(?:A|Answer)[:.\s]+(.*?)(?=(?:\n)(?:Q|Question)|$)",
        re.DOTALL,
    )

    # Question pattern (interrogative words)
    QUESTION_PATTERN = re.compile(
        r"(?:^|\n)((What|How|Why|When|Where|Who|Could you|Can you|Tell me about|Describe|Explain|In your opinion|Do you).*?\?)(.*?)(?=(?:^|\n)(?:What|How|Why|When|Where|Who|Could you|Can you|Tell me about|Describe|Explain|In your opinion|Do you).*?\?|$)",
        re.DOTALL | re.IGNORECASE,
    )

    # Enhanced simulation dialogue pattern
    DIALOGUE_PATTERN = re.compile(
        r"\[[\d:]+\]\s*Researcher:\s*(.*?)\n\n\[[\d:]+\]\s*Interviewee:\s*(.*?)(?=\n\n\[[\d:]+\]\s*Researcher:|\n\n=|$)",
        re.DOTALL,
    )

    def parse(self, text: str) -> List[Dict[str, str]]:
        """
        Parse free-text to extract question-answer pairs.

        Tries multiple strategies in order:
        1. Explicit Q/A format
        2. Implicit question patterns
        3. Enhanced simulation dialogue
        4. Paragraph-based splitting
        5. Single response fallback

        Args:
            text: The free-text interview transcript

        Returns:
            List of question-answer pair dictionaries
        """
        if not text or not text.strip():
            return []

        # Try explicit Q/A format
        qa_pairs = self._parse_explicit_qa(text)
        if qa_pairs:
            return qa_pairs

        # Try implicit question patterns
        qa_pairs = self._parse_implicit_questions(text)
        if qa_pairs:
            return qa_pairs

        # Try enhanced simulation format
        qa_pairs = self._parse_simulation_dialogue(text)
        if qa_pairs:
            return qa_pairs

        # Try paragraph-based splitting
        qa_pairs = self._parse_paragraphs(text)
        if qa_pairs:
            return qa_pairs

        # Fallback to single response
        logger.warning("Could not extract structured Q/A pairs. Treating as single response.")
        return [{"question": "Please describe your experience.", "answer": text.strip()}]

    def _parse_explicit_qa(self, text: str) -> List[Dict[str, str]]:
        """Parse explicit Q: A: format."""
        matches = self.QA_PATTERN.findall(text)
        if not matches:
            return []

        logger.info(f"Found {len(matches)} explicit Q/A pairs")
        return [{"question": q.strip(), "answer": a.strip()} for q, a in matches]

    def _parse_implicit_questions(self, text: str) -> List[Dict[str, str]]:
        """Parse implicit question patterns."""
        matches = self.QUESTION_PATTERN.findall(text)
        if not matches:
            return []

        logger.info(f"Extracted {len(matches)} implicit Q/A pairs")
        qa_pairs = []
        for full_question, _, answer_content in matches:
            question = full_question.strip()
            answer = answer_content.strip()
            if question and answer:
                qa_pairs.append({"question": question, "answer": answer})
        return qa_pairs

    def _parse_simulation_dialogue(self, text: str) -> List[Dict[str, str]]:
        """Parse enhanced simulation interview format."""
        if not ("INTERVIEW DIALOGUE" in text and "Researcher:" in text and "Interviewee:" in text):
            return []

        logger.info("Detected enhanced simulation interview format")
        matches = self.DIALOGUE_PATTERN.findall(text)
        qa_pairs = []
        for question, answer in matches:
            question = question.strip()
            answer = answer.strip()
            # Remove Key Insights sections
            answer = re.sub(r"\n\n\s*💡 Key Insights:.*$", "", answer, flags=re.DOTALL)
            if question and answer:
                qa_pairs.append({"question": question, "answer": answer})
        return qa_pairs

    def _parse_paragraphs(self, text: str) -> List[Dict[str, str]]:
        """Parse using paragraph-based alternation."""
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        if not paragraphs:
            return []

        # Check if first paragraph is intro
        is_intro = len(paragraphs[0].split()) > 50 or not any(
            w in paragraphs[0].lower() for w in ["?", "who", "what", "when", "where", "why", "how"]
        )

        qa_pairs = []
        start_idx = 1 if is_intro else 0
        for i in range(start_idx, len(paragraphs), 2):
            if i + 1 < len(paragraphs):
                qa_pairs.append({
                    "question": paragraphs[i].strip(),
                    "answer": paragraphs[i + 1].strip(),
                })
        return qa_pairs


# Module-level function for convenience
async def parse_free_text(text: str) -> List[Dict[str, str]]:
    """Parse free-text interview transcript."""
    parser = FreeTextParser()
    return parser.parse(text)

