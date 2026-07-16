"""Measure the deterministic Phase 1 scorer without database or network latency."""

import argparse
import json
import math
import statistics
import time

from backend.domain.orchestration.examples import ORCHESTRATION_DECISION_EXAMPLES
from backend.domain.orchestration.models import DecisionCreateRequestV1
from backend.services.orchestration.assignment_scorer import AssignmentScorer


def percentile(values: list[float], quantile: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * quantile) - 1)
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=1000)
    parser.add_argument("--warmup", type=int, default=100)
    args = parser.parse_args()
    if args.iterations < 1 or args.warmup < 0:
        raise SystemExit("iterations must be positive and warmup must be non-negative")

    request = DecisionCreateRequestV1.model_validate(
        ORCHESTRATION_DECISION_EXAMPLES["software_incident"]["value"]
    )
    scorer = AssignmentScorer()
    for _ in range(args.warmup):
        scorer.score(request)

    samples_ms = []
    for _ in range(args.iterations):
        started = time.perf_counter_ns()
        scorer.score(request)
        samples_ms.append((time.perf_counter_ns() - started) / 1_000_000)

    print(
        json.dumps(
            {
                "scope": "in_process_assignment_scorer_only",
                "scorer_version": scorer.version,
                "iterations": args.iterations,
                "mean_ms": round(statistics.fmean(samples_ms), 6),
                "p50_ms": round(percentile(samples_ms, 0.50), 6),
                "p95_ms": round(percentile(samples_ms, 0.95), 6),
                "p99_ms": round(percentile(samples_ms, 0.99), 6),
                "external_model_cost_usd": 0.0,
                "excludes": ["HTTP", "authentication", "database", "network"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
