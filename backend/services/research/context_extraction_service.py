"""
Enhanced Context Extraction Service for Research API V3.

This service combines V1 context extraction logic with enhanced Pydantic models
and Instructor-based structured outputs for comprehensive business context analysis.
"""

import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from backend.models.enhanced_research_models import BusinessContext, BusinessReadiness, UserIntent
from backend.services.llm.instructor_gemini_client import EnhancedInstructorGeminiClient

logger = logging.getLogger(__name__)


@dataclass
class ContextExtractionConfig:
    """Configuration for context extraction."""

    # V1 keyword patterns for fallback detection
    BUSINESS_IDEA_KEYWORDS = [
        'app', 'platform', 'tool', 'service', 'product', 'system', 'software',
        'api', 'dashboard', 'website', 'application', 'solution'
    ]

    BUSINESS_ACTION_KEYWORDS = [
        'build', 'create', 'develop', 'make', 'design', 'automation',
        'management', 'optimize', 'improve', 'streamline'
    ]

    TARGET_CUSTOMER_KEYWORDS = [
        'customer', 'user', 'client', 'business', 'company', 'team',
        'people', 'organization', 'startup', 'enterprise'
    ]

    PROBLEM_KEYWORDS = [
        'problem', 'issue', 'challenge', 'pain', 'difficult', 'hard',
        'struggle', 'inefficient', 'manual', 'time-consuming'
    ]

    # Business stage indicators
    STAGE_INDICATORS = {
        "idea": ["idea", "concept", "thinking about", "planning to"],
        "prototype": ["prototype", "mvp", "proof of concept", "testing"],
        "mvp": ["mvp", "minimum viable", "beta", "early version"],
        "launched": ["launched", "live", "production", "customers using"],
        "scaling": ["scaling", "growing", "expanding", "enterprise"]
    }


