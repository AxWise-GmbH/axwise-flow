"""Owner opt-in binding, internal payload permits and fail-closed lease reclaims."""

from __future__ import annotations

import copy
import json
import socket
import time
from dataclasses import replace
from types import SimpleNamespace
from pathlib import Path
from uuid import UUID

import pytest

from backend.domain.workflow_v2.contracts import (
    AnalyzeEvidenceInputV1,
    AxWiseOperationEnvelope,
    SimulateInputV1,
    canonical_hash,
    canonical_json,
)
from backend.domain.workflow_v2.processing_consent import (
    CapabilityProcessingConsentV1,
    processing_consent_binding_hash,
)
from backend.services.workflow_v2.capability_generation_payloads import (
    analysis_generation_payload,
    simulation_generation_payload,
)
from backend.services.workflow_v2.capability_processing import (
    CapabilityProcessingPermit,
    issue_processing_permit,
    require_processing_permit,
)
from backend.services.workflow_v2.cognitive_executor import GeminiCognitiveExecutor
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.operation_store import PostgresOperationStore
from backend.services.workflow_v2.operation_worker import OperationWorker
from backend.tests.workflow_v2.analysis_test_support import (
    AUTHORITY_KEY,
    Generator,
    Resolver,
    analysis_input,
    corpus_fact,
    envelope,
    scope_fact,
    uid,
)
from backend.tests.workflow_v2.simulation_test_support import (
    SimulationGenerator,
    research_fact,
    simulation_input,
)
from backend.tests.workflow_v2.test_analysis_operation_lifecycle import worker_store


pytestmark = pytest.mark.contract


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def reject(*_args, **_kwargs):
        raise AssertionError("consent tests must not use network")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket.socket, "connect_ex", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


def executor(resolver=None, analysis=None, simulation=None):
    return GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=resolver,
        analysis_generator=analysis,
        simulation_generator=simulation,
    )


def binding_hash(raw):
    return processing_consent_binding_hash(
        operation_type=raw["operationType"],
        operation_id=raw["operationId"],
        owner=raw["owner"],
        workflow=raw["workflow"],
        contract_version=raw["contractVersion"],
        input_value=raw["input"],
    )


def test_python_owned_golden_envelopes_and_nested_binding_mutation():
    vectors = json.loads(
        (Path(__file__).with_name("fixtures") / "processing_consent_v1.json").read_text(
            encoding="utf-8"
        )
    )
    cases = {row["name"]: row["envelope"] for row in vectors["cases"]}
    assert set(cases) == {"analysis_unicode", "simulation_selected_claim"}
    for raw in cases.values():
        checked = AxWiseOperationEnvelope.model_validate(raw)
        assert checked.model_dump(mode="json", by_alias=True) == raw
        assert binding_hash(raw) == raw["input"]["processingConsent"]["bindingHash"]
        assert canonical_hash(raw["input"]) == raw["canonicalInputHash"]
        assert "executionAgent" not in raw["input"]
    for row in vectors["bindingOnlyCases"]:
        raw = copy.deepcopy(cases[row["baseEnvelopeCase"]])
        assert binding_hash(raw) == row["expectedBaseHash"]
        raw["input"]["processingConsent"] = row["setTopLevelConsent"]
        assert binding_hash(raw) == row["expectedTopLevelReplacementHash"]
        raw["input"]["request"]["processingConsent"] = row[
            "setInputRequestProcessingConsent"
        ]
        assert binding_hash(raw) == row["expectedNestedAdditionHash"]
        with pytest.raises(ValueError):
            AxWiseOperationEnvelope.model_validate(raw)


@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
def test_processing_consent_is_required_and_exactly_bound(make_input):
    operation = envelope(make_input())
    raw = operation.model_dump(mode="json", by_alias=True)
    assert binding_hash(raw) == raw["input"]["processingConsent"]["bindingHash"]
    assert raw["canonicalInputHash"] == canonical_hash(raw["input"])
    assert raw["input"]["processingConsent"]["operationId"] == raw["operationId"]
    raw["input"].pop("processingConsent")
    with pytest.raises(ValueError):
        type(operation.input).model_validate(raw["input"])


