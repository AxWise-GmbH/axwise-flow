"""
FastAPI application for handling interview data and analysis.
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from backend.services.external.auth_middleware import get_current_user
from typing import Dict, Any, List, Literal
import logging
import json
import asyncio
import os
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel, Field

from core.processing_pipeline import process_data
from services.llm import LLMServiceFactory
from services import get_nlp_processor
from services.nlp.processor import NLPProcessor
from backend.database import get_db, create_tables
from backend.models import User, InterviewData, AnalysisResult
from config import validate_config, LLM_CONFIG

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Define request models
class AnalysisRequest(BaseModel):
    """
    Request model for triggering data analysis.
    """
    data_id: int = Field(..., description="ID of the uploaded data to analyze")
    llm_provider: Literal["openai", "gemini"] = Field(
        ...,
        description="LLM provider to use for analysis"
    )
    llm_model: str | None = Field(
        default=None,
        description="Model to use for analysis. Uses 'gpt-4o-2024-08-06' for OpenAI or 'gemini-2.0-flash' for Google."
    )

    class Config:
        json_schema_extra = {
            "example": {
                "data_id": 1,
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06"
            }
        }

# Define response models
class UploadResponse(BaseModel):
    """
    Response model for data upload endpoint.
    """
    data_id: int
    message: str

class AnalysisResponse(BaseModel):
    """
    Response model for analysis endpoint.
    """
    result_id: int
    message: str

class ResultResponse(BaseModel):
    """
    Response model for results endpoint.
    """
    status: Literal["processing", "completed", "error"]
    result_id: int | None = None
    analysis_date: datetime | None = None
    results: Dict[str, Any] | None = None
    llm_provider: str | None = None
    llm_model: str | None = None
    error: str | None = None

class HealthCheckResponse(BaseModel):
    """
    Response model for health check endpoint.
    """
    status: str
    timestamp: datetime

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
    },
    components={
        "securitySchemes": {
            "bearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Enter your bearer token (any value for testing)",
            }
        }
    },
    security=[{"bearerAuth": []}]
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
        except json.JSONDecodeError:
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
            llm_provider=llm_provider,
            llm_model=llm_model
        )
        db.add(analysis_result)
        db.commit()
        db.refresh(analysis_result)

        result_id = analysis_result.result_id
        logger.info(f"Created analysis result record. Result ID: {result_id}")

        # Run analysis asynchronously
        async def run_analysis(result_id: int):
            try:
                results = await process_data(nlp_processor, llm_service, data)
                
                # Update analysis result with the actual results
                db_result = db.query(AnalysisResult).filter(
                    AnalysisResult.result_id == result_id
                ).first()
                if db_result:
                    db_result.results = results
                    db.commit()
                    logger.info(f"Analysis completed for result_id: {result_id}")
                    
                return results
            except Exception as e:
                logger.error(f"Error during analysis: {str(e)}")
                # Update analysis result with error status
                db_result = db.query(AnalysisResult).filter(
                    AnalysisResult.result_id == result_id
                ).first()
                if db_result:
                    db_result.results = {"error": str(e)}
                    db.commit()

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
                error=analysis_result.results["error"]
            )

        logger.info(f"Successfully retrieved results for result_id: {result_id}")
        return ResultResponse(
            status="completed",
            result_id=analysis_result.result_id,
            analysis_date=analysis_result.analysis_date,
            results=analysis_result.results,
            llm_provider=analysis_result.llm_provider,
            llm_model=analysis_result.llm_model
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
