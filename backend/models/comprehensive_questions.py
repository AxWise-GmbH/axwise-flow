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
        max_items=7,
    )

    solutionValidation: List[str] = Field(
        ...,
        description="5 specific questions to validate the proposed solution with this stakeholder",
        min_items=3,
        max_items=7,
    )

    followUp: List[str] = Field(
        ...,
        description="3 follow-up questions to gather additional insights from this stakeholder",
        min_items=2,
        max_items=5,
    )

    @validator("problemDiscovery", "solutionValidation", "followUp")
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
        max_length=50,
    )

    description: str = Field(
        ...,
        description="Brief description of this stakeholder's role and relationship to the business",
        min_length=10,
        max_length=1000,  # Increased from 500 to allow more detailed descriptions
    )

    questions: StakeholderQuestions = Field(
        ..., description="Structured questions specific to this stakeholder"
    )

    @validator("name")
    def validate_name(cls, v):
        """Ensure stakeholder name is meaningful."""
        if not v.strip():
            raise ValueError("Stakeholder name cannot be empty")
        return v.strip()

    @validator("description")
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
        ge=0,  # Changed from 5 to 0 to allow fallback scenarios
        le=100,
    )

    estimatedMinutes: str = Field(
        ...,
        description="Estimated time range in minutes (e.g., '45-60')",
        # Removed strict pattern to allow more flexible formats like "30-45 minutes"
    )

    breakdown: Dict[str, Any] = Field(
        ..., description="Detailed breakdown of time estimates"
    )

    @validator("estimatedMinutes")
    def validate_estimated_minutes(cls, v):
        """Normalize estimated minutes to the expected format."""
        import re

        # Extract numbers from various formats
        # "30-45", "30-45 minutes", "30-45 minutes per interview", etc.
        numbers = re.findall(r"\d+", v)

        if len(numbers) >= 2:
            # Use first two numbers found
            return f"{numbers[0]}-{numbers[1]}"
        elif len(numbers) == 1:
            # Single number, create a range
            num = int(numbers[0])
            return f"{num}-{num + 15}"  # Add 15 minutes buffer
        else:
            # No numbers found, provide default
            return "15-30"

    @validator("breakdown")
    def validate_breakdown(cls, v):
        """Ensure breakdown contains required fields."""
        if not isinstance(v, dict):
            # If breakdown is empty or invalid, create a default structure
            return {"primary": 0, "secondary": 0}

        # Ensure required fields exist, add defaults if missing
        if "primary" not in v:
            v["primary"] = 0
        if "secondary" not in v:
            v["secondary"] = 0

        return v


class ComprehensiveQuestions(BaseModel):
    """Complete comprehensive research questions with stakeholder integration."""

    primaryStakeholders: List[Stakeholder] = Field(
        ...,
        description="Primary stakeholders who are directly affected by or involved with the business",
        min_items=0,  # Changed from 1 to 0 to allow fallback scenarios
        max_items=5,
    )

    secondaryStakeholders: List[Stakeholder] = Field(
        default_factory=list,
        description="Secondary stakeholders who have indirect influence or interest",
        max_items=5,
    )

    timeEstimate: TimeEstimate = Field(
        ..., description="Realistic time estimates for conducting all interviews"
    )

    @validator("primaryStakeholders")
    def validate_primary_stakeholders(cls, v):
        """Validate primary stakeholders (allow empty for fallback scenarios)."""
        # Allow empty list for fallback scenarios, but log a warning
        if not v:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(
                "No primary stakeholders provided - this may indicate a generation issue"
            )
        return v

    @validator("primaryStakeholders", "secondaryStakeholders")
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
        min_time = int(total_questions * 2)  # 2 minutes per question minimum
        max_time = int(total_questions * 4)  # 4 minutes per question maximum
        return (max(15, min_time), max(20, max_time))


class StakeholderDetection(BaseModel):
    """Detected stakeholders for a business context."""

    primary: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Primary stakeholders with name and description",
        min_items=0,  # FIXED: Allow empty arrays to prevent validation failures
        max_items=5,
    )

    secondary: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Secondary stakeholders with name and description",
        max_items=5,
    )

    industry: str = Field(
        ...,
        description="Industry classification for the business",
        min_length=3,
        max_length=50,
    )

    @validator("primary", "secondary")
    def validate_stakeholder_structure(cls, v):
        """Ensure each stakeholder has name and description."""
        import logging

        logger = logging.getLogger(__name__)

        # FIXED: Add logging to debug validation issues
        logger.debug(f"Validating stakeholders: {v}")

        validated_stakeholders = []

        for i, stakeholder in enumerate(v):
            if not isinstance(stakeholder, dict):
                # If it's not a dict, skip it or create a default
                logger.warning(
                    f"Skipping non-dict stakeholder at index {i}: {stakeholder}"
                )
                continue

            # Check for required fields and provide defaults if missing
            name = stakeholder.get("name", "").strip()
            description = stakeholder.get("description", "").strip()

            if not name:
                # Skip stakeholders without names
                logger.warning(
                    f"Skipping stakeholder without name at index {i}: {stakeholder}"
                )
                continue

            if not description:
                # Provide a default description if missing
                description = f"Stakeholder involved in {name.lower()} activities"
                logger.debug(f"Added default description for stakeholder: {name}")

            validated_stakeholders.append({"name": name, "description": description})

        logger.debug(
            f"Validation result: {len(validated_stakeholders)} stakeholders validated"
        )
        return validated_stakeholders
