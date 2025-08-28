"""
Simplified PydanticAI Models for Conversation Routines
Based on context-driven approach rather than complex state management
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class ConversationContext(BaseModel):
    """Simple conversation context tracking for efficient decision making"""

    business_idea: Optional[str] = Field(
        None, description="User's business idea or product/service concept"
    )
    target_customer: Optional[str] = Field(
        None, description="Primary target customer or user group"
    )
    problem: Optional[str] = Field(None, description="Core problem being solved")
    exchange_count: int = Field(0, description="Number of conversation exchanges")
    user_fatigue_signals: List[str] = Field(
        default_factory=list, description="Signals of user fatigue"
    )

    def is_sufficient_for_questions(self) -> bool:
        """Determine if we have enough context to generate research questions"""
        # Core information check - standardized minimum lengths
        has_core_info = bool(
            self.business_idea
            and len(self.business_idea.strip()) >= 10
            and self.target_customer
            and len(self.target_customer.strip()) >= 5
            and self.problem
            and len(self.problem.strip()) >= 8  # Increased from 5 to 8 for consistency
        )

        # Efficiency triggers
        max_exchanges_reached = self.exchange_count >= 6
        user_showing_fatigue = len(self.user_fatigue_signals) >= 2

        return has_core_info or max_exchanges_reached or user_showing_fatigue

    def get_completeness_score(self) -> float:
        """Calculate how complete the context is (0.0 to 1.0)"""
        score = 0.0

        if self.business_idea and len(self.business_idea.strip()) >= 10:
            score += 0.4
        elif self.business_idea:
            score += 0.2

        if self.target_customer and len(self.target_customer.strip()) >= 5:
            score += 0.3
        elif self.target_customer:
            score += 0.15

        if self.problem and len(self.problem.strip()) >= 5:
            score += 0.3
        elif self.problem:
            score += 0.15

        return min(score, 1.0)

    def should_transition_to_questions(self) -> bool:
        """Determine if conversation should transition to question generation"""
        # Require ALL three core fields to be present - standardized lengths
        has_all_required = (
            self.business_idea
            and len(self.business_idea.strip()) >= 10
            and self.target_customer
            and len(self.target_customer.strip()) >= 5
            and self.problem
            and len(self.problem.strip()) >= 8  # Reduced from 10 to 8 for consistency
        )

        return (
            has_all_required  # Must have all three fields
            or self.exchange_count >= 8  # Increased from 6
            or len(self.user_fatigue_signals) >= 3  # Increased from 2
        )


class ConversationMessage(BaseModel):
    """Simple message structure for conversation tracking"""

    id: Optional[str] = Field(None, description="Message ID")
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ConversationRoutineRequest(BaseModel):
    """Request structure for conversation routine processing"""

    input: str = Field(..., description="User input message")
    messages: List[ConversationMessage] = Field(
        default_factory=list, description="Conversation history"
    )
    context: Optional[ConversationContext] = Field(default_factory=ConversationContext)
    session_id: Optional[str] = Field(None, description="Session identifier")
    user_id: Optional[str] = Field(None, description="User identifier")


class ConversationRoutineResponse(BaseModel):
    """Response structure from conversation routine processing"""

    content: str = Field(..., description="Assistant response content")
    context: ConversationContext = Field(
        ..., description="Updated conversation context"
    )
    should_generate_questions: bool = Field(
        False, description="Whether to generate research questions"
    )
    questions: Optional[Dict[str, Any]] = Field(
        None, description="Generated research questions if applicable"
    )
    suggestions: List[str] = Field(
        default_factory=list, description="Quick reply suggestions"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional response metadata"
    )
    session_id: Optional[str] = Field(None, description="Session identifier")


class StakeholderQuestions(BaseModel):
    """Structure for stakeholder-based research questions"""

    primary_stakeholders: List[Dict[str, Any]] = Field(default_factory=list)
    secondary_stakeholders: List[Dict[str, Any]] = Field(default_factory=list)
    time_estimate: Dict[str, Any] = Field(default_factory=dict)
    total_questions: int = Field(0)
    estimated_minutes: str = Field("0-0")


def detect_user_fatigue(message: str, previous_messages: List[str]) -> List[str]:
    """Detect signals that user is getting fatigued with questions"""
    fatigue_signals = []

    message_lower = message.lower().strip()

    # Short responses
    if len(message.strip()) <= 10:
        fatigue_signals.append("short_response")

    # "I don't know" variations
    dont_know_phrases = ["i don't know", "not sure", "don't know", "no idea", "idk"]
    if any(phrase in message_lower for phrase in dont_know_phrases):
        fatigue_signals.append("uncertainty")

    # Repetitive responses
    if len(previous_messages) >= 2:
        recent_messages = [msg.lower().strip() for msg in previous_messages[-2:]]
        if message_lower in recent_messages:
            fatigue_signals.append("repetitive")

    # Explicit requests to move forward
    forward_phrases = [
        "generate",
        "create",
        "make",
        "let's go",
        "proceed",
        "next",
        "continue",
        "move on",
    ]
    if any(phrase in message_lower for phrase in forward_phrases):
        fatigue_signals.append("explicit_request")

    # Problem-specific fatigue signals
    problem_fatigue_phrases = [
        "that's the problem",
        "the main issue",
        "the biggest challenge",
        "that's it",
    ]
    if any(phrase in message_lower for phrase in problem_fatigue_phrases):
        fatigue_signals.append("problem_identified")

    return fatigue_signals


async def extract_context_from_messages(
    messages: List[ConversationMessage], llm_service=None
) -> ConversationContext:
    """Extract business context from conversation messages using LLM"""
    context = ConversationContext()
    context.exchange_count = len([msg for msg in messages if msg.role == "user"])

    if not messages:
        return context

    # Get conversation text
    conversation_text = "\n".join([f"{msg.role}: {msg.content}" for msg in messages])

    # Use LLM to extract context if available
    if llm_service:
        try:
            extraction_prompt = f"""
