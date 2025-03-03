"""
FastAPI application for handling interview data and analysis.
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

from backend.schemas import (
    AnalysisRequest, UploadResponse, AnalysisResponse,
    ResultResponse, HealthCheckResponse, DetailedAnalysisResult
)

from backend.core.processing_pipeline import process_data
from backend.services.llm import LLMServiceFactory
from backend.services.nlp import get_nlp_processor
from backend.database import get_db, create_tables
from backend.models import User, InterviewData, AnalysisResult
from backend.config import validate_config, LLM_CONFIG

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

# Get CORS settings from environment or use defaults
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")
CORS_METHODS = os.getenv("CORS_METHODS", "GET,POST,PUT,DELETE,OPTIONS").split(",")
CORS_HEADERS = os.getenv("CORS_HEADERS", "*").split(",")

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
            validate_config()
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
            "gpt-4o-2024-08-06" if llm_provider == "openai" else "gemini-2.0-flash"
        )
        is_free_text = analysis_request.is_free_text

        logger.info(f"Analysis parameters - data_id: {data_id}, provider: {llm_provider}, model: {llm_model}, is_free_text: {is_free_text}")

        # Initialize services
        try:
            llm_service = LLMServiceFactory.create(llm_provider, LLM_CONFIG[llm_provider])
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
                    data=data
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
            
        logger.info(f"Retrieved {len(formatted_results)} analyses for user {current_user.user_id}")
        return formatted_results
            
    except Exception as e:
        logger.error(f"Error retrieving analyses: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
