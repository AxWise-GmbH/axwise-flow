from __future__ import annotations

import ast
import asyncio
import io
import logging
from types import SimpleNamespace

import pytest

from backend.api import workflow_v2_worker_app
from backend.services.workflow_v2 import worker_main
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.operation_store import StaleOperationLease
from backend.services.workflow_v2.operation_worker import OperationWorker, _log_state
from backend.services.workflow_v2.worker_logging import (
    LOGGER_NAME,
    configure_worker_logging,
)
from backend.tests.workflow_v2.test_operation_worker import Store, result


pytestmark = pytest.mark.contract


def test_logger_drops_plain_dict_with_hostile_colliding_key_without_comparison(capsys):
    class HostileKey:
        def __hash__(self):
            return hash("stage")

        def __eq__(self, _other):
            raise ValueError("PRIVATE key comparison")

    configure_worker_logging()
    _log_state(Store().claim, "failed", evidenceDiagnostics={HostileKey(): "PRIVATE"})
    recorded, output = events(capsys)
    assert [row["state"] for row in recorded] == ["failed"]
    assert "evidenceDiagnostics" not in output and "PRIVATE" not in output


@pytest.mark.asyncio
async def test_committed_failure_logs_bounded_evidence_but_does_not_persist_sidecar(
    capsys,
):
    class Executor:
        async def execute(self, _envelope):
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_EMPTY_RESPONSE",
                retryable=True,
                diagnostics={
                    "route": "gemini_google_search",
                    "status": "response_processing_error",
                    "evidence": {
                        "stage": "admission",
                        "query_complete": True,
                        "candidate_count": 0,
                        "rejected_candidate_count": 3,
                        "url": "https://private.invalid",
                        "prompt": "PRIVATE",
                    },
                },
            )

    configure_worker_logging()
    store = Store()
    assert await OperationWorker(store, Executor()).run_once()
    recorded, output = events(capsys)
    assert [row["state"] for row in recorded] == ["claimed", "failed"]
    assert recorded[1]["operationId"] == str(store.claim.envelope.operation_id)
    assert recorded[1]["evidenceDiagnostics"] == {
        "stage": "admission",
        "query_complete": True,
        "candidate_count": 0,
        "rejected_candidate_count": 3,
    }
    assert store.failed["failure_diagnostics"] == {
        "route": "gemini_google_search",
        "status": "response_processing_error",
    }
    assert "PRIVATE" not in output and "private.invalid" not in output
    assert store.completed is None


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel", [False, True])
async def test_evidence_does_not_claim_committed_failure_after_stale_lease_or_cancel(
    cancel, capsys
):
    class RejectingStore(Store):
        def fail(self, *_args, **_kwargs):
            raise StaleOperationLease("private stale failure")

    store = RejectingStore()

    class Executor:
        async def execute(self, _envelope):
            store.cancel_requested = cancel
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_EMPTY_RESPONSE",
                retryable=True,
                diagnostics={
                    "route": "gemini_google_search",
                    "status": "unavailable",
                    "evidence": {"stage": "extraction", "claim_count": 0},
                },
            )

    configure_worker_logging()
    assert await OperationWorker(store, Executor()).run_once()
    recorded, output = events(capsys)
    assert [row["state"] for row in recorded] == [
        "claimed",
        "cancelled" if cancel else "stale_failure_rejected",
    ]
    assert "evidenceDiagnostics" not in output
    assert store.failed is None


def test_logging_boundary_revalidates_evidence_and_rejects_non_failure_attachment(
    capsys,
):
    configure_worker_logging()
    claim = Store().claim
    values = {
        "stage": "fetch",
        "fetched_count": 1,
        "fetch_error_count": True,
        "candidate_count": 10_001,
        "query_complete": "true",
        "url": "https://private.invalid",
        "body": "PRIVATE",
    }
    _log_state(claim, "failed", evidenceDiagnostics=values)
    _log_state(claim, "heartbeat", evidenceDiagnostics=values)
    _log_state(claim, "failed", evidenceDiagnostics={"stage": ["PRIVATE"]})
    recorded, output = events(capsys)
    assert recorded[0]["evidenceDiagnostics"] == {"stage": "fetch", "fetched_count": 1}
    assert "evidenceDiagnostics" not in recorded[1]
    assert "evidenceDiagnostics" not in recorded[2]
    assert "PRIVATE" not in output and "private.invalid" not in output


