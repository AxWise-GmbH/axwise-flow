"""
Mock LLM service for testing.

This module provides a mock implementation of the LLM service interface
for use in tests. It returns predefined responses based on the prompt content.
"""

import json
from typing import Dict, Any, Optional

class MockLLMService:
    """Mock LLM service for testing"""
    
    def __init__(self):
        self.mock_responses = {
            "pattern_analysis": {
                "patterns": [
                    {
                        "type": "behavioral",
                        "description": "Visual-oriented workflow preference",
                        "evidence": ["Prefers visual tools", "Finds spreadsheets rigid"],
                        "confidence": 0.85,
                        "frequency": 0.7
                    },
                    {
                        "type": "professional",
                        "description": "Collaborative work style",
                        "evidence": ["Values collaboration", "Needs sharing capabilities"],
                        "confidence": 0.9,
                        "frequency": 0.8
                    }
                ],
                "metadata": {
                    "pattern_count": 2,
                    "average_confidence": 0.875,
                    "analysis_notes": ["Clear preferences identified"]
                }
            },
            "persona_formation": {
                "personas": [
                    {
                        "name": "Visual Collaborator",
                        "description": "A professional who prefers visual tools and values team collaboration",
                        "patterns": ["pattern1", "pattern2"],
                        "traits": {
                            "visualization_preference": {
                                "value": "high",
                                "confidence": 0.85
                            },
                            "collaboration_style": {
                                "value": "active",
                                "confidence": 0.9
                            }
                        },
                        "confidence": 0.85,
                        "evidence": ["Tool preferences", "Workflow patterns"]
                    }
                ],
                "metadata": {
                    "persona_count": 1,
                    "average_confidence": 0.85,
                    "relationship_notes": ["Consistent trait patterns"]
                }
            },
            "validation": {
                "valid": True,
                "confidence": 0.9,
                "issues": [],
                "suggestions": ["Consider gathering more data points"]
            }
        }
    
    async def analyze(self, 
                     prompt: str, 
                     context: Optional[Dict[str, Any]] = None,
                     **kwargs) -> Dict[str, Any]:
        """Mock analysis that returns predefined responses"""
        
        # Determine which response to return based on prompt content
        if "behavioral and professional patterns" in prompt:
            response = self.mock_responses["pattern_analysis"]
        elif "suggest natural persona groupings" in prompt:
            response = self.mock_responses["persona_formation"]
        elif "validate these analysis results" in prompt:
            response = self.mock_responses["validation"]
        else:
            response = {"error": "No matching mock response"}
        
        return {
            'response': json.dumps(response),
            'usage': {'total_tokens': 100},
            'model': 'mock-gpt-4',
            'metadata': {
                'finish_reason': 'stop',
                'created': 1234567890
            }
        }
    
    async def generate_prompt(self, 
                            template: str, 
                            variables: Dict[str, Any]) -> str:
        """Mock prompt generation"""
        return template.format(**variables)
