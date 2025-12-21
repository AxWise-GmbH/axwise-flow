"""
Data extraction module for NLP processing.

Provides text parsing and extraction utilities for interview data.
"""

import logging
import re
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def combine_transcript_text(transcript: Any) -> str:
    """
    Combine transcript text from various formats into a single string.

    Args:
        transcript: Transcript data in various formats (str, list, dict)

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


async def parse_free_text(text: str) -> List[Dict[str, str]]:
    """
    Parse free-text interview transcripts to extract question-answer pairs.

    This method attempts to identify question-answer patterns in free text using
    common patterns like "Q:", "A:", or standard interview question formats.

    Args:
        text: The free-text interview transcript

    Returns:
        List of extracted question-answer pairs
    """
    logger.info("Parsing free-text format input")

    # Check if the text already uses Q/A format
    qa_pattern = re.compile(
        r"(?:^|\n)(?:Q|Question)[:.\s]+(.*?)(?:\n)(?:A|Answer)[:.\s]+(.*?)(?=(?:\n)(?:Q|Question)|$)",
        re.DOTALL,
    )
    qa_matches = qa_pattern.findall(text)

    if qa_matches:
        logger.info(f"Found {len(qa_matches)} explicit Q/A pairs in the text")
        qa_pairs = []
        for q, a in qa_matches:
            qa_pairs.append({"question": q.strip(), "answer": a.strip()})
        return qa_pairs

    # If no explicit Q/A format, try to identify question-answer patterns
    # Common patterns: questions end with ? and often start with interrogative words
    question_pattern = re.compile(
        r"(?:^|\n)((What|How|Why|When|Where|Who|Could you|Can you|Tell me about|Describe|Explain|In your opinion|Do you).*?\?)(.*?)(?=(?:^|\n)(?:What|How|Why|When|Where|Who|Could you|Can you|Tell me about|Describe|Explain|In your opinion|Do you).*?\?|$)",
        re.DOTALL | re.IGNORECASE,
    )
    qa_matches = question_pattern.findall(text)

    if qa_matches:
        logger.info(
            f"Extracted {len(qa_matches)} implicit Q/A pairs using question patterns"
        )
        logger.debug(f"🔍 qa_matches sample: {qa_matches[:2]}")
        qa_pairs = []

        # The regex pattern captures (full_question, question_start, answer_content)
        for full_question, _question_start, answer_content in qa_matches:
            question = full_question.strip()
            answer = answer_content.strip()
            if question and answer:
                qa_pairs.append({"question": question, "answer": answer})
                logger.debug(
                    f"✅ Extracted Q&A: {question[:50]}... -> {answer[:50]}..."
                )

        logger.info(
            f"🎯 Successfully created {len(qa_pairs)} Q/A pairs from implicit patterns"
        )
        return qa_pairs

    # Check for timestamp-based interview format
    qa_pairs = _parse_timestamp_format(text)
    if qa_pairs:
        return qa_pairs

    # If still no patterns found, split by paragraphs
    qa_pairs = _parse_paragraph_format(text)
    if qa_pairs:
        return qa_pairs

    # Check for enhanced simulation format with interview dialogue
    qa_pairs = _parse_enhanced_simulation_format(text)
    if qa_pairs:
        return qa_pairs

    # Last resort: treat the entire text as a single answer
    logger.warning(
        "Could not extract structured Q/A pairs. Treating as single response."
    )
    return [
        {
            "question": "Please share your thoughts and opinions on the topic:",
            "answer": text.strip(),
        }
    ]


def _parse_timestamp_format(text: str) -> List[Dict[str, str]]:
    """
    Parse timestamp-based interview format.

    Handles formats like [09:10] Interviewer: ... [09:12] Interviewee: ...

    Args:
        text: The interview text

    Returns:
        List of Q/A pairs or empty list if format not detected
    """
    if not (re.search(r"\[\d+:\d+\]", text) and "Interviewee:" in text):
        return []

    logger.info("Detected timestamp-based interview format")
    qa_pairs = []

    # More flexible pattern for Interviewer/Researcher and Interviewee dialogue
    timestamp_dialogue_pattern = re.compile(
        r"\[[\d:]+(?:\s*(?:AM|PM))?\]\s*(?:Interviewer|Researcher):\s*(.*?)\n+\[[\d:]+(?:\s*(?:AM|PM))?\]\s*Interviewee:\s*(.*?)(?=\n+\[[\d:]+(?:\s*(?:AM|PM))?\]\s*(?:Interviewer|Researcher):|\Z)",
        re.DOTALL | re.IGNORECASE,
    )
    dialogue_matches = timestamp_dialogue_pattern.findall(text)

    if dialogue_matches:
        for question, answer in dialogue_matches:
            question = question.strip()
            answer = answer.strip()
            answer = re.sub(r"\n\n\s*💡 Key Insights:.*$", "", answer, flags=re.DOTALL)
            if question and answer:
                qa_pairs.append({"question": question, "answer": answer})

        if qa_pairs:
            logger.info(f"🎯 Extracted {len(qa_pairs)} Q/A pairs from timestamp format")
            return qa_pairs

    # Fallback: extract just interviewee responses if no interviewer found
    interviewee_pattern = re.compile(
        r"\[[\d:]+(?:\s*(?:AM|PM))?\]\s*Interviewee:\s*(.*?)(?=\n+\[[\d:]+(?:\s*(?:AM|PM))?\]\s*(?:Interviewee|Interviewer|Researcher):|\Z)",
        re.DOTALL | re.IGNORECASE,
    )
    interviewee_matches = interviewee_pattern.findall(text)

    if interviewee_matches:
        logger.info(f"🎯 Extracted {len(interviewee_matches)} interviewee responses")
        for i, answer in enumerate(interviewee_matches):
            answer = answer.strip()
            answer = re.sub(r"\n\n\s*💡 Key Insights:.*$", "", answer, flags=re.DOTALL)
            if answer:
                qa_pairs.append({"question": f"Interview response {i+1}", "answer": answer})

        if qa_pairs:
            logger.info(f"🎯 Created {len(qa_pairs)} Q/A pairs from interviewee-only format")
            return qa_pairs

    return []


def _parse_paragraph_format(text: str) -> List[Dict[str, str]]:
    """
    Parse text by splitting into paragraphs and using alternating Q/A assignment.

    Args:
        text: The interview text

    Returns:
        List of Q/A pairs or empty list if no paragraphs found
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

    if not paragraphs:
        return []

    logger.info(
        f"No clear Q/A structure found. Using paragraph-based splitting with {len(paragraphs)} paragraphs"
    )
    qa_pairs = []

    # Determine if first paragraph is context or introduction
    is_intro = len(paragraphs[0].split()) > 50 or not any(
        w in paragraphs[0].lower()
        for w in ["?", "who", "what", "when", "where", "why", "how"]
    )

    start_idx = 1 if is_intro else 0
    for i in range(start_idx, len(paragraphs), 2):
        if i + 1 < len(paragraphs):
            qa_pairs.append(
                {
                    "question": paragraphs[i].strip(),
                    "answer": paragraphs[i + 1].strip(),
                }
            )

    if qa_pairs:
        logger.info(
            f"Created {len(qa_pairs)} Q/A pairs using paragraph alternation"
        )
        return qa_pairs

    return []


