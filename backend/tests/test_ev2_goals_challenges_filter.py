import pytest

from backend.services.processing.evidence_linking_service import EvidenceLinkingService

class _NoOpLLM:
    async def analyze(self, *_args, **_kwargs):
        return {}

@pytest.mark.asyncio
async def test_ev2_goals_and_challenges_prefer_first_person_lines():
    svc = EvidenceLinkingService(_NoOpLLM())
    attributes = {
        "goals_and_motivations": {"value": "Wants to modernize systems and improve processes"},
        "challenges_and_frustrations": {"value": "Struggles with legacy systems and stakeholder buy-in"},
    }

    scoped_text = (
        "Q: What are your goals?\n"
        "We want to modernize our systems over the next year to reduce manual work.\n"
        "They often slow us down due to approvals.\n"
        "I'm frustrated by legacy systems and I need better stakeholder alignment.\n"
        "Customer requests vary and they can block deployment.\n"
    )

    scope_meta = {"speaker_role": "Interviewee", "document_id": "original_text"}
    enhanced, evidence_map = svc.link_evidence_to_attributes_v2(
        attributes, scoped_text=scoped_text, scope_meta=scope_meta
    )

    for key in ("goals_and_motivations", "challenges_and_frustrations"):
        items = evidence_map.get(key, [])
        if items:
            # Preference: first-person when available and no third-party markers
            assert any(" i " in f" {it['quote'].lower()} " or " we " in f" {it['quote'].lower()} " for it in items)
            assert not any(
                any(tp in f" {it['quote'].lower()} " for tp in [" client", " policyholder", " customer", " they ", " their ", " them "])
                for it in items
            )
        # Ensure doc id present when items exist
        assert all(it.get("document_id") == "original_text" for it in items)
