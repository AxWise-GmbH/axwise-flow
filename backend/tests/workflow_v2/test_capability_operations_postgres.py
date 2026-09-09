"""Actual PG16 capability persistence; only an explicitly owned synthetic DB."""

from __future__ import annotations

import asyncio
import copy
import os
from uuid import UUID, uuid4

import pytest
from pydantic import TypeAdapter
from sqlalchemy import event, text
from sqlalchemy.exc import DBAPIError

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    canonical_hash,
)
from backend.domain.workflow_v2.processing_consent import (
    processing_consent_binding_hash,
)
from backend.services.workflow_v2.cognitive_executor import GeminiCognitiveExecutor
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.operation_store import StaleOperationLease
from backend.services.workflow_v2.operation_worker import OperationWorker
from backend.tests.workflow_v2.analysis_test_support import (
    AUTHORITY_KEY,
    USER_ID,
    Generator,
    admission_input,
    analysis_input,
    corpus,
    corpus_fact,
    document,
    envelope,
    ref,
    request,
    scope_fact,
    uid,
)
from backend.tests.workflow_v2.simulation_test_support import (
    SimulationGenerator,
    simulation_input,
)
from backend.tests.workflow_v2.test_operation_store_postgres import (
    engines,
    stores,
)  # noqa: F401

pytestmark = pytest.mark.contract
database_url = os.environ.get("AXWISE_V2_TEST_DATABASE_URL")
if not database_url:
    pytest.skip(
        "explicit isolated capability PostgreSQL URL required", allow_module_level=True
    )
# The shared PostgreSQL fixture additionally refuses a database not named as a test DB.
# This module runs under that same explicit CI/local fixture URL, never an implicit DSN.
completion_adapter = TypeAdapter(CompletionResult)


def operation(input_value, *, tenant_id=uid(901), user_id=USER_ID, run_id=uid(902)):
    value = envelope(
        input_value,
        operation_id=str(uuid4()),
        tenant_id=tenant_id,
        user_id=user_id,
        run_id=run_id,
    ).model_dump(mode="json", by_alias=True)
    value["workflow"]["stageId"] = str(uuid4())
    value["workflow"]["stageAttemptId"] = str(uuid4())
    if value["operationType"] in {"AnalyzeEvidenceV1", "SimulateV1"}:
        # Explicit synthetic test opt-in, after finalizing the operation identities.
        # Production owner commands may never silently retarget old consent.
        value["input"]["processingConsent"]["bindingHash"] = (
            processing_consent_binding_hash(
                operation_type=value["operationType"],
                operation_id=value["operationId"],
                owner=value["owner"],
                workflow=value["workflow"],
                contract_version=value["contractVersion"],
                input_value=value["input"],
            )
        )
        value["canonicalInputHash"] = canonical_hash(value["input"])
    return AxWiseOperationEnvelope.model_validate(value)


def compile_input():
    return {
        "type": "CompileScopeV2",
        "request": "Synthetic source-authority fixture.",
        "objectiveOnlyContext": [],
        "safeDefaults": {
            "geography": [],
            "acceptedSourceTypes": [],
            "assumptions": [],
            "limits": [],
            "policies": [],
        },
    }


def seed_fact(
    api,
    worker,
    fact,
    *,
    producer="AdmitTranscriptCorpusV1",
    tenant_id=uid(901),
    user_id=USER_ID,
    run_id=uid(902),
):
    """Insert a signed source fixture through actual API adoption/worker completion."""
    value = operation(
        compile_input() if producer == "CompileScopeV2" else admission_input(),
        tenant_id=tenant_id,
        user_id=user_id,
        run_id=run_id,
    )
    api.adopt_or_create(value)
    lease = uuid4()
    claimed = worker.claim_next(lease, 30)
    assert claimed.envelope == value
    raw = (
        fact.model_dump(mode="json", by_alias=True)
        if hasattr(fact, "model_dump")
        else copy.deepcopy(fact)
    )
    worker.complete(
        value.owner.tenant_id,
        value.operation_id,
        lease,
        {
            "resultType": (
                "scope_compiled"
                if producer == "CompileScopeV2"
                else "transcript_corpus_admitted"
            ),
            "artifact": raw,
        },
    )
    return value


def seeded_executor(api, worker):
    seed_fact(api, worker, scope_fact(), producer="CompileScopeV2")
    analyzer, simulator = Generator(), SimulationGenerator()
    executor = GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=worker,
        analysis_generator=analyzer,
        simulation_generator=simulator,
    )
    return executor, analyzer, simulator


