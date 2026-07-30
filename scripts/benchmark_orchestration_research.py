#!/usr/bin/env python3
"""Guarded live benchmark for AxWise research-assisted orchestration decisions.

This utility intentionally performs real, billable work. It is fail-closed:

* at least 20 decisions are required;
* an explicit non-production environment and ``--confirm`` are required;
* ``api.axwise.de`` is refused unless the operator supplies both
  ``--environment production`` and ``--allow-production``;
* the API key is accepted only through an environment variable, never through
  a command-line value or a report field.

The report measures create-to-terminal hybrid latency and audits the completed
result's quote source IDs, exact character offsets, field evidence coverage,
decision provenance, and ``quality_fast`` execution profile.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, Protocol
from urllib.parse import urlsplit

import requests


DECISIONS_PATH = "/api/orqaly-axwise/v1/orchestration/decisions"
RUNS_PATH = "/api/orqaly-axwise/v1/runs"
TERMINAL_STATUSES = {
    "completed",
    "completed_with_warnings",
    "failed",
    "cancelled",
}
SUCCESSFUL_TERMINAL_STATUSES = {"completed", "completed_with_warnings"}
VALID_PROVENANCE = {"operational", "empirical", "inferred", "synthetic"}
PRODUCTION_HOSTS = {"api.axwise.de", "www.api.axwise.de"}
NON_PRODUCTION_ENVIRONMENTS = {"staging", "development", "test"}


class BenchmarkError(RuntimeError):
    """A sanitized benchmark error suitable for console and JSON output."""


class JsonHttpClient(Protocol):
    """Minimal transport seam used by the live runner and mocked tests."""

    def request(
        self,
        method: str,
        path: str,
        *,
        headers: Mapping[str, str] | None = None,
        json_body: Mapping[str, Any] | None = None,
    ) -> tuple[int, dict[str, Any]]:
        ...


class RequestsJsonHttpClient:
    """Requests-backed JSON transport that never logs request headers."""

    def __init__(self, base_url: str, timeout_seconds: float):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def request(
        self,
        method: str,
        path: str,
        *,
        headers: Mapping[str, str] | None = None,
        json_body: Mapping[str, Any] | None = None,
    ) -> tuple[int, dict[str, Any]]:
        response = requests.request(
            method,
            f"{self.base_url}{path}",
            headers=dict(headers or {}),
            json=dict(json_body) if json_body is not None else None,
            timeout=self.timeout_seconds,
        )
        try:
            payload = response.json()
        except ValueError as exc:
            raise BenchmarkError(
                f"{method} {path} returned non-JSON HTTP {response.status_code}"
            ) from exc
        if not isinstance(payload, dict):
            raise BenchmarkError(
                f"{method} {path} returned a non-object JSON payload"
            )
        return response.status_code, payload


@dataclass(frozen=True)
class BenchmarkConfig:
    base_url: str
    api_key: str = field(repr=False)
    org_id: str = field(repr=False)
    user_id: str = field(repr=False)
    environment: str
    confirmed: bool
    allow_production: bool
    count: int = 20
    concurrency: int = 2
    poll_interval_seconds: float = 5.0
    request_timeout_seconds: float = 30.0
    job_timeout_seconds: float = 600.0
    p95_target_seconds: float = 120.0
    sample_size: int = 1
    allow_unobservable_profile: bool = False
    output_path: Path = Path("tmp/axwise-benchmarks/research-assisted.json")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_safety(config: BenchmarkConfig) -> None:
    """Reject accidental, under-sized, or insufficiently confirmed live runs."""
    parsed = urlsplit(config.base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise BenchmarkError("--base-url must be an absolute HTTP(S) URL")
    if parsed.username or parsed.password:
        raise BenchmarkError("--base-url must not contain credentials")
    if not config.confirmed:
        raise BenchmarkError(
            "refusing live benchmark without --confirm"
        )
    if config.count < 20:
        raise BenchmarkError("--count must be at least 20")
    if config.concurrency < 1 or config.concurrency > config.count:
        raise BenchmarkError("--concurrency must be between 1 and --count")
    if config.poll_interval_seconds <= 0:
        raise BenchmarkError("--poll-interval-seconds must be positive")
    if config.request_timeout_seconds <= 0 or config.job_timeout_seconds <= 0:
        raise BenchmarkError("request and job timeouts must be positive")
    if config.p95_target_seconds <= 0:
        raise BenchmarkError("--p95-target-seconds must be positive")
    if config.sample_size < 1 or config.sample_size > 10:
        raise BenchmarkError("--sample-size must be between 1 and 10")

    host = parsed.hostname.lower().rstrip(".")
    production_requested = (
        config.environment == "production" or host in PRODUCTION_HOSTS
    )
    if production_requested and not (
        config.environment == "production" and config.allow_production
    ):
        raise BenchmarkError(
            "production is refused; use both --environment production and "
            "--allow-production only after an explicit production approval"
        )
    if not production_requested and config.environment not in NON_PRODUCTION_ENVIRONMENTS:
        raise BenchmarkError(
            "--environment must explicitly identify staging, development, or test"
        )
    if config.allow_production and config.environment != "production":
        raise BenchmarkError(
            "--allow-production is valid only with --environment production"
        )
    if not config.api_key.strip():
        raise BenchmarkError("the configured API-key environment variable is empty")
    if not config.org_id.strip() or not config.user_id.strip():
        raise BenchmarkError("org and user identifiers must be non-empty")


def _tenant_digest(value: str) -> str:
    """Provide stable isolation diagnostics without exposing tenant identifiers."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def build_decision_request(
    config: BenchmarkConfig,
    sample_token: str,
) -> dict[str, Any]:
    """Build a bounded request that deterministically exercises research routing."""
    maximum_research_latency_ms = max(1, int(config.job_timeout_seconds * 1000))
    estimated_research_latency_ms = min(60_000, maximum_research_latency_ms)
    agent_suffix = sample_token[-12:]
    return {
        "contract_version": "1.0",
        "tenant": {
            "orgId": config.org_id,
            "userId": config.user_id,
        },
        "task": {
            "contract_version": "1.0",
            "task_id": f"benchmark-research-{sample_token}",
            "domain": "general_operations",
            "objective": "Analyze this",
            "desired_outcome": "Make it better",
            "required_capabilities": ["core operation"],
            "preferred_capabilities": ["stakeholder research"],
            "required_tools": ["records_read"],
            "requested_actions": ["analyze_records"],
            "stakeholders": ["operations analysts"],
            "constraints": [
                "Do not perform an external side effect without host authorization"
            ],
            "data_classification": "internal",
            "risk_level": "medium",
            "reversibility": "reversible",
        },
        "available_agents": [
            {
                "agent_id": f"agent-evidence-{agent_suffix}",
                "org_id": config.org_id,
                "name": "Evidence Specialist",
                "capabilities": [
                    "core operation",
                    "stakeholder research",
                    "evidence synthesis",
                ],
                "tool_ids": ["records_read"],
                "availability": "available",
                "success_rate": 0.88,
                "estimated_cost": 8,
                "estimated_latency_ms": 30_000,
                "max_data_classification": "confidential",
                "max_risk_level": "high",
                "stakeholder_tags": ["operations"],
            },
            {
                "agent_id": f"agent-operations-{agent_suffix}",
                "org_id": config.org_id,
                "name": "Operations Specialist",
                "capabilities": ["core operation", "operational analysis"],
                "tool_ids": ["records_read"],
                "availability": "available",
                "success_rate": 0.84,
                "estimated_cost": 7,
                "estimated_latency_ms": 25_000,
                "max_data_classification": "confidential",
                "max_risk_level": "high",
                "stakeholder_tags": ["operations"],
            },
        ],
        "available_tools": [
            {
                "tool_id": "records_read",
                "org_id": config.org_id,
                "name": "Records Read",
                "available": True,
                "allowed_actions": ["analyze_records"],
                "allowed_data_classifications": ["internal", "confidential"],
            }
        ],
        "policy_context": {
            "maximum_risk_without_human": "medium",
            "guardrails": ["The host system must approve execution"],
        },
        "budget": {
            "currency": "EUR",
            "maximum_cost": 100,
            "maximum_latency_ms": maximum_research_latency_ms,
        },
        "evidence_catalogue": [],
        "research_policy": {
            "allow_existing_evidence": True,
            "allow_hybrid_research": True,
            "minimum_evidence_sufficiency": 0.95,
            "minimum_value_of_information": 0.2,
            "minimum_evidence_quality": 0.55,
            "maximum_research_cost": 100,
            "estimated_research_cost": 10,
            "maximum_research_latency_ms": maximum_research_latency_ms,
            "estimated_research_latency_ms": estimated_research_latency_ms,
            "maximum_research_iterations": 1,
            "completed_research_iterations": 0,
            "maximum_evidence_items": 25,
        },
        "research_brief": {
            "business_idea": "Operational workflow improvement",
            "target_stakeholders": "Operations analysts and workflow owners",
            "problem": (
                "The correct customer context and execution capability depend on "
                "unresolved stakeholder needs"
            ),
            "research_questions": [
                "Who directly experiences the problem and what outcome matters?",
                "Which evidence and specialist capabilities are required?",
            ],
            "industry": "general operations",
            "depth": "quick",
            "sample_size": config.sample_size,
        },
    }


