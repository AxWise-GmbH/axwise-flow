"""Real worker/store serialization with an exact SQL003-key-contract test double.

The double rejects unknown keys before any row update, just as deployed SQL004
does. This is not a substitute for the separately executed local PostgreSQL test.
"""

from __future__ import annotations

import json
import re
import socket
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy.exc import DataError

import backend.services.workflow_v2.cognitive_executor as executor_module
from backend.services.workflow_v2.cognitive_executor import (
    EvaluationDraft,
    _logged_failure_diagnostics,
)
from backend.services.workflow_v2.operation_service import (
    CognitiveExecutionFailure,
    OperationService,
)
from backend.services.workflow_v2.operation_store import PostgresOperationStore
from backend.services.workflow_v2.operation_worker import OperationWorker
from backend.tests.workflow_v2.test_final_semantic_gate import (
    FinalReviewWriter,
    final_case,
    nonplanning_final_case,
)
from backend.tests.workflow_v2.test_final_synthesis_reclaim_fence import (
    MemoryLeaseStore,
    synthesis_operation,
)


pytestmark = pytest.mark.contract
SQL = (
    Path(__file__).resolve().parents[2]
    / "database/workflow_v2/003_assistant_runtime.sql"
).read_text()


def sql_keys(function):
    body = SQL.split("CREATE FUNCTION axwise." + function + "(", 1)[1]
    allowlist = body.split("WHERE key.value NOT IN (", 1)[1].split(")", 1)[0]
    return set(re.findall(r"'([^']+)'", allowlist))


PHASE_KEYS = sql_keys("safe_failure_phase_diagnostics")
TOP_LEVEL_KEYS = sql_keys("safe_failure_diagnostics")


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def reject(*_args, **_kwargs):
        raise AssertionError("SQL contract tests must not use network")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket.socket, "connect_ex", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


def strict_route_status_diagnostics(value):
    # The new cognitive failure paths deliberately use only these two fields.
    # Derive the allowed keys from the actual unchanged migration, not Python's
    # broader diagnostic schema, to catch the original boundary mismatch.
    return (
        isinstance(value, dict)
        and set(value) == {"route", "status"}
        and set(value) <= PHASE_KEYS
        and set(value) <= TOP_LEVEL_KEYS
        and all(
            isinstance(item, str) and re.fullmatch(r"[A-Za-z0-9_:-]{1,100}", item)
            for item in value.values()
        )
    )


class FinalizationConnection:
    def __init__(self, memory):
        self.memory = memory

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def execute(self, statement, parameters):
        sql = str(statement)
        if "set_config('axwise.tenant_id'" in sql:
            return SimpleNamespace(scalar_one=lambda: None)
        assert "axwise.fail_cognitive_operation(" in sql
        diagnostics = json.loads(parameters["failure_diagnostics"])
        if not strict_route_status_diagnostics(diagnostics):
            raise DataError(sql, parameters, ValueError("invalid diagnostics"))
        self.memory._valid_lease(
            parameters["tenant_id"],
            parameters["operation_id"],
            parameters["lease_token"],
        )
        self.memory.serialized_diagnostics = diagnostics
        self.memory.record = replace(
            self.memory.record,
            status="failed",
            result_payload=None,
            retryable=parameters["retryable"],
            error_class=parameters["error_class"],
            failure_diagnostics=diagnostics,
        )
        self.memory.lease_token = None
        return SimpleNamespace(scalar_one=lambda: True)


class SqlContractMemoryStore(MemoryLeaseStore):
    def __init__(self, operation):
        super().__init__(operation)
        self.serialized_diagnostics = None
        self.pg = PostgresOperationStore(
            SimpleNamespace(begin=lambda: FinalizationConnection(self))
        )

    def fail(self, *args, **kwargs):
        # Execute the production Postgres store's JSON serialization/finalize
        # calls, with the strict SQL-shape rejection immediately before UPDATE.
        return self.pg.fail(*args, **kwargs)


def test_database_diagnostics_contract_still_excludes_usage_fields():
    assert {"input_tokens", "output_tokens", "total_tokens"}.isdisjoint(PHASE_KEYS)
    assert {"input_tokens", "output_tokens", "total_tokens"}.isdisjoint(TOP_LEVEL_KEYS)
    assert strict_route_status_diagnostics(
        {"route": "final_synthesis", "status": "semantic_rejected"}
    )
    assert not strict_route_status_diagnostics(
        {
            "route": "final_synthesis",
            "status": "semantic_rejected",
            "input_tokens": 24,
        }
    )


