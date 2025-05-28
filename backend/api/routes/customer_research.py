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

class ChatResponse(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = None
    questions: Optional[ResearchQuestions] = None
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
async def research_chat(
    request: ChatRequest,
    db: Session = Depends(get_db)
):
    """
    Handle customer research chat conversation.
    """
    try:
        logger.info("Processing research chat request")
        logger.info(f"Request data: messages={len(request.messages)}, input='{request.input}', session_id={request.session_id}")

        # Create services
        session_service = ResearchSessionService(db)
        logger.info("Session service created successfully")

        # Create LLM service
        llm_service = LLMServiceFactory.create("enhanced_gemini")
        logger.info("LLM service created successfully")

        # Handle session management
        session_id = request.session_id
        is_local_session = session_id and session_id.startswith('local_')

        if not session_id:
            # Create new session
            session_data = ResearchSessionCreate(
                user_id=request.user_id,
                business_idea=request.context.businessIdea if request.context else None,
                target_customer=request.context.targetCustomer if request.context else None,
                problem=request.context.problem if request.context else None
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
        conversation_context = "\n".join([
            f"{msg.role}: {msg.content}" for msg in request.messages
        ])
        logger.info(f"Conversation context built: {len(conversation_context)} characters")

        # Generate proper conversational response using LLM
        response_content = await generate_research_response(
            llm_service=llm_service,
            messages=request.messages,
            user_input=request.input,
            context=request.context,
            conversation_context=conversation_context
        )
        logger.info(f"Generated response: {response_content}")

        # Check if we should confirm before generating questions
        should_confirm = should_confirm_before_questions(
            request.messages, request.input, conversation_context
        )

        if should_confirm:
            # Generate confirmation message instead of regular response
            confirmation_response = await generate_confirmation_response(
                llm_service, request.messages, request.input, request.context, conversation_context
            )

            # Generate confirmation-specific suggestions
            confirmation_suggestions = [
                "Yes, that's correct",
                "Let me add something",
                "I need to clarify something"
            ]

            # Save messages to session for confirmation flow (skip for local sessions)
            if not is_local_session:
                user_message = {
                    "id": f"user_{len(request.messages)}",
                    "content": request.input,
                    "role": "user",
                    "timestamp": datetime.utcnow().isoformat()
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
                        "suggestions": confirmation_suggestions
                    }
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
                    "extracted_context": extracted_context
                },
                session_id=session_id
            )

        # Check if we should generate questions
        should_generate_questions = should_generate_research_questions(
            request.messages, request.input, conversation_context
        )

        questions = None

        # Check if user confirmed and we should generate questions
        user_confirmed = any(phrase in request.input.lower() for phrase in [
            "yes, that's correct", "yes that's correct", "that's correct", "yes correct"
        ])

        if should_generate_questions or user_confirmed:
            questions = await generate_research_questions(
                llm_service=llm_service,
                context=request.context or ResearchContext(),
                conversation_history=request.messages
            )

            # If questions were generated, create a special response that includes them in chat
            if questions:
                questions_text = format_questions_for_chat(questions)
                response_content = f"""Perfect! I've generated your custom research questions based on our conversation. Here they are:

{questions_text}

These questions are designed specifically for your business idea. Would you like me to adjust any of these questions or add more focus areas?"""

        # Generate contextual suggestions for the response (only if not generating questions)
        suggestions = []
        if not questions:
            try:
                suggestions = await generate_contextual_suggestions(
                    llm_service, request.messages, request.input, response_content, conversation_context
                )
            except Exception as e:
                logger.error(f"Error generating suggestions: {str(e)}")
                # Use fallback suggestions
                suggestions = generate_fallback_suggestions(request.input, response_content)

        # Save user message to session (skip for local sessions)
        if not is_local_session:
            user_message = {
                "id": f"user_{len(request.messages)}",
                "content": request.input,
                "role": "user",
                "timestamp": datetime.utcnow().isoformat()
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
                    "suggestions": suggestions
                }
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
            extracted_context['questions_generated'] = True

        # Update session context with LLM-extracted information (skip for local sessions)
        if not is_local_session:
            industry = "general"
            if extracted_context.get('business_idea') and extracted_context.get('target_customer') and extracted_context.get('problem'):
                industry = detect_industry_context(
                    extracted_context.get('business_idea', ''),
                    extracted_context.get('target_customer', ''),
                    extracted_context.get('problem', '')
                )

            update_data = ResearchSessionUpdate(
                business_idea=extracted_context.get('business_idea'),
                target_customer=extracted_context.get('target_customer'),
                problem=extracted_context.get('problem'),
                industry=industry,
                stage=determine_research_stage_from_context(extracted_context),
                conversation_context=conversation_context
            )
            session_service.update_session(session_id, update_data)

            # If questions were generated, mark session as completed
            if questions:
                session_service.complete_session(session_id, questions.dict())
        else:
            logger.info("Skipping session update for local session")

        return ChatResponse(
            content=response_content,
            metadata={
                "questionCategory": "validation" if questions else "discovery",
                "researchStage": determine_research_stage_from_context(extracted_context),
                "suggestions": suggestions,
                "extracted_context": extracted_context
            },
            questions=questions,
            session_id=session_id
        )

    except Exception as e:
        logger.error(f"Error in research chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Research chat failed: {str(e)}")

