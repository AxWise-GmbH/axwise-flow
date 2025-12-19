"""
Pydantic models for pattern data.

This module defines Pydantic models for pattern data, which are used for
validation and serialization of pattern data with the Instructor library.

Supports stakeholder-aware pattern extraction where patterns are attributed
to specific stakeholder types and can track cross-stakeholder dynamics.
"""

from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field, field_validator


# Define stakeholder types matching the schema in backend/schemas.py
StakeholderType = Literal[
    "primary_customer", "secondary_user", "decision_maker", "influencer", "unknown"
]

# Define pattern categories including stakeholder-aware categories
PatternCategory = Literal[
    # Behavioral categories (individual patterns)
    "Workflow",
    "Coping Strategy",
    "Decision Process",
    "Workaround",
    "Habit",
    "Collaboration",
    "Communication",
    "Information Seeking",
    "Trust Verification",
    # Stakeholder-aware categories (cross-stakeholder patterns)
    "Stakeholder Conflict",
    "Role-Specific Behavior",
    "Cross-Role Collaboration",
]

# List of allowed categories for validation
ALLOWED_PATTERN_CATEGORIES = [
    "Workflow", "Coping Strategy", "Decision Process",
    "Workaround", "Habit", "Collaboration", "Communication",
    "Information Seeking", "Trust Verification",
    "Stakeholder Conflict", "Role-Specific Behavior", "Cross-Role Collaboration"
]


class PatternEvidence(BaseModel):
    """
    Model for pattern evidence with stakeholder attribution.

    This model represents evidence supporting a pattern, including the source
    quote, stakeholder attribution, and optional metadata like timestamps.
    """
    quote: str = Field(..., description="Direct quote from the text supporting the pattern")
    source: Optional[str] = Field(None, description="Source of the quote (e.g., 'Interview 1')")
    stakeholder_type: Optional[StakeholderType] = Field(
        None,
        description="Type of stakeholder who provided this evidence"
    )
    stakeholder_id: Optional[str] = Field(
        None,
        description="Unique identifier for the stakeholder (e.g., 'S1', 'decision_maker_1')"
    )
    participant_id: Optional[str] = Field(
        None,
        description="Participant identifier from the interview (e.g., 'P1', 'Interview 3')"
    )
    timestamp: Optional[str] = Field(
        None,
        description="Timestamp in the interview where this quote appears (e.g., '00:12:34')"
    )

    # For Instructor compatibility
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "quote": "I always check with three different team members before finalizing a design decision",
                    "source": "Interview with UX Designer",
                    "stakeholder_type": "primary_customer",
                    "stakeholder_id": "S1",
                    "participant_id": "P1",
                    "timestamp": "00:15:32"
                }
            ]
        }
    }

class Pattern(BaseModel):
    """
    Model for a behavioral pattern with stakeholder awareness.

    A pattern represents a recurring behavior, workflow, or approach identified
    in user research data. Patterns can be:
    - Individual behavioral patterns (Workflow, Decision Process, etc.)
    - Stakeholder-aware patterns (Stakeholder Conflict, Role-Specific Behavior, etc.)

    Stakeholder attribution allows tracking which stakeholder types exhibit
    the pattern and at what frequency.
    """
    name: str = Field(..., description="Descriptive name for the pattern")
    category: str = Field(
        ...,
        description="Category of the pattern (e.g., 'Workflow', 'Decision Process', 'Stakeholder Conflict')"
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

    # Stakeholder-aware fields
    stakeholder_distribution: Optional[Dict[str, float]] = Field(
        default=None,
        description="Distribution of pattern across stakeholder types (e.g., {'decision_maker': 0.8, 'primary_customer': 0.3})"
    )
    evidence_attributed: Optional[List[PatternEvidence]] = Field(
        default=None,
        description="Evidence with full stakeholder attribution (use instead of 'evidence' for stakeholder-aware patterns)"
    )
    is_cross_stakeholder: bool = Field(
        default=False,
        description="True if this pattern involves multiple stakeholder types"
    )
    primary_stakeholder_type: Optional[StakeholderType] = Field(
        default=None,
        description="The stakeholder type that most frequently exhibits this pattern"
    )
    consensus_level: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Agreement level across stakeholders (0-1, only for cross-stakeholder patterns)"
    )
    conflict_level: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Disagreement level across stakeholders (0-1, only for conflict patterns)"
    )

    @field_validator('category')
    @classmethod
    def validate_category(cls, v):
        """Validate that the category is one of the allowed values."""
        # Normalize category name (capitalize first letter of each word)
        normalized = ' '.join(word.capitalize() for word in v.split())

        # Check if normalized category is in allowed list
        if normalized not in ALLOWED_PATTERN_CATEGORIES:
            # Find closest match based on string similarity
            # First try substring match
            for cat in ALLOWED_PATTERN_CATEGORIES:
                if normalized.lower() in cat.lower() or cat.lower() in normalized.lower():
                    return cat
            # Fall back to length-based match
            closest = min(ALLOWED_PATTERN_CATEGORIES, key=lambda x: abs(len(x) - len(normalized)))
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

    def get_stakeholder_types(self) -> List[str]:
        """Get list of stakeholder types that exhibit this pattern."""
        if self.stakeholder_distribution:
            return list(self.stakeholder_distribution.keys())
        if self.evidence_attributed:
            types = set()
            for e in self.evidence_attributed:
                if e.stakeholder_type:
                    types.add(e.stakeholder_type)
            return list(types)
        return []

    def is_stakeholder_specific(self) -> bool:
        """Check if this pattern is specific to one stakeholder type."""
        types = self.get_stakeholder_types()
        return len(types) == 1 and not self.is_cross_stakeholder

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
                    ],
                    "stakeholder_distribution": {
                        "decision_maker": 0.9,
                        "primary_customer": 0.6
                    },
                    "is_cross_stakeholder": True,
                    "primary_stakeholder_type": "decision_maker",
                    "consensus_level": 0.75
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
