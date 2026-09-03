"""
Regional geolocated service for B2B company discovery and interactive persona chat.
"""

import logging
import os
import re
import uuid
from collections import Counter
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from pydantic_ai import Agent, ModelRetry, NativeOutput, RunContext
from pydantic_ai.models import Model
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..models import (
    CompanyDiscoveryItem,
    RegionalWorkflowRequest,
    RegionalWorkflowResponse,
    PersonaChatRequest,
    PersonaChatResponse,
    BusinessContext,
    Stakeholder,
    SimulatedPerson,
    SimulatedInterview,
    SimulationInsights,
    InterviewResponse,
    DemographicDetails,
    SimulationConfig,
)
from .persona_generator import PersonaGenerator
from .pin_image_service import PinImageService
from .interview_simulator import InterviewSimulator
from .cognition_contracts import (
    IncompleteSimulationCohortError,
    run_cognition_stage,
)
from backend.services.llm.gemini_runtime import get_shared_research_model
from backend.infrastructure.persistence.simulation_repository import SimulationRepository

logger = logging.getLogger(__name__)


_INSIGHT_GROUNDING_STOPWORDS = {
    "about",
    "after",
    "before",
    "could",
    "from",
    "have",
    "into",
    "their",
    "there",
    "these",
    "they",
    "this",
    "those",
    "using",
    "with",
    "would",
}


def _grounding_terms(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"\b[\w-]+\b", value.casefold(), flags=re.UNICODE)
        if len(token) >= 4 and token not in _INSIGHT_GROUNDING_STOPWORDS
    }


@dataclass(frozen=True)
class RegionalInsightsRunContract:
    evidence_text: str