@router.post("/generate-questions", response_model=ResearchQuestions)
async def generate_questions_endpoint(
    request: GenerateQuestionsRequest,
    db: Session = Depends(get_db)
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
            conversation_history=request.conversationHistory
        )

        return questions

    except Exception as e:
        logger.error(f"Error generating questions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")

async def generate_research_response(
    llm_service,
    messages: List[Message],
    user_input: str,
    context: Optional[ResearchContext],
    conversation_context: str
) -> str:
    """Generate conversational response using Gemini."""

    # Determine what stage we're at and provide appropriate response
    has_business_idea = context and context.businessIdea
    has_target_customer = context and context.targetCustomer
    has_problem = context and context.problem

    # Detect industry context for specialized guidance
    industry = "general"
    if has_business_idea and has_target_customer and has_problem:
        industry = detect_industry_context(
            context.businessIdea or "",
            context.targetCustomer or "",
            context.problem or ""
        )

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

        # Check if user just confirmed - if so, generate questions
        if any(phrase in user_input.lower() for phrase in ["yes, that's correct", "yes that's correct", "that's correct", "yes correct"]):
            # This is handled in the main chat function, not here
            # Return a simple response to trigger question generation in main flow
            return "Perfect! Let me generate your research questions now..."

        elif conversation_length < 20:  # Continue exploring for reasonable length
            # Analyze conversation to avoid loops
            recent_messages = [msg.content for msg in messages[-6:] if msg.role == "assistant"]
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
                focus_area = "specific pain points or frustrations in their current process"

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
            max_tokens=8000  # Increased to use more of the 65k available
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

