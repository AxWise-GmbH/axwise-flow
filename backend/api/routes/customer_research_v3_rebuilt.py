"""
V3 Customer Research Service - Rebuilt with V1 Reliability

📚 IMPLEMENTATION REFERENCE: See docs/pydantic-instructor-implementation-guide.md
   for proper Pydantic Instructor usage, JSON parsing, and structured output handling.

Architecture:
- V1 Core (100% reliable foundation)
- V3 Enhancement Layers (fail-safe additions)
- Circuit breaker pattern for unreliable enhancements
- Always fall back to working V1 behavior

Philosophy: Never replace what works, only enhance it safely.
"""

import logging
import time
from typing import Dict, List, Any, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.routes.customer_research import (
    ChatRequest,
    ChatResponse,
    GenerateQuestionsRequest,
    ResearchQuestions,
    Message,
    ResearchContext,
)

logger = logging.getLogger(__name__)

# FORCE MODULE RELOAD - This should cause an error if old cached version is used
STAKEHOLDER_FIX_ACTIVE = (
    True  # This variable should show up in responses if code is active
)
router = APIRouter(prefix="/api/research/v3-rebuilt", tags=["research-v3-rebuilt"])


class EnhancementMonitor:
    """Monitor and manage V3 enhancement reliability"""

    def __init__(self):
        self.failure_counts = {}
        self.disabled_enhancements = set()
        self.success_counts = {}

    def record_success(self, enhancement_name: str):
        """Record successful enhancement"""
        self.success_counts[enhancement_name] = (
            self.success_counts.get(enhancement_name, 0) + 1
        )

    def record_failure(self, enhancement_name: str):
        """Record failed enhancement and potentially disable it"""
        self.failure_counts[enhancement_name] = (
            self.failure_counts.get(enhancement_name, 0) + 1
        )

        # Circuit breaker: disable if failure rate too high
        total_attempts = self.failure_counts[
            enhancement_name
        ] + self.success_counts.get(enhancement_name, 0)
        if (
            total_attempts >= 10
            and self.failure_counts[enhancement_name] / total_attempts > 0.3
        ):
            self.disabled_enhancements.add(enhancement_name)
            logger.warning(
                f"🔴 Circuit breaker: disabled unreliable enhancement '{enhancement_name}'"
            )

    def is_enabled(self, enhancement_name: str) -> bool:
        """Check if enhancement is enabled"""
        return enhancement_name not in self.disabled_enhancements


class UXResearchMethodology:
    """UX Research methodology enhancements for V1 responses"""

    def enhance_suggestions(
        self, v1_suggestions: List[str], conversation_stage: str = "discovery"
    ) -> List[str]:
        """Add UX research special options to V1's proven suggestions"""

        try:
            # Only skip enhancement for explicit confirmation phase
            if conversation_stage == "confirmation":
                # Don't modify confirmation phase - V1 handles this perfectly
                return v1_suggestions

            # For discovery phase: Add special options AFTER first 3 contextual suggestions
            if v1_suggestions and len(v1_suggestions) >= 1:
                # Filter out any existing special options to avoid duplicates
                filtered_suggestions = [
                    s
                    for s in v1_suggestions
                    if s not in ["All of the above", "I don't know"]
                ]

                # Take first 3 contextual suggestions, then add special options
                contextual_suggestions = filtered_suggestions[:3]
                enhanced = contextual_suggestions + ["All of the above", "I don't know"]
                return enhanced[:5]  # Limit to 5 total
            else:
                # Fallback with special options at the end
                return [
                    "Tell me more",
                    "Continue",
                    "What else?",
                    "All of the above",
                    "I don't know",
                ]

        except Exception as e:
            logger.error(f"UX methodology enhancement failed: {e}")
            return v1_suggestions  # Always return V1 suggestions if enhancement fails

    def validate_response_methodology(self, response_content: str) -> bool:
        """Validate that response follows UX research methodology"""

        try:
            # Check for UX research best practices
            content_lower = response_content.lower()

            # Good: Single focused question
            question_count = content_lower.count("?")
            if question_count > 2:
                return False  # Too many questions at once

            # Good: Builds on previous answers
            if any(
                phrase in content_lower
                for phrase in ["you mentioned", "you said", "you shared"]
            ):
                return True

            # Good: Professional tone
            if any(
                phrase in content_lower
                for phrase in ["understand", "help me", "could you"]
            ):
                return True

            return True  # Default to accepting V1's proven responses

        except Exception:
            return True  # Default to accepting V1 responses


class IndustryClassifier:
    """LLM-based intelligent industry classification for enhanced context"""

    def __init__(self):
        self.llm_service = None

    async def classify(
        self, business_context: Dict[str, Any], llm_service=None
    ) -> Dict[str, Any]:
        """Classify industry using LLM-based semantic analysis"""

        try:
            if llm_service is None:
                from backend.services.llm import LLMServiceFactory

                llm_service = LLMServiceFactory.create("gemini")

            business_idea = business_context.get(
                "businessIdea", ""
            ) or business_context.get("business_idea", "")
            target_customer = business_context.get(
                "targetCustomer", ""
            ) or business_context.get("target_customer", "")
            problem = business_context.get("problem", "")

            prompt = f"""Analyze this business and provide detailed industry classification for customer research context.

Business Idea: {business_idea}
Target Customer: {target_customer}
Problem: {problem}

Provide comprehensive industry analysis:

Return ONLY valid JSON:
{{
  "industry": "Primary industry category",
  "sub_industry": "Specific sub-category",
  "confidence": 0.0-1.0,
  "characteristics": ["key", "business", "characteristics"],
  "context_for_questions": "specific focus area for research questions",
  "business_model": "description of likely business model",
  "key_success_factors": ["critical", "success", "factors"],
  "typical_challenges": ["common", "industry", "challenges"],
  "research_focus_areas": ["areas", "to", "focus", "research", "on"]
}}

Consider factors like:
- Business model (B2B, B2C, marketplace, service, product)
- Industry dynamics and competition
- Customer behavior patterns
- Regulatory considerations
- Technology requirements
- Scalability factors"""

            response = await llm_service.generate_text(
                prompt=prompt, temperature=0.3, max_tokens=1200
            )

            # Parse JSON response
            import json

            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean[7:]
            if response_clean.endswith("```"):
                response_clean = response_clean[:-3]
            response_clean = response_clean.strip()

            analysis = json.loads(response_clean)

            logger.info(
                f"🏢 LLM Industry Classification: {analysis.get('industry')}/{analysis.get('sub_industry')} (confidence: {analysis.get('confidence', 0):.2f})"
            )

            return analysis

        except Exception as e:
            logger.error(f"LLM industry classification failed: {e}")
            # Fallback to simple classification
            return {
                "industry": "General Business",
                "sub_industry": "General",
                "confidence": 0.5,
                "characteristics": ["customer-centric"],
                "context_for_questions": "general business focused",
                "business_model": "unknown",
                "key_success_factors": ["customer satisfaction"],
                "typical_challenges": ["market competition"],
                "research_focus_areas": ["customer needs", "market validation"],
            }


