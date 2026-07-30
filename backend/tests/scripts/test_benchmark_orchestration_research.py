from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path
from typing import Any, Mapping

import pytest

from backend.domain.orchestration.models import DecisionCreateRequestV1
from backend.services.orchestration.uncertainty_router import UncertaintyRouter
from scripts.benchmark_orchestration_research import (
    BenchmarkConfig,
    BenchmarkError,
    audit_evidence,
    build_decision_request,
    run_sample,
    summarize,
    validate_safety,
)


pytestmark = pytest.mark.contract


QUOTE = "I need exact evidence before changing the warehouse handoff."
DOCUMENT_ID = "sim_session_sim-1_person-1"


def _config(tmp_path: Path, **updates: Any) -> BenchmarkConfig:
    values = {
        "base_url": "https://api.staging.axwise.example",
        "api_key": "test-secret-that-must-not-leak",
        "org_id": "orqaly-org-staging",
        "user_id": "orqaly-user-staging",
        "environment": "staging",
        "confirmed": True,
        "allow_production": False,
        "count": 20,
        "concurrency": 1,
        "poll_interval_seconds": 1.0,
        "request_timeout_seconds": 5.0,
        "job_timeout_seconds": 30.0,
        "p95_target_seconds": 120.0,
        "sample_size": 1,
        "output_path": tmp_path / "report.json",
    }
    values.update(updates)
    return BenchmarkConfig(**values)


def _completed_result() -> dict[str, Any]:
    evidence = {
        "quote": QUOTE,
        "speaker": "Ingrid",
        "document_id": DOCUMENT_ID,
        "start_char": 0,
        "end_char": len(QUOTE),
    }
    return {
        "job_id": "job-1",
        "status": "completed",
        "result": {
            "simulation_id": "sim-1",
            "people": [{"id": "person-1", "name": "Ingrid"}],
            "interviews": [
                {
                    "person_id": "person-1",
                    "responses": [
                        {
                            "question": "What matters?",
                            "response": QUOTE,
                        }
                    ],
                }
            ],
            "empirical_personas": [
                {
                    "name": "Ingrid",
                    "goals_and_motivations": {
                        "value": "Safe evidence-backed change",
                        "evidence": [evidence],
                    },
                    "_evidence_linking_v2": {
                        "evidence_map": {
                            "goals_and_motivations": [evidence],
                        }
                    },
                }
            ],
            "metadata": {
                "hybrid_pipeline": "A+B",
                "performance_profile": "quality_fast",
            },
            "data": {
                "persona_resolution": {
                    "customer_persona": {
                        "name": "Ingrid",
                        "evidence": [evidence],
                    },
                    "ideal_agent_persona": {
                        "role": "Operations Evidence Specialist",
                    },
                    "recommended_agent": {"agent_id": "agent-evidence"},
                    "requires_orqaly_authorization": True,
                }
            },
        },
    }


def _refreshed_decision() -> dict[str, Any]:
    return {
        "decision_id": "decision-child",
        "parent_decision_id": "decision-parent",
        "routing_mode": "evidence_assisted",
        "requires_orqaly_authorization": True,
        "evidence": [
            {
                "reference_id": (
                    f"synthetic:{DOCUMENT_ID}:0:{len(QUOTE)}:0"
                ),
                "provenance": "synthetic",
                "verified": True,
                "verification_source": "axwise_audit",
            }
        ],
    }


class FakeClock:
    def __init__(self) -> None:
        self.value = 0.0

    def monotonic(self) -> float:
        return self.value

    def sleep(self, seconds: float) -> None:
        self.value += seconds


class FakeResearchClient:
    def __init__(self) -> None:
        self.status_calls = 0
        self.calls: list[tuple[str, str, Mapping[str, str]]] = []
        self._lock = threading.Lock()

    def request(
        self,
        method: str,
        path: str,
        *,
        headers: Mapping[str, str] | None = None,
        json_body: Mapping[str, Any] | None = None,
    ) -> tuple[int, dict[str, Any]]:
        del json_body
        with self._lock:
            self.calls.append((method, path, dict(headers or {})))
            if method == "POST" and path.endswith("/decisions"):
                return 201, {
                    "decision_id": "decision-parent",
                    "routing_mode": "research_assisted",
                    "status": "pending_research",
                    "requires_orqaly_authorization": True,
                    "research_job": {
                        "job_id": "job-1",
                        "status": "queued",
                        "pipeline": "hybrid_a_plus_b",
                    },
                    "recommended_agents": [],
                    "execution_plan": {"executable": False, "nodes": []},
                }
            if method == "GET" and path.endswith("/job-1/status"):
                self.status_calls += 1
                if self.status_calls == 1:
                    return 200, {"job_id": "job-1", "status": "running"}
                return 200, {"job_id": "job-1", "status": "completed"}
            if method == "GET" and path.endswith("/job-1"):
                return 200, _completed_result()
            if method == "POST" and path.endswith("/research/refresh"):
                return 201, _refreshed_decision()
        raise AssertionError(f"unexpected fake request: {method} {path}")


