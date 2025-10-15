import pytest

from backend.services.processing.evidence_linking_service import EvidenceLinkingService

class _NoOpLLM:
    async def analyze(self, *_args, **_kwargs):
        return {}

@pytest.mark.asyncio
async def test_ev2_demographics_prefers_first_person_and_excludes_third_party():
    svc = EvidenceLinkingService(_NoOpLLM())
    attributes = {
        "demographics": {
            "value": "Senior broker with 15 years experience in insurance brokerage",
            # include subfields to exercise focused-anchor fallback
            "roles": {"value": "Broker"},
            "industry": {"value": "Insurance"},
            "professional_context": {"value": "Brokerage"},
        }
    }

    scoped_text = (
        "Researcher: Could you tell me about your background?\n"
        "I have 15 years of experience as a broker working with mid-market clients.\n"
        "They are usually policyholders from SMEs that need guidance.\n"
        "We operate out of Berlin and our team focuses on modernization.\n"
        "Customer profiles vary a lot depending on sector.\n"
    )

    scope_meta = {"speaker_role": "Interviewee", "document_id": "original_text"}

    enhanced, evidence_map = svc.link_evidence_to_attributes_v2(
        attributes, scoped_text=scoped_text, scope_meta=scope_meta
    )

    demo_items = evidence_map.get("demographics", [])
    # Should select only first-person lines when available
    assert all(
        (" I " in f" {it.get('quote','').lower()} " or " we " in f" {it.get('quote','').lower()} ")
        and not any(tp in f" {it.get('quote','').lower()} " for tp in [" client", " policyholder", " customer", " they ", " their ", " them "])
        for it in demo_items
    ), f"Unexpected demographics items: {demo_items}"

    # Ensure document_id is set
    assert all(it.get("document_id") == "original_text" for it in demo_items)
