# Evidence Intelligence System Integration Guide

## Overview

The Evidence Intelligence System replaces the flawed regex-based pattern matching with LLM-powered contextual understanding. This guide explains how to integrate it with the existing Design Thinking Agent AI pipeline.

## Critical Issues Solved

### 1. Speaker Attribution (Lines 39-113 in results_service.py)

**Problem**: Simple substring matching causing researcher questions to contaminate evidence
**Solution**: LLM-based attribution with researcher detection

### 2. Age Extraction (Lines 116-194 in results_service.py)

**Problem**: Overly strict regex `r'\b(\d{2})\s*(?:years old|yrs old)\b'` missing "Age: 32" format
**Solution**: Comprehensive pattern library + NLU extraction

### 3. Validation Threshold (Lines 57-62 in persona_evidence_validator.py)

**Problem**: 25% token overlap allowing false positives
**Solution**: Strict 70% threshold with multi-LLM verification

### 4. Speaker Conflation (Lines 203-215 in transcript_structuring_service.py)

**Problem**: Generic "Interviewee" IDs merging different people
**Solution**: Unique session-based identifiers

## Integration Steps

### Step 1: Install Dependencies

```python
# Add to requirements.txt
pydantic>=2.0.0
asyncio>=3.4.3
```

### Step 2: Initialize the Engine

```python
# In your main service or initialization file
from backend.services.evidence_intelligence import create_engine
from backend.services.llm_service import LLMService

# Single LLM setup
llm_service = LLMService()
evidence_engine = create_engine(llm_service)

# Multi-LLM setup for cross-verification (recommended)
llm_services = {
    "gpt4": LLMService(model="gpt-4"),
    "claude": LLMService(model="claude-3-opus"),
    "gemini": LLMService(model="gemini-pro")
}
evidence_engine = create_engine(llm_services)
```

### Step 3: Replace Results Service Filtering

**Current Flawed Code** (results_service.py, lines 39-113):

```python
def _filter_researcher_evidence_for_ssot(self, evidence_list):
    # Flawed: Simple substring matching
    filtered_evidence = []
    for evidence in evidence_list:
        normalized_evidence = evidence.lower().strip()
        # This misses many researcher patterns!
        if not any(q in normalized_evidence for q in researcher_questions):
            filtered_evidence.append(evidence)
```

**Integration**:

```python
# backend/services/results_service.py
from backend.services.evidence_intelligence import EvidenceIntelligenceEngine

class ResultsService:
    def __init__(self):
        self.evidence_engine = create_engine(self.llm_service)

    async def _filter_researcher_evidence_for_ssot(self, evidence_list, transcript_text):
        # Process through Evidence Intelligence
        result = await self.evidence_engine.process_transcript(transcript_text)

        # Get only non-researcher evidence
        filtered_evidence = [
            e.text for e in result.attributed_evidence
            if not e.is_researcher_content
        ]

        logger.info(f"Filtered {result.metrics.researcher_content_filtered} researcher items")
        return filtered_evidence
```

### Step 4: Replace Age Extraction

**Current Flawed Code** (results_service.py, lines 116-194):

```python
def _inject_age_range_from_source(self, personas):
    # Flawed: Too strict regex patterns
    age_patterns = [
        r'\b(\d{2})\s*(?:years old|yrs old)\b',  # Misses "Age: 32"
        r'\bage\s+(\d{2})\b'
    ]
```

**Integration**:

```python
# backend/services/results_service.py
async def _inject_age_range_from_source(self, personas, transcript_text):
    # Process demographics through Evidence Intelligence
    result = await self.evidence_engine.process_transcript(transcript_text)

    for persona_id, demographics in result.demographics.items():
        if demographics.age or demographics.age_range:
            # Update persona with extracted demographics
            personas[persona_id]['age'] = demographics.age
            personas[persona_id]['age_range'] = demographics.age_range
            personas[persona_id]['demographic_confidence'] = demographics.overall_confidence

            logger.info(f"Injected age {demographics.age} for persona {persona_id}")
```

### Step 5: Replace Validation Thresholds

**Current Flawed Code** (persona_evidence_validator.py, lines 57-62):

