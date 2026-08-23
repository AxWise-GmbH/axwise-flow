"""
AI Persona Generator for Interview Simulation.
"""

import asyncio
import logging
import os
import uuid
import random
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from pydantic_ai import Agent, ModelRetry, NativeOutput, RunContext
from pydantic_ai.models import Model

from ..models import (
    AIPersona,
    SimulatedPerson,
    BusinessContext,
    Stakeholder,
    SimulationConfig,
    PersonaGenerationItem,
    DemographicDetails,
    OCEANProfile,
)
from .ocean_sampler import OCEANSampler
from .occupation_classifier import OccupationClassifier

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PersonaRunContract:
    expected_count: int
    expected_country_codes: tuple[Optional[str], ...] = ()
    expected_localities: tuple[frozenset[str], ...] = ()


class PersonaGenerator:
    """Generates realistic AI personas for interview simulation."""

    def __init__(
        self,
        model: Model,
        ocean_sampler: Optional[OCEANSampler] = None,
        occupation_classifier: Optional[OccupationClassifier] = None,
    ):
        self.model = model
        self.ocean_sampler = ocean_sampler or OCEANSampler()
        self.occupation_classifier = occupation_classifier or OccupationClassifier()
        self.agent = Agent(
            model=model,
            deps_type=PersonaRunContract,
            output_type=NativeOutput(List[PersonaGenerationItem]),
            system_prompt=self._get_system_prompt(),
            retries={"output": 2},
        )

        @self.agent.output_validator
        async def validate_persona_batch(
            ctx: RunContext[PersonaRunContract], output: List[PersonaGenerationItem]
        ) -> List[PersonaGenerationItem]:
            expected = ctx.deps.expected_count
            indices = [item.profile_index for item in output]
            if expected is not None and (
                len(output) != expected or sorted(indices) != list(range(1, expected + 1))
            ):
                raise ModelRetry(
                    "Return exactly one persona for every profile_index, numbered 1 through "
                    f"{expected}, with no duplicates."
                )
            for item in output:
                position = item.profile_index - 1
                expected_codes = ctx.deps.expected_country_codes
                expected_code = (
                    expected_codes[position]
                    if 0 <= position < len(expected_codes)
                    else None
                )
                actual_code = str(
                    item.demographic_details.country_code or ""
                ).upper()
                if expected_code and actual_code != expected_code:
                    raise ModelRetry(
                        f"Profile {item.profile_index} must use assigned ISO country_code "
                        f"{expected_code}; do not infer or substitute a nearby market."
                    )
                locality_sets = ctx.deps.expected_localities
                localities = (
                    locality_sets[position]
                    if 0 <= position < len(locality_sets)
                    else frozenset()
                )
                if localities:
                    location = str(item.demographic_details.location or "").casefold()
                    if not any(locality in location for locality in localities):
                        raise ModelRetry(
                            f"Profile {item.profile_index} location must use its assigned "
                            "authorized locality."
                        )
            if any(
                len(item.name.strip()) < 3
                or len(item.background.strip()) < 40
                or len(item.motivations) < 2
                or len(item.pain_points) < 2
                or len(item.communication_style.strip()) < 10
                for item in output
            ):
                raise ModelRetry(
                    "Personas must contain a specific name, substantive background, at least "
                    "two motivations and pain points, and a concrete communication style."
                )
            return output
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

You MUST construct these personas strictly around the pre-assigned personality vectors described in the prompt.
Each profile_index maps to a pre-assigned profile. Your generated text MUST align:
- High Neuroticism (score > 0.6) forces the generated background to emphasize risk sensitivity, compliance requirements, and skepticism toward quick solutions.
- High Conscientiousness (score > 0.6) forces the persona to prefer structured execution, step-by-step methodologies, and strict documentation.
- Low Extraversion (score < 0.4) demands short, direct communication styles, avoiding conversational preambles.
- Low Agreeableness (score < 0.4) demands critical, adversarial viewpoints, challenging assumptions and looking for logical flaws.
- High Openness (score > 0.6) demands innovative approaches, open-mindedness, and curiosity.

