"""
Enhanced Conversation Flow Management Service for Research API V3.

This service manages conversation stages, flow control, and progression logic
combining V1 stage determination with enhanced Pydantic models.
"""

import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from backend.models.enhanced_research_models import (
    ConversationStage, ConversationFlow, BusinessContext,
    BusinessReadiness, UserIntent
)
from backend.services.llm.instructor_gemini_client import EnhancedInstructorGeminiClient

logger = logging.getLogger(__name__)


@dataclass
class ConversationFlowConfig:
    """Configuration for conversation flow management."""

    # Stage progression rules (from V1)
    STAGE_PROGRESSION = {
        ConversationStage.INITIAL: ConversationStage.BUSINESS_DISCOVERY,
        ConversationStage.BUSINESS_DISCOVERY: ConversationStage.TARGET_CUSTOMER_DISCOVERY,
        ConversationStage.TARGET_CUSTOMER_DISCOVERY: ConversationStage.PROBLEM_VALIDATION,
        ConversationStage.PROBLEM_VALIDATION: ConversationStage.SOLUTION_VALIDATION,
        ConversationStage.SOLUTION_VALIDATION: ConversationStage.CONFIRMATION,
        ConversationStage.CONFIRMATION: ConversationStage.QUESTIONS_READY,
        ConversationStage.QUESTIONS_READY: ConversationStage.COMPLETED
    }

    # Stage completion criteria
    STAGE_COMPLETION_CRITERIA = {
        ConversationStage.INITIAL: {
            "user_engaged": True,
            "conversation_started": True
        },
        ConversationStage.BUSINESS_DISCOVERY: {
            "business_idea_mentioned": True,
            "idea_clarity_threshold": 0.6
        },
        ConversationStage.TARGET_CUSTOMER_DISCOVERY: {
            "target_customer_mentioned": True,
            "customer_clarity_threshold": 0.6
        },
        ConversationStage.PROBLEM_VALIDATION: {
            "problem_mentioned": True,
            "problem_clarity_threshold": 0.6
        },
        ConversationStage.SOLUTION_VALIDATION: {
            "solution_approach_mentioned": True,
            "overall_clarity_threshold": 0.7
        },
        ConversationStage.CONFIRMATION: {
            "user_confirmed": True,
            "business_ready": True
        },
        ConversationStage.QUESTIONS_READY: {
            "questions_generated": True
        },
        ConversationStage.COMPLETED: {
            "conversation_finished": True
        }
    }

    # Minimum exchanges for progression (from V1)
    MIN_EXCHANGES_FOR_QUESTIONS = 3


