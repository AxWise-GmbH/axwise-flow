"""Model-free adversarial admission tests for qualitative analysis artifacts."""

from __future__ import annotations

import copy
import hashlib
import subprocess
import sys
from types import MappingProxyType

import pytest
from pydantic import ValidationError

from backend.domain.workflow_v2.qualitative_analysis import (
    AnalysisFindingV1,
    AnalysisGapV1,
    AnalysisParticipantRefV1,
    AnalysisPersonaV1,
    AnalysisQuestionV1,
    AnalysisRequestV1,
    QualitativeAnalysisV1,
    build_qualitative_analysis,
    create_analysis_finding,
    create_analysis_persona,
    validate_analysis_request,
    validate_qualitative_analysis,
)
from backend.domain.workflow_v2.transcript_corpus import (
    CorpusArtifactRefV1,
    SourceQuoteV1,
    TranscriptCorpusV1,
    extract_source_quote,
    transcript_corpus_hash,
)
from backend.domain.workflow_v2.wire import canonical_hash


pytestmark = pytest.mark.contract


def uid(number=1):
    return f"00000000-0000-4000-8000-{number:012d}"


def ref(number=1, participant_id="p1"):
    return {"documentId": uid(number), "participantId": participant_id}


def source_document(
    number=1,
    *,
    origin="supplied_transcript",
    question=None,
    text="I lose time copying status updates.",
):
    return {
        "documentId": uid(number),
        "title": "Frozen transcript",
        "text": text,
        "textSha256": hashlib.sha256(text.encode()).hexdigest(),
        "origin": origin,
        "originArtifactRefs": [],
        "participants": [
            {
                "participantId": "p1",
                "displayName": "Sam",
                "role": "participant",
                "stakeholderId": None,
            }
        ],
        "turns": [
            {
                "turnId": "t1",
                "participantId": "p1",
                "questionId": question,
                "start": 0,
                "end": len(text.encode()),
                "offsetUnit": "utf8_bytes",
            }
        ],
    }


def corpus(*documents):
    return TranscriptCorpusV1.model_validate(
        {
            "schemaVersion": "axwise.transcript-corpus.v1",
            "documents": list(documents or [source_document()]),
        }
    )


def request(*, outputs=None, questions=None):
    return {
        "decisionQuestion": "Which workflow should we improve?",
        "questions": questions
        or [{"id": "analysis-pain", "text": "What is difficult?"}],
        "outputs": outputs or ["jobs_pains"],
        "analysisProfile": "qualitative_v1",
    }


def quote(
    source, number=1, *, turn="t1", participant="p1", start=0, end=None, **kwargs
):
    doc = next(doc for doc in source.documents if str(doc.document_id) == uid(number))
    selected_turn = next(item for item in doc.turns if item.turn_id == turn)
    return extract_source_quote(
        source,
        document_id=uid(number),
        turn_id=turn,
        participant_id=participant,
        start=start,
        end=selected_turn.end if end is None else end,
        **kwargs,
    )


def finding(
    quotes=(),
    *,
    participants=None,
    questions=None,
    category="pain",
    basis="source_statement",
    status="supported",
    statement=None,
):
    if statement is None:
        statement = (
            quotes[0].text
            if quotes and basis == "source_statement"
            else "Copying status updates costs time."
        )
    return create_analysis_finding(
        {
            "category": category,
            "statement": statement,
            "basis": basis,
            "supportStatus": status,
            "quoteIds": [item.quote_id for item in quotes],
            "questionIds": questions or ["analysis-pain"],
            "participantRefs": participants or [ref()],
        }
    )


def persona(traits, *, participant=None, label="Sam", origin="supplied_transcript"):
    return create_analysis_persona(
        {
            "participantRefs": [participant or ref()],
            "displayLabel": label,
            "origin": origin,
            "traitFindingIds": [item.finding_id for item in traits],
        }
    )


def gap(*, code="insufficient_evidence", question=None, participant=None, output=None):
    return {
        "code": code,
        "questionId": question,
        "participantRef": participant,
        "output": output,
        "message": "The available material does not support this conclusion.",
    }


def fixture(*, source=None, analysis_request=None):
    source = source or corpus()
    selected = quote(source)
    item = finding([selected])
    return {
        "corpus": source,
        "request": analysis_request or request(),
        "accepted_scope": {
            "artifactId": uid(91),
            "artifactHash": "a" * 64,
            "kind": "scope",
        },
        "source_artifacts": [
            {
                "artifactId": uid(92),
                "artifactHash": "b" * 64,
                "kind": "transcript_corpus",
            }
        ],
        "method_version": "qualitative_v1.test",
        "quotes": [selected],
        "findings": [item],
        "personas": [],
        "gaps": [],
        "limitations": ["Source acquisition is not proof of human authenticity."],
    }


def admit(value, inputs, **overrides):
    context = {
        key: inputs[key]
        for key in ("corpus", "request", "accepted_scope", "source_artifacts")
    }
    context.update(overrides)
    return validate_qualitative_analysis(value, **context)


def wire(value):
    return value.model_dump(mode="json", by_alias=True)


def test_complete_artifact_round_trips_and_coverage_is_derived():
    inputs = fixture()
    original = copy.deepcopy(inputs)
    result = build_qualitative_analysis(**inputs)
    assert admit(wire(result), inputs) == result
    assert result.coverage_status == "complete"
    assert result.participant_coverage[0].finding_ids == (
        inputs["findings"][0].finding_id,
    )
    assert result.question_coverage[0].status == "answered"
    assert result.output_coverage[0].output == "jobs_pains"
    assert result.quote_lineage[0].interview_question_id is None
    assert inputs == original
    assert isinstance(result.findings, tuple)
    assert isinstance(result.findings[0].quote_ids, tuple)


