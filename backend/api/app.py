"""
FastAPI application for handling interview data and analysis.

Last Updated: 2025-03-24
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
import sys
import os

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
import time # Import time module
from sqlalchemy.orm import Session
from datetime import datetime
from sqlalchemy.sql import text

# Import centralized settings
from infrastructure.config.settings import settings

from backend.schemas import (
    AnalysisRequest, UploadResponse, AnalysisResponse,
    ResultResponse, HealthCheckResponse, DetailedAnalysisResult, PersonaGenerationRequest
)

from backend.core.processing_pipeline import process_data
from backend.services.llm import LLMServiceFactory
from backend.services.nlp import get_nlp_processor
from backend.database import get_db, create_tables
from backend.models import User, InterviewData, AnalysisResult
from backend.config import validate_config
from backend.services.processing.persona_formation import PersonaFormationService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import API routers
from backend.api.endpoints.priority_insights import router as priority_insights_router

DEFAULT_SENTIMENT_OVERVIEW = {
    "positive": 0.33,
    "neutral": 0.34,
    "negative": 0.33
}

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
    - Google: gemini-2.0-flash
    
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
        }
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

# Include routers
app.include_router(priority_insights_router, prefix="/api/analysis")

# Initialize database tables
create_tables()

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
                self.llm = type('obj', (object,), {
                    'provider': "gemini",
                    'model': "gemini-2.0-flash",
                    'REDACTED_API_KEY': settings.llm_providers["gemini"].get('REDACTED_API_KEY', ''),
                    'temperature': 0.3,
                    'max_tokens': 2000
                })
                self.processing = type('obj', (object,), {
                    'batch_size': 10,
                    'max_tokens': 2000
                })
                self.validation = type('obj', (object,), {
                    'min_confidence': 0.4
                })
        
        # Create LLM service using centralized settings
        llm_service = LLMServiceFactory.create("gemini")
        
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
    description="Upload interview data in JSON format or free-text format for analysis."
)
async def upload_data(
    request: Request,
    file: UploadFile = File(description="JSON file or text file containing interview data"),
    is_free_text: bool = Form(False, description="Whether the file contains free-text format (not JSON)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Handles interview data upload (JSON format or free-text format).
    """
    start_time = time.time()
    logger.info(f"[UploadData - Start] User: {current_user.user_id}, Filename: {file.filename}, Size: {getattr(file, 'size', 'N/A')}, IsFreeText: {is_free_text}") # Added size logging
    try:
        # Use DataService to handle upload logic
        from backend.services.data_service import DataService
        data_service = DataService(db, current_user)
        
        # Process the upload
        result = await data_service.upload_interview_data(file, is_free_text)
        
        # Return UploadResponse
        return UploadResponse(
            success=result["success"],
            message=result["message"],
            data_id=result["data_id"]
        )
        
    except HTTPException:
        logger.warning(f"[UploadData - HTTPException] User: {current_user.user_id}, Filename: {file.filename}, Duration: {time.time() - start_time:.4f}s")
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error uploading data: {str(e)}")
        logger.error(f"[UploadData - Error] User: {current_user.user_id}, Filename: {file.filename}, Duration: {time.time() - start_time:.4f}s")
        raise HTTPException(
            status_code=500,
            detail=f"Server error: {str(e)}"
        )
    finally:
        duration = time.time() - start_time
        logger.info(f"[UploadData - End] User: {current_user.user_id}, Filename: {file.filename}, Duration: {duration:.4f}s")

