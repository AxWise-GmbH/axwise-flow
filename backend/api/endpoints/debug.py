"""
Debug API Endpoints

This module provides debugging endpoints for the FastAPI application.
These endpoints are useful for development, testing, and troubleshooting.
"""

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import traceback

# Configure logging
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    tags=["debug"],
    responses={404: {"description": "Not found"}},
)

# Import dependencies
from backend.database import get_db
from backend.models import User, AnalysisResult, InterviewData
from backend.services.external.auth_middleware import get_current_user
from backend.models.stakeholder_models import StakeholderDetector


@router.get(
    "/debug/system-info",
    summary="Get system information",
    description="Get detailed system information including environment variables, Python version, and dependencies",
)
async def get_system_info():
    """Get system information for debugging purposes."""
    try:
        return {
            "status": "success",
            "timestamp": datetime.utcnow().isoformat(),
            "system": {
                "python_version": sys.version,
                "platform": sys.platform,
                "executable": sys.executable,
                "path": sys.path[:5],  # First 5 paths only
            },
            "environment": {
                "has_gemini_key": bool(os.getenv("GEMINI_API_KEY")),
                "has_clerk_key": bool(os.getenv("CLERK_SECRET_KEY")),
                "has_stripe_key": bool(os.getenv("STRIPE_SECRET_KEY")),
                "enable_clerk_validation": os.getenv(
                    "ENABLE_CLERK_VALIDATION", "false"
                ),
                "llm_provider": os.getenv("LLM_PROVIDER", "not_set"),
                "database_type": (
                    os.getenv("DATABASE_URL", "").split("://")[0]
                    if os.getenv("DATABASE_URL")
                    else "not_set"
                ),
            },
            "server_id": "DesignAId-API-v2-debug",
        }
    except Exception as e:
        logger.error(f"Error getting system info: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error getting system info: {str(e)}"
        )


@router.get(
    "/debug/database-status",
    summary="Get database status",
    description="Check database connection and get basic statistics",
)
async def get_database_status(db: Session = Depends(get_db)):
    """Get database connection status and basic statistics."""
    try:
        # Test basic connection
        db.execute(text("SELECT 1")).fetchone()

        # Get database info
        db_url = str(db.bind.url)
        db_type = db_url.split("://")[0]

        # Get version info
        if db_type == "sqlite":
            version_result = db.execute(text("SELECT sqlite_version()")).fetchone()
            db_version = version_result[0] if version_result else "unknown"
        else:
            version_result = db.execute(text("SELECT version()")).fetchone()
            db_version = version_result[0] if version_result else "unknown"

        # Get table counts
        user_count = db.query(User).count()
        analysis_count = db.query(AnalysisResult).count()
        interview_count = db.query(InterviewData).count()

        return {
            "status": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": {
                "type": db_type,
                "version": db_version,
                "url_masked": f"{db_type}://***",
            },
            "statistics": {
                "users": user_count,
                "analyses": analysis_count,
                "interviews": interview_count,
            },
        }
    except Exception as e:
        logger.error(f"Database status check failed: {str(e)}")
        return {
            "status": "error",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "error": str(e),
            "traceback": traceback.format_exc(),
        }