async def generate_simple_fallback_response(user_input: str, context: Optional[ResearchContext]) -> str:
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
    conversation_context: str
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
            max_tokens=8000  # Increased to use more of the 65k available
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
    conversation_context: str
) -> List[str]:
    """Generate contextual quick reply suggestions based on the conversation."""

    # Build a concise prompt for generating suggestions
    prompt = f"""Generate 3 short quick replies that the USER might say in response to the assistant's message:

User said: "{user_input}"
Assistant responded: "{assistant_response}"

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
            temperature=0.7,
            max_tokens=2000  # Increased for suggestions generation
        )

        # Parse JSON response
        import json
        response_clean = response.strip()
        if response_clean.startswith('```json'):
            response_clean = response_clean[7:]
        if response_clean.endswith('```'):
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

def generate_fallback_suggestions(user_input: str, assistant_response: str) -> List[str]:
    """Generate fallback suggestions when LLM fails."""

    user_lower = user_input.lower()
    response_lower = assistant_response.lower()

    # If assistant is asking about business idea or problem
    if any(phrase in response_lower for phrase in ["business", "idea", "problem", "solve", "core problem"]):
        return ["Data management solution", "Customer analytics platform", "Workflow automation tool"]

    # If assistant is asking about customers or target market
    elif any(phrase in response_lower for phrase in ["customer", "who", "target", "audience", "clients"]):
        return ["Small businesses", "Enterprise companies", "Individual users"]

    # If assistant is asking about specific problems or pain points
    elif any(phrase in response_lower for phrase in ["pain", "challenge", "frustrating", "difficulty"]):
        return ["Time consuming process", "Lack of visibility", "Manual work required"]

    # If assistant is asking about features or functionality
    elif any(phrase in response_lower for phrase in ["feature", "functionality", "how", "what does"]):
        return ["Data integration", "Real-time analytics", "Automated reporting"]

    # If assistant is confirming understanding
    elif any(phrase in response_lower for phrase in ["confirm", "understand", "correct", "right", "sound"]):
        return ["Yes, that's correct", "Let me add something", "I need to clarify"]

    # Default suggestions - user responses to continue conversation
    else:
        return ["Let me explain more", "That's exactly right", "I have more details"]

async def generate_research_questions(
    llm_service,
    context: ResearchContext,
    conversation_history: List[Message]
) -> ResearchQuestions:
    """Generate structured research questions using Gemini."""

    # Build a simple, direct prompt for JSON generation
    prompt = f"""Generate customer research questions for this business:

Business Idea: {context.businessIdea or 'Not specified'}
Target Customer: {context.targetCustomer or 'Not specified'}
Problem: {context.problem or 'Not specified'}

Create 5 problem discovery questions, 5 solution validation questions, and 3 follow-up questions.

Return ONLY valid JSON in this exact format:
{{
  "problemDiscovery": [
    "How do you currently handle [specific problem]?",
    "What's the most frustrating part of your current process?",
    "How much time do you spend on this each week?",
    "What tools or methods have you tried before?",
    "What would an ideal solution look like to you?"
  ],
  "solutionValidation": [
    "If there was a solution like [their idea], would you use it?",
    "What features would be most important to you?",
    "How much would you be willing to pay for this?",
    "What concerns would you have about switching?",
    "How do you typically evaluate new solutions?"
  ],
  "followUp": [
    "Who else do you know with this problem?",
    "How do you usually discover new solutions?",
    "What would convince you to try something new?"
  ]
}}

