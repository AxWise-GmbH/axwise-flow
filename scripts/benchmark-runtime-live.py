#!/usr/bin/env python3
"""Paired live public Python engine comparison with independent contract audits.

This is the public FastMCP execution engine, not the desktop Node runtime.
No prompt/schema or provider response is replaced. Source snapshots and local
state are isolated; Jev review uses its actual ContextVar switch. The legacy
storage's unrelated automatic remote safety call is disabled in both arms by
injecting the normally resolved review credential into the review resolver and
exposing its transport environment key only during the awaited review call.
That environment key is restored/removed before artifact persistence.
"""
from __future__ import annotations

import argparse
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.util
import inspect
import json
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

MODEL = "gemini-3.8-flash"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
BASELINE_REF = "21009d825aa64bf99eab42c7ee465f0597c7e214"


def digest(value):
    data = value if isinstance(value, bytes) else json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(data).hexdigest()


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def fixture_workloads():
    # Derived from test_discovery.discovery_input and fixtures.inputs(). All
    # source material is explicitly synthetic; no customer evidence is used.
    discovery = {
        "brief": "Should we build a handoff tracker for small software teams in Latvia? This is a synthetic benchmark scenario; keep conclusions hypothetical.",
        "region": "Latvia", "exclusions": ["Do not include payroll or financial advice"],
        "sources": [{"id": "operator-interview", "title": "Synthetic operator interview fixture",
                     "text": "We spend two hours copying handoff updates each Friday.", "origin": "synthetic_transcript"}],
    }
    simulation = {
        "scenario": "A shared team handoff tracker (synthetic benchmark scenario)",
        "targetAudience": "Small operations teams", "problem": "Manual copying delays work", "depth": "deep",
        "stakeholders": [{"id": "operators", "label": "Operators", "description": "People coordinating daily handoffs",
                          "participants": 2, "questions": ["What slows down a handoff?"]}],
    }
    return [
        {"id": "discovery-standard-jev-off", "tool": "prepare_discovery", "input": {**discovery, "depth": "standard"}, "jev": False},
        {"id": "discovery-deep-jev-off", "tool": "prepare_discovery", "input": {**discovery, "depth": "deep"}, "jev": False},
        {"id": "discovery-deep-jev-on", "tool": "prepare_discovery", "input": {**discovery, "depth": "deep"}, "jev": True},
        {"id": "simulation-deep-two-participants", "tool": "simulate_interviews", "input": simulation, "jev": False},
    ]


def prepare_snapshots(root, snapshot_dir):
    """Copy the explicit public import closure, including optional Jev review."""
    spec = importlib.util.spec_from_file_location("live_manifest", root / "packages/axwise-distribution/manifest.py")
    manifest = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(manifest)
    selected = sorted(set(manifest.KERNEL_FILES + manifest.DEPENDENCY_FILES + manifest.INIT_FILES))
    snapshots, manifests = {}, {}
    for arm in ("baseline", "fixed"):
        destination = snapshot_dir / arm
        destination.mkdir(parents=True)
        files = {}
        for name in selected:
            if arm == "baseline":
                result = subprocess.run(["git", "show", f"{BASELINE_REF}:{name}"], cwd=root, capture_output=True)
                if result.returncode:
                    if name.endswith("/configuration.py"):
                        continue
                    raise RuntimeError(f"Baseline source missing: {name}")
                data = result.stdout
            else:
                data = (root / name).read_bytes()
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            files[name] = hashlib.sha256(data).hexdigest()
        snapshots[arm] = str(destination)
        manifests[arm] = {"baseCommit": BASELINE_REF, "sourceHash": digest(files), "files": files,
                          "description": "immutable Git baseline" if arm == "baseline" else "repaired working-tree snapshot"}
    return snapshots, manifests


def reserve_request(budget_path):
    with Path(budget_path).open("r+") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        budget = json.load(stream)
        if budget["reserved"] >= budget["maximum"]:
            raise RuntimeError("GEMINI_REQUEST_CAP_REACHED")
        budget["reserved"] += 1
        sequence = budget["reserved"]
        stream.seek(0)
        stream.truncate()
        json.dump(budget, stream)
        stream.flush()
        os.fsync(stream.fileno())
        fcntl.flock(stream, fcntl.LOCK_UN)
    return sequence