@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
@pytest.mark.parametrize(
    "field,bad",
    [
        ("granted", False),
        ("granted", 1),
        ("granted", "true"),
        ("granted", None),
        ("provider", "other"),
        ("provider", "Google"),
        ("noticeVersion", "older-notice"),
        ("schemaVersion", "future-consent"),
        ("bindingHash", "0" * 64),
        ("operationId", uid(888)),
        ("ownerAssertion", "model-generated-consent"),
    ],
)
def test_unaccepted_or_tampered_consent_fails_even_if_envelope_hash_is_recomputed(
    make_input, field, bad
):
    raw = envelope(make_input()).model_dump(mode="json", by_alias=True)
    raw["input"]["processingConsent"][field] = bad
    raw["canonicalInputHash"] = canonical_hash(raw["input"])
    with pytest.raises(ValueError):
        AxWiseOperationEnvelope.model_validate(raw)


@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
def test_consent_purpose_cannot_move_between_capabilities(make_input):
    raw = envelope(make_input()).model_dump(mode="json", by_alias=True)
    raw["input"]["processingConsent"]["purpose"] = (
        "SimulateV1"
        if raw["operationType"] == "AnalyzeEvidenceV1"
        else "AnalyzeEvidenceV1"
    )
    raw["canonicalInputHash"] = canonical_hash(raw["input"])
    with pytest.raises(ValueError):
        AxWiseOperationEnvelope.model_validate(raw)


@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
@pytest.mark.parametrize(
    "target,key",
    [
        ("root", "operationId"),
        ("owner", "tenantId"),
        ("owner", "userId"),
        ("workflow", "runId"),
        ("workflow", "stageId"),
        ("workflow", "stageAttemptId"),
    ],
)
def test_one_opt_in_cannot_be_retargeted_to_a_new_operation_or_owner(
    make_input, target, key
):
    raw = envelope(make_input()).model_dump(mode="json", by_alias=True)
    changed = raw if target == "root" else raw[target]
    changed[key] = "user_otherconsent123" if key == "userId" else uid(887)
    with pytest.raises(ValueError, match="consent"):
        AxWiseOperationEnvelope.model_validate(raw)


@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
def test_request_and_budget_changes_require_new_consent(make_input):
    for field in ("deadlineMs", "maxModelCalls", "maxInputTokens", "maxOutputTokens"):
        raw = envelope(make_input()).model_dump(mode="json", by_alias=True)
        raw["input"]["limits"][field] -= 1
        raw["canonicalInputHash"] = canonical_hash(raw["input"])
        with pytest.raises(ValueError, match="consent"):
            AxWiseOperationEnvelope.model_validate(raw)
    raw = envelope(make_input()).model_dump(mode="json", by_alias=True)
    if make_input is analysis_input:
        raw["input"]["request"]["decisionQuestion"] = "A different analysis decision?"
    else:
        raw["input"]["request"]["scenario"][
            "problem"
        ] = "A different synthetic problem."
    raw["canonicalInputHash"] = canonical_hash(raw["input"])
    with pytest.raises(ValueError, match="consent"):
        AxWiseOperationEnvelope.model_validate(raw)


def test_only_top_level_consent_is_excluded_from_binding():
    raw = envelope(analysis_input()).model_dump(mode="json", by_alias=True)
    expected = binding_hash(raw)
    raw["input"]["processingConsent"]["bindingHash"] = "f" * 64
    assert binding_hash(raw) == expected
    # This is an arbitrary JSON binding check, not a valid analysis schema.
    raw["input"]["request"]["processingConsent"] = {"nested": "must stay bound"}
    assert binding_hash(raw) != expected


@pytest.mark.asyncio
@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
async def test_forged_model_copy_cannot_invoke_any_generator(make_input):
    operation = envelope(make_input())
    consent = operation.input.processing_consent.model_copy(update={"granted": False})
    forged = operation.model_copy(
        update={
            "input": operation.input.model_copy(update={"processing_consent": consent})
        }
    )
    analysis, simulation = Generator(), SimulationGenerator()
    resolver = Resolver(scope_fact(), corpus_fact())
    with pytest.raises(CognitiveExecutionFailure, match="CAPABILITY_INVALID_INPUT"):
        await executor(resolver, analysis, simulation).execute(forged)
    assert not resolver.calls and not analysis.calls and not simulation.calls


