"""
Question generation functions for Customer Research API v3 Simplified.

This module contains all question generation and response creation logic
for the V3 Simple customer research system.

Extracted from customer_research_v3_simple.py for better modularity.
"""

import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


async def generate_response_enhanced(
    service,
    conversation_context: str,
    latest_input: str,
    context_analysis: Dict[str, Any],
    intent_analysis: Dict[str, Any],
    business_validation: Dict[str, Any],
    industry_analysis: Optional[Dict[str, Any]],
    stakeholder_detection: Optional[Dict[str, Any]],
    conversation_flow: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate enhanced response with V3 features."""

    try:
        # Check if we should generate questions
        should_generate_questions = _should_generate_questions(
            context_analysis, intent_analysis, business_validation, conversation_flow
        )

        if should_generate_questions:
            logger.info("Generating comprehensive questions")
            return await _generate_comprehensive_questions(
                service,
                context_analysis,
                stakeholder_detection,
                industry_analysis,
                conversation_flow,
            )
        else:
            logger.info("Generating UX research methodology-based guidance response")
            return await _generate_guidance_response(
                service,
                conversation_context,
                latest_input,
                context_analysis,
                intent_analysis,
                business_validation,
                conversation_flow,
                industry_analysis,
                stakeholder_detection,
            )

    except Exception as e:
        logger.error(f"Response generation failed: {e}")
        return _create_fallback_response(context_analysis)


def _should_generate_questions(
    context_analysis: Dict[str, Any],
    intent_analysis: Dict[str, Any],
    business_validation: Dict[str, Any],
    conversation_flow: Dict[str, Any],
) -> bool:
    """Determine if we should generate questions (V1 sustainable pattern)."""

    try:
        # V1 SUSTAINABLE PATTERN: Simple intent-based decision
        user_intent = intent_analysis.get("intent", "")
        user_wants_questions = user_intent in ["question_request", "generate_questions"]

        # V1 SUSTAINABLE PATTERN: Basic context check (not complex multi-condition)
        business_idea_1 = context_analysis.get("businessIdea")
        business_idea_2 = context_analysis.get("business_idea")
        has_business_context = bool(business_idea_1 or business_idea_2)

        # SIMPLE DECISION: User wants questions + has some business context
        should_generate = user_wants_questions and has_business_context

        logger.info(f"🎯 V1 Sustainable Question Decision: {should_generate}")
        logger.info(
            f"  - User wants questions: {user_wants_questions} (intent: {user_intent})"
        )
        logger.info(f"  - Has business context: {has_business_context}")
        logger.info(f"  - businessIdea: {business_idea_1}")
        logger.info(f"  - business_idea: {business_idea_2}")
        logger.info(f"  - context_analysis keys: {list(context_analysis.keys())}")

        # Log additional context for debugging (but don't use in decision)
        logger.debug(
            f"  - Business ready: {business_validation.get('ready_for_questions', False)}"
        )
        logger.debug(
            f"  - Conversation ready: {conversation_flow.get('readiness_for_questions', False)}"
        )

        return should_generate

    except Exception as e:
        logger.error(f"🚨 CRITICAL ERROR in question generation decision: {e}")
        import traceback

        logger.error(f"🚨 Full traceback: {traceback.format_exc()}")
        return False


async def _generate_comprehensive_questions(
    service,
    context_analysis: Dict[str, Any],
    stakeholder_detection: Optional[Dict[str, Any]],
    industry_analysis: Optional[Dict[str, Any]],
    conversation_flow: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate comprehensive questions using V3 stakeholder data with V1 Instructor reliability."""

    try:
        logger.info(
            "🚀 V3 SUSTAINABLE: Using Instructor for reliable question generation"
        )

        # V3 SUSTAINABLE: Use proven V1 question generation with Pydantic
        logger.info(
            "🚀 V3 SUSTAINABLE: Using proven V1 question generation with Pydantic"
        )

        # Import V1 proven comprehensive question generation
        from backend.api.routes.customer_research import (
            generate_comprehensive_research_questions,
            ResearchContext,
        )
        from backend.services.llm import LLMServiceFactory

        # Create LLM service
        llm_service = LLMServiceFactory.create("gemini")

        # Convert context to V1 format
        business_idea = context_analysis.get("businessIdea") or context_analysis.get(
            "business_idea", "your business"
        )
        target_customer = context_analysis.get(
            "targetCustomer"
        ) or context_analysis.get("target_customer", "customers")
        problem = context_analysis.get("problem", "challenges they face")

        v1_context = ResearchContext(
            businessIdea=business_idea, targetCustomer=target_customer, problem=problem
        )

        # Use V1 proven comprehensive question generation with Instructor + Pydantic
        logger.info(
            "🎯 V3 SUSTAINABLE: Using V1 proven question generation with Pydantic models"
        )
        comprehensive_questions = await generate_comprehensive_research_questions(
            llm_service=llm_service,
            context=v1_context,
            conversation_history=[],  # V3 doesn't use conversation history for questions
            stakeholder_data=stakeholder_detection,  # Pass V3 stakeholder data if available
        )

        # Extract key metrics for logging and frontend display
        primary_count = len(comprehensive_questions.get("primaryStakeholders", []))
        secondary_count = len(comprehensive_questions.get("secondaryStakeholders", []))
        time_estimate = comprehensive_questions.get("timeEstimate", {})
        total_questions = time_estimate.get("totalQuestions", 0)
        estimated_minutes = time_estimate.get("estimatedMinutes", "0-0")

        logger.info(
            f"✅ V1 Instructor generated comprehensive questions: {primary_count} primary, {secondary_count} secondary stakeholders, {total_questions} total questions, {estimated_minutes} minutes"
        )

        # Return response with comprehensive questions and all metadata
        return {
            "content": f"Perfect! I've generated comprehensive research questions for your {business_idea}. These questions will help you validate the market need and refine your solution.",
            "questions": comprehensive_questions,
            "suggestions": [],
            "metadata": {
                "questions_generated": True,
                "workflow_version": "v3_simple_v1_instructor_integration",
                "comprehensiveQuestions": comprehensive_questions,
                "businessContext": f"{business_idea}, addressing {problem}",
                "type": "component",
                "request_id": service.request_id,
                "generation_method": "v1_instructor_pydantic",
                "question_metrics": {
                    "primary_stakeholders": primary_count,
                    "secondary_stakeholders": secondary_count,
                    "total_questions": total_questions,
                    "estimated_minutes": estimated_minutes,
                    "breakdown": time_estimate.get("breakdown", {}),
                },
            },
        }

    except Exception as e:
        logger.error(f"Comprehensive question generation failed: {e}")
        return await _create_emergency_questions(context_analysis)


# Removed broken Instructor function - V3 now uses proven V1 question generation directly


async def _generate_stakeholder_questions(
    stakeholder: Dict[str, Any],
    business_idea: str,
    target_customer: str,
    problem: str,
    stakeholder_type: str,
) -> Dict[str, Any]:
    """Generate questions for a specific stakeholder."""

    try:
        stakeholder_name = (
            stakeholder.get("name", "Stakeholder")
            if isinstance(stakeholder, dict)
            else str(stakeholder)
        )
        stakeholder_desc = (
            stakeholder.get("description", "Key stakeholder")
            if isinstance(stakeholder, dict)
            else f"Key stakeholder: {stakeholder}"
        )

        if stakeholder_type == "primary":
            # Generate contextual questions using LLM instead of templates
            contextual_questions = await _generate_contextual_questions_with_llm(
                business_idea,
                target_customer,
                problem,
                stakeholder_name,
                stakeholder_desc,
                "primary",
            )

            return {
                "name": stakeholder_name,
                "description": stakeholder_desc,
                "questions": contextual_questions,
            }
        else:  # secondary
            # Generate contextual questions using LLM instead of templates
            contextual_questions = await _generate_contextual_questions_with_llm(
                business_idea,
                target_customer,
                problem,
                stakeholder_name,
                stakeholder_desc,
                "secondary",
            )

            return {
                "name": stakeholder_name,
                "description": stakeholder_desc,
                "questions": contextual_questions,
            }

    except Exception as e:
        logger.warning(f"Error generating stakeholder questions: {e}")
        return {
            "name": "Stakeholder",
            "description": "Key stakeholder",
            "questions": {
                "problemDiscovery": ["What challenges do you face?"],
                "solutionValidation": ["Would this help you?"],
                "followUp": ["Any other thoughts?"],
            },
        }


async def _generate_contextual_questions_with_llm(
    business_idea: str,
    target_customer: str,
    problem: str,
    stakeholder_name: str,
    stakeholder_desc: str,
    stakeholder_type: str,
) -> Dict[str, List[str]]:
    """Generate contextual questions using LLM instead of hardcoded templates"""
    try:
        from backend.services.llm import LLMServiceFactory

        llm_service = LLMServiceFactory.create("gemini")

        # Enhanced LLM prompt that clearly differentiates stakeholder types
        prompt = f"""
Generate specific, contextual research questions for this stakeholder based on their role and relationship to the business.

BUSINESS CONTEXT:
Business Idea: {business_idea}
Target Customer: {target_customer}
Problem: {problem}

STAKEHOLDER:
Name: {stakeholder_name}
Description: {stakeholder_desc}
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

            logger.info(f"✅ Generated contextual questions for {stakeholder_name}")
            return questions

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM question response: {e}")
            raise

    except Exception as e:
        logger.error(f"Error generating contextual questions: {e}")
        # Fallback to minimal context-aware questions
        return {
            "problemDiscovery": [
                f"What challenges do you currently face with {business_idea or 'this type of service'}?",
                f"How do you currently handle {problem or 'these needs'}?",
                "What's the most frustrating part of your current situation?",
                "How often do you encounter these problems?",
                "What would make this easier for you?",
            ],
            "solutionValidation": [
                f"Would {business_idea or 'this solution'} help solve your problem?",
                "What features would be most important to you?",
                "How much would you be willing to pay for this service?",
                "What would convince you to try this service?",
                "What concerns would you have about using this?",
            ],
            "followUp": [
                "Would you recommend this to others in your situation?",
                "What else should we know about your needs?",
                "Any other feedback or suggestions?",
            ],
        }


def _extract_service_type(business_idea: str) -> str:
    """Extract service type from business idea."""
    try:
        if not business_idea:
            return "this service"

        # Extract the last meaningful word
        words = business_idea.split()
        if words:
            return words[-1].lower()
        return "this service"

    except Exception:
        return "this service"


def _extract_problem_area(problem: str) -> str:
    """Extract problem area from problem description."""
    try:
        if not problem:
            return "these needs"

        # Extract first part before punctuation
        problem_area = problem.split(".")[0].split(",")[0]
        return problem_area.lower() if problem_area else "these needs"

    except Exception:
        return "these needs"


async def _generate_guidance_response(
    service,
    conversation_context: str,
    latest_input: str,
    context_analysis: Dict[str, Any],
    intent_analysis: Dict[str, Any],
    business_validation: Dict[str, Any],
    conversation_flow: Dict[str, Any],
    industry_analysis: Optional[Dict[str, Any]] = None,
    stakeholder_detection: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generate UX research methodology-based guidance response with V3 enhanced analysis."""

    try:
        # Use V1's proven response generation with UX research methodology enhancements
        from backend.services.llm import LLMServiceFactory
        from backend.api.routes.customer_research import (
            generate_research_response_with_retry,
        )

        llm_service = LLMServiceFactory.create("gemini")

        # Convert to V1 format for proven response generation
        business_idea = context_analysis.get("businessIdea") or context_analysis.get(
            "business_idea", ""
        )
        target_customer = context_analysis.get(
            "targetCustomer"
        ) or context_analysis.get("target_customer", "")
        problem = context_analysis.get("problem", "")

        # Create V1-compatible context object
        v1_context = type(
            "Context",
            (),
            {
                "businessIdea": business_idea,
                "targetCustomer": target_customer,
                "problem": problem,
            },
        )()

        # Create V1-compatible messages (simplified for V3)
        v1_messages = [type("Message", (), {"role": "user", "content": latest_input})()]

        # Use V1's proven response generation with UX research methodology prompt enhancement
        response_content = await _generate_ux_research_response_v1_proven(
            llm_service,
            v1_messages,
            latest_input,
            v1_context,
            conversation_context,
            context_analysis,
            intent_analysis,
            business_validation,
            industry_analysis,
        )

        # Determine UX research stage for contextual suggestions
        ux_research_stage = _determine_ux_research_stage(
            context_analysis, intent_analysis, business_validation
        )
        industry_context = _extract_industry_context_for_conversation(context_analysis)
        ready_for_questions = business_validation.get("ready_for_questions", False)

        # Use V1's proven LLM-based suggestion generation with UX research enhancements
        contextual_suggestions = await _generate_contextual_suggestions_v1_proven(
            llm_service,
            conversation_context,
            latest_input,
            response_content,
            ux_research_stage,
            industry_context,
            ready_for_questions,
        )

        return {
            "content": response_content,
            "questions": None,
            "suggestions": contextual_suggestions,
            "metadata": {
                "ux_research_stage": ux_research_stage,
                "industry_context": industry_context,
                "methodology": "v1_proven_with_ux_research_enhancements",
                "extracted_context": context_analysis,
            },
        }

    except Exception as e:
        logger.error(
            f"V1 proven + UX research guidance response generation failed: {e}"
        )
        return _create_fallback_response(context_analysis)


async def _generate_contextual_suggestions_v1_proven(
    llm_service,
    conversation_context: str,
    latest_input: str,
    assistant_response: str,
    ux_research_stage: str,
    industry_context: str,
    ready_for_questions: bool = False,
) -> List[str]:
    """Generate contextual suggestions using V1's proven LLM-based approach with UX research methodology."""

    try:
        # Use V1's proven LLM-based suggestion generation with UX research enhancements
        from backend.api.routes.customer_research import generate_contextual_suggestions

        # Generate base suggestions using V1's proven method
        base_suggestions = await generate_contextual_suggestions(
            llm_service=llm_service,
            messages=[],  # V3 doesn't use message history for suggestions
            user_input=latest_input,
            assistant_response=assistant_response,
            conversation_context=conversation_context,
        )

        logger.info(
            f"🔍 V1 base suggestions generated: {base_suggestions} (count: {len(base_suggestions) if base_suggestions else 0})"
        )
        logger.info(
            f"🔍 UX research stage: {ux_research_stage}, ready_for_questions: {ready_for_questions}"
        )

        # Enhance with UX research methodology and special options
        enhanced_suggestions = []

        if ready_for_questions:
            # Confirmation phase - use V1 proven suggestions without special options
            enhanced_suggestions = base_suggestions or [
                "Yes, that's right",
                "Generate research questions",
                "Let me clarify something",
            ]
        else:
            # Discovery phase - ALWAYS add special options for UX research methodology
            if base_suggestions and len(base_suggestions) >= 1:
                # Add special options at the beginning as specified in requirements
                enhanced_suggestions = [
                    "All of the above",
                    "I don't know",
                ] + base_suggestions
                logger.info(
                    f"✅ Added special options to V1 suggestions: {enhanced_suggestions}"
                )
            else:
                # Fallback to UX research stage-specific suggestions (which also include special options)
                enhanced_suggestions = _get_ux_research_fallback_suggestions(
                    ux_research_stage, industry_context
                )
                logger.info(
                    f"✅ Using fallback suggestions with special options: {enhanced_suggestions}"
                )

        # Ensure we have 3-5 suggestions as specified in requirements
        if len(enhanced_suggestions) > 5:
            enhanced_suggestions = enhanced_suggestions[:5]
        elif len(enhanced_suggestions) < 3:
            enhanced_suggestions.extend(["Tell me more", "Continue"])

        return enhanced_suggestions

    except Exception as e:
        logger.error(f"V1 proven suggestion generation failed: {e}")
        # Fallback to UX research methodology-based suggestions
        return _get_ux_research_fallback_suggestions(
            ux_research_stage, industry_context
        )


def _generate_contextual_suggestions(
    context_analysis: Dict[str, Any],
    intent_analysis: Dict[str, Any],
    business_validation: Dict[str, Any],
    conversation_flow: Dict[str, Any],
    industry_analysis: Optional[Dict[str, Any]] = None,
    stakeholder_detection: Optional[Dict[str, Any]] = None,
) -> List[str]:
    """Generate UX research methodology-based contextual suggestions - DEPRECATED: Use V1 proven method instead."""

    try:
        # Get current state and UX research stage
        business_idea = context_analysis.get("businessIdea") or context_analysis.get(
            "business_idea", ""
        )
        ready_for_questions = business_validation.get("ready_for_questions", False)

        # Determine UX research stage for scoped suggestions
        ux_research_stage = _determine_ux_research_stage(
            context_analysis, intent_analysis, business_validation
        )

        # Use V3 enhanced industry analysis if available, otherwise extract from context
        if industry_analysis and industry_analysis.get("industry"):
            industry_context = f"{industry_analysis.get('industry')}/{industry_analysis.get('sub_industry', 'General')}"
        else:
            industry_context = _extract_industry_context_for_conversation(
                context_analysis
            )

        # Return fallback suggestions - V1 proven method should be used instead
        return _get_ux_research_fallback_suggestions(
            ux_research_stage, industry_context
        )

    except Exception:
        # UX research fallback with special options
        return _get_ux_research_fallback_suggestions(
            "business_discovery", "General Business"
        )


def _get_ux_research_fallback_suggestions(
    ux_research_stage: str, industry_context: str
) -> List[str]:
    """Get UX research methodology-based fallback suggestions."""

    try:
        suggestions = []

        # UX Research Methodology: Scoped suggestions based on current discovery stage
        if ux_research_stage == "business_discovery":
            suggestions.extend(
                [
                    "A mobile app for busy professionals",
                    "A service-based business",
                    "A physical location business",
                ]
            )
        elif ux_research_stage == "customer_discovery":
            if "laundry" in industry_context.lower():
                suggestions.extend(
                    [
                        "Busy professionals without in-unit laundry",
                        "Families in apartments",
                        "College students",
                    ]
                )
            else:
                suggestions.extend(
                    [
                        "Small business owners",
                        "Individual consumers",
                        "Enterprise clients",
                    ]
                )
        elif ux_research_stage == "problem_discovery":
            suggestions.extend(
                [
                    "Time constraints and convenience",
                    "Cost and affordability issues",
                    "Quality and reliability concerns",
                ]
            )
        elif ux_research_stage == "validation_and_refinement":
            suggestions.extend(
                [
                    "Market size and competition",
                    "Pricing and business model",
                    "Customer acquisition strategy",
                ]
            )
        elif ux_research_stage == "ready_for_questions":
            suggestions.extend(["Yes, that's right", "Generate research questions"])
        else:
            # Fallback to general discovery suggestions
            suggestions.extend(
                [
                    "Tell me more about the challenges",
                    "Who else might be involved?",
                    "What's the biggest pain point?",
                ]
            )

        # Add special options for non-confirmation phases (UX research best practice)
        if suggestions and ux_research_stage != "ready_for_questions":
            # Insert special options at the beginning as specified in requirements
            suggestions.insert(0, "All of the above")
            suggestions.insert(1, "I don't know")

        # Ensure we have 3-5 suggestions as specified in requirements
        if len(suggestions) > 5:
            suggestions = suggestions[:5]
        elif len(suggestions) < 3:
            suggestions.extend(["Tell me more", "Continue"])

        return suggestions

    except Exception:
        # Ultimate fallback
        return [
            "All of the above",
            "I don't know",
            "Tell me more",
            "Continue",
            "What else?",
        ]


async def _create_emergency_questions(
    context_analysis: Dict[str, Any],
) -> Dict[str, Any]:
    """Create emergency fallback questions."""

    try:
        business_idea = context_analysis.get("businessIdea") or context_analysis.get(
            "business_idea", "your business"
        )

        # Generate emergency questions using LLM for better context
        try:
            emergency_stakeholder_questions = (
                await _generate_contextual_questions_with_llm(
                    business_idea,
                    "target customers",
                    "current challenges",
                    "Primary Users",
                    f"Users of the {business_idea}",
                    "primary",
                )
            )
        except Exception:
            # Ultimate fallback if LLM fails
            emergency_stakeholder_questions = {
                "problemDiscovery": [
                    f"What challenges do you currently face with {business_idea or 'this type of service'}?",
                    "How do you handle this now?",
                    "What's most frustrating about the current situation?",
                ],
                "solutionValidation": [
                    f"Would {business_idea or 'this solution'} help you?",
                    "What features are most important?",
                    "How much would you pay for this?",
                ],
                "followUp": [
                    "Would you recommend this to others?",
                    "Any other thoughts?",
                ],
            }

        emergency_questions = {
            "primaryStakeholders": [
                {
                    "name": "Primary Users",
                    "description": f"Users of the {business_idea}",
                    "questions": emergency_stakeholder_questions,
                }
            ],
            "secondaryStakeholders": [],
            "timeEstimate": {
                "totalQuestions": len(
                    emergency_stakeholder_questions.get("problemDiscovery", [])
                )
                + len(emergency_stakeholder_questions.get("solutionValidation", []))
                + len(emergency_stakeholder_questions.get("followUp", [])),
                "estimatedMinutes": f"{(len(emergency_stakeholder_questions.get('problemDiscovery', [])) + len(emergency_stakeholder_questions.get('solutionValidation', [])) + len(emergency_stakeholder_questions.get('followUp', []))) * 2}-{(len(emergency_stakeholder_questions.get('problemDiscovery', [])) + len(emergency_stakeholder_questions.get('solutionValidation', [])) + len(emergency_stakeholder_questions.get('followUp', []))) * 4}",
                "breakdown": {
                    "primary": len(
                        emergency_stakeholder_questions.get("problemDiscovery", [])
                    )
                    + len(emergency_stakeholder_questions.get("solutionValidation", []))
                    + len(emergency_stakeholder_questions.get("followUp", [])),
                    "secondary": 0,
                },
            },
        }

        return {
            "content": "COMPREHENSIVE_QUESTIONS_COMPONENT",
            "questions": emergency_questions,
            "suggestions": [],
            "metadata": {
                "comprehensiveQuestions": emergency_questions,
                "businessContext": business_idea,
                "type": "component",
                "emergency_fallback": True,
            },
        }

    except Exception:
        return _create_fallback_response({})


def _create_fallback_response(context_analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Create UX research methodology-based fallback response."""

    # Use UX research approach even in fallback
    ux_research_stage = "business_discovery"  # Default to initial discovery

    return {
        "content": "I'd love to understand what you're building. Can you walk me through your business idea in your own words?",
        "questions": None,
        "suggestions": [
            "All of the above",
            "I don't know",
            "A mobile app for busy professionals",
            "A service-based business",
            "A physical location business",
        ],
        "metadata": {
            "fallback_response": True,
            "ux_research_stage": ux_research_stage,
            "methodology": "professional_ux_research",
            "extracted_context": context_analysis,
        },
    }


# Helper function for UX research methodology-based guidance response generation
async def _generate_guidance_response_with_llm(
    llm_service,
    conversation_context: str,
    latest_input: str,
    context_analysis: Dict[str, Any],
    intent_analysis: Dict[str, Any],
    business_validation: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate UX research methodology-based guidance response."""

    # Extract V3 enhanced analysis data
    business_idea = context_analysis.get("business_idea", "")
    target_customer = context_analysis.get("target_customer", "")
    problem = context_analysis.get("problem", "")
    business_clarity = context_analysis.get("business_clarity", {})

    # Get conversation stage and intent
    conversation_stage = intent_analysis.get("conversation_stage", "initial")
    user_intent = intent_analysis.get("intent", "clarify_business")
    readiness_score = business_validation.get("readiness_score", 0.0)

    # Determine UX research conversation stage
    ux_research_stage = _determine_ux_research_stage(
        context_analysis, intent_analysis, business_validation
    )

    # Get industry context for informed questioning
    industry_context = _extract_industry_context_for_conversation(context_analysis)

    prompt = f"""You are an experienced UX researcher conducting a discovery interview. Follow proper UX research methodology:

CRITICAL UX RESEARCH PRINCIPLES:
- Ask ONE focused question per interaction (never multiple questions)
- Build on previous answers to show active listening
- Use industry knowledge to ask more informed questions
- Guide through structured discovery: broad → specific → validation
- Demonstrate understanding through question framing

CURRENT CONTEXT:
- Business idea: {business_idea}
- Target customer: {target_customer}
- Problem: {problem}
- UX Research Stage: {ux_research_stage}
- Industry Context: {industry_context}
- Business Clarity: idea={business_clarity.get('idea_clarity', 0):.1f}, customer={business_clarity.get('customer_clarity', 0):.1f}, problem={business_clarity.get('problem_clarity', 0):.1f}

CONVERSATION:
{conversation_context}

LATEST INPUT: "{latest_input}"

As a professional UX researcher, generate your next response following these rules:
1. Ask EXACTLY ONE focused question that builds on what they've shared
2. Show understanding of their industry/business context in your question framing
3. Guide them toward the next logical discovery step
4. Use conversational, professional tone (not survey-like)
5. Demonstrate active listening by referencing their previous answers

Return ONLY a JSON object with:
- content: Your single focused question as an experienced UX researcher would ask
- next_step: Brief description of what this question aims to discover
- ux_research_rationale: Why this question follows proper UX research methodology

Return only valid JSON, no other text."""

    try:
        response = await llm_service.generate_text(
            prompt, max_tokens=600, temperature=0.2
        )

        import json
        import re

        # Remove markdown code blocks
        json_text = response.strip()
        if json_text.startswith("```json"):
            json_text = re.sub(r"^```json\s*", "", json_text)
            json_text = re.sub(r"\s*```$", "", json_text)
        elif json_text.startswith("```"):
            json_text = re.sub(r"^```\s*", "", json_text)
            json_text = re.sub(r"\s*```$", "", json_text)

        result = json.loads(json_text.strip())

        # Add default fields if missing
        if "content" not in result:
            result["content"] = _get_fallback_ux_question(
                ux_research_stage, business_idea, industry_context
            )
        if "questions" not in result:
            result["questions"] = None
        if "suggestions" not in result:
            result["suggestions"] = []
        if "metadata" not in result:
            result["metadata"] = {}

        # Add UX research metadata
        result["metadata"]["ux_research_stage"] = ux_research_stage
        result["metadata"]["industry_context"] = industry_context
        result["metadata"]["methodology"] = "professional_ux_research"

        return result

    except Exception as e:
        logger.error(f"Error generating UX research guidance response: {e}")
        return {
            "content": _get_fallback_ux_question(
                ux_research_stage, business_idea, industry_context
            ),
            "questions": None,
            "suggestions": [],
            "metadata": {"llm_fallback": True, "ux_research_stage": ux_research_stage},
        }


def _determine_ux_research_stage(
    context_analysis: Dict[str, Any],
    intent_analysis: Dict[str, Any],
    business_validation: Dict[str, Any],
) -> str:
    """Determine current UX research conversation stage."""

    try:
        business_idea = context_analysis.get("business_idea", "")
        target_customer = context_analysis.get("target_customer", "")
        problem = context_analysis.get("problem", "")
        user_intent = intent_analysis.get("intent", "")

        # UX Research Stage Logic
        if user_intent in ["generate_questions", "question_request"]:
            return "ready_for_questions"
        elif not business_idea or len(business_idea.strip()) < 10:
            return "business_discovery"
        elif not target_customer or len(target_customer.strip()) < 5:
            return "customer_discovery"
        elif not problem or len(problem.strip()) < 5:
            return "problem_discovery"
        else:
            return "validation_and_refinement"

    except Exception:
        return "business_discovery"


def _extract_industry_context_for_conversation(context_analysis: Dict[str, Any]) -> str:
    """Extract industry context to inform conversational intelligence."""

    try:
        business_idea = context_analysis.get("business_idea", "").lower()

        # Industry-specific context mapping for informed questioning
        if "laundromat" in business_idea or "laundry" in business_idea:
            return "Consumer Services/Laundry - location-dependent, utility-intensive, self-service model"
        elif "restaurant" in business_idea or "food" in business_idea:
            return "Food Service - location-dependent, health regulations, customer experience focus"
        elif (
            "app" in business_idea
            or "software" in business_idea
            or "platform" in business_idea
        ):
            return "Technology/Software - user experience focus, scalability considerations"
        elif "consulting" in business_idea or "service" in business_idea:
            return "Professional Services - relationship-based, expertise-driven"
        elif (
            "retail" in business_idea
            or "store" in business_idea
            or "shop" in business_idea
        ):
            return "Retail - customer journey focus, inventory considerations"
        else:
            return "General Business - customer-centric approach"

    except Exception:
        return "General Business"


def _get_fallback_ux_question(
    ux_research_stage: str, business_idea: str, industry_context: str
) -> str:
    """Get fallback UX research question based on stage."""

    try:
        if ux_research_stage == "business_discovery":
            return "I'd love to understand what you're building. Can you walk me through your business idea in your own words?"
        elif ux_research_stage == "customer_discovery":
            if "laundromat" in business_idea.lower():
                return f"Interesting - a {business_idea}. Who specifically would be your primary customers? Are you thinking busy professionals, families without in-unit laundry, or a different group?"
            else:
                return f"Thanks for sharing about your {business_idea}. Who specifically would be your primary customers?"
        elif ux_research_stage == "problem_discovery":
            return "What's the main problem or frustration that your customers are currently experiencing?"
        elif ux_research_stage == "validation_and_refinement":
            return "That gives me a good picture. What's the biggest challenge or uncertainty you have about this business idea?"
        else:
            return "I'd be happy to help you develop research questions. What would you like to explore first?"

    except Exception:
        return "Could you tell me more about your business idea?"


async def _generate_ux_research_response_v1_proven(
    llm_service,
    messages,
    user_input: str,
    context,
    conversation_context: str,
    context_analysis: Dict[str, Any],
    intent_analysis: Dict[str, Any],
    business_validation: Dict[str, Any],
    industry_analysis: Optional[Dict[str, Any]],
) -> str:
    """Generate UX research methodology-based response using V1's proven approach."""

    try:
        # Determine UX research stage and industry context
        ux_research_stage = _determine_ux_research_stage(
            context_analysis, intent_analysis, business_validation
        )

        # Get industry context for informed questioning
        if industry_analysis and industry_analysis.get("industry"):
            industry_context = f"{industry_analysis.get('industry')}/{industry_analysis.get('sub_industry', 'General')}"
        else:
            industry_context = _extract_industry_context_for_conversation(
                context_analysis
            )

        # Get business clarity metrics
        business_clarity = context_analysis.get("business_clarity", {})

        # Enhanced UX research methodology prompt based on V1's proven structure
        has_business_idea = context and context.businessIdea
        has_target_customer = context and context.targetCustomer
        has_problem = context and context.problem

        # Build UX research methodology-enhanced prompt
        ux_research_prompt = f"""You are an experienced UX researcher conducting a discovery interview. Follow proper UX research methodology while maintaining a natural, conversational tone.

CRITICAL UX RESEARCH PRINCIPLES:
- Ask ONE focused question per interaction (never multiple questions)
- Build on previous answers to show active listening
- Use industry knowledge to ask more informed questions
- Guide through structured discovery: broad → specific → validation
- Demonstrate understanding through question framing

CURRENT CONTEXT:
- UX Research Stage: {ux_research_stage}
- Industry Context: {industry_context}
- Business idea: {context.businessIdea if has_business_idea else 'Not specified'}
- Target customer: {context.targetCustomer if has_target_customer else 'Not specified'}
- Problem: {context.problem if has_problem else 'Not specified'}
- Business Clarity: idea={business_clarity.get('idea_clarity', 0):.1f}, customer={business_clarity.get('customer_clarity', 0):.1f}, problem={business_clarity.get('problem_clarity', 0):.1f}

CONVERSATION HISTORY:
{conversation_context}

USER'S LATEST INPUT: "{user_input}"

As a professional UX researcher, respond with:
1. EXACTLY ONE focused question that builds on what they've shared
2. Show understanding of their industry/business context in your question framing
3. Guide them toward the next logical discovery step
4. Use conversational, professional tone (not survey-like)
5. Demonstrate active listening by referencing their previous answers

Generate a natural, conversational response that asks one focused question to continue the discovery process."""

        # Use V1's proven response generation with enhanced UX research prompt
        response = await llm_service.generate_text(
            prompt=ux_research_prompt,
            temperature=0.7,  # V1's proven temperature
            max_tokens=8000,  # V1's proven token limit
        )

        return response.strip()

    except Exception as e:
        logger.error(f"UX research response generation failed: {e}")
        # Fallback to V1's proven simple response generation
        from backend.api.routes.customer_research import generate_research_response

        return await generate_research_response(
            llm_service, messages, user_input, context, conversation_context
        )
