"""
Response Orchestration Service for Research API V3.

This service handles complex response generation, content optimization,
and multi-modal response orchestration for the V3 research API.
"""

import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from enum import Enum

from backend.models.enhanced_research_models import (
    EnhancedResearchResponse, BusinessContext, BusinessReadiness,
    UserIntent, ConversationFlow, ConversationStage
)
from backend.models.industry_stakeholder_models import IndustryAnalysis, StakeholderAnalysis
from backend.models.research_questions_models import EnhancedResearchQuestions
from backend.services.llm.instructor_gemini_client import EnhancedInstructorGeminiClient

logger = logging.getLogger(__name__)


class ResponseType(Enum):
    """Types of responses that can be generated."""
    CONVERSATIONAL = "conversational"
    CONFIRMATION = "confirmation"
    CLARIFICATION = "clarification"
    QUESTION_GENERATION = "question_generation"
    GUIDANCE = "guidance"
    ERROR_RECOVERY = "error_recovery"


class ResponseTone(Enum):
    """Tone of voice for responses."""
    PROFESSIONAL = "professional"
    FRIENDLY = "friendly"
    CONSULTATIVE = "consultative"
    ENCOURAGING = "encouraging"
    DIRECT = "direct"


@dataclass
class ResponseContext:
    """Context for response generation."""

    response_type: ResponseType
    tone: ResponseTone
    user_expertise_level: str  # "beginner", "intermediate", "expert"
    conversation_length: int
    urgency_level: str  # "low", "medium", "high"

    # Content preferences
    include_examples: bool = True
    include_guidance: bool = True
    include_next_steps: bool = True
    max_response_length: int = 500


@dataclass
class ResponseMetrics:
    """Metrics for response quality and performance."""

    content_length: int
    readability_score: float
    engagement_score: float
    actionability_score: float
    personalization_score: float

    generation_time_ms: int
    template_used: Optional[str] = None
    fallback_used: bool = False


