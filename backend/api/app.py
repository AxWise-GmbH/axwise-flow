"""
FastAPI application for handling interview data and analysis.

📚 IMPLEMENTATION REFERENCE: See docs/pydantic-instructor-implementation-guide.md
   for proper Pydantic Instructor usage, JSON parsing, and structured output handling.

Last Updated: 2025-03-24
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
import sys
import os
from slowapi.errors import RateLimitExceeded

# Add the parent directory to the Python path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Add the project root to the Python path
project_root = os.path.dirname(backend_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from backend.services.external.auth_middleware import get_current_user
from typing import Dict, Any, List, Literal, Optional
import logging
import json
import asyncio
import time  # Import time module
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from sqlalchemy.sql import text

# Import centralized settings
from backend.infrastructure.config.settings import settings

from backend.schemas import (
    AnalysisRequest,
    UploadResponse,
    AnalysisResponse,
    ResultResponse,
    HealthCheckResponse,
    DetailedAnalysisResult,
    PersonaGenerationRequest,
)

from backend.core.processing_pipeline import process_data
from backend.services.llm import LLMServiceFactory
from backend.services.nlp import get_nlp_processor
from backend.database import get_db, create_tables
from backend.infrastructure.config.settings import settings
from backend.services.processing.persona_formation_service import (
    PersonaFormationService,
)

# Import SQLAlchemy models using centralized package to avoid registry conflicts
from backend.models import User, InterviewData, AnalysisResult

# Import timezone utilities
from backend.utils.timezone_utils import format_iso_utc, ensure_utc

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Import API routers
from backend.api.endpoints.priority_insights import router as priority_insights_router
from backend.api.export_routes import router as export_router
from backend.api.routes.prd import router as prd_router

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
    - Google: models/gemini-2.5-flash-preview-04-17 (Gemini 2.5 Flash)

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


# Include routers
app.include_router(priority_insights_router, prefix="/api/analysis")
app.include_router(export_router)
app.include_router(prd_router)

# Include subscription and payment routers
from backend.api.routes.subscription import router as subscription_router
from backend.api.routes.stripe_webhook import router as stripe_webhook_router

app.include_router(subscription_router)
app.include_router(stripe_webhook_router)

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

# Initialize database tables (optional for conversation routines)
try:
    create_tables()
    from backend.database import verify_model_registry

    verify_model_registry()
    logger.info(
        "✅ Database tables initialized successfully and model registry verified"
    )
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


@app.post(
    "/api/data",
    response_model=UploadResponse,
    tags=["Data Management"],
    summary="Upload interview data",
    description="Upload interview data in JSON format or free-text format for analysis.",
)
async def upload_data(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Handles interview data upload (JSON format or free-text format).

    This implementation uses a direct approach to handle multipart/form-data
    instead of relying on FastAPI's automatic parsing, which can sometimes
    fail with certain file types or encodings.
    """
    start_time = time.time()
    logger.info(f"[UploadData - Start] User: {current_user.user_id}")

    # Enhanced debugging for request details
    content_type = request.headers.get("content-type", "")
    logger.info(f"[UploadData - Request] Content-Type: {content_type}")
    logger.info(f"[UploadData - Request] Headers: {dict(request.headers)}")

    # Check if this is a multipart/form-data request
    if not content_type.startswith("multipart/form-data"):
        logger.error(f"[UploadData - Error] Invalid content type: {content_type}")
        raise HTTPException(
            status_code=415,
            detail="Unsupported media type. Please use multipart/form-data.",
        )

    try:
        # Manually parse the multipart form data
        form = await request.form()
        logger.info(f"[UploadData - Form] Keys: {list(form.keys())}")

        # Detailed logging of form contents
        for key in form:
            value = form[key]
            if isinstance(value, UploadFile):
                logger.info(
                    f"[UploadData - Form] Field: {key}, Type: UploadFile, Filename: {value.filename}, Content-Type: {value.content_type}"
                )
            else:
                logger.info(
                    f"[UploadData - Form] Field: {key}, Type: {type(value)}, Value: {value}"
                )

        # Extract file from form data
        file = None
        if "file" in form:
            file = form["file"]
            # Check if file has the necessary attributes instead of using isinstance
            if not hasattr(file, "filename") or not hasattr(file, "read"):
                logger.error(
                    f"[UploadData - Error] 'file' field is not a valid file object: {type(file)}"
                )
                logger.error(f"[UploadData - Error] File attributes: {dir(file)}")
                raise HTTPException(
                    status_code=400,
                    detail="Invalid file upload. The 'file' field must contain a file.",
                )
            logger.info(
                f"[UploadData - Success] Found valid file object in 'file' field: {file.filename}"
            )
        else:
            # Try to find any file-like object in the form as a fallback
            for key, value in form.items():
                if hasattr(value, "filename") and hasattr(value, "read"):
                    logger.info(
                        f"[UploadData - Recovery] Found file in form with key: {key}"
                    )
                    file = value
                    break

        # If we still don't have a file, return an error
        if not file:
            logger.error("[UploadData - Error] No file found in the request")
            raise HTTPException(
                status_code=400,
                detail="No file uploaded. Please ensure you're sending a file in the 'file' field.",
            )

        # Extract is_free_text parameter
        is_free_text = False
        if "is_free_text" in form:
            is_free_text_value = form["is_free_text"]
            # Convert string value to boolean
            if isinstance(is_free_text_value, str):
                is_free_text = is_free_text_value.lower() in ("true", "1", "yes", "y")
            elif isinstance(is_free_text_value, bool):
                is_free_text = is_free_text_value

        logger.info(
            f"[UploadData - Processing] Filename: {file.filename}, Size: {getattr(file, 'size', 'N/A')}, Content-Type: {file.content_type}, IsFreeText: {is_free_text}"
        )

        # Verify file content
        try:
            # Read a small sample of the file to verify it's not empty
            file_sample = await file.read(1024)
            await file.seek(0)  # Reset file position after reading sample

            if not file_sample:
                logger.error("[UploadData - Error] File is empty")
                raise HTTPException(
                    status_code=400, detail="The uploaded file is empty."
                )

            logger.info(f"[UploadData - File] Sample size: {len(file_sample)} bytes")

            # Try to decode the sample as UTF-8 to check for encoding issues
            try:
                sample_text = file_sample.decode("utf-8")
                logger.info(
                    f"[UploadData - File] Sample decodes as UTF-8: {sample_text[:100]}..."
                )
            except UnicodeDecodeError:
                logger.warning(
                    "[UploadData - File] Sample cannot be decoded as UTF-8, might be binary data"
                )
        except Exception as sample_error:
            logger.error(
                f"[UploadData - Error] Failed to read file sample: {str(sample_error)}"
            )

        # Use DataService to handle upload logic
        from backend.services.data_service import DataService

        data_service = DataService(db, current_user)

        # Process the upload
        result = await data_service.upload_interview_data(file, is_free_text)

        # Return UploadResponse
        return UploadResponse(
            success=result["success"],
            message=result["message"],
            data_id=result["data_id"],
        )

    except HTTPException as http_ex:
        logger.warning(
            f"[UploadData - HTTPException] User: {current_user.user_id}, Status: {http_ex.status_code}, Detail: {http_ex.detail}, Duration: {time.time() - start_time:.4f}s"
        )
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"[UploadData - Error] Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
    finally:
        duration = time.time() - start_time
        logger.info(
            f"[UploadData - End] User: {current_user.user_id}, Duration: {duration:.4f}s"
        )


