import pytest

from backend.services.orqaly_persona_resolution_service import (
    OrqalyAgentCandidate,
    OrqalyTaskContext,
    resolve_orqaly_personas,
)

pytestmark = pytest.mark.contract


def _customer_persona():
    quote = "I need traceable quotes before I commit event budget."
    return {
        "name": "Evidence-first Event Lead",
        "communication_style": "direct and structured",
        "pain_points": ["Vague plans", "Unverified claims"],
        "goals": ["Evidence-backed event decisions"],
        "_evidence_linking_v2": {
            "evidence_map": {
                "goals_and_motivations": [
                    {
                        "quote": quote,
                        "speaker": "Alex Researcher",
                        "document_id": "sim_session_1_person_1",
                        "start_char": 0,
                        "end_char": len(quote),
                    }
                ]
            }
        },
    }


def test_resolves_customer_and_best_execution_persona_with_evidence():
    result = resolve_orqaly_personas(
        [_customer_persona()],
        OrqalyTaskContext(
            task_id="task-1",
            title="Create an evidence-backed Warsaw event plan",
            description="Review customer research and prepare a structured event decision brief",
            desired_outcome="A traceable plan with risks and owners",
            category="research",
        ),
        [
            OrqalyAgentCandidate(
                agent_id="agent-research",
                name="Research Strategist",
                role="Evidence Research Lead",
                capabilities=["customer research", "evidence analysis", "event planning"],
                tools=["web-search", "document-analysis"],
                success_rate=0.9,
                reputation_score=0.9,
            ),
            OrqalyAgentCandidate(
                agent_id="agent-video",
                name="Video Producer",
                role="Multimedia Producer",
                capabilities=["video editing", "animation"],
                tools=["video-render"],
                success_rate=0.95,
                reputation_score=0.95,
            ),
        ],
    )

    assert result["customer_persona"]["name"] == "Evidence-first Event Lead"
    assert result["customer_persona"]["evidence"][0]["quote"].startswith("I need")
    assert result["recommended_agent"]["agent_id"] == "agent-research"
    assert result["ideal_agent_persona"]["communication_style"] == "direct and structured"
    assert result["selection_status"] == "matched_candidate"
    assert result["auto_assign_allowed"] is False
    assert result["requires_orqaly_authorization"] is True


def test_returns_ideal_persona_when_orqaly_has_no_candidate():
    result = resolve_orqaly_personas(
        [_customer_persona()],
        OrqalyTaskContext(title="Research users", description="Find customer needs"),
        [],
    )
    assert result["recommended_agent"] is None
    assert result["selection_status"] == "ideal_persona_only"
    assert result["ideal_agent_persona"]["required_capabilities"]


def test_multi_role_research_does_not_present_one_candidate_as_the_whole_team():
    roles = ["Marketing ICP Specialist", "Finance Pricing Specialist"]
    result = resolve_orqaly_personas(
        [_customer_persona()],
        OrqalyTaskContext(
            title="Build a commercial plan",
            description="Research and package a regional offer",
            required_execution_roles=roles,
        ),
        [
            OrqalyAgentCandidate(
                agent_id="agent-marketing",
                name="Marketing Strategist",
                role="Marketing ICP Specialist",
                capabilities=["Marketing ICP Specialist"],
            )
        ],
    )

    assert result["ideal_agent_persona"]["role"] == "Role-specific execution team"
    assert result["ideal_agent_persona"]["profile_scope"] == "team"
    assert result["ideal_agent_persona"]["required_execution_roles"] == roles


def test_rejects_a_weak_cross_domain_candidate_and_normalizes_structured_style():
    customer = _customer_persona()
    customer["communication_style"] = {
        "value": "methodical and evidence-led",
        "confidence": 0.9,
    }
    result = resolve_orqaly_personas(
        [customer],
        OrqalyTaskContext(
            title="Improve unclear operations",
            description="Customers are unhappy and work is slow",
            category="general_operations",
        ),
        [
            OrqalyAgentCandidate(
                agent_id="agent-healthcare",
                name="Healthcare Operations Specialist",
                role="Healthcare Operations Specialist",
                capabilities=["clinic workflow", "patient communication"],
            )
        ],
    )

    assert result["recommended_agent"] is None
    assert result["selection_status"] == "ideal_persona_only"
    assert result["ideal_agent_persona"]["role"] == "Customer-aligned operations specialist"
    assert result["ideal_agent_persona"]["communication_style"] == "methodical and evidence-led"
    assert "better" not in result["ideal_agent_persona"]["required_capabilities"]