class ResponseOrchestrationService:
    """
    Service for orchestrating complex response generation.

    This service provides:
    - Intelligent response type selection
    - Content optimization and personalization
    - Multi-modal response generation
    - Quality scoring and optimization
    - Template-based response generation with customization
    """

    def __init__(self, instructor_client: Optional[EnhancedInstructorGeminiClient] = None):
        """Initialize the response orchestration service."""
        self.instructor_client = instructor_client or EnhancedInstructorGeminiClient()

        # Response templates
        self.response_templates = self._initialize_response_templates()

        # Quality thresholds
        self.quality_thresholds = {
            "min_readability": 0.7,
            "min_engagement": 0.6,
            "min_actionability": 0.8
        }

        logger.info("Response Orchestration Service initialized")

    async def orchestrate_response(
        self,
        enhanced_response: EnhancedResearchResponse,
        response_context: ResponseContext,
        session_metadata: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, List[str], ResponseMetrics]:
        """
        Orchestrate comprehensive response generation.

        Args:
            enhanced_response: The enhanced research response from analysis
            response_context: Context for response generation
            session_metadata: Optional session metadata

        Returns:
            Tuple of (response_content, quick_replies, metrics)
        """

        logger.info(f"Orchestrating {response_context.response_type.value} response")

        start_time = self._get_current_time_ms()

        # Determine optimal response strategy
        response_strategy = self._determine_response_strategy(
            enhanced_response, response_context
        )

        # Generate base content
        base_content = await self._generate_base_content(
            enhanced_response, response_context, response_strategy
        )

        # Optimize content
        optimized_content = await self._optimize_content(
            base_content, response_context, enhanced_response
        )

        # Generate quick replies
        quick_replies = self._generate_intelligent_quick_replies(
            enhanced_response, response_context
        )

        # Calculate metrics
        generation_time = self._get_current_time_ms() - start_time
        metrics = self._calculate_response_metrics(
            optimized_content, quick_replies, generation_time, response_strategy
        )

        # Quality check and potential regeneration
        if not self._meets_quality_threshold(metrics):
            logger.info("Response quality below threshold, attempting optimization")
            optimized_content, quick_replies = await self._improve_response_quality(
                optimized_content, quick_replies, enhanced_response, response_context
            )

            # Recalculate metrics
            metrics = self._calculate_response_metrics(
                optimized_content, quick_replies, generation_time, response_strategy
            )

        logger.info(f"Response orchestrated: {len(optimized_content)} chars, quality={metrics.engagement_score:.2f}")

        return optimized_content, quick_replies, metrics

    def _determine_response_strategy(
        self,
        enhanced_response: EnhancedResearchResponse,
        response_context: ResponseContext
    ) -> Dict[str, Any]:
        """Determine optimal response strategy based on context and analysis."""

        strategy = {
            "primary_approach": "conversational",
            "include_confirmation": False,
            "include_guidance": response_context.include_guidance,
            "include_examples": response_context.include_examples,
            "personalization_level": "medium",
            "template_base": None
        }

        # Adjust based on user intent
        if enhanced_response.user_intent.primary_intent == "confirmation":
            strategy["primary_approach"] = "confirmation"
            strategy["include_confirmation"] = True
            strategy["template_base"] = "confirmation_summary"

        elif enhanced_response.user_intent.primary_intent == "clarification":
            strategy["primary_approach"] = "clarification"
            strategy["include_guidance"] = True
            strategy["template_base"] = "clarification_request"

        elif enhanced_response.user_intent.recommended_response_type == "generate_questions":
            strategy["primary_approach"] = "question_generation"
            strategy["template_base"] = "question_introduction"

        # Adjust based on conversation stage
        if enhanced_response.conversation_flow.current_stage == ConversationStage.INITIAL:
            strategy["personalization_level"] = "low"
            strategy["include_guidance"] = True

        elif enhanced_response.conversation_flow.current_stage == ConversationStage.CONFIRMATION:
            strategy["include_confirmation"] = True
            strategy["personalization_level"] = "high"

        # Adjust based on business readiness
        if enhanced_response.business_readiness.ready_for_questions:
            strategy["include_confirmation"] = True
            strategy["template_base"] = "ready_for_questions"

        return strategy

    async def _generate_base_content(
        self,
        enhanced_response: EnhancedResearchResponse,
        response_context: ResponseContext,
        strategy: Dict[str, Any]
    ) -> str:
        """Generate base response content using strategy and templates."""

        # Use template if available
        if strategy.get("template_base") and strategy["template_base"] in self.response_templates:
            template = self.response_templates[strategy["template_base"]]
            base_content = self._apply_template(template, enhanced_response, response_context)
        else:
            # Generate dynamic content
            base_content = await self._generate_dynamic_content(
                enhanced_response, response_context, strategy
            )

        return base_content

    def _apply_template(
        self,
        template: str,
        enhanced_response: EnhancedResearchResponse,
        response_context: ResponseContext
    ) -> str:
        """Apply template with dynamic content substitution."""

        # Template variables
        variables = {
            "business_idea": enhanced_response.extracted_context.business_idea or "your business idea",
            "target_customer": enhanced_response.extracted_context.target_customer or "your target customers",
            "problem": enhanced_response.extracted_context.problem or "the problem you're solving",
            "industry": enhanced_response.industry_analysis.primary_industry if enhanced_response.industry_analysis else "your industry",
            "confidence_level": "high" if enhanced_response.business_readiness.confidence >= 0.8 else "medium" if enhanced_response.business_readiness.confidence >= 0.6 else "developing",
            "stage": enhanced_response.conversation_flow.current_stage.value.replace("_", " ").title(),
            "user_name": response_context.tone.value.title() + " entrepreneur"  # Placeholder
        }

        # Apply template substitution
        content = template
        for key, value in variables.items():
            content = content.replace(f"{{{key}}}", str(value))

        return content

    async def _generate_dynamic_content(
        self,
        enhanced_response: EnhancedResearchResponse,
        response_context: ResponseContext,
        strategy: Dict[str, Any]
    ) -> str:
        """Generate dynamic content using LLM when templates aren't sufficient."""

        # Build dynamic prompt
        prompt = self._build_dynamic_content_prompt(
            enhanced_response, response_context, strategy
        )

        system_instruction = self._get_dynamic_content_system_instruction(
            response_context.tone, response_context.user_expertise_level
        )

        try:
            # Generate content using Instructor
            from pydantic import BaseModel, Field

            class DynamicResponse(BaseModel):
                content: str = Field(..., min_length=50, max_length=response_context.max_response_length)
                tone_match: float = Field(..., ge=0.0, le=1.0, description="How well the tone matches the request")
                engagement_level: float = Field(..., ge=0.0, le=1.0, description="Estimated engagement level")

            dynamic_response = await self.instructor_client.generate_with_model_async(
                prompt=prompt,
                model_class=DynamicResponse,
                temperature=0.4,
                system_instruction=system_instruction,
                max_output_tokens=1000
            )

            return dynamic_response.content

        except Exception as e:
            logger.warning(f"Dynamic content generation failed: {e}")
            # Fallback to simple template
            return self._generate_fallback_content(enhanced_response, response_context)

    def _generate_intelligent_quick_replies(
        self,
        enhanced_response: EnhancedResearchResponse,
        response_context: ResponseContext
    ) -> List[str]:
        """Generate intelligent quick replies based on context and analysis."""

        quick_replies = []

        # Base replies on conversation stage
        if enhanced_response.conversation_flow.current_stage == ConversationStage.BUSINESS_DISCOVERY:
            quick_replies = [
                "It's a mobile app",
                "It's a web platform",
                "It's a SaaS solution"
            ]

        elif enhanced_response.conversation_flow.current_stage == ConversationStage.TARGET_CUSTOMER_DISCOVERY:
            quick_replies = [
                "Small businesses",
                "Enterprise companies",
                "Individual consumers"
            ]

        elif enhanced_response.conversation_flow.current_stage == ConversationStage.PROBLEM_VALIDATION:
            quick_replies = [
                "Manual processes",
                "Time-consuming tasks",
                "Lack of visibility"
            ]

        elif enhanced_response.conversation_flow.current_stage == ConversationStage.CONFIRMATION:
            quick_replies = [
                "Yes, that's correct",
                "Let me clarify something",
                "Generate questions now"
            ]

        else:
            # Generic helpful replies
            quick_replies = [
                "Tell me more",
                "That's exactly right",
                "I need help"
            ]

        # Customize based on industry if available
        if enhanced_response.industry_analysis:
            industry = enhanced_response.industry_analysis.primary_industry
            if industry == "healthcare" and enhanced_response.conversation_flow.current_stage == ConversationStage.TARGET_CUSTOMER_DISCOVERY:
                quick_replies = ["Healthcare providers", "Patients", "Hospital administrators"]
            elif industry == "saas" and enhanced_response.conversation_flow.current_stage == ConversationStage.TARGET_CUSTOMER_DISCOVERY:
                quick_replies = ["Software teams", "Business users", "IT administrators"]

        return quick_replies[:3]  # Limit to 3 replies

    def _calculate_response_metrics(
        self,
        content: str,
        quick_replies: List[str],
        generation_time_ms: int,
        strategy: Dict[str, Any]
    ) -> ResponseMetrics:
        """Calculate comprehensive response metrics."""

        # Basic metrics
        content_length = len(content)

        # Readability score (simplified)
        words = content.split()
        avg_word_length = sum(len(word) for word in words) / len(words) if words else 0
        sentence_count = content.count('.') + content.count('!') + content.count('?')
        avg_sentence_length = len(words) / sentence_count if sentence_count > 0 else len(words)

        # Simplified readability (inverse of complexity)
        readability_score = max(0.0, min(1.0, 1.0 - (avg_word_length - 4) * 0.1 - (avg_sentence_length - 15) * 0.02))

        # Engagement score (based on content characteristics)
        engagement_indicators = [
            "?" in content,  # Questions engage
            "you" in content.lower(),  # Personal pronouns
            any(word in content.lower() for word in ["help", "understand", "discover", "validate"]),  # Action words
            len(quick_replies) > 0  # Quick replies available
        ]
        engagement_score = sum(engagement_indicators) / len(engagement_indicators)

        # Actionability score (based on next steps and guidance)
        actionability_indicators = [
            any(word in content.lower() for word in ["next", "step", "action", "do", "try"]),
            any(word in content.lower() for word in ["question", "research", "validate", "test"]),
            "?" in content,  # Questions are actionable
            len(quick_replies) > 0  # Quick replies provide actions
        ]
        actionability_score = sum(actionability_indicators) / len(actionability_indicators)

        # Personalization score (based on context usage)
        personalization_indicators = [
            "your" in content.lower(),
            strategy.get("personalization_level", "low") != "low",
            strategy.get("template_base") is not None
        ]
        personalization_score = sum(personalization_indicators) / len(personalization_indicators)

        return ResponseMetrics(
            content_length=content_length,
            readability_score=readability_score,
            engagement_score=engagement_score,
            actionability_score=actionability_score,
            personalization_score=personalization_score,
            generation_time_ms=generation_time_ms,
            template_used=strategy.get("template_base"),
            fallback_used=False
        )

    def _meets_quality_threshold(self, metrics: ResponseMetrics) -> bool:
        """Check if response meets quality thresholds."""

        return (
            metrics.readability_score >= self.quality_thresholds["min_readability"] and
            metrics.engagement_score >= self.quality_thresholds["min_engagement"] and
            metrics.actionability_score >= self.quality_thresholds["min_actionability"]
        )

    async def _improve_response_quality(
        self,
        content: str,
        quick_replies: List[str],
        enhanced_response: EnhancedResearchResponse,
        response_context: ResponseContext
    ) -> Tuple[str, List[str]]:
        """Improve response quality through optimization."""

        # Simple optimization strategies
        optimized_content = content

        # Add engagement if missing
        if "?" not in content:
            optimized_content += " What would you like to explore next?"

        # Add personalization if missing
        if "your" not in content.lower():
            optimized_content = optimized_content.replace("the business", "your business")
            optimized_content = optimized_content.replace("the idea", "your idea")

        # Ensure actionability
        if not any(word in content.lower() for word in ["next", "step", "action", "do"]):
            optimized_content += " Let's take the next step together."

        return optimized_content, quick_replies

    def _initialize_response_templates(self) -> Dict[str, str]:
        """Initialize response templates for different scenarios."""

        return {
            "confirmation_summary": """
            Let me confirm what I understand about {business_idea}:

            **Business Idea:** {business_idea}
            **Target Customer:** {target_customer}
            **Problem Being Solved:** {problem}
            **Industry:** {industry}

            Does this accurately capture your business idea? If so, I can generate targeted research questions to help you validate it with potential customers.
            """,

            "clarification_request": """
            I'd love to help you with research questions for {business_idea}!

            To make the questions more targeted and valuable, could you tell me more about {missing_element}?

            The more specific you can be, the better I can tailor the research questions to your unique situation.
            """,

            "question_introduction": """
            Perfect! I have enough information about {business_idea} to generate targeted research questions.

            Based on your {industry} business targeting {target_customer}, I'll create questions that will help you validate the problem, solution fit, and market opportunity.

            These questions are designed to uncover real insights from potential customers that will guide your business decisions.
            """,

            "ready_for_questions": """
            Excellent! You've provided great context about {business_idea}.

            I can see this is a {confidence_level} confidence business concept in the {industry} space. You're currently in the {stage} stage.

            I'm ready to generate research questions that will help you validate this idea with {target_customer}. Should I proceed?
            """,

            "business_discovery": """
            That's an interesting start! I'd love to learn more about {business_idea}.

            To help you create the most effective research questions, could you tell me more about what makes your solution unique?

            What specific features or approach will differentiate it from existing options?
            """,

            "target_customer_discovery": """
            Thanks for sharing about {business_idea}!

            Now I'd like to understand your target customers better. When you think about {target_customer}, what size or type of organizations would be most interested in this solution?

            The more specific you can be about your ideal customer, the better I can tailor the research questions.
            """,

            "problem_validation": """
            I can see {business_idea} addresses an important need for {target_customer}.

            To create the most insightful research questions, could you tell me more about {problem}?

            How are people currently handling this problem, and what makes it particularly frustrating or time-consuming for them?
            """,

            "encouragement": """
            You're building something valuable with {business_idea}!

            Customer research will help you validate your assumptions and discover insights that could significantly improve your solution.

            What aspect of your business would you like to explore first with potential customers?
            """,

            "error_recovery": """
            I apologize, but I encountered an issue processing your request about {business_idea}.

            Let me try a different approach. Could you tell me in simple terms:
            1. What are you building?
            2. Who is it for?
            3. What problem does it solve?

            This will help me get back on track to assist you.
            """
        }

    def _generate_fallback_content(
        self,
        enhanced_response: EnhancedResearchResponse,
        response_context: ResponseContext
    ) -> str:
        """Generate simple fallback content when dynamic generation fails."""

        business_idea = enhanced_response.extracted_context.business_idea or "your business idea"

        fallback_responses = {
            ResponseType.CONVERSATIONAL: f"That's helpful information about {business_idea}. Could you tell me more about your target customers?",
            ResponseType.CONFIRMATION: f"Let me confirm I understand {business_idea} correctly. Does this sound right to you?",
            ResponseType.CLARIFICATION: f"I'd like to understand {business_idea} better. Could you provide more details?",
            ResponseType.QUESTION_GENERATION: f"I'm ready to generate research questions for {business_idea}. Shall I proceed?",
            ResponseType.GUIDANCE: f"For {business_idea}, I recommend starting with customer discovery research. What would you like to explore first?",
            ResponseType.ERROR_RECOVERY: f"Let me try again with {business_idea}. Could you help me understand what you're building?"
        }

        return fallback_responses.get(response_context.response_type,
                                    f"Thanks for sharing about {business_idea}. How can I help you with customer research?")

    def _get_current_time_ms(self) -> int:
        """Get current time in milliseconds."""
        import time
        return int(time.time() * 1000)

    # Public utility methods
    def get_response_templates(self) -> List[str]:
        """Get list of available response templates."""
        return list(self.response_templates.keys())

    def get_quality_thresholds(self) -> Dict[str, float]:
        """Get current quality thresholds."""
        return self.quality_thresholds.copy()

    def update_quality_thresholds(self, thresholds: Dict[str, float]):
        """Update quality thresholds."""
        self.quality_thresholds.update(thresholds)
        logger.info(f"Updated quality thresholds: {self.quality_thresholds}")

    def create_response_context(
        self,
        response_type: str = "conversational",
        tone: str = "friendly",
        user_expertise: str = "intermediate",
        conversation_length: int = 5,
        urgency: str = "medium"
    ) -> ResponseContext:
        """Create a response context with sensible defaults."""

        return ResponseContext(
            response_type=ResponseType(response_type),
            tone=ResponseTone(tone),
            user_expertise_level=user_expertise,
            conversation_length=conversation_length,
            urgency_level=urgency
        )
