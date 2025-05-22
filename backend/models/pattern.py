"""
Pydantic models for pattern data.

This module defines Pydantic models for pattern data, which are used for
validation and serialization of pattern data with the Instructor library.
"""

from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator

class PatternEvidence(BaseModel):
    """
    Model for pattern evidence.
    
    This model represents evidence supporting a pattern, including the source
    quote and optional metadata.
    """
    quote: str = Field(..., description="Direct quote from the text supporting the pattern")
    source: Optional[str] = Field(None, description="Source of the quote (e.g., 'Interview 1')")
    
    # For Instructor compatibility
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "quote": "I always check with three different team members before finalizing a design decision",
                    "source": "Interview with UX Designer"
                }
            ]
        }
    }

class Pattern(BaseModel):
    """
    Model for a behavioral pattern.
    
    A pattern represents a recurring behavior, workflow, or approach identified
    in user research data.
    """
    name: str = Field(..., description="Descriptive name for the pattern")
    category: str = Field(
        ..., 
        description="Category of the pattern (e.g., 'Workflow', 'Decision Process')"
    )
    description: str = Field(..., description="Detailed description of the pattern")
    evidence: List[str] = Field(
        ..., 
        description="Supporting quotes showing the pattern in action"
    )
    frequency: float = Field(
        ..., 
        ge=0.0, 
        le=1.0, 
        description="Frequency score (0-1 representing prevalence)"
    )
    sentiment: float = Field(
        ..., 
        ge=-1.0, 
        le=1.0, 
        description="Sentiment score (-1 to 1, where -1 is negative, 0 is neutral, 1 is positive)"
    )
    impact: str = Field(
        ..., 
        description="Description of the consequence or impact of this pattern"
    )
    suggested_actions: List[str] = Field(
        default_factory=list,
        description="Potential next steps or recommendations based on this pattern"
    )
    
    @field_validator('category')
    @classmethod
    def validate_category(cls, v):
        """Validate that the category is one of the allowed values."""
        allowed_categories = [
            "Workflow", "Coping Strategy", "Decision Process", 
            "Workaround", "Habit", "Collaboration", "Communication"
        ]
        
        # Normalize category name (capitalize first letter of each word)
        normalized = ' '.join(word.capitalize() for word in v.split())
        
        # Check if normalized category is in allowed list
        if normalized not in allowed_categories:
            # Find closest match
            closest = min(allowed_categories, key=lambda x: abs(len(x) - len(normalized)))
            return closest
        
        return normalized
    
    @field_validator('evidence')
    @classmethod
    def ensure_evidence_list(cls, v):
        """Ensure evidence is a list of strings."""
        if v is None:
            return []
        if isinstance(v, str):
            return [v]
        if isinstance(v, list):
            # Convert any non-string items to strings
            return [str(item) for item in v]
        return []
    
    # For Instructor compatibility
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Collaborative Validation",
                    "category": "Decision Process",
                    "description": "Users consistently seek validation from colleagues before making final decisions",
                    "evidence": [
                        "I always check with three different team members before finalizing a design decision",
                        "We have a rule that at least two people need to review any major change"
                    ],
                    "frequency": 0.8,
                    "sentiment": 0.2,
                    "impact": "Slows down decision-making process but increases confidence in final decisions",
                    "suggested_actions": [
                        "Create a centralized knowledge base of best practices",
                        "Develop a streamlined validation checklist"
                    ]
                }
            ]
        }
    }

class PatternResponse(BaseModel):
    """
    Model for a pattern recognition response.
    
    This model represents the response from the pattern recognition service,
    which contains a list of identified patterns.
    """
    patterns: List[Pattern] = Field(
        default_factory=list,
        description="List of identified patterns"
    )
    
    @field_validator('patterns')
    @classmethod
    def ensure_patterns_list(cls, v):
        """Ensure patterns is a list of Pattern objects."""
        if v is None:
            return []
        if isinstance(v, dict):
            # If it's a single pattern dict, wrap it in a list
            return [v]
        return v
    
    # For Instructor compatibility
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "patterns": [
                        {
                            "name": "Collaborative Validation",
                            "category": "Decision Process",
                            "description": "Users consistently seek validation from colleagues before making final decisions",
                            "evidence": [
                                "I always check with three different team members before finalizing a design decision",
                                "We have a rule that at least two people need to review any major change"
                            ],
                            "frequency": 0.8,
                            "sentiment": 0.2,
                            "impact": "Slows down decision-making process but increases confidence in final decisions",
                            "suggested_actions": [
                                "Create a centralized knowledge base of best practices",
                                "Develop a streamlined validation checklist"
                            ]
                        }
                    ]
                }
            ]
        }
    }