Make the questions specific to their business idea and target customer. Use their exact terminology."""

    try:
        # Use direct text generation with JSON request
        response = await llm_service.generate_text(
            prompt=prompt,
            temperature=0.3,
            max_tokens=16000  # Increased to use more of the 65k available for JSON responses
        )

        # Parse the JSON response
        import json
        # Clean the response to extract just the JSON
        response_clean = response.strip()
        if response_clean.startswith('```json'):
            response_clean = response_clean[7:]
        if response_clean.endswith('```'):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()

        questions_data = json.loads(response_clean)
        return ResearchQuestions(**questions_data)

    except Exception as e:
        logger.error(f"Error generating research questions: {str(e)}")
        # Return fallback questions customized to their context
        return generate_fallback_questions(context)

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
            f"What would an ideal solution look like for {customer_type}?"
        ],
        solutionValidation=[
            f"Would you be interested in trying a {business_context} like this?",
            f"What features would be most important to you in a {solution_context}?",
            f"How much would you be willing to pay for a {solution_context} that solves this problem?",
            "What concerns would you have about switching to something new?",
            f"How do you typically evaluate new {solution_context}s in this area?"
        ],
        followUp=[
            "Who else do you know with this same problem?",
            f"How do you usually discover new {solution_context}s like this?",
            "What would convince you to try something new in this area?"
        ]
    )

def should_generate_research_questions(
    messages: List[Message],
    user_input: str,
    conversation_context: str
) -> bool:
    """Determine if we have enough information to generate research questions."""

    context_lower = conversation_context.lower()
    input_lower = user_input.lower()

    # Check if user explicitly asks for questions
    user_wants_questions = any(phrase in input_lower for phrase in [
        'generate questions', 'create questions', 'research questions',
        'questions for', 'help me with questions', 'what questions',
        'interview questions', 'customer questions', 'ready for questions',
        'let\'s create questions', 'build questions', 'make questions'
    ])

    if user_wants_questions:
        return True

    # More reasonable - need good conversation (at least 10 exchanges)
    has_enough_exchanges = len(messages) >= 20  # 10 user + 10 assistant messages

    # Check for comprehensive business understanding
    has_business_idea = any(phrase in context_lower for phrase in [
        'business idea', 'product', 'service', 'app', 'platform',
        'solution', 'startup', 'company', 'build', 'create', 'develop'
    ])

    has_target_customer = any(phrase in context_lower for phrase in [
        'customer', 'user', 'client', 'people', 'business', 'company',
        'target', 'audience', 'market', 'who would use', 'who needs'
    ])

    has_problem_context = any(phrase in context_lower for phrase in [
        'problem', 'challenge', 'pain', 'solve', 'help', 'improve',
        'frustration', 'difficulty', 'issue', 'need', 'value', 'benefit'
    ])

    has_feature_context = any(phrase in context_lower for phrase in [
        'feature', 'functionality', 'capability', 'does', 'works',
        'enables', 'allows', 'provides', 'offers', 'how it works'
    ])

    # Only generate questions if we have comprehensive understanding AND long conversation
    comprehensive_context = (
        has_business_idea and
        has_target_customer and
        (has_problem_context or has_feature_context) and
        has_enough_exchanges
    )

    return comprehensive_context

def should_confirm_before_questions(
    messages: List[Message],
    user_input: str,
    conversation_context: str
) -> bool:
    """Check if we should confirm understanding before generating questions."""

    context_lower = conversation_context.lower()
    input_lower = user_input.lower()

    # Check if user explicitly confirms or asks for questions
    user_confirms = any(phrase in input_lower for phrase in [
        'yes', 'correct', 'that\'s right', 'exactly', 'sounds good',
        'let\'s do it', 'generate questions', 'create questions', 'ready'
    ])

    if user_confirms:
        return False  # Don't need confirmation, proceed to questions

    # Check if we have enough context for confirmation
    has_business_idea = any(phrase in context_lower for phrase in [
        'business idea', 'product', 'service', 'app', 'platform',
        'solution', 'startup', 'company', 'build', 'create', 'develop'
    ])

    has_target_customer = any(phrase in context_lower for phrase in [
        'customer', 'user', 'client', 'people', 'business', 'company',
        'target', 'audience', 'market', 'who would use', 'who needs'
    ])

    has_problem_context = any(phrase in context_lower for phrase in [
        'problem', 'challenge', 'pain', 'solve', 'help', 'improve',
        'frustration', 'difficulty', 'issue', 'need', 'value', 'benefit'
    ])

    has_feature_context = any(phrase in context_lower for phrase in [
        'feature', 'functionality', 'capability', 'does', 'works',
        'enables', 'allows', 'provides', 'offers', 'how it works'
    ])

    # Need good conversation (at least 8 exchanges)
    has_enough_exchanges = len(messages) >= 16  # 8 user + 8 assistant messages

    # Should confirm if we have good context but haven't confirmed yet
    return (
        has_business_idea and
        has_target_customer and
        (has_problem_context or has_feature_context) and
        has_enough_exchanges
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

def detect_industry_context(business_idea: str, target_customer: str, problem: str) -> str:
    """Detect the industry context from the conversation."""

    combined_text = f"{business_idea} {target_customer} {problem}".lower()

    # SaaS/Software
    if any(term in combined_text for term in ["saas", "software", "platform", "api", "app", "digital", "cloud", "data"]):
        return "saas"

    # E-commerce/Retail
    elif any(term in combined_text for term in ["ecommerce", "retail", "shop", "store", "marketplace", "selling", "product"]):
        return "ecommerce"

    # Healthcare/Medical
    elif any(term in combined_text for term in ["health", "medical", "patient", "doctor", "clinic", "hospital", "wellness"]):
        return "healthcare"

    # Financial Services
    elif any(term in combined_text for term in ["finance", "bank", "payment", "money", "investment", "loan", "credit"]):
        return "fintech"

    # Education/EdTech
    elif any(term in combined_text for term in ["education", "learning", "student", "teacher", "course", "training", "school"]):
        return "edtech"

    # Manufacturing/Industrial
    elif any(term in combined_text for term in ["manufacturing", "factory", "production", "supply chain", "logistics", "industrial"]):
        return "manufacturing"

    # Automotive
    elif any(term in combined_text for term in ["car", "automotive", "vehicle", "transport", "fleet", "driving"]):
        return "automotive"

    # Real Estate
    elif any(term in combined_text for term in ["real estate", "property", "housing", "rent", "lease", "building"]):
        return "real_estate"

    # Default
    else:
        return "general"

def get_industry_guidance(industry: str) -> str:
    """Get industry-specific guidance for research questions."""

    guidance = {
        "saas": """
