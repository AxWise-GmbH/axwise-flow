"""
PRD API routes.
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.external.auth_middleware import get_current_user
from backend.models import User
from backend.services.processing.prd_generation_service import PRDGenerationService
from backend.services.results_service import ResultsService
from backend.services.llm import LLMServiceFactory

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/prd",
    tags=["prd"],
    responses={404: {"description": "Not found"}},
)

@router.get("/{result_id}")
async def generate_prd(
    result_id: int,
    prd_type: str = Query("both", description="Type of PRD to generate: 'operational', 'technical', or 'both'"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Generate a PRD from analysis results.

    Args:
        result_id: ID of the analysis result to generate PRD from
        prd_type: Type of PRD to generate
        db: Database session
        user: Current authenticated user

    Returns:
        Generated PRD
    """
    try:
        logger.info(f"Generating PRD for result_id: {result_id}, prd_type: {prd_type}")

        # Validate prd_type
        if prd_type not in ["operational", "technical", "both"]:
            raise HTTPException(status_code=400, detail="Invalid PRD type. Must be 'operational', 'technical', or 'both'")

        # Get analysis results
        results_service = ResultsService(db=db, user=user)
        analysis_results = results_service.get_analysis_result(result_id)

        # Check if analysis is complete
        if analysis_results.get("status") != "completed":
            raise HTTPException(status_code=400, detail="Analysis is not yet complete")

        # Get results data
        results_data = analysis_results.get("results", {})

        # Create PRD generation service with enhanced_gemini provider
        llm_service = LLMServiceFactory.create("enhanced_gemini")
        prd_service = PRDGenerationService(llm_service=llm_service)

        # Get industry from results if available
        industry = results_data.get("industry")

        # Generate PRD
        prd_data = await prd_service.generate_prd(
            analysis_results=results_data,
            prd_type=prd_type,
            industry=industry
        )

        # Return PRD data
        return {
            "success": True,
            "result_id": result_id,
            "prd_type": prd_type,
            "prd_data": prd_data
        }

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error generating PRD: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating PRD: {str(e)}")
