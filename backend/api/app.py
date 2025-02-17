"""
FastAPI application for handling interview data and analysis.
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Depends, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Dict, Any, List, Literal
import logging
import json
import asyncio
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
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define security scheme
security = HTTPBearer()

# Define request models
class UserInfo(BaseModel):
    user_id: str
    email: str | None = None

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "test_user_123",
                "email": "test@example.com"
            }
        }

class AnalysisRequest(BaseModel):
    data_id: int
    llm_provider: Literal["openai", "gemini"] = Field(
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

# Initialize FastAPI with security scheme
app = FastAPI(
    title="Interview Analysis API",
    description="""
    API for interview data analysis.
    
    Available LLM providers and models:
    - OpenAI: gpt-4o-2024-08-06
    - Google: gemini-2.0-flash
    """,
    version="1.0.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
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

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Initialize database tables
create_tables()

@app.post("/api/data")
async def upload_data(
    request: Request,
    user_info: str = Form(description="User information in JSON format. Example: {\"user_id\": \"test_user_123\", \"email\": \"test@example.com\"}"),
    file: UploadFile = File(description="JSON file containing interview data"),
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Handles interview data upload (JSON format only in Phase 1).
    """
    try:
        try:
            user_info_dict = json.loads(user_info)
            logger.info(f"Received user_info: {user_info_dict}")
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400,
                detail="Invalid user_info format. Must be a valid JSON string."
            )

        user_id = user_info_dict.get('user_id')
        if not user_id:
            raise HTTPException(
                status_code=400,
                detail="user_id is required in user_info"
            )

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

        # Ensure user exists in database
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            user = User(
                user_id=user_id,
                email=user_info_dict.get('email')
            )
            db.add(user)
            db.commit()
            logger.info(f"Created new user: {user_id}")

        # Create interview data record
        interview_data = InterviewData(
            user_id=user_id,
            input_type="json",
            original_data=data,
            filename=file.filename
        )
        db.add(interview_data)
        db.commit()
        db.refresh(interview_data)

        data_id = interview_data.data_id
        logger.info(f"Data uploaded successfully for user {user_id}. Data ID: {data_id}")

        return {
            "data_id": data_id,
            "message": f"Data uploaded successfully. Use data_id: {data_id} for analysis."
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error uploading data: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

@app.post("/api/analyze")
async def analyze_data(
    request: Request,
    analysis_request: AnalysisRequest,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Triggers analysis of uploaded data.
    """
    try:
        # For testing, we'll use test_user_123 as the user_id
        user_id = "test_user_123"
        logger.info(f"Starting analysis for user: {user_id}")

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
            InterviewData.user_id == user_id
        ).first()

        if not interview_data:
            logger.error(f"Interview data not found - data_id: {data_id}, user_id: {user_id}")
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

        return {
            "result_id": result_id,
            "message": f"Analysis started. Use result_id: {result_id} to check results."
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error triggering analysis: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

@app.get("/api/results/{result_id}")
async def get_results(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Retrieves analysis results.
    """
    try:
        # For testing, we'll use test_user_123 as the user_id
        user_id = "test_user_123"
        logger.info(f"Fetching results for result_id: {result_id}, user: {user_id}")

        # Query for results with user authorization check
        analysis_result = db.query(AnalysisResult).join(
            InterviewData
        ).filter(
            AnalysisResult.result_id == result_id,
            InterviewData.user_id == user_id
        ).first()

        if not analysis_result:
            logger.error(f"Results not found - result_id: {result_id}, user_id: {user_id}")
            raise HTTPException(
                status_code=404,
                detail=f"Results not found for result_id: {result_id}"
            )

        # Check if results are available
        if not analysis_result.results:
            return {
                "status": "processing",
                "message": "Analysis is still in progress."
            }

        # Check for error in results
        if isinstance(analysis_result.results, dict) and "error" in analysis_result.results:
            return {
                "status": "error",
                "error": analysis_result.results["error"]
            }

        logger.info(f"Successfully retrieved results for result_id: {result_id}")
        return {
            "status": "completed",
            "result_id": analysis_result.result_id,
            "analysis_date": analysis_result.analysis_date,
            "results": analysis_result.results,
            "llm_provider": analysis_result.llm_provider,
            "llm_model": analysis_result.llm_model
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error retrieving results: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

# Health check endpoint (unprotected)
@app.get("/health")
async def health_check():
    """
    Simple health check endpoint.
    """
    return {"status": "healthy", "timestamp": datetime.utcnow()}