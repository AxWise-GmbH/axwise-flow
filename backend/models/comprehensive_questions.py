"""
Pydantic models for comprehensive research questions with stakeholder integration.

This module defines the structured data models for comprehensive customer research
questions that are generated using Instructor with proper validation.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, validator


class StakeholderQuestions(BaseModel):
    """Questions for a specific stakeholder category."""
    
    problemDiscovery: List[str] = Field(
        ...,
        description="5 specific questions to discover and validate problems this stakeholder faces",
        min_items=3,
        max_items=7
    )
    
    solutionValidation: List[str] = Field(
        ...,
        description="5 specific questions to validate the proposed solution with this stakeholder",
        min_items=3,
        max_items=7
    )
    
    followUp: List[str] = Field(
        ...,
        description="3 follow-up questions to gather additional insights from this stakeholder",
        min_items=2,
        max_items=5
    )

    @validator('problemDiscovery', 'solutionValidation', 'followUp')
    def validate_questions_not_empty(cls, v):
        """Ensure all questions are non-empty strings."""
        if not all(isinstance(q, str) and q.strip() for q in v):
            raise ValueError("All questions must be non-empty strings")
        return [q.strip() for q in v]


class Stakeholder(BaseModel):
    """A stakeholder with their role description and specific questions."""
    
    name: str = Field(
        ...,
        description="Clear, specific name for this stakeholder group (e.g., 'Elderly Women', 'Family Caregivers')",
        min_length=2,
        max_length=50
    )
    
    description: str = Field(
        ...,
        description="Brief description of this stakeholder's role and relationship to the business",
        min_length=10,
        max_length=200
    )
    
    questions: StakeholderQuestions = Field(
        ...,
        description="Structured questions specific to this stakeholder"
    )

    @validator('name')
    def validate_name(cls, v):
        """Ensure stakeholder name is meaningful."""
        if not v.strip():
            raise ValueError("Stakeholder name cannot be empty")
        return v.strip()

    @validator('description')
    def validate_description(cls, v):
        """Ensure description is meaningful."""
        if not v.strip():
            raise ValueError("Stakeholder description cannot be empty")
        return v.strip()


class TimeEstimate(BaseModel):
    """Time estimates for conducting the research interviews."""
    
    totalQuestions: int = Field(
        ...,
        description="Total number of questions across all stakeholders",
        ge=5,
        le=100
    )
    
    estimatedMinutes: str = Field(
        ...,
        description="Estimated time range in minutes (e.g., '45-60')",
        regex=r'^\d+-\d+$'
    )
    
    breakdown: Dict[str, Any] = Field(
        ...,
        description="Detailed breakdown of time estimates"
    )

    @validator('breakdown')
    def validate_breakdown(cls, v):
        """Ensure breakdown contains required fields."""
        required_fields = ['primary', 'secondary']
        for field in required_fields:
            if field not in v:
                raise ValueError(f"Breakdown must contain '{field}' field")
        return v


class ComprehensiveQuestions(BaseModel):
    """Complete comprehensive research questions with stakeholder integration."""
    
    primaryStakeholders: List[Stakeholder] = Field(
        ...,
        description="Primary stakeholders who are directly affected by or involved with the business",
        min_items=1,
        max_items=5
    )
    
    secondaryStakeholders: List[Stakeholder] = Field(
        default_factory=list,
        description="Secondary stakeholders who have indirect influence or interest",
        max_items=5
    )
    
    timeEstimate: TimeEstimate = Field(
        ...,
        description="Realistic time estimates for conducting all interviews"
    )

    @validator('primaryStakeholders')
    def validate_primary_stakeholders(cls, v):
        """Ensure we have at least one primary stakeholder."""
        if not v:
            raise ValueError("Must have at least one primary stakeholder")
        return v

    @validator('primaryStakeholders', 'secondaryStakeholders')
    def validate_unique_stakeholder_names(cls, v, values):
        """Ensure stakeholder names are unique."""
        names = [s.name.lower() for s in v]
        if len(names) != len(set(names)):
            raise ValueError("Stakeholder names must be unique")
        return v

    def get_total_questions(self) -> int:
        """Calculate total number of questions across all stakeholders."""
        total = 0
        for stakeholder in self.primaryStakeholders + self.secondaryStakeholders:
            total += len(stakeholder.questions.problemDiscovery)
            total += len(stakeholder.questions.solutionValidation)
            total += len(stakeholder.questions.followUp)
        return total

    def get_estimated_time_range(self) -> tuple[int, int]:
        """Get estimated time range as tuple of (min_minutes, max_minutes)."""
        total_questions = self.get_total_questions()
        base_time = int(total_questions * 2.5)  # 2.5 minutes per question
        buffer_time = int(base_time * 0.2)  # 20% buffer
        return (base_time, base_time + buffer_time)


class StakeholderDetection(BaseModel):
    """Detected stakeholders for a business context."""
    
    primary: List[Dict[str, str]] = Field(
        ...,
        description="Primary stakeholders with name and description",
        min_items=1,
        max_items=5
    )
    
    secondary: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Secondary stakeholders with name and description",
        max_items=5
    )
    
    industry: str = Field(
        ...,
        description="Industry classification for the business",
        min_length=3,
        max_length=50
    )

    @validator('primary', 'secondary')
    def validate_stakeholder_structure(cls, v):
        """Ensure each stakeholder has name and description."""
        for stakeholder in v:
            if not isinstance(stakeholder, dict):
                raise ValueError("Each stakeholder must be a dictionary")
            if 'name' not in stakeholder or 'description' not in stakeholder:
                raise ValueError("Each stakeholder must have 'name' and 'description'")
            if not stakeholder['name'].strip() or not stakeholder['description'].strip():
                raise ValueError("Stakeholder name and description cannot be empty")
        return v