For SaaS businesses, focus on:
- User adoption and onboarding challenges
- Feature usage and engagement metrics
- Pricing sensitivity and willingness to pay
- Integration needs with existing tools
- Churn reasons and retention factors
""",
        "ecommerce": """
For e-commerce businesses, focus on:
- Purchase decision factors and barriers
- Shopping behavior and preferences
- Price sensitivity and comparison shopping
- Trust and security concerns
- Post-purchase experience and loyalty
""",
        "healthcare": """
For healthcare businesses, focus on:
- Compliance and regulatory requirements
- Patient/provider workflow integration
- Privacy and security concerns
- Clinical outcomes and effectiveness
- Adoption barriers in healthcare settings
""",
        "fintech": """
For fintech businesses, focus on:
- Trust and security perceptions
- Regulatory compliance needs
- Integration with existing financial systems
- User financial behavior and pain points
- Risk tolerance and decision-making factors
""",
        "edtech": """
For education technology, focus on:
- Learning outcomes and effectiveness
- User engagement and motivation
- Integration with existing curricula
- Accessibility and ease of use
- Cost-benefit for educational institutions
""",
        "manufacturing": """
For manufacturing businesses, focus on:
- Operational efficiency improvements
- Integration with existing systems
- ROI and cost-benefit analysis
- Compliance and safety requirements
- Scalability and implementation challenges
""",
        "automotive": """
For automotive businesses, focus on:
- Safety and reliability concerns
- Integration with existing vehicle systems
- User experience while driving
- Maintenance and support needs
- Regulatory and compliance requirements
""",
        "real_estate": """
For real estate businesses, focus on:
- Market timing and decision factors
- Trust and credibility in transactions
- Technology adoption in traditional industry
- Regulatory and legal considerations
- Geographic and local market factors
""",
        "general": """
