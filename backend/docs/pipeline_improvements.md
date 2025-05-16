# Persona Generation Pipeline Improvements

## Overview

This document describes the improvements made to the persona generation pipeline, specifically addressing:

1. The TraitFormattingService LLM rephrasing issue
2. The proper integration of AdaptiveToolRecognitionService for tool identification

## Pipeline Flow

The persona generation pipeline follows this sequence:

1. **AttributeExtractor** extracts initial attributes from the transcript
2. **EvidenceLinkingService** links evidence to attributes
3. **TraitFormattingService** improves the formatting of trait values
4. **AdaptiveToolRecognitionService** identifies and corrects tool mentions
5. **PersonaBuilder** builds the final persona object

## TraitFormattingService Improvements

The TraitFormattingService has been enhanced to better handle LLM responses:

### Prompt Improvements

- Added clear, explicit instructions at the beginning and end of the prompt
- Emphasized that the LLM should return ONLY the rephrased text
- Provided specific formatting guidelines for different types of traits

### Response Parsing Improvements

- Enhanced parsing to handle different response types (dict, string, object)
- Added robust cleaning of common prefixes that LLMs might add
- Improved logging of both raw and cleaned responses
- Added validation to ensure the LLM actually improved the formatting

### Error Handling

- Added better fallback mechanisms when LLM formatting fails
- Improved logging to identify issues in the pipeline
- Added checks to skip formatting for very short trait values

## AdaptiveToolRecognitionService Integration

The AdaptiveToolRecognitionService has been properly integrated into the pipeline:

### Sequence Improvements

- Moved tool recognition to occur AFTER trait formatting but BEFORE converting to nested structures
- Removed the duplicate call to tool recognition at the beginning of the pipeline
- Added clear comments to indicate the correct sequence

### Tool Identification Improvements

- Enhanced tool identification to handle transcription errors (e.g., "Mirrorboards" → "Miro")
- Added evidence generation for identified tools
- Improved formatting of tool lists with bullet points

## Testing

A comprehensive test script has been created to validate the improvements:

- `test_trait_formatting()`: Tests the TraitFormattingService with various trait values
- `test_tool_recognition()`: Tests the AdaptiveToolRecognitionService with tool mentions
- `test_full_pipeline()`: Tests the full pipeline with a sample transcript

## Usage

To run the test script:

```bash
# Set the API key
export GEMINI_API_KEY=***REMOVED***

# Run the test script
python -m backend.tests.test_pipeline_improvements
```

## Sequence Diagrams

### Current Flow with TraitFormattingService Issue and Missing Tool Recognition

```mermaid
sequenceDiagram
    participant Client
    participant PFS as PersonaFormationService
    participant AE as AttributeExtractor
    participant ATRS as AdaptiveToolRecognitionService
    participant ELS as EvidenceLinkingService
    participant TFS as TraitFormattingService
    participant PB as PersonaBuilder
    participant GS as GeminiService

    Client->>PFS: generate_personas(transcript)
    PFS->>AE: extract_attributes_from_text(text, speaker)

    AE->>GS: analyze(task="simplified_persona_formation")
    GS-->>AE: Return nested JSON with value/confidence/evidence

    Note over AE: Receives nested structure with<br/>value/confidence/evidence for each trait

    Note over AE, ATRS: ISSUE: AdaptiveToolRecognitionService<br/>is initialized but not called to<br/>process tools_used or technology_and_tools

    AE->>ELS: link_evidence_to_attributes(attributes, text)
    ELS->>GS: analyze(task="evidence_linking")
    GS-->>ELS: Return enhanced attributes with evidence
    ELS-->>AE: Return attributes with linked evidence

    AE->>TFS: format_trait_values(attributes)

    loop For each trait
        TFS->>TFS: _format_with_llm(field, trait_value)
        TFS->>GS: analyze(task="trait_formatting")
        GS-->>TFS: Return text response

        Note over TFS: ISSUE: LLM response contains<br/>explanatory text or formatting<br/>that doesn't match expectations

        TFS->>TFS: _parse_llm_response(llm_response)
        Note over TFS: Parsing fails to extract clean<br/>formatted text from response

        TFS->>TFS: Falls back to _format_with_string_processing()
    end

    TFS-->>AE: Return attributes with basic formatted values

    Note over AE: ISSUE: Tool identification errors<br/>like "Miro boards" misinterpreted<br/>as "Mirror" remain uncorrected

    AE->>AE: _clean_persona_attributes(attributes)
    Note over AE: Converts to nested structures<br/>for PersonaBuilder

    AE-->>PFS: Return processed attributes

    PFS->>PB: build_persona_from_attributes(attributes, role)
    PB-->>PFS: Return Persona object

    PFS-->>Client: Return generated personas
```

### Improved Flow with TraitFormattingService Fix and Tool Recognition Integration

```mermaid
sequenceDiagram
    participant Client
    participant PFS as PersonaFormationService
    participant AE as AttributeExtractor
    participant ATRS as AdaptiveToolRecognitionService
    participant ELS as EvidenceLinkingService
    participant TFS as TraitFormattingService
    participant PB as PersonaBuilder
    participant GS as GeminiService

    Client->>PFS: generate_personas(transcript)
    PFS->>AE: extract_attributes_from_text(text, speaker)

    AE->>GS: analyze(task="simplified_persona_formation")
    GS-->>AE: Return nested JSON with value/confidence/evidence

    Note over AE: Accepts nested structure with<br/>value/confidence/evidence for each trait

    AE->>ELS: link_evidence_to_attributes(attributes, text)
    ELS->>GS: analyze(task="evidence_linking")
    GS-->>ELS: Return enhanced attributes with evidence
    ELS-->>AE: Return attributes with linked evidence

    AE->>TFS: format_trait_values(attributes)

    loop For each trait
        TFS->>TFS: _format_with_llm(field, trait_value)

        Note over TFS: Enhanced prompt with CRITICAL<br/>INSTRUCTION at beginning and end

        TFS->>GS: analyze(task="trait_formatting", temperature=0.2)
        GS-->>TFS: Return text response

        TFS->>TFS: _parse_llm_response(llm_response)

        Note over TFS: FIXED: Enhanced parsing that:<br/>1. Handles different response types<br/>2. Removes common prefixes<br/>3. Logs raw and cleaned responses

        alt LLM response successfully parsed
            TFS->>TFS: Return formatted value from LLM
        else Parsing fails or returns unchanged value
            TFS->>TFS: Falls back to _format_with_string_processing()
        end
    end

    TFS-->>AE: Return attributes with improved formatted values

    Note over AE: NEW: Process tools after formatting

    loop For tool-related fields (tools_used, technology_and_tools)
        alt Field exists in attributes
            AE->>AE: Extract current tool value

            AE->>ATRS: identify_tools_in_text(tool_value, text)
            ATRS->>GS: analyze(task="tool_identification")
            GS-->>ATRS: Return identified tools
            ATRS-->>AE: Return corrected tool identifications

            AE->>ATRS: format_tools_for_persona(identified_tools, "bullet")
            ATRS-->>AE: Return formatted tools list

            Note over AE: Update attribute with corrected tools<br/>(e.g., "Miro boards" instead of "Mirror")
        end
    end

    AE->>AE: _clean_persona_attributes(attributes)
    Note over AE: Converts to nested structures<br/>for PersonaBuilder if needed

    AE-->>PFS: Return processed attributes

    PFS->>PB: build_persona_from_attributes(attributes, role)
    PB-->>PFS: Return Persona object with evidence preserved

    PFS-->>Client: Return generated personas
```
