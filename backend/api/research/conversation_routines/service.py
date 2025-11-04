"""
Conversation Routines Service
Implements the 2025 Conversation Routines framework for customer research
"""

import logging
import json
import asyncio
from typing import Dict, Any, List, Optional
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

    def _extract_json_candidate(self, text: str) -> Optional[str]:
        """Best-effort extraction of a JSON object from free-form text.
        - Prefer fenced ```json ... ``` blocks
        - Else, find the longest balanced {...} region
        """
        if not text:
            return None
        # 1) Fenced code block
        fence = "```"
        if fence in text:
            start = text.find("```json")
            if start != -1:
                start = start + len("```json")
                end = text.find("```", start)
                if end != -1:
                    candidate = text[start:end].strip()
                    return candidate if candidate else None
            # generic fenced block
            start = text.find(fence)
            if start != -1:
                start = start + len(fence)
                end = text.find(fence, start)
                if end != -1:
                    candidate = text[start:end].strip()
                    return candidate if candidate else None
        # 2) Longest balanced braces
        start_idx = text.find("{")
        if start_idx == -1:
            return None
        depth = 0
        best = None
        for i in range(start_idx, len(text)):
            ch = text[i]
            if ch == "{":
                depth += 1
                if best is None:
                    best = [i, i]
            elif ch == "}":
                depth -= 1
                if best is not None:
                    best[1] = i
                if depth == 0 and best is not None:
                    s, e = best
                    return text[s : e + 1]
        return None

    def _create_agent(self) -> Agent:
        """Create PydanticAI agent with conversation routine prompt and tools"""

        @Tool
        async def generate_stakeholder_questions(
            business_idea: str, target_customer: str, problem: str
        ) -> Dict[str, Any]:
            """Generate comprehensive stakeholder-based research questions"""
            try:
                # Clear LLM cache to prevent stale questionnaire data
                from backend.services.processing.llm_request_cache import (
                    LLMRequestCache,
                )

                LLMRequestCache.clear_cache()
                logger.info(
                    "🧹 Cleared LLM request cache to prevent stale questionnaire data"
                )

                logger.info(
                    f"🎯 Generating stakeholder questions for: {business_idea[:50]}..."
                )

                # Log full business context for debugging
                logger.info("📋 Full business context:")
                logger.info(f"   Business idea: {business_idea}")
                logger.info(f"   Target customer: {target_customer}")
                logger.info(f"   Problem: {problem}")

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
                # Return V3-empty structure to avoid frontend format errors
                return {
                    "primaryStakeholders": [],
                    "secondaryStakeholders": [],
                    "timeEstimate": {"totalQuestions": 0, "estimatedMinutes": 20},
                }

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
                - industry: Industry/sector explicitly stated or clearly implied from business idea (e.g., "fintech", "healthcare", "venture studios", "b2b saas") (or null)
                - location: Country/city/region mentioned (or null)

                Only extract what is clearly stated. Use null for missing information.
                """

                response_data = await self.llm_service.analyze(
                    text=extraction_prompt,
                    task="text_generation",
                    data={"temperature": 0.1, "max_tokens": 500},
                )
                response = response_data.get("text", "")

                # Parse JSON response with tolerant extraction
                candidate = self._extract_json_candidate(response)
                if candidate:
                    try:
                        context_data = json.loads(candidate)
                        logger.info(f"📋 Extracted context: {context_data}")
                        return context_data
                    except Exception as pe:
                        logger.warning(
                            f"Failed to parse extracted JSON from response text: {pe}"
                        )
                logger.warning(
                    "Failed to parse JSON from response text; returning null-context"
                )
                return {"business_idea": None, "target_customer": None, "problem": None, "industry": None, "location": None}

            except Exception as e:
                logger.error(f"🔴 Context extraction failed: {e}")
                return {"business_idea": None, "target_customer": None, "problem": None, "industry": None, "location": None}

        # Create agent with tools
        agent = Agent(
            model=self.llm_service.get_pydantic_ai_model(),
            system_prompt=get_conversation_routine_prompt(),
            tools=[generate_stakeholder_questions, extract_conversation_context],
        )

        return agent

    async def generate_opening_suggestions(
        self,
        audiences: Optional[List[str]] = None,
        regions: Optional[List[str]] = None,
        industries: Optional[List[str]] = None,
        min_words: int = 14,
        max_words: int = 22,
    ) -> List[str]:
        """Generate 3 natural, comprehensive first-turn suggestions (LLM-rotated), with optional preferences."""
        try:
            # Build preference hints
            pref_lines: List[str] = []
            if industries:
                pref_lines.append(
                    f"- Prioritize these industries when possible: {', '.join(industries)}"
                )
            if regions:
                pref_lines.append(
                    f"- Prefer these regions/markets when possible: {', '.join(regions)}"
                )
            if audiences:
                pref_lines.append(
                    f"- Favor these audiences/roles: {', '.join(audiences)}"
                )

            prefs_block = ("\n" + "\n".join(pref_lines) + "\n") if pref_lines else "\n"

            prompt = f"""