Return a list of PersonaGenerationItem objects with all fields populated."""

    async def generate_people(
        self,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
        market_offset: int = 0,
    ) -> List[SimulatedPerson]:
        """Generate individual simulated people for a specific stakeholder type."""

        try:
            logger.info(
                f"Generating {config.people_per_stakeholder} people for stakeholder: {stakeholder.name}"
            )

            # Classify stakeholder to find the closest occupation code
            occupation_code = self.occupation_classifier.classify(stakeholder.name)
            logger.info(f"Classified stakeholder '{stakeholder.name}' as occupation: '{occupation_code}'")

            # Pre-sample OCEAN profiles
            sampled_profiles = []
            for i in range(config.people_per_stakeholder):
                age = self.ocean_sampler.sample_age(occupation_code)
                profile = self.ocean_sampler.sample(occupation_code, age)
                sampled_profiles.append((age, profile))

            prompt = self._build_person_prompt(
                stakeholder,
                business_context,
                config,
                sampled_profiles,
                market_offset=market_offset,
            )
            scope = getattr(business_context, "market_scope", None)
            resolved_markets = list(
                getattr(getattr(scope, "resolved_scope", None), "countries", []) or []
            )
            resolved_markets.sort(key=lambda market: market.priority != "primary")
            assigned_markets = [
                resolved_markets[(market_offset + index) % len(resolved_markets)]
                for index in range(config.people_per_stakeholder)
            ] if resolved_markets else []
            run_contract = PersonaRunContract(
                expected_count=config.people_per_stakeholder,
                expected_country_codes=tuple(
                    str(market.country_code).upper() for market in assigned_markets
                ),
                expected_localities=tuple(
                    frozenset(
                        str(locality).casefold()
                        for locality in market.localities
                        if str(locality).strip()
                    )
                    for market in assigned_markets
                ),
            )
            logger.info(f"Person generation prompt: {prompt[:200]}...")

            # Gemini 3.7 supports native JSON-schema output. PydanticAI owns
            # schema-repair retries; provider transport retries remain in the
            # configured HTTP client and we do not retry arbitrary exceptions.
            result = await self.agent.run(prompt, deps=run_contract)

            logger.info(f"PydanticAI result: {result}")
            people_items = result.output
            logger.info(f"Extracted items data: {people_items}")

            # Reconstruct SimulatedPerson objects and merge pre-sampled OCEAN data
            people = []
            for item in people_items:
                idx = item.profile_index - 1
                if 0 <= idx < len(sampled_profiles):
                    age, ocean = sampled_profiles[idx]
                else:
                    age = random.randint(25, 65)
                    ocean = self.ocean_sampler.sample(occupation_code, age)

                person = SimulatedPerson(
                    id=str(uuid.uuid4()),
                    name=item.name,
                    age=age,
                    background=item.background,
                    motivations=item.motivations,
                    pain_points=item.pain_points,
                    communication_style=item.communication_style,
                    stakeholder_type=stakeholder.name,
                    demographic_details=item.demographic_details,
                    physical_description=item.physical_description,
                    ocean_profile=ocean,
                )
                people.append(person)

            # Ensure we have the right number of people
            if len(people) != config.people_per_stakeholder:
                logger.warning(
                    f"Expected {config.people_per_stakeholder} people, got {len(people)}"
                )

            # Add stakeholder type, track names for uniqueness
            stakeholder_key = f"{stakeholder.name}_{stakeholder.description}"
            if stakeholder_key not in self.used_names_by_category:
                self.used_names_by_category[stakeholder_key] = set()

            for person in people:
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

    def _format_sampled_profiles(self, sampled_profiles: List[tuple]) -> str:
        profiles_desc = ""
        for idx, (age, profile) in enumerate(sampled_profiles):
            profiles_desc += f"""
