"""
Questionnaire generation routes for AxPersona.

This module handles questionnaire generation from business context.
"""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from backend.api.research.conversation_routines.service import (
    ConversationRoutineService,
)
from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    QuestionsData,
    Stakeholder,
)
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared service instance
conversation_service = ConversationRoutineService()


class QuestionnaireRequest(BaseModel):
    """Request model for questionnaire generation."""

    business_context: BusinessContext


class QuestionnaireResponse(BaseModel):
    """Response model for questionnaire generation."""

    business_context: BusinessContext
    questions_data: QuestionsData
    metadata: Dict[str, Any] = Field(default_factory=dict)


@router.post("/questionnaire", response_model=QuestionnaireResponse)
async def generate_questionnaire(request: QuestionnaireRequest) -> QuestionnaireResponse:
    """Generate a stakeholder-based questionnaire from business context.

    Input:
        QuestionnaireRequest containing a BusinessContext with
        business_idea, target_customer and problem.

    Output:
        QuestionnaireResponse with the original business_context and
        a fully-populated questions_data structure.
    """
    ctx = request.business_context

    # Delegate to ConversationRoutineService for actual question generation
    result = await conversation_service._generate_stakeholder_questions_tool(
        business_idea=ctx.business_idea,
        target_customer=ctx.target_customer,
        problem=ctx.problem,
        location=ctx.location,
    )

    if not isinstance(result, dict):
        raise HTTPException(
            status_code=502,
            detail="Questionnaire generator returned an unexpected payload",
        )

    primary_raw = result.get("primaryStakeholders") or []
    secondary_raw = result.get("secondaryStakeholders") or []

    stakeholders: Dict[str, List[Stakeholder]] = {
        "primary": _to_stakeholders(primary_raw, "primary"),
        "secondary": _to_stakeholders(secondary_raw, "secondary"),
    }

    questions_data = QuestionsData(
        stakeholders=stakeholders,
        timeEstimate=result.get("timeEstimate"),
    )

    return QuestionnaireResponse(
        business_context=request.business_context,
        questions_data=questions_data,
        metadata={
            "format_version": "v3",
            "source": "conversation_routines._generate_stakeholder_questions_tool",
        },
    )


def _to_stakeholders(raw_list: List[Dict[str, Any]], bucket: str) -> List[Stakeholder]:
    """Convert raw stakeholder data to Stakeholder models."""
    stakeholders: List[Stakeholder] = []
    for idx, item in enumerate(raw_list):
        questions_by_phase = item.get("questions") or {}
        questions: List[str] = []
        for phase_key in ["problemDiscovery", "solutionValidation", "followUp"]:
            phase_q = questions_by_phase.get(phase_key) or []
            questions.extend([q for q in phase_q if isinstance(q, str) and q.strip()])

        stakeholders.append(
            Stakeholder(
                id=f"{bucket}_{item.get('index', idx)}",
                name=item.get("name", "Unknown stakeholder"),
                description=item.get("description", ""),
                questions=questions,
            )
        )
    return stakeholders

