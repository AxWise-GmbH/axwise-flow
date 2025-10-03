import json
import logging
import re
from typing import Any, List, Tuple

from backend.domain.models.persona_schema import StructuredDemographics, AttributedField

logger = logging.getLogger(__name__)


def distribute_evidence_semantically(quotes_list: List[str], num_pools: int = 8) -> List[List[str]]:
    """Distribute quotes based on semantic relevance to persona trait categories.

    Mirrors the original in-service helper to preserve behavior.
    """
    if not quotes_list:
        return [[] for _ in range(num_pools)]

    trait_keywords = {
        0: [
            "role",
            "position",
            "company",
            "department",
            "experience",
            "background",
            "demographics",
        ],
        1: [
            "goal",
            "motivation",
            "want",
            "need",
            "objective",
            "aim",
            "purpose",
            "drive",
        ],
        2: [
            "challenge",
            "frustration",
            "problem",
            "issue",
            "difficulty",
            "struggle",
            "pain",
        ],
        3: [
            "skill",
            "expertise",
            "ability",
            "competency",
            "knowledge",
            "proficient",
            "expert",
        ],
        4: [
            "technology",
            "tool",
            "software",
            "system",
            "platform",
            "application",
            "tech",
        ],
        5: [
            "workflow",
            "environment",
            "process",
            "work",
            "office",
            "team",
            "collaboration",
        ],
        6: [
            "responsibility",
            "duty",
            "task",
            "role",
            "accountable",
            "manage",
            "lead",
        ],
        7: [
            "quote",
            "said",
            "mentioned",
            "stated",
            "expressed",
            "voice",
            "opinion",
        ],
    }

    pools: List[List[str]] = [[] for _ in range(num_pools)]

    for quote in quotes_list:
        quote_lower = quote.lower()
        best_pool = 7
        max_matches = 0
        for pool_idx, keywords in trait_keywords.items():
            matches = sum(1 for keyword in keywords if keyword in quote_lower)
            if matches > max_matches:
                max_matches = matches
                best_pool = pool_idx
        pools[best_pool].append(quote)

    non_empty_pools = [i for i, pool in enumerate(pools) if pool]
    if len(non_empty_pools) < num_pools and quotes_list:
        for i, pool in enumerate(pools):
            if not pool and non_empty_pools:
                source_pool_idx = non_empty_pools[i % len(non_empty_pools)]
                if len(pools[source_pool_idx]) > 1:
                    pools[i].append(pools[source_pool_idx].pop())

    return pools


def extract_authentic_quotes_from_dialogue(
    original_dialogues: List[str], trait_content: Any, trait_name: str
) -> Tuple[List[str], List[str]]:
    """Extract verbatim quotes from original dialogues that support the given trait.

    Returns (evidence_quotes, actual_keywords_used). Mirrors original behavior.
    """
    logger.error(
        f"🔥 [AUTHENTIC_QUOTES] FUNCTION CALLED! Extracting quotes for trait: {trait_name}"
    )
    logger.error(
        f"🔥 [AUTHENTIC_QUOTES] Original dialogues count: {len(original_dialogues) if original_dialogues else 0}"
    )

    # Handle both old string format and new StructuredDemographics format
    trait_content_str = ""
    if isinstance(trait_content, StructuredDemographics):
        field_values = []
        demographics_dict = trait_content.model_dump()
        for _, field_data in demographics_dict.items():
            if isinstance(field_data, dict) and "value" in field_data:
                if field_data["value"]:
                    field_values.append(str(field_data["value"]))
        trait_content_str = " ".join(field_values)
        logger.info(
            f"[STRUCTURED_DEMOGRAPHICS] Extracted text for keyword matching: {trait_content_str[:100]}..."
        )
    elif isinstance(trait_content, AttributedField):
        trait_content_str = str(trait_content.value) if trait_content.value else ""
    elif hasattr(trait_content, "value"):
        trait_content_str = str(trait_content.value) if getattr(trait_content, "value") else ""
    elif isinstance(trait_content, str):
        trait_content_str = trait_content
    else:
        trait_content_str = str(trait_content) if trait_content else ""

    logger.error(f"🔥 [AUTHENTIC_QUOTES] Trait content length: {len(trait_content_str)}")

    if original_dialogues:
        for i, dialogue in enumerate(original_dialogues[:3]):
            logger.error(f"🔥 [AUTHENTIC_QUOTES] Dialogue {i+1}: {dialogue[:100]}...")

    if not original_dialogues or not trait_content_str:
        logger.warning(
            f"[AUTHENTIC_QUOTES] Missing data - dialogues: {bool(original_dialogues)}, trait_content: {bool(trait_content_str)}"
        )
        return [], []

    evidence: List[str] = []
    actual_keywords_used = set()

    # LLM-based keyword extraction
    from backend.utils.persona.nlp_processor import extract_trait_keywords_for_highlighting

    existing_evidence: List[str] = []
    keywords = extract_trait_keywords_for_highlighting(trait_content_str, existing_evidence)
    logger.info(f"[LLM_KEYWORDS] Extracted keywords for {trait_name}: {keywords}")

    # Search dialogues
    for dialogue in original_dialogues:
        if not dialogue or len(dialogue.strip()) < 20:
            continue
        dialogue = dialogue.strip()
        sentences = re.split(r"[.!?]+", dialogue)
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 30:
                continue
            sentence_lower = sentence.lower()
            keyword_matches = [kw for kw in keywords if kw in sentence_lower]
            if keyword_matches:
                formatted_quote = f'"{sentence}"'
                for keyword in keyword_matches[:3]:
                    pattern = r"\b" + re.escape(keyword) + r"\b"
                    formatted_quote = re.sub(
                        pattern, f"**{keyword}**", formatted_quote, flags=re.IGNORECASE
                    )
                    actual_keywords_used.add(keyword)
                evidence.append(formatted_quote)
                if len(evidence) >= 3:
                    break
        if len(evidence) >= 3:
            break

    # Fallback: semantic overlap
    if not evidence:
        trait_words = set(re.findall(r"\b\w{4,}\b", trait_content_str.lower()))
        for dialogue in original_dialogues:
            if not dialogue or len(dialogue.strip()) < 20:
                continue
            sentences = re.split(r"[.!?]+", dialogue.strip())
            for sentence in sentences:
                sentence = sentence.strip()
                if len(sentence) < 30:
                    continue
                sentence_words = set(re.findall(r"\b\w{4,}\b", sentence.lower()))
                if len(trait_words & sentence_words) >= 2:
                    overlap_words = list(trait_words & sentence_words)[:3]
                    formatted_quote = f'"{sentence}"'
                    for word in overlap_words:
                        pattern = r"\b" + re.escape(word) + r"\b"
                        formatted_quote = re.sub(
                            pattern, f"**{word}**", formatted_quote, flags=re.IGNORECASE
                        )
                    evidence.append(formatted_quote)
                    if len(evidence) >= 2:
                        break
            if len(evidence) >= 2:
                break

    logger.error(f"🔥 [AUTHENTIC_QUOTES] EXTRACTED {len(evidence)} quotes for {trait_name}")
    for i, quote in enumerate(evidence[:3]):
        logger.error(f"🔥 [AUTHENTIC_QUOTES] Quote {i+1}: {quote[:100]}...")

    actual_keywords_list = list(actual_keywords_used)
    logger.info(
        f"[LLM_KEYWORDS] Actually used keywords for {trait_name}: {actual_keywords_list}"
    )

    return evidence[:3], actual_keywords_list