async def execute_and_persist(api, worker, executor, value):
    accepted = api.adopt_or_create(value)
    assert accepted.status == "accepted"
    assert api.adopt_or_create(value) == accepted
    runner = OperationWorker(worker, executor, lease_seconds=30, heartbeat_seconds=5)
    assert await runner.run_once() is True
    completed = api.get(value.owner.tenant_id, value.operation_id)
    assert completed.status == "completed"
    raw = completed.result_payload
    result = completion_adapter.validate_python(raw)
    replay = api.adopt_or_create(value)
    assert replay.status == "completed" and replay.result_payload == raw
    events = api.events_after(
        value.owner.tenant_id, value.operation_id, after=0, limit=20
    ).events
    assert [(event.sequence, event.event_type) for event in events] == [
        (1, "accepted"),
        (2, "running"),
        (3, "completed"),
    ]
    assert worker.claim_next(uuid4(), 30) is None
    return result


def test_new_capability_roles_are_least_privileged_and_ready(stores):
    admin, api, worker = stores
    assert api.ready() and worker.ready()
    with admin.connect() as connection:
        flags = (
            connection.execute(
                text(
                    "SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname IN ('axwise_v2_api_test','axwise_v2_worker_test')"
                )
            )
            .mappings()
            .all()
        )
        assert len(flags) == 2
        assert all(
            not any(
                row[key]
                for key in ["rolsuper", "rolbypassrls", "rolcreatedb", "rolcreaterole"]
            )
            for row in flags
        )
    for store in [api, worker]:
        with store.engine.connect() as connection:
            assert (
                connection.execute(
                    text("SELECT count(*) FROM axwise.cognitive_operations")
                ).scalar_one()
                == 0
            )
            assert not connection.execute(
                text(
                    "SELECT has_table_privilege(current_user,'axwise.cognitive_operations','UPDATE')"
                )
            ).scalar_one()
            assert not connection.execute(
                text(
                    "SELECT has_table_privilege(current_user,'axwise.cognitive_operations','DELETE')"
                )
            ).scalar_one()


def test_actual_admission_analysis_simulation_pipeline_and_replay(stores):
    _admin, api, worker = stores
    executor, analyzer, simulator = seeded_executor(api, worker)
    supplied = corpus(document(text="I prefer Café e\u0301 updates 🧭.\r\n"))

    async def run():
        admitted = await execute_and_persist(
            api, worker, executor, operation(admission_input(supplied))
        )
        assert (
            admitted.artifact.payload == supplied and admitted.metrics.model_calls == 0
        )
        assert not analyzer.calls and not simulator.calls
        analyzed = await execute_and_persist(
            api, worker, executor, operation(analysis_input(source=admitted.artifact))
        )
        assert (
            analyzed.artifact.payload["quotes"][0]["text"]
            == supplied["documents"][0]["text"]
        )
        assert analyzed.artifact.source_artifact_ids == sorted(
            [scope_fact().artifact_id, admitted.artifact.artifact_id], key=str
        )
        simulated = await execute_and_persist(
            api, worker, executor, operation(simulation_input(source=analyzed.artifact))
        )
        grounding = simulator.calls[0][0].grounding
        assert len(grounding) == 1 and grounding[0].entry_kind == "quote"
        assert (
            grounding[0].entry_id == analyzed.artifact.payload["quotes"][0]["quoteId"]
        )
        assert grounding[0].text == analyzed.artifact.payload["quotes"][0]["text"]
        assert simulated.artifact.payload["origin"] == "synthetic"
        assert simulated.artifact.payload["grounding"]["status"] == "applied"
        assert len(analyzer.calls) == len(simulator.calls) == 1
        readmitted_corpus = copy.deepcopy(simulated.artifact.payload["corpus"])
        for item in readmitted_corpus["documents"]:
            item["originArtifactRefs"] = [ref(simulated.artifact)]
        readmitted = await execute_and_persist(
            api, worker, executor, operation(admission_input(readmitted_corpus))
        )
        assert readmitted.artifact.payload == readmitted_corpus
        assert readmitted.artifact.source_artifact_ids == [
            simulated.artifact.artifact_id
        ]
        followup = await execute_and_persist(
            api,
            worker,
            executor,
            operation(
                analysis_input(
                    source=readmitted.artifact,
                    analysis_request=request(outputs=["personas", "jobs_pains"]),
                )
            ),
        )
        assert all(
            item["basis"] == "simulation_hypothesis"
            for item in followup.artifact.payload["findings"]
        )
        assert all(
            item["origin"] == "synthetic_transcript"
            for item in followup.artifact.payload["quotes"]
        )
        assert len(analyzer.calls) == 2 and len(simulator.calls) == 1
        for fact, producer in [
            (admitted.artifact, "AdmitTranscriptCorpusV1"),
            (analyzed.artifact, "AnalyzeEvidenceV1"),
            (simulated.artifact, "SimulateV1"),
        ]:
            assert worker.owned_artifact_fact(
                UUID(uid(901)),
                USER_ID,
                UUID(uid(902)),
                fact.artifact_id,
                operation_types=(producer,),
            ) == fact.model_dump(mode="json", by_alias=True)

    asyncio.run(run())