def child_operation(job_path):
    job = json.loads(Path(job_path).read_text())
    source = Path(job["source"])
    sys.path.insert(0, str(source))
    state_dir = Path(job["stateDir"])
    state_dir.mkdir(parents=True)
    os.chdir(state_dir)
    os.environ["AXWISE_STATE_DIR"] = str(state_dir)
    os.environ["AXWISE_REMOTE_ARTIFACT_SAFETY"] = "false"
    review_key = os.environ.pop("AXWISE_BENCHMARK_JEV_KEY", "")
    os.environ.pop("TYPESAFE_API_KEY", None)
    gemini_key = os.environ["GEMINI_API_KEY"]

    def safe(value):
        if isinstance(value, str):
            for secret in (gemini_key, review_key):
                if secret:
                    value = value.replace(secret, "[REDACTED]")
            return value
        if isinstance(value, dict):
            return {str(key): safe(item) for key, item in value.items()}
        if isinstance(value, list):
            return [safe(item) for item in value]
        return value

    # Pin credentials explicitly; never consult keychains, another assistant or
    # implicit dotenv defaults in either original or repaired provider adapter.
    import dotenv
    dotenv.load_dotenv = lambda *_args, **_kwargs: False
    from backend.services.local_axwise import engine, provider as provider_module
    from backend.services.workflow_v2.cognitive import typesafe_triage as triage
    import httpx
    provider_module.discover_local_credentials = lambda: {}
    triage._resolve_typesafe_key = lambda: review_key
    flag_token = triage.jev_request_enabled.set(job["workload"]["jev"])
    config = dict(api_key=gemini_key, provider_type="gemini", base_url=BASE_URL, model=MODEL, timeout_seconds=90.0)
    if "discover_credentials" in inspect.signature(provider_module.ModelProvider).parameters:
        config.update(discover_credentials=False, state_dir=state_dir)
    actual_provider = provider_module.ModelProvider(**config)
    calls, http_calls, jev_calls = [], [], []
    report = {"arm": job["arm"], "repetition": job["repetition"], "pairOrder": job["pairOrder"],
              "workload": job["workload"], "scopeId": job["scopeId"], "requestedModel": MODEL,
              "providerCalls": calls, "httpReceipts": http_calls, "jevReviews": jev_calls, "completed": False}
    operation_start = time.perf_counter()

    def checkpoint():
        dump(job["output"], safe(report))

    class RecordedProvider:
        model = MODEL
        provider_type = "gemini"

        async def complete(self, system_prompt, user_prompt, response_schema=None, max_output_tokens=4096):
            call = {"systemPrompt": system_prompt, "userPrompt": user_prompt, "responseSchema": response_schema,
                    "maxOutputTokens": max_output_tokens, "requestHash": digest([system_prompt, user_prompt, response_schema, max_output_tokens]),
                    "startedOffsetMs": (time.perf_counter() - operation_start) * 1000, "sent": False}
            calls.append(call)
            started = time.perf_counter()
            try:
                call["budgetSequence"] = reserve_request(job["budget"])
                call["sent"] = True
                checkpoint()
                content, usage = await actual_provider.complete(system_prompt, user_prompt, response_schema, max_output_tokens)
                call.update(status="returned", output=content, outputHash=digest(content.encode() if isinstance(content, str) else content), usage=usage)
                return content, usage
            except Exception as error:
                call.update(status="failed", errorType=type(error).__name__, error=safe(str(error))[:1000])
                raise
            finally:
                call["durationMs"] = (time.perf_counter() - started) * 1000
                checkpoint()

    actual_post = httpx.AsyncClient.post
    async def recorded_post(client, url, *args, **kwargs):
        receipt = {"service": "gemini" if str(url).startswith(BASE_URL) else "jev", "endpoint": str(url),
                   "startedOffsetMs": (time.perf_counter() - operation_start) * 1000}
        http_calls.append(receipt)
        started = time.perf_counter()
        try:
            response = await actual_post(client, url, *args, **kwargs)
            receipt["httpStatus"] = response.status_code
            try:
                payload = response.json()
                receipt.update(returnedModel=payload.get("model"), usage=payload.get("usage"),
                               finishReasons=[choice.get("finish_reason") for choice in payload.get("choices", [])])
                if receipt["service"] == "jev":
                    receipt["response"] = payload
            except Exception:
                receipt["parseableJson"] = False
            return response
        except Exception as error:
            receipt.update(errorType=type(error).__name__, error=safe(str(error))[:1000])
            raise
        finally:
            receipt["durationMs"] = (time.perf_counter() - started) * 1000
            checkpoint()

    actual_jev_review = engine.validate_deliverable_with_jev
    async def recorded_jev_review(markdown, **kwargs):
        started = time.perf_counter()
        record = {"markdownHash": hashlib.sha256(markdown.encode()).hexdigest(), "criteria": kwargs.get("acceptance_criteria"),
                  "evidence": kwargs.get("evidence"), "timeoutSeconds": kwargs.get("timeout_seconds")}
        jev_calls.append(record)
        previous_key = os.environ.get("TYPESAFE_API_KEY")
        # The production transport reads this environment key directly. Expose
        # it only during review, then remove it before artifact persistence.
        os.environ["TYPESAFE_API_KEY"] = review_key
        try:
            result = await actual_jev_review(markdown, **kwargs)
            record["result"] = result.model_dump() if hasattr(result, "model_dump") else vars(result)
            return result
        finally:
            if previous_key is None:
                os.environ.pop("TYPESAFE_API_KEY", None)
            else:
                os.environ["TYPESAFE_API_KEY"] = previous_key
            record["durationMs"] = (time.perf_counter() - started) * 1000
            checkpoint()

    async def execute():
        kwargs = {"session_id": job["scopeId"], "provider": RecordedProvider()}
        if "state_dir" in inspect.signature(engine.execute_tool).parameters:
            kwargs["state_dir"] = state_dir
        return await engine.execute_tool(job["workload"]["tool"], deepcopy(job["workload"]["input"]), **kwargs)

    engine_elapsed = None
    operation_start = time.perf_counter()
    try:
        with patch.object(httpx.AsyncClient, "post", recorded_post), patch.object(engine, "validate_deliverable_with_jev", recorded_jev_review):
            result = asyncio.run(execute())
        engine_elapsed = (time.perf_counter() - operation_start) * 1000
        report.update(completed=True, result=result)
        saved_path = Path(result["jsonPath"])
        saved_bytes = saved_path.read_bytes()
        report["savedRecord"] = json.loads(saved_bytes)
        report["fileAudit"] = {"actualSha256": hashlib.sha256(saved_bytes).hexdigest(), "returnedSha256": result.get("sha256"),
                               "embeddedSha256": report["savedRecord"].get("reference", {}).get("sha256")}
        import sqlite3
        with sqlite3.connect(state_dir / "axwise.db") as conn:
            row = conn.execute("SELECT sha256, session_id FROM operations WHERE operation_id=?", (result["operationId"],)).fetchone()
        report["fileAudit"].update(databaseSha256=row[0] if row else None, databaseScope=row[1] if row else None)
    except BaseException as error:
        report.update(errorType=type(error).__name__, error=safe(str(error))[:1500], engineUsage=getattr(error, "usage", None))
    finally:
        report["durationMs"] = engine_elapsed if engine_elapsed is not None else (time.perf_counter() - operation_start) * 1000
        report["geminiRequests"] = sum(call["sent"] for call in calls)
        triage.jev_request_enabled.reset(flag_token)
        checkpoint()


