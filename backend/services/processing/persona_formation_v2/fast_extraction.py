"""
Fast Whole-Context Persona Extraction Module

Optimized approach that:
1. Sends the entire transcript to Gemini in a single LLM call
2. Uses RapidFuzz to map extracted quotes back to specific segment IDs/timestamps
3. Eliminates N network requests, replacing them with 1 + local fuzzy matching

This provides ~100x speedup for large transcripts (1000+ segments).
"""

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Try to import rapidfuzz, fall back gracefully if not available
try:
    from rapidfuzz import fuzz, process
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    RAPIDFUZZ_AVAILABLE = False
    logger.warning("rapidfuzz not available - evidence mapping will be less accurate")


class ExtractedEvidence(BaseModel):
    """Evidence item with verbatim quote from transcript."""
    quote: str = Field(..., description="Verbatim quote from the transcript")
    field: str = Field(default="", description="Which persona field this supports (goals, challenges, demographics, key_quotes)")


class ExtractedPersona(BaseModel):
    """Persona extracted via whole-context analysis."""
    name: str = Field(..., description="Archetypal name for the persona")
    description: str = Field(default="", description="Brief persona description")
    demographics: str = Field(default="", description="REQUIRED. Demographic info (role, industry, experience). Do NOT leave empty. Infer from context.")
    goals_and_motivations: str = Field(default="", description="Primary goals and motivations")
    challenges_and_frustrations: str = Field(default="", description="Key challenges and frustrations")
    key_quotes: List[str] = Field(default_factory=list, description="Verbatim quotes that define this persona")
    evidence: List[ExtractedEvidence] = Field(default_factory=list, description="Supporting evidence quotes")


class FastPersonaExtractionResult(BaseModel):
    """Result of fast persona extraction."""
    personas: List[ExtractedPersona] = Field(default_factory=list, description="Extracted personas")


def map_quote_to_segment(
    quote: str,
    segments: List[Dict[str, Any]],
    score_cutoff: int = 75
) -> Optional[Tuple[Dict[str, Any], int, float]]:
    """
    Map a quote back to its source segment using fuzzy matching.
    
    Args:
        quote: The quote text to match
        segments: List of transcript segments with 'text' or 'dialogue' fields
        score_cutoff: Minimum matching score (0-100) to accept a match
        
    Returns:
        Tuple of (matched_segment, index, score) or None if no match found
    """
    if not quote or not segments:
        return None
        
    if not RAPIDFUZZ_AVAILABLE:
        # Fallback: simple substring matching
        quote_lower = quote.lower().strip()
        for idx, seg in enumerate(segments):
            text = (seg.get("dialogue") or seg.get("text") or "").lower()
            if quote_lower in text or text in quote_lower:
                return (seg, idx, 100.0)
        return None
    
    # Build list of segment texts for matching
    segment_texts = [
        (seg.get("dialogue") or seg.get("text") or "")
        for seg in segments
    ]
    
    # Use partial_ratio for better matching of quote fragments
    match = process.extractOne(
        quote,
        segment_texts,
        scorer=fuzz.partial_ratio,
        score_cutoff=score_cutoff
    )
    
    if match:
        matched_text, score, index = match
        return (segments[index], index, score)
    
    return None


def build_extraction_prompt(transcript_text: str) -> str:
    """Build the prompt for whole-context persona extraction."""
    return f"""You are an expert qualitative researcher analyzing an interview transcript.

TASK: Identify the distinct User Personas present in this conversation.

IMPORTANT: The transcript may use technical speaker labels like "I01|Name" or "I02|Name". You must IGNORE the "Ixx|" prefix and only use the actual name. For example, "I01|John" should be extracted as "John".

For each persona, provide:
1. Name: An archetypal first name (e.g., "Sarah", "Marcus")
2. Description: A brief one-sentence description
3. Demographics: (REQUIRED) Extract or infer Role, Industry, and Experience Level. If not explicitly stated, infer from context. Do NOT leave empty. Example: "Senior Account Manager, AdTech, 5+ years".
4. Goals and Motivations: What drives this person
5. Challenges and Frustrations: What obstacles they face
6. Key Quotes: 3-5 VERBATIM, EXACT quotes from the transcript that best represent this persona

CRITICAL: The quotes MUST be exact, word-for-word copies from the transcript below. Do not paraphrase or modify them.

TRANSCRIPT:
{transcript_text}

Respond with a JSON object containing a "personas" array with the identified personas."""