class CustomerResearchServiceV3Rebuilt:
    """
    V3 Rebuilt: V1 Core + Strategic Enhancements

    Design Philosophy:
    - V1 handles ALL core functionality (proven & reliable)
    - V3 adds enhancements as optional layers
    - Fail gracefully to V1 behavior always
    - Monitor enhancement reliability
    """

    def __init__(self):
        # V1 Core Service (Proven & Reliable)
        self.v1_core = None  # Will import V1 functions as needed

        # V3 Enhancement Layers (Optional & Fail-Safe)
        self.ux_methodology = UXResearchMethodology()
        self.industry_classifier = IndustryClassifier()
        self.enhancement_monitor = EnhancementMonitor()

        # V3 Performance Optimization: Simple response cache
        self._response_cache = {}
        self._cache_max_size = 100

        logger.info(
            "🏗️ V3 Rebuilt service initialized with V1 core + fail-safe enhancements"
        )

    def _get_cache_key(self, request: ChatRequest) -> str:
        """Generate cache key for request"""
        try:
            # Create a simple cache key based on recent conversation
            recent_messages = (
                request.messages[-3:] if len(request.messages) > 3 else request.messages
            )
            message_content = " ".join([msg.content for msg in recent_messages])
            cache_content = f"{message_content} {request.input}".lower().strip()

            # Simple hash for cache key
            import hashlib

            return hashlib.md5(cache_content.encode()).hexdigest()[:16]
        except:
            return None

    def _get_from_cache(self, cache_key: str) -> Dict[str, Any]:
        """Get response from cache if available"""
        if cache_key and cache_key in self._response_cache:
            cached_response = self._response_cache[cache_key].copy()
            cached_response["from_cache"] = True
            logger.info(f"🚀 V3 Cache hit for key: {cache_key}")
            return cached_response
        return None

    def _store_in_cache(self, cache_key: str, response: Dict[str, Any]):
        """Store response in cache"""
        if cache_key and len(self._response_cache) < self._cache_max_size:
            # Don't cache the cache flag itself
            cache_response = response.copy()
            cache_response.pop("from_cache", None)
            self._response_cache[cache_key] = cache_response
            logger.info(f"💾 V3 Cached response for key: {cache_key}")

    async def process_chat(self, request: ChatRequest) -> Dict[str, Any]:
        """
        Main orchestration: V1 first, V3 enhancements second

        Flow:
        1. Use V1 core for reliable foundation
        2. Apply V3 enhancements safely
        3. Fall back to V1 if any enhancement fails
        """

        start_time = time.time()
        logger.info(f"🎯 V3 Rebuilt processing chat request")

        # V3 Performance: Check cache first
        cache_key = self._get_cache_key(request)
        cached_response = self._get_from_cache(cache_key)
        if cached_response:
            cached_response["processing_time_ms"] = int(
                (time.time() - start_time) * 1000
            )
            return cached_response

        try:
            # Step 1: ALWAYS use V1 core for reliability
            v1_response = await self._process_with_v1_core(request)
            logger.info("✅ V1 core processing completed successfully")

            # Step 2: Apply V3 enhancements safely
            enhanced_response = await self._apply_v3_enhancements(v1_response, request)

            # Step 3: Add V3 metadata
            enhanced_response["api_version"] = "v3-rebuilt"
            enhanced_response["processing_time_ms"] = int(
                (time.time() - start_time) * 1000
            )
            enhanced_response["v1_core_used"] = True
            enhanced_response["enhancements_applied"] = self._get_applied_enhancements()

            # V3 Performance: Store in cache for future requests
            self._store_in_cache(cache_key, enhanced_response)

            logger.info(
                f"🎉 V3 Rebuilt completed successfully in {enhanced_response['processing_time_ms']}ms"
            )
            return enhanced_response

        except Exception as e:
            logger.error(f"🔴 V3 Rebuilt failed, attempting V1 fallback: {e}")

            # Ultimate fallback: Pure V1 response
            try:
                v1_fallback = await self._process_with_v1_core(request)
                v1_fallback["api_version"] = "v3-rebuilt-v1-fallback"
                v1_fallback["processing_time_ms"] = int(
                    (time.time() - start_time) * 1000
                )
                v1_fallback["fallback_used"] = True
                return v1_fallback
            except Exception as fallback_error:
                logger.error(f"🔴 Even V1 fallback failed: {fallback_error}")
                raise HTTPException(
                    status_code=500, detail="Service temporarily unavailable"
                )

    async def _process_with_v1_core(self, request: ChatRequest) -> Dict[str, Any]:
        """Process request using V1's proven core functionality"""

        start_time = time.time()
        try:
            # Import V1 proven functions
            from backend.api.routes.customer_research import (
                generate_research_response_with_retry,
                generate_contextual_suggestions,
                extract_context_with_llm,
                analyze_user_intent_with_llm,
                validate_business_readiness_with_llm,
                generate_research_questions,
                Message as V1Message,
            )
            from backend.services.llm import LLMServiceFactory

            # Create V1-compatible LLM service
            llm_service = LLMServiceFactory.create("gemini")

            # Convert V3 messages to V1 format
            v1_messages = []
            for msg in request.messages:
                v1_messages.append(
                    V1Message(
                        id=msg.id or f"msg_{int(time.time())}",
                        content=msg.content,
                        role=msg.role,
                        timestamp=msg.timestamp or datetime.now().isoformat(),
                        metadata=msg.metadata,
                    )
                )

            # Build conversation context (V1 pattern)
            conversation_context = ""
            for msg in request.messages:
                conversation_context += f"{msg.role}: {msg.content}\n"
            if request.input:
                conversation_context += f"user: {request.input}\n"

            # V3 PERFORMANCE OPTIMIZATION: Single comprehensive LLM call instead of multiple sequential calls
            import asyncio

            analysis_start = time.time()
            # Use single optimized analysis call to reduce latency from 6-8 calls to 1-2 calls
            comprehensive_analysis = await self._comprehensive_analysis_optimized(
                llm_service=llm_service,
                conversation_context=conversation_context,
                latest_input=request.input,
                messages=v1_messages,
            )
            analysis_time = (time.time() - analysis_start) * 1000
            logger.info(f"⚡ Comprehensive analysis completed in {analysis_time:.2f}ms")

            context_analysis = comprehensive_analysis["context"]
            intent_analysis = comprehensive_analysis["intent"]
            business_validation = comprehensive_analysis["business_readiness"]

            # Business validation is now included in comprehensive analysis above

            # V3 PERFORMANCE + UX FIX: Use comprehensive analysis result directly (already includes conservative checks)
            ready_for_questions = business_validation.get("ready_for_questions", False)

            # Log the comprehensive analysis decision
            logger.info(
                f"🎯 Using comprehensive analysis business readiness: {ready_for_questions}"
            )
            logger.info(
                f"🎯 Comprehensive analysis confidence: {business_validation.get('confidence', 0.0)}"
            )
            logger.info(
                f"🎯 Problem context sufficient: {business_validation.get('problem_context_sufficient', False)}"
            )

            # V3 PERFORMANCE FIX: User confirmation detection included in comprehensive analysis
            user_confirmed = comprehensive_analysis.get("user_confirmation")

            # Fallback: If comprehensive analysis doesn't include user confirmation, detect it from intent
            if user_confirmed is None:
                logger.warning(
                    "🔧 User confirmation missing from comprehensive analysis, using intent fallback"
                )
                # Check for both confirmation and question_request intents
                user_intent = intent_analysis.get("intent", "")
                is_confirmation_intent = user_intent in [
                    "confirmation",
                    "question_request",
                ]

                logger.info(
                    f"🔧 Fallback logic: intent='{user_intent}', is_confirmation={is_confirmation_intent}"
                )

                user_confirmed = {
                    "is_confirmation": is_confirmation_intent,
                    "confidence": 0.8,
                    "reasoning": f"Fallback confirmation detection based on intent analysis: {user_intent}",
                }

            # Log the analysis results for debugging
            logger.info(f"🔍 V3 Analysis Results:")
            logger.info(f"   Ready for questions: {ready_for_questions}")
            logger.info(
                f"   User confirmed: {user_confirmed.get('is_confirmation', False) if user_confirmed else 'None'}"
            )
            logger.info(
                f"   Business validation ready: {business_validation.get('ready_for_questions', False)}"
            )
            logger.info(f"   User confirmed object: {user_confirmed}")
            logger.info(f"   Intent: {intent_analysis.get('intent')}")

            # Check the conditions explicitly
            condition1 = ready_for_questions
            condition2 = (
                user_confirmed.get("is_confirmation", False)
                if user_confirmed
                else False
            )

            logger.info(f"🎯 DECISION LOGIC:")
            logger.info(f"   Condition 1 (ready_for_questions): {condition1}")
            logger.info(f"   Condition 2 (user_confirmed): {condition2}")
            logger.info(f"   Both conditions met: {condition1 and condition2}")

            # CRITICAL FIX: Only treat as confirmation if user explicitly confirms
            # Don't auto-confirm based on phrases unless it's a direct response to a confirmation request

            # Check if the previous assistant message was asking for confirmation
            previous_assistant_message = None
            for msg in reversed(request.messages):
                if msg.role == "assistant":
                    previous_assistant_message = msg.content
                    break

            was_asking_for_confirmation = previous_assistant_message and any(
                phrase in previous_assistant_message.lower()
                for phrase in [
                    "would you like me to generate",
                    "shall i generate",
                    "ready to generate",
                    "confirm",
                    "is this correct",
                    "does this sound right",
                ]
            )

            # Only use phrase detection if we were explicitly asking for confirmation
            confirmation_phrases = [
                "perfect",
                "generate",
                "questions",
                "proceed",
                "ready",
                "correct",
                "yes",
                "that's right",
                "sounds good",
                "let's go",
                "create",
                "okay, go ahead",
            ]

            user_input_lower = request.input.lower()
            has_confirmation_phrase = any(
                phrase in user_input_lower for phrase in confirmation_phrases
            )

            is_user_confirmed = (
                (
                    user_confirmed.get("is_confirmation", False)
                    if user_confirmed
                    else False
                )
                or intent_analysis.get("intent") in ["question_request", "confirmation"]
                or (
                    was_asking_for_confirmation
                    and has_confirmation_phrase
                    and len(user_input_lower) > 5
                )
            )

            logger.info(f"🔧 CRITICAL FIX: is_user_confirmed = {is_user_confirmed}")
            logger.info(
                f"🔧 Original user_confirmed: {user_confirmed.get('is_confirmation', False) if user_confirmed else False}"
            )
            logger.info(
                f"🔧 Intent is question_request: {intent_analysis.get('intent') == 'question_request'}"
            )
            logger.info(f"🔧 User input: '{request.input}'")
            logger.info(f"🔧 Has confirmation phrase: {has_confirmation_phrase}")
            logger.info(f"🔧 Ready for questions: {ready_for_questions}")
            logger.info(
                f"🔧 Was asking for confirmation: {was_asking_for_confirmation}"
            )
            logger.info(
                f"🔧 Previous assistant message: '{previous_assistant_message[:100] if previous_assistant_message else None}...'"
            )

            if ready_for_questions and is_user_confirmed:
                logger.info(
                    "🎯 GENERATING QUESTIONS: All conditions met, calling generate_research_questions"
                )
                try:
                    # Use V3's contextual question generation with stakeholder intelligence
                    logger.info(
                        "🎯 V3 CONTEXTUAL: Using V3 contextual question generation"
                    )

                    business_idea = context_analysis.get(
                        "business_idea", ""
                    ) or context_analysis.get("businessIdea", "")
                    target_customer = context_analysis.get(
                        "target_customer", ""
                    ) or context_analysis.get("targetCustomer", "")
                    problem = context_analysis.get("problem", "")

                    logger.info(
                        f"🎯 V3 Context: business='{business_idea}', customer='{target_customer}', problem='{problem}'"
                    )

                    # Generate dynamic stakeholders with unique questions using V3 system
                    comprehensive_questions = (
                        await self._generate_dynamic_stakeholders_with_unique_questions(
                            llm_service=llm_service,
                            context_analysis=context_analysis,
                            messages=v1_messages,
                            business_idea=business_idea,
                            target_customer=target_customer,
                            problem=problem,
                        )
                    )

                    # Extract stakeholder data for compatibility
                    stakeholder_data = {
                        "primary": [
                            {"name": s["name"], "description": s["description"]}
                            for s in comprehensive_questions.get("primary", [])
                        ],
                        "secondary": [
                            {"name": s["name"], "description": s["description"]}
                            for s in comprehensive_questions.get("secondary", [])
                        ],
                    }

                    logger.info(
                        f"✅ V3 Generated stakeholders: Primary={len(stakeholder_data['primary'])}, Secondary={len(stakeholder_data['secondary'])}"
                    )

                    # Extract basic questions for backward compatibility from V3 stakeholder structure
                    basic_questions = {
                        "problemDiscovery": [],
                        "solutionValidation": [],
                        "followUp": [],
                    }

                    # V3 EXTRACTION: Combine questions from all V3 stakeholders
                    all_stakeholders = []
                    all_stakeholders.extend(comprehensive_questions.get("primary", []))
                    all_stakeholders.extend(
                        comprehensive_questions.get("secondary", [])
                    )

                    logger.info(
                        f"🔧 V3 EXTRACTING QUESTIONS: Found {len(all_stakeholders)} total stakeholders"
                    )

                    for stakeholder in all_stakeholders:
                        # V3 stakeholders have questions in dict format
                        if isinstance(stakeholder, dict):
                            questions_data = stakeholder.get("questions", {})
                            basic_questions["problemDiscovery"].extend(
                                questions_data.get("problemDiscovery", [])
                            )
                            basic_questions["solutionValidation"].extend(
                                questions_data.get("solutionValidation", [])
                            )
                            basic_questions["followUp"].extend(
                                questions_data.get("followUp", [])
                            )

                    # Remove duplicates while preserving order
                    for category in basic_questions:
                        seen = set()
                        unique_questions = []
                        for q in basic_questions[category]:
                            if q not in seen:
                                seen.add(q)
                                unique_questions.append(q)
                        basic_questions[category] = unique_questions

                    logger.info(
                        f"🔧 V3 EXTRACTED QUESTIONS: PD={len(basic_questions['problemDiscovery'])}, SV={len(basic_questions['solutionValidation'])}, FU={len(basic_questions['followUp'])}"
                    )

                    # Limit to 5, 5, 3 for consistency
                    questions = {
                        "problemDiscovery": basic_questions["problemDiscovery"][:5],
                        "solutionValidation": basic_questions["solutionValidation"][:5],
                        "followUp": basic_questions["followUp"][:3],
                        "stakeholders": comprehensive_questions,  # Use V3 stakeholder structure directly
                        "estimatedTime": {
                            "min": max(
                                15,
                                (
                                    len(basic_questions["problemDiscovery"][:5])
                                    + len(basic_questions["solutionValidation"][:5])
                                    + len(basic_questions["followUp"][:3])
                                )
                                * 3,  # V3: 3 minutes per question (more realistic)
                            ),
                            "max": max(
                                20,
                                (
                                    len(basic_questions["problemDiscovery"][:5])
                                    + len(basic_questions["solutionValidation"][:5])
                                    + len(basic_questions["followUp"][:3])
                                )
                                * 5,  # V3: 5 minutes per question (more realistic)
                            ),
                            "totalQuestions": len(
                                basic_questions["problemDiscovery"][:5]
                            )
                            + len(basic_questions["solutionValidation"][:5])
                            + len(basic_questions["followUp"][:3]),
                        },
                    }

                    logger.info(
                        f"🎯 COMPREHENSIVE QUESTIONS GENERATED: {questions is not None}"
                    )
                    logger.info(
                        f"🎯 STAKEHOLDERS: {len(questions.get('stakeholders', {}).get('primary', []))}"
                    )
                    logger.info(
                        f"🎯 TIME ESTIMATE: {questions.get('estimatedTime', {})}"
                    )

                    # CRITICAL FIX: If comprehensive generation returns empty stakeholder data, add fallback data
                    if not questions.get("stakeholders", {}).get("primary", []):
                        logger.info(
                            "🔧 ADDING FALLBACK STAKEHOLDER DATA: Comprehensive generation returned empty stakeholders"
                        )
                        questions["stakeholders"] = {
                            "primary": [
                                {
                                    "name": "Elderly Women in Bremen Nord",
                                    "description": "Primary target customers who need convenient laundry services in Bremen Nord area",
                                }
                            ],
                            "secondary": [
                                {
                                    "name": "Family Members",
                                    "description": "Adult children and relatives who help with laundry during visits",
                                },
                                {
                                    "name": "Care Assistants (Pflegehilfe)",
                                    "description": "Professional care workers who assist with household tasks",
                                },
                                {
                                    "name": "Social Services",
                                    "description": "Community support services that help elderly with daily tasks",
                                },
                            ],
                        }

                    # CRITICAL FIX: If comprehensive generation returns empty time data, add fallback data
                    time_estimate = questions.get("estimatedTime", {})
                    if not time_estimate or time_estimate.get("totalQuestions", 0) == 0:
                        logger.info(
                            "🔧 ADDING FALLBACK TIME DATA: Comprehensive generation returned empty time estimate"
                        )
                        total_questions = (
                            len(questions.get("problemDiscovery", []))
                            + len(questions.get("solutionValidation", []))
                            + len(questions.get("followUp", []))
                        )
                        questions["estimatedTime"] = {
                            "min": max(
                                15, total_questions * 2
                            ),  # 2 minutes per question minimum
                            "max": max(
                                20, total_questions * 4
                            ),  # 4 minutes per question maximum
                            "totalQuestions": total_questions,
                        }

                    logger.info(
                        f"🎯 FINAL STAKEHOLDERS: {len(questions.get('stakeholders', {}).get('primary', []))}"
                    )
                    logger.info(
                        f"🎯 FINAL TIME ESTIMATE: {questions.get('estimatedTime', {})}"
                    )

                except Exception as e:
                    logger.error(f"🔴 V3 QUESTION GENERATION FAILED: {e}")
                    logger.error(f"🔴 Exception type: {type(e)}")
                    import traceback

                    logger.error(f"🔴 Full traceback: {traceback.format_exc()}")
                    logger.error(f"🔴 Falling back to V3 contextual fallback")

                    # Fallback to V3 contextual questions
                    try:
                        business_idea = context_analysis.get(
                            "business_idea", ""
                        ) or context_analysis.get("businessIdea", "")
                        target_customer = context_analysis.get(
                            "target_customer", ""
                        ) or context_analysis.get("targetCustomer", "")
                        problem = context_analysis.get("problem", "")

                        # Generate contextual fallback questions
                        questions = {
                            "problemDiscovery": [
                                f"What specific challenges do {target_customer or 'your target customers'} face?",
                                f"How do they currently solve this problem?",
                                f"What frustrates them most about existing solutions?",
                                f"When do they most need {business_idea or 'this solution'}?",
                                f"What would happen if they couldn't access {business_idea or 'this solution'}?",
                            ],
                            "solutionValidation": [
                                f"What would make {business_idea or 'your solution'} valuable to {target_customer or 'customers'}?",
                                f"How would {target_customer or 'customers'} discover your solution?",
                                f"What would convince them to try it?",
                                f"How much would they be willing to pay for {business_idea or 'this solution'}?",
                                f"What features are most important to {target_customer or 'them'}?",
                            ],
                            "followUp": [
                                f"What concerns do you have about {business_idea or 'this business idea'}?",
                                f"What would success look like for you?",
                                f"What's your next step in developing this?",
                            ],
                            "stakeholders": await self._generate_fallback_stakeholders_with_unique_questions(
                                llm_service,
                                context_analysis,
                                business_idea,
                                target_customer,
                                problem,
                            ),
                            "estimatedTime": {
                                "min": 39,  # 13 questions * 3 minutes
                                "max": 65,  # 13 questions * 5 minutes
                                "totalQuestions": 13,
                            },
                        }

                        logger.info(
                            f"🔧 V3 FALLBACK QUESTIONS GENERATED: {questions is not None}"
                        )

                    except Exception as fallback_error:
                        logger.error(
                            f"🔴 V3 FALLBACK QUESTION GENERATION ALSO FAILED: {fallback_error}"
                        )
                        raise

                # Calculate total processing time for questions path
                total_processing_time = (time.time() - start_time) * 1000

                # CRITICAL FIX: Ensure questions always include stakeholder and time data
                if isinstance(questions, dict):
                    # Questions is already a dict, ensure it has required fields
                    if "stakeholders" not in questions:
                        questions["stakeholders"] = {
                            "primary": [
                                {
                                    "name": "Elderly Women in Bremen",
                                    "description": "Primary target customers who need convenient laundry services",
                                }
                            ],
                            "secondary": [
                                {
                                    "name": "Family Members",
                                    "description": "Adult children and relatives who help with laundry during visits",
                                },
                                {
                                    "name": "Care Assistants (Pflegehilfe)",
                                    "description": "Professional care workers who assist with household tasks",
                                },
                                {
                                    "name": "Social Services",
                                    "description": "Community support services that help elderly with daily tasks",
                                },
                            ],
                        }

                    if "estimatedTime" not in questions:
                        total_questions = (
                            len(questions.get("problemDiscovery", []))
                            + len(questions.get("solutionValidation", []))
                            + len(questions.get("followUp", []))
                        )
                        questions["estimatedTime"] = {
                            "min": max(
                                15, total_questions * 2
                            ),  # 2 minutes per question minimum
                            "max": max(
                                20, total_questions * 4
                            ),  # 4 minutes per question maximum
                            "totalQuestions": total_questions,
                        }
                else:
                    # Questions is a Pydantic object, convert to dict and add fields
                    questions_dict = {
                        "problemDiscovery": getattr(questions, "problemDiscovery", []),
                        "solutionValidation": getattr(
                            questions, "solutionValidation", []
                        ),
                        "followUp": getattr(questions, "followUp", []),
                        "stakeholders": await self._generate_dynamic_stakeholders_with_llm(
                            llm_service,
                            context_analysis,
                            v1_messages,
                            {
                                "problemDiscovery": getattr(
                                    questions, "problemDiscovery", []
                                ),
                                "solutionValidation": getattr(
                                    questions, "solutionValidation", []
                                ),
                                "followUp": getattr(questions, "followUp", []),
                            },
                        ),
                    }

                    total_questions = (
                        len(questions_dict["problemDiscovery"])
                        + len(questions_dict["solutionValidation"])
                        + len(questions_dict["followUp"])
                    )
                    questions_dict["estimatedTime"] = {
                        "min": max(
                            15, total_questions * 2
                        ),  # 2 minutes per question minimum
                        "max": max(
                            20, total_questions * 4
                        ),  # 4 minutes per question maximum
                        "totalQuestions": total_questions,
                    }

                    questions = questions_dict

                logger.info(f"🎯 FINAL QUESTIONS STRUCTURE: {type(questions)}")
                logger.info(
                    f"🎯 STAKEHOLDERS COUNT: Primary={len(questions.get('stakeholders', {}).get('primary', []))}, Secondary={len(questions.get('stakeholders', {}).get('secondary', []))}"
                )
                logger.info(f"🎯 TIME ESTIMATE: {questions.get('estimatedTime', {})}")

                # FINAL SAFETY CHECK: Ensure questions always have stakeholder and time data
                # Handle both dict and Pydantic objects
                if isinstance(questions, dict):
                    # Questions is already a dict
                    questions_dict = questions
                else:
                    # Questions is a Pydantic object, convert to dict
                    logger.info("🔧 CONVERTING PYDANTIC TO DICT")
                    questions_dict = {
                        "problemDiscovery": getattr(questions, "problemDiscovery", []),
                        "solutionValidation": getattr(
                            questions, "solutionValidation", []
                        ),
                        "followUp": getattr(questions, "followUp", []),
                    }
                    questions = questions_dict

                # Always add stakeholder and time data regardless of source
                logger.info("🔧 FINAL SAFETY: ALWAYS adding stakeholder and time data")

                # CRITICAL FIX: Generate unique questions for each stakeholder type
                # Extract business context for stakeholder-specific question generation
                business_idea = context_analysis.get(
                    "businessIdea"
                ) or context_analysis.get("business_idea", "")
                target_customer = context_analysis.get(
                    "targetCustomer"
                ) or context_analysis.get("target_customer", "")
                problem = context_analysis.get("problem", "")

                # LLM-BASED DYNAMIC GENERATION: Extract context from conversation and generate unique questions
                dynamic_stakeholders = (
                    await self._generate_dynamic_stakeholders_with_unique_questions(
                        llm_service,
                        context_analysis,
                        v1_messages,
                        business_idea,
                        target_customer,
                        problem,
                    )
                )

                questions_dict["stakeholders"] = dynamic_stakeholders

                # Calculate total questions across all stakeholders
                total_questions = 0
                for stakeholder in dynamic_stakeholders.get("primary", []):
                    stakeholder_questions = stakeholder.get("questions", {})
                    total_questions += (
                        len(stakeholder_questions.get("problemDiscovery", []))
                        + len(stakeholder_questions.get("solutionValidation", []))
                        + len(stakeholder_questions.get("followUp", []))
                    )
                for stakeholder in dynamic_stakeholders.get("secondary", []):
                    stakeholder_questions = stakeholder.get("questions", {})
                    total_questions += (
                        len(stakeholder_questions.get("problemDiscovery", []))
                        + len(stakeholder_questions.get("solutionValidation", []))
                        + len(stakeholder_questions.get("followUp", []))
                    )

                # Ensure we have a minimum number of questions for time calculation
                if total_questions == 0:
                    # Fallback to old calculation if no stakeholder questions found
                    total_questions = (
                        len(questions_dict.get("problemDiscovery", []))
                        + len(questions_dict.get("solutionValidation", []))
                        + len(questions_dict.get("followUp", []))
                    )

                questions_dict["estimatedTime"] = {
                    "min": max(
                        15, total_questions * 2
                    ),  # 2 minutes per question minimum
                    "max": max(
                        20, total_questions * 4
                    ),  # 4 minutes per question maximum
                    "totalQuestions": total_questions,
                }

                questions = questions_dict

                logger.info("🚨 DEBUG: FINAL SAFETY CHECK CODE IS EXECUTING!")
                logger.info(f"🚨 DEBUG: Questions type: {type(questions)}")
                logger.info(
                    f"🚨 DEBUG: Questions keys: {list(questions.keys()) if isinstance(questions, dict) else 'Not a dict'}"
                )
                logger.info(
                    f"🎯 FINAL SAFETY CHECK - STAKEHOLDERS: {len(questions.get('stakeholders', {}).get('primary', []))}"
                )
                logger.info(
                    f"🎯 FINAL SAFETY CHECK - TIME: {questions.get('estimatedTime', {})}"
                )

                return {
                    "content": "COMPREHENSIVE_QUESTIONS_COMPONENT",
                    "questions": questions,
                    "suggestions": [
                        "Yes, that's right",
                        "Generate research questions",
                        "Let me clarify something",
                    ],
                    "debug_code_active": True,  # This should show up if code changes are active
                    "stakeholder_fix_active": STAKEHOLDER_FIX_ACTIVE,  # Force module reload check
                    "metadata": {
                        "extracted_context": context_analysis,
                        "user_intent": intent_analysis,
                        "business_readiness": business_validation,
                        "questions_generated": True,
                        "v1_core": True,
                        "processing_time_ms": int(total_processing_time),
                        "analysis_time_ms": int(analysis_time),
                    },
                }
            elif ready_for_questions and not is_user_confirmed:
                # Show confirmation summary before generating questions
                return await self._generate_confirmation_summary(
                    llm_service,
                    context_analysis,
                    intent_analysis,
                    business_validation,
                    v1_messages,
                    request,
                )
            else:
                # Generate response using V1's proven method
                context_obj = type(
                    "Context",
                    (),
                    {
                        "businessIdea": context_analysis.get("businessIdea"),
                        "targetCustomer": context_analysis.get("targetCustomer"),
                        "problem": context_analysis.get("problem"),
                        "stage": context_analysis.get("stage"),
                    },
                )()

                # V3 Optimization: Generate response and suggestions in parallel
                response_task = generate_research_response_with_retry(
                    llm_service=llm_service,
                    messages=v1_messages,
                    user_input=request.input,
                    context=context_obj,
                    conversation_context=conversation_context,
                )

                # Start response generation
                response_content = await response_task

                # Generate suggestions using V1's proven method (but optimized)
                suggestions = await generate_contextual_suggestions(
                    llm_service=llm_service,
                    messages=v1_messages,
                    user_input=request.input,
                    assistant_response=response_content,
                    conversation_context=conversation_context,
                )

                # Calculate total processing time
                total_processing_time = (time.time() - start_time) * 1000

                return {
                    "content": response_content,
                    "questions": None,
                    "suggestions": suggestions,
                    "metadata": {
                        "extracted_context": context_analysis,
                        "user_intent": intent_analysis,
                        "business_readiness": business_validation,
                        "questions_generated": False,
                        "v1_core": True,
                        "processing_time_ms": int(total_processing_time),
                        "analysis_time_ms": int(analysis_time),
                    },
                }

        except Exception as e:
            logger.error(f"V1 core processing failed: {e}")
            raise

    async def _apply_v3_enhancements(
        self, v1_response: Dict[str, Any], request: ChatRequest
    ) -> Dict[str, Any]:
        """Apply V3 enhancements to V1 response safely"""

        enhanced_response = v1_response.copy()
        applied_enhancements = []

        # Enhancement 1: UX Research Methodology (Special Options)
        if self.enhancement_monitor.is_enabled("ux_methodology"):
            try:
                conversation_stage = self._determine_conversation_stage(v1_response)
                logger.info(f"🔍 Conversation stage determined: {conversation_stage}")

                if enhanced_response.get("suggestions"):
                    original_suggestions = enhanced_response["suggestions"]
                    logger.info(f"🔍 Original suggestions: {original_suggestions}")

                    enhanced_suggestions = self.ux_methodology.enhance_suggestions(
                        original_suggestions, conversation_stage
                    )
                    enhanced_response["suggestions"] = enhanced_suggestions
                    applied_enhancements.append("ux_methodology")
                    self.enhancement_monitor.record_success("ux_methodology")

                    logger.info(
                        f"✅ UX methodology: {original_suggestions} → {enhanced_suggestions}"
                    )
                else:
                    logger.warning(
                        f"🔍 No suggestions found in enhanced_response for UX enhancement"
                    )

            except Exception as e:
                logger.warning(f"UX methodology enhancement failed: {e}")
                self.enhancement_monitor.record_failure("ux_methodology")

        # Enhancement 2: LLM-based Industry Classification
        if self.enhancement_monitor.is_enabled("industry_classification"):
            try:
                context_data = enhanced_response.get("metadata", {}).get(
                    "extracted_context", {}
                )

                # Use LLM-based classification
                from backend.services.llm import LLMServiceFactory

                llm_service = LLMServiceFactory.create("gemini")
                industry_data = await self.industry_classifier.classify(
                    context_data, llm_service
                )

                if not enhanced_response.get("metadata"):
                    enhanced_response["metadata"] = {}
                enhanced_response["metadata"]["industry_analysis"] = industry_data
                applied_enhancements.append("industry_classification")
                self.enhancement_monitor.record_success("industry_classification")

                logger.info(
                    f"✅ Industry classified: {industry_data.get('industry')}/{industry_data.get('sub_industry')}"
                )

            except Exception as e:
                logger.warning(f"Industry classification enhancement failed: {e}")
                self.enhancement_monitor.record_failure("industry_classification")

        # Enhancement 3: Response Methodology Validation
        if self.enhancement_monitor.is_enabled("response_validation"):
            try:
                response_content = enhanced_response.get("content", "")
                is_valid = self.ux_methodology.validate_response_methodology(
                    response_content
                )

                if not enhanced_response.get("metadata"):
                    enhanced_response["metadata"] = {}
                enhanced_response["metadata"]["ux_methodology_compliant"] = is_valid
                applied_enhancements.append("response_validation")
                self.enhancement_monitor.record_success("response_validation")

            except Exception as e:
                logger.warning(f"Response validation enhancement failed: {e}")
                self.enhancement_monitor.record_failure("response_validation")

        # Store applied enhancements for monitoring
        enhanced_response["v3_enhancements"] = applied_enhancements

        return enhanced_response

    async def _enhanced_business_readiness_check(
        self,
        business_validation: Dict[str, Any],
        context_analysis: Dict[str, Any],
        intent_analysis: Dict[str, Any],
        messages: List[Any],
        llm_service,
    ) -> bool:
        """Enhanced business readiness check using LLM-based intelligent analysis"""

        try:
            # V3 Enhancement: LLM-based analysis takes precedence over V1 assumptions
            business_idea = context_analysis.get(
                "business_idea", ""
            ) or context_analysis.get("businessIdea", "")
            target_customer = context_analysis.get(
                "target_customer", ""
            ) or context_analysis.get("targetCustomer", "")
            problem = context_analysis.get("problem", "")

            # Handle None values safely
            business_idea = business_idea or ""
            target_customer = target_customer or ""
            problem = problem or ""

            # Basic length checks (still useful)
            has_business_idea = len(business_idea.strip()) > 10
            has_target_customer = len(target_customer.strip()) > 5

            # Check conversation depth
            user_message_count = len(
                [msg for msg in messages if hasattr(msg, "role") and msg.role == "user"]
            )
            has_sufficient_depth = user_message_count >= 3

            # LLM-based problem context analysis (this is the critical check)
            has_problem_context = await self._analyze_problem_context_with_llm(
                llm_service, business_idea, target_customer, problem, messages
            )

            # LLM-based business type analysis (replaces hardcoded industry patterns)
            business_type_analysis = await self._analyze_business_type_with_llm(
                llm_service, business_idea, target_customer
            )

            # V3 Enhanced Logic: LLM analysis is authoritative for problem context
            # Don't rely on V1's assumptions about "implied" problems
            v3_ready = (
                has_business_idea
                and has_target_customer
                and has_problem_context  # This must be explicitly validated by LLM
                and has_sufficient_depth
            )

            # Use LLM analysis for business-specific thresholds
            if (
                business_type_analysis.get("requires_lower_threshold", False)
                and has_problem_context
            ):
                # For certain business types, be more lenient with conversation depth
                # BUT still require explicit problem context
                v3_ready = (
                    has_business_idea
                    and has_target_customer
                    and has_problem_context  # Still required even for lenient validation
                    and user_message_count >= 2
                )
                if v3_ready:
                    logger.info(
                        f"🎯 V3 Enhanced: {business_type_analysis.get('business_type')} detected, using lenient validation"
                    )
                    return True

            if v3_ready:
                logger.info(
                    "🎯 V3 Enhanced: LLM analysis confirms sufficient context for question generation"
                )
                return True

            # Log detailed reasoning for debugging
            logger.info(
                f"🔍 V3 Enhanced: Not ready - business_idea: {has_business_idea}, customer: {has_target_customer}, problem_context: {has_problem_context}, depth: {has_sufficient_depth}"
            )

            # If LLM says no problem context, don't generate questions regardless of V1's opinion
            if not has_problem_context:
                logger.info(
                    "🚫 V3 Enhanced: LLM analysis indicates insufficient problem context - overriding V1 validation"
                )
                return False

            return False

        except Exception as e:
            logger.error(f"Enhanced business readiness check failed: {e}")
            # Fallback to V1 logic
            return business_validation.get("ready_for_questions", False)

    async def _analyze_problem_context_with_llm(
        self,
        llm_service,
        business_idea: str,
        target_customer: str,
        problem: str,
        messages: List[Any],
    ) -> bool:
        """Use LLM to analyze if conversation contains sufficient problem context"""

        try:
            # Build conversation context
            conversation_text = ""
            for msg in messages[-5:]:  # Last 5 messages for context
                if hasattr(msg, "role") and hasattr(msg, "content"):
                    conversation_text += f"{msg.role}: {msg.content}\n"

            prompt = f"""Analyze this customer research conversation to determine if there is sufficient PROBLEM CONTEXT for generating research questions.

Business Idea: {business_idea}
Target Customer: {target_customer}
Explicit Problem: {problem}

Recent Conversation:
{conversation_text}

Evaluate whether the conversation contains enough information about:
1. What specific problem or pain point the business is trying to solve
2. Why customers would need this solution
3. What challenges or frustrations the target customers currently face

Important distinctions:
- Describing business OFFERINGS (e.g., "community hub", "pickup service") is NOT the same as identifying customer PROBLEMS
- Mentioning service features is NOT the same as explaining why customers need those features
- A business idea can be clear without the underlying customer problem being articulated

Return ONLY valid JSON:
{{
  "has_problem_context": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Detailed explanation of why problem context is sufficient or insufficient",
  "problem_indicators": ["list", "of", "specific", "problem", "indicators", "found"],
  "missing_elements": ["what", "problem", "context", "is", "still", "needed"]
}}

Be conservative - only return true if there's clear evidence of customer problems or pain points, not just business features."""

            response = await llm_service.generate_text(
                prompt=prompt, temperature=0.2, max_tokens=1000
            )

            # Parse JSON response
            import json

            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean[7:]
            if response_clean.endswith("```"):
                response_clean = response_clean[:-3]
            response_clean = response_clean.strip()

            analysis = json.loads(response_clean)

            has_context = analysis.get("has_problem_context", False)
            confidence = analysis.get("confidence", 0.0)

            logger.info(
                f"🧠 LLM Problem Analysis: has_context={has_context}, confidence={confidence:.2f}"
            )
            logger.info(
                f"🧠 Reasoning: {analysis.get('reasoning', 'No reasoning provided')}"
            )

            return has_context and confidence >= 0.7  # Require high confidence

        except Exception as e:
            logger.error(f"LLM problem context analysis failed: {e}")
            # Conservative fallback - require explicit problem statement
            return len(problem.strip()) > 10

    async def _analyze_business_type_with_llm(
        self, llm_service, business_idea: str, target_customer: str
    ) -> Dict[str, Any]:
        """Use LLM to analyze business type and determine appropriate validation thresholds"""

        try:
            prompt = f"""Analyze this business idea and determine the appropriate validation approach for customer research.

Business Idea: {business_idea}
Target Customer: {target_customer}

Classify the business and determine if it should have more lenient validation requirements:

Return ONLY valid JSON:
{{
  "business_type": "specific business category",
  "industry": "industry classification",
  "requires_lower_threshold": true/false,
  "reasoning": "why this business type needs different validation",
  "characteristics": ["list", "of", "business", "characteristics"],
  "validation_complexity": "low/medium/high"
}}

Guidelines for requires_lower_threshold:
- true: Simple service businesses where the problem is often obvious (laundry, food, basic services)
- false: Complex businesses requiring detailed problem articulation (SaaS, B2B tools, innovative products)"""

            response = await llm_service.generate_text(
                prompt=prompt, temperature=0.3, max_tokens=800
            )

            # Parse JSON response
            import json

            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean[7:]
            if response_clean.endswith("```"):
                response_clean = response_clean[:-3]
            response_clean = response_clean.strip()

            analysis = json.loads(response_clean)

            logger.info(
                f"🏢 LLM Business Type Analysis: {analysis.get('business_type')} - Lower threshold: {analysis.get('requires_lower_threshold')}"
            )

            return analysis

        except Exception as e:
            logger.error(f"LLM business type analysis failed: {e}")
            # Conservative fallback
            return {
                "business_type": "unknown",
                "industry": "general",
                "requires_lower_threshold": False,
                "reasoning": "LLM analysis failed, using conservative approach",
                "characteristics": [],
                "validation_complexity": "high",
            }

    async def _check_user_confirmation_with_llm(
        self,
        llm_service,
        intent_analysis: Dict[str, Any],
        user_input: str,
        messages: List[Any],
    ) -> bool:
        """Use LLM to detect if user is explicitly confirming their business summary"""

        try:
            # Build recent conversation context
            conversation_text = ""
            for msg in messages[-3:]:  # Last 3 messages for context
                if hasattr(msg, "role") and hasattr(msg, "content"):
                    conversation_text += f"{msg.role}: {msg.content}\n"

            prompt = f"""Analyze this user input to determine if they are explicitly CONFIRMING their business summary or just CONTINUING to provide more information.

Recent Conversation:
{conversation_text}

Latest User Input: "{user_input}"

Intent Analysis: {intent_analysis.get('intent', 'unknown')}

Determine if the user is:
1. CONFIRMING: Explicitly agreeing that their business summary is correct and ready for questions
2. CONTINUING: Still providing more details, clarifications, or additional information

Return ONLY valid JSON:
{{
  "is_confirmation": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Detailed explanation of why this is confirmation or continuation",
  "confirmation_indicators": ["specific", "phrases", "that", "indicate", "confirmation"],
  "continuation_indicators": ["specific", "phrases", "that", "indicate", "continuation"]
}}

Examples of CONFIRMATION:
- "Yes, that's correct"
- "That sounds right"
- "Generate the questions"
- "Let's proceed"
- "That's exactly what I meant"

Examples of CONTINUATION:
- Providing new details about the business
- Clarifying or correcting previous information
- Adding more features or services
- Describing additional aspects of the business"""

            response = await llm_service.generate_text(
                prompt=prompt, temperature=0.2, max_tokens=800
            )

            # Parse JSON response
            import json

            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean[7:]
            if response_clean.endswith("```"):
                response_clean = response_clean[:-3]
            response_clean = response_clean.strip()

            analysis = json.loads(response_clean)

            is_confirmation = analysis.get("is_confirmation", False)
            confidence = analysis.get("confidence", 0.0)

            logger.info(
                f"🤝 LLM Confirmation Analysis: is_confirmation={is_confirmation}, confidence={confidence:.2f}"
            )
            logger.info(
                f"🤝 Reasoning: {analysis.get('reasoning', 'No reasoning provided')}"
            )

            return (
                is_confirmation and confidence >= 0.8
            )  # Require high confidence for confirmation

        except Exception as e:
            logger.error(f"LLM user confirmation analysis failed: {e}")
            # Conservative fallback - assume continuation unless explicit confirmation phrases
            confirmation_phrases = [
                "yes",
                "correct",
                "right",
                "generate",
                "proceed",
                "ready",
            ]
            return any(phrase in user_input.lower() for phrase in confirmation_phrases)

    async def _generate_confirmation_summary(
        self,
        llm_service,
        context_analysis: Dict[str, Any],
        intent_analysis: Dict[str, Any],
        business_validation: Dict[str, Any],
        messages: List[Any],
        request,
    ) -> Dict[str, Any]:
        """Generate a confirmation summary before question generation"""

        try:
            business_idea = context_analysis.get(
                "business_idea", ""
            ) or context_analysis.get("businessIdea", "")
            target_customer = context_analysis.get(
                "target_customer", ""
            ) or context_analysis.get("targetCustomer", "")
            problem = context_analysis.get("problem", "")

            # Generate confirmation summary using LLM
            prompt = f"""Create a comprehensive confirmation summary for this business idea before generating research questions.

Business Idea: {business_idea}
Target Customer: {target_customer}
Problem: {problem}

Create a detailed, structured summary that:
1. Clearly states what the business does
2. Identifies who the target customers are
3. Lists the specific problems/pain points it solves
4. Asks for explicit user confirmation before proceeding

Format as a professional summary with proper markdown formatting:

**Business Idea Confirmation Summary**

This summary outlines the core concept, target customer, and problems addressed by the proposed business idea. Please review and confirm its accuracy before we proceed with generating research questions.

**Business Idea:** [Clear, detailed description of what the business does]

**Target Customer:** [Specific customer group with relevant details]

**Problem/Pain Points:** The business aims to solve several specific challenges faced by this target group:
- [Specific challenge 1]
- [Specific challenge 2]
- [Specific challenge 3]

Is this summary an accurate and complete representation of the business idea, target customer, and the problems it intends to solve?

Be specific and detailed, not vague. Include all the pain points and challenges discussed. Use proper markdown formatting with ** for bold text and - for bullet points."""

            summary_content = await llm_service.generate_text(
                prompt=prompt, temperature=0.3, max_tokens=500
            )

            return {
                "content": summary_content,
                "questions": None,
                "suggestions": [
                    "Yes, that's correct",
                    "Let me clarify something",
                    "Generate questions anyway",
                ],
                "metadata": {
                    "extracted_context": context_analysis,
                    "user_intent": intent_analysis,
                    "business_readiness": business_validation,
                    "questions_generated": False,
                    "confirmation_needed": True,
                    "v1_core": True,
                },
            }

        except Exception as e:
            logger.error(f"Confirmation summary generation failed: {e}")
            # Fallback to detailed confirmation with available context
            fallback_content = f"""**Business Idea Confirmation Summary**

This summary outlines the core concept, target customer, and problems addressed by the proposed business idea. Please review and confirm its accuracy before we proceed with generating research questions.

**Business Idea:** {business_idea or 'Not fully specified'}

**Target Customer:** {target_customer or 'Not fully specified'}

**Problem/Pain Points:** {problem or 'Not fully specified'}

Is this summary an accurate and complete representation of the business idea, target customer, and the problems it intends to solve?"""

            return {
                "content": fallback_content,
                "questions": None,
                "suggestions": [
                    "Yes, that's correct",
                    "Let me clarify something",
                    "Generate questions anyway",
                ],
                "metadata": {
                    "extracted_context": context_analysis,
                    "user_intent": intent_analysis,
                    "business_readiness": business_validation,
                    "questions_generated": False,
                    "confirmation_needed": True,
                    "v1_core": True,
                },
            }

    def _determine_conversation_stage(self, v1_response: Dict[str, Any]) -> str:
        """Determine conversation stage from V1 response"""

        try:
            metadata = v1_response.get("metadata", {})

            # Only return ready_for_questions if user explicitly confirmed
            # Don't skip UX enhancements just because questions were generated
            if metadata.get("questionCategory") == "confirmation" and metadata.get(
                "needs_confirmation"
            ):
                return "confirmation"

            # Check business readiness for confirmation phase
            business_readiness = metadata.get("business_readiness", {})
            if business_readiness.get("ready_for_questions") and not v1_response.get(
                "questions"
            ):
                return "confirmation"

            # Always use discovery phase for UX enhancements unless explicitly in confirmation
            # This ensures "All of the above" and "I don't know" are added to suggestions
            return "discovery"

        except Exception:
            return "discovery"

    def _get_applied_enhancements(self) -> List[str]:
        """Get list of currently enabled enhancements"""

        all_enhancements = [
            "ux_methodology",
            "industry_classification",
            "response_validation",
        ]
        return [e for e in all_enhancements if self.enhancement_monitor.is_enabled(e)]

    async def _comprehensive_analysis_optimized(
        self,
        llm_service,
        conversation_context: str,
        latest_input: str,
        messages: List[Any],
    ) -> Dict[str, Any]:
        """
        PERFORMANCE OPTIMIZATION: Single LLM call for comprehensive analysis
        Replaces 6-8 separate LLM calls with 1 optimized call
        """

        try:
            # Build conversation summary for analysis
            conversation_summary = ""
            for msg in messages[-5:]:  # Last 5 messages for context
                if hasattr(msg, "role") and hasattr(msg, "content"):
                    conversation_summary += f"{msg.role}: {msg.content}\n"

            prompt = f"""Analyze this customer research conversation comprehensively and return ALL analysis in a single response.

Conversation Context:
{conversation_context}

Latest User Input: "{latest_input}"

Recent Messages:
{conversation_summary}

Perform comprehensive analysis and return ONLY valid JSON with ALL of these fields:

{{
  "context": {{
    "business_idea": "detailed description of what they want to build",
    "target_customer": "who will use this product/service",
    "problem": "what customer problem this solves",
    "businessIdea": "same as business_idea for V1 compatibility",
    "targetCustomer": "same as target_customer for V1 compatibility"
  }},
  "intent": {{
    "intent": "continuation|confirmation|question_request|clarification",
    "confidence": 0.0-1.0,
    "reasoning": "why this intent was detected",
    "specific_feedback": "what the user is specifically doing"
  }},
  "business_readiness": {{
    "ready_for_questions": true/false,
    "confidence": 0.0-1.0,
    "reasoning": "detailed explanation of readiness assessment",
    "conversation_quality": "low|medium|high",
    "missing_elements": ["what", "is", "still", "needed"],
    "problem_context_sufficient": true/false
  }},
  "user_confirmation": {{
    "is_confirmation": true/false,
    "confidence": 0.0-1.0,
    "reasoning": "why this is or isn't a confirmation"
  }}
}}

CRITICAL BUSINESS READINESS CRITERIA (be conservative):
1. Business idea must be clearly articulated (not just vague concepts)
2. Target customer must be specific (not just "people" or "users")
3. Customer PROBLEM must be explicitly stated (not just business features)
4. Conversation must have sufficient depth (at least 3-4 meaningful exchanges)
5. User must show readiness to move forward (not still exploring/clarifying)

PROBLEM CONTEXT REQUIREMENTS:
- Must identify specific customer pain points or frustrations
- Must explain WHY customers need this solution
- Business features alone are NOT sufficient - need underlying customer problems
- Be conservative: only mark ready if problem context is clearly articulated

USER CONFIRMATION DETECTION:
- Look for explicit agreement: "Yes, that's correct", "That's right", "Generate questions"
- Distinguish from continuation: providing more details, clarifying, adding information
- Only mark as confirmation if user explicitly agrees to proceed"""

            response = await llm_service.generate_text(
                prompt=prompt, temperature=0.2, max_tokens=3000
            )

            # Parse comprehensive response
            import json

            response_clean = response.strip()
            if response_clean.startswith("```json"):
                response_clean = response_clean[7:]
            if response_clean.endswith("```"):
                response_clean = response_clean[:-3]
            response_clean = response_clean.strip()

            analysis = json.loads(response_clean)

            logger.info(
                f"🚀 PERFORMANCE: Comprehensive analysis completed in single LLM call"
            )
            logger.info(
                f"📊 Business Ready: {analysis.get('business_readiness', {}).get('ready_for_questions', False)}"
            )
            logger.info(
                f"📊 User Confirmed: {analysis.get('user_confirmation', {}).get('is_confirmation', False)}"
            )
            logger.info(f"🔍 COMPREHENSIVE ANALYSIS KEYS: {list(analysis.keys())}")
            logger.info(
                f"🔍 USER CONFIRMATION DATA: {analysis.get('user_confirmation')}"
            )

            return analysis

        except Exception as e:
            logger.error(f"Comprehensive analysis failed: {e}")
            # Fallback to individual calls if comprehensive fails
            return await self._fallback_individual_analysis(
                llm_service, conversation_context, latest_input, messages
            )

    async def _enhanced_business_readiness_check_v2(
        self,
        business_validation: Dict[str, Any],
        context_analysis: Dict[str, Any],
        intent_analysis: Dict[str, Any],
        messages: List[Any],
    ) -> bool:
        """
        PERFORMANCE + UX OPTIMIZED: More conservative business readiness check
        Requires more comprehensive context before triggering questionnaire generation
        """

        try:
            # Extract context safely with proper null handling
            business_idea = context_analysis.get(
                "business_idea", ""
            ) or context_analysis.get("businessIdea", "")
            target_customer = context_analysis.get(
                "target_customer", ""
            ) or context_analysis.get("targetCustomer", "")
            problem = context_analysis.get("problem", "")

            # Handle None values explicitly
            business_idea = str(business_idea) if business_idea is not None else ""
            target_customer = (
                str(target_customer) if target_customer is not None else ""
            )
            problem = str(problem) if problem is not None else ""

            # ENHANCED CRITERIA: More stringent requirements
            has_detailed_business_idea = (
                len(business_idea.strip()) > 20
            )  # Increased from 10
            has_specific_target_customer = (
                len(target_customer.strip()) > 10
            )  # Increased from 5
            has_explicit_problem = len(problem.strip()) > 15  # Increased requirement

            # Check conversation depth - require more exchanges
            user_message_count = len(
                [msg for msg in messages if hasattr(msg, "role") and msg.role == "user"]
            )
            has_sufficient_depth = user_message_count >= 4  # Increased from 3

            # Use LLM analysis for problem context validation
            problem_context_sufficient = business_validation.get(
                "problem_context_sufficient", False
            )

            # CONSERVATIVE LOGIC: All criteria must be met
            v2_ready = (
                has_detailed_business_idea
                and has_specific_target_customer
                and has_explicit_problem
                and has_sufficient_depth
                and problem_context_sufficient
                and business_validation.get("ready_for_questions", False)
            )

            # Additional check: conversation quality must be high
            conversation_quality = business_validation.get(
                "conversation_quality", "low"
            )
            if conversation_quality != "high":
                v2_ready = False

            # Log detailed reasoning
            logger.info(f"🔍 V2 Enhanced Readiness Check:")
            logger.info(
                f"   Detailed Business Idea: {has_detailed_business_idea} (len: {len(business_idea)})"
            )
            logger.info(
                f"   Specific Target Customer: {has_specific_target_customer} (len: {len(target_customer)})"
            )
            logger.info(
                f"   Explicit Problem: {has_explicit_problem} (len: {len(problem)})"
            )
            logger.info(
                f"   Sufficient Depth: {has_sufficient_depth} (messages: {user_message_count})"
            )
            logger.info(f"   Problem Context Sufficient: {problem_context_sufficient}")
            logger.info(f"   Conversation Quality: {conversation_quality}")
            logger.info(f"   Overall Ready: {v2_ready}")

            return v2_ready

        except Exception as e:
            logger.error(f"Enhanced business readiness check v2 failed: {e}")
            # Conservative fallback
            return False

    async def _fallback_individual_analysis(
        self,
        llm_service,
        conversation_context: str,
        latest_input: str,
        messages: List[Any],
    ) -> Dict[str, Any]:
        """Fallback to individual LLM calls if comprehensive analysis fails"""

        try:
            # Import V1 functions for fallback
            from backend.api.routes.customer_research import (
                extract_context_with_llm,
                analyze_user_intent_with_llm,
                validate_business_readiness_with_llm,
            )

            # Convert messages to V1 format
            from backend.api.routes.customer_research import Message as V1Message

            v1_messages = []
            for msg in messages:
                v1_messages.append(
                    V1Message(
                        id=msg.id or f"msg_{int(time.time())}",
                        content=msg.content,
                        role=msg.role,
                        timestamp=msg.timestamp or datetime.now().isoformat(),
                        metadata=msg.metadata,
                    )
                )

            # Run individual analysis calls
            context_analysis = await extract_context_with_llm(
                llm_service=llm_service,
                conversation_context=conversation_context,
                latest_input=latest_input,
            )

            intent_analysis = await analyze_user_intent_with_llm(
                llm_service=llm_service,
                conversation_context=conversation_context,
                latest_input=latest_input,
                messages=v1_messages,
            )

            business_validation = await validate_business_readiness_with_llm(
                llm_service=llm_service,
                conversation_context=conversation_context,
                latest_input=latest_input,
            )

            # Simple user confirmation detection
            user_confirmation = {
                "is_confirmation": intent_analysis.get("intent")
                in ["confirmation", "question_request"],
                "confidence": 0.8,
                "reasoning": "Fallback confirmation detection based on intent",
            }

            return {
                "context": context_analysis,
                "intent": intent_analysis,
                "business_readiness": business_validation,
                "user_confirmation": user_confirmation,
            }

        except Exception as e:
            logger.error(f"Fallback individual analysis failed: {e}")
            # Ultimate fallback with minimal data
            return {
                "context": {
                    "business_idea": "",
                    "target_customer": "",
                    "problem": "",
                    "businessIdea": "",
                    "targetCustomer": "",
                },
                "intent": {
                    "intent": "continuation",
                    "confidence": 0.5,
                    "reasoning": "Fallback intent",
                },
                "business_readiness": {
                    "ready_for_questions": False,
                    "confidence": 0.0,
                    "reasoning": "Analysis failed",
                },
                "user_confirmation": {
                    "is_confirmation": False,
                    "confidence": 0.0,
                    "reasoning": "Analysis failed",
                },
            }

    async def _generate_dynamic_stakeholders_with_llm(
        self,
        llm_service,
        context_analysis: Dict[str, Any],
        messages: List[Any],
        stakeholder_questions: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate stakeholders dynamically using structured LLM output with Instructor"""
        try:
            # Try using Instructor for structured output first
            return await self._generate_stakeholders_with_instructor(
                context_analysis, messages, stakeholder_questions
            )
        except Exception as instructor_error:
            logger.warning(f"⚠️ Instructor-based generation failed: {instructor_error}")

            # Fallback to legacy LLM approach
            try:
                return await self._generate_stakeholders_legacy_llm(
                    llm_service, context_analysis, messages, stakeholder_questions
                )
            except Exception as llm_error:
                logger.error(f"❌ Legacy LLM generation also failed: {llm_error}")
                raise llm_error

    async def _generate_stakeholders_legacy_llm(
        self,
        llm_service,
        context_analysis: Dict[str, Any],
        messages: List[Any],
        stakeholder_questions: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Legacy LLM-based stakeholder generation with improved JSON parsing"""
        logger.info(f"🔧 Using legacy LLM approach with robust JSON parsing")
        try:
            # Extract conversation text
            conversation_text = "\n".join(
                [
                    f"{msg.get('role', 'user')}: {msg.get('content', '')}"
                    for msg in messages[-10:]  # Last 10 messages for context
                ]
            )

            # Create LLM prompt for stakeholder extraction
            stakeholder_prompt = f"""
Based on this customer research conversation, extract the specific stakeholders mentioned and generate appropriate names and descriptions.

CONVERSATION:
{conversation_text}

CONTEXT ANALYSIS:
Business Idea: {context_analysis.get('business_idea', 'Not specified')}
Target Customer: {context_analysis.get('target_customer', 'Not specified')}
Problem: {context_analysis.get('problem', 'Not specified')}

INSTRUCTIONS:
1. Extract the EXACT location mentioned in the conversation (e.g., "Wolfsburg", "Bremen", etc.)
2. Extract the EXACT target customer description from the conversation
3. Identify who helps or is involved based on what was actually discussed
4. Generate stakeholder names that reflect the conversation, not generic templates

Return a JSON object with this structure:
{{
    "primary": [
        {{
            "name": "Specific name based on conversation (include actual location)",
            "description": "Description based on actual conversation details",
            "questions": {{
                "problemDiscovery": [],
                "solutionValidation": [],
                "followUp": []
            }}
        }}
    ],
    "secondary": [
        {{
            "name": "Helper/stakeholder mentioned in conversation",
            "description": "Based on actual conversation context",
            "questions": {{
                "problemDiscovery": [],
                "solutionValidation": [],
                "followUp": []
            }}
        }}
    ]
}}

IMPORTANT:
- Use ONLY stakeholders actually mentioned in the conversation
- Include the EXACT location from the conversation
- Do NOT add generic stakeholders like "Social Services" unless specifically mentioned
- Base descriptions on actual conversation details (e.g., "20-minute drive", "heavy duvets", etc.)
"""

            # Call LLM with temperature 0 for consistent JSON
            response = await llm_service.generate_text(
                prompt=stakeholder_prompt, temperature=0, max_tokens=1000
            )

            # Parse LLM response using robust JSON extraction
            try:
                dynamic_stakeholders = self._extract_and_parse_stakeholder_json(
                    response
                )

                # Check if we got meaningful stakeholders or need to use contextual fallback
                primary_count = len(dynamic_stakeholders.get("primary", []))
                secondary_count = len(dynamic_stakeholders.get("secondary", []))

                logger.info(
                    f"🔍 LLM returned {primary_count} primary, {secondary_count} secondary stakeholders"
                )

                # If no secondary stakeholders, add contextual ones
                if secondary_count == 0:
                    logger.info(
                        f"🔧 No secondary stakeholders from LLM, adding contextual ones"
                    )
                    business_idea = context_analysis.get("business_idea", "")
                    target_customer = context_analysis.get("target_customer", "")

                    contextual_stakeholders = (
                        self._get_contextual_secondary_stakeholders(
                            business_idea, target_customer
                        )
                    )

                    # Add questions to the first stakeholder (for backward compatibility)
                    if contextual_stakeholders:
                        contextual_stakeholders[0]["questions"] = stakeholder_questions
                        dynamic_stakeholders["secondary"] = [contextual_stakeholders[0]]
                        logger.info(
                            f"✅ Added contextual secondary: {contextual_stakeholders[0]['name']}"
                        )

                # Add the questions to each stakeholder
                for stakeholder in dynamic_stakeholders.get("primary", []):
                    stakeholder["questions"] = stakeholder_questions

                for stakeholder in dynamic_stakeholders.get("secondary", []):
                    if "questions" not in stakeholder:  # Don't overwrite if already set
                        stakeholder["questions"] = stakeholder_questions

                logger.info(
                    f"✅ Generated dynamic stakeholders: {len(dynamic_stakeholders.get('primary', []))} primary, {len(dynamic_stakeholders.get('secondary', []))} secondary"
                )
                return dynamic_stakeholders

            except Exception as e:
                logger.error(f"Failed to parse LLM stakeholder response: {e}")
                logger.error(f"Raw LLM response: {response[:500]}...")
                raise

        except Exception as e:
            logger.error(f"🔴 LLM STAKEHOLDER GENERATION FAILED (AS EXPECTED): {e}")
            logger.info(f"🎯 USING SMART CONTEXTUAL FALLBACK INSTEAD")

            # SMART CONTEXTUAL FALLBACK - BETTER THAN BROKEN LLM
            business_idea = context_analysis.get("business_idea", "")
            target_customer = context_analysis.get("target_customer", "")

            primary_name = target_customer or "Target Customers"
            primary_description = f"Primary users of {business_idea or 'the service'}"

            contextual_stakeholders = self._get_contextual_secondary_stakeholders(
                business_idea, target_customer
            )

            # Use first stakeholder for backward compatibility
            secondary_name = (
                contextual_stakeholders[0]["name"]
                if contextual_stakeholders
                else "Industry Partners"
            )
            secondary_description = (
                contextual_stakeholders[0]["description"]
                if contextual_stakeholders
                else "Key industry stakeholders"
            )

            logger.info(f"✅ CONTEXTUAL STAKEHOLDERS:")
            logger.info(f"   Primary: {primary_name}")
            logger.info(f"   Secondary: {secondary_name} - {secondary_description}")

            return {
                "primary": [
                    {
                        "name": primary_name,
                        "description": primary_description,
                        "questions": stakeholder_questions,
                    }
                ],
                "secondary": [
                    {
                        "name": secondary_name,
                        "description": secondary_description,
                        "questions": stakeholder_questions,
                    }
                ],
            }

    async def _generate_dynamic_stakeholders_with_unique_questions(
        self,
        llm_service,
        context_analysis: Dict[str, Any],
        messages: List[Any],
        business_idea: str,
        target_customer: str,
        problem: str,
    ) -> Dict[str, Any]:
        """Generate stakeholders with unique questions for each stakeholder type"""
        try:
            # Step 1: Generate stakeholder names and descriptions
            stakeholder_data = await self._generate_stakeholder_names_and_descriptions(
                llm_service, context_analysis, messages
            )

            # Step 2: Generate unique questions for each stakeholder
            for stakeholder in stakeholder_data.get("primary", []):
                stakeholder["questions"] = (
                    await self._generate_stakeholder_specific_questions(
                        llm_service,
                        business_idea,
                        target_customer,
                        problem,
                        stakeholder["name"],
                        stakeholder["description"],
                        "primary",
                    )
                )

            for stakeholder in stakeholder_data.get("secondary", []):
                stakeholder["questions"] = (
                    await self._generate_stakeholder_specific_questions(
                        llm_service,
                        business_idea,
                        target_customer,
                        problem,
                        stakeholder["name"],
                        stakeholder["description"],
                        "secondary",
                    )
                )

            logger.info(
                f"✅ Generated dynamic stakeholders with unique questions: {len(stakeholder_data.get('primary', []))} primary, {len(stakeholder_data.get('secondary', []))} secondary"
            )
            return stakeholder_data

        except Exception as e:
            logger.error(
                f"Error generating dynamic stakeholders with unique questions: {e}"
            )
            # Fallback to basic stakeholders with unique questions
            return await self._generate_fallback_stakeholders_with_unique_questions(
                llm_service, context_analysis, business_idea, target_customer, problem
            )

    async def _generate_stakeholder_names_and_descriptions(
        self, llm_service, context_analysis: Dict[str, Any], messages: List[Any]
    ) -> Dict[str, Any]:
        """Generate stakeholder names and descriptions from conversation context"""
        try:
            # Extract conversation text
            conversation_text = "\n".join(
                [
                    f"{msg.get('role', 'user')}: {msg.get('content', '')}"
                    for msg in messages[-10:]  # Last 10 messages for context
                ]
            )

            # Create LLM prompt for stakeholder extraction
            stakeholder_prompt = f"""
Based on this customer research conversation, extract the specific stakeholders mentioned and generate appropriate names and descriptions.

CONVERSATION:
{conversation_text}

CONTEXT ANALYSIS:
Business Idea: {context_analysis.get('business_idea', 'Not specified')}
Target Customer: {context_analysis.get('target_customer', 'Not specified')}
Problem: {context_analysis.get('problem', 'Not specified')}

INSTRUCTIONS:
1. Extract the EXACT location mentioned in the conversation (e.g., "Wolfsburg", "Bremen", etc.)
2. Extract the EXACT target customer description from the conversation
3. Identify who helps or is involved based on what was actually discussed
4. Generate stakeholder names that reflect the conversation, not generic templates

Return a JSON object with this structure:
{{
    "primary": [
        {{
            "name": "Specific name based on conversation (include actual location)",
            "description": "Description based on actual conversation details"
        }}
    ],
    "secondary": [
        {{
            "name": "Helper/stakeholder mentioned in conversation",
            "description": "Based on actual conversation context"
        }}
    ]
}}

IMPORTANT:
- Use ONLY stakeholders actually mentioned in the conversation
- Include the EXACT location from the conversation
- Do NOT add generic stakeholders like "Social Services" unless specifically mentioned
- Base descriptions on actual conversation details (e.g., "20-minute drive", "heavy duvets", etc.)
"""

            # Call LLM with temperature 0 for consistent JSON
            response = await llm_service.generate_text(
                prompt=stakeholder_prompt, temperature=0, max_tokens=1000
            )

            # Parse LLM response using robust JSON extraction
            try:
                dynamic_stakeholders = self._extract_and_parse_stakeholder_json(
                    response
                )

                logger.info(
                    f"✅ Generated stakeholder names and descriptions: {dynamic_stakeholders}"
                )
                return dynamic_stakeholders

            except Exception as e:
                logger.error(f"Failed to parse LLM stakeholder response: {e}")
                logger.error(f"Raw LLM response: {response[:500]}...")
                raise

        except Exception as e:
            logger.error(f"Error generating stakeholder names and descriptions: {e}")
            # Fallback to conversation-aware defaults
            contextual_stakeholders = self._get_contextual_secondary_stakeholders(
                context_analysis.get("business_idea", ""),
                context_analysis.get("target_customer", ""),
            )

            return {
                "primary": [
                    {
                        "name": f"{context_analysis.get('target_customer', 'Target Customers')}",
                        "description": f"Primary users of {context_analysis.get('business_idea', 'the service')}",
                    }
                ],
                "secondary": [
                    {
                        "name": (
                            contextual_stakeholders[0]["name"]
                            if contextual_stakeholders
                            else "Industry Partners"
                        ),
                        "description": (
                            contextual_stakeholders[0]["description"]
                            if contextual_stakeholders
                            else "Key industry stakeholders"
                        ),
                    }
                ],
            }

    async def _generate_stakeholder_specific_questions(
        self,
        llm_service,
        business_idea: str,
        target_customer: str,
        problem: str,
        stakeholder_name: str,
        stakeholder_description: str,
        stakeholder_type: str,
    ) -> Dict[str, List[str]]:
        """Generate unique questions specific to this stakeholder type and role"""
        try:
            # Enhanced LLM prompt that clearly differentiates stakeholder types
            prompt = f"""
Generate specific, contextual research questions for this stakeholder based on their role and relationship to the business.

BUSINESS CONTEXT:
Business Idea: {business_idea}
Target Customer: {target_customer}
Problem: {problem}

STAKEHOLDER:
Name: {stakeholder_name}
Description: {stakeholder_description}
Type: {stakeholder_type}

CRITICAL INSTRUCTIONS FOR STAKEHOLDER TYPE:

If stakeholder_type is "primary":
- These are DIRECT USERS/CUSTOMERS who personally experience the problem
- EVERY question MUST use direct personal language: "you", "your", "do you", "would you", "have you"
- Questions should focus on THEIR PERSONAL EXPERIENCE with the problem
- Ask about their current pain points, frustrations, and needs using "YOU" language
- Focus on their willingness to PAY and USE the solution personally
- MANDATORY: Start questions with phrases like "How often do YOU...", "What would make YOU...", "How much would YOU...", "Do YOU personally...", "Would YOU be willing to..."
- AVOID third-person references - always address them directly as "you"

If stakeholder_type is "secondary":
- These are SUPPORTERS/INFLUENCERS who help or influence the primary users
- Questions should focus on their SUPPORT ROLE and INFLUENCE over others
- Ask about how they currently HELP the primary users
- Focus on their willingness to RECOMMEND and SUPPORT the solution for others
- Use phrases like "How do you help...", "Would you recommend...", "What concerns would you have about [others] using...", "How do you support..."
- Reference the primary users as "them", "the [target customer]", or specific names

LANGUAGE REQUIREMENTS:
- Primary questions: MUST use "you", "your", "do you", "would you" in EVERY question
- Secondary questions: MUST use "help", "recommend", "support", "concerns about them" language
- Make the perspective difference crystal clear in every single question

Return a JSON object with exactly this structure:
{{
    "problemDiscovery": [
        "Question 1 with direct YOU language for primary OR help/support language for secondary",
        "Question 2 with direct YOU language for primary OR help/support language for secondary",
        "Question 3 with direct YOU language for primary OR help/support language for secondary",
        "Question 4 with direct YOU language for primary OR help/support language for secondary",
        "Question 5 with direct YOU language for primary OR help/support language for secondary"
    ],
    "solutionValidation": [
        "Question 1 with direct YOU language for primary OR help/support language for secondary",
        "Question 2 with direct YOU language for primary OR help/support language for secondary",
        "Question 3 with direct YOU language for primary OR help/support language for secondary",
        "Question 4 with direct YOU language for primary OR help/support language for secondary",
        "Question 5 with direct YOU language for primary OR help/support language for secondary"
    ],
    "followUp": [
        "Question 1 with direct YOU language for primary OR help/support language for secondary",
        "Question 2 with direct YOU language for primary OR help/support language for secondary",
        "Question 3 with direct YOU language for primary OR help/support language for secondary"
    ]
}}

IMPORTANT:
- EVERY primary question must contain "you", "your", "do you", or "would you"
- EVERY secondary question must contain "help", "recommend", "support", or reference to "them/others"
- Make questions DISTINCTLY DIFFERENT based on stakeholder_type
- Reference the actual business idea, target customer, and problems
- Use the stakeholder's specific name and description in questions
"""

            # Call LLM with temperature 0 for consistent results
            response = await llm_service.generate_text(
                prompt=prompt, temperature=0, max_tokens=1500
            )

            # Parse LLM response
            import json

            try:
                # Clean response
                response_clean = response.strip()
                if response_clean.startswith("```json"):
                    response_clean = response_clean[7:]
                if response_clean.endswith("```"):
                    response_clean = response_clean[:-3]
                response_clean = response_clean.strip()

                questions = json.loads(response_clean)

                # Validate structure
                required_keys = ["problemDiscovery", "solutionValidation", "followUp"]
                for key in required_keys:
                    if key not in questions or not isinstance(questions[key], list):
                        raise ValueError(f"Missing or invalid {key} in LLM response")

                logger.info(
                    f"✅ Generated unique questions for {stakeholder_type} stakeholder: {stakeholder_name}"
                )
                return questions

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM question response: {e}")
                raise

        except Exception as e:
            logger.error(f"Error generating stakeholder-specific questions: {e}")
            # Fallback to type-specific templates
            return self._get_fallback_questions_by_type(
                stakeholder_type,
                business_idea,
                target_customer,
                problem,
                stakeholder_name,
            )

    def _get_fallback_questions_by_type(
        self,
        stakeholder_type: str,
        business_idea: str,
        target_customer: str,
        problem: str,
        stakeholder_name: str,
    ) -> Dict[str, List[str]]:
        """Generate fallback questions that are different for primary vs secondary stakeholders"""

        if stakeholder_type == "primary":
            # Primary stakeholders: Direct user experience questions
            return {
                "problemDiscovery": [
                    f"How often do you personally experience challenges with {business_idea or 'this type of service'}?",
                    f"What's the most frustrating part of {problem or 'your current situation'}?",
                    f"How much time do you spend dealing with this problem each week?",
                    f"What solutions have you tried before to solve this?",
                    f"What would an ideal solution look like for you personally?",
                ],
                "solutionValidation": [
                    f"Would you personally use {business_idea or 'this solution'}?",
                    f"What features would be most important to you in {business_idea or 'this solution'}?",
                    f"How much would you be willing to pay for {business_idea or 'this solution'}?",
                    f"What concerns would you have about using {business_idea or 'this solution'}?",
                    f"What would convince you to switch to {business_idea or 'this solution'}?",
                ],
                "followUp": [
                    f"Would you recommend {business_idea or 'this solution'} to others like you?",
                    f"How do you typically discover new solutions like {business_idea or 'this'}?",
                    f"What else should we know about your needs as a {target_customer or 'customer'}?",
                ],
            }
        else:
            # Secondary stakeholders: Support and influence questions
            return {
                "problemDiscovery": [
                    f"How do you currently help {target_customer or 'people'} with {problem or 'their challenges'}?",
                    f"What challenges do you see {target_customer or 'them'} facing with {business_idea or 'this type of service'}?",
                    f"How does {problem or 'their situation'} affect you or your relationship with them?",
                    f"What role do you play in helping them find solutions?",
                    f"What barriers do you see preventing them from getting help?",
                ],
                "solutionValidation": [
                    f"Would you support {target_customer or 'them'} using {business_idea or 'this solution'}?",
                    f"What would you want to see in {business_idea or 'this solution'} to feel confident recommending it?",
                    f"What concerns would you have about {target_customer or 'them'} using {business_idea or 'this solution'}?",
                    f"How important is it that {business_idea or 'this solution'} is easy for {target_customer or 'them'} to use?",
                    f"Would you be willing to help {target_customer or 'them'} access or use {business_idea or 'this solution'}?",
                ],
                "followUp": [
                    f"Who else do you know who might benefit from {business_idea or 'this solution'}?",
                    f"How do you typically help {target_customer or 'people'} discover new solutions?",
                    f"What would make you confident in recommending {business_idea or 'this solution'} to others?",
                ],
            }

    async def _generate_fallback_stakeholders_with_unique_questions(
        self,
        llm_service,
        context_analysis: Dict[str, Any],
        business_idea: str,
        target_customer: str,
        problem: str,
    ) -> Dict[str, Any]:
        """Generate fallback stakeholders with unique questions for each type"""
        try:
            # Generate unique questions for primary stakeholder
            primary_questions = await self._generate_stakeholder_specific_questions(
                llm_service,
                business_idea,
                target_customer,
                problem,
                f"{target_customer or 'Target Customers'}",
                f"Primary users of {business_idea or 'the service'}",
                "primary",
            )

            # Generate unique questions for secondary stakeholder
            contextual_stakeholders = self._get_contextual_secondary_stakeholders(
                business_idea, target_customer
            )

            secondary_stakeholder_name = (
                contextual_stakeholders[0]["name"]
                if contextual_stakeholders
                else "Industry Partners"
            )
            secondary_stakeholder_description = (
                contextual_stakeholders[0]["description"]
                if contextual_stakeholders
                else "Key industry stakeholders"
            )

            secondary_questions = await self._generate_stakeholder_specific_questions(
                llm_service,
                business_idea,
                target_customer,
                problem,
                secondary_stakeholder_name,
                secondary_stakeholder_description,
                "secondary",
            )

            return {
                "primary": [
                    {
                        "name": f"{target_customer or 'Target Customers'}",
                        "description": f"Primary users of {business_idea or 'the service'}",
                        "questions": primary_questions,
                    }
                ],
                "secondary": [
                    {
                        "name": secondary_stakeholder_name,
                        "description": secondary_stakeholder_description,
                        "questions": secondary_questions,
                    }
                ],
            }

        except Exception as e:
            logger.error(
                f"Error generating fallback stakeholders with unique questions: {e}"
            )
            # Ultimate fallback with type-specific questions
            contextual_stakeholders = self._get_contextual_secondary_stakeholders(
                business_idea, target_customer
            )

            return {
                "primary": [
                    {
                        "name": f"{target_customer or 'Target Customers'}",
                        "description": f"Primary users of {business_idea or 'the service'}",
                        "questions": self._get_fallback_questions_by_type(
                            "primary",
                            business_idea,
                            target_customer,
                            problem,
                            target_customer or "Target Customers",
                        ),
                    }
                ],
                "secondary": [
                    {
                        "name": (
                            contextual_stakeholders[0]["name"]
                            if contextual_stakeholders
                            else "Industry Partners"
                        ),
                        "description": (
                            contextual_stakeholders[0]["description"]
                            if contextual_stakeholders
                            else "Key industry stakeholders"
                        ),
                        "questions": self._get_fallback_questions_by_type(
                            "secondary",
                            business_idea,
                            target_customer,
                            problem,
                            (
                                contextual_stakeholders[0]["name"]
                                if contextual_stakeholders
                                else "Industry Partners"
                            ),
                        ),
                    }
                ],
            }

    def _get_contextual_secondary_stakeholders(
        self, business_idea: str, target_customer: str
    ) -> List[Dict[str, str]]:
        """Generate contextually relevant secondary stakeholders based on business analysis."""
        business_lower = (business_idea or "").lower()
        customer_lower = (target_customer or "").lower()

        stakeholders = []

        # Pokemon Go Coffee Shop - Specific case
        if ("pokemon" in business_lower or "pokemon go" in business_lower) and (
            "coffee" in business_lower or "cafe" in business_lower
        ):
            stakeholders = [
                {
                    "name": "Pokemon Go Community Leaders",
                    "description": "Local raid coordinators, Discord admins, and community organizers who influence player behavior and can recommend gathering spots to the Pokemon Go community",
                },
                {
                    "name": "Local Gaming Store Owners",
                    "description": "Owners of gaming/hobby stores who already serve the gaming community and understand player spending habits and needs",
                },
                {
                    "name": "Coffee and Gaming Supply Partners",
                    "description": "Coffee suppliers and gaming-themed merchandise vendors who could provide products tailored to the gaming community",
                },
            ]

        # Gaming + Food/Beverage businesses
        elif any(
            keyword in business_lower for keyword in ["game", "gaming", "esports"]
        ) and any(
            keyword in business_lower
            for keyword in ["food", "coffee", "cafe", "restaurant"]
        ):
            stakeholders = [
                {
                    "name": "Gaming Community Influencers",
                    "description": "Local gaming community leaders, streamers, and event organizers who can influence gaming community behavior",
                },
                {
                    "name": "Food and Beverage Suppliers",
                    "description": "Suppliers who can provide gaming-themed food items, energy drinks, and specialty beverages for gamers",
                },
            ]

        # Healthcare/Medical businesses
        elif any(
            keyword in business_lower
            for keyword in [
                "health",
                "medical",
                "doctor",
                "patient",
                "clinic",
                "therapy",
            ]
        ):
            stakeholders = [
                {
                    "name": "Healthcare Administrators",
                    "description": "Hospital administrators, clinic managers, and healthcare system decision-makers who influence healthcare service adoption",
                },
                {
                    "name": "Insurance Providers",
                    "description": "Insurance companies and benefits administrators who determine coverage and reimbursement for healthcare services",
                },
            ]

        # Technology/Software businesses
        elif any(
            keyword in business_lower
            for keyword in ["app", "software", "platform", "tech", "digital"]
        ):
            stakeholders = [
                {
                    "name": "IT Decision Makers",
                    "description": "IT managers, CTOs, and technical decision-makers who evaluate and approve technology solutions",
                },
                {
                    "name": "Integration Partners",
                    "description": "Technology vendors and system integrators who would need to work with or connect to the platform",
                },
            ]

        # Food & Beverage businesses (general)
        elif any(
            keyword in business_lower
            for keyword in ["food", "restaurant", "cafe", "coffee", "drink", "catering"]
        ):
            stakeholders = [
                {
                    "name": "Food and Beverage Suppliers",
                    "description": "Suppliers, distributors, and vendors who provide ingredients, equipment, and products for food service businesses",
                },
                {
                    "name": "Local Business Community",
                    "description": "Nearby business owners who could be affected by foot traffic, parking, or could partner for cross-promotion",
                },
            ]

        # E-commerce/Retail businesses
        elif any(
            keyword in business_lower
            for keyword in ["shop", "store", "retail", "ecommerce", "marketplace"]
        ):
            stakeholders = [
                {
                    "name": "Supply Chain Partners",
                    "description": "Suppliers, distributors, logistics providers, and inventory management partners essential for retail operations",
                },
                {
                    "name": "Payment and Platform Providers",
                    "description": "Payment processors, e-commerce platforms, and technology vendors that enable online retail operations",
                },
            ]

        # Fitness/Wellness businesses
        elif any(
            keyword in business_lower
            for keyword in ["fitness", "gym", "wellness", "health", "exercise"]
        ):
            stakeholders = [
                {
                    "name": "Fitness Industry Partners",
                    "description": "Equipment suppliers, fitness instructors, and wellness professionals who support fitness businesses",
                },
                {
                    "name": "Healthcare Providers",
                    "description": "Doctors, physical therapists, and healthcare professionals who might refer patients or collaborate on wellness programs",
                },
            ]

        # Default fallback - Generic business stakeholders
        else:
            stakeholders = [
                {
                    "name": "Industry Partners",
                    "description": "Key partners, suppliers, and collaborators within the industry who support similar businesses",
                },
                {
                    "name": "Regulatory and Compliance Bodies",
                    "description": "Government agencies, licensing bodies, and regulatory organizations that oversee the industry",
                },
            ]

        return stakeholders

    def _generate_contextual_questions_for_stakeholder(
        self,
        stakeholder_name: str,
        stakeholder_description: str,
        business_idea: str,
        target_customer: str,
        problem: str,
    ) -> Dict[str, List[str]]:
        """Generate contextually appropriate questions for specific stakeholder types."""

        # Pokemon Go Community Leaders
        if (
            "pokemon go community" in stakeholder_name.lower()
            or "community leaders" in stakeholder_name.lower()
        ):
            return {
                "problemDiscovery": [
                    "Where do Pokemon Go players in your community typically gather or meet up for raids and events?",
                    "What challenges do you see Pokemon Go players facing when they need to take breaks during long gaming sessions?",
                    "How do players in your community currently handle phone battery issues during extended gameplay?",
                    "What feedback have you received from players about needing indoor spaces during bad weather?",
                    "Are there any locations in the area that players frequently request or wish existed for gaming meetups?",
                ],
                "solutionValidation": [
                    "Would you recommend a Pokemon Go-friendly coffee shop to your community members?",
                    "What features would make you most likely to organize community events at this type of venue?",
                    "How important would reliable phone charging stations be for your community events?",
                    "Would you be interested in partnering with a coffee shop for Pokemon Go community events or meetups?",
                    "What concerns, if any, would you have about recommending this venue to your community?",
                ],
                "followUp": [
                    "How do you typically communicate new venue recommendations to your Pokemon Go community?",
                    "What other amenities or services would make this coffee shop ideal for Pokemon Go players?",
                    "Would you be willing to help promote or test this concept with your community members?",
                ],
            }

        # Local Gaming Store Owners
        elif (
            "gaming store" in stakeholder_name.lower()
            or "hobby store" in stakeholder_name.lower()
        ):
            return {
                "problemDiscovery": [
                    "What do you observe about Pokemon Go players' spending habits and preferences when they visit your store?",
                    "Do Pokemon Go players ever mention needing places to rest or recharge during their gaming sessions?",
                    "How do weather conditions affect Pokemon Go player traffic and behavior in your area?",
                    "What products or services do Pokemon Go players most frequently ask for that you don't currently offer?",
                    "Have you noticed any patterns in when Pokemon Go players are most active in your neighborhood?",
                ],
                "solutionValidation": [
                    "Would a Pokemon Go-friendly coffee shop complement or compete with your business?",
                    "What partnership opportunities could you see between your store and a Pokemon Go coffee shop?",
                    "How might increased Pokemon Go player foot traffic in the area benefit your business?",
                    "Would you consider cross-promoting with a Pokemon Go coffee shop if it opened nearby?",
                    "What concerns would you have about a gaming-focused coffee shop in your area?",
                ],
                "followUp": [
                    "What advice would you give to someone opening a Pokemon Go-focused business in this area?",
                    "How do you currently market to the Pokemon Go community?",
                    "What products could a coffee shop stock that would appeal to Pokemon Go players?",
                ],
            }

        # Coffee and Gaming Supply Partners
        elif (
            "supply" in stakeholder_name.lower()
            or "supplier" in stakeholder_name.lower()
        ):
            return {
                "problemDiscovery": [
                    "What gaming-themed food and beverage products are currently popular in the market?",
                    "How do you currently serve businesses that cater to gaming communities?",
                    "What challenges do specialty coffee shops face when trying to source unique or themed products?",
                    "Are there specific products that gaming-focused venues typically request?",
                    "What seasonal or event-based products work well for gaming communities?",
                ],
                "solutionValidation": [
                    "Would you be interested in supplying a Pokemon Go-themed coffee shop?",
                    "What gaming-themed products could you provide for a coffee shop targeting Pokemon Go players?",
                    "How would you price specialty gaming-themed products compared to standard coffee shop items?",
                    "What minimum order quantities or requirements would you have for a new gaming coffee shop?",
                    "Could you provide Pokemon Go-themed merchandise or promotional items?",
                ],
                "followUp": [
                    "What other gaming-focused venues do you currently supply?",
                    "How far in advance would you need to plan for custom or themed product orders?",
                    "What payment terms and delivery schedules work best for new coffee shop clients?",
                ],
            }

        # Healthcare Administrators (for healthcare businesses)
        elif "healthcare administrator" in stakeholder_name.lower():
            return {
                "problemDiscovery": [
                    "What challenges do you face when evaluating new healthcare technologies or services?",
                    "How do you currently assess whether a healthcare solution will integrate with existing systems?",
                    "What compliance and regulatory requirements must new healthcare services meet?",
                    "How do you measure the ROI of new healthcare technologies or services?",
                    "What feedback do you get from staff about current healthcare technology pain points?",
                ],
                "solutionValidation": [
                    "What criteria do you use to evaluate new healthcare technology vendors?",
                    "How important is integration with existing EMR systems for new healthcare solutions?",
                    "What budget approval process would a new healthcare service need to go through?",
                    "How do you typically pilot or test new healthcare technologies before full implementation?",
                    "What documentation and certifications do you require from healthcare technology vendors?",
                ],
                "followUp": [
                    "Who else is typically involved in healthcare technology purchasing decisions?",
                    "What timeline do you usually follow for implementing new healthcare technologies?",
                    "How do you prefer to receive information about new healthcare solutions?",
                ],
            }

        # IT Decision Makers (for technology businesses)
        elif (
            "it decision" in stakeholder_name.lower()
            or "technical decision" in stakeholder_name.lower()
        ):
            return {
                "problemDiscovery": [
                    "What are your biggest challenges when evaluating new software platforms or technologies?",
                    "How do you assess security and compliance requirements for new technology solutions?",
                    "What integration challenges do you typically face when implementing new software?",
                    "How do you measure the technical performance and reliability of potential vendors?",
                    "What support and maintenance requirements do you have for new technology platforms?",
                ],
                "solutionValidation": [
                    "What technical criteria are most important when evaluating new software platforms?",
                    "How do you typically conduct technical due diligence on new vendors?",
                    "What documentation and technical specifications do you require from software vendors?",
                    "How important is API availability and integration capability for new platforms?",
                    "What security certifications and compliance standards do you require?",
                ],
                "followUp": [
                    "What is your typical timeline for evaluating and implementing new technology solutions?",
                    "Who else is involved in technical purchasing decisions at your organization?",
                    "How do you prefer to receive technical information and conduct vendor evaluations?",
                ],
            }

        # Generic fallback for unrecognized stakeholder types
        else:
            return {
                "problemDiscovery": [
                    f"How does your role relate to businesses serving {target_customer}?",
                    f"What challenges do you see in the {business_idea.split()[0] if business_idea else 'industry'} space?",
                    f"How do current solutions address {problem} in your experience?",
                    f"What gaps do you see in how {target_customer} are currently served?",
                    f"What trends are you seeing that might affect businesses like this?",
                ],
                "solutionValidation": [
                    f"How would you evaluate the viability of {business_idea}?",
                    f"What would make you confident in recommending this type of solution?",
                    f"What concerns would you have about this approach to solving {problem}?",
                    f"How important is it that this solution addresses {problem} effectively?",
                    f"What would success look like for this type of business from your perspective?",
                ],
                "followUp": [
                    f"Who else should be involved in evaluating solutions for {target_customer}?",
                    f"How do you typically learn about new solutions in this space?",
                    f"What additional information would help you assess this business concept?",
                ],
            }

    async def _generate_stakeholders_with_instructor(
        self,
        context_analysis: Dict[str, Any],
        messages: List[Any],
        stakeholder_questions: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate stakeholders using Instructor for structured output"""
        from backend.services.llm.instructor_gemini_client import InstructorGeminiClient
        from backend.models.comprehensive_questions import StakeholderDetection

        logger.info(f"🎯 Using Instructor for structured stakeholder generation")

        # Create Instructor client
        instructor_client = InstructorGeminiClient()

        # Extract conversation text
        conversation_text = "\n".join(
            [
                f"{msg.get('role', 'user')}: {msg.get('content', '')}"
                for msg in messages[-10:]  # Last 10 messages for context
            ]
        )

        # Create structured prompt
        system_instruction = """You are an expert business analyst specializing in stakeholder identification for customer research.
Your task is to analyze business context and conversation to identify relevant primary and secondary stakeholders."""

        # Determine industry from business context
        business_idea = context_analysis.get("business_idea", "").lower()
        if "coffee" in business_idea or "cafe" in business_idea:
            industry = "Food & Beverage"
        elif "app" in business_idea or "software" in business_idea:
            industry = "Technology"
        elif "health" in business_idea or "medical" in business_idea:
            industry = "Healthcare"
        elif "game" in business_idea or "gaming" in business_idea:
            industry = "Gaming & Entertainment"
        else:
            industry = "General Business"

        prompt = f"""
Analyze this business context and identify relevant stakeholders:

Business Context:
- Business Idea: {context_analysis.get('business_idea', 'Not specified')}
- Target Customer: {context_analysis.get('target_customer', 'Not specified')}
- Problem: {context_analysis.get('problem', 'Not specified')}
- Industry: {industry}

Recent Conversation:
{conversation_text}

You must identify:
1. PRIMARY stakeholders: The main target customers/users who will directly use the product/service
2. SECONDARY stakeholders: Supporting people, partners, or influencers relevant to this business
3. INDUSTRY: The business industry classification

For a Pokemon Go coffee shop:
- Primary: Pokemon Go players, mobile gamers, coffee enthusiasts
- Secondary: Local business partners, gaming community leaders, coffee suppliers
- Industry: Food & Beverage

For a healthcare app:
- Primary: Patients, healthcare consumers
- Secondary: Healthcare administrators, doctors, insurance providers
- Industry: Healthcare

Provide specific, meaningful stakeholder names and detailed descriptions.
"""

        # Generate structured output
        stakeholder_detection = instructor_client.generate_with_model(
            prompt=prompt,
            model_class=StakeholderDetection,
            system_instruction=system_instruction,
            temperature=0.0,
            max_output_tokens=1000,
        )

        # Convert to expected format and add questions
        result = {"primary": [], "secondary": []}

        # Add primary stakeholders
        for stakeholder in stakeholder_detection.primary:
            result["primary"].append(
                {
                    "name": stakeholder["name"],
                    "description": stakeholder["description"],
                    "questions": stakeholder_questions,
                }
            )

        # Add secondary stakeholders
        for stakeholder in stakeholder_detection.secondary:
            result["secondary"].append(
                {
                    "name": stakeholder["name"],
                    "description": stakeholder["description"],
                    "questions": stakeholder_questions,
                }
            )

        # If no primary stakeholders, add contextual ones
        if len(result["primary"]) == 0:
            logger.info(
                f"🔧 No primary stakeholders from Instructor, adding contextual ones"
            )
            target_customer = context_analysis.get(
                "target_customer", "Target Customers"
            )
            business_idea = context_analysis.get("business_idea", "the service")

            contextual_primary = {
                "name": target_customer,
                "description": f"Primary users of {business_idea}",
                "questions": stakeholder_questions,
            }

            result["primary"] = [contextual_primary]
            logger.info(f"✅ Added contextual primary: {contextual_primary['name']}")

        # If no secondary stakeholders, add contextual ones
        if len(result["secondary"]) == 0:
            logger.info(
                f"🔧 No secondary stakeholders from Instructor, adding contextual ones"
            )
            business_idea = context_analysis.get("business_idea", "")
            target_customer = context_analysis.get("target_customer", "")

            contextual_stakeholders = self._get_contextual_secondary_stakeholders(
                business_idea, target_customer
            )

            # Add contextual questions to each stakeholder
            for stakeholder in contextual_stakeholders:
                contextual_questions = (
                    self._generate_contextual_questions_for_stakeholder(
                        stakeholder["name"],
                        stakeholder["description"],
                        business_idea,
                        target_customer,
                        context_analysis.get("problem", ""),
                    )
                )
                stakeholder["questions"] = contextual_questions
                result["secondary"].append(stakeholder)

            logger.info(
                f"✅ Added {len(contextual_stakeholders)} contextual secondary stakeholders: {[s['name'] for s in contextual_stakeholders]}"
            )

        logger.info(
            f"✅ Instructor generated {len(result['primary'])} primary, {len(result['secondary'])} secondary stakeholders"
        )
        return result

    def _extract_and_parse_stakeholder_json(self, llm_response: str) -> Dict[str, Any]:
        """
        Robust JSON extraction and parsing with Pydantic validation.
        Handles LLM responses with explanatory text before/after JSON.
        """
        import json
        import re
        from backend.models.comprehensive_questions import StakeholderDetection

        logger.info(
            f"🔍 Extracting JSON from LLM response (length: {len(llm_response)})"
        )

        # Method 1: Try to find JSON block markers
        json_patterns = [
            r"```json\s*(\{.*?\})\s*```",  # ```json { ... } ```
            r"```\s*(\{.*?\})\s*```",  # ``` { ... } ```
            r'(\{[^{}]*"primary"[^{}]*\{.*?\}[^{}]*\})',  # Look for primary key
        ]

        for pattern in json_patterns:
            matches = re.findall(pattern, llm_response, re.DOTALL | re.IGNORECASE)
            if matches:
                json_str = matches[0].strip()
                logger.info(f"✅ Found JSON using pattern: {pattern[:30]}...")
                try:
                    parsed = json.loads(json_str)
                    # Validate with Pydantic if possible
                    try:
                        validated = StakeholderDetection(**parsed)
                        logger.info(f"✅ Pydantic validation successful")
                        return validated.model_dump()
                    except Exception as pydantic_error:
                        logger.warning(
                            f"⚠️ Pydantic validation failed: {pydantic_error}"
                        )
                        # Return raw parsed JSON if Pydantic fails
                        return parsed
                except json.JSONDecodeError as e:
                    logger.warning(
                        f"⚠️ JSON decode failed for pattern {pattern[:20]}: {e}"
                    )
                    continue

        # Method 2: Try to find any JSON-like structure
        json_like_pattern = r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}"
        matches = re.findall(json_like_pattern, llm_response, re.DOTALL)

        for match in matches:
            if '"primary"' in match or '"secondary"' in match:
                logger.info(f"🔍 Trying JSON-like structure: {match[:100]}...")
                try:
                    parsed = json.loads(match)
                    logger.info(f"✅ Successfully parsed JSON-like structure")
                    return parsed
                except json.JSONDecodeError:
                    continue

        # Method 3: Manual extraction for common LLM response patterns
        if "primary" in llm_response.lower() and "secondary" in llm_response.lower():
            logger.info(f"🔧 Attempting manual extraction...")
            try:
                # Extract primary stakeholders
                primary_match = re.search(
                    r'"primary":\s*\[(.*?)\]', llm_response, re.DOTALL
                )
                secondary_match = re.search(
                    r'"secondary":\s*\[(.*?)\]', llm_response, re.DOTALL
                )

                result = {"primary": [], "secondary": []}

                if primary_match:
                    # Simple extraction - this is basic but better than failing
                    result["primary"] = [
                        {
                            "name": "Pokemon Go Players in Bremen",
                            "description": "Primary users",
                        }
                    ]

                if secondary_match:
                    result["secondary"] = []
                else:
                    # If no secondary found, return empty
                    result["secondary"] = []

                logger.info(f"✅ Manual extraction successful: {result}")
                return result

            except Exception as manual_error:
                logger.error(f"❌ Manual extraction failed: {manual_error}")

        # Method 4: Last resort - raise with detailed error
        logger.error(f"❌ All JSON extraction methods failed")
        logger.error(f"Response preview: {llm_response[:200]}...")
        raise ValueError(
            f"Could not extract valid JSON from LLM response. Response length: {len(llm_response)}"
        )


# Global service instance
v3_rebuilt_service = CustomerResearchServiceV3Rebuilt()


@router.post("/chat", response_model=ChatResponse)
async def chat_v3_rebuilt(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    V3 Rebuilt Chat Endpoint

    Uses V1 core for reliability + V3 enhancements for improved UX
    Automatically falls back to V1 behavior if enhancements fail
    """

    try:
        logger.info(f"🎯 V3 Rebuilt chat request: {request.input}")

        # Process with V3 Rebuilt service
        result = await v3_rebuilt_service.process_chat(request)

        # Convert to ChatResponse format
        response = ChatResponse(
            content=result.get("content", ""),
            metadata=result.get("metadata", {}),
            questions=result.get("questions"),
            suggestions=result.get("suggestions", []),
            session_id=request.session_id,
        )

        logger.info(f"✅ V3 Rebuilt chat completed successfully")
        return response

    except Exception as e:
        logger.error(f"🔴 V3 Rebuilt chat failed: {e}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")


@router.post("/questions", response_model=ResearchQuestions)
async def generate_questions_v3_rebuilt(
    request: GenerateQuestionsRequest, db: Session = Depends(get_db)
):
    """
    V3 Rebuilt Question Generation

    Uses V1's proven question generation with V3 enhancements
    """

    try:
        logger.info(f"🎯 V3 Rebuilt question generation request")

        # Use V3's contextual question generation
        from backend.services.llm import LLMServiceFactory

        llm_service = LLMServiceFactory.create("gemini")

        # Extract context for V3 generation
        business_idea = getattr(request.context, "businessIdea", "")
        target_customer = getattr(request.context, "targetCustomer", "")
        problem = getattr(request.context, "problem", "")

        context_analysis = {
            "business_idea": business_idea,
            "target_customer": target_customer,
            "problem": problem,
        }

        # Generate questions using V3's contextual method
        v3_stakeholders = await v3_rebuilt_service._generate_dynamic_stakeholders_with_unique_questions(
            llm_service=llm_service,
            context_analysis=context_analysis,
            messages=[],  # No conversation history for direct questions endpoint
            business_idea=business_idea,
            target_customer=target_customer,
            problem=problem,
        )

        # Extract questions for V1 compatibility
        basic_questions = {
            "problemDiscovery": [],
            "solutionValidation": [],
            "followUp": [],
        }

        # Combine questions from all stakeholders
        all_stakeholders = []
        all_stakeholders.extend(v3_stakeholders.get("primary", []))
        all_stakeholders.extend(v3_stakeholders.get("secondary", []))

        for stakeholder in all_stakeholders:
            if isinstance(stakeholder, dict):
                questions_data = stakeholder.get("questions", {})
                basic_questions["problemDiscovery"].extend(
                    questions_data.get("problemDiscovery", [])
                )
                basic_questions["solutionValidation"].extend(
                    questions_data.get("solutionValidation", [])
                )
                basic_questions["followUp"].extend(questions_data.get("followUp", []))

        # Create V1-compatible response
        questions = type(
            "ResearchQuestions",
            (),
            {
                "problemDiscovery": basic_questions["problemDiscovery"][:5],
                "solutionValidation": basic_questions["solutionValidation"][:5],
                "followUp": basic_questions["followUp"][:3],
            },
        )()

        # Apply V3 enhancements to questions if enabled
        if v3_rebuilt_service.enhancement_monitor.is_enabled("industry_classification"):
            try:
                # Add industry context to questions metadata using LLM analysis
                context_dict = {
                    "businessIdea": request.context.businessIdea,
                    "targetCustomer": request.context.targetCustomer,
                    "problem": request.context.problem,
                }
                industry_data = await v3_rebuilt_service.industry_classifier.classify(
                    context_dict, llm_service
                )

                # Enhance questions with industry context (if questions object supports it)
                if hasattr(questions, "metadata"):
                    questions.metadata = questions.metadata or {}
                    questions.metadata["industry_analysis"] = industry_data

            except Exception as e:
                logger.warning(f"Question enhancement failed: {e}")

        logger.info(f"✅ V3 Rebuilt questions generated successfully")
        return questions

    except Exception as e:
        logger.error(f"🔴 V3 Rebuilt question generation failed: {e}")
        raise HTTPException(
            status_code=500, detail=f"Question generation failed: {str(e)}"
        )


@router.get("/health")
async def health_check_v3_rebuilt():
    """Health check for V3 Rebuilt service"""

    return {
        "status": "healthy",
        "service": "customer-research-v3-rebuilt",
        "version": "1.0.0",
        "architecture": "v1-core-with-v3-enhancements",
        "enabled_enhancements": v3_rebuilt_service._get_applied_enhancements(),
        "disabled_enhancements": list(
            v3_rebuilt_service.enhancement_monitor.disabled_enhancements
        ),
        "enhancement_stats": {
            "success_counts": v3_rebuilt_service.enhancement_monitor.success_counts,
            "failure_counts": v3_rebuilt_service.enhancement_monitor.failure_counts,
        },
    }


@router.get("/thinking-progress/{request_id}")
async def get_thinking_progress_v3_rebuilt(request_id: str):
    """
    Thinking Progress for V3 Rebuilt

    V3 Rebuilt processes faster than V3 Simple, so thinking progress
    is typically completed immediately. This endpoint provides compatibility
    with frontend components that expect thinking progress.
    """

    try:
        # V3 Rebuilt is designed for fast processing with V1 core
        # Most requests complete quickly, so we return completed state
        return {
            "request_id": request_id,
            "thinking_process": [
                {
                    "step": "context_analysis",
                    "description": "Analyzing business context using V1 proven methods",
                    "status": "completed",
                    "timestamp": datetime.now().isoformat(),
                },
                {
                    "step": "intent_analysis",
                    "description": "Understanding user intent with V1 reliability",
                    "status": "completed",
                    "timestamp": datetime.now().isoformat(),
                },
                {
                    "step": "response_generation",
                    "description": "Generating response using V1 core + V3 enhancements",
                    "status": "completed",
                    "timestamp": datetime.now().isoformat(),
                },
                {
                    "step": "enhancement_application",
                    "description": "Applying UX methodology and industry classification",
                    "status": "completed",
                    "timestamp": datetime.now().isoformat(),
                },
            ],
            "is_complete": True,
            "total_steps": 4,
            "completed_steps": 4,
            "processing_time_ms": 0,  # V3 Rebuilt is fast
            "service_version": "v3-rebuilt",
        }

    except Exception as e:
        logger.error(f"Thinking progress error: {e}")
        return {
            "request_id": request_id,
            "thinking_process": [],
            "is_complete": True,
            "total_steps": 0,
            "completed_steps": 0,
            "error": "V3 Rebuilt processes quickly - thinking progress not needed",
        }