def audit_operation(source, path):
    """Fresh repaired validator process: no model calls, no trusted success flags."""
    sys.path.insert(0, str(source))
    from backend.services.local_axwise import kernel, quality
    from backend.domain.workflow_v2.wire import canonical_hash
    report = json.loads(Path(path).read_text())
    workload = report["workload"]
    deep_review_required = workload["input"].get("depth") == "deep" and workload["tool"] != "simulate_interviews"
    audit = {"schemaValid": False, "candidateMatchesArtifact": False, "markdownMatchesArtifact": False,
             "providerResponsesComplete": False, "reviewRequired": deep_review_required,
             "persistedReviewBinding": None, "reviewReceiptBound": None, "reviewAccepted": None, "fileIntegrityValid": False,
             "structurallyValidCompletion": False, "validSuccess": False}
    receipts = [row for row in report["httpReceipts"] if row["service"] == "gemini"]
    audit["providerResponsesComplete"] = bool(receipts) and all(row.get("httpStatus") == 200 and row.get("finishReasons")
                                                               and all(reason == "stop" for reason in row["finishReasons"]) for row in receipts)
    if report["completed"]:
        saved = report["savedRecord"]
        raw = workload["input"]
        try:
            with patch("socket.socket.connect", side_effect=AssertionError("Audit must remain offline")):
                prepared = kernel.prepare(workload["tool"], raw, [])
                finalized = kernel.finalize(workload["tool"], raw, saved["candidate"], context=prepared["context"], host_evidence=[])
            audit["schemaValid"] = True
            audit["candidateMatchesArtifact"] = canonical_hash(finalized["artifact"]) == canonical_hash(saved["artifact"])
            audit["markdownMatchesArtifact"] = finalized["markdown"] == saved["markdown"]
        except Exception as error:
            audit.update(validationErrorType=type(error).__name__, validationError=str(error)[:600])
        hashes = report["fileAudit"]
        audit["fileIntegrityValid"] = hashes["actualSha256"] == hashes["returnedSha256"] == hashes["databaseSha256"] and hashes["databaseScope"] == report["scopeId"]
        review = saved.get("qualityReview", {})
        audit["reportedQualityReview"] = review
        artifact_hash = canonical_hash(saved["artifact"])
        if deep_review_required:
            audit["persistedReviewBinding"] = review.get("artifactHash") == artifact_hash and review.get("tool") == workload["tool"]
            audit["reviewReceiptBound"] = False
            audit["reviewAccepted"] = False
            if review.get("fastPath") == "jev":
                expected_md_hash = hashlib.sha256(saved["markdown"].encode()).hexdigest()
                bound_receipts = [row for row in report["jevReviews"] if row.get("markdownHash") == expected_md_hash
                                  and row.get("result", {}).get("reviewed_sha256") == expected_md_hash]
                audit["reviewReceiptBound"] = bool(bound_receipts)
                audit["reviewAccepted"] = review.get("passed") is True and any(row.get("result", {}).get("status") == "passed" for row in bound_receipts)
            else:
                for call in reversed(report["providerCalls"]):
                    try:
                        user = json.loads(call["userPrompt"])
                        if canonical_hash(user.get("candidateArtifact")) != artifact_hash:
                            continue
                        audit["reviewReceiptBound"] = True
                        review_prep = quality.prepare_review(workload["tool"], raw, saved["artifact"], [])
                        validated = quality.validate_review(workload["tool"], saved["artifact"], call["output"], review_prep["context"])
                        audit["reviewAccepted"] = validated["passed"] and review.get("passed") is True
                        audit["independentReviewValidation"] = validated
                        break
                    except Exception:
                        continue
        else:
            audit["unearnedPassClaim"] = review.get("passed") is True
        audit["structurallyValidCompletion"] = all(audit[key] for key in ("schemaValid", "candidateMatchesArtifact", "markdownMatchesArtifact", "providerResponsesComplete")) and (not deep_review_required or audit["reviewAccepted"])
        audit["validSuccess"] = audit["structurallyValidCompletion"] and audit["fileIntegrityValid"]
    report["independentAudit"] = audit
    dump(path, report)


