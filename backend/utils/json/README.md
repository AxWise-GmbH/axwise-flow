# JSON Parsing Utilities

This directory contains utilities for parsing and handling JSON data, with a focus on processing responses from LLMs like Gemini.

## Transition to Instructor-Based Parsing

We are in the process of transitioning from custom JSON parsing utilities to using the Instructor library for structured outputs. This transition will improve reliability, reduce code complexity, and provide better handling of JSON responses from LLMs.

### Legacy Parsers (Deprecated)

The following legacy parsers are now deprecated and will be removed in a future version:

- `json_parser.py`: Contains `parse_llm_json_response()` and other functions for parsing JSON from LLM responses
- `json_repair.py`: Contains `repair_json()` and other functions for repairing malformed JSON
- `enhanced_json_repair.py`: Contains enhanced JSON repair utilities specifically for LLM-generated JSON

### New Instructor-Based Parser

The new Instructor-based parser is available in `instructor_parser.py`. It provides the following functions:

- `parse_json_with_instructor()`: Parse JSON string using Instructor's capabilities
- `parse_llm_json_response_with_instructor()`: Parse JSON response from LLM with enhanced error recovery
- `parse_with_model_instructor()`: Parse JSON string using a Pydantic model with Instructor

### Migration Guide

To migrate from legacy parsers to the new Instructor-based parser:

1. Replace calls to `parse_llm_json_response()` with `parse_llm_json_response_with_instructor()`
2. Replace calls to `repair_json()` with `parse_json_with_instructor()`
3. For Pydantic model-based parsing, use `parse_with_model_instructor()`

Example:

```python
# Old code
from backend.utils.json import parse_llm_json_response, repair_json

# Parse JSON from LLM response
result = parse_llm_json_response(response, context="my_context")

# Repair malformed JSON
repaired = repair_json(json_str)
```

```python
# New code
from backend.utils.json import parse_llm_json_response_with_instructor, parse_json_with_instructor

# Parse JSON from LLM response
result = parse_llm_json_response_with_instructor(response, context="my_context")

# Parse potentially malformed JSON
parsed = parse_json_with_instructor(json_str, context="my_context")
```

### Benefits of Instructor-Based Parsing

- **Improved Reliability**: Instructor is specifically designed for handling structured outputs from LLMs
- **Type Safety**: Instructor uses Pydantic models for validation and type checking
- **Better Error Handling**: Instructor provides better error messages and recovery mechanisms
- **Reduced Code Complexity**: Instructor handles many edge cases automatically
- **Future-Proof**: Instructor is actively maintained and updated for new LLM capabilities

## Best Practices for JSON with Gemini 2.5 Models

When working with Gemini 2.5 models and JSON outputs:

1. **Use Instructor's Structured Output Capabilities**
   - Instructor provides robust handling of JSON responses
   - Handles edge cases like markdown formatting in responses

2. **Set Strict Parameters**
   - Use `temperature=0.0` for deterministic outputs
   - Set `response_mime_type="application/json"` explicitly
   - Use `top_p=1.0` and `top_k=1` for more consistent outputs

3. **Implement Robust Error Handling**
   - Add specific handling for JSON parsing errors
   - Implement retry mechanisms with stricter settings
   - Include fallback to simpler models if needed

4. **Use Pydantic Models with Examples**
   - Define clear Pydantic models with examples
   - Use `model_config` with JSON schema examples
   - Provide clear field descriptions

5. **Handle Markdown Formatting**
   - Gemini 2.5 models sometimes include markdown ticks around JSON
   - Add preprocessing to remove markdown formatting before parsing

## Remaining Utilities

The following utilities are still maintained and not deprecated:

- `json_validator.py`: Contains utilities for validating JSON against schemas
- `schema_registry.py`: Contains a registry for JSON schemas
- `json_processor.py`: Contains a unified interface for JSON operations

## Timeline

- **Phase 1 (Current)**: Introduction of Instructor-based parser with backward compatibility
- **Phase 2 (Future)**: Gradual migration of all services to use Instructor-based parser
- **Phase 3 (Future)**: Removal of deprecated legacy parsers
