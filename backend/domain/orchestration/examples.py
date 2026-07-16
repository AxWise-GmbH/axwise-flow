"""OpenAPI examples proving that one contract spans multiple operational domains."""

from copy import deepcopy


def _example(
    *,
    task_id: str,
    domain: str,
    objective: str,
    outcome: str,
    capability: str,
    preferred: str,
    tool_id: str,
    action: str,
    risk: str = "medium",
) -> dict:
    return {
        "contract_version": "1.0",
        "tenant": {"userId": "orqaly-user-example", "orgId": "orqaly-org-example"},
        "task": {
            "contract_version": "1.0",
            "task_id": task_id,
            "domain": domain,
            "objective": objective,
            "desired_outcome": outcome,
            "required_capabilities": [capability],
            "preferred_capabilities": [preferred],
            "required_tools": [tool_id],
            "requested_actions": [action],
            "stakeholders": [domain],
            "constraints": ["Do not perform an external side effect without Orqaly authorization"],
            "data_classification": "internal",
            "risk_level": risk,
        },
        "available_agents": [
            {
                "agent_id": f"agent-{domain}",
                "org_id": "orqaly-org-example",
                "name": f"{domain.replace('_', ' ').title()} Specialist",
                "capabilities": [capability, preferred],
                "tool_ids": [tool_id],
                "availability": "available",
                "success_rate": 0.88,
                "estimated_cost": 8,
                "estimated_latency_ms": 30000,
                "max_data_classification": "confidential",
                "max_risk_level": "high",
                "stakeholder_tags": [domain],
            }
        ],
        "available_tools": [
            {
                "tool_id": tool_id,
                "org_id": "orqaly-org-example",
                "name": tool_id.replace("_", " ").title(),
                "available": True,
                "allowed_actions": [action],
                "allowed_data_classifications": ["internal", "confidential"],
            }
        ],
        "policy_context": {
            "human_approval_required_for": ["production_change", "customer_send"],
            "maximum_risk_without_human": "medium",
        },
        "budget": {
            "currency": "EUR",
            "maximum_cost": 25,
            "maximum_latency_ms": 120000,
        },
    }


def _bounded_research_example() -> dict:
    value = _example(
        task_id="task-bounded-research",
        domain="general_operations",
        objective="Analyze this unresolved operational problem",
        outcome="Make it better with stakeholder evidence",
        capability="operational analysis",
        preferred="stakeholder_research",
        tool_id="records_read",
        action="analyze_records",
    )
    value["research_policy"] = {
        "allow_hybrid_research": True,
        "minimum_value_of_information": 0.3,
        "maximum_research_cost": 100,
        "estimated_research_cost": 20,
        "maximum_research_latency_ms": 600000,
        "estimated_research_latency_ms": 300000,
        "maximum_research_iterations": 1,
        "maximum_evidence_items": 20,
    }
    value["research_brief"] = {
        "business_idea": "Operational workflow redesign",
        "target_stakeholders": "Operations managers and analysts",
        "problem": "The correct execution capability depends on unresolved stakeholder needs",
        "research_questions": [
            "Which outcome matters most to the affected stakeholders?",
            "Which specialist capability is required to deliver it?",
        ],
        "depth": "quick",
        "sample_size": 2,
    }
    return value


