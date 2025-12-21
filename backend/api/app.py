"""
FastAPI application for handling interview data and analysis.

📚 IMPLEMENTATION REFERENCE: See docs/pydantic-instructor-implementation-guide.md
   for proper Pydantic Instructor usage, JSON parsing, and structured output handling.

Last Updated: 2025-03-24
"""

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
import sys
import os

# Load environment variables from .env.oss file
from dotenv import load_dotenv
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_file = os.path.join(backend_dir, ".env.oss")
if os.path.exists(env_file):
    load_dotenv(env_file)
    print(f"[INFO] Loaded environment from {env_file}")
else:
    print(f"[WARNING] .env.oss file not found at {env_file}")

# Add the parent directory to the Python path
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Add the project root to the Python path
project_root = os.path.dirname(backend_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.services.external.auth_middleware import get_current_user
from typing import Dict, Any
import logging
import json
import time
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from sqlalchemy.sql import text

# Import centralized settings
from backend.infrastructure.config.settings import settings

from backend.schemas import HealthCheckResponse

from backend.services.llm import LLMServiceFactory
from backend.database import get_db, create_tables
from backend.services.processing.persona_formation_service import (
    PersonaFormationService,
)

# Import SQLAlchemy models using centralized package to avoid registry conflicts
from backend.models import User, AnalysisResult

# Import timezone utilities
from backend.utils.timezone_utils import format_iso_utc

# Configure logging using centralized settings (LOG_LEVEL / DEBUG_MODE)
try:
    config = settings.get_config()
    log_level_str = (config.log_level or "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
except Exception:
    # Fallback to INFO if settings are not yet available
    log_level = logging.INFO

# Configure logging - basicConfig may not work if uvicorn already configured logging,
# so we also explicitly set handler and formatter
logging.basicConfig(
    level=log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Ensure backend loggers use the configured level so debug messages are visible
# Also ensure they have a console handler in case uvicorn's config doesn't propagate
for name in ("backend", "backend.api", "backend.api.axpersona", "backend.api.research"):
    logger_instance = logging.getLogger(name)
    logger_instance.setLevel(log_level)

    # If no handlers exist, add a console handler to ensure logs are visible
    if not logger_instance.handlers:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(log_level)
        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        console_handler.setFormatter(formatter)
        logger_instance.addHandler(console_handler)

logger = logging.getLogger(__name__)
logger.info("Logging initialized with level %s", logging.getLevelName(log_level))

# Import API routers
from backend.api.endpoints.priority_insights import router as priority_insights_router
from backend.api.export_routes import router as export_router
from backend.api.routes.prd import router as prd_router
from backend.api.routes.perpetual_personas import router as perpetual_personas_router
from backend.api.axpersona.router import router as axpersona_router
from backend.api.precall.router import router as precall_router


DEFAULT_SENTIMENT_OVERVIEW = {"positive": 0.33, "neutral": 0.34, "negative": 0.33}


def transform_analysis_results(results):
    """
    Transform analysis results to conform to the DetailedAnalysisResult schema.
    Keep this function fast for initial response - detailed processing happens in run_analysis
    """
    if not results:
        return results

    import copy

    transformed = copy.deepcopy(results)

    # Quick validation and default values - keep this fast
    if "patterns" not in transformed or not isinstance(transformed["patterns"], list):
        transformed["patterns"] = []

    if "themes" not in transformed or not isinstance(transformed["themes"], list):
        transformed["themes"] = []

    # Ensure sentiment is always a list to match the DetailedAnalysisResult schema
    if "sentiment" not in transformed:
        transformed["sentiment"] = []
    elif not isinstance(transformed["sentiment"], list):
        # If sentiment is a dictionary, convert it to a list of one dictionary
        if isinstance(transformed["sentiment"], dict):
            transformed["sentiment"] = [transformed["sentiment"]]
        else:
            # If sentiment is anything else, use an empty list
            transformed["sentiment"] = []

    if "sentimentOverview" not in transformed:
        transformed["sentimentOverview"] = DEFAULT_SENTIMENT_OVERVIEW

    # Handle personas data
    if "personas" not in transformed:
        transformed["personas"] = []
    elif not isinstance(transformed["personas"], list):
        # Ensure personas is always a list
        if isinstance(transformed["personas"], dict):
            transformed["personas"] = [transformed["personas"]]
        else:
            transformed["personas"] = []

    return transformed


# Initialize FastAPI with security scheme
app = FastAPI(
    title="Interview Analysis API",
    description="""
    API for interview data analysis.

    Available LLM providers and models:
    - OpenAI: gpt-4o-2024-08-06
    - Google: models/gemini-3-flash-preview-preview-04-17 (Gemini 2.5 Flash)

    Authentication:
    - All endpoints (except /health) require Bearer token authentication
    - For Phase 1/2, any non-empty token value is accepted for testing
    - In production, proper JWT validation will be implemented
    """,
    version="2.0.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    contact={
        "name": "Development Team",
        "email": "dev@example.com",
    },
    license_info={
        "name": "Private",
        "url": "https://example.com/license",
    },
)

# Get CORS settings from centralized configuration
CORS_ORIGINS = settings.cors_origins
CORS_METHODS = settings.cors_methods
CORS_HEADERS = settings.cors_headers

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=CORS_METHODS,
    allow_headers=CORS_HEADERS,
)

# Configure rate limiting
from backend.services.external.rate_limiter import configure_rate_limiter

configure_rate_limiter(app)

# Configure input validation
from backend.services.external.input_validation import configure_input_validation

configure_input_validation(app)

# Import Firebase logging
from backend.services.external.firebase_logging import (
    firebase_logging,
    SecurityEventType,
)


# Configure security logging middleware
@app.middleware("http")
async def security_logging_middleware(request: Request, call_next):
    """Log security-relevant API requests and errors"""
    start_time = time.time()

    # Extract request information
    path = request.url.path
    method = request.method
    client_host = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")

    # Get user ID if available
    user_id = None
    if hasattr(request.state, "user_id"):
        user_id = request.state.user_id

    try:
        # Process the request
        response = await call_next(request)

        # Log security-relevant responses
        status_code = response.status_code

        # Log authentication failures
        if path.startswith("/api/auth") and status_code in (401, 403):
            firebase_logging.log_api_event(
                SecurityEventType.API_UNAUTHORIZED_ACCESS,
                endpoint=path,
                request_method=method,
                user_id=user_id,
                ip_address=client_host,
                user_agent=user_agent,
                status_code=status_code,
            )

        # Log rate limit exceeded
        elif status_code == 429:
            firebase_logging.log_api_event(
                SecurityEventType.API_RATE_LIMIT_EXCEEDED,
                endpoint=path,
                request_method=method,
                user_id=user_id,
                ip_address=client_host,
                user_agent=user_agent,
                status_code=status_code,
            )

        # Log access to sensitive endpoints
        elif path.startswith(("/api/admin", "/api/users")) and status_code < 400:
            firebase_logging.log_api_event(
                SecurityEventType.SENSITIVE_DATA_ACCESS,
                endpoint=path,
                request_method=method,
                user_id=user_id,
                ip_address=client_host,
                user_agent=user_agent,
                status_code=status_code,
            )

        return response

    except Exception as exc:
        # Log all exceptions
        firebase_logging.log_error(
            error=exc,
            user_id=user_id,
            resource=path,
            metadata={
                "method": method,
                "ip_address": client_host,
                "user_agent": user_agent,
            },
        )

        # Re-raise the exception
        raise




# Debugging middleware for AxPersona pipeline traffic
@app.middleware("http")
async def axpersona_logging_middleware(request: Request, call_next):
    """Log AxPersona-related HTTP requests for debugging the pipeline.

    This logs whenever a request hits any /api/axpersona path so we can
    confirm that UI-triggered pipeline calls reach the backend.
    """
    path = request.url.path
    method = request.method

    if path.startswith("/api/axpersona"):
        logger.info("[AxPersona HTTP] %s %s - request received", method, path)

    response = await call_next(request)

    if path.startswith("/api/axpersona"):
        logger.info(
            "[AxPersona HTTP] %s %s -> %s", method, path, response.status_code
        )

    return response

# Include routers
app.include_router(priority_insights_router, prefix="/api/analysis")
app.include_router(export_router)
app.include_router(prd_router)

app.include_router(perpetual_personas_router)
# AxPersona research-to-persona pipeline API
app.include_router(axpersona_router)

# PRECALL pre-call intelligence dashboard API
app.include_router(precall_router)


# Include debug router
from backend.api.endpoints.debug import router as debug_router

app.include_router(debug_router, prefix="/api")

# Include conversation routines router (2025 framework) - ONLY customer research system
from backend.api.research.conversation_routines.router import (
    router as conversation_routines_router,
)

# Use conversation routines (2025 framework) - clean, efficient, single system
app.include_router(conversation_routines_router)

# Include research dashboard router - dashboard-based question generation
from backend.api.research.dashboard.router import (
    router as research_dashboard_router,
)

app.include_router(research_dashboard_router)

# Include simulation bridge router - bridges questionnaire to analysis
from backend.api.research.simulation_bridge.router import (
    router as simulation_bridge_router,
)

app.include_router(simulation_bridge_router)

# Include research sessions router - manages research session CRUD operations
from backend.api.research.sessions.router import (
    router as research_sessions_router,
)

app.include_router(research_sessions_router)

# Include analysis routes (core data/analyze/results endpoints)
from backend.api.routes.analysis import router as analysis_router

app.include_router(analysis_router)

# Initialize database tables (optional for conversation routines)
try:
    create_tables()
    from backend.database import verify_model_registry

    verify_model_registry()
    logger.info(
        "✅ Database tables initialized successfully and model registry verified"
    )

    # Recover stale pipeline runs that were interrupted by server restart
    # Use synchronous DB access since we're at module load time
    try:
        from backend.database import SessionLocal
        from backend.models import PipelineRun
        from datetime import datetime, timedelta

        session = SessionLocal()
        try:
            cutoff_time = datetime.utcnow() - timedelta(minutes=30)

            # Find and update stale runs synchronously
            stale_runs = session.query(PipelineRun).filter(
                PipelineRun.status.in_(["running", "pending"]),
                PipelineRun.created_at < cutoff_time
            ).all()

            for run in stale_runs:
                run.status = "failed"
                run.completed_at = datetime.utcnow()
                run.error = f"Job interrupted - server restarted while job was {run.status}"
                logger.info(f"Marked stale pipeline run as failed: {run.job_id}")

            if stale_runs:
                session.commit()
                logger.info(f"🔧 Recovered {len(stale_runs)} stale pipeline runs on startup")
        finally:
            session.close()
    except Exception as recovery_error:
        logger.warning(f"⚠️ Pipeline recovery failed (non-critical): {recovery_error}")

except Exception as e:
    logger.warning(f"⚠️ Database initialization failed: {e}")
    logger.info(
        "🔄 Continuing without database (conversation routines will still work)"
    )

# Add this function definition before the route definitions
_persona_service = None


def get_persona_service():
    """
    Factory function to create a configured PersonaFormationService instance.
    This implements the singleton pattern to reuse the service.

    Returns:
        PersonaFormationService: A configured persona formation service
    """
    global _persona_service

    if _persona_service is not None:
        return _persona_service

    logger.info("Initializing persona formation service...")

    try:
        # Create a minimal SystemConfig for the persona service
        class MinimalSystemConfig:
            def __init__(self):
                # Ensure we have the API key directly from environment
                gemini_key = os.getenv("GEMINI_API_KEY")
                if gemini_key and not settings.llm_providers["gemini"].get("api_key"):
                    logger.info(
                        "Directly loading Gemini API key from environment for persona service"
                    )
                    settings.llm_providers["gemini"]["api_key"] = gemini_key

                # Import constants for LLM configuration
                from backend.infrastructure.constants.llm_constants import (
                    GEMINI_MODEL_NAME,
                    GEMINI_TEMPERATURE,
                    GEMINI_MAX_TOKENS,
                )

                self.llm = type(
                    "obj",
                    (object,),
                    {
                        "provider": "gemini",
                        "model": GEMINI_MODEL_NAME,
                        "api_key": settings.llm_providers["gemini"].get("api_key", ""),
                        "temperature": GEMINI_TEMPERATURE,
                        "max_tokens": GEMINI_MAX_TOKENS,
                    },
                )
                self.processing = type(
                    "obj",
                    (object,),
                    {"batch_size": 10, "max_tokens": GEMINI_MAX_TOKENS},
                )
                self.validation = type("obj", (object,), {"min_confidence": 0.4})

        # Create LLM service using centralized settings
        llm_service = LLMServiceFactory.create(settings.default_llm_provider)

        # Create and return the persona service
        system_config = MinimalSystemConfig()
        _persona_service = PersonaFormationService(system_config, llm_service)

        logger.info("Persona formation service initialized successfully")
        return _persona_service
    except Exception as e:
        logger.error(f"Failed to initialize persona formation service: {str(e)}")
        raise


# NOTE: The following endpoints have been moved to routes/analysis.py:
# - POST /api/data (upload_data)
# - POST /api/analyze (analyze_data)
# - POST /api/analyses/{result_id}/restart (restart_analysis)
# - GET /api/results/{result_id} (get_results)
# - GET /api/results/{result_id}/personas/simplified (get_simplified_personas)
# - GET /api/analyses (list_analyses)
# - OPTIONS /api/analyses (options_analyses)
# - POST /api/generate-persona (generate_persona_from_text)


@app.get(
    "/api/analysis/{result_id}/status",
    response_model=Dict[str, Any],
    tags=["Analysis"],
    summary="Get analysis status",
    description="Check the current status (processing, completed, failed) of an analysis with detailed progress information.",
)
async def get_analysis_status(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves the current status of an analysis with detailed progress information.

    Returns:
        Dict with the following structure:
        {
            "status": "processing|completed|failed",
            "progress": float,  # Overall progress from 0.0 to 1.0
            "current_stage": str,  # Current processing stage
            "stage_states": Dict[str, Dict],  # Detailed status of each stage
            "error": str,  # Optional error message if status is "failed"
            "started_at": str,  # ISO timestamp when analysis started
            "completed_at": str,  # ISO timestamp when analysis completed (if applicable)
        }
    """
    request_id = request.headers.get("X-Request-ID", f"req-{time.time()}")
    logger.info(
        f"[GetStatus - Start] RequestID: {request_id}, User: {current_user.user_id}, ResultID: {result_id}"
    )
    try:
        # First try to get the result directly (for development mode or if ownership check is not critical)
        analysis_result = (
            db.query(AnalysisResult)
            .filter(AnalysisResult.result_id == result_id)
            .first()
        )

        # In production, we would verify ownership
        # This is commented out for now to fix the immediate issue
        # analysis_result = db.query(AnalysisResult).join(
        #     AnalysisResult.interview_data
        # ).filter(
        #     AnalysisResult.result_id == result_id,
        #     InterviewData.user_id == current_user.user_id  # Ensure user owns the result
        # ).first()

        if not analysis_result:
            logger.warning(
                f"[GetStatus - NotFound] RequestID: {request_id}, User: {current_user.user_id}, ResultID: {result_id}"
            )
            raise HTTPException(
                status_code=404,
                detail={
                    "message": "Analysis result not found",
                    "code": "ANALYSIS_NOT_FOUND",
                    "request_id": request_id,
                },
            )

        status = analysis_result.status
        error_message = None
        progress = 0.0
        current_stage = None
        stage_states = {}

        # Initialize response with basic information
        # Use centralized timezone utility for consistent formatting
        response_data = {
            "status": status,
            "started_at": format_iso_utc(analysis_result.analysis_date),
            "completed_at": format_iso_utc(analysis_result.completed_at),
        }

        # Parse results JSON for additional information
        try:
            results_data = json.loads(analysis_result.results or "{}")

            # Extract progress information
            if "progress" in results_data and isinstance(
                results_data["progress"], (int, float)
            ):
                progress = float(results_data["progress"])
                response_data["progress"] = progress

            # Extract current stage
            if "current_stage" in results_data:
                current_stage = results_data["current_stage"]
                response_data["current_stage"] = current_stage

            # Extract stage states
            if "stage_states" in results_data and isinstance(
                results_data["stage_states"], dict
            ):
                stage_states = results_data["stage_states"]
                response_data["stage_states"] = stage_states

            # For failed status, extract error information
            if status == "failed":
                error_message = (
                    results_data.get("error_details")
                    or results_data.get("message")
                    or "Analysis failed with an unspecified error."
                )
                response_data["error"] = error_message
                response_data["error_code"] = results_data.get(
                    "error_code", "ANALYSIS_FAILED"
                )

            # For processing status, ensure we have a progress value
            if status == "processing" and "progress" not in response_data:
                # Estimate progress based on creation time if we don't have explicit progress
                # Assume analysis takes about 5 minutes on average
                if analysis_result.analysis_date:
                    # Handle both naive and timezone-aware datetime objects
                    current_time = datetime.now(timezone.utc)
                    if analysis_result.analysis_date.tzinfo is None:
                        # Naive datetime - assume it's UTC
                        start_time = analysis_result.analysis_date.replace(
                            tzinfo=timezone.utc
                        )
                    else:
                        start_time = analysis_result.analysis_date
                    elapsed_seconds = (current_time - start_time).total_seconds()
                    estimated_progress = min(0.95, elapsed_seconds / 300)  # Cap at 95%
                    response_data["progress"] = estimated_progress
                    response_data["progress_estimated"] = True
                else:
                    # Don't add artificial progress - let stage states determine progress
                    pass

            # For completed status, ensure progress is 1.0
            if status == "completed" and "progress" not in response_data:
                response_data["progress"] = 1.0

        except json.JSONDecodeError:
            logger.warning(
                f"[GetStatus - JSONDecodeError] RequestID: {request_id}, ResultID: {result_id}"
            )
            if status == "failed":
                error_message = (
                    "Analysis failed, and error details could not be parsed."
                )
                response_data["error"] = error_message
                response_data["error_code"] = "JSON_PARSE_ERROR"

            # Add minimal progress information
            if status == "processing" and "progress" not in response_data:
                response_data["progress"] = 0.5
                response_data["progress_estimated"] = True
            elif status == "completed" and "progress" not in response_data:
                response_data["progress"] = 1.0

        except Exception as parse_error:
            logger.error(
                f"[GetStatus - ParseError] RequestID: {request_id}, ResultID: {result_id}: {str(parse_error)}"
            )
            if status == "failed":
                error_message = "Analysis failed with an unknown error structure."
                response_data["error"] = error_message
                response_data["error_code"] = "UNKNOWN_ERROR_STRUCTURE"

        # Add request ID for tracking
        response_data["request_id"] = request_id

        logger.info(
            f"[GetStatus - Success] RequestID: {request_id}, User: {current_user.user_id}, "
            f"ResultID: {result_id}, Status: {status}"
        )
        return response_data

    except HTTPException:
        # Re-raise HTTP exceptions directly
        raise
    except Exception as e:
        logger.error(
            f"[GetStatus - Error] RequestID: {request_id}, User: {current_user.user_id}, ResultID: {result_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=500,
            detail={
                "message": f"Internal server error checking status: {str(e)}",
                "code": "INTERNAL_SERVER_ERROR",
                "request_id": request_id,
            },
        )


@app.get(
    "/health",
    response_model=HealthCheckResponse,
    tags=["System"],
    summary="Health check",
    description="Simple health check endpoint to verify the API is running.",
    include_in_schema=True,
)
async def health_check():
    """
    Simple health check endpoint.
    """
    # Return dict instead of HealthCheckResponse to control timestamp format
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get(
    "/api/health",
    tags=["System"],
    summary="Detailed health check",
    description="Detailed health check endpoint that returns information about the server, database connection, and user count.",
)
async def detailed_health_check(db: Session = Depends(get_db)):
    """
    Detailed health check endpoint that reports on server and database status.
    """
    try:
        # Test database connection
        db_status = "connected"
        db_error = None
        db_info = None
        user_count = 0
        analysis_count = 0

        try:
            result = db.execute(text("SELECT 1")).fetchone()

            # Get database type and version
            if str(db.bind.url).startswith("sqlite"):
                db_info = db.execute(text("SELECT sqlite_version()")).fetchone()[0]
            else:
                db_info = db.execute(text("SELECT version()")).fetchone()[0]

            # Count users and analyses
            from backend.models import User, AnalysisResult

            user_count = db.query(User).count()
            analysis_count = db.query(AnalysisResult).count()

        except Exception as e:
            db_status = "error"
            db_error = str(e)

        # Get environment info
        env_info = {
            "ENABLE_CLERK_VALIDATION": os.getenv("ENABLE_CLERK_VALIDATION", "false"),
            "DATABASE_URL_TYPE": (
                str(db.bind.url).split("://")[0]
                if db_status == "connected"
                else "unknown"
            ),
        }

        return {
            "status": "healthy",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": {
                "status": db_status,
                "error": db_error,
                "info": db_info,
                "counts": {"users": user_count, "analyses": analysis_count},
            },
            "environment": env_info,
            "server_id": "DesignAId-API-v2",
        }
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# Priority insights endpoint moved to dedicated router module in backend/api/endpoints/priority_insights.py
