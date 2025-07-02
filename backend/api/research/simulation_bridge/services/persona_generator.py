"""
AI Persona Generator for Interview Simulation.
"""

import logging
import uuid
from typing import List, Dict, Any
from pydantic_ai import Agent
from pydantic_ai.models import Model

from ..models import AIPersona, BusinessContext, Stakeholder, SimulationConfig

logger = logging.getLogger(__name__)


class PersonaGenerator:
    """Generates realistic AI personas for interview simulation."""

    def __init__(self, model: Model):
        self.model = model
        self.agent = Agent(
            model=model,
            result_type=List[AIPersona],
            system_prompt=self._get_system_prompt(),
        )

    def _get_system_prompt(self) -> str:
        return """You are an expert persona generator for customer research simulations.

Your task is to create realistic, diverse personas that represent real people who would be stakeholders in the given business context.

Guidelines:
1. Create personas that are realistic and grounded in real demographics
2. Ensure diversity in age, background, experience, and perspectives
3. Include specific motivations and pain points relevant to the business context
4. Make communication styles authentic and varied
5. Include demographic details that affect their relationship to the business
6. Avoid stereotypes while maintaining authenticity

Each persona should be detailed enough to conduct realistic interviews but concise enough to be actionable.

Return a list of AIPersona objects with all required fields populated."""

    async def generate_personas(
        self,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> List[AIPersona]:
        """Generate AI personas for a specific stakeholder type."""

        try:
            logger.info(
                f"Generating {config.personas_per_stakeholder} personas for stakeholder: {stakeholder.name}"
            )

            prompt = self._build_persona_prompt(stakeholder, business_context, config)
            logger.info(f"Persona generation prompt: {prompt[:200]}...")

            result = await self.agent.run(
                prompt, model_settings={"temperature": config.temperature}
            )

            logger.info(f"PydanticAI result: {result}")
            # Use result.output (non-deprecated) - both are identical per our test
            personas = result.output
            logger.info(f"Extracted personas data: {personas}")
            logger.info(
                f"Personas type: {type(personas)}, length: {len(personas) if personas else 'None'}"
            )

            # Ensure we have the right number of personas
            if len(personas) != config.personas_per_stakeholder:
                logger.warning(
                    f"Expected {config.personas_per_stakeholder} personas, got {len(personas)}"
                )

            # Add IDs and stakeholder type
            for persona in personas:
                persona.id = str(uuid.uuid4())
                persona.stakeholder_type = stakeholder.id

            logger.info(f"Successfully generated {len(personas)} personas")
            return personas

        except Exception as e:
            logger.error(f"Failed to generate personas: {str(e)}", exc_info=True)
            raise

    def _build_persona_prompt(
        self,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> str:
        """Build the prompt for persona generation."""

        return f"""Generate {config.personas_per_stakeholder} realistic personas for the following context:

BUSINESS CONTEXT:
- Business Idea: {business_context.business_idea}
- Target Customer: {business_context.target_customer}
- Problem Being Solved: {business_context.problem}
- Industry: {business_context.industry}

STAKEHOLDER TYPE:
- Name: {stakeholder.name}
- Description: {stakeholder.description}
- Questions They'll Be Asked: {', '.join(stakeholder.questions[:3])}{'...' if len(stakeholder.questions) > 3 else ''}

SIMULATION STYLE: {config.response_style.value}

Create diverse personas that would realistically be in this stakeholder category. Each persona should:

1. Have a realistic name, age, and background
2. Include specific motivations related to this business context
3. Have authentic pain points that connect to the problem being solved
4. Display a distinct communication style
5. Include relevant demographic details (job, location, experience, etc.)

Make sure the personas are diverse in:
- Age ranges (but appropriate for the stakeholder type)
- Professional backgrounds
- Geographic locations
- Experience levels
- Personality types
- Communication preferences

The personas should feel like real people who would genuinely interact with this business idea."""

    async def generate_all_personas(
        self,
        stakeholders: Dict[str, List[Stakeholder]],
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> List[AIPersona]:
        """Generate personas for all stakeholder types."""

        all_personas = []

        for stakeholder_category, stakeholder_list in stakeholders.items():
            logger.info(
                f"Processing {stakeholder_category} stakeholders: {len(stakeholder_list)} found"
            )

            for stakeholder in stakeholder_list:
                logger.info(
                    f"Generating personas for stakeholder: {stakeholder.name} (ID: {stakeholder.id})"
                )
                try:
                    personas = await self.generate_personas(
                        stakeholder, business_context, config
                    )
                    logger.info(
                        f"Generated {len(personas)} personas for {stakeholder.name}"
                    )
                    all_personas.extend(personas)
                except Exception as e:
                    logger.error(
                        f"Failed to generate personas for {stakeholder.name}: {str(e)}",
                        exc_info=True,
                    )

        logger.info(
            f"Generated {len(all_personas)} total personas across all stakeholder types"
        )
        return all_personas
