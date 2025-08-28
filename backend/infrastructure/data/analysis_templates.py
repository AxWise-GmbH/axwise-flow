"""Analysis templates and schemas for interview data processing"""

# Schema for interview analysis results
ANALYSIS_SCHEMA = {
    "type": "object",
    "required": ["themes", "patterns", "personas", "sentiment", "validation"],
    "properties": {
        "themes": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "keywords", "summary", "confidence"],
                "properties": {
                    "name": {"type": "string"},
                    "keywords": {"type": "array", "items": {"type": "string"}},
                    "summary": {"type": "string"},
                    "confidence": {"type": "number"},
                    "statements": {
                        "type": "array",
                        "items": {"type": "string"}
                    }
                }
            }
        },
        "patterns": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["type", "evidence", "confidence"],
                "properties": {
                    "type": {"type": "string"},
                    "evidence": {"type": "array", "items": {"type": "string"}},
                    "confidence": {"type": "number"},
                    "context": {"type": "string"}
                }
            }
        },
        "personas": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "traits", "needs", "pain_points"],
                "properties": {
                    "name": {"type": "string"},
                    "traits": {
                        "type": "object",
                        "additionalProperties": {
                            "type": "object",
                            "required": ["value", "confidence"],
                            "properties": {
                                "value": {"type": "string"},
                                "confidence": {"type": "number"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                }
                            }
                        }
                    },
                    "needs": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["description", "priority"],
                            "properties": {
                                "description": {"type": "string"},
                                "priority": {"type": "string"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                }
                            }
                        }
                    },
                    "pain_points": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["description", "severity"],
                            "properties": {
                                "description": {"type": "string"},
                                "severity": {"type": "string"},
                                "evidence": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                }
                            }
                        }
                    }
                }
            }
        },
        "sentiment": {
            "type": "object",
            "required": ["overall_score", "aspect_sentiments"],
            "properties": {
                "overall_score": {"type": "number"},
                "subjectivity": {"type": "number"},
                "aspect_sentiments": {
                    "type": "object",
                    "additionalProperties": {"type": "number"}
                },
                "positive_aspects": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "concerns": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            }
        },
        "validation": {
            "type": "object",
            "required": ["valid", "confidence"],
            "properties": {
                "valid": {"type": "boolean"},
                "confidence": {"type": "number"},
                "issues": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "suggestions": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            }
        }
    }
}

# Template for analysis prompts
ANALYSIS_PROMPT_TEMPLATE = """
Analyze the following interview data to extract key insights:

{interview_data}

Focus on identifying and structuring the following aspects:

1. Thematic Analysis:
   - Identify key themes from interviews
   - Tag and group keywords by themes
   - Provide theme summaries
   - Include relevant quotes/statements

2. Sentiment Analysis:
   - Overall sentiment across interviews
   - Aspect-based sentiment analysis
   - Identify positive aspects and concerns
   - Analyze emotional context

3. Pain Points Analysis:
   - Key challenges and frustrations
   - Impact assessment
   - Frequency of mention
   - Suggested solutions

4. Behavioral Analysis:
   - Collaboration patterns
   - Tool usage patterns
   - Decision-making processes
   - Work preferences

5. Key Findings:
   - Similar needs across users
   - Common responsibilities
   - Role context patterns
   - Critical insights

For each insight, provide:
- Direct quotes or examples as evidence
- Confidence level (0-1)
- Frequency of occurrence
- Impact assessment

Format the response as a structured JSON object with the following required fields. Follow this structure exactly - all fields are required:

{{
  "themes": [
    {{
      "name": "Theme name",
      "keywords": ["keyword1", "keyword2"],
      "summary": "Theme summary",
      "confidence": 0.9,
      "statements": ["relevant quote 1", "relevant quote 2"]
    }}
  ],
  "patterns": [
    {{
      "type": "Pattern type",
      "description": "Detailed pattern description",
      "evidence": ["evidence1", "evidence2"],
      "confidence": 0.8,
      "frequency": 0.7
    }}
  ],
  "personas": [
    {{
      "name": "Persona name",
      "traits": {{
        "trait1": {{
          "value": "trait description",
          "confidence": 0.85,
          "evidence": ["supporting quote 1"]
        }}
      }},
      "needs": [
        {{
          "description": "Need description",
          "priority": "high",
          "evidence": ["supporting quote 1"]
        }}
      ],
      "pain_points": [
        {{
          "description": "Pain point description",
          "severity": "high",
          "evidence": ["supporting quote 1"]
        }}
      ]
    }}
  ],
  "sentiment": {{
    "overall_score": 0.6,
    "aspect_sentiments": {{
      "aspect1": 0.7,
      "aspect2": 0.5
    }},
    "positive_aspects": ["positive1", "positive2"],
    "concerns": ["concern1", "concern2"]
  }},
  "validation": {{
    "valid": true,
    "confidence": 0.9,
    "issues": [],
    "suggestions": []
  }}
}}

Ensure the response:
- Detailed thematic groupings
- Comprehensive sentiment scores
- Clear evidence for each insight
- Quantified confidence levels
- Actionable implications

Ensure all insights are:
- Directly supported by the data
- Objectively stated
- Properly contextualized
- Assigned appropriate confidence levels
"""

# Template for validation prompts
VALIDATION_PROMPT_TEMPLATE = """
Validate the following analysis results against the source data:

Source Interviews:
{interview_data}

Analysis Results:
{analysis_results}

Evaluate:
1. Thematic Analysis:
   - Accuracy of identified themes
   - Completeness of theme coverage
   - Relevance of keywords
   - Quality of supporting statements

2. Sentiment Analysis:
   - Accuracy of overall sentiment
   - Validity of aspect sentiments
   - Completeness of positive/negative aspects
   - Evidence support for sentiment scores

3. Pain Points Analysis:
   - Accuracy of identified challenges
   - Impact assessment validity
   - Solution relevance
   - Evidence support

4. Behavioral Analysis:
   - Pattern identification accuracy
   - Frequency assessment
   - Evidence quality
   - Context consideration

5. Persona Formation:
   - Trait accuracy
   - Evidence support
   - Distinctiveness
   - Completeness

For each aspect:
- Note any discrepancies or gaps
- Suggest improvements if needed
- Assign confidence scores (0-1)
- Provide specific examples

Format the response as a structured JSON validation report following this schema:
{schema}

Focus on:
- Evidence-based validation using direct quotes
- Logical consistency across all components
- Comprehensive coverage of all aspects
- Appropriate confidence levels with justification
- Actionable improvement suggestions
"""
