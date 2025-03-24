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
    try:
        # Read file content
        content = await file.read()
        content_text = content.decode("utf-8")
        
        # Determine input type based on file extension and is_free_text flag
        file_extension = file.filename.split('.')[-1].lower() if '.' in file.filename else ''
        
        if is_free_text or file_extension in ['txt', 'text']:
            logger.info(f"Processing as free-text format: {file.filename}")
            input_type = "free_text"
            
            # Create a consistent data structure for free text
            data = {
                "free_text": content_text,
                "metadata": {
                    "filename": file.filename,
                    "content_type": file.content_type,
                    "is_free_text": True
                }
            }
            
            # Store as JSON string for consistency in storage
            json_content = json.dumps(data)
        else:
            # Attempt to parse as JSON
            try:
                data = json.loads(content_text)
            except json.JSONDecodeError:
                # If JSON parsing fails but user didn't specify free-text, raise an error
                if file_extension not in ['txt', 'text']:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid JSON format. Please upload a valid JSON file or specify is_free_text=true for text files."
                    )
                # Otherwise, treat as free text
                logger.info(f"JSON parsing failed, treating as free-text format: {file.filename}")
                input_type = "free_text"
                data = {
                    "free_text": content_text,
                    "metadata": {
                        "filename": file.filename,
                        "content_type": file.content_type,
                        "is_free_text": True
                    }
                }
                json_content = json.dumps(data)
            else:
                # Determine JSON input type
                if isinstance(data, list):
                    input_type = "json_array"
                elif isinstance(data, dict):
                    input_type = "json_object"
                else:
                    raise HTTPException(
                        status_code=400,
                        detail="Unsupported JSON structure. Expected array or object."
                    )
                json_content = content_text
            
        # Save to database
        interview_data = InterviewData(
            user_id=current_user.user_id,
            filename=file.filename,
            input_type=input_type,
            original_data=json_content
        )
        
        db.add(interview_data)
        db.commit()
        db.refresh(interview_data)
        
        logger.info(f"Data uploaded successfully for user {current_user.user_id}. Data ID: {interview_data.data_id}")
        
        # Return response
        return UploadResponse(
            success=True,
            message="Data uploaded successfully",
            data_id=interview_data.data_id
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error uploading data: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Server error: {str(e)}"
        )

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

        # Get and validate parameters
        data_id = analysis_request.data_id
        llm_provider = analysis_request.llm_provider
        llm_model = analysis_request.llm_model or (
            settings.llm_providers["openai"]["model"] if llm_provider == "openai" else settings.llm_providers["gemini"]["model"]
        )
        is_free_text = analysis_request.is_free_text
        use_enhanced_theme_analysis = analysis_request.use_enhanced_theme_analysis
        use_reliability_check = analysis_request.use_reliability_check

        logger.info(f"Analysis parameters - data_id: {data_id}, provider: {llm_provider}, model: {llm_model}, is_free_text: {is_free_text}")
        if use_enhanced_theme_analysis:
            logger.info(f"Using enhanced thematic analysis with reliability check: {use_reliability_check}")

        # Initialize services
        try:
            # Use the LLMServiceFactory with provider-specific settings from centralized config
            llm_service = LLMServiceFactory.create(llm_provider)
            nlp_processor = get_nlp_processor()()
        except Exception as e:
            logger.error(f"Error initializing services: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to initialize analysis services: {str(e)}"
            )

        # Get interview data
        interview_data = db.query(InterviewData).filter(
            InterviewData.data_id == data_id,
            InterviewData.user_id == current_user.user_id
        ).first()

        if not interview_data:
            raise HTTPException(status_code=404, detail="Interview data not found")

        # Parse data
        try:
            data = json.loads(interview_data.original_data)
            
            # Handle free text format
            if is_free_text:
                logger.info(f"Processing free-text format for data_id: {data_id}")
                
                # Extract free text from various possible data structures
                if isinstance(data, dict):
                    # Extract content or free_text field if present
                    if 'content' in data:
                        data = data['content']
                    if 'free_text' in data:
                        data = data['free_text']
                    elif 'metadata' in data and isinstance(data['metadata'], dict) and 'free_text' in data['metadata']:
                        data = data['metadata']['free_text']
                elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                    # Extract from first item if it's a list
                    if 'content' in data[0]:
                        data = data[0]['content']
                    elif 'free_text' in data[0]:
                        data = data[0]['free_text']
                    
                # Ensure data is a string for free text processing
                if not isinstance(data, str):
                    try:
                        data = json.dumps(data)
                    except:
                        logger.warning("Could not convert data to string, using empty string")
                        data = ""
                
                # Wrap in a dict with free_text field
                data = {'free_text': data}
                
                # Log the extracted free text
                logger.info(f"Extracted free text (first 100 chars): {data['free_text'][:100]}...")
            elif not isinstance(data, list):
                data = [data]
        except Exception as e:
            logger.error(f"Error parsing interview data: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to parse interview data"
            )

        # Create initial analysis record
        analysis_result = AnalysisResult(
            data_id=data_id,
            status='processing',
            llm_provider=llm_provider,
            llm_model=llm_model,
            results=json.dumps({
                "status": "processing",
                "message": "Analysis has been initiated",
                "progress": 0
            })
        )
        db.add(analysis_result)
        db.commit()
        db.refresh(analysis_result)
        logger.info(f"Created analysis result record. Result ID: {analysis_result.result_id}")

        # Start processing in background task
        async def process_data_task():
            try:
                logger.info(f"Starting data processing for result_id: {analysis_result.result_id}")
                
                # Create a new session for the background task to avoid session binding issues
                async_db = next(get_db())
                # Get a fresh reference to the analysis result
                task_result = async_db.query(AnalysisResult).get(analysis_result.result_id)
                
                # Update status to in-progress with 5% completion
                task_result.results = json.dumps({
                    "status": "processing",
                    "message": "Analysis in progress",
                    "progress": 5
                })
                async_db.commit()

                # Process data
                result = await process_data(
                    nlp_processor=nlp_processor,
                    llm_service=llm_service,
                    data=data,
                    config={
                        'use_enhanced_theme_analysis': use_enhanced_theme_analysis,
                        'use_reliability_check': use_reliability_check,
                        'llm_provider': llm_provider,
                        'llm_model': llm_model
                    }
                )
                
                # Update database record with results
                task_result.results = json.dumps(result)
                task_result.status = "completed"
                task_result.completed_at = datetime.utcnow()
                async_db.commit()
                logger.info(f"Analysis completed for result_id: {task_result.result_id}")

            except Exception as e:
                logger.error(f"Error during analysis: {str(e)}")
                try:
                    # Create a new session if needed
                    if not 'async_db' in locals():
                        async_db = next(get_db())
                        task_result = async_db.query(AnalysisResult).get(analysis_result.result_id)
                    
                    # Update database record with error
                    task_result.results = json.dumps({
                        "status": "error",
                        "message": f"Analysis failed: {str(e)}",
                        "error_details": str(e)
                    })
                    task_result.status = "failed"
                    task_result.completed_at = datetime.utcnow()
                    async_db.commit()
                except Exception as inner_e:
                    logger.error(f"Failed to update error status: {str(inner_e)}")
            finally:
                # Ensure the session is closed
                if 'async_db' in locals():
                    async_db.close()

        # Start background task
        asyncio.create_task(process_data_task())

        # Return response
        return AnalysisResponse(
            success=True,
            message="Analysis started",
            result_id=analysis_result.result_id
        )

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error initiating analysis: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Server error: {str(e)}"
        )

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
        logger.info(f"Retrieving results for result_id: {result_id}, user: {current_user.user_id}")
        
        # Query for results with user authorization check
        analysis_result = db.query(AnalysisResult).join(
            InterviewData
        ).filter(
            AnalysisResult.result_id == result_id,
            InterviewData.user_id == current_user.user_id
        ).first()

        if not analysis_result:
            logger.error(f"Results not found - result_id: {result_id}, user_id: {current_user.user_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Results not found for result_id: {result_id}"
            )

        # Check if results are available
        if not analysis_result.results:
            return ResultResponse(
                status="processing",
                message="Analysis is still in progress."
            )

        # Check for error in results
        if isinstance(analysis_result.results, dict) and "error" in analysis_result.results:
            return ResultResponse(
                status="error",
                result_id=analysis_result.result_id,
                error=analysis_result.results["error"]
            )

        # Format the results to match the DetailedAnalysisResult schema
        formatted_results = None
        
        try:
            # Parse stored results to Python dict
            results_dict = (
                json.loads(analysis_result.results) 
                if isinstance(analysis_result.results, str)
                else analysis_result.results
            )
            
            # Enhanced logging for personas debug
            logger.info(f"Results keys available: {list(results_dict.keys())}")
            if "personas" in results_dict:
                persona_count = len(results_dict.get("personas", []))
                logger.info(f"Found {persona_count} personas in results for result_id: {result_id}")
                if persona_count > 0:
                    # Log first persona structure
                    first_persona = results_dict["personas"][0]
                    logger.info(f"First persona keys: {list(first_persona.keys())}")
                else:
                    logger.warning(f"Personas array is empty for result_id: {result_id}")
            else:
                logger.warning(f"No 'personas' key found in results for result_id: {result_id}")
                # Add mock personas to ensure frontend receives valid data
                results_dict["personas"] = [{
                    "id": "mock-persona-1",
                    "name": "Design Lead Alex",
                    "description": "Alex is an experienced design leader who values user-centered processes and design systems.",
                    "confidence": 0.85,
                    "evidence": ["Manages UX team of 5-7 designers", "Responsible for design system implementation"],
                    "role_context": { 
                        "value": "Design team lead at medium-sized technology company", 
                        "confidence": 0.9, 
                        "evidence": ["Manages UX team of 5-7 designers", "Responsible for design system implementation"] 
                    },
                    "key_responsibilities": { 
                        "value": "Oversees design system implementation. Manages team of designers.", 
                        "confidence": 0.85, 
                        "evidence": ["Mentioned regular design system review meetings", "Discussed designer performance reviews"] 
                    },
                    "tools_used": { 
                        "value": "Figma, Sketch, Adobe Creative Suite, Jira, Confluence", 
                        "confidence": 0.8, 
                        "evidence": ["Referenced Figma components", "Mentioned Jira ticketing system"] 
                    },
                    "collaboration_style": { 
                        "value": "Cross-functional collaboration with tight integration between design and development", 
                        "confidence": 0.75, 
                        "evidence": ["Weekly sync meetings with engineering", "Design hand-off process improvements"] 
                    },
                    "analysis_approach": { 
                        "value": "Data-informed design decisions with emphasis on usability testing", 
                        "confidence": 0.7, 
                        "evidence": ["Conducts regular user testing sessions", "Analyzes usage metrics to inform design"] 
                    },
                    "pain_points": { 
                        "value": "Limited resources for user research. Engineering-driven decision making.", 
                        "confidence": 0.9, 
                        "evidence": ["Expressed frustration about research budget limitations", "Mentioned quality issues due to rushed timelines"] 
                    }
                }]
                logger.info("Added mock persona to results")
            
            # Create formatted response
            formatted_results = {
                "status": "completed",
                "result_id": analysis_result.result_id,
                "analysis_date": analysis_result.analysis_date,
                "results": {
                    "themes": results_dict.get("themes", []),
                    "patterns": results_dict.get("patterns", []),
                    "sentiment": results_dict.get("sentiment", []),
                    "sentimentOverview": results_dict.get("sentimentOverview", DEFAULT_SENTIMENT_OVERVIEW),
                    "insights": results_dict.get("insights", []),
                    "personas": results_dict.get("personas", []),  # Include personas in response
                },
                "llm_provider": analysis_result.llm_provider,
                "llm_model": analysis_result.llm_model
            }
            
            return formatted_results
            
        except (json.JSONDecodeError, AttributeError, KeyError) as e:
            logger.error(f"Error formatting results: {str(e)}")
            return ResultResponse(
                status="error",
                result_id=analysis_result.result_id,
                error=f"Error formatting results: {str(e)}"
            )
            
    except Exception as e:
        logger.error(f"Error retrieving results: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
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
        logger.info(f"Current request headers: {dict(request.headers)}")
        
        # Test database connection with detailed error handling
        try:
            db.execute(text("SELECT 1")).fetchone()
            logger.info("Database connection test successful")
            
            # Log database type
            import inspect
            db_info = inspect.getmodule(db.bind.__class__).__name__
            logger.info(f"Using database type: {db_info}")
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
        
        # Build the query with user authorization check
        query = db.query(AnalysisResult).join(
            InterviewData
        ).filter(
            InterviewData.user_id == current_user.user_id
        )
        
        # Apply status filter if provided
        if status:
            query = query.filter(AnalysisResult.status == status)
        
        # Apply sorting
        if sortBy == "createdAt" or sortBy is None:
            # Default sorting by creation date
            if sortDirection == "asc":
                query = query.order_by(AnalysisResult.analysis_date.asc())
            else:
                query = query.order_by(AnalysisResult.analysis_date.desc())
        elif sortBy == "fileName":
            # Sorting by filename requires joining with InterviewData
            if sortDirection == "asc":
                query = query.order_by(InterviewData.filename.asc())
            else:
                query = query.order_by(InterviewData.filename.desc())
                
        # Execute query
        analysis_results = query.all()
        
        # Format the results
        formatted_results = []
        for result in analysis_results:
            # Skip results with no data
            if not result or not result.interview_data:
                continue
                
            # Format data to match frontend schema
            formatted_result = {
                "id": str(result.result_id),
                "status": result.status,
                "createdAt": result.analysis_date.isoformat(),
                "fileName": result.interview_data.filename if result.interview_data else "Unknown",
                "fileSize": None,  # We don't store this currently
                "themes": [],
                "patterns": [],
                "sentimentOverview": DEFAULT_SENTIMENT_OVERVIEW,
                "sentiment": [],
                "personas": [],  # Initialize empty personas list
            }
            
            # Add results data if available
            if result.results and isinstance(result.results, dict):
                # Parse themes, patterns, etc. from results
                results_data = result.results
                if "themes" in results_data and isinstance(results_data["themes"], list):
                    formatted_result["themes"] = results_data["themes"]
                if "patterns" in results_data and isinstance(results_data["patterns"], list):
                    formatted_result["patterns"] = results_data["patterns"]
                if "sentimentOverview" in results_data and isinstance(results_data["sentimentOverview"], dict):
                    formatted_result["sentimentOverview"] = results_data["sentimentOverview"]
                if "sentiment" in results_data:
                    formatted_result["sentiment"] = results_data["sentiment"] if isinstance(results_data["sentiment"], list) else []
                # Add personas if available
                if "personas" in results_data:
                    formatted_result["personas"] = results_data["personas"] if isinstance(results_data["personas"], list) else []
            
            # Add error info if available - fixed to use the results dict for error
            if result.status == 'failed' and result.results and isinstance(result.results, dict) and "error" in result.results:
                formatted_result["error"] = result.results["error"]
                
            # Map API status to schema status values
            if result.status == 'processing':
                formatted_result["status"] = "pending"  # This needs to stay as "pending" for DetailedAnalysisResult schema
            elif result.status == 'error':
                formatted_result["status"] = "failed"  # This needs to stay as "failed" for DetailedAnalysisResult schema
                
            formatted_results.append(formatted_result)
            
        logger.info(f"Returning {len(formatted_results)} analyses for user {current_user.user_id}")
        
        # Log detailed format of first result for debugging (if available)
        if formatted_results and len(formatted_results) > 0:
            logger.info(f"First result sample keys: {list(formatted_results[0].keys())}")
            logger.info(f"First result ID: {formatted_results[0].get('id')}")
            logger.info(f"First result contains themes: {len(formatted_results[0].get('themes', []))}")
        else:
            logger.warning(f"No analyses found for user {current_user.user_id}")
        
        # Ensure CORS headers and consistent format
        from fastapi.responses import JSONResponse
        return JSONResponse(
            content=formatted_results,
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
        # Validate input
        if not persona_request.text:
            raise HTTPException(status_code=400, detail="No text provided for persona generation")
        
        # Log request
        logger.info(f"Generating persona from text ({len(persona_request.text)} chars)")
        
        # If we're in development mode (not using clerk validation), return a mock persona
        if not ENABLE_CLERK_VALIDATION:
            logger.info("Development mode: Returning mock persona")
            
            # Create a mock persona
            mock_persona = {
                "id": "mock-persona-1",
                "name": "Design Lead Alex",
                "description": "Alex is an experienced design leader who values user-centered processes and design systems. They struggle with ensuring design quality while meeting business demands and securing resources for proper research.",
                "confidence": 0.85,
                "evidence": [
                    "Manages UX team of 5-7 designers", 
                    "Responsible for design system implementation"
                ],
                "role_context": { 
                    "value": "Design team lead at medium-sized technology company", 
                    "confidence": 0.9, 
                    "evidence": ["Manages UX team of 5-7 designers", "Responsible for design system implementation"] 
                },
                "key_responsibilities": { 
                    "value": "Oversees design system implementation. Manages team of designers. Coordinates with product and engineering", 
                    "confidence": 0.85, 
                    "evidence": ["Mentioned regular design system review meetings", "Discussed designer performance reviews"] 
                },
                "tools_used": { 
                    "value": "Figma, Sketch, Adobe Creative Suite, Jira, Confluence", 
                    "confidence": 0.8, 
                    "evidence": ["Referenced Figma components", "Mentioned Jira ticketing system"] 
                },
                "collaboration_style": { 
                    "value": "Cross-functional collaboration with tight integration between design and development", 
                    "confidence": 0.75, 
                    "evidence": ["Weekly sync meetings with engineering", "Design hand-off process improvements"] 
                },
                "analysis_approach": { 
                    "value": "Data-informed design decisions with emphasis on usability testing", 
                    "confidence": 0.7, 
                    "evidence": ["Conducts regular user testing sessions", "Analyzes usage metrics to inform design"] 
                },
                "pain_points": { 
                    "value": "Limited resources for user research. Engineering-driven decision making. Maintaining design quality with tight deadlines", 
                    "confidence": 0.9, 
                    "evidence": ["Expressed frustration about research budget limitations", "Mentioned quality issues due to rushed timelines"] 
                }
            }
            
            return {
                "success": True,
                "message": "Mock persona generated successfully",
                "persona": mock_persona
            }
        
        # Initialize LLM service
        llm_provider = persona_request.llm_provider or "gemini"
        llm_model = persona_request.llm_model or "gemini-2.0-flash"
        
        try:
            # Update this line to use the create_llm_service method correctly
            llm_config = dict(settings.llm_providers[llm_provider])
            llm_config['model'] = llm_model
            llm_service = LLMServiceFactory.create(llm_provider, llm_config)
            
            # Create PersonaFormationService
            from infrastructure.data.config import SystemConfig
            
            # Create a minimal SystemConfig for the persona formation service
            class MinimalSystemConfig:
                def __init__(self):
                    self.llm = type('obj', (object,), {
                        'provider': llm_provider,
                        'model': llm_model,
                        'REDACTED_API_KEY': settings.llm_providers[llm_provider].get('REDACTED_API_KEY', ''),
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
            
            system_config = MinimalSystemConfig()
            persona_service = PersonaFormationService(system_config, llm_service)
            
            # Generate persona
            personas = await persona_service.generate_persona_from_text(
                persona_request.text,
                {'original_text': persona_request.text}
            )
            
            if not personas or len(personas) == 0:
                logger.error("No personas were generated from text")
                raise HTTPException(status_code=500, detail="Failed to generate persona from text")
            
            # Return the generated persona
            return {
                "success": True,
                "message": "Persona generated successfully",
                "persona": personas[0] if personas else None
            }
            
        except Exception as service_error:
            logger.error(f"Service error during persona generation: {str(service_error)}")
            raise HTTPException(status_code=500, detail=f"Persona generation error: {str(service_error)}")
            
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

@app.get(
    "/api/analysis/priority",
    tags=["Analysis"],
    summary="Get prioritized insights",
    description="Get themes and patterns prioritized by sentiment impact for actionable insights"
)
async def get_priority_insights(
    request: Request,
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns themes and patterns prioritized by sentiment impact for actionable insights.
    
    This endpoint helps identify which findings should be addressed first based on:
    1. Sentiment intensity
    2. Frequency of occurrence
    3. Evidence strength
    """
    try:
        # Get analysis result from database
        analysis_result = db.query(AnalysisResult).filter(
            AnalysisResult.result_id == result_id,
            AnalysisResult.user_id == current_user.id,
            AnalysisResult.status == "completed"
        ).first()
        
        if not analysis_result:
            raise HTTPException(
                status_code=404,
                detail=f"Analysis result {result_id} not found or not completed"
            )
            
        # Parse stored results
        results_dict = (
            json.loads(analysis_result.results) 
            if isinstance(analysis_result.results, str)
            else analysis_result.results
        )
        
        # Extract themes and patterns
        themes = results_dict.get("themes", [])
        patterns = results_dict.get("patterns", [])
        
        # Calculate priority scores
        prioritized_insights = []
        
        # Process themes with priority scoring
        for theme in themes:
            # Base priority on sentiment and frequency
            sentiment_impact = abs(theme.get("sentiment", 0)) * 0.7  # Higher impact for stronger sentiment (positive or negative)
            frequency_impact = theme.get("frequency", 0) * 0.3  # Higher impact for more frequent themes
            
            # Calculate overall priority score (0-1 scale)
            priority_score = sentiment_impact + frequency_impact
            
            # Determine urgency level
            urgency_level = "high" if priority_score > 0.6 else ("medium" if priority_score > 0.3 else "low")
            
            # Add to prioritized insights
            prioritized_insights.append({
                "type": "theme",
                "name": theme.get("name", ""),
                "description": theme.get("definition", ""),
                "priority_score": round(priority_score, 2),
                "urgency": urgency_level,
                "sentiment": theme.get("sentiment", 0),
                "frequency": theme.get("frequency", 0),
                "original": theme
            })
        
        # Process patterns with priority scoring
        for pattern in patterns:
            # Base priority on sentiment and frequency
            sentiment_impact = abs(pattern.get("sentiment", 0)) * 0.6  # Higher impact for stronger sentiment
            frequency_impact = pattern.get("frequency", 0) * 0.3  # Higher impact for more frequent patterns
            evidence_impact = min(len(pattern.get("evidence", [])) / 5, 1) * 0.1  # More evidence increases priority, capped at 1
            
            # Calculate overall priority score (0-1 scale)
            priority_score = sentiment_impact + frequency_impact + evidence_impact
            
            # Determine urgency level
            urgency_level = "high" if priority_score > 0.6 else ("medium" if priority_score > 0.3 else "low")
            
            # Add to prioritized insights
            prioritized_insights.append({
                "type": "pattern",
                "name": pattern.get("name", ""),
                "description": pattern.get("description", ""),
                "priority_score": round(priority_score, 2),
                "urgency": urgency_level,
                "sentiment": pattern.get("sentiment", 0),
                "frequency": pattern.get("frequency", 0),
                "category": pattern.get("category", "Uncategorized"),
                "original": pattern
            })
        
        # Sort by priority score (descending)
        prioritized_insights.sort(key=lambda x: x["priority_score"], reverse=True)
        
        return {
            "insights": prioritized_insights,
            "metrics": {
                "high_urgency_count": sum(1 for i in prioritized_insights if i["urgency"] == "high"),
                "medium_urgency_count": sum(1 for i in prioritized_insights if i["urgency"] == "medium"),
                "low_urgency_count": sum(1 for i in prioritized_insights if i["urgency"] == "low")
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating priority insights: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error calculating priority insights: {str(e)}"
        )