Profile Index {idx + 1}:
- Target Age: {age}
- Openness: {profile.openness:.2f} ({"high" if profile.openness > 0.6 else "low" if profile.openness < 0.4 else "moderate"})
- Conscientiousness: {profile.conscientiousness:.2f} ({"high" if profile.conscientiousness > 0.6 else "low" if profile.conscientiousness < 0.4 else "moderate"})
- Extraversion: {profile.extraversion:.2f} ({"high" if profile.extraversion > 0.6 else "low" if profile.extraversion < 0.4 else "moderate"})
- Agreeableness: {profile.agreeableness:.2f} ({"high" if profile.agreeableness > 0.6 else "low" if profile.agreeableness < 0.4 else "moderate"})
- Neuroticism: {profile.neuroticism:.2f} ({"high" if profile.neuroticism > 0.6 else "low" if profile.neuroticism < 0.4 else "moderate"})
"""
        return profiles_desc

    def _build_person_prompt(
        self,
        stakeholder: Stakeholder,
        business_context: BusinessContext,
        config: SimulationConfig,
        sampled_profiles: List[tuple],
        market_offset: int = 0,
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

        primary_location = (
            (business_context.location or "").strip()
            if getattr(business_context, "location", None)
            else ""
        )

        profiles_desc = self._format_sampled_profiles(sampled_profiles)
        market_scope = getattr(business_context, "market_scope", None)
        resolved_markets = list(
            getattr(getattr(market_scope, "resolved_scope", None), "countries", [])
            or []
        )
        resolved_markets.sort(key=lambda market: market.priority != "primary")
        if resolved_markets:
            market_labels = ", ".join(
                f"{market.country_name} ({market.country_code})"
                for market in resolved_markets
            )
            assignments = []
            for profile_index in range(len(sampled_profiles)):
                market = resolved_markets[
                    (market_offset + profile_index) % len(resolved_markets)
                ]
                locality = (
                    f"; prefer {', '.join(market.localities)}"
                    if market.localities
                    else ""
                )
                assignments.append(
                    f"- Profile Index {profile_index + 1}: {market.country_name} "
                    f"({market.country_code}){locality}"
                )
            geography_guidelines = f"""EXACT AUTHORIZED MARKET SCOPE:
- Countries: {market_labels}
- Coverage mode: {market_scope.resolved_scope.coverage_mode}
- Participant assignments for this stakeholder sample:
{chr(10).join(assignments)}

Use each profile's assigned country. Do not substitute Germany, another nearby market,
or a generic regional persona. Country-wide evidence coverage is handled separately;
these assignments define the bounded synthetic-interview sample."""
        else:
            geography_guidelines = f"""LOCATION AND GEOGRAPHY GUIDELINES:
- Treat {primary_location or 'the explicitly authorized market'} as the geographic anchor.
- Do not infer a country from a city-only or ambiguous label.
- A different location is allowed only when the business context explicitly supports it."""

        grounding_context = getattr(business_context, "grounding_context", None)
        grounding_section = ""
        if grounding_context:
            import json
            grounding_section = (
                "\nGROUNDED MARKET DATA — FACT CONTEXT ONLY:\n"
                + json.dumps(grounding_context, ensure_ascii=False)[:12000]
                + "\nDo not convert test labels, exclusions, routing instructions, prior failure "
                "narratives, or market-comparison language into a person's biography.\n"
            )

        return f"""Generate {config.people_per_stakeholder} realistic individual people for the following context:

BUSINESS CONTEXT:
- Business Idea: {business_context.business_idea}
- Target Customer: {business_context.target_customer}
- Problem Being Solved: {business_context.problem}
- Industry: {business_context.industry}
- Primary Business Location: {primary_location or "Not specified"}

{geography_guidelines}
{grounding_section}

STAKEHOLDER TYPE:
- Name: {stakeholder.name}
- Description: {stakeholder.description}
- Questions They'll Be Asked: {', '.join(stakeholder.questions[:3])}{'...' if len(stakeholder.questions) > 3 else ''}

SIMULATION STYLE: {config.response_style.value}

PRE-ASSIGNED PERSONALITY PROFILES:
You MUST align each generated person with one of the pre-assigned profiles listed below.
The first person must correspond to Profile Index 1, the second to Profile Index 2, and so on.
{profiles_desc}

Create diverse individual people that would realistically be in this stakeholder category. Each person should:

1. Have a realistic name, age, and background matching the target age and pre-assigned personality traits of their profile
2. Include specific motivations related to this B2B business context
3. Have authentic pain points that connect to the problem being solved
4. Display a communication style reflecting their personality (e.g. direct/terse for low extraversion)
5. Include relevant demographic details (job, location, experience, etc.)

Make sure the people are diverse in:
- Professional backgrounds
- Locations within and around the primary business region, plus a few clearly relevant other locations when justified by the business context
- Experience levels

