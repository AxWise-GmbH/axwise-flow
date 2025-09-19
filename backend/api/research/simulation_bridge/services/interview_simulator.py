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
            output_type=SimulatedInterview,
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

            # Try with retry logic for Gemini API issues
            max_retries = 2
            for attempt in range(max_retries + 1):
                try:
                    # Use user's temperature for creative interview responses
                    result = await self.agent.run(
                        prompt, model_settings={"temperature": config.temperature}
                    )
                    break  # Success, exit retry loop
                except Exception as e:
                    if "MALFORMED_FUNCTION_CALL" in str(e) and attempt < max_retries:
                        logger.warning(
                            f"Gemini API error on attempt {attempt + 1}, retrying with temperature 0..."
                        )
                        # Use temperature 0 for retry to ensure valid JSON structure
                        result = await self.agent.run(
                            prompt, model_settings={"temperature": 0.0}
                        )
                        break
                    else:
                        raise  # Re-raise if final attempt or different error

            logger.info(f"PydanticAI interview result: {result}")
            # Use result.output (non-deprecated) - both are identical per our test
            interview = result.output
            logger.info(
                f"Interview type: {type(interview)}, responses: {len(interview.responses) if hasattr(interview, 'responses') else 'No responses attr'}"
            )

            # Ensure person_id and stakeholder_type are set
            interview.person_id = persona.id
            # Use stakeholder name instead of generic ID for better readability
            interview.stakeholder_type = stakeholder.name

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

        # Create stakeholder lookup using stakeholder names
        stakeholder_lookup = {}
        for category, stakeholder_list in stakeholders.items():
            for stakeholder in stakeholder_list:
                stakeholder_lookup[stakeholder.name] = stakeholder
                logger.info(
                    f"🔍 Added stakeholder to lookup: '{stakeholder.name}' (category: {category})"
                )

        for persona in personas:
            logger.info(
                f"🎭 Processing persona '{persona.name}' with stakeholder_type '{persona.stakeholder_type}'"
            )
            if persona.stakeholder_type in stakeholder_lookup:
                stakeholder = stakeholder_lookup[persona.stakeholder_type]
                logger.info(
                    f"✅ Found matching stakeholder '{stakeholder.name}' for persona '{persona.name}'"
                )
                interview = await self.simulate_interview(
                    persona, stakeholder, business_context, config
                )
                all_interviews.append(interview)
            else:
                logger.warning(
                    f"❌ No stakeholder found for persona '{persona.name}' with type '{persona.stakeholder_type}'"
                )
                logger.warning(
                    f"Available stakeholder names: {list(stakeholder_lookup.keys())}"
                )

        logger.info(f"Completed {len(all_interviews)} simulated interviews")
        return all_interviews

    async def generate_single_response(
        self,
        question: str,
        persona: AIPersona,
        business_context: BusinessContext,
        config: Dict[str, Any],
    ) -> str:
        """Generate a single response from a persona to a specific question."""

        try:
            logger.info(f"Generating single response for persona: {persona.name}")

            # Create a simple agent for single response generation
            single_response_agent = Agent(
                model=self.model,
                output_type=str,
                system_prompt=self._get_single_response_system_prompt(),
            )

            prompt = self._build_single_response_prompt(
                question, persona, business_context, config
            )

            # Use temperature from config or default
            temperature = config.get("temperature", 0.7)

            # Generate response with retry logic
            max_retries = 2
            for attempt in range(max_retries + 1):
                try:
                    result = await single_response_agent.run(
                        prompt, model_settings={"temperature": temperature}
                    )
                    break  # Success, exit retry loop
                except Exception as e:
                    if "MALFORMED_FUNCTION_CALL" in str(e) and attempt < max_retries:
                        logger.warning(
                            f"Gemini API error on attempt {attempt + 1}, retrying with temperature 0..."
                        )
                        result = await single_response_agent.run(
                            prompt, model_settings={"temperature": 0.0}
                        )
                        break
                    else:
                        raise  # Re-raise if final attempt or different error

            response = result.output
            logger.info(f"Generated response: {response[:100]}...")
            return response

        except Exception as e:
            logger.error(f"Failed to generate single response: {str(e)}", exc_info=True)
            # Return a fallback response
            return f"I'm not sure how to answer that question right now."

    def _get_single_response_system_prompt(self) -> str:
        """System prompt for single response generation."""
        return """You are simulating a specific persona in a customer interview.

Your task is to respond to a single interview question as this persona would, staying completely in character.

Guidelines:
1. Stay completely in character as the given persona
2. Provide an authentic, realistic response that matches their background and communication style
3. Include natural human elements like hesitation, personal anecdotes, or tangents
4. Use language and terminology appropriate to their background
5. Show genuine emotions and reactions based on their motivations and pain points
6. Provide a response that feels like real human speech, not AI-generated text
7. Include specific examples and concrete details when relevant
8. Keep the response conversational and natural

Return only the response text that this persona would give - no additional formatting or metadata."""

    def _build_single_response_prompt(
        self,
        question: str,
        persona: AIPersona,
        business_context: BusinessContext,
        config: Dict[str, Any],
    ) -> str:
        """Build prompt for single response generation."""

        response_style = config.get("response_style", "realistic")

        return f"""You are {persona.name}, responding to an interview question about a business idea.

PERSONA DETAILS:
- Name: {persona.name}
- Age: {persona.age}
- Background: {persona.background}
- Motivations: {', '.join(persona.motivations)}
- Pain Points: {', '.join(persona.pain_points)}
- Communication Style: {persona.communication_style}

BUSINESS CONTEXT:
- Business Idea: {business_context.business_idea}
- Target Customer: {business_context.target_customer}
- Problem: {business_context.problem}

QUESTION: {question}

RESPONSE STYLE: {response_style}

Instructions:
- Answer as {persona.name} would, staying completely in character
- Use your communication style and background to inform your response
- Include natural human elements like personal examples or hesitations
- Show genuine emotions and reactions based on your motivations and pain points
- Provide a response that varies in length naturally (could be short or detailed)
- Include specific, concrete details that make your response feel authentic
- Maintain consistency with your demographic details and background

Respond naturally as {persona.name} would to this question:"""
