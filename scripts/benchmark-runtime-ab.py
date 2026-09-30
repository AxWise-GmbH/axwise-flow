#!/usr/bin/env python3
"""Paired, offline before/after measurements through the actual Python engine.

Models return identical deterministic fixtures in both source snapshots. The two
latency profiles isolate local orchestration (0ms) and a controlled artificial
provider wait. Neither profile estimates production model quality or live speed.
No application source is changed. Only temporary snapshots/state and the chosen
JSON evidence file are written. Example:

  /private/tmp/axwise-review-config-venv/bin/python -B scripts/benchmark-runtime-ab.py \
    --repetitions 10 --delays-ms 0,50 \
    --output review-evidence/2026-09-29/performance/runtime-ab-results.json
"""
from __future__ import annotations

import argparse
import asyncio
from contextlib import ExitStack
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import inspect
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

BASELINE = "21009d825aa64bf99eab42c7ee465f0597c7e214"


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(value).hexdigest()


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args])


def snapshots(root, destination, baseline):
    """Copy only Python source; never copy credentials, environments or state."""
    before = destination / "before"
    after = destination / "after"
    before.mkdir()
    after.mkdir()
    names = git(root, "ls-tree", "-r", "--name-only", baseline, "--", "backend").decode().splitlines()
    source_names = sorted(name for name in names if name.endswith(".py"))
    before_hashes = {}
    for name in source_names:
        content = git(root, "show", f"{baseline}:{name}")
        path = before / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        before_hashes[name] = digest(content)
    # Include new untracked fixes, while respecting the project's ignore rules.
    current_names = git(root, "ls-files", "--cached", "--others", "--exclude-standard", "--", "backend").decode().splitlines()
    after_hashes = {}
    for name in sorted(set(current_names)):
        path = root / name
        if path.suffix != ".py" or not path.is_file():
            continue
        content = path.read_bytes()
        target = after / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        after_hashes[name] = digest(content)
    changes = {name: {"before": before_hashes.get(name), "after": after_hashes.get(name)}
               for name in sorted(set(before_hashes) | set(after_hashes))
               if before_hashes.get(name) != after_hashes.get(name)}
    return before, after, {"baselineCommit": baseline, "workingTreeHead": git(root, "rev-parse", "HEAD").decode().strip(),
                          "beforeSourceTreeSha256": digest(before_hashes), "afterSourceTreeSha256": digest(after_hashes),
                          "beforePythonFiles": len(before_hashes), "afterPythonFiles": len(after_hashes),
                          "changedPythonSourceHashes": changes}


def child_environment(home):
    # Explicit allowlist: no provider credentials, dotenv paths or Python paths.
    return {"PATH": os.defpath, "HOME": str(home), "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONHASHSEED": "0", "AXWISE_REMOTE_ARTIFACT_SAFETY": "false", "TYPESAFE_API_KEY": ""}


def subprocess_json(python, source, home, *args):
    completed = subprocess.run([python, "-B", str(Path(__file__).resolve()), "--source", str(source), *args],
                               cwd=source, env=child_environment(home), capture_output=True, text=True, timeout=90)
    if completed.returncode:
        raise RuntimeError(f"Offline child failed ({completed.returncode}): {completed.stderr[-3000:]}")
    return json.loads(completed.stdout)


def imports(source):
    sys.path.insert(0, str(source))
    # provider.py otherwise discovers dotenv files at import time.
    with patch("dotenv.load_dotenv", return_value=False):
        from backend.services.local_axwise import engine, kernel, quality, storage, provider
        from backend.tests.local_axwise.fixtures import inputs, candidate
        from backend.tests.local_axwise.test_discovery import discovery_input, discovery_candidate
    return engine, kernel, quality, storage, provider, inputs, candidate, discovery_input, discovery_candidate


