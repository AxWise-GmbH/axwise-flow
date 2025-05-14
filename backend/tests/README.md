# Test Organization

This directory contains tests for the backend services. The tests are organized as follows:

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

## Manual Tests

Manual tests are located in the root directory:

- `test_persona_builder_manual.py`: Manual tests for the PersonaBuilder with simplified attributes.
- `test_persona_pipeline_integration.py`: Integration tests for the persona formation pipeline.

## Running Tests

### Running Pytest Tests

```bash
cd backend
python -m pytest tests/
```

### Running Manual Tests

```bash
cd backend
python test_persona_builder_manual.py
python test_persona_pipeline_integration.py
```

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
