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


def test_customer_selection_excludes_explicit_executor_even_with_stronger_evidence():
    customer = _customer_persona()
    customer["name"] = "Jens Völkers, Managing Director"
    customer["stakeholder_intelligence"] = {
        "stakeholder_type": "Problem experiencer"
    }
    executor = _customer_persona()
    executor["name"] = "Torsten Kröger, Compliance Specialist"
    executor["confidence"] = 1.0
    executor["stakeholder_intelligence"] = {"stakeholder_type": "Executor"}
    executor["_evidence_linking_v2"]["evidence_map"]["goals_and_motivations"].append(
        {
            "quote": "I require Article 32 evidence and a risk matrix.",
            "speaker": executor["name"],
            "document_id": "sim_session_1_executor",
            "start_char": 0,
            "end_char": 48,
        }
    )

    result = resolve_orqaly_personas(
        [executor, customer],
        OrqalyTaskContext(title="Build a Bremen plan", description="Research buyers"),
        [],
    )

    assert result["customer_persona"]["name"] == customer["name"]


def test_customer_selection_fails_closed_when_only_executors_exist():
    executor = _customer_persona()
    executor["stakeholder_intelligence"] = {"stakeholder_type": "Executor"}

    with pytest.raises(ValueError, match="eligible customer persona"):
        resolve_orqaly_personas(
            [executor],
            OrqalyTaskContext(title="Build a Bremen plan", description="Research buyers"),
            [],
        )


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


def test_commercial_customer_prefers_economic_buyer_over_high_confidence_operator():
    operator = _customer_persona()
    operator.update(
        {
            "name": "Kadri Saar, Retail Operations Analyst",
            "confidence": 0.99,
            "stakeholder_intelligence": {"stakeholder_type": "Operational user"},
        }
    )
    buyer = _customer_persona()
    buyer.update(
        {
            "name": "Markus Tamm, Category Manager",
            "confidence": 0.72,
            "stakeholder_intelligence": {"stakeholder_type": "Economic buyer"},
        }
    )

    result = resolve_orqaly_personas(
        [operator, buyer],
        OrqalyTaskContext(
            title="Launch cat food in Estonia",
            description="Build the commercial market plan",
            research_prd_type="commercial_market_launch",
        ),
        [],
    )

    assert result["customer_persona"]["name"] == buyer["name"]
    assert result["customer_persona"]["decision_role"] == "economic_buyer"
    assert result["customer_persona"]["buyer_role"] is True
    assert result["customer_persona"]["selection_eligibility"] == "eligible_primary"


def test_commercial_customer_fails_closed_when_only_operator_exists():
    operator = _customer_persona()
    operator.update(
        {
            "name": "Kadri Saar, Operations Analyst",
            "stakeholder_intelligence": {"stakeholder_type": "Operational user"},
        }
    )

    with pytest.raises(ValueError, match="economic buyer or decision authority"):
        resolve_orqaly_personas(
            [operator],
            OrqalyTaskContext(
                title="Launch cat food in Estonia",
                description="Build the commercial market plan",
                research_prd_type="commercial_market_launch",
            ),
            [],
        )


def test_trusted_operator_cannot_be_promoted_by_generated_authority_fields():
    operator = _customer_persona()
    operator.update(
        {
            "name": "Kadri Saar, Owner",
            "role": "Owner",
            "job_title": "Commercial Director",
            "persona_metadata": {"decision_role": "decision authority"},
            "stakeholder_intelligence": {
                "stakeholder_type": "Operational user",
                "decision_role": "economic buyer",
                "role": "Owner",
            },
        }
    )

    with pytest.raises(ValueError, match="economic buyer or decision authority"):
        resolve_orqaly_personas(
            [operator],
            OrqalyTaskContext(
                title="Launch cat food in Estonia",
                description="Build the commercial market plan",
                research_prd_type="commercial_market_launch",
            ),
            [],
        )


@pytest.mark.parametrize(
    "stakeholder_type",
    ["Unknown authority", "assistant to economic buyer"],
)
def test_unknown_trusted_type_cannot_be_promoted_by_owner_title(stakeholder_type):
    persona = _customer_persona()
    persona.update(
        {
            "name": "Kadri Saar, Owner",
            "role": "Owner",
            "job_title": "Owner",
            "stakeholder_intelligence": {
                "stakeholder_type": stakeholder_type,
                "decision_role": "economic buyer",
            },
        }
    )

    with pytest.raises(ValueError, match="economic buyer or decision authority"):
        resolve_orqaly_personas(
            [persona],
            OrqalyTaskContext(
                title="Launch cat food in Estonia",
                description="Build the commercial market plan",
                research_prd_type="commercial_market_launch",
            ),
            [],
        )


@pytest.mark.parametrize(
    ("stakeholder_type", "expected_role"),
    [
        ("Decision authority", "decision_authority"),
        ("Economic buyer", "economic_buyer"),
    ],
)
def test_exact_trusted_primary_role_is_commercially_eligible(
    stakeholder_type, expected_role
):
    persona = _customer_persona()
    persona["stakeholder_intelligence"] = {
        "stakeholder_type": stakeholder_type
    }

    result = resolve_orqaly_personas(
        [persona],
        OrqalyTaskContext(
            title="Launch cat food in Estonia",
            description="Build the commercial market plan",
            research_prd_type="commercial_market_launch",
        ),
        [],
    )

    assert result["customer_persona"]["decision_role"] == expected_role
    assert result["customer_persona"]["selection_eligibility"] == "eligible_primary"


def test_legacy_persona_without_source_type_keeps_title_inference():
    persona = _customer_persona()
    persona.update(
        {
            "name": "Marta Saar, Commercial Director",
            "job_title": "Commercial Director",
            "stakeholder_intelligence": {"decision_role": ""},
        }
    )

    result = resolve_orqaly_personas(
        [persona],
        OrqalyTaskContext(
            title="Launch cat food in Estonia",
            description="Build the commercial market plan",
            research_prd_type="commercial_market_launch",
        ),
        [],
    )

    assert result["customer_persona"]["decision_role"] == "economic_buyer"
    assert result["customer_persona"]["selection_eligibility"] == "eligible_primary"


def test_supporting_a_cfo_does_not_promote_a_junior_analyst_to_buyer():
    junior = _customer_persona()
    junior.update(
        {
            "name": "Liis Kask, Junior Commercial Analyst supporting CFO",
            "job_title": "Junior Commercial Analyst supporting CFO",
        }
    )
    director = _customer_persona()
    director.update(
        {
            "name": "Marta Saar, Commercial Director",
            "job_title": "Commercial Director",
        }
    )

    result = resolve_orqaly_personas(
        [junior, director],
        OrqalyTaskContext(
            title="Estonia commercial launch",
            description="Choose the buying persona",
            research_prd_type="commercial_market_launch",
            customer_role_contract={
                "primary_roles": ["economic_buyer"],
                "require_primary_buyer": True,
            },
        ),
        [],
    )

    assert result["customer_persona"]["name"] == director["name"]
    assert result["customer_persona"]["selection_eligibility"] == "eligible_primary"
