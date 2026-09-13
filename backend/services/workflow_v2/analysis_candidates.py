"""Bounded provider proposals and deterministic qualitative artifact materialization.

Provider keys are local handles, never published identities or source authority.
This module does not resolve access, call a model, or persist work.
"""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from backend.domain.workflow_v2.qualitative_analysis import (
    AnalysisGapV1,
    AnalysisParticipantRefV1,
    AnalysisRequestV1,
    QualitativeAnalysisV1,
    build_qualitative_analysis,
    create_analysis_finding,
    create_analysis_persona,
    validate_qualitative_analysis,
)
from backend.domain.workflow_v2.transcript_corpus import (
    CorpusArtifactRefV1,
    TranscriptCorpusV1,
    _FrozenCorpusModel,
    _Id,
    _identifier,
    _ordered_sequence,
    _uuid_value,
    extract_source_quote,
    validate_transcript_corpus,
)


ANALYSIS_METHOD_VERSION = "qualitative_v1.exact_spans.1"
ANALYSIS_LIMITATIONS = (
    "Supplied transcripts are not independently verified human testimony or population evidence.",
    "Coverage records source accounting; labelled interpretations are not independently verified facts.",
)


class AnalysisQuoteCandidateV1(_FrozenCorpusModel):
    key: _Id
    document_id: UUID
    turn_id: _Id
    participant_id: _Id
    start: int = Field(strict=True, ge=0, le=128_000)
    end: int = Field(strict=True, gt=0, le=128_000)
    text: str = Field(strict=True, min_length=1, max_length=128_000)

    _ids = field_validator("key", "turn_id", "participant_id")(_identifier)
    _uuid = field_validator("document_id", mode="before")(_uuid_value)


class AnalysisFindingCandidateV1(_FrozenCorpusModel):
    key: _Id
    category: Literal["job", "pain", "goal", "need", "trait"]
    statement: str = Field(strict=True, min_length=1, max_length=4000)
    basis: Literal["source_statement", "interpretation", "simulation_hypothesis"]
    support_status: Literal["supported", "insufficient", "conflicting"]
    quote_keys: tuple[_Id, ...] = Field(max_length=256)
    question_ids: tuple[_Id, ...] = Field(min_length=1, max_length=16)
    participant_refs: tuple[AnalysisParticipantRefV1, ...] = Field(
        min_length=1, max_length=32
    )

    _key = field_validator("key")(_identifier)
    _collections = field_validator(
        "quote_keys", "question_ids", "participant_refs", mode="before"
    )(_ordered_sequence)


class AnalysisPersonaCandidateV1(_FrozenCorpusModel):
    participant_ref: AnalysisParticipantRefV1
    display_label: str = Field(strict=True, min_length=1, max_length=500)
    trait_finding_keys: tuple[_Id, ...] = Field(min_length=1, max_length=256)

    _traits = field_validator("trait_finding_keys", mode="before")(_ordered_sequence)


class AnalysisCandidateV1(_FrozenCorpusModel):
    quotes: tuple[AnalysisQuoteCandidateV1, ...] = Field(max_length=256)
    findings: tuple[AnalysisFindingCandidateV1, ...] = Field(max_length=256)
    personas: tuple[AnalysisPersonaCandidateV1, ...] = Field(max_length=32)
    gaps: tuple[AnalysisGapV1, ...] = Field(max_length=128)
    limitations: tuple[str, ...] = Field(max_length=14)

    _collections = field_validator(
        "quotes", "findings", "personas", "gaps", "limitations", mode="before"
    )(_ordered_sequence)

    @model_validator(mode="after")
    def unique_keys(self) -> "AnalysisCandidateV1":
        for values in (self.quotes, self.findings):
            if len({value.key for value in values}) != len(values):
                raise ValueError("analysis candidate keys must be unique")
        for limitation in self.limitations:
            if not 1 <= len(limitation) <= 4000 or not limitation.strip():
                raise ValueError("analysis candidate limitations must be bounded text")
        return self


def materialize_analysis(
    candidate: AnalysisCandidateV1,
    *,
    corpus: TranscriptCorpusV1,
    request: AnalysisRequestV1,
    accepted_scope: CorpusArtifactRefV1,
    source_artifacts: tuple[CorpusArtifactRefV1, ...],
) -> QualitativeAnalysisV1:
    """Construct every published identity and quote from authoritative inputs."""
    proposed = AnalysisCandidateV1.model_validate(candidate)
    source = validate_transcript_corpus(corpus)
    quotes = {
        quote.key: extract_source_quote(
            source,
            document_id=quote.document_id,
            turn_id=quote.turn_id,
            participant_id=quote.participant_id,
            start=quote.start,
            end=quote.end,
            candidate_text=quote.text,
        )
        for quote in proposed.quotes
    }
    findings = {}
    for finding in proposed.findings:
        if any(key not in quotes for key in finding.quote_keys):
            raise ValueError("analysis finding names an unknown quote key")
        findings[finding.key] = create_analysis_finding(
            {
                "category": finding.category,
                "statement": finding.statement,
                "basis": finding.basis,
                "supportStatus": finding.support_status,
                "quoteIds": [quotes[key].quote_id for key in finding.quote_keys],
                "questionIds": list(finding.question_ids),
                "participantRefs": list(finding.participant_refs),
            }
        )
    documents = {document.document_id: document for document in source.documents}
    personas = []
    for persona in proposed.personas:
        if persona.participant_ref.document_id not in documents or any(
            key not in findings for key in persona.trait_finding_keys
        ):
            raise ValueError("analysis persona names an unknown source identity")
        origin = documents[persona.participant_ref.document_id].origin
        personas.append(
            create_analysis_persona(
                {
                    "participantRefs": [persona.participant_ref],
                    "displayLabel": persona.display_label,
                    "origin": origin,
                    "traitFindingIds": [
                        findings[key].finding_id for key in persona.trait_finding_keys
                    ],
                }
            )
        )
    analysis = build_qualitative_analysis(
        corpus=source,
        request=request,
        accepted_scope=accepted_scope,
        source_artifacts=source_artifacts,
        method_version=ANALYSIS_METHOD_VERSION,
        quotes=list(quotes.values()),
        findings=list(findings.values()),
        personas=personas,
        gaps=list(proposed.gaps),
        limitations=list(dict.fromkeys((*ANALYSIS_LIMITATIONS, *proposed.limitations))),
    )
    return validate_qualitative_analysis(
        analysis,
        corpus=source,
        request=request,
        accepted_scope=accepted_scope,
        source_artifacts=source_artifacts,
    )


__all__ = [
    "ANALYSIS_METHOD_VERSION",
    "AnalysisCandidateV1",
    "AnalysisQuoteCandidateV1",
    "AnalysisFindingCandidateV1",
    "AnalysisPersonaCandidateV1",
    "materialize_analysis",
]