def make_fixtures(source):
    _engine, kernel, quality, _storage, _provider, inputs, candidate, discovery_input, discovery_candidate = imports(source)
    good = discovery_candidate()
    checks = [{"criterion": code, "passed": True, "reason": "Deterministic benchmark criterion fixture."}
              for code in quality.CRITERIA["prepare_discovery"]]
    failed = [{**row, "passed": False} for row in checks]
    simulation_input = inputs()["simulate_interviews"]
    simulation_input["depth"] = "deep"
    simulation_input["stakeholders"][0]["participants"] = 2
    prepared = kernel.prepare("simulate_interviews", simulation_input)
    whole = candidate("simulate_interviews", simulation_input)
    parts = []
    for task in prepared["generationTasks"]:
        participant_id = json.loads(task["userPrompt"])["plan"][0]["participantId"]
        parts.append({key: [row for row in whole[key] if row["participantId"] == participant_id]
                      for key in ("participants", "interviews")})
    return [
        {"id": "standard_generation", "tool": "prepare_discovery", "input": discovery_input(),
         "responses": [good], "expected": "published", "reviewRequired": False},
        {"id": "deep_review_fallback", "tool": "prepare_discovery", "input": discovery_input(depth="deep"),
         "responses": [good, {"checks": checks}], "expected": "published", "reviewRequired": True},
        {"id": "schema_repair", "tool": "prepare_discovery", "input": discovery_input(),
         "responses": [{}, good], "expected": "published", "reviewRequired": False},
        {"id": "deep_two_participant_simulation", "tool": "simulate_interviews", "input": simulation_input,
         "responses": parts, "expected": "published", "reviewRequired": False},
        {"id": "failed_quality_review", "tool": "prepare_discovery", "input": discovery_input(depth="deep"),
         "responses": [good, {"checks": failed}, good, {"checks": failed}],
         "expected": "rejected_quality", "reviewRequired": True},
    ]


def error_code(error):
    if error is None:
        return None
    message = str(error).lower()
    if "quality review" in message and ("failed" in message or "final" in message):
        return "QUALITY_REVIEW_FAILED"
    if "validation" in message or "repair" in message:
        return "VALIDATION_FAILED"
    return type(error).__name__


async def measure(source, fixture, delay_ms):
    engine, kernel, quality, storage, provider, *_ = imports(source)

    class FixtureProvider:
        model = "deterministic-offline-fixture"
        provider_type = "offline-fixture"

        def __init__(self):
            self.calls = []
            self.active = 0
            self.max_active = 0

        async def complete(self, system, user, *_args):
            index = len(self.calls)
            payload = json.loads(user)
            stage = "repair" if "repair" in payload else "review" if "candidateArtifact" in payload else "generation"
            started = time.perf_counter()
            entry = {"index": index, "stage": stage, "promptSha256": digest([system, user])}
            self.calls.append(entry)
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            try:
                await asyncio.sleep(delay_ms / 1000)
                response = fixture["responses"][index]
                entry["responseSha256"] = digest(response)
                # Deliberately absent: fixture bytes are not model token usage.
                return json.dumps(response), {}
            finally:
                self.active -= 1
                entry["elapsedMs"] = round((time.perf_counter() - started) * 1000, 3)

    fake = FixtureProvider()
    with tempfile.TemporaryDirectory(prefix="runtime-ab-state-") as state:
        state_path = Path(state)
        with ExitStack() as guards:
            guards.enter_context(patch.dict(os.environ, {"AXWISE_STATE_DIR": state, "TYPESAFE_API_KEY": "", "AXWISE_REMOTE_ARTIFACT_SAFETY": "false"}))
            guards.enter_context(patch("socket.socket.connect", side_effect=AssertionError("Offline benchmark attempted a network connection")))
            guards.enter_context(patch.object(provider, "discover_local_credentials", return_value={}))
            guards.enter_context(patch.object(engine, "is_typesafe_available", return_value=False))
            # Equal explicit optional-safety policy, without external calls.
            guards.enter_context(patch.object(storage, "check_artifact_safety_with_jev", return_value={
                "status": "not_evaluated", "evaluated": False, "passed": None, "reason": "offline_benchmark"}))
            kwargs = {"provider": fake, "session_id": "paired-benchmark"}
            if "state_dir" in inspect.signature(engine.execute_tool).parameters:
                kwargs["state_dir"] = state_path
            result, error = None, None
            started = time.perf_counter()
            try:
                result = await engine.execute_tool(fixture["tool"], deepcopy(fixture["input"]), **kwargs)
            except Exception as caught:
                error = caught
            elapsed_ms = (time.perf_counter() - started) * 1000
        published_files = list(state_path.rglob("*.json"))
        artifact_valid = review_valid = reference_valid = False
        findings = []
        if result is not None:
            saved_path = Path(result["jsonPath"])
            file_bytes = saved_path.read_bytes()
            saved = json.loads(file_bytes)
            try:
                independently_finalized = kernel.finalize(fixture["tool"], fixture["input"], saved["candidate"])
                artifact_valid = (independently_finalized["artifact"] == saved["artifact"]
                                  and independently_finalized["markdown"] == saved["markdown"])
            except Exception:
                findings.append("independent_artifact_validation_failed")
            reference_valid = digest(file_bytes) == result["sha256"]
            if not reference_valid:
                findings.append("returned_reference_does_not_hash_saved_bytes")
            if fixture["reviewRequired"]:
                try:
                    review = saved["qualityReview"]
                    context = quality.prepare_review(fixture["tool"], fixture["input"], saved["artifact"])["context"]
                    checked = quality.validate_review(fixture["tool"], saved["artifact"], review.get("review"), context)
                    review_valid = checked == review and checked["passed"] is True
                except Exception:
                    review_valid = False
                if not review_valid:
                    findings.append("review_missing_invalid_or_not_bound_to_saved_artifact")
            else:
                review_valid = True  # Not required by this workload's selected mode.
        elif published_files:
            findings.append("artifact_files_present_despite_failed_operation")
        completed = result is not None
        correct_rejection = (fixture["expected"] == "rejected_quality" and not completed
                             and not published_files and error_code(error) == "QUALITY_REVIEW_FAILED")
        validated_success = completed and artifact_valid and review_valid and reference_valid
        expected_outcome = correct_rejection if fixture["expected"] == "rejected_quality" else validated_success
        if fixture["expected"] == "rejected_quality" and completed:
            findings.append("published_despite_deliberately_failed_review")
        return {"wallMs": round(elapsed_ms, 3), "completed": completed,
                "artifactValid": artifact_valid, "reviewValidOrNotRequired": review_valid,
                "referenceValid": reference_valid, "validatedSuccess": validated_success,
                "correctRejection": correct_rejection, "expectedOutcomeMet": expected_outcome,
                "providerCalls": len(fake.calls), "maxConcurrentProviderCalls": fake.max_active,
                "providerCallsDetail": fake.calls, "failureCode": error_code(error),
                "error": str(error).splitlines()[0][:240] if error else None, "findings": findings,
                "reportedOperationUsage": result.get("usage") if result else getattr(error, "usage", None)}


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(fraction * len(ordered)) - 1)] if ordered else None


