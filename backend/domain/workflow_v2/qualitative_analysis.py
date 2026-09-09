"""Pure, bounded qualitative-analysis artifacts and source-accounting checks.

This is not an operation, provider, entailment judge or source-access check.
Publication requires ``validate_qualitative_analysis`` with the caller's request,
scope, source references and frozen corpus. A model's proposed coverage is never
authority. Coverage records evidence/gap accounting, not comprehension, human
authenticity or population representativeness. Caller analysis questions and
source interview questions are different namespaces.

``source_statement`` is an exact extracted quotation under every support status:
all of its selected quote texts must equal the statement, with no paraphrase
or normalization. Wider summaries use ``interpretation``; source binding alone
does not establish that those interpretations are entailed.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, field_validator, model_validator

from backend.domain.workflow_v2.transcript_corpus import (
    MAX_CORPUS_DOCUMENTS,
    MAX_CORPUS_PARTICIPANTS,
    CorpusArtifactRefV1,
    SourceQuoteV1,
    TranscriptCorpusV1,
    _FrozenCorpusModel,
    _Id,
    _Sha256,
    _identifier,
    _ordered_sequence,
    _source_bytes,
    _uuid_value,
    transcript_corpus_hash,
    validate_source_quote,
    validate_transcript_corpus,
)
from backend.domain.workflow_v2.wire import canonical_hash, utf16_ordinal_sorted


MAX_ANALYSIS_QUESTIONS = 16
MAX_ANALYSIS_FINDINGS = 256
MAX_ANALYSIS_QUOTES = 256
MAX_ANALYSIS_GAPS = 128
MAX_ANALYSIS_QUOTE_BYTES = 128_000
MAX_ANALYSIS_TEXT_BYTES = 256_000

AnalysisOutput = Literal["personas", "jobs_pains"]
FindingCategory = Literal["job", "pain", "goal", "need", "trait"]
FindingBasis = Literal["source_statement", "interpretation", "simulation_hypothesis"]
FindingSupportStatus = Literal["supported", "insufficient", "conflicting"]
CoverageStatus = Literal["complete", "partial", "blocked"]
GapCode = Literal[
    "insufficient_evidence",
    "conflicting_evidence",
    "missing_participant_turns",
    "unanswered_question",
    "no_supported_output",
]
_Text = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=4000)]
_Label = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=500)]


def _nonblank(value: str) -> str:
    _source_bytes(value)
    if not value.strip():
        raise ValueError("analysis text must be nonblank")
    return value


def _unique(values: Any, description: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"{description} must be unique")


class AnalysisParticipantRefV1(_FrozenCorpusModel):
    document_id: UUID
    participant_id: _Id

    _uuid = field_validator("document_id", mode="before")(_uuid_value)
    _participant = field_validator("participant_id")(_identifier)


def _participant_key(reference: AnalysisParticipantRefV1) -> tuple[str, str]:
    return str(reference.document_id), reference.participant_id


def _sorted_refs(references: Any) -> list[dict[str, str]]:
    # Identity collections sort by their canonical-v1 SHA-256 hex digest.
    # This is language-independent hash ordering, not source/display-name order.
    keys = {
        canonical_hash(reference.model_dump(mode="json", by_alias=True)): reference
        for reference in references
    }
    return [keys[key].model_dump(mode="json", by_alias=True) for key in sorted(keys)]


class AnalysisQuestionV1(_FrozenCorpusModel):
    id: _Id
    text: _Text

    _id = field_validator("id")(_identifier)
    _text = field_validator("text")(_nonblank)


class AnalysisRequestV1(_FrozenCorpusModel):
    """Semantic request; every participant-role corpus entry is in scope.

    Questions concern the analysis/decision, not interview prompt IDs. Outputs
    are independent requested views; no participant/question/output Cartesian
    product or persona per question is implied.
    """

    decision_question: _Text
    questions: tuple[AnalysisQuestionV1, ...] = Field(
        min_length=1, max_length=MAX_ANALYSIS_QUESTIONS
    )
    outputs: tuple[AnalysisOutput, ...] = Field(min_length=1, max_length=2)
    analysis_profile: Literal["qualitative_v1"]

    _collections = field_validator("questions", "outputs", mode="before")(
        _ordered_sequence
    )
    _decision = field_validator("decision_question")(_nonblank)

    @model_validator(mode="after")
    def unique_request(self) -> "AnalysisRequestV1":
        _unique([question.id for question in self.questions], "analysis question IDs")
        _unique(self.outputs, "analysis outputs")
        return self


class _FindingContentV1(_FrozenCorpusModel):
    category: FindingCategory
    statement: _Text
    basis: FindingBasis
    support_status: FindingSupportStatus
    quote_ids: tuple[_Sha256, ...] = Field(max_length=MAX_ANALYSIS_QUOTES)
    question_ids: tuple[_Id, ...] = Field(
        min_length=1, max_length=MAX_ANALYSIS_QUESTIONS
    )
    participant_refs: tuple[AnalysisParticipantRefV1, ...] = Field(
        min_length=1, max_length=MAX_CORPUS_PARTICIPANTS
    )

    _collections = field_validator(
        "quote_ids", "question_ids", "participant_refs", mode="before"
    )(_ordered_sequence)
    _statement = field_validator("statement")(_nonblank)

    @model_validator(mode="after")
    def support_and_identity(self) -> "_FindingContentV1":
        for identity in self.question_ids:
            _identifier(identity)
        _unique(self.quote_ids, "finding quote IDs")
        _unique(self.question_ids, "finding question IDs")
        _unique(
            [_participant_key(reference) for reference in self.participant_refs],
            "finding participant references",
        )
        if self.support_status == "supported" and not self.quote_ids:
            raise ValueError("supported findings require source quotes")
        if self.basis == "source_statement" and not self.quote_ids:
            raise ValueError("source_statement findings require source quotes")
        return self


def _finding_identity(value: _FindingContentV1) -> str:
    return canonical_hash(
        {
            "category": value.category,
            "statement": value.statement,
            "basis": value.basis,
            "supportStatus": value.support_status,
            "quoteIds": sorted(value.quote_ids),
            "questionIds": utf16_ordinal_sorted(value.question_ids),
            "participantRefs": _sorted_refs(value.participant_refs),
        }
    )


class AnalysisFindingV1(_FindingContentV1):
    finding_id: _Sha256

    @model_validator(mode="after")
    def exact_identity(self) -> "AnalysisFindingV1":
        if self.finding_id != _finding_identity(self):
            raise ValueError("finding ID must bind its semantics and source references")
        return self


def create_analysis_finding(content: Mapping[str, Any]) -> AnalysisFindingV1:
    """Construct a self-consistent candidate; corpus admission is still required."""
    validated = _FindingContentV1.model_validate(content)
    return AnalysisFindingV1.model_validate(
        {
            **validated.model_dump(mode="json", by_alias=True),
            "findingId": _finding_identity(validated),
        }
    )


class _PersonaContentV1(_FrozenCorpusModel):
    # First-slice personas describe one source identity, never label-based clusters.
    participant_refs: tuple[AnalysisParticipantRefV1, ...] = Field(
        min_length=1, max_length=1
    )
    display_label: _Label
    origin: Literal["supplied_transcript", "synthetic_transcript"]
    trait_finding_ids: tuple[_Sha256, ...] = Field(
        min_length=1, max_length=MAX_ANALYSIS_FINDINGS
    )

    _collections = field_validator(
        "participant_refs", "trait_finding_ids", mode="before"
    )(_ordered_sequence)
    _label = field_validator("display_label")(_nonblank)

    @model_validator(mode="after")
    def unique_traits(self) -> "_PersonaContentV1":
        _unique(self.trait_finding_ids, "persona trait finding IDs")
        return self


def _persona_identity(value: _PersonaContentV1) -> str:
    # Display labels are presentation, not identity or evidence.
    return canonical_hash(
        {
            "type": "qualitative_persona_v1",
            "participantRefs": _sorted_refs(value.participant_refs),
            "traitFindingIds": sorted(value.trait_finding_ids),
            "origin": value.origin,
        }
    )


class AnalysisPersonaV1(_PersonaContentV1):
    persona_id: _Sha256

    @model_validator(mode="after")
    def exact_identity(self) -> "AnalysisPersonaV1":
        if self.persona_id != _persona_identity(self):
            raise ValueError("persona ID must bind its source identity and traits")
        return self


def create_analysis_persona(content: Mapping[str, Any]) -> AnalysisPersonaV1:
    validated = _PersonaContentV1.model_validate(content)
    return AnalysisPersonaV1.model_validate(
        {
            **validated.model_dump(mode="json", by_alias=True),
            "personaId": _persona_identity(validated),
        }
    )


class AnalysisGapV1(_FrozenCorpusModel):
    code: GapCode
    question_id: _Id | None
    participant_ref: AnalysisParticipantRefV1 | None
    output: AnalysisOutput | None
    message: _Text

    _question = field_validator("question_id")(_identifier)
    _message = field_validator("message")(_nonblank)

    @model_validator(mode="after")
    def explicit_target(self) -> "AnalysisGapV1":
        if (
            self.question_id is None
            and self.participant_ref is None
            and self.output is None
        ):
            raise ValueError("analysis gaps require an explicit coverage target")
        if self.code == "missing_participant_turns" and self.participant_ref is None:
            raise ValueError("missing-participant-turn gaps require a participant")
        if self.code == "unanswered_question" and self.question_id is None:
            raise ValueError("unanswered-question gaps require a question")
        if self.code == "no_supported_output" and self.output is None:
            raise ValueError("output gaps require an output")
        return self


class _CoverageRowV1(_FrozenCorpusModel):
    status: CoverageStatus
    issue_codes: tuple[GapCode, ...] = Field(max_length=5)

    _issues = field_validator("issue_codes", mode="before")(_ordered_sequence)

    @model_validator(mode="after")
    def unique_issues(self) -> "_CoverageRowV1":
        _unique(self.issue_codes, "coverage issue codes")
        return self


class AnalysisDocumentCoverageV1(_CoverageRowV1):
    document_id: UUID

    _uuid = field_validator("document_id", mode="before")(_uuid_value)


class AnalysisParticipantCoverageV1(_CoverageRowV1):
    document_id: UUID
    participant_id: _Id
    finding_ids: tuple[_Sha256, ...] = Field(max_length=MAX_ANALYSIS_FINDINGS)

    _uuid = field_validator("document_id", mode="before")(_uuid_value)
    _participant = field_validator("participant_id")(_identifier)
    _findings = field_validator("finding_ids", mode="before")(_ordered_sequence)


class AnalysisQuestionCoverageV1(_FrozenCorpusModel):
    question_id: _Id
    status: Literal["answered", "partial", "insufficient"]
    finding_ids: tuple[_Sha256, ...] = Field(max_length=MAX_ANALYSIS_FINDINGS)
    issue_codes: tuple[GapCode, ...] = Field(max_length=5)

    _question = field_validator("question_id")(_identifier)
    _collections = field_validator("finding_ids", "issue_codes", mode="before")(
        _ordered_sequence
    )


class AnalysisOutputCoverageV1(_CoverageRowV1):
    output: AnalysisOutput
    entry_ids: tuple[_Sha256, ...] = Field(max_length=MAX_ANALYSIS_FINDINGS)

    _entries = field_validator("entry_ids", mode="before")(_ordered_sequence)


class AnalysisQuoteLineageV1(_FrozenCorpusModel):
    quote_id: _Sha256
    interview_question_id: _Id | None

    _question = field_validator("interview_question_id")(_identifier)


class _AnalysisContentV1(_FrozenCorpusModel):
    schema_version: Literal["axwise.qualitative-analysis.v1"]
    accepted_scope: CorpusArtifactRefV1
    source_artifacts: tuple[CorpusArtifactRefV1, ...] = Field(
        min_length=1, max_length=16
    )
    corpus_hash: _Sha256
    request: AnalysisRequestV1
    method_version: _Id
    quotes: tuple[SourceQuoteV1, ...] = Field(max_length=MAX_ANALYSIS_QUOTES)
    findings: tuple[AnalysisFindingV1, ...] = Field(max_length=MAX_ANALYSIS_FINDINGS)
    personas: tuple[AnalysisPersonaV1, ...] = Field(max_length=MAX_CORPUS_PARTICIPANTS)
    gaps: tuple[AnalysisGapV1, ...] = Field(max_length=MAX_ANALYSIS_GAPS)
    limitations: tuple[_Text, ...] = Field(max_length=16)

    _collections = field_validator(
        "source_artifacts",
        "quotes",
        "findings",
        "personas",
        "gaps",
        "limitations",
        mode="before",
    )(_ordered_sequence)
    _method = field_validator("method_version")(_identifier)

    @model_validator(mode="after")
    def identities_and_limits(self) -> "_AnalysisContentV1":
        if self.accepted_scope.kind != "scope":
            raise ValueError("analysis accepted scope must reference a scope artifact")
        if any(
            ref.kind not in {"transcript_corpus", "simulation"}
            for ref in self.source_artifacts
        ):
            raise ValueError(
                "analysis sources must be transcript-corpus or simulation artifacts"
            )
        _unique(
            [ref.artifact_id for ref in self.source_artifacts], "source artifact IDs"
        )
        _unique([quote.quote_id for quote in self.quotes], "analysis quote IDs")
        _unique(
            [finding.finding_id for finding in self.findings], "analysis finding IDs"
        )
        _unique(
            [persona.persona_id for persona in self.personas], "analysis persona IDs"
        )
        _unique(
            [
                _participant_key(persona.participant_refs[0])
                for persona in self.personas
            ],
            "persona source identities",
        )
        _unique(
            [
                (
                    gap.code,
                    gap.question_id,
                    (
                        _participant_key(gap.participant_ref)
                        if gap.participant_ref
                        else None
                    ),
                    gap.output,
                )
                for gap in self.gaps
            ],
            "analysis gap targets",
        )
        for limitation in self.limitations:
            _nonblank(limitation)
        if (
            sum(len(_source_bytes(quote.text)) for quote in self.quotes)
            > MAX_ANALYSIS_QUOTE_BYTES
        ):
            raise ValueError("analysis exceeds aggregate quote UTF-8 byte limit")
        texts = [self.request.decision_question]
        texts.extend(question.text for question in self.request.questions)
        texts.extend(finding.statement for finding in self.findings)
        texts.extend(persona.display_label for persona in self.personas)
        texts.extend(gap.message for gap in self.gaps)
        texts.extend(self.limitations)
        if sum(len(_source_bytes(text)) for text in texts) > MAX_ANALYSIS_TEXT_BYTES:
            raise ValueError("analysis exceeds aggregate derived-text UTF-8 byte limit")
        return self


class QualitativeAnalysisV1(_AnalysisContentV1):
    """Self-consistent wire value; use the admission helper before publication."""

    coverage_status: CoverageStatus
    document_coverage: tuple[AnalysisDocumentCoverageV1, ...] = Field(
        min_length=1, max_length=MAX_CORPUS_DOCUMENTS
    )
    participant_coverage: tuple[AnalysisParticipantCoverageV1, ...] = Field(
        min_length=1, max_length=MAX_CORPUS_PARTICIPANTS
    )
    question_coverage: tuple[AnalysisQuestionCoverageV1, ...] = Field(
        min_length=1, max_length=MAX_ANALYSIS_QUESTIONS
    )
    output_coverage: tuple[AnalysisOutputCoverageV1, ...] = Field(
        min_length=1, max_length=2
    )
    quote_lineage: tuple[AnalysisQuoteLineageV1, ...] = Field(
        max_length=MAX_ANALYSIS_QUOTES
    )

    _coverage = field_validator(
        "document_coverage",
        "participant_coverage",
        "question_coverage",
        "output_coverage",
        "quote_lineage",
        mode="before",
    )(_ordered_sequence)


def validate_analysis_request(
    request: AnalysisRequestV1 | Mapping[str, Any],
    corpus: TranscriptCorpusV1 | Mapping[str, Any],
) -> AnalysisRequestV1:
    """Reject later document-only ingestion and require participant transcript turns."""
    result = AnalysisRequestV1.model_validate(request)
    source = validate_transcript_corpus(corpus)
    if any(document.origin == "supplied_document" for document in source.documents):
        raise ValueError("document-only sources are not supported by qualitative_v1")
    if any(
        not any(person.role == "participant" for person in document.participants)
        for document in source.documents
    ):
        raise ValueError(
            "each analysis document requires a source participant identity"
        )
    if not any(
        turn.participant_id
        in {
            person.participant_id
            for person in document.participants
            if person.role == "participant"
        }
        for document in source.documents
        for turn in document.turns
    ):
        raise ValueError("qualitative_v1 requires participant transcript turns")
    return result


def _row_status(entries: Any, issues: Any) -> CoverageStatus:
    return "blocked" if not entries else "partial" if issues else "complete"


def _group_status(statuses: Any) -> CoverageStatus:
    return (
        "complete"
        if all(status == "complete" for status in statuses)
        else "blocked" if all(status == "blocked" for status in statuses) else "partial"
    )


_COVERAGE_FIELDS = (
    "coverageStatus",
    "documentCoverage",
    "participantCoverage",
    "questionCoverage",
    "outputCoverage",
    "quoteLineage",
)


def _derive_coverage(
    value: _AnalysisContentV1, source: TranscriptCorpusV1
) -> dict[str, Any]:
    validate_analysis_request(value.request, source)
    if value.corpus_hash != transcript_corpus_hash(source):
        raise ValueError("analysis corpus hash does not match the frozen input")
    participants = {
        (str(document.document_id), person.participant_id)
        for document in source.documents
        for person in document.participants
        if person.role == "participant"
    }
    turns = {
        (str(document.document_id), turn.turn_id): turn
        for document in source.documents
        for turn in document.turns
    }
    participants_with_turns = {
        (document_id, turn.participant_id) for (document_id, _), turn in turns.items()
    }
    questions = {question.id for question in value.request.questions}
    outputs = set(value.request.outputs)
    synthetic_participants = {
        (str(document.document_id), person.participant_id)
        for document in source.documents
        if document.origin == "synthetic_transcript"
        for person in document.participants
    }
    quotes = {
        quote.quote_id: validate_source_quote(source, quote) for quote in value.quotes
    }
    used_quotes: set[str] = set()
    supported: dict[str, AnalysisFindingV1] = {}
    for finding in value.findings:
        refs = {_participant_key(ref) for ref in finding.participant_refs}
        if not refs <= participants:
            raise ValueError(
                "finding names an absent or non-participant source identity"
            )
        if not set(finding.question_ids) <= questions:
            raise ValueError("finding names an unrequested analysis question")
        if not set(finding.quote_ids) <= quotes.keys():
            raise ValueError("finding names an absent source quote")
        selected = [quotes[identity] for identity in finding.quote_ids]
        if selected and refs != {
            (str(quote.document_id), quote.participant_id) for quote in selected
        }:
            raise ValueError(
                "finding participants must exactly match its quote speakers"
            )
        if finding.basis == "source_statement" and any(
            finding.statement != quote.text for quote in selected
        ):
            raise ValueError(
                "source_statement must be the exact text of every selected source quote"
            )
        if (
            any(quote.origin == "synthetic_transcript" for quote in selected)
            and finding.basis != "simulation_hypothesis"
        ):
            raise ValueError(
                "synthetic or mixed support must remain simulation_hypothesis"
            )
        # A zero-quote candidate about a synthetic participant is still synthetic.
        if refs & synthetic_participants and finding.basis != "simulation_hypothesis":
            raise ValueError(
                "synthetic participant findings must remain simulation_hypothesis"
            )
        required_output = "personas" if finding.category == "trait" else "jobs_pains"
        if required_output not in outputs:
            raise ValueError("finding category belongs to an unrequested output")
        used_quotes.update(finding.quote_ids)
        if finding.support_status == "supported":
            supported[finding.finding_id] = finding
        elif not any(
            (
                gap.question_id in finding.question_ids
                or (
                    gap.participant_ref is not None
                    and _participant_key(gap.participant_ref) in refs
                )
            )
            and gap.code
            in (
                {"conflicting_evidence"}
                if finding.support_status == "conflicting"
                else {
                    "insufficient_evidence",
                    "missing_participant_turns",
                    "unanswered_question",
                }
            )
            for gap in value.gaps
        ):
            raise ValueError(
                "unsupported findings require an explicit matching evidence gap"
            )
    if used_quotes != quotes.keys():
        raise ValueError("unused quotes cannot pad analysis source coverage")
    if value.personas and "personas" not in outputs:
        raise ValueError("personas were not requested")
    for persona in value.personas:
        identity = _participant_key(persona.participant_refs[0])
        if identity not in participants:
            raise ValueError("persona names an absent source participant")
        origin = (
            "synthetic_transcript"
            if identity in synthetic_participants
            else "supplied_transcript"
        )
        if persona.origin != origin:
            raise ValueError("persona origin must match its source participant lineage")
        for finding_id in persona.trait_finding_ids:
            finding = supported.get(finding_id)
            if finding is None or finding.category != "trait":
                raise ValueError("persona traits require supported trait findings")
            if {_participant_key(ref) for ref in finding.participant_refs} != {
                identity
            }:
                raise ValueError(
                    "persona traits cannot merge source participant identities"
                )
    for gap in value.gaps:
        if gap.question_id is not None and gap.question_id not in questions:
            raise ValueError("gap names an unrequested analysis question")
        if gap.output is not None and gap.output not in outputs:
            raise ValueError("gap names an unrequested output")
        if gap.participant_ref is not None:
            identity = _participant_key(gap.participant_ref)
            if identity not in participants:
                raise ValueError(
                    "gap names an absent or non-participant source identity"
                )
            if (
                gap.code == "missing_participant_turns"
                and identity in participants_with_turns
            ):
                raise ValueError("missing-participant-turn gap contradicts the source")
    participant_rows = []
    # Document UUIDs are ASCII; participant IDs use canonical-v1 UTF-16 order,
    # matching JavaScript even for astral/BMP characters.
    for document_id, participant_id in sorted(
        participants,
        key=lambda item: (item[0].encode("utf-16-be"), item[1].encode("utf-16-be")),
    ):
        finding_ids = sorted(
            identity
            for identity, finding in supported.items()
            if (document_id, participant_id)
            in {_participant_key(ref) for ref in finding.participant_refs}
        )
        issues = sorted(
            {
                gap.code
                for gap in value.gaps
                if gap.participant_ref is not None
                and _participant_key(gap.participant_ref)
                == (document_id, participant_id)
            }
        )
        if not finding_ids and not issues:
            raise ValueError(
                "every source participant requires supported evidence or an explicit gap"
            )
        participant_rows.append(
            {
                "documentId": document_id,
                "participantId": participant_id,
                "status": _row_status(finding_ids, issues),
                "issueCodes": issues,
                "findingIds": finding_ids,
            }
        )
    question_rows = []
    for question_id in utf16_ordinal_sorted(questions):
        finding_ids = sorted(
            identity
            for identity, finding in supported.items()
            if question_id in finding.question_ids
        )
        issues = sorted(
            {gap.code for gap in value.gaps if gap.question_id == question_id}
        )
        if not finding_ids and not issues:
            raise ValueError(
                "every analysis question requires an answer or an explicit gap"
            )
        question_rows.append(
            {
                "questionId": question_id,
                "status": (
                    "insufficient"
                    if not finding_ids
                    else "partial" if issues else "answered"
                ),
                "findingIds": finding_ids,
                "issueCodes": issues,
            }
        )
    output_rows = []
    for output in sorted(outputs):
        entries = sorted(
            [persona.persona_id for persona in value.personas]
            if output == "personas"
            else [
                identity
                for identity, finding in supported.items()
                if finding.category != "trait"
            ]
        )
        issues = sorted({gap.code for gap in value.gaps if gap.output == output})
        if not entries and not issues:
            raise ValueError(
                "every requested output requires supported entries or an explicit gap"
            )
        output_rows.append(
            {
                "output": output,
                "status": _row_status(entries, issues),
                "entryIds": entries,
                "issueCodes": issues,
            }
        )
    document_rows = []
    for document in sorted(source.documents, key=lambda item: str(item.document_id)):
        rows = [
            row
            for row in participant_rows
            if row["documentId"] == str(document.document_id)
        ]
        document_rows.append(
            {
                "documentId": str(document.document_id),
                "status": _group_status([row["status"] for row in rows]),
                "issueCodes": sorted(
                    {issue for row in rows for issue in row["issueCodes"]}
                ),
            }
        )
    complete = all(
        row["status"] == "complete" for row in participant_rows + output_rows
    ) and all(row["status"] == "answered" for row in question_rows)
    return {
        "coverageStatus": (
            "complete" if complete else "partial" if supported else "blocked"
        ),
        "documentCoverage": document_rows,
        "participantCoverage": participant_rows,
        "questionCoverage": question_rows,
        "outputCoverage": output_rows,
        "quoteLineage": [
            {
                "quoteId": identity,
                "interviewQuestionId": turns[
                    (str(quote.document_id), quote.turn_id)
                ].question_id,
            }
            for identity, quote in sorted(quotes.items())
        ],
    }


def build_qualitative_analysis(
    *,
    corpus: TranscriptCorpusV1 | Mapping[str, Any],
    request: AnalysisRequestV1 | Mapping[str, Any],
    accepted_scope: CorpusArtifactRefV1 | Mapping[str, Any],
    source_artifacts: list[Any] | tuple[Any, ...],
    method_version: str,
    quotes: list[Any] | tuple[Any, ...],
    findings: list[Any] | tuple[Any, ...],
    personas: list[Any] | tuple[Any, ...],
    gaps: list[Any] | tuple[Any, ...],
    limitations: list[str] | tuple[str, ...],
) -> QualitativeAnalysisV1:
    """Admit candidate content and derive coverage; no quote or label is repaired."""
    source = validate_transcript_corpus(corpus)
    content = _AnalysisContentV1.model_validate(
        {
            "schemaVersion": "axwise.qualitative-analysis.v1",
            "acceptedScope": accepted_scope,
            "sourceArtifacts": source_artifacts,
            "corpusHash": transcript_corpus_hash(source),
            "request": request,
            "methodVersion": method_version,
            "quotes": quotes,
            "findings": findings,
            "personas": personas,
            "gaps": gaps,
            "limitations": limitations,
        }
    )
    return QualitativeAnalysisV1.model_validate(
        {
            **content.model_dump(mode="json", by_alias=True),
            **_derive_coverage(content, source),
        }
    )


def validate_qualitative_analysis(
    value: QualitativeAnalysisV1 | Mapping[str, Any],
    *,
    corpus: TranscriptCorpusV1 | Mapping[str, Any],
    request: AnalysisRequestV1 | Mapping[str, Any],
    accepted_scope: CorpusArtifactRefV1 | Mapping[str, Any],
    source_artifacts: list[Any] | tuple[Any, ...],
) -> QualitativeAnalysisV1:
    """Rebind persisted/provider artifacts to authoritative caller inputs.

    The caller resolves artifact ownership and trusted origin before this check.
    Empty-but-gapped artifacts describe insufficient evidence only; callers must
    never use them to convert provider/provenance/execution failure into success.
    """
    candidate = QualitativeAnalysisV1.model_validate(value)
    source = validate_transcript_corpus(corpus)
    if candidate.request != validate_analysis_request(request, source):
        raise ValueError(
            "analysis request differs from the caller's requested decision and outputs"
        )
    if candidate.accepted_scope != CorpusArtifactRefV1.model_validate(accepted_scope):
        raise ValueError("analysis scope differs from the accepted caller scope")
    raw_refs = _ordered_sequence(source_artifacts)
    if not 1 <= len(raw_refs) <= 16:
        raise ValueError("caller source references must be bounded and nonempty")
    expected_refs = tuple(CorpusArtifactRefV1.model_validate(ref) for ref in raw_refs)
    _unique([ref.artifact_id for ref in expected_refs], "caller source artifact IDs")
    key = lambda ref: str(ref.artifact_id)
    if sorted(candidate.source_artifacts, key=key) != sorted(expected_refs, key=key):
        raise ValueError(
            "analysis source references differ from the caller's admitted artifacts"
        )
    derived = _derive_coverage(candidate, source)
    wire = candidate.model_dump(mode="json", by_alias=True)
    if any(wire[field] != derived[field] for field in _COVERAGE_FIELDS):
        raise ValueError(
            "analysis coverage and interview-question lineage must equal derived source accounting"
        )
    return candidate


__all__ = [
    "MAX_ANALYSIS_QUESTIONS",
    "MAX_ANALYSIS_FINDINGS",
    "MAX_ANALYSIS_QUOTES",
    "MAX_ANALYSIS_GAPS",
    "MAX_ANALYSIS_QUOTE_BYTES",
    "MAX_ANALYSIS_TEXT_BYTES",
    "AnalysisOutput",
    "FindingCategory",
    "FindingBasis",
    "FindingSupportStatus",
    "CoverageStatus",
    "GapCode",
    "AnalysisParticipantRefV1",
    "AnalysisQuestionV1",
    "AnalysisRequestV1",
    "AnalysisFindingV1",
    "AnalysisPersonaV1",
    "AnalysisGapV1",
    "AnalysisDocumentCoverageV1",
    "AnalysisParticipantCoverageV1",
    "AnalysisQuestionCoverageV1",
    "AnalysisOutputCoverageV1",
    "AnalysisQuoteLineageV1",
    "QualitativeAnalysisV1",
    "create_analysis_finding",
    "create_analysis_persona",
    "validate_analysis_request",
    "build_qualitative_analysis",
    "validate_qualitative_analysis",
]
