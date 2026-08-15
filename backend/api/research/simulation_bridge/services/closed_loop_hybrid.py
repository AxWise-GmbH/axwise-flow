"""Shared closed-loop Pipeline A+B enrichment for synchronous simulations."""

from copy import deepcopy
import logging
import re

from ..models import SimulationRequest, SimulationResponse
from .data_formatter import DataFormatter
from backend.services.llm import LLMServiceFactory
from backend.services.processing.persona_formation_service import PersonaFormationService


logger = logging.getLogger(__name__)


_GENERIC_SPEAKER_NAMES = {
    "default",
    "interviewee",
    "participant",
    "unknown",
}


def _is_generic_speaker_name(value: str) -> bool:
    normalized = value.casefold()
    return bool(
        normalized in _GENERIC_SPEAKER_NAMES
        or re.fullmatch(
            r"(?:default|interviewee|participant|unknown)(?:\s+\d+|\s*\(\d+\))",
            normalized,
        )
    )


def _required_exact_text(value, *, field: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise RuntimeError(
            f"Closed-loop stakeholder binding requires exact nonempty {field}"
        )
    return value


def _source_participant_identities(result: SimulationResponse) -> dict[str, dict]:
    """Build a complete one-to-one person/interview identity boundary."""

    people_by_id = {}
    person_ids_by_name = {}
    for person in result.people or []:
        person_id = _required_exact_text(
            getattr(person, "id", None), field="person IDs"
        )
        if person_id in people_by_id:
            raise RuntimeError(
                f"Closed-loop stakeholder binding requires unique person IDs: {person_id}"
            )
        speaker = _required_exact_text(
            getattr(person, "name", None), field="speaker names"
        )
        if _is_generic_speaker_name(speaker):
            raise RuntimeError(
                f"Closed-loop stakeholder binding rejects generic speaker names: {speaker}"
            )
        if speaker in person_ids_by_name:
            raise RuntimeError(
                f"Closed-loop stakeholder binding requires unique speaker names: {speaker}"
            )
        people_by_id[person_id] = person
        person_ids_by_name[speaker] = person_id

    if not people_by_id:
        raise RuntimeError("Closed-loop stakeholder binding requires people")

    identities = {}
    interviewed_person_ids = set()
    for interview in result.interviews or []:
        person_id = _required_exact_text(
            getattr(interview, "person_id", None), field="interview person IDs"
        )
        if person_id in interviewed_person_ids:
            raise RuntimeError(
                "Closed-loop stakeholder binding requires exactly one interview per "
                f"person ID: {person_id}"
            )
        interviewed_person_ids.add(person_id)
        person = people_by_id.get(person_id)
        if not person:
            raise RuntimeError(
                f"Closed-loop stakeholder binding references unknown person ID: {person_id}"
            )
        speaker = getattr(person, "name")
        person_type = _required_exact_text(
            getattr(person, "stakeholder_type", None),
            field=f"person stakeholder type for {speaker}",
        )
        interview_type = _required_exact_text(
            getattr(interview, "stakeholder_type", None),
            field=f"interview stakeholder type for {speaker}",
        )
        if person_type != interview_type:
            raise RuntimeError(
                "Closed-loop stakeholder binding requires matching person/interview "
                f"stakeholder types for {speaker}"
            )
        identities[speaker] = {
            "person_id": person_id,
            "speaker": speaker,
            "stakeholder_type": person_type,
            "document_id": f"sim_session_{result.simulation_id}_{person_id}",
            "source_text": "\n".join(
                response.response for response in interview.responses
            ),
        }

    missing_interviews = set(people_by_id) - interviewed_person_ids
    if missing_interviews:
        raise RuntimeError(
            "Closed-loop stakeholder binding requires exactly one interview for every "
            f"person ID: {', '.join(sorted(missing_interviews))}"
        )
    return identities


def _empirical_persona_bindings(
    personas: list, identities: dict[str, dict]
) -> list[tuple[dict, dict]]:
    """Resolve every empirical persona to one exact source identity."""

    bindings = []
    seen_speakers = set()
    for persona in personas:
        if not isinstance(persona, dict):
            raise RuntimeError(
                "Closed-loop stakeholder binding requires empirical persona dictionaries"
            )
        source_name = _required_exact_text(
            persona.get("_speaker_name"), field="empirical _speaker_name"
        )
        if _is_generic_speaker_name(source_name):
            raise RuntimeError(
                "Closed-loop stakeholder binding rejects generic empirical speaker names: "
                f"{source_name}"
            )
        public_name = _required_exact_text(
            persona.get("name"), field="empirical persona names"
        )
        if public_name != source_name:
            raise RuntimeError(
                "Closed-loop stakeholder binding requires matching persona and source "
                f"speaker names: {public_name} != {source_name}"
            )
        identity = identities.get(source_name)
        if not identity:
            raise RuntimeError(
                "Closed-loop stakeholder binding requires an exact source speaker identity: "
                f"{source_name or 'missing'}"
            )
        if source_name in seen_speakers:
            raise RuntimeError(
                "Closed-loop stakeholder binding requires unique empirical speaker identities: "
                f"{source_name}"
            )
        seen_speakers.add(source_name)
        bindings.append((persona, identity))

    missing_personas = set(identities) - seen_speakers
    if missing_personas:
        raise RuntimeError(
            "Closed-loop stakeholder binding requires exactly one empirical persona for "
            f"every source speaker: {', '.join(sorted(missing_personas))}"
        )
    return bindings


def _bind_stakeholder_types(bindings: list[tuple[dict, dict]]) -> list[dict]:
    """Restore the trusted Pipeline-B stakeholder type without fuzzy inference."""

    # Validate the whole cohort before constructing any rebound personas.
    for persona, identity in bindings:
        stakeholder = persona.get("stakeholder_intelligence")
        if stakeholder is not None and not isinstance(stakeholder, dict):
            raise RuntimeError(
                "Closed-loop stakeholder binding requires structured stakeholder intelligence"
            )

    rebound_personas = []
    for persona, identity in bindings:
        rebound = deepcopy(persona)
        rebound["stakeholder_intelligence"] = {
            **(rebound.get("stakeholder_intelligence") or {}),
            "stakeholder_type": identity["stakeholder_type"],
        }
        rebound_personas.append(rebound)
    return rebound_personas


def _audit_evidence_offsets(
    bindings: list[tuple[dict, dict]],
) -> tuple[int, list[str]]:
    """Re-anchor every structured quote to its exact participant source text."""
    audited_items = set()

    def visit(value, identity):
        if isinstance(value, list):
            for item in value:
                visit(item, identity)
            return
        if not isinstance(value, dict):
            return

        quote = value.get("quote")
        speaker = value.get("speaker")
        if quote and speaker and (
            "start_char" in value or "end_char" in value
        ):
            if speaker != identity["speaker"]:
                raise RuntimeError(
                    "Evidence speaker does not match its empirical persona source identity: "
                    f"{speaker}"
                )
            source = identity["source_text"]
            start = source.find(quote)
            if start < 0:
                raise RuntimeError(
                    f"Evidence quote is not an exact source substring for {speaker}"
                )
            value["start_char"] = start
            value["end_char"] = start + len(quote)
            value["document_id"] = identity["document_id"]
            audited_items.add(
                (speaker, quote, start, start + len(quote), value["document_id"])
            )

        for child in value.values():
            visit(child, identity)

    for persona, identity in bindings:
        visit(persona, identity)
    if not audited_items:
        raise RuntimeError("Pipeline A returned no offset-linked evidence")
    return len(audited_items), sorted(
        {identity["document_id"] for _, identity in bindings}
    )


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
    request_config = getattr(request, "config", None)
    performance_profile = getattr(
        getattr(request_config, "performance_profile", None), "value", None
    ) or str(getattr(request_config, "performance_profile", "standard"))
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
            "performance_profile": performance_profile,
        },
    )
    if not empirical_personas:
        raise RuntimeError("Pipeline A returned no empirical personas")

    source_identities = _source_participant_identities(result)
    persona_bindings = _empirical_persona_bindings(
        empirical_personas, source_identities
    )
    empirical_personas = _bind_stakeholder_types(persona_bindings)
    rebound_bindings = [
        (persona, identity)
        for persona, (_, identity) in zip(empirical_personas, persona_bindings)
    ]
    audited_evidence_count, evidence_document_ids = _audit_evidence_offsets(
        rebound_bindings
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
        "performance_profile": performance_profile,
    }
    logger.info(
        "Closed-loop A+B: generated %s empirical personas for simulation %s",
        len(empirical_personas),
        simulation_id,
    )
    return result
