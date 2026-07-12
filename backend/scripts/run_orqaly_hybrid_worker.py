"""Run durable Orqaly A+B jobs outside the FastAPI request process."""

import argparse
import asyncio
import logging

from backend.api.research.simulation_bridge.router import orchestrator
from backend.services.orqaly_hybrid_run_service import HybridRunService


async def run(once: bool, poll_seconds: float) -> None:
    service = HybridRunService(orchestrator)
    recovered = service.recover_stale_runs()
    if recovered:
        logging.getLogger(__name__).info("Recovered %s stale hybrid jobs", recovered)
    while True:
        job_id = await service.process_next()
        if job_id:
            await service.process_job(job_id, already_claimed=True)
        elif once:
            return
        else:
            await asyncio.sleep(poll_seconds)
        if once:
            return


def main() -> None:
    parser = argparse.ArgumentParser(description="Run durable Orqaly hybrid A+B jobs")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    parser.add_argument("--poll-seconds", type=float, default=1.0)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run(args.once, args.poll_seconds))


if __name__ == "__main__":
    main()