def _service_headers(config: BenchmarkConfig, idempotency_key: str) -> dict[str, str]:
    return {
        "x-axwise-key": config.api_key,
        "Idempotency-Key": idempotency_key,
        "X-Request-ID": f"benchmark-trace-{uuid.uuid4().hex}",
    }


def _tenant_headers(
    config: BenchmarkConfig,
    idempotency_key: str | None = None,
) -> dict[str, str]:
    headers = {
        "x-axwise-key": config.api_key,
        "X-Orqaly-Org-ID": config.org_id,
        "X-Orqaly-User-ID": config.user_id,
    }
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
        headers["X-Request-ID"] = f"benchmark-trace-{uuid.uuid4().hex}"
    return headers


def _expect(
    status_code: int,
    payload: dict[str, Any],
    expected: set[int],
    operation: str,
) -> dict[str, Any]:
    if status_code not in expected:
        detail = payload.get("detail") or payload.get("message") or "unexpected response"
        raise BenchmarkError(
            f"{operation} returned HTTP {status_code}: {str(detail)[:500]}"
        )
    return payload


def _walk_profile(value: Any) -> str | None:
    """Find an explicitly returned performance profile in a result payload."""
    if isinstance(value, dict):
        direct = value.get("performance_profile")
        if isinstance(direct, str):
            return direct
        for child in value.values():
            profile = _walk_profile(child)
            if profile:
                return profile
    elif isinstance(value, list):
        for child in value:
            profile = _walk_profile(child)
            if profile:
                return profile
    return None