IMPORTANT: Generate individual people, not behavioral patterns. Each person should be a unique individual with their own characteristics, not a representative of a pattern or archetype.

CRITICAL REQUIREMENTS:
- Set the `profile_index` to match the target Profile Index (e.g. 1 for the first person, 2 for the second)
- Each person must have a UNIQUE first+last name across the entire simulation (across all stakeholder categories)
- Do NOT reuse any first+last combination listed as already used in this simulation
- Format: "FirstName LastName, Position/Title" (e.g., "Sarah Chen, Senior Finance Director")
- Personas should be distinctly different from each other within this stakeholder category
- Each person MUST include a `physical_description` field: a concise neutral visual description
  suitable for AI image generation (appearance, hair colour/length, rough age look, clothing style).
  Do NOT include names, company logos, or text in the description.
  Example: "a focused man in his mid-30s with short blond hair and light stubble, wearing a navy polo shirt"

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
        stakeholder_entries = []
        for stakeholder_category, stakeholder_list in stakeholders.items():
            logger.info(
                f"Processing {stakeholder_category} stakeholders: {len(stakeholder_list)} found"
            )
            stakeholder_entries.extend(stakeholder_list)

        performance_profile = getattr(
            getattr(config, "performance_profile", None), "value", None
        ) or str(getattr(config, "performance_profile", "standard"))
        quality_fast = performance_profile == "quality_fast"

        async def generate_one(index: int, stakeholder: Stakeholder):
            logger.info(
                f"Generating people for stakeholder: {stakeholder.name} (ID: {stakeholder.id})"
            )
            try:
                people = await self.generate_people(
                    stakeholder,
                    business_context,
                    config,
                    market_offset=index * max(1, config.people_per_stakeholder),
                )
                logger.info(
                    f"Generated {len(people)} people for {stakeholder.name}"
                )
                return people
            except Exception as e:
                logger.error(
                    f"Failed to generate people for {stakeholder.name}: {str(e)}",
                    exc_info=True,
                )
                return []

        if len(stakeholder_entries) > 1:
            # Concurrency is an execution property, not a quality downgrade: each
            # stakeholder keeps the same prompt, sample size, model, and validation.
            # Quality-fast may use a slightly wider window, while Standard no longer
            # pays an avoidable N-call latency chain.
            try:
                configured = int(
                    os.getenv(
                        "AXWISE_PERSONA_CONCURRENCY",
                        "5" if quality_fast else "4",
                    )
                )
            except ValueError:
                configured = 5 if quality_fast else 4
            max_concurrent = min(max(1, configured), 8, len(stakeholder_entries))
            semaphore = asyncio.Semaphore(max_concurrent)

            async def bounded_generate(index: int, stakeholder: Stakeholder):
                async with semaphore:
                    return await generate_one(index, stakeholder)

            groups = await asyncio.gather(
                *(bounded_generate(index, item) for index, item in enumerate(stakeholder_entries))
            )
            all_people = [person for group in groups for person in group]
        else:
            all_people = []
            for index, stakeholder in enumerate(stakeholder_entries):
                all_people.extend(await generate_one(index, stakeholder))

        logger.info(
            f"Generated {len(all_people)} total people across all stakeholder types"
        )
        return all_people

    async def generate_personas_for_decision_makers(
        self,
        decision_makers: List[Dict[str, Any]],
        business_context: BusinessContext,
    ) -> List[SimulatedPerson]:
        """
        Generate simulated personas directly corresponding to real decision makers.
        Each decision_maker dict has keys: 'name', 'role', 'company_name', 'company_id'.
        """
        if not decision_makers:
            return []

        # Pre-sample OCEAN profiles for the decision makers
        sampled_profiles = []
        for dm in decision_makers:
            role = dm.get("role", "generic")
            occupation_code = self.occupation_classifier.classify(role)
            age = self.ocean_sampler.sample_age(occupation_code)
            profile = self.ocean_sampler.sample(occupation_code, age)
            sampled_profiles.append((age, profile, occupation_code))

        # Construct a structured prompt listing the real decision makers
        dm_list_str = ""
        for idx, dm in enumerate(decision_makers):
            age, profile, _ = sampled_profiles[idx]
            dm_list_str += f"""
{idx + 1}. Name: {dm['name']}, Role: {dm['role']}, Company: {dm['company_name']}
   - Profile Target Age: {age}
   - Openness: {profile.openness:.2f}
   - Conscientiousness: {profile.conscientiousness:.2f}
   - Extraversion: {profile.extraversion:.2f}
   - Agreeableness: {profile.agreeableness:.2f}
   - Neuroticism: {profile.neuroticism:.2f}"""

        prompt = f"""You are an expert persona generator for customer research simulations.
Your task is to generate realistic simulated personas for the following real decision makers discovered in the target region:

BUSINESS CONTEXT:
- Business Idea: {business_context.business_idea}
- Target Customer: {business_context.target_customer}
- Problem Being Solved: {business_context.problem}
- Primary Business Location: {business_context.location or "Not specified"}

REAL DECISION MAKERS TO SIMULATE AND THEIR PRE-ASSIGNED PERSONALITIES:
{dm_list_str}

For each of these decision makers, generate a detailed simulated persona.
Each persona MUST match the real name, role, and company specified, and must align with the target age and pre-assigned personality traits of their profile.
If the name is a placeholder like 'Manager at ...' or similar, replace it with a realistic, diverse full name (first name + last name) suitable for a B2B professional in {business_context.location or 'the explicitly authorized market'}. Never infer a country that is absent from the business context.

Generate:
1. name: Keep the real name if provided, or replace placeholder names with a realistic full name.
2. background: their professional history matching their role and company
3. motivations: specific B2B motivations relevant to the context
4. pain_points: specific pain points relevant to the business problem
5. communication_style: their communication preferences (e.g. direct, detail-oriented) reflecting their personality
6. demographic_details: company size, education, location, and the exact assigned ISO country_code
7. physical_description: a concise visual description suitable for AI image generation (no text/logos)

CRITICAL REQUIREMENT:
- Set the `profile_index` to match the list index (1 for the first decision maker, 2 for the second, etc.)
"""
        try:
            logger.info(f"Generating personas for {len(decision_makers)} decision makers...")
            fallback_contract = PersonaRunContract(
                expected_count=len(decision_makers),
            )
            result = await self.agent.run(prompt, deps=fallback_contract)
            people_items = result.output

            people = []
            for item in sorted(people_items, key=lambda value: value.profile_index):
                # The native-output validator guarantees an exact 1..N index set.
                # Bind every generated record by that explicit identity rather
                # than by response order, which Gemini is free to vary.
                p_idx = item.profile_index - 1
                if not 0 <= p_idx < len(sampled_profiles):
                    raise ValueError(
                        f"Unexpected decision-maker profile_index {item.profile_index}"
                    )
                age, ocean, _occupation_code = sampled_profiles[p_idx]

                person = SimulatedPerson(
                    id=str(uuid.uuid4()),
                    name=item.name,
                    age=age,
                    background=item.background,
                    motivations=item.motivations,
                    pain_points=item.pain_points,
                    communication_style=item.communication_style,
                    stakeholder_type="Decision Maker",
                    demographic_details=item.demographic_details,
                    physical_description=item.physical_description,
                    ocean_profile=ocean,
                )

                dm = decision_makers[p_idx]
                decision_maker_name = str(dm.get("name") or "").strip()
                # If name was placeholder, let LLM name stand, otherwise use the real name.
                if decision_maker_name and not (
                    decision_maker_name.startswith("Manager at")
                    or "at " in decision_maker_name
                ):
                    person.name = decision_maker_name
                person.stakeholder_type = str(dm.get("role") or "Decision Maker")
                person.grounding_company = str(dm.get("company_name") or "")
                person.grounding_company_id = str(dm.get("company_id") or "")

                people.append(person)

            return people
        except Exception as e:
            logger.error(f"Failed to generate decision maker personas: {e}", exc_info=True)
            raise

    # Backward compatibility methods
    async def generate_personas(self, *args, **kwargs) -> List[AIPersona]:
        """Backward compatibility wrapper for generate_people."""
        return await self.generate_people(*args, **kwargs)

    async def generate_all_personas(self, *args, **kwargs) -> List[AIPersona]:
        """Backward compatibility wrapper for generate_all_people."""
        return await self.generate_all_people(*args, **kwargs)