@pytest.mark.parametrize(
    "interview_question", [None, "interview-prompt-7", "analysis-pain"]
)
def test_analysis_questions_are_not_interview_question_ids(interview_question):
    inputs = fixture(source=corpus(source_document(question=interview_question)))
    result = build_qualitative_analysis(**inputs)
    assert result.question_coverage[0].question_id == "analysis-pain"
    assert result.quote_lineage[0].interview_question_id == interview_question
    assert admit(result, inputs) == result


def test_all_questions_and_participants_are_accounted_without_cartesian_product():
    source = corpus(source_document(), source_document(2))
    inputs = fixture(
        source=source,
        analysis_request=request(
            questions=[
                {"id": "analysis-pain", "text": "What is difficult?"},
                {"id": "analysis-need", "text": "What would help?"},
            ]
        ),
    )
    other_quote = quote(source, 2)
    inputs["quotes"].append(other_quote)
    inputs["findings"].append(
        finding([other_quote], participants=[ref(2)], questions=["analysis-need"])
    )
    result = build_qualitative_analysis(**inputs)
    assert result.coverage_status == "complete"
    assert len(result.participant_coverage) == 2
    assert len(result.question_coverage) == 2
    assert all(len(row.finding_ids) == 1 for row in result.question_coverage)


@pytest.mark.parametrize("category", ["job", "pain", "goal", "need"])
def test_jobs_pains_supports_first_slice_non_trait_categories(category):
    inputs = fixture()
    inputs["findings"] = [
        finding(inputs["quotes"], category=category, basis="interpretation")
    ]
    result = build_qualitative_analysis(**inputs)
    assert result.findings[0].basis == "interpretation"


def test_persona_identity_uses_source_binding_not_duplicate_display_labels():
    source = corpus(source_document(), source_document(2))
    inputs = fixture(source=source, analysis_request=request(outputs=["personas"]))
    inputs["quotes"] = [quote(source), quote(source, 2)]
    inputs["findings"] = [
        finding(
            [selected],
            participants=[ref(number)],
            category="trait",
            basis="interpretation",
        )
        for number, selected in enumerate(inputs["quotes"], 1)
    ]
    inputs["personas"] = [
        persona([trait], participant=ref(number))
        for number, trait in enumerate(inputs["findings"], 1)
    ]
    result = build_qualitative_analysis(**inputs)
    assert result.personas[0].display_label == result.personas[1].display_label
    assert result.personas[0].persona_id != result.personas[1].persona_id
    assert result.coverage_status == "complete"
    renamed = persona([inputs["findings"][0]], label="Presentation label changed")
    assert renamed.persona_id == result.personas[0].persona_id


def test_one_persona_is_not_required_for_every_analysis_question():
    inputs = fixture(
        analysis_request=request(
            outputs=["personas"],
            questions=[
                {"id": "analysis-pain", "text": "What is difficult?"},
                {"id": "analysis-need", "text": "What would help?"},
            ],
        )
    )
    inputs["findings"] = [
        finding(
            inputs["quotes"],
            category="trait",
            questions=["analysis-pain", "analysis-need"],
        )
    ]
    inputs["personas"] = [persona(inputs["findings"])]
    result = build_qualitative_analysis(**inputs)
    assert len(result.personas) == 1
    assert len(result.question_coverage) == 2
    assert result.coverage_status == "complete"


@pytest.mark.parametrize("origin", ["supplied_transcript", "synthetic_transcript"])
def test_persona_carries_exact_origin_without_requiring_consumers_to_traverse_quotes(
    origin,
):
    source = corpus(source_document(origin=origin, question="interview-prompt"))
    inputs = fixture(source=source, analysis_request=request(outputs=["personas"]))
    inputs["findings"] = [
        finding(
            inputs["quotes"],
            category="trait",
            basis=(
                "simulation_hypothesis"
                if origin == "synthetic_transcript"
                else "interpretation"
            ),
        )
    ]
    inputs["personas"] = [persona(inputs["findings"], origin=origin)]
    result = build_qualitative_analysis(**inputs)
    assert wire(result)["personas"][0]["origin"] == origin
    wrong_origin = (
        "supplied_transcript"
        if origin == "synthetic_transcript"
        else "synthetic_transcript"
    )
    wrong_persona = persona(inputs["findings"], origin=wrong_origin)
    assert wrong_persona.persona_id != result.personas[0].persona_id
    inputs["personas"] = [wrong_persona]
    with pytest.raises(ValueError, match="persona origin"):
        build_qualitative_analysis(**inputs)


def test_mixed_corpus_personas_preserve_individual_origin():
    source = corpus(
        source_document(),
        source_document(2, origin="synthetic_transcript", question="sim-interview"),
    )
    inputs = fixture(source=source, analysis_request=request(outputs=["personas"]))
    inputs["quotes"] = [quote(source), quote(source, 2)]
    inputs["findings"] = [
        finding([inputs["quotes"][0]], category="trait", basis="interpretation"),
        finding(
            [inputs["quotes"][1]],
            participants=[ref(2)],
            category="trait",
            basis="simulation_hypothesis",
        ),
    ]
    inputs["personas"] = [
        persona([inputs["findings"][0]]),
        persona(
            [inputs["findings"][1]], participant=ref(2), origin="synthetic_transcript"
        ),
    ]
    result = build_qualitative_analysis(**inputs)
    assert [item.origin for item in result.personas] == [
        "supplied_transcript",
        "synthetic_transcript",
    ]
    assert admit(result, inputs) == result


