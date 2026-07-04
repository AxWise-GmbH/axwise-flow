---
type: "documentation"
title: "Adaptive Tool Recognition Service Documentation"
description: "Core documentation representing Adaptive Tool Recognition Service Documentation."
tags:
  - axwise-flow-oss
  - docs
  - backend
timestamp: "2026-07-04T10:00:00Z"
---
# Adaptive Tool Recognition Service Documentation

## Overview

The `AdaptiveToolRecognitionService` is a specialized component that identifies tools, software, and platforms mentioned in interview transcripts with industry awareness. This service improves the accuracy of tool identification by automatically detecting the industry context and using the LLM's knowledge of industry-specific tools, while also handling transcription errors and misspellings.

## Key Features

1. **Industry-Aware Adaptation**:
   - Automatically detects the industry context from the transcript
   - Leverages LLM's knowledge of industry-specific tools
   - No hardcoded tool dictionaries to maintain

2. **Robust Error Correction**:
   - Combines LLM's understanding with fuzzy matching
   - Learns from corrections over time
   - Handles transcription errors and misspellings

3. **Contextual Understanding**:
   - Uses surrounding context to improve tool identification
   - Recognizes industry-specific terminology
   - Understands the functional context of tool mentions

4. **Flexibility Across Domains**:
   - Works equally well for healthcare, finance, education, etc.
   - Adapts to new industries without code changes
   - Identifies domain-specific tools automatically

## Usage

### Basic Usage

```python
from backend.services.processing.adaptive_tool_recognition_service import AdaptiveToolRecognitionService

# Initialize with an LLM service
tool_recognition_service = AdaptiveToolRecognitionService(
    llm_service=llm_service,
    similarity_threshold=0.75,
    learning_enabled=True
)

# Identify tools in text
identified_tools = await tool_recognition_service.identify_tools_in_text(text)

# Format tools for persona
formatted_tools = tool_recognition_service.format_tools_for_persona(identified_tools, "bullet")
```

### Integration with AttributeExtractor

The `AdaptiveToolRecognitionService` is designed to work seamlessly with the `AttributeExtractor`:

```python
from backend.services.processing.attribute_extractor import AttributeExtractor

# The AttributeExtractor now uses AdaptiveToolRecognitionService internally
attribute_extractor = AttributeExtractor(llm_service)
attributes = await attribute_extractor.extract_attributes_from_text(text, role="Interviewee")
```

## Implementation Details

### Industry Detection

The service first identifies the industry context from the transcript:

```python
async def identify_industry(self, text):
    """
    Identify the industry context from text.
    """
    # Create prompt for industry detection
    prompt = """
You are an expert in identifying industry contexts from text. Your task is to determine the primary industry or domain being discussed in the provided text.

INSTRUCTIONS:
1. Read the text carefully.
2. Identify the primary industry or domain being discussed.
3. Select the most specific applicable industry from this list:
   - Healthcare
   - Finance
   - Education
   - Technology
   - Manufacturing
   ...
"""
    
    # Call LLM to identify industry
    llm_response = await self.llm_service.analyze({
        "task": "industry_detection",
        "text": text[:5000],  # Use first 5000 chars for efficiency
        "prompt": prompt,
        "enforce_json": True,
        "temperature": 0.0  # Use deterministic output
    })
    
    # Parse and return the response
    ...
```

### Industry-Specific Tool Identification

Once the industry is identified, the service gets common tools for that industry:

```python
async def get_industry_tools(self, industry):
    """
    Get common tools for a specific industry using LLM.
    """
    # Create prompt for industry-specific tools
    prompt = f"""
You are an expert in {industry} tools, software, and platforms. Your task is to identify common tools used in this industry.

INSTRUCTIONS:
1. List 15-25 of the most common tools, software, platforms, or systems used in the {industry} industry.
2. For each tool, provide:
   - Common variations of the name (including misspellings and abbreviations)
   - Primary functions or use cases
   - Any industry-specific terminology related to the tool
"""
    
    # Call LLM to get industry tools
    llm_response = await self.llm_service.analyze({
        "task": "industry_tools",
        "text": "",  # No text needed for this task
        "prompt": prompt,
        "enforce_json": True,
        "temperature": 0.1  # Slight variation for creativity
    })
    
    # Parse and return the response
    ...
```

### Tool Identification

The service then identifies tools mentioned in the text:

```python
async def identify_tools_in_text(self, text, surrounding_context=""):
    """
    Identify tools mentioned in text using industry context and LLM.
    """
    # First, identify the industry context
    industry_data = await self.identify_industry(surrounding_context or text)
    industry = industry_data.get("industry", "Technology")
    
    # Get industry-specific tools
    industry_tools = await self.get_industry_tools(industry)
    
    # Create prompt for tool identification
    prompt = f"""
You are an expert in identifying tools, software, and platforms mentioned in text, especially in the {industry} industry.

INSTRUCTIONS:
1. Carefully read the provided text.
2. Identify all tools, software, platforms, or systems mentioned.
3. For each identified tool:
   - Provide the standard/correct name of the tool
   - Note the exact text mention from the original text
   - Provide a confidence score (0.0-1.0)
   - Indicate if this appears to be a misspelling or transcription error
"""
    
    # Call LLM to identify tools
    llm_response = await self.llm_service.analyze({
        "task": "tool_identification",
        "text": text,
        "prompt": prompt,
        "enforce_json": True,
        "temperature": 0.0  # Use deterministic output
    })
    
    # Apply learned corrections and fuzzy matching
    ...
```

## Performance Considerations

The service uses several strategies to optimize performance:

1. **Caching**:
   - Industry detection results are cached by text hash
   - Industry-specific tools are cached by industry name

2. **Text Truncation**:
   - Only the first 5000 characters are used for industry detection
   - Full text is used for tool identification

3. **Efficient String Matching**:
   - Uses RapidFuzz for fast string similarity calculations when available
   - Falls back to Python's difflib when RapidFuzz is not available

## Learning from Corrections

The service can learn from corrections to improve future recognition:

```python
# Add a correction
tool_recognition_service.learn_from_correction("Mirrorboards", "Miro", 0.95)
```

## Best Practices

1. **Provide Complete Text**: For best results, provide the complete interview transcript to ensure accurate industry detection
2. **Enable Learning**: Keep learning_enabled=True to improve accuracy over time
3. **Adjust Threshold**: Tune the similarity_threshold based on your needs (higher for stricter matching, lower for more lenient)
4. **Use Surrounding Context**: Always provide surrounding_context when available for better contextual understanding

## Testing

The service includes comprehensive tests:

```bash
# Run the tests
python -m pytest backend/tests/test_adaptive_tool_recognition.py

# Run the test script for a live demonstration
python backend/scripts/test_tool_recognition.py
```