class RegionalInsightsOutput(BaseModel):
    """Bounded synthesis that must remain grounded in interview evidence."""

    model_config = ConfigDict(extra="forbid")

    potential_risks: List[str] = Field(min_length=3, max_length=4)
    opportunities: List[str] = Field(min_length=3, max_length=4)
    recommendations: List[str] = Field(min_length=3, max_length=5)

    @field_validator(
        "potential_risks",
        "opportunities",
        "recommendations",
        mode="before",
    )
    @classmethod
    def require_substantive_unique_items(cls, value: Any) -> List[str]:
        if not isinstance(value, list):
            raise ValueError("regional insight groups must be lists")
        normalized: List[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                raise ValueError("regional insight items must be strings")
            text = " ".join(item.strip().split())
            key = text.casefold()
            if len(text) < 18:
                raise ValueError("regional insight items must be substantive")
            if key in seen:
                raise ValueError("regional insight items must be distinct")
            seen.add(key)
            normalized.append(text)
        return normalized


class RegionalService:
    """Service to discover regional companies and interact with simulated personas."""

    def __init__(self, model: Optional[Model] = None):
        if model:
            self.model = model
        else:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if api_key:
                self.model = get_shared_research_model(api_key)
            else:
                self.model = None
                logger.warning("No API key set for RegionalService LLM. Ensure GEMINI_API_KEY is configured.")

    @staticmethod
    def _validate_regional_persona_cohort(
        selected_decision_makers: List[Dict[str, Any]],
        people: List[SimulatedPerson],
    ) -> None:
        """Require one correctly bound persona per selected decision maker."""

        expected_bindings = Counter(
            (
                str(item.get("company_id") or ""),
                str(item.get("role") or "Decision Maker"),
            )
            for item in selected_decision_makers
        )
        actual_bindings = Counter(
            (
                str(person.grounding_company_id or ""),
                str(person.stakeholder_type or ""),
            )
            for person in people
        )
        person_ids = [str(person.id or "").strip() for person in people]
        complete = (
            bool(selected_decision_makers)
            and actual_bindings == expected_bindings
            and all(person_ids)
            and len(set(person_ids)) == len(person_ids)
        )
        if not complete:
            raise IncompleteSimulationCohortError(
                "Regional persona cohort incomplete: "
                f"planned={len(selected_decision_makers)}, actual={len(people)}, "
                f"planned_bindings={dict(expected_bindings)}, "
                f"actual_bindings={dict(actual_bindings)}"
            )

    @staticmethod
    def _validate_regional_interview_cohort(
        people: List[SimulatedPerson],
        interviews: List[SimulatedInterview],
    ) -> None:
        """Require exactly one interview for every selected regional persona."""

        expected_ids = Counter(str(person.id or "").strip() for person in people)
        actual_ids = Counter(
            str(interview.person_id or "").strip() for interview in interviews
        )
        if actual_ids != expected_ids:
            missing = sorted((expected_ids - actual_ids).elements())
            unexpected = sorted((actual_ids - expected_ids).elements())
            raise IncompleteSimulationCohortError(
                "Regional interview cohort incomplete: exactly one interview is required "
                f"per persona; planned={len(people)}, actual={len(interviews)}, "
                f"missing_person_ids={missing}, "
                f"unexpected_or_duplicate_person_ids={unexpected}"
            )

    def _get_base_coordinates(self, location: str) -> Optional[tuple[float, float]]:
        """Return a verified built-in anchor or no anchor—never a default market."""
        loc_lower = location.lower()
        if "munich" in loc_lower or "münchen" in loc_lower:
            return 48.1351, 11.5820
        elif "berlin" in loc_lower:
            return 52.5200, 13.4050
        elif "frankfurt" in loc_lower:
            return 50.1109, 8.6821
        elif "hamburg" in loc_lower:
            return 53.5511, 9.9937
        elif "stuttgart" in loc_lower:
            return 48.7758, 9.1829
        elif "düsseldorf" in loc_lower or "duesseldorf" in loc_lower:
            return 51.2271, 6.7735
        elif "cologne" in loc_lower or "köln" in loc_lower:
            return 50.9375, 6.9603
        return None

    def _get_scattered_coordinates(self, lat: float, lon: float) -> tuple[float, float]:
        """Scatter coordinates slightly within a 3-5 km radius."""
        import random
        offset_lat = random.uniform(-0.03, 0.03)
        offset_lon = random.uniform(-0.03, 0.03)
        return lat + offset_lat, lon + offset_lon

    async def discover_companies(
        self, location: str, business_problem: str, target_user: str, data_source: str = "hybrid"
    ) -> List[CompanyDiscoveryItem]:
        """Discovers/generates local businesses and decision makers based on location."""
        if not self.model:
            raise ValueError("Model not initialized. Ensure GEMINI_API_KEY environment variable is set.")

        # 1. Try running B2B ingestion pipeline
        companies = []
        # 1. Try running B2B ingestion pipeline
        try:
            from .pipeline import B2BDataPipeline
            pipeline = B2BDataPipeline(location, business_problem, target_user, self.model, data_source)
            companies = await pipeline.run()
            if companies:
                logger.info(f"Ingested {len(companies)} companies successfully from live sources.")
        except Exception as e:
            logger.warning(f"Live ingestion pipeline failed or not configured, falling back to LLM generation: {e}")

        # Fallback: Generate targets via LLM
        if not companies:
            coordinates = self._get_base_coordinates(location)
            coordinate_instruction = (
                f"Use the verified anchor Lat: {coordinates[0]}, Lon: {coordinates[1]} "
                "and remain within roughly 0.04 degrees."
                if coordinates
                else (
                    f"Resolve coordinates only for the exact authorized market '{location}'. "
                    "If an exact coordinate cannot be supported, use 0.0 rather than a different "
                    "country or an invented default."
                )
            )

            agent = Agent(
                model=self.model,
                output_type=List[CompanyDiscoveryItem],
                system_prompt=f"""You are a B2B lead generation and regional market intelligence agent.
Your job is to identify or generate 5 to 7 realistic companies located in and around '{location}' that are relevant to this business problem:
'{business_problem}' and target user: '{target_user}'.

For each company, generate:
1. A unique ID (e.g. comp_1, comp_2, etc.)
2. Name of the company
3. Specific industry category
4. Size (e.g. '10-50 employees', '100-500 employees', '1000+ employees')
5. Specific local address or sub-district location in {location}
6. Exact Latitude and Longitude coordinates. {coordinate_instruction}
7. Main B2B decision makers (2 people with titles, e.g. "CEO: Hans Mueller", "IT Director: Anna Schmidt")
8. Estimated pain points of this company (at least 3 specific points) related to the business problem.
9. pain_point_sentences: Exactly 3 justification sentences supporting these pain points.
10. A short paragraph of B2B insights for this company.
"""
            )

            prompt = f"Identify 5 to 7 key companies in '{location}' that would experience pain points related to: '{business_problem}'."
            result = await agent.run(prompt)
            companies = result.output

            # Verify coordinates are present
            for c in companies:
                if (not c.latitude or not c.longitude) and coordinates:
                    c.latitude, c.longitude = self._get_scattered_coordinates(*coordinates)

        # Enrich and structure decision_maker_details from decision_makers list
        for c in companies:
            if not c.decision_maker_details and c.decision_makers:
                details = []
                for dm in c.decision_makers:
                    if ":" in dm:
                        role, name = dm.split(":", 1)
                        details.append({
                            "role": role.strip(),
                            "name": name.strip(),
                            "type": "natural_person"
                        })
                    else:
                        details.append({
                            "role": "Management",
                            "name": dm.strip(),
                            "type": "natural_person"
                        })
                c.decision_maker_details = details

        return companies

    async def _generate_stakeholders(self, business_context: BusinessContext) -> Dict[str, List[Stakeholder]]:
        """Generates realistic stakeholders and relevant questions for the business context using StakeholderDetector."""
        from backend.services.llm.gemini_service import GeminiService
        from backend.api.research.conversation_routines.stakeholder_detector import StakeholderDetector

        # Initialize GeminiService and StakeholderDetector
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        llm_service = GeminiService({
            "model": os.getenv("GEMINI_MODEL", "models/gemini-3.8-flash"),
            "api_key": api_key
        })
        detector = StakeholderDetector()

        # Build context analysis & message history matching StakeholderDetector parameters
        context_analysis = {
            "business_idea": business_context.business_idea,
            "target_customer": business_context.target_customer,
            "problem": business_context.problem,
            "location": business_context.location
        }
        
        # Call the StakeholderDetector routine
        results = await detector.generate_dynamic_stakeholders_with_unique_questions(
            llm_service=llm_service,
            context_analysis=context_analysis,
            messages=[], # no conversation history in regional batch workflow
            business_idea=business_context.business_idea,
            target_customer=business_context.target_customer,
            problem=business_context.problem
        )

        stakeholders_dict = {"primary": [], "secondary": []}

        # Process primary stakeholders
        for i, o in enumerate(results.get("primary", [])):
            questions_dict = o.get("questions", {})
            if isinstance(questions_dict, dict):
                flat_questions = (
                    questions_dict.get("problemDiscovery", []) +
                    questions_dict.get("solutionValidation", []) +
                    questions_dict.get("followUp", [])
                )
            elif isinstance(questions_dict, list):
                flat_questions = questions_dict
            else:
                flat_questions = []

            stakeholders_dict["primary"].append(
                Stakeholder(
                    id=f"regional_primary_{i}_{uuid.uuid4().hex[:6]}",
                    name=o.get("name", ""),
                    description=o.get("description", ""),
                    questions=flat_questions or [f"What challenges do you face related to {business_context.problem}?"],
                )
            )

        # Process secondary stakeholders
        for i, o in enumerate(results.get("secondary", [])):
            questions_dict = o.get("questions", {})
            if isinstance(questions_dict, dict):
                flat_questions = (
                    questions_dict.get("problemDiscovery", []) +
                    questions_dict.get("solutionValidation", []) +
                    questions_dict.get("followUp", [])
                )
            elif isinstance(questions_dict, list):
                flat_questions = questions_dict
            else:
                flat_questions = []

            stakeholders_dict["secondary"].append(
                Stakeholder(
                    id=f"regional_secondary_{i}_{uuid.uuid4().hex[:6]}",
                    name=o.get("name", ""),
                    description=o.get("description", ""),
                    questions=flat_questions or [f"What else should we consider regarding {business_context.business_idea}?"],
                )
            )

        return stakeholders_dict

    async def _aggregate_insights(self, interviews: List[SimulatedInterview], business_context: BusinessContext) -> SimulationInsights:
        """Aggregates simulated interviews into actionable B2B insights using LLM synthesis."""
        all_themes = []
        sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0, "mixed": 0}
        stakeholder_feedback = {}
        all_response_summaries = []

        for interview in interviews:
            all_themes.extend(interview.key_themes)
            sentiment_counts[interview.overall_sentiment] = (
                sentiment_counts.get(interview.overall_sentiment, 0) + 1
            )

            if interview.stakeholder_type not in stakeholder_feedback:
                stakeholder_feedback[interview.stakeholder_type] = []

            for response in interview.responses:
                stakeholder_feedback[interview.stakeholder_type].extend(
                    response.key_insights
                )
                all_response_summaries.append(
                    f"[{interview.stakeholder_type}] Q: {response.question[:80]} → {', '.join(response.key_insights[:2])}"
                )

        max_sentiment = max(sentiment_counts, key=sentiment_counts.get)
        unique_themes = list(set(all_themes))[:5]

        # Try LLM-powered aggregation for richer insights
        risks, opportunities, recommendations = await self._generate_llm_insights(
            all_response_summaries, business_context, unique_themes
        )

        return SimulationInsights(
            overall_sentiment=max_sentiment,
            key_themes=unique_themes,
            stakeholder_priorities={k: list(set(v))[:3] for k, v in stakeholder_feedback.items()},
            potential_risks=risks,
            opportunities=opportunities,
            recommendations=recommendations,
        )

    async def _generate_llm_insights(
        self,
        response_summaries: List[str],
        business_context: BusinessContext,
        themes: List[str],
    ) -> tuple:
        """Synthesize evidence-grounded risks, opportunities, and recommendations."""
        if not self.model or not response_summaries:
            raise ValueError(
                "Regional insight synthesis requires a model and interview evidence"
            )

        agent = Agent(
            model=self.model,
            deps_type=RegionalInsightsRunContract,
            output_type=NativeOutput(RegionalInsightsOutput),
            system_prompt=f"""You are a B2B market strategist synthesizing stakeholder interview data.

Business Problem: {business_context.problem}
Target Customer: {business_context.target_customer}
Key Themes from Interviews: {', '.join(themes)}

Based on the interview responses below, generate:
1. potential_risks: 3-4 specific risks, barriers, or friction points discovered from the interviews. Be concrete, not generic.
2. opportunities: 3-4 actionable opportunities identified from stakeholder feedback. Reference specific themes.
3. recommendations: 3-5 strategic recommendations with clear action items. Each should be a concrete next step.

Make all items SPECIFIC to the business context — not generic advice. Reference actual stakeholder feedback patterns.
""",
            retries={"output": 2},
        )

        @agent.output_validator
        async def validate_grounded_insights(
            ctx: RunContext[RegionalInsightsRunContract],
            output: RegionalInsightsOutput,
        ) -> RegionalInsightsOutput:
            evidence_terms = _grounding_terms(ctx.deps.evidence_text)
            unsupported_findings = [
                item
                for item in output.potential_risks + output.opportunities
                if len(_grounding_terms(item) & evidence_terms) < 2
            ]
            recommendation_terms = evidence_terms | _grounding_terms(
                "\n".join(output.potential_risks + output.opportunities)
            )
            unsupported_recommendations = [
                item
                for item in output.recommendations
                if len(_grounding_terms(item) & recommendation_terms) < 2
            ]
            if unsupported_findings or unsupported_recommendations:
                raise ModelRetry(
                    "Ground every risk, opportunity, and recommendation in multiple concrete "
                    "terms from the interview evidence or validated findings. Unsupported "
                    f"items: {(unsupported_findings + unsupported_recommendations)[:4]}"
                )
            return output

        # Take the first 20 summaries to keep the synthesis compact while
        # preserving every selected interview's structured insights upstream.
        summaries_text = "\n".join(response_summaries[:20])
        evidence_text = "\n".join(
            [
                business_context.problem,
                business_context.target_customer,
                *themes,
                summaries_text,
            ]
        )
        prompt = (
            "Synthesize these interview responses into strategic insights:\n\n"
            f"{summaries_text}"
        )

        result = await agent.run(
            prompt,
            deps=RegionalInsightsRunContract(evidence_text=evidence_text),
        )

        return (
            result.output.potential_risks,
            result.output.opportunities,
            result.output.recommendations,
        )

    async def run_regional_workflow(
        self, request: RegionalWorkflowRequest, user_id: str = "default_user"
    ) -> RegionalWorkflowResponse:
        """Runs the complete geolocated analysis workflow with reliability safeguards."""
        logger.info(f"Running regional workflow for location: {request.location}")

        simulation_id = str(uuid.uuid4())
        people: List[SimulatedPerson] = []
        interviews: List[SimulatedInterview] = []
        insights = None
        stakeholders_dict: Dict[str, List[Stakeholder]] = {"primary": [], "secondary": []}
        config = SimulationConfig(
            depth="quick",
            people_per_stakeholder=2,
            response_style="realistic"
        )

        # 1. Discover companies (critical — fail if this fails)
        if request.companies:
            companies = request.companies
            logger.info(f"Using {len(companies)} pre-discovered companies from request.")
        else:
            companies = await run_cognition_stage(
                "company_discovery",
                lambda: self.discover_companies(
                    request.location,
                    request.business_problem,
                    request.target_user,
                    request.data_source,
                ),
            )

        # 2. Build BusinessContext
        business_context = BusinessContext(
            business_idea=f"B2B service addressing: {request.business_problem}",
            target_customer=request.target_user,
            problem=request.business_problem,
            industry="Technology",
            location=request.location,
        )

        # 3. Create Stakeholders & Questions (wrapped for reliability)
        try:
            stakeholders_dict = await run_cognition_stage(
                "stakeholders",
                lambda: self._generate_stakeholders(business_context),
            )
            logger.info(f"Generated {len(stakeholders_dict.get('primary', []))} primary + {len(stakeholders_dict.get('secondary', []))} secondary stakeholders")
        except Exception as e:
            logger.error(f"Stakeholder generation failed, using fallback: {e}", exc_info=True)
            stakeholders_dict = {
                "primary": [
                    Stakeholder(
                        id=f"fallback_primary_0_{uuid.uuid4().hex[:6]}",
                        name=request.target_user or "Operations Manager",
                        description=f"Primary decision maker for {request.business_problem}",
                        questions=[
                            f"What challenges do you face related to {request.business_problem}?",
                            "How does this impact your daily operations?",
                            "What would an ideal solution look like?"
                        ],
                    )
                ],
                "secondary": []
            }

        # 4. Generate Personas (wrapped for reliability)
        selected_dms: List[Dict[str, Any]] = []
        try:
            persona_gen = PersonaGenerator(self.model)
            
            # Collect decision makers to simulate
            decision_makers_to_simulate = []
            for comp in companies:
                if comp.decision_maker_details:
                    for dm in comp.decision_maker_details:
                        decision_makers_to_simulate.append({
                            "name": dm.get("name"),
                            "role": dm.get("role"),
                            "company_name": comp.name,
                            "company_id": comp.id
                        })
                else:
                    # Add default decision makers for companies without details
                    decision_makers_to_simulate.append({
                        "name": f"Manager at {comp.name}",
                        "role": request.target_user or "Operations Manager",
                        "company_name": comp.name,
                        "company_id": comp.id
                    })

            # Limit total personas to prevent excessive API costs/timeouts (max 10)
            # Group by company to ensure even representation
            by_comp_dms = {}
            for dm in decision_makers_to_simulate:
                cid = dm["company_id"]
                if cid not in by_comp_dms:
                    by_comp_dms[cid] = []
                by_comp_dms[cid].append(dm)
            
            max_personas = 10
            round_idx = 0
            while len(selected_dms) < max_personas:
                added_any = False
                for cid in list(by_comp_dms.keys()):
                    dms = by_comp_dms[cid]
                    if round_idx < len(dms):
                        selected_dms.append(dms[round_idx])
                        added_any = True
                        if len(selected_dms) >= max_personas:
                            break
                if not added_any:
                    break
                round_idx += 1

            logger.info(f"Generating personas for {len(selected_dms)} selected decision makers (from {len(decision_makers_to_simulate)} total)...")
            people = await run_cognition_stage(
                "personas",
                lambda: persona_gen.generate_personas_for_decision_makers(
                    decision_makers=selected_dms,
                    business_context=business_context,
                ),
            )
            logger.info(f"Generated {len(people)} personas")
        except Exception as e:
            logger.error(f"Persona generation failed: {e}", exc_info=True)
            raise
        self._validate_regional_persona_cohort(selected_dms, people)

        # Enrich personas with grounding sources
        if companies and people:
            comp_map = {c.id: c for c in companies}
            for person in people:
                comp = comp_map.get(person.grounding_company_id)
                if not comp:
                    continue

                srcs = []
                is_registry = (
                    (comp.insights and ("OpenRegister" in comp.insights or "Handelsregister" in comp.insights))
                    or comp.register_number
                )
                if is_registry:
                    reg_info = comp.register_number or comp.id
                    if comp.register_court:
                        reg_info += f", {comp.register_court}"
                    srcs.append(f"Handelsregister (German Company Registry) {reg_info}")
                else:
                    srcs.append(f"Google Search Grounding for '{comp.name}' in {request.location}")

                if comp.website:
                    srcs.append(f"Official Company Website: {comp.website}")
                if comp.contact_phone:
                    srcs.append(f"Registry Telephone Contact: {comp.contact_phone}")
                if getattr(comp, 'linkedin_url', None):
                    srcs.append(f"LinkedIn: {comp.linkedin_url}")

                person.grounding_sources = srcs
        elif people:
            for person in people:
                person.grounding_sources = [
                    f"Google Search grounding for '{request.target_user}' roles in {request.location}",
                    f"General B2B market indicators for {request.location}"
                ]

        # 4b. Generate flat-pin avatar images for personas in parallel (non-blocking per persona)
        if people:
            try:
                api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
                pin_service = PinImageService(api_key=api_key)
                await pin_service.generate_pins_for_personas(people)
                generated_count = sum(1 for p in people if p.avatar_data_url)
                logger.info(f"Generated {generated_count}/{len(people)} persona avatar pins")
            except Exception as e:
                logger.warning(f"Avatar pin generation failed (non-critical): {e}")

        # 5. Conduct Simulated Interviews (wrapped for reliability)
        try:
            interview_sim = InterviewSimulator(self.model)
            interviews = await run_cognition_stage(
                "interviews",
                lambda: interview_sim.simulate_all_interviews(
                    personas=people,
                    stakeholders=stakeholders_dict,
                    business_context=business_context,
                    config=config,
                ),
            )
            logger.info(f"Completed {len(interviews)} interviews")
        except Exception as e:
            logger.error(f"Interview simulation failed: {e}", exc_info=True)
            raise
        self._validate_regional_interview_cohort(people, interviews)

        # 6. Generate Simulation Insights
        try:
            insights = await run_cognition_stage(
                "insights",
                lambda: self._aggregate_insights(interviews, business_context),
            )
        except Exception as exc:
            logger.error("Regional insight synthesis failed: %s", exc, exc_info=True)
            raise
        if not insights:
            raise RuntimeError("Regional insight synthesis returned no validated result")

        # 7. Persist to DB so that persona chat works
        try:
            from backend.database import SessionLocal
            from backend.infrastructure.persistence.unit_of_work import UnitOfWork

            async with UnitOfWork(SessionLocal) as uow:
                from backend.models import User
                existing_user = uow.session.query(User).filter(User.user_id == user_id).first()
                if not existing_user:
                    logger.info(f"Creating mock user {user_id} in DB to prevent foreign key violation")
                    new_user = User(
                        user_id=user_id,
                        email=f"{user_id}@example.com",
                        first_name="Mock",
                        last_name="User",
                        usage_data={"subscription": {"tier": "free", "status": "active"}, "usage": {}}
                    )
                    uow.session.add(new_user)
                    uow.session.flush()

                repo = SimulationRepository(uow.session)
                await repo.create_simulation(
                    simulation_id=simulation_id,
                    user_id=user_id,
                    business_context=business_context.model_dump(),
                    questions_data={
                        "stakeholders": {
                            "primary": [s.model_dump() for s in stakeholders_dict.get("primary", [])],
                            "secondary": [s.model_dump() for s in stakeholders_dict.get("secondary", [])]
                        }
                    },
                    simulation_config=config.model_dump(),
                )
                await repo.update_simulation_results(
                    simulation_id=simulation_id,
                    personas=[p.model_dump() for p in people],
                    interviews=[i.model_dump() for i in interviews],
                    insights=insights.model_dump(),
                    formatted_data={}
                )
                await uow.commit()
                logger.info(f"Saved regional workflow simulation {simulation_id} to DB")
        except Exception as db_err:
            logger.error(f"Failed to persist regional simulation to DB: {db_err}")
            raise RuntimeError(
                "Regional workflow completed cognition but could not persist its cohort"
            ) from db_err

        stakeholders = stakeholders_dict.get("primary", []) + stakeholders_dict.get("secondary", [])

        return RegionalWorkflowResponse(
            success=True,
            message="Regional geolocated analysis completed successfully",
            simulation_id=simulation_id,
            companies=companies,
            business_context=business_context,
            stakeholders=stakeholders,
            people=people,
            interviews=interviews,
            insights=insights,
        )

    async def persona_chat(self, request: PersonaChatRequest, user_id: str = "default_user") -> PersonaChatResponse:
        """Handles conversational dialogue with a persona and returns a cognitive trace of reasoning steps."""
        if not self.model:
            raise ValueError("Model not initialized.")

        # 1. Resolve persona from DB (scoped to simulation if provided)
        persona_data = None
        try:
            from backend.database import SessionLocal
            from backend.infrastructure.persistence.unit_of_work import UnitOfWork
            
            async with UnitOfWork(SessionLocal) as uow:
                repo = SimulationRepository(uow.session)

                # Try scoped lookup first (preferred — uses current simulation only)
                if request.simulation_id:
                    sim = await repo.get_by_simulation_id(request.simulation_id)
                    if sim and sim.personas:
                        for p in sim.personas:
                            if p.get("id") == request.persona_id:
                                persona_data = p
                                break
                        if persona_data:
                            logger.info(f"Found persona {request.persona_id} in simulation {request.simulation_id}")

                # Fallback: scan recent simulations
                if not persona_data:
                    simulations = await repo.get_user_simulations(user_id=user_id, limit=20)
                    for sim in simulations:
                        if sim.personas:
                            for p in sim.personas:
                                if p.get("id") == request.persona_id:
                                    persona_data = p
                                    break
                        if persona_data:
                            break
        except Exception as e:
            logger.error(f"Error loading persona {request.persona_id} from DB: {e}")

        # If not found in DB, fallback to a mock persona so it doesn't fail
        if not persona_data:
            logger.warning(f"Persona {request.persona_id} not found in DB, using fallback persona")
            persona_data = {
                "name": "Hans Müller, Lead Project Architect",
                "age": 45,
                "background": "Hans has 20 years of experience managing complex IT projects. He is highly critical of raw promises and values technical proof and integration documentation.",
                "motivations": ["Productivity efficiency", "Technical stability", "Clear documentation"],
                "pain_points": ["Vague specifications", "Unreliable APIs", "Time waste in meetings"],
                "communication_style": "direct, precise, professional, slightly skeptical",
                "stakeholder_type": "Technical Decision Maker"
            }

        # 2. Formulate cognitive steps
        # Ensure persona_data is a dict for easy access
        if not isinstance(persona_data, dict):
            persona_data = persona_data.model_dump() if hasattr(persona_data, "model_dump") else getattr(persona_data, "__dict__", {})

        class PersonaChatOut(BaseModel):
            persona_response: str
            cognitive_steps: List[str]

        cognitive_grounding_section = ""
        cog_grounding = persona_data.get("cognitive_grounding")
        if cog_grounding:
            if not isinstance(cog_grounding, dict):
                cog_grounding = cog_grounding.model_dump() if hasattr(cog_grounding, "model_dump") else getattr(cog_grounding, "__dict__", {})
            partition_id = cog_grounding.get("vector_partition_id")
            if partition_id:
                from .cognitive_grounding_service import CognitiveGroundingService
                try:
                    service = CognitiveGroundingService()
                    hits = service.query_similarity(partition_id=partition_id, query=request.message, limit=3)
                    if hits:
                        grounding_lines = []
                        for hit in hits:
                            doc_name = hit.get("document_name", "unknown")
                            chunk_idx = hit.get("chunk_index", 0)
                            content = hit.get("content", "").replace("\n", " ")
                            grounding_lines.append(f"- [Doc: {doc_name}, Chunk: {chunk_idx}]: \"{content}\"")
                        
                        cognitive_grounding_section = f"""
COGNITIVE GROUNDING REFERENCES (Strict Context):
{chr(10).join(grounding_lines)}

Instructions: Formulate your response as the persona. You must prioritize facts found in the GROUNDING REFERENCES. Cite your source documents directly where relevant.
"""
                except Exception as cg_err:
                    logger.warning(f"Error loading grounding context for persona chat: {cg_err}")

        ocean_data = persona_data.get("ocean_profile")
        ocean_section = ""
        if ocean_data:
            if not isinstance(ocean_data, dict):
                ocean_data = ocean_data.model_dump() if hasattr(ocean_data, "model_dump") else getattr(ocean_data, "__dict__", {})
            
            ocean_section = f"""
PERSONALITY PROFILE (strictly govern your response style by these scores):
- Openness: {ocean_data.get('openness', 0.5):.2f} → {"You are innovative, curious, and open to exploring unconventional solutions. Suggest creative alternatives." if ocean_data.get('openness', 0.5) > 0.6 else "You are traditional and pragmatic. Stick to proven methods and express skepticism toward novelty."}
- Conscientiousness: {ocean_data.get('conscientiousness', 0.5):.2f} → {"You are highly structured. Use detailed bullet points, numbered steps, and insist on documentation. Ask for timelines." if ocean_data.get('conscientiousness', 0.5) > 0.6 else "You are adaptable and value speed over format. Give loose, conversational answers."}
- Extraversion: {ocean_data.get('extraversion', 0.5):.2f} → {"You are assertive and talkative. Initiate topics, ask counter-questions, and give lengthy, energetic responses." if ocean_data.get('extraversion', 0.5) > 0.6 else "You are reserved and extremely concise. Speak only when necessary. Give short, direct answers."}
- Agreeableness: {ocean_data.get('agreeableness', 0.5):.2f} → {"You are collaborative and supportive. Seek common ground, acknowledge others' perspectives." if ocean_data.get('agreeableness', 0.5) > 0.6 else "You are highly critical and act as an adversarial auditor. Search for logical fallacies, challenge assumptions, and point out risks."}
- Neuroticism: {ocean_data.get('neuroticism', 0.5):.2f} → {"You are risk-averse. Focus on potential failures, bugs, security leaks, compliance gaps, and worst-case scenarios." if ocean_data.get('neuroticism', 0.5) > 0.6 else "You are calm and focus on progress. Acknowledge risks briefly but emphasize solutions."}
"""

        system_prompt = f"""You are roleplaying as this specific persona:
Name: {persona_data.get('name')}
Age: {persona_data.get('age')}
Background: {persona_data.get('background')}
Motivations: {', '.join(persona_data.get('motivations', []))}
Pain Points: {', '.join(persona_data.get('pain_points', []))}
Communication Style: {persona_data.get('communication_style')}
Role: {persona_data.get('stakeholder_type')}
{ocean_section}
{cognitive_grounding_section}
Your goal is to answer the user's message as this person would. Stay in character completely. Be realistic and authentic.
Do not break character. Do not mention you are an AI.

Additionally, you must output a list of 3 to 4 "cognitive reasoning steps" that reflect the internal thinking process you went through to formulate this answer.
These steps should show how your persona's background, motivations, pain points, and personality traits influenced your response.
Examples of steps:
- "Recalling previous integration frustrations with legacy software..."
- "Analyzing if this new service actually addresses the budget constraints..."
- "Adopting a skeptical and direct communication tone..."
- "Checking if the solution resolves the primary bottleneck of resource scarcity..."

Return the response containing the `persona_response` string and the `cognitive_steps` list.
"""

        agent = Agent(
            model=self.model,
            output_type=PersonaChatOut,
            system_prompt=system_prompt
        )

        # Build chat history context
        history_str = ""
        for msg in request.chat_history:
            role = "User" if msg.get("role") == "user" else "Persona"
            history_str += f"{role}: {msg.get('content')}\n"

        prompt = f"""
Chat History:
{history_str}

User's New Message:
{request.message}
"""

        result = await agent.run(prompt)
        chat_out = result.output

        return PersonaChatResponse(
            persona_response=chat_out.persona_response,
            cognitive_steps=chat_out.cognitive_steps
        )

    async def analyze_business_idea(self, business_idea: str) -> Dict[str, List[str]]:
        """Parses a business idea and suggests problems and target groups."""
        if not self.model:
            # Fallback if no model is configured
            return {
                "suggested_problems": [
                    "Manual paper-based scheduling and entry errors",
                    "Lack of real-time supplier inventory transparency",
                    "Fragmented and siloed communication channels"
                ],
                "suggested_target_groups": [
                    "Operations Manager",
                    "Head of Procurement",
                    "Supply Chain Director"
                ]
            }

        class AnalysisOut(BaseModel):
            suggested_problems: List[str]
            suggested_target_groups: List[str]

        agent = Agent(
            model=self.model,
            output_type=AnalysisOut,
            system_prompt="""You are a B2B product strategy and market entry expert.
Given a business idea or product description, identify:
1. Three concrete operational problems or bottlenecks that this business idea directly solves (e.g. 'Manual Excel-based dispatch tracking', 'Lack of real-time warehouse inventory visibility').
2. Three probable B2B target roles, stakeholders, or customer groups who feel this pain and would buy the product (e.g. 'Logistics Manager', 'Head of Procurement', 'Supply Chain Director').
Keep suggestions concise and specific.
"""
        )

        try:
            result = await agent.run(f"Business Idea: {business_idea}")
            return result.output.model_dump()
        except Exception as e:
            logger.error(f"Error analyzing business idea: {e}", exc_info=True)
            return {
                "suggested_problems": [
                    "Operational bottlenecks related to the idea",
                    "Inefficient manual tracking workflows",
                    "System synchronization delay"
                ],
                "suggested_target_groups": [
                    "Operations Manager",
                    "Department Supervisor",
                    "IT Director"
                ]
            }