@pytest.mark.parametrize(
    "mismatch", ["tenant", "user", "run", "producer", "artifact", "no_allowed_producer"]
)
def test_owned_fact_query_requires_every_identity_and_allowed_producer(
    stores, mismatch
):
    _admin, api, worker = stores
    fact = corpus_fact()
    seed_fact(api, worker, fact)
    value = worker.owned_artifact_fact(
        UUID(uid(999) if mismatch == "tenant" else uid(901)),
        "user_other" if mismatch == "user" else USER_ID,
        UUID(uid(999) if mismatch == "run" else uid(902)),
        UUID(uid(999)) if mismatch == "artifact" else fact.artifact_id,
        operation_types=(
            ()
            if mismatch == "no_allowed_producer"
            else (
                ("SimulateV1",)
                if mismatch == "producer"
                else ("AdmitTranscriptCorpusV1",)
            )
        ),
    )
    assert value is None
    assert worker.artifact_fact(UUID(uid(901)), fact.artifact_id) == fact.model_dump(
        mode="json", by_alias=True
    ), "legacy tenant-only reader remains unchanged"


def test_uncompleted_producer_does_not_admit_a_caller_supplied_fact(stores):
    _admin, api, worker = stores
    api.adopt_or_create(operation(admission_input()))
    assert (
        worker.owned_artifact_fact(
            UUID(uid(901)),
            USER_ID,
            UUID(uid(902)),
            corpus_fact().artifact_id,
            operation_types=("AdmitTranscriptCorpusV1",),
        )
        is None
    )


def test_ambiguous_owned_fact_fails_closed_before_analysis_generation(stores):
    _admin, api, worker = stores
    executor, analyzer, _simulator = seeded_executor(api, worker)
    fact = corpus_fact()
    seed_fact(api, worker, fact)
    seed_fact(api, worker, fact)
    with pytest.raises(RuntimeError, match="ambiguous"):
        worker.owned_artifact_fact(
            UUID(uid(901)),
            USER_ID,
            UUID(uid(902)),
            fact.artifact_id,
            operation_types=("AdmitTranscriptCorpusV1",),
        )
    with pytest.raises(
        CognitiveExecutionFailure, match="AXWISE_CAPABILITY_SOURCE_NOT_ADMITTED"
    ):
        asyncio.run(executor.execute(operation(analysis_input(source=fact))))
    assert not analyzer.calls


@pytest.mark.parametrize("mismatch", ["tenant", "user", "run", "producer"])
def test_persisted_foreign_corpus_is_denied_before_generation(stores, mismatch):
    _admin, api, worker = stores
    executor, analyzer, _simulator = seeded_executor(api, worker)
    fact = corpus_fact()
    seed_fact(
        api,
        worker,
        fact,
        tenant_id=uid(999) if mismatch == "tenant" else uid(901),
        user_id="user_other" if mismatch == "user" else USER_ID,
        run_id=uid(999) if mismatch == "run" else uid(902),
        producer=(
            "CompileScopeV2" if mismatch == "producer" else "AdmitTranscriptCorpusV1"
        ),
    )
    with pytest.raises(
        CognitiveExecutionFailure, match="AXWISE_CAPABILITY_SOURCE_NOT_ADMITTED"
    ):
        asyncio.run(executor.execute(operation(analysis_input(source=fact))))
    assert not analyzer.calls