@pytest.mark.asyncio
async def test_mutated_hostile_sidecar_does_not_fail_after_database_finalization(
    capsys,
):
    class HostileEvidence(dict):
        def get(self, *_args):
            raise ValueError("PRIVATE evidence lookup")

        def __bool__(self):
            raise ValueError("PRIVATE evidence truthiness")

    class Executor:
        async def execute(self, _envelope):
            error = CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_EMPTY_RESPONSE", retryable=True
            )
            error.evidence_diagnostics = HostileEvidence(stage="fetch")
            raise error

    configure_worker_logging()
    store = Store()
    assert await OperationWorker(store, Executor()).run_once()
    recorded, output = events(capsys)
    assert [row["state"] for row in recorded] == ["claimed", "failed"]
    assert store.failed["error_class"] == "AXWISE_ASSISTANT_EMPTY_RESPONSE"
    assert "evidenceDiagnostics" not in output and "PRIVATE" not in output


@pytest.mark.asyncio
async def test_uncommitted_store_failure_emits_no_committed_evidence_log(capsys):
    class BrokenStore(Store):
        def fail(self, *_args, **_kwargs):
            raise RuntimeError("synthetic store failure")

    class Executor:
        async def execute(self, _envelope):
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_EMPTY_RESPONSE",
                retryable=True,
                diagnostics={"evidence": {"stage": "admission", "candidate_count": 0}},
            )

    configure_worker_logging()
    with pytest.raises(RuntimeError, match="synthetic store failure"):
        await OperationWorker(BrokenStore(), Executor()).run_once()
    recorded, output = events(capsys)
    assert [row["state"] for row in recorded] == ["claimed"]
    assert "evidenceDiagnostics" not in output


@pytest.mark.asyncio
async def test_sequential_operations_do_not_share_evidence_observations(capsys):
    class Executor:
        def __init__(self, observation):
            self.observation = observation

        async def execute(self, _envelope):
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_EMPTY_RESPONSE",
                retryable=True,
                diagnostics={"evidence": self.observation},
            )

    configure_worker_logging()
    for observation in (
        {"stage": "admission", "candidate_count": 0},
        {"stage": "extraction", "candidate_count": 2, "claim_count": 0},
        None,
    ):
        assert await OperationWorker(Store(), Executor(observation)).run_once()
    recorded, _output = events(capsys)
    failures = [row for row in recorded if row["state"] == "failed"]
    assert failures[0]["evidenceDiagnostics"] == {
        "stage": "admission",
        "candidate_count": 0,
    }
    assert failures[1]["evidenceDiagnostics"] == {
        "stage": "extraction",
        "candidate_count": 2,
        "claim_count": 0,
    }
    assert "evidenceDiagnostics" not in failures[2]


@pytest.fixture(autouse=True)
def restore_logging(monkeypatch):
    logger = logging.getLogger(LOGGER_NAME)
    before = (logger.level, logger.disabled, logger.propagate, list(logger.handlers))
    root = logging.getLogger()
    root_level = root.level
    root.setLevel(logging.WARNING)
    monkeypatch.delenv("AXWISE_OPERATION_LOG_LEVEL", raising=False)
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("K_REVISION", "axwise-v2-worker-preview-observability-test")
    try:
        yield
    finally:
        for handler in list(logger.handlers):
            logger.removeHandler(handler)
            if handler not in before[3]:
                handler.close()
        logger.setLevel(before[0])
        logger.disabled, logger.propagate = before[1:3]
        for handler in before[3]:
            logger.addHandler(handler)
        root.setLevel(root_level)


def events(capsys) -> tuple[list[dict], str]:
    output = capsys.readouterr().err
    return [
        ast.literal_eval(line.split("axwise_workflow_v2 ", 1)[1])
        for line in output.splitlines()
    ], output


def test_default_info_visible_even_with_root_warning_and_global_debug(capsys):
    providers = [
        logging.getLogger(name)
        for name in ("httpx", "httpcore", "google", "pydantic_ai")
    ]
    before = [
        (logger.level, logger.propagate, list(logger.handlers)) for logger in providers
    ]
    configure_worker_logging()
    logger = logging.getLogger(LOGGER_NAME)
    assert logger.level == logging.INFO
    assert logging.getLogger().level == logging.WARNING
    assert [(item.level, item.propagate, item.handlers) for item in providers] == before
    _log_state(Store().claim, "claimed")
    recorded, _ = events(capsys)
    assert len(recorded) == 1
    assert recorded[0]["state"] == "claimed"
    assert (
        recorded[0]["deploymentRevision"]
        == "axwise-v2-worker-preview-observability-test"
    )


