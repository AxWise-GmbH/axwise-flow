"""
Orchestrator for the Simulation Bridge system.
Coordinates persona generation, interview simulation, and data formatting.
"""

import logging
import uuid
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime

import os
from pydantic_ai.models import Model
from pydantic_ai.models.gemini import GeminiModel

from ..models import (
    SimulationRequest,
    SimulationResponse,
    SimulationProgress,
    SimulationInsights,
    AIPersona,
    SimulatedInterview,
    QuestionsData,
    BusinessContext,
    Stakeholder,
)
from .persona_generator import PersonaGenerator
from .interview_simulator import InterviewSimulator
from .parallel_interview_simulator import ParallelInterviewSimulator
from .data_formatter import DataFormatter
from backend.infrastructure.persistence.simulation_repository import (
    SimulationRepository,
)
from backend.infrastructure.persistence.unit_of_work import UnitOfWork
from backend.database import SessionLocal

logger = logging.getLogger(__name__)


class SimulationOrchestrator:
    """Orchestrates the complete simulation process."""

    def __init__(self, use_parallel: bool = True, max_concurrent: int = 2):
        # Initialize Gemini model for PydanticAI
        # PydanticAI GeminiModel uses GEMINI_API_KEY environment variable automatically
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is required")

        # Use gemini-2.5-flash as preferred by user
        # PydanticAI will map this to the appropriate model version
        self.model = GeminiModel("gemini-2.5-flash")
        self.persona_generator = PersonaGenerator(self.model)
        self.interview_simulator = InterviewSimulator(self.model)
        self.parallel_interview_simulator = (
            ParallelInterviewSimulator(self.model, max_concurrent)
            if use_parallel
            else None
        )
        self.data_formatter = DataFormatter()
        self.active_simulations: Dict[str, SimulationProgress] = {}
        self.completed_simulations: Dict[str, SimulationResponse] = (
            {}
        )  # Keep for backward compatibility
        self.use_parallel = use_parallel

    async def parse_raw_questionnaire(self, content: str, config) -> SimulationRequest:
        """Parse raw questionnaire content using PydanticAI."""
        from pydantic_ai import Agent
        from pydantic import BaseModel
        from typing import List

        class StakeholderQuestions(BaseModel):
            name: str
            description: str
            questions: List[str]

        class ParsedQuestionnaire(BaseModel):
            business_idea: str
            target_customer: str
            problem: str
            primary_stakeholders: List[StakeholderQuestions]
            secondary_stakeholders: List[StakeholderQuestions]

        # Create PydanticAI agent for parsing
        parser_agent = Agent(
            model=self.model,
            result_type=ParsedQuestionnaire,
            system_prompt="""You are an expert at parsing customer research questionnaires.

            Extract the business context and organize questions by stakeholder type.

            Key requirements:
            1. Identify PRIMARY and SECONDARY stakeholders separately
            2. Group questions under their respective stakeholders
            3. Clean up questions by removing numbering and formatting
            4. Extract stakeholder names and descriptions accurately
            5. Ensure business_idea is never empty - infer from context if needed

            The questionnaire typically has sections like:
            - PRIMARY STAKEHOLDERS (3 stakeholders)
            - SECONDARY STAKEHOLDERS (2 stakeholders)

            Each stakeholder has:
            - Problem Discovery Questions
            - Solution Validation Questions
            - Follow-up Questions""",
        )

        prompt = f"""
        Parse this questionnaire file and extract:

        1. Business idea (main business concept)
        2. Target customer (who the business serves)
        3. Problem (what problem the business solves)
        4. Primary stakeholders with their questions
        5. Secondary stakeholders with their questions

        For each stakeholder, extract:
        - Name (preserve the EXACT stakeholder name as written in the questionnaire)
        - Description (brief description of their role)
        - Questions (all questions for that stakeholder, cleaned up)

        IMPORTANT: Use the exact stakeholder names from the questionnaire. Do not modify or standardize them.

        Content:
        {content}
        """

        logger.info("🤖 Using PydanticAI to parse questionnaire")
        result = await parser_agent.run(prompt)
        parsed = result.data

        logger.info(f"📋 Parsed questionnaire - Business idea: {parsed.business_idea}")
        logger.info(
            f"📋 Parsed questionnaire - Primary stakeholders: {[s.name for s in parsed.primary_stakeholders]}"
        )
        logger.info(
            f"📋 Parsed questionnaire - Secondary stakeholders: {[s.name for s in parsed.secondary_stakeholders]}"
        )

        # Count total questions
        total_questions = sum(
            len(s.questions)
            for s in parsed.primary_stakeholders + parsed.secondary_stakeholders
        )

        logger.info(
            f"✅ Parsed: {parsed.business_idea} | {len(parsed.primary_stakeholders)} primary + {len(parsed.secondary_stakeholders)} secondary stakeholders | {total_questions} total questions"
        )

        # Create primary stakeholders
        primary_stakeholders = []
        for i, stakeholder_data in enumerate(parsed.primary_stakeholders):
            stakeholder = Stakeholder(
                id=f"primary_{i}",
                name=stakeholder_data.name,
                description=stakeholder_data.description,
                questions=stakeholder_data.questions,
            )
            primary_stakeholders.append(stakeholder)
            logger.info(
                f"Primary stakeholder: '{stakeholder_data.name}' ({len(stakeholder_data.questions)} questions)"
            )

        # Create secondary stakeholders
        secondary_stakeholders = []
        for i, stakeholder_data in enumerate(parsed.secondary_stakeholders):
            stakeholder = Stakeholder(
                id=f"secondary_{i}",
                name=stakeholder_data.name,
                description=stakeholder_data.description,
                questions=stakeholder_data.questions,
            )
            secondary_stakeholders.append(stakeholder)
            logger.info(
                f"Secondary stakeholder: '{stakeholder_data.name}' ({len(stakeholder_data.questions)} questions)"
            )

        questions_data = QuestionsData(
            stakeholders={
                "primary": primary_stakeholders,
                "secondary": secondary_stakeholders,
            },
            timeEstimate={"totalQuestions": total_questions},
        )

        business_context = BusinessContext(
            business_idea=parsed.business_idea,
            target_customer=parsed.target_customer,
            problem=parsed.problem,
            industry="general",
        )

        return SimulationRequest(
            questions_data=questions_data,
            business_context=business_context,
            config=config,
        )

    async def run_simulation(self, request: SimulationRequest) -> SimulationResponse:
        """Run the complete simulation process."""

        simulation_id = str(uuid.uuid4())

        try:
            logger.info(f"Starting simulation: {simulation_id}")
            logger.info(f"Business context: {request.business_context}")
            logger.info(f"Questions data: {request.questions_data}")
            logger.info(f"Config: {request.config}")

            # Initialize progress tracking
            progress = SimulationProgress(
                simulation_id=simulation_id,
                stage="initializing",
                progress_percentage=0,
                current_task="Setting up simulation",
                total_personas=self._calculate_total_personas(request),
                total_interviews=self._calculate_total_personas(request),
            )
            self.active_simulations[simulation_id] = progress

            # Step 1: Generate personas
            await self._update_progress(
                simulation_id, "generating_personas", 10, "Generating AI personas"
            )
            personas = await self.persona_generator.generate_all_personas(
                request.questions_data.stakeholders,
                request.business_context,
                request.config,
            )
            logger.info(
                f"Generated {len(personas)} personas for simulation {simulation_id}"
            )

            # Step 2: Simulate interviews
            await self._update_progress(
                simulation_id,
                "simulating_interviews",
                30,
                "Conducting simulated interviews",
            )
            interviews = await self.interview_simulator.simulate_all_interviews(
                personas,
                request.questions_data.stakeholders,
                request.business_context,
                request.config,
            )
            logger.info(
                f"Generated {len(interviews)} interviews for simulation {simulation_id}"
            )

            # Step 3: Generate insights
            await self._update_progress(
                simulation_id, "generating_insights", 70, "Analyzing simulation results"
            )
            insights = await self._generate_insights(
                interviews, request.business_context
            )

            # Step 4: Format data for analysis
            await self._update_progress(
                simulation_id, "formatting_data", 85, "Preparing data for analysis"
            )
            formatted_data = self.data_formatter.format_for_analysis(
                personas, interviews, request.business_context, simulation_id
            )

            # Step 5: Complete
            await self._update_progress(
                simulation_id, "completed", 100, "Simulation completed"
            )

            # Create response
            response = SimulationResponse(
                success=True,
                message="Simulation completed successfully",
                simulation_id=simulation_id,
                data=formatted_data,
                metadata={
                    "total_personas": len(personas),
                    "total_interviews": len(interviews),
                    "simulation_config": request.config.model_dump(),
                    "created_at": datetime.utcnow().isoformat(),
                },
                personas=personas,
                interviews=interviews,
                simulation_insights=insights,
                recommendations=insights.recommendations if insights else [],
            )

            # Save completed simulation for later retrieval
            self.completed_simulations[simulation_id] = response

            logger.info(f"Simulation completed successfully: {simulation_id}")
            logger.info(f"Saved simulation results for ID: {simulation_id}")
            return response

        except Exception as e:
            logger.error(f"Simulation failed: {simulation_id} - {str(e)}")
            await self._update_progress(
                simulation_id, "failed", 0, f"Simulation failed: {str(e)}"
            )

            return SimulationResponse(
                success=False,
                message=f"Simulation failed: {str(e)}",
                simulation_id=simulation_id,
            )

    async def simulate_with_persistence(
        self, request: SimulationRequest, user_id: str = "testuser123"
    ) -> SimulationResponse:
        """
        Enhanced simulation with database persistence and parallel processing.
        """
        simulation_id = str(uuid.uuid4())

        try:
            logger.info(f"Starting enhanced simulation: {simulation_id}")

            # Initialize database connection
            async with UnitOfWork(SessionLocal) as uow:
                simulation_repo = SimulationRepository(uow.session)

                # Create simulation record
                await simulation_repo.create_simulation(
                    simulation_id=simulation_id,
                    user_id=user_id,
                    business_context=(
                        request.business_context.model_dump()
                        if request.business_context
                        else {}
                    ),
                    questions_data=(
                        request.questions_data.model_dump()
                        if request.questions_data
                        else {}
                    ),
                    simulation_config=request.config.model_dump(),
                )

                await uow.commit()
                logger.info(f"Created simulation record in database: {simulation_id}")

            # Step 1: Generate personas
            await self._update_progress(
                simulation_id, "generating_personas", 10, "Generating AI personas"
            )
            personas = await self.persona_generator.generate_all_personas(
                request.questions_data.stakeholders,
                request.business_context,
                request.config,
            )
            logger.info(
                f"Generated {len(personas)} personas for simulation {simulation_id}"
            )

            # Step 2: Simulate interviews (parallel or sequential)
            await self._update_progress(
                simulation_id,
                "simulating_interviews",
                30,
                "Conducting simulated interviews",
            )

            if self.use_parallel and self.parallel_interview_simulator:
                # Use parallel processing
                def progress_callback(
                    message: str, completed: int, total: int, failed: int
                ):
                    progress = 30 + int((completed / total) * 40)  # 30-70% range
                    asyncio.create_task(
                        self._update_progress(
                            simulation_id, "simulating_interviews", progress, message
                        )
                    )

                interviews = await self.parallel_interview_simulator.simulate_all_interviews_parallel(
                    personas,
                    request.questions_data.stakeholders,
                    request.business_context,
                    request.config,
                    progress_callback,
                )
            else:
                # Use sequential processing (fallback)
                interviews = await self.interview_simulator.simulate_all_interviews(
                    personas,
                    request.questions_data.stakeholders,
                    request.business_context,
                    request.config,
                )

            logger.info(
                f"Generated {len(interviews)} interviews for simulation {simulation_id}"
            )

            # Step 3: Generate insights
            await self._update_progress(
                simulation_id, "generating_insights", 70, "Analyzing simulation results"
            )
            insights = await self._generate_insights(
                interviews, request.business_context
            )

            # Step 4: Format data for analysis
            await self._update_progress(
                simulation_id, "formatting_data", 85, "Preparing data for analysis"
            )
            formatted_data = self.data_formatter.format_for_analysis(
                personas, interviews, request.business_context, simulation_id
            )

            # Step 4.5: Create separate stakeholder files
            await self._update_progress(
                simulation_id,
                "creating_files",
                90,
                "Creating stakeholder interview files",
            )
            stakeholder_files = self.data_formatter.create_stakeholder_files(
                personas, interviews, request.business_context, simulation_id
            )
            logger.info(f"Created {len(stakeholder_files)} stakeholder files")

            # Step 5: Save results to database
            await self._update_progress(
                simulation_id, "saving_results", 95, "Saving results to database"
            )

            async with UnitOfWork(SessionLocal) as uow:
                simulation_repo = SimulationRepository(uow.session)
                await simulation_repo.update_simulation_results(
                    simulation_id=simulation_id,
                    personas=[p.model_dump() for p in personas],
                    interviews=[i.model_dump() for i in interviews],
                    insights=insights.model_dump() if insights else None,
                    formatted_data=formatted_data,
                )
                await uow.commit()
                logger.info(f"Saved simulation results to database: {simulation_id}")

            # Step 6: Complete
            await self._update_progress(
                simulation_id, "completed", 100, "Simulation completed"
            )

            # Create response
            response = SimulationResponse(
                success=True,
                message="Enhanced simulation completed successfully",
                simulation_id=simulation_id,
                data=formatted_data,
                metadata={
                    "total_personas": len(personas),
                    "total_interviews": len(interviews),
                    "simulation_config": request.config.model_dump(),
                    "created_at": datetime.utcnow().isoformat(),
                    "processing_mode": (
                        "parallel" if self.use_parallel else "sequential"
                    ),
                    "stakeholder_files": stakeholder_files,
                    "stakeholders_processed": list(stakeholder_files.keys()),
                },
                personas=personas,
                interviews=interviews,
                simulation_insights=insights,
                recommendations=insights.recommendations if insights else [],
            )

            # Keep in memory for backward compatibility
            self.completed_simulations[simulation_id] = response

            logger.info(f"Enhanced simulation completed successfully: {simulation_id}")
            return response

        except Exception as e:
            logger.error(f"Enhanced simulation failed: {simulation_id} - {str(e)}")

            # Mark as failed in database
            try:
                async with UnitOfWork(SessionLocal) as uow:
                    simulation_repo = SimulationRepository(uow.session)
                    await simulation_repo.mark_simulation_failed(simulation_id, str(e))
                    await uow.commit()
            except Exception as db_error:
                logger.error(
                    f"Failed to mark simulation as failed in database: {db_error}"
                )

            await self._update_progress(
                simulation_id, "failed", 0, f"Simulation failed: {str(e)}"
            )

            return SimulationResponse(
                success=False,
                message=f"Enhanced simulation failed: {str(e)}",
                simulation_id=simulation_id,
            )
        finally:
            # Keep progress tracking for a bit longer to allow frontend to read final status
            # Don't immediately delete - let it be cleaned up later or by explicit calls
            pass

    async def _generate_insights(
        self, interviews: List[SimulatedInterview], business_context
    ) -> Optional[SimulationInsights]:
        """Generate insights from simulation results."""

        try:
            # Aggregate data for insights
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

            # Determine overall sentiment
            max_sentiment = max(sentiment_counts, key=sentiment_counts.get)

            # Get unique themes
            unique_themes = list(set(all_themes))[:10]  # Top 10 themes

            # Generate recommendations based on insights
            recommendations = self._generate_recommendations(
                interviews, business_context
            )

            insights = SimulationInsights(
                overall_sentiment=max_sentiment,
                key_themes=unique_themes,
                stakeholder_priorities=stakeholder_feedback,
                potential_risks=self._identify_risks(interviews),
                opportunities=self._identify_opportunities(interviews),
                recommendations=recommendations,
            )

            return insights

        except Exception as e:
            logger.error(f"Failed to generate insights: {str(e)}")
            return None

    def _generate_recommendations(
        self, interviews: List[SimulatedInterview], business_context
    ) -> List[str]:
        """Generate actionable recommendations from simulation."""
        recommendations = []

        # Analyze common themes
        negative_feedback = []
        positive_feedback = []

        for interview in interviews:
            if interview.overall_sentiment in ["negative", "mixed"]:
                negative_feedback.extend(interview.key_themes)
            else:
                positive_feedback.extend(interview.key_themes)

        # Generate recommendations based on feedback
        if negative_feedback:
            recommendations.append(
                "Address the most common concerns raised by stakeholders"
            )

        if positive_feedback:
            recommendations.append(
                "Leverage the positive aspects that stakeholders appreciate"
            )

        recommendations.extend(
            [
                "Consider conducting follow-up interviews with real customers",
                "Validate simulation insights with actual market research",
                "Use these insights to refine your business model",
            ]
        )

        return recommendations

    def _identify_risks(self, interviews: List[SimulatedInterview]) -> List[str]:
        """Identify potential risks from simulation."""
        risks = []

        negative_themes = []
        for interview in interviews:
            if interview.overall_sentiment in ["negative", "mixed"]:
                negative_themes.extend(interview.key_themes)

        if negative_themes:
            risks.append("Stakeholder concerns about value proposition")
            risks.append("Potential adoption barriers identified")

        return risks

    def _identify_opportunities(
        self, interviews: List[SimulatedInterview]
    ) -> List[str]:
        """Identify opportunities from simulation."""
        opportunities = []

        positive_themes = []
        for interview in interviews:
            if interview.overall_sentiment in ["positive", "mixed"]:
                positive_themes.extend(interview.key_themes)

        if positive_themes:
            opportunities.append("Strong stakeholder interest in core features")
            opportunities.append("Potential for market expansion")

        return opportunities

    def _calculate_total_personas(self, request: SimulationRequest) -> int:
        """Calculate total number of personas to be generated."""
        total_stakeholders = sum(
            len(stakeholders)
            for stakeholders in request.questions_data.stakeholders.values()
        )
        return total_stakeholders * request.config.personas_per_stakeholder

    async def _update_progress(
        self, simulation_id: str, stage: str, percentage: int, task: str
    ):
        """Update simulation progress."""
        if simulation_id in self.active_simulations:
            progress = self.active_simulations[simulation_id]
            progress.stage = stage
            progress.progress_percentage = percentage
            progress.current_task = task

            logger.info(f"Simulation {simulation_id}: {percentage}% - {task}")

    def get_simulation_progress(
        self, simulation_id: str
    ) -> Optional[SimulationProgress]:
        """Get current simulation progress."""
        return self.active_simulations.get(simulation_id)

    def cancel_simulation(self, simulation_id: str) -> bool:
        """Cancel a running simulation."""
        if simulation_id in self.active_simulations:
            del self.active_simulations[simulation_id]
            logger.info(f"Cancelled simulation: {simulation_id}")
            return True
        return False

    def get_completed_simulation(
        self, simulation_id: str
    ) -> Optional[SimulationResponse]:
        """Get a completed simulation result."""
        return self.completed_simulations.get(simulation_id)

    def list_completed_simulations(self) -> Dict[str, Dict[str, Any]]:
        """List all completed simulations with basic info."""
        return {
            sim_id: {
                "simulation_id": response.simulation_id,
                "success": response.success,
                "message": response.message,
                "created_at": (
                    response.metadata.get("created_at") if response.metadata else None
                ),
                "total_personas": (
                    response.metadata.get("total_personas") if response.metadata else 0
                ),
                "total_interviews": (
                    response.metadata.get("total_interviews")
                    if response.metadata
                    else 0
                ),
            }
            for sim_id, response in self.completed_simulations.items()
        }
