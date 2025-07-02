"""
Interview Simulator for generating realistic interview responses.
"""

import logging
import random
from typing import List, Dict, Any
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


class InterviewSimulator:
    """Simulates realistic interviews with AI personas."""

    def __init__(self, model: Model):
        self.model = model
        self.agent = Agent(
            model=model,
            result_type=SimulatedInterview,
            system_prompt=self._get_system_prompt(),
        )

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

    async def simulate_interview(
        self,
        persona: AIPersona,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> SimulatedInterview:
        """Simulate a complete interview with a persona."""

        try:
            logger.info(
                f"Simulating interview with persona: {persona.name} ({persona.stakeholder_type})"
            )

            prompt = self._build_interview_prompt(
                persona, stakeholder, business_context, config
            )
            logger.info(f"Interview simulation prompt: {prompt[:200]}...")

            result = await self.agent.run(
                prompt, model_settings={"temperature": config.temperature}
            )

            logger.info(f"PydanticAI interview result: {result}")
            # Use result.output (non-deprecated) - both are identical per our test
            interview = result.output
            logger.info(
                f"Interview type: {type(interview)}, responses: {len(interview.responses) if hasattr(interview, 'responses') else 'No responses attr'}"
            )

            # Ensure persona_id and stakeholder_type are set
            interview.persona_id = persona.id
            interview.stakeholder_type = persona.stakeholder_type

            # Calculate realistic interview duration
            interview.interview_duration_minutes = self._calculate_duration(
                interview.responses
            )

            logger.info(
                f"Successfully simulated interview with {len(interview.responses)} responses"
            )
            return interview

        except Exception as e:
            logger.error(f"Failed to simulate interview: {str(e)}", exc_info=True)
            raise

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
        # Base time per question + variable time based on response length
        base_time = len(responses) * 2  # 2 minutes per question baseline

        # Add time based on response complexity
        for response in responses:
            words = len(response.response.split())
            if words > 100:
                base_time += 3
            elif words > 50:
                base_time += 2
            else:
                base_time += 1

        # Add some randomness for realism
        variation = random.randint(-5, 10)
        return max(10, base_time + variation)

    async def simulate_all_interviews(
        self,
        personas: List[AIPersona],
        stakeholders: Dict[str, List[Stakeholder]],
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> List[SimulatedInterview]:
        """Simulate interviews for all personas."""

        all_interviews = []

        # Create stakeholder lookup
        stakeholder_lookup = {}
        for category, stakeholder_list in stakeholders.items():
            for stakeholder in stakeholder_list:
                stakeholder_lookup[stakeholder.id] = stakeholder

        for persona in personas:
            if persona.stakeholder_type in stakeholder_lookup:
                stakeholder = stakeholder_lookup[persona.stakeholder_type]
                interview = await self.simulate_interview(
                    persona, stakeholder, business_context, config
                )
                all_interviews.append(interview)
            else:
                logger.warning(
                    f"No stakeholder found for persona {persona.name} with type {persona.stakeholder_type}"
                )

        logger.info(f"Completed {len(all_interviews)} simulated interviews")
        return all_interviews
