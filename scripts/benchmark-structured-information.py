"""Live public-provider benchmark, excluding desktop model selection and cloud transport."""

import asyncio
import json
import math
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.services.workflow_v2.assistant.structured_widget_runner import (
    StructuredWidgetRunner,
)


async def main():
    rows = []
    for kind, cases in [
        ("weather", ["Bremen", "Riga", "Kaunas"]),
        ("currency", [("EUR", "USD"), ("USD", "EUR"), ("EUR", "EUR")]),
    ]:
        for repeat in range(3):
            for case in cases:
                runner = StructuredWidgetRunner()
                try:
                    for mode in ["cold", "warm"]:
                        started = time.perf_counter()
                        try:
                            result = (
                                await runner.weather(case)
                                if kind == "weather"
                                else await runner.currency(*case, "100")
                            )
                            row = dict(
                                kind=kind,
                                case=case,
                                repeat=repeat,
                                mode=mode,
                                ms=round((time.perf_counter() - started) * 1000, 3),
                                cache_hit=result.cache_hit,
                            )
                        except Exception as error:
                            row = dict(
                                kind=kind,
                                case=case,
                                repeat=repeat,
                                mode=mode,
                                ms=round((time.perf_counter() - started) * 1000, 3),
                                error=getattr(error, "code", type(error).__name__),
                            )
                        rows.append(row)
                        print(json.dumps(row), flush=True)
                finally:
                    await runner.close()
    for kind in ["weather", "currency"]:
        for mode in ["cold", "warm"]:
            selected = [
                row for row in rows if row["kind"] == kind and row["mode"] == mode
            ]
            values = sorted(row["ms"] for row in selected)
            print(
                json.dumps(
                    dict(
                        kind=kind,
                        mode=mode,
                        n=len(values),
                        errors=sum("error" in row for row in selected),
                        p50_ms=values[math.ceil(len(values) * 0.5) - 1],
                        p95_ms=values[math.ceil(len(values) * 0.95) - 1],
                        scope="local adapter; provider-side caches uncontrolled",
                    )
                )
            )


if __name__ == "__main__":
    asyncio.run(main())