```python
def _fuzzy_contains(self, text, substring):
    # Flawed: 25% overlap threshold
    tokens_text = set(text.lower().split())
    tokens_substring = set(substring.lower().split())
    overlap = len(tokens_text & tokens_substring) / len(tokens_substring)
    return overlap >= 0.25  # TOO PERMISSIVE!
```

**Integration**:

```python
# backend/services/validation/persona_evidence_validator.py
from backend.services.evidence_intelligence import ValidationEngine, ValidationStatus

class PersonaEvidenceValidator:
    def __init__(self):
        self.validation_engine = ValidationEngine(llm_services)

    async def validate_evidence(self, evidence, source_text):
        # Use strict 70% threshold validation
        validation_result = await self.validation_engine.validate_evidence(
            evidence,
            source_text
        )

        # Only accept VERIFIED status
        return validation_result.status == ValidationStatus.VERIFIED
```

### Step 6: Replace Speaker Identification

**Current Flawed Code** (transcript_structuring_service.py, lines 203-215):

```python
# Prompt asks for unique IDs but doesn't enforce
prompt = "Ensure each speaker has a unique identifier..."
# No post-processing to ensure uniqueness!
```

**Integration**:

```python
# backend/services/processing/transcript_structuring_service.py
from backend.services.evidence_intelligence import SpeakerIntelligence

class TranscriptStructuringService:
    def __init__(self):
        self.speaker_intelligence = SpeakerIntelligence(llm_service)

    async def structure_transcript(self, transcript_text):
        # Analyze document context
        context = await self.evidence_engine.context_analyzer.analyze_document(transcript_text)

        # Identify speakers with guaranteed unique IDs
        speakers = await self.speaker_intelligence.identify_speakers(
            transcript_text,
            context
        )

        # Convert to structured format
        structured_transcript = self._format_with_unique_speakers(speakers)
        return structured_transcript
```

## Complete Pipeline Integration

### Option 1: Parallel Processing (Recommended)

Run Evidence Intelligence alongside existing pipeline for comparison:

```python
class EnhancedAnalysisPipeline:
    def __init__(self):
        self.evidence_engine = create_engine(llm_services)
        self.existing_pipeline = ExistingPipeline()

    async def process(self, transcript_text):
        # Run both pipelines
        existing_result = await self.existing_pipeline.process(transcript_text)
        intelligence_result = await self.evidence_engine.process_transcript(transcript_text)

        # Compare and log differences
        self._compare_results(existing_result, intelligence_result)

        # Use Intelligence result if confidence is higher
        if intelligence_result.overall_confidence > 0.7:
            return self._convert_to_existing_format(intelligence_result)
        else:
            return existing_result
```

### Option 2: Full Replacement

Replace entire evidence tracking with Evidence Intelligence:

```python
class AnalysisPipeline:
    def __init__(self):
        self.evidence_engine = create_engine(llm_services)

    async def analyze(self, analysis_id, transcript_text):
        # Process through Evidence Intelligence
        result = await self.evidence_engine.process_transcript(
            transcript_text,
            metadata={"analysis_id": analysis_id}
        )

        # Build response in existing format
        return {
            "personas": result.personas,
            "evidence": [e.dict() for e in result.attributed_evidence],
            "demographics": {k: v.dict() for k, v in result.demographics.items()},
            "validation": {
                "success_rate": result.metrics.validation_success_rate,
                "filtered_researcher": result.metrics.researcher_content_filtered
            },
            "quality_scores": {
                "confidence": result.overall_confidence,
                "completeness": result.completeness_score
            }
        }
```

## Configuration Options

### Strict Validation Mode

```python
config = {
    "validation_options": {
        "multi_llm": True,
        "strict": True,
        "min_token_overlap": 0.70,  # Replaces 25% threshold
        "min_consensus_score": 0.66  # 2/3 LLMs must agree
    }
}
engine = create_engine(llm_services, config)
```

### High-Precision Demographics

```python
config = {
    "demographic_options": {
        "extract_age": True,
        "use_header_search": True,  # Catches "Age: 32" format
        "confidence_threshold": 0.8
    }
}
```