def test_participant_and_question_coverage_order_matches_javascript_utf16():
    astral, bmp = "\U00010000", "\ue000"
    doc = source_document(text="AB")
    doc["participants"] = [
        dict(doc["participants"][0], participantId=identity)
        for identity in (bmp, astral)
    ]
    doc["turns"] = [
        dict(
            doc["turns"][0],
            turnId=f"t{index + 1}",
            participantId=identity,
            start=index,
            end=index + 1,
        )
        for index, identity in enumerate((bmp, astral))
    ]
    source = corpus(doc)
    inputs = fixture()
    inputs.update(
        corpus=source,
        request=request(
            questions=[
                {"id": bmp, "text": "BMP question"},
                {"id": astral, "text": "Astral question"},
            ]
        ),
    )
    inputs["quotes"] = [
        quote(
            source,
            turn=f"t{index + 1}",
            participant=identity,
            start=index,
            end=index + 1,
        )
        for index, identity in enumerate((bmp, astral))
    ]
    inputs["findings"] = [
        finding(
            [selected],
            participants=[ref(participant_id=identity)],
            questions=[identity],
        )
        for identity, selected in zip((bmp, astral), inputs["quotes"])
    ]
    result = build_qualitative_analysis(**inputs)
    assert sorted([astral, bmp]) == [bmp, astral]  # Python code-point order differs.
    assert [row.participant_id for row in result.participant_coverage] == [astral, bmp]
    assert [row.question_id for row in result.question_coverage] == [astral, bmp]
    assert admit(result, inputs) == result


def test_coverage_is_source_accounting_not_entailment_or_business_value_measurement():
    inputs = fixture()
    # Deliberately not entailed by the quote: this kernel proves binding and
    # explicit coverage only. A separate semantic quality gate must judge it.
    inputs["findings"] = [
        finding(
            inputs["quotes"],
            statement="This proposed business decision guarantees a profitable launch.",
            basis="interpretation",
        )
    ]
    result = build_qualitative_analysis(**inputs)
    assert result.coverage_status == "complete"
    assert (
        result.findings[0].statement
        == "This proposed business decision guarantees a profitable launch."
    )
    assert "confidence" not in wire(result)
    assert "businessValue" not in wire(result)
    assert "verifiedHuman" not in wire(result)


@pytest.mark.parametrize(
    "statement",
    [
        "I do not lose time copying status updates.",
        "Copying status updates costs time.",
        "People will pay $1,000 per month.",
        "I lose time copying status updates",
        "I lose time copying status updates. ",
        "i lose time copying status updates.",
        '"I lose time copying status updates."',
        "The participant said: I lose time copying status updates.",
    ],
)
def test_supported_source_statement_cannot_be_negation_paraphrase_or_unrelated_text(
    statement,
):
    inputs = fixture()
    inputs["findings"] = [finding(inputs["quotes"], statement=statement)]
    with pytest.raises(ValueError, match="exact text of every selected source quote"):
        build_qualitative_analysis(**inputs)
    # Relabelling is explicit; this is not a claim that the interpretation is
    # actually entailed or useful. A separate semantic evaluator owns that check.
    inputs["findings"] = [
        finding(inputs["quotes"], statement=statement, basis="interpretation")
    ]
    result = build_qualitative_analysis(**inputs)
    assert result.findings[0].basis == "interpretation"


def test_exact_selected_quotation_is_publishable_as_source_statement():
    source = corpus(
        source_document(text="Prompt: I lose time copying status updates. Follow-up.")
    )
    selected_text = "I lose time copying status updates."
    start = len("Prompt: ".encode())
    inputs = fixture(source=source)
    inputs["quotes"] = [
        quote(source, start=start, end=start + len(selected_text.encode()))
    ]
    inputs["findings"] = [finding(inputs["quotes"], statement=selected_text)]
    result = build_qualitative_analysis(**inputs)
    assert result.findings[0].statement == result.quotes[0].text == selected_text
    assert result.findings[0].basis == "source_statement"
    assert admit(result, inputs) == result


@pytest.mark.parametrize("reverse_quotes", [False, True])
def test_one_matching_quote_cannot_pad_other_participants_with_unrelated_quotes(
    reverse_quotes,
):
    source = corpus(
        source_document(),
        source_document(2, text="Status updates never consume my time."),
    )
    inputs = fixture(source=source)
    selected = [quote(source), quote(source, 2)]
    if reverse_quotes:
        selected.reverse()
    inputs["quotes"] = selected
    inputs["findings"] = [
        finding(
            selected,
            participants=[ref(), ref(2)],
            statement="I lose time copying status updates.",
        )
    ]
    with pytest.raises(ValueError, match="exact text of every selected source quote"):
        build_qualitative_analysis(**inputs)


def test_multiple_participants_can_share_an_exact_source_statement_only_when_all_quotes_match():
    source = corpus(source_document(), source_document(2))
    inputs = fixture(source=source)
    inputs["quotes"] = [quote(source), quote(source, 2)]
    inputs["findings"] = [finding(inputs["quotes"], participants=[ref(), ref(2)])]
    result = build_qualitative_analysis(**inputs)
    assert result.coverage_status == "complete"
    assert len(result.findings[0].participant_refs) == 2
    assert all(
        selected.text == result.findings[0].statement for selected in result.quotes
    )


@pytest.mark.parametrize("normalization", ["line_endings", "unicode", "whitespace"])
def test_source_statement_preserves_exact_unicode_whitespace_and_crlf(normalization):
    text = " Café e\u0301 🧭.\r\n"
    inputs = fixture(source=corpus(source_document(text=text)))
    assert build_qualitative_analysis(**inputs).findings[0].statement == text
    changed = {
        "line_endings": text.replace("\r\n", "\n"),
        "unicode": text.replace("e\u0301", "é"),
        "whitespace": text.strip(),
    }[normalization]
    inputs["findings"] = [finding(inputs["quotes"], statement=changed)]
    with pytest.raises(ValueError, match="exact text of every selected source quote"):
        build_qualitative_analysis(**inputs)


