---
type: "documentation"
title: "Evidence Linking Service Documentation"
description: "Core documentation representing Evidence Linking Service Documentation."
tags:
  - axwise-flow-oss
  - docs
  - backend
timestamp: "2026-07-04T10:00:00Z"
---
# Evidence Linking Service Documentation

## Overview

The `EvidenceLinkingService` is a specialized component that enhances persona attributes by finding and linking the most relevant direct quotes from interview transcripts. This service improves the quality and reliability of persona generation by providing concrete evidence for each attribute.

## Key Features

1. **Targeted Evidence Finding**: Uses LLM to identify the 1-2 most relevant direct quotes supporting each extracted attribute
2. **Context Preservation**: Includes surrounding context (preceding/following sentences) when necessary for proper understanding
3. **Fallback Mechanisms**: Implements robust error handling with regex-based fallback if LLM calls fail
4. **Confidence Enhancement**: Increases confidence scores for attributes with strong supporting evidence

## Usage

### Basic Usage

```python
from backend.services.processing.evidence_linking_service import EvidenceLinkingService

# Initialize with an LLM service
evidence_linking_service = EvidenceLinkingService(llm_service)

# Link evidence to attributes
enhanced_attributes = await evidence_linking_service.link_evidence_to_attributes(
    attributes, full_text
)
```

### Integration with AttributeExtractor

The `EvidenceLinkingService` is designed to work seamlessly with the `AttributeExtractor`:

```python
from backend.services.processing.attribute_extractor import AttributeExtractor

# The AttributeExtractor now uses EvidenceLinkingService internally
attribute_extractor = AttributeExtractor(llm_service)
attributes = await attribute_extractor.extract_attributes_from_text(text, role="Interviewee")
```

## Implementation Details

### LLM-Based Quote Finding

The service uses a specialized prompt to instruct the LLM to find the most relevant quotes:

```python
def _create_quote_finding_prompt(self, field: str, trait_value: str) -> str:
    """
    Create a prompt for finding relevant quotes.
    """
    # Format field name for better readability
    formatted_field = field.replace("_", " ").title()
    
    return f"""
CRITICAL INSTRUCTION: Your ENTIRE response MUST be a single, valid JSON array of strings.

You are an expert UX researcher analyzing interview transcripts. Your task is to find the most relevant direct quotes that provide evidence for a specific persona trait.

PERSONA TRAIT: {formatted_field}
TRAIT VALUE: {trait_value}

INSTRUCTIONS:
1. Carefully read the interview transcript provided.
2. Identify 2-3 direct quotes that most strongly support or demonstrate the persona trait described above.
3. For each quote:
   - Include the exact words from the transcript (verbatim)
   - Include enough context to understand the quote (1-2 sentences before/after if needed)
   ...
"""
```

### Regex-Based Fallback

If the LLM call fails, the service falls back to a regex-based approach:

```python
def _find_quotes_with_regex(self, trait_value: str, full_text: str) -> List[str]:
    """
    Find quotes using regex pattern matching.
    """
    # Extract key terms from the trait value
    key_terms = []
    
    # Split by common delimiters
    for delimiter in [',', '.', ';', ':', '-', '(', ')', '&']:
        if delimiter in trait_value:
            key_terms.extend([term.strip() for term in trait_value.split(delimiter)])
    
    # Find sentences containing key terms
    quotes = []
    sentences = re.split(r'(?<=[.!?])\s+', full_text)
    
    for term in key_terms:
        # ...
```

## Best Practices

1. **Provide Complete Text**: For best results, provide the complete interview transcript to ensure all relevant quotes can be found
2. **Specific Trait Values**: More specific trait values lead to more accurate evidence linking
3. **Error Handling**: Always implement error handling when using this service, as LLM calls may occasionally fail

## Testing

The service includes comprehensive tests:

```bash
# Run the tests
python -m pytest backend/tests/test_evidence_linking_service.py

# Run the test script for a live demonstration
python scripts/test_evidence_linking.py
```