def test_repeated_configuration_keeps_one_handler_and_does_not_propagate(capsys):
    root_stream = io.StringIO()
    root_handler = logging.StreamHandler(root_stream)
    logging.getLogger().addHandler(root_handler)
    try:
        configure_worker_logging()
        original = logging.getLogger(LOGGER_NAME).handlers[0]
        configure_worker_logging()
        configure_worker_logging()
        assert logging.getLogger(LOGGER_NAME).handlers == [original]
        _log_state(Store().claim, "heartbeat")
        recorded, _ = events(capsys)
        assert [item["state"] for item in recorded] == ["heartbeat"]
        assert root_stream.getvalue() == ""
    finally:
        logging.getLogger().removeHandler(root_handler)
        root_handler.close()


@pytest.mark.parametrize(
    "level", ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL", " info "]
)
def test_dedicated_level_policy_is_deterministic(level, monkeypatch, capsys):
    monkeypatch.setenv("AXWISE_OPERATION_LOG_LEVEL", level)
    configure_worker_logging()
    expected = getattr(logging, level.strip().upper())
    logger = logging.getLogger(LOGGER_NAME)
    assert logger.level == logger.handlers[0].level == expected
    _log_state(Store().claim, "claimed")
    assert len(events(capsys)[0]) == (1 if expected <= logging.INFO else 0)
    assert logging.getLogger().level == logging.WARNING


@pytest.mark.parametrize(
    "level", ["", "NOTSET", "10", "private-invalid-level\ncredential-value"]
)
def test_invalid_level_fails_without_echoing_the_value(level, monkeypatch):
    monkeypatch.setenv("AXWISE_OPERATION_LOG_LEVEL", level)
    with pytest.raises(ValueError) as failure:
        configure_worker_logging()
    assert (
        str(failure.value)
        == "AXWISE_OPERATION_LOG_LEVEL must be DEBUG, INFO, WARNING, ERROR or CRITICAL"
    )
    assert logging.getLogger().level == logging.WARNING


@pytest.mark.asyncio
async def test_fastapi_lifespan_configures_logging_without_cli_and_reuses_handler(
    monkeypatch, capsys
):
    claim = Store().claim
    started = asyncio.Event()
    cleanup = []

    class Worker:
        async def run_forever(self):
            _log_state(claim, "claimed")
            started.set()
            await asyncio.Event().wait()

        async def close(self):
            cleanup.append("worker")

    def build():
        assert logging.getLogger(LOGGER_NAME).isEnabledFor(logging.INFO)
        return (
            SimpleNamespace(
                engine=SimpleNamespace(dispose=lambda: cleanup.append("store"))
            ),
            Worker(),
        )

    async def close_models():
        cleanup.append("models")

    monkeypatch.setattr(workflow_v2_worker_app, "build_worker", build)
    monkeypatch.setattr(
        workflow_v2_worker_app, "close_shared_research_models", close_models
    )
    monkeypatch.setattr(
        worker_main, "main", lambda: pytest.fail("ASGI must not invoke the CLI")
    )
    handlers = []
    for _ in range(2):
        started.clear()
        async with workflow_v2_worker_app.app.router.lifespan_context(
            workflow_v2_worker_app.app
        ):
            await asyncio.wait_for(started.wait(), timeout=1)
            handlers.append(logging.getLogger(LOGGER_NAME).handlers[0])
    assert handlers[0] is handlers[1]
    assert [item["state"] for item in events(capsys)[0]] == ["claimed", "claimed"]
    assert cleanup == ["worker", "models", "store"] * 2


def test_cli_uses_same_scoped_setup_without_global_basic_config(monkeypatch, capsys):
    claim = Store().claim

    class Worker:
        async def run_forever(self, **_kwargs):
            _log_state(claim, "claimed")

        async def close(self):
            pass

    async def close_models():
        pass

    monkeypatch.setattr(
        worker_main,
        "build_worker",
        lambda: (
            SimpleNamespace(engine=SimpleNamespace(dispose=lambda: None)),
            Worker(),
        ),
    )
    monkeypatch.setattr(worker_main, "close_shared_research_models", close_models)
    monkeypatch.setattr(
        logging,
        "basicConfig",
        lambda **_kwargs: pytest.fail("global logging setup is forbidden"),
    )
    worker_main.main()
    assert [item["state"] for item in events(capsys)[0]] == ["claimed"]
    assert logging.getLogger().level == logging.WARNING