def test_reidentified_persisted_source_statement_still_rebinds_to_exact_quotes():
    inputs = fixture()
    raw = wire(build_qualitative_analysis(**inputs))
    raw["findings"] = [
        wire(finding(inputs["quotes"], statement="The participant said the opposite."))
    ]
    with pytest.raises(ValueError, match="exact text of every selected source quote"):
        admit(raw, inputs)


@pytest.mark.parametrize(
    "status,code",
    [
        ("insufficient", "insufficient_evidence"),
        ("conflicting", "conflicting_evidence"),
    ],
)
@pytest.mark.parametrize(
    "statement",
    ["Copying updates costs time.", "I do not lose time copying status updates."],
)
def test_non_supported_source_statement_labels_also_require_exact_quotes(
    status, code, statement
):
    inputs = fixture()
    inputs["findings"] = [finding(inputs["quotes"], status=status, statement=statement)]
    inputs["gaps"] = [
        gap(code=code, question="analysis-pain", participant=ref(), output="jobs_pains")
    ]
    with pytest.raises(ValueError, match="exact text of every selected source quote"):
        build_qualitative_analysis(**inputs)
    inputs["findings"] = [finding(inputs["quotes"], status=status)]
    result = build_qualitative_analysis(**inputs)
    assert result.coverage_status == "blocked"
    assert result.findings[0].statement == result.quotes[0].text


@pytest.mark.parametrize("status", ["insufficient", "conflicting"])
def test_zero_quote_source_statement_is_not_an_extracted_statement_even_when_unsupported(
    status,
):
    with pytest.raises(
        ValueError, match="source_statement findings require source quotes"
    ):
        finding(status=status)
    candidate = finding(status=status, basis="interpretation")
    assert candidate.quote_ids == ()


def test_finding_identity_sorts_unordered_bindings_and_preserves_semantics():
    source = corpus(source_document(), source_document(2))
    selected = [quote(source), quote(source, 2)]
    first = finding(
        selected, participants=[ref(), ref(2)], questions=["\U00010000", "\ue000"]
    )
    other = finding(
        list(reversed(selected)),
        participants=[ref(2), ref()],
        questions=["\ue000", "\U00010000"],
    )
    assert first.finding_id == other.finding_id
    assert (
        first.finding_id
        != finding(
            selected,
            participants=[ref(), ref(2)],
            questions=["\U00010000", "\ue000"],
            statement="Different semantic statement",
        ).finding_id
    )
    assert (
        first.finding_id
        != finding(
            selected,
            participants=[ref(), ref(2)],
            questions=["\U00010000", "\ue000"],
            basis="interpretation",
        ).finding_id
    )


def test_utf8_emoji_combining_characters_crlf_and_repeated_quotes_remain_exact():
    text = "Café e\u0301 🧭.\r\nCafé e\u0301 🧭.\r\n"
    split = len("Café e\u0301 🧭.\r\n".encode())
    doc = source_document(text=text)
    doc["turns"] = [
        dict(doc["turns"][0], end=split),
        dict(doc["turns"][0], turnId="t2", start=split),
    ]
    source = corpus(doc)
    inputs = fixture(source=source)
    inputs["quotes"] = [quote(source, end=split), quote(source, turn="t2", start=split)]
    inputs["findings"] = [finding(inputs["quotes"])]
    result = build_qualitative_analysis(**inputs)
    assert result.quotes[0].text == result.quotes[1].text
    assert result.quotes[0].quote_id != result.quotes[1].quote_id
    assert result.corpus_hash == transcript_corpus_hash(source)
    assert admit(result, inputs) == result


@pytest.mark.parametrize("basis", ["source_statement", "interpretation"])
@pytest.mark.parametrize("mixed", [False, True])
def test_synthetic_and_mixed_support_cannot_be_promoted_to_supplied_findings(
    basis, mixed
):
    documents = [
        source_document(origin="synthetic_transcript", question="interview-only")
    ]
    if mixed:
        documents.append(source_document(2))
    source = corpus(*documents)
    inputs = fixture(source=source)
    inputs["quotes"] = [
        quote(source, number) for number in range(1, len(documents) + 1)
    ]
    inputs["findings"] = [
        finding(
            inputs["quotes"],
            participants=[ref(number) for number in range(1, len(documents) + 1)],
            basis=basis,
        )
    ]
    with pytest.raises(ValueError, match="simulation_hypothesis"):
        build_qualitative_analysis(**inputs)
    inputs["findings"] = [
        finding(
            inputs["quotes"],
            participants=[ref(number) for number in range(1, len(documents) + 1)],
            basis="simulation_hypothesis",
        )
    ]
    result = build_qualitative_analysis(**inputs)
    assert result.findings[0].basis == "simulation_hypothesis"
    assert result.quotes[0].origin == "synthetic_transcript"


def test_zero_quote_synthetic_candidate_also_remains_hypothesis():
    source = corpus(
        source_document(origin="synthetic_transcript", question="interview-only")
    )
    inputs = fixture(source=source)
    inputs.update(
        quotes=[],
        findings=[finding(status="insufficient", basis="interpretation")],
        gaps=[gap(question="analysis-pain", participant=ref(), output="jobs_pains")],
    )
    with pytest.raises(ValueError, match="simulation_hypothesis"):
        build_qualitative_analysis(**inputs)
    inputs["findings"] = [finding(status="insufficient", basis="simulation_hypothesis")]
    assert build_qualitative_analysis(**inputs).coverage_status == "blocked"


@pytest.mark.parametrize(
    "basis", ["source_statement", "interpretation", "simulation_hypothesis"]
)
def test_every_supported_finding_requires_quotes(basis):
    with pytest.raises(ValueError, match="require source quotes"):
        finding(basis=basis)