Extract business context from this conversation. Return ONLY a JSON object with these fields:
- business_idea: Brief description of the business/product (or null if not clear)
- target_customer: Who the customers are (or null if not mentioned)
- problem: What specific problem is being solved (or null if not mentioned)

For the problem field, look for:
- Pain points mentioned by the user
- Challenges or difficulties described
- Issues that need solving
- Problems the business aims to address

Be specific about the problem - avoid generic statements.

Conversation:
{conversation_text}

Return only valid JSON, no other text:"""

            response_data = await llm_service.analyze(
                text=extraction_prompt,
                task="text_generation",
                data={"temperature": 0.1, "max_tokens": 200},
            )

            import json
            import re

            response_text = response_data.get("text", "")

            # Extract JSON from response
            json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
            if json_match:
                extracted_data = json.loads(json_match.group())

                context.business_idea = extracted_data.get("business_idea")
                context.target_customer = extracted_data.get("target_customer")
                context.problem = extracted_data.get("problem")

                # Debug logging
                import logging

                logger = logging.getLogger(__name__)
                logger.info(
                    f"🔍 Context extraction result: business_idea='{context.business_idea}', target_customer='{context.target_customer}', problem='{context.problem}'"
                )

        except Exception as e:
            # Fallback: just count exchanges
            pass

    # Detect fatigue signals from recent messages
    user_messages = [msg.content.lower() for msg in messages if msg.role == "user"]
    if len(user_messages) >= 2:
        recent_messages = user_messages[-3:]
        for msg in recent_messages:
            fatigue_signals = detect_user_fatigue(msg, user_messages[:-1])
            context.user_fatigue_signals.extend(fatigue_signals)

    # Remove duplicates
    context.user_fatigue_signals = list(set(context.user_fatigue_signals))

    return context
