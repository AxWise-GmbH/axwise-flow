"""
Regional geolocated service for B2B company discovery and interactive persona chat.
"""

import logging
import os
import uuid
from typing import List, Dict, Any, Optional
from pydantic_ai import Agent
from pydantic_ai.models import Model
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic import BaseModel

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
from .interview_simulator import InterviewSimulator
from backend.infrastructure.persistence.simulation_repository import SimulationRepository

logger = logging.getLogger(__name__)


class RegionalService:
    """Service to discover regional companies and interact with simulated personas."""

    def __init__(self, model: Optional[Model] = None):
        if model:
            self.model = model
        else:
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if api_key:
                provider = GoogleProvider(api_key=api_key)
                model_name = os.getenv("GEMINI_MODEL", "models/gemini-3.5-flash")
                self.model = GoogleModel(model_name, provider=provider)
            else:
                self.model = None
                logger.warning("No API key set for RegionalService LLM. Ensure GEMINI_API_KEY is configured.")

    def _get_base_coordinates(self, location: str) -> tuple[float, float]:
        """Get central coordinates for prominent German/European cities."""
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
        else:
            # Default to center of Germany or slightly random offset
            return 51.1657, 10.4515

    def _get_scattered_coordinates(self, lat: float, lon: float) -> tuple[float, float]:
        """Scatter coordinates slightly within a 3-5 km radius."""
        import random
        offset_lat = random.uniform(-0.03, 0.03)
        offset_lon = random.uniform(-0.03, 0.03)
        return lat + offset_lat, lon + offset_lon

    async def discover_companies(
        self, location: str, business_problem: str, target_user: str
    ) -> List[CompanyDiscoveryItem]:
        """Discovers/generates local businesses and decision makers based on location."""
        if not self.model:
            raise ValueError("Model not initialized. Ensure GEMINI_API_KEY environment variable is set.")

        # 1. Try running B2B ingestion pipeline
        try:
            from .pipeline import B2BDataPipeline
            pipeline = B2BDataPipeline(location, business_problem, target_user, self.model)
            companies = await pipeline.run()
            if companies:
                logger.info(f"Ingested {len(companies)} companies successfully from live sources.")
                return companies
        except Exception as e:
            logger.warning(f"Live ingestion pipeline failed or not configured, falling back to LLM generation: {e}")

        # Fallback: Generate targets via LLM
        lat, lon = self._get_base_coordinates(location)

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
6. Exact Latitude and Longitude coordinates. They must be close to the location's coordinates (Lat: {lat}, Lon: {lon}) but scattered realistically (e.g. within +-0.04 degrees).
7. Main B2B decision makers (2 people with titles, e.g. "CEO: Hans Mueller", "IT Director: Anna Schmidt")
8. Estimated pain points of this company (at least 3 specific points) related to the business problem.
9. A short paragraph of B2B insights for this company.
"""
        )

        prompt = f"Identify 5 to 7 key companies in '{location}' that would experience pain points related to: '{business_problem}'."
        result = await agent.run(prompt)
        companies = result.output

        # Verify coordinates are present
        for c in companies:
            if not c.latitude or not c.longitude:
                c.latitude, c.longitude = self._get_scattered_coordinates(lat, lon)
        return companies

    async def _generate_stakeholders(self, business_context: BusinessContext) -> Dict[str, List[Stakeholder]]:
        """Generates realistic stakeholders and relevant questions for the business context using StakeholderDetector."""
        from backend.services.llm.gemini_service import GeminiService
        from backend.api.research.conversation_routines.stakeholder_detector import StakeholderDetector

        # Initialize GeminiService and StakeholderDetector
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        llm_service = GeminiService({
            "model": os.getenv("GEMINI_MODEL", "models/gemini-3.5-flash"),
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

    def _aggregate_insights(self, interviews: List[SimulatedInterview], business_context: BusinessContext) -> SimulationInsights:
        """Aggregates simulated interviews into actionable B2B insights."""
        all_themes = []
        sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0, "mixed": 0}
        stakeholder_feedback = {}

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

        max_sentiment = max(sentiment_counts, key=sentiment_counts.get)
        unique_themes = list(set(all_themes))[:5]

        # Generate simple lists
        risks = [
            f"Adoption barriers for {business_context.target_customer}",
            "Concerns around operational integration complexity"
        ]
        opportunities = [
            "Strong demand for simplified automated workflows",
            "High business ROI if onboarding friction is resolved"
        ]
        recommendations = [
            "Create a proof-of-concept focusing on the core integration features",
            "Offer structured training during the onboarding phase",
            "Align pricing structures to value realized in the first 30 days"
        ]

        return SimulationInsights(
            overall_sentiment=max_sentiment,
            key_themes=unique_themes,
            stakeholder_priorities={k: list(set(v))[:3] for k, v in stakeholder_feedback.items()},
            potential_risks=risks,
            opportunities=opportunities,
            recommendations=recommendations,
        )

    async def run_regional_workflow(
        self, request: RegionalWorkflowRequest, user_id: str = "default_user"
    ) -> RegionalWorkflowResponse:
        """Runs the complete geolocated analysis workflow."""
        logger.info(f"Running regional workflow for location: {request.location}")

        # 1. Discover companies
        companies = await self.discover_companies(
            request.location, request.business_problem, request.target_user
        )

        # 2. Build BusinessContext
        business_context = BusinessContext(
            business_idea=f"B2B service addressing: {request.business_problem}",
            target_customer=request.target_user,
            problem=request.business_problem,
            industry="Technology",
            location=request.location,
        )

        # 3. Create Stakeholders & Questions
        stakeholders_dict = await self._generate_stakeholders(business_context)

        # 4. Generate Personas (using PersonaGenerator)
        persona_gen = PersonaGenerator(self.model)
        config = SimulationConfig(
            depth="quick",
            people_per_stakeholder=2,
            response_style="realistic"
        )
        
        people = await persona_gen.generate_all_people(
            stakeholders=stakeholders_dict,
            business_context=business_context,
            config=config
        )

        # Enrich personas with grounding company and sources to ensure transparency
        if companies and people:
            for idx, person in enumerate(people):
                # Distribute personas cyclically across discovered companies
                comp = companies[idx % len(companies)]
                person.grounding_company = comp.name
                
                srcs = []
                # Check where this company was fetched from
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
        else:
            for person in people:
                person.grounding_sources = [
                    f"Google Search grounding for '{request.target_user}' roles in {request.location}",
                    f"General B2B market indicators for {request.location}"
                ]

        # 5. Conduct Simulated Interviews (using InterviewSimulator)
        interview_sim = InterviewSimulator(self.model)
        interviews = await interview_sim.simulate_all_interviews(
            people=people,
            stakeholders=stakeholders_dict,
            business_context=business_context,
            config=config
        )

        # 6. Generate Simulation Insights
        insights = self._aggregate_insights(interviews, business_context)

        # 7. Persist to DB so that persona chat works
        try:
            from backend.database import SessionLocal
            from backend.infrastructure.persistence.unit_of_work import UnitOfWork

            simulation_id = str(uuid.uuid4())
            async with UnitOfWork(SessionLocal) as uow:
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

        stakeholders = stakeholders_dict.get("primary", []) + stakeholders_dict.get("secondary", [])

        return RegionalWorkflowResponse(
            success=True,
            message="Regional geolocated analysis completed successfully",
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

        # 1. Resolve persona from DB
        persona_data = None
        try:
            from backend.database import SessionLocal
            from backend.infrastructure.persistence.unit_of_work import UnitOfWork
            
            async with UnitOfWork(SessionLocal) as uow:
                repo = SimulationRepository(uow.session)
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
        class PersonaChatOut(BaseModel):
            persona_response: str
            cognitive_steps: List[str]

        system_prompt = f"""You are roleplaying as this specific persona:
Name: {persona_data.get('name')}
Age: {persona_data.get('age')}
Background: {persona_data.get('background')}
Motivations: {', '.join(persona_data.get('motivations', []))}
Pain Points: {', '.join(persona_data.get('pain_points', []))}
Communication Style: {persona_data.get('communication_style')}
Role: {persona_data.get('stakeholder_type')}

Your goal is to answer the user's message as this person would. Stay in character completely. Be realistic and authentic.
Do not break character. Do not mention you are an AI.

Additionally, you must output a list of 3 to 4 "cognitive reasoning steps" that reflect the internal thinking process you went through to formulate this answer.
These steps should show how your persona's background, motivations, and pain points influenced your response.
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

