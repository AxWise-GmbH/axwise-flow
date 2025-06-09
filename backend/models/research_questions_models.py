"""
Research Questions models for Research API V3.

This module contains enhanced models for research question generation
with categorization, validation, and stakeholder-specific customization.
"""

from typing import Dict, List, Optional, Literal, Any
from pydantic import BaseModel, Field, field_validator, model_validator


class ResearchQuestion(BaseModel):
    """Individual research question with comprehensive metadata."""

    question: str = Field(..., min_length=10, max_length=200, description="The research question")
    category: Literal["problem_discovery", "solution_validation", "follow_up"] = Field(
        ..., description="Question category"
    )

    # Question characteristics
    priority: Literal["high", "medium", "low"] = Field(
        default="medium", description="Priority level for this question"
    )
    difficulty: Literal["easy", "medium", "hard"] = Field(
        default="medium", description="Difficulty level for respondents"
    )

    # Targeting
    stakeholder_focus: Optional[str] = Field(
        None, description="Specific stakeholder group this question targets"
    )
    industry_specific: bool = Field(
        default=False, description="Whether this question is industry-specific"
    )

    # Expected outcomes
    expected_insight: str = Field(
        ..., description="What insight this question should provide"
    )
    insight_type: Literal[
        "pain_point", "behavior", "preference", "decision_factor",
        "workflow", "barrier", "motivation", "validation"
    ] = Field(..., description="Type of insight expected")

    # Question metadata
    estimated_time_minutes: int = Field(
        default=2, ge=1, le=10, description="Estimated time to answer in minutes"
    )
    follow_up_potential: bool = Field(
        default=False, description="Whether this question likely needs follow-ups"
    )

    # Quality score (computed property)
    @property
    def question_quality_score(self) -> float:
        """Calculate quality score for this individual question."""
        score = 0.0

        # Length score (optimal 8-15 words)
        word_count = len(self.question.split())
        if 8 <= word_count <= 15:
            score += 0.3
        elif 5 <= word_count <= 20:
            score += 0.2
        else:
            score += 0.1

        # Clarity score (based on question structure)
        if self.question.lower().startswith(('what', 'how', 'why', 'when', 'where')):
            score += 0.3
        elif self.question.lower().startswith(('can', 'do', 'would', 'could')):
            score += 0.2
        else:
            score += 0.1

        # Priority score
        priority_scores = {"high": 0.3, "medium": 0.2, "low": 0.1}
        score += priority_scores.get(self.priority, 0.1)

        # Difficulty appropriateness
        if self.difficulty == "medium":
            score += 0.1  # Medium is usually optimal
        else:
            score += 0.05

        return min(1.0, score)

    @field_validator('question')
    @classmethod
    def validate_question_format(cls, v):
        """Ensure question is well-formed and ends with question mark."""
        v = v.strip()

        # Ensure it ends with a question mark
        if not v.endswith('?'):
            v = v + '?'

        # Basic quality checks
        if len(v.split()) < 3:
            raise ValueError("Question must contain at least 3 words")

        # Check for leading question words
        question_starters = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'do', 'would', 'could', 'should']
        first_word = v.lower().split()[0]

        if first_word not in question_starters:
            # This might be a statement, try to make it a question
            if not any(starter in v.lower() for starter in question_starters):
                raise ValueError(f"Question should start with a question word: {', '.join(question_starters)}")

        return v

    @field_validator('expected_insight')
    @classmethod
    def validate_insight_description(cls, v):
        """Ensure insight description is meaningful."""
        if len(v.strip()) < 10:
            raise ValueError("Expected insight must be at least 10 characters")
        return v.strip()


class QuestionCategory(BaseModel):
    """Category of questions with metadata."""

    name: Literal["problem_discovery", "solution_validation", "follow_up"]
    questions: List[ResearchQuestion] = Field(..., min_items=1)
    category_description: str = Field(..., description="Purpose of this question category")
    estimated_total_time: int = Field(..., description="Total estimated time for this category")

    @field_validator('estimated_total_time')
    @classmethod
    def calculate_total_time(cls, v, info):
        """Calculate total time based on individual question times."""
        questions = info.data.get('questions', [])
        if questions:
            return sum(q.estimated_time_minutes for q in questions)
        return v


