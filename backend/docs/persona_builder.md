---
type: "documentation"
title: "PersonaBuilder Documentation"
description: "Core documentation representing PersonaBuilder Documentation."
tags:
  - axwise-flow-oss
  - docs
  - backend
timestamp: "2026-07-04T10:00:00Z"
---
# PersonaBuilder Documentation

## Overview

The `PersonaBuilder` class is responsible for constructing `Persona` objects from attribute dictionaries. It has been enhanced to support simplified attribute structures, making it more flexible and robust.

## Persona Structure

A `Persona` object contains the following key components:

- **Basic Information**: name, description, archetype, role_in_interview
- **Trait Fields**: Various traits like role_context, key_responsibilities, etc.
- **Evidence**: Supporting evidence for the persona
- **Confidence**: Overall confidence score for the persona

Each trait field is represented by a `PersonaTrait` object with:
- **value**: The trait value (string, dict, or list)
- **confidence**: Confidence score for the trait (0.0 to 1.0)
- **evidence**: List of supporting evidence strings

## Simplified Attribute Structure

The `PersonaBuilder` now supports a simplified attribute structure where trait fields can be provided as direct string values rather than nested dictionaries. This makes it easier to generate personas from LLM outputs.

### Example of Simplified Attributes

```python
simplified_attributes = {
    "name": "Product Manager",
    "description": "A product manager focused on user experience.",
    "role_context": "Works in a cross-functional team.",
    "key_responsibilities": "Defining product requirements.",
    "tools_used": "JIRA, Figma, Google Analytics",
    "key_quotes": ["User experience is paramount.", "We need to focus on metrics."],
    "overall_confidence_score": 0.85
}
```

### Traditional Attribute Structure (Still Supported)

```python
traditional_attributes = {
    "name": "Product Manager",
    "description": "A product manager focused on user experience.",
    "role_context": {
        "value": "Works in a cross-functional team.",
        "confidence": 0.9,
        "evidence": ["Evidence from interview"]
    },
    "key_responsibilities": {
        "value": "Defining product requirements.",
        "confidence": 0.8,
        "evidence": ["Evidence from interview"]
    },
    # ... other traits
}
```

## Key Features

### 1. Flexible Trait Field Handling

The `PersonaBuilder` can handle trait fields in various formats:

- **String Values**: Direct string values are converted to `PersonaTrait` objects with the overall confidence score.
- **Dictionary Values**: Traditional format with value, confidence, and evidence.
- **List Values**: Lists are joined into a string and converted to `PersonaTrait` objects.

### 2. Key Quotes Handling

The `key_quotes` field can be provided as:

- **List of Strings**: Each string is treated as a quote and used as evidence.
- **String**: The string is treated as a single quote.
- **Dictionary**: Traditional format with value, confidence, and evidence.

### 3. Overall Confidence Score

The `overall_confidence_score` field is used to set the confidence for all traits that don't have an explicit confidence value.

### 4. Robust Error Handling

The `PersonaBuilder` includes robust error handling:

- **Invalid Types**: Non-string values for name, description, etc. are safely converted to strings.
- **Missing Fields**: Default values are provided for missing fields.
- **Fallback Persona**: If persona building fails, a fallback persona is created.

## Usage

### Basic Usage

```python
from services.processing.persona_builder import PersonaBuilder, persona_to_dict

# Create a PersonaBuilder
builder = PersonaBuilder()

# Build a persona from simplified attributes
persona = builder.build_persona_from_attributes(simplified_attributes, role="Interviewee")

# Convert to dictionary for API response
persona_dict = persona_to_dict(persona)
```

### Integration with AttributeExtractor

The `PersonaBuilder` is designed to work seamlessly with the output from the `AttributeExtractor`:

```python
from services.processing.attribute_extractor import AttributeExtractor
from services.processing.persona_builder import PersonaBuilder, persona_to_dict

# Extract attributes from text
attributes = await attribute_extractor.extract_attributes_from_text(text, role="Interviewee")

# Build persona from attributes
persona = persona_builder.build_persona_from_attributes(attributes, role="Interviewee")

# Convert to dictionary for API response
persona_dict = persona_to_dict(persona)
```

## Best Practices

1. **Always provide a role**: The `role` parameter helps identify the persona's role in the interview.
2. **Include key_quotes**: Key quotes provide valuable evidence for traits.
3. **Set overall_confidence_score**: This helps ensure consistent confidence scores across traits.
4. **Validate the output**: Use `persona_to_dict` to convert the persona to a dictionary and validate it.

## Error Handling

If the `PersonaBuilder` encounters an error during persona building, it will:

1. Log the error with details
2. Create a fallback persona with minimal information
3. Return the fallback persona instead of raising an exception

This ensures that the application can continue functioning even if there are issues with the attribute data.

## Testing

The `PersonaBuilder` includes comprehensive tests:

- **Unit Tests**: Test individual methods and edge cases.
- **Integration Tests**: Test the integration with the `AttributeExtractor`.
- **Manual Tests**: Simple scripts for manual testing and debugging.

Run the tests with:

```bash
python test_persona_builder_manual.py
python test_persona_pipeline_integration.py
```