For this business, focus on:
- Core value proposition validation
- User adoption and engagement
- Competitive landscape and differentiation
- Pricing and business model validation
- Scalability and growth potential
"""
    }

    return guidance.get(industry, guidance["general"])

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

async def extract_context_with_llm(llm_service, conversation_context: str, latest_input: str) -> dict:
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
            temperature=0.1,
            max_tokens=4000  # Increased from 1000 to handle longer conversations
        )

        logger.info(f"LLM context extraction response: {response}")

        # Parse JSON response
        import json
        response_clean = response.strip()
        if response_clean.startswith('```json'):
            response_clean = response_clean[7:]
        if response_clean.endswith('```'):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()

        logger.info(f"Cleaned response for JSON parsing: {response_clean}")

        context = json.loads(response_clean)
        logger.info(f"Successfully parsed context: {context}")
        return context

    except Exception as e:
        logger.error(f"Error extracting context with LLM: {str(e)}")
        logger.error(f"Raw response was: {response if 'response' in locals() else 'No response'}")

        # Fallback: extract context manually from conversation
        fallback_context = extract_context_manually(conversation_context, latest_input)
        logger.info(f"Using fallback context: {fallback_context}")
        return fallback_context

def extract_context_manually(conversation_context: str, latest_input: str) -> dict:
    """Manual fallback context extraction when LLM fails."""

    context_lower = conversation_context.lower()
    input_lower = latest_input.lower()

    # Extract business idea - be more generous
    business_idea = None
    if "feature" in input_lower:
        business_idea = "feature or product development"
    elif "api" in context_lower and ("legacy" in context_lower or "vehicle" in context_lower):
        business_idea = "API that transforms legacy vehicle systems into reliable endpoints"
    elif "middleware" in context_lower:
        business_idea = "Internal middleware tool for syncing data between systems"
    elif "api" in context_lower:
        business_idea = "API service for data integration"
    elif any(word in context_lower for word in ["app", "tool", "service", "platform", "product", "solution"]):
        business_idea = "digital product or service"

    # Extract target customer - be more generous
    target_customer = None
    if "customer" in input_lower or "customer" in context_lower:
        target_customer = "customers"
    elif "internal" in context_lower and "organisation" in context_lower:
        target_customer = "Internal services within the organization"
    elif "services" in context_lower and "organisation" in context_lower:
        target_customer = "Other services within the organization"
    elif any(word in context_lower for word in ["user", "client", "people", "business"]):
        target_customer = "users or clients"

    # Extract problem - be more generous
    problem = None
    if "decide" in input_lower:
        problem = "decision-making challenges"
    elif "custom integrations" in context_lower and "hard" in context_lower:
        problem = "Hard to have custom integrations between systems"
    elif "syncing data" in context_lower:
        problem = "Difficulty syncing data between different systems"
    elif "month to have a full integration" in context_lower and "maintenance is hard" in context_lower:
        problem = "Time-consuming integrations (around a month) and hard-to-maintain direct integrations"
    elif "parallel development" in context_lower:
        problem = "Forces parallel development due to integration difficulties"
    elif any(word in context_lower for word in ["hard", "difficult", "challenge", "problem", "issue"]):
        problem = "operational or technical challenges"

    return {
        "business_idea": business_idea,
        "target_customer": target_customer,
        "problem": problem
    }

def determine_research_stage_from_context(context: dict) -> str:
    """Determine research stage from extracted context."""
    if not context.get('business_idea'):
        return "initial"
    elif not context.get('target_customer'):
        return "business_idea"
    elif not context.get('problem'):
        return "target_customer"
    else:
        return "validation"

@router.get("/sessions")
async def get_research_sessions(
    user_id: Optional[str] = None,
    limit: int = 20,
    db: Session = Depends(get_db)
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
async def get_research_session(
    session_id: str,
    db: Session = Depends(get_db)
):
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
            "completed_at": session.completed_at
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get session: {str(e)}")

@router.delete("/sessions/{session_id}")
async def delete_research_session(
    session_id: str,
    db: Session = Depends(get_db)
):
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
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")

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
            problem="Test Problem"
        )
        session = session_service.create_session(session_data)
        session_id = session.session_id
        logger.info(f"Created session: {session_id}")

        # Simulate user message
        user_message = {
            "id": "user_1",
            "content": "I want to test message saving",
            "role": "user",
            "timestamp": datetime.utcnow().isoformat()
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
            "timestamp": datetime.utcnow().isoformat()
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
            "messages_saved": len(retrieved_session.messages) if retrieved_session.messages else 0,
            "messages": retrieved_session.messages,
            "message": "Simple chat test completed successfully"
        }

    except Exception as e:
        logger.error(f"Simple chat test failed: {str(e)}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return {
            "status": "error",
            "error": str(e),
            "message": "Simple chat test failed"
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
            custom_config={
                "temperature": 0.0,
                "max_output_tokens": 10
            }
        )

        logger.info(f"Direct client test response: {simple_response}")

        # Test 2: LLM service test
        llm_service = LLMServiceFactory.create("enhanced_gemini")

        service_response = await llm_service.generate_text(
            prompt="Hello, please respond with just the word 'working'",
            temperature=0.0,
            max_tokens=10
        )

        logger.info(f"LLM service test response: {service_response}")

        return {
            "status": "success",
            "direct_client_response": simple_response,
            "llm_service_response": service_response,
            "message": "Gemini tests completed"
        }

    except Exception as e:
        logger.error(f"Gemini test failed: {str(e)}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return {
            "status": "error",
            "error": str(e),
            "message": "Gemini test failed"
        }
