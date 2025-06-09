"""
Enhanced Pydantic models for Research API V3 with Instructor integration.

This module contains comprehensive models that combine all V1 functionality
with enhanced validation and structured outputs for Instructor.
"""

from typing import Dict, List, Optional, Literal, Any, Union, TYPE_CHECKING
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum
from datetime import datetime

# Forward references for type hints
if TYPE_CHECKING:
    from industry_stakeholder_models import IndustryAnalysis, StakeholderAnalysis
    from research_questions_models import EnhancedResearchQuestions


class ConversationStage(str, Enum):
    """Conversation stages for research flow."""
    INITIAL = "initial"
    BUSINESS_DISCOVERY = "business_discovery"
    TARGET_CUSTOMER_DISCOVERY = "target_customer_discovery"
    PROBLEM_VALIDATION = "problem_validation"
    SOLUTION_VALIDATION = "solution_validation"
    CONFIRMATION = "confirmation"
    QUESTIONS_READY = "questions_ready"
    COMPLETED = "completed"


class UserIntent(BaseModel):
    """Advanced user intent analysis with emotional context."""

    primary_intent: Literal[
        "confirmation", "rejection", "clarification", "continuation",
        "question_request", "topic_change", "completion", "help_request"
    ] = Field(..., description="Primary user intent")

    secondary_intent: Optional[str] = Field(None, description="Secondary or nuanced intent")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in intent classification")
    reasoning: str = Field(..., min_length=10, description="Reasoning for intent classification")

    # Specific feedback analysis
    specific_feedback: str = Field(..., description="What specifically the user is addressing")
    emotional_tone: Literal["positive", "neutral", "negative", "frustrated", "excited"] = Field(
        default="neutral", description="Emotional tone of the user's message"
    )
    urgency_level: Literal["low", "medium", "high"] = Field(
        default="medium", description="Urgency level of the user's request"
    )

    # Action recommendations
    recommended_response_type: Literal[
        "acknowledge_and_continue", "ask_clarification", "provide_confirmation",
        "generate_questions", "redirect_conversation", "provide_help"
    ] = Field(..., description="Recommended response type")

    next_action: str = Field(..., description="Specific next action for the assistant")

    @field_validator('recommended_response_type')
    @classmethod
    def determine_response_type(cls, v, info):
        """Auto-determine response type based on intent."""
        intent_mapping = {
            "confirmation": "generate_questions",
            "rejection": "ask_clarification",
            "clarification": "acknowledge_and_continue",
            "continuation": "acknowledge_and_continue",
            "question_request": "generate_questions",
            "topic_change": "redirect_conversation",
            "completion": "provide_confirmation",
            "help_request": "provide_help"
        }

        primary_intent = info.data.get('primary_intent')
        return intent_mapping.get(primary_intent, "acknowledge_and_continue")


class BusinessReadiness(BaseModel):
    """Comprehensive business readiness assessment for question generation."""

    ready_for_questions: bool = Field(..., description="Ready to generate research questions")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence in readiness assessment")
    reasoning: str = Field(..., min_length=20, description="Detailed reasoning for assessment")

    # Granular clarity scores
    business_clarity: Dict[str, float] = Field(
        ..., description="Clarity scores for different business aspects"
    )
    conversation_quality: Literal["low", "medium", "high"] = Field(
        ..., description="Overall conversation quality assessment"
    )

    # Missing elements and improvements
    missing_elements: List[str] = Field(
        default_factory=list, description="What information is still needed"
    )
    improvement_suggestions: List[str] = Field(
        default_factory=list, description="How to improve readiness for questions"
    )

    # Validation thresholds
    minimum_clarity_threshold: float = Field(
        default=0.7, description="Minimum clarity threshold for readiness"
    )

    @field_validator('business_clarity')
    @classmethod
    def validate_clarity_scores(cls, v):
        """Ensure all clarity scores are valid and complete."""
        required_aspects = ['idea_clarity', 'customer_clarity', 'problem_clarity']

        for aspect in required_aspects:
            if aspect not in v:
                v[aspect] = 0.0
            elif not 0.0 <= v[aspect] <= 1.0:
                raise ValueError(f"{aspect} must be between 0.0 and 1.0")

        return v

    @model_validator(mode='after')
    def validate_readiness_logic(self):
        """Validate readiness based on clarity scores and quality."""
        if not self.business_clarity:
            self.ready_for_questions = False
            return self

        avg_clarity = sum(self.business_clarity.values()) / len(self.business_clarity)

        # Override readiness if clarity is too low
        if avg_clarity < self.minimum_clarity_threshold:
            self.ready_for_questions = False
            if "insufficient_clarity" not in self.missing_elements:
                self.missing_elements.append("insufficient_clarity")

        # Override if conversation quality is too low
        if self.conversation_quality == "low":
            self.ready_for_questions = False
            if "conversation_quality" not in self.missing_elements:
                self.missing_elements.append("conversation_quality")

        return self


