"""
Content deduplication utilities for removing repetitive patterns in persona data.
"""

import re
from typing import Any, Dict, List
import logging

logger = logging.getLogger(__name__)


def remove_repetitive_patterns(text: str) -> str:
    """
    Remove repetitive patterns from text content.
    
    Args:
        text: Input text that may contain repetitive patterns
        
    Returns:
        Cleaned text with repetitive patterns removed
    """
    if not text or not isinstance(text, str):
        return text
    
    # Remove duplicate sentences separated by | or similar delimiters
    text = remove_pipe_separated_duplicates(text)
    
    # Remove duplicate phrases within the same text
    text = remove_duplicate_phrases(text)
    
    # Remove redundant bullet points
    text = remove_duplicate_bullet_points(text)
    
    # Clean up extra whitespace and formatting
    text = clean_formatting(text)
    
    return text


def remove_pipe_separated_duplicates(text: str) -> str:
    """Remove duplicate content separated by | character."""
    if '|' not in text:
        return text
    
    parts = [part.strip() for part in text.split('|')]
    unique_parts = []
    
    for part in parts:
        # Check if this part is substantially similar to any existing part
        is_duplicate = False
        for existing in unique_parts:
            if are_sentences_similar(part, existing):
                is_duplicate = True
                break
        
        if not is_duplicate:
            unique_parts.append(part)
    
    return ' '.join(unique_parts)


def remove_duplicate_phrases(text: str) -> str:
    """Remove duplicate phrases within the same text."""
    sentences = re.split(r'[.!?]+', text)
    unique_sentences = []
    
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
            
        # Check if this sentence is substantially similar to any existing sentence
        is_duplicate = False
        for existing in unique_sentences:
            if are_sentences_similar(sentence, existing):
                is_duplicate = True
                break
        
        if not is_duplicate:
            unique_sentences.append(sentence)
    
    return '. '.join(unique_sentences) + ('.' if unique_sentences else '')


def remove_duplicate_bullet_points(text: str) -> str:
    """Remove duplicate bullet points."""
    lines = text.split('\n')
    unique_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Extract bullet point content (remove • - * etc.)
        bullet_content = re.sub(r'^[•\-\*]\s*', '', line)
        
        # Check if this bullet point is substantially similar to any existing one
        is_duplicate = False
        for existing in unique_lines:
            existing_content = re.sub(r'^[•\-\*]\s*', '', existing)
            if are_sentences_similar(bullet_content, existing_content):
                is_duplicate = True
                break
        
        if not is_duplicate:
            unique_lines.append(line)
    
    return '\n'.join(unique_lines)


def are_sentences_similar(sentence1: str, sentence2: str, threshold: float = 0.8) -> bool:
    """
    Check if two sentences are substantially similar.
    
    Args:
        sentence1: First sentence
        sentence2: Second sentence
        threshold: Similarity threshold (0.0 to 1.0)
        
    Returns:
        True if sentences are similar above threshold
    """
    if not sentence1 or not sentence2:
        return False
    
    # Normalize sentences for comparison
    s1 = normalize_sentence(sentence1)
    s2 = normalize_sentence(sentence2)
    
    if s1 == s2:
        return True
    
    # Calculate word overlap similarity
    words1 = set(s1.split())
    words2 = set(s2.split())
    
    if not words1 or not words2:
        return False
    
    intersection = words1.intersection(words2)
    union = words1.union(words2)
    
    similarity = len(intersection) / len(union) if union else 0
    
    return similarity >= threshold


def normalize_sentence(sentence: str) -> str:
    """Normalize sentence for comparison."""
    # Convert to lowercase
    sentence = sentence.lower()
    
    # Remove punctuation and extra whitespace
    sentence = re.sub(r'[^\w\s]', ' ', sentence)
    sentence = re.sub(r'\s+', ' ', sentence)
    
    return sentence.strip()


def clean_formatting(text: str) -> str:
    """Clean up formatting issues in text."""
    # Remove multiple spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Remove multiple newlines
    text = re.sub(r'\n\s*\n', '\n', text)
    
    # Clean up bullet point formatting
    text = re.sub(r'\n\s*([•\-\*])', r'\n\1', text)
    
    return text.strip()


def deduplicate_persona_content(persona: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove repetitive patterns from all text fields in a persona.
    
    Args:
        persona: Persona dictionary with text fields
        
    Returns:
        Persona with deduplicated content
    """
    if not isinstance(persona, dict):
        return persona
    
    # Fields that contain text content that might have repetition
    text_fields = [
        'demographics', 'goals_and_motivations', 'skills_and_expertise',
        'workflow_and_environment', 'challenges_and_frustrations',
        'technology_and_tools', 'needs_and_expectations',
        'decision_making_process', 'communication_style',
        'technology_usage', 'key_quotes', 'description'
    ]
    
    deduplicated_persona = persona.copy()
    
    for field in text_fields:
        if field in persona:
            field_data = persona[field]
            
            # Handle PersonaTrait objects (with value, confidence, evidence)
            if isinstance(field_data, dict) and 'value' in field_data:
                if isinstance(field_data['value'], str):
                    original_value = field_data['value']
                    cleaned_value = remove_repetitive_patterns(original_value)
                    
                    if cleaned_value != original_value:
                        logger.info(f"Deduplicated {field}: reduced from {len(original_value)} to {len(cleaned_value)} characters")
                        deduplicated_persona[field] = field_data.copy()
                        deduplicated_persona[field]['value'] = cleaned_value
            
            # Handle direct string fields
            elif isinstance(field_data, str):
                original_value = field_data
                cleaned_value = remove_repetitive_patterns(original_value)
                
                if cleaned_value != original_value:
                    logger.info(f"Deduplicated {field}: reduced from {len(original_value)} to {len(cleaned_value)} characters")
                    deduplicated_persona[field] = cleaned_value
    
    return deduplicated_persona


def deduplicate_persona_list(personas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Remove repetitive patterns from all personas in a list.
    
    Args:
        personas: List of persona dictionaries
        
    Returns:
        List of personas with deduplicated content
    """
    if not isinstance(personas, list):
        return personas
    
    deduplicated_personas = []
    
    for i, persona in enumerate(personas):
        logger.info(f"Deduplicating persona {i+1}/{len(personas)}: {persona.get('name', 'Unknown')}")
        deduplicated_persona = deduplicate_persona_content(persona)
        deduplicated_personas.append(deduplicated_persona)
    
    return deduplicated_personas