def _parse_enhanced_simulation_format(text: str) -> List[Dict[str, str]]:
    """
    Parse enhanced simulation format with interview dialogue.

    Args:
        text: The interview text

    Returns:
        List of Q/A pairs or empty list if format not detected
    """
    if not (
        "INTERVIEW DIALOGUE" in text
        and "Researcher:" in text
        and "Interviewee:" in text
    ):
        return []

    logger.info("Detected enhanced simulation interview format")
    qa_pairs = []

    # Extract interview dialogue sections
    dialogue_pattern = re.compile(
        r"\[[\d:]+\]\s*Researcher:\s*(.*?)\n\n\[[\d:]+\]\s*Interviewee:\s*(.*?)(?=\n\n\[[\d:]+\]\s*Researcher:|\n\n=|$)",
        re.DOTALL,
    )
    dialogue_matches = dialogue_pattern.findall(text)

    for question, answer in dialogue_matches:
        question = question.strip()
        answer = answer.strip()
        # Remove any "💡 Key Insights:" sections from answers
        answer = re.sub(
            r"\n\n\s*💡 Key Insights:.*$", "", answer, flags=re.DOTALL
        )

        if question and answer:
            qa_pairs.append({"question": question, "answer": answer})

    if qa_pairs:
        logger.info(
            f"🎯 Extracted {len(qa_pairs)} Q/A pairs from enhanced simulation format"
        )
        return qa_pairs

    return []


async def extract_texts_from_data(
    data: Any,
    parse_free_text_fn
) -> tuple[List[str], List[str], Dict[str, Any], str | None]:
    """
    Extract text content from various data formats.

    Args:
        data: The input data in various formats
        parse_free_text_fn: Function to parse free text (async)

    Returns:
        Tuple of (texts, answer_texts, metadata, filename)
    """
    texts = []
    answer_texts = []
    metadata = {}
    filename = None

    # Extract metadata if available
    if isinstance(data, dict) and "metadata" in data:
        metadata = data.get("metadata", {})
        logger.info(f"Extracted metadata: {metadata}")

    # Store filename from metadata if available
    if metadata and "filename" in metadata:
        filename = metadata.get("filename")
        logger.info(f"Using filename from metadata: {filename}")

        # Check if this is a Problem_demo file
        if filename and "Problem_demo" in filename:
            logger.info(
                f"Detected Problem_demo file: {filename}. Special handling will be applied."
            )

    # Detect and handle free-text format
    free_text_processed = False
    if (
        isinstance(data, str)
        or (isinstance(data, dict) and "free_text" in data)
        or (
            isinstance(data, list)
            and len(data) == 1
            and isinstance(data[0], dict)
            and "free_text" in data[0]
        )
    ):
        logger.info("Detected free-text format input")
        if isinstance(data, str):
            raw_text = data
        elif isinstance(data, dict):
            raw_text = data.get("free_text", "")
        else:  # List with single dict containing free_text
            raw_text = data[0].get("free_text", "")
            logger.info("Extracted free_text from list format")

        if not raw_text or not isinstance(raw_text, str):
            logger.error(f"Invalid or empty free text input: {raw_text}")
            raise ValueError("Invalid or empty free text input")

        # Parse free text to extract Q&A pairs
        qa_pairs = await parse_free_text_fn(raw_text)
        logger.info(f"Extracted {len(qa_pairs)} Q/A pairs from free text")

        # Process extracted Q&A pairs
        for item in qa_pairs:
            question = item.get("question", "")
            answer = item.get("answer", "")
            if question and answer:
                combined_text = f"Q: {question}\nA: {answer}"
                texts.append(combined_text)
                answer_texts.append(answer)

        free_text_processed = True

    # Handle list format data
    elif isinstance(data, list) and not free_text_processed:
        _process_list_format(data, texts, answer_texts)

    # Handle dict format data
    elif isinstance(data, dict):
        _process_dict_format(data, texts, answer_texts)

    return texts, answer_texts, metadata, filename