@app.post(
    "/api/analyze",
    response_model=AnalysisResponse,
    tags=["Analysis"],
    summary="Analyze uploaded data",
    description="Trigger analysis of previously uploaded data using the specified LLM provider.",
)
async def analyze_data(
    request: Request,
    analysis_request: AnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Triggers analysis of uploaded data."""
    start_time = time.time()
    logger.info(
        f"[AnalyzeData - Start] User: {current_user.user_id}, DataID: {analysis_request.data_id}, Provider: {analysis_request.llm_provider}"
    )
    try:
        # Validate configuration
        try:
            # Ensure API key is loaded directly from environment
            if analysis_request.llm_provider == "gemini":
                gemini_key = os.getenv("GEMINI_API_KEY")
                if gemini_key:
                    logger.info("Directly loading Gemini API key from environment")
                    settings.llm_providers["gemini"]["api_key"] = gemini_key
                else:
                    logger.error("GEMINI_API_KEY not found in environment")

            # Only validate the configuration for the provider we're using
            settings.validate_llm_config(analysis_request.llm_provider)
        except Exception as e:
            logger.error(f"Configuration validation error: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"LLM configuration error: {str(e)}"
            )

        # Use AnalysisService to handle the analysis process
        from backend.services.analysis_service import AnalysisService

        analysis_service = AnalysisService(db, current_user)

        # Start the analysis and get the result
        result = await analysis_service.start_analysis(
            data_id=analysis_request.data_id,
            llm_provider=analysis_request.llm_provider,
            llm_model=analysis_request.llm_model,
            is_free_text=analysis_request.is_free_text,
            industry=analysis_request.industry,
        )

        # Return response
        return AnalysisResponse(
            success=result["success"],
            message=result["message"],
            result_id=result["result_id"],
        )

    except HTTPException:
        logger.warning(
            f"[AnalyzeData - HTTPException] User: {current_user.user_id}, DataID: {analysis_request.data_id}, Duration: {time.time() - start_time:.4f}s"
        )
        # Re-raise HTTP exceptions
        raise


@app.post(
    "/api/analyses/{result_id}/restart",
    response_model=AnalysisResponse,
    tags=["Analysis"],
    summary="Restart analysis",
    description="Restart the full analysis pipeline using the same InterviewData as an existing result. Creates a new analysis result and preserves prior settings when available.",
)
async def restart_analysis_endpoint(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restart an analysis, creating a new result using prior settings where possible."""
    try:
        # Authorize and fetch the original analysis result
        analysis_result = (
            db.query(AnalysisResult)
            .filter(
                AnalysisResult.result_id == result_id,
                AnalysisResult.data_id.in_(
                    db.query(InterviewData.id).filter(
                        InterviewData.user_id == current_user.user_id
                    )
                ),
            )
            .first()
        )
        if not analysis_result:
            raise HTTPException(status_code=404, detail="Analysis result not found")

        # Fetch original InterviewData
        interview_data = (
            db.query(InterviewData)
            .filter(InterviewData.id == analysis_result.data_id)
            .first()
        )
        if not interview_data:
            raise HTTPException(status_code=404, detail="Interview data not found")

        # Determine prior settings / fallbacks
        llm_provider = analysis_result.llm_provider or "gemini"
        llm_model = analysis_result.llm_model
        # Preserve prior industry if present
        prior_results = analysis_result.results or {}
        if isinstance(prior_results, str):
            try:
                prior_results = json.loads(prior_results)
            except Exception:
                prior_results = {}
        industry = prior_results.get("industry")

        # Infer is_free_text from InterviewData
        is_free_text = False
        try:
            if (interview_data.input_type or "").lower() == "text":
                is_free_text = True
            else:
                parsed = json.loads(interview_data.original_data)
                if isinstance(parsed, dict) and (
                    "free_text" in parsed
                    or parsed.get("metadata", {}).get("is_free_text")
                ):
                    is_free_text = True
        except Exception:
            if (
                isinstance(interview_data.original_data, str)
                and len(interview_data.original_data) > 0
            ):
                is_free_text = True

        # Fallback to default Gemini model if none recorded
        if not llm_model:
            try:
                llm_model = settings.llm_providers.get("gemini", {}).get(
                    "model", "models/gemini-2.5-flash"
                )
            except Exception:
                llm_model = "models/gemini-2.5-flash"

        # Kick off a new analysis
        from backend.services.analysis_service import AnalysisService

        analysis_service = AnalysisService(db, current_user)
        result = await analysis_service.start_analysis(
            data_id=analysis_result.data_id,
            llm_provider=llm_provider,
            llm_model=llm_model,
            is_free_text=is_free_text,
            industry=industry,
        )

        return AnalysisResponse(
            result_id=int(result.get("result_id")),
            message="Analysis restarted",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"[RestartAnalysis] Error restarting analysis {result_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500, detail=f"Error restarting analysis: {str(e)}"
        )

    except Exception as e:
        logger.error(f"Error initiating analysis: {str(e)}")
        logger.error(
            f"[AnalyzeData - Error] User: {current_user.user_id}, DataID: {analysis_request.data_id}, Duration: {time.time() - start_time:.4f}s"
        )
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
    finally:
        duration = time.time() - start_time
        logger.info(
            f"[AnalyzeData - End] User: {current_user.user_id}, DataID: {analysis_request.data_id}, Duration: {duration:.4f}s"
        )


@app.get(
    "/api/results/{result_id}",
    response_model=ResultResponse,
    tags=["Analysis"],
    summary="Get analysis results",
    description="Retrieve the results of a previously triggered analysis.",
)
async def get_results(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves analysis results.
    """
    try:
        # Resolve ResultsService via DI container (central flag handling)
        from backend.api.dependencies import get_container

        container = get_container()
        factory = container.get_results_service()
        results_service = factory(db, current_user)

        # Get formatted results
        result = results_service.get_analysis_result(result_id)

        # Optional on-read hydration for personas within full results so UI gets
        # doc_id/offset-enriched evidence without changing data sources.
        try:
            import os

            hydrate = str(
                os.getenv("ENABLE_FULL_RESULTS_PERSONAS_HYDRATION", "false")
            ).lower() in {"1", "true", "yes"}

            if hydrate and isinstance(result, dict):
                results_obj = result.get("results") or {}
                personas = results_obj.get("personas")
                if isinstance(personas, list) and personas:
                    source_payload = results_obj.get("source") or {}

                    # Helper: build concatenated text and doc_spans from transcript
                    def _build_concat_and_spans(tx):
                        try:
                            order = []
                            buckets = {}
                            for seg in tx or []:
                                if not isinstance(seg, dict):
                                    continue
                                did = seg.get("document_id") or "original_text"
                                if did not in buckets:
                                    buckets[did] = []
                                    order.append(did)
                                dlg = seg.get("dialogue") or seg.get("text") or ""
                                if dlg:
                                    buckets[did].append(str(dlg))
                            pieces, spans, cursor = [], [], 0
                            sep = "\n\n"
                            for did in order:
                                block = "\n".join(buckets.get(did) or [])
                                start, end = cursor, cursor + len(block)
                                spans.append(
                                    {"document_id": did, "start": start, "end": end}
                                )
                                pieces.append(block)
                                cursor = end + len(sep)
                            return sep.join(pieces), spans
                        except Exception:
                            return "", []

                    transcript = (
                        source_payload.get("transcript")
                        if isinstance(source_payload, dict)
                        else None
                    )
                    scoped_text, doc_spans = None, None
                    if isinstance(transcript, list) and transcript:
                        txt, spans = _build_concat_and_spans(transcript)
                        if txt and spans:
                            scoped_text, doc_spans = txt, spans
                    if not scoped_text:
                        scoped_text = source_payload.get("original_text") or ""

                    if isinstance(scoped_text, str) and scoped_text.strip():
                        # Lazy import
                        from backend.services.processing.evidence_linking_service import (
                            EvidenceLinkingService,
                        )

                        svc = EvidenceLinkingService(None)
                        svc.enable_v2 = True
                        scope_meta = {
                            "speaker": "Interviewee",
                            "speaker_role": "Interviewee",
                            "document_id": "original_text",
                        }
                        if doc_spans:
                            scope_meta["doc_spans"] = doc_spans

                        trait_names = [
                            "demographics",
                            "goals_and_motivations",
                            "challenges_and_frustrations",
                            "key_quotes",
                        ]

                        for p in personas:
                            try:
                                attributes = {
                                    tn: {
                                        "value": (p.get(tn, {}) or {}).get("value", "")
                                    }
                                    for tn in trait_names
                                }
                                _, ev_map = svc.link_evidence_to_attributes_v2(
                                    attributes,
                                    scoped_text=scoped_text,
                                    scope_meta=scope_meta,
                                    protect_key_quotes=True,
                                )
                                for tn in trait_names:
                                    trait = p.get(tn) or {}
                                    ev = trait.get("evidence")
                                    ev = ev if isinstance(ev, list) else []
                                    needs_hydration = True
                                    if ev:
                                        good = 0
                                        for it in ev:
                                            try:
                                                if (
                                                    isinstance(
                                                        it.get("start_char"), int
                                                    )
                                                    and isinstance(
                                                        it.get("end_char"), int
                                                    )
                                                    and (
                                                        it.get("document_id")
                                                        is not None
                                                    )
                                                ):
                                                    good += 1
                                            except Exception:
                                                pass
                                        needs_hydration = good == 0
                                    if needs_hydration:
                                        trait["evidence"] = ev_map.get(tn, ev)
                                        p[tn] = trait
                            except Exception:
                                # Skip hydration for this persona on any error
                                continue
        except Exception as _full_hydrate_err:
            logger.warning(
                f"[FULL_RESULTS_HYDRATION] Skipped due to error: {_full_hydrate_err}"
            )

        return result

    except Exception as e:
        logger.error(f"Error retrieving results: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get(
    "/api/results/{result_id}/personas/simplified",
    tags=["Analysis"],
    summary="Get simplified design thinking personas",
    description="Retrieve personas optimized for design thinking display with only 5 core fields and quality filtering.",
)
async def get_simplified_personas(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get design thinking optimized personas (5 fields only).

    Based on PROJECT_DEEP_DIVE_ANALYSIS.md recommendations:
    - Returns only populated, high-confidence fields
    - Filters to 5 core design thinking fields
    - Includes confidence and evidence metadata
    """
    try:
        logger.info(
            f"Getting simplified personas for result_id: {result_id}, user: {current_user.user_id}"
        )

        # Resolve ResultsService via DI container (central flag handling)
        from backend.api.dependencies import get_container

        container = get_container()
        factory = container.get_results_service()
        results_service = factory(db, current_user)

        # Get filtered design thinking personas
        simplified_personas = results_service.get_design_thinking_personas(result_id)

        # Normalize to ProductionPersona-compatible shape (top-level trait fields)
        def _trait_from_populated(p: Dict[str, Any], name: str) -> Dict[str, Any]:
            traits = p.get("populated_traits", {}) if isinstance(p, dict) else {}
            t = traits.get(name) or {}
            if isinstance(t, dict) and "value" in t:
                val = t.get("value", "")
                conf = t.get("confidence", p.get("overall_confidence", 0.7))
                ev = t.get("evidence", [])
                ev = ev if isinstance(ev, list) else []
                return {"value": val, "confidence": conf, "evidence": ev}
            return {
                "value": "",
                "confidence": p.get("overall_confidence", 0.7),
                "evidence": [],
            }

        normalized_personas = []
        for p in simplified_personas:
            if not isinstance(p, dict):
                continue
            normalized_personas.append(
                {
                    "name": p.get("name", "Unknown Persona"),
                    "description": p.get("description", ""),
                    "archetype": p.get("archetype", "Professional"),
                    "demographics": _trait_from_populated(p, "demographics"),
                    "goals_and_motivations": _trait_from_populated(
                        p, "goals_and_motivations"
                    ),
                    "challenges_and_frustrations": _trait_from_populated(
                        p, "challenges_and_frustrations"
                    ),
                    "key_quotes": _trait_from_populated(p, "key_quotes"),
                }
            )

        # Import validation functions
        from backend.domain.models.production_persona import PersonaAPIResponse

        # Create validated API response
        try:
            # Compute evidence quality summary per persona
            def _quality_for_trait(trait: Dict[str, Any]) -> Dict[str, Any]:
                ev = trait.get("evidence", []) if isinstance(trait, dict) else []
                total = len(ev)
                non_null = 0
                for it in ev:
                    try:
                        if (
                            isinstance(it.get("start_char"), int)
                            and isinstance(it.get("end_char"), int)
                            and (it.get("document_id") is not None)
                        ):
                            non_null += 1
                    except Exception:
                        pass
                ratio = (non_null / total) if total else 0.0
                return {"count": total, "non_null_offset_ratio": ratio}

            per_persona = []
            for p in normalized_personas:
                per_persona.append(
                    {
                        "name": p.get("name"),
                        "demographics": _quality_for_trait(p.get("demographics", {})),
                        "goals_and_motivations": _quality_for_trait(
                            p.get("goals_and_motivations", {})
                        ),
                        "challenges_and_frustrations": _quality_for_trait(
                            p.get("challenges_and_frustrations", {})
                        ),
                        "key_quotes": _quality_for_trait(p.get("key_quotes", {})),
                    }
                )

            # Optional on-read hydration to populate offsets/doc_ids if missing
            import os

            hydrate = str(
                os.getenv("ENABLE_SIMPLIFIED_PERSONAS_HYDRATION", "false")
            ).lower() in {"1", "true", "yes"}
            if hydrate:
                try:
                    # Fetch full results to get source text when available
                    full_result = results_service.get_analysis_result(result_id)
                    results_obj = (
                        full_result.get("results", {})
                        if isinstance(full_result, dict)
                        else {}
                    )
                    source_payload = results_obj.get("source") or {}

                    # Helper: build concatenated text and doc_spans from transcript
                    def _build_concat_and_spans(tx):
                        try:
                            order = []
                            buckets = {}
                            for seg in tx or []:
                                if not isinstance(seg, dict):
                                    continue
                                did = seg.get("document_id") or "original_text"
                                if did not in buckets:
                                    buckets[did] = []
                                    order.append(did)
                                dlg = seg.get("dialogue") or seg.get("text") or ""
                                if dlg:
                                    buckets[did].append(str(dlg))
                            pieces, spans, cursor = [], [], 0
                            sep = "\n\n"
                            for did in order:
                                block = "\n".join(buckets.get(did) or [])
                                start, end = cursor, cursor + len(block)
                                spans.append(
                                    {"document_id": did, "start": start, "end": end}
                                )
                                pieces.append(block)
                                cursor = end + len(sep)
                            return sep.join(pieces), spans
                        except Exception:
                            return "", []

                    transcript = (
                        source_payload.get("transcript")
                        if isinstance(source_payload, dict)
                        else None
                    )
                    scoped_text, doc_spans = None, None
                    if isinstance(transcript, list) and transcript:
                        txt, spans = _build_concat_and_spans(transcript)
                        if txt and spans:
                            scoped_text, doc_spans = txt, spans
                    if not scoped_text:
                        scoped_text = source_payload.get("original_text") or ""

                    # Only hydrate if we have some text
                    if isinstance(scoped_text, str) and scoped_text.strip():
                        # Lazy import to avoid heavy import at module top
                        from backend.services.processing.evidence_linking_service import (
                            EvidenceLinkingService,
                        )

                        svc = EvidenceLinkingService(None)
                        svc.enable_v2 = True
                        scope_meta = {
                            "speaker": "Interviewee",
                            "speaker_role": "Interviewee",
                            "document_id": "original_text",
                        }
                        if doc_spans:
                            scope_meta["doc_spans"] = doc_spans
                        # For each persona, attempt to fill missing/invalid evidence
                        trait_names = [
                            "demographics",
                            "goals_and_motivations",
                            "challenges_and_frustrations",
                            "key_quotes",
                        ]
                        for p in normalized_personas:
                            # Build attributes from values
                            attributes = {
                                tn: {"value": (p.get(tn, {}) or {}).get("value", "")}
                                for tn in trait_names
                            }
                            enhanced, ev_map = svc.link_evidence_to_attributes_v2(
                                attributes,
                                scoped_text=scoped_text,
                                scope_meta=scope_meta,
                                protect_key_quotes=True,
                            )
                            # Replace evidence if empty or missing offsets/doc_ids
                            for tn in trait_names:
                                trait = p.get(tn) or {}
                                ev = (
                                    trait.get("evidence")
                                    if isinstance(trait, dict)
                                    else []
                                )
                                ev = ev if isinstance(ev, list) else []
                                needs_hydration = True
                                if ev:
                                    good = 0
                                    for it in ev:
                                        try:
                                            if (
                                                isinstance(it.get("start_char"), int)
                                                and isinstance(it.get("end_char"), int)
                                                and (it.get("document_id") is not None)
                                            ):
                                                good += 1
                                        except Exception:
                                            pass
                                    needs_hydration = good == 0
                                if needs_hydration:
                                    trait["evidence"] = ev_map.get(tn, ev)
                                    p[tn] = trait
                        # Recompute quality after hydration
                        per_persona = []
                        for p in normalized_personas:
                            per_persona.append(
                                {
                                    "name": p.get("name"),
                                    "demographics": _quality_for_trait(
                                        p.get("demographics", {})
                                    ),
                                    "goals_and_motivations": _quality_for_trait(
                                        p.get("goals_and_motivations", {})
                                    ),
                                    "challenges_and_frustrations": _quality_for_trait(
                                        p.get("challenges_and_frustrations", {})
                                    ),
                                    "key_quotes": _quality_for_trait(
                                        p.get("key_quotes", {})
                                    ),
                                }
                            )
                except Exception as _hydrate_err:
                    logger.warning(
                        f"[SIMPLIFIED_HYDRATION] Skipped due to error: {_hydrate_err}"
                    )

            validated_response = PersonaAPIResponse(
                personas=normalized_personas,
                metadata={
                    "result_id": result_id,
                    "design_thinking_optimized": True,
                    "total_personas": len(normalized_personas),
                    "filtered": True,
                    "evidence_quality": {"per_persona": per_persona},
                },
            )

            return {
                "status": "success",
                "result_id": result_id,
                "personas": validated_response.personas,
                "total_personas": len(normalized_personas),
                "design_thinking_optimized": True,
                "validation": "passed",
                "evidence_quality": validated_response.metadata.get("evidence_quality"),
            }
        except Exception as validation_error:
            logger.error(f"PersonaAPIResponse validation failed: {validation_error}")
            # Return unvalidated but log the issue
            return {
                "status": "success",
                "result_id": result_id,
                "personas": normalized_personas,
                "total_personas": len(normalized_personas),
                "design_thinking_optimized": True,
                "validation": "failed",
                "validation_error": str(validation_error),
            }

    except HTTPException:
        # Re-raise HTTP exceptions (like 404, 403)
        raise
    except Exception as e:
        logger.error(f"Error retrieving simplified personas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


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
    "/api/analyses",
    response_model=List[DetailedAnalysisResult],
    tags=["Analysis"],
    summary="List analyses",
    description="Retrieve a list of all analyses performed by the current user.",
)
async def list_analyses(
    request: Request,
    sortBy: Optional[str] = None,
    sortDirection: Optional[Literal["asc", "desc"]] = "desc",
    status: Optional[Literal["pending", "completed", "failed"]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves a list of analyses performed by the user.
    """
    try:
        # Add very detailed debug logging
        logger.info(f"list_analyses called - user_id: {current_user.user_id}")
        logger.info(
            f"Request parameters - sortBy: {sortBy}, sortDirection: {sortDirection}, status: {status}"
        )

        # Test database connection with detailed error handling
        try:
            db.execute(text("SELECT 1")).fetchone()
            logger.info("Database connection test successful")
        except Exception as db_error:
            logger.error(f"Database connection error: {str(db_error)}", exc_info=True)
            # Return a detailed JSONResponse with CORS headers
            from fastapi.responses import JSONResponse

            return JSONResponse(
                content={
                    "error": f"Database connection failed: {str(db_error)}",
                    "type": "database_error",
                },
                status_code=500,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                },
            )

        # Resolve ResultsService via DI container (central flag handling)
        from backend.api.dependencies import get_container

        container = get_container()
        factory = container.get_results_service()
        results_service = factory(db, current_user)

        # Get all analyses for the current user
        analyses = results_service.get_all_analyses(
            sort_by=sortBy, sort_direction=sortDirection, status=status
        )

        # Ensure CORS headers and consistent format
        from fastapi.responses import JSONResponse

        return JSONResponse(
            content=analyses,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            },
        )

    except Exception as e:
        logger.error(f"Error retrieving analyses: {str(e)}")
        # Return a detailed JSONResponse with CORS headers
        from fastapi.responses import JSONResponse

        return JSONResponse(
            content={
                "error": f"Internal server error: {str(e)}",
                "type": "server_error",
            },
            status_code=500,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
        )


# Add explicit OPTIONS handler for CORS preflight requests
@app.options("/api/analyses")
async def options_analyses():
    """Handle OPTIONS preflight request for analyses endpoint"""
    from fastapi.responses import JSONResponse

    return JSONResponse(
        content={"status": "ok"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Client-Origin, X-API-Version",
        },
    )


# Add the new endpoint for direct text-to-persona generation
@app.post(
    "/api/generate-persona",
    tags=["Analysis"],
    summary="Generate persona directly from text",
    description="Generate a persona directly from raw interview text without requiring full analysis.",
)
async def generate_persona_from_text(
    request: Request,
    persona_request: PersonaGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a persona directly from interview text.
    """
    try:
        # Use PersonaService to handle the persona generation
        from backend.services.persona_service import PersonaService

        persona_service = PersonaService(db, current_user)

        # Generate the persona
        result = await persona_service.generate_persona(
            text=persona_request.text,
            llm_provider=persona_request.llm_provider,
            llm_model=persona_request.llm_model,
            filename=persona_request.filename,
        )

        return result

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error generating persona: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


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
