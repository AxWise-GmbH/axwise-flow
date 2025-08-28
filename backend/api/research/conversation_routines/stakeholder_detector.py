"""
V3 Enhancement: Advanced Stakeholder Detection
Extracted from customer_research_v3_rebuilt.py - preserves stakeholder detection logic.
"""

import logging
from typing import Dict, Any, List, Optional
import asyncio
import os

logger = logging.getLogger(__name__)


class StakeholderDetector:
    """Advanced stakeholder detection with unique questions for each stakeholder type"""

    def __init__(self):
        logger.info("🏗️ V3 Stakeholder Detector initialized")

    async def generate_dynamic_stakeholders_with_unique_questions(
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
            logger.info("👥 Generating dynamic stakeholders with unique questions")

            # Step 1: Generate stakeholder names and descriptions
            stakeholder_data = await self._generate_stakeholder_names_and_descriptions(
                llm_service, context_analysis, messages
            )

            # Step 2: Generate unique questions for each stakeholder
            enhanced_stakeholders = await self._generate_questions_for_stakeholders(
                llm_service, stakeholder_data, business_idea, target_customer, problem
            )

            logger.info(
                f"✅ Generated {len(enhanced_stakeholders.get('primary', []))} primary and {len(enhanced_stakeholders.get('secondary', []))} secondary stakeholders with unique questions"
            )
            return enhanced_stakeholders

        except Exception as e:
            logger.error(f"Dynamic stakeholder generation failed: {e}")
            return {"primary": [], "secondary": []}

    async def _generate_stakeholder_names_and_descriptions(
        self, llm_service, context_analysis: Dict[str, Any], messages: List[Any]
    ) -> Dict[str, Any]:
        """Generate stakeholder names and descriptions"""
        try:
            business_idea = context_analysis.get("business_idea", "")
            target_customer = context_analysis.get("target_customer", "")
            problem = context_analysis.get("problem", "")

            # Build conversation context
            conversation_text = ""
            for msg in messages[-5:]:  # Last 5 messages for context
                if hasattr(msg, "role") and hasattr(msg, "content"):
                    conversation_text += f"{msg.role}: {msg.content}\n"
                elif isinstance(msg, dict):
                    conversation_text += (
                        f"{msg.get('role', 'user')}: {msg.get('content', '')}\n"
                    )

            prompt = f"""Analyze this business context and identify specific stakeholders for customer research.

Business Context:
- Business Idea: {business_idea}
- Target Customer: {target_customer}
- Problem Being Solved: {problem}

Recent Conversation:
{conversation_text}

Identify specific stakeholders (not generic roles):

1. PRIMARY stakeholders (2-3 max):
   - Direct users who would actually use the solution
   - People who experience the problem firsthand
   - Decision makers for purchasing/adoption

2. SECONDARY stakeholders (1-2 max):
   - People who influence decisions but may not use directly
   - People affected by the solution indirectly
   - Gatekeepers or advisors

For each stakeholder, provide:
- name: Specific, descriptive name (not "Primary User")
- description: Brief description of their role and relationship to the business

Return as JSON:
{{
  "primary": [
    {{"name": "Busy Office Workers", "description": "Professionals who need quick coffee between meetings"}},
    ...
  ],
  "secondary": [
    {{"name": "Office Managers", "description": "People who decide on office amenities and vendor relationships"}},
    ...
  ]
}}

Make stakeholder names specific to this business context."""

            response_data = await llm_service.analyze(
                text=prompt,
                task="text_generation",
                data={"temperature": 0.6, "max_tokens": 600},
            )
            response = response_data.get("text", "")

            # Parse JSON response (handle markdown code blocks)
            import json
            import re

            try:
                # Remove markdown code blocks if present
                cleaned_response = response.strip()
                if cleaned_response.startswith("```json"):
                    json_match = re.search(
                        r"```json\s*\n(.*?)\n```", cleaned_response, re.DOTALL
                    )
                    if json_match:
                        cleaned_response = json_match.group(1).strip()
                    else:
                        cleaned_response = (
                            cleaned_response.replace("```json", "")
                            .replace("```", "")
                            .strip()
                        )

                stakeholder_data = json.loads(cleaned_response)
                return stakeholder_data
            except json.JSONDecodeError:
                logger.warning("Failed to parse stakeholder names response as JSON")
                return {"primary": [], "secondary": []}

        except Exception as e:
            logger.error(f"Stakeholder name generation failed: {e}")
            return {"primary": [], "secondary": []}

    async def _generate_questions_for_stakeholders(
        self,
        llm_service,
        stakeholder_data: Dict[str, Any],
        business_idea: str,
        target_customer: str,
        problem: str,
    ) -> Dict[str, Any]:
        """Generate unique questions for each stakeholder using parallel processing"""
        try:
            # PERFORMANCE OPTIMIZATION: Use parallel processing with semaphore-controlled concurrency
            STAKEHOLDER_CONCURRENCY = int(
                os.getenv("PAID_TIER_STAKEHOLDER_CONCURRENCY", "10")
            )
            semaphore = asyncio.Semaphore(STAKEHOLDER_CONCURRENCY)

            primary_stakeholders = stakeholder_data.get("primary", [])
            secondary_stakeholders = stakeholder_data.get("secondary", [])
            total_stakeholders = len(primary_stakeholders) + len(secondary_stakeholders)

            logger.info(
                f"[PERFORMANCE] Starting parallel stakeholder question generation for {total_stakeholders} stakeholders "
                f"({len(primary_stakeholders)} primary, {len(secondary_stakeholders)} secondary) "
                f"with max {STAKEHOLDER_CONCURRENCY} concurrent requests"
            )

            # Create tasks for parallel execution
            all_tasks = []

            # Add primary stakeholder tasks
            for i, stakeholder in enumerate(primary_stakeholders):
                task = self._generate_stakeholder_specific_questions_with_semaphore(
                    llm_service,
                    stakeholder["name"],
                    stakeholder["description"],
                    business_idea,
                    target_customer,
                    problem,
                    "primary",
                    semaphore,
                    i + 1,
                )
                all_tasks.append(("primary", i, task))

            # Add secondary stakeholder tasks
            for i, stakeholder in enumerate(secondary_stakeholders):
                task = self._generate_stakeholder_specific_questions_with_semaphore(
                    llm_service,
                    stakeholder["name"],
                    stakeholder["description"],
                    business_idea,
                    target_customer,
                    problem,
                    "secondary",
                    semaphore,
                    len(primary_stakeholders) + i + 1,
                )
                all_tasks.append(("secondary", i, task))

            # Execute all tasks in parallel with robust error handling
            logger.info(
                f"[PERFORMANCE] Executing {len(all_tasks)} stakeholder question generation tasks in parallel..."
            )

            # Use asyncio.gather with return_exceptions=True to handle individual failures gracefully
            task_results = await asyncio.gather(
                *[task for _, _, task in all_tasks], return_exceptions=True
            )

            # Process results and organize by stakeholder type
            enhanced_stakeholders = {"primary": [], "secondary": []}
            successful_count = 0
            failed_count = 0

            for (stakeholder_type, original_index, _), result in zip(
                all_tasks, task_results
            ):
                if isinstance(result, Exception):
                    logger.error(
                        f"[PERFORMANCE] Task failed for {stakeholder_type} stakeholder {original_index}: {result}"
                    )
                    failed_count += 1
                    continue

                # Remove helper fields and add to appropriate list
                stakeholder_result = {
                    "name": result["name"],
                    "description": result["description"],
                    "questions": result["questions"],
                }
                enhanced_stakeholders[stakeholder_type].append(stakeholder_result)
                successful_count += 1

            logger.info(
                f"[PERFORMANCE] ✅ Parallel stakeholder question generation completed: "
                f"{successful_count} successful, {failed_count} failed out of {total_stakeholders} total"
            )

            return enhanced_stakeholders

        except Exception as e:
            logger.error(f"Stakeholder question generation failed: {e}")
            return stakeholder_data  # Return original data without questions

    async def _generate_stakeholder_specific_questions_with_semaphore(
        self,
        llm_service,
        stakeholder_name: str,
        stakeholder_description: str,
        business_idea: str,
        target_customer: str,
        problem: str,
        stakeholder_type: str,
        semaphore: asyncio.Semaphore,
        stakeholder_index: int,
    ) -> Dict[str, Any]:
        """Generate stakeholder-specific questions with semaphore control for parallel processing"""
        async with semaphore:
            try:
                logger.info(
                    f"[PERFORMANCE] Generating questions for stakeholder {stakeholder_index}: {stakeholder_name} ({stakeholder_type})"
                )

                questions = await self._generate_stakeholder_specific_questions(
                    llm_service,
                    stakeholder_name,
                    stakeholder_description,
                    business_idea,
                    target_customer,
                    problem,
                    stakeholder_type,
                )

                logger.info(
                    f"[PERFORMANCE] ✅ Completed questions for stakeholder {stakeholder_index}: {stakeholder_name}"
                )

                return {
                    "name": stakeholder_name,
                    "description": stakeholder_description,
                    "questions": questions,
                    "type": stakeholder_type,
                    "index": stakeholder_index,
                }

            except Exception as e:
                logger.error(
                    f"[PERFORMANCE] ❌ Failed to generate questions for stakeholder {stakeholder_index}: {stakeholder_name} - {e}"
                )
                # Return basic structure without questions on failure
                return {
                    "name": stakeholder_name,
                    "description": stakeholder_description,
                    "questions": {
                        "problemDiscovery": [],
                        "solutionValidation": [],
                        "followUp": [],
                    },
                    "type": stakeholder_type,
                    "index": stakeholder_index,
                }

    async def _generate_stakeholder_specific_questions(
        self,
        llm_service,
        stakeholder_name: str,
        stakeholder_description: str,
        business_idea: str,
        target_customer: str,
        problem: str,
        stakeholder_type: str,
    ) -> Dict[str, List[str]]:
        """Generate categorized questions specific to a stakeholder type"""
        try:
            # Primary stakeholders get more questions per category
            if stakeholder_type == "primary":
                problem_count, solution_count, followup_count = 3, 3, 2
            else:
                problem_count, solution_count, followup_count = 2, 2, 1

            prompt = f"""Generate categorized interview questions for this stakeholder type.

Business Context:
- Business Idea: {business_idea}
- Target Customer: {target_customer}
- Problem Being Solved: {problem}

Stakeholder:
- Name: {stakeholder_name}
- Description: {stakeholder_description}
- Type: {stakeholder_type}

Generate questions in these categories:

1. PROBLEM DISCOVERY ({problem_count} questions):
   - Questions to understand their current state and pain points
   - Focus on their specific challenges related to {business_idea}

2. SOLUTION VALIDATION ({solution_count} questions):
   - Questions to validate your proposed solution approach
   - Focus on their interest, concerns, and requirements

3. FOLLOW-UP ({followup_count} questions):
   - Questions for deeper insights and next steps
   - Questions about decision-making and influences

Make all questions highly specific to {stakeholder_name} and their role.

Return in this exact JSON format:
{{
  "problemDiscovery": ["Problem question 1?", "Problem question 2?", ...],
  "solutionValidation": ["Solution question 1?", "Solution question 2?", ...],
  "followUp": ["Follow-up question 1?", ...]
}}"""

            response_data = await llm_service.analyze(
                text=prompt,
                task="text_generation",
                data={"temperature": 0.7, "max_tokens": 600},
            )
            response = response_data.get("text", "")

            # Parse JSON response (handle markdown code blocks)
            import json
            import re

            # Remove markdown code blocks if present
            cleaned_response = response.strip()
            if cleaned_response.startswith("```json"):
                json_match = re.search(
                    r"```json\s*\n(.*?)\n```", cleaned_response, re.DOTALL
                )
                if json_match:
                    cleaned_response = json_match.group(1).strip()
                else:
                    cleaned_response = (
                        cleaned_response.replace("```json", "")
                        .replace("```", "")
                        .strip()
                    )

            questions_data = json.loads(cleaned_response)
            return {
                "problemDiscovery": questions_data.get("problemDiscovery", []),
                "solutionValidation": questions_data.get("solutionValidation", []),
                "followUp": questions_data.get("followUp", []),
            }

        except Exception as e:
            logger.error(f"Question generation failed for {stakeholder_name}: {e}")
            # Fallback questions
            return {
                "problemDiscovery": [
                    f"What challenges do you face related to {problem}?"
                ],
                "solutionValidation": [
                    f"How interested would you be in {business_idea}?"
                ],
                "followUp": ["What else should we consider?"],
            }

    def calculate_stakeholder_time_estimates(
        self, stakeholders: Dict[str, List[Dict]]
    ) -> Dict[str, int]:
        """Calculate time estimates based on stakeholder questions"""
        try:
            total_questions = 0

            for primary in stakeholders.get("primary", []):
                questions = primary.get("questions", {})
                total_questions += len(questions.get("problemDiscovery", []))
                total_questions += len(questions.get("solutionValidation", []))
                total_questions += len(questions.get("followUp", []))

            for secondary in stakeholders.get("secondary", []):
                questions = secondary.get("questions", {})
                total_questions += len(questions.get("problemDiscovery", []))
                total_questions += len(questions.get("solutionValidation", []))
                total_questions += len(questions.get("followUp", []))

            # Estimate 2-3 minutes per question (use average of 2.5 minutes)
            estimated_minutes = max(20, int(total_questions * 2.5))

            return {
                "totalQuestions": total_questions,
                "estimatedMinutes": estimated_minutes,
            }

        except Exception as e:
            logger.error(f"Time estimation failed: {e}")
            return {"totalQuestions": 0, "estimatedMinutes": 30}