@pytest.mark.parametrize(
    "input_tokens,output_tokens,expected",
    [
        (24, 12, {"input_tokens": 24, "output_tokens": 12, "total_tokens": 36}),
        (True, "PRIVATE_TOKEN_SENTINEL", {}),
        (-1, 2_000_001, {}),
        (2_000_000, 1, {"input_tokens": 2_000_000, "output_tokens": 1}),
    ],
)
def test_failure_usage_is_separately_bounded_content_free_and_never_sql_payload(
    input_tokens, output_tokens, expected, caplog
):
    operation = synthesis_operation()
    diagnostics = _logged_failure_diagnostics(
        operation,
        route="final_synthesis",
        status="semantic_rejected",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    assert strict_route_status_diagnostics(diagnostics)
    record = next(
        record
        for record in caplog.records
        if record.message.startswith("cognitive_failure_usage ")
    )
    value = json.loads(record.message.removeprefix("cognitive_failure_usage "))
    assert value["operation_id"] == str(operation.operation_id)
    actual = {key: item for key, item in value.items() if key.endswith("_tokens")}
    assert actual == expected
    assert "PRIVATE_TOKEN_SENTINEL" not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure,status,error_class",
    [
        ("semantic", "semantic_rejected", "AXWISE_FINAL_SEMANTIC_REJECTED"),
        ("reviewer", "review_failed", "AXWISE_FINAL_SEMANTIC_REVIEW_FAILED"),
        ("missing", "review_unavailable", "AXWISE_FINAL_SEMANTIC_REVIEW_UNAVAILABLE"),
        ("contract", "contract_rejected", "AXWISE_FINAL_OUTPUT_CONTRACT_UNSATISFIED"),
    ],
)
async def test_real_final_failure_settles_through_worker_and_sql_store_mapping(
    failure, status, error_class, monkeypatch, caplog
):
    private = "PRIVATE_MODEL_FAILURE_TEXT_391"

    class BrokenReviewer(FinalReviewWriter):
        async def evaluate_final(self, *_args):
            self.final_calls += 1
            raise RuntimeError(private)

    writer = (
        BrokenReviewer(metrics=True)
        if failure == "reviewer"
        else FinalReviewWriter(
            metrics=True,
            review=EvaluationDraft(
                contradictions=[private] if failure == "semantic" else [],
                note="Bounded review result.",
            ),
        )
    )
    if failure == "semantic":
        writer.text = "\n\n## Decision note\n\nKeep the proposed design under human review."
        executor, operation = await nonplanning_final_case(writer, monkeypatch)
    else:
        executor, operation = await final_case(writer)
    if failure == "missing":
        writer.evaluate_final = None
    if failure == "contract":

        def reject_contract(*_args):
            raise ValueError(private)

        monkeypatch.setattr(executor_module, "_validate_synthesis", reject_contract)
    store = SqlContractMemoryStore(operation)
    worker = OperationWorker(store, executor)
    assert await worker.run_once() is True
    assert store.record.status == "failed"
    assert store.record.retryable is False
    assert store.record.error_class == error_class
    assert store.record.result_payload is None
    assert store.lease_token is None
    assert store.serialized_diagnostics == {
        "route": "final_synthesis",
        "status": status,
    }
    assert private not in json.dumps(store.serialized_diagnostics)
    assert private not in caplog.text
    assert writer.write_calls == 1
    assert writer.final_calls == (1 if failure in {"semantic", "reviewer"} else 0)
    assert await worker.run_once() is False
    replay = await OperationService(store).submit(
        operation, "https://local.invalid/status"
    )
    assert replay.status == "failed"
    assert replay.retryable is False
    assert store.execution_count == 1


@pytest.mark.asyncio
async def test_evaluation_overflow_diagnostics_also_persist_without_unknown_keys():
    operation = synthesis_operation("evaluate_output_repair")

    class OverflowExecutor:
        async def execute(self, value):
            raise CognitiveExecutionFailure(
                "AXWISE_EVALUATION_FINDINGS_OVERFLOW",
                retryable=False,
                diagnostics=_logged_failure_diagnostics(
                    value,
                    route="evaluate_output",
                    status="findings_overflow",
                    input_tokens=17,
                    output_tokens=9,
                ),
            )

    store = SqlContractMemoryStore(operation)
    worker = OperationWorker(store, OverflowExecutor())
    assert await worker.run_once() is True
    assert store.record.status == "failed"
    assert store.record.retryable is False
    assert store.serialized_diagnostics == {
        "route": "evaluate_output",
        "status": "findings_overflow",
    }
    assert await worker.run_once() is False
