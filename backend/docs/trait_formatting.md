---
type: "documentation"
title: "Trait Formatting Service Documentation"
description: "Core documentation representing Trait Formatting Service Documentation."
tags:
  - axwise-flow-oss
  - docs
  - backend
timestamp: "2026-07-04T10:00:00Z"
---
# Trait Formatting Service Documentation

## Overview

The `TraitFormattingService` is a specialized component that improves the readability and clarity of persona trait values. This service transforms awkwardly phrased attribute values into natural, concise statements while preserving the original meaning.

## Key Features

1. **Improved Readability**: Transforms LLM-generated text into clear, natural language
2. **Standardized Formatting**: Ensures consistent formatting across similar types of attributes
3. **Flexible Implementation**: Works with or without LLM for different levels of formatting sophistication
4. **Preservation of Meaning**: Maintains the original information while improving presentation

## Usage

### Basic Usage

```python
from backend.services.processing.trait_formatting_service import TraitFormattingService

# Initialize with an LLM service for advanced formatting
trait_formatting_service = TraitFormattingService(llm_service)

# Or initialize without LLM for basic string processing
trait_formatting_service = TraitFormattingService()

# Format trait values
formatted_attributes = await trait_formatting_service.format_trait_values(attributes)
```

### Integration with AttributeExtractor

The `TraitFormattingService` is designed to work seamlessly with the `AttributeExtractor`:

```python
from backend.services.processing.attribute_extractor import AttributeExtractor

# The AttributeExtractor now uses TraitFormattingService internally
attribute_extractor = AttributeExtractor(llm_service)
attributes = await attribute_extractor.extract_attributes_from_text(text, role="Interviewee")
```

## Implementation Details

### LLM-Based Formatting

When initialized with an LLM service, the service uses a specialized prompt for advanced formatting:

```python
def _create_formatting_prompt(self, field: str, trait_value: str) -> str:
    """
    Create a prompt for formatting trait values.
    """
    # Format field name for better readability
    formatted_field = field.replace("_", " ").title()
    
    return f"""
You are an expert UX researcher specializing in creating clear, concise persona descriptions. Your task is to improve the formatting and clarity of a persona trait value while preserving its original meaning.

PERSONA TRAIT: {formatted_field}
CURRENT VALUE: {trait_value}

INSTRUCTIONS:
1. Rewrite the trait value to be more concise, clear, and natural-sounding.
2. Preserve ALL the original information and meaning.
3. Fix any awkward phrasing, run-on sentences, or grammatical issues.
4. Format as a complete sentence or phrase that flows naturally.
5. If the value is already well-formatted, return it unchanged.
6. If the value is a list of items, format it as a bulleted list with each item on a new line, starting with "• ".
7. Keep the length similar to the original - don't add new information.

Your response should ONLY contain the reformatted trait value, nothing else.
"""
```

### String Processing Formatting

When initialized without an LLM service, the service uses string processing for basic formatting:

```python
def _format_with_string_processing(self, field: str, trait_value: str) -> str:
    """
    Format trait value using string processing.
    """
    # Remove any markdown formatting
    formatted_value = re.sub(r'[*_#]', '', trait_value)
    
    # Fix common formatting issues
    
    # 1. Convert list-like strings to proper bullet points
    if ',' in formatted_value and len(formatted_value) > 30:
        # Check if it looks like a comma-separated list
        items = [item.strip() for item in formatted_value.split(',') if item.strip()]
        if len(items) >= 3:
            # Format as bullet points
            formatted_value = '\n'.join([f"• {item}" for item in items])
    
    # 2. Fix capitalization
    if formatted_value and not formatted_value.startswith('•'):
        # Capitalize first letter of the value
        formatted_value = formatted_value[0].upper() + formatted_value[1:]
    
    # ...
```

## Field-Specific Formatting

The service applies different formatting rules based on the field type:

1. **Demographics**: Ensures age information is included and properly formatted
2. **Tools and Technology**: Formats as bullet points for better readability
3. **Goals and Motivations**: Ensures proper sentence structure and clarity
4. **Skills and Expertise**: Standardizes formatting for consistent presentation

## Best Practices

1. **LLM vs. String Processing**: Use LLM-based formatting for higher quality results when available
2. **Error Handling**: Implement proper error handling to fall back to string processing if LLM calls fail
3. **Field-Specific Considerations**: Be aware that different fields may have different formatting requirements

## Testing

The service includes comprehensive tests:

```bash
# Run the tests
python -m pytest backend/tests/test_trait_formatting_service.py

# Run the test script for a live demonstration
python scripts/test_evidence_linking.py
```
