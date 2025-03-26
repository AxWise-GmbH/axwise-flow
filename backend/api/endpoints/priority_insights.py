"""
Priority Insights API Endpoint

This module provides an endpoint for calculating and retrieving prioritized insights
from analysis results, helping users identify which findings should be addressed first.
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
import json
import logging
import traceback
from typing import Dict, Any, List, Optional
import time
import uuid

# Configure logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter()

# Import after router creation to avoid circular imports
from backend.database import get_db
from backend.models import User, AnalysisResult, InterviewData
from backend.services.external.auth_middleware import get_current_user

# Constants for priority calculation
DEFAULT_MAX_EVIDENCE_COUNT = 5
THEME_SENTIMENT_WEIGHT = 0.7
THEME_FREQUENCY_WEIGHT = 0.3
PATTERN_SENTIMENT_WEIGHT = 0.6
PATTERN_FREQUENCY_WEIGHT = 0.3
PATTERN_EVIDENCE_WEIGHT = 0.1

# Thresholds for urgency levels
HIGH_URGENCY_THRESHOLD = 0.6
MEDIUM_URGENCY_THRESHOLD = 0.3

@router.get(
    "/priority",
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
    # Generate request ID for tracing
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()
    user_identifier = "unknown"
    
    try:
        # Validate user object and extract user_id safely
        if not current_user:
            logger.error(f"[{request_id}] Priority Insights: Authentication error - missing user object")
            raise HTTPException(
                status_code=401,
                detail="Authentication error. Valid user required."
            )
        
        # Check if user object has the expected user_id attribute
        if not hasattr(current_user, 'user_id'):
            logger.error(f"[{request_id}] Priority Insights: Invalid user object structure - missing user_id attribute")
            # Log available attributes to help debugging
            available_attrs = ', '.join(dir(current_user))
            logger.debug(f"[{request_id}] Available user attributes: {available_attrs}")
            raise HTTPException(
                status_code=500,
                detail="Server configuration error: Invalid user model structure"
            )
            
        # Get user_id safely now that we've validated it exists
        user_identifier = current_user.user_id
        
        # Initial request logging
        logger.info(f"[{request_id}] Priority Insights: Request received - result_id={result_id}, user_id={user_identifier}")
        
        # Input validation
        if not result_id or not isinstance(result_id, int) or result_id <= 0:
            logger.warning(f"[{request_id}] Priority Insights: Invalid result_id provided: {result_id}")
            raise HTTPException(
                status_code=400,
                detail="Invalid analysis result ID. Must be a positive integer."
            )
            
        # Add client info to logs if available
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        logger.debug(f"[{request_id}] Request from IP: {client_ip}, User-Agent: {user_agent}")
        
        # This old check is now redundant with our newer validation above
        # We'll keep it but update it to use user_id instead of id
        if not current_user or not hasattr(current_user, 'user_id'):
            logger.error(f"[{request_id}] Priority Insights: Authentication error - invalid or missing user")
            raise HTTPException(
                status_code=401,
                detail="Authentication error. Valid user required."
            )
            
        ***REMOVED*** query timing
        db_start_time = time.time()
        try:
            # Get analysis result from database
            # Join with InterviewData to filter by user_id correctly
            analysis_result = db.query(AnalysisResult).join(
                InterviewData, 
                InterviewData.data_id == AnalysisResult.data_id
            ).filter(
                AnalysisResult.result_id == result_id,
                InterviewData.user_id == user_identifier,
                AnalysisResult.status == "completed"
            ).first()
            
            db_query_time = time.time() - db_start_time
            logger.debug(f"[{request_id}] Database query completed in {db_query_time:.3f}s")
        except SQLAlchemyError as db_err:
            logger.error(f"[{request_id}] Database error when fetching result: {str(db_err)}")
            raise HTTPException(
                status_code=500,
                detail="Database error when retrieving analysis results"
            )
        
        if not analysis_result:
            logger.warning(f"[{request_id}] Priority Insights: Analysis result not found or not completed - result_id={result_id}, user_id={user_identifier}")
            raise HTTPException(
                status_code=404,
                detail=f"Analysis result {result_id} not found or not yet completed. Please check the ID and ensure analysis has finished."
            )
        elif analysis_result.status == "failed":
            logger.warning(f"[{request_id}] Priority Insights: Analysis failed - result_id={result_id}")
            raise HTTPException(status_code=422, detail="The requested analysis failed to complete. Please retry the analysis.")
        else:
            logger.info(f"[{request_id}] Priority Insights: Found valid analysis result - result_id={result_id}")
            
        # Before parsing JSON
        logger.debug(f"[{request_id}] Raw results JSON type: {type(analysis_result.results)}")
        # Log only a snippet if it's large
        raw_results_snippet = str(analysis_result.results)[:200] + '...' if len(str(analysis_result.results)) > 200 else str(analysis_result.results)
        logger.debug(f"[{request_id}] Raw results JSON snippet: {raw_results_snippet}")
        
        # Parse stored results
        parse_start_time = time.time()
        try:
            results_dict = (
                json.loads(analysis_result.results) 
                if isinstance(analysis_result.results, str)
                else analysis_result.results
            )
            
            parse_time = time.time() - parse_start_time
            
            # After parsing JSON
            logger.info(f"[{request_id}] Successfully parsed results JSON in {parse_time:.3f}s - result_id={result_id}")
            
            # Validate results structure
            if not isinstance(results_dict, dict):
                logger.error(f"[{request_id}] Results is not a dictionary: {type(results_dict)}")
                raise ValueError("Analysis results has invalid format (not a dictionary)")
                
            expected_keys = ["themes", "patterns"]
            missing_keys = [key for key in expected_keys if key not in results_dict]
            if missing_keys:
                logger.warning(f"[{request_id}] Missing expected keys in results: {missing_keys}")
            
            # Log available keys
            available_keys = list(results_dict.keys())
            logger.debug(f"[{request_id}] Parsed results keys: {available_keys}")
            
        except json.JSONDecodeError as json_err:
            logger.error(f"[{request_id}] JSON parsing error for result_id={result_id}: {str(json_err)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error parsing analysis results: Invalid JSON format"
            )
        except Exception as parse_err:
            logger.error(f"[{request_id}] Error parsing results for result_id={result_id}: {str(parse_err)}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Error processing analysis results: {str(parse_err)}"
            )
        
        # Extract themes and patterns with validation
        themes = []
        if "themes" in results_dict:
            if isinstance(results_dict["themes"], list):
                themes = results_dict["themes"]
            else:
                logger.warning(f"[{request_id}] 'themes' is not a list: {type(results_dict['themes'])}")
                themes = []
        
        patterns = []
        if "patterns" in results_dict:
            if isinstance(results_dict["patterns"], list):
                patterns = results_dict["patterns"]
            else:
                logger.warning(f"[{request_id}] 'patterns' is not a list: {type(results_dict['patterns'])}")
                patterns = []
                
        logger.info(f"[{request_id}] Extracted {len(themes)} themes and {len(patterns)} patterns")
        
        # Calculate priority scores
        prioritized_insights = []
        process_start_time = time.time()
        
        # Process themes with priority scoring
        for theme_index, theme in enumerate(themes):
            try:
                # Basic validation
                if not isinstance(theme, dict):
                    logger.warning(f"[{request_id}] Theme at index {theme_index} is not a dictionary, skipping")
                    continue
                
                # Extract required values with defaults
                name = theme.get("name", f"Unnamed Theme {theme_index + 1}")
                sentiment = float(theme.get("sentiment", 0))
                frequency = float(theme.get("frequency", 0))
                definition = theme.get("definition", "")
                
                # Calculate priority components
                sentiment_impact = abs(sentiment) * THEME_SENTIMENT_WEIGHT
                frequency_impact = frequency * THEME_FREQUENCY_WEIGHT
                
                # Calculate overall priority score (0-1 scale)
                priority_score = sentiment_impact + frequency_impact
                
                # Determine urgency level
                urgency_level = "high" if priority_score > HIGH_URGENCY_THRESHOLD else ("medium" if priority_score > MEDIUM_URGENCY_THRESHOLD else "low")
                
                logger.debug(f"[{request_id}] Theme '{name}' - sentiment: {sentiment:.2f}, frequency: {frequency:.2f}, score: {priority_score:.2f}")
                
                # Add to prioritized insights
                prioritized_insights.append({
                    "type": "theme",
                    "name": name,
                    "description": definition,
                    "priority_score": round(priority_score, 2),
                    "urgency": urgency_level,
                    "sentiment": sentiment,
                    "frequency": frequency,
                    "original": theme
                })
            except Exception as theme_err:
                logger.warning(f"[{request_id}] Error processing theme at index {theme_index}: {str(theme_err)}")
                # Continue processing other themes
        
        # Process patterns with priority scoring
        for pattern_index, pattern in enumerate(patterns):
            try:
                # Basic validation
                if not isinstance(pattern, dict):
                    logger.warning(f"[{request_id}] Pattern at index {pattern_index} is not a dictionary, skipping")
                    continue
                
                # Extract required values with defaults
                name = pattern.get("name", f"Unnamed Pattern {pattern_index + 1}")
                sentiment = float(pattern.get("sentiment", 0))
                frequency = float(pattern.get("frequency", 0))
                description = pattern.get("description", "")
                category = pattern.get("category", "Uncategorized")
                evidence = pattern.get("evidence", [])
                
                # Ensure evidence is a list
                if not isinstance(evidence, list):
                    evidence = []
                
                evidence_len = len(evidence)
                
                # Calculate priority components
                sentiment_impact = abs(sentiment) * PATTERN_SENTIMENT_WEIGHT
                frequency_impact = frequency * PATTERN_FREQUENCY_WEIGHT
                evidence_impact = min(evidence_len / DEFAULT_MAX_EVIDENCE_COUNT, 1) * PATTERN_EVIDENCE_WEIGHT
                
                # Calculate overall priority score (0-1 scale)
                priority_score = sentiment_impact + frequency_impact + evidence_impact
                
                # Determine urgency level
                urgency_level = "high" if priority_score > HIGH_URGENCY_THRESHOLD else ("medium" if priority_score > MEDIUM_URGENCY_THRESHOLD else "low")
                
                logger.debug(f"[{request_id}] Pattern '{name}' - sentiment: {sentiment:.2f}, frequency: {frequency:.2f}, evidence: {evidence_len}, score: {priority_score:.2f}")
                
                # Add to prioritized insights
                prioritized_insights.append({
                    "type": "pattern",
                    "name": name,
                    "description": description,
                    "priority_score": round(priority_score, 2),
                    "urgency": urgency_level,
                    "sentiment": sentiment,
                    "frequency": frequency,
                    "category": category,
                    "original": pattern
                })
            except Exception as pattern_err:
                logger.warning(f"[{request_id}] Error processing pattern at index {pattern_index}: {str(pattern_err)}")
                # Continue processing other patterns
        
        # Sort by priority score (descending)
        prioritized_insights.sort(key=lambda x: x["priority_score"], reverse=True)
        
        process_time = time.time() - process_start_time
        logger.debug(f"[{request_id}] Priority calculation completed in {process_time:.3f}s")
        
        # Calculate metrics
        high_count = sum(1 for i in prioritized_insights if i["urgency"] == "high")
        medium_count = sum(1 for i in prioritized_insights if i["urgency"] == "medium")
        low_count = sum(1 for i in prioritized_insights if i["urgency"] == "low")
        
        response_data = {
            "insights": prioritized_insights,
            "metrics": {
                "high_urgency_count": high_count,
                "medium_urgency_count": medium_count,
                "low_urgency_count": low_count
            }
        }
        
        total_time = time.time() - start_time
        logger.info(f"[{request_id}] Completed in {total_time:.3f}s - Returning {len(prioritized_insights)} insights (high: {high_count}, medium: {medium_count}, low: {low_count})")
        
        return response_data
        
    except HTTPException:
        # Log the time taken even for errors
        error_time = time.time() - start_time
        logger.info(f"[{request_id}] HTTP exception occurred after {error_time:.3f}s")
        raise
    except Exception as e:
        # Capture full traceback for unexpected errors
        error_time = time.time() - start_time
        logger.error(f"[{request_id}] Unexpected error after {error_time:.3f}s: {str(e)}")
        logger.error(f"[{request_id}] Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Error calculating priority insights: {str(e)}"
        )