@pytest.mark.parametrize("change", ["artifactId", "artifactHash", "kind", "payload"])
def test_corrupt_persisted_fact_cannot_replace_exact_input_reference(stores, change):
    _admin, api, worker = stores
    executor, analyzer, _simulator = seeded_executor(api, worker)
    original = corpus_fact()
    corrupt = original.model_dump(mode="json", by_alias=True)
    if change == "payload":
        corrupt["payload"]["documents"][0]["text"] = "Corrupt synthetic payload"
    else:
        corrupt[change] = (
            uid(999)
            if change == "artifactId"
            else "f" * 64 if change == "artifactHash" else "scope"
        )
    seed_fact(api, worker, corrupt)
    with pytest.raises(
        CognitiveExecutionFailure, match="AXWISE_CAPABILITY_SOURCE_NOT_ADMITTED"
    ):
        asyncio.run(executor.execute(operation(analysis_input(source=original))))
    assert not analyzer.calls


@pytest.mark.parametrize(
    "kind", ["AdmitTranscriptCorpusV1", "AnalyzeEvidenceV1", "SimulateV1"]
)
def test_real_reclaim_preserves_identity_and_requires_fresh_consent_for_paid_capabilities(
    stores, monkeypatch, kind
):
    admin, api, worker = stores
    executor, analyzer, simulator = seeded_executor(api, worker)
    source = corpus_fact()
    if kind == "AnalyzeEvidenceV1":
        seed_fact(api, worker, source)
    input_value = (
        admission_input()
        if kind == "AdmitTranscriptCorpusV1"
        else (
            analysis_input(source=source)
            if kind == "AnalyzeEvidenceV1"
            else simulation_input()
        )
    )
    value = operation(input_value)
    api.adopt_or_create(value)
    old_lease = uuid4()
    first = worker.claim_next(old_lease, 30)
    assert first.envelope == value
    assert first.execution_count == (None if kind == "AdmitTranscriptCorpusV1" else 1)
    with admin.begin() as connection:
        changed = connection.execute(
            text(
                "UPDATE axwise.cognitive_operations SET lease_expires_at=clock_timestamp() WHERE operation_id=:id"
            ),
            {"id": value.operation_id},
        )
        assert changed.rowcount == 1
    assert not worker.renew(value.owner.tenant_id, value.operation_id, old_lease, 30)
    with pytest.raises(StaleOperationLease):
        worker.complete(
            value.owner.tenant_id,
            value.operation_id,
            old_lease,
            {"synthetic": "must not persist"},
        )
    original_claim = worker.claim_next
    claims, calls = [], []

    def record_claim(token, seconds):
        claim = original_claim(token, seconds)
        claims.append(claim)
        return claim

    class RecordingExecutor:
        async def execute(self, envelope_value):
            calls.append(envelope_value)
            return await executor.execute(envelope_value)

    monkeypatch.setattr(worker, "claim_next", record_claim)
    runner = OperationWorker(
        worker, RecordingExecutor(), lease_seconds=30, heartbeat_seconds=5
    )
    assert asyncio.run(runner.run_once()) is True
    claim = claims[0]
    assert claim.envelope == value and claim.lease_token != old_lease
    current = api.get(value.owner.tenant_id, value.operation_id)
    if kind == "AdmitTranscriptCorpusV1":
        assert claim.execution_count is None
        assert current.status == "completed" and len(calls) == 1
    else:
        assert claim.execution_count == 2
        assert current.status == "failed" and current.retryable is False
        assert current.error_class == "AXWISE_CAPABILITY_RECONSENT_REQUIRED"
        assert current.result_payload is None and not calls
    assert not analyzer.calls and not simulator.calls
    assert api.adopt_or_create(value) == current
    with pytest.raises(StaleOperationLease):
        worker.complete(
            value.owner.tenant_id,
            value.operation_id,
            claim.lease_token,
            {"synthetic": "must not persist"},
        )
    with pytest.raises(DBAPIError):
        with admin.begin() as connection:
            connection.execute(
                text(
                    "UPDATE axwise.cognitive_operations SET result_payload='{}'::jsonb WHERE operation_id=:id"
                ),
                {"id": value.operation_id},
            )
    assert api.get(value.owner.tenant_id, value.operation_id) == current
    with admin.connect() as connection:
        assert (
            connection.execute(
                text(
                    "SELECT execution_count FROM axwise.cognitive_operations WHERE operation_id=:id"
                ),
                {"id": value.operation_id},
            ).scalar_one()
            == 2
        )
    if kind != "AdmitTranscriptCorpusV1":
        # A separate explicitly authorized test operation is permitted; replay of
        # the failed operation never implicitly creates or consents a new attempt.
        fresh = operation(input_value)
        assert (
            fresh.input.processing_consent.binding_hash
            != value.input.processing_consent.binding_hash
        )
        asyncio.run(execute_and_persist(api, worker, executor, fresh))
        assert len(analyzer.calls) + len(simulator.calls) == 1