async def fast_extract_personas(
    transcript: List[Dict[str, Any]],
    llm_service: Any,
    context: Optional[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Fast whole-context persona extraction.
    
    This approach:
    1. Combines all transcript segments into a single text
    2. Makes ONE LLM call to extract all personas with verbatim quotes
    3. Uses RapidFuzz to map quotes back to specific segments for evidence linking
    
    Args:
        transcript: List of transcript segments with text/dialogue
        llm_service: LLM service implementing generate_structured
        context: Optional context with document_id, etc.
        
    Returns:
        List of persona dictionaries with evidence mapping
    """
    start_time = time.perf_counter()
    logger.info(f"👥 [FAST_EXTRACTION] Starting with {len(transcript)} segments")
    
    if not transcript:
        return []
    
    # Step 1: Combine transcript into single text
    full_text = "\n".join(
        seg.get("dialogue") or seg.get("text") or ""
        for seg in transcript
    )
    
    if not full_text.strip():
        logger.warning("👥 [FAST_EXTRACTION] Empty transcript text")
        return []
    
    logger.info(f"👥 [FAST_EXTRACTION] Combined transcript: {len(full_text)} chars")

    # Step 2: Build prompt and make single LLM call
    prompt = build_extraction_prompt(full_text)

    try:
        logger.info(f"👥 [FAST_EXTRACTION] Calling generate_structured with prompt length: {len(prompt)}")
        result = await llm_service.generate_structured(
            prompt=prompt,
            response_model=FastPersonaExtractionResult
        )

        llm_time = time.perf_counter() - start_time
        logger.info(f"👥 [FAST_EXTRACTION] LLM call completed in {llm_time:.2f}s")
        logger.info(f"👥 [FAST_EXTRACTION] Result type: {type(result)}, personas count: {len(result.personas) if hasattr(result, 'personas') else 'N/A'}")

        if hasattr(result, 'personas') and result.personas:
            for i, p in enumerate(result.personas[:2]):  # Log first 2 personas
                logger.info(f"👥 [FAST_EXTRACTION] Persona {i}: {p.speaker_id if hasattr(p, 'speaker_id') else p}")
        else:
            logger.warning(f"👥 [FAST_EXTRACTION] No personas in result. Full result: {result}")

    except Exception as e:
        logger.error(f"👥 [FAST_EXTRACTION] LLM call failed: {e}", exc_info=True)
        return []

    # Step 3: Map quotes back to segments using RapidFuzz
    document_id = context.get("document_id") if context else None
    personas_with_evidence = []

    for persona in result.personas:
        mapped_evidence = []

        # Map key_quotes to segments
        for quote in persona.key_quotes:
            match = map_quote_to_segment(quote, transcript)
            if match:
                seg, idx, score = match
                mapped_evidence.append({
                    "quote": quote,
                    "segment_index": idx,
                    "segment_id": seg.get("id") or seg.get("segment_id"),
                    "timestamp": seg.get("timestamp") or seg.get("start_time"),
                    "speaker_id": seg.get("speaker_id"),
                    "match_score": score,
                    "document_id": document_id,
                    "field": "key_quotes"
                })

        # Map evidence items to segments
        for ev in persona.evidence:
            match = map_quote_to_segment(ev.quote, transcript)
            if match:
                seg, idx, score = match
                mapped_evidence.append({
                    "quote": ev.quote,
                    "segment_index": idx,
                    "segment_id": seg.get("id") or seg.get("segment_id"),
                    "timestamp": seg.get("timestamp") or seg.get("start_time"),
                    "speaker_id": seg.get("speaker_id"),
                    "match_score": score,
                    "document_id": document_id,
                    "field": ev.field
                })

        # Build persona dict with evidence
        persona_dict = {
            "name": persona.name,
            "description": persona.description,
            "demographics": {
                "value": persona.demographics,
                "confidence": 0.85,
                "evidence": [e for e in mapped_evidence if e.get("field") == "demographics"]
            },
            "goals_and_motivations": {
                "value": persona.goals_and_motivations,
                "confidence": 0.85,
                "evidence": [e for e in mapped_evidence if e.get("field") in ("goals", "goals_and_motivations")]
            },
            "challenges_and_frustrations": {
                "value": persona.challenges_and_frustrations,
                "confidence": 0.85,
                "evidence": [e for e in mapped_evidence if e.get("field") in ("challenges", "challenges_and_frustrations")]
            },
            "key_quotes": [e for e in mapped_evidence if e.get("field") == "key_quotes"],
            "_all_evidence": mapped_evidence,
            "_extraction_method": "fast_whole_context"
        }

        personas_with_evidence.append(persona_dict)

    total_time = time.perf_counter() - start_time
    total_evidence = sum(len(p.get("_all_evidence", [])) for p in personas_with_evidence)
    logger.info(
        f"👥 [FAST_EXTRACTION] Complete: {len(personas_with_evidence)} personas, "
        f"{total_evidence} evidence items mapped in {total_time:.2f}s"
    )

    return personas_with_evidence

