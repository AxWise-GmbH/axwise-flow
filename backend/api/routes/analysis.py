"""
Analysis routes for the Interview Analysis API.

This module contains the core analysis endpoints:
- POST /api/data - Upload interview data
- POST /api/analyze - Trigger analysis
- POST /api/analyses/{result_id}/restart - Restart analysis
- GET /api/results/{result_id} - Get analysis results
- GET /api/results/{result_id}/personas/simplified - Get simplified personas
- GET /api/analyses - List user analyses
- POST /api/persona/generate - Generate persona

Extracted from app.py to improve maintainability.
"""

from fastapi import APIRouter, File, UploadFile, HTTPException, Request, Depends, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional, Literal
import logging
import os
import time

from backend.database import get_db
from backend.models import User, InterviewData, AnalysisResult
from backend.services.external.auth_middleware import get_current_user
from backend.schemas import (
    AnalysisRequest,
    UploadResponse,
    AnalysisResponse,
    ResultResponse,
    PersonaGenerationRequest,
)
from backend.infrastructure.config.settings import settings
from backend.utils.timezone_utils import format_iso_utc
from backend.api.routes.results_helpers import (
    build_concat_and_spans,
    should_hydrate_personas,
    should_revalidate_personas,
    hydrate_persona_evidence,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Analysis"])


# Default sentiment overview for fallback
DEFAULT_SENTIMENT_OVERVIEW = {
    "overall": "neutral",
    "positivePercentage": 0,
    "negativePercentage": 0,
    "neutralPercentage": 100,
    "averageScore": 0,
}


@router.post(
    "/api/data",
    response_model=UploadResponse,
    summary="Upload interview data",
    description="Upload interview data in JSON format or free-text format for analysis.",
)
async def upload_data(
    request: Request,
    file: UploadFile = File(...),
    is_free_text: bool = Form(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Handles interview data upload (JSON format or free-text format).
    """
    start_time = time.time()
    logger.info(f"[UploadData - Start] User: {current_user.user_id}")

    try:
        # Import data service
        from backend.services.data_service import DataService

        data_service = DataService(db, current_user)
        result = await data_service.upload_interview_data(file, is_free_text)

        return UploadResponse(
            data_id=result["data_id"],
            message="File uploaded successfully",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[UploadData - Error] {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    finally:
        duration = time.time() - start_time
        logger.info(f"[UploadData - End] Duration: {duration:.4f}s")


@router.post(
    "/api/analyze",
    response_model=AnalysisResponse,
    summary="Analyze uploaded data",
    description="Trigger analysis of previously uploaded data using the specified LLM provider.",
)
async def analyze_data(
    request: Request,
    analysis_request: AnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Triggers analysis of uploaded data."""
    start_time = time.time()
    logger.info(
        f"[AnalyzeData - Start] User: {current_user.user_id}, DataID: {analysis_request.data_id}"
    )
    try:
        from backend.services.analysis_service import AnalysisService

        analysis_service = AnalysisService(db, current_user)
        result = await analysis_service.start_analysis(
            data_id=analysis_request.data_id,
            llm_provider=analysis_request.llm_provider,
            llm_model=analysis_request.llm_model,
            is_free_text=analysis_request.is_free_text,
            industry=analysis_request.industry,
        )

        return AnalysisResponse(
            success=result["success"],
            message=result["message"],
            result_id=result["result_id"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AnalyzeData - Error] {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        duration = time.time() - start_time
        logger.info(f"[AnalyzeData - End] Duration: {duration:.4f}s")


@router.post(
    "/api/analyses/{result_id}/restart",
    response_model=AnalysisResponse,
    summary="Restart analysis",
    description="Restart the full analysis pipeline using the same InterviewData as an existing result.",
)
async def restart_analysis_endpoint(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restart an analysis, creating a new result using prior settings where possible."""
    import json

    try:
        # Authorize and fetch the original analysis result
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

        # Fetch original InterviewData
        interview_data = (
            db.query(InterviewData)
            .filter(InterviewData.id == analysis_result.data_id)
            .first()
        )
        if not interview_data:
            raise HTTPException(status_code=404, detail="Interview data not found")

        # Determine prior settings / fallbacks
        llm_provider = analysis_result.llm_provider or "gemini"
        llm_model = analysis_result.llm_model
        prior_results = analysis_result.results or {}
        if isinstance(prior_results, str):
            try:
                prior_results = json.loads(prior_results)
            except json.JSONDecodeError:
                prior_results = {}
        industry = prior_results.get("industry")

        # Infer is_free_text from InterviewData
        is_free_text = False
        try:
            if (interview_data.input_type or "").lower() == "text":
                is_free_text = True
            else:
                parsed = json.loads(interview_data.original_data)
                if isinstance(parsed, dict) and (
                    "free_text" in parsed
                    or parsed.get("metadata", {}).get("is_free_text")
                ):
                    is_free_text = True
        except (json.JSONDecodeError, TypeError, AttributeError):
            if (
                isinstance(interview_data.original_data, str)
                and len(interview_data.original_data) > 0
            ):
                is_free_text = True

        # Fallback to default Gemini model if none recorded
        if not llm_model:
            try:
                llm_model = settings.llm_providers.get("gemini", {}).get(
                    "model", "models/gemini-2.5-pro"
                )
            except (KeyError, AttributeError):
                llm_model = "models/gemini-2.5-pro"

        # Kick off a new analysis
        from backend.services.analysis_service import AnalysisService

        analysis_service = AnalysisService(db, current_user)
        result = await analysis_service.start_analysis(
            data_id=analysis_result.data_id,
            llm_provider=llm_provider,
            llm_model=llm_model,
            is_free_text=is_free_text,
            industry=industry,
        )

        return AnalysisResponse(
            result_id=int(result.get("result_id")),
            message="Analysis restarted",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RestartAnalysis] Error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Error restarting analysis: {str(e)}"
        )




@router.get(
    "/api/results/{result_id}",
    response_model=ResultResponse,
    summary="Get analysis results",
    description="Retrieve the results of a previously triggered analysis.",
)
async def get_results(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves analysis results with optional hydration and revalidation.
    """
    try:
        from backend.api.dependencies import get_container

        container = get_container()
        factory = container.get_results_service()
        results_service = factory(db, current_user)

        # Get formatted results
        result = results_service.get_analysis_result(result_id)

        # Optional on-read hydration for personas
        if should_hydrate_personas() and isinstance(result, dict):
            _hydrate_result_personas(result)

        # Optional on-read revalidation
        if should_revalidate_personas() and isinstance(result, dict):
            _revalidate_result_personas(result)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving results: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


def _hydrate_result_personas(result: Dict[str, Any]) -> None:
    """Hydrate personas with evidence document IDs and offsets."""
    try:
        results_obj = result.get("results") or {}
        personas = results_obj.get("personas")
        if not isinstance(personas, list) or not personas:
            return

        source_payload = results_obj.get("source") or {}
        transcript = (
            source_payload.get("transcript")
            if isinstance(source_payload, dict)
            else None
        )

        scoped_text, doc_spans = None, None
        if isinstance(transcript, list) and transcript:
            txt, spans = build_concat_and_spans(transcript)
            if txt and spans:
                scoped_text, doc_spans = txt, spans
        if not scoped_text:
            scoped_text = source_payload.get("original_text") or ""

        if scoped_text:
            hydrate_persona_evidence(personas, scoped_text, doc_spans)

    except Exception as err:
        logger.warning(f"[FULL_RESULTS_HYDRATION] Skipped due to error: {err}")


def _revalidate_result_personas(result: Dict[str, Any]) -> None:
    """Revalidate persona evidence on read."""
    try:
        from backend.services.validation.persona_evidence_validator import (
            PersonaEvidenceValidator,
        )

        results_obj = result.get("results") or {}
        personas = results_obj.get("personas")
        if not isinstance(personas, list) or not personas:
            return

        source_payload = results_obj.get("source") or {}
        transcript = (
            source_payload.get("transcript")
            if isinstance(source_payload, dict)
            else None
        )
        source_text = (
            source_payload.get("original_text")
            if isinstance(source_payload, dict)
            else None
        )

        validator = PersonaEvidenceValidator()
        all_matches = []
        any_cross_trait = False
        speaker_mismatch_count = 0

        if not (isinstance(transcript, list) and transcript):
            transcript = None

        for p in personas:
            if not isinstance(p, dict):
                continue
            try:
                matches = validator.match_evidence(
                    persona_ssot=p,
                    source_text=source_text,
                    transcript=transcript,
                )
                all_matches.extend(matches)

                dup = PersonaEvidenceValidator.detect_duplication(p)
                ctr = dup.get("cross_trait_reuse")
                if isinstance(ctr, list):
                    any_cross_trait = any_cross_trait or bool(ctr)
                elif ctr:
                    any_cross_trait = True

                sc = PersonaEvidenceValidator.check_speaker_consistency(p, transcript)
                sm = sc.get("speaker_mismatches")
                if isinstance(sm, list):
                    speaker_mismatch_count += len(sm)
                elif isinstance(sm, int):
                    speaker_mismatch_count += sm
            except (TypeError, KeyError, AttributeError):
                continue

        contamination = PersonaEvidenceValidator.detect_contamination(personas)
        summary = PersonaEvidenceValidator.summarize(
            all_matches,
            {"cross_trait_reuse": any_cross_trait},
            {"speaker_mismatches": speaker_mismatch_count},
            contamination,
        )
        confidence = PersonaEvidenceValidator.compute_confidence_components(summary)

        # Shape similar to previous payloads
        results_obj["validation_summary"] = {
            "counts": summary.get("counts", {}),
            "method": "persona_evidence_validator_v1",
            "speaker_mismatches": speaker_mismatch_count,
            "contamination": contamination,
            "confidence_components": confidence,
        }
    except Exception as err:
        logger.warning(f"[ON_READ_REVALIDATION] Skipped due to error: {err}")


@router.get(
    "/api/results/{result_id}/personas/simplified",
    summary="Get simplified design thinking personas",
    description="Retrieve personas optimized for design thinking display with only 5 core fields.",
)
async def get_simplified_personas(
    result_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get design thinking optimized personas (5 fields only).
    """
    try:
        logger.info(f"Getting simplified personas for result_id: {result_id}")

        from backend.api.dependencies import get_container

        container = get_container()
        factory = container.get_results_service()
        results_service = factory(db, current_user)

        simplified_personas = results_service.get_design_thinking_personas(result_id)

        # Normalize to ProductionPersona-compatible shape
        normalized_personas = []
        for p in simplified_personas:
            if not isinstance(p, dict):
                continue
            normalized_personas.append(
                {
                    "name": p.get("name", "Unknown Persona"),
                    "description": p.get("description", ""),
                    "archetype": p.get("archetype", "Professional"),
                    "demographics": _trait_from_populated(p, "demographics"),
                    "goals_and_motivations": _trait_from_populated(p, "goals_and_motivations"),
                    "challenges_and_frustrations": _trait_from_populated(p, "challenges_and_frustrations"),
                    "key_quotes": _trait_from_populated(p, "key_quotes"),
                }
            )

        from backend.domain.models.production_persona import PersonaAPIResponse

        try:
            per_persona = [
                {
                    "name": p.get("name"),
                    "demographics": _quality_for_trait(p.get("demographics", {})),
                    "goals_and_motivations": _quality_for_trait(p.get("goals_and_motivations", {})),
                    "challenges_and_frustrations": _quality_for_trait(p.get("challenges_and_frustrations", {})),
                    "key_quotes": _quality_for_trait(p.get("key_quotes", {})),
                }
                for p in normalized_personas
            ]

            validated_response = PersonaAPIResponse(
                personas=normalized_personas,
                metadata={
                    "result_id": result_id,
                    "design_thinking_optimized": True,
                    "total_personas": len(normalized_personas),
                    "filtered": True,
                    "evidence_quality": {"per_persona": per_persona},
                },
            )

            return {
                "status": "success",
                "result_id": result_id,
                "personas": validated_response.personas,
                "total_personas": len(normalized_personas),
                "design_thinking_optimized": True,
                "validation": "passed",
                "evidence_quality": validated_response.metadata.get("evidence_quality"),
            }
        except Exception as validation_error:
            logger.error(f"PersonaAPIResponse validation failed: {validation_error}")
            return {
                "status": "success",
                "result_id": result_id,
                "personas": normalized_personas,
                "total_personas": len(normalized_personas),
                "design_thinking_optimized": True,
                "validation": "failed",
                "validation_error": str(validation_error),
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving simplified personas: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


def _trait_from_populated(p: Dict[str, Any], name: str) -> Dict[str, Any]:
    """Extract trait from populated_traits with fallback."""
    traits = p.get("populated_traits", {}) if isinstance(p, dict) else {}
    t = traits.get(name) or {}
    if isinstance(t, dict) and "value" in t:
        val = t.get("value", "")
        conf = t.get("confidence", p.get("overall_confidence", 0.7))
        ev = t.get("evidence", [])
        ev = ev if isinstance(ev, list) else []
        return {"value": val, "confidence": conf, "evidence": ev}
    return {"value": "", "confidence": p.get("overall_confidence", 0.7), "evidence": []}


def _quality_for_trait(trait: Dict[str, Any]) -> Dict[str, Any]:
    """Compute evidence quality summary for a trait."""
    ev = trait.get("evidence", []) if isinstance(trait, dict) else []
    total = len(ev)
    non_null = 0
    for it in ev:
        try:
            if (
                isinstance(it.get("start_char"), int)
                and isinstance(it.get("end_char"), int)
                and (it.get("document_id") is not None)
            ):
                non_null += 1
        except (TypeError, AttributeError):
            pass
    ratio = (non_null / total) if total else 0.0
    return {"count": total, "non_null_offset_ratio": ratio}


@router.get(
    "/api/analyses",
    summary="List analyses",
    description="Retrieve a list of all analyses performed by the current user.",
)
async def list_analyses(
    request: Request,
    sortBy: Optional[str] = None,
    sortDirection: Optional[Literal["asc", "desc"]] = "desc",
    status: Optional[Literal["pending", "completed", "failed"]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves a list of analyses performed by the user.
    """
    from sqlalchemy.sql import text

    try:
        logger.info(f"list_analyses called - user_id: {current_user.user_id}")

        # Test database connection
        try:
            db.execute(text("SELECT 1")).fetchone()
        except Exception as db_error:
            logger.error(f"Database connection error: {str(db_error)}")
            return JSONResponse(
                content={"error": f"Database connection failed: {str(db_error)}", "type": "database_error"},
                status_code=500,
            )

        from backend.api.dependencies import get_container

        container = get_container()
        factory = container.get_results_service()
        results_service = factory(db, current_user)

        analyses = results_service.get_all_analyses(
            sort_by=sortBy, sort_direction=sortDirection, status=status
        )

        return JSONResponse(content=analyses)

    except Exception as e:
        logger.error(f"Error retrieving analyses: {str(e)}")
        return JSONResponse(
            content={"error": f"Internal server error: {str(e)}", "type": "server_error"},
            status_code=500,
        )


@router.options("/api/analyses")
async def options_analyses():
    """Handle OPTIONS preflight request for analyses endpoint"""
    return JSONResponse(
        content={"status": "ok"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Client-Origin, X-API-Version",
        },
    )


@router.post(
    "/api/generate-persona",
    summary="Generate persona directly from text",
    description="Generate a persona directly from raw interview text without requiring full analysis.",
)
async def generate_persona_from_text(
    request: Request,
    persona_request: PersonaGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a persona directly from interview text.
    """
    try:
        from backend.services.persona_service import PersonaService

        persona_service = PersonaService(db, current_user)
        result = await persona_service.generate_persona(
            text=persona_request.text,
            llm_provider=persona_request.llm_provider,
            llm_model=persona_request.llm_model,
            filename=persona_request.filename,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating persona: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")