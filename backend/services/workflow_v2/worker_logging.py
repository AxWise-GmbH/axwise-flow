"""Bounded lifecycle logging for the operation worker, independent of ASGI logging."""

from __future__ import annotations

import logging
import os
import re
from threading import RLock


LOGGER_NAME = "backend.services.workflow_v2.operation_worker"
_HANDLER_NAME = "axwise-operation-state"
_LOCK = RLock()
_LEVELS = {
    name: getattr(logging, name)
    for name in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")
}
_STATES = {
    "claimed",
    "heartbeat",
    "lease_lost",
    "worker_cancelled",
    "unexpected_failure",
    "stale_finalize_rejected",
    "completed",
    "stale_failure_rejected",
    "failed",
    "stale_cancel_rejected",
    "cancelled",
    "cancellation_grace_expired",
    "executor_close_deferred",
    "executor_close_timeout",
    "worker_loop_error",
}
_TOKENS = {
    "tenantId": 36,
    "runId": 36,
    "stageId": 36,
    "stageAttemptId": 36,
    "operationId": 36,
    "operationType": 64,
    "leaseFingerprint": 12,
    "deploymentRevision": 128,
    "errorClass": 200,
    "errorType": 128,
    "cancellationReason": 64,
}
_COUNTS = {
    "latencyMs",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "searchCalls",
    "estimatedCostMicros",
    "retryAfterSeconds",
    "retainedExecutionCount",
}
_TOKEN = re.compile(r"[A-Za-z0-9_-]+\Z")


class _StateFieldsFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Accept only existing state events, never arbitrary messages, exception
        # bodies or provider records (including descendants of this logger).
        if (
            record.name != LOGGER_NAME
            or record.msg != "axwise_workflow_v2 %s"
            or not isinstance(record.args, dict)
        ):
            return False
        state = record.args.get("state")
        if not isinstance(state, str) or state not in _STATES:
            return False
        fields: dict[str, object] = {"state": state}
        for key, value in record.args.items():
            if key in _TOKENS:
                if (
                    isinstance(value, str)
                    and len(value) <= _TOKENS[key]
                    and _TOKEN.fullmatch(value)
                ):
                    fields[key] = value
            elif key in _COUNTS:
                if value is None or (type(value) is int and 0 <= value <= 2**63 - 1):
                    fields[key] = value
            elif key == "retryable" and type(value) is bool:
                fields[key] = value
        record.args = (fields,)
        record.exc_info = record.exc_text = record.stack_info = None
        return True


def configure_worker_logging() -> None:
    """Use one stderr handler; never configure the root or provider loggers.

    AXWISE_OPERATION_LOG_LEVEL defaults to INFO. DEBUG, INFO, WARNING, ERROR
    and CRITICAL are supported; LOG_LEVEL does not broaden this logger's scope.
    Invalid values fail startup without echoing their contents.
    """
    level = _LEVELS.get(os.getenv("AXWISE_OPERATION_LOG_LEVEL", "INFO").strip().upper())
    if level is None:
        raise ValueError(
            "AXWISE_OPERATION_LOG_LEVEL must be DEBUG, INFO, WARNING, ERROR or CRITICAL"
        )
    with _LOCK:
        logger = logging.getLogger(LOGGER_NAME)
        handler = next(
            (item for item in logger.handlers if item.get_name() == _HANDLER_NAME), None
        )
        if handler is None:
            handler = logging.StreamHandler()
            handler.set_name(_HANDLER_NAME)
            handler.addFilter(_StateFieldsFilter())
            handler.setFormatter(
                logging.Formatter("%(levelname)s:%(name)s:%(message)s")
            )
        for existing in list(logger.handlers):
            if existing is not handler:
                logger.removeHandler(existing)
        handler.setLevel(level)
        logger.addHandler(handler)
        logger.setLevel(level)
        logger.disabled = False
        logger.propagate = False
