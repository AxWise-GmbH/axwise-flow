"""Run the durable Orqaly worker as a health-checked Cloud Run service."""

import asyncio
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORKER_MODE_POLL = "poll"
WORKER_MODE_HEALTH_ONLY = "health_only"
_VALID_WORKER_MODES = {WORKER_MODE_POLL, WORKER_MODE_HEALTH_ONLY}


def resolve_worker_mode(value: str | None = None) -> str:
    """Resolve the release mode before the health socket becomes ready."""

    mode = str(value if value is not None else os.getenv("WORKER_MODE", "poll"))
    mode = mode.strip().casefold()
    if mode not in _VALID_WORKER_MODES:
        raise ValueError(
            "WORKER_MODE must be one of: " + ", ".join(sorted(_VALID_WORKER_MODES))
        )
    return mode


def health_payload() -> dict[str, str | None]:
    """Return runtime identity without conflating build and Cloud revision."""

    return {
        "status": "healthy",
        "service": "orqaly-hybrid-worker",
        "mode": resolve_worker_mode(),
        "build_revision": os.getenv("AXWISE_BUILD_REVISION"),
        "cloud_revision": os.getenv("K_REVISION"),
    }


class HealthHandler(BaseHTTPRequestHandler):
    """Minimal health server required by Cloud Run services."""

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        if self.path not in {"/", "/health"}:
            self.send_response(404)
            self.end_headers()
            return
        payload = json.dumps(health_payload()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format: str, *args) -> None:
        logging.getLogger(__name__).debug(format, *args)


def start_health_server() -> ThreadingHTTPServer:
    port = int(os.getenv("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), HealthHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    logging.getLogger(__name__).info("Worker health server listening on port %s", port)
    return server


def _load_poller():
    """Import the database/application stack only in the polling revision."""

    from backend.scripts.run_orqaly_hybrid_worker import run

    return run


async def run_service(*, mode: str, poll_seconds: float) -> None:
    """Run the poller, or remain healthy without touching the durable queue."""

    resolved_mode = resolve_worker_mode(mode)
    if resolved_mode == WORKER_MODE_HEALTH_ONLY:
        logging.getLogger(__name__).info(
            "Worker is healthy in release quiescence; queue polling is disabled"
        )
        await asyncio.Event().wait()
        return
    poller = _load_poller()
    await poller(once=False, poll_seconds=poll_seconds)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    mode = resolve_worker_mode()
    server = start_health_server()
    try:
        asyncio.run(
            run_service(
                mode=mode,
                poll_seconds=float(os.getenv("WORKER_POLL_SECONDS", "1")),
            )
        )
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
