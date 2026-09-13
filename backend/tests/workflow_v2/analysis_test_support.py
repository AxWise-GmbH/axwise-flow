"""Synthetic, model-free fixtures for the explicit analysis operation boundary."""

from __future__ import annotations

import copy
import hashlib
import hmac
from uuid import UUID

from backend.domain.workflow_v2.contracts import (
    AdmitTranscriptCorpusInputV1,
    AnalyzeEvidenceInputV1,
    AxWiseOperationEnvelope,
    ScopeArtifactFact,
    TranscriptCorpusArtifactFact,
    artifact_content_hash,
    canonical_hash,
    canonical_json,
)
from backend.services.workflow_v2.analysis_candidates import AnalysisCandidateV1
from backend.services.workflow_v2.analysis_service import AnalysisGenerationResult
from backend.domain.workflow_v2.processing_consent import (
    processing_consent_binding_hash,
)
from backend.tests.workflow_v2.factories import scope_payload


AUTHORITY_KEY = b"analysis-fixture-key-not-a-secret"
USER_ID = "user_analysisfixture123"


def uid(number: int) -> str:
    return f"00000000-0000-4000-8000-{number:012d}"


def synthetic_consent_stub(purpose):
    """Explicit synthetic test authorization; never a production consent default."""
    return {
        "schemaVersion": "axwise.processing-consent.v1",
        "granted": True,
        "provider": "google",
        "purpose": purpose,
        "operationId": uid(904),
        "bindingHash": "0" * 64,
        "noticeVersion": "google-selected-sources-v1",
    }


def document(*, number=1, origin="supplied_transcript", text=None):
    text = text or "I prefer clear updates and lose time copying them."
    return {
        "documentId": uid(number),
        "title": "Synthetic test fixture",
        "text": text,
        "textSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "origin": origin,
        "originArtifactRefs": [],
        "participants": [
            {
                "participantId": "p1",
                "displayName": "Same label",
                "role": "participant",
                "stakeholderId": None,
            }
        ],
        "turns": [
            {
                "turnId": "t1",
                "participantId": "p1",
                "questionId": (
                    "interview-q1" if origin == "synthetic_transcript" else None
                ),
                "start": 0,
                "end": len(text.encode("utf-8")),
                "offsetUnit": "utf8_bytes",
            }
        ],
    }


def corpus(*documents):
    return {
        "schemaVersion": "axwise.transcript-corpus.v1",
        "documents": list(documents or [document()]),
    }


def limits(**changes):
    return {
        "deadlineMs": 180_000,
        "maxModelCalls": 3,
        "maxInputTokens": 120_000,
        "maxOutputTokens": 65_536,
        **changes,
    }


def request(*, outputs=None):
    return {
        "decisionQuestion": "Which update workflow needs improvement?",
        "questions": [
            {"id": "analysis-q1", "text": "What is difficult about updates?"}
        ],
        "outputs": outputs or ["jobs_pains"],
        "analysisProfile": "qualitative_v1",
    }


def ref(fact):
    raw = (
        fact.model_dump(mode="json", by_alias=True)
        if hasattr(fact, "model_dump")
        else fact
    )
    return {key: raw[key] for key in ("artifactId", "artifactHash", "kind")}


def scope_fact(*, tenant_id=None, artifact_id=None):
    tenant_id = tenant_id or uid(901)
    artifact_id = artifact_id or uid(101)
    payload = scope_payload()
    seal = canonical_json(
        {
            "tenantId": tenant_id,
            "artifactId": artifact_id,
            "canonicalInputHash": payload["authority"]["canonicalInputHash"],
            "researchInputHash": payload["researchInputHash"],
        }
    )
    payload["authority"]["seal"] = hmac.new(
        AUTHORITY_KEY, seal.encode(), hashlib.sha256
    ).hexdigest()
    return ScopeArtifactFact.model_validate(
        {
            "artifactId": artifact_id,
            "artifactHash": artifact_content_hash(
                content_type="application/json", payload=payload, markdown=None
            ),
            "kind": "scope",
            "contentType": "application/json",
            "payload": payload,
            "markdown": None,
            "sourceArtifactIds": [],
        }
    )


def corpus_fact(payload=None, *, artifact_id=None):
    payload = payload or corpus()
    return TranscriptCorpusArtifactFact.model_validate(
        {
            "artifactId": artifact_id or uid(102),
            "artifactHash": artifact_content_hash(
                content_type="application/json", payload=payload, markdown=None
            ),
            "kind": "transcript_corpus",
            "contentType": "application/json",
            "payload": payload,
            "markdown": None,
            "sourceArtifactIds": sorted(
                {
                    reference["artifactId"]
                    for doc in payload["documents"]
                    for reference in doc["originArtifactRefs"]
                }
            ),
        }
    )


def admission_input(payload=None):
    return AdmitTranscriptCorpusInputV1.model_validate(
        {
            "type": "AdmitTranscriptCorpusV1",
            "corpus": payload or corpus(),
            "admissionProfile": "supplied_transcript_v1",
        }
    ).model_dump(mode="json", by_alias=True)


def analysis_input(
    *, source=None, scope=None, analysis_request=None, request_limits=None
):
    source = source or corpus_fact()
    scope = scope or scope_fact()
    return AnalyzeEvidenceInputV1.model_validate(
        {
            "type": "AnalyzeEvidenceV1",
            "acceptedScope": ref(scope),
            "scope": scope.payload,
            "source": {
                "artifact": ref(source),
                "contentType": "application/json",
                "payload": source.payload,
                "markdown": None,
            },
            "request": analysis_request or request(),
            "limits": request_limits or limits(),
            "processingConsent": synthetic_consent_stub("AnalyzeEvidenceV1"),
        }
    ).model_dump(mode="json", by_alias=True)


