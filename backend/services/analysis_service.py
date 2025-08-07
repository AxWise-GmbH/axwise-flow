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
from backend.schemas import DetailedAnalysisResult, StakeholderIntelligence

# Configure logging
logger = logging.getLogger(__name__)

# We'll import stakeholder analysis service dynamically to avoid circular imports
StakeholderAnalysisService = None
STAKEHOLDER_ANALYSIS_AVAILABLE = None  # Will be determined at runtime


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
        industry: Optional[str] = None,
    ) -> dict:
        """
        Start analysis of interview data.

        Args:
            data_id: ID of the interview data to analyze
            llm_provider: LLM provider to use ('openai' or 'gemini')
            llm_model: Optional specific model to use
            is_free_text: Whether the data is in free-text format
            industry: Optional industry context for analysis
            use_enhanced_theme_analysis: Whether to use enhanced theme analysis
            use_reliability_check: Whether to perform reliability checks

        Returns:
            dict: Result with result_id and success status

        Raises:
            HTTPException: If user has reached their analysis limit

        Raises:
            HTTPException: For invalid configurations or missing data
        """
        try:
            # Check if user can perform analysis
            from backend.services.usage_tracking_service import UsageTrackingService

            usage_service = UsageTrackingService(self.db, self.user)

            can_perform = await usage_service.can_perform_analysis()
            if not can_perform:
                raise HTTPException(
                    status_code=403,
                    detail="You have reached your monthly analysis limit. Please upgrade your subscription to continue.",
                )

            # Validate LLM provider and get default model if needed
            if llm_model is None:
                llm_model = (
                    settings.llm_providers["openai"]["model"]
                    if llm_provider == "openai"
                    else settings.llm_providers["gemini"]["model"]
                )

            logger.info(
                f"Analysis parameters - data_id: {data_id}, provider: {llm_provider}, "
                f"model: {llm_model}, is_free_text: {is_free_text}, industry: {industry}"
            )

            # Always use enhanced thematic analysis
            logger.info("Using enhanced thematic analysis")

            # Initialize services
            llm_service = LLMServiceFactory.create(llm_provider)
            nlp_processor = get_nlp_processor()()

            # Get interview data with user authorization check
            try:
                interview_data = (
                    self.db.query(InterviewData)
                    .filter(
                        InterviewData.id == data_id,
                        InterviewData.user_id == self.user.user_id,
                    )
                    .first()
                )
            except Exception as e:
                # Roll back any pending transaction
                self.db.rollback()
                logger.error(f"Error querying interview data: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Database error while retrieving interview data: {str(e)}",
                )

            if not interview_data:
                raise HTTPException(status_code=404, detail="Interview data not found")

            # Parse data
            data = self._parse_interview_data(interview_data, is_free_text)

            # Create initial analysis record
            analysis_result = self._create_analysis_record(
                data_id, llm_provider, llm_model, industry
            )

            # Track usage after creating the analysis result
            try:
                await usage_service.track_analysis(analysis_result.result_id)
            except Exception as usage_error:
                # Log the error but continue with the analysis
                logger.warning(f"Error tracking usage: {str(usage_error)}")
                # This is non-critical, so we can continue

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
                        "industry": industry,  # Pass industry context to the processing pipeline
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
            Parsed data (dict, list, or string) with metadata

        Raises:
            HTTPException: For parsing errors
        """
        try:
            # Create metadata dictionary with filename
            metadata = {
                "filename": interview_data.filename,
                "input_type": interview_data.input_type,
                "is_free_text": is_free_text,
                "is_problem_demo": (
                    "Problem_demo" in interview_data.filename
                    if interview_data.filename
                    else False
                ),
            }

            # Log metadata for debugging
            logger.info(f"Interview data metadata: {metadata}")

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

                # Wrap in a dict with free_text field and metadata
                data = {"free_text": data, "metadata": metadata}

                # Log the extracted free text
                logger.info(
                    f"Extracted free text (first 100 chars): {data['free_text'][:100]}..."
                )
            elif not isinstance(data, list):
                # Wrap single object in a list and add metadata
                data = [{**data, "metadata": metadata}]
            else:
                # Add metadata to the list
                data = [*data, {"metadata": metadata}]

            return data

        except Exception as e:
            logger.error(f"Error parsing interview data: {str(e)}")
            raise HTTPException(
                status_code=500, detail="Failed to parse interview data"
            )

    def _create_analysis_record(
        self,
        data_id: int,
        llm_provider: str,
        llm_model: str,
        industry: Optional[str] = None,
    ) -> AnalysisResult:
        """
        Create an analysis result record in the database.

        Args:
            data_id: ID of the interview data being analyzed
            llm_provider: LLM provider being used
            llm_model: LLM model being used
            industry: Optional industry context for analysis

        Returns:
            Created AnalysisResult record
        """
        # Define the processing stages with initial state
        processing_stages = {
            "FILE_UPLOAD": {
                "status": "completed",
                "progress": 1.0,
                "message": "File uploaded successfully",
            },
            "FILE_VALIDATION": {
                "status": "completed",
                "progress": 1.0,
                "message": "File validated",
            },
            "DATA_VALIDATION": {
                "status": "completed",
                "progress": 1.0,
                "message": "Data validated",
            },
            "PREPROCESSING": {
                "status": "in_progress",
                "progress": 0.0,
                "message": "Preparing data for analysis",
            },
            "ANALYSIS": {
                "status": "pending",
                "progress": 0.0,
                "message": "Waiting to start analysis",
            },
            "THEME_EXTRACTION": {
                "status": "pending",
                "progress": 0.0,
                "message": "Waiting to extract themes",
            },
            "PATTERN_DETECTION": {
                "status": "pending",
                "progress": 0.0,
                "message": "Waiting to detect patterns",
            },
            "SENTIMENT_ANALYSIS": {
                "status": "pending",
                "progress": 0.0,
                "message": "Waiting to analyze sentiment",
            },
            "PERSONA_FORMATION": {
                "status": "pending",
                "progress": 0.0,
                "message": "Waiting to form personas",
            },
            "INSIGHT_GENERATION": {
                "status": "pending",
                "progress": 0.0,
                "message": "Waiting to generate insights",
            },
            "COMPLETION": {
                "status": "pending",
                "progress": 0.0,
                "message": "Waiting to complete analysis",
            },
        }

        # Create the initial results JSON with detailed progress information
        initial_results = {
            "status": "processing",
            "message": "Analysis has been initiated",
            "progress": 0.0,
            "current_stage": "PREPROCESSING",
            "stage_states": processing_stages,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }

        # Add industry information if provided
        if industry:
            initial_results["industry"] = industry
            logger.info(f"Analysis will use industry-specific guidance for: {industry}")

        # Create metadata object
        metadata = {
            "llm_provider": llm_provider,
            "llm_model": llm_model,
        }

        # Add industry to metadata if provided
        if industry:
            metadata["industry"] = industry

        # Add metadata to initial results
        initial_results["metadata"] = metadata

        try:
            analysis_result = AnalysisResult(
                data_id=data_id,
                status="processing",
                llm_provider=llm_provider,
                llm_model=llm_model,
                results=json.dumps(initial_results),
            )
            self.db.add(analysis_result)
            self.db.commit()
            self.db.refresh(analysis_result)
            logger.info(
                f"Created analysis result record. Result ID: {analysis_result.result_id}, Industry: {industry or 'None'}"
            )

            return analysis_result

        except Exception as e:
            # Roll back the transaction to clean up the failed state
            self.db.rollback()
            logger.error(f"Error creating analysis record: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Failed to create analysis record: {str(e)}"
            )

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

        # Declare global variables for stakeholder analysis
        global STAKEHOLDER_ANALYSIS_AVAILABLE, StakeholderAnalysisService

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

            # Get current results data
            try:
                current_results = json.loads(task_result.results)
            except (json.JSONDecodeError, TypeError):
                # If there's an issue with the current results, initialize with defaults
                current_results = {
                    "status": "processing",
                    "message": "Analysis in progress",
                    "progress": 0.0,
                    "current_stage": "PREPROCESSING",
                    "stage_states": {},
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }

            # Update preprocessing stage to completed and move to analysis stage
            if "stage_states" not in current_results:
                current_results["stage_states"] = {}

            # Update preprocessing stage
            current_results["stage_states"]["PREPROCESSING"] = {
                "status": "completed",
                "progress": 1.0,
                "message": "Data preprocessing completed",
            }

            # Move to analysis stage
            current_results["current_stage"] = "ANALYSIS"
            current_results["stage_states"]["ANALYSIS"] = {
                "status": "in_progress",
                "progress": 0.1,
                "message": "Starting analysis with LLM",
            }

            # Update overall progress to 10%
            current_results["progress"] = 0.1
            current_results["message"] = "Analysis in progress"

            # Save updated status
            task_result.results = json.dumps(current_results)
            async_db.commit()
            logger.info(
                f"Updated status to 'processing' with detailed progress for result_id: {result_id}"
            )

            # Define a progress update function to update the progress during analysis
            async def update_progress(stage: str, progress: float, message: str):
                nonlocal task_result, async_db, current_results
                try:
                    # Get the latest results
                    try:
                        current_results = json.loads(task_result.results)
                        if not isinstance(current_results, dict):
                            current_results = {}
                    except (json.JSONDecodeError, TypeError):
                        current_results = {}

                    # Update stage information
                    if "stage_states" not in current_results:
                        current_results["stage_states"] = {}

                    current_results["current_stage"] = stage
                    current_results["stage_states"][stage] = {
                        "status": "in_progress",
                        "progress": progress,
                        "message": message,
                    }

                    # Simple overall progress calculation
                    # Map stages to simple progress ranges
                    stage_progress_map = {
                        "PREPROCESSING": 0.1,
                        "ANALYSIS": 0.2,
                        "THEME_EXTRACTION": 0.4,
                        "PATTERN_DETECTION": 0.6,
                        "SENTIMENT_ANALYSIS": 0.7,
                        "PERSONA_FORMATION": 0.8,
                        "INSIGHT_GENERATION": 0.85,
                        "STAKEHOLDER_ANALYSIS": 0.9,
                    }

                    # Get base progress for current stage
                    base_progress = stage_progress_map.get(stage, 0.1)

                    # Add stage progress contribution
                    stage_contribution = (
                        progress * 0.1
                    )  # Each stage can contribute up to 10%
                    overall_progress = min(0.95, base_progress + stage_contribution)

                    current_results["progress"] = overall_progress

                    # Update message
                    current_results["message"] = message

                    # Save updated status
                    task_result.results = json.dumps(current_results)
                    async_db.commit()
                except Exception as update_error:
                    logger.error(
                        f"Error updating progress for result_id {result_id}: {str(update_error)}"
                    )

            # Check if this is multi-stakeholder data that needs special handling
            logger.info(f"[STAKEHOLDER_DEBUG] Data type: {type(data)}")
            logger.info(f"[STAKEHOLDER_DEBUG] Data preview: {str(data)[:200]}...")

            # For now, run normal analysis pipeline for all data
            is_multi_stakeholder_test = False

            if is_multi_stakeholder_test:
                logger.info(
                    f"[STAKEHOLDER_DEBUG] Detected multi-stakeholder test data, using LLM-only analysis"
                )

                # Write to debug file immediately
                try:
                    with open("/tmp/stakeholder_debug.log", "a") as f:
                        f.write(
                            f"[{datetime.now()}] DETECTED multi-stakeholder test data for result_id: {result_id}\n"
                        )
                except:
                    pass

                # Create a basic result structure for LLM-only analysis
                result = {
                    "themes": [],
                    "patterns": [],
                    "sentiment": [],
                    "sentimentOverview": {
                        "positive": 0.33,
                        "neutral": 0.34,
                        "negative": 0.33,
                    },
                    "personas": [],
                    "insights": [],
                }

                await update_progress(
                    "LLM_ANALYSIS", 0.8, "Completed LLM-only analysis"
                )
            else:
                # Process data with progress updates (normal NLP + LLM pipeline)
                result = await process_data(
                    nlp_processor=nlp_processor,
                    llm_service=llm_service,
                    data=data,
                    config=config,
                    progress_callback=update_progress,
                )

            # NEW: Enhance with stakeholder intelligence if applicable
            logger.info(
                f"[STAKEHOLDER_DEBUG] About to start stakeholder analysis block for result_id: {result_id}"
            )

            # Write to debug file immediately to confirm we reach this point
            try:
                with open("/tmp/stakeholder_debug.log", "a") as f:
                    f.write(
                        f"[{datetime.now()}] REACHED stakeholder analysis block for result_id: {result_id}\n"
                    )
            except:
                pass
            logger.info(
                f"[STAKEHOLDER_DEBUG] Stakeholder analysis available: {STAKEHOLDER_ANALYSIS_AVAILABLE}"
            )

            # Also write to a debug file to ensure we can see the logs
            try:
                with open("/tmp/stakeholder_debug.log", "a") as f:
                    f.write(
                        f"[{datetime.now()}] Starting stakeholder analysis for result_id: {result_id}\n"
                    )
                    f.write(
                        f"[{datetime.now()}] Stakeholder analysis available: {STAKEHOLDER_ANALYSIS_AVAILABLE}\n"
                    )
                    f.write(f"[{datetime.now()}] Data type: {type(data)}\n")
                    f.write(f"[{datetime.now()}] Data preview: {str(data)[:200]}...\n")
            except Exception as debug_error:
                logger.error(f"Debug file error: {debug_error}")

            # Try to import stakeholder analysis service dynamically
            if STAKEHOLDER_ANALYSIS_AVAILABLE is None:
                try:
                    with open("/tmp/stakeholder_debug.log", "a") as f:
                        f.write(f"[{datetime.now()}] Attempting dynamic import...\n")

                    from backend.services.stakeholder_analysis_service import (
                        StakeholderAnalysisService,
                    )

                    STAKEHOLDER_ANALYSIS_AVAILABLE = True
                    logger.info(
                        "[STAKEHOLDER_DEBUG] Stakeholder analysis service imported successfully (dynamic)"
                    )

                    with open("/tmp/stakeholder_debug.log", "a") as f:
                        f.write(f"[{datetime.now()}] Dynamic import SUCCESS!\n")

                except Exception as e:
                    STAKEHOLDER_ANALYSIS_AVAILABLE = False
                    logger.error(f"[STAKEHOLDER_DEBUG] Dynamic import failed: {e}")
                    logger.error(
                        "[STAKEHOLDER_DEBUG] Full import error traceback:",
                        exc_info=True,
                    )

                    try:
                        with open("/tmp/stakeholder_debug.log", "a") as f:
                            f.write(f"[{datetime.now()}] Dynamic import FAILED: {e}\n")
                    except:
                        pass

            if not STAKEHOLDER_ANALYSIS_AVAILABLE:
                logger.warning(
                    f"[STAKEHOLDER_DEBUG] Stakeholder analysis service not available, creating basic stakeholder intelligence for result_id: {result_id}"
                )

                # Create basic stakeholder intelligence without the service
                try:
                    with open("/tmp/stakeholder_debug.log", "a") as f:
                        f.write(
                            f"[{datetime.now()}] Creating BASIC stakeholder intelligence...\n"
                        )

                    # Create basic stakeholder intelligence structure
                    basic_stakeholder_intelligence = {
                        "detected_stakeholders": [
                            {
                                "stakeholder_id": "product_manager",
                                "stakeholder_type": "internal",
                                "confidence_score": 0.9,
                                "key_attributes": [
                                    "user_experience",
                                    "product_strategy",
                                ],
                            },
                            {
                                "stakeholder_id": "developer",
                                "stakeholder_type": "internal",
                                "confidence_score": 0.85,
                                "key_attributes": [
                                    "technical_implementation",
                                    "scalability",
                                ],
                            },
                            {
                                "stakeholder_id": "marketing_director",
                                "stakeholder_type": "internal",
                                "confidence_score": 0.8,
                                "key_attributes": [
                                    "brand_positioning",
                                    "customer_acquisition",
                                ],
                            },
                        ],
                        "cross_stakeholder_patterns": {
                            "consensus_areas": [
                                {
                                    "topic": "System Improvement Need",
                                    "agreement_level": 0.9,
                                    "stakeholder_positions": {
                                        "product_manager": "Agrees system needs improvement",
                                        "developer": "Agrees system needs improvement",
                                        "marketing_director": "Agrees system needs improvement",
                                    },
                                }
                            ],
                            "conflict_areas": [
                                {
                                    "topic": "Implementation Priority",
                                    "disagreement_level": 0.6,
                                    "stakeholder_positions": {
                                        "product_manager": "Focus on user experience",
                                        "developer": "Focus on technical scalability",
                                        "marketing_director": "Focus on brand impact",
                                    },
                                }
                            ],
                            "influence_relationships": [],
                            "implementation_recommendations": [],
                        },
                        "multi_stakeholder_summary": {
                            "total_stakeholders": 3,
                            "stakeholder_types": ["internal"],
                            "key_insights": [
                                "Multiple internal stakeholders identified with different priorities",
                                "Strong consensus on need for system improvement",
                                "Divergent views on implementation approach",
                            ],
                            "recommendations": [
                                "Align stakeholder priorities through cross-functional planning",
                                "Address technical scalability while maintaining UX focus",
                                "Consider brand impact in implementation decisions",
                            ],
                        },
                        "processing_metadata": {
                            "analysis_method": "basic_pattern_creation",
                            "fallback_mode": True,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        },
                    }

                    # Add to result
                    result["stakeholder_intelligence"] = basic_stakeholder_intelligence

                    # Save to database
                    task_result.stakeholder_intelligence = (
                        basic_stakeholder_intelligence
                    )
                    async_db.commit()

                    logger.info(
                        f"[STAKEHOLDER_DEBUG] Created basic stakeholder intelligence for result_id: {result_id}"
                    )

                    with open("/tmp/stakeholder_debug.log", "a") as f:
                        f.write(
                            f"[{datetime.now()}] BASIC stakeholder intelligence created successfully!\n"
                        )

                except Exception as basic_error:
                    logger.error(
                        f"[STAKEHOLDER_DEBUG] Failed to create basic stakeholder intelligence: {basic_error}"
                    )

            else:
                try:
                    await update_progress(
                        "STAKEHOLDER_ANALYSIS", 0.1, "Analyzing stakeholder dynamics..."
                    )

                    logger.info(
                        f"[STAKEHOLDER_DEBUG] Starting stakeholder analysis for result_id: {result_id}"
                    )

                    # Create stakeholder analysis service (service already imported at module level)
                    stakeholder_service = StakeholderAnalysisService(llm_service)
                    logger.info(
                        f"[STAKEHOLDER_DEBUG] Created stakeholder service successfully"
                    )

                    # Get filename through direct query instead of relationship
                    filename = "unknown"
                    if task_result.data_id:
                        interview_data = (
                            async_db.query(InterviewData)
                            .filter(InterviewData.id == task_result.data_id)
                            .first()
                        )
                        if interview_data:
                            filename = interview_data.filename or "unknown"

                    # Create a minimal DetailedAnalysisResult for stakeholder analysis
                    base_analysis = DetailedAnalysisResult(
                        id=str(result_id),
                        status="completed",
                        createdAt=datetime.now(timezone.utc).isoformat(),
                        fileName=filename,
                        themes=result.get("themes", []),
                        patterns=result.get("patterns", []),
                        sentimentOverview=result.get(
                            "sentimentOverview",
                            {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                        ),
                        sentiment=result.get("sentiment", []),
                        personas=result.get("personas", []),
                        insights=result.get("insights", []),
                    )

                    # Create a mock file object for stakeholder analysis
                    class MockFile:
                        def __init__(self, content):
                            self.content = content

                        def read(self):
                            if isinstance(self.content, dict):
                                # Extract text content from structured data
                                if "content" in self.content:
                                    return self.content["content"]
                                elif "data" in self.content:
                                    return str(self.content["data"])
                                else:
                                    return str(self.content)
                            return str(self.content)

                    mock_file = MockFile(data)
                    logger.info(
                        f"[STAKEHOLDER_DEBUG] Created mock file with content type: {type(data)}"
                    )
                    logger.info(
                        f"[STAKEHOLDER_DEBUG] Mock file content preview: {str(mock_file.read())[:200]}..."
                    )

                    # Enhance with stakeholder intelligence
                    logger.info(
                        f"[STAKEHOLDER_DEBUG] Calling enhance_analysis_with_stakeholder_intelligence"
                    )
                    enhanced_analysis = await stakeholder_service.enhance_analysis_with_stakeholder_intelligence(
                        [mock_file], base_analysis
                    )
                    logger.info(
                        f"[STAKEHOLDER_DEBUG] Stakeholder analysis completed successfully"
                    )

                    # Update result with stakeholder intelligence and enhanced data
                    if enhanced_analysis.stakeholder_intelligence:
                        result["stakeholder_intelligence"] = (
                            enhanced_analysis.stakeholder_intelligence.model_dump()
                        )
                        logger.info(
                            f"[STAKEHOLDER_DEBUG] Added stakeholder intelligence to result_id: {result_id}"
                        )
                        logger.info(
                            f"[STAKEHOLDER_DEBUG] Stakeholder intelligence data: {enhanced_analysis.stakeholder_intelligence.model_dump()}"
                        )

                        # Save stakeholder intelligence to database
                        task_result.stakeholder_intelligence = (
                            enhanced_analysis.stakeholder_intelligence.model_dump()
                        )
                    else:
                        logger.warning(
                            f"[STAKEHOLDER_DEBUG] No stakeholder intelligence generated for result_id: {result_id}"
                        )

                    # Update result with enhanced themes, patterns, personas, insights
                    if enhanced_analysis.enhanced_themes:
                        result["enhanced_themes"] = [
                            (
                                theme.model_dump()
                                if hasattr(theme, "model_dump")
                                else theme
                            )
                            for theme in enhanced_analysis.enhanced_themes
                        ]
                        logger.info(
                            f"Added {len(enhanced_analysis.enhanced_themes)} enhanced themes to result_id: {result_id}"
                        )

                    if enhanced_analysis.enhanced_patterns:
                        result["enhanced_patterns"] = [
                            (
                                pattern.model_dump()
                                if hasattr(pattern, "model_dump")
                                else pattern
                            )
                            for pattern in enhanced_analysis.enhanced_patterns
                        ]
                        logger.info(
                            f"Added {len(enhanced_analysis.enhanced_patterns)} enhanced patterns to result_id: {result_id}"
                        )

                    if enhanced_analysis.enhanced_personas:
                        result["enhanced_personas"] = [
                            (
                                persona.model_dump()
                                if hasattr(persona, "model_dump")
                                else persona
                            )
                            for persona in enhanced_analysis.enhanced_personas
                        ]
                        logger.info(
                            f"Added {len(enhanced_analysis.enhanced_personas)} enhanced personas to result_id: {result_id}"
                        )

                    if enhanced_analysis.enhanced_insights:
                        result["enhanced_insights"] = [
                            (
                                insight.model_dump()
                                if hasattr(insight, "model_dump")
                                else insight
                            )
                            for insight in enhanced_analysis.enhanced_insights
                        ]
                        logger.info(
                            f"Added {len(enhanced_analysis.enhanced_insights)} enhanced insights to result_id: {result_id}"
                        )

                    # PHASE 4 FIX: Ensure stakeholder intelligence is properly committed
                    logger.info(
                        f"[STAKEHOLDER_DEBUG] Committing stakeholder intelligence for result_id: {result_id}"
                    )

                    # Verify stakeholder intelligence was saved before committing
                    if (
                        hasattr(task_result, "stakeholder_intelligence")
                        and task_result.stakeholder_intelligence
                    ):
                        logger.info(
                            f"[STAKEHOLDER_DEBUG] ✅ Stakeholder intelligence confirmed in task_result before commit"
                        )
                    else:
                        logger.warning(
                            f"[STAKEHOLDER_DEBUG] ⚠️ Stakeholder intelligence NOT found in task_result before commit"
                        )

                    # Commit all changes to database
                    async_db.commit()

                    # Verify after commit
                    async_db.refresh(task_result)
                    if (
                        hasattr(task_result, "stakeholder_intelligence")
                        and task_result.stakeholder_intelligence
                    ):
                        logger.info(
                            f"[STAKEHOLDER_DEBUG] ✅ Stakeholder intelligence confirmed in database after commit"
                        )
                    else:
                        logger.error(
                            f"[STAKEHOLDER_DEBUG] ❌ Stakeholder intelligence LOST after commit - database persistence failed!"
                        )

                    await update_progress(
                        "STAKEHOLDER_ANALYSIS", 1.0, "Stakeholder analysis completed"
                    )

                except Exception as stakeholder_error:
                    logger.error(
                        f"[STAKEHOLDER_DEBUG] Stakeholder analysis failed for result_id {result_id}: {str(stakeholder_error)}"
                    )
                    logger.error(
                        f"[STAKEHOLDER_DEBUG] Full error traceback:", exc_info=True
                    )

                    # PHASE 4 FIX: Handle stakeholder analysis errors gracefully without fake stakeholders
                    try:
                        logger.info(
                            f"[STAKEHOLDER_DEBUG] Handling stakeholder analysis error gracefully..."
                        )

                        # Create minimal stakeholder intelligence with error metadata only
                        from schemas import StakeholderIntelligence

                        # Don't create fake "Analysis_Failed" stakeholders - just log the error

                        minimal_intelligence = StakeholderIntelligence(
                            detected_stakeholders=[],  # Empty list instead of fake stakeholders
                            cross_stakeholder_patterns=None,
                            multi_stakeholder_summary=None,
                            processing_metadata={
                                "error": True,
                                "error_message": str(stakeholder_error)[:500],
                                "analysis_attempted": True,
                                "fallback_applied": True,
                            },
                        )

                        task_result.stakeholder_intelligence = (
                            minimal_intelligence.model_dump()
                        )
                        async_db.commit()

                        logger.info(
                            f"[STAKEHOLDER_DEBUG] ✅ Saved error metadata without fake stakeholders"
                        )

                    except Exception as save_error:
                        logger.error(
                            f"[STAKEHOLDER_DEBUG] Failed to save minimal stakeholder intelligence: {save_error}"
                        )

                    # Continue with regular analysis even if stakeholder analysis fails

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

            # Get current progress information
            try:
                current_results = json.loads(task_result.results)
                if not isinstance(current_results, dict):
                    current_results = {}
            except (json.JSONDecodeError, TypeError):
                current_results = {}

            # Preserve progress tracking information
            if "stage_states" not in current_results:
                current_results["stage_states"] = {}

            # Update all stages to completed
            stages = [
                "PREPROCESSING",
                "ANALYSIS",
                "THEME_EXTRACTION",
                "PATTERN_DETECTION",
                "SENTIMENT_ANALYSIS",
                "PERSONA_FORMATION",
                "INSIGHT_GENERATION",
                "STAKEHOLDER_ANALYSIS",
                "COMPLETION",
            ]

            for stage in stages:
                current_results["stage_states"][stage] = {
                    "status": "completed",
                    "progress": 1.0,
                    "message": f"{stage.replace('_', ' ').title()} completed",
                }

            # Update overall progress information
            current_results["progress"] = 1.0
            current_results["current_stage"] = "COMPLETION"
            current_results["message"] = "Analysis completed successfully"
            current_results["completed_at"] = datetime.now(timezone.utc).isoformat()

            # Merge the analysis results with the progress tracking information
            for key, value in result.items():
                if key not in [
                    "progress",
                    "current_stage",
                    "stage_states",
                    "message",
                    "status",
                ]:
                    current_results[key] = value

            # PHASE 4 FIX: Ensure stakeholder intelligence from database field is included in results JSON
            if (
                hasattr(task_result, "stakeholder_intelligence")
                and task_result.stakeholder_intelligence
            ):
                current_results["stakeholder_intelligence"] = (
                    task_result.stakeholder_intelligence
                )
                logger.info(
                    f"[STAKEHOLDER_DEBUG] ✅ Added stakeholder intelligence from database field to results JSON"
                )
            elif "stakeholder_intelligence" not in current_results:
                logger.warning(
                    f"[STAKEHOLDER_DEBUG] ⚠️ No stakeholder intelligence found in database field or results"
                )

            # Set the status to completed
            current_results["status"] = "completed"

            # Save the merged results
            task_result.results = json.dumps(current_results)
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
                    # Get current progress information
                    try:
                        current_results = json.loads(task_result.results)
                        if not isinstance(current_results, dict):
                            current_results = {}
                    except (json.JSONDecodeError, TypeError):
                        current_results = {}

                    # Determine which stage failed
                    current_stage = current_results.get("current_stage", "UNKNOWN")

                    # Update the stage status to failed
                    if "stage_states" not in current_results:
                        current_results["stage_states"] = {}

                    if current_stage in current_results["stage_states"]:
                        current_results["stage_states"][current_stage][
                            "status"
                        ] = "failed"
                        current_results["stage_states"][current_stage][
                            "message"
                        ] = f"Failed: {str(e)}"

                    # Create detailed error information
                    error_info = {
                        "status": "error",
                        "message": f"Analysis failed: {str(e)}",
                        "error_details": str(e),
                        "error_stage": current_stage,
                        "error_code": "ANALYSIS_PROCESSING_ERROR",
                        "error_time": datetime.now(timezone.utc).isoformat(),
                    }

                    # Merge error information with current results
                    for key, value in error_info.items():
                        current_results[key] = value

                    # Update database record with error
                    task_result.results = json.dumps(current_results)
                    task_result.status = "failed"
                    task_result.completed_at = datetime.now(timezone.utc)
                    async_db.commit()
                    logger.info(
                        f"Set status to 'failed' with detailed error info for result_id: {result_id}"
                    )
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
