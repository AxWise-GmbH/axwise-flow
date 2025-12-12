"""
File Processing Service for handling simulation text files and converting them to structured analysis results.
Integrates with the conversational analysis agent and database storage systems.
"""

import logging
import asyncio
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
import uuid

from pydantic import BaseModel
from pydantic_ai.models.google import GoogleModel

from backend.schemas import DetailedAnalysisResult
from backend.database import SessionLocal, engine
from .conversational_analysis_agent import ConversationalAnalysisAgent

logger = logging.getLogger(__name__)


class FileProcessingRequest(BaseModel):
    """Request model for file processing"""

    file_path: str
    simulation_id: Optional[str] = None
    user_id: str
    analysis_options: Dict[str, Any] = {}
    save_to_database: bool = True


class FileProcessingResult(BaseModel):
    """Result model for file processing"""

    success: bool
    analysis_id: Optional[str] = None
    analysis_result: Optional[DetailedAnalysisResult] = None
    processing_time_seconds: float
    file_size_bytes: int
    error_message: Optional[str] = None
    database_saved: bool = False


class SimulationFileProcessor:
    """
    Service for processing simulation text files through conversational analysis
    and storing results in the database using existing infrastructure.
    """

    def __init__(self, gemini_model: GoogleModel):
        self.gemini_model = gemini_model
        self.analysis_agent = ConversationalAnalysisAgent(gemini_model)

    async def process_simulation_file(
        self, request: FileProcessingRequest
    ) -> FileProcessingResult:
        """
        Process a simulation text file through conversational analysis workflow
        and optionally save results to database.
        """
        start_time = datetime.utcnow()

        try:
            logger.info(f"Starting file processing for {request.file_path}")

            # Validate file exists and read content
            if not os.path.exists(request.file_path):
                raise FileNotFoundError(f"File not found: {request.file_path}")

            # Read simulation text data
            with open(request.file_path, "r", encoding="utf-8") as file:
                simulation_text = file.read()

            file_size = len(simulation_text.encode("utf-8"))
            logger.info(f"Processing file of size: {file_size} bytes")

            # Validate file size (handle large files appropriately)
            if file_size > 1_000_000:  # 1MB limit
                logger.warning(
                    f"Large file detected ({file_size} bytes), using streaming analysis"
                )

            # Generate simulation ID if not provided
            simulation_id = request.simulation_id or str(uuid.uuid4())

            # Apply automatic interview cleaning if needed
            from backend.utils.interview_cleaner import clean_interview_content

            cleaned_text, cleaning_metadata = clean_interview_content(
                simulation_text, os.path.basename(request.file_path)
            )

            if cleaning_metadata:
                logger.info(
                    f"Applied automatic interview cleaning to {request.file_path}"
                )
                logger.info(
                    f"Processed {cleaning_metadata['interviews_processed']} interviews, "
                    f"extracted {cleaning_metadata['dialogue_lines_extracted']} dialogue lines"
                )
                simulation_text = cleaned_text

            # Process through conversational analysis agent
            analysis_result = await self.analysis_agent.process_simulation_data(
                simulation_text=simulation_text,
                simulation_id=simulation_id,
                file_name=os.path.basename(request.file_path),
            )

            # Calculate processing time
            processing_time = (datetime.utcnow() - start_time).total_seconds()

            # Save to database if requested
            database_saved = False
            if request.save_to_database and analysis_result.error is None:
                try:
                    await self._save_analysis_to_database(
                        analysis_result, request.user_id, simulation_id
                    )
                    database_saved = True
                    logger.info(
                        f"Analysis results saved to database for simulation {simulation_id}"
                    )
                except Exception as db_error:
                    logger.error(f"Failed to save to database: {str(db_error)}")
                    # Don't fail the entire process if database save fails

            return FileProcessingResult(
                success=True,
                analysis_id=analysis_result.id,
                analysis_result=analysis_result,
                processing_time_seconds=processing_time,
                file_size_bytes=file_size,
                database_saved=database_saved,
            )

        except Exception as e:
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            logger.error(f"File processing failed for {request.file_path}: {str(e)}")

            return FileProcessingResult(
                success=False,
                processing_time_seconds=processing_time,
                file_size_bytes=0,
                error_message=str(e),
            )

    async def process_simulation_text_direct(
        self,
        simulation_text: str,
        simulation_id: str,
        user_id: str,
        file_name: str = "direct_input.txt",
        save_to_database: bool = True,
    ) -> FileProcessingResult:
        """
        Process simulation text directly (without file) through conversational analysis.
        Useful for processing text data from API requests or memory.
        """
        start_time = datetime.utcnow()

        try:
            logger.info(f"Processing direct text input for simulation {simulation_id}")

            file_size = len(simulation_text.encode("utf-8"))
            logger.info(f"Processing text of size: {file_size} bytes")

            # Apply automatic interview cleaning if needed
            from backend.utils.interview_cleaner import clean_interview_content

            cleaned_text, cleaning_metadata = clean_interview_content(
                simulation_text, file_name
            )

            if cleaning_metadata:
                logger.info(f"Applied automatic interview cleaning to {file_name}")
                logger.info(
                    f"Processed {cleaning_metadata['interviews_processed']} interviews, "
                    f"extracted {cleaning_metadata['dialogue_lines_extracted']} dialogue lines"
                )
                simulation_text = cleaned_text

            # Process through conversational analysis agent
            analysis_result = await self.analysis_agent.process_simulation_data(
                simulation_text=simulation_text,
                simulation_id=simulation_id,
                file_name=file_name,
            )

            # Calculate processing time
            processing_time = (datetime.utcnow() - start_time).total_seconds()

            # Save to database if requested
            database_saved = False
            if save_to_database and analysis_result.error is None:
                try:
                    await self._save_analysis_to_database(
                        analysis_result, user_id, simulation_id
                    )
                    database_saved = True
                    logger.info(
                        f"Analysis results saved to database for simulation {simulation_id}"
                    )
                except Exception as db_error:
                    logger.error(f"Failed to save to database: {str(db_error)}")

            return FileProcessingResult(
                success=True,
                analysis_id=analysis_result.id,
                analysis_result=analysis_result,
                processing_time_seconds=processing_time,
                file_size_bytes=file_size,
                database_saved=database_saved,
            )

        except Exception as e:
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            logger.error(
                f"Direct text processing failed for simulation {simulation_id}: {str(e)}"
            )

            return FileProcessingResult(
                success=False,
                processing_time_seconds=processing_time,
                file_size_bytes=(
                    len(simulation_text.encode("utf-8")) if simulation_text else 0
                ),
                error_message=str(e),
            )

    async def _save_analysis_to_database(
        self, analysis_result: DetailedAnalysisResult, user_id: str, simulation_id: str
    ) -> None:
        """
        Save analysis results to database using existing infrastructure.
        Integrates with the current database models and storage system.
        """
        try:
            # Convert analysis result to database format
            analysis_data = {
                "id": analysis_result.id,
                "simulation_id": simulation_id,
                "user_id": user_id,
                "status": analysis_result.status,
                "created_at": analysis_result.createdAt,
                "file_name": analysis_result.fileName,
                "file_size": analysis_result.fileSize,
                "themes": [
                    theme.dict() if hasattr(theme, "dict") else theme
                    for theme in analysis_result.themes
                ],
                "enhanced_themes": (
                    [
                        theme.dict() if hasattr(theme, "dict") else theme
                        for theme in analysis_result.enhanced_themes
                    ]
                    if analysis_result.enhanced_themes
                    else []
                ),
                "patterns": [
                    pattern.dict() if hasattr(pattern, "dict") else pattern
                    for pattern in analysis_result.patterns
                ],
                "enhanced_patterns": (
                    [
                        pattern.dict() if hasattr(pattern, "dict") else pattern
                        for pattern in analysis_result.enhanced_patterns
                    ]
                    if analysis_result.enhanced_patterns
                    else []
                ),
                "sentiment_overview": (
                    analysis_result.sentimentOverview.dict()
                    if hasattr(analysis_result.sentimentOverview, "dict")
                    else analysis_result.sentimentOverview
                ),
                "sentiment": [
                    sentiment.dict() if hasattr(sentiment, "dict") else sentiment
                    for sentiment in analysis_result.sentiment
                ],
                "personas": [
                    persona.dict() if hasattr(persona, "dict") else persona
                    for persona in analysis_result.personas
                ],
                "enhanced_personas": (
                    [
                        persona.dict() if hasattr(persona, "dict") else persona
                        for persona in analysis_result.enhanced_personas
                    ]
                    if analysis_result.enhanced_personas
                    else []
                ),
                "insights": [
                    insight.dict() if hasattr(insight, "dict") else insight
                    for insight in analysis_result.insights
                ],
                "enhanced_insights": (
                    [
                        insight.dict() if hasattr(insight, "dict") else insight
                        for insight in analysis_result.enhanced_insights
                    ]
                    if analysis_result.enhanced_insights
                    else []
                ),
                "stakeholder_intelligence": (
                    analysis_result.stakeholder_intelligence.dict()
                    if analysis_result.stakeholder_intelligence
                    and hasattr(analysis_result.stakeholder_intelligence, "dict")
                    else analysis_result.stakeholder_intelligence
                ),
                "error": analysis_result.error,
                "processing_metadata": {
                    "analysis_approach": "conversational_routine",
                    "processing_timestamp": datetime.utcnow().isoformat(),
                    "agent_version": "1.0.0",
                },
            }

            # Import the AnalysisResult model
            from backend.models import AnalysisResult
            import json

            # Create database session
            db = SessionLocal()
            try:
                # Create new analysis result record
                db_analysis = AnalysisResult(
                    data_id=None,  # We don't have a data_id for direct simulation analysis
                    analysis_date=datetime.utcnow(),
                    completed_at=datetime.utcnow(),
                    results=json.dumps(analysis_data),
                    llm_provider="gemini",
                    llm_model="gemini-2.5-pro",
                    status=analysis_result.status,
                    error_message=analysis_result.error,
                )

                # Add and commit to database
                db.add(db_analysis)
                db.commit()
                db.refresh(db_analysis)

                logger.info(
                    f"Successfully saved analysis {analysis_result.id} to database with ID {db_analysis.result_id}"
                )

            finally:
                db.close()

        except Exception as e:
            logger.error(
                f"Database save failed for analysis {analysis_result.id}: {str(e)}"
            )
            raise

    async def get_analysis_from_database(
        self, analysis_id: str, user_id: str
    ) -> Optional[DetailedAnalysisResult]:
        """
        Retrieve analysis results from database.
        """
        try:
            from backend.models import AnalysisResult
            import json

            # Create database session
            db = SessionLocal()
            try:
                # Query for analysis result by result_id
                # Note: We're using result_id since that's the primary key in AnalysisResult
                db_analysis = (
                    db.query(AnalysisResult)
                    .filter(AnalysisResult.result_id == int(analysis_id))
                    .first()
                )

                if not db_analysis:
                    return None

                # Parse the JSON results
                analysis_data = json.loads(db_analysis.results)

                # Create DetailedAnalysisResult with the stored data
                return DetailedAnalysisResult(
                    id=analysis_id,
                    status=db_analysis.status,
                    createdAt=(
                        db_analysis.analysis_date.isoformat()
                        if db_analysis.analysis_date
                        else datetime.utcnow().isoformat()
                    ),
                    fileName="analysis_result.json",
                    fileSize=len(db_analysis.results),
                    themes=analysis_data.get("themes", []),
                    enhanced_themes=analysis_data.get("enhanced_themes", []),
                    patterns=analysis_data.get("patterns", []),
                    enhanced_patterns=analysis_data.get("enhanced_patterns", []),
                    sentimentOverview=analysis_data.get("sentiment_overview", {}),
                    sentiment=analysis_data.get("sentiment", []),
                    personas=analysis_data.get("personas", []),
                    enhanced_personas=analysis_data.get("enhanced_personas", []),
                    insights=analysis_data.get("insights", []),
                    enhanced_insights=analysis_data.get("enhanced_insights", []),
                    stakeholder_intelligence=analysis_data.get(
                        "stakeholder_intelligence"
                    ),
                    error=db_analysis.error_message,
                )

            finally:
                db.close()

        except Exception as e:
            logger.error(
                f"Failed to retrieve analysis {analysis_id} from database: {str(e)}"
            )
            return None

    async def list_user_analyses(
        self, user_id: str, limit: int = 50, offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List analysis results for a user with pagination.
        Note: Since we don't have user_id in AnalysisResult table, this returns all analyses.
        In a production system, you'd want to add user_id to the AnalysisResult model.
        """
        try:
            from backend.models import AnalysisResult
            import json

            # Create database session
            db = SessionLocal()
            try:
                # Query analyses with pagination
                # Note: We can't filter by user_id since it's not in the AnalysisResult table
                db_analyses = (
                    db.query(AnalysisResult)
                    .order_by(AnalysisResult.analysis_date.desc())
                    .offset(offset)
                    .limit(limit)
                    .all()
                )

                analyses = []
                for db_analysis in db_analyses:
                    try:
                        # Parse JSON results to get additional info
                        analysis_data = (
                            json.loads(db_analysis.results)
                            if db_analysis.results
                            else {}
                        )

                        analyses.append(
                            {
                                "id": str(db_analysis.result_id),
                                "simulation_id": f"sim_{db_analysis.result_id}",
                                "status": db_analysis.status,
                                "created_at": (
                                    db_analysis.analysis_date.isoformat()
                                    if db_analysis.analysis_date
                                    else None
                                ),
                                "file_name": "analysis_result.json",
                                "file_size": (
                                    len(db_analysis.results)
                                    if db_analysis.results
                                    else 0
                                ),
                                "themes_count": len(analysis_data.get("themes", [])),
                                "stakeholders_count": (
                                    len(
                                        analysis_data.get(
                                            "stakeholder_intelligence", {}
                                        ).get("detected_stakeholders", [])
                                    )
                                    if analysis_data.get("stakeholder_intelligence")
                                    else 0
                                ),
                            }
                        )
                    except json.JSONDecodeError:
                        # Skip analyses with invalid JSON
                        continue

                return analyses

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Failed to list analyses for user {user_id}: {str(e)}")
            return []
