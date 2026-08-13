"""Run durable Orqaly A+B jobs outside the FastAPI request process."""

import argparse
import asyncio
import logging

from backend.api.research.simulation_bridge.router import orchestrator
from backend.services.orqaly_hybrid_run_service import HybridRunService


RECOVERY_INTERVAL_SECONDS = 60.0
STALE_RUN_MINUTES = 30
logger = logging.getLogger(__name__)


def _recover_stale_runs(
    service: HybridRunService,
    *,
    stale_after_minutes: int,
) -> int:
    recovered = service.recover_stale_runs(
        stale_after_minutes=stale_after_minutes,
    )
    if recovered:
        logger.info(
            "Recovered %s stale hybrid jobs after the %s-minute guard",
            recovered,
            stale_after_minutes,
        )
    else:
        logger.debug(
            "Periodic stale hybrid-job recovery found no eligible rows"
        )
    return recovered


async def run(
    once: bool,
    poll_seconds: float,
    *,
    recovery_interval_seconds: float = RECOVERY_INTERVAL_SECONDS,
    stale_after_minutes: int = STALE_RUN_MINUTES,
) -> None:
    if poll_seconds <= 0:
        raise ValueError("poll_seconds must be positive")
    if recovery_interval_seconds <= 0:
        raise ValueError("recovery_interval_seconds must be positive")
    if stale_after_minutes <= 0:
        raise ValueError("stale_after_minutes must be positive")

    service = HybridRunService(orchestrator)
    _recover_stale_runs(
        service,
        stale_after_minutes=stale_after_minutes,
    )
    loop = asyncio.get_running_loop()
    next_recovery_at = loop.time() + recovery_interval_seconds
    while True:
        now = loop.time()
        if now >= next_recovery_at:
            _recover_stale_runs(
                service,
                stale_after_minutes=stale_after_minutes,
            )
            next_recovery_at = now + recovery_interval_seconds

        job_id = await service.process_next()
        if job_id:
            await service.process_job(job_id, already_claimed=True)
        elif once:
            return
        else:
            # Wake no later than the next recovery check even when an operator
            # configures a poll interval longer than the recovery cadence.
            until_recovery = max(0.0, next_recovery_at - loop.time())
            await asyncio.sleep(min(poll_seconds, until_recovery))
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