def test_empty_insufficient_material_requires_explicit_targets_and_is_blocked():
    inputs = fixture()
    inputs.update(
        quotes=[],
        findings=[],
        gaps=[gap(question="analysis-pain", participant=ref(), output="jobs_pains")],
    )
    result = build_qualitative_analysis(**inputs)
    assert result.coverage_status == "blocked"
    assert result.question_coverage[0].status == "insufficient"
    assert result.participant_coverage[0].status == "blocked"
    assert result.output_coverage[0].status == "blocked"
    assert admit(result, inputs) == result


@pytest.mark.parametrize("missing", ["participant", "question", "output"])
def test_silently_omitted_coverage_target_is_not_publishable(missing):
    inputs = fixture()
    fields = {"question": "analysis-pain", "participant": ref(), "output": "jobs_pains"}
    fields[missing] = None
    inputs.update(quotes=[], findings=[], gaps=[gap(**fields)])
    with pytest.raises(ValueError, match="every"):
        build_qualitative_analysis(**inputs)


def test_unquoted_participant_and_unanswered_question_produce_honest_partial_coverage():
    source = corpus(source_document(), source_document(2))
    inputs = fixture(
        source=source,
        analysis_request=request(
            questions=[
                {"id": "analysis-pain", "text": "What is difficult?"},
                {"id": "analysis-wtp", "text": "What would they pay?"},
            ]
        ),
    )
    inputs["gaps"] = [gap(question="analysis-wtp", participant=ref(2))]
    result = build_qualitative_analysis(**inputs)
    assert result.coverage_status == "partial"
    assert result.document_coverage[0].status == "complete"
    assert result.document_coverage[1].status == "blocked"
    assert [row.status for row in result.question_coverage] == [
        "answered",
        "insufficient",
    ]


def test_present_evidence_with_disclosed_gap_is_partial_not_complete():
    inputs = fixture()
    inputs["gaps"] = [
        gap(question="analysis-pain", participant=ref(), output="jobs_pains")
    ]
    result = build_qualitative_analysis(**inputs)
    assert result.coverage_status == "partial"
    assert result.question_coverage[0].status == "partial"
    assert result.participant_coverage[0].status == "partial"
    assert result.output_coverage[0].status == "partial"


@pytest.mark.parametrize(
    "status,code",
    [
        ("insufficient", "insufficient_evidence"),
        ("conflicting", "conflicting_evidence"),
    ],
)
def test_non_supported_findings_need_matching_explicit_gap(status, code):
    inputs = fixture()
    candidate = finding(
        inputs["quotes"],
        status=status,
        statement="Additional uncertain candidate.",
        basis="interpretation",
    )
    inputs["findings"].append(candidate)
    with pytest.raises(ValueError, match="matching evidence gap"):
        build_qualitative_analysis(**inputs)
    inputs["gaps"] = [gap(code=code, question="analysis-pain")]
    assert build_qualitative_analysis(**inputs).coverage_status == "partial"


def test_registry_participant_without_turns_cannot_disappear():
    doc = source_document()
    doc["participants"].append(dict(doc["participants"][0], participantId="p2"))
    inputs = fixture(source=corpus(doc))
    with pytest.raises(ValueError, match="every source participant"):
        build_qualitative_analysis(**inputs)
    inputs["gaps"] = [
        gap(code="missing_participant_turns", participant=ref(participant_id="p2"))
    ]
    result = build_qualitative_analysis(**inputs)
    assert len(result.participant_coverage) == 2
    assert result.coverage_status == "partial"


def test_missing_turn_gap_cannot_contradict_actual_transcript():
    inputs = fixture()
    inputs["gaps"] = [gap(code="missing_participant_turns", participant=ref())]
    with pytest.raises(ValueError, match="contradicts"):
        build_qualitative_analysis(**inputs)


@pytest.mark.parametrize(
    "field",
    [
        "coverageStatus",
        "documentCoverage",
        "participantCoverage",
        "questionCoverage",
        "outputCoverage",
        "quoteLineage",
    ],
)
def test_provider_claimed_coverage_and_question_lineage_cannot_override_derivation(
    field,
):
    inputs = fixture()
    raw = wire(build_qualitative_analysis(**inputs))
    if field == "coverageStatus":
        raw[field] = "blocked"
    elif field == "quoteLineage":
        raw[field][0]["interviewQuestionId"] = "fabricated-prompt"
    elif field == "questionCoverage":
        raw[field][0]["status"] = "insufficient"
    else:
        raw[field][0]["status"] = "blocked"
    with pytest.raises(ValueError, match="must equal derived"):
        admit(raw, inputs)


@pytest.mark.parametrize(
    "field",
    [
        "documentCoverage",
        "participantCoverage",
        "questionCoverage",
        "outputCoverage",
        "quoteLineage",
    ],
)
def test_duplicate_or_omitted_coverage_rows_are_rejected(field):
    inputs = fixture()
    raw = wire(build_qualitative_analysis(**inputs))
    raw[field].append(copy.deepcopy(raw[field][0]))
    with pytest.raises(ValueError):
        admit(raw, inputs)


@pytest.mark.parametrize(
    "target",
    [
        "decision",
        "question_id",
        "question_text",
        "output",
        "profile",
        "scope_id",
        "scope_hash",
        "source_id",
        "source_hash",
        "source_kind",
        "corpus_hash",
    ],
)
def test_artifact_must_bind_authoritative_caller_context(target):
    inputs = fixture()
    raw = wire(build_qualitative_analysis(**inputs))
    if target == "decision":
        raw["request"]["decisionQuestion"] = "A different decision"
    elif target == "question_id":
        raw["request"]["questions"][0]["id"] = "different"
    elif target == "question_text":
        raw["request"]["questions"][0]["text"] = "A different research question"
    elif target == "output":
        raw["request"]["outputs"] = ["personas"]
    elif target == "profile":
        raw["request"]["analysisProfile"] = "future_profile"
    elif target.startswith("scope"):
        raw["acceptedScope"][
            "artifactId" if target.endswith("id") else "artifactHash"
        ] = (uid(999) if target.endswith("id") else "c" * 64)
    elif target.startswith("source"):
        key = {
            "source_id": "artifactId",
            "source_hash": "artifactHash",
            "source_kind": "kind",
        }[target]
        raw["sourceArtifacts"][0][key] = {
            "source_id": uid(999),
            "source_hash": "c" * 64,
            "source_kind": "simulation",
        }[target]
    else:
        raw["corpusHash"] = "c" * 64
    with pytest.raises(ValueError):
        admit(raw, inputs)