@router.get(
    "/debug/auth-test",
    summary="Test authentication",
    description="Test the authentication middleware and get current user info",
)
async def test_auth(user: User = Depends(get_current_user)):
    """Test authentication and get current user information."""
    try:
        return {
            "status": "authenticated",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user": {
                "id": user.id,
                "clerk_user_id": user.clerk_user_id,
                "email": user.email,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "updated_at": user.updated_at.isoformat() if user.updated_at else None,
            },
        }
    except Exception as e:
        logger.error(f"Auth test failed: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


@router.get(
    "/debug/config",
    summary="Get configuration",
    description="Get current application configuration (sensitive values masked)",
)
async def get_config():
    """Get current application configuration with sensitive values masked."""
    try:
        from infrastructure.config.settings import Settings

        settings = Settings()

        return {
            "status": "success",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "config": {
                "uvicorn": {
                    "host": settings.uvicorn_host,
                    "port": settings.uvicorn_port,
                    "reload": settings.uvicorn_reload,
                },
                "cors": {
                    "origins": settings.cors_origins,
                    "methods": settings.cors_methods,
                    "headers": settings.cors_headers,
                },
                "llm_providers": {
                    provider: {
                        "model": config.get("model", "not_set"),
                        "has_api_key": bool(config.get("api_key")),
                        "temperature": config.get("temperature", "not_set"),
                        "max_tokens": config.get("max_tokens", "not_set"),
                    }
                    for provider, config in settings.llm_providers.items()
                },
            },
        }
    except Exception as e:
        logger.error(f"Error getting config: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting config: {str(e)}")


@router.post(
    "/debug/test-llm",
    summary="Test LLM service",
    description="Test the LLM service with a simple prompt",
)
async def test_llm_service(
    prompt: str = "Hello, this is a test. Please respond with 'LLM service is working correctly.'",
    user: User = Depends(get_current_user),
):
    """Test the LLM service with a simple prompt."""
    try:
        from backend.services.llm import LLMServiceFactory

        # Create LLM service
        llm_service = LLMServiceFactory.create("enhanced_gemini")

        # Test the service
        response = await llm_service.generate_response(prompt)

        return {
            "status": "success",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "test": {
                "prompt": prompt,
                "response": response,
                "provider": "enhanced_gemini",
            },
        }
    except Exception as e:
        logger.error(f"LLM test failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM test failed: {str(e)}")


@router.get(
    "/debug/logs",
    summary="Get recent logs",
    description="Get recent application logs (limited for security)",
)
async def get_recent_logs(
    lines: int = Query(50, description="Number of log lines to return", ge=1, le=200),
    level: str = Query("INFO", description="Minimum log level"),
    user: User = Depends(get_current_user),
):
    """Get recent application logs."""
    try:
        # This is a simplified implementation
        # In a production environment, you might want to read from actual log files
        return {
            "status": "success",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "logs": {
                "message": f"Log retrieval not implemented. Requested {lines} lines at {level} level.",
                "note": "This endpoint would typically read from log files or a logging service.",
                "suggestion": "Check the console output or log files directly for debugging.",
            },
        }
    except Exception as e:
        logger.error(f"Error getting logs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting logs: {str(e)}")


@router.get(
    "/debug/test-stakeholder-detection/{result_id}",
    summary="Test stakeholder detection on existing analysis",
    description="Test stakeholder detection logic on an existing analysis result",
)
async def test_stakeholder_detection(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test stakeholder detection on existing analysis."""
    try:
        # Get the analysis result
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

        # Get the original interview data
        interview_data = (
            db.query(InterviewData)
            .filter(InterviewData.id == analysis_result.data_id)
            .first()
        )

        if not interview_data:
            raise HTTPException(status_code=404, detail="Interview data not found")

        # Test stakeholder detection
        files = [interview_data.original_data]  # Simulate file input
        detection_result = StakeholderDetector.detect_multi_stakeholder_data(files)

        # Check if analysis already has stakeholder intelligence
        has_stakeholder_intelligence = False
        stakeholder_data = None
        if analysis_result.results and isinstance(analysis_result.results, dict):
            stakeholder_data = analysis_result.results.get("stakeholder_intelligence")
            has_stakeholder_intelligence = stakeholder_data is not None

        return {
            "status": "success",
            "analysis_id": result_id,
            "filename": interview_data.filename,
            "content_length": len(interview_data.original_data),
            "detection_result": {
                "is_multi_stakeholder": detection_result.is_multi_stakeholder,
                "detected_stakeholders_count": len(
                    detection_result.detected_stakeholders
                ),
                "confidence_score": detection_result.confidence_score,
                "detection_method": detection_result.detection_method,
                "metadata": detection_result.metadata,
                "detected_stakeholders": detection_result.detected_stakeholders,
            },
            "current_analysis": {
                "has_stakeholder_intelligence": has_stakeholder_intelligence,
                "stakeholder_data_keys": (
                    list(stakeholder_data.keys()) if stakeholder_data else None
                ),
            },
        }

    except Exception as e:
        logger.error(f"Error in stakeholder detection test: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@router.post("/rerun-stakeholder-analysis/{result_id}")
async def rerun_stakeholder_analysis(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run stakeholder analysis on existing analysis result."""
    try:
        # Get the analysis result
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

        # Get the original interview data
        interview_data = (
            db.query(InterviewData)
            .filter(InterviewData.id == analysis_result.data_id)
            .first()
        )

        if not interview_data:
            raise HTTPException(status_code=404, detail="Interview data not found")

        # Import required modules
        from backend.services.stakeholder_analysis_service import (
            StakeholderAnalysisService,
        )
        from backend.schemas import DetailedAnalysisResult
        from datetime import datetime, timezone

        # Create stakeholder analysis service
        stakeholder_service = StakeholderAnalysisService()

        # Create base analysis from existing results
        existing_results = analysis_result.results or {}

        base_analysis = DetailedAnalysisResult(
            id=str(result_id),
            status="completed",
            createdAt=datetime.now(timezone.utc).isoformat(),
            fileName=interview_data.filename,
            themes=existing_results.get("themes", []),
            patterns=existing_results.get("patterns", []),
            sentimentOverview=existing_results.get(
                "sentimentOverview",
                {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
            ),
            sentiment=existing_results.get("sentiment", []),
            personas=existing_results.get("personas", []),
            insights=existing_results.get("insights", []),
        )

        # Create mock file for analysis
        class MockFile:
            def __init__(self, content):
                self.content = content

            def read(self):
                return str(self.content)

        # Run stakeholder enhancement
        enhanced_analysis = (
            await stakeholder_service.enhance_analysis_with_stakeholder_intelligence(
                [MockFile(interview_data.original_data)], base_analysis
            )
        )

        # Update database with enhanced results
        updated_results = existing_results.copy()

        if enhanced_analysis.stakeholder_intelligence:
            updated_results["stakeholder_intelligence"] = (
                enhanced_analysis.stakeholder_intelligence.dict()
            )

        if enhanced_analysis.enhanced_themes:
            updated_results["enhanced_themes"] = [
                theme.dict() if hasattr(theme, "dict") else theme
                for theme in enhanced_analysis.enhanced_themes
            ]

        if enhanced_analysis.enhanced_patterns:
            updated_results["enhanced_patterns"] = [
                pattern.dict() if hasattr(pattern, "dict") else pattern
                for pattern in enhanced_analysis.enhanced_patterns
            ]

        if enhanced_analysis.enhanced_personas:
            updated_results["enhanced_personas"] = [
                persona.dict() if hasattr(persona, "dict") else persona
                for persona in enhanced_analysis.enhanced_personas
            ]

        if enhanced_analysis.enhanced_insights:
            updated_results["enhanced_insights"] = [
                insight.dict() if hasattr(insight, "dict") else insight
                for insight in enhanced_analysis.enhanced_insights
            ]

        # Save to database
        analysis_result.results = updated_results
        if enhanced_analysis.stakeholder_intelligence:
            analysis_result.stakeholder_intelligence = (
                enhanced_analysis.stakeholder_intelligence.dict()
            )

        db.commit()

        return {
            "status": "success",
            "message": "Stakeholder analysis re-run completed",
            "analysis_id": result_id,
            "enhanced_data": {
                "has_stakeholder_intelligence": bool(
                    enhanced_analysis.stakeholder_intelligence
                ),
                "enhanced_themes_count": (
                    len(enhanced_analysis.enhanced_themes)
                    if enhanced_analysis.enhanced_themes
                    else 0
                ),
                "enhanced_patterns_count": (
                    len(enhanced_analysis.enhanced_patterns)
                    if enhanced_analysis.enhanced_patterns
                    else 0
                ),
                "enhanced_personas_count": (
                    len(enhanced_analysis.enhanced_personas)
                    if enhanced_analysis.enhanced_personas
                    else 0
                ),
                "enhanced_insights_count": (
                    len(enhanced_analysis.enhanced_insights)
                    if enhanced_analysis.enhanced_insights
                    else 0
                ),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing stakeholder detection: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