def test_real_scope_authority_is_verified_before_analysis_generation(stores):
    _admin, api, worker = stores
    invalid = scope_fact().model_dump(mode="json", by_alias=True)
    invalid["payload"]["authority"]["seal"] = "0" * 64
    from backend.domain.workflow_v2.contracts import (
        ScopeArtifactFact,
        artifact_content_hash,
    )

    invalid["artifactHash"] = artifact_content_hash(
        content_type="application/json", payload=invalid["payload"], markdown=None
    )
    invalid = ScopeArtifactFact.model_validate(invalid)
    seed_fact(api, worker, invalid, producer="CompileScopeV2")
    source = corpus_fact()
    seed_fact(api, worker, source)
    generator = Generator()
    executor = GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=worker,
        analysis_generator=generator,
    )
    with pytest.raises(
        CognitiveExecutionFailure, match="AXWISE_SCOPE_AUTHORITY_INVALID"
    ):
        asyncio.run(
            executor.execute(operation(analysis_input(source=source, scope=invalid)))
        )
    assert not generator.calls


@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
def test_actual_capability_counter_read_is_same_claim_transaction_and_tenant_context(
    stores, make_input
):
    _admin, api, worker = stores
    value = operation(make_input())
    api.adopt_or_create(value)
    observations = []

    def observe(connection, cursor, statement, parameters, context, executemany):
        observations.append(
            (connection, connection.get_transaction(), statement, parameters)
        )

    event.listen(worker.engine, "before_cursor_execute", observe)
    try:
        claim = worker.claim_next(uuid4(), 30)
    finally:
        event.remove(worker.engine, "before_cursor_execute", observe)
    assert claim.execution_count == 1
    assert len(observations) == 3
    first, tenant, counter = observations
    assert "claim_cognitive_operation" in first[2]
    assert "set_config('axwise.tenant_id'" in tenant[2]
    assert "SELECT execution_count" in counter[2]
    assert first[0] is tenant[0] is counter[0]
    assert first[1] is not None and first[1] is tenant[1] is counter[1]
    assert counter[3] == {
        "tenant_id": value.owner.tenant_id,
        "operation_id": value.operation_id,
        "lease_token": claim.lease_token,
    }
    with worker.engine.connect() as connection:
        # SET LOCAL from claim processing must not leak tenant state into a pool reuse.
        assert (
            connection.execute(
                text("SELECT count(*) FROM axwise.cognitive_operations")
            ).scalar_one()
            == 0
        )
    with api.engine.connect() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM axwise.cognitive_operations")
            ).scalar_one()
            == 0
        )


@pytest.mark.parametrize("make_input", [analysis_input, simulation_input])
def test_actual_cancelled_reclaim_wins_over_reconsent_failure_without_executor(
    stores, make_input
):
    admin, api, worker = stores
    value = operation(make_input())
    api.adopt_or_create(value)
    old_lease = uuid4()
    assert worker.claim_next(old_lease, 30).execution_count == 1
    assert (
        api.request_cancel(value.owner.tenant_id, value.operation_id).status
        == "cancel_requested"
    )
    with admin.begin() as connection:
        changed = connection.execute(
            text(
                "UPDATE axwise.cognitive_operations SET lease_expires_at=clock_timestamp() WHERE operation_id=:id"
            ),
            {"id": value.operation_id},
        )
        assert changed.rowcount == 1
    calls = []

    class ForbiddenExecutor:
        async def execute(self, envelope_value):
            calls.append(envelope_value)
            raise AssertionError("Cancellation must precede any executor invocation")

    runner = OperationWorker(
        worker, ForbiddenExecutor(), lease_seconds=30, heartbeat_seconds=5
    )
    assert asyncio.run(runner.run_once()) is True
    result = api.get(value.owner.tenant_id, value.operation_id)
    assert result.status == "cancelled" and result.error_class is None
    assert not calls and result.result_payload is None
    with admin.connect() as connection:
        assert (
            connection.execute(
                text(
                    "SELECT execution_count FROM axwise.cognitive_operations WHERE operation_id=:id"
                ),
                {"id": value.operation_id},
            ).scalar_one()
            == 2
        )
    with pytest.raises(StaleOperationLease):
        worker.fail(
            value.owner.tenant_id,
            value.operation_id,
            old_lease,
            retryable=False,
            error_class="AXWISE_CAPABILITY_RECONSENT_REQUIRED",
        )
    assert api.adopt_or_create(value).status == "cancelled"
