"""
AI Persona Generator for Interview Simulation.
"""

import logging
import uuid
from typing import List, Dict, Any
from pydantic_ai import Agent
from pydantic_ai.models import Model

from ..models import (
    AIPersona,
    SimulatedPerson,
    BusinessContext,
    Stakeholder,
    SimulationConfig,
)

logger = logging.getLogger(__name__)


class PersonaGenerator:
    """Generates realistic AI personas for interview simulation."""

    def __init__(self, model: Model):
        self.model = model
        self.agent = Agent(
            model=model,
            output_type=List[AIPersona],
            system_prompt=self._get_system_prompt(),
        )
        self.used_names_by_category = {}  # Track used names per stakeholder category
        self.used_names_global = set()  # Track used first+last names across entire simulation

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

    async def generate_people(
        self,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> List[SimulatedPerson]:
        """Generate individual simulated people for a specific stakeholder type."""

        try:
            logger.info(
                f"Generating {config.people_per_stakeholder} people for stakeholder: {stakeholder.name}"
            )

            prompt = self._build_person_prompt(stakeholder, business_context, config)
            logger.info(f"Person generation prompt: {prompt[:200]}...")

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
                        simple_prompt = f"""Generate {config.people_per_stakeholder} realistic individual people for:
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
            people = result.output  # Changed from personas to people
            logger.info(f"Extracted people data: {people}")
            logger.info(
                f"People type: {type(people)}, length: {len(people) if people else 'None'}"
            )

            # Ensure we have the right number of people
            if len(people) != config.people_per_stakeholder:
                logger.warning(
                    f"Expected {config.people_per_stakeholder} people, got {len(people)}"
                )

            # Add IDs and stakeholder type, track names for uniqueness
            stakeholder_key = f"{stakeholder.name}_{stakeholder.description}"
            if stakeholder_key not in self.used_names_by_category:
                self.used_names_by_category[stakeholder_key] = set()

            for person in people:
                person.id = str(uuid.uuid4())
                # Set stakeholder type to the stakeholder name for better readability
                person.stakeholder_type = stakeholder.name
                logger.info(
                    f"🏷️ Assigned stakeholder_type '{stakeholder.name}' to persona '{person.name}'"
                )

                # Enforce global uniqueness on first+last (before comma)
                base_name = person.name.split(',')[0].strip() if person.name else ""
                if base_name and base_name in self.used_names_global:
                    original = person.name
                    person.name = self._make_unique_full_name(person.name)
                    logger.info(f"🔁 Renamed duplicate '{original}' to '{person.name}'")
                    base_name = person.name.split(',')[0].strip()

                if base_name:
                    self.used_names_global.add(base_name)
                    # Track names for uniqueness within stakeholder category too
                    self.used_names_by_category[stakeholder_key].add(base_name)
                else:
                    # Fallback: add full name if parsing failed
                    self.used_names_by_category[stakeholder_key].add(person.name)

            logger.info(
                f"Successfully generated {len(people)} people for {stakeholder.name}"
            )
            logger.info(
                f"Used names for {stakeholder.name}: {sorted(self.used_names_by_category[stakeholder_key])}"
            )
            return people

        except Exception as e:
            logger.error(f"Failed to generate personas: {str(e)}", exc_info=True)
            raise

    def _make_unique_full_name(self, full_name: str) -> str:
        """Create a unique full name by adding a middle initial or numeric suffix.
        Works on the base 'First Last' part before the comma, preserves title after comma.
        """
        base, sep, title = (full_name or "").partition(',')
        base = base.strip()
        title = title.strip()
        parts = base.split()
        # Try adding middle initial variations if we have First and Last
        if len(parts) >= 2:
            first, last = parts[0], parts[-1]
            for i in range(26):
                candidate_base = f"{first} {chr(65 + i)}. {last}"
                if candidate_base not in getattr(self, 'used_names_global', set()):
                    return f"{candidate_base}{(', ' + title) if sep and title else ''}"
        # Fallback: append a numeric suffix
        suffix = 2
        while f"{base} {suffix}" in getattr(self, 'used_names_global', set()):
            suffix += 1
        candidate_base = f"{base} {suffix}"
        return f"{candidate_base}{(', ' + title) if sep and title else ''}"

    def _build_person_prompt(
        self,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> str:
        """Build the prompt for individual person generation."""

        # Include used names to avoid duplicates (category and global)
        used_names_text = ""
        stakeholder_key = f"{stakeholder.name}_{stakeholder.description}"
        if (
            stakeholder_key in self.used_names_by_category
            and self.used_names_by_category[stakeholder_key]
        ):
            used_names_text = f"\n\nIMPORTANT: Do NOT use these names (already used for {stakeholder.name}): {', '.join(sorted(self.used_names_by_category[stakeholder_key]))}"

        used_global_text = ""
        if getattr(self, 'used_names_global', None):
            global_list = sorted(list(self.used_names_global))
            if global_list:
                used_global_text = f"\n\nIMPORTANT: Do NOT reuse these first+last names across ANY stakeholder category in this simulation: {', '.join(global_list)}"

        return f"""Generate {config.people_per_stakeholder} realistic individual people for the following context:

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

Create diverse individual people that would realistically be in this stakeholder category. Each person should:

1. Have a realistic name, age, and background
2. Include specific motivations related to this business context
3. Have authentic pain points that connect to the problem being solved
4. Display a distinct communication style
5. Include relevant demographic details (job, location, experience, etc.)

Make sure the people are diverse in:
- Age ranges (but appropriate for the stakeholder type)
- Professional backgrounds
- Geographic locations
- Experience levels
- Personality types
- Communication preferences

IMPORTANT: Generate individual people, not behavioral patterns. Each person should be a unique individual with their own characteristics, not a representative of a pattern or archetype.

CRITICAL REQUIREMENTS:
- Each person must have a UNIQUE first+last name across the entire simulation (across all stakeholder categories)
- Do NOT reuse any first+last combination listed as already used in this simulation
- Format: "FirstName LastName, Position/Title" (e.g., "Sarah Chen, Senior Finance Director")
- Personas should be distinctly different from each other within this stakeholder category
- Focus on realistic diversity within the stakeholder category

The personas should feel like real people who would genuinely interact with this business idea.{used_names_text}{used_global_text}"""

    async def generate_all_people(
        self,
        stakeholders: Dict[str, List[Stakeholder]],
        business_context: BusinessContext,
        config: SimulationConfig,
    ) -> List[SimulatedPerson]:
        """Generate individual people for all stakeholder types."""

        # Reset used names for each new simulation
        self.used_names_by_category.clear()
        self.used_names_global.clear()
        all_people = []

        for stakeholder_category, stakeholder_list in stakeholders.items():
            logger.info(
                f"Processing {stakeholder_category} stakeholders: {len(stakeholder_list)} found"
            )

            for stakeholder in stakeholder_list:
                logger.info(
                    f"Generating people for stakeholder: {stakeholder.name} (ID: {stakeholder.id})"
                )
                try:
                    people = await self.generate_people(
                        stakeholder, business_context, config
                    )
                    logger.info(
                        f"Generated {len(people)} people for {stakeholder.name}"
                    )
                    all_people.extend(people)
                except Exception as e:
                    logger.error(
                        f"Failed to generate people for {stakeholder.name}: {str(e)}",
                        exc_info=True,
                    )

        logger.info(
            f"Generated {len(all_people)} total people across all stakeholder types"
        )
        return all_people

    # Backward compatibility methods
    async def generate_personas(self, *args, **kwargs) -> List[AIPersona]:
        """Backward compatibility wrapper for generate_people."""
        return await self.generate_people(*args, **kwargs)

    async def generate_all_personas(self, *args, **kwargs) -> List[AIPersona]:
        """Backward compatibility wrapper for generate_all_people."""
        return await self.generate_all_people(*args, **kwargs)