def test_reordered_authoritative_source_references_are_same_identity():
    inputs = fixture()
    inputs["source_artifacts"].append(
        {"artifactId": uid(93), "artifactHash": "c" * 64, "kind": "simulation"}
    )
    result = build_qualitative_analysis(**inputs)
    assert (
        admit(
            result, inputs, source_artifacts=list(reversed(inputs["source_artifacts"]))
        )
        == result
    )


@pytest.mark.parametrize(
    "target",
    [
        "absent_quote",
        "absent_participant",
        "wrong_document",
        "wrong_speaker",
        "extra_participant",
        "analysis_question",
        "unused_quote",
    ],
)
def test_findings_require_exact_source_and_request_bindings(target):
    source = corpus(source_document(), source_document(2))
    inputs = fixture(source=source)
    selected = inputs["quotes"][0]
    if target == "absent_quote":
        inputs["quotes"] = []
    elif target == "unused_quote":
        inputs["quotes"].append(quote(source, 2))
    else:
        kwargs = {"participants": [ref()]}
        if target == "absent_participant":
            kwargs["participants"] = [ref(participant_id="missing")]
        elif target == "wrong_document":
            kwargs["participants"] = [ref(2)]
        elif target == "wrong_speaker":
            kwargs["participants"] = [ref(participant_id="p2")]
        elif target == "extra_participant":
            kwargs["participants"] = [ref(), ref(2)]
        else:
            kwargs["questions"] = ["source-interview-prompt-not-requested"]
        inputs["findings"] = [finding([selected], **kwargs)]
    inputs["gaps"] = [gap(participant=ref(2))]
    with pytest.raises(ValueError):
        build_qualitative_analysis(**inputs)


@pytest.mark.parametrize(
    "change", ["text", "origin", "sourceTextSha256", "start", "turnId", "participantId"]
)
def test_rehashed_quote_forgery_is_still_rejected_by_corpus_binding(change):
    inputs = fixture()
    raw = wire(inputs["quotes"][0])
    if change == "text":
        raw["text"] = "X" * len(raw["text"])
        raw["textSha256"] = hashlib.sha256(raw["text"].encode()).hexdigest()
    elif change == "origin":
        raw["origin"] = "synthetic_transcript"
    elif change == "sourceTextSha256":
        raw[change] = "d" * 64
    elif change == "start":
        raw["start"] += 1
        raw["end"] += 1
    else:
        raw[change] = "missing"
    raw["quoteId"] = canonical_hash(
        {key: value for key, value in raw.items() if key != "quoteId"}
    )
    selected = SourceQuoteV1.model_validate(raw)
    inputs["quotes"] = [selected]
    inputs["findings"] = [
        finding(
            [selected],
            basis="simulation_hypothesis" if change == "origin" else "source_statement",
        )
    ]
    with pytest.raises(ValueError):
        build_qualitative_analysis(**inputs)


@pytest.mark.parametrize("role", ["interviewer", "author", "unknown"])
def test_audit_only_nonparticipant_quotes_never_support_analysis(role):
    doc = source_document(text="Question? Participant answer.")
    split = len("Question? ".encode())
    doc["participants"].append(
        dict(doc["participants"][0], participantId="other", role=role)
    )
    doc["turns"] = [
        dict(doc["turns"][0], participantId="other", end=split),
        dict(doc["turns"][0], turnId="t2", start=split),
    ]
    source = corpus(doc)
    selected = quote(source, participant="other", end=split, require_participant=False)
    inputs = fixture()
    inputs.update(
        corpus=source,
        quotes=[selected],
        findings=[finding([selected], participants=[ref(participant_id="other")])],
    )
    with pytest.raises(ValueError, match="participant evidence"):
        build_qualitative_analysis(**inputs)


@pytest.mark.parametrize(
    "target", ["document_only", "all_interviewer", "missing_participant_registry"]
)
def test_first_slice_rejects_non_transcript_or_nonparticipant_inputs(target):
    doc = source_document()
    if target == "document_only":
        doc.update(origin="supplied_document", turns=[], participants=[])
    else:
        doc["participants"][0]["role"] = "interviewer"
        if target == "all_interviewer":
            doc["participants"].append(
                dict(doc["participants"][0], participantId="p2", role="participant")
            )
    with pytest.raises(ValueError):
        validate_analysis_request(request(), corpus(doc))