@pytest.mark.asyncio
@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
async def test_handler_issues_internal_permit_only_for_exact_minimal_payload(
    make_input,
):
    operation = envelope(make_input())
    analysis, simulation = Generator(), SimulationGenerator()
    await executor(Resolver(scope_fact(), corpus_fact()), analysis, simulation).execute(
        operation
    )
    if make_input is analysis_input:
        context = analysis.calls[0][0]
        payload = analysis_generation_payload(context.corpus, context.request)
        assert set(payload) == {"request", "corpus"}
        assert "originArtifactRefs" not in payload["corpus"]["documents"][0]
    else:
        context, plan, _limits, _deadline = simulation.calls[0]
        payload = simulation_generation_payload(
            context.request, plan, context.grounding
        )
        assert set(payload) == {
            "scenario",
            "stakeholders",
            "sampling",
            "responseStyle",
            "generationProfile",
            "plan",
            "selectedPassages",
        }
    permit = context.processing_permit
    assert type(permit) is CapabilityProcessingPermit
    require_processing_permit(
        permit,
        purpose=operation.operation_type,
        operation_id=operation.operation_id,
        provider_payload=payload,
    )
    encoded = canonical_json(payload)
    for private in (
        str(operation.operation_id),
        str(operation.owner.tenant_id),
        str(operation.workflow.run_id),
        operation.owner.user_id,
        scope_fact().payload["authority"]["seal"],
        "processingConsent",
        "bindingHash",
        "acceptedScope",
    ):
        assert private not in encoded
    for changed in (
        None,
        replace(permit, _issuer=object()),
        replace(permit, purpose="other"),
        replace(permit, operation_id=UUID(uid(777))),
    ):
        with pytest.raises(CognitiveExecutionFailure, match="CONSENT_INVALID"):
            require_processing_permit(
                changed,
                purpose=operation.operation_type,
                operation_id=operation.operation_id,
                provider_payload=payload,
            )
    with pytest.raises(CognitiveExecutionFailure, match="CONSENT_INVALID"):
        require_processing_permit(
            permit,
            purpose=operation.operation_type,
            operation_id=operation.operation_id,
            provider_payload={**payload, "unselected": "not authorized"},
        )


@pytest.mark.asyncio
async def test_source_grounded_permit_contains_only_explicit_selected_passage_text():
    source = research_fact()
    operation = envelope(simulation_input(source=source))
    simulation = SimulationGenerator()
    resolver = Resolver(scope_fact())
    resolver.add(source, operation_type="ExecuteResearchV2")
    await executor(resolver, simulation=simulation).execute(operation)
    context, plan, _limits, _deadline = simulation.calls[0]
    payload = simulation_generation_payload(context.request, plan, context.grounding)
    assert payload["selectedPassages"] == [
        {"passageId": "passage-1", "text": source.payload["selectedClaims"][0]["text"]}
    ]
    encoded = canonical_json(payload)
    assert source.payload["selectedClaims"][1]["text"] not in encoded
    for private in (
        str(source.artifact_id),
        source.artifact_hash,
        source.payload["selectedClaims"][0]["claimId"],
        "sourceCatalogue",
        "sourceArtifacts",
    ):
        assert private not in encoded
    require_processing_permit(
        context.processing_permit,
        purpose="SimulateV1",
        operation_id=operation.operation_id,
        provider_payload=payload,
    )


@pytest.mark.parametrize(
    "bad_deadline", [None, False, "180", float("nan"), float("inf"), float("-inf")]
)
def test_processing_permit_requires_finite_strict_deadline(bad_deadline):
    operation = envelope(analysis_input())
    with pytest.raises(CognitiveExecutionFailure, match="CONSENT_INVALID"):
        issue_processing_permit(
            operation, provider_payload={"synthetic": "fixture"}, deadline=bad_deadline
        )


def test_processing_permit_cannot_extend_the_consent_bound_deadline():
    operation = envelope(analysis_input())
    with pytest.raises(CognitiveExecutionFailure, match="CONSENT_INVALID"):
        issue_processing_permit(
            operation,
            provider_payload={"synthetic": "fixture"},
            deadline=time.monotonic() + 181,
        )


