"""
Data Formatter for converting simulation results to analysis pipeline format.
"""

import logging
import json
import tempfile
import os
from typing import List, Dict, Any, Optional
from datetime import datetime

from ..models import AIPersona, SimulatedInterview, BusinessContext

logger = logging.getLogger(__name__)


class DataFormatter:
    """Formats simulation data for the analysis pipeline."""

    def __init__(self):
        pass

    def format_for_analysis(
        self,
        personas: List[AIPersona],
        interviews: List[SimulatedInterview],
        business_context: BusinessContext,
        simulation_id: str,
    ) -> Dict[str, Any]:
        """Format simulation data for the analysis pipeline."""

        try:
            logger.info(f"Formatting simulation data for analysis: {simulation_id}")

            # Store personas for use in analysis text generation
            self.personas = personas

            # Create the formatted data structure
            formatted_data = {
                "metadata": self._create_metadata(business_context, simulation_id),
                "personas": self._format_personas(personas),
                "interviews": self._format_interviews(interviews),
                "analysis_ready_text": self._create_analysis_text(interviews, business_context),
                "file_info": self._create_file_info(simulation_id),
            }

            logger.info("Successfully formatted simulation data for analysis")
            return formatted_data

        except Exception as e:
            logger.error(f"Failed to format simulation data: {str(e)}")
            raise

    def _create_metadata(
        self, business_context: BusinessContext, simulation_id: str
    ) -> Dict[str, Any]:
        """Create metadata for the simulation."""
        return {
            "simulation_id": simulation_id,
            "created_at": datetime.utcnow().isoformat(),
            "business_context": {
                "business_idea": business_context.business_idea,
                "target_customer": business_context.target_customer,
                "problem": business_context.problem,
                "industry": business_context.industry,
                "location": business_context.location,
            },
            "data_source": "ai_simulation",
            "format_version": "1.0",
        }

    def _format_personas(self, personas: List[AIPersona]) -> List[Dict[str, Any]]:
        """Format personas for analysis."""
        formatted_personas = []

        for persona in personas:
            formatted_persona = {
                "id": persona.id,
                "name": persona.name,
                "age": persona.age,
                "background": persona.background,
                "stakeholder_type": persona.stakeholder_type,
                "demographics": persona.demographic_details.model_dump(),
                "profile": {
                    "motivations": persona.motivations,
                    "pain_points": persona.pain_points,
                    "communication_style": persona.communication_style,
                },
            }
            formatted_personas.append(formatted_persona)

        return formatted_personas

    def _format_interviews(
        self, interviews: List[SimulatedInterview]
    ) -> List[Dict[str, Any]]:
        """Format interviews for analysis."""
        formatted_interviews = []

        for interview in interviews:
            formatted_interview = {
                "persona_id": interview.persona_id,
                "stakeholder_type": interview.stakeholder_type,
                "duration_minutes": interview.interview_duration_minutes,
                "overall_sentiment": interview.overall_sentiment,
                "key_themes": interview.key_themes,
                "responses": [
                    {
                        "question": response.question,
                        "response": response.response,
                        "sentiment": response.sentiment,
                        "insights": response.key_insights,
                        "follow_ups": response.follow_up_questions or [],
                    }
                    for response in interview.responses
                ],
            }
            formatted_interviews.append(formatted_interview)

        return formatted_interviews

    def _create_analysis_text(
        self,
        interviews: List[SimulatedInterview],
        business_context: BusinessContext,
    ) -> str:
        """Create a consolidated text for analysis pipeline.

        NOTE: The output format uses the stakeholder-aware interview format:
            --- INTERVIEW N ---
            Stakeholder: <stakeholder_type>
            Speaker: <persona_name>

        This format is recognized by StakeholderAwareTranscriptProcessor._parse_stakeholder_sections
        and enables per-stakeholder persona generation from simulation data.
        """
        text_parts = []

        primary_location = getattr(business_context, "location", None)
        if primary_location:
            text_parts.append(f"BUSINESS PRIMARY LOCATION: {primary_location}")
            text_parts.append(
                "Most simulated stakeholders and interviews represent people who are based in or near this primary region. "
                "Some interviews may involve people in other locations when that location is clearly relevant to the business "
                "(for example, another office, a key regional customer, or a supplier site)."
            )
            text_parts.append(
                "When interpreting geography, assume institutions, labor practices, and regulations that are appropriate for each person's stated location."
            )
            text_parts.append("")

        for interview_num, interview in enumerate(interviews, 1):
            # Find the persona name for this interview
            persona_name = "Unknown"
            for persona in self.personas if hasattr(self, "personas") else []:
                if persona.id == interview.person_id:
                    persona_name = persona.name
                    break

            # Use stakeholder-aware format recognized by _parse_stakeholder_sections
            text_parts.append(f"--- INTERVIEW {interview_num} ---")
            text_parts.append(f"Stakeholder: {interview.stakeholder_type}")
            text_parts.append(f"Speaker: {persona_name}")
            text_parts.append(f"Overall Sentiment: {interview.overall_sentiment}")
            text_parts.append(f"Key Themes: {', '.join(interview.key_themes)}")
            text_parts.append("")

            for i, response in enumerate(interview.responses, 1):
                text_parts.append(f"Q{i}: {response.question}")
                text_parts.append(f"A{i}: {response.response}")
                text_parts.append("")

        return "\n".join(text_parts)

    def _create_file_info(self, simulation_id: str) -> Dict[str, Any]:
        """Create file information for the analysis pipeline."""
        return {
            "filename": f"simulation_{simulation_id}.json",
            "file_type": "simulation_data",
            "size_estimate": "varies",
            "encoding": "utf-8",
        }

    def create_stakeholder_files(
        self,
        personas: List[AIPersona],
        interviews: List[SimulatedInterview],
        business_context: BusinessContext,
        simulation_id: str,
    ) -> Dict[str, str]:
        """
        Create separate interview files for each stakeholder type.

        Returns:
            Dict mapping stakeholder names to file paths
        """
        try:
            logger.info(
                f"Creating separate stakeholder files for simulation: {simulation_id}"
            )

            # Group interviews by stakeholder type
            stakeholder_interviews = {}
            for interview in interviews:
                stakeholder_type = interview.stakeholder_type
                if stakeholder_type not in stakeholder_interviews:
                    stakeholder_interviews[stakeholder_type] = []
                stakeholder_interviews[stakeholder_type].append(interview)

            # Group personas by stakeholder type
            stakeholder_personas = {}
            for persona in personas:
                # Find the stakeholder name from interviews (since we fixed the stakeholder_type)
                for interview in interviews:
                    if interview.person_id == persona.id:
                        stakeholder_type = interview.stakeholder_type
                        if stakeholder_type not in stakeholder_personas:
                            stakeholder_personas[stakeholder_type] = []
                        stakeholder_personas[stakeholder_type].append(persona)
                        break

            # Create files for each stakeholder
            stakeholder_files = {}
            for stakeholder_type, interviews_list in stakeholder_interviews.items():
                file_path = self._create_stakeholder_file(
                    stakeholder_type,
                    stakeholder_personas.get(stakeholder_type, []),
                    interviews_list,
                    business_context,
                    simulation_id,
                )
                stakeholder_files[stakeholder_type] = file_path
                logger.info(f"Created file for {stakeholder_type}: {file_path}")

            return stakeholder_files

        except Exception as e:
            logger.error(f"Failed to create stakeholder files: {str(e)}")
            raise

    def _create_stakeholder_file(
        self,
        stakeholder_type: str,
        personas: List[AIPersona],
        interviews: List[SimulatedInterview],
        business_context: BusinessContext,
        simulation_id: str,
    ) -> str:
        """Create a single stakeholder interview file."""
        import tempfile
        from datetime import datetime

        # Create safe filename
        safe_stakeholder_name = (
            stakeholder_type.replace(" ", "_").replace("/", "_").lower()
        )
        timestamp = datetime.now().strftime("%Y-%m-%d")

        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=f"_{safe_stakeholder_name}_{timestamp}.txt",
            delete=False,
            prefix="interviews_",
        ) as f:
            # Write header
            f.write(f"STAKEHOLDER INTERVIEWS: {stakeholder_type.upper()}\n")
            f.write("=" * 60 + "\n\n")

            # Write metadata
            f.write("SIMULATION METADATA\n")
            f.write("-" * 20 + "\n")
            f.write(f"Simulation ID: {simulation_id}\n")
            f.write(f"Created: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Business Idea: {business_context.business_idea}\n")
            f.write(f"Target Customer: {business_context.target_customer}\n")
            f.write(f"Problem: {business_context.problem}\n")
            f.write(f"Stakeholder Type: {stakeholder_type}\n")
            f.write(f"Number of Interviews: {len(interviews)}\n\n")

            # Write each interview
            for i, interview in enumerate(interviews, 1):
                # Find the persona for this interview
                persona_name = "Unknown"
                persona_details = None
                for persona in personas:
                    if persona.id == interview.person_id:
                        persona_name = persona.name
                        persona_details = persona
                        break

                f.write(f"INTERVIEW {i}\n")
                f.write("=" * 16 + "\n\n")
                f.write(f"Persona: {persona_name}\n")
                f.write(f"Stakeholder Type: {stakeholder_type}\n")

                if persona_details:
                    f.write(f"Age: {persona_details.age}\n")
                    f.write(f"Background: {persona_details.background}\n")
                    f.write(
                        f"Communication Style: {persona_details.communication_style}\n"
                    )

                f.write(f"Overall Sentiment: {interview.overall_sentiment}\n")
                f.write(
                    f"Interview Duration: {interview.interview_duration_minutes} minutes\n\n"
                )

                f.write("RESPONSES:\n")
                f.write("-" * 10 + "\n\n")

                # Write Q&A pairs
                for j, response in enumerate(interview.responses, 1):
                    f.write(f"Q{j}: {response.question}\n\n")
                    f.write(f"A{j}: {response.response}\n\n")
                    f.write("---\n")

                # Add spacing between interviews
                if i < len(interviews):
                    f.write("\n\n")

            return f.name

    def create_analysis_file(
        self, formatted_data: Dict[str, Any], output_format: str = "json"
    ) -> str:
        """Create a temporary file for the analysis pipeline."""

        try:
            if output_format == "json":
                return self._create_json_file(formatted_data)
            elif output_format == "txt":
                return self._create_text_file(formatted_data)
            else:
                raise ValueError(f"Unsupported output format: {output_format}")

        except Exception as e:
            logger.error(f"Failed to create analysis file: {str(e)}")
            raise

    def _create_json_file(self, formatted_data: Dict[str, Any]) -> str:
        """Create a JSON file for analysis."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(formatted_data, f, indent=2, ensure_ascii=False)
            return f.name

    def _create_text_file(self, formatted_data: Dict[str, Any]) -> str:
        """Create a text file for analysis."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            # Write metadata
            f.write("=== SIMULATION METADATA ===\n")
            f.write(f"Simulation ID: {formatted_data['metadata']['simulation_id']}\n")
            f.write(f"Created: {formatted_data['metadata']['created_at']}\n")
            f.write(
                f"Business Idea: {formatted_data['metadata']['business_context']['business_idea']}\n"
            )
            f.write(
                f"Target Customer: {formatted_data['metadata']['business_context']['target_customer']}\n"
            )
            f.write(
                f"Problem: {formatted_data['metadata']['business_context']['problem']}\n\n"
            )

            # Write personas
            f.write("=== PERSONAS ===\n")
            for persona in formatted_data["personas"]:
                f.write(f"Name: {persona['name']} (Age: {persona['age']})\n")
                f.write(f"Background: {persona['background']}\n")
                f.write(f"Stakeholder Type: {persona['stakeholder_type']}\n")
                f.write(
                    f"Motivations: {', '.join(persona['profile']['motivations'])}\n"
                )
                f.write(
                    f"Pain Points: {', '.join(persona['profile']['pain_points'])}\n\n"
                )

            # Write interview data
            f.write("=== INTERVIEW DATA ===\n")
            f.write(formatted_data["analysis_ready_text"])

            return f.name

    def cleanup_temp_file(self, file_path: str) -> None:
        """Clean up temporary files."""
        try:
            if os.path.exists(file_path):
                os.unlink(file_path)
                logger.info(f"Cleaned up temporary file: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup temp file {file_path}: {str(e)}")