def summarize(reports):
    summary = {}
    for workload in fixture_workloads():
        rows = [row for row in reports if row["workload"]["id"] == workload["id"]]
        by_arm = {}
        for arm in ("baseline", "fixed"):
            selected = [row for row in rows if row["arm"] == arm]
            completed = [row for row in selected if row.get("completed")]
            valid = [row for row in selected if row.get("independentAudit", {}).get("validSuccess")]
            by_arm[arm] = {"attempts": len(selected), "completed": len(completed), "validSuccesses": len(valid),
                           "structurallyValidCompletions": sum(bool(row.get("independentAudit", {}).get("structurallyValidCompletion")) for row in selected),
                           "fileIntegrityPasses": sum(bool(row.get("independentAudit", {}).get("fileIntegrityValid")) for row in selected),
                           "medianCompletedMs": statistics.median([row["durationMs"] for row in completed]) if completed else None,
                           "medianValidMs": statistics.median([row["durationMs"] for row in valid]) if valid else None,
                           "geminiRequests": sum(row.get("geminiRequests", 0) for row in selected)}
        valid_pairs = []
        for repetition in sorted({row["repetition"] for row in rows}):
            pair = {row["arm"]: row for row in rows if row["repetition"] == repetition}
            if len(pair) == 2 and all(row.get("independentAudit", {}).get("validSuccess") for row in pair.values()):
                valid_pairs.append({"repetition": repetition, "baselineMs": pair["baseline"]["durationMs"], "fixedMs": pair["fixed"]["durationMs"],
                                    "speedup": pair["baseline"]["durationMs"] / pair["fixed"]["durationMs"]})
        summary[workload["id"]] = {"arms": by_arm, "validPairedSpeedups": valid_pairs,
                                   "speedupConclusion": "No valid paired successes; speedup is not established." if not valid_pairs else "Observed paired timings only; small sample, no significance claim."}
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--credential-source", type=Path, default=Path('/Users/admin/axwise-opensource/axwise-flow-oss'))
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--snapshot-dir", type=Path)
    parser.add_argument("--repetitions", type=int, default=3)
    parser.add_argument("--max-gemini-requests", type=int, default=40)
    parser.add_argument("--run-live", action="store_true")
    parser.add_argument("--resume-jev", action="store_true", help="Preserve/exclude the initial credential-isolation trials and rerun only corrected Jev-on pairs.")
    parser.add_argument("--child", type=Path)
    parser.add_argument("--audit", nargs=2)
    args = parser.parse_args()
    if args.child:
        child_operation(args.child)
        return
    if args.audit:
        audit_operation(Path(args.audit[0]), Path(args.audit[1]))
        return
    root = args.source_root.resolve()
    output_dir = (args.output_dir or root / 'review-evidence/2026-09-29/performance').resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    budget_path = output_dir / 'runtime-live-budget.json'
    report_path = output_dir / 'runtime-live-results.json'
    if report_path.exists() and not args.resume_jev:
        parser.error('Output already contains a live report. Use a new --output-dir to preserve prior evidence.')
    selected_workloads = fixture_workloads()
    if args.resume_jev:
        top = json.loads(report_path.read_text())
        first_path = next(row["result"]["jsonPath"] for row in top["runs"] if row.get("completed"))
        snapshot_dir = Path(first_path.split('/states/', 1)[0])
        snapshots = {arm: str(snapshot_dir / arm) for arm in ('baseline', 'fixed')}
        selected_workloads = [row for row in fixture_workloads() if row['jev']]
        excluded = top.get('excludedRuns') or [row for row in top['runs'] if row['workload']['jev']]
        for row in excluded:
            row['excludedReason'] = 'Harness credential isolation omitted the environment key read by the real Jev transport. No real Jev HTTP occurred; this is not evidence of Jev unavailability.'
            original = output_dir / f"runtime-live-{row['workload']['id']}-r{row['repetition']}-{row['arm']}.json"
            archived = original.with_name(original.stem + '-harness-invalid.json')
            dump(archived, row)
        top['excludedRuns'] = excluded
        top['runs'] = [row for row in top['runs'] if not row['workload']['jev']]
        top['skipped'] = [row for row in top['skipped'] if row['workload'] != 'discovery-deep-jev-on']
        budget = json.loads(budget_path.read_text())
        budget['maximum'] = args.max_gemini_requests
        dump(budget_path, budget)
        top['maxGeminiRequests'] = args.max_gemini_requests
        top['benchmarkCorrection'] = {'reason': 'Temporarily expose the normally resolved key to the unmodified Jev transport during review only; remove before storage.',
                                      'excludedOperations': len(excluded), 'sunkGeminiRequests': sum(row.get('geminiRequests', 0) for row in excluded),
                                      'initialCap': 40, 'correctedCap': args.max_gemini_requests}
        top['controls']['jevCredential'] = 'Normal resolver once; child review resolver plus temporary transport environment key during review only, restored/removed before legacy storage.'
        top['finishedAt'] = None
    else:
        snapshot_dir = args.snapshot_dir or Path(tempfile.mkdtemp(prefix='axwise-runtime-live-'))
        snapshots, manifests = prepare_snapshots(root, snapshot_dir)
        dump(budget_path, {"maximum": args.max_gemini_requests, "reserved": 0})
        top = {"kind": "paired-live-public-fastmcp-python-engine", "startedAt": datetime.now(timezone.utc).isoformat(),
           "baselineRef": BASELINE_REF, "model": MODEL, "baseUrl": BASE_URL, "snapshotManifests": manifests,
           "repetitions": args.repetitions, "maxGeminiRequests": args.max_gemini_requests, "syntheticEvidence": True,
           "scope": "Public FastMCP Python execution engine only; not the managed desktop Node runtime or desktop Jev flag.",
           "controls": {"providerTimeoutSeconds": 90, "credentialDiscovery": False,
                        "remotePersistenceInspection": False, "reviewFlag": "typesafe_triage.jev_request_enabled ContextVar",
                        "jevCredential": "Normal resolver once; child review resolver plus temporary transport environment key during review only, absent from legacy storage.",
                        "promptsAndSchemas": "Unmodified source snapshots; exact request hashes and content recorded per call.",
                        "order": "Within each workload, baseline/fixed for repetitions 1 and 3, fixed/baseline for repetition 2."},
           "limitations": ["Three repetitions per workload cannot establish broad latency or reliability guarantees.",
                           "Schema validity and a model/advisory review do not establish factual or complete semantic quality.",
                           "Completion latency is separate from valid success; failed cohorts and false review passes are ineligible for speedup.",
                           "Execution durations include instrumented JSON checkpoint IO; provider construction, imports/startup, saved-file audit and independent validation are excluded.",
                           "Model sampling is stochastic; paired inputs and settings are fixed, responses are not replayed."],
           "runs": [], "skipped": []}
    jobs_dir = snapshot_dir / 'jobs'
    jobs_dir.mkdir(exist_ok=True)
    dump(report_path, top)
    if not args.run_live:
        print(json.dumps({"prepared": True, "snapshots": snapshots, "manifest": str(report_path), "liveRequests": 0}))
        return
    if not os.environ.get('GEMINI_API_KEY', '').strip():
        parser.error('GEMINI_API_KEY is required for authorized live execution.')
    original_cwd = Path.cwd()
    sys.path.insert(0, snapshots['fixed'])
    from backend.services.workflow_v2.cognitive.typesafe_triage import _resolve_typesafe_key
    try:
        os.chdir(args.credential_source)
        review_key = _resolve_typesafe_key()
    finally:
        os.chdir(original_cwd)
    if not review_key:
        parser.error('Normal Jev credential resolution was unavailable; no paired Jev-on workload can run.')
    child_env = {"PATH": os.environ.get('PATH', ''), "HOME": os.environ.get('HOME', ''), "PYTHONDONTWRITEBYTECODE": '1',
                 "GEMINI_API_KEY": os.environ['GEMINI_API_KEY'], "AXWISE_BENCHMARK_JEV_KEY": review_key}
    for workload in selected_workloads:
        for repetition in range(1, args.repetitions + 1):
            order = ['baseline', 'fixed'] if repetition % 2 else ['fixed', 'baseline']
            for arm in order:
                budget = json.loads(budget_path.read_text())
                if budget['reserved'] >= budget['maximum']:
                    top['skipped'].append({"workload": workload['id'], "repetition": repetition, "arm": arm, "reason": "GEMINI_REQUEST_CAP_REACHED"})
                    continue
                run_id = f"{workload['id']}-r{repetition}-{arm}"
                destination = output_dir / f'runtime-live-{run_id}.json'
                state_name = 'corrected-' + run_id if args.resume_jev else run_id
                job = {"source": snapshots[arm], "stateDir": str(snapshot_dir / 'states' / state_name), "scopeId": 'live-' + digest(run_id)[:24],
                       "arm": arm, "workload": workload, "repetition": repetition, "pairOrder": order,
                       "budget": str(budget_path), "output": str(destination)}
                job_path = jobs_dir / f'{run_id}.json'
                dump(job_path, job)
                print(f"START {run_id} reserved={budget['reserved']}/{budget['maximum']}", flush=True)
                started = time.perf_counter()
                process = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--child', str(job_path)],
                                         env=child_env, text=True, capture_output=True, timeout=480)
                if process.returncode:
                    raise RuntimeError(f"Child failed before safe report: {run_id}; exit={process.returncode}")
                subprocess.run([sys.executable, str(Path(__file__).resolve()), '--audit', snapshots['fixed'], str(destination)],
                               env={"PATH": child_env['PATH'], "HOME": child_env['HOME'], "PYTHONDONTWRITEBYTECODE": '1'},
                               check=True, capture_output=True, text=True, timeout=30)
                row = json.loads(destination.read_text())
                if workload['jev'] and row['jevReviews'] and not any(receipt['service'] == 'jev' for receipt in row['httpReceipts']):
                    raise RuntimeError('Jev review was invoked without an HTTP receipt; stop to inspect benchmark instrumentation.')
                top['runs'].append(row)
                top['budget'] = json.loads(budget_path.read_text())
                top['summary'] = summarize(top['runs'])
                dump(report_path, top)
                print(f"DONE {run_id} completed={row['completed']} valid={row['independentAudit']['validSuccess']} requests={row['geminiRequests']} wall={row['durationMs']/1000:.2f}s", flush=True)
    top['finishedAt'] = datetime.now(timezone.utc).isoformat()
    top['budget'] = json.loads(budget_path.read_text())
    top['summary'] = summarize(top['runs'])
    dump(report_path, top)
    print(json.dumps({"report": str(report_path), "runs": len(top['runs']), "skipped": len(top['skipped']), "budget": top['budget']}, indent=2))


if __name__ == '__main__':
    main()
