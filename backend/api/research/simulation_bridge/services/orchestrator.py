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
)
from .persona_generator import PersonaGenerator
from .interview_simulator import InterviewSimulator
from .data_formatter import DataFormatter

logger = logging.getLogger(__name__)


class SimulationOrchestrator:
    """Orchestrates the complete simulation process."""

    def __init__(self):
        # Initialize Gemini model for PydanticAI
        # PydanticAI GeminiModel uses GEMINI_API_KEY environment variable automatically
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is required")

        # Use working model name (PydanticAI may not support gemini-2.5-flash yet)
        # This maps to the latest available Gemini model in PydanticAI
        self.model = GeminiModel("gemini-2.0-flash-exp")
        self.persona_generator = PersonaGenerator(self.model)
        self.interview_simulator = InterviewSimulator(self.model)
        self.data_formatter = DataFormatter()
        self.active_simulations: Dict[str, SimulationProgress] = {}

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
                    "simulation_config": request.config.dict(),
                    "created_at": datetime.utcnow().isoformat(),
                },
                personas=personas,
                interviews=interviews,
                simulation_insights=insights,
                recommendations=insights.recommendations if insights else [],
            )

            logger.info(f"Simulation completed successfully: {simulation_id}")
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