def envelope(
    input_value, *, operation_id=None, user_id=USER_ID, tenant_id=None, run_id=None
):
    payload = {
        "operationId": operation_id or uid(904),
        "operationType": input_value["type"],
        "owner": {
            "tenantId": tenant_id or uid(901),
            "organizationId": None,
            "userId": user_id,
        },
        "workflow": {
            "runId": run_id or uid(902),
            "stageId": uid(903),
            "stageAttemptId": uid(905),
        },
        "contractVersion": "axwise.operation.v2",
        "input": copy.deepcopy(input_value),
    }
    if input_value["type"] in {"AnalyzeEvidenceV1", "SimulateV1"}:
        # Tests explicitly authorize their synthetic fixture for this exact run.
        # Real caller commands must never copy or automatically retarget consent.
        payload["input"]["processingConsent"] = {
            **synthetic_consent_stub(input_value["type"]),
            "operationId": payload["operationId"],
            "bindingHash": processing_consent_binding_hash(
                operation_type=payload["operationType"],
                operation_id=payload["operationId"],
                owner=payload["owner"],
                workflow=payload["workflow"],
                contract_version=payload["contractVersion"],
                input_value=payload["input"],
            ),
        }
    payload["canonicalInputHash"] = canonical_hash(payload["input"])
    return AxWiseOperationEnvelope.model_validate(payload)


class Resolver:
    def __init__(self, *facts):
        self.facts = {}
        self.calls = []
        for fact in facts:
            self.add(fact)

    def add(
        self, fact, *, tenant_id=None, user_id=USER_ID, run_id=None, operation_type=None
    ):
        raw = (
            fact.model_dump(mode="json", by_alias=True)
            if hasattr(fact, "model_dump")
            else copy.deepcopy(fact)
        )
        self.facts[raw["artifactId"]] = {
            "artifact": raw,
            "tenant": tenant_id or uid(901),
            "user": user_id,
            "run": run_id or uid(902),
            "producer": operation_type
            or (
                "CompileScopeV2"
                if raw["kind"] == "scope"
                else "AdmitTranscriptCorpusV1"
            ),
        }

    def owned_artifact_fact(
        self, tenant_id, user_id, run_id, artifact_id, *, operation_types
    ):
        self.calls.append(
            (str(tenant_id), user_id, str(run_id), str(artifact_id), operation_types)
        )
        value = self.facts.get(str(artifact_id))
        if (
            value is None
            or (value["tenant"], value["user"], value["run"])
            != (str(tenant_id), user_id, str(run_id))
            or value["producer"] not in operation_types
        ):
            return None
        return copy.deepcopy(value["artifact"])

    def artifact_fact(self, *_args, **_kwargs):
        raise AssertionError("new capabilities must not use tenant-only source reads")


def candidate(context):
    quotes, findings, personas, gaps = [], [], [], []
    for doc in context.corpus.documents:
        for person in doc.participants:
            if person.role != "participant":
                continue
            participant_ref = {
                "documentId": str(doc.document_id),
                "participantId": person.participant_id,
            }
            turns = [
                turn
                for turn in doc.turns
                if turn.participant_id == person.participant_id
            ]
            if not turns:
                gaps.append(
                    {
                        "code": "missing_participant_turns",
                        "questionId": None,
                        "participantRef": participant_ref,
                        "output": None,
                        "message": "No participant turns were supplied.",
                    }
                )
                continue
            turn = turns[0]
            key = f"quote-{len(quotes)}"
            text = doc.text.encode("utf-8")[turn.start : turn.end].decode("utf-8")
            quotes.append(
                {
                    "key": key,
                    "documentId": str(doc.document_id),
                    "turnId": turn.turn_id,
                    "participantId": person.participant_id,
                    "start": turn.start,
                    "end": turn.end,
                    "text": text,
                }
            )
            for output in context.request.outputs:
                finding_key = f"finding-{len(findings)}"
                findings.append(
                    {
                        "key": finding_key,
                        "category": "trait" if output == "personas" else "pain",
                        "statement": text,
                        "basis": (
                            "simulation_hypothesis"
                            if doc.origin == "synthetic_transcript"
                            else "source_statement"
                        ),
                        "supportStatus": "supported",
                        "quoteKeys": [key],
                        "questionIds": [
                            question.id for question in context.request.questions
                        ],
                        "participantRefs": [participant_ref],
                    }
                )
                if output == "personas":
                    personas.append(
                        {
                            "participantRef": participant_ref,
                            "displayLabel": person.display_name
                            or person.participant_id,
                            "traitFindingKeys": [finding_key],
                        }
                    )
    return AnalysisCandidateV1.model_validate(
        {
            "quotes": quotes,
            "findings": findings,
            "personas": personas,
            "gaps": gaps,
            "limitations": [],
        }
    )


class Generator:
    def __init__(self, *, modify=None, usage=None):
        self.calls = []
        self.modify = modify
        self.usage = usage or {}

    async def analyze(self, context, *, limits, deadline):
        self.calls.append((context, limits, deadline))
        proposed = candidate(context)
        if self.modify:
            proposed = self.modify(proposed, context)
        return AnalysisGenerationResult(candidate=proposed, model_calls=1, **self.usage)