class EnhancedConversationFlowService:
    """
    Enhanced conversation flow service that manages stage progression and flow control.

    This service provides:
    - Intelligent stage determination and progression
    - Flow control based on context and readiness
    - Stage completion validation
    - Conversation quality assessment
    """

    def __init__(self, instructor_client: Optional[EnhancedInstructorGeminiClient] = None):
        """Initialize the conversation flow service."""
        self.instructor_client = instructor_client or EnhancedInstructorGeminiClient()
        self.config = ConversationFlowConfig()

    async def determine_conversation_flow(
        self,
        business_context: BusinessContext,
        business_readiness: BusinessReadiness,
        user_intent: UserIntent,
        conversation_history: List[Dict[str, str]],
        current_stage: Optional[ConversationStage] = None
    ) -> ConversationFlow:
        """
        Determine comprehensive conversation flow and stage management.

        Args:
            business_context: Current business context
            business_readiness: Business readiness assessment
            user_intent: User intent analysis
            conversation_history: List of conversation messages
            current_stage: Optional current stage override

        Returns:
            ConversationFlow model with comprehensive flow information
        """
        logger.info("Determining conversation flow and stage progression")

        # Determine current stage if not provided
        if current_stage is None:
            current_stage = self._determine_current_stage(business_context, conversation_history)

        # Calculate stage progress
        stage_progress = self._calculate_stage_progress(current_stage, business_context, business_readiness)

        # Determine conversation quality
        conversation_quality = self._assess_conversation_quality(
            business_context, business_readiness, conversation_history
        )

        # Check readiness for questions
        readiness_for_questions = self._check_readiness_for_questions(
            business_readiness, user_intent, conversation_history
        )

        # Determine if stage should advance
        should_advance_stage, advancement_reason = self._should_advance_stage(
            current_stage, business_context, business_readiness, user_intent
        )

        # Get next stage
        next_stage = self.config.STAGE_PROGRESSION.get(current_stage)

        # Get stage completion criteria
        stage_completion_criteria = self._evaluate_stage_completion(
            current_stage, business_context, business_readiness, user_intent
        )

        return ConversationFlow(
            current_stage=current_stage,
            next_stage=next_stage,
            stage_progress=stage_progress,
            conversation_quality=conversation_quality,
            readiness_for_questions=readiness_for_questions,
            should_advance_stage=should_advance_stage,
            advancement_reason=advancement_reason,
            stage_completion_criteria=stage_completion_criteria
        )

    def _determine_current_stage(
        self,
        business_context: BusinessContext,
        conversation_history: List[Dict[str, str]]
    ) -> ConversationStage:
        """Determine current conversation stage based on context (V1 logic enhanced)."""

        # Check if conversation has started
        if not conversation_history or len(conversation_history) < 2:
            return ConversationStage.INITIAL

        # Check business idea clarity
        if not business_context.business_idea or business_context.completeness_score < 0.3:
            return ConversationStage.BUSINESS_DISCOVERY

        # Check target customer clarity
        if not business_context.target_customer:
            return ConversationStage.TARGET_CUSTOMER_DISCOVERY

        # Check problem clarity
        if not business_context.problem:
            return ConversationStage.PROBLEM_VALIDATION

        # Check if we have solution approach
        if not business_context.solution_approach:
            return ConversationStage.SOLUTION_VALIDATION

        # If we have good context, move to confirmation
        if business_context.completeness_score >= 0.7:
            return ConversationStage.CONFIRMATION

        # Default to business discovery if unclear
        return ConversationStage.BUSINESS_DISCOVERY

    def _calculate_stage_progress(
        self,
        current_stage: ConversationStage,
        business_context: BusinessContext,
        business_readiness: BusinessReadiness
    ) -> float:
        """Calculate progress within the current stage."""

        if current_stage == ConversationStage.INITIAL:
            return 1.0  # Always complete once we start

        elif current_stage == ConversationStage.BUSINESS_DISCOVERY:
            if business_context.business_idea:
                clarity = business_readiness.business_clarity.get('idea_clarity', 0.0)
                return min(clarity + 0.2, 1.0)  # Add bonus for having any idea
            return 0.1

        elif current_stage == ConversationStage.TARGET_CUSTOMER_DISCOVERY:
            if business_context.target_customer:
                clarity = business_readiness.business_clarity.get('customer_clarity', 0.0)
                return min(clarity + 0.2, 1.0)
            return 0.1

        elif current_stage == ConversationStage.PROBLEM_VALIDATION:
            if business_context.problem:
                clarity = business_readiness.business_clarity.get('problem_clarity', 0.0)
                return min(clarity + 0.2, 1.0)
            return 0.1

        elif current_stage == ConversationStage.SOLUTION_VALIDATION:
            return business_context.completeness_score

        elif current_stage == ConversationStage.CONFIRMATION:
            return 0.8 if business_readiness.ready_for_questions else 0.3

        elif current_stage == ConversationStage.QUESTIONS_READY:
            return 1.0

        elif current_stage == ConversationStage.COMPLETED:
            return 1.0

        return 0.0

    def _assess_conversation_quality(
        self,
        business_context: BusinessContext,
        business_readiness: BusinessReadiness,
        conversation_history: List[Dict[str, str]]
    ) -> str:
        """Assess overall conversation quality."""

        # Factor 1: Context completeness
        completeness_score = business_context.completeness_score

        # Factor 2: Business readiness confidence
        readiness_confidence = business_readiness.confidence

        # Factor 3: Conversation length and depth
        conversation_length = len(conversation_history)
        length_score = min(conversation_length / 10, 1.0)  # Normalize to 10 exchanges

        # Factor 4: Context quality from business context
        context_quality_score = {
            "high": 1.0,
            "medium": 0.6,
            "low": 0.3
        }.get(business_context.context_quality, 0.3)

        # Calculate overall quality
        overall_score = (
            completeness_score * 0.3 +
            readiness_confidence * 0.3 +
            length_score * 0.2 +
            context_quality_score * 0.2
        )

        if overall_score >= 0.7:
            return "high"
        elif overall_score >= 0.4:
            return "medium"
        else:
            return "low"

    def _check_readiness_for_questions(
        self,
        business_readiness: BusinessReadiness,
        user_intent: UserIntent,
        conversation_history: List[Dict[str, str]]
    ) -> bool:
        """Check if ready for research questions (V1 logic enhanced)."""

        # Must have business readiness
        if not business_readiness.ready_for_questions:
            return False

        # Must have minimum conversation exchanges
        if len(conversation_history) < self.config.MIN_EXCHANGES_FOR_QUESTIONS:
            return False

        # User must have confirmed or requested questions
        if user_intent.primary_intent in ["confirmation", "question_request"]:
            return True

        # High confidence readiness can override intent
        if business_readiness.confidence >= 0.8:
            return True

        return False

    def _should_advance_stage(
        self,
        current_stage: ConversationStage,
        business_context: BusinessContext,
        business_readiness: BusinessReadiness,
        user_intent: UserIntent
    ) -> tuple[bool, Optional[str]]:
        """Determine if stage should advance and why."""

        criteria = self.config.STAGE_COMPLETION_CRITERIA.get(current_stage, {})

        if current_stage == ConversationStage.INITIAL:
            return True, "Conversation has started"

        elif current_stage == ConversationStage.BUSINESS_DISCOVERY:
            if business_context.business_idea:
                clarity = business_readiness.business_clarity.get('idea_clarity', 0.0)
                threshold = criteria.get('idea_clarity_threshold', 0.6)
                if clarity >= threshold:
                    return True, f"Business idea clarity ({clarity:.2f}) meets threshold ({threshold})"

        elif current_stage == ConversationStage.TARGET_CUSTOMER_DISCOVERY:
            if business_context.target_customer:
                clarity = business_readiness.business_clarity.get('customer_clarity', 0.0)
                threshold = criteria.get('customer_clarity_threshold', 0.6)
                if clarity >= threshold:
                    return True, f"Customer clarity ({clarity:.2f}) meets threshold ({threshold})"

        elif current_stage == ConversationStage.PROBLEM_VALIDATION:
            if business_context.problem:
                clarity = business_readiness.business_clarity.get('problem_clarity', 0.0)
                threshold = criteria.get('problem_clarity_threshold', 0.6)
                if clarity >= threshold:
                    return True, f"Problem clarity ({clarity:.2f}) meets threshold ({threshold})"

        elif current_stage == ConversationStage.SOLUTION_VALIDATION:
            threshold = criteria.get('overall_clarity_threshold', 0.7)
            if business_context.completeness_score >= threshold:
                return True, f"Overall completeness ({business_context.completeness_score:.2f}) meets threshold ({threshold})"

        elif current_stage == ConversationStage.CONFIRMATION:
            if user_intent.primary_intent == "confirmation" and business_readiness.ready_for_questions:
                return True, "User confirmed and business is ready"

        return False, None

    def _evaluate_stage_completion(
        self,
        current_stage: ConversationStage,
        business_context: BusinessContext,
        business_readiness: BusinessReadiness,
        user_intent: UserIntent
    ) -> Dict[str, bool]:
        """Evaluate stage completion criteria."""

        criteria = self.config.STAGE_COMPLETION_CRITERIA.get(current_stage, {})
        completion_status = {}

        for criterion, expected_value in criteria.items():
            if criterion == "user_engaged":
                completion_status[criterion] = True  # Assume engaged if we're here
            elif criterion == "conversation_started":
                completion_status[criterion] = True  # Assume started if we're here
            elif criterion == "business_idea_mentioned":
                completion_status[criterion] = bool(business_context.business_idea)
            elif criterion == "target_customer_mentioned":
                completion_status[criterion] = bool(business_context.target_customer)
            elif criterion == "problem_mentioned":
                completion_status[criterion] = bool(business_context.problem)
            elif criterion == "solution_approach_mentioned":
                completion_status[criterion] = bool(business_context.solution_approach)
            elif criterion == "user_confirmed":
                completion_status[criterion] = user_intent.primary_intent == "confirmation"
            elif criterion == "business_ready":
                completion_status[criterion] = business_readiness.ready_for_questions
            elif criterion == "questions_generated":
                completion_status[criterion] = False  # Will be set externally
            elif criterion == "conversation_finished":
                completion_status[criterion] = user_intent.primary_intent == "completion"
            elif criterion.endswith("_threshold"):
                # Handle threshold criteria
                threshold_value = expected_value
                if "idea_clarity" in criterion:
                    actual_value = business_readiness.business_clarity.get('idea_clarity', 0.0)
                elif "customer_clarity" in criterion:
                    actual_value = business_readiness.business_clarity.get('customer_clarity', 0.0)
                elif "problem_clarity" in criterion:
                    actual_value = business_readiness.business_clarity.get('problem_clarity', 0.0)
                elif "overall_clarity" in criterion:
                    actual_value = business_context.completeness_score
                else:
                    actual_value = 0.0

                completion_status[criterion] = actual_value >= threshold_value
            else:
                completion_status[criterion] = False

        return completion_status

    # V1 compatibility methods
    def determine_research_stage_v1_compatible(self, context: Optional[Dict[str, Any]]) -> str:
        """V1-compatible stage determination method."""

        if not context:
            return "initial"

        if not context.get('business_idea'):
            return "initial"
        elif not context.get('target_customer'):
            return "business_idea"
        elif not context.get('problem'):
            return "target_customer"
        else:
            return "validation"
