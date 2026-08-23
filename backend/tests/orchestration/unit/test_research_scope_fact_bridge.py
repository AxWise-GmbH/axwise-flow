"""Focused safety tests for the research-to-scope fact projection."""

from __future__ import annotations

from types import SimpleNamespace

from backend.services.orchestration.adapters.hybrid_research_adapter import (
    HybridResearchAdapter,
)


def _run(*, evidence_class: str = "official_statistic", conflicts: int = 0):
    signature = "a" * 64
    claim_text = "The official 2026 scheduling-gap count is 42."
    return SimpleNamespace(
        dataset={
            "data": {
                "research_bundle": {
                    "market_claims": [
                        {
                            "claim_id": "claim-official-gap-count",
                            "subject": "Official clinic statistics",
                            "predicate": "reports",
                            "object": claim_text,
                            "source_ids": ["source-official-clinic"],
                        }
                    ],
                    "quality": {
                        "critical_claims": {
                            "conflict_count": conflicts,
                            "evidence_ledger": [
                                {
                                    "claim_id": "claim-official-gap-count",
                                    "evidence_class": evidence_class,
                                    "status": "verified_current_authoritative",
                                    "source_ids": ["source-official-clinic"],
                                    "facts": [
                                        {
                                            "fact_id": "fact-official-gap-count",
                                            "identity_complete": True,
                                            "display_value": "42",
                                            "source_scope": ["source-official-clinic"],
                                        }
                                    ],
                                    "sources": [
                                        {
                                            "source_id": "source-official-clinic",
                                            "source_authority": "official_public",
                                            "authority_proof_signature": signature,
                                            # URLs must not cross the compact fact bridge.
                                            "url": "https://authority.example/clinic",
                                        }
                                    ],
                                }
                            ],
                        }
                    },
                }
            }
        }
    )


def test_projects_only_proof_bound_authoritative_claims_without_raw_source_data():
    facts, evidence = HybridResearchAdapter._authoritative_scope_contracts(
        _run(),
        maximum_items=25,
    )

    assert len(facts) == len(evidence) == 1
    fact = facts[0]
    item = evidence[0]
    assert fact.verification == "verified"
    assert fact.verbatim_excerpt == "The official 2026 scheduling-gap count is 42."
    assert fact.source_refs == [item.reference_id]
    assert fact.source_authority_ids[0].startswith("axwise-authority-")
    assert len(fact.source_authority_ids[0]) == len("axwise-authority-") + 64
    assert fact.content_hash == item.content_hash
    assert item.provenance == "empirical"
    assert item.verified is True
    serialized = fact.model_dump_json()
    assert "authority.example" not in serialized


def test_rejects_synthetic_or_conflicted_rows_even_when_they_claim_verified_status():
    synthetic_facts, synthetic_evidence = (
        HybridResearchAdapter._authoritative_scope_contracts(
            _run(evidence_class="synthetic_hypothesis"),
            maximum_items=25,
        )
    )
    conflicted_facts, conflicted_evidence = (
        HybridResearchAdapter._authoritative_scope_contracts(
            _run(conflicts=1),
            maximum_items=25,
        )
    )

    assert synthetic_facts == synthetic_evidence == []
    assert conflicted_facts == conflicted_evidence == []