def _process_list_format(
    data: List[Any],
    texts: List[str],
    answer_texts: List[str]
) -> None:
    """Process list format data and populate texts/answer_texts."""
    logger.info("Processing list format data")
    for item in data:
        if isinstance(item, dict):
            _extract_from_dict_item(item, texts, answer_texts)


def _process_dict_format(
    data: Dict[str, Any],
    texts: List[str],
    answer_texts: List[str]
) -> None:
    """Process dict format data and populate texts/answer_texts."""
    # Handle enhanced simulation format
    if "interviews" in data and "metadata" in data:
        logger.info("✅ Processing enhanced simulation format data")
        _process_interviews(data["interviews"], texts, answer_texts)
    # Handle Excel format with persona and respondents
    elif (
        "persona" in data
        and "respondents" in data
        and isinstance(data["respondents"], list)
    ):
        logger.info("Processing Excel format data with 'respondents' field")
        for respondent in data["respondents"]:
            if "answers" in respondent and isinstance(respondent["answers"], list):
                for qa_pair in respondent["answers"]:
                    _extract_qa_pair(qa_pair, texts, answer_texts)
    # Handle nested format with interviews
    elif "interviews" in data:
        logger.info("Processing nested format data with 'interviews' field")
        _process_interviews(data["interviews"], texts, answer_texts)
    # Handle direct flat format
    elif "question" in data and "answer" in data:
        logger.info("Processing single Q&A item")
        _extract_qa_pair(data, texts, answer_texts)
    # Use text field as fallback
    elif "text" in data:
        texts.append(data["text"])
        logger.warning(f"Using text field as fallback: {data['text'][:50]}...")
        answer_texts.append(data["text"])


def _process_interviews(
    interviews: List[Dict[str, Any]],
    texts: List[str],
    answer_texts: List[str]
) -> None:
    """Process interviews list and extract Q&A pairs."""
    interview_count = 0
    response_count = 0

    for interview in interviews:
        interview_count += 1
        if "responses" in interview:
            for response in interview["responses"]:
                response_count += 1
                question = response.get("question", "")
                answer = response.get("answer", "") or response.get("response", "")
                if question and answer:
                    combined_text = f"Q: {question}\nA: {answer}"
                    texts.append(combined_text)
                    answer_texts.append(answer)
                    logger.debug(f"Q&A: {question[:50]}... -> {answer[:50]}...")
        elif "text" in interview:
            texts.append(interview["text"])
            logger.warning(f"Using text field as fallback: {interview['text'][:50]}...")
            answer_texts.append(interview["text"])

    logger.info(f"Processed {interview_count} interviews, {response_count} responses")


def _extract_from_dict_item(
    item: Dict[str, Any],
    texts: List[str],
    answer_texts: List[str]
) -> None:
    """Extract text from a dict item."""
    # Handle Excel format with persona and respondents
    if (
        "persona" in item
        and "respondents" in item
        and isinstance(item["respondents"], list)
    ):
        logger.info(f"Processing Excel format for persona: {item.get('persona', 'Unknown')}")
        for respondent in item["respondents"]:
            if "answers" in respondent and isinstance(respondent["answers"], list):
                for qa_pair in respondent["answers"]:
                    _extract_qa_pair(qa_pair, texts, answer_texts)
    # Handle flat format (list of question-answer pairs)
    elif "question" in item and "answer" in item:
        _extract_qa_pair(item, texts, answer_texts)
    elif "text" in item:
        texts.append(item["text"])
        logger.warning(f"Using text field as fallback: {item['text'][:50]}...")
        answer_texts.append(item["text"])


def _extract_qa_pair(
    qa_pair: Dict[str, Any],
    texts: List[str],
    answer_texts: List[str]
) -> None:
    """Extract a single Q&A pair."""
    question = qa_pair.get("question", "")
    answer = qa_pair.get("answer", "")
    if question and answer:
        combined_text = f"Q: {question}\nA: {answer}"
        texts.append(combined_text)
        answer_texts.append(answer)

