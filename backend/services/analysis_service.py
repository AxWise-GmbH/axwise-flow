from fastapi import HTTPException
from sqlalchemy.orm import Session
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pydantic import ValidationError

from backend.models import User, InterviewData, AnalysisResult
from backend.services.llm import LLMServiceFactory
from backend.services.nlp import get_nlp_processor
from backend.core.processing_pipeline import process_data
from infrastructure.config.settings import settings
from backend.schemas import DetailedAnalysisResult

# Configure logging
logger = logging.getLogger(__name__)


class AnalysisService:
    """
    Service class for handling data analysis operations.
    Encapsulates business logic related to interview data analysis.
    """

    def __init__(self, db: Session, user: User):
        """
        Initialize the AnalysisService with database session and user.

        Args:
            db (Session): SQLAlchemy database session
            user (User): Current authenticated user
        """
        self.db = db
        self.user = user

    async def start_analysis(
        self,
        data_id: int,
        llm_provider: str,
        llm_model: Optional[str] = None,
        is_free_text: bool = False,
    ) -> dict:
        """
        Start analysis of interview data.

        Args:
            data_id: ID of the interview data to analyze
            llm_provider: LLM provider to use ('openai' or 'gemini')
            llm_model: Optional specific model to use
            is_free_text: Whether the data is in free-text format
            use_enhanced_theme_analysis: Whether to use enhanced theme analysis
            use_reliability_check: Whether to perform reliability checks

        Returns:
            dict: Result with result_id and success status

        Raises:
            HTTPException: For invalid configurations or missing data
        """
        try:
            # Validate LLM provider and get default model if needed
            if llm_model is None:
                llm_model = (
                    settings.llm_providers["openai"]["model"]
                    if llm_provider == "openai"
                    else settings.llm_providers["gemini"]["model"]
                )

            logger.info(
                f"Analysis parameters - data_id: {data_id}, provider: {llm_provider}, "
                f"model: {llm_model}, is_free_text: {is_free_text}"
            )

            # Always use enhanced thematic analysis
            logger.info("Using enhanced thematic analysis")

            # Initialize services
            llm_service = LLMServiceFactory.create(llm_provider)
            nlp_processor = get_nlp_processor()()

            # Get interview data with user authorization check
            interview_data = (
                self.db.query(InterviewData)
                .filter(
                    InterviewData.id == data_id,
                    InterviewData.user_id == self.user.user_id,
                )
                .first()
            )

            if not interview_data:
                raise HTTPException(status_code=404, detail="Interview data not found")

            # Parse data
            data = self._parse_interview_data(interview_data, is_free_text)

            # Create initial analysis record
            analysis_result = self._create_analysis_record(
                data_id, llm_provider, llm_model
            )

            # Start background processing task
            asyncio.create_task(
                self._process_data_task(
                    analysis_result.result_id,
                    nlp_processor,
                    llm_service,
                    data,
                    {
                        "use_enhanced_theme_analysis": True,  # Always run enhanced analysis
                        "use_reliability_check": True,  # Always use reliability check
                        "llm_provider": llm_provider,
                        "llm_model": llm_model,
                    },
                )
            )

            # Return response
            return {
                "success": True,
                "message": "Analysis started",
                "result_id": analysis_result.result_id,
            }

        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            logger.error(f"Error initiating analysis: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

    def _parse_interview_data(
        self, interview_data: InterviewData, is_free_text: bool
    ) -> Any:
        """
        Parse interview data from database record.

        Args:
            interview_data: Database record containing interview data
            is_free_text: Whether to parse as free text

        Returns:
            Parsed data (dict, list, or string)

        Raises:
            HTTPException: For parsing errors
        """
        try:
            data = json.loads(interview_data.original_data)

            # Handle free text format
            if is_free_text:
                logger.info(
                    f"Processing free-text format for data_id: {interview_data.id}"
                )

                # Extract free text from various possible data structures
                if isinstance(data, dict):
                    # Extract content or free_text field if present
                    if "content" in data:
                        data = data["content"]
                    if "free_text" in data:
                        data = data["free_text"]
                    elif (
                        "metadata" in data
                        and isinstance(data["metadata"], dict)
                        and "free_text" in data["metadata"]
                    ):
                        data = data["metadata"]["free_text"]
                elif (
                    isinstance(data, list)
                    and len(data) > 0
                    and isinstance(data[0], dict)
                ):
                    # Extract from first item if it's a list
                    if "content" in data[0]:
                        data = data[0]["content"]
                    elif "free_text" in data[0]:
                        data = data[0]["free_text"]

                # Ensure data is a string for free text processing
                if not isinstance(data, str):
                    try:
                        data = json.dumps(data)
                    except:
                        logger.warning(
                            "Could not convert data to string, using empty string"
                        )
                        data = ""

                # Wrap in a dict with free_text field
                data = {"free_text": data}

                # Log the extracted free text
                logger.info(
                    f"Extracted free text (first 100 chars): {data['free_text'][:100]}..."
                )
            elif not isinstance(data, list):
                data = [data]

            return data

        except Exception as e:
            logger.error(f"Error parsing interview data: {str(e)}")
            raise HTTPException(
                status_code=500, detail="Failed to parse interview data"
            )

    def _create_analysis_record(
        self, data_id: int, llm_provider: str, llm_model: str
    ) -> AnalysisResult:
        """
        Create an analysis result record in the database.

        Args:
            data_id: ID of the interview data being analyzed
            llm_provider: LLM provider being used
            llm_model: LLM model being used

        Returns:
            Created AnalysisResult record
        """
        analysis_result = AnalysisResult(
            data_id=data_id,
            status="processing",
            llm_provider=llm_provider,
            llm_model=llm_model,
            results=json.dumps(
                {
                    "status": "processing",
                    "message": "Analysis has been initiated",
                    "progress": 0,
                }
            ),
        )
        self.db.add(analysis_result)
        self.db.commit()
        self.db.refresh(analysis_result)
        logger.info(
            f"Created analysis result record. Result ID: {analysis_result.result_id}"
        )

        return analysis_result

    async def _process_data_task(
        self,
        result_id: int,
        nlp_processor: Any,
        llm_service: Any,
        data: Any,
        config: Dict[str, Any],
    ):
        """
        Background task to process interview data.

        Args:
            result_id: ID of the analysis result record
            nlp_processor: Initialized NLP processor
            llm_service: Initialized LLM service
            data: Parsed interview data
            config: Analysis configuration parameters
        """
        from backend.database import get_db

        async_db = None  # Initialize async_db to None
        logger.info(
            f"[_process_data_task ENTRY] Starting background task for result_id: {result_id}"
        )

        try:
            logger.info(f"Starting data processing task for result_id: {result_id}")

            # Create a new session for the background task to avoid session binding issues
            async_db = next(get_db())

            # Get a fresh reference to the analysis result
            task_result = async_db.query(AnalysisResult).get(result_id)
            if not task_result:
                logger.error(
                    f"AnalysisResult record not found for result_id: {result_id}. Aborting task."
                )
                return  # Exit if record not found

            # Update status to in-progress with 5% completion
            task_result.results = json.dumps(
                {
                    "status": "processing",
                    "message": "Analysis in progress",
                    "progress": 5,
                }
            )
            async_db.commit()
            logger.info(f"Set status to 'processing' for result_id: {result_id}")

            # Process data
            result = await process_data(
                nlp_processor=nlp_processor,
                llm_service=llm_service,
                data=data,
                config=config,
            )

            # Update database record with results (but not status yet)
            logger.info(
                f"Analysis pipeline finished for result_id: {result_id}. Saving results..."
            )

            # Validate result against DetailedAnalysisResult schema
            try:
                # Create a minimal result structure for validation
                validation_data = {
                    "id": str(result_id),
                    "status": "completed",
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "fileName": "",  # Will be filled from the database
                    "themes": result.get("themes", []),
                    "patterns": result.get("patterns", []),
                    "sentimentOverview": result.get(
                        "sentimentOverview",
                        {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                    ),
                }

                # Validate against schema
                DetailedAnalysisResult(**validation_data)
                logger.info(f"Result validation successful for result_id: {result_id}")
            except ValidationError as ve:
                logger.warning(
                    f"Result validation warning for result_id: {result_id}: {str(ve)}"
                )
                # Continue with saving even if validation has warnings

            task_result.results = json.dumps(result)
            task_result.completed_at = datetime.now(timezone.utc)

            # Commit the results first
            async_db.commit()
            logger.info(f"Successfully committed results for result_id: {result_id}")

            # Now update the status to completed and commit again
            task_result.status = "completed"
            async_db.commit()
            logger.info(
                f"Successfully set status to 'completed' for result_id: {task_result.result_id}"
            )

        except Exception as e:
            logger.error(
                f"Error during analysis task for result_id {result_id}: {str(e)}",
                exc_info=True,
            )  # Log traceback
            try:
                # Ensure async_db is available
                if async_db is None:
                    async_db = next(get_db())

                # Ensure task_result is fetched if not already available
                task_result = async_db.query(AnalysisResult).get(result_id)

                if task_result:
                    # Update database record with error
                    task_result.results = json.dumps(
                        {
                            "status": "error",
                            "message": f"Analysis failed: {str(e)}",
                            "error_details": str(e),
                        }
                    )
                    task_result.status = "failed"
                    task_result.completed_at = datetime.now(timezone.utc)
                    async_db.commit()
                    logger.info(f"Set status to 'failed' for result_id: {result_id}")
                else:
                    logger.error(
                        f"Could not update status to failed, AnalysisResult record not found for result_id: {result_id}"
                    )

            except Exception as inner_e:
                logger.error(
                    f"Failed to update error status for result_id {result_id}: {str(inner_e)}"
                )
        finally:
            # Ensure the session is closed
            if async_db:
                async_db.close()
                logger.info(f"Closed database session for result_id: {result_id}")
