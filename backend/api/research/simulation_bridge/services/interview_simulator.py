"""
Interview Simulator for generating realistic interview responses.
"""

import logging
import random
from dataclasses import dataclass
from typing import List, Dict, Any
from pydantic_ai import Agent, ModelRetry, NativeOutput, RunContext
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


@dataclass(frozen=True)
class InterviewRunContract:
    questions: tuple[str, ...]


class InterviewSimulator:
    """Simulates realistic interviews with AI personas."""

    def __init__(self, model: Model):
        self.model = model
        self.agent = Agent(
            model=model,
            deps_type=InterviewRunContract,
            output_type=NativeOutput(SimulatedInterview),
            system_prompt=self._get_system_prompt(),
            retries={"output": 2},
        )
        @self.agent.output_validator
        async def validate_interview(
            ctx: RunContext[InterviewRunContract], output: SimulatedInterview
        ) -> SimulatedInterview:
            questions = list(ctx.deps.questions)
            observed = [" ".join(item.question.split()).casefold() for item in output.responses]
            expected = [" ".join(question.split()).casefold() for question in questions]
            if questions and observed != expected:
                raise ModelRetry("Return one complete response for every question, in the original order.")
            if any(
                len(item.response.strip()) < 20 or not item.sentiment.strip() or not item.key_insights
                for item in output.responses
            ):
                raise ModelRetry("Responses must contain substantive text, sentiment, and concrete insights.")
            return output

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
            run_contract = InterviewRunContract(tuple(stakeholder.questions))
            logger.info(f"Interview simulation prompt: {prompt[:200]}...")

            result = await self.agent.run(prompt, deps=run_contract)

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

    def _build_ocean_modulation(self, persona: AIPersona) -> str:
        """Generate OCEAN-based behavioral instructions for the interview prompt."""
        ocean = persona.ocean_profile
        if not ocean:
            return ""

        return f"""
PERSONALITY PROFILE (govern your response style strictly by these scores):
- Openness: {ocean.openness:.2f} → {"You are innovative, curious, and open to exploring unconventional solutions. Suggest creative alternatives." if ocean.openness > 0.6 else "You are traditional and pragmatic. Stick to proven methods and express skepticism toward novelty."}
- Conscientiousness: {ocean.conscientiousness:.2f} → {"You are highly structured. Use detailed bullet points, numbered steps, and insist on documentation. Ask for timelines." if ocean.conscientiousness > 0.6 else "You are adaptable and value speed over format. Give loose, conversational answers."}
- Extraversion: {ocean.extraversion:.2f} → {"You are assertive and talkative. Initiate topics, ask counter-questions, and give lengthy, energetic responses." if ocean.extraversion > 0.6 else "You are reserved and extremely concise. Speak only when necessary. Give short, direct answers."}
- Agreeableness: {ocean.agreeableness:.2f} → {"You are collaborative and supportive. Seek common ground, acknowledge others' perspectives." if ocean.agreeableness > 0.6 else "You are highly critical and act as an adversarial auditor. Search for logical fallacies, challenge assumptions, and point out risks."}
- Neuroticism: {ocean.neuroticism:.2f} → {"You are risk-averse. Focus on potential failures, bugs, security leaks, compliance gaps, and worst-case scenarios." if ocean.neuroticism > 0.6 else "You are calm and focus on progress. Acknowledge risks briefly but emphasize solutions."}

These personality traits MUST shape your word choice, response length, emotional tone, and the specific concerns you raise.
"""

    def _build_cognitive_grounding_section(self, persona: AIPersona, questions: List[str]) -> str:
        """Retrieve and format cognitive grounding context for the interview simulator."""
        if not persona.cognitive_grounding or not persona.cognitive_grounding.vector_partition_id:
            return ""

        partition_id = persona.cognitive_grounding.vector_partition_id
        from .cognitive_grounding_service import CognitiveGroundingService
        
        try:
            service = CognitiveGroundingService()
            all_chunks = []
            seen_chunk_ids = set()
            
            # Retrieve relevant chunks for each question to ensure high coverage
            for question in questions:
                try:
                    hits = service.query_similarity(partition_id=partition_id, query=question, limit=2)
                    for hit in hits:
                        if hit["id"] not in seen_chunk_ids:
                            seen_chunk_ids.add(hit["id"])
                            all_chunks.append(hit)
                except Exception as q_err:
                    logger.warning(f"Error querying grounding for question '{question}': {q_err}")
            
            if not all_chunks:
                return ""
            
            # Format chunks nicely
            grounding_lines = []
            for hit in all_chunks:
                doc_name = hit.get("document_name", "unknown")
                chunk_idx = hit.get("chunk_index", 0)
                content = hit.get("content", "").replace("\n", " ")
                grounding_lines.append(f"- [Doc: {doc_name}, Chunk: {chunk_idx}]: \"{content}\"")
                
            return f"""
COGNITIVE GROUNDING REFERENCES (Strict Context):
{chr(10).join(grounding_lines)}

Instructions: Formulate your response as the persona. You must prioritize facts found in the GROUNDING REFERENCES. Cite your source documents directly where relevant.
"""
        except Exception as e:
            logger.error(f"Failed to build cognitive grounding section: {e}", exc_info=True)
            return ""

    def _build_interview_prompt(
        self,
        persona: AIPersona,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> str:
        """Build the prompt for interview simulation."""

        primary_location = (
            (business_context.location or "").strip()
            if getattr(business_context, "location", None)
            else ""
        )

        ocean_modulation = self._build_ocean_modulation(persona)
        cognitive_grounding = self._build_cognitive_grounding_section(persona, stakeholder.questions)

        return f"""Simulate a customer research interview with the following persona:

PERSONA DETAILS:
- Name: {persona.name}
- Age: {persona.age}
- Background: {persona.background}
- Motivations: {', '.join(persona.motivations)}
- Pain Points: {', '.join(persona.pain_points)}
- Communication Style: {persona.communication_style}
- Demographics: {persona.demographic_details}
{ocean_modulation}
{cognitive_grounding}

BUSINESS CONTEXT:
- Business Idea: {business_context.business_idea}
- Target Customer: {business_context.target_customer}
- Problem: {business_context.problem}
- Primary Business Location: {primary_location or "Not specified"}

LOCATION & REGIONAL CONTEXT:
- Treat the primary business location as the main geographic anchor for this project.
- Assume that most personas and stakeholders are based in or near this primary region.
- If this persona's own location (as implied by their demographics) is different, make that location clearly and realistically connected to the primary business location (for example, another office, regional customer, partner, or supplier site).
- Align institutions, labor practices, and regulatory references with the appropriate region for each person's location.
- Avoid introducing clearly unrelated cities or regions unless the business idea explicitly describes operations there.

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
8. Keep the persona's story and examples consistent with both their own location and the company's primary business location, using realistic geographic relationships (nearby cities/regions, key markets, supplier locations, etc.).

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
            
            stakeholder = None
            if persona.stakeholder_type in stakeholder_lookup:
                stakeholder = stakeholder_lookup[persona.stakeholder_type]
                logger.info(
                    f"✅ Found matching stakeholder '{stakeholder.name}' for persona '{persona.name}'"
                )
            elif stakeholders.get("primary"):
                stakeholder = stakeholders["primary"][0]
                logger.info(
                    f"⚠️ No exact stakeholder match for '{persona.stakeholder_type}'. "
                    f"Falling back to primary stakeholder '{stakeholder.name}' for persona '{persona.name}'."
                )
            elif stakeholder_lookup:
                stakeholder = list(stakeholder_lookup.values())[0]
                logger.info(
                    f"⚠️ Falling back to first available stakeholder '{stakeholder.name}' for persona '{persona.name}'."
                )

            if stakeholder:
                try:
                    interview = await self.simulate_interview(
                        persona, stakeholder, business_context, config
                    )
                    all_interviews.append(interview)
                except Exception as e:
                    logger.error(f"Error simulating interview for '{persona.name}': {e}", exc_info=True)
            else:
                logger.warning(
                    f"❌ No stakeholder found or available for persona '{persona.name}' with type '{persona.stakeholder_type}'"
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

            result = await single_response_agent.run(prompt)

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

        primary_location = (
            (business_context.location or "").strip()
            if getattr(business_context, "location", None)
            else ""
        )

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
- Primary Business Location: {primary_location or "Not specified"}

LOCATION & REGIONAL CONTEXT:
- Assume the company is primarily based in this location.
- Most stakeholders are in or near this region; if your own implied location is different, it should be realistically connected to this primary region (another office, key customer region, supplier site, or important partner region).
- Avoid referring to obviously unrelated regions or cities unless the business idea clearly involves them.
- Align any institutional, labor, or regulatory references with the appropriate region for the locations you mention.

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
- Keep your story and examples consistent with both your own implied location and the company's primary business location, using realistic geographic relationships (nearby cities/regions, markets, suppliers, etc.).

Respond naturally as {persona.name} would to this question:"""