class ResearchContext(BaseModel):
    """Simple research context for compatibility with V1/V2 APIs."""

    businessIdea: Optional[str] = Field(None, description="Business idea description")
    targetCustomer: Optional[str] = Field(None, description="Target customer description")
    problem: Optional[str] = Field(None, description="Problem being solved")
    stage: Optional[str] = Field(None, description="Current research stage")
    questionsGenerated: Optional[bool] = Field(None, description="Whether questions have been generated")


class BusinessContext(BaseModel):
    """Comprehensive business context extraction with completeness scoring."""

    business_idea: Optional[str] = Field(
        None, max_length=500, description="Detailed product/service description"
    )
    target_customer: Optional[str] = Field(
        None, max_length=300, description="Specific customer segments and personas"
    )
    problem: Optional[str] = Field(
        None, max_length=400, description="Core problem being solved"
    )
    solution_approach: Optional[str] = Field(
        None, max_length=400, description="How they plan to solve the problem"
    )
    market_context: Optional[str] = Field(
        None, max_length=300, description="Market and industry context"
    )
    competitive_landscape: Optional[str] = Field(
        None, max_length=300, description="Competitors and alternatives mentioned"
    )
    business_model: Optional[str] = Field(
        None, max_length=200, description="Revenue model and monetization approach"
    )
    business_stage: Optional[Literal["idea", "prototype", "mvp", "launched", "scaling"]] = Field(
        None, description="Current stage of business development"
    )

    # Derived fields
    completeness_score: float = Field(
        default=0.0, ge=0.0, le=1.0, description="How complete the business context is"
    )
    missing_elements: List[str] = Field(
        default_factory=list, description="What information is still needed"
    )
    context_quality: Literal["low", "medium", "high"] = Field(
        default="low", description="Quality of the extracted context"
    )

    @model_validator(mode='after')
    def calculate_completeness_and_quality(self):
        """Calculate completeness score and determine quality."""
        # Core required fields for completeness
        core_fields = ['business_idea', 'target_customer', 'problem']
        additional_fields = ['solution_approach', 'market_context', 'business_model']

        # Calculate completeness
        core_filled = sum(1 for field in core_fields if getattr(self, field))
        additional_filled = sum(1 for field in additional_fields if getattr(self, field))

        # Core fields are weighted more heavily
        self.completeness_score = (core_filled * 0.6 + additional_filled * 0.4) / (len(core_fields) * 0.6 + len(additional_fields) * 0.4)

        # Identify missing elements
        self.missing_elements = []
        for field in core_fields:
            if not getattr(self, field):
                self.missing_elements.append(field.replace('_', ' ').title())

        # Determine context quality
        if self.completeness_score >= 0.8:
            self.context_quality = "high"
        elif self.completeness_score >= 0.5:
            self.context_quality = "medium"
        else:
            self.context_quality = "low"

        return self


