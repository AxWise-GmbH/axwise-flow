"""
Simple Customer Research API - Direct Implementation
No complex thinking process, no async analysis, just direct LLM calls with fallbacks.
"""

import logging
import time
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

class ChatMessage(BaseModel):
    id: str
    content: str
    role: str
    timestamp: str
    metadata: Optional[Dict[str, Any]] = None

class SimpleChatRequest(BaseModel):
    messages: List[ChatMessage]
    input: str
    context: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None

class SimpleChatResponse(BaseModel):
    content: str
    metadata: Dict[str, Any]
    questions: Optional[Dict[str, List[str]]] = None

def extract_business_context(conversation_text: str, latest_input: str) -> Dict[str, Any]:
    """Simple keyword-based context extraction."""

    # Handle None values safely
    safe_conversation = conversation_text or ""
    safe_input = latest_input or ""
    all_text = f"{safe_conversation} {safe_input}".lower()

    # Simple business idea detection
    business_idea = None
    if any(word in all_text for word in ['app', 'platform', 'tool', 'service', 'product', 'system', 'software']):
        if 'laundry' in all_text:
            business_idea = "A laundry service or platform"
        elif 'food' in all_text or 'restaurant' in all_text:
            business_idea = "A food or restaurant service"
        elif 'education' in all_text or 'learning' in all_text:
            business_idea = "An educational platform or service"
        else:
            business_idea = "A digital solution or service"

    # Simple customer detection
    target_customer = None
    if any(word in all_text for word in ['users', 'customers', 'people', 'teams', 'companies', 'businesses']):
        if 'students' in all_text:
            target_customer = "Students"
        elif 'business' in all_text or 'companies' in all_text:
            target_customer = "Businesses or companies"
        elif 'families' in all_text:
            target_customer = "Families"
        else:
            target_customer = "General users or customers"

    # Simple problem detection
    problem = None
    if any(word in all_text for word in ['problem', 'issue', 'challenge', 'pain', 'difficulty', 'frustration']):
        if 'time' in all_text:
            problem = "Time-related challenges"
        elif 'cost' in all_text or 'expensive' in all_text:
            problem = "Cost or pricing issues"
        elif 'quality' in all_text:
            problem = "Quality concerns"
        else:
            problem = "General problems or challenges"

    return {
        "business_idea": business_idea,
        "target_customer": target_customer,
        "problem": problem
    }

def determine_conversation_stage(context: Dict[str, Any]) -> str:
    """Determine what stage the conversation is in."""

    has_business_idea = bool(context.get("business_idea"))
    has_target_customer = bool(context.get("target_customer"))
    has_problem = bool(context.get("problem"))

    if not has_business_idea:
        return "initial"
    elif not has_target_customer:
        return "business_idea"
    elif not has_problem:
        return "target_customer"
    else:
        return "ready_for_questions"

def generate_simple_response(context: Dict[str, Any], latest_input: str, stage: str) -> str:
    """Generate a simple conversational response based on context and stage."""

    business_idea = context.get("business_idea")
    target_customer = context.get("target_customer")
    problem = context.get("problem")

    if stage == "initial":
        return "I'd love to help you with customer research! What business idea are you working on? Tell me about what you're trying to build or create."

    elif stage == "business_idea":
        return f"Interesting! So you're working on {business_idea}. Who would be your target customers? Who do you think would use or benefit from this?"

    elif stage == "target_customer":
        return f"Great! So {target_customer} would use {business_idea}. What specific problem or challenge does this solve for them? What pain point are you addressing?"

    elif stage == "ready_for_questions":
        return f"Perfect! I understand you're building {business_idea} for {target_customer} to solve {problem}. This sounds like a solid foundation for customer research. Would you like me to generate some targeted research questions to help you validate this with real customers?"

    else:
        return "I'm here to help you with customer research. Could you tell me more about your business idea?"

def generate_simple_suggestions(context: Dict[str, Any], stage: str) -> List[str]:
    """Generate simple contextual suggestions."""

    # Handle None values safely
    business_idea_raw = context.get("business_idea", "")
    business_idea = (business_idea_raw or "").lower()

    if stage == "initial":
        return [
            "I'm building an app",
            "I have a service idea",
            "I want to solve a problem",
            "I'm starting a business"
        ]

    elif stage == "business_idea":
        return [
            "Who would use this?",
            "What problem does it solve?",
            "Tell me more about the idea",
            "What's your target market?"
        ]

    elif stage == "target_customer":
        return [
            "What challenges do they face?",
            "How would this help them?",
            "What's the biggest pain point?",
            "Why would they choose this?"
        ]

    elif stage == "ready_for_questions":
        return [
            "Generate research questions",
            "Yes, create questions",
            "What should I ask customers?",
            "Help me validate this idea"
        ]

    else:
        if 'laundry' in business_idea:
            return [
                "Pick-up and delivery service",
                "Self-service laundromat",
                "Commercial clients focus",
                "Eco-friendly cleaning options"
            ]
        else:
            return [
                "Tell me more",
                "What's the main benefit?",
                "Who needs this most?",
                "What's different about it?"
            ]

