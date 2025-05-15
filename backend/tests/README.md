# Test Organization

**Last Updated:** 2025-05-15

This directory contains all tests for the backend application. The tests are organized by type and module to make them easier to find and maintain.

## Test Structure

- `unit/`: Unit tests for individual functions and classes
  - `llm/`: Tests for LLM services
  - `processing/`: Tests for processing services
  - `api/`: Tests for API endpoints
- `integration/`: Integration tests for API endpoints and services
- `mocks/`: Mock objects and fixtures for testing
- `conftest.py`: Common fixtures and utilities

## Persona Formation Tests

### Prompt Tests

- `test_simplified_persona_formation.py`: Tests for the simplified persona formation prompts.

### Persona Builder Tests

- `test_persona_trait_population.py`: Tests for populating persona traits.
- `test_persona_trait_formatting.py`: Tests for formatting persona traits.
- `test_form_personas.py`: Tests for forming personas from attributes.

### Integration Tests

- `test_persona_formation_service.py`: Tests for the persona formation service.
- `test_persona_retrieval.py`: Tests for retrieving personas from the database.

## Running Tests

### Running Pytest Tests

```bash
cd backend
python -m pytest tests/
```

## LLM Service Tests

- `test_llm_service_factory.py`: Tests for the LLM service factory.
- `unit/llm/test_gemini_json.py`: Tests for the JSON parsing in GeminiLLMService.

## Test Coverage

The tests cover the following components:

1. **Prompt Generation**: Testing the generation of prompts for the LLM.
2. **Attribute Extraction**: Testing the extraction of attributes from text.
3. **Persona Building**: Testing the building of personas from attributes.
4. **Integration**: Testing the entire pipeline from text to personas.

## Test Data

Test data is located in the `@sample-data/` directory at the project root. This includes sample transcripts and expected outputs.

## Notes on Test Organization

- **Unit Tests**: Test individual components in isolation.
- **Integration Tests**: Test the interaction between components.
- **Manual Tests**: Provide a simple way to test components without the pytest framework.

The test organization has been streamlined to avoid redundancy while maintaining comprehensive coverage.