@app.post(
    "/api/analyze",
    response_model=AnalysisResponse,
    tags=["Analysis"],
    summary="Analyze uploaded data",
    description="Trigger analysis of previously uploaded data using the specified LLM provider."
)
async def analyze_data(
    request: Request,
    analysis_request: AnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Triggers analysis of uploaded data."""
    start_time = time.time()
    logger.info(f"[AnalyzeData - Start] User: {current_user.user_id}, DataID: {analysis_request.data_id}, Provider: {analysis_request.llm_provider}")
    try:
        # Validate configuration
        try:
            # Only validate the configuration for the provider we're using
            validate_config(analysis_request.llm_provider)
        except Exception as e:
            logger.error(f"Configuration validation error: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"LLM configuration error: {str(e)}"
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
            use_enhanced_theme_analysis=analysis_request.use_enhanced_theme_analysis,
            use_reliability_check=analysis_request.use_reliability_check
        )
        
        # Return response
        return AnalysisResponse(
            success=result["success"],
            message=result["message"],
            result_id=result["result_id"]
        )

    except HTTPException:
        logger.warning(f"[AnalyzeData - HTTPException] User: {current_user.user_id}, DataID: {analysis_request.data_id}, Duration: {time.time() - start_time:.4f}s")
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error initiating analysis: {str(e)}")
        logger.error(f"[AnalyzeData - Error] User: {current_user.user_id}, DataID: {analysis_request.data_id}, Duration: {time.time() - start_time:.4f}s")
        raise HTTPException(
            status_code=500,
            detail=f"Server error: {str(e)}"
        )
    finally:
        duration = time.time() - start_time
        logger.info(f"[AnalyzeData - End] User: {current_user.user_id}, DataID: {analysis_request.data_id}, Duration: {duration:.4f}s")

@app.get(
    "/api/results/{result_id}",
    response_model=ResultResponse,
    tags=["Analysis"],
    summary="Get analysis results",
    description="Retrieve the results of a previously triggered analysis."
)
async def get_results(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves analysis results.
    """
    try:
        # Use ResultsService to handle fetching and formatting the results
        from backend.services.results_service import ResultsService
        results_service = ResultsService(db, current_user)
        
        # Get formatted results
        result = results_service.get_analysis_result(result_id)
        
        return result
            
    except Exception as e:
        logger.error(f"Error retrieving results: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@app.get(
    "/api/analysis/{result_id}/status",
    response_model=Dict[str, Any], # Define a more specific schema later if needed
    tags=["Analysis"],
    summary="Get analysis status",
    description="Check the current status (processing, completed, failed) of an analysis."
)
async def get_analysis_status(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves the current status of an analysis.
    """
    logger.info(f"[GetStatus - Start] User: {current_user.user_id}, ResultID: {result_id}")
    try:
        analysis_result = db.query(AnalysisResult).filter(
            AnalysisResult.result_id == result_id,
            AnalysisResult.user_id == current_user.user_id # Ensure user owns the result
        ).first()

        if not analysis_result:
            logger.warning(f"[GetStatus - NotFound] User: {current_user.user_id}, ResultID: {result_id}")
            raise HTTPException(status_code=404, detail="Analysis result not found")

        status = analysis_result.status
        error_message = None

        if status == "failed":
            try:
                # Attempt to parse the results JSON to find an error message
                results_data = json.loads(analysis_result.results or '{}')
                error_message = results_data.get("error_details") or results_data.get("message") or "Analysis failed with an unspecified error."
            except json.JSONDecodeError:
                error_message = "Analysis failed, and error details could not be parsed."
            except Exception:
                 error_message = "Analysis failed with an unknown error structure."

        logger.info(f"[GetStatus - Success] User: {current_user.user_id}, ResultID: {result_id}, Status: {status}")
        response_data = {"status": status}
        if error_message:
            response_data["error"] = error_message
        return response_data

    except HTTPException:
        # Re-raise HTTP exceptions directly
        raise
    except Exception as e:
        logger.error(f"[GetStatus - Error] User: {current_user.user_id}, ResultID: {result_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error checking status: {str(e)}"
        )


@app.get(
    "/health",
    response_model=HealthCheckResponse,
    tags=["System"],
    summary="Health check",
    description="Simple health check endpoint to verify the API is running.",
    include_in_schema=True
)
async def health_check():
    """
    Simple health check endpoint.
    """
    return HealthCheckResponse(
        status="healthy",
        timestamp=datetime.utcnow()
    )

@app.get(
    "/api/analyses",
    response_model=List[DetailedAnalysisResult],
    tags=["Analysis"],
    summary="List analyses",
    description="Retrieve a list of all analyses performed by the current user."
)
async def list_analyses(
    request: Request,
    sortBy: Optional[str] = None,
    sortDirection: Optional[Literal["asc", "desc"]] = "desc",
    status: Optional[Literal["pending", "completed", "failed"]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves a list of analyses performed by the user.
    """
    try:
        # Add very detailed debug logging
        logger.info(f"list_analyses called - user_id: {current_user.user_id}")
        logger.info(f"Request parameters - sortBy: {sortBy}, sortDirection: {sortDirection}, status: {status}")
        
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
                    "type": "database_error"
                },
                status_code=500,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization"
                }
            )
        
        # Use ResultsService to handle fetching and formatting the results
        from backend.services.results_service import ResultsService
        results_service = ResultsService(db, current_user)
        
        # Get all analyses for the current user
        analyses = results_service.get_all_analyses(
            sort_by=sortBy,
            sort_direction=sortDirection,
            status=status
        )
        
        # Ensure CORS headers and consistent format
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content=analyses,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With"
            }
        )
            
    except Exception as e:
        logger.error(f"Error retrieving analyses: {str(e)}")
        # Return a detailed JSONResponse with CORS headers
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content={
                "error": f"Internal server error: {str(e)}",
                "type": "server_error"
            },
            status_code=500,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization"
            }
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
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Client-Origin, X-API-Version"
        }
    )

# Add the new endpoint for direct text-to-persona generation
@app.post(
    "/api/generate-persona",
    tags=["Analysis"],
    summary="Generate persona directly from text",
    description="Generate a persona directly from raw interview text without requiring full analysis."
)
async def generate_persona_from_text(
    request: Request,
    persona_request: PersonaGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
            llm_model=persona_request.llm_model
        )
        
        return result
            
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error generating persona: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Server error: {str(e)}"
        )

@app.get(
    "/api/health",
    tags=["System"],
    summary="Detailed health check",
    description="Detailed health check endpoint that returns information about the server, database connection, and user count."
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
            if str(db.bind.url).startswith('sqlite'):
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
            "REDACTED_DATABASE_URL_TYPE": str(db.bind.url).split("://")[0] if db_status == "connected" else "unknown"
        }
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "database": {
                "status": db_status,
                "error": db_error,
                "info": db_info,
                "counts": {
                    "users": user_count,
                    "analyses": analysis_count
                }
            },
            "environment": env_info,
            "server_id": "DesignAId-API-v2"
        }
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

# Priority insights endpoint moved to dedicated router module in backend/api/endpoints/priority_insights.py
