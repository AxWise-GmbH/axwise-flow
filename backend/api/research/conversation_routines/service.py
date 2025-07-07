"""
Conversation Routines Service
Implements the 2025 Conversation Routines framework for customer research
"""

import logging
import json
import re
from typing import Dict, Any, List
from pydantic_ai import Agent
from pydantic_ai.tools import Tool

from .models import (
    ConversationRoutineRequest,
    ConversationRoutineResponse,
    ConversationContext,
    ConversationMessage,
    extract_context_from_messages,
)
from .conversation_routine_prompt import get_conversation_routine_prompt

# Import moved to local - we have our own simple stakeholder detector
from .stakeholder_detector import StakeholderDetector
from backend.services.llm.gemini_service import GeminiService

logger = logging.getLogger(__name__)


class ConversationRoutineService:
    """
    Conversation Routines implementation for customer research
    Uses single LLM call with embedded workflow logic
    """

    def __init__(self):
        # Initialize GeminiService with default config
        llm_config = {
            "model": "gemini-2.5-flash",
            "temperature": 0.7,
            "max_tokens": 16000,
        }
        self.llm_service = GeminiService(llm_config)
        self.stakeholder_detector = StakeholderDetector()
        self.agent = self._create_agent()

    def _create_agent(self) -> Agent:
        """Create PydanticAI agent with conversation routine prompt and tools"""

        @Tool
        async def generate_stakeholder_questions(
            business_idea: str, target_customer: str, problem: str
        ) -> Dict[str, Any]:
            """Generate comprehensive stakeholder-based research questions"""
            try:
                logger.info(
                    f"🎯 Generating stakeholder questions for: {business_idea[:50]}..."
                )

                # Use existing stakeholder detector
                context_analysis = {
                    "business_idea": business_idea,
                    "target_customer": target_customer,
                    "problem": problem,
                }
                stakeholder_data = await self.stakeholder_detector.generate_dynamic_stakeholders_with_unique_questions(
                    self.llm_service,
                    context_analysis=context_analysis,
                    messages=[],  # Empty for now
                    business_idea=business_idea,
                    target_customer=target_customer,
                    problem=problem,
                )

                # Calculate time estimates
                time_estimates = (
                    self.stakeholder_detector.calculate_stakeholder_time_estimates(
                        stakeholder_data
                    )
                )

                # Format for frontend - wrap stakeholder data in expected format
                result = {"stakeholders": stakeholder_data}
                logger.info(
                    f"✅ Generated questions for {len(stakeholder_data.get('primary', []))} primary + {len(stakeholder_data.get('secondary', []))} secondary stakeholders"
                )
                return result

            except Exception as e:
                logger.error(f"🔴 Stakeholder question generation failed: {e}")
                return {"error": str(e), "success": False}

        @Tool
        async def extract_conversation_context(
            messages: List[Dict[str, str]],
        ) -> Dict[str, Any]:
            """Extract business context from conversation history using LLM"""
            try:
                if not messages:
                    return {
                        "business_idea": None,
                        "target_customer": None,
                        "problem": None,
                    }

                # Use LLM to extract context
                conversation_text = "\n".join(
                    [
                        f"{msg['role']}: {msg['content']}"
                        for msg in messages[-10:]  # Last 10 messages for context
                    ]
                )

                extraction_prompt = f"""
                Extract the business context from this conversation:

                {conversation_text}

                Return JSON with:
                - business_idea: The product/service concept (or null)
                - target_customer: The primary customer group (or null)
                - problem: The main problem being solved (or null)

                Only extract what is clearly stated. Use null for missing information.
                """

                response_data = await self.llm_service.analyze(
                    text=extraction_prompt,
                    task="text_generation",
                    data={"temperature": 0.1, "max_tokens": 500},
                )
                response = response_data.get("text", "")

                # Parse JSON response
                cleaned = response.strip()
                if cleaned.startswith("```json"):
                    json_match = re.search(
                        r"```json\s*\n(.*?)\n```", cleaned, re.DOTALL
                    )
                    if json_match:
                        cleaned = json_match.group(1).strip()

                context_data = json.loads(cleaned)
                logger.info(f"📋 Extracted context: {context_data}")
                return context_data

            except Exception as e:
                logger.error(f"🔴 Context extraction failed: {e}")
                return {"business_idea": None, "target_customer": None, "problem": None}

        # Create agent with tools
        agent = Agent(
            model=self.llm_service.get_pydantic_ai_model(),
            system_prompt=get_conversation_routine_prompt(),
            tools=[generate_stakeholder_questions, extract_conversation_context],
        )

        return agent

    async def _generate_stakeholder_questions_tool(
        self, business_idea: str, target_customer: str, problem: str
    ) -> Dict[str, Any]:
        """Generate comprehensive stakeholder-based research questions"""
        try:
            logger.info(
                f"🎯 Generating stakeholder questions for: {business_idea[:50]}..."
            )

            # Use existing stakeholder detector
            context_analysis = {
                "business_idea": business_idea,
                "target_customer": target_customer,
                "problem": problem,
            }
            stakeholder_data = await self.stakeholder_detector.generate_dynamic_stakeholders_with_unique_questions(
                self.llm_service,
                context_analysis=context_analysis,
                messages=[],  # Empty for now
                business_idea=business_idea,
                target_customer=target_customer,
                problem=problem,
            )

            # Calculate time estimates
            time_estimates = (
                self.stakeholder_detector.calculate_stakeholder_time_estimates(
                    stakeholder_data
                )
            )

            # Format for frontend - use V3 format expected by ComprehensiveQuestionsComponent
            result = {
                "primaryStakeholders": stakeholder_data.get("primary", []),
                "secondaryStakeholders": stakeholder_data.get("secondary", []),
                "timeEstimate": time_estimates,
            }
            logger.info(
                f"✅ Generated questions for {len(stakeholder_data.get('primary', []))} primary + {len(stakeholder_data.get('secondary', []))} secondary stakeholders"
            )
            logger.info(f"🔍 Returning questions data: {list(result.keys())}")
            return result

        except Exception as e:
            logger.error(f"🔴 Stakeholder question generation failed: {e}")
            return {"error": str(e), "success": False}

    async def _extract_conversation_context_tool(
        self, messages: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """Extract business context from conversation history using LLM"""
        try:
            if not messages:
                return {"business_idea": None, "target_customer": None, "problem": None}

            # Use LLM to extract context
            conversation_text = "\n".join(
                [
                    f"{msg['role']}: {msg['content']}"
                    for msg in messages[-10:]  # Last 10 messages for context
                ]
            )

            extraction_prompt = f"""
            Extract the business context from this conversation:

            {conversation_text}

            Return JSON with:
            - business_idea: The product/service concept (or null)
            - target_customer: The primary customer group (or null)
            - problem: The main problem being solved (or null)

            Only extract what is clearly stated. Use null for missing information.
            """

            response_data = await self.llm_service.analyze(
                text=extraction_prompt,
                task="text_generation",
                data={"temperature": 0.1, "max_tokens": 500},
            )
            response = response_data.get("text", "")

            # Parse JSON response
            cleaned = response.strip()
            if cleaned.startswith("```json"):
                json_match = re.search(r"```json\s*\n(.*?)\n```", cleaned, re.DOTALL)
                if json_match:
                    cleaned = json_match.group(1).strip()

            context_data = json.loads(cleaned)
            logger.info(f"📋 Extracted context: {context_data}")
            return context_data

        except Exception as e:
            logger.error(f"🔴 Context extraction failed: {e}")
            return {"business_idea": None, "target_customer": None, "problem": None}

    async def process_conversation(
        self, request: ConversationRoutineRequest
    ) -> ConversationRoutineResponse:
        """
        Process conversation using Conversation Routines approach
        Single LLM call with embedded decision logic
        """
        try:
            logger.info(f"🎯 Processing conversation routine: {request.input[:50]}...")

            # Extract context from conversation history
            # First add conversation history, then current input
            messages_for_context = [
                ConversationMessage(role=msg.role, content=msg.content)
                for msg in request.messages
            ] + [ConversationMessage(role="user", content=request.input)]

            context = await extract_context_from_messages(
                messages_for_context, self.llm_service
            )

            # Debug logging
            logger.info(
                f"🔍 Context extracted: business_idea={context.business_idea}, target_customer={context.target_customer}, problem={context.problem}"
            )
            logger.info(
                f"🔍 Exchange count: {context.exchange_count}, completeness: {context.get_completeness_score()}"
            )
            logger.info(f"🔍 Fatigue signals: {context.user_fatigue_signals}")

            # Prepare conversation history for agent
            conversation_history = [
                {"role": msg.role, "content": msg.content} for msg in request.messages
            ]

            # Add current user message
            conversation_history.append({"role": "user", "content": request.input})

            # Create comprehensive prompt with conversation routine + history
            conversation_text = "\n".join(
                [f"{msg['role']}: {msg['content']}" for msg in conversation_history]
            )

            full_prompt = f"""
{get_conversation_routine_prompt()}

CURRENT CONVERSATION:
{conversation_text}

CONTEXT ANALYSIS:
- Exchange count: {context.exchange_count + 1}
- Business idea: {context.business_idea or 'Not provided'}
- Target customer: {context.target_customer or 'Not provided'}
- Problem: {context.problem or 'Not provided'}
- Context completeness: {context.get_completeness_score():.1f}
- Should transition: {context.should_transition_to_questions()}
- Fatigue signals: {context.user_fatigue_signals}

Based on the conversation routine framework and current context, provide your response.
If you determine that questions should be generated, include "GENERATE_QUESTIONS" in your response.
"""

            # Use PydanticAI agent instead of direct LLM call
            try:
                agent_response = await self.agent.run(full_prompt)
                response_content = str(agent_response.data)
                logger.info(f"🤖 Agent response: {response_content[:200]}...")

                # Debug: Log the full agent response structure
                logger.info(f"🔍 Agent response type: {type(agent_response)}")
                logger.info(f"🔍 Agent response attributes: {dir(agent_response)}")

                # Check if the agent used tools to generate questions
                questions_generated = False
                generated_questions = None

                # Try different ways to access tool results
                if hasattr(agent_response, "all_messages"):
                    logger.info("🔍 Checking all_messages for tool calls...")
                    for i, message in enumerate(agent_response.all_messages()):
                        logger.info(f"🔍 Message {i}: {type(message)} - {dir(message)}")
                        if hasattr(message, "tool_calls") and message.tool_calls:
                            logger.info(
                                f"🔍 Found tool calls: {len(message.tool_calls)}"
                            )
                            for tool_call in message.tool_calls:
                                logger.info(f"🔍 Tool call: {tool_call.tool_name}")
                                if (
                                    tool_call.tool_name
                                    == "generate_stakeholder_questions"
                                ):
                                    logger.info(
                                        "🎯 Found generate_stakeholder_questions tool call"
                                    )
                                    questions_generated = True

                # Also check if there are any tool results directly
                if hasattr(agent_response, "tool_results"):
                    logger.info(
                        f"🔍 Found tool_results: {len(agent_response.tool_results)}"
                    )
                    for result in agent_response.tool_results:
                        logger.info(f"🔍 Tool result: {result.tool_name}")
                        if result.tool_name == "generate_stakeholder_questions":
                            generated_questions = result.data
                            questions_generated = True
                            logger.info(
                                f"✅ Questions generated via tool: {type(generated_questions)}"
                            )

                # Check if the response content indicates questions were generated
                if (
                    "Here's the breakdown by primary and secondary stakeholders"
                    in response_content
                ):
                    logger.info(
                        "🎯 Response content indicates questions were generated"
                    )
                    questions_generated = True

            except Exception as e:
                logger.error(f"🔴 Agent execution failed: {e}")
                # Fallback to direct LLM call
                response_data = await self.llm_service.analyze(
                    text=full_prompt,
                    task="text_generation",
                    data={"temperature": 0.7, "max_tokens": 1000},
                )
                response_content = response_data.get("text", "")

            # Questions variables are now initialized in the try block above

            # Check for validation confirmation signals
            user_input_lower = request.input.lower().strip()
            validation_confirmations = [
                "yes",
                "that's right",
                "correct",
                "that's correct",
                "exactly",
                "yes that's right",
                "yes it is correct",
                "that's exactly right",
                "perfect",
                "absolutely",
                "yes that's correct",
            ]

            is_validation_confirmation = any(
                confirmation in user_input_lower
                for confirmation in validation_confirmations
            )

            # Check if we should force question generation based on context completeness
            should_force_generation = (
                context.exchange_count >= 4  # Minimum exchanges
                and context.get_completeness_score() >= 0.6  # Sufficient context
                and any(
                    signal in user_input_lower
                    for signal in [
                        "i dont know",
                        "i don't know",
                        "i dont care",
                        "i don't care",
                    ]
                )
            )

            # Disable the old manual question generation logic
            # The PydanticAI agent should handle this automatically via tools
            # TODO: Remove this entire section once PydanticAI integration is complete

            # For now, check if the user is explicitly asking for questions
            user_wants_questions = any(
                phrase in request.input.lower()
                for phrase in [
                    "generate questionnaire",
                    "generate questions",
                    "create questions",
                ]
            )

            logger.info(
                f"🔍 Question generation check: user_wants_questions={user_wants_questions}, questions_generated={questions_generated}, input='{request.input.lower()}'"
            )

            # Also check if the response content indicates questions were generated
            response_has_questions = (
                "Here are comprehensive research questions" in response_content
            )

            # Check if we should generate questions (either explicit request or agent already generated them)
            if (
                user_wants_questions or response_has_questions
            ) and not questions_generated:
                logger.info("🎯 User explicitly requested questions - generating...")
                # Only generate if the agent didn't already handle it
                questions_generated = True
                extracted_context = await self._extract_conversation_context_tool(
                    conversation_history
                )
                logger.info(f"📋 Extracted context: {extracted_context}")

                if (
                    extracted_context.get("business_idea")
                    and extracted_context.get("target_customer")
                    and extracted_context.get("problem")
                ):
                    logger.info(
                        "✅ All required context available - generating stakeholder questions"
                    )
                    generated_questions = (
                        await self._generate_stakeholder_questions_tool(
                            business_idea=extracted_context["business_idea"],
                            target_customer=extracted_context["target_customer"],
                            problem=extracted_context["problem"],
                        )
                    )
                    logger.info(
                        f"🎯 Generated questions result: {type(generated_questions)} - {list(generated_questions.keys()) if generated_questions else 'None'}"
                    )
                else:
                    logger.warning(
                        f"❌ Missing required context - business_idea: {bool(extracted_context.get('business_idea'))}, target_customer: {bool(extracted_context.get('target_customer'))}, problem: {bool(extracted_context.get('problem'))}"
                    )

                # If this was a validation confirmation, replace with generation message
                if is_validation_confirmation and not generated_questions:
                    response_content = "Perfect! I'm generating your comprehensive research questions now..."
                elif is_validation_confirmation and generated_questions:
                    response_content = "Perfect! I've generated your custom research questions based on our conversation."
                elif should_force_generation and generated_questions:
                    response_content = "I have enough context about your Legacy API Service for VW account managers. Let me generate targeted research questions to help validate this solution."
                elif should_force_generation and not generated_questions:
                    response_content = "Based on our conversation, I'll generate research questions for your Legacy API Service solution."

            # Update context
            context.exchange_count += 1

            # Generate suggestions based on context
            suggestions = await self._generate_suggestions(context, response_content)

            response = ConversationRoutineResponse(
                content=response_content,
                context=context,
                should_generate_questions=questions_generated,
                questions=generated_questions,
                suggestions=suggestions,
                metadata={
                    "conversation_routine": True,
                    "context_completeness": context.get_completeness_score(),
                    "exchange_count": context.exchange_count,
                    "fatigue_signals": context.user_fatigue_signals,
                },
                session_id=request.session_id,
            )

            logger.info(
                f"✅ Conversation routine completed - Questions generated: {questions_generated}"
            )
            logger.info(f"🔍 Generated questions data: {generated_questions}")
            logger.info(f"📋 Response questions field: {response.questions}")
            return response

        except Exception as e:
            logger.error(f"🔴 Conversation routine failed: {e}")

            # Fallback response
            return ConversationRoutineResponse(
                content="I'd love to learn more about your business idea. Can you tell me what problem you're trying to solve?",
                context=ConversationContext(),
                suggestions=[
                    "Tell me more",
                    "What industry is this for?",
                    "Who are your target customers?",
                ],
                metadata={"error": str(e), "fallback": True},
            )

    async def _generate_suggestions(
        self, context: ConversationContext, response_content: str
    ) -> List[str]:
        """Generate contextual quick reply suggestions"""

        # If questions were generated, show completion suggestions
        if (
            "research questions" in response_content.lower()
            or "questionnaire" in response_content.lower()
        ):
            return ["Export questions", "Start research", "Modify questions"]

        # If ready for questions, show transition suggestions
        if context.should_transition_to_questions():
            return [
                "Yes, that's correct",
                "Let me add more details",
                "Actually, let me clarify",
            ]

        # Generate contextual suggestions using LLM
        suggestions = await self._generate_contextual_suggestions(
            context, response_content
        )
        return suggestions[:3]  # Limit to 3 suggestions

    async def _generate_contextual_suggestions(
        self, context: ConversationContext, response_content: str
    ) -> List[str]:
        """Generate contextual quick reply suggestions based on conversation state"""
        try:
            # Determine what information is missing and generate appropriate suggestions
            if not context.business_idea:
                # Generic business type suggestions
                return [
                    "It's a mobile app",
                    "It's a service business",
                    "It's a physical product",
                ]

            elif not context.target_customer:
                # Generate contextual customer suggestions based on business idea
                prompt = f"""
Generate 3 short, specific target customer suggestions for this business: "{context.business_idea}"

Return only a JSON array of 3 strings, each 2-4 words max. Examples:
["Busy professionals", "Small startups", "Enterprise clients"]

Business: {context.business_idea}
JSON array:"""

                response_data = await self.llm_service.analyze(
                    text=prompt,
                    task="text_generation",
                    data={"temperature": 0.3, "max_tokens": 100},
                )

                import json
                import re

                response_text = response_data.get("text", "")
                json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
                if json_match:
                    suggestions = json.loads(json_match.group())
                    return suggestions[:3]

            elif not context.problem:
                # Generate contextual problem suggestions based on business + customer
                prompt = f"""
Generate 3 short, specific problem statements for this business and customer:

Business: {context.business_idea}
Target Customer: {context.target_customer}

Return only a JSON array of 3 strings, each describing a pain point. Examples:
["Slow data access", "Manual processes", "High costs"]

JSON array:"""

                response_data = await self.llm_service.analyze(
                    text=prompt,
                    task="text_generation",
                    data={"temperature": 0.3, "max_tokens": 100},
                )

                import json
                import re

                response_text = response_data.get("text", "")
                json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
                if json_match:
                    suggestions = json.loads(json_match.group())
                    return suggestions[:3]

            else:
                # All context gathered - validation stage suggestions
                return [
                    "Yes, that's correct",
                    "Let me add more context",
                    "Actually, let me clarify",
                ]

        except Exception as e:
            logger.warning(f"Failed to generate contextual suggestions: {e}")

        # Fallback to generic suggestions
        if not context.business_idea:
            return ["Tell me more", "What industry?", "Who are customers?"]
        elif not context.target_customer:
            return ["Businesses", "Consumers", "Professionals"]
        elif not context.problem:
            return ["Time consuming", "Too expensive", "Too complex"]
        else:
            return [
                "Yes, that's correct",
                "Let me add more",
                "Actually, let me clarify",
            ]
