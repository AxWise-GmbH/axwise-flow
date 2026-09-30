"""Execution engine for local Axwise specialist tools."""
from __future__ import annotations

import asyncio
from copy import deepcopy
import json
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from pydantic import ValidationError

from backend.services.local_axwise import kernel, quality
from backend.services.local_axwise.provider import ModelProvider
from backend.services.local_axwise.storage import (
    record_stage,
    resolve_references_with_fallback,
    save_operation,
    StorageError,
)

try:
    from backend.services.workflow_v2.cognitive.typesafe_triage import (
        is_typesafe_available,
        validate_deliverable_with_jev,
    )
except ImportError:
    is_typesafe_available = lambda: False  # type: ignore
    validate_deliverable_with_jev = None  # type: ignore


class EngineError(Exception):
    """Safe operation failure, with attempted provider-call accounting."""

    def __init__(self, message: str, *, usage: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.usage = deepcopy(usage or {})


_TOKEN_FIELDS = {
    "inputTokens": ("inputTokens", "prompt_tokens", "input_tokens"),
    "outputTokens": ("outputTokens", "completion_tokens", "output_tokens"),
    "cacheReadTokens": ("cacheReadTokens", "cache_read_input_tokens"),
    "cacheWriteTokens": ("cacheWriteTokens", "cache_creation_input_tokens"),
}


def _usage_summary(calls: list[dict[str, Any]], llm: ModelProvider) -> dict[str, Any]:
    """Totals are unknown if any attempted call did not report that token field.

    reportedTokens and *ReportedCalls retain partial observations, without
    presenting missing usage (including failed calls) as zero-cost inference.
    """
    result = {"model": llm.model, "provider": llm.provider_type, "modelCalls": len(calls)}
    result["reportedTokens"] = {}
    for key in _TOKEN_FIELDS:
        values = [call[key] for call in calls if key in call]
        result[f"{key}ReportedCalls"] = len(values)
        result[key] = sum(values) if calls and len(values) == len(calls) else None
        result["reportedTokens"][key] = sum(values) if values else None
    return result


def _validation_diagnostics(error: Exception) -> list[str]:
    if isinstance(error, kernel.LocalValidationError):
        return list(error.diagnostics)
    if isinstance(error, json.JSONDecodeError):
        return ["INVALID_MODEL_JSON"]
    if isinstance(error, ValidationError):
        return ["INVALID_CANDIDATE_SCHEMA"]
    # Do not invent a repair diagnostic for an internal or unsupported failure.
    return []


def _simulation_part(task: dict[str, Any], response: Any, fixed: Any) -> dict[str, Any]:
    if isinstance(response, str):
        if len(response.encode("utf-8")) > kernel.MAX_RESPONSE_BYTES:
            raise ValueError("Simulation response exceeds the byte budget")
        response = json.loads(response)
    kernel._bounded_json(response, kernel.MAX_RESPONSE_BYTES)
    expected_keys = {"interviews"} if fixed is not None else {"interviews", "participants"}
    if (type(response) is not dict or set(response) != expected_keys
            or type(response["interviews"]) is not list or len(response["interviews"]) != 1
            or (fixed is None and (type(response["participants"]) is not list
                                   or len(response["participants"]) != 1))):
        raise ValueError("Incomplete planned simulation response")
    payload = json.loads(task["userPrompt"])
    slot = payload["plan"][0]
    participants = payload["fixedParticipants"] if fixed is not None else response["participants"]
    kernel.SimulationCandidateV1.model_validate({**response, "participants": participants})
    if (response["interviews"][0]["participantId"] != slot["participantId"]
            or any(participants[0].get(key) != value for key, value in slot.items())):
        raise ValueError("Simulation response does not match its planned participant")
    return response


async def execute_tool(
    tool_name: str,
    raw_input: dict[str, Any],
    session_id: str = "default",
    provider: Optional[ModelProvider] = None,
    state_dir: Optional[Path] = None,
) -> dict[str, Any]:
    llm = provider or ModelProvider()
    operation_id = str(uuid4())

    # 1. Fuzzy / latest reference resolution
    try:
        resolved_input, host_evidence = resolve_references_with_fallback(
            tool_name, deepcopy(raw_input), session_id=session_id, state_dir=state_dir
        )
    except StorageError as error:
        raise EngineError(str(error)) from error

    # 1b. Fuzzy personaId resolution for chat_with_persona
    if tool_name == "chat_with_persona" and resolved_input.get("personaId"):
        target_pid = resolved_input["personaId"]
        all_personas = []
        for entry in host_evidence:
            if isinstance(entry, dict) and "artifact" in entry:
                all_personas.extend(entry["artifact"].get("personas", []))
        # Check if direct ID match
        direct_match = any(p.get("id") == target_pid for p in all_personas)
        if not direct_match and all_personas:
            target_lower = target_pid.lower()
            matched = next(
                (p for p in all_personas if target_lower in p.get("label", "").lower()
                 or target_lower in p.get("stakeholderId", "").lower()),
                None
            )
            if not matched:
                import re
                tokens = {w for w in re.findall(r"\w+", target_lower) if len(w) > 2 and w not in ("persona", "synthetic", "user", "the", "and")}
                if tokens:
                    def _score(p):
                        text = (p.get("label", "") + " " + p.get("description", "") + " " + p.get("stakeholderId", "")).lower()
                        return sum(1 for t in tokens if t in text)
                    scored = sorted(all_personas, key=_score, reverse=True)
                    if _score(scored[0]) > 0:
                        matched = scored[0]
            if not matched:
                matched = all_personas[0]

            if matched and matched.get("id"):
                resolved_input["personaId"] = matched["id"]

    depth = resolved_input.get("depth", "standard")

    # 2. Kernel prepare
    try:
        prepared = kernel.prepare(tool_name, resolved_input, host_evidence)
    except Exception as e:
        raise EngineError(f"Axwise prepare failed: {e}")

    calls: list[dict[str, Any]] = []
    candidate_calls: list[dict[str, Any]] = []
    decision_calls: list[dict[str, Any]] = []

    def usage() -> dict[str, Any]:
        return {**_usage_summary(calls, llm), "calls": deepcopy(calls), "decisionCalls": deepcopy(decision_calls)}

    def fail(message: str) -> EngineError:
        return EngineError(message, usage=usage())

    def stage(name: str, data: Any) -> None:
        try:
            record_stage(operation_id, name, data, state_dir=state_dir)
        except StorageError as error:
            raise fail(str(error)) from error

    async def infer(name: str, payload: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
        metric = {"stage": name, "status": "running", "model": llm.model, "provider": llm.provider_type}
        calls.append(metric)  # Count attempted requests, including failures/cancellation.
        try:
            content, reported = await llm.complete(
                payload["systemPrompt"], payload["userPrompt"],
                payload.get("responseSchema"), payload.get("maxOutputTokens", 8192),
            )
            if isinstance(reported, dict):
                for key, aliases in _TOKEN_FIELDS.items():
                    value = next((reported[alias] for alias in aliases if alias in reported), None)
                    if type(value) is int and value >= 0:
                        metric[key] = value
                for key in ("model", "provider", "requestedModel"):
                    if isinstance(reported.get(key), str):
                        metric[key] = reported[key]
            metric["status"] = "completed"
        except asyncio.CancelledError:
            metric["status"] = "cancelled"
            stage(name, {"metrics": metric})
            raise
        except Exception as error:
            metric["status"] = "failed"
            stage(name, {"metrics": metric})
            raise fail(f"Model request failed during {name}; no artifact was published.") from error
        stage(name, {"metrics": metric})
        return content, metric

    # modelCalls counts configured provider attempts. Jev classifier attempts
    # are recorded separately because its API does not expose token usage.
    stage("prepared", {"input": resolved_input, "context": prepared.get("context")})
    generation_tasks = prepared.get("generationTasks")
    if generation_tasks is not None:
        fixed = prepared.get("fixedParticipants")
        if (tool_name != "simulate_interviews" or prepared.get("aggregation") != "simulation_cohort"
                or type(generation_tasks) is not list or not 2 <= len(generation_tasks) <= 12
                or prepared.get("concurrency") != 2
                or (fixed is not None and (type(fixed) is not list or len(fixed) != len(generation_tasks)))):
            raise fail("Invalid bounded simulation plan; no artifact was published.")
        parts: list[Any] = [None] * len(generation_tasks)
        metrics: list[Any] = [None] * len(generation_tasks)
        next_task = 0

        async def worker() -> None:
            nonlocal next_task
            while next_task < len(generation_tasks):
                index = next_task
                next_task += 1
                response, metrics[index] = await infer(f"interview_{index + 1}", generation_tasks[index])
                parts[index] = _simulation_part(generation_tasks[index], response, fixed)

        workers = [asyncio.create_task(worker()) for _ in range(2)]
        try:
            await asyncio.gather(*workers)
        except BaseException as error:
            for task in workers:
                task.cancel()
            await asyncio.gather(*workers, return_exceptions=True)
            if isinstance(error, asyncio.CancelledError):
                raise
            raise fail("The complete planned simulation cohort was not generated; no artifact was published.") from error
        candidate_calls = metrics
        candidate_response = {"interviews": [row for part in parts for row in part["interviews"]]}
        if fixed is None:
            candidate_response["participants"] = [row for part in parts for row in part["participants"]]
    else:
        candidate_response, metric = await infer("generation", prepared)
        candidate_calls = [metric]

    # 3b. Align PRD item sourceIds and basis from findings if model omitted them
    if tool_name == "create_prd" and host_evidence:
        try:
            cand_dict = json.loads(candidate_response) if isinstance(candidate_response, str) else candidate_response
            if isinstance(cand_dict, dict) and "sections" in cand_dict:
                analysis_entry = next((e for e in host_evidence if isinstance(e, dict) and e.get("tool") == "analyze_interviews"), None)
                if analysis_entry:
                    f_map = {f["findingId"]: f for f in analysis_entry.get("artifact", {}).get("findings", [])}
                    for sec in cand_dict.get("sections", []):
                        for item in sec.get("items", []):
                            f_ids = item.get("findingIds", [])
                            linked_findings = [f_map[fid] for fid in f_ids if fid in f_map]
                            if linked_findings:
                                s_ids = list(item.get("sourceIds", []))
                                for lf in linked_findings:
                                    for sid in lf.get("sourceIds", []):
                                        if sid not in s_ids:
                                            s_ids.append(sid)
                                item["sourceIds"] = s_ids
                                if any(lf.get("basis") == "simulation_hypothesis" for lf in linked_findings):
                                    item["basis"] = "simulation_hypothesis"
                    candidate_response = json.dumps(cand_dict)
        except Exception:
            pass

    stage("candidate_generated", {"response": candidate_response})
    repair_used = False

    def finalize_candidate() -> dict[str, Any]:
        # The kernel's legacy Usage contract describes one call. Operation and
        # candidate aggregates are tracked separately below, including cohorts.
        return kernel.finalize(
            tool_name, resolved_input, candidate_response,
            context=prepared.get("context"), host_evidence=host_evidence,
        )

    async def repair(review: Any = None, diagnostics: Optional[list[str]] = None) -> None:
        nonlocal candidate_response, candidate_calls, repair_used
        if repair_used or tool_name == "simulate_interviews":
            raise fail("The bounded repair limit was reached; no artifact was published.")
        repair_used = True
        try:
            repair_prep = quality.prepare_repair(
                tool=tool_name, value=resolved_input, candidate=candidate_response,
                review=review, diagnostics=diagnostics or [], host_evidence=host_evidence,
            )
        except Exception as error:
            raise fail("The candidate cannot use a bounded repair; no artifact was published.") from error
        candidate_response, metric = await infer("repair", repair_prep)
        candidate_calls = [metric]
        stage("candidate_repaired", {"response": candidate_response})

    try:
        finalized = finalize_candidate()
    except Exception as error:
        diagnostics = _validation_diagnostics(error)
        if tool_name == "simulate_interviews" or not diagnostics:
            raise fail(f"Validation failed for {tool_name}; no artifact was published.") from error
        stage("validation_failed", {"diagnostics": diagnostics})
        await repair(diagnostics=diagnostics)
        try:
            finalized = finalize_candidate()
        except Exception as repair_error:
            raise fail("The repaired artifact failed local validation; no artifact was published.") from repair_error

    quality_review: dict[str, Any] = {
        "passed": None, "status": "not_evaluated", "mode": depth,
        "reason": "Simulation uses deterministic validation only." if tool_name == "simulate_interviews"
        else "Standard mode does not run substantive review.",
    }
    if depth == "deep" and tool_name != "simulate_interviews":
        jev_passed = False
        candidate_md = finalized.get("markdown") or ""
        if is_typesafe_available() and validate_deliverable_with_jev and candidate_md:
            decision_metric = {"stage": "jev_review", "status": "running", "model": "jev-latest"}
            decision_calls.append(decision_metric)
            try:
                artifact = finalized["artifact"]
                criteria = [{"code": code, "description": code} for code in quality.CRITERIA.get(tool_name, ())]
                evidence_data = {
                    "sources": [entry.get("reference", {}) for entry in host_evidence if isinstance(entry, dict)],
                    "claims": [finding.get("statement", finding.get("summary"))
                               for finding in artifact.get("findings", []) if isinstance(finding, dict)],
                }
                result = await validate_deliverable_with_jev(
                    candidate_md, acceptance_criteria=criteria,
                    evidence=evidence_data, timeout_seconds=3.0,
                )
                decision_metric["status"] = getattr(result, "status", "not_evaluated")
                if decision_metric["status"] == "passed":
                    quality_review = {
                        "passed": True, "status": "passed", "mode": depth,
                        "fastPath": "jev", "model": "jev-latest", "advisory": True,
                        "artifactHash": kernel.canonical_hash(artifact), "tool": tool_name,
                    }
                    jev_passed = True
            except asyncio.CancelledError:
                decision_metric["status"] = "cancelled"
                stage("jev_review", {"metrics": decision_metric})
                raise
            except Exception:
                decision_metric["status"] = "not_evaluated"
            stage("jev_review", {"metrics": decision_metric})

        async def review(name: str) -> dict[str, Any]:
            try:
                review_prep = quality.prepare_review(tool_name, resolved_input, finalized["artifact"], host_evidence)
                response, _metric = await infer(name, review_prep)
                checked = quality.validate_review(tool_name, finalized["artifact"], response, review_prep["context"])
            except EngineError:
                raise
            except Exception as error:
                raise fail("Deep quality review was unavailable or invalid; no artifact was published.") from error
            stage("quality_reviewed", checked)
            return checked

        if not jev_passed:
            quality_review = await review("review")
            if not quality_review["passed"]:
                if repair_used:
                    raise fail("Deep quality review failed after the single repair; no artifact was published.")
                await repair(review=quality_review)
                try:
                    finalized = finalize_candidate()
                except Exception as error:
                    raise fail("The repaired artifact failed local validation; no artifact was published.") from error
                # Bind a newly prepared review to the replacement artifact.
                quality_review = await review("final_review")
                if not quality_review["passed"]:
                    raise fail("The artifact failed its final quality review; no artifact was published.")
        stage("quality_accepted", quality_review)
    # 6. Save artifact to SQLite and disk
    if tool_name in ("create_prd", "simulate_interviews", "analyze_interviews"):
        try:
            effective_input = kernel._effective_input(tool_name, resolved_input, host_evidence)[0]
        except Exception:
            effective_input = resolved_input
    else:
        effective_input = resolved_input

    candidate_obj = (
        json.loads(candidate_response)
        if isinstance(candidate_response, str)
        else candidate_response
    )

    record = {
        "version": "axwise.local-artifact.v2",
        "operationId": operation_id,
        "tool": tool_name,
        "sessionId": session_id,
        "input": effective_input,
        "candidate": candidate_obj,
        "artifact": finalized.get("artifact"),
        "markdown": finalized.get("markdown", ""),
        "provenance": finalized.get("provenance", {}),
        "validation": finalized.get("validation", {}),
        "qualityReview": quality_review,
        "usage": usage(),
        "candidateUsage": _usage_summary(candidate_calls, llm),
    }
    try:
        saved_meta = save_operation(tool_name, record, session_id=session_id, state_dir=state_dir)
    except StorageError as error:
        raise fail(str(error)) from error

    # 7. Format clean Markdown response for chat UI
    markdown = finalized.get("markdown", "")
    summary_bullets = [
        f"**Artifact ID:** `{saved_meta['operationId']}` (SHA: `{saved_meta['sha256'][:10]}...`)",
        f"**Saved Local File:** `{saved_meta['mdPath']}`",
    ]
    if finalized.get("artifact", {}).get("title"):
        summary_bullets.insert(0, f"**Title:** {finalized['artifact']['title']}")

    formatted_output = f"{markdown}\n\n---\n### Saved Result\n" + "\n".join(f"- {b}" for b in summary_bullets)

    return {
        "content": formatted_output,
        "operationId": saved_meta["operationId"],
        "sha256": saved_meta["sha256"],
        "mdPath": saved_meta["mdPath"],
        "jsonPath": saved_meta["jsonPath"],
        "artifact": finalized.get("artifact"),
        "qualityReview": quality_review,
        "usage": record["usage"],
        "artifactSafety": saved_meta.get("artifactSafety"),
    }