Generate 3 concise, natural one-sentence suggestions for a first-turn business research chat.
Each must be a complete, human-friendly statement that includes: idea/product + target market/location + target customer + problem/pain.
- Do NOT use labels like "Market:", "Customer:", "Problem:".
- Keep {min_words}–{max_words} words each.
- Vary industries and regions across the 3 items.{prefs_block}
Examples:
- Venture studios using AI to speed up discovery in Germany and DACH for venture partners burdened by weeks of manual research
- Research automation for B2B SaaS in the UK and DACH for product teams struggling with stakeholder mapping
- Questionnaire generator for EU fintech founders and PMs to accelerate interview planning

Return ONLY a JSON array of 3 strings.
JSON array:
"""
            response_data = await self.llm_service.analyze(
                text=prompt,
                task="text_generation",
                data={"temperature": 0.0, "max_tokens": 180},
            )

            import re
            import json

            response_text = response_data.get("text", "")
            json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
            if json_match:
                arr = json.loads(json_match.group())
                return [str(x) for x in arr][:3]
        except Exception as e:
            logger.warning(f"Opening suggestions generation failed: {e}")

        # Fallback natural suggestions
        return [
            "Venture studios using AI to speed up discovery in Germany and DACH for venture partners burdened by weeks of manual research",
            "Research automation for B2B SaaS in the UK and DACH for product teams struggling with stakeholder mapping",
            "Questionnaire generator for EU fintech founders and PMs to accelerate interview planning",
        ]

    async def _generate_stakeholder_questions_tool(
        self, business_idea: str, target_customer: str, problem: str
    ) -> Dict[str, Any]:
        """Generate comprehensive stakeholder-based research questions"""
        try:
            # Clear LLM cache to prevent stale questionnaire data
            from backend.services.processing.llm_request_cache import LLMRequestCache

            LLMRequestCache.clear_cache()
            logger.info(
                "🧹 Cleared LLM request cache to prevent stale questionnaire data"
            )

            logger.info(
                f"🎯 Generating stakeholder questions for: {business_idea[:50]}..."
            )

            # Log full business context for debugging
            logger.info("📋 Full business context:")
            logger.info(f"   Business idea: {business_idea}")
            logger.info(f"   Target customer: {target_customer}")
            logger.info(f"   Problem: {problem}")

            # Use existing stakeholder detector with timeout to prevent indefinite hangs
            context_analysis = {
                "business_idea": business_idea,
                "target_customer": target_customer,
                "problem": problem,
            }

            try:
                # Add 120-second timeout to prevent indefinite hangs
                # This allows ~20-30 seconds per LLM call for 3-6 sequential calls
                stakeholder_data = await asyncio.wait_for(
                    self.stakeholder_detector.generate_dynamic_stakeholders_with_unique_questions(
                        self.llm_service,
                        context_analysis=context_analysis,
                        messages=[],  # Empty for now
                        business_idea=business_idea,
                        target_customer=target_customer,
                        problem=problem,
                    ),
                    timeout=120.0,  # 2 minutes timeout
                )
            except asyncio.TimeoutError:
                logger.error("⏱️ Stakeholder generation timed out after 120 seconds")
                return {
                    "error": "Question generation timed out. Please try again with a simpler business description.",
                    "success": False,
                    "primaryStakeholders": [],
                    "secondaryStakeholders": [],
                    "timeEstimate": None,
                }

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
            # Return V3-empty structure to avoid frontend format errors
            return {
                "primaryStakeholders": [],
                "secondaryStakeholders": [],
                "timeEstimate": {"totalQuestions": 0, "estimatedMinutes": 20},
            }

    async def _extract_conversation_context_tool(
        self, messages: List[Dict[str, str]]
    ) -> Dict[str, Any]:
        """Extract business context from conversation history using LLM"""
        try:
            if not messages:
                return {"business_idea": None, "target_customer": None, "problem": None, "industry": None, "location": None}

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
            - industry: Industry/sector explicitly stated or clearly implied from business idea (e.g., "fintech", "healthcare", "venture studios", "b2b saas") (or null)
            - location: Country/city/region mentioned (or null)

            Only extract what is clearly stated. Use null for missing information.
            """

            response_data = await self.llm_service.analyze(
                text=extraction_prompt,
                task="text_generation",
                data={"temperature": 0.1, "max_tokens": 500},
            )
            response = response_data.get("text", "")

            # Parse JSON response with tolerant extraction
            candidate = self._extract_json_candidate(response)
            if candidate:
                try:
                    context_data = json.loads(candidate)
                    logger.info(f"📋 Extracted context: {context_data}")
                    return context_data
                except Exception as pe:
                    logger.warning(
                        f"Failed to parse extracted JSON from response string: {pe}"
                    )
            logger.warning(
                "Failed to parse JSON from response string; returning null-context"
            )
            return {"business_idea": None, "target_customer": None, "problem": None, "industry": None, "location": None}

        except Exception as e:
            logger.error(f"🔴 Context extraction failed: {e}")
            return {"business_idea": None, "target_customer": None, "problem": None, "industry": None, "location": None}

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
                f"🔍 Context extracted: business_idea={context.business_idea}, target_customer={context.target_customer}, problem={context.problem}, location={getattr(context, 'location', None)}"
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

            # Check for user expansion signals early (needed for prompt)
            user_input_lower = request.input.lower().strip()
            expansion_signals = [
                "i need to add more details",
                "let me add more details",
                "i want to add more details",
                "let me add more context",
                "i want to provide more information",
                "actually, let me clarify",
                "there's more to it",
                "let me explain further",
                "i need to add more",
                "let me add more",
                "more details",
                "more context",
                "more information",
                "let me clarify",
                "actually",
            ]

            user_wants_to_expand = any(
                signal in user_input_lower for signal in expansion_signals
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
- User wants to expand: {user_wants_to_expand}

IMPORTANT: If user wants to expand (indicated by phrases like "I need to add more details", "let me clarify", etc.),
DO NOT proceed with validation or question generation. Instead, encourage them to provide more information.

Based on the conversation routine framework and current context, provide your response.
If you determine that questions should be generated, include "GENERATE_QUESTIONS" in your response.
"""

            # Use PydanticAI agent instead of direct LLM call
            try:
                agent_response = await self.agent.run(full_prompt)
                response_content = str(
                    agent_response.output
                )  # Using .output instead of deprecated .data
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
                            generated_questions = (
                                result.output
                            )  # Using .output instead of deprecated .data
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

            # Intercept premature validation prompts from the LLM when required fields are missing
            try:
                rc_lower = (response_content or "").lower()
                missing_target = (
                    not context.target_customer
                    or len(context.target_customer.strip()) < 5
                )
                missing_problem = (
                    not context.problem or len(context.problem.strip()) < 8
                )
                attempted_validation = any(
                    phrase in rc_lower
                    for phrase in [
                        "is this correct",
                        "let me confirm",
                        "does this accurately",
                        "i want to make sure i have this right",
                        "should i proceed",
                    ]
                )
                missing_location = (
                    not getattr(context, "location", None)
                    or not str(getattr(context, "location", "")).strip()
                )
                if (
                    missing_target or missing_problem or missing_location
                ) and attempted_validation:
                    # Decide which field to ask for: target > problem > location
                    ask_for = (
                        "target_customer"
                        if missing_target
                        else ("problem" if missing_problem else "location")
                    )
                    # Ask the LLM to rewrite as ONE concise question for the chosen missing field
                    repair_prompt = f"""
You responded with a validation step before all required fields were present.
Missing fields: {{'target_customer' if missing_target else ''}} {{'problem' if missing_problem else ''}} {{'location' if missing_location else ''}}.
Write EXACTLY ONE short question to elicit the missing field: {ask_for}.
- No preface, no summary, no validation prompts
- 1 sentence, <= 20 words
Current business idea (if any): {context.business_idea or 'N/A'}
Question:
"""
                    repair = await self.llm_service.analyze(
                        text=repair_prompt,
                        task="text_generation",
                        data={"temperature": 0.2, "max_tokens": 60},
                    )
                    response_content = (
                        (repair.get("text", "") or "").strip().split("\n")[0]
                    )
            except Exception:
                pass

            # Check for validation confirmation signals (user_input_lower and user_wants_to_expand already defined above)
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

            is_validation_confirmation = (
                any(
                    confirmation in user_input_lower
                    for confirmation in validation_confirmations
                )
                and not user_wants_to_expand
            )  # Don't confirm if user wants to expand

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

            # Check if we should generate questions - ONLY with explicit user confirmation
            # 1. User explicitly asks for questions
            user_wants_questions = any(
                phrase in request.input.lower()
                for phrase in [
                    "generate questionnaire",
                    "generate questions",
                    "create questions",
                    "start research",
                ]
            )

            # 2. User confirms validation and context is ready (explicit confirmation required)
            should_auto_generate = (
                is_validation_confirmation
                and context.should_transition_to_questions()
                and not user_wants_to_expand
                and bool(getattr(context, "location", None))
            )

            logger.info(
                f"🔍 Question generation check: user_wants_questions={user_wants_questions}, should_auto_generate={should_auto_generate}, is_validation_confirmation={is_validation_confirmation}, questions_generated={questions_generated}"
            )

            # Also check if the response content indicates questions were generated
            response_has_questions = (
                "Here are comprehensive research questions" in response_content
            )

            # Check if we should generate questions - ONLY with explicit user signals
            if (
                user_wants_questions or should_auto_generate or response_has_questions
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

                    # Validate V3 Enhanced format to avoid frontend processing errors
                    if not (
                        isinstance(generated_questions, dict)
                        and (
                            "primaryStakeholders" in generated_questions
                            or "secondaryStakeholders" in generated_questions
                        )
                    ):
                        logger.warning(
                            "❌ Generated questions not in V3 Enhanced format; suppressing questions to avoid frontend error"
                        )
                        generated_questions = None

                    # Suppress empty questionnaires (0 stakeholders or 0 total questions)
                    if isinstance(generated_questions, dict):
                        total_q = generated_questions.get("timeEstimate", {}).get(
                            "totalQuestions", 0
                        )
                        prim_len = len(
                            generated_questions.get("primaryStakeholders", []) or []
                        )
                        sec_len = len(
                            generated_questions.get("secondaryStakeholders", []) or []
                        )
                        if (prim_len + sec_len) == 0 or total_q == 0:
                            logger.warning(
                                "⚠️ Empty questionnaire generated; treating as not generated"
                            )
                            generated_questions = None
                            questions_generated = False
                else:
                    logger.warning(
                        f"❌ Missing required context - business_idea: {bool(extracted_context.get('business_idea'))}, target_customer: {bool(extracted_context.get('target_customer'))}, problem: {bool(extracted_context.get('problem'))}"
                    )

                # Update response message based on generation trigger - ONLY for explicit user confirmation
                if is_validation_confirmation and generated_questions:
                    response_content = "Perfect! I've generated your custom research questions based on our conversation."
                elif is_validation_confirmation and not generated_questions:
                    # Generate ONE concise follow-up question for the most critical missing field (prefer target customer)
                    missing_target = (
                        not context.target_customer
                        or len(context.target_customer.strip()) < 5
                    )
                    missing_problem = (
                        not context.problem or len(context.problem.strip()) < 8
                    )
                    missing_location = (
                        not getattr(context, "location", None)
                        or not str(getattr(context, "location", "")).strip()
                    )
                    try:
                        # Decide which field to ask for: target > problem > location
                        ask_for = (
                            "target_customer"
                            if missing_target
                            else ("problem" if missing_problem else "location")
                        )
                        followup_prompt = f"""
Write EXACTLY ONE short question to collect the missing field: {ask_for}.
Missing fields: {{'target_customer' if missing_target else ''}} {{'problem' if missing_problem else ''}} {{'location' if missing_location else ''}}.
Rules:
- Prefer target customer if missing
- No preface or summary
- 1 sentence, <= 20 words
Business idea: {context.business_idea or 'N/A'}
Question:
"""
                        fu = await self.llm_service.analyze(
                            text=followup_prompt,
                            task="text_generation",
                            data={"temperature": 0.2, "max_tokens": 60},
                        )
                        response_content = (
                            (fu.get("text", "") or "").strip().split("\n")[0]
                        )
                    except Exception:
                        # Minimal non-canned fallback
                        if missing_target:
                            response_content = "Who specifically is your target customer? If you can, also add their main problem."
                        elif missing_problem:
                            response_content = (
                                "What specific problem does your target customer face?"
                            )
                        else:
                            response_content = "What is your initial target location/market (country, city or region)?"
                elif user_wants_questions and generated_questions:
                    response_content = "Here are your custom research questions based on our conversation."
                elif user_wants_questions and not generated_questions:
                    # Ask concise targeted follow-up instead of generic message
                    response_content = "Who specifically is your target customer?"
                elif should_force_generation and generated_questions:
                    response_content = "I have enough context about your business idea. Let me generate targeted research questions to help validate this solution."
                elif should_force_generation and not generated_questions:
                    response_content = "Based on our conversation, I'll generate research questions for your solution."

            # Update context
            context.exchange_count += 1

            # Generate suggestions based on context
            suggestions = await self._generate_suggestions(
                context,
                response_content,
                conversation_history,
                user_wants_to_expand,
                questions_generated,
            )
            logger.info(f"🎯 Generated suggestions: {suggestions}")

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
                    "full_prompt": full_prompt,
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
        self,
        context: ConversationContext,
        response_content: str,
        conversation_history: List[Dict[str, str]],
        user_wants_to_expand: bool = False,
        has_questions: bool = False,
    ) -> List[str]:
        """Generate contextual quick reply suggestions"""

        # Align suggestions with the assistant's immediate question when applicable
        rc_lower = (response_content or "").lower()
        try:
            # If assistant explicitly asked for target customer, offer target-customer suggestions
            if any(
                kw in rc_lower
                for kw in [
                    "target customer",
                    "who is your target customer",
                    "who specifically is your target customer",
                ]
            ):
                return await self._generate_expansion_suggestions(
                    context, conversation_history
                )

            # If assistant asked about the problem, suggest problem-expansion responses
            if any(
                kw in rc_lower
                for kw in [
                    "what specific problem",
                    "what problem does",
                    "the main problem",
                    "what is the main problem",
                ]
            ):
                return await self._generate_expansion_suggestions(
                    context, conversation_history
                )

            # If assistant asked for location/market, nudge with location presets
            if any(
                kw in rc_lower
                for kw in [
                    "target location",
                    "target market",
                    "which country",
                    "which city",
                    "location/market",
                    "location (country",
                    "market (country",
                    "what is your initial target location",
                ]
            ):
                return [
                    "Venture studios using AI to speed up discovery in Germany and DACH for venture partners burdened by weeks of manual research",
                    "Research automation for B2B SaaS in the UK and DACH for product teams struggling with stakeholder mapping",
                    "Questionnaire generator for EU fintech founders and PMs to accelerate interview planning",
                ]
        except Exception:
            pass

        # If questions were generated, show completion suggestions (robust to phrasing)
        if has_questions:
            return ["Export questions", "Start research", "Modify questions"]

        # If user wants to expand, generate expansion-focused suggestions
        if user_wants_to_expand:
            logger.info("🎯 User wants to expand - generating expansion suggestions")
            return await self._generate_expansion_suggestions(
                context, conversation_history
            )

        # If ready for questions and user is NOT expanding, show validation suggestions
        # BUT if location is missing, nudge for location instead of validation
        if context.should_transition_to_questions():
            missing_location = (
                not getattr(context, "location", None)
                or not str(getattr(context, "location", "")).strip()
            )
            if missing_location:
                return [
                    "Location: Germany",
                    "Market: DACH region",
                    "City: Berlin",
                ]
            return [
                "Yes, that's correct",
                "Let me add more details",
                "Actually, let me clarify",
            ]

        # Generate contextual suggestions using LLM
        suggestions = await self._generate_contextual_suggestions(
            context, conversation_history
        )
        return suggestions[:3]  # Limit to 3 suggestions

    async def _generate_expansion_suggestions(
        self, context: ConversationContext, conversation_history: List[Dict[str, str]]
    ) -> List[str]:
        """Generate contextual user response suggestions to help expand their answer"""
        logger.info("🔍 Generating expansion suggestions based on current context")

        try:
            # Get recent conversation context for better suggestions
            recent_messages = conversation_history[-4:] if conversation_history else []
            conversation_context = " ".join(
                [msg.get("content", "") for msg in recent_messages]
            )

            # Determine what aspect needs expansion based on current context
            if context.business_idea and context.target_customer and context.problem:
                # All core info provided, help expand on business details
                prompt = f"""
Generate 3 specific user responses that would help expand on this business context:

Business: {context.business_idea}
Customer: {context.target_customer}
Problem: {context.problem}
Recent conversation: {conversation_context}

Generate responses the USER could say to add more valuable details. Focus on business model, location, pricing, competition, or operational details.

Examples for a laundromat business:
- "It will be a subscription-based model"
- "We'll focus on premium locations near apartments"
- "Current competitors charge too much"

Return only a JSON array of 3 strings, each 4-8 words max. Make them specific user responses, not questions.

JSON array:"""

            elif (
                context.business_idea
                and context.target_customer
                and not context.problem
            ):
                # User has business + customer, help expand on the problem
                # Make suggestions more actionable by prefixing with action verbs
                prompt = f"""
Generate 3 specific user responses that would help expand on the problem for this business and customer:

Business: {context.business_idea}
Customer: {context.target_customer}
Recent conversation: {conversation_context}

Generate responses the USER could say to describe specific problems their customers face. Focus on pain points, frustrations, or unmet needs.

IMPORTANT: Start each response with an action phrase to make it clear these are clickable options:
- "They struggle with..."
- "They face..."
- "They need help with..."
- "The main problem is..."

Examples for laundromat + grannies:
- "They struggle with the 20-minute drive"
- "They face physical difficulty doing laundry"
- "They lack in-home washing machines"

Return only a JSON array of 3 strings, each 5-10 words max. Make them specific user responses about problems that start with action phrases.

JSON array:"""

            elif context.business_idea and not context.target_customer:
                # User has business idea, help expand on target customer
                # Make suggestions more actionable
                prompt = f"""
Generate 3 specific user responses that would help expand on the target customer for this business:

Business: {context.business_idea}
Recent conversation: {conversation_context}

Generate responses the USER could say to describe their target customers more specifically. Focus on demographics, location, behavior, or specific segments.

IMPORTANT: Start each response with "It's for..." or "Targeting..." to make it clear these are clickable options.

Examples for a laundromat business:
- "It's for busy professionals without time"
- "Targeting students in university dormitories"
- "It's for elderly people with mobility issues"

Return only a JSON array of 3 strings, each 5-10 words max. Make them specific user responses about customers that start with action phrases.

JSON array:"""

            else:
                # General expansion based on conversation context
                # Make suggestions more actionable
                prompt = f"""
Generate 3 specific user responses that would help expand on this business idea:

Business: {context.business_idea or "Not specified"}
Recent conversation: {conversation_context}

Generate responses the USER could say to provide more valuable business details. Focus on what's missing or could be elaborated.

IMPORTANT: Start each response with action phrases like "It targets...", "The problem is...", "We'll use..." to make it clear these are clickable options.

Examples:
- "It targets small business owners"
- "The main problem is high costs"
- "We'll use a mobile app approach"

Return only a JSON array of 3 strings, each 5-10 words max. Make them specific user responses with action phrases.

JSON array:"""

            response_data = await self.llm_service.analyze(
                text=prompt,
                task="text_generation",
                data={"temperature": 0.3, "max_tokens": 150},
            )

            import json
            import re

            response_text = response_data.get("text", "")
            json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
            if json_match:
                suggestions = json.loads(json_match.group())
                logger.info(f"✅ Generated expansion suggestions: {suggestions}")
                return suggestions[:3]

        except Exception as e:
            logger.warning(f"Failed to generate expansion suggestions: {e}")

        # Fallback expansion suggestions - still user responses, not questions
        return [
            "The business model is subscription-based",
            "We target local neighborhoods",
            "The main challenge is competition",
        ]

    async def _generate_contextual_suggestions(
        self, context: ConversationContext, conversation_history: List[Dict[str, str]]
    ) -> List[str]:
        """Generate contextual quick reply suggestions based on conversation state"""
        logger.info(
            f"🔍 Generating contextual suggestions - business_idea: '{context.business_idea}', target_customer: '{context.target_customer}', problem: '{context.problem}', location: '{getattr(context, 'location', None)}'"
        )
        try:
            # Always generate LLM-based contextual suggestions
            if not context.business_idea:
                logger.info(
                    "🎯 No business_idea detected, generating business type suggestions"
                )
                # Generate business type suggestions based on conversation history
                recent_messages = (
                    conversation_history[-3:] if conversation_history else []
                )
                conversation_context = " ".join(
                    [msg.get("content", "") for msg in recent_messages]
                )

                prompt = f"""
Generate 3 specific business type suggestions based on this conversation context: "{conversation_context}"

Focus on specific business solutions, not generic categories. Be descriptive about what the business actually does.

Examples of GOOD specific suggestions:
- Instead of "Mobile app": ["Food delivery app", "Fitness tracking app", "Language learning app"]
- Instead of "Service business": ["Home cleaning service", "Pet grooming service", "Tutoring service"]
- Instead of "Physical product": ["Smart home device", "Eco-friendly packaging", "Fitness equipment"]

Return only a JSON array of 3 strings, each 3-6 words max. Be specific about the business solution.

Context: {conversation_context}
JSON array:"""

                response_data = await self.llm_service.analyze(
                    text=prompt,
                    task="text_generation",
                    data={"temperature": 0, "max_tokens": 150},
                )

                import json
                import re

                response_text = response_data.get("text", "")
                json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
                if json_match:
                    suggestions = json.loads(json_match.group())
                    logger.info(
                        f"✅ Generated business type suggestions: {suggestions}"
                    )
                    return suggestions[:3]

            elif not context.target_customer:
                logger.info(
                    "🎯 Business idea exists, no target customer, generating customer suggestions"
                )
                # Generate contextual customer suggestions based on business idea
                prompt = f"""
Generate 3 highly specific target customer suggestions for this business: "{context.business_idea}"

Focus on WHO specifically would need this solution. Be very specific about the customer segment, not generic categories.

Examples of GOOD specific suggestions:
- For laundry service: ["People without in-home laundry", "Small businesses needing commercial laundry", "Students in dorms"]
- For food delivery: ["Busy office workers during lunch", "Parents with young children", "Elderly people with mobility issues"]
- For fitness app: ["Beginners starting their fitness journey", "Busy professionals with limited time", "People recovering from injuries"]

Return only a JSON array of 3 strings, each 4-8 words max. Be specific about the customer's situation or need.

Business: {context.business_idea}
JSON array:"""

                response_data = await self.llm_service.analyze(
                    text=prompt,
                    task="text_generation",
                    data={"temperature": 0.3, "max_tokens": 150},
                )

                import json
                import re

                response_text = response_data.get("text", "")
                json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
                if json_match:
                    suggestions = json.loads(json_match.group())
                    logger.info(f"✅ Generated customer suggestions: {suggestions}")
                    return suggestions[:3]

            elif not context.problem:
                logger.info(
                    "🎯 Business idea and customer exist, no problem, generating problem suggestions"
                )
                # Generate contextual problem suggestions based on business + customer
                prompt = f"""
Generate 3 specific problem statements for this business and customer:

Business: {context.business_idea}
Target Customer: {context.target_customer}

Focus on specific pain points that this customer segment experiences. Each problem should be:
- Clear and specific to the target customer
- Actionable and researchable
- 5-12 words long (not too short, not too long)
- Focused on real pain points

Examples of GOOD specific problems:
- For laundry service + busy professionals: ["No time for weekly laundry tasks", "High costs of professional dry cleaning", "Limited access to convenient laundromats"]
- For food delivery + college students: ["Limited healthy food options on campus", "Expensive campus dining meal plans", "No time to cook nutritious meals"]
- For fitness app + beginners: ["Don't know where to start exercising", "Feel intimidated by gym environments", "Lack personalized fitness guidance"]

Return ONLY a valid JSON array of 3 strings. Each string should be 5-12 words describing a specific problem.

JSON array:"""
                response_data = await self.llm_service.analyze(
                    text=prompt,
                    task="text_generation",
                    data={
                        "temperature": 0.3,
                        "max_tokens": 200,
                    },  # Increased for longer problems
                )

                import json
                import re

                response_text = response_data.get("text", "")
                logger.info(f"🔍 Problem suggestions raw response: {response_text}")

                # Try multiple JSON extraction methods
                suggestions = []

                # Method 1: Direct JSON array extraction
                json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
                if json_match:
                    try:
                        suggestions = json.loads(json_match.group())
                        logger.info(
                            f"✅ Generated problem suggestions (method 1): {suggestions}"
                        )
                    except json.JSONDecodeError as e:
                        logger.warning(f"⚠️ JSON parsing failed (method 1): {e}")

                # Method 2: Extract from markdown code blocks
                if not suggestions:
                    code_block_match = re.search(
                        r"```(?:json)?\s*(\[.*?\])\s*```", response_text, re.DOTALL
                    )
                    if code_block_match:
                        try:
                            suggestions = json.loads(code_block_match.group(1))
                            logger.info(
                                f"✅ Generated problem suggestions (method 2): {suggestions}"
                            )
                        except json.JSONDecodeError as e:
                            logger.warning(f"⚠️ JSON parsing failed (method 2): {e}")

                # Method 3: Fallback to manual extraction
                if not suggestions:
                    logger.warning(
                        "⚠️ JSON extraction failed, using fallback problem suggestions"
                    )
                    suggestions = [
                        f"Challenges with {context.target_customer} needs",
                        f"Pain points in {context.business_idea} area",
                        f"Problems {context.target_customer} currently face",
                    ]

                return suggestions[:3]

            elif (
                context.business_idea
                and context.target_customer
                and context.problem
                and not getattr(context, "location", None)
            ):
                logger.info(
                    "🎯 All core info present, no location, generating location suggestions"
                )
                prompt = """
Generate 3 short location/market options relevant to this business and customer.
Format them as short user responses (2-5 words), like examples:
- "Location: Germany"
- "Market: DACH region"
- "City: Berlin"

Return ONLY a JSON array of 3 strings.
JSON array:"""
                response_data = await self.llm_service.analyze(
                    text=prompt,
                    task="text_generation",
                    data={"temperature": 0.2, "max_tokens": 120},
                )
                import json
                import re

                response_text = response_data.get("text", "")
                json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
                if json_match:
                    try:
                        suggestions = json.loads(json_match.group())
                        return suggestions[:3]
                    except json.JSONDecodeError:
                        pass
                return ["Location: Germany", "Market: DACH region", "City: Berlin"]

                response_text = response_data.get("text", "")
                logger.info(f"🔍 Problem suggestions raw response: {response_text}")

                # Try multiple JSON extraction methods
                suggestions = []

                # Method 1: Direct JSON array extraction
                json_match = re.search(r"\[.*?\]", response_text, re.DOTALL)
                if json_match:
                    try:
                        suggestions = json.loads(json_match.group())
                        logger.info(
                            f"✅ Generated problem suggestions (method 1): {suggestions}"
                        )
                    except json.JSONDecodeError as e:
                        logger.warning(f"⚠️ JSON parsing failed (method 1): {e}")

                # Method 2: Extract from markdown code blocks
                if not suggestions:
                    code_block_match = re.search(
                        r"```(?:json)?\s*(\[.*?\])\s*```", response_text, re.DOTALL
                    )
                    if code_block_match:
                        try:
                            suggestions = json.loads(code_block_match.group(1))
                            logger.info(
                                f"✅ Generated problem suggestions (method 2): {suggestions}"
                            )
                        except json.JSONDecodeError as e:
                            logger.warning(f"⚠️ JSON parsing failed (method 2): {e}")

                # Method 3: Fallback to manual extraction
                if not suggestions:
                    logger.warning(
                        "⚠️ JSON extraction failed, using fallback problem suggestions"
                    )
                    suggestions = [
                        f"Challenges with {context.target_customer} needs",
                        f"Pain points in {context.business_idea} area",
                        f"Problems {context.target_customer} currently face",
                    ]

                return suggestions[:3]

            else:
                # All context gathered - validation stage suggestions
                logger.info("🎯 All context gathered, returning validation suggestions")
                return [
                    "Yes, that's correct",
                    "Let me add more context",
                    "Actually, let me clarify",
                ]

        except Exception as e:
            logger.warning(f"Failed to generate contextual suggestions: {e}")

        # Fallback to LLM-generated generic suggestions
        logger.info("🔄 Using fallback LLM suggestions")
        try:
            if not context.business_idea:
                fallback_prompt = """
Generate 3 short, generic business type suggestions for someone starting a business.

Return only a JSON array of 3 strings, each 2-4 words max. Examples:
["Mobile app", "Service business", "Physical product"]

JSON array:"""
            elif not context.target_customer:
                fallback_prompt = f"""
Generate 3 short, generic target customer suggestions for this business: "{context.business_idea}"

Return only a JSON array of 3 strings, each 2-4 words max. Examples:
["Businesses", "Consumers", "Professionals"]

JSON array:"""
            elif not context.problem:
                fallback_prompt = f"""
Generate 3 short, generic problem suggestions for this business and customer:
Business: {context.business_idea}
Customer: {context.target_customer}

Return only a JSON array of 3 strings, each 2-4 words max. Examples:
["Time consuming", "Too expensive", "Too complex"]

JSON array:"""
            else:
                return [
                    "Yes, that's correct",
                    "Let me add more",
                    "Actually, let me clarify",
                ]

            response_data = await self.llm_service.analyze(
                text=fallback_prompt,
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

        except Exception as e:
            logger.warning(f"Failed to generate fallback suggestions: {e}")

        # Final hardcoded fallback if LLM fails
        if not context.business_idea:
            return ["Mobile app", "Service business", "Physical product"]
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
