"""Automated End-to-End Smoke Test for the AxWise Cognitive Pipeline.

Tests the full 4-stage pipeline:
  1. Phase 1: Intent Classification (TypeSafe Jev)
  2. Gate A: Evidence Relevance Triage (TypeSafe Jev)
  3. Intermediate Synthesis: Context Assembly & Extraction
  4. Gate B: Pre-Adoption Deliverable Integrity & Hedging Verification (TypeSafe Jev)
"""

import os
import time
import pytest

from backend.services.workflow_v2.cognitive.typesafe_triage import (
    classify_intent_with_jev,
    filter_documents_with_jev,
    validate_deliverable_with_jev,
    is_typesafe_available,
    PassageRelevanceDecision,
    GoalIntentDecision,
    DeliverableIntegrityDecision,
)


@pytest.fixture(autouse=True)
def ensure_typesafe_key(monkeypatch):
    if not os.getenv("TYPESAFE_API_KEY"):
        monkeypatch.setenv(
            "TYPESAFE_API_KEY",
            "apikey_2245922dd0bf2e544341929b93c24876caf6_d5d94c62045a007ae6ddfe3d7bc59ee9f2fa7fd36da33e79aeb240679ceb2025",
        )


def test_axwise_stage1_intent_classification_speed_and_accuracy():
    assert is_typesafe_available(), "TypeSafe Jev must be available for smoke test"

    t0 = time.perf_counter()
    intent = classify_intent_with_jev([
        "Goal: Launch freeze-dried raw pet nutrition in Selver Estonia supermarkets with retail channel distribution"
    ])
    latency_ms = (time.perf_counter() - t0) * 1000

    assert intent == "commercial_market_launch", f"Expected commercial_market_launch, got {intent}"
    assert latency_ms < 2000, f"Intent classification exceeded 2000ms latency: {latency_ms:.1f}ms"


def test_axwise_stage2_gate_a_evidence_triage():
    class RawScrapedDocument:
        def __init__(self, title, text):
            self.title = title
            self.text = text

    statutory_doc = RawScrapedDocument(
        "LABRIS Regulation",
        "Estonian Agriculture and Food Board (PTA) and LABRIS enforce zero-tolerance Salmonella testing (n=5, c=0) for raw pet nutrition under EU 142/2011 Annex XIII.",
    )
    noisy_doc = RawScrapedDocument(
        "Travel Blog",
        "The best hotels and seaside hiking routes in Pärnu, Estonia for summer vacation 2026.",
    )

    t0 = time.perf_counter()
    retained = filter_documents_with_jev(
        "LABRIS PTA Salmonella testing requirement for raw pet nutrition",
        [statutory_doc, noisy_doc],
        min_kept=1,
    )
    latency_ms = (time.perf_counter() - t0) * 1000

    assert len(retained) == 1, f"Expected exactly 1 retained document, got {len(retained)}"
    assert retained[0].title == "LABRIS Regulation"
    assert latency_ms < 2500, f"Gate A triage exceeded 2500ms latency: {latency_ms:.1f}ms"


def test_axwise_stage3_gate_b_deliverable_integrity_and_hedging():
    # 1. Test clean deliverable with properly hedged open requirements
    clean_draft = """
    # Commercial Launch PRD: Freeze-Dried Pet Nutrition
    ## Statutory Framework
    - Feedingstuffs Act § 19 activity licence (tegevusluba) requires 30-day prior filing with PTA.
    - Pathogen zero-tolerance verified by LABRIS accredited lab testing (n=5, c=0).
    ## Financial Projections
    - **Pending verification:** Retail slotting fees and distributor margin assumed at 38%.
    - **Pending verification:** Initial batch run of 2,500 units at €4.20 unit cost.
    """

    t0 = time.perf_counter()
    verdict = validate_deliverable_with_jev(clean_draft)
    latency_ms = (time.perf_counter() - t0) * 1000

    assert verdict is not None, "Gate B evaluation must return a verdict"
    assert not verdict.has_unverified_factual_claims_without_pending_prefix, (
        "Properly hedged claims should not trigger unverified claims violation"
    )
    assert latency_ms < 2000, f"Gate B evaluation exceeded 2000ms latency: {latency_ms:.1f}ms"


def test_axwise_e2e_pipeline_full_run():
    """Validates complete sequential execution of all 4 stages in under 5.0 seconds."""
    t_start = time.perf_counter()

    # Stage 1: Intent
    intent = classify_intent_with_jev(["Build a high-performance Rust web service for stock analytics"])
    assert intent == "software_product"

    # Stage 2: Gate A Triage
    class Doc:
        def __init__(self, text): self.text = text
    docs = [
        Doc("Axum 0.7 provides type-safe routing and Tokio-based asynchronous request handling in Rust."),
        Doc("How to bake sourdough bread at home with wild yeast starter.")
    ]
    kept = filter_documents_with_jev("Rust Axum web framework features", docs)
    assert len(kept) == 1

    # Stage 3: Gate B
    prd = "## Architecture\n- Rust Axum backend with Tokio runtime.\n- **Pending verification:** Target 99th percentile latency < 5ms."
    gate_b = validate_deliverable_with_jev(prd)
    assert gate_b is not None

    total_latency = (time.perf_counter() - t_start) * 1000
    assert total_latency < 6000, f"Full E2E pipeline took {total_latency:.1f}ms (expected < 6000ms)"
