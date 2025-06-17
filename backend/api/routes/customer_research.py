"""
Customer Research API routes.
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.external.auth_middleware import get_current_user
from backend.models import User
from backend.services.llm import LLMServiceFactory
from backend.services.research_session_service import ResearchSessionService
from backend.models.research_session import ResearchSessionCreate, ResearchSessionUpdate
from backend.config.research_config import (
    RESEARCH_CONFIG,
    INDUSTRY_GUIDANCE,
    ERROR_CONFIG,
)
from backend.utils.research_validation import validate_research_request, ValidationError
from backend.utils.research_error_handler import (
    ErrorHandler,
    with_retry,
    with_timeout,
    APIError,
    APITimeoutError,
    ServiceUnavailableError,
    safe_execute,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/research",
    tags=["customer_research"],
    responses={404: {"description": "Not found"}},
)


# Pydantic models for request/response
class Message(BaseModel):
    id: str
    content: str
    role: str
    timestamp: str
    metadata: Optional[Dict[str, Any]] = None


class ResearchContext(BaseModel):
    businessIdea: Optional[str] = None
    targetCustomer: Optional[str] = None
    problem: Optional[str] = None
    stage: Optional[str] = None
    questionsGenerated: Optional[bool] = None
    multiStakeholderConsidered: Optional[bool] = None
    multiStakeholderDetected: Optional[bool] = None
    detectedStakeholders: Optional[Dict[str, Any]] = None


class ChatRequest(BaseModel):
    messages: List[Message]
    input: str
    context: Optional[ResearchContext] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None


class GenerateQuestionsRequest(BaseModel):
    context: ResearchContext
    conversationHistory: List[Message]


class ResearchQuestions(BaseModel):
    problemDiscovery: List[str]
    solutionValidation: List[str]
    followUp: List[str]
    stakeholders: Optional[Dict[str, Any]] = None  # Added stakeholder data support
    estimatedTime: Optional[Dict[str, Any]] = None  # Added time estimation support


class ChatResponse(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = None
    questions: Optional[ResearchQuestions] = None
    suggestions: Optional[List[str]] = None
    session_id: Optional[str] = None


# System prompt for customer research
RESEARCH_SYSTEM_PROMPT = """You are a customer research expert helping entrepreneurs validate their business ideas.

Your goal is to:
1. Understand their business idea clearly
2. Identify their target customers
3. Generate specific, actionable research questions
4. Provide guidance on who to talk to and how

Guidelines:
- Ask clarifying questions before generating research questions
- Be conversational and encouraging
- Focus on practical, actionable advice
- When you have enough information, generate structured research questions
- Format research questions in clear categories

When generating questions, use this structure:
🔍 PROBLEM DISCOVERY QUESTIONS (5 questions)
✅ SOLUTION VALIDATION QUESTIONS (5 questions)
💡 FOLLOW-UP QUESTIONS (3 questions)