def _team_plan_example() -> dict:
    value = _example(
        task_id="task-team-plan",
        domain="customer_support",
        objective="Prepare and independently review a customer recovery response",
        outcome="An approved evidence-grounded response with an explicit handoff",
        capability="evidence review",
        preferred="customer communication",
        tool_id="ticket_read",
        action="analyze_ticket",
    )
    value["task"].update(
        {
            "required_capabilities": ["evidence review", "customer communication"],
            "required_tools": [],
            "requested_actions": [],
        }
    )
    value["available_agents"] = [
        {
            "agent_id": "agent-evidence-review",
            "org_id": "orqaly-org-example",
            "name": "Evidence Reviewer",
            "capabilities": ["evidence review", "review"],
            "tool_ids": ["ticket_read"],
            "availability": "available",
            "success_rate": 0.87,
            "estimated_cost": 8,
            "estimated_latency_ms": 30000,
            "max_data_classification": "confidential",
            "max_risk_level": "high",
            "collaboration_tags": ["structured handoff"],
        },
        {
            "agent_id": "agent-customer-response",
            "org_id": "orqaly-org-example",
            "name": "Customer Response Specialist",
            "capabilities": ["customer communication", "review"],
            "tool_ids": ["response_draft"],
            "availability": "available",
            "success_rate": 0.89,
            "estimated_cost": 9,
            "estimated_latency_ms": 25000,
            "max_data_classification": "confidential",
            "max_risk_level": "high",
            "collaboration_tags": ["structured handoff"],
        },
    ]
    value["available_tools"] = [
        {
            "tool_id": "ticket_read",
            "org_id": "orqaly-org-example",
            "name": "Ticket Read",
            "available": True,
            "allowed_actions": ["analyze_ticket"],
            "allowed_data_classifications": ["internal", "confidential"],
        },
        {
            "tool_id": "response_draft",
            "org_id": "orqaly-org-example",
            "name": "Response Draft",
            "available": True,
            "allowed_actions": ["customer_send"],
            "allowed_data_classifications": ["internal", "confidential"],
        },
    ]
    value["planning"] = {
        "pattern": "sequential",
        "maximum_team_size": 3,
        "required_collaboration_tags": ["structured handoff"],
        "separation_of_duty_rules": [
            {
                "rule_id": "evidence-response-separation",
                "step_ids": ["evidence-review", "response-draft"],
                "reason": "Evidence assessment and customer communication require different owners",
            }
        ],
        "steps": [
            {
                "step_id": "evidence-review",
                "title": "Review the escalation evidence",
                "objective": "Identify supported facts and unresolved claims in the escalation",
                "required_capabilities": ["evidence review"],
                "required_tools": ["ticket_read"],
                "requested_actions": ["analyze_ticket"],
                "input_contract": {"ticket_reference": "ContextReference"},
                "output_contract": {"evidence_summary": "EvidenceSummaryV1"},
                "completion_criteria": ["Every response claim is supported or marked unresolved"],
            },
            {
                "step_id": "response-draft",
                "title": "Prepare the customer response",
                "objective": "Draft the recovery response using only the reviewed evidence",
                "required_capabilities": ["customer communication"],
                "required_tools": ["response_draft"],
                "requested_actions": ["customer_send"],
                "dependencies": ["evidence-review"],
                "input_contract": {"evidence_summary": "EvidenceSummaryV1"},
                "output_contract": {"response": "CustomerResponseV1"},
                "completion_criteria": ["Response is approved before Orqaly delivery"],
            },
        ],
    }
    return value


ORCHESTRATION_DECISION_EXAMPLES = {
    "software_incident": {
        "summary": "Software incident remediation",
        "value": _example(
            task_id="task-software-incident",
            domain="software_operations",
            objective="Diagnose an authentication incident and propose a reviewed remediation",
            outcome="A traceable remediation proposal with tests and rollback steps",
            capability="incident response",
            preferred="remediation_planning",
            tool_id="repository_read",
            action="analyze_repository",
        ),
    },
    "customer_escalation": {
        "summary": "Customer support escalation",
        "value": _example(
            task_id="task-customer-escalation",
            domain="customer_support",
            objective="Prepare a response plan for a high-value customer escalation",
            outcome="An approved response brief with owners and next actions",
            capability="customer comms",
            preferred="escalation_management",
            tool_id="ticket_read",
            action="analyze_ticket",
        ),
    },
    "compliance_review": {
        "summary": "Compliance evidence review",
        "value": _example(
            task_id="task-compliance-review",
            domain="compliance",
            objective="Review an internal control package for missing regulatory evidence",
            outcome="A gap report with evidence references and human review points",
            capability="regulatory analysis",
            preferred="evidence_assessment",
            tool_id="document_read",
            action="analyze_documents",
            risk="high",
        ),
    },
    "marketing_preparation": {
        "summary": "Regional marketing preparation",
        "value": _example(
            task_id="task-marketing-preparation",
            domain="marketing",
            objective="Prepare an evidence-grounded brief for a regional campaign",
            outcome="A review-ready campaign brief aligned with brand constraints",
            capability="campaign copy",
            preferred="brand_review",
            tool_id="brand_library_read",
            action="prepare_campaign",
        ),
    },
    "finance_analysis": {
        "summary": "Finance variance analysis",
        "value": _example(
            task_id="task-finance-analysis",
            domain="finance",
            objective="Analyze a monthly budget variance without initiating transactions",
            outcome="A finance-reviewable variance explanation with source references",
            capability="financial modelling",
            preferred="variance_analysis",
            tool_id="ledger_read",
            action="analyze_ledger",
            risk="high",
        ),
    },
    "bounded_research": {
        "summary": "Value-of-information gated A+B research",
        "value": _bounded_research_example(),
    },
    "multi_agent_plan": {
        "summary": "Sequential evidence and delivery team plan",
        "value": _team_plan_example(),
    },
}


def example_values() -> list[dict]:
    """Return independent copies for contract tests."""
    return [deepcopy(item["value"]) for item in ORCHESTRATION_DECISION_EXAMPLES.values()]
