#!/usr/bin/env python3
"""Offline fixture timing through real FastMCP wrappers, kernel and SQLite.

This measures local orchestration only, with deterministic synthetic evidence.
It does not measure model quality, live inference, Jev speedups or desktop latency.
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.services.local_axwise import fastmcp_server as server, kernel, storage
from backend.services.local_axwise.configuration import load_runtime_configuration
from backend.tests.local_axwise.test_discovery import discovery_input, discovery_candidate, market_input
from backend.tests.local_axwise.test_personas import generation_candidate
from backend.tests.local_axwise.test_pipeline_integration import (
    simulation_input, simulation_candidate, analysis_input, analysis_candidate, prd_input, prd_candidate,
)


class FixtureProvider:
    model = "deterministic-fixture"
    provider_type = "offline-fixture"

    def __init__(self):
        self.response = None
        self.calls = 0

    async def complete(self, *_args):
        self.calls += 1
        return json.dumps(self.response), {}  # No tokens were measured.


async def benchmark_fixture_pipeline(state_dir: Path):
    config = load_runtime_configuration(environ={"AXWISE_STATE_DIR": str(state_dir), "AXWISE_WORKSPACE_ID": "offline-benchmark"})
    provider = FixtureProvider()
    rows = []

    async def step(tool, raw, candidate_factory):
        resolved, hosts = storage.resolve_references_with_fallback(tool, raw, config.scope_id, state_dir)
        provider.response = candidate_factory(resolved, hosts)
        start = time.perf_counter()
        rendered = await getattr(server, tool)(**raw)
        duration = (time.perf_counter() - start) * 1000
        saved = storage.find_latest_artifact([tool], session_id=config.scope_id, state_dir=state_dir)
        if not saved or saved["tool"] != tool or not rendered.strip():
            raise AssertionError(f"{tool} did not publish the expected artifact")
        selected_refs = saved["input"].get("references", [])
        for reference in resolved.get("references", []):
            if reference not in selected_refs:
                raise AssertionError(f"{tool} lost a selected parent reference")
        rows.append({"tool": tool, "operationId": saved["operationId"], "references": selected_refs,
                     "durationMs": round(duration, 3), "sampleCount": 1,
                     "qualityReview": saved.get("qualityReview"), "artifactSafety": saved.get("artifactSafety"),
                     "usage": saved.get("usage"), "model": provider.model})
        return saved

    def market_candidate(value, hosts):
        context = kernel.prepare("research_market", value, hosts)["context"]
        return {"findings": [{"questionId": context["questions"][0]["id"], "sourceId": value["sources"][0]["id"],
                              "quote": value["sources"][0]["text"], "basis": "source_statement"}],
                "interpretations": [], "gaps": [], "limitations": []}

    start = time.perf_counter()
    with patch.object(server, "_runtime_configuration", config), patch.object(server, "_provider", provider), \
            patch.dict(os.environ, {"TYPESAFE_API_KEY": "", "AXWISE_REMOTE_ARTIFACT_SAFETY": "false"}), \
            patch("socket.socket.connect", side_effect=AssertionError("offline benchmark attempted network")):
        scope = await step("prepare_discovery", discovery_input(), lambda *_: discovery_candidate())
        personas = await step("generate_personas", {"references": [scope["reference"]]}, generation_candidate)
        interviews = await step("simulate_interviews", simulation_input(personas), simulation_candidate)
        analysis = await step("analyze_interviews", analysis_input(interviews), analysis_candidate)
        market = await step("research_market", market_input(), market_candidate)
        prd = await step("create_prd", prd_input(analysis, market), prd_candidate)
        if prd["artifact"] == scope["artifact"]:
            raise AssertionError("PRD must be generated and validated independently from discovery")
    return {"kind": "offline-fixture-fastmcp-pipeline", "status": "completed", "syntheticEvidence": True,
            "measures": "local orchestration only; no live provider or quality measurement",
            "wallTimeMs": round((time.perf_counter() - start) * 1000, 3),
            "providerCalls": provider.calls, "baseline": None, "stages": rows}


def main():
    with tempfile.TemporaryDirectory(prefix="axwise-fixture-benchmark-") as temporary:
        result = asyncio.run(benchmark_fixture_pipeline(Path(temporary).resolve()))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
