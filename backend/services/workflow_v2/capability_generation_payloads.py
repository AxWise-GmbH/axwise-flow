"""Explicit provider payload projections, without operation/owner authority.

These projections select only the data the owner authorized for the requested
capability. They do not perform a request, log source content, or grant consent.
"""

from __future__ import annotations

from typing import Any

from backend.domain.workflow_v2.qualitative_analysis import (
    AnalysisRequestV1,
    validate_analysis_request,
)
from backend.domain.workflow_v2.simulation import (
    SimulationGroundingPassageV1,
    SimulationRequestV1,
    SimulationSlotV1,
    validate_simulation_grounding,
)
from backend.domain.workflow_v2.transcript_corpus import (
    TranscriptCorpusV1,
    validate_transcript_corpus,
)


def analysis_generation_payload(
    corpus: TranscriptCorpusV1, request: AnalysisRequestV1
) -> dict[str, Any]:
    source = validate_transcript_corpus(corpus)
    checked_request = validate_analysis_request(request, source)
    return {
        "request": checked_request.model_dump(mode="json", by_alias=True),
        "corpus": {
            "schemaVersion": source.schema_version,
            "documents": [
                {
                    "documentId": str(document.document_id),
                    "title": document.title,
                    "text": document.text,
                    "textSha256": document.text_sha256,
                    "origin": document.origin,
                    "participants": [
                        participant.model_dump(mode="json", by_alias=True)
                        for participant in document.participants
                    ],
                    "turns": [
                        turn.model_dump(mode="json", by_alias=True)
                        for turn in document.turns
                    ],
                }
                for document in source.documents
            ],
        },
    }


def simulation_generation_payload(
    request: SimulationRequestV1,
    plan: tuple[SimulationSlotV1, ...],
    grounding: tuple[SimulationGroundingPassageV1, ...],
) -> dict[str, Any]:
    checked = SimulationRequestV1.model_validate(request)
    passages = validate_simulation_grounding(checked, grounding)
    return {
        "scenario": checked.scenario.model_dump(mode="json", by_alias=True),
        "stakeholders": [
            stakeholder.model_dump(mode="json", by_alias=True)
            for stakeholder in checked.stakeholders
        ],
        "sampling": checked.sampling.model_dump(mode="json", by_alias=True),
        "responseStyle": checked.response_style,
        "generationProfile": checked.generation_profile,
        "plan": [
            SimulationSlotV1.model_validate(slot).model_dump(mode="json", by_alias=True)
            for slot in plan
        ],
        "selectedPassages": [
            {"passageId": f"passage-{index + 1}", "text": passage.text}
            for index, passage in enumerate(passages)
        ],
    }


__all__ = ["analysis_generation_payload", "simulation_generation_payload"]
