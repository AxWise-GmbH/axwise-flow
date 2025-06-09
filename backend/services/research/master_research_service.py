"""
Master Research Service for Research API V3.

This service orchestrates all V3 components including enhanced models, services,
and V1 compatibility to provide a unified research experience.
"""

import logging
import time
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass

from backend.models.enhanced_research_models import (
    EnhancedResearchResponse, BusinessContext, BusinessReadiness,
    UserIntent, ConversationFlow, ConversationStage
)
from backend.models.industry_stakeholder_models import IndustryAnalysis, StakeholderAnalysis
from backend.models.research_questions_models import EnhancedResearchQuestions

from backend.services.llm.instructor_gemini_client import EnhancedInstructorGeminiClient
from backend.services.research.industry_classification_service import EnhancedIndustryClassificationService
from backend.services.research.stakeholder_detection_service import EnhancedStakeholderDetectionService
from backend.services.research.context_extraction_service import EnhancedContextExtractionService
from backend.services.research.conversation_flow_service import EnhancedConversationFlowService

logger = logging.getLogger(__name__)


@dataclass
class ResearchServiceConfig:
    """Configuration for the master research service."""

    # Performance settings
    enable_parallel_processing: bool = True
    enable_caching: bool = True
    cache_ttl_seconds: int = 300  # 5 minutes

    # Quality settings
    min_confidence_threshold: float = 0.6
    enable_quality_checks: bool = True

    # V1 compatibility
    enable_v1_fallback: bool = True
    v1_compatibility_mode: bool = True

    # Feature flags
    enable_industry_analysis: bool = True
    enable_stakeholder_detection: bool = True
    enable_enhanced_context: bool = True
    enable_conversation_flow: bool = True


@dataclass
class ResearchMetrics:
    """Metrics for research service performance."""

    start_time: float
    end_time: float
    total_duration_ms: int

    # Component timings
    context_extraction_ms: int = 0
    industry_classification_ms: int = 0
    stakeholder_detection_ms: int = 0
    conversation_flow_ms: int = 0
    response_generation_ms: int = 0

    # Quality metrics
    confidence_scores: Dict[str, float] = None
    fallback_used: bool = False
    errors_encountered: List[str] = None

    def __post_init__(self):
        if self.confidence_scores is None:
            self.confidence_scores = {}
        if self.errors_encountered is None:
            self.errors_encountered = []


