from __future__ import annotations

import asyncio
import logging
import os
from urllib.parse import urlsplit

from backend.services.llm.gemini_runtime import (
    close_shared_research_models,
    require_search_model,
)
from backend.services.workflow_v2.cognitive_executor import build_cognitive_executor
from backend.services.workflow_v2.operation_store import PostgresOperationStore
from backend.services.workflow_v2.operation_worker import OperationWorker


def _validate_canonical_service_origin() -> None:
    parsed = urlsplit(os.getenv("AXWISE_SERVICE_URL", ""))
    if (
        parsed.scheme not in {"https", "http"}
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError("AXWISE_SERVICE_URL must be a canonical HTTP(S) origin")


def cost_configuration_ready() -> bool:
    for name in (
        "GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS",
        "GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS",
    ):
        try:
            if int(os.getenv(name, "")) < 0:
                return False
        except ValueError:
            return False
    return True


def build_worker() -> tuple[PostgresOperationStore, OperationWorker]:
    _validate_canonical_service_origin()
    require_search_model()
    store = PostgresOperationStore.from_environment()
    if not store.ready():
        raise RuntimeError("AxWise operation database is not ready")
    executor = build_cognitive_executor(store)
    lease_seconds = int(os.getenv("AXWISE_OPERATION_LEASE_SECONDS", "600"))
    heartbeat_seconds = int(os.getenv("AXWISE_OPERATION_HEARTBEAT_SECONDS", "30"))
    return store, OperationWorker(
        store,
        executor,
        lease_seconds=lease_seconds,
        heartbeat_seconds=heartbeat_seconds,
    )


async def run() -> None:
    store, worker = build_worker()
    try:
        await worker.run_forever(
            idle_seconds=float(os.getenv("AXWISE_OPERATION_IDLE_SECONDS", "1"))
        )
    finally:
        await worker.close()
        await close_shared_research_models()
        store.engine.dispose()


def main() -> None:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    asyncio.run(run())


if __name__ == "__main__":
    main()
