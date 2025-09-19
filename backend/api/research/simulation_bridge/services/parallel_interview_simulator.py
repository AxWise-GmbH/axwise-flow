"""
Parallel Interview Simulator for improved performance and scalability.
"""

import logging
import asyncio
import random
from typing import List, Dict, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor
from pydantic_ai import Agent
from pydantic_ai.models import Model

from ..models import (
    AIPersona,
    Stakeholder,
    SimulatedInterview,
    InterviewResponse,
    BusinessContext,
    SimulationConfig,
)

logger = logging.getLogger(__name__)


class ParallelInterviewSimulator:
    """
    Enhanced interview simulator with parallel processing capabilities.
    """

    def __init__(self, model: Model, max_concurrent: int = 2):
        self.model = model
        self.max_concurrent = max_concurrent
        self.agent = Agent(
            model=model,
            output_type=SimulatedInterview,
            system_prompt=self._get_system_prompt(),
        )
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._response_cache = {}  # Simple in-memory cache

    def _get_system_prompt(self) -> str:
        return """You are an expert interview simulator that generates realistic customer interview responses.

Your task is to simulate how a specific persona would respond to research questions in a customer interview setting.

Guidelines:
1. Stay completely in character as the given persona
2. Provide authentic, realistic responses that match the persona's background and communication style
3. Include natural human elements like hesitation, tangents, and personal anecdotes
4. Vary response lengths naturally - some short, some detailed
5. Show genuine emotions and reactions
6. Include specific examples and concrete details
7. Maintain consistency with the persona's motivations and pain points
8. Use language and terminology appropriate to the persona's background

Response Quality:
- Make responses feel like real human speech, not AI-generated text
- Include natural speech patterns and filler words occasionally
- Show personality through word choice and tone
- Provide actionable insights while staying authentic
- Include both positive and negative perspectives naturally

Return a complete SimulatedInterview object with all responses and metadata."""

    async def simulate_interview_with_semaphore(
        self,
        persona: AIPersona,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
        progress_callback: Optional[Callable[[str, int], None]] = None,
    ) -> SimulatedInterview:
        """
        Simulate interview with concurrency control.
        """
        async with self._semaphore:
            return await self._simulate_interview_internal(
                persona, stakeholder, business_context, config, progress_callback
            )

    async def _simulate_interview_internal(
        self,
        persona: AIPersona,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
        progress_callback: Optional[Callable[[str, int], None]] = None,
    ) -> SimulatedInterview:
        """Internal interview simulation with retry logic."""

        try:
            logger.info(
                f"Starting interview simulation: {persona.name} ({persona.stakeholder_type})"
            )

            if progress_callback:
                progress_callback(f"Simulating interview with {persona.name}", 0)

            # Check cache first
            cache_key = self._generate_cache_key(
                persona, stakeholder, business_context, config
            )
            if cache_key in self._response_cache:
                logger.info(f"Using cached response for {persona.name}")
                return self._response_cache[cache_key]

            prompt = self._build_interview_prompt(
                persona, stakeholder, business_context, config
            )

            # Retry logic with exponential backoff
            max_retries = 3
            base_delay = 1

            for attempt in range(max_retries + 1):
                try:
                    if progress_callback:
                        progress_callback(
                            f"Generating responses for {persona.name} (attempt {attempt + 1})",
                            25,
                        )

                    # Use user's temperature for creative interview responses
                    result = await self.agent.run(
                        prompt, model_settings={"temperature": config.temperature}
                    )

                    interview = result.output
                    break  # Success, exit retry loop

                except Exception as e:
                    if attempt < max_retries:
                        delay = base_delay * (2**attempt) + random.uniform(0, 1)
                        logger.warning(
                            f"Interview simulation failed (attempt {attempt + 1}), retrying in {delay:.2f}s: {str(e)}"
                        )
                        await asyncio.sleep(delay)

                        # Try with temperature 0 for stability on retry
                        if "MALFORMED_FUNCTION_CALL" in str(e):
                            result = await self.agent.run(
                                prompt, model_settings={"temperature": 0.0}
                            )
                            interview = result.output
                            break
                    else:
                        logger.error(
                            f"Interview simulation failed after {max_retries + 1} attempts: {str(e)}"
                        )
                        raise

            # Post-process interview
            interview.person_id = persona.id
            interview.stakeholder_type = persona.stakeholder_type
            interview.interview_duration_minutes = self._calculate_duration(
                interview.responses
            )

            # Cache the result
            self._response_cache[cache_key] = interview

            if progress_callback:
                progress_callback(f"Completed interview with {persona.name}", 100)

            logger.info(
                f"Successfully simulated interview: {persona.name} ({len(interview.responses)} responses)"
            )
            return interview

        except Exception as e:
            logger.error(
                f"Failed to simulate interview for {persona.name}: {str(e)}",
                exc_info=True,
            )
            raise

    async def simulate_all_interviews_parallel(
        self,
        personas: List[AIPersona],
        stakeholders: Dict[str, List[Stakeholder]],
        business_context: BusinessContext,
        config: SimulationConfig,
        progress_callback: Optional[Callable[[str, int, int, int], None]] = None,
    ) -> List[SimulatedInterview]:
        """
        Simulate all interviews in parallel with progress tracking.

        Args:
            personas: List of personas to interview
            stakeholders: Stakeholder data
            business_context: Business context
            config: Simulation configuration
            progress_callback: Optional callback for progress updates (message, completed, total, failed)

        Returns:
            List of completed interviews
        """

        logger.info(
            f"Starting parallel interview simulation for {len(personas)} personas"
        )

        # Create stakeholder lookup using stakeholder names
        stakeholder_lookup = {}
        for category, stakeholder_list in stakeholders.items():
            for stakeholder in stakeholder_list:
                stakeholder_lookup[stakeholder.name] = stakeholder

        # Filter personas that have matching stakeholders
        valid_personas = []
        for persona in personas:
            if persona.stakeholder_type in stakeholder_lookup:
                valid_personas.append(
                    (persona, stakeholder_lookup[persona.stakeholder_type])
                )
            else:
                logger.warning(
                    f"No stakeholder found for persona {persona.name} with type {persona.stakeholder_type}"
                )

        if not valid_personas:
            logger.warning("No valid personas found for simulation")
            return []

        # Create tasks for parallel execution
        tasks = []
        completed_count = 0
        failed_count = 0
        total_count = len(valid_personas)

        def create_progress_callback(persona_name: str):
            def callback(message: str, progress: int):
                nonlocal completed_count, failed_count
                if progress == 100:
                    completed_count += 1
                if progress_callback:
                    progress_callback(
                        message, completed_count, total_count, failed_count
                    )

            return callback

        for persona, stakeholder in valid_personas:
            task = self.simulate_interview_with_semaphore(
                persona,
                stakeholder,
                business_context,
                config,
                create_progress_callback(persona.name),
            )
            tasks.append(task)

        # Execute all tasks with error handling
        results = []
        completed_tasks = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(completed_tasks):
            if isinstance(result, Exception):
                failed_count += 1
                persona_name = valid_personas[i][0].name
                logger.error(
                    f"Interview simulation failed for {persona_name}: {str(result)}"
                )
                if progress_callback:
                    progress_callback(
                        f"Failed: {persona_name}",
                        completed_count,
                        total_count,
                        failed_count,
                    )
            else:
                results.append(result)

        logger.info(
            f"Parallel simulation completed: {len(results)} successful, {failed_count} failed"
        )
        return results

    def _generate_cache_key(
        self,
        persona: AIPersona,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> str:
        """Generate cache key for response caching."""
        import hashlib

        key_data = f"{persona.id}_{stakeholder.id}_{business_context.business_idea}_{config.temperature}_{config.response_style.value}"
        return hashlib.md5(key_data.encode()).hexdigest()

    def _build_interview_prompt(
        self,
        persona: AIPersona,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> str:
        """Build the prompt for interview simulation."""

        return f"""Simulate a customer research interview with the following persona:

PERSONA DETAILS:
- Name: {persona.name}
- Age: {persona.age}
- Background: {persona.background}
- Motivations: {', '.join(persona.motivations)}
- Pain Points: {', '.join(persona.pain_points)}
- Communication Style: {persona.communication_style}
- Demographics: {persona.demographic_details}

BUSINESS CONTEXT:
- Business Idea: {business_context.business_idea}
- Target Customer: {business_context.target_customer}
- Problem: {business_context.problem}

INTERVIEW QUESTIONS:
{self._format_questions(stakeholder.questions)}

SIMULATION STYLE: {config.response_style.value}

Instructions:
1. Answer each question as {persona.name} would, staying completely in character
2. Use their communication style and background to inform responses
3. Include natural human elements like personal examples, hesitations, and tangents
4. Show genuine emotions and reactions based on their motivations and pain points
5. Provide responses that vary in length naturally
6. Include specific, concrete details that make responses feel authentic
7. Maintain consistency with their demographic details and background

For each response, also identify:
- The sentiment (positive, negative, neutral, mixed)
- Key insights that emerge from the response
- Any natural follow-up questions that might arise

Create a realistic interview that feels like a genuine conversation with this person."""

    def _format_questions(self, questions: List[str]) -> str:
        """Format questions for the prompt."""
        formatted = []
        for i, question in enumerate(questions, 1):
            formatted.append(f"{i}. {question}")
        return "\n".join(formatted)

    def _calculate_duration(self, responses: List[InterviewResponse]) -> int:
        """Calculate realistic interview duration based on responses."""
        base_time = len(responses) * 2  # 2 minutes per question baseline

        for response in responses:
            words = len(response.response.split())
            if words > 100:
                base_time += 3
            elif words > 50:
                base_time += 2
            else:
                base_time += 1

        variation = random.randint(-5, 10)
        return max(10, base_time + variation)

    def clear_cache(self):
        """Clear the response cache."""
        self._response_cache.clear()
        logger.info("Response cache cleared")

    def get_cache_stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        return {
            "cache_size": len(self._response_cache),
            "max_concurrent": self.max_concurrent,
        }
