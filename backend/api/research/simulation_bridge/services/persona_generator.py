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
        self.used_names_by_category = {}  # Track used names per stakeholder category
        self.used_names_global = set()  # Track used names globally for chat simulations

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
        global_name_uniqueness: bool = False,
    ) -> List[AIPersona]:
        """Generate AI personas for a specific stakeholder type."""

        try:
            logger.info(
                f"Generating {config.personas_per_stakeholder} personas for stakeholder: {stakeholder.name}"
            )

            prompt = self._build_persona_prompt(
                stakeholder, business_context, config, global_name_uniqueness
            )
            logger.info(f"Persona generation prompt: {prompt[:200]}...")

            # Try with retry logic for Gemini API issues
            max_retries = 2
            for attempt in range(max_retries + 1):
                try:
                    # Use temperature 0 for structured JSON generation to avoid malformed responses
                    result = await self.agent.run(
                        prompt, model_settings={"temperature": 0.0}
                    )
                    break  # Success, exit retry loop
                except Exception as e:
                    if "MALFORMED_FUNCTION_CALL" in str(e) and attempt < max_retries:
                        logger.warning(
                            f"Gemini API error on attempt {attempt + 1}, retrying with simpler prompt..."
                        )
                        # Simplify the prompt for retry
                        simple_prompt = f"""Generate {config.personas_per_stakeholder} realistic persona(s) for:
Stakeholder: {stakeholder.name}
Business: {business_context.business_idea}
Target Customer: {business_context.target_customer}
Problem: {business_context.problem}

Keep responses concise and realistic."""
                        prompt = simple_prompt
                        continue
                    else:
                        raise  # Re-raise if final attempt or different error

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

            # Add IDs and stakeholder type, track names for uniqueness
            stakeholder_key = f"{stakeholder.name}_{stakeholder.description}"
            if stakeholder_key not in self.used_names_by_category:
                self.used_names_by_category[stakeholder_key] = set()

            for persona in personas:
                persona.id = str(uuid.uuid4())
                persona.stakeholder_type = stakeholder.id

                # Track names for uniqueness
                if global_name_uniqueness:
                    # Track globally for chat simulations
                    self.used_names_global.add(persona.name)
                else:
                    # Track within stakeholder category for regular simulations
                    self.used_names_by_category[stakeholder_key].add(persona.name)

            logger.info(
                f"Successfully generated {len(personas)} personas for {stakeholder.name}"
            )
            logger.info(
                f"Used names for {stakeholder.name}: {sorted(self.used_names_by_category[stakeholder_key])}"
            )
            return personas

        except Exception as e:
            logger.error(f"Failed to generate personas: {str(e)}", exc_info=True)
            raise

    def _build_persona_prompt(
        self,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
        global_name_uniqueness: bool = False,
    ) -> str:
        """Build the prompt for persona generation."""

        # Include used names to avoid duplicates
        used_names_text = ""

        if global_name_uniqueness:
            # For chat simulations, ensure globally unique names
            if self.used_names_global:
                used_names_text = f"\n\nIMPORTANT: Do NOT use these names (already used globally): {', '.join(sorted(self.used_names_global))}"
        else:
            # For regular simulations, only avoid duplicates within stakeholder category
            stakeholder_key = f"{stakeholder.name}_{stakeholder.description}"
            if (
                stakeholder_key in self.used_names_by_category
                and self.used_names_by_category[stakeholder_key]
            ):
                used_names_text = f"\n\nIMPORTANT: Do NOT use these names (already used for {stakeholder.name}): {', '.join(sorted(self.used_names_by_category[stakeholder_key]))}"

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

CRITICAL REQUIREMENTS:
- Each persona must have a UNIQUE name within this stakeholder category only
- Names should reflect the stakeholder's professional context and include position/title
- Format: "FirstName LastName, Position/Title" (e.g., "Sarah Chen, Senior Finance Director")
- Personas should be distinctly different from each other within this stakeholder category
- Focus on realistic diversity within the stakeholder category
- Different stakeholder categories can have people with similar names (they're different people)

The personas should feel like real people who would genuinely interact with this business idea.{used_names_text}"""

    async def generate_all_personas(
        self,
        stakeholders: Dict[str, List[Stakeholder]],
        business_context: BusinessContext,
        config: SimulationConfig,
        global_name_uniqueness: bool = True,  # Default to True for chat simulations
    ) -> List[AIPersona]:
        """Generate personas for all stakeholder types."""

        # Reset used names for each new simulation
        self.used_names_by_category.clear()
        self.used_names_global.clear()
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
                        stakeholder, business_context, config, global_name_uniqueness
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