@pytest.mark.parametrize("expired", [0, -1])
def test_processing_permit_fails_closed_after_its_absolute_deadline(expired):
    operation = envelope(analysis_input())
    payload = {"synthetic": "fixture"}
    permit = issue_processing_permit(
        operation, provider_payload=payload, deadline=time.monotonic() + 1
    )
    with pytest.raises(CognitiveExecutionFailure, match="CONSENT_INVALID"):
        require_processing_permit(
            replace(permit, deadline=time.monotonic() + expired),
            purpose=operation.operation_type,
            operation_id=operation.operation_id,
            provider_payload=payload,
        )


def test_processing_permit_revalidates_forged_limits_before_use():
    operation = envelope(analysis_input())
    payload = {"synthetic": "fixture"}
    permit = issue_processing_permit(
        operation, provider_payload=payload, deadline=time.monotonic() + 1
    )
    assert permit.limits == operation.input.limits
    invalid = replace(
        permit, limits=permit.limits.model_copy(update={"max_model_calls": True})
    )
    with pytest.raises(CognitiveExecutionFailure, match="CONSENT_INVALID"):
        require_processing_permit(
            invalid,
            purpose=operation.operation_type,
            operation_id=operation.operation_id,
            provider_payload=payload,
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
@pytest.mark.parametrize("count", [None, False, True, 0, 2, 100, "1"])
async def test_paid_capability_requires_first_strict_durable_claim_before_execution(
    make_input, count
):
    operation = envelope(make_input())
    store = worker_store(operation)
    store.claim = replace(store.claim, execution_count=count)
    analysis, simulation = Generator(), SimulationGenerator()
    resolver = Resolver(scope_fact(), corpus_fact())
    worker = OperationWorker(
        store,
        executor(resolver, analysis, simulation),
        lease_seconds=30,
        heartbeat_seconds=5,
    )
    assert await worker.run_once() is True
    assert store.completed is None
    assert store.failed["error_class"] == "AXWISE_CAPABILITY_RECONSENT_REQUIRED"
    assert store.failed["retryable"] is False
    assert not resolver.calls and not analysis.calls and not simulation.calls


@pytest.mark.asyncio
@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
async def test_cancellation_wins_before_reconsent_failure(make_input):
    store = worker_store(envelope(make_input()))
    store.claim = replace(store.claim, execution_count=2)
    store.cancel_requested = True
    worker = OperationWorker(store, executor(), lease_seconds=30, heartbeat_seconds=5)
    assert await worker.run_once() is True
    assert store.cancelled and store.completed is store.failed is None


@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
@pytest.mark.parametrize("count", [1, 2, None])
def test_store_reads_existing_counter_in_exact_claim_transaction_without_new_grants(
    make_input, count
):
    operation = envelope(make_input())
    token = UUID(uid(776))
    row = SimpleNamespace(
        operation_id=operation.operation_id,
        tenant_id=operation.owner.tenant_id,
        canonical_input_hash=operation.canonical_input_hash,
        status="running",
        result_payload=None,
        retryable=None,
        error_class=None,
        input_payload=operation.model_dump(mode="json", by_alias=True),
    )

    class Connection:
        def __init__(self):
            self.calls = []
            self.active = False

        def __enter__(self):
            self.active = True
            return self

        def __exit__(self, *_args):
            self.active = False

        def execute(self, statement, params):
            assert self.active
            self.calls.append((str(statement), params))
            return SimpleNamespace(first=lambda: row, scalar_one_or_none=lambda: count)

    connection = Connection()
    store = PostgresOperationStore(SimpleNamespace(begin=lambda: connection))
    claim = store.claim_next(token, 30)
    assert claim.execution_count == count and not connection.active
    assert len(connection.calls) == 3
    assert "claim_cognitive_operation" in connection.calls[0][0]
    assert "set_config('axwise.tenant_id'" in connection.calls[1][0]
    sql, params = connection.calls[2]
    for clause in (
        "SELECT execution_count",
        "tenant_id = :tenant_id",
        "operation_id = :operation_id",
        "lease_token = :lease_token",
        "lease_expires_at > clock_timestamp()",
    ):
        assert clause in sql
    assert params == {
        "tenant_id": operation.owner.tenant_id,
        "operation_id": operation.operation_id,
        "lease_token": token,
    }
