"""Run the durable Orqaly worker as a health-checked Cloud Run service."""

import asyncio
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from backend.scripts.run_orqaly_hybrid_worker import run


class HealthHandler(BaseHTTPRequestHandler):
    """Minimal health server required by Cloud Run services."""

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        if self.path not in {"/", "/health"}:
            self.send_response(404)
            self.end_headers()
            return
        payload = json.dumps({"status": "healthy", "service": "orqaly-hybrid-worker"}).encode()
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


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    server = start_health_server()
    try:
        asyncio.run(run(once=False, poll_seconds=float(os.getenv("WORKER_POLL_SECONDS", "1"))))
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