def _source_documents(dataset: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    """Reconstruct the exact participant strings used by the server offset audit."""
    simulation_id = str(dataset.get("simulation_id") or "")
    people = dataset.get("people") or []
    interviews = dataset.get("interviews") or []
    names = {
        str(person.get("id")): str(person.get("name"))
        for person in people
        if isinstance(person, dict) and person.get("id") and person.get("name")
    }
    sources: dict[str, str] = {}
    speakers: dict[str, str] = {}
    for interview in interviews:
        if not isinstance(interview, dict):
            continue
        person_id = str(interview.get("person_id") or "")
        speaker = names.get(person_id)
        if not speaker or not simulation_id:
            continue
        responses = interview.get("responses") or []
        text = "\n".join(
            str(response.get("response"))
            for response in responses
            if isinstance(response, dict) and response.get("response") is not None
        )
        document_id = f"sim_session_{simulation_id}_{person_id}"
        sources[document_id] = text
        speakers[speaker] = document_id
    return sources, speakers


def _field_name(path: tuple[str, ...]) -> str:
    if "evidence_map" in path:
        index = path.index("evidence_map")
        if index + 1 < len(path):
            return path[index + 1]
    if "evidence" in path:
        index = path.index("evidence")
        if index > 0:
            return path[index - 1]
    return "unclassified"


def _collect_quote_evidence(
    value: Any,
    path: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    if isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(_collect_quote_evidence(child, (*path, str(index))))
    elif isinstance(value, dict):
        if value.get("quote") and (
            "start_char" in value or "end_char" in value
        ):
            found.append(
                {
                    "field": _field_name(path),
                    "quote": str(value.get("quote") or ""),
                    "speaker": value.get("speaker"),
                    "document_id": value.get("document_id")
                    or value.get("source_id"),
                    "start_char": value.get("start_char"),
                    "end_char": value.get("end_char"),
                    "explicit_provenance": value.get("provenance"),
                }
            )
        for key, child in value.items():
            found.extend(_collect_quote_evidence(child, (*path, str(key))))
    return found


def _deduplicate_evidence(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[tuple[Any, ...], dict[str, Any]] = {}
    for item in items:
        key = (
            item.get("document_id"),
            item.get("speaker"),
            item.get("start_char"),
            item.get("end_char"),
            item.get("quote"),
        )
        existing = unique.get(key)
        if existing:
            fields = set(existing.get("fields") or [existing.get("field")])
            fields.add(item.get("field"))
            existing["fields"] = sorted(str(field) for field in fields if field)
            continue
        copied = dict(item)
        copied["fields"] = [str(item.get("field") or "unclassified")]
        unique[key] = copied
    return list(unique.values())


def _decision_provenance(
    decision: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[tuple[str, int, int], str]]:
    references: list[dict[str, Any]] = []
    lookup: dict[tuple[str, int, int], str] = {}
    for item in decision.get("evidence") or []:
        if not isinstance(item, dict):
            continue
        reference_id = str(item.get("reference_id") or "")
        provenance = str(item.get("provenance") or "")
        references.append(
            {
                "reference_id": reference_id,
                "provenance": provenance,
                "verified": item.get("verified") is True,
                "verification_source": item.get("verification_source"),
            }
        )
        # Current research references are synthetic:<document>:<start>:<end>:<index>.
        parts = reference_id.rsplit(":", 3)
        if len(parts) == 4:
            prefix_and_document, start, end, _index = parts
            if prefix_and_document.startswith("synthetic:"):
                document_id = prefix_and_document[len("synthetic:") :]
                try:
                    lookup[(document_id, int(start), int(end))] = provenance
                except ValueError:
                    pass
    return references, lookup


def audit_evidence(
    run_payload: dict[str, Any],
    refreshed_decision: dict[str, Any],
) -> dict[str, Any]:
    """Audit exact quotes plus field-to-decision provenance without raw text output."""
    dataset = run_payload.get("result")
    if not isinstance(dataset, dict):
        return {
            "passed": False,
            "errors": ["completed run omitted its result dataset"],
        }

    sources, speakers = _source_documents(dataset)
    empirical_personas = dataset.get("empirical_personas") or []
    evidence = _deduplicate_evidence(_collect_quote_evidence(empirical_personas))
    decision_references, provenance_lookup = _decision_provenance(refreshed_decision)
    errors: list[str] = []
    field_names: set[str] = set()
    valid_offsets = 0
    exact_quotes = 0
    valid_source_ids = 0
    inherited_provenance = 0
    explicit_provenance = 0
    audited_items: list[dict[str, Any]] = []

    for item in evidence:
        field_names.update(item.get("fields") or [])
        quote = str(item.get("quote") or "")
        speaker = item.get("speaker")
        document_id = item.get("document_id")
        start = item.get("start_char")
        end = item.get("end_char")
        source = sources.get(str(document_id)) if document_id else None
        expected_document = speakers.get(str(speaker)) if speaker else None
        if source is not None and expected_document == document_id:
            valid_source_ids += 1
        if (
            isinstance(start, int)
            and not isinstance(start, bool)
            and isinstance(end, int)
            and not isinstance(end, bool)
            and source is not None
            and 0 <= start < end <= len(source)
        ):
            valid_offsets += 1
            if source[start:end] == quote:
                exact_quotes += 1
        if item.get("explicit_provenance") in VALID_PROVENANCE:
            explicit_provenance += 1
        if (
            document_id
            and isinstance(start, int)
            and isinstance(end, int)
            and provenance_lookup.get((str(document_id), start, end))
            in VALID_PROVENANCE
        ):
            inherited_provenance += 1
        inherited = (
            provenance_lookup.get((str(document_id), start, end))
            if document_id and isinstance(start, int) and isinstance(end, int)
            else None
        )
        audited_items.append(
            {
                "fields": item.get("fields") or ["unclassified"],
                "source_id": document_id,
                "start_char": start,
                "end_char": end,
                "quote_sha256_16": hashlib.sha256(
                    quote.encode("utf-8")
                ).hexdigest()[:16],
                "source_id_valid": (
                    source is not None and expected_document == document_id
                ),
                "offset_valid": (
                    isinstance(start, int)
                    and not isinstance(start, bool)
                    and isinstance(end, int)
                    and not isinstance(end, bool)
                    and source is not None
                    and 0 <= start < end <= len(source)
                ),
                "exact_quote_match": (
                    isinstance(start, int)
                    and not isinstance(start, bool)
                    and isinstance(end, int)
                    and not isinstance(end, bool)
                    and source is not None
                    and 0 <= start < end <= len(source)
                    and source[start:end] == quote
                ),
                "provenance": (
                    item.get("explicit_provenance")
                    if item.get("explicit_provenance") in VALID_PROVENANCE
                    else inherited
                ),
            }
        )

    evidence_count = len(evidence)
    valid_reference_count = sum(
        reference["provenance"] in VALID_PROVENANCE
        for reference in decision_references
    )
    mapped_reference_count = 0
    evidence_keys = {
        (
            str(item.get("document_id")),
            item.get("start_char"),
            item.get("end_char"),
        )
        for item in evidence
    }
    for key in provenance_lookup:
        if key in evidence_keys:
            mapped_reference_count += 1

    if evidence_count == 0:
        errors.append("no offset-linked field evidence was returned")
    if evidence_count and valid_source_ids != evidence_count:
        errors.append("one or more evidence items has an unknown or mismatched source ID")
    if evidence_count and valid_offsets != evidence_count:
        errors.append("one or more evidence items has invalid character offsets")
    if evidence_count and exact_quotes != evidence_count:
        errors.append("one or more quotes does not exactly match its source offsets")
    if not decision_references:
        errors.append("refreshed decision returned no evidence provenance references")
    elif valid_reference_count != len(decision_references):
        errors.append("one or more decision evidence references has invalid provenance")
    if provenance_lookup and mapped_reference_count != len(provenance_lookup):
        errors.append("one or more decision provenance references cannot be mapped to a field quote")
    if not field_names:
        errors.append("no evidence-bearing persona fields were identified")

    resolution = ((dataset.get("data") or {}).get("persona_resolution") or {})
    customer = resolution.get("customer_persona") or {}
    ideal_agent = resolution.get("ideal_agent_persona") or {}
    authorization_preserved = (
        resolution.get("requires_orqaly_authorization") is True
        and refreshed_decision.get("requires_orqaly_authorization") is True
    )
    if not customer:
        errors.append("persona resolution omitted the customer persona")
    elif not customer.get("evidence"):
        errors.append("customer persona has no evidence")
    if not ideal_agent:
        errors.append("persona resolution omitted the ideal agent persona")
    if not authorization_preserved:
        errors.append("persona resolution or decision lost host authorization")
    return {
        "passed": not errors,
        "errors": errors,
        "evidence_items": evidence_count,
        "evidence_bearing_fields": sorted(field_names),
        "evidence_bearing_field_count": len(field_names),
        "source_id_valid_count": valid_source_ids,
        "source_id_valid_rate": _rate(valid_source_ids, evidence_count),
        "offset_valid_count": valid_offsets,
        "offset_valid_rate": _rate(valid_offsets, evidence_count),
        "exact_quote_count": exact_quotes,
        "exact_quote_rate": _rate(exact_quotes, evidence_count),
        "explicit_field_provenance_count": explicit_provenance,
        "decision_inherited_provenance_count": inherited_provenance,
        "decision_inherited_provenance_rate": _rate(
            inherited_provenance, evidence_count
        ),
        "decision_evidence_reference_count": len(decision_references),
        "decision_reference_valid_provenance_count": valid_reference_count,
        "decision_reference_mapped_to_quote_count": mapped_reference_count,
        "provenance_counts": _counts(
            reference["provenance"] for reference in decision_references
        ),
        "customer_persona_present": bool(customer),
        "customer_persona_evidence_count": len(customer.get("evidence") or []),
        "ideal_agent_persona_present": bool(ideal_agent),
        "recommended_agent_present": bool(resolution.get("recommended_agent")),
        "requires_host_authorization": authorization_preserved,
        "items": sorted(
            audited_items,
            key=lambda item: (
                str(item.get("source_id") or ""),
                int(item.get("start_char") or 0),
                str(item.get("fields") or ""),
            ),
        ),
    }


def _rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 6) if denominator else 0.0


def _counts(values: Any) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        key = str(value or "missing")
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def _failure_record(
    index: int,
    started_at: str,
    started: float,
    message: str,
    *,
    decision_id: str | None = None,
    job_id: str | None = None,
    routing_mode: str | None = None,
    terminal_status: str | None = None,
    terminal_latency_seconds: float | None = None,
) -> dict[str, Any]:
    return {
        "sample": index,
        "started_at": started_at,
        "finished_at": utc_now(),
        "success": False,
        "error": message,
        "decision_id": decision_id,
        "job_id": job_id,
        "routing_mode": routing_mode,
        "terminal_status": terminal_status,
        "terminal_latency_seconds": (
            terminal_latency_seconds
            if terminal_latency_seconds is not None
            else round(time.monotonic() - started, 6)
        ),
    }


def run_sample(
    index: int,
    config: BenchmarkConfig,
    client: JsonHttpClient,
    *,
    monotonic: Callable[[], float] = time.monotonic,
    sleeper: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Run one decision from creation through terminal research and refresh."""
    started = monotonic()
    started_at = utc_now()
    token = f"{index:04d}-{uuid.uuid4().hex}"
    decision_id: str | None = None
    job_id: str | None = None
    routing_mode: str | None = None
    terminal_status: str | None = None
    terminal_latency: float | None = None
    try:
        create_status, created = client.request(
            "POST",
            DECISIONS_PATH,
            headers=_service_headers(config, f"benchmark-create-{token}"),
            json_body=build_decision_request(config, token),
        )
        _expect(create_status, created, {201}, "decision creation")
        decision_id = str(created.get("decision_id") or "")
        routing_mode = str(created.get("routing_mode") or "")
        if not decision_id:
            raise BenchmarkError("decision creation omitted decision_id")
        if routing_mode != "research_assisted":
            raise BenchmarkError(
                f"expected research_assisted routing, received {routing_mode or 'missing'}"
            )
        if created.get("status") != "pending_research":
            raise BenchmarkError("research-assisted parent was not pending_research")
        if created.get("requires_orqaly_authorization") is not True:
            raise BenchmarkError("parent decision lost the host-authorization boundary")
        job = created.get("research_job") or {}
        job_id = str(job.get("job_id") or "")
        if not job_id:
            raise BenchmarkError("research-assisted decision omitted research job ID")
        if job.get("pipeline") != "hybrid_a_plus_b":
            raise BenchmarkError("research-assisted decision selected an unexpected pipeline")
        if created.get("recommended_agents"):
            raise BenchmarkError("pending research published an agent recommendation")
        pending_plan = created.get("execution_plan") or {}
        if pending_plan.get("executable") is True or pending_plan.get("nodes"):
            raise BenchmarkError("pending research published an executable plan")

        status_payload: dict[str, Any] = {}
        while monotonic() - started < config.job_timeout_seconds:
            status_code, status_payload = client.request(
                "GET",
                f"{RUNS_PATH}/{job_id}/status",
                headers=_tenant_headers(config),
            )
            _expect(status_code, status_payload, {200}, "research status")
            terminal_status = str(status_payload.get("status") or "")
            if terminal_status in TERMINAL_STATUSES:
                break
            sleeper(config.poll_interval_seconds)
        else:
            return _failure_record(
                index,
                started_at,
                started,
                "research did not reach a terminal state before the job timeout",
                decision_id=decision_id,
                job_id=job_id,
                routing_mode=routing_mode,
                terminal_status="timed_out",
                terminal_latency_seconds=round(monotonic() - started, 6),
            )

        terminal_latency = round(monotonic() - started, 6)
        if terminal_status not in SUCCESSFUL_TERMINAL_STATUSES:
            return _failure_record(
                index,
                started_at,
                started,
                str(status_payload.get("error") or "research job failed"),
                decision_id=decision_id,
                job_id=job_id,
                routing_mode=routing_mode,
                terminal_status=terminal_status,
                terminal_latency_seconds=terminal_latency,
            )

        result_status, result_payload = client.request(
            "GET",
            f"{RUNS_PATH}/{job_id}",
            headers=_tenant_headers(config),
        )
        _expect(result_status, result_payload, {200}, "research result")
        if result_payload.get("pipeline") not in {None, "hybrid_a_plus_b"}:
            raise BenchmarkError("completed result reported an unexpected pipeline")
        observed_profile = _walk_profile(result_payload)
        if observed_profile and observed_profile != "quality_fast":
            raise BenchmarkError(
                f"expected quality_fast execution, received {observed_profile}"
            )
        if not observed_profile and not config.allow_unobservable_profile:
            raise BenchmarkError(
                "completed result did not expose performance_profile; "
                "use --allow-unobservable-profile only for a known legacy staging build"
            )

        refresh_key = f"benchmark-refresh-{token}"
        refreshed: dict[str, Any] | None = None
        while monotonic() - started < config.job_timeout_seconds:
            refresh_status, refresh_payload = client.request(
                "POST",
                f"{DECISIONS_PATH}/{decision_id}/research/refresh",
                headers=_tenant_headers(config, refresh_key),
            )
            if refresh_status in {200, 201}:
                refreshed = refresh_payload
                break
            if refresh_status != 202:
                _expect(
                    refresh_status,
                    refresh_payload,
                    {200, 201, 202},
                    "research refresh",
                )
            sleeper(config.poll_interval_seconds)
        if refreshed is None:
            raise BenchmarkError("research refresh did not produce a terminal decision")
        if refreshed.get("parent_decision_id") != decision_id:
            raise BenchmarkError("refreshed decision did not link to its parent")
        if refreshed.get("requires_orqaly_authorization") is not True:
            raise BenchmarkError("refreshed decision lost the host-authorization boundary")

        evidence_audit = audit_evidence(result_payload, refreshed)
        if not evidence_audit.get("passed"):
            raise BenchmarkError(
                "evidence audit failed: "
                + "; ".join(evidence_audit.get("errors") or ["unknown audit error"])
            )
        return {
            "sample": index,
            "started_at": started_at,
            "finished_at": utc_now(),
            "success": True,
            "decision_id": decision_id,
            "refreshed_decision_id": refreshed.get("decision_id"),
            "job_id": job_id,
            "routing_mode": routing_mode,
            "refreshed_routing_mode": refreshed.get("routing_mode"),
            "terminal_status": terminal_status,
            "terminal_latency_seconds": terminal_latency,
            "full_cycle_latency_seconds": round(monotonic() - started, 6),
            "quality_fast": {
                "expected": True,
                "observed": observed_profile,
                "verification": (
                    "response_metadata"
                    if observed_profile == "quality_fast"
                    else "unobservable_legacy_override"
                ),
            },
            "evidence_audit": evidence_audit,
        }
    except (BenchmarkError, requests.RequestException, ValueError) as exc:
        return _failure_record(
            index,
            started_at,
            started,
            str(exc),
            decision_id=decision_id,
            job_id=job_id,
            routing_mode=routing_mode,
            terminal_status=terminal_status,
            terminal_latency_seconds=(
                terminal_latency
                if terminal_latency is not None
                else round(monotonic() - started, 6)
            ),
        )


def percentile(values: list[float], percentile_value: float) -> float | None:
    """Return a linearly interpolated percentile for deterministic JSON metrics."""
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return round(ordered[0], 6)
    rank = (len(ordered) - 1) * percentile_value
    lower = math.floor(rank)
    upper = math.ceil(rank)
    if lower == upper:
        return round(ordered[lower], 6)
    fraction = rank - lower
    return round(
        ordered[lower] + (ordered[upper] - ordered[lower]) * fraction,
        6,
    )


def summarize(
    config: BenchmarkConfig,
    samples: list[dict[str, Any]],
    *,
    started_at: str,
    finished_at: str,
    health: dict[str, Any] | None,
) -> dict[str, Any]:
    successful = [sample for sample in samples if sample.get("success") is True]
    terminal_successes = [
        sample
        for sample in samples
        if sample.get("terminal_status") in SUCCESSFUL_TERMINAL_STATUSES
    ]
    latencies = [
        float(sample["terminal_latency_seconds"])
        for sample in terminal_successes
        if isinstance(sample.get("terminal_latency_seconds"), (int, float))
    ]
    p50 = percentile(latencies, 0.50)
    p95 = percentile(latencies, 0.95)
    failure_count = len(samples) - len(successful)
    terminal_failure_count = len(samples) - len(terminal_successes)
    audit_samples = [
        sample["evidence_audit"]
        for sample in successful
        if isinstance(sample.get("evidence_audit"), dict)
    ]
    gate_reasons: list[str] = []
    if failure_count:
        gate_reasons.append(f"{failure_count} benchmark sample(s) failed")
    if p95 is None:
        gate_reasons.append("no successful terminal latency samples")
    elif p95 > config.p95_target_seconds:
        gate_reasons.append(
            f"p95 {p95:.3f}s exceeds target {config.p95_target_seconds:.3f}s"
        )
    if len(samples) != config.count:
        gate_reasons.append("sample count does not match the requested count")

    report = {
        "schema_version": "axwise_staging_research_benchmark_v1",
        "started_at": started_at,
        "finished_at": finished_at,
        "environment": config.environment,
        "base_url": config.base_url,
        "tenant": {
            "org_id_sha256_16": _tenant_digest(config.org_id),
            "user_id_sha256_16": _tenant_digest(config.user_id),
        },
        "server_health": _redact_health(health),
        "configuration": {
            "count": config.count,
            "concurrency": config.concurrency,
            "sample_size": config.sample_size,
            "poll_interval_seconds": config.poll_interval_seconds,
            "request_timeout_seconds": config.request_timeout_seconds,
            "job_timeout_seconds": config.job_timeout_seconds,
            "p95_target_seconds": config.p95_target_seconds,
            "quality_fast_required": not config.allow_unobservable_profile,
            "secret_source": "environment_variable",
        },
        "metrics": {
            "attempted": len(samples),
            "successful": len(successful),
            "failed": failure_count,
            "failure_rate": _rate(failure_count, len(samples)),
            "terminal_successful": len(terminal_successes),
            "terminal_failed": terminal_failure_count,
            "terminal_failure_rate": _rate(
                terminal_failure_count, len(samples)
            ),
            "latency_sample_count": len(latencies),
            "create_to_terminal_seconds": {
                "minimum": round(min(latencies), 6) if latencies else None,
                "p50": p50,
                "p95": p95,
                "maximum": round(max(latencies), 6) if latencies else None,
            },
            "quality": {
                "evidence_items": sum(
                    int(audit.get("evidence_items") or 0) for audit in audit_samples
                ),
                "exact_quotes": sum(
                    int(audit.get("exact_quote_count") or 0)
                    for audit in audit_samples
                ),
                "valid_source_ids": sum(
                    int(audit.get("source_id_valid_count") or 0)
                    for audit in audit_samples
                ),
                "valid_offsets": sum(
                    int(audit.get("offset_valid_count") or 0)
                    for audit in audit_samples
                ),
                "provenance_counts": _merge_counts(
                    audit.get("provenance_counts") or {}
                    for audit in audit_samples
                ),
                "customer_persona_present_count": sum(
                    audit.get("customer_persona_present") is True
                    for audit in audit_samples
                ),
                "ideal_agent_persona_present_count": sum(
                    audit.get("ideal_agent_persona_present") is True
                    for audit in audit_samples
                ),
            },
        },
        "gate": {
            "passed": not gate_reasons,
            "reasons": gate_reasons,
        },
        "samples": sorted(samples, key=lambda sample: int(sample["sample"])),
    }
    return report


def _merge_counts(values: Any) -> dict[str, int]:
    merged: dict[str, int] = {}
    for value in values:
        for key, count in value.items():
            merged[str(key)] = merged.get(str(key), 0) + int(count)
    return dict(sorted(merged.items()))


def _redact_health(health: dict[str, Any] | None) -> dict[str, Any] | None:
    """Keep deployment identity fields while excluding arbitrary server metadata."""
    if not health:
        return None
    allowlist = {
        "status",
        "service",
        "version",
        "revision",
        "build_revision",
        "environment",
    }
    return {key: health[key] for key in allowlist if key in health}


def write_report(path: Path, report: dict[str, Any]) -> None:
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary.chmod(0o600)
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def run_benchmark(
    config: BenchmarkConfig,
    *,
    client: JsonHttpClient | None = None,
    monotonic: Callable[[], float] = time.monotonic,
    sleeper: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    validate_safety(config)
    transport = client or RequestsJsonHttpClient(
        config.base_url, config.request_timeout_seconds
    )
    started_at = utc_now()
    health: dict[str, Any] | None = None
    try:
        health_status, health_payload = transport.request("GET", "/health")
        if health_status == 200:
            health = health_payload
    except (BenchmarkError, requests.RequestException):
        health = None

    samples: list[dict[str, Any]] = []
    print(
        f"Starting {config.count} confirmed {config.environment} samples "
        f"against {config.base_url} with concurrency {config.concurrency}."
    )
    with ThreadPoolExecutor(
        max_workers=config.concurrency,
        thread_name_prefix="axwise-benchmark",
    ) as executor:
        future_to_index = {
            executor.submit(
                run_sample,
                index,
                config,
                transport,
                monotonic=monotonic,
                sleeper=sleeper,
            ): index
            for index in range(1, config.count + 1)
        }
        completed = 0
        for future in as_completed(future_to_index):
            index = future_to_index[future]
            try:
                sample = future.result()
            except Exception as exc:  # pragma: no cover - last-resort isolation
                sample = {
                    "sample": index,
                    "started_at": started_at,
                    "finished_at": utc_now(),
                    "success": False,
                    "error": f"unexpected worker failure: {type(exc).__name__}",
                    "terminal_status": None,
                    "terminal_latency_seconds": None,
                }
            samples.append(sample)
            completed += 1
            outcome = "passed" if sample.get("success") else "failed"
            print(
                f"[{completed}/{config.count}] sample {index} {outcome}; "
                f"terminal={sample.get('terminal_status') or 'none'}; "
                f"latency={sample.get('terminal_latency_seconds')}"
            )

    report = summarize(
        config,
        samples,
        started_at=started_at,
        finished_at=utc_now(),
        health=health,
    )
    write_report(config.output_path, report)
    print(f"JSON report written to {config.output_path.expanduser().resolve()}")
    return report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    parser = argparse.ArgumentParser(
        description=(
            "Run a guarded authenticated research-assisted latency and evidence "
            "quality benchmark."
        )
    )
    parser.add_argument("--base-url", required=True)
    parser.add_argument(
        "--environment",
        required=True,
        choices=["staging", "development", "test", "production"],
    )
    parser.add_argument("--org-id", required=True)
    parser.add_argument("--user-id", required=True)
    parser.add_argument(
        "--api-key-env",
        default="AXWISE_API_KEY",
        help="Name of the environment variable containing the API key",
    )
    parser.add_argument("--count", type=int, default=20)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--sample-size", type=int, default=1)
    parser.add_argument("--poll-interval-seconds", type=float, default=5.0)
    parser.add_argument("--request-timeout-seconds", type=float, default=30.0)
    parser.add_argument("--job-timeout-seconds", type=float, default=600.0)
    parser.add_argument("--p95-target-seconds", type=float, default=120.0)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(
            f"tmp/axwise-benchmarks/research-assisted-{timestamp}.json"
        ),
        help="JSON artifact path; use a git-ignored directory",
    )
    parser.add_argument(
        "--allow-unobservable-profile",
        action="store_true",
        help=(
            "Allow a legacy staging result that omits performance_profile; "
            "an explicit non-quality_fast value still fails"
        ),
    )
    parser.add_argument(
        "--allow-production",
        action="store_true",
        help="Explicit production override; also requires --environment production",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirm that this live, billable benchmark may create decisions",
    )
    return parser.parse_args(argv)


def config_from_args(args: argparse.Namespace) -> BenchmarkConfig:
    if not args.api_key_env or "=" in args.api_key_env:
        raise BenchmarkError("--api-key-env must be an environment-variable name")
    api_key = os.getenv(args.api_key_env, "")
    if not api_key:
        raise BenchmarkError(
            f"required API-key environment variable {args.api_key_env} is not set"
        )
    return BenchmarkConfig(
        base_url=args.base_url.rstrip("/"),
        api_key=api_key,
        org_id=args.org_id,
        user_id=args.user_id,
        environment=args.environment,
        confirmed=args.confirm,
        allow_production=args.allow_production,
        count=args.count,
        concurrency=args.concurrency,
        poll_interval_seconds=args.poll_interval_seconds,
        request_timeout_seconds=args.request_timeout_seconds,
        job_timeout_seconds=args.job_timeout_seconds,
        p95_target_seconds=args.p95_target_seconds,
        sample_size=args.sample_size,
        allow_unobservable_profile=args.allow_unobservable_profile,
        output_path=args.output,
    )


def main(argv: list[str] | None = None) -> int:
    try:
        config = config_from_args(parse_args(argv))
        report = run_benchmark(config)
    except (BenchmarkError, requests.RequestException, OSError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 2
    return 0 if report["gate"]["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
