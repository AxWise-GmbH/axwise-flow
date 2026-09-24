"""Opt-in live smoke benchmark; secrets stay in memory and never enter output."""

import argparse
import asyncio
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.services.workflow_v2.assistant.quick_info_runner import (
    GeminiAssistantQuickInfoRunner,
)


def secret(name):
    return subprocess.check_output(
        [
            "gcloud",
            "secrets",
            "versions",
            "access",
            "2",
            "--secret",
            name,
            "--project",
            "axwise-v2-preview-001",
        ],
        text=True,
        stderr=subprocess.DEVNULL,
    ).strip()


async def main(args):
    if args.cloud_secrets:
        os.environ["GEMINI_API_KEY"] = secret("axwise-v2-preview-001-gemini-api-key")
        os.environ["TYPESAFE_API_KEY"] = secret(
            "axwise-v2-preview-001-typesafe-api-key"
        )
    runner = GeminiAssistantQuickInfoRunner(verify_discovery=True)
    rows = []
    cases = [
        (
            "Bremen",
            "Give me 3 latest local news headlines in Bremen with dates and source links.",
        ),
        (
            "Riga",
            "Give me 3 latest local news headlines in Riga with dates and source links.",
        ),
        (
            "Kaunas",
            "Give me 3 latest local news headlines in Kaunas with dates and source links.",
        ),
        ("Riga", "Events this week in Riga with dates, venues and links."),
        (
            "Kaunas",
            "Rank upcoming raves and techno parties this week within 150 km of Kaunas, with dates and source links.",
        ),
    ]
    try:
        for enabled in [False, True]:
            for location, query in cases[: args.cases]:
                for cache in ["cold", "warm"]:
                    started = time.perf_counter()
                    try:
                        result = await runner.quick_info(
                            query, location=location, jev_enabled=enabled
                        )
                        row = {
                            "location": location,
                            "query": query,
                            "jev": enabled,
                            "run": cache,
                            "seconds": round(time.perf_counter() - started, 3),
                            "outcome": result.outcome,
                            "facts": len(result.facts),
                            "cacheHit": result.cache_hit,
                            "searchCalls": result.search_calls,
                            "markdown": result.markdown,
                        }
                    except Exception as error:
                        row = {
                            "location": location,
                            "jev": enabled,
                            "run": cache,
                            "seconds": round(time.perf_counter() - started, 3),
                            "error": getattr(error, "code", type(error).__name__),
                        }
                    rows.append(row)
                    print(json.dumps(row, ensure_ascii=False), flush=True)
    finally:
        await runner.close()
    for enabled in [False, True]:
        values = sorted(
            row["seconds"]
            for row in rows
            if row["jev"] == enabled and row["run"] == "cold"
        )
        print(
            json.dumps(
                {
                    "jev": enabled,
                    "n": len(values),
                    "p50": values[math.ceil(len(values) * 0.5) - 1],
                    "p95": values[math.ceil(len(values) * 0.95) - 1],
                    "scope": "local runner, not desktop end-to-end",
                }
            )
        )
    if args.output:
        Path(args.output).write_text(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cloud-secrets", action="store_true")
    parser.add_argument("--cases", type=int, choices=range(1, 6), default=5)
    parser.add_argument("--output")
    asyncio.run(main(parser.parse_args()))