class MasterResearchService:
    """
    Master research service that orchestrates all V3 components.

    This service provides:
    - Unified research analysis using all V3 components
    - Intelligent orchestration and parallel processing
    - V1 compatibility and fallback mechanisms
    - Performance monitoring and quality assurance
    - Comprehensive error handling and recovery
    """

    def __init__(
        self,
        instructor_client: Optional[EnhancedInstructorGeminiClient] = None,
        config: Optional[ResearchServiceConfig] = None
    ):
        """Initialize the master research service."""

        self.config = config or ResearchServiceConfig()

        # Initialize core client
        self.instructor_client = instructor_client or EnhancedInstructorGeminiClient()

        # Initialize component services
        self.industry_service = EnhancedIndustryClassificationService(self.instructor_client)
        self.stakeholder_service = EnhancedStakeholderDetectionService(self.instructor_client)
        self.context_service = EnhancedContextExtractionService(self.instructor_client)
        self.flow_service = EnhancedConversationFlowService(self.instructor_client)

        # Performance tracking
        self.metrics_history: List[ResearchMetrics] = []

        # Thinking process tracking
        self.thinking_steps: List[Dict[str, Any]] = []

        logger.info("Master Research Service initialized with V3 components")

    def _add_thinking_step(self, step: str, status: str = "in_progress", details: str = "", duration_ms: int = 0):
        """Add a thinking step to track the analysis process."""
        try:
            thinking_step = {
                "step": step,
                "status": status,
                "details": details,
                "duration_ms": duration_ms,
                "timestamp": time.time()
            }
            self.thinking_steps.append(thinking_step)
            logger.info(f"Added thinking step: {step}")
        except Exception as e:
            logger.warning(f"Failed to add thinking step: {e}")
            pass  # Silently fail to avoid breaking the main flow

    def _update_thinking_step(self, step: str, status: str, details: str = "", duration_ms: int = 0):
        """Update the status of the most recent thinking step."""
        for thinking_step in reversed(self.thinking_steps):
            if thinking_step["step"] == step:
                thinking_step["status"] = status
                thinking_step["details"] = details
                thinking_step["duration_ms"] = duration_ms
                break

    def _reset_thinking_steps(self):
        """Reset thinking steps for a new analysis."""
        self.thinking_steps = []

    async def analyze_research_comprehensive(
        self,
        conversation_context: str,
        latest_input: str,
        messages: List[Dict[str, str]],
        existing_context: Optional[Dict[str, Any]] = None,
        session_metadata: Optional[Dict[str, Any]] = None
    ) -> EnhancedResearchResponse:
        """
        Perform comprehensive research analysis using all V3 components.

        Args:
            conversation_context: Full conversation context
            latest_input: Latest user input
            messages: List of conversation messages
            existing_context: Optional existing context to build upon
            session_metadata: Optional session metadata

        Returns:
            EnhancedResearchResponse with comprehensive analysis
        """

        metrics = ResearchMetrics(start_time=time.time(), end_time=0, total_duration_ms=0)

        # Reset thinking steps for new analysis
        self._reset_thinking_steps()

        logger.info("Starting comprehensive research analysis")

        self._add_thinking_step("User Input Received", "completed", f"Processing user input: {len(latest_input)} characters")

        try:
            # Phase 1: Core Context Analysis (Sequential - needed for other components)
            business_context, business_readiness, user_intent = await self._analyze_core_context(
                conversation_context, latest_input, messages, existing_context, metrics
            )

            # Phase 2: Enhanced Analysis (Parallel - independent components)
            industry_analysis, stakeholder_analysis, conversation_flow = await self._analyze_enhanced_components(
                conversation_context, latest_input, messages, business_context,
                business_readiness, user_intent, metrics
            )

            # Phase 3: Response Generation
            self._add_thinking_step("Internal Logic: Decision Making", "in_progress", "Deciding response strategy")
            response_content, quick_replies = await self._generate_response_content(
                business_context, business_readiness, user_intent, conversation_flow,
                industry_analysis, stakeholder_analysis, metrics
            )

            self._update_thinking_step("Internal Logic: Decision Making", "completed", "Response strategy determined")

            # Show the generated response
            self._add_thinking_step("Generated Chat Response", "completed", f"Generated response with {len(quick_replies) if quick_replies else 0} quick replies")

            # Phase 4: Question Generation (if ready)
            research_questions = await self._generate_questions_if_ready(
                business_context, business_readiness, user_intent, conversation_flow,
                industry_analysis, stakeholder_analysis, messages, metrics
            )

            if research_questions:
                self._add_thinking_step("LLM Call: Question Generation", "completed", f"Generated {len(research_questions.questions)} questions")

            # Finalize metrics
            metrics.end_time = time.time()
            metrics.total_duration_ms = int((metrics.end_time - metrics.start_time) * 1000)

            # Mark analysis as complete
            self._add_thinking_step("Analysis Complete", "completed", f"Analysis completed in {metrics.total_duration_ms}ms")

            # Create comprehensive response
            enhanced_response = EnhancedResearchResponse(
                content=response_content,
                user_intent=user_intent,
                business_readiness=business_readiness,
                extracted_context=business_context,
                conversation_flow=conversation_flow,
                quick_replies=quick_replies,
                industry_analysis=industry_analysis,
                stakeholder_analysis=stakeholder_analysis,
                research_questions=research_questions
            )

            # Add thinking steps to response metadata
            logger.info(f"Adding {len(self.thinking_steps)} thinking steps to response metadata")
            enhanced_response.response_metadata["thinking_process"] = self.thinking_steps
            logger.info(f"Response metadata now contains: {list(enhanced_response.response_metadata.keys())}")

            # Store metrics
            if self.config.enable_caching:
                self.metrics_history.append(metrics)
                # Keep only last 100 metrics
                if len(self.metrics_history) > 100:
                    self.metrics_history = self.metrics_history[-100:]

            logger.info(f"Comprehensive analysis completed in {metrics.total_duration_ms}ms")
            return enhanced_response

        except Exception as e:
            logger.error(f"Comprehensive analysis failed: {e}")
            metrics.errors_encountered.append(str(e))

            # Add error thinking step
            self._add_thinking_step("Analysis Failed", "failed", "Analysis encountered an error")

            if self.config.enable_v1_fallback:
                logger.info("Falling back to V1-compatible analysis")
                fallback_response = await self._fallback_to_v1_analysis(
                    conversation_context, latest_input, messages, existing_context, metrics
                )

                # Add fallback thinking step
                self._add_thinking_step("Fallback Complete", "completed", "Using V1 fallback analysis")

                # Add thinking steps to fallback response
                fallback_response.response_metadata["thinking_process"] = self.thinking_steps

                return fallback_response
            else:
                raise

    async def _analyze_core_context(
        self,
        conversation_context: str,
        latest_input: str,
        messages: List[Dict[str, str]],
        existing_context: Optional[Dict[str, Any]],
        metrics: ResearchMetrics
    ) -> Tuple[BusinessContext, BusinessReadiness, UserIntent]:
        """Analyze core context components sequentially."""

        logger.info("Analyzing core context components")

        # Context extraction
        self._add_thinking_step("LLM Call: Context Extraction", "in_progress", "Analyzing business context")
        start_time = time.time()
        business_context = await self.context_service.extract_business_context_comprehensive(
            conversation_context, latest_input, existing_context
        )
        extraction_time = int((time.time() - start_time) * 1000)
        metrics.context_extraction_ms = extraction_time

        self._update_thinking_step("LLM Call: Context Extraction", "completed", f"Extracted business context | Duration: {extraction_time}ms")

        # Business readiness validation
        self._add_thinking_step("LLM Call: Business Validation", "in_progress", "Validating business readiness")
        start_time = time.time()
        business_readiness = await self.context_service.validate_business_readiness_comprehensive(
            conversation_context, latest_input, business_context
        )
        readiness_time = int((time.time() - start_time) * 1000)

        self._update_thinking_step("LLM Call: Business Validation", "completed", f"Validated readiness | Duration: {readiness_time}ms")

        # User intent analysis
        self._add_thinking_step("LLM Call: User Intent Analysis", "in_progress", "Analyzing user intent")
        start_time = time.time()
        user_intent = await self.context_service.analyze_user_intent_comprehensive(
            conversation_context, latest_input, messages
        )
        intent_time = int((time.time() - start_time) * 1000)

        self._update_thinking_step("LLM Call: User Intent Analysis", "completed", f"Analyzed intent | Duration: {intent_time}ms")

        # Update metrics
        metrics.context_extraction_ms += readiness_time + intent_time
        metrics.confidence_scores.update({
            "business_context": business_context.completeness_score,
            "business_readiness": business_readiness.confidence,
            "user_intent": user_intent.confidence
        })

        logger.info(f"Core context analysis completed: context={business_context.completeness_score:.2f}, readiness={business_readiness.confidence:.2f}")

        return business_context, business_readiness, user_intent

    async def _analyze_enhanced_components(
        self,
        conversation_context: str,
        latest_input: str,
        messages: List[Dict[str, str]],
        business_context: BusinessContext,
        business_readiness: BusinessReadiness,
        user_intent: UserIntent,
        metrics: ResearchMetrics
    ) -> Tuple[Optional[IndustryAnalysis], Optional[StakeholderAnalysis], ConversationFlow]:
        """Analyze enhanced components in parallel where possible."""

        logger.info("Analyzing enhanced components")

        # Industry classification
        industry_analysis = None
        if self.config.enable_industry_analysis:
            self._add_thinking_step("LLM Call: Industry Classification", "in_progress", "Classifying industry")
            start_time = time.time()
            try:
                industry_analysis = await self.industry_service.classify_industry_comprehensive(
                    conversation_context, latest_input, business_context.model_dump()
                )
                industry_time = int((time.time() - start_time) * 1000)
                metrics.industry_classification_ms = industry_time
                metrics.confidence_scores["industry_analysis"] = industry_analysis.confidence

                self._update_thinking_step("LLM Call: Industry Classification", "completed", f"Classified industry | Duration: {industry_time}ms")
            except Exception as e:
                logger.warning(f"Industry analysis failed: {e}")
                metrics.errors_encountered.append(f"Industry analysis: {e}")
                self._update_thinking_step("LLM Call: Industry Classification", "failed", f"Classification failed")

        # Stakeholder detection
        stakeholder_analysis = None
        if self.config.enable_stakeholder_detection and business_context.completeness_score >= 0.5:
            start_time = time.time()
            try:
                # Convert business context to ResearchContext format
                research_context = self._convert_to_research_context(business_context)
                stakeholder_analysis = await self.stakeholder_service.detect_stakeholders_comprehensive(
                    research_context, messages,
                    industry_analysis.primary_industry if industry_analysis else None
                )
                metrics.stakeholder_detection_ms = int((time.time() - start_time) * 1000)
                metrics.confidence_scores["stakeholder_analysis"] = stakeholder_analysis.detection_confidence
            except Exception as e:
                logger.warning(f"Stakeholder analysis failed: {e}")
                metrics.errors_encountered.append(f"Stakeholder analysis: {e}")

        # Conversation flow analysis
        start_time = time.time()
        conversation_flow = await self.flow_service.determine_conversation_flow(
            business_context, business_readiness, user_intent, messages
        )
        metrics.conversation_flow_ms = int((time.time() - start_time) * 1000)

        logger.info(f"Enhanced components completed: industry={bool(industry_analysis)}, stakeholders={bool(stakeholder_analysis)}")

        return industry_analysis, stakeholder_analysis, conversation_flow

    async def _generate_response_content(
        self,
        business_context: BusinessContext,
        business_readiness: BusinessReadiness,
        user_intent: UserIntent,
        conversation_flow: ConversationFlow,
        industry_analysis: Optional[IndustryAnalysis],
        stakeholder_analysis: Optional[StakeholderAnalysis],
        metrics: ResearchMetrics
    ) -> Tuple[str, List[str]]:
        """Generate response content and quick replies."""

        start_time = time.time()

        # Determine response strategy based on intent and flow
        if user_intent.recommended_response_type == "generate_questions":
            if business_readiness.ready_for_questions:
                content = "Perfect! I have enough information to generate targeted research questions. Let me create questions that will help you validate your business idea with real customers."
                quick_replies = ["Generate questions now", "Add more context first", "Review what we discussed"]
            else:
                content = "I'd like to generate questions for you, but let me gather a bit more information first to make them more targeted and valuable."
                quick_replies = self._generate_contextual_quick_replies(business_context, conversation_flow)

        elif user_intent.recommended_response_type == "provide_confirmation":
            content = self._generate_confirmation_summary(business_context, industry_analysis, stakeholder_analysis)
            quick_replies = ["Yes, that's correct", "Let me clarify something", "Generate questions now"]

        elif user_intent.recommended_response_type == "ask_clarification":
            content = self._generate_clarification_request(business_context, conversation_flow)
            quick_replies = self._generate_contextual_quick_replies(business_context, conversation_flow)

        else:  # acknowledge_and_continue
            content = self._generate_continuation_response(business_context, conversation_flow, user_intent)
            quick_replies = self._generate_contextual_quick_replies(business_context, conversation_flow)

        metrics.response_generation_ms = int((time.time() - start_time) * 1000)

        return content, quick_replies

    async def _generate_questions_if_ready(
        self,
        business_context: BusinessContext,
        business_readiness: BusinessReadiness,
        user_intent: UserIntent,
        conversation_flow: ConversationFlow,
        industry_analysis: Optional[IndustryAnalysis],
        stakeholder_analysis: Optional[StakeholderAnalysis],
        messages: List[Dict[str, str]],
        metrics: ResearchMetrics
    ) -> Optional[EnhancedResearchQuestions]:
        """Generate research questions if conditions are met."""

        # Check if we should generate questions
        should_generate = (
            business_readiness.ready_for_questions and
            user_intent.primary_intent in ["confirmation", "question_request"] and
            conversation_flow.readiness_for_questions
        )

        if not should_generate:
            return None

        start_time = time.time()

        try:
            # Build comprehensive prompt for question generation
            prompt = self._build_question_generation_prompt(
                business_context, industry_analysis, stakeholder_analysis
            )

            system_instruction = self._get_question_generation_system_instruction(
                industry_analysis.primary_industry if industry_analysis else "general"
            )

            # Generate questions using Instructor
            research_questions = await self.instructor_client.generate_with_model_async(
                prompt=prompt,
                model_class=EnhancedResearchQuestions,
                temperature=0.3,
                system_instruction=system_instruction,
                max_output_tokens=12000
            )

            question_time = int((time.time() - start_time) * 1000)
            metrics.response_generation_ms += question_time

            logger.info(f"Generated {len(research_questions.questions)} research questions")
            return research_questions

        except Exception as e:
            logger.error(f"Question generation failed: {e}")
            metrics.errors_encountered.append(f"Question generation: {e}")
            return None

    def _convert_to_research_context(self, business_context: BusinessContext):
        """Convert BusinessContext to ResearchContext format for compatibility."""

        class ResearchContext:
            def __init__(self, business_context: BusinessContext):
                self.businessIdea = business_context.business_idea
                self.targetCustomer = business_context.target_customer
                self.problem = business_context.problem

        return ResearchContext(business_context)

    def _generate_confirmation_summary(
        self,
        business_context: BusinessContext,
        industry_analysis: Optional[IndustryAnalysis],
        stakeholder_analysis: Optional[StakeholderAnalysis]
    ) -> str:
        """Generate confirmation summary for user validation."""

        summary_parts = []

        # Business idea
        if business_context.business_idea:
            summary_parts.append(f"**Business Idea:** {business_context.business_idea}")

        # Target customer
        if business_context.target_customer:
            summary_parts.append(f"**Target Customer:** {business_context.target_customer}")

        # Problem
        if business_context.problem:
            summary_parts.append(f"**Problem Being Solved:** {business_context.problem}")

        # Industry context
        if industry_analysis:
            summary_parts.append(f"**Industry:** {industry_analysis.primary_industry.title()}")

        # Stakeholder context
        if stakeholder_analysis and stakeholder_analysis.primary_stakeholders:
            stakeholder_names = [s.name for s in stakeholder_analysis.primary_stakeholders]
            summary_parts.append(f"**Key Stakeholders:** {', '.join(stakeholder_names)}")

        summary = "Let me confirm what I understand about your business:\n\n" + "\n".join(summary_parts)
        summary += "\n\nDoes this accurately capture your business idea? If so, I can generate targeted research questions to help you validate it with potential customers."

        return summary

    def _generate_clarification_request(
        self,
        business_context: BusinessContext,
        conversation_flow: ConversationFlow
    ) -> str:
        """Generate clarification request based on missing context."""

        missing_elements = business_context.missing_elements

        if not missing_elements:
            return "I'd like to understand your business idea better. Could you tell me more about what you're building?"

        # Focus on the most important missing element
        if "business_idea" in str(missing_elements).lower():
            return "I'd love to help you with research questions! Could you tell me more about what specific product or service you're building?"

        elif "target_customer" in str(missing_elements).lower():
            return "That sounds interesting! Who would be your ideal customers for this solution? What types of people or businesses would benefit most?"

        elif "problem" in str(missing_elements).lower():
            return "I can see you're building something valuable. What specific problem or challenge does this solve for your customers?"

        else:
            return "Thanks for sharing that information! Could you tell me a bit more about the specific challenges your customers face?"

    def _generate_continuation_response(
        self,
        business_context: BusinessContext,
        conversation_flow: ConversationFlow,
        user_intent: UserIntent
    ) -> str:
        """Generate continuation response to keep conversation flowing."""

        # Acknowledge their input
        acknowledgments = [
            "That's really helpful information.",
            "I appreciate you sharing those details.",
            "That gives me good insight into your business.",
            "Thanks for elaborating on that."
        ]

        # Choose acknowledgment based on intent confidence
        if user_intent.confidence >= 0.8:
            acknowledgment = acknowledgments[0]
        elif user_intent.confidence >= 0.6:
            acknowledgment = acknowledgments[1]
        else:
            acknowledgment = acknowledgments[2]

        # Add follow-up based on conversation stage
        if conversation_flow.current_stage == ConversationStage.BUSINESS_DISCOVERY:
            follow_up = " Can you tell me more about what makes your solution unique or different from existing options?"

        elif conversation_flow.current_stage == ConversationStage.TARGET_CUSTOMER_DISCOVERY:
            follow_up = " What size or type of organizations would be most interested in this solution?"

        elif conversation_flow.current_stage == ConversationStage.PROBLEM_VALIDATION:
            follow_up = " How are people currently handling this problem, and what makes it frustrating for them?"

        else:
            follow_up = " What other aspects of your business idea would be helpful for me to understand?"

        return acknowledgment + follow_up

    def _generate_contextual_quick_replies(
        self,
        business_context: BusinessContext,
        conversation_flow: ConversationFlow
    ) -> List[str]:
        """Generate contextual quick replies based on conversation state."""

        # Base replies
        base_replies = []

        # Stage-specific replies
        if conversation_flow.current_stage == ConversationStage.BUSINESS_DISCOVERY:
            base_replies = [
                "It's a mobile app",
                "It's a web platform",
                "It's a SaaS tool"
            ]

        elif conversation_flow.current_stage == ConversationStage.TARGET_CUSTOMER_DISCOVERY:
            base_replies = [
                "Small businesses",
                "Enterprise companies",
                "Individual consumers"
            ]

        elif conversation_flow.current_stage == ConversationStage.PROBLEM_VALIDATION:
            base_replies = [
                "Manual processes",
                "Time-consuming tasks",
                "Lack of visibility"
            ]

        else:
            # Generic helpful replies
            base_replies = [
                "Tell me more",
                "That's exactly right",
                "Let me clarify"
            ]

        return base_replies[:3]  # Limit to 3 replies

    def _build_question_generation_prompt(
        self,
        business_context: BusinessContext,
        industry_analysis: Optional[IndustryAnalysis],
        stakeholder_analysis: Optional[StakeholderAnalysis]
    ) -> str:
        """Build comprehensive prompt for question generation."""

        industry_context = ""
        if industry_analysis:
            industry_context = f"""
            Industry Context: {industry_analysis.primary_industry}
            Industry Guidance: {industry_analysis.industry_guidance}
            Relevant Methodologies: {', '.join(industry_analysis.relevant_methodologies)}
            """

        stakeholder_context = ""
        if stakeholder_analysis:
            primary_stakeholders = [s.name for s in stakeholder_analysis.primary_stakeholders]
            stakeholder_context = f"""
            Primary Stakeholders: {', '.join(primary_stakeholders)}
            Multi-stakeholder Complexity: {stakeholder_analysis.multi_stakeholder_complexity}
            Recommended Approach: {stakeholder_analysis.recommended_approach}
            """

        return f"""
        Generate comprehensive research questions for this business validation study.

        Business Context:
        - Business Idea: {business_context.business_idea}
        - Target Customer: {business_context.target_customer}
        - Problem: {business_context.problem}
        - Solution Approach: {business_context.solution_approach or 'Not specified'}
        - Business Stage: {business_context.business_stage or 'Not specified'}
        {industry_context}
        {stakeholder_context}

        Create research questions that will help validate:
        1. Problem discovery and validation
        2. Solution fit and feature validation
        3. Market opportunity and competitive landscape
        4. Business model and pricing validation
        5. Implementation and adoption challenges

        Focus on questions that will generate actionable insights for business decisions.
        Consider the industry context and stakeholder complexity in your question design.
        """

    def _get_question_generation_system_instruction(self, industry: str) -> str:
        """Get system instruction for question generation."""

        return f"""
        You are an expert customer research consultant specializing in business validation and market research.

        Your task is to generate high-quality research questions for a {industry} business.

        QUESTION QUALITY CRITERIA:
        1. Open-ended questions that encourage detailed responses
        2. Specific and actionable rather than generic
        3. Focused on behaviors, not just opinions
        4. Designed to uncover pain points and motivations
        5. Appropriate for the target customer and industry context

        QUESTION CATEGORIES:
        - Problem Discovery: Understand current challenges and pain points
        - Solution Validation: Test solution fit and feature priorities
        - Market Research: Understand competitive landscape and alternatives
        - Business Model: Validate pricing, purchasing process, and value proposition
        - Implementation: Understand adoption barriers and success factors

        Generate questions that will provide actionable insights for business decisions.
        Avoid leading questions and focus on understanding the customer's world.
        """

    async def _fallback_to_v1_analysis(
        self,
        conversation_context: str,
        latest_input: str,
        messages: List[Dict[str, str]],
        existing_context: Optional[Dict[str, Any]],
        metrics: ResearchMetrics
    ) -> EnhancedResearchResponse:
        """Fallback to V1-compatible analysis when V3 components fail."""

        logger.info("Using V1 fallback analysis")
        metrics.fallback_used = True

        try:
            # Use V1-compatible methods from our services
            business_context = await self.context_service._fallback_context_extraction(
                conversation_context, latest_input
            )

            business_readiness = await self.context_service._fallback_readiness_validation(
                conversation_context, latest_input
            )

            user_intent = await self.context_service._fallback_intent_analysis(
                latest_input, messages
            )

            # Simple conversation flow
            conversation_flow = ConversationFlow(
                current_stage=ConversationStage.BUSINESS_DISCOVERY,
                stage_progress=0.5,
                conversation_quality="medium",
                readiness_for_questions=business_readiness.ready_for_questions
            )

            # Generate simple response
            content = "I understand you're working on a business idea. Could you tell me more about what you're building and who your target customers would be?"
            quick_replies = ["It's a mobile app", "It's a web service", "It's a physical product"]

            return EnhancedResearchResponse(
                content=content,
                user_intent=user_intent,
                business_readiness=business_readiness,
                extracted_context=business_context,
                conversation_flow=conversation_flow,
                quick_replies=quick_replies
            )

        except Exception as e:
            logger.error(f"V1 fallback also failed: {e}")
            # Ultimate fallback - minimal response
            return self._create_minimal_response()

    def _create_minimal_response(self) -> EnhancedResearchResponse:
        """Create minimal response when all analysis fails."""

        # Create minimal components
        business_context = BusinessContext()

        business_readiness = BusinessReadiness(
            ready_for_questions=False,
            confidence=0.3,
            reasoning="Minimal fallback response",
            business_clarity={"idea_clarity": 0.3, "customer_clarity": 0.3, "problem_clarity": 0.3},
            conversation_quality="low"
        )

        user_intent = UserIntent(
            primary_intent="continuation",
            confidence=0.5,
            reasoning="Minimal fallback response",
            specific_feedback="System fallback",
            recommended_response_type="acknowledge_and_continue",
            next_action="Continue conversation"
        )

        conversation_flow = ConversationFlow(
            current_stage=ConversationStage.INITIAL,
            stage_progress=0.1,
            conversation_quality="low",
            readiness_for_questions=False
        )

        return EnhancedResearchResponse(
            content="I'd love to help you with customer research! Could you tell me about the business idea you're working on?",
            user_intent=user_intent,
            business_readiness=business_readiness,
            extracted_context=business_context,
            conversation_flow=conversation_flow,
            quick_replies=["Tell me more", "I need help", "Start over"]
        )

    # V1 Compatibility Methods
    async def analyze_research_v1_compatible(
        self,
        conversation_context: str,
        latest_input: str,
        messages: List[Dict[str, str]],
        existing_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        V1-compatible research analysis method.

        This method provides the same interface as V1 while using V3 components
        under the hood, ensuring backward compatibility.
        """

        try:
            # Use comprehensive V3 analysis
            enhanced_response = await self.analyze_research_comprehensive(
                conversation_context, latest_input, messages, existing_context
            )

            # Convert to V1 format
            return self._convert_to_v1_format(enhanced_response)

        except Exception as e:
            logger.error(f"V3 analysis failed in V1 compatibility mode: {e}")

            # Use V1 fallback methods directly
            return await self._v1_direct_fallback(conversation_context, latest_input, messages)

    def _convert_to_v1_format(self, enhanced_response: EnhancedResearchResponse) -> Dict[str, Any]:
        """Convert EnhancedResearchResponse to V1 format."""

        # Extract V1-compatible data
        v1_response = {
            "content": enhanced_response.content,
            "metadata": {
                "extracted_context": {
                    "business_idea": enhanced_response.extracted_context.business_idea,
                    "target_customer": enhanced_response.extracted_context.target_customer,
                    "problem": enhanced_response.extracted_context.problem,
                    "questions_generated": bool(enhanced_response.research_questions)
                },
                "user_intent": {
                    "intent": enhanced_response.user_intent.primary_intent,
                    "confidence": enhanced_response.user_intent.confidence,
                    "reasoning": enhanced_response.user_intent.reasoning
                },
                "business_validation": {
                    "ready_for_questions": enhanced_response.business_readiness.ready_for_questions,
                    "confidence": enhanced_response.business_readiness.confidence,
                    "business_clarity": enhanced_response.business_readiness.business_clarity
                },
                "conversation_stage": enhanced_response.conversation_flow.current_stage.value,
                "conversation_quality": enhanced_response.conversation_flow.conversation_quality
            },
            "quick_replies": enhanced_response.quick_replies
        }

        # Add questions if generated
        if enhanced_response.research_questions:
            v1_response["questions"] = {
                "problemDiscovery": [q.question for q in enhanced_response.research_questions.questions if q.category == "problem_discovery"][:5],
                "solutionValidation": [q.question for q in enhanced_response.research_questions.questions if q.category == "solution_validation"][:5],
                "followUp": [q.question for q in enhanced_response.research_questions.questions if q.category == "follow_up"][:3]
            }

        # Add industry data if available
        if enhanced_response.industry_analysis:
            v1_response["metadata"]["industry_data"] = {
                "industry": enhanced_response.industry_analysis.primary_industry,
                "confidence": enhanced_response.industry_analysis.confidence,
                "reasoning": enhanced_response.industry_analysis.reasoning
            }

        # Add stakeholder data if available
        if enhanced_response.stakeholder_analysis:
            v1_response["metadata"]["detected_stakeholders"] = {
                "primary": [
                    {"name": s.name, "description": s.description}
                    for s in enhanced_response.stakeholder_analysis.primary_stakeholders
                ],
                "secondary": [
                    {"name": s.name, "description": s.description}
                    for s in enhanced_response.stakeholder_analysis.secondary_stakeholders
                ],
                "reasoning": enhanced_response.stakeholder_analysis.reasoning
            }

        return v1_response

    async def _v1_direct_fallback(
        self,
        conversation_context: str,
        latest_input: str,
        messages: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """Direct V1 fallback using service V1 methods."""

        # Use V1-compatible methods from services
        context_data = await self.context_service.extract_context_v1_compatible(
            conversation_context, latest_input
        )

        industry_data = await self.industry_service.classify_industry_v1_compatible(
            conversation_context, latest_input
        )

        # Create V1-compatible response
        return {
            "content": "I'd like to understand your business better. Could you tell me more about what you're building?",
            "metadata": {
                "extracted_context": context_data,
                "industry_data": industry_data,
                "user_intent": {
                    "intent": "continuation",
                    "confidence": 0.6,
                    "reasoning": "V1 fallback analysis"
                },
                "business_validation": {
                    "ready_for_questions": False,
                    "confidence": 0.5,
                    "business_clarity": {
                        "idea_clarity": 0.5,
                        "customer_clarity": 0.5,
                        "problem_clarity": 0.5
                    }
                }
            },
            "quick_replies": ["Tell me more", "I need help", "Generate questions"]
        }

    # Performance and Monitoring Methods
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get performance metrics for the service."""

        if not self.metrics_history:
            return {"total_requests": 0}

        recent_metrics = self.metrics_history[-10:]  # Last 10 requests

        return {
            "total_requests": len(self.metrics_history),
            "recent_requests": len(recent_metrics),
            "avg_total_duration_ms": sum(m.total_duration_ms for m in recent_metrics) / len(recent_metrics),
            "avg_context_extraction_ms": sum(m.context_extraction_ms for m in recent_metrics) / len(recent_metrics),
            "avg_industry_classification_ms": sum(m.industry_classification_ms for m in recent_metrics) / len(recent_metrics),
            "avg_stakeholder_detection_ms": sum(m.stakeholder_detection_ms for m in recent_metrics) / len(recent_metrics),
            "avg_conversation_flow_ms": sum(m.conversation_flow_ms for m in recent_metrics) / len(recent_metrics),
            "avg_response_generation_ms": sum(m.response_generation_ms for m in recent_metrics) / len(recent_metrics),
            "fallback_usage_rate": sum(1 for m in recent_metrics if m.fallback_used) / len(recent_metrics),
            "error_rate": sum(len(m.errors_encountered) for m in recent_metrics) / len(recent_metrics),
            "avg_confidence_scores": {
                component: sum(m.confidence_scores.get(component, 0) for m in recent_metrics) / len(recent_metrics)
                for component in ["business_context", "business_readiness", "user_intent", "industry_analysis", "stakeholder_analysis"]
            }
        }

    def clear_metrics_history(self):
        """Clear metrics history."""
        self.metrics_history.clear()
        logger.info("Metrics history cleared")