def timing(values):
    return {"sampleCount": len(values), "p50Ms": round(statistics.median(values), 3) if values else None,
            "p95Ms": round(percentile(values, .95), 3) if values else None,
            "minMs": round(min(values), 3) if values else None, "maxMs": round(max(values), 3) if values else None}


def summarize(rows, fixtures, delays):
    summary = []
    for delay in delays:
        for fixture in fixtures:
            selected = [row for row in rows if row["workload"] == fixture["id"] and row["providerDelayMs"] == delay]
            sides = {}
            for side in ("before", "after"):
                samples = [row[side] for row in selected]
                sides[side] = {"allAttempts": timing([row["wallMs"] for row in samples]),
                              "validatedSuccesses": sum(row["validatedSuccess"] for row in samples),
                              "correctRejections": sum(row["correctRejection"] for row in samples),
                              "expectedOutcomesMet": sum(row["expectedOutcomeMet"] for row in samples),
                              "completed": sum(row["completed"] for row in samples),
                              "validArtifacts": sum(row["artifactValid"] for row in samples),
                              "validReferences": sum(row["referenceValid"] for row in samples),
                              "callsPerAttempt": sorted(set(row["providerCalls"] for row in samples)),
                              "maxConcurrentProviderCalls": max(row["maxConcurrentProviderCalls"] for row in samples),
                              "correctOutcomeTiming": timing([row["wallMs"] for row in samples if row["expectedOutcomeMet"]])}
            valid_pairs = [row for row in selected if row["before"]["expectedOutcomeMet"] and row["after"]["expectedOutcomeMet"]]
            summary.append({"workload": fixture["id"], "providerDelayMs": delay, "expected": fixture["expected"],
                            **sides, "pairedAfterMinusBeforeMsAllAttempts": timing([row["after"]["wallMs"] - row["before"]["wallMs"] for row in selected]),
                            "comparableCorrectOutcomePairs": len(valid_pairs),
                            "correctOutcomeSpeedup": (statistics.median(row["before"]["wallMs"] for row in valid_pairs)
                                                      / statistics.median(row["after"]["wallMs"] for row in valid_pairs)) if valid_pairs else None,
                            "comparisonNote": "Raw attempt timings include failed/invalid baseline work; they are not a validated-product speedup."})
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default=BASELINE)
    parser.add_argument("--repetitions", type=int, default=10)
    parser.add_argument("--delays-ms", default="0,50")
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--source", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--fixtures", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--sample", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--delay", type=float, default=0, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.fixtures:
        print(json.dumps(make_fixtures(args.source)))
        return
    if args.sample:
        print(json.dumps(asyncio.run(measure(args.source, json.loads(args.sample.read_text()), args.delay))))
        return
    if args.repetitions < 1 or args.repetitions > 100:
        parser.error("--repetitions must be between 1 and 100")
    delays = [float(value) for value in args.delays_ms.split(",")]
    if not delays or any(not math.isfinite(value) or not 0 <= value <= 1000 for value in delays):
        parser.error("--delays-ms must contain finite values between 0 and 1000")
    root = Path(__file__).resolve().parents[1]
    output = args.output or root / "review-evidence/2026-09-29/performance/runtime-ab-results.json"
    started = time.perf_counter()
    rows = []
    with tempfile.TemporaryDirectory(prefix="axwise-runtime-ab-") as temporary:
        destination = Path(temporary)
        before, after, provenance = snapshots(root, destination, args.baseline)
        home = destination / "empty-home"
        home.mkdir()
        fixtures = subprocess_json(args.python, before, home, "--fixtures")
        fixture_paths = {}
        for fixture in fixtures:
            path = destination / f"{fixture['id']}.json"
            path.write_text(json.dumps(fixture))
            fixture_paths[fixture["id"]] = path
        for repetition in range(args.repetitions):
            for delay in delays:
                for fixture in fixtures:
                    row = {"pair": repetition + 1, "workload": fixture["id"], "providerDelayMs": delay}
                    # Alternate source order to reduce systematic warm-cache/order bias.
                    order = [("before", before), ("after", after)]
                    if repetition % 2:
                        order.reverse()
                    row["executionOrder"] = [side for side, _ in order]
                    for side, source in order:
                        row[side] = subprocess_json(args.python, source, home, "--sample", str(fixture_paths[fixture["id"]]), "--delay", str(delay))
                    rows.append(row)
            print(f"Completed paired repetition {repetition + 1}/{args.repetitions}", file=sys.stderr, flush=True)
    result = {"schemaVersion": "axwise.offline-runtime-ab.v1", "createdAt": datetime.now(timezone.utc).isoformat(),
              "provenance": provenance, "python": {"executable": args.python, "version": subprocess.check_output([args.python, "--version"], text=True).strip()},
              "method": {"repetitionsPerCell": args.repetitions, "providerDelayMs": delays,
                         "pairedWorkloads": len(fixtures), "totalOperationAttempts": len(rows) * 2,
                         "timer": "perf_counter; execute_tool only; excludes subprocess startup, imports, fixtures and independent verification",
                         "sourceIsolation": "Separate temporary Python-source snapshots and fresh subprocess/state for every operation",
                         "fixtureSha256": digest(fixtures), "fixtures": fixtures,
                         "network": "No network; socket.connect blocked, dotenv/discovery disabled, empty credential environment",
                         "review": "Jev disabled identically; deterministic complete-review fixtures exercise the actual LLM fallback contracts",
                         "safety": "Optional external safety unevaluated identically; storage publication/hash paths execute",
                         "successDefinition": "Publication must independently finalize, have required artifact-bound passed review, and return the actual saved-file digest; failed-review case must correctly refuse publication",
                         "p95Method": "nearest rank; 10 repetitions provide only a coarse tail estimate",
                         "limits": ["Synthetic fixtures do not measure model quality or tokens.",
                                    "Controlled provider delays are artificial, not live latency estimates.",
                                    "Known-defect workloads are not a representative production failure rate.",
                                    "Invalid or failed baseline attempts cannot establish a validated-product speedup.",
                                    "Public Python engine path only; excludes FastMCP transport, desktop, cloud sync and live Jev."]},
              "summary": summarize(rows, fixtures, delays), "pairs": rows,
              "harnessWallSeconds": round(time.perf_counter() - started, 3)}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"output": str(output), "operationAttempts": len(rows) * 2,
                      "beforeExpectedOutcomes": sum(row["before"]["expectedOutcomeMet"] for row in rows),
                      "afterExpectedOutcomes": sum(row["after"]["expectedOutcomeMet"] for row in rows)}))
    # The baseline is intentionally defective; only regressions in the repair fail this benchmark.
    if not all(row["after"]["expectedOutcomeMet"] for row in rows):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