### Researcher Filtering

```python
config = {
    "speaker_options": {
        "detect_researchers": True,
        "enforce_unique_ids": True
    },
    "output_options": {
        "include_researcher_content": False  # Exclude from output
    }
}
```

## Testing the Integration

### Unit Test Example

```python
import pytest
from backend.services.evidence_intelligence import create_engine

@pytest.mark.asyncio
async def test_researcher_filtering():
    engine = create_engine(mock_llm_service)

    transcript = """
    Interviewer: What challenges do you face?
    Participant: The main problem is the slow loading time.
    Interviewer: Can you elaborate on that?
    Participant: It takes 30 seconds to load the dashboard.
    """

    result = await engine.process_transcript(transcript)

    # Should filter out interviewer questions
    assert result.metrics.researcher_content_filtered == 2
    assert len(result.attributed_evidence) == 2
    assert all("Interviewer" not in e.text for e in result.attributed_evidence)

@pytest.mark.asyncio
async def test_age_extraction():
    engine = create_engine(mock_llm_service)

    transcript = """
    Participant 1 (Age: 32, Location: Seattle)
    I've been using the product for 2 years...
    """

    result = await engine.process_transcript(transcript)

    # Should extract age from header format
    demographics = list(result.demographics.values())[0]
    assert demographics.age == 32
    assert demographics.location == "Seattle"

@pytest.mark.asyncio
async def test_validation_threshold():
    engine = create_engine(mock_llm_service)

    evidence = AttributedEvidence(text="The product needs improvement")
    source = "They mentioned that the product needs significant improvement in usability"

    validation = await engine.validation_engine.validate_evidence(evidence, source)

    # Should require 70% overlap (strict threshold)
    assert validation.token_overlap_ratio < 0.7
    assert validation.status != ValidationStatus.VERIFIED
```

## Monitoring and Metrics

### Key Metrics to Track

```python
# After processing
logger.info(f"""
Evidence Intelligence Metrics:
- Unique speakers identified: {result.metrics.unique_speakers_created}
- Demographics extracted: {result.metrics.demographics_extracted}
- Evidence pieces found: {result.metrics.evidence_pieces_found}
- Researcher content filtered: {result.metrics.researcher_content_filtered}
- Validation success rate: {result.metrics.validation_success_rate:.1%}
- Processing time: {result.metrics.processing_time_seconds:.2f}s
""")
```

### Quality Indicators

```python
if result.overall_confidence < 0.6:
    logger.warning("Low confidence in results - manual review recommended")

if result.metrics.validation_success_rate < 0.5:
    logger.warning("High validation failure rate - check transcript quality")

if result.metrics.researcher_content_filtered > result.metrics.evidence_pieces_found:
    logger.warning("More researcher content than evidence - check attribution logic")
```

## Migration Checklist

- [ ] Install Evidence Intelligence System
- [ ] Configure LLM services (single or multi)
- [ ] Replace `_filter_researcher_evidence_for_ssot()` in results_service.py
- [ ] Replace `_inject_age_range_from_source()` in results_service.py
- [ ] Replace `_fuzzy_contains()` threshold in persona_evidence_validator.py
- [ ] Replace speaker identification in transcript_structuring_service.py
- [ ] Update configuration with strict thresholds
- [ ] Test with sample transcripts
- [ ] Compare results with existing pipeline
- [ ] Monitor metrics and quality scores
- [ ] Deploy to production

## Troubleshooting

### Issue: Low confidence scores

**Solution**: Enable multi-LLM verification and increase consensus requirements

### Issue: Missing age extraction

**Solution**: Enable header search and comprehensive patterns

### Issue: Researcher questions in evidence

**Solution**: Verify researcher detection is enabled and patterns are comprehensive

### Issue: Duplicate speakers

**Solution**: Ensure `enforce_unique_ids` is True in speaker options

## Support

For issues or questions about the Evidence Intelligence System integration:

1. Check the error logs for detailed messages
2. Review the validation results for specific failures
3. Examine the metrics for anomalies
4. Contact the development team with the exported results JSON
