#!/usr/bin/env python3
"""Fail-closed smoke test for the current Orqaly × AxWise decision contract.

This script performs real HTTP requests. It never substitutes a mock response
and never embeds a service credential. It creates one immutable decision and
retrieves it through the tenant-scoped endpoint; it does not claim to exercise
the Orqaly UI, approval gates, agent execution, or outcome delivery.

Required environment variables:

    AXWISE_API_KEY
    ORQALY_ORG_ID
    ORQALY_USER_ID

The tenant must already have an active server-side mapping in AxWise.

Optional environment variables:

    AXWISE_BASE_URL      defaults to http://localhost:8000
    AXWISE_TIMEOUT       defaults to 30 seconds
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from typing import Any

import requests


DECISIONS_PATH = "/api/orqaly-axwise/v1/orchestration/decisions"


def required_environment(name: str) -> str:
    """Return a required secret/config value or stop before making a request."""
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return value


def response_json(response: requests.Response) -> dict[str, Any]:
    """Parse a JSON object and preserve useful diagnostics on failure."""
    try:
        payload = response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"{response.request.method} {response.url} returned non-JSON "
            f"HTTP {response.status_code}: {response.text[:500]}"
        ) from exc
    if not isinstance(payload, dict):
        raise RuntimeError(
            f"{response.request.method} {response.url} returned a non-object payload"
        )
    return payload


def expect_status(
    response: requests.Response,
    expected: set[int],
    operation: str,
) -> dict[str, Any]:
    """Reject every unexpected HTTP status; no scenario may pass by simulation."""
    payload = response_json(response)
    if response.status_code not in expected:
        raise RuntimeError(
            f"{operation} failed with HTTP {response.status_code}: "
            f"{json.dumps(payload, sort_keys=True)[:1000]}"
        )
    return payload


def decision_request(org_id: str, user_id: str, suffix: str) -> dict[str, Any]:
    """Build a deterministic direct-routing request against a real agent catalogue."""
    return {
        "contract_version": "1.0",
        "tenant": {"orgId": org_id, "userId": user_id},
        "task": {
            "contract_version": "1.0",
            "task_id": f"smoke-task-{suffix}",
            "domain": "operations",
            "objective": "Prepare a reviewed warehouse handoff improvement brief",
            "desired_outcome": "A traceable brief with owners and measurable next actions",
            "required_capabilities": ["operational analysis"],
            "preferred_capabilities": ["stakeholder communication"],
            "stakeholders": ["warehouse manager", "shift lead"],
            "constraints": [
                "Do not perform an external side effect without host authorization"
            ],
            "data_classification": "internal",
            "risk_level": "medium",
        },
        "available_agents": [
            {
                "agent_id": f"agent-operations-{suffix}",
                "org_id": org_id,
                "name": "Operations Analyst",
                "capabilities": [
                    "operational analysis",
                    "stakeholder communication",
                ],
                "availability": "available",
                "success_rate": 0.88,
                "estimated_cost": 5,
                "estimated_latency_ms": 30000,
                "max_data_classification": "confidential",
                "max_risk_level": "high",
            }
        ],
        "policy_context": {
            "maximum_risk_without_human": "medium",
            "guardrails": ["The host system must approve execution"],
        },
        "budget": {
            "currency": "EUR",
            "maximum_cost": 25,
            "maximum_latency_ms": 120000,
        },
    }


def run() -> None:
    base_url = os.getenv("AXWISE_BASE_URL", "http://localhost:8000").rstrip("/")
    timeout = float(os.getenv("AXWISE_TIMEOUT", "30"))
    api_key = required_environment("AXWISE_API_KEY")
    org_id = required_environment("ORQALY_ORG_ID")
    user_id = required_environment("ORQALY_USER_ID")
    suffix = uuid.uuid4().hex[:12]

    service_headers = {
        "x-axwise-key": api_key,
        "Idempotency-Key": f"smoke-decision-{suffix}",
        "X-Request-ID": f"smoke-trace-{suffix}",
    }
    tenant_headers = {
        "x-axwise-key": api_key,
        "X-Orqaly-Org-ID": org_id,
        "X-Orqaly-User-ID": user_id,
    }

    with requests.Session() as session:
        unauthenticated = session.post(
            f"{base_url}{DECISIONS_PATH}",
            headers={"Idempotency-Key": f"smoke-unauthenticated-{suffix}"},
            json=decision_request(org_id, user_id, suffix),
            timeout=timeout,
        )
        expect_status(unauthenticated, {401}, "unauthenticated security check")

        created_response = session.post(
            f"{base_url}{DECISIONS_PATH}",
            headers=service_headers,
            json=decision_request(org_id, user_id, suffix),
            timeout=timeout,
        )
        created = expect_status(created_response, {201}, "decision creation")
        decision_id = created.get("decision_id")
        if not isinstance(decision_id, str) or not decision_id:
            raise RuntimeError("decision creation response omitted decision_id")
        if created.get("requires_orqaly_authorization") is not True:
            raise RuntimeError(
                "decision response did not preserve the host-authorization boundary"
            )
        rankings = created.get("recommended_agents")
        if not isinstance(rankings, list) or not rankings:
            raise RuntimeError("decision response did not recommend an eligible agent")

        retrieved_response = session.get(
            f"{base_url}{DECISIONS_PATH}/{decision_id}",
            headers=tenant_headers,
            timeout=timeout,
        )
        retrieved = expect_status(retrieved_response, {200}, "decision retrieval")
        if retrieved.get("decision_id") != decision_id:
            raise RuntimeError("retrieved decision does not match the created decision")

    summary = {
        "status": "passed",
        "base_url": base_url,
        "decision_id": decision_id,
        "routing_mode": created.get("routing_mode"),
        "decision_status": created.get("status"),
        "recommended_agent_id": rankings[0].get("agent_id"),
        "requires_host_authorization": True,
        "scope": "real API create-and-retrieve smoke; no mocked execution",
    }
    print(json.dumps(summary, indent=2, sort_keys=True))


def main() -> int:
    try:
        run()
    except (RuntimeError, requests.RequestException, ValueError) as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