@pytest.mark.parametrize(
    "target",
    [
        "merged_refs",
        "wrong_trait_identity",
        "unsupported_trait",
        "non_trait",
        "missing_trait",
        "duplicate_source_persona",
    ],
)
def test_personas_cannot_launder_or_merge_source_evidence(target):
    source = corpus(source_document(), source_document(2))
    inputs = fixture(
        source=source, analysis_request=request(outputs=["personas", "jobs_pains"])
    )
    first = finding(inputs["quotes"], category="trait")
    inputs["findings"] = [first]
    inputs["gaps"] = [gap(participant=ref(2), output="jobs_pains")]
    if target == "merged_refs":
        with pytest.raises(ValueError):
            create_analysis_persona(
                {
                    "participantRefs": [ref(), ref(2)],
                    "displayLabel": "Sam",
                    "origin": "supplied_transcript",
                    "traitFindingIds": [first.finding_id],
                }
            )
        return
    if target == "wrong_trait_identity":
        inputs["personas"] = [persona([first], participant=ref(2))]
    elif target == "unsupported_trait":
        candidate = finding(inputs["quotes"], category="trait", status="insufficient")
        inputs["findings"] = [candidate]
        inputs["gaps"].append(gap(question="analysis-pain", participant=ref()))
        inputs["personas"] = [persona([candidate])]
    elif target == "non_trait":
        candidate = finding(inputs["quotes"])
        inputs["findings"] = [candidate]
        inputs["personas"] = [persona([candidate])]
    elif target == "missing_trait":
        inputs["personas"] = [
            create_analysis_persona(
                {
                    "participantRefs": [ref()],
                    "displayLabel": "Sam",
                    "origin": "supplied_transcript",
                    "traitFindingIds": ["f" * 64],
                }
            )
        ]
    else:
        inputs["personas"] = [
            persona([first]),
            persona([first], label="Other display name"),
        ]
    with pytest.raises(ValueError):
        build_qualitative_analysis(**inputs)


@pytest.mark.parametrize(
    "target", ["question", "participant", "output", "untargeted", "unknown_code"]
)
def test_gaps_require_exact_known_targets(target):
    inputs = fixture()
    selected = gap(question="analysis-pain")
    if target == "question":
        selected["questionId"] = "missing"
    elif target == "participant":
        selected["participantRef"] = ref(99)
    elif target == "output":
        selected["output"] = "personas"
    elif target == "untargeted":
        selected["questionId"] = None
    else:
        selected["code"] = "provider_failure"
    inputs["gaps"] = [selected]
    with pytest.raises(ValueError):
        build_qualitative_analysis(**inputs)


@pytest.mark.parametrize(
    "target",
    [
        "request",
        "question",
        "participant_ref",
        "finding",
        "persona",
        "gap",
        "artifact",
        "coverage",
        "quote",
        "source_reference",
    ],
)
def test_models_reject_unknown_fields_and_false_confidence(target):
    inputs = fixture()
    raw = wire(build_qualitative_analysis(**inputs))
    objects = {
        "request": (AnalysisRequestV1, raw["request"]),
        "question": (AnalysisQuestionV1, raw["request"]["questions"][0]),
        "participant_ref": (AnalysisParticipantRefV1, ref()),
        "finding": (AnalysisFindingV1, raw["findings"][0]),
        "persona": (
            AnalysisPersonaV1,
            wire(persona([finding(inputs["quotes"], category="trait")])),
        ),
        "gap": (AnalysisGapV1, gap(question="analysis-pain")),
        "artifact": (QualitativeAnalysisV1, raw),
        "coverage": (
            type(build_qualitative_analysis(**inputs).participant_coverage[0]),
            raw["participantCoverage"][0],
        ),
        "quote": (SourceQuoteV1, raw["quotes"][0]),
        "source_reference": (CorpusArtifactRefV1, raw["sourceArtifacts"][0]),
    }
    model, payload = objects[target]
    payload["measuredProbability"] = 0.99
    with pytest.raises(ValidationError):
        model.model_validate(payload)


@pytest.mark.parametrize(
    "field,bad",
    [
        ("decisionQuestion", " "),
        ("decisionQuestion", "\ud800"),
        ("decisionQuestion", 123),
        ("decisionQuestion", "x" * 4001),
        ("outputs", []),
        ("outputs", ["themes"]),
        ("outputs", ["personas", "personas"]),
        ("questions", []),
        ("analysisProfile", "legacy"),
    ],
)
def test_request_requires_bounded_value_question_and_supported_outputs(field, bad):
    raw = request()
    raw[field] = bad
    with pytest.raises(ValueError):
        AnalysisRequestV1.model_validate(raw)


@pytest.mark.parametrize("bad", ["", " ", " padded ", "line\nbreak", "\ud800"])
def test_question_ids_are_exact_nonblank_identifiers(bad):
    with pytest.raises(ValueError):
        AnalysisQuestionV1.model_validate({"id": bad, "text": "What is difficult?"})


@pytest.mark.parametrize(
    "target",
    [
        "questions",
        "outputs",
        "quote_ids",
        "question_ids",
        "participant_refs",
        "quotes",
        "findings",
        "personas",
        "gaps",
        "limitations",
        "source_artifacts",
    ],
)
def test_collection_generators_are_rejected_without_consumption(target):
    touched = []

    def unbounded():
        touched.append(True)
        while True:
            yield None

    if target in {"questions", "outputs"}:
        raw = request()
        raw[target] = unbounded()
        invoke = lambda: AnalysisRequestV1.model_validate(raw)
    elif target in {"quote_ids", "question_ids", "participant_refs"}:
        inputs = fixture()
        raw = wire(inputs["findings"][0])
        raw.pop("findingId")
        raw[
            {
                "quote_ids": "quoteIds",
                "question_ids": "questionIds",
                "participant_refs": "participantRefs",
            }[target]
        ] = unbounded()
        invoke = lambda: create_analysis_finding(raw)
    else:
        inputs = fixture()
        inputs[target] = unbounded()
        invoke = lambda: build_qualitative_analysis(**inputs)
    with pytest.raises(ValueError):
        invoke()
    assert not touched


