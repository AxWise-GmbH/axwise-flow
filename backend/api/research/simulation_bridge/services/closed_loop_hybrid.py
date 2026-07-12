"""Shared closed-loop Pipeline A+B enrichment for synchronous simulations."""

import logging

from ..models import SimulationRequest, SimulationResponse
from .data_formatter import DataFormatter
from backend.services.llm import LLMServiceFactory
from backend.services.processing.persona_formation_service import PersonaFormationService


logger = logging.getLogger(__name__)


def _audit_evidence_offsets(result: SimulationResponse, personas: list) -> tuple[int, list[str]]:
    """Re-anchor every structured quote to its exact participant source text."""
    people_by_id = {person.id: person for person in result.people or []}
    source_by_speaker = {}
    document_by_speaker = {}
    for interview in result.interviews or []:
        person = people_by_id.get(interview.person_id)
        if not person:
            continue
        if person.name in source_by_speaker:
            raise RuntimeError(
                f"Closed-loop evidence requires unique speaker names: {person.name}"
            )
        source_by_speaker[person.name] = "\n".join(
            response.response for response in interview.responses
        )
        document_by_speaker[person.name] = (
            f"sim_session_{result.simulation_id}_{interview.person_id}"
        )

    audited_items = set()

    def visit(value):
        if isinstance(value, list):
            for item in value:
                visit(item)
            return
        if not isinstance(value, dict):
            return

        quote = value.get("quote")
        speaker = value.get("speaker")
        if quote and speaker and (
            "start_char" in value or "end_char" in value
        ):
            source = source_by_speaker.get(speaker)
            if source is None:
                raise RuntimeError(
                    f"Evidence references unknown simulation speaker: {speaker}"
                )
            start = source.find(quote)
            if start < 0:
                raise RuntimeError(
                    f"Evidence quote is not an exact source substring for {speaker}"
                )
            value["start_char"] = start
            value["end_char"] = start + len(quote)
            value["document_id"] = document_by_speaker[speaker]
            audited_items.add(
                (speaker, quote, start, start + len(quote), value["document_id"])
            )

        for child in value.values():
            visit(child)

    visit(personas)
    if not audited_items:
        raise RuntimeError("Pipeline A returned no offset-linked evidence")
    return len(audited_items), sorted(set(document_by_speaker.values()))


async def enrich_with_empirical_personas(
    result: SimulationResponse,
    request: SimulationRequest,
) -> SimulationResponse:
    """Run Pipeline A over Pipeline B transcripts and require audited personas."""
    if not result or not result.interviews or not result.people:
        raise RuntimeError(
            "Closed-loop enrichment requires generated people and interview transcripts"
        )

    simulation_id = result.simulation_id
    if not simulation_id:
        raise RuntimeError("Closed-loop enrichment requires a simulation ID")

    document_id = f"sim_session_{simulation_id}"
    segments = DataFormatter().format_as_transcript_segments(
        interviews=result.interviews,
        personas=result.people,
        simulation_id=simulation_id,
    )
    if not segments:
        raise RuntimeError("Closed-loop enrichment produced no transcript segments")

    logger.info(
        "Closed-loop A+B: enriching simulation %s from %s transcript segments",
        simulation_id,
        len(segments),
    )
    llm_service = LLMServiceFactory.create("enhanced_gemini")
    persona_service = PersonaFormationService(llm_service=llm_service)
    empirical_personas = await persona_service.form_personas_from_transcript(
        transcript=segments,
        context={
            "industry": (
                request.business_context.industry
                if request.business_context
                else "general"
            ),
            "document_id": document_id,
            "filename": f"{document_id}.json",
            "simulation_id": simulation_id,
            "pipeline": "closed_loop_a_plus_b",
        },
    )
    if not empirical_personas:
        raise RuntimeError("Pipeline A returned no empirical personas")

    audited_evidence_count, evidence_document_ids = _audit_evidence_offsets(
        result, empirical_personas
    )

    result.empirical_personas = empirical_personas
    result.metadata = {
        **(result.metadata or {}),
        "hybrid_pipeline": "A+B",
        "hybrid_status": "completed",
        "empirical_persona_count": len(empirical_personas),
        "evidence_document_id": document_id,
        "evidence_document_ids": evidence_document_ids,
        "audited_evidence_count": audited_evidence_count,
    }
    logger.info(
        "Closed-loop A+B: generated %s empirical personas for simulation %s",
        len(empirical_personas),
        simulation_id,
    )
    return result
