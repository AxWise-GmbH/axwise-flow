"""Resolve an evidence-backed customer persona and an Orqaly execution persona."""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional

from pydantic import BaseModel, Field


STOP_WORDS = {
    "and", "are", "for", "from", "into", "that", "the", "their", "this",
    "to", "with", "will", "your", "task", "user", "agent", "project",
}


class OrqalyTaskContext(BaseModel):
    task_id: Optional[str] = None
    title: str
    description: str
    desired_outcome: Optional[str] = None
    category: Optional[str] = None
    constraints: List[str] = Field(default_factory=list)


class OrqalyAgentCandidate(BaseModel):
    agent_id: str
    name: str
    role: str
    description: Optional[str] = None
    capabilities: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    availability_status: str = "available"
    success_rate: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    reputation_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)


def _tokens(*values: Any) -> set[str]:
    text = " ".join(str(value or "") for value in values).lower()
    return {
        token
        for token in re.findall(r"[a-z0-9][a-z0-9_+-]{2,}", text)
        if token not in STOP_WORDS
    }


def _walk_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from _walk_strings(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if not str(key).startswith("_"):
                yield from _walk_strings(item)


def _evidence_items(value: Any) -> List[Dict[str, Any]]:
    found: List[Dict[str, Any]] = []

    def visit(item: Any) -> None:
        if isinstance(item, list):
            for child in item:
                visit(child)
            return
        if not isinstance(item, dict):
            return
        if item.get("quote") and item.get("speaker") and "start_char" in item:
            found.append(
                {
                    "quote": item["quote"],
                    "speaker": item["speaker"],
                    "document_id": item.get("document_id"),
                    "start_char": item.get("start_char"),
                    "end_char": item.get("end_char"),
                }
            )
        for child in item.values():
            visit(child)

    visit(value)
    unique = {}
    for item in found:
        key = (item["speaker"], item["quote"], item.get("document_id"))
        unique[key] = item
    return list(unique.values())


def _persona_confidence(persona: Dict[str, Any]) -> float:
    for key in ("confidence", "confidence_score", "overall_confidence"):
        value = persona.get(key)
        if isinstance(value, (int, float)):
            return max(0.0, min(float(value), 1.0))
    evidence_count = len(_evidence_items(persona))
    return min(0.55 + evidence_count * 0.05, 0.9)


def _pick_customer_persona(personas: List[Dict[str, Any]]) -> Dict[str, Any]:
    ranked = sorted(
        personas,
        key=lambda persona: (_persona_confidence(persona), len(_evidence_items(persona))),
        reverse=True,
    )
    persona = ranked[0]
    evidence = _evidence_items(persona)
    public_summary = {
        key: value
        for key, value in persona.items()
        if not str(key).startswith("_") and key not in {"raw_transcript", "source_text"}
    }
    return {
        "name": persona.get("name") or persona.get("persona_name") or "Primary customer persona",
        "confidence": _persona_confidence(persona),
        "profile": public_summary,
        "evidence": evidence,
    }


def _candidate_score(
    candidate: OrqalyAgentCandidate,
    task_tokens: set[str],
    customer_tokens: set[str],
) -> Dict[str, Any]:
    candidate_tokens = _tokens(
        candidate.name,
        candidate.role,
        candidate.description,
        candidate.capabilities,
        candidate.tools,
    )
    task_overlap = len(candidate_tokens & task_tokens) / max(1, min(len(task_tokens), 12))
    customer_overlap = len(candidate_tokens & customer_tokens) / max(
        1, min(len(customer_tokens), 12)
    )
    success = candidate.success_rate if candidate.success_rate is not None else 0.5
    reputation = (
        candidate.reputation_score if candidate.reputation_score is not None else 0.5
    )
    performance = (success + reputation) / 2
    available = candidate.availability_status.lower() in {"available", "active", "idle"}
    score = (0.55 * task_overlap) + (0.25 * customer_overlap) + (0.20 * performance)
    if not available:
        score *= 0.25
    return {
        "agent_id": candidate.agent_id,
        "name": candidate.name,
        "role": candidate.role,
        "score": round(min(score, 1.0), 4),
        "available": available,
        "matched_task_terms": sorted(candidate_tokens & task_tokens)[:12],
        "matched_customer_terms": sorted(candidate_tokens & customer_tokens)[:12],
        "capabilities": candidate.capabilities,
        "tools": candidate.tools,
    }


def resolve_orqaly_personas(
    empirical_personas: List[Dict[str, Any]],
    task_context: OrqalyTaskContext,
    agent_candidates: List[OrqalyAgentCandidate],
) -> Dict[str, Any]:
    """Build the task/customer/executor handoff consumed by Orqaly."""
    if not empirical_personas:
        raise ValueError("Persona resolution requires empirical customer personas")

    customer = _pick_customer_persona(empirical_personas)
    task_tokens = _tokens(
        task_context.title,
        task_context.description,
        task_context.desired_outcome,
        task_context.category,
        task_context.constraints,
    )
    customer_tokens = _tokens(*_walk_strings(customer["profile"]))
    ranked = sorted(
        (
            _candidate_score(candidate, task_tokens, customer_tokens)
            for candidate in agent_candidates
        ),
        key=lambda item: (item["available"], item["score"]),
        reverse=True,
    )
    recommendation = ranked[0] if ranked else None

    customer_profile = customer["profile"]
    communication_style = (
        customer_profile.get("communication_style")
        or customer_profile.get("preferred_communication_style")
        or "clear, evidence-grounded, and adapted to the customer"
    )
    ideal_capabilities = list(
        dict.fromkeys(
            (recommendation or {}).get("capabilities", [])
            + sorted(task_tokens)[:8]
        )
    )[:12]
    ideal_agent = {
        "role": (recommendation or {}).get("role") or "Customer-aligned task specialist",
        "communication_style": communication_style,
        "required_capabilities": ideal_capabilities,
        "operating_principles": [
            "Use the customer persona evidence when making task decisions.",
            "Do not invent customer needs that are absent from the research.",
            "State uncertainty and request human review for consequential actions.",
        ],
    }

    return {
        "version": "orqaly_dual_persona_v1",
        "task": task_context.model_dump(mode="json"),
        "customer_persona": customer,
        "ideal_agent_persona": ideal_agent,
        "recommended_agent": recommendation,
        "ranked_agents": ranked,
        "selection_status": "matched_candidate" if recommendation else "ideal_persona_only",
        "auto_assign_allowed": False,
        "requires_orqaly_authorization": True,
        "evidence_count": len(customer["evidence"]),
    }