@pytest.mark.asyncio
async def test_real_worker_completion_emits_current_usage_fields(capsys):
    class Executor:
        async def execute(self, _envelope):
            value = result()
            return value.model_copy(
                update={
                    "metrics": value.metrics.model_copy(
                        update={
                            "input_tokens": 17,
                            "output_tokens": 13,
                            "total_tokens": 30,
                            "search_calls": 2,
                            "estimated_cost_micros": 49,
                        }
                    )
                }
            )

    configure_worker_logging()
    store = Store()
    assert await OperationWorker(store, Executor()).run_once()
    recorded, output = events(capsys)
    assert [item["state"] for item in recorded] == ["claimed", "completed"]
    completed = recorded[1]
    assert {
        key: completed[key]
        for key in (
            "inputTokens",
            "outputTokens",
            "totalTokens",
            "searchCalls",
            "estimatedCostMicros",
        )
    } == {
        "inputTokens": 17,
        "outputTokens": 13,
        "totalTokens": 30,
        "searchCalls": 2,
        "estimatedCostMicros": 49,
    }
    assert completed["latencyMs"] >= 1
    assert completed["operationId"] == str(store.claim.envelope.operation_id)
    assert len(completed["leaseFingerprint"]) == 12
    assert str(store.claim.lease_token) not in output
    assert store.claim.envelope.input.request not in output
    assert store.completed is not None


@pytest.mark.asyncio
async def test_failure_logs_classification_without_raw_exception_or_prompt(capsys):
    secret = "private prompt and authorization Bearer credential-value"

    class Executor:
        async def execute(self, _envelope):
            raise RuntimeError(secret)

    configure_worker_logging()
    store = Store()
    assert await OperationWorker(store, Executor()).run_once()
    recorded, output = events(capsys)
    assert [item["state"] for item in recorded] == [
        "claimed",
        "unexpected_failure",
        "failed",
    ]
    assert recorded[1]["errorType"] == "RuntimeError"
    assert recorded[2]["errorClass"] == "AXWISE_EXECUTION_ERROR"
    assert secret not in output
    assert "Traceback" not in output
    assert store.claim.envelope.input.request not in output


def test_handler_refuses_raw_provider_or_exception_records_and_extra_fields(
    monkeypatch, capsys
):
    monkeypatch.setenv("AXWISE_OPERATION_LOG_LEVEL", "DEBUG")
    configure_worker_logging()
    logger = logging.getLogger(LOGGER_NAME)
    private = "private prompt\nAuthorization: Bearer credential-value"
    claim = Store().claim
    _log_state(
        claim,
        "heartbeat",
        prompt=private,
        response=private,
        headers={"Authorization": private},
        leaseToken=str(claim.lease_token),
        errorClass=private,
        inputTokens=private,
    )
    logger.debug("raw %s", private)
    logger.info("raw %s", private)
    try:
        raise RuntimeError(private)
    except RuntimeError:
        logger.exception(private)
        logger.error(
            "axwise_workflow_v2 %s",
            {
                "state": "worker_loop_error",
                "errorType": "RuntimeError",
                "error": private,
            },
            exc_info=True,
            stack_info=True,
        )
    logging.getLogger(LOGGER_NAME + ".provider").error(
        "axwise_workflow_v2 %s",
        {"state": "failed", "errorClass": "PRIVATE_PROVIDER_TEXT"},
    )
    logger.info("axwise_workflow_v2 %s", {"state": [private]})
    recorded, output = events(capsys)
    assert [item["state"] for item in recorded] == ["heartbeat", "worker_loop_error"]
    assert recorded[1] == {"state": "worker_loop_error", "errorType": "RuntimeError"}
    for value in (
        private,
        "credential-value",
        "PRIVATE_PROVIDER_TEXT",
        str(claim.lease_token),
        "Traceback",
        "Stack (most recent call last)",
    ):
        assert value not in output
    assert all(
        key not in recorded[0]
        for key in (
            "prompt",
            "response",
            "headers",
            "leaseToken",
            "errorClass",
            "inputTokens",
        )
    )


def test_usage_keeps_unknown_null_and_drops_unbounded_or_wrong_type_counts(capsys):
    configure_worker_logging()
    _log_state(
        Store().claim,
        "completed",
        inputTokens=None,
        outputTokens=True,
        totalTokens=2**63,
        searchCalls=float("inf"),
        estimatedCostMicros=None,
        latencyMs=-1,
        retryAfterSeconds=900,
        retainedExecutionCount=0,
    )
    recorded, _ = events(capsys)
    assert recorded[0]["inputTokens"] is None
    assert recorded[0]["estimatedCostMicros"] is None
    assert recorded[0]["retryAfterSeconds"] == 900
    assert recorded[0]["retainedExecutionCount"] == 0
    assert all(
        key not in recorded[0]
        for key in ("outputTokens", "totalTokens", "searchCalls", "latencyMs")
    )