def generate_research_questions(context: Dict[str, Any]) -> Dict[str, List[str]]:
    """Generate simple research questions based on context."""

    business_idea = context.get("business_idea", "your business idea")
    target_customer = context.get("target_customer", "your target customers")
    problem = context.get("problem", "the problem you're solving")

    return {
        "problemDiscovery": [
            f"How do {target_customer} currently handle this type of challenge?",
            f"What's the most frustrating part of dealing with {problem}?",
            "How much time do you spend on this each week?",
            "What tools or methods have you tried before to solve this?",
            f"What would an ideal solution look like for {target_customer}?"
        ],
        "solutionValidation": [
            f"Would you be interested in trying {business_idea}?",
            f"What features would be most important to you in {business_idea}?",
            f"How much would you be willing to pay for a solution that solves {problem}?",
            "What concerns would you have about switching to something new?",
            f"How do you typically evaluate new solutions in this area?"
        ],
        "followUp": [
            "Can you walk me through your current process?",
            "What would success look like for you?",
            "Who else is involved in this decision?"
        ]
    }

@router.get("/health")
async def simple_health():
    """Simple health check for the simple research endpoint."""
    return {"status": "ok", "endpoint": "simple_research", "message": "Simple customer research endpoint is working"}

@router.post("/chat", response_model=SimpleChatResponse)
async def simple_chat(request: SimpleChatRequest):
    """
    Simple, direct chat endpoint without complex thinking process.
    Just analyzes the conversation and responds directly.
    """

    try:
        logger.info(f"Simple chat request for session {request.session_id}")

        # Validate input
        if not request.input:
            logger.warning("Empty input received")
            return SimpleChatResponse(
                content="I didn't receive any input. Could you please tell me about your business idea?",
                metadata={
                    "questionCategory": "discovery",
                    "researchStage": "initial",
                    "suggestions": ["I'm building an app", "I have a service idea", "I want to solve a problem"],
                    "extracted_context": {},
                    "conversation_stage": "chatting",
                    "show_confirmation": False,
                    "questions_generated": False,
                    "workflow_version": "simple_direct_fallback",
                    "request_id": f"simple_{int(time.time())}"
                },
                questions=None
            )

        # Build conversation context safely
        conversation_text = ""
        if request.messages:
            for msg in request.messages:
                if msg and hasattr(msg, 'role') and hasattr(msg, 'content'):
                    role = msg.role or "unknown"
                    content = msg.content or ""
                    conversation_text += f"{role}: {content}\n"

        # Extract business context using simple keyword matching
        context = extract_business_context(conversation_text, request.input)
        logger.info(f"Extracted context: {context}")

        # Determine conversation stage
        stage = determine_conversation_stage(context)
        logger.info(f"Conversation stage: {stage}")

        # Check if user wants questions generated
        # Handle None input safely
        safe_input = request.input or ""
        input_lower = safe_input.lower()
        wants_questions = any(word in input_lower for word in [
            'questions', 'research questions', 'generate', 'create questions', 'yes', 'validate'
        ]) and stage == "ready_for_questions"

        # Generate response
        if wants_questions:
            response_content = "Great! Here are targeted research questions to help you validate your business idea:"
            questions = generate_research_questions(context)
        else:
            response_content = generate_simple_response(context, request.input, stage)
            questions = None

        # Generate suggestions
        suggestions = generate_simple_suggestions(context, stage)

        # Build response metadata
        metadata = {
            "questionCategory": "validation" if questions else "discovery",
            "researchStage": stage,
            "suggestions": suggestions,
            "extracted_context": context,
            "conversation_stage": "confirming" if stage == "ready_for_questions" and not wants_questions else "chatting",
            "show_confirmation": stage == "ready_for_questions" and not wants_questions,
            "questions_generated": bool(questions),
            "workflow_version": "simple_direct",
            "request_id": f"simple_{int(time.time())}"
        }

        logger.info(f"Generated response with {len(suggestions)} suggestions")

        return SimpleChatResponse(
            content=response_content,
            metadata=metadata,
            questions=questions
        )

    except Exception as e:
        logger.error(f"Simple chat error: {e}", exc_info=True)

        # Return a graceful error response instead of raising HTTPException
        return SimpleChatResponse(
            content="I'm sorry, I encountered an error processing your request. Let's start fresh - what business idea are you working on?",
            metadata={
                "questionCategory": "discovery",
                "researchStage": "initial",
                "suggestions": ["I'm building an app", "I have a service idea", "I want to solve a problem", "I'm starting a business"],
                "extracted_context": {},
                "conversation_stage": "error_recovery",
                "show_confirmation": False,
                "questions_generated": False,
                "workflow_version": "simple_direct_error_fallback",
                "error": str(e),
                "request_id": f"simple_error_{int(time.time())}"
            },
            questions=None
        )