def test_safety_requires_confirmation_minimum_sample_and_nonproduction(tmp_path):
    with pytest.raises(BenchmarkError, match="--confirm"):
        validate_safety(_config(tmp_path, confirmed=False))
    with pytest.raises(BenchmarkError, match="at least 20"):
        validate_safety(_config(tmp_path, count=19))
    with pytest.raises(BenchmarkError, match="production is refused"):
        validate_safety(
            _config(tmp_path, base_url="https://api.axwise.de")
        )


def test_production_requires_double_opt_in(tmp_path):
    config = _config(
        tmp_path,
        base_url="https://api.axwise.de",
        environment="production",
        allow_production=True,
    )
    validate_safety(config)


def test_benchmark_payload_deterministically_forces_bounded_research(tmp_path):
    request = DecisionCreateRequestV1.model_validate(
        build_decision_request(_config(tmp_path), "sample-token")
    )
    assessment = UncertaintyRouter().route(request, [])
    assert assessment.selected_mode.value == "research_assisted"
    assert request.research_policy.allow_hybrid_research is True
    assert request.research_policy.maximum_research_iterations == 1


def test_config_repr_and_summary_never_expose_secret_or_tenant_ids(tmp_path):
    config = _config(tmp_path)
    assert config.api_key not in repr(config)
    report = summarize(
        config,
        [
            {
                "sample": index,
                "success": True,
                "terminal_status": "completed",
                "terminal_latency_seconds": float(index),
                "evidence_audit": {
                    "evidence_items": 1,
                    "exact_quote_count": 1,
                    "source_id_valid_count": 1,
                    "offset_valid_count": 1,
                    "provenance_counts": {"synthetic": 1},
                    "customer_persona_present": True,
                    "ideal_agent_persona_present": True,
                },
            }
            for index in range(1, 21)
        ],
        started_at="2026-07-30T00:00:00+00:00",
        finished_at="2026-07-30T00:01:00+00:00",
        health={"status": "healthy", "revision": "revision-123", "secret": "omit"},
    )
    serialized = json.dumps(report)
    assert config.api_key not in serialized
    assert config.org_id not in serialized
    assert config.user_id not in serialized
    assert report["server_health"] == {
        "status": "healthy",
        "revision": "revision-123",
    }
    assert report["metrics"]["create_to_terminal_seconds"]["p50"] == 10.5
    assert report["metrics"]["create_to_terminal_seconds"]["p95"] == 19.05
    assert report["gate"]["passed"] is True


def test_evidence_audit_checks_exact_offsets_source_and_provenance():
    audit = audit_evidence(_completed_result(), _refreshed_decision())
    assert audit["passed"] is True
    assert audit["exact_quote_rate"] == 1.0
    assert audit["source_id_valid_rate"] == 1.0
    assert audit["offset_valid_rate"] == 1.0
    assert audit["decision_inherited_provenance_rate"] == 1.0
    assert audit["provenance_counts"] == {"synthetic": 1}
    assert audit["customer_persona_present"] is True
    assert audit["ideal_agent_persona_present"] is True
    assert audit["items"] == [
        {
            "fields": ["goals_and_motivations"],
            "source_id": DOCUMENT_ID,
            "start_char": 0,
            "end_char": len(QUOTE),
            "quote_sha256_16": hashlib.sha256(
                QUOTE.encode("utf-8")
            ).hexdigest()[:16],
            "source_id_valid": True,
            "offset_valid": True,
            "exact_quote_match": True,
            "provenance": "synthetic",
        }
    ]
    assert QUOTE not in json.dumps(audit)


def test_evidence_audit_fails_when_quote_offsets_are_not_exact():
    payload = _completed_result()
    persona = payload["result"]["empirical_personas"][0]
    for item in (
        persona["goals_and_motivations"]["evidence"]
        + persona["_evidence_linking_v2"]["evidence_map"][
            "goals_and_motivations"
        ]
    ):
        item["end_char"] = len(QUOTE) - 1
    audit = audit_evidence(payload, _refreshed_decision())
    assert audit["passed"] is False
    assert audit["exact_quote_rate"] == 0.0
    assert any("exactly match" in error for error in audit["errors"])


def test_run_sample_uses_mocked_http_and_reaches_audited_terminal_result(tmp_path):
    config = _config(tmp_path)
    clock = FakeClock()
    client = FakeResearchClient()

    sample = run_sample(
        1,
        config,
        client,
        monotonic=clock.monotonic,
        sleeper=clock.sleep,
    )

    assert sample["success"] is True
    assert sample["routing_mode"] == "research_assisted"
    assert sample["terminal_status"] == "completed"
    assert sample["terminal_latency_seconds"] == 1.0
    assert sample["quality_fast"] == {
        "expected": True,
        "observed": "quality_fast",
        "verification": "response_metadata",
    }
    assert sample["evidence_audit"]["passed"] is True
    assert all(
        headers.get("x-axwise-key") == config.api_key
        for _method, path, headers in client.calls
        if path != "/health"
    )
