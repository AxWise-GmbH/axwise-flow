"""
FastAPI application for handling interview data and analysis.
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, Depends, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
import sys
import os
import logging
import json
import asyncio
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict, Any, List, Literal

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
from backend.utils.sentiment_utils import process_sentiment_data
from backend.services.analysis.analysis_processor import AnalysisProcessor

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
        
    if "sentiment" not in transformed or not isinstance(transformed["sentiment"], list):
        transformed["sentiment"] = []
        
    if "sentimentOverview" not in transformed:
        transformed["sentimentOverview"] = DEFAULT_SENTIMENT_OVERVIEW
        
    return transformed

# Initialize FastAPI
app = FastAPI(
    title="Interview Analysis API",
    description="API for interview data analysis.",
    version="2.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database tables
create_tables()

@app.post("/api/analyze")
async def analyze_data(
    request: Request,
    analysis_request: AnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Triggers analysis of uploaded data."""
    try:
        # Validate configuration
        validate_config()

        # Get and validate parameters
        data_id = analysis_request.data_id
        llm_provider = analysis_request.llm_provider
        llm_model = analysis_request.llm_model or (
            "gpt-4o-2024-08-06" if llm_provider == "openai" else "gemini-2.0-flash"
        )
        is_free_text = analysis_request.is_free_text

        # Initialize services
        llm_service = LLMServiceFactory.create(llm_provider, LLM_CONFIG[llm_provider])
        nlp_processor = get_nlp_processor()()

        # Get interview data
        interview_data = db.query(InterviewData).filter(
            InterviewData.data_id == data_id,
            InterviewData.user_id == current_user.user_id
        ).first()

        if not interview_data:
            raise HTTPException(status_code=404, detail="Interview data not found")

        # Parse data
        data = json.loads(interview_data.original_data)
        
        # Handle free text format
        if is_free_text:
            logger.info(f"Processing free-text format for data_id: {data_id}")
            # For free text, we expect data to be a string or have a free_text field
            
            # If data comes from the database as a dict with nested structure
            if isinstance(data, dict):
                # Extract content field if present
                if 'content' in data:
                    data = data['content']
                # Extract free_text field if present
                if 'free_text' in data:
                    data = data['free_text']
                # Extract metadata if present
                elif 'metadata' in data and isinstance(data['metadata'], dict) and 'free_text' in data['metadata']:
                    data = data['metadata']['free_text']
            # If data is a list with a single dict item
            elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                # Extract content field if present
                if 'content' in data[0]:
                    data = data[0]['content']
                # Extract free_text field if present
                elif 'free_text' in data[0]:
                    data = data[0]['free_text']
                
            # Ensure data is a string for free text processing
            if not isinstance(data, str):
                # Try to convert to string if it's not already
                try:
                    data = json.dumps(data)
                except:
                    # If conversion fails, use empty string as fallback
                    logger.warning(f"Could not convert free text data to string, using empty string")
                    data = ""
            
            # For free text format, wrap in a dict with free_text field
            data = {'free_text': data}
            
            # Log the extracted data
            logger.info(f"Extracted free text data: {data['free_text'][:100]}...")
        elif not isinstance(data, list):
            data = [data]  # Maintain existing behavior for JSON format

        # Create initial analysis record
        analysis_result = AnalysisResult(
            data_id=data_id,
            status='processing',
            llm_provider=llm_provider,
            llm_model=llm_model
        )
        db.add(analysis_result)
        db.commit()
        db.refresh(analysis_result)
        result_id = analysis_result.result_id

        # Define async analysis function
        async def run_analysis(result_id: int):
            processor = None
            try:
                # Create session and processor
                from backend.database import SessionLocal
                task_db = SessionLocal()
                processor = AnalysisProcessor(task_db)

                # Process data
                results = await process_data(nlp_processor, llm_service, data)
                processed_results = processor.process_results(results)
                
                # Update database
                processor.update_analysis_result(result_id, processed_results)
                return processed_results

            except Exception as e:
                logger.exception(f"Error during analysis: {str(e)}")
                if processor:
                    processor.update_error_status(result_id, str(e))
                raise

            finally:
                if processor:
                    processor.close()

        # Start analysis task
        asyncio.create_task(run_analysis(result_id))

        return AnalysisResponse(
            result_id=result_id,
            message=f"Analysis started. Use result_id: {result_id} to check results."
        )

    except Exception as e:
        logger.error(f"Error triggering analysis: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error triggering analysis: {str(e)}"
        )