class EnhancedResearchQuestions(BaseModel):
    """Comprehensive research questions with advanced categorization and metadata."""

    # Question categories
    problem_discovery: List[ResearchQuestion] = Field(
        ..., min_items=3, max_items=7, description="Questions to discover and validate problems"
    )
    solution_validation: List[ResearchQuestion] = Field(
        ..., min_items=3, max_items=7, description="Questions to validate solution approach"
    )
    follow_up: List[ResearchQuestion] = Field(
        ..., min_items=2, max_items=5, description="Follow-up and clarification questions"
    )

    # Overall metadata
    total_questions: int = Field(..., description="Total number of questions across all categories")
    estimated_interview_time: int = Field(..., description="Total estimated interview time in minutes")
    difficulty_level: Literal["beginner", "intermediate", "advanced"] = Field(
        default="intermediate", description="Overall difficulty level of the question set"
    )

    # Customization metadata
    industry_customization: str = Field(
        ..., description="How questions are customized for the specific industry"
    )
    stakeholder_considerations: str = Field(
        ..., description="Multi-stakeholder considerations in question design"
    )
    methodology_alignment: List[str] = Field(
        default_factory=list, description="Research methodologies these questions align with"
    )

    # Quality metrics
    question_quality_score: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Overall quality score of the question set"
    )
    coverage_completeness: float = Field(
        default=0.0, ge=0.0, le=1.0, description="How completely the questions cover the research area"
    )

    # Context and guidance
    interview_guidance: str = Field(
        ..., description="Guidance for conducting interviews with these questions"
    )
    analysis_framework: str = Field(
        ..., description="Framework for analyzing responses to these questions"
    )

    @field_validator('total_questions')
    @classmethod
    def calculate_total_questions(cls, v, info):
        """Calculate total questions across all categories."""
        problem = len(info.data.get('problem_discovery', []))
        solution = len(info.data.get('solution_validation', []))
        follow_up = len(info.data.get('follow_up', []))
        return problem + solution + follow_up

    @field_validator('estimated_interview_time')
    @classmethod
    def calculate_interview_time(cls, v, info):
        """Calculate total estimated interview time."""
        all_questions = []
        all_questions.extend(info.data.get('problem_discovery', []))
        all_questions.extend(info.data.get('solution_validation', []))
        all_questions.extend(info.data.get('follow_up', []))

        base_time = sum(q.estimated_time_minutes for q in all_questions)

        # Add buffer time for conversation flow, clarifications, etc.
        buffer_multiplier = 1.3  # 30% buffer
        return int(base_time * buffer_multiplier)

    @field_validator('difficulty_level')
    @classmethod
    def determine_difficulty_level(cls, v, info):
        """Determine overall difficulty based on individual question difficulties."""
        all_questions = []
        all_questions.extend(info.data.get('problem_discovery', []))
        all_questions.extend(info.data.get('solution_validation', []))
        all_questions.extend(info.data.get('follow_up', []))

        if not all_questions:
            return "intermediate"

        difficulty_scores = {"easy": 1, "medium": 2, "hard": 3}
        avg_difficulty = sum(difficulty_scores.get(q.difficulty, 2) for q in all_questions) / len(all_questions)

        if avg_difficulty <= 1.5:
            return "beginner"
        elif avg_difficulty <= 2.5:
            return "intermediate"
        else:
            return "advanced"

    @model_validator(mode='after')
    def validate_question_set_quality(self):
        """Validate overall question set quality and completeness."""
        all_questions = self.problem_discovery + self.solution_validation + self.follow_up

        # Calculate quality score based on various factors
        quality_factors = {
            "question_count": min(len(all_questions) / 12, 1.0),  # Optimal around 12 questions
            "category_balance": self._calculate_category_balance(),
            "stakeholder_coverage": self._calculate_stakeholder_coverage(all_questions),
            "insight_diversity": self._calculate_insight_diversity(all_questions),
            "priority_distribution": self._calculate_priority_distribution(all_questions)
        }

        self.question_quality_score = sum(quality_factors.values()) / len(quality_factors)

        # Calculate coverage completeness
        required_insight_types = [
            "pain_point", "behavior", "decision_factor", "workflow", "barrier", "motivation"
        ]
        covered_insights = set(q.insight_type for q in all_questions)
        self.coverage_completeness = len(covered_insights.intersection(required_insight_types)) / len(required_insight_types)

        return self

    def _calculate_category_balance(self) -> float:
        """Calculate how well-balanced the question categories are."""
        total = len(self.problem_discovery) + len(self.solution_validation) + len(self.follow_up)
        if total == 0:
            return 0.0

        # Ideal distribution: 40% problem, 40% solution, 20% follow-up
        ideal_ratios = [0.4, 0.4, 0.2]
        actual_ratios = [
            len(self.problem_discovery) / total,
            len(self.solution_validation) / total,
            len(self.follow_up) / total
        ]

        # Calculate deviation from ideal
        deviations = [abs(actual - ideal) for actual, ideal in zip(actual_ratios, ideal_ratios)]
        avg_deviation = sum(deviations) / len(deviations)

        return max(0.0, 1.0 - (avg_deviation * 2))  # Convert to 0-1 score

    def _calculate_stakeholder_coverage(self, questions: List[ResearchQuestion]) -> float:
        """Calculate how well questions cover different stakeholders."""
        stakeholder_focused = [q for q in questions if q.stakeholder_focus]
        if not questions:
            return 0.0
        return len(stakeholder_focused) / len(questions)

    def _calculate_insight_diversity(self, questions: List[ResearchQuestion]) -> float:
        """Calculate diversity of insight types covered."""
        insight_types = set(q.insight_type for q in questions)
        max_possible_types = 8  # Number of insight types available
        return len(insight_types) / max_possible_types

    def _calculate_priority_distribution(self, questions: List[ResearchQuestion]) -> float:
        """Calculate how well priorities are distributed."""
        if not questions:
            return 0.0

        priority_counts = {"high": 0, "medium": 0, "low": 0}
        for q in questions:
            priority_counts[q.priority] += 1

        total = len(questions)
        # Ideal: 30% high, 50% medium, 20% low
        ideal_distribution = {"high": 0.3, "medium": 0.5, "low": 0.2}

        score = 0.0
        for priority, ideal_ratio in ideal_distribution.items():
            actual_ratio = priority_counts[priority] / total
            deviation = abs(actual_ratio - ideal_ratio)
            score += max(0.0, 1.0 - (deviation * 2))

        return score / len(ideal_distribution)
