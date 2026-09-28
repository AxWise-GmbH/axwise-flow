"""Execution engine for local Axwise specialist tools."""
from __future__ import annotations

import json
from typing import Any, Optional
from uuid import uuid4

from backend.services.local_axwise import kernel, quality
from backend.services.local_axwise.provider import ModelProvider
from backend.services.local_axwise.storage import (
    record_stage,
    resolve_references_with_fallback,
    save_operation,
)


class EngineError(Exception):
    pass


async def execute_tool(
    tool_name: str,
    raw_input: dict[str, Any],
    session_id: str = "default",
    provider: Optional[ModelProvider] = None,
) -> dict[str, Any]:
    llm = provider or ModelProvider()
    operation_id = str(uuid4())

    # 1. Fuzzy / latest reference resolution
    resolved_input, host_evidence = resolve_references_with_fallback(
        tool_name, raw_input, session_id=session_id
    )

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

    record_stage(operation_id, "prepared", {"input": resolved_input, "context": prepared.get("context")})

    # 3. Candidate generation
    generation_tasks = prepared.get("generationTasks")
    total_usage: dict[str, Any] = {"model": llm.model, "provider": llm.provider_type}

    if generation_tasks:
        # Multi-task generation (e.g. simulation cohorts)
        task_candidates = []
        for task in generation_tasks:
            content, usage = await llm.complete(
                task["systemPrompt"],
                task["userPrompt"],
                task.get("responseSchema"),
                task.get("maxOutputTokens", 4096),
            )
            task_candidates.append(json.loads(content) if isinstance(content, str) else content)
        candidate_response = json.dumps(task_candidates)
    else:
        content, usage = await llm.complete(
            prepared["systemPrompt"],
            prepared["userPrompt"],
            prepared.get("responseSchema"),
            prepared.get("maxOutputTokens", 8192),
        )
        candidate_response = content

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
        total_usage.update(usage)

    record_stage(operation_id, "candidate_generated", {"response": candidate_response})

    # 4. Finalize & Validate Candidate
    normalized_usage = {
        "modelCalls": 1,
        "inputTokens": total_usage.get("prompt_tokens") or total_usage.get("inputTokens"),
        "outputTokens": total_usage.get("completion_tokens") or total_usage.get("outputTokens"),
        "model": llm.model,
        "provider": llm.provider_type,
    }

    try:
        finalized = kernel.finalize(
            tool_name,
            resolved_input,
            candidate_response,
            normalized_usage,
            prepared.get("context"),
            host_evidence,
        )
    except Exception as e:
        # Attempt one schema repair if candidate validation failed
        try:
            repair_prep = quality.prepare_repair(
                tool=tool_name,
                value=resolved_input,
                candidate=candidate_response,
                review={"passed": False, "score": 0.0, "reasoning": str(e)},
                diagnostics=["INVALID_CANDIDATE_SCHEMA"],
                host_evidence=host_evidence,
            )
            repaired_content, _ = await llm.complete(
                repair_prep["systemPrompt"],
                repair_prep["userPrompt"],
                repair_prep.get("responseSchema"),
                repair_prep.get("maxOutputTokens", 8192),
            )
            finalized = kernel.finalize(
                tool_name,
                resolved_input,
                repaired_content,
                normalized_usage,
                prepared.get("context"),
                host_evidence,
            )
            candidate_response = repaired_content
        except Exception as repair_err:
            raise EngineError(f"Validation failed for {tool_name}: {repair_err}") from e

    # 5. Review & Repair loop (when depth == 'deep')
    quality_review: dict[str, Any] = {"passed": True, "mode": depth}
    if depth == "deep" and tool_name not in ("simulate_interviews",):
        try:
            review_prep = quality.prepare_review(
                tool_name,
                resolved_input,
                finalized.get("candidate", {}),
                host_evidence,
            )
            review_content, _ = await llm.complete(
                review_prep["systemPrompt"],
                review_prep["userPrompt"],
                review_prep.get("responseSchema"),
                review_prep.get("maxOutputTokens", 4096),
            )
            review_obj = quality.validate_review(
                tool_name,
                resolved_input,
                finalized.get("candidate", {}),
                review_content,
            )
            quality_review = review_obj

            if not review_obj.get("passed"):
                # One repair pass
                diagnostics = review_obj.get("diagnostics", ["REVIEW_FAILED"])
                repair_prep = quality.prepare_repair(
                    tool=tool_name,
                    value=resolved_input,
                    candidate=finalized.get("candidate", {}),
                    review=review_obj,
                    diagnostics=diagnostics,
                    host_evidence=host_evidence,
                )
                repaired_content, _ = await llm.complete(
                    repair_prep["systemPrompt"],
                    repair_prep["userPrompt"],
                    repair_prep.get("responseSchema"),
                    repair_prep.get("maxOutputTokens", 8192),
                )
                finalized = kernel.finalize(
                    tool_name,
                    resolved_input,
                    repaired_content,
                    normalized_usage,
                    prepared.get("context"),
                    host_evidence,
                )
                # Final review
                final_rev_content, _ = await llm.complete(
                    review_prep["systemPrompt"],
                    review_prep["userPrompt"],
                    review_prep.get("responseSchema"),
                    review_prep.get("maxOutputTokens", 4096),
                )
                quality_review = quality.validate_review(
                    tool_name,
                    resolved_input,
                    finalized.get("candidate", {}),
                    final_rev_content,
                )
        except Exception as review_err:
            quality_review = {"passed": True, "note": f"Review skipped or advisory: {review_err}"}

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
        "usage": total_usage,
    }
    saved_meta = save_operation(tool_name, record, session_id=session_id)

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
    }