@pytest.mark.parametrize(
    "target", ["request", "question", "finding", "persona", "gap", "artifact"]
)
def test_all_models_are_frozen_and_revalidate_forged_nested_instances(target):
    inputs = fixture()
    result = build_qualitative_analysis(**inputs)
    selected = {
        "request": (result.request, "decision_question", ""),
        "question": (result.request.questions[0], "text", ""),
        "finding": (result.findings[0], "statement", ""),
        "persona": (
            persona([finding(inputs["quotes"], category="trait")]),
            "display_label",
            "",
        ),
        "gap": (
            AnalysisGapV1.model_validate(gap(question="analysis-pain")),
            "message",
            "",
        ),
        "artifact": (result, "coverage_status", "imaginary"),
    }
    model, field, bad = selected[target]
    with pytest.raises(ValidationError, match="frozen"):
        setattr(model, field, bad)
    forged = model.model_copy(update={field: bad})
    with pytest.raises(ValueError):
        type(model).model_validate(forged)
    if target in {"request", "finding", "persona", "gap"}:
        key = {
            "request": "request",
            "finding": "findings",
            "persona": "personas",
            "gap": "gaps",
        }[target]
        inputs[key] = forged if target == "request" else [forged]
        with pytest.raises(ValueError):
            build_qualitative_analysis(**inputs)


@pytest.mark.parametrize(
    "target",
    [
        "quote",
        "corpus",
        "source_ref",
        "coverage",
        "nested_question",
        "nested_participant",
    ],
)
def test_nested_constructed_or_copied_models_cannot_bypass_admission(target):
    inputs = fixture()
    result = build_qualitative_analysis(**inputs)
    if target == "quote":
        inputs["quotes"] = [inputs["quotes"][0].model_copy(update={"text": "invented"})]
        invoke = lambda: build_qualitative_analysis(**inputs)
    elif target == "corpus":
        inputs["corpus"] = inputs["corpus"].model_copy(
            update={
                "documents": (
                    inputs["corpus"]
                    .documents[0]
                    .model_copy(update={"origin": "supplied_document"}),
                )
            }
        )
        invoke = lambda: build_qualitative_analysis(**inputs)
    elif target == "source_ref":
        inputs["source_artifacts"] = [
            result.source_artifacts[0].model_copy(update={"artifact_hash": "wrong"})
        ]
        invoke = lambda: build_qualitative_analysis(**inputs)
    elif target == "coverage":
        forged = result.model_copy(
            update={
                "participant_coverage": (
                    result.participant_coverage[0].model_copy(
                        update={"status": "blocked"}
                    ),
                )
            }
        )
        invoke = lambda: admit(forged, inputs)
    elif target == "nested_question":
        inputs["request"] = result.request.model_copy(
            update={
                "questions": (AnalysisQuestionV1.model_construct(id="valid", text=""),)
            }
        )
        invoke = lambda: build_qualitative_analysis(**inputs)
    else:
        inputs["findings"] = [
            result.findings[0].model_copy(
                update={
                    "participant_refs": (
                        AnalysisParticipantRefV1.model_construct(
                            document_id=uid(), participant_id=" "
                        ),
                    )
                }
            )
        ]
        invoke = lambda: build_qualitative_analysis(**inputs)
    with pytest.raises(ValueError):
        invoke()


def test_forged_unbounded_nested_collection_is_not_consumed():
    inputs = fixture()
    touched = []

    def unbounded():
        touched.append(True)
        while True:
            yield inputs["findings"][0]

    result = build_qualitative_analysis(**inputs)
    forged = result.model_copy(update={"findings": unbounded()})
    with pytest.raises(ValueError):
        admit(forged, inputs)
    assert not touched


@pytest.mark.parametrize("mapping", [dict, MappingProxyType])
def test_wire_aliases_cannot_be_bypassed_with_mapping_types(mapping):
    raw = request()
    raw["decision_question"] = raw.pop("decisionQuestion")
    with pytest.raises(ValueError, match="must use alias"):
        AnalysisRequestV1.model_validate(mapping(raw))


@pytest.mark.parametrize(
    "field",
    ["quotes", "findings", "personas", "gaps", "limitations", "source_artifacts"],
)
def test_top_level_collections_are_bounded(field):
    inputs = fixture()
    values = {
        "quotes": (inputs["quotes"][0], 257),
        "findings": (inputs["findings"][0], 257),
        "personas": (persona([finding(inputs["quotes"], category="trait")]), 33),
        "gaps": (gap(question="analysis-pain"), 129),
        "limitations": ("Bounded caveat", 17),
        "source_artifacts": (inputs["source_artifacts"][0], 17),
    }
    item, count = values[field]
    inputs[field] = [item] * count
    with pytest.raises(ValueError):
        build_qualitative_analysis(**inputs)


def test_aggregate_derived_text_limit_is_utf8_bytes_not_character_count():
    inputs = fixture()
    inputs["findings"] = [
        finding(inputs["quotes"], statement=f"{index}:" + "🧭" * 999)
        for index in range(65)
    ]
    with pytest.raises(ValueError, match="aggregate derived-text UTF-8"):
        build_qualitative_analysis(**inputs)


def test_aggregate_quote_byte_limit_prevents_overlapping_quote_padding():
    source = corpus(source_document(text="x" * 1000))
    inputs = fixture(source=source)
    inputs["quotes"] = [quote(source, start=index) for index in range(150)]
    inputs["findings"] = [finding(inputs["quotes"])]
    with pytest.raises(ValueError, match="aggregate quote UTF-8"):
        build_qualitative_analysis(**inputs)


def test_analysis_module_imports_without_operations_services_providers_or_database():
    code = """
import sys
import backend.domain.workflow_v2.qualitative_analysis
forbidden = (
    "backend.domain.workflow_v2.contracts", "backend.services", "backend.models",
    "backend.infrastructure", "backend.api", "sqlalchemy", "google.genai", "openai"
)
assert not [name for name in sys.modules if any(name == item or name.startswith(item + ".") for item in forbidden)]
"""
    result = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, timeout=10
    )
    assert result.returncode == 0, result.stderr