class EnhancedContextExtractionService:
    """
    Enhanced context extraction service that combines V1 logic with V3 models.

    This service provides comprehensive business context analysis including:
    - LLM-based context extraction with fallback
    - Business readiness assessment
    - User intent analysis
    - Completeness scoring and gap analysis
    """

    def __init__(self, instructor_client: Optional[EnhancedInstructorGeminiClient] = None):
        """Initialize the context extraction service."""
        self.instructor_client = instructor_client or EnhancedInstructorGeminiClient()
        self.config = ContextExtractionConfig()

    async def extract_business_context_comprehensive(
        self,
        conversation_context: str,
        latest_input: str,
        existing_context: Optional[Dict[str, Any]] = None
    ) -> BusinessContext:
        """
        Perform comprehensive business context extraction using enhanced models.

        Args:
            conversation_context: Full conversation context
            latest_input: Latest user input
            existing_context: Optional existing context to build upon

        Returns:
            BusinessContext model with comprehensive business information
        """
        logger.info("Starting comprehensive business context extraction")

        # Build enhanced prompt with V1 logic integration
        prompt = self._build_context_extraction_prompt(
            conversation_context, latest_input, existing_context
        )

        system_instruction = self._get_context_extraction_system_instruction()

        try:
            # Use Instructor for structured output
            business_context = await self.instructor_client.generate_with_model_async(
                prompt=prompt,
                model_class=BusinessContext,
                temperature=0.1,
                system_instruction=system_instruction,
                max_output_tokens=8000
            )

            logger.info(f"Successfully extracted context with completeness: {business_context.completeness_score}")
            return business_context

        except Exception as e:
            logger.error(f"LLM context extraction failed: {e}")
            # Fallback to V1-style extraction
            return await self._fallback_context_extraction(conversation_context, latest_input)

    async def validate_business_readiness_comprehensive(
        self,
        conversation_context: str,
        latest_input: str,
        business_context: Optional[BusinessContext] = None
    ) -> BusinessReadiness:
        """
        Perform comprehensive business readiness validation using enhanced models.

        Args:
            conversation_context: Full conversation context
            latest_input: Latest user input
            business_context: Optional business context for additional validation

        Returns:
            BusinessReadiness model with comprehensive readiness assessment
        """
        logger.info("Starting comprehensive business readiness validation")

        # Build enhanced prompt with V1 logic integration
        prompt = self._build_readiness_validation_prompt(
            conversation_context, latest_input, business_context
        )

        system_instruction = self._get_readiness_validation_system_instruction()

        try:
            # Use Instructor for structured output
            business_readiness = await self.instructor_client.generate_with_model_async(
                prompt=prompt,
                model_class=BusinessReadiness,
                temperature=0.2,
                system_instruction=system_instruction,
                max_output_tokens=6000
            )

            logger.info(f"Successfully validated readiness: {business_readiness.ready_for_questions}")
            return business_readiness

        except Exception as e:
            logger.error(f"LLM readiness validation failed: {e}")
            # Fallback to V1-style validation
            return await self._fallback_readiness_validation(conversation_context, latest_input)

    async def analyze_user_intent_comprehensive(
        self,
        conversation_context: str,
        latest_input: str,
        messages: List[Dict[str, str]]
    ) -> UserIntent:
        """
        Perform comprehensive user intent analysis using enhanced models.

        Args:
            conversation_context: Full conversation context
            latest_input: Latest user input
            messages: List of conversation messages

        Returns:
            UserIntent model with comprehensive intent analysis
        """
        logger.info("Starting comprehensive user intent analysis")

        # Build enhanced prompt with V1 logic integration
        prompt = self._build_intent_analysis_prompt(
            conversation_context, latest_input, messages
        )

        system_instruction = self._get_intent_analysis_system_instruction()

        try:
            # Use Instructor for structured output
            user_intent = await self.instructor_client.generate_with_model_async(
                prompt=prompt,
                model_class=UserIntent,
                temperature=0.2,
                system_instruction=system_instruction,
                max_output_tokens=4000
            )

            logger.info(f"Successfully analyzed intent: {user_intent.primary_intent}")
            return user_intent

        except Exception as e:
            logger.error(f"LLM intent analysis failed: {e}")
            # Fallback to V1-style analysis
            return await self._fallback_intent_analysis(latest_input, messages)

    def _build_context_extraction_prompt(
        self,
        conversation_context: str,
        latest_input: str,
        existing_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build comprehensive context extraction prompt."""

        existing_info = ""
        if existing_context:
            existing_info = f"""
            Existing Context (build upon this):
            - Business Idea: {existing_context.get('business_idea', 'Not specified')}
            - Target Customer: {existing_context.get('target_customer', 'Not specified')}
            - Problem: {existing_context.get('problem', 'Not specified')}
            """

        return f"""
        Analyze this customer research conversation and extract comprehensive business context.

        Conversation History:
        {conversation_context}

        Latest User Input:
        "{latest_input}"
        {existing_info}

        Extract detailed business context including:

        1. BUSINESS IDEA:
           - What specific product/service are they building?
           - What features and capabilities have been mentioned?
           - What technology or approach are they using?
           - What makes their solution unique?

        2. TARGET CUSTOMER:
           - Who are their specific target customers?
           - What roles, personas, or customer segments?
           - What size/type of organizations?
           - Any demographic or psychographic details?

        3. PROBLEM BEING SOLVED:
           - What is the core problem or pain point?
           - Why is this problem important?
           - What are the consequences of not solving it?
           - How are people currently handling this problem?

        4. ADDITIONAL CONTEXT:
           - Solution approach and methodology
           - Market context and competitive landscape
           - Business model and monetization approach
           - Current stage of business development

        Focus on extracting specific, detailed information rather than generic descriptions.
        If information is not clearly stated, leave fields empty rather than making assumptions.
        """

    def _build_readiness_validation_prompt(
        self,
        conversation_context: str,
        latest_input: str,
        business_context: Optional[BusinessContext] = None
    ) -> str:
        """Build comprehensive readiness validation prompt."""

        context_info = ""
        if business_context:
            context_info = f"""
            Current Business Context:
            - Business Idea: {business_context.business_idea or 'Not specified'}
            - Target Customer: {business_context.target_customer or 'Not specified'}
            - Problem: {business_context.problem or 'Not specified'}
            - Completeness Score: {business_context.completeness_score}
            """

        return f"""
        Analyze this customer research conversation to determine if enough information has been gathered to proceed with research question generation.

        Conversation History:
        {conversation_context}

        Latest User Input:
        "{latest_input}"
        {context_info}

        Assess business readiness by evaluating:

        1. INFORMATION COMPLETENESS:
           - Is the business idea clearly defined and specific?
           - Are target customers identified with sufficient detail?
           - Is the problem articulated with clear pain points?

        2. CONVERSATION QUALITY:
           - Has the conversation progressed beyond surface-level details?
           - Are there specific examples and use cases mentioned?
           - Is there sufficient depth for meaningful research questions?

        3. CLARITY ASSESSMENT:
           - Idea clarity: How well-defined is the business concept?
           - Customer clarity: How specific are the target customer descriptions?
           - Problem clarity: How well-articulated is the problem being solved?

        4. READINESS DETERMINATION:
           - Are we ready to show a confirmation summary?
           - What elements are still missing or unclear?
           - What improvements would increase readiness?

        Be conservative but focus on content quality and specificity rather than just conversation length.
        """

    def _build_intent_analysis_prompt(
        self,
        conversation_context: str,
        latest_input: str,
        messages: List[Dict[str, str]]
    ) -> str:
        """Build comprehensive intent analysis prompt."""

        # Get the last assistant message for context
        last_assistant_message = ""
        for msg in reversed(messages):
            if msg.get('role') == 'assistant':
                last_assistant_message = msg.get('content', '')
                break

        return f"""
        Analyze the user's latest response to determine their intent in this customer research conversation.

        Conversation Context:
        {conversation_context}

        Last Assistant Message:
        "{last_assistant_message}"

        User's Latest Response:
        "{latest_input}"

        Analyze the user's intent considering:

        1. PRIMARY INTENT:
           - Are they confirming information or decisions?
           - Are they rejecting or disagreeing with something?
           - Are they asking for clarification?
           - Are they continuing to provide more information?
           - Are they requesting to move forward with questions?
           - Are they changing the topic or direction?
           - Are they indicating completion or wanting to finish?
           - Are they asking for help or guidance?

        2. EMOTIONAL CONTEXT:
           - What is their emotional tone (positive, neutral, negative, frustrated, excited)?
           - What is their urgency level (low, medium, high)?
           - Are they engaged and interested or hesitant?

        3. SPECIFIC FEEDBACK:
           - What specifically are they confirming, rejecting, or clarifying?
           - What new information are they providing?
           - What concerns or questions do they have?

        4. RECOMMENDED RESPONSE:
           - What type of response would be most appropriate?
           - What should the assistant do next?
           - How should the conversation proceed?

        Provide detailed reasoning for your intent classification and be specific about what the user is communicating.
        """

    def _get_context_extraction_system_instruction(self) -> str:
        """Get system instruction for context extraction."""
        return """
        You are an expert business analyst specializing in extracting structured business information from conversations.

        Your task is to analyze customer research conversations and extract comprehensive business context.

        EXTRACTION PRINCIPLES:
        1. Be specific and detailed - avoid generic descriptions
        2. Extract only information that is clearly stated or strongly implied
        3. Leave fields empty rather than making assumptions
        4. Focus on actionable, research-relevant information
        5. Consider the business viability and market context

        COMPLETENESS SCORING:
        - High completeness (0.8-1.0): All core fields filled with specific details
        - Medium completeness (0.5-0.7): Most core fields filled, some details missing
        - Low completeness (0.0-0.4): Few fields filled or very generic information

        QUALITY ASSESSMENT:
        - High quality: Specific, actionable, research-ready information
        - Medium quality: Good information with some gaps or ambiguity
        - Low quality: Generic or insufficient information for research

        Always provide detailed, specific information that would be valuable for conducting customer research.
        """

    def _get_readiness_validation_system_instruction(self) -> str:
        """Get system instruction for readiness validation."""
        return """
        You are an expert customer research consultant specializing in determining when businesses are ready for structured customer research.

        Your task is to assess whether enough information has been gathered to proceed with research question generation.

        READINESS CRITERIA:
        1. Business idea must be specific and actionable (not just "an app" or "a platform")
        2. Target customers must be clearly defined (specific roles, not just "businesses")
        3. Problem must be articulated with clear pain points and consequences
        4. Conversation must show depth beyond surface-level descriptions

        CLARITY SCORING (0.0-1.0):
        - 0.9-1.0: Crystal clear, specific, actionable
        - 0.7-0.8: Clear with minor ambiguities
        - 0.5-0.6: Somewhat clear but needs more detail
        - 0.3-0.4: Vague or generic
        - 0.0-0.2: Very unclear or missing

        CONVERSATION QUALITY:
        - High: Specific examples, use cases, detailed descriptions
        - Medium: Good information with some specifics
        - Low: Generic descriptions, surface-level information

        Be conservative in your assessment - it's better to gather more information than to proceed with insufficient context.
        """

    def _get_intent_analysis_system_instruction(self) -> str:
        """Get system instruction for intent analysis."""
        return """
        You are an expert conversation analyst specializing in understanding user intent in customer research contexts.

        Your task is to analyze user responses and determine their intent, emotional state, and recommended next actions.

        INTENT CLASSIFICATION:
        - confirmation: User is agreeing or confirming information
        - rejection: User is disagreeing or rejecting something
        - clarification: User is asking for clarification or expressing confusion
        - continuation: User is providing more information or continuing the conversation
        - question_request: User is explicitly asking to proceed with questions
        - topic_change: User is changing the subject or direction
        - completion: User is indicating they want to finish or wrap up
        - help_request: User is asking for help or guidance

        EMOTIONAL TONE ASSESSMENT:
        - positive: Enthusiastic, satisfied, optimistic
        - neutral: Matter-of-fact, professional, balanced
        - negative: Frustrated, disappointed, pessimistic
        - frustrated: Specifically showing frustration or impatience
        - excited: Showing enthusiasm or eagerness

        RESPONSE TYPE RECOMMENDATIONS:
        - acknowledge_and_continue: Acknowledge their input and continue gathering information
        - ask_clarification: Ask for clarification or more details
        - provide_confirmation: Show a summary for confirmation
        - generate_questions: Proceed with research question generation
        - redirect_conversation: Guide the conversation back on track
        - provide_help: Offer assistance or guidance

        Always provide detailed reasoning for your intent classification and be specific about what the user is communicating.
        """

    async def _fallback_context_extraction(
        self,
        conversation_context: str,
        latest_input: str
    ) -> BusinessContext:
        """Fallback context extraction using V1-style keyword matching."""

        logger.info("Using fallback context extraction")

        context_lower = conversation_context.lower()
        input_lower = latest_input.lower()
        combined_text = f"{context_lower} {input_lower}"

        # Extract business idea using V1 logic
        business_idea = None
        if any(word in combined_text for word in self.config.BUSINESS_IDEA_KEYWORDS):
            if any(word in combined_text for word in self.config.BUSINESS_ACTION_KEYWORDS):
                # Try to extract more specific business idea
                for idea_word in self.config.BUSINESS_IDEA_KEYWORDS:
                    if idea_word in combined_text:
                        business_idea = f"A {idea_word} solution"
                        break

        # Extract target customer using V1 logic
        target_customer = None
        if any(word in combined_text for word in self.config.TARGET_CUSTOMER_KEYWORDS):
            if "small business" in combined_text:
                target_customer = "small businesses"
            elif "enterprise" in combined_text:
                target_customer = "enterprise customers"
            elif "startup" in combined_text:
                target_customer = "startups"
            else:
                target_customer = "business customers"

        # Extract problem using V1 logic
        problem = None
        if any(word in combined_text for word in self.config.PROBLEM_KEYWORDS):
            if "manual" in combined_text:
                problem = "manual processes and inefficiencies"
            elif "time" in combined_text:
                problem = "time-consuming workflows"
            elif any(word in combined_text for word in ["hard", "difficult", "challenge"]):
                problem = "operational or technical challenges"

        # Determine business stage
        business_stage = None
        for stage, indicators in self.config.STAGE_INDICATORS.items():
            if any(indicator in combined_text for indicator in indicators):
                business_stage = stage
                break

        return BusinessContext(
            business_idea=business_idea,
            target_customer=target_customer,
            problem=problem,
            business_stage=business_stage
        )

    async def _fallback_readiness_validation(
        self,
        conversation_context: str,
        latest_input: str
    ) -> BusinessReadiness:
        """Fallback readiness validation using V1-style logic."""

        logger.info("Using fallback readiness validation")

        context_lower = conversation_context.lower()

        # Check for specific business elements (V1 logic)
        has_specific_business_idea = (
            any(word in context_lower for word in self.config.BUSINESS_IDEA_KEYWORDS) and
            any(word in context_lower for word in self.config.BUSINESS_ACTION_KEYWORDS)
        )

        has_specific_target_customer = any(word in context_lower for word in [
            'small business', 'enterprise', 'startup', 'company', 'team', 'organization'
        ])

        has_specific_problem = any(word in context_lower for word in [
            'manual', 'time-consuming', 'inefficient', 'difficult', 'challenge', 'problem'
        ])

        # Calculate clarity scores
        idea_clarity = 0.8 if has_specific_business_idea else 0.3
        customer_clarity = 0.7 if has_specific_target_customer else 0.3
        problem_clarity = 0.7 if has_specific_problem else 0.3

        # Determine overall readiness
        avg_clarity = (idea_clarity + customer_clarity + problem_clarity) / 3
        ready = avg_clarity >= 0.6 and has_specific_business_idea

        return BusinessReadiness(
            ready_for_questions=ready,
            confidence=0.6 if ready else 0.4,
            reasoning="Fallback validation based on keyword detection",
            business_clarity={
                "idea_clarity": idea_clarity,
                "customer_clarity": customer_clarity,
                "problem_clarity": problem_clarity
            },
            conversation_quality="medium" if ready else "low",
            missing_elements=[] if ready else [
                "More specific business details needed",
                "Clearer target customer definition required",
                "More detailed problem description needed"
            ]
        )

    async def _fallback_intent_analysis(
        self,
        latest_input: str,
        messages: List[Dict[str, str]]
    ) -> UserIntent:
        """Fallback intent analysis using V1-style keyword matching."""

        logger.info("Using fallback intent analysis")

        input_lower = latest_input.lower()

        # V1 keyword-based intent detection
        if any(word in input_lower for word in ['yes', 'correct', 'right', 'exactly', 'confirm']):
            return UserIntent(
                primary_intent="confirmation",
                confidence=0.7,
                reasoning="Detected confirmation keywords",
                specific_feedback="User is confirming information",
                recommended_response_type="generate_questions",
                next_action="Proceed with question generation"
            )
        elif any(word in input_lower for word in ['no', 'wrong', 'incorrect', 'not right']):
            return UserIntent(
                primary_intent="rejection",
                confidence=0.7,
                reasoning="Detected rejection keywords",
                specific_feedback="User is rejecting or correcting information",
                recommended_response_type="ask_clarification",
                next_action="Ask for clarification or corrections"
            )
        elif any(word in input_lower for word in ['question', 'help', 'unclear', 'confused']):
            return UserIntent(
                primary_intent="clarification",
                confidence=0.6,
                reasoning="Detected clarification request keywords",
                specific_feedback="User needs clarification",
                recommended_response_type="ask_clarification",
                next_action="Provide clarification or ask for more details"
            )
        else:
            return UserIntent(
                primary_intent="continuation",
                confidence=0.5,
                reasoning="Default continuation intent",
                specific_feedback="User is continuing the conversation",
                recommended_response_type="acknowledge_and_continue",
                next_action="Continue gathering information"
            )

    # V1 compatibility methods
    async def extract_context_v1_compatible(
        self,
        conversation_context: str,
        latest_input: str
    ) -> Dict[str, Any]:
        """V1-compatible context extraction method."""

        try:
            business_context = await self.extract_business_context_comprehensive(
                conversation_context, latest_input
            )

            return {
                "business_idea": business_context.business_idea,
                "target_customer": business_context.target_customer,
                "problem": business_context.problem,
                "solution_approach": business_context.solution_approach,
                "market_context": business_context.market_context,
                "business_model": business_context.business_model,
                "business_stage": business_context.business_stage
            }

        except Exception as e:
            logger.error(f"Enhanced context extraction failed, using V1 fallback: {e}")
            return self._v1_manual_extraction(conversation_context, latest_input)

    def _v1_manual_extraction(self, conversation_context: str, latest_input: str) -> Dict[str, Any]:
        """Original V1 manual extraction logic (preserved exactly)."""

        context_lower = conversation_context.lower()
        input_lower = latest_input.lower()

        # V1 extraction logic (preserved exactly)
        business_idea = None
        if any(word in context_lower for word in ['app', 'platform', 'tool', 'service']):
            business_idea = "mobile or web application"
        elif any(word in context_lower for word in ['system', 'software', 'solution']):
            business_idea = "software solution"

        target_customer = None
        if "small business" in context_lower:
            target_customer = "small businesses"
        elif "enterprise" in context_lower:
            target_customer = "enterprise customers"
        elif any(word in context_lower for word in ["customer", "user", "client"]):
            target_customer = "business customers"

        problem = None
        if "manual" in context_lower:
            problem = "manual processes and inefficiencies"
        elif "time" in context_lower:
            problem = "time-consuming workflows"
        elif any(word in context_lower for word in ["hard", "difficult", "challenge", "problem", "issue"]):
            problem = "operational or technical challenges"

        return {
            "business_idea": business_idea,
            "target_customer": target_customer,
            "problem": problem
        }