Always be supportive and help them feel confident about doing customer research."""


@router.post("/chat", response_model=ChatResponse)
async def research_chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Handle customer research chat conversation.
    """
    try:
        logger.info("Processing research chat request")
        logger.info(
            f"Request data: messages={len(request.messages)}, input='{request.input}', session_id={request.session_id}"
        )

        # Simple input sanitization for research chat (skip strict validation)
        if hasattr(request, "input") and request.input:
            from backend.utils.research_validation import ResearchValidator

            # Just sanitize the input without strict validation
            request.input = ResearchValidator.sanitize_input(request.input)
            logger.debug(f"Sanitized input: {request.input}")

        # Skip strict validation for research chat to avoid blocking valid messages

        # Create services
        session_service = ResearchSessionService(db)
        logger.info("Session service created successfully")

        # Create LLM service
        llm_service = LLMServiceFactory.create("enhanced_gemini")
        logger.info("LLM service created successfully")

        # Handle session management
        session_id = request.session_id
        is_local_session = session_id and session_id.startswith("local_")

        if not session_id:
            # Create new session
            session_data = ResearchSessionCreate(
                user_id=request.user_id,
                business_idea=request.context.businessIdea if request.context else None,
                target_customer=(
                    request.context.targetCustomer if request.context else None
                ),
                problem=request.context.problem if request.context else None,
            )
            session = session_service.create_session(session_data)
            session_id = session.session_id
        elif is_local_session:
            # Local session - skip database lookup, just use the session_id
            logger.info(f"Processing local session: {session_id}")
            session = None  # We don't need the session object for local sessions
        else:
            # Get existing database session
            session = session_service.get_session(session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

        # Build conversation context
        conversation_context = "\n".join(
            [f"{msg.role}: {msg.content}" for msg in request.messages]
        )
        logger.info(
            f"Conversation context built: {len(conversation_context)} characters"
        )

        # Generate proper conversational response using LLM with error handling
        try:
            response_content = await generate_research_response_with_retry(
                llm_service=llm_service,
                messages=request.messages,
                user_input=request.input,
                context=request.context,
                conversation_context=conversation_context,
            )
            logger.info(f"Generated response: {response_content}")
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            error_response, error_code = ErrorHandler.handle_llm_error(
                e, {"stage": "response_generation"}
            )
            return ChatResponse(
                content=error_response,
                metadata={"error_code": error_code},
                session_id=request.session_id,
            )

        # Use LLM-based business validation to determine readiness and confirmation needs
        business_validation = await validate_business_readiness_with_llm(
            llm_service, conversation_context, request.input
        )

        # Use LLM to analyze user intent instead of keyword matching
        user_intent = await analyze_user_intent_with_llm(
            llm_service, conversation_context, request.input, request.messages
        )

        # Extract intent from LLM analysis
        user_confirmed = user_intent.get("intent") == "confirmation"
        user_rejected = user_intent.get("intent") == "rejection"
        user_wants_clarification = user_intent.get("intent") == "clarification"

        # Check if we should confirm before generating questions
        should_confirm = (
            business_validation.get("ready_for_questions", False)
            and business_validation.get("conversation_quality") in ["medium", "high"]
            and not user_confirmed
            and not user_rejected
            and not user_wants_clarification  # Don't confirm if user wants to clarify
        )

        if should_confirm:
            # Generate confirmation message instead of regular response
            confirmation_response = await generate_confirmation_response(
                llm_service,
                request.messages,
                request.input,
                request.context,
                conversation_context,
            )

            # Generate confirmation-specific suggestions
            confirmation_suggestions = [
                "Yes, that's correct",
                "Let me add something",
                "I need to clarify something",
            ]

            # Save messages to session for confirmation flow (skip for local sessions)
            if not is_local_session:
                user_message = {
                    "id": f"user_{len(request.messages)}",
                    "content": request.input,
                    "role": "user",
                    "timestamp": datetime.utcnow().isoformat(),
                }
                session_service.add_message(session_id, user_message)

                assistant_message = {
                    "id": f"assistant_{len(request.messages)}",
                    "content": confirmation_response,
                    "role": "assistant",
                    "timestamp": datetime.utcnow().isoformat(),
                    "metadata": {
                        "questionCategory": "confirmation",
                        "researchStage": "confirmation",
                        "needs_confirmation": True,
                        "suggestions": confirmation_suggestions,
                    },
                }
                session_service.add_message(session_id, assistant_message)

            # Extract context for confirmation response too
            extracted_context = await extract_context_with_llm(
                llm_service, conversation_context, request.input
            )

            return ChatResponse(
                content=confirmation_response,
                metadata={
                    "questionCategory": "confirmation",
                    "researchStage": "confirmation",
                    "needs_confirmation": True,
                    "suggestions": confirmation_suggestions,
                    "extracted_context": extracted_context,
                },
                suggestions=confirmation_suggestions,
                session_id=session_id,
            )

        # If user rejected or wants clarification, continue with normal conversation flow (don't generate questions)
        if user_rejected or user_wants_clarification:
            # Continue with normal conversation - the LLM will handle the rejection/clarification and ask for more info
            # The response will be generated by generate_research_response_with_retry below
            pass

        # Only generate questions if user explicitly confirmed (after seeing confirmation message)
        questions = None
        if user_confirmed:
            questions = await generate_research_questions(
                llm_service=llm_service,
                context=request.context or ResearchContext(),
                conversation_history=request.messages,
            )

            # Detect stakeholders using LLM
            stakeholder_data = await detect_stakeholders_with_llm(
                llm_service=llm_service,
                context=request.context or ResearchContext(),
                conversation_history=request.messages,
            )

            # If questions were generated, create a simple response without duplicating the questions
            if questions:
                response_content = "Perfect! I've generated your custom research questions based on our conversation. These questions are designed specifically for your target customers and will appear in a structured format below."

        # Generate contextual suggestions for the response (only if not generating questions)
        suggestions = []
        if not questions:
            try:
                suggestions = await generate_contextual_suggestions(
                    llm_service,
                    request.messages,
                    request.input,
                    response_content,
                    conversation_context,
                )
            except Exception as e:
                logger.error(f"Error generating suggestions: {str(e)}")
                # Use fallback suggestions
                suggestions = generate_fallback_suggestions(
                    request.input, response_content
                )

        # Save user message to session (skip for local sessions)
        if not is_local_session:
            user_message = {
                "id": f"user_{len(request.messages)}",
                "content": request.input,
                "role": "user",
                "timestamp": datetime.utcnow().isoformat(),
            }
            logger.info(f"Saving user message: {user_message}")
            session_service.add_message(session_id, user_message)
            logger.info("User message saved successfully")

            # Save assistant response to session
            assistant_message = {
                "id": f"assistant_{len(request.messages)}",
                "content": response_content,
                "role": "assistant",
                "timestamp": datetime.utcnow().isoformat(),
                "metadata": {
                    "questionCategory": "validation" if questions else "discovery",
                    "researchStage": determine_research_stage(request.context),
                    "suggestions": suggestions,
                },
            }
            logger.info(f"Saving assistant message: {assistant_message}")
            session_service.add_message(session_id, assistant_message)
            logger.info("Assistant message saved successfully")
        else:
            logger.info("Skipping database save for local session")

        # Extract context using LLM analysis
        extracted_context = await extract_context_with_llm(
            llm_service, conversation_context, request.input
        )

        # Mark questions as generated if they were created
        if questions:
            extracted_context["questions_generated"] = True
            # Include stakeholder data in extracted context
            if "stakeholder_data" in locals():
                extracted_context["detected_stakeholders"] = stakeholder_data

        # Update session context with LLM-extracted information (skip for local sessions)
        if not is_local_session:
            # Use LLM-based industry classification instead of keyword matching
            industry_data = await classify_industry_with_llm(
                llm_service, conversation_context, request.input
            )
            industry = industry_data.get("industry", "general")

            update_data = ResearchSessionUpdate(
                business_idea=extracted_context.get("business_idea"),
                target_customer=extracted_context.get("target_customer"),
                problem=extracted_context.get("problem"),
                industry=industry,
                stage=determine_research_stage_from_context(extracted_context),
                conversation_context=conversation_context,
            )
            session_service.update_session(session_id, update_data)

            # If questions were generated, mark session as completed
            if questions:
                session_service.complete_session(session_id, questions.model_dump())
        else:
            logger.info("Skipping session update for local session")

        return ChatResponse(
            content=response_content,
            metadata={
                "questionCategory": "validation" if questions else "discovery",
                "researchStage": determine_research_stage_from_context(
                    extracted_context
                ),
                "suggestions": suggestions,
                "extracted_context": extracted_context,
            },
            questions=questions,
            suggestions=suggestions,
            session_id=session_id,
        )

    except Exception as e:
        logger.error(f"Error in research chat: {str(e)}")
        # Use error handler for consistent error responses
        error_response, error_code = ErrorHandler.handle_llm_error(
            e, {"stage": "general"}
        )
        return ChatResponse(
            content=error_response,
            metadata={"error_code": error_code},
            session_id=request.session_id,
        )


@router.post("/generate-questions", response_model=ResearchQuestions)
async def generate_questions_endpoint(
    request: GenerateQuestionsRequest, db: Session = Depends(get_db)
):
    """
    Generate research questions based on context and conversation history.
    """
    try:
        logger.info("Generating research questions")

        # Create LLM service
        llm_service = LLMServiceFactory.create("enhanced_gemini")

        # Generate questions
        questions = await generate_research_questions(
            llm_service=llm_service,
            context=request.context,
            conversation_history=request.conversationHistory,
        )

        return questions

    except Exception as e:
        logger.error(f"Error generating questions: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Question generation failed: {str(e)}"
        )


@with_retry(max_retries=RESEARCH_CONFIG.MAX_RETRIES)
@with_timeout(timeout_seconds=RESEARCH_CONFIG.REQUEST_TIMEOUT_SECONDS)
async def generate_research_response_with_retry(
    llm_service,
    messages: List[Message],
    user_input: str,
    context: Optional[ResearchContext],
    conversation_context: str,
) -> str:
    """Generate research response with retry logic and timeout"""
    return await generate_research_response(
        llm_service, messages, user_input, context, conversation_context
    )


async def generate_research_response(
    llm_service,
    messages: List[Message],
    user_input: str,
    context: Optional[ResearchContext],
    conversation_context: str,
) -> str:
    """Generate conversational response using Gemini."""

    # Determine what stage we're at and provide appropriate response
    has_business_idea = context and context.businessIdea
    has_target_customer = context and context.targetCustomer
    has_problem = context and context.problem

    # Use LLM-based industry detection for specialized guidance
    industry = "general"
    if has_business_idea and has_target_customer and has_problem:
        # Build conversation context for industry detection
        conversation_text = "\n".join(
            [f"{msg.role}: {msg.content}" for msg in messages]
        )
        try:
            industry_data = await classify_industry_with_llm(
                llm_service, conversation_text, user_input
            )
            industry = industry_data.get("industry", "general")
        except Exception as e:
            logger.error(f"Error in LLM industry detection: {str(e)}")
            industry = "general"

    # Build more detailed prompts that encourage longer conversations
    if not has_business_idea:
        prompt = f"""You are a customer research expert. The user said: "{user_input}"

Help them describe their business idea clearly. Ask one specific follow-up question to understand their business concept better. Focus on getting more details about what they're building, how it works, or what makes it unique. Be encouraging and conversational. Keep your response to 2-3 sentences maximum."""
    elif not has_target_customer:
        prompt = f"""You are a customer research expert. The user has a business idea: "{context.businessIdea if context else ''}"

They just said: "{user_input}"

Help them identify their target customers more specifically. Ask about specific roles, departments, or types of organizations that would use their solution. Don't accept vague answers - dig deeper for specific user personas. Be encouraging and conversational. Keep your response to 2-3 sentences maximum."""
    elif not has_problem:
        prompt = f"""You are a customer research expert. The user has:
- Business idea: {context.businessIdea if context else ''}
- Target customer: {context.targetCustomer if context else ''}

They just said: "{user_input}"

Help them clarify the specific problem they're solving. Ask about the pain points, inefficiencies, or challenges their target customers face. Focus on understanding the impact and urgency of the problem. Be encouraging and conversational. Keep your response to 2-3 sentences maximum."""
    else:
        # Continue exploring even with basic context - dig deeper
        conversation_length = len(messages)

        # Use LLM intent analysis for better understanding
        user_intent = await analyze_user_intent_with_llm(
            llm_service, conversation_context, user_input, messages
        )

        # Handle different intents
        if user_intent.get("intent") == "confirmation":
            # This is handled in the main chat function, not here
            # Return a simple response to trigger question generation in main flow
            return "Perfect! Let me generate your research questions now..."

        # Check if user rejected a confirmation or wants clarification
        if user_intent.get("intent") in ["rejection", "clarification"]:
            intent_reasoning = user_intent.get("reasoning", "")
            specific_feedback = user_intent.get("specific_feedback", "")
            next_action = user_intent.get("next_action", "")

            prompt = f"""You are a customer research expert. The user's intent analysis shows:
- Intent: {user_intent.get('intent')}
- Reasoning: {intent_reasoning}
- Specific feedback: {specific_feedback}
- Recommended next action: {next_action}

Previous context:
- Business idea: {context.businessIdea if context else ''}
- Target customer: {context.targetCustomer if context else ''}
- Problem: {context.problem if context else ''}

They just said: "{user_input}"

Based on the intent analysis, respond appropriately. If they rejected your understanding, ask what specifically was wrong. If they want to clarify, ask them to elaborate on what they want to add or correct. Be encouraging and conversational. Keep your response to 2-3 sentences maximum."""

            try:
                response = await llm_service.generate_text(
                    prompt=prompt, temperature=0.7, max_tokens=4000
                )
                return response.strip()
            except Exception as e:
                logger.error(f"Error generating rejection response: {str(e)}")
                return "I understand that wasn't quite right. Could you help me understand what I got wrong? What would you like to clarify or correct?"

        elif conversation_length < 20:  # Continue exploring for reasonable length
            # Analyze conversation to avoid loops
            recent_messages = [
                msg.content for msg in messages if msg.role == "assistant"
            ]
            recent_topics = " ".join(recent_messages).lower()

            # Choose different exploration areas based on what hasn't been covered
            if "use case" not in recent_topics and "scenario" not in recent_topics:
                focus_area = "specific use cases or scenarios where this solution would be most valuable"
            elif "alternative" not in recent_topics and "current" not in recent_topics:
                focus_area = "current alternatives or workarounds they use today"
            elif "impact" not in recent_topics and "metric" not in recent_topics:
                focus_area = "business impact, metrics, or quantifiable benefits"
            elif "challenge" not in recent_topics and "difficult" not in recent_topics:
                focus_area = "implementation challenges or technical hurdles"
            elif "market" not in recent_topics and "competitor" not in recent_topics:
                focus_area = "market size, competition, or industry landscape"
            else:
                focus_area = (
                    "specific pain points or frustrations in their current process"
                )

            prompt = f"""You are a customer research expert. The user has shared:
- Business idea: {context.businessIdea if context else ''}
- Target customer: {context.targetCustomer if context else ''}
- Problem: {context.problem if context else ''}

They just said: "{user_input}"

Continue exploring by asking about {focus_area}. Ask one specific, detailed question that hasn't been covered yet. Be encouraging and conversational. Keep your response to 2-3 sentences maximum."""
        else:
            # Include industry-specific guidance after longer conversation
            industry_guidance = get_industry_guidance(industry)

            prompt = f"""You are a customer research expert with expertise in {industry} businesses. The user has provided:
- Business idea: {context.businessIdea if context else ''}
- Target customer: {context.targetCustomer if context else ''}
- Problem: {context.problem if context else ''}

They just said: "{user_input}"

{industry_guidance}

You have enough information to generate research questions. Let them know you're ready to create their custom research questions tailored to the {industry} industry. Be encouraging and mention that you'll create specific questions for their situation. Keep your response to 2-3 sentences maximum."""

    try:
        # Try the LLM service first
        response = await llm_service.generate_text(
            prompt=prompt,
            temperature=0.7,
            max_tokens=8000,  # Increased to use more of the 65k available
        )
        return response.strip()
    except Exception as e:
        logger.error(f"LLM service failed: {str(e)}")

        # Fallback to simple responses based on stage
        try:
            return await generate_simple_fallback_response(user_input, context)
        except Exception as fallback_e:
            logger.error(f"Fallback also failed: {str(fallback_e)}")
            return "I'm sorry, I encountered an error. Could you please try rephrasing your message?"


async def generate_simple_fallback_response(
    user_input: str, context: Optional[ResearchContext]
) -> str:
    """Generate simple fallback responses when Gemini is not working."""

    has_business_idea = context and context.businessIdea
    has_target_customer = context and context.targetCustomer
    has_problem = context and context.problem

    if not has_business_idea:
        return "That sounds interesting! Could you tell me more about what your business idea involves? For example, is it an app, a service, or a physical product?"
    elif not has_target_customer:
        return f"Great! So you want to work on {context.businessIdea}. Who do you think would be most interested in using this? What type of customers are you hoping to help?"
    elif not has_problem:
        return f"Perfect! So you're targeting {context.targetCustomer} with {context.businessIdea}. What specific problem or challenge does this solve for them?"
    else:
        return f"Excellent! I have enough information to create research questions for your idea. You want to build {context.businessIdea} for {context.targetCustomer} to solve {context.problem}. Let me generate some targeted research questions for you!"


async def generate_confirmation_response(
    llm_service,
    messages: List[Message],
    user_input: str,
    context: Optional[ResearchContext],
    conversation_context: str,
) -> str:
    """Generate confirmation message summarizing what we've learned."""

    # Analyze the conversation to extract better context instead of relying on faulty context extraction
    user_messages = [msg.content for msg in messages if msg.role == "user"]

    # Build confirmation prompt with full conversation context for AI to analyze
    prompt = f"""You are a customer research expert. Based on our conversation, create a clear summary of what you understand about their business idea.

Full conversation:
{conversation_context}

Analyze this conversation and create a confirmation message that:
1. Clearly summarizes their business idea/product/service
2. Identifies who their target customers/users are
3. Explains the main problem or challenge they're solving
4. Asks if this understanding is correct
5. Mentions you're ready to generate research questions

Be conversational and encouraging. Keep it to 3-4 sentences maximum. Make sure your summary is accurate based on what they actually said in the conversation."""

    try:
        response = await llm_service.generate_text(
            prompt=prompt,
            temperature=0.7,
            max_tokens=8000,  # Increased to use more of the 65k available
        )
        return response.strip()
    except Exception as e:
        logger.error(f"Error generating confirmation response: {str(e)}")

        # Improved fallback confirmation message - analyze conversation manually
        business_summary = "an internal B2B product"
        customer_summary = "account managers and sales teams"
        problem_summary = "scattered customer data affecting decision-making"

        # Try to extract better info from user messages
        for msg in user_messages:
            msg_lower = msg.lower()
            if "api" in msg_lower and "data" in msg_lower:
                business_summary = "an API platform for consolidating data from different source systems"
            if "account manager" in msg_lower:
                customer_summary = "account managers"
            if "scattered" in msg_lower or "discount" in msg_lower:
                problem_summary = msg
                break

        return f"""Perfect! Let me confirm what I understand about your idea:

• **Business concept**: {business_summary}
• **Target users**: {customer_summary}
• **Key challenge**: {problem_summary}

Does this capture it correctly? If so, I'm ready to generate specific research questions tailored to your situation. Or let me know if there's anything you'd like to add or correct!"""


async def generate_contextual_suggestions(
    llm_service,
    messages: List[Message],
    user_input: str,
    assistant_response: str,
    conversation_context: str,
) -> List[str]:
    """Generate contextual quick reply suggestions based on the conversation."""

    # Build a concise prompt for generating suggestions
    prompt = f"""Generate 3 short quick replies that the USER might say in response to the assistant's message:

Conversation context:
{conversation_context}

User's latest input: "{user_input}"
Assistant's response: "{assistant_response}"

Generate what the USER might say NEXT as natural responses to the assistant's question or comment.

Examples:
- If assistant asks "What problem does your business solve?", user might say: "Customer data management", "Inventory tracking", "User onboarding"
- If assistant asks "Who are your customers?", user might say: "Small businesses", "Enterprise clients", "Individual consumers"

Return only JSON array: ["user_reply1", "user_reply2", "user_reply3"]

Make replies:
- 2-6 words each
- Natural USER responses to assistant's question
- Specific answers, not more questions"""

    try:
        response = await llm_service.generate_text(
            prompt=prompt,
            temperature=0.0,  # Use 0.0 for JSON array responses
            max_tokens=2000,  # Increased for suggestions generation
        )

        # Parse JSON response
        import json

        response_clean = response.strip()
        if response_clean.startswith("```json"):
            response_clean = response_clean[7:]
        if response_clean.endswith("```"):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()

        suggestions = json.loads(response_clean)

        # Ensure we have exactly 3 suggestions and they're strings
        if isinstance(suggestions, list) and len(suggestions) >= 3:
            return [str(s) for s in suggestions[:3]]
        else:
            raise ValueError("Invalid suggestions format")

    except Exception as e:
        logger.error(f"Error generating contextual suggestions: {str(e)}")

        # Fallback suggestions based on conversation stage
        return generate_fallback_suggestions(user_input, assistant_response)


def generate_fallback_suggestions(
    user_input: str, assistant_response: str
) -> List[str]:
    """Generate fallback suggestions when LLM fails."""

    user_lower = user_input.lower()
    response_lower = assistant_response.lower()

    # If assistant is asking about business idea or problem
    if any(
        phrase in response_lower
        for phrase in ["business", "idea", "problem", "solve", "core problem"]
    ):
        return [
            "Data management solution",
            "Customer analytics platform",
            "Workflow automation tool",
        ]

    # If assistant is asking about customers or target market
    elif any(
        phrase in response_lower
        for phrase in ["customer", "who", "target", "audience", "clients"]
    ):
        return ["Small businesses", "Enterprise companies", "Individual users"]

    # If assistant is asking about specific problems or pain points
    elif any(
        phrase in response_lower
        for phrase in ["pain", "challenge", "frustrating", "difficulty"]
    ):
        return ["Time consuming process", "Lack of visibility", "Manual work required"]

    # If assistant is asking about features or functionality
    elif any(
        phrase in response_lower
        for phrase in ["feature", "functionality", "how", "what does"]
    ):
        return ["Data integration", "Real-time analytics", "Automated reporting"]

    # If assistant is confirming understanding
    elif any(
        phrase in response_lower
        for phrase in ["confirm", "understand", "correct", "right", "sound"]
    ):
        return ["Yes, that's correct", "Let me add something", "I need to clarify"]

    # Default suggestions - user responses to continue conversation
    else:
        return ["Let me explain more", "That's exactly right", "I have more details"]


async def detect_stakeholders_with_llm(
    llm_service, context: ResearchContext, conversation_history: List[Message]
) -> dict:
    """Use LLM to intelligently detect stakeholders from conversation context."""

    # Build conversation text for analysis
    conversation_text = "\n".join(
        [f"{msg.role}: {msg.content}" for msg in conversation_history]
    )

    business_idea = context.businessIdea or "Not specified"
    target_customer = context.targetCustomer or "Not specified"
    problem = context.problem or "Not specified"

    prompt = f"""Analyze this customer research conversation and identify the key stakeholders who would be involved in evaluating, purchasing, or using this solution.

Business Context:
- Business Idea: {business_idea}
- Target Customer: {target_customer}
- Problem: {problem}

Recent Conversation:
{conversation_text}

Identify the most relevant stakeholders for customer research interviews. You must provide:

1. PRIMARY STAKEHOLDERS (2-3 most important):
   - Main decision makers, daily users, or people who directly benefit
   - Each must have a specific "name" and detailed "description"

2. SECONDARY STAKEHOLDERS (1-3 additional perspectives):
   - Influencers, occasional users, or indirect beneficiaries
   - Each must have a specific "name" and detailed "description"

3. INDUSTRY classification (single word)

For this business context:
- Business: {business_idea}
- Customers: {target_customer}
- Problem: {problem}

Focus on stakeholders who would provide valuable insights for customer research interviews.

Guidelines:
- Primary stakeholders: Main decision makers, daily users, or people who directly benefit (max 3)
- Secondary stakeholders: Influencers, occasional users, or indirect beneficiaries (max 3)
- Use specific role titles mentioned in conversation when possible
- If no specific roles mentioned, infer logical stakeholders based on business context
- Industry should be one word (e.g., "healthcare", "education", "saas", "ecommerce", "finance")
- Focus on roles that would actually be interviewed for customer research
- Descriptions should be business-specific and explain their role in THIS context

Description Examples:
- For bioplastic materials: "R&D Engineers who evaluate sustainable material innovations for medical device manufacturing and ensure compatibility with existing production processes"
- For UX research tools: "UX Researchers who conduct user studies and need efficient tools to create questionnaires and analyze user feedback"
- For B2B software: "IT Directors who evaluate enterprise software solutions and ensure they integrate with existing infrastructure"

Make descriptions specific to the business idea, target customers, and problem being solved."""

    try:
        # Try Instructor first for structured output
        try:
            from backend.models.comprehensive_questions import StakeholderDetection
            from backend.services.llm.instructor_gemini_client import (
                InstructorGeminiClient,
            )

            logger.info("🚀 Using Instructor for stakeholder detection")

            # Create Instructor client
            instructor_client = InstructorGeminiClient()

            # Generate structured output using Instructor
            stakeholder_data = await instructor_client.generate_with_model_async(
                prompt=prompt,
                model_class=StakeholderDetection,
                system_instruction="You are an expert business analyst. Identify the most relevant stakeholders for customer research interviews.",
            )

            logger.info(f"✅ Instructor detected stakeholders successfully")
            logger.info(f"Primary: {[s['name'] for s in stakeholder_data.primary]}")
            logger.info(f"Secondary: {[s['name'] for s in stakeholder_data.secondary]}")
            logger.info(f"Industry: {stakeholder_data.industry}")

            # Convert to dict for API compatibility
            return stakeholder_data.dict()

        except Exception as instructor_error:
            logger.warning(
                f"Instructor failed, falling back to manual JSON parsing: {instructor_error}"
            )

            # Fallback to manual JSON parsing - use temperature=0.0 for JSON responses
            response = await llm_service.generate_text(
                prompt=prompt, temperature=0.0, max_tokens=8000
            )

            logger.info(f"LLM stakeholder detection raw response: {response}")

            # Parse JSON response
            import json

            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean[7:]
            if response_clean.endswith("```"):
                response_clean = response_clean[:-3]
            response_clean = response_clean.strip()

            logger.info(f"Cleaned response for JSON parsing: {response_clean}")

            stakeholder_data = json.loads(response_clean)
            logger.info(f"Parsed stakeholder data: {stakeholder_data}")

            # Validate structure - now expecting objects with name/description
            if not isinstance(stakeholder_data.get("primary"), list):
                raise ValueError("Invalid primary stakeholders format")
            if not isinstance(stakeholder_data.get("secondary"), list):
                raise ValueError("Invalid secondary stakeholders format")

            # Handle both old format (strings) and new format (objects with name/description)
            # Convert old format to new format if needed
            def convert_stakeholder_format(stakeholders_list):
                converted = []
                for stakeholder in stakeholders_list:
                    if isinstance(stakeholder, str):
                        # Old format - convert to new format with generic description
                        logger.warning(
                            f"Converting old format stakeholder: {stakeholder}"
                        )
                        converted.append(
                            {
                                "name": stakeholder,
                                "description": f"Stakeholder involved in {stakeholder.lower()} activities",
                            }
                        )
                    elif (
                        isinstance(stakeholder, dict)
                        and "name" in stakeholder
                        and "description" in stakeholder
                    ):
                        # New format - use as is
                        converted.append(stakeholder)
                    else:
                        # Invalid format
                        logger.error(f"Invalid stakeholder format: {stakeholder}")
                        raise ValueError(f"Invalid stakeholder format: {stakeholder}")
                return converted

            # Convert both primary and secondary stakeholders
            stakeholder_data["primary"] = convert_stakeholder_format(
                stakeholder_data.get("primary", [])
            )
            stakeholder_data["secondary"] = convert_stakeholder_format(
                stakeholder_data.get("secondary", [])
            )

            logger.info(f"Successfully processed stakeholder data with descriptions")
            return stakeholder_data

    except Exception as e:
        logger.error(f"Error detecting stakeholders: {str(e)}")
        logger.error(f"Falling back to keyword-based detection")
        # Fallback to simple detection based on keywords
        return detect_stakeholders_fallback(business_idea, target_customer, problem)


def detect_stakeholders_fallback(
    business_idea: str, target_customer: str, problem: str
) -> dict:
    """Fallback stakeholder detection when LLM fails."""

    all_text = f"{business_idea} {target_customer} {problem}".lower()

    # Simple keyword-based detection as fallback with name/description structure
    if any(word in all_text for word in ["ux", "user research", "design", "product"]):
        return {
            "primary": [
                {
                    "name": "UX Researchers",
                    "description": "Conduct user research and usability testing",
                },
                {
                    "name": "Product Managers",
                    "description": "Define product strategy and requirements",
                },
                {
                    "name": "Designers",
                    "description": "Create user interfaces and experiences",
                },
            ],
            "secondary": [
                {
                    "name": "Research Operations",
                    "description": "Coordinate and scale research activities",
                },
                {
                    "name": "Engineering Teams",
                    "description": "Develop technical solutions",
                },
            ],
            "industry": "ux_research",
            "reasoning": "Detected UX/Product context from keywords",
        }
    elif any(
        word in all_text for word in ["healthcare", "medical", "patient", "doctor"]
    ):
        return {
            "primary": [
                {
                    "name": "Healthcare Providers",
                    "description": "Deliver medical care and treatment to patients",
                },
                {
                    "name": "Patients",
                    "description": "Receive medical care and treatment",
                },
            ],
            "secondary": [
                {
                    "name": "Hospital Administrators",
                    "description": "Manage hospital operations and resources",
                },
                {
                    "name": "Insurance Companies",
                    "description": "Provide healthcare coverage and reimbursement",
                },
            ],
            "industry": "healthcare",
            "reasoning": "Detected healthcare context from keywords",
        }
    elif any(
        word in all_text for word in ["education", "teacher", "student", "school"]
    ):
        return {
            "primary": [
                {
                    "name": "Teachers",
                    "description": "Educate students and manage classroom activities",
                },
                {
                    "name": "Students",
                    "description": "Learn and participate in educational activities",
                },
            ],
            "secondary": [
                {
                    "name": "School Administrators",
                    "description": "Manage school operations and policies",
                },
                {
                    "name": "Parents",
                    "description": "Support student learning and school involvement",
                },
            ],
            "industry": "education",
            "reasoning": "Detected education context from keywords",
        }
    else:
        return {
            "primary": [
                {
                    "name": "Decision Makers",
                    "description": "Evaluate and approve new solutions",
                },
                {
                    "name": "End Users",
                    "description": "Use the product in their daily work",
                },
            ],
            "secondary": [
                {"name": "IT Teams", "description": "Manage technology infrastructure"},
                {"name": "Support Staff", "description": "Provide customer assistance"},
            ],
            "industry": "general",
            "reasoning": "General business stakeholders (fallback)",
        }


async def generate_comprehensive_research_questions(
    llm_service,
    context: ResearchContext,
    conversation_history: List[Message],
    stakeholder_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generate comprehensive research questions with stakeholder integration using Instructor."""

    # Import Pydantic models and Instructor client
    from backend.models.comprehensive_questions import (
        ComprehensiveQuestions,
        StakeholderDetection,
    )
    from backend.services.llm.instructor_gemini_client import InstructorGeminiClient

    # FIXED: Detect stakeholders first if not provided
    if not stakeholder_data:
        logger.info("🔧 Detecting stakeholders from business context")
        stakeholder_data = await detect_stakeholders_with_llm(
            llm_service=llm_service,
            context=context,
            conversation_history=conversation_history,
        )

    # Build comprehensive prompt for stakeholder-specific questions
    business_idea = context.businessIdea or "Not specified"
    target_customer = context.targetCustomer or "Not specified"
    problem = context.problem or "Not specified"

    # Extract stakeholder information
    primary_stakeholders = stakeholder_data.get("primary", [])
    secondary_stakeholders = stakeholder_data.get("secondary", [])
    industry = stakeholder_data.get("industry", "general")

    # Create optimized prompt for Instructor structured output
    primary_names = [
        s.get("name", s) if isinstance(s, dict) else s for s in primary_stakeholders
    ]
    secondary_names = [
        s.get("name", s) if isinstance(s, dict) else s for s in secondary_stakeholders
    ]

    prompt = f"""Generate comprehensive customer research questions for this business:

BUSINESS CONTEXT:
- Business Idea: {business_idea}
- Target Customer: {target_customer}
- Problem: {problem}
- Industry: {industry}

You must create a structured response with the following format:

PRIMARY STAKEHOLDERS (create exactly {len(primary_names)} stakeholder objects):
{chr(10).join([f'- {name}: Create a stakeholder object with name "{name}", a detailed description of their role/relationship to the business, and specific questions' for name in primary_names])}

SECONDARY STAKEHOLDERS (create exactly {len(secondary_names)} stakeholder objects):
{chr(10).join([f'- {name}: Create a stakeholder object with name "{name}", a detailed description of their role/relationship to the business, and specific questions' for name in secondary_names])}

For EACH stakeholder, you must provide:
1. name: The exact stakeholder name (e.g., "{primary_names[0] if primary_names else 'Young Professionals'}")
2. description: A detailed description of this stakeholder's role and relationship to the business (50-150 words)
3. questions: An object containing three arrays:
   - problemDiscovery: 5 specific questions to understand their current challenges
   - solutionValidation: 5 specific questions to validate the solution with them
   - followUp: 3 specific questions for additional insights

CRITICAL REQUIREMENTS:
- Each stakeholder MUST have a non-empty "name" field
- Each stakeholder MUST have a detailed "description" field explaining their role
- Each stakeholder MUST have a "questions" object with all three question arrays
- Questions must be specific to each stakeholder's perspective and role
- Use the exact business context: {business_idea} for {target_customer} solving {problem}
- Make questions actionable and specific to this business situation
- Avoid generic questions - tailor them to each stakeholder's unique perspective

The response must be a valid JSON structure matching the ComprehensiveQuestions schema with primaryStakeholders, secondaryStakeholders, and timeEstimate fields."""

    try:
        # Use Instructor for structured output generation
        logger.info("🚀 Using Instructor for comprehensive question generation")

        # Create Instructor client
        instructor_client = InstructorGeminiClient()

        # Generate structured output using Instructor
        comprehensive_questions = await instructor_client.generate_with_model_async(
            prompt=prompt,
            model_class=ComprehensiveQuestions,
            system_instruction="You are an expert customer research consultant. You must generate a complete ComprehensiveQuestions object with properly structured stakeholder objects. Each stakeholder must have a name, description, and questions object with problemDiscovery, solutionValidation, and followUp arrays. Never return empty objects or null values.",
        )

        logger.info(f"✅ Instructor generated comprehensive questions successfully")
        logger.info(
            f"Generated {len(comprehensive_questions.primaryStakeholders)} primary and {len(comprehensive_questions.secondaryStakeholders)} secondary stakeholders"
        )

        # Calculate and update time estimates
        total_questions = comprehensive_questions.get_total_questions()
        min_time, max_time = comprehensive_questions.get_estimated_time_range()

        # Update the time estimate with calculated values
        comprehensive_questions.timeEstimate.totalQuestions = total_questions
        comprehensive_questions.timeEstimate.estimatedMinutes = f"{min_time}-{max_time}"
        comprehensive_questions.timeEstimate.breakdown = {
            "primary": sum(
                len(s.questions.problemDiscovery)
                + len(s.questions.solutionValidation)
                + len(s.questions.followUp)
                for s in comprehensive_questions.primaryStakeholders
            ),
            "secondary": sum(
                len(s.questions.problemDiscovery)
                + len(s.questions.solutionValidation)
                + len(s.questions.followUp)
                for s in comprehensive_questions.secondaryStakeholders
            ),
            "baseTime": min_time,
            "withBuffer": max_time,
            "perQuestion": 3.0,  # FIXED: Realistic average of 2-4 minutes per question
        }

        # Convert to dict for API compatibility
        return comprehensive_questions.model_dump()

    except Exception as e:
        logger.error(
            f"Error generating comprehensive research questions with Instructor: {str(e)}"
        )
        logger.error(f"Falling back to manual question generation")
        # Return fallback comprehensive questions
        return generate_comprehensive_fallback_questions(context, stakeholder_data)


async def generate_research_questions(
    llm_service, context: ResearchContext, conversation_history: List[Message]
) -> ResearchQuestions:
    """Generate structured research questions using Gemini - backward compatibility wrapper."""

    # Use the comprehensive function and extract basic questions for backward compatibility
    comprehensive_result = await generate_comprehensive_research_questions(
        llm_service=llm_service,
        context=context,
        conversation_history=conversation_history,
    )

    # Extract questions from all stakeholders and combine them
    all_problem_discovery = []
    all_solution_validation = []
    all_follow_up = []

    # Combine primary stakeholder questions
    for stakeholder in comprehensive_result.get("primaryStakeholders", []):
        questions = stakeholder.get("questions", {})
        all_problem_discovery.extend(questions.get("problemDiscovery", []))
        all_solution_validation.extend(questions.get("solutionValidation", []))
        all_follow_up.extend(questions.get("followUp", []))

    # Also combine secondary stakeholder questions for comprehensive coverage
    for stakeholder in comprehensive_result.get("secondaryStakeholders", []):
        questions = stakeholder.get("questions", {})
        all_problem_discovery.extend(questions.get("problemDiscovery", []))
        all_solution_validation.extend(questions.get("solutionValidation", []))
        all_follow_up.extend(questions.get("followUp", []))

    # CRITICAL FIX: Create enhanced ResearchQuestions that includes stakeholder and time data
    basic_questions = ResearchQuestions(
        problemDiscovery=all_problem_discovery[:5],
        solutionValidation=all_solution_validation[:5],
        followUp=all_follow_up[:3],
    )

    # FIXED: Use actual stakeholder data from comprehensive result including questions
    primary_stakeholders = []
    print(
        f"🔍 DEBUG: Processing {len(comprehensive_result.get('primaryStakeholders', []))} primary stakeholders"
    )
    for i, stakeholder in enumerate(
        comprehensive_result.get("primaryStakeholders", [])
    ):
        print(
            f"🔍 DEBUG: Primary stakeholder {i+1}: {stakeholder.get('name', 'Unknown')}"
        )
        print(f"🔍 DEBUG: Available keys: {list(stakeholder.keys())}")

        stakeholder_data = {
            "name": stakeholder.get("name", "Primary Stakeholder"),
            "description": stakeholder.get(
                "description", "Primary stakeholder description"
            ),
        }
        # Include questions if available - debug logging
        if "questions" in stakeholder:
            questions = stakeholder["questions"]
            stakeholder_data["questions"] = questions
            print(
                f"✅ DEBUG: Added questions for primary stakeholder: {stakeholder_data['name']}"
            )
            print(
                f"✅ DEBUG: Question counts: {len(questions.get('problemDiscovery', []))} + {len(questions.get('solutionValidation', []))} + {len(questions.get('followUp', []))}"
            )
        else:
            print(
                f"❌ DEBUG: No questions found for primary stakeholder: {stakeholder_data['name']}"
            )
        primary_stakeholders.append(stakeholder_data)

    secondary_stakeholders = []
    for stakeholder in comprehensive_result.get("secondaryStakeholders", []):
        stakeholder_data = {
            "name": stakeholder.get("name", "Secondary Stakeholder"),
            "description": stakeholder.get(
                "description", "Secondary stakeholder description"
            ),
        }
        # Include questions if available - debug logging
        if "questions" in stakeholder:
            stakeholder_data["questions"] = stakeholder["questions"]
            logger.info(
                f"✅ Added questions for secondary stakeholder: {stakeholder_data['name']}"
            )
        else:
            logger.warning(
                f"❌ No questions found for secondary stakeholder: {stakeholder_data['name']}"
            )
            logger.info(f"Available keys: {list(stakeholder.keys())}")
        secondary_stakeholders.append(stakeholder_data)

    # Add actual stakeholder data from comprehensive result
    basic_questions.stakeholders = {
        "primary": primary_stakeholders,
        "secondary": secondary_stakeholders,
    }

    # Add time estimation from comprehensive result or calculate
    time_estimate = comprehensive_result.get("timeEstimate", {})
    total_questions = (
        len(basic_questions.problemDiscovery)
        + len(basic_questions.solutionValidation)
        + len(basic_questions.followUp)
    )

    basic_questions.estimatedTime = {
        "min": time_estimate.get("breakdown", {}).get(
            "baseTime", max(15, total_questions * 2)
        ),
        "max": time_estimate.get("breakdown", {}).get(
            "withBuffer", max(20, total_questions * 4)
        ),
        "totalQuestions": time_estimate.get("totalQuestions", total_questions),
    }

    return basic_questions


def generate_comprehensive_fallback_questions(
    context: ResearchContext, stakeholder_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate comprehensive fallback questions when LLM fails."""

    # Use the full context instead of generic fallbacks
    business_idea = context.businessIdea or "your solution"
    target_customer = context.targetCustomer or "target customers"
    problem_context = context.problem or "the challenge you're addressing"

    # Extract key terms for more specific questions
    if business_idea and len(business_idea) > 20:
        # Use a more specific business description
        if "cafe" in business_idea.lower() or "coffee" in business_idea.lower():
            business_type = "community hub cafe"
            solution_context = "cafe and community space"
        elif "app" in business_idea.lower():
            business_type = "mobile app"
            solution_context = "app"
        elif "service" in business_idea.lower():
            business_type = "service"
            solution_context = "service"
        else:
            business_type = "solution"
            solution_context = "solution"
    else:
        business_type = (
            business_idea if business_idea != "your solution" else "solution"
        )
        solution_context = business_type

    # Use stakeholder data if available, otherwise create default
    if not stakeholder_data:
        stakeholder_data = {
            "primary": [
                {"name": "Decision Makers", "description": "Key decision makers"}
            ],
            "secondary": [
                {"name": "End Users", "description": "Primary users of the solution"}
            ],
            "industry": "general",
        }

    def generate_stakeholder_questions(
        stakeholder_name: str, stakeholder_desc: str, is_primary: bool = True
    ):
        if is_primary:
            return {
                "problemDiscovery": [
                    f"How do {stakeholder_name.lower()} currently handle {problem_context}?",
                    f"What's the most frustrating part of {problem_context} for {stakeholder_name.lower()}?",
                    f"How much time do {stakeholder_name.lower()} spend dealing with this each week?",
                    f"What alternatives or solutions have {stakeholder_name.lower()} tried before?",
                    f"What would an ideal solution look like for {stakeholder_name.lower()}?",
                ],
                "solutionValidation": [
                    f"Would {stakeholder_name.lower()} be interested in trying {business_idea}?",
                    f"What features would be most important to {stakeholder_name.lower()} in a {solution_context}?",
                    f"How much would {stakeholder_name.lower()} be willing to pay for this {solution_context}?",
                    f"What concerns would {stakeholder_name.lower()} have about using a new {solution_context}?",
                    f"How do {stakeholder_name.lower()} typically evaluate new {solution_context}s?",
                ],
                "followUp": [
                    f"Who else would {stakeholder_name.lower()} involve in the decision to use this {solution_context}?",
                    f"How would {stakeholder_name.lower()} measure success with this {solution_context}?",
                    f"What timeline would {stakeholder_name.lower()} expect for implementation?",
                ],
            }
        else:
            return {
                "problemDiscovery": [
                    f"How do {stakeholder_name.lower()} interact with current solutions for {problem_context}?",
                    f"What challenges do {stakeholder_name.lower()} face when dealing with {problem_context}?",
                    f"How important is ease of use for {stakeholder_name.lower()} when choosing a {solution_context}?",
                    f"What information do {stakeholder_name.lower()} need to feel confident about a new {solution_context}?",
                    f"How do {stakeholder_name.lower()} prefer to learn about new {solution_context}s?",
                ],
                "solutionValidation": [
                    f"Would {stakeholder_name.lower()} find this {solution_context} helpful for {problem_context}?",
                    f"What would make {stakeholder_name.lower()} want to use this {solution_context}?",
                    f"How important is training and support for {stakeholder_name.lower()} when adopting a new {solution_context}?",
                    f"What would prevent {stakeholder_name.lower()} from adopting this {solution_context}?",
                    f"How would {stakeholder_name.lower()} want to provide feedback about this {solution_context}?",
                ],
                "followUp": [
                    f"What other {solution_context}s do {stakeholder_name.lower()} use for similar needs?",
                    f"How do {stakeholder_name.lower()} stay updated on new {solution_context}s in this area?",
                    f"What would convince {stakeholder_name.lower()} to recommend this {solution_context}?",
                ],
            }

    # Generate questions for all stakeholders
    primary_stakeholders = []
    for stakeholder in stakeholder_data.get("primary", []):
        name = (
            stakeholder.get("name", stakeholder)
            if isinstance(stakeholder, dict)
            else stakeholder
        )
        desc = (
            stakeholder.get("description", f"Primary stakeholder: {name}")
            if isinstance(stakeholder, dict)
            else f"Primary stakeholder: {name}"
        )
        primary_stakeholders.append(
            {
                "name": name,
                "description": desc,
                "questions": generate_stakeholder_questions(name, desc, True),
            }
        )

    secondary_stakeholders = []
    for stakeholder in stakeholder_data.get("secondary", []):
        name = (
            stakeholder.get("name", stakeholder)
            if isinstance(stakeholder, dict)
            else stakeholder
        )
        desc = (
            stakeholder.get("description", f"Secondary stakeholder: {name}")
            if isinstance(stakeholder, dict)
            else f"Secondary stakeholder: {name}"
        )
        secondary_stakeholders.append(
            {
                "name": name,
                "description": desc,
                "questions": generate_stakeholder_questions(name, desc, False),
            }
        )

    # Calculate time estimates
    total_questions = 0
    for stakeholder in primary_stakeholders + secondary_stakeholders:
        questions = stakeholder.get("questions", {})
        total_questions += len(questions.get("problemDiscovery", []))
        total_questions += len(questions.get("solutionValidation", []))
        total_questions += len(questions.get("followUp", []))

    # FIXED: Use realistic 2-4 minutes per question instead of 2.5 minutes
    min_time = max(15, total_questions * 2)  # 2 minutes per question minimum
    max_time = max(20, total_questions * 4)  # 4 minutes per question maximum

    return {
        "primaryStakeholders": primary_stakeholders,
        "secondaryStakeholders": secondary_stakeholders,
        "timeEstimate": {
            "totalQuestions": total_questions,
            "estimatedMinutes": f"{min_time}-{max_time}",
            "breakdown": {
                "baseTime": min_time,
                "withBuffer": max_time,
                "perQuestion": 3.0,  # Realistic average of 2-4 minutes
            },
        },
    }


def generate_fallback_questions(context: ResearchContext) -> ResearchQuestions:
    """Generate fallback questions when Gemini is not working."""

    business_type = context.businessIdea or "solution"
    customer_type = context.targetCustomer or "customers"
    problem_area = context.problem or "challenge"

    # Customize questions based on context
    if "app" in business_type.lower():
        business_context = "mobile app"
        solution_context = "app"
    elif "service" in business_type.lower():
        business_context = "service"
        solution_context = "service"
    elif "product" in business_type.lower():
        business_context = "product"
        solution_context = "product"
    else:
        business_context = "solution"
        solution_context = "solution"

    return ResearchQuestions(
        problemDiscovery=[
            f"How do {customer_type} currently handle this type of challenge?",
            f"What's the most frustrating part of dealing with {problem_area}?",
            "How much time do you spend on this each week?",
            "What tools or methods have you tried before to solve this?",
            f"What would an ideal solution look like for {customer_type}?",
        ],
        solutionValidation=[
            f"Would you be interested in trying a {business_context} like this?",
            f"What features would be most important to you in a {solution_context}?",
            f"How much would you be willing to pay for a {solution_context} that solves this problem?",
            "What concerns would you have about switching to something new?",
            f"How do you typically evaluate new {solution_context}s in this area?",
        ],
        followUp=[
            "Who else do you know with this same problem?",
            f"How do you usually discover new {solution_context}s like this?",
            "What would convince you to try something new in this area?",
        ],
    )


def should_generate_research_questions(
    messages: List[Message], user_input: str, conversation_context: str
) -> bool:
    """Determine if we have enough information to generate research questions."""

    context_lower = conversation_context.lower()
    input_lower = user_input.lower()

    # Check if user explicitly asks for questions
    user_wants_questions = any(
        phrase in input_lower
        for phrase in [
            "generate questions",
            "create questions",
            "research questions",
            "questions for",
            "help me with questions",
            "what questions",
            "interview questions",
            "customer questions",
            "ready for questions",
            "let's create questions",
            "build questions",
            "make questions",
        ]
    )

    if user_wants_questions:
        return True

    # More reasonable - need good conversation (at least 10 exchanges)
    has_enough_exchanges = len(messages) >= 20  # 10 user + 10 assistant messages

    # Check for comprehensive business understanding
    has_business_idea = any(
        phrase in context_lower
        for phrase in [
            "business idea",
            "product",
            "service",
            "app",
            "platform",
            "solution",
            "startup",
            "company",
            "build",
            "create",
            "develop",
        ]
    )

    has_target_customer = any(
        phrase in context_lower
        for phrase in [
            "customer",
            "user",
            "client",
            "people",
            "business",
            "company",
            "target",
            "audience",
            "market",
            "who would use",
            "who needs",
        ]
    )

    has_problem_context = any(
        phrase in context_lower
        for phrase in [
            "problem",
            "challenge",
            "pain",
            "solve",
            "help",
            "improve",
            "frustration",
            "difficulty",
            "issue",
            "need",
            "value",
            "benefit",
        ]
    )

    has_feature_context = any(
        phrase in context_lower
        for phrase in [
            "feature",
            "functionality",
            "capability",
            "does",
            "works",
            "enables",
            "allows",
            "provides",
            "offers",
            "how it works",
        ]
    )

    # Only generate questions if we have comprehensive understanding AND long conversation
    comprehensive_context = (
        has_business_idea
        and has_target_customer
        and (has_problem_context or has_feature_context)
        and has_enough_exchanges
    )

    return comprehensive_context


def should_confirm_before_questions(
    messages: List[Message], user_input: str, conversation_context: str
) -> bool:
    """Check if we should confirm understanding before generating questions."""

    context_lower = conversation_context.lower()
    input_lower = user_input.lower()

    # Check if user explicitly confirms or asks for questions
    user_confirms = any(
        phrase in input_lower for phrase in RESEARCH_CONFIG.USER_CONFIRMATION_PHRASES
    )

    if user_confirms:
        return False  # Don't need confirmation, proceed to questions

    # Check if we have enough context for confirmation
    has_business_idea = any(
        phrase in context_lower
        for phrase in [
            "business idea",
            "product",
            "service",
            "app",
            "platform",
            "solution",
            "startup",
            "company",
            "build",
            "create",
            "develop",
        ]
    )

    has_target_customer = any(
        phrase in context_lower
        for phrase in [
            "customer",
            "user",
            "client",
            "people",
            "business",
            "company",
            "target",
            "audience",
            "market",
            "who would use",
            "who needs",
        ]
    )

    has_problem_context = any(
        phrase in context_lower
        for phrase in [
            "problem",
            "challenge",
            "pain",
            "solve",
            "help",
            "improve",
            "frustration",
            "difficulty",
            "issue",
            "need",
            "value",
            "benefit",
        ]
    )

    has_feature_context = any(
        phrase in context_lower
        for phrase in [
            "feature",
            "functionality",
            "capability",
            "does",
            "works",
            "enables",
            "allows",
            "provides",
            "offers",
            "how it works",
        ]
    )

    # Need good conversation (configurable minimum exchanges)
    has_enough_exchanges = len(messages) >= RESEARCH_CONFIG.MIN_EXCHANGES_FOR_QUESTIONS

    # Should confirm if we have good context but haven't confirmed yet
    return (
        has_business_idea
        and has_target_customer
        and (has_problem_context or has_feature_context)
        and has_enough_exchanges
    )


def determine_research_stage(context: Optional[ResearchContext]) -> str:
    """Determine the current research stage based on context."""
    if not context:
        return "initial"

    if not context.businessIdea:
        return "initial"
    elif not context.targetCustomer:
        return "business_idea"
    elif not context.problem:
        return "target_customer"
    else:
        return "validation"


# Note: detect_industry_context function replaced with LLM-based classify_industry_with_llm


def get_industry_guidance(industry: str) -> str:
    """Get industry-specific guidance for research questions."""
    return INDUSTRY_GUIDANCE.GUIDANCE_TEMPLATES.get(
        industry, INDUSTRY_GUIDANCE.GUIDANCE_TEMPLATES["general"]
    )


def format_questions_for_chat(questions: ResearchQuestions) -> str:
    """Format research questions for display in chat."""

    formatted = ""

    if questions.problemDiscovery:
        formatted += "**🔍 Problem Discovery Questions:**\n"
        for i, question in enumerate(questions.problemDiscovery, 1):
            formatted += f"{i}. {question}\n"
        formatted += "\n"

    if questions.solutionValidation:
        formatted += "**✅ Solution Validation Questions:**\n"
        for i, question in enumerate(questions.solutionValidation, 1):
            formatted += f"{i}. {question}\n"
        formatted += "\n"

    if questions.followUp:
        formatted += "**🔄 Follow-up Questions:**\n"
        for i, question in enumerate(questions.followUp, 1):
            formatted += f"{i}. {question}\n"

    return formatted.strip()


async def extract_context_with_llm(
    llm_service, conversation_context: str, latest_input: str
) -> dict:
    """Extract business context using LLM analysis instead of keyword matching."""

    prompt = f"""Analyze this customer research conversation and extract the key business context.

Conversation:
{conversation_context}

Latest user input: "{latest_input}"

Extract and return ONLY a JSON object with these fields:
- business_idea: What product/service are they building? Include ALL features and capabilities mentioned
- target_customer: Who are their target customers? (specific roles/personas)
- problem: What problem are they solving? (main pain point)

Rules:
- Extract ANY information mentioned, even if partial or incomplete
- If user mentions "feature", "app", "tool", "service" - capture what type it might be
- If user mentions any customer type, role, or industry - capture it
- If user mentions any problem, pain point, or need - capture it
- Use the user's exact words when possible
- Be generous in extraction - capture hints and implications
- Only use null if absolutely no information is available
- For "I want to decide about one feature" - extract that they're working on a feature/product

Examples:
- "I want to decide about one feature" → business_idea: "feature or product development"
- "for my customers" → target_customer: "customers" (capture even vague references)
- "it's hard to..." → problem: "difficulty with [whatever they mentioned]"

Return only valid JSON:"""

    try:
        response = await llm_service.generate_text(
            prompt=prompt,
            temperature=0.0,  # Use 0.0 for JSON responses to ensure consistent formatting
            max_tokens=4000,  # Increased from 1000 to handle longer conversations
        )

        logger.info(f"LLM context extraction response: {response}")

        # Parse JSON response
        import json

        response_clean = response.strip()
        if response_clean.startswith("```json"):
            response_clean = response_clean[7:]
        if response_clean.endswith("```"):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()

        logger.info(f"Cleaned response for JSON parsing: {response_clean}")

        context = json.loads(response_clean)
        logger.info(f"Successfully parsed context: {context}")
        return context

    except Exception as e:
        logger.error(f"Error extracting context with LLM: {str(e)}")
        logger.error(
            f"Raw response was: {response if 'response' in locals() else 'No response'}"
        )

        # Fallback: extract context manually from conversation
        fallback_context = extract_context_manually(conversation_context, latest_input)
        logger.info(f"Using fallback context: {fallback_context}")
        return fallback_context


async def classify_industry_with_llm(
    llm_service, conversation_context: str, latest_input: str
) -> dict:
    """Classify industry using LLM analysis instead of keyword matching."""

    prompt = f"""Analyze this customer research conversation and classify the industry/domain.

Conversation:
{conversation_context}

Latest user input: "{latest_input}"

Based on the business idea, target customers, and problem described, identify the most relevant industry classification and return ONLY valid JSON:

{{
  "industry": "industry_name",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this industry was identified",
  "sub_categories": ["specific", "domain", "areas"]
}}

Industry options (choose the most specific):
- "ux_research" - UX research, design research, user experience
- "product_management" - Product development, feature management, roadmaps
- "saas" - Software as a Service, B2B platforms, business tools
- "healthcare" - Medical, patient care, clinical systems
- "education" - Learning, teaching, academic systems
- "ecommerce" - Online retail, marketplaces, selling platforms
- "fintech" - Financial services, banking, payments
- "hr_tech" - Human resources, recruiting, employee management
- "marketing_tech" - Marketing automation, analytics, campaigns
- "data_analytics" - Business intelligence, data processing, insights
- "general" - General business tools or unclear domain

Rules:
- Use exact industry names from the list above
- Confidence should be 0.0-1.0 (higher = more certain)
- Reasoning should explain key indicators that led to this classification
- Sub_categories should list 2-3 specific areas within the industry"""

    try:
        response = await llm_service.generate_text(
            prompt=prompt,
            temperature=0.0,
            max_tokens=4000,  # Use 0.0 for JSON responses
        )

        logger.info(f"LLM industry classification response: {response}")

        # Parse JSON response
        import json

        response_clean = response.strip()
        if response_clean.startswith("```json"):
            response_clean = response_clean[7:]
        if response_clean.endswith("```"):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()

        industry_data = json.loads(response_clean)
        logger.info(f"Successfully classified industry: {industry_data}")
        return industry_data

    except Exception as e:
        logger.error(f"Error classifying industry with LLM: {str(e)}")
        # Fallback to simple keyword-based classification
        return classify_industry_fallback(conversation_context, latest_input)


def classify_industry_fallback(conversation_context: str, latest_input: str) -> dict:
    """Fallback industry classification when LLM fails."""

    combined_text = f"{conversation_context} {latest_input}".lower()

    # Simple keyword-based detection as fallback
    if any(
        word in combined_text for word in ["ux", "user research", "design", "usability"]
    ):
        return {
            "industry": "ux_research",
            "confidence": 0.7,
            "reasoning": "Detected UX/design keywords in conversation",
            "sub_categories": ["user research", "design"],
        }
    elif any(word in combined_text for word in ["product", "feature", "roadmap"]):
        return {
            "industry": "product_management",
            "confidence": 0.7,
            "reasoning": "Detected product management keywords",
            "sub_categories": ["product development", "features"],
        }
    elif any(
        word in combined_text for word in ["healthcare", "medical", "patient", "doctor"]
    ):
        return {
            "industry": "healthcare",
            "confidence": 0.8,
            "reasoning": "Detected healthcare keywords",
            "sub_categories": ["medical", "patient care"],
        }
    else:
        return {
            "industry": "general",
            "confidence": 0.5,
            "reasoning": "Could not determine specific industry from conversation",
            "sub_categories": ["business", "general"],
        }


async def analyze_user_intent_with_llm(
    llm_service, conversation_context: str, latest_input: str, messages: List[Message]
) -> dict:
    """Analyze user intent using LLM instead of keyword matching."""

    # Get the last assistant message to understand what the user is responding to
    last_assistant_message = ""
    for msg in reversed(messages):
        if msg.role == "assistant":
            last_assistant_message = msg.content
            break

    prompt = f"""Analyze the user's latest response to determine their intent in this customer research conversation.

Last assistant message: "{last_assistant_message}"
User's response: "{latest_input}"

Full conversation context:
{conversation_context}

Determine the user's intent and return ONLY valid JSON:

{{
  "intent": "confirmation|rejection|clarification|continuation|question_request",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why you classified it this way",
  "specific_feedback": "What specifically the user is confirming, rejecting, or clarifying",
  "next_action": "What the assistant should do next"
}}

Intent definitions:
- "confirmation": User is agreeing/confirming the assistant's understanding (e.g., "yes that's correct", "exactly right", "sounds good")
- "rejection": User is disagreeing/rejecting the assistant's understanding (e.g., "no that's not right", "nope", "incorrect")
- "clarification": User wants to add more info or correct something (e.g., "but I have more information", "let me clarify", "actually it's...")
- "continuation": User is providing more information to continue the conversation (e.g., answering questions, adding details)
- "question_request": User explicitly wants research questions generated (e.g., "generate questions", "I'm ready for questions")

Focus on the user's intent based on what they're responding to, not just keywords.
Consider the conversational context and what the assistant just asked or stated.

Examples:
- If assistant asked "Does this sound right?" and user says "nope it is not" → "rejection"
- If assistant asked "Tell me more about..." and user provides details → "continuation"
- If assistant summarized and user says "yes but also..." → "clarification"
- If user says "that's exactly right" → "confirmation"
"""

    try:
        response = await llm_service.generate_text(
            prompt=prompt,
            temperature=0.0,
            max_tokens=2000,  # Use 0.0 for JSON responses
        )

        logger.info(f"LLM user intent analysis response: {response}")

        # Parse JSON response
        import json

        response_clean = response.strip()
        if response_clean.startswith("```json"):
            response_clean = response_clean[7:]
        if response_clean.endswith("```"):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()

        intent_data = json.loads(response_clean)
        logger.info(f"Successfully analyzed user intent: {intent_data}")
        return intent_data

    except Exception as e:
        logger.error(f"Error analyzing user intent with LLM: {str(e)}")
        # Fallback to simple keyword matching
        return analyze_user_intent_fallback(latest_input, last_assistant_message)


def analyze_user_intent_fallback(user_input: str, last_assistant_message: str) -> dict:
    """Fallback user intent analysis when LLM fails."""

    input_lower = user_input.lower()
    assistant_lower = last_assistant_message.lower()

    # Check if assistant was asking for confirmation
    was_asking_confirmation = any(
        phrase in assistant_lower
        for phrase in [
            "does this sound",
            "is this correct",
            "does this capture",
            "sound right",
        ]
    )

    if was_asking_confirmation:
        # User is responding to a confirmation request
        if any(
            phrase in input_lower
            for phrase in ["yes", "correct", "right", "exactly", "sounds good"]
        ):
            return {
                "intent": "confirmation",
                "confidence": 0.7,
                "reasoning": "User responded positively to confirmation request",
                "specific_feedback": "Confirmed assistant's understanding",
                "next_action": "Generate research questions",
            }
        elif any(
            phrase in input_lower
            for phrase in ["no", "nope", "not", "wrong", "incorrect"]
        ):
            return {
                "intent": "rejection",
                "confidence": 0.7,
                "reasoning": "User responded negatively to confirmation request",
                "specific_feedback": "Rejected assistant's understanding",
                "next_action": "Ask for clarification on what was wrong",
            }
        elif any(
            phrase in input_lower
            for phrase in ["but", "also", "more", "clarify", "add"]
        ):
            return {
                "intent": "clarification",
                "confidence": 0.6,
                "reasoning": "User wants to add or clarify information",
                "specific_feedback": "Wants to provide additional information",
                "next_action": "Ask what they want to clarify or add",
            }

    # Check for explicit question requests
    if any(
        phrase in input_lower
        for phrase in ["generate questions", "create questions", "ready for questions"]
    ):
        return {
            "intent": "question_request",
            "confidence": 0.8,
            "reasoning": "User explicitly requested research questions",
            "specific_feedback": "Wants research questions generated",
            "next_action": "Generate research questions",
        }

    # Default to continuation
    return {
        "intent": "continuation",
        "confidence": 0.5,
        "reasoning": "User is continuing the conversation with more information",
        "specific_feedback": "Providing additional information",
        "next_action": "Continue conversation and gather more details",
    }


async def validate_business_readiness_with_llm(
    llm_service, conversation_context: str, latest_input: str
) -> dict:
    """Validate business readiness for question generation using LLM analysis."""

    prompt = f"""Analyze this customer research conversation to determine if enough information has been gathered to show a CONFIRMATION SUMMARY before generating research questions.

Conversation:
{conversation_context}

Latest user input: "{latest_input}"

Evaluate the conversation and return ONLY valid JSON:

{{
  "ready_for_questions": true,
  "confidence": 0.85,
  "reasoning": "Detailed explanation of readiness assessment",
  "missing_elements": ["element1", "element2"],
  "conversation_quality": "high",
  "business_clarity": {{
    "idea_clarity": 0.9,
    "customer_clarity": 0.8,
    "problem_clarity": 0.7
  }},
  "recommendations": ["suggestion1", "suggestion2"]
}}

Assessment criteria for CONFIRMATION readiness (not final question generation):
1. Business idea clarity - Is there a clear, specific understanding of what they're building?
2. Target customer definition - Are the target users/customers clearly identified with specific roles/personas?
3. Problem articulation - Is the specific problem they're solving clearly explained?
4. Content completeness - Is there enough detail about each element to create meaningful research questions?
5. Context depth - Do we understand the business context, not just surface-level information?

Rules:
- ready_for_questions: true only if ready to SHOW CONFIRMATION SUMMARY (not generate final questions)
- This means we have enough detailed info to summarize their business idea, customers, and problem
- The user will still need to confirm "Yes, that's correct" before actual question generation
- Focus on CONTENT QUALITY and COMPLETENESS, not conversation length
- A user could provide complete information in 1-2 detailed messages or 10+ short messages
- confidence: 0.0-1.0 (how certain you are about the readiness for confirmation)
- missing_elements: list specific information still needed (empty array if ready for confirmation)
- conversation_quality: "low", "medium", "high" based on detail depth and specificity
- clarity scores: 0.0-1.0 for each business aspect
- recommendations: actionable suggestions for improvement (empty if ready for confirmation)

Examples of READY for confirmation:
- "I want to build a Google Forms automation tool for UX researchers and product managers to create questionnaires faster because manual creation takes too long"
- Clear business idea ✓, specific customers ✓, defined problem ✓

Examples of NOT READY:
- "I have a business idea for customers" (too vague)
- "I want to help people with their problems" (no specifics)

Be conservative but focus on content completeness, not message count.
The user must still explicitly confirm before questions are generated."""

    try:
        response = await llm_service.generate_text(
            prompt=prompt,
            temperature=0.0,
            max_tokens=4000,  # Use 0.0 for JSON responses
        )

        logger.info(f"LLM business validation response: {response}")

        # Parse JSON response
        import json

        response_clean = response.strip()
        if response_clean.startswith("```json"):
            response_clean = response_clean[7:]
        if response_clean.endswith("```"):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()

        validation_data = json.loads(response_clean)
        logger.info(f"Successfully validated business readiness: {validation_data}")
        return validation_data

    except Exception as e:
        logger.error(f"Error validating business readiness with LLM: {str(e)}")
        # Fallback to simple validation
        return validate_business_readiness_fallback(conversation_context, latest_input)


def validate_business_readiness_fallback(
    conversation_context: str, latest_input: str
) -> dict:
    """Fallback business validation when LLM fails."""

    context_lower = conversation_context.lower()

    # Check for specific, detailed business elements (not just keywords)
    has_specific_business_idea = any(
        word in context_lower
        for word in [
            "app",
            "platform",
            "tool",
            "service",
            "product",
            "system",
            "software",
            "api",
            "dashboard",
        ]
    ) and any(
        word in context_lower
        for word in [
            "build",
            "create",
            "develop",
            "make",
            "design",
            "automation",
            "management",
        ]
    )

    has_specific_customers = any(
        word in context_lower
        for word in [
            "researcher",
            "manager",
            "developer",
            "designer",
            "team",
            "company",
            "business",
            "organization",
        ]
    ) or (
        any(word in context_lower for word in ["customer", "user", "client"])
        and any(word in context_lower for word in ["who", "target", "specific", "type"])
    )

    has_specific_problem = any(
        word in context_lower
        for word in [
            "manual",
            "time consuming",
            "difficult",
            "hard",
            "slow",
            "inefficient",
            "frustrating",
        ]
    ) or (
        any(word in context_lower for word in ["problem", "challenge", "pain"])
        and any(
            word in context_lower
            for word in ["because", "since", "takes", "costs", "waste"]
        )
    )

    # Check for content depth indicators
    has_detail_indicators = any(
        phrase in context_lower
        for phrase in [
            "because",
            "since",
            "currently",
            "right now",
            "takes too long",
            "hard to",
            "difficult to",
            "specifically",
            "particularly",
            "especially",
            "for example",
            "such as",
        ]
    )

    # Focus on content completeness, not conversation length
    ready = (
        has_specific_business_idea
        and has_specific_customers
        and has_specific_problem
        and has_detail_indicators
    )

    return {
        "ready_for_questions": ready,
        "confidence": 0.6,
        "reasoning": f"Content-based validation: specific_business_idea={has_specific_business_idea}, specific_customers={has_specific_customers}, specific_problem={has_specific_problem}, detail_indicators={has_detail_indicators}",
        "missing_elements": [
            elem
            for elem, present in [
                ("specific_business_idea", has_specific_business_idea),
                ("specific_target_customers", has_specific_customers),
                ("specific_problem_definition", has_specific_problem),
                ("contextual_details", has_detail_indicators),
            ]
            if not present
        ],
        "conversation_quality": "medium" if ready else "low",
        "business_clarity": {
            "idea_clarity": 0.7 if has_specific_business_idea else 0.3,
            "customer_clarity": 0.7 if has_specific_customers else 0.3,
            "problem_clarity": 0.7 if has_specific_problem else 0.3,
        },
        "recommendations": (
            []
            if ready
            else [
                "Provide more specific details about what you're building",
                "Identify specific customer roles or personas",
                "Explain the specific problem and why it matters",
            ]
        ),
    }


def extract_context_manually(conversation_context: str, latest_input: str) -> dict:
    """Manual fallback context extraction when LLM fails."""

    context_lower = conversation_context.lower()
    input_lower = latest_input.lower()

    # Extract business idea - be more generous
    business_idea = None
    if "feature" in input_lower:
        business_idea = "feature or product development"
    elif "api" in context_lower and (
        "legacy" in context_lower or "system" in context_lower
    ):
        business_idea = "API that transforms legacy systems into reliable endpoints"
    elif "middleware" in context_lower:
        business_idea = "Internal middleware tool for syncing data between systems"
    elif "api" in context_lower:
        business_idea = "API service for data integration"
    elif any(
        word in context_lower
        for word in ["app", "tool", "service", "platform", "product", "solution"]
    ):
        business_idea = "digital product or service"

    # Extract target customer - be more generous
    target_customer = None
    if "customer" in input_lower or "customer" in context_lower:
        target_customer = "customers"
    elif "internal" in context_lower and "organisation" in context_lower:
        target_customer = "Internal services within the organization"
    elif "services" in context_lower and "organisation" in context_lower:
        target_customer = "Other services within the organization"
    elif any(
        word in context_lower for word in ["user", "client", "people", "business"]
    ):
        target_customer = "users or clients"

    # Extract problem - be more generous
    problem = None
    if "decide" in input_lower:
        problem = "decision-making challenges"
    elif "custom integrations" in context_lower and "hard" in context_lower:
        problem = "Hard to have custom integrations between systems"
    elif "syncing data" in context_lower:
        problem = "Difficulty syncing data between different systems"
    elif (
        "month to have a full integration" in context_lower
        and "maintenance is hard" in context_lower
    ):
        problem = "Time-consuming integrations (around a month) and hard-to-maintain direct integrations"
    elif "parallel development" in context_lower:
        problem = "Forces parallel development due to integration difficulties"
    elif any(
        word in context_lower
        for word in ["hard", "difficult", "challenge", "problem", "issue"]
    ):
        problem = "operational or technical challenges"

    return {
        "business_idea": business_idea,
        "target_customer": target_customer,
        "problem": problem,
    }


def determine_research_stage_from_context(context: dict) -> str:
    """Determine research stage from extracted context."""
    if not context.get("business_idea"):
        return "initial"
    elif not context.get("target_customer"):
        return "business_idea"
    elif not context.get("problem"):
        return "target_customer"
    else:
        return "validation"


@router.get("/sessions")
async def get_research_sessions(
    user_id: Optional[str] = None, limit: int = 20, db: Session = Depends(get_db)
):
    """Get research sessions for dashboard."""
    try:
        session_service = ResearchSessionService(db)

        if user_id:
            sessions = session_service.get_user_sessions(user_id, limit)
        else:
            sessions = session_service.get_recent_sessions(limit)

        # Convert to summary format
        summaries = []
        for session in sessions:
            summary = session_service.get_session_summary(session.session_id)
            if summary:
                summaries.append(summary)

        return summaries

    except Exception as e:
        logger.error(f"Error getting sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")


@router.get("/sessions/{session_id}")
async def get_research_session(session_id: str, db: Session = Depends(get_db)):
    """Get a specific research session."""
    try:
        session_service = ResearchSessionService(db)
        session = session_service.get_session(session_id)

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        return {
            "id": session.id,
            "session_id": session.session_id,
            "user_id": session.user_id,
            "business_idea": session.business_idea,
            "target_customer": session.target_customer,
            "problem": session.problem,
            "industry": session.industry,
            "stage": session.stage,
            "status": session.status,
            "messages": session.messages or [],
            "questions_generated": session.questions_generated,
            "research_questions": session.research_questions,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "completed_at": session.completed_at,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get session: {str(e)}")


@router.delete("/sessions/{session_id}")
async def delete_research_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a specific research session."""
    try:
        session_service = ResearchSessionService(db)
        success = session_service.delete_session(session_id)

        if not success:
            raise HTTPException(status_code=404, detail="Session not found")

        return {"success": True, "message": "Session deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to delete session: {str(e)}"
        )


@router.post("/test-simple-chat")
async def test_simple_chat(db: Session = Depends(get_db)):
    """Simple test endpoint that mimics the chat flow."""
    try:
        logger.info("Testing simple chat flow...")

        session_service = ResearchSessionService(db)

        # Create a test session
        session_data = ResearchSessionCreate(
            user_id="test_user",
            business_idea="Test Business",
            target_customer="Test Customers",
            problem="Test Problem",
        )
        session = session_service.create_session(session_data)
        session_id = session.session_id
        logger.info(f"Created session: {session_id}")

        # Simulate user message
        user_message = {
            "id": "user_1",
            "content": "I want to test message saving",
            "role": "user",
            "timestamp": datetime.utcnow().isoformat(),
        }

        # Save user message
        logger.info(f"Saving user message: {user_message}")
        session_service.add_message(session_id, user_message)
        logger.info("User message saved")

        # Simulate assistant response
        assistant_message = {
            "id": "assistant_1",
            "content": "Thank you for testing! Your message has been saved.",
            "role": "assistant",
            "timestamp": datetime.utcnow().isoformat(),
        }

        # Save assistant message
        logger.info(f"Saving assistant message: {assistant_message}")
        session_service.add_message(session_id, assistant_message)
        logger.info("Assistant message saved")

        # Retrieve session to verify
        retrieved_session = session_service.get_session(session_id)

        return {
            "status": "success",
            "session_id": session_id,
            "messages_saved": (
                len(retrieved_session.messages) if retrieved_session.messages else 0
            ),
            "messages": retrieved_session.messages,
            "message": "Simple chat test completed successfully",
        }

    except Exception as e:
        logger.error(f"Simple chat test failed: {str(e)}")
        import traceback

        logger.error(f"Full traceback: {traceback.format_exc()}")
        return {
            "status": "error",
            "error": str(e),
            "message": "Simple chat test failed",
        }


@router.post("/test-gemini")
async def test_gemini():
    """Simple test endpoint to verify Gemini is working."""
    try:
        logger.info("Testing Gemini connection...")

        # Test 1: Direct client test
        from backend.services.llm.async_genai_client import AsyncGenAIClient
        from backend.services.llm.config.task_types import TaskType

        client = AsyncGenAIClient()

        # Very simple prompt
        simple_response = await client.generate_content(
            task=TaskType.TEXT_GENERATION,
            prompt="Hello, please respond with just the word 'working'",
            custom_config={"temperature": 0.0, "max_output_tokens": 10},
        )

        logger.info(f"Direct client test response: {simple_response}")

        # Test 2: LLM service test
        llm_service = LLMServiceFactory.create("enhanced_gemini")

        service_response = await llm_service.generate_text(
            prompt="Hello, please respond with just the word 'working'",
            temperature=0.0,
            max_tokens=10,
        )

        logger.info(f"LLM service test response: {service_response}")

        return {
            "status": "success",
            "direct_client_response": simple_response,
            "llm_service_response": service_response,
            "message": "Gemini tests completed",
        }

    except Exception as e:
        logger.error(f"Gemini test failed: {str(e)}")
        import traceback

        logger.error(f"Full traceback: {traceback.format_exc()}")
        return {"status": "error", "error": str(e), "message": "Gemini test failed"}
