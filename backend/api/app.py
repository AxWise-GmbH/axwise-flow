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
    description="Upload interview data in JSON format for analysis."
)
async def upload_data(
    request: Request,
    file: UploadFile = File(description="JSON file containing interview data"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Handles interview data upload (JSON format only in Phase 1/2).
    """
    try:
        # Validate file type
        if file.content_type != "application/json":
            raise HTTPException(
                status_code=400, 
                detail="Invalid file type. Must be JSON."
            )

        # Read and decode file content
        data = await file.read()
        if isinstance(data, bytes):
            data = data.decode()

        # Validate JSON format
        try:
            json.loads(data)  # Just to validate JSON format
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400, 
                detail="Invalid JSON format in uploaded file."
            )

        # Create interview data record
        try:
            interview_data = InterviewData(
                user_id=current_user.user_id,
                input_type="json",
                original_data=data,
                filename=file.filename
            )
            db.add(interview_data)
            db.commit()
            db.refresh(interview_data)
        except Exception as db_error:
            logger.error(f"Database error: {str(db_error)}")
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error: {str(db_error)}"
            )

        data_id = interview_data.data_id
        logger.info(f"Data uploaded successfully for user {current_user.user_id}. Data ID: {data_id}")

        return UploadResponse(
            data_id=data_id,
            message=f"Data uploaded successfully. Use data_id: {data_id} for analysis."
        )

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error uploading data: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

@app.post(
    "/api/analyze",
    response_model=AnalysisResponse,
    tags=["Analysis"],
    summary="Trigger data analysis",
    description="Trigger analysis of previously uploaded interview data."
)
async def analyze_data(
    request: Request,
    analysis_request: AnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers analysis of uploaded data.
    """
    try:
        # Validate configuration
        validate_config()

        # Get required parameters
        data_id = analysis_request.data_id
        llm_provider = analysis_request.llm_provider
        llm_model = analysis_request.llm_model or (
            "gpt-4o-2024-08-06" if llm_provider == "openai" else "gemini-2.0-flash"
        )

        logger.info(f"Analysis parameters - data_id: {data_id}, provider: {llm_provider}, model: {llm_model}")

        # Validate model name
        if llm_provider == "openai" and llm_model != "gpt-4o-2024-08-06":
            raise HTTPException(
                status_code=400,
                detail="Invalid model name for OpenAI. Use 'gpt-4o-2024-08-06'"
            )
        elif llm_provider == "gemini" and llm_model != "gemini-2.0-flash":
            raise HTTPException(
                status_code=400,
                detail="Invalid model name for Google. Use 'gemini-2.0-flash'"
            )

        # Retrieve interview data
        interview_data = db.query(InterviewData).filter(
            InterviewData.data_id == data_id,
            InterviewData.user_id == current_user.user_id
        ).first()

        if not interview_data:
            logger.error(f"Interview data not found - data_id: {data_id}, user_id: {current_user.user_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Interview data not found for data_id: {data_id}. Make sure you're using the correct data_id from the upload response."
            )

        # Parse the stored JSON data
        try:
            data = json.loads(interview_data.original_data)
            # Ensure data is a list of dictionaries
            if not isinstance(data, list):
                data = [data]  # Wrap single object in list
            for item in data:
                if not isinstance(item, dict):
                    raise ValueError("Data must be a list of dictionaries")
        except json.JSONDecodeError as je:
            logger.error(f"JSON decode error: {str(je)}")
            raise HTTPException(
                status_code=500, 
                detail="Stored data is not valid JSON."
            )

        # Initialize services
        llm_service = LLMServiceFactory.create(
            llm_provider, 
            LLM_CONFIG[llm_provider]
        )
        nlp_processor = get_nlp_processor()()

        # Create analysis result record
        analysis_result = AnalysisResult(
            data_id=data_id,
            status='processing',
            llm_provider=llm_provider,
            llm_model=llm_model
        )
        try:
            db.add(analysis_result)
            db.commit()
            db.refresh(analysis_result)
            result_id = analysis_result.result_id
            logger.info(f"Created analysis result record. Result ID: {result_id}")
        except Exception as db_error:
            logger.error(f"Database error creating analysis result: {str(db_error)}")
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error: {str(db_error)}"
            )

        # Run analysis asynchronously
        async def run_analysis(result_id: int):
            try:
                # Create a new session for this async task
                from backend.database import SessionLocal
                task_db = SessionLocal()
                
                results = await process_data(nlp_processor, llm_service, data)
                
                # Now do the detailed transformations here, after the initial processing
                if results:
                    # Process patterns
                    for pattern in results.get("patterns", []):
                        if isinstance(pattern, dict):
                            if "type" in pattern and "category" not in pattern:
                                pattern["category"] = pattern["type"]
                            if "frequency" in pattern and isinstance(pattern["frequency"], str):
                                try:
                                    pattern["frequency"] = float(pattern["frequency"])
                                except ValueError:
                                    pattern["frequency"] = 0.5
                            if "sentiment" in pattern:
                                pattern["sentiment"] = (pattern["sentiment"] - 0.5) * 2
                            if "evidence" not in pattern:
                                pattern["evidence"] = pattern.get("examples", [])

                    # Process themes
                    for theme in results.get("themes", []):
                        if isinstance(theme, dict):
                            if "sentiment" in theme:
                                theme["sentiment"] = (theme["sentiment"] - 0.5) * 2
                            if "statements" not in theme:
                                theme["statements"] = theme.get("examples", [])

                    # Process sentiment
                    if "sentiment" in results and isinstance(results["sentiment"], dict):
                        sentiment_data = results["sentiment"]
                        results["sentimentOverview"] = sentiment_data.get("breakdown", DEFAULT_SENTIMENT_OVERVIEW)
                        # Store supporting statements separately to match frontend schema
                        results["sentimentStatements"] = sentiment_data.get("supporting_statements", {
                            "positive": [], 
                            "neutral": [], 
                            "negative": []
                        })
                        if "overall" in sentiment_data:
                            sentiment_data["overall"] = (sentiment_data["overall"] - 0.5) * 2
                        # Extract details for sentiment timeline
                        results["sentiment"] = sentiment_data.get("details", [])
                
                # Update analysis result with the actual results
                db_result = task_db.query(AnalysisResult).filter(
                    AnalysisResult.result_id == result_id,
                    AnalysisResult.status != 'failed'  # Only update if not failed
                ).first()
                if db_result:
                    db_result.results = results
                    db_result.status = 'completed'
                    db_result.completed_at = datetime.utcnow()
                    task_db.commit()  # Use synchronous commit
                    logger.info(f"Analysis completed for result_id: {result_id}")
                
                # Close the session
                task_db.close()
                    
                return results
            except Exception as e:
                logger.error(f"Error during analysis: {str(e)}")
                if result_id:
                    # Update result status to error
                    task_db = next(get_db())
                    result = task_db.query(AnalysisResult).filter(AnalysisResult.result_id == result_id).first()
                    if result:
                        result.status = "error"
                        result.error_message = str(e)
                        task_db.commit()
            finally:
                if 'task_db' in locals() and task_db:
                    try:
                        task_db.close()
                    except:
                        pass
            
        # Start the analysis task
        asyncio.create_task(run_analysis(result_id))

        return AnalysisResponse(
            result_id=result_id,
            message=f"Analysis started. Use result_id: {result_id} to check results."
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error triggering analysis: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
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
        if analysis_result.results:
            try:
                # Ensure results have the expected structure
                results = analysis_result.results

                # If results is a string (e.g., JSON string), try to parse it
                if isinstance(results, str):
                    try:
                        results = json.loads(results)
                    except json.JSONDecodeError:
                        # If it's not valid JSON, use as is
                        pass

                # Format into the expected structure
                results = transform_analysis_results(results)
                
                formatted_results = {
                    "id": str(analysis_result.result_id),
                    "status": "completed",
                    "createdAt": analysis_result.analysis_date.isoformat(),
                    "fileName": getattr(analysis_result.interview_data, 'filename', 'Unknown'),
                    "fileSize": None,  # We don't store this currently
                    "themes": results.get("themes", []),
                    "patterns": results.get("patterns", []),
                    "sentimentOverview": results.get("sentimentOverview", DEFAULT_SENTIMENT_OVERVIEW),
                    "sentiment": results.get("sentiment", []),
                    "sentimentStatements": results.get("sentimentStatements",  {
                        "positive": [],
                        "neutral": [],
                        "negative": []
                    })
                }
                
                # Validate against the schema
                DetailedAnalysisResult(**formatted_results)
                
            except Exception as e:
                logger.warning(f"Error formatting results: {str(e)}")
                # Fall back to the raw results if formatting fails
                formatted_results = analysis_result.results

        logger.info(f"Successfully retrieved results for result_id: {result_id}")
        return ResultResponse(
            status="completed",
            result_id=analysis_result.result_id,
            analysis_date=analysis_result.analysis_date,
            results=formatted_results,
            llm_provider=analysis_result.llm_provider,
        )

    except HTTPException as he:
        raise he
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
    Lists all analyses performed by the current user.
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
            
            # Add error info if available
            if result.status == "failed" and result.error_message:
                formatted_result["error"] = result.error_message
                
            formatted_results.append(formatted_result)
            
        logger.info(f"Retrieved {len(formatted_results)} analyses for user {current_user.user_id}")
        return formatted_results
            
    except Exception as e:
        logger.error(f"Error retrieving analyses: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
