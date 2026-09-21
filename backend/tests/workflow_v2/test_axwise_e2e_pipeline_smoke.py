"""Offline Jev adapter journey; this does not claim installed-desktop E2E coverage."""

import json
from types import SimpleNamespace

import httpx
import pytest

from backend.services.workflow_v2.cognitive import typesafe_triage as jev

pytestmark = pytest.mark.contract


async def test_jev_intent_evidence_and_review_adapter_journey(monkeypatch):
    stages = []
    original = httpx.AsyncClient

    async def handle(request):
        payload = json.loads(request.content)
        state = payload["state"]
        if "goals" in state:
            stages.append("intent")
            scores = {"is_software_product": 1.0}
        elif "document" in state:
            stages.append("triage")
            scores = {"is_directly_relevant": float("Rust" in state["document"])}
        else:
            stages.append("review")
            assert state["evidence"]["rust-routing"] == "Rust supports typed routes."
            assert state["acceptance_criteria"] == [{"id": "typed-routes"}]
            scores = {"is_acceptance_criteria_traceability_intact": 1.0}
        return httpx.Response(
            200,
            json={
                "answers": {
                    name: {"type": "noul", "noul": scores.get(name, 0.0)}
                    for name in payload["questions"]
                }
            },
        )

    monkeypatch.setenv("TYPESAFE_API_KEY", "offline-placeholder")
    monkeypatch.setattr(
        jev.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    intent = await jev.classify_intent_with_jev(["Build a Rust API"])
    assert intent == "software_product"
    documents = [
        SimpleNamespace(text="Rust supports typed routes."),
        SimpleNamespace(text="Sourdough baking"),
    ]
    selected = await jev.filter_documents_with_jev("Rust routing", documents)
    assert selected == documents[:1]
    review = await jev.validate_deliverable_with_jev(
        "Use typed routes [rust-routing]",
        acceptance_criteria=[{"id": "typed-routes"}],
        evidence={"rust-routing": selected[0].text},
    )
    assert review.status == "passed"
    assert stages == ["intent", "triage", "triage", "review"]