class ConversationFlow(BaseModel):
    """Advanced conversation stage management and flow control."""

    current_stage: ConversationStage = Field(..., description="Current conversation stage")
    next_stage: Optional[ConversationStage] = Field(None, description="Next logical stage")
    stage_progress: float = Field(
        ..., ge=0.0, le=1.0, description="Progress within current stage"
    )
    conversation_quality: Literal["low", "medium", "high"] = Field(
        ..., description="Quality of information gathered so far"
    )
    readiness_for_questions: bool = Field(
        ..., description="Ready to generate research questions"
    )

    # Transition logic
    should_advance_stage: bool = Field(
        default=False, description="Whether to advance to next stage"
    )
    advancement_reason: Optional[str] = Field(
        None, description="Reason for stage advancement"
    )
    stage_completion_criteria: Dict[str, bool] = Field(
        default_factory=dict, description="Completion criteria for current stage"
    )

    @field_validator('next_stage')
    @classmethod
    def determine_next_stage(cls, v, info):
        """Determine the next logical stage in the conversation flow."""
        current = info.data.get('current_stage')
        if not current:
            return None

        stage_progression = {
            ConversationStage.INITIAL: ConversationStage.BUSINESS_DISCOVERY,
            ConversationStage.BUSINESS_DISCOVERY: ConversationStage.TARGET_CUSTOMER_DISCOVERY,
            ConversationStage.TARGET_CUSTOMER_DISCOVERY: ConversationStage.PROBLEM_VALIDATION,
            ConversationStage.PROBLEM_VALIDATION: ConversationStage.SOLUTION_VALIDATION,
            ConversationStage.SOLUTION_VALIDATION: ConversationStage.CONFIRMATION,
            ConversationStage.CONFIRMATION: ConversationStage.QUESTIONS_READY,
            ConversationStage.QUESTIONS_READY: ConversationStage.COMPLETED
        }

        return stage_progression.get(current)

    @model_validator(mode='after')
    def validate_stage_logic(self):
        """Validate stage progression logic and completion criteria."""
        # Define completion criteria for each stage
        stage_criteria = {
            ConversationStage.INITIAL: {"user_engaged": True},
            ConversationStage.BUSINESS_DISCOVERY: {"business_idea_clear": True},
            ConversationStage.TARGET_CUSTOMER_DISCOVERY: {"target_customer_defined": True},
            ConversationStage.PROBLEM_VALIDATION: {"problem_articulated": True},
            ConversationStage.SOLUTION_VALIDATION: {"solution_approach_clear": True},
            ConversationStage.CONFIRMATION: {"user_confirmed": True},
            ConversationStage.QUESTIONS_READY: {"questions_generated": True},
            ConversationStage.COMPLETED: {"conversation_finished": True}
        }

        # Set completion criteria for current stage
        if self.current_stage in stage_criteria:
            self.stage_completion_criteria = stage_criteria[self.current_stage]

        return self


class EnhancedResearchResponse(BaseModel):
    """Master response model that combines all research analysis in a single call."""

    # Core conversational response
    content: str = Field(..., min_length=10, description="Conversational response to user")

    # Analysis components
    user_intent: UserIntent = Field(..., description="Analyzed user intent and recommendations")
    business_readiness: BusinessReadiness = Field(..., description="Business context readiness assessment")
    extracted_context: BusinessContext = Field(..., description="Extracted business information")
    conversation_flow: ConversationFlow = Field(..., description="Conversation stage and flow management")

    # Interactive elements
    quick_replies: List[str] = Field(
        ..., min_items=3, max_items=3, description="Contextual quick reply suggestions"
    )

    # Conditional elements (populated based on readiness and intent)
    should_show_confirmation: bool = Field(
        default=False, description="Whether to show confirmation dialog"
    )
    confirmation_summary: Optional[str] = Field(
        None, description="Summary for user confirmation if ready"
    )

    # Questions (only if user confirmed and ready)
    research_questions: Optional['EnhancedResearchQuestions'] = Field(
        None, description="Generated research questions if ready and confirmed"
    )

    # Industry and stakeholder analysis (populated when sufficient context)
    industry_analysis: Optional['IndustryAnalysis'] = Field(
        None, description="Industry classification and guidance"
    )
    stakeholder_analysis: Optional['StakeholderAnalysis'] = Field(
        None, description="Stakeholder detection and analysis"
    )

    # Metadata
    response_metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional response metadata"
    )
    processing_time_ms: Optional[int] = Field(
        None, description="Processing time in milliseconds"
    )

    @model_validator(mode='after')
    def validate_response_logic(self):
        """Validate the logical consistency of the response."""
        # If business is ready but user hasn't confirmed, show confirmation
        if (self.business_readiness.ready_for_questions and
            self.user_intent.primary_intent != "confirmation" and
            not self.should_show_confirmation):
            self.should_show_confirmation = True

        # Populate response metadata
        self.response_metadata.update({
            "workflow_version": "v3_instructor_unified",
            "conversation_stage": self.conversation_flow.current_stage,
            "readiness_score": self.business_readiness.confidence,
            "context_completeness": self.extracted_context.completeness_score,
            "questions_generated": bool(self.research_questions),
            "stakeholders_detected": bool(self.stakeholder_analysis),
            "industry_classified": bool(self.industry_analysis)
        })

        return self


# Rebuild models after all are defined to resolve forward references
def rebuild_models():
    """Rebuild models to resolve forward references."""
    try:
        # Import the required models first
        from .research_questions_models import EnhancedResearchQuestions
        from .industry_stakeholder_models import IndustryAnalysis, StakeholderAnalysis

        # Now rebuild the model
        EnhancedResearchResponse.model_rebuild()
        print("✅ EnhancedResearchResponse model rebuilt successfully")
    except Exception as e:
        print(f"⚠️ Model rebuild warning: {e}")
        pass  # Forward references may not be available yet

# Call rebuild immediately when module is imported
rebuild_models()
