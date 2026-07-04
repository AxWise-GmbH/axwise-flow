---
type: "module-readme"
title: "Persona Formation System"
description: "Core module readme representing Persona Formation System."
tags:
  - axwise-flow-oss
  - processing-readme
  - backend
  - services
  - processing
timestamp: "2026-07-04T10:00:00Z"
---
# Persona Formation System

This directory contains the refactored persona formation system, which is responsible for generating user personas from interview transcripts or analysis patterns.

## Overview

The system has been refactored into several smaller, more focused modules:

1. **TranscriptProcessor** (`transcript_processor.py`): Handles parsing raw transcripts, identifying roles, and structuring the data.
2. **AttributeExtractor** (`attribute_extractor.py`): Extracts persona attributes from text using LLM.
3. **PersonaBuilder** (`persona_builder.py`): Builds persona objects from attributes.
4. **PromptGenerator** (`prompts.py`): Generates prompts for LLM.
5. **PersonaFormationService** (`persona_formation_service.py`): Orchestrates the entire process.

## Module Responsibilities

### TranscriptProcessor

- Parses raw transcripts into structured format
- Identifies roles in transcripts (interviewer vs interviewee)
- Extracts names from text
- Splits text by roles

### AttributeExtractor

- Extracts attributes from text using LLM
- Enhances evidence fields with specific quotes
- Cleans and validates attributes

### PersonaBuilder

- Builds persona objects from attributes
- Creates fallback personas when extraction fails
- Validates personas

### PromptGenerator

- Generates prompts for LLM
- Defines constants for prompt templates

### PersonaFormationService

- Orchestrates the entire persona formation process
- Handles error cases and creates fallback personas
- Emits events for tracking progress

## Usage

```python
from services.processing.persona_formation_service import PersonaFormationService

# Initialize the service
service = PersonaFormationService(config, llm_service)

# Generate personas from text
personas = await service.generate_persona_from_text(text)

# Form personas from patterns
personas = await service.form_personas(patterns)

# Form personas from structured transcript
personas = await service.form_personas_from_transcript(transcript)
```

## Testing

The system includes a test file (`tests/test_persona_formation_service.py`) that verifies the functionality of the refactored code.

To run the tests:

```bash
python -m tests.test_persona_formation_service
```

## Original Implementation

The original implementation is preserved in `persona_formation_original.py` for reference.
