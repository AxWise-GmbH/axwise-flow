---
type: Product and Architecture Doctrine
title: "AxWise × Orqaly Cognitive Orchestration and Assignment"
description: "The domain-neutral product doctrine, contracts, routing modes, acceptance criteria, and differentiation roadmap for AxWise decision intelligence and Orqaly execution."
tags: [axwise, orqaly, orchestration, assignment, agents, operations, strategy]
timestamp: 2026-07-16T12:00:00Z
---

# AxWise × Orqaly cognitive orchestration and assignment

## Product thesis

**AxWise decides who should do what, why, with which context and guardrails. Orqaly executes, monitors, and delivers the work.**

AxWise is not limited to software development, customer research, or persona generation. It is intended to become a domain-neutral cognitive control plane for LLM-driven work. It understands a task, determines the capabilities and execution pattern required, evaluates the affected stakeholders and risks, and recommends the best agent, team, workflow, or human escalation.

Orqaly remains the execution operating system. It owns authenticated users and organisations, agent and tool availability, workflow state, external integrations, budgets, approvals, retries, notifications, and final delivery.

Research is one optional reasoning mode inside AxWise. Pipeline A, Pipeline B, and the A+B loop provide evidence and stakeholder understanding when uncertainty warrants their cost. They must not run for every operational task.

## Product boundary

| AxWise decision plane | Orqaly execution plane |
|---|---|
| Understand task intent, desired outcome, domain, urgency, and risk. | Authenticate the user, organisation, and available resources. |
| Determine stakeholders, required capabilities, tools, and evidence. | Maintain the agent catalogue, tools, secrets, budgets, and permissions. |
| Select a direct, sequential, parallel, supervised, research-assisted, or human-controlled execution pattern. | Start, schedule, persist, retry, pause, cancel, and monitor execution. |
| Rank one agent or construct a proposed multi-agent team. | Recheck ownership, availability, RBAC, budget, and tool scopes before assignment. |
| Produce an explainable execution plan, confidence, guardrails, approval points, and fallbacks. | Execute approved steps and enforce the final policy decision. |
| Recommend reassignment or replanning from outcome evidence. | Return execution outcomes, costs, failures, corrections, and human feedback. |

AxWise must never silently grant permissions, expose secrets, or execute an external side effect that belongs to Orqaly. A recommendation is not authorization.

## Domain-neutral scope

The same orchestration contract must support, without a domain-specific top-level API:

| Domain | Example task | Likely execution pattern |
|---|---|---|
| Software engineering | Implement and review an authentication flow. | Sequential specialist team with security approval. |
| Product and customer research | Evaluate an uncertain product proposition. | Research-assisted A+B workflow followed by synthesis. |
| Marketing | Prepare a regional campaign. | Parallel research, copy, design, and compliance team. |
| Sales | Prepare an enterprise proposal. | Evidence retrieval followed by account and proposal specialists. |
| Customer support | Resolve a high-risk customer escalation. | Direct specialist assignment with human approval. |
| Finance | Investigate a monthly variance. | Restricted analysis workflow with evidence and approval gates. |
| Legal and compliance | Review a contract or assemble audit evidence. | Sequential extraction, risk analysis, and mandatory human review. |
| HR and recruiting | Create and run a hiring campaign. | Research, content, sourcing, and scheduling workflow. |
| Procurement | Compare suppliers against stakeholder criteria. | Parallel evidence collection followed by scored synthesis. |
| General operations | Investigate an SLA breach or process failure. | Multi-source analysis, remediation planning, and supervised execution. |
| Executive work | Prepare a board briefing. | Parallel finance, market, and strategy analysis with executive review. |
| Personal productivity | Organise a business trip or complex schedule. | Direct workflow selection with budget and confirmation gates. |

New domains should normally add capabilities, policies, tools, and evaluation data—not a new orchestration architecture.

## Generic task contract

The target orchestration interface should accept a domain-neutral task envelope:

```json
{
  "tenant": {
    "org_id": "verified-organisation",
    "user_id": "verified-user"
  },
  "task": {
    "task_id": "task-123",
    "objective": "Prepare a response to an enterprise customer escalation",
    "description": "The customer reports repeated data export failures before renewal.",
    "desired_outcome": "An evidence-backed response and approved remediation plan",
    "deadline": "2026-07-18T12:00:00Z",
    "constraints": ["Do not modify production", "Use authorised customer data only"]
  },
  "context_refs": ["conversation-42", "account-91", "incident-17"],
  "available_agents": [],
  "available_tools": [],
  "policy_context": {
    "risk_tolerance": "low",
    "human_approval_required_for": ["customer_send", "production_change"]
  },
  "budget": {
    "currency": "EUR",
    "maximum": 25
  }
}
```

Orqaly must build the agent, tool, tenant, and policy fields from authenticated server-side state. AxWise must not trust browser-supplied authority claims.

## Target orchestration decision

AxWise should return a machine-readable, explainable recommendation:

```json
{
  "decision_id": "decision-456",
  "task_class": "customer_operations",
  "execution_mode": "supervised_multi_agent",
  "routing_mode": "evidence_assisted",
  "stakeholders": ["customer_owner", "support_lead", "engineering_owner"],
  "required_capabilities": ["incident_analysis", "customer_communication", "remediation_planning"],
  "recommended_agents": [],
  "execution_plan": [],
  "context_packages": [],
  "guardrails": [],
  "approval_points": [],
  "fallbacks": [],
  "confidence": 0.86,
  "assignment_factors": [],
  "evidence": [],
  "requires_orqaly_authorization": true
}
```

Every recommendation must explain the factors that materially affected the ranking. Evidence provenance must be distinguished from factual truth: source anchoring proves where a claim came from, not that the claim is representative or correct.

## Routing modes

AxWise should choose the least expensive mode that can produce a reliable assignment:

1. **Direct assignment** — requirements and the appropriate specialist are clear.
2. **Evidence-assisted assignment** — existing workspace knowledge is sufficient to improve the decision.
3. **Research-assisted assignment** — stakeholder or market uncertainty justifies Pipeline A, Pipeline B, or A+B.
4. **Sequential workflow** — specialised stages depend on earlier outputs.
5. **Parallel team** — independent workstreams can run concurrently before synthesis.
6. **Supervisor workflow** — a coordinating agent delegates, evaluates, and requests revisions.
7. **Human-controlled workflow** — consequential actions require explicit human authorization.
8. **Recovery and replanning** — failed or low-quality execution triggers reassignment, plan revision, or escalation.

Pipeline A+B must be invoked selectively. It is appropriate when stakeholder understanding materially changes agent selection or execution context. It is unnecessary for deterministic tasks with clear requirements and an obvious authorised executor.

## End-to-end learning loop

1. Orqaly supplies verified task, tenant, agent, tool, policy, budget, and context information.
2. AxWise classifies the task, stakeholders, uncertainty, risk, and required capabilities.
3. AxWise selects the routing and execution pattern.
4. AxWise optionally invokes grounding or research to reduce material uncertainty.
5. AxWise ranks an agent or proposes a multi-agent team and execution graph.
6. AxWise returns the decision, evidence, confidence, guardrails, approvals, and fallbacks.
7. Orqaly revalidates authority and executes the approved plan.
8. Orqaly returns outcome, cost, latency, failures, corrections, approvals, and quality signals.
9. AxWise evaluates prediction versus outcome and improves future assignment models.

Without step 8 and step 9, AxWise is a static recommendation engine rather than a learning orchestration system.

## Current implementation versus target

The repository-specific delivery phases, proposed modules, persistence changes, API surface, verification baseline, and acceptance gates are maintained in `AXWISE_ORCHESTRATION_DEVELOPMENT_ROADMAP.md`. Issue-ready work is maintained in `AXWISE_ORCHESTRATION_TECHNICAL_BACKLOG.md`.

| Capability | Current repository | Target |
|---|---|---|
| Pipeline A evidence analysis | Implemented. | Remain a reusable evidence service. |
| Pipeline B simulation | Implemented with an initial OCEAN sampler. | Expand, validate, and invoke only when useful. |
| A+B hybrid | Implemented as a durable research workflow. | One optional routing mode within general orchestration. |
| Customer and execution persona resolution | Implemented prototype. | One input to agent/team assignment. |
| Candidate-agent ranking | Token overlap plus availability and performance signals. | Calibrated capability, outcome, risk, cost, and policy-aware ranking. |
| Conditions gateway | Implemented advisory heuristics. | Policy-aware, history-sensitive decision support with measured quality. |
| Generic operational task contract | Not implemented. | One stable contract across domains. |
| Multi-agent planning and dependency graph | Not implemented. | Typed execution graph with owners, dependencies, reviews, and fallbacks. |
| Outcome-learning loop | Not implemented. | Versioned feedback, evaluation, and ranking improvement. |
| Final authorization and execution | Correctly left to Orqaly. | Continue to remain in Orqaly. |

## Acceptance criteria for domain neutrality

The orchestration product is not domain-neutral until all of the following are true:

- One versioned task contract handles at least software, research, sales, marketing, support, finance, compliance, HR, and general operations examples.
- No required top-level field assumes software development, customer research, or a specific industry.
- The router can select a non-research fast path and does not invoke A+B by default.
- The same response schema represents direct, sequential, parallel, supervised, and human-controlled execution.
- Agent and tool authority comes from Orqaly's authenticated server state.
- Assignment explanations identify capabilities, performance, risk, cost, policy, and evidence factors.
- Every consequential recommendation includes an approval or escalation policy.
- Golden tests cover the same intent across different domains and different intents inside the same domain.
- End-to-end tests prove accept, decide, authorize, execute, report outcome, retry, cancel, and replan behavior.
- Outcome data can change a later assignment in a controlled, versioned, and auditable way.

## The bar for 10/10 strategic concept and differentiation

A 10/10 position requires demonstrated advantages, not a longer feature list.

### Directional assessment

These scores are a strategic assessment of the repository and product direction, not external market validation:

| Dimension | Current assessment | Why it is not yet 10/10 |
|---|---:|---|
| Strategic concept | **8/10** | The AxWise decision-plane and Orqaly execution-plane boundary is strong and works across domains, but the category and generic contract still need market proof. |
| Differentiation potential | **9/10** | Dual-context, evidence-aware assignment plus outcome learning can be meaningfully different from prompt routers and workflow engines. The combination is not yet fully implemented or benchmarked. |
| Demonstrated product differentiation | **4/10** | The repository proves valuable research, evidence, durable job, and initial ranking foundations, but generic routing, team planning, recovery, and outcome learning are still targets. |

The single most important strategic choice is to own **assignment intelligence**, not generic workflow execution. AxWise should become the system that understands both the recipient of the outcome and the available executors, then selects and explains the best agent, team, context, controls, and recovery plan. Orqaly should remain the system that runs that plan. This creates a sharper category and a more defensible data loop than competing as another visual workflow builder or general agent framework.

The shortest credible path from potential to proof is to demonstrate the same contract in three deliberately different workflows—for example, a software incident, a customer escalation, and a compliance review—and beat manual, round-robin, capability-only, and general LLM routing on quality, rework, time, cost, and escalation rate.

### 1. Evidence-aware orchestration

Assignments combine task semantics, stakeholder impact, authorised workspace evidence, policy, cost, risk, and measured agent performance. Competitors can route by prompt or capability; AxWise should explain why a particular agent or team is appropriate for this task and these stakeholders.

**Proof:** assignment explanations are source-linked, decision factors are inspectable, and customers can reproduce the decision from the same inputs and model version.

### 2. Dual-context assignment

AxWise models both the recipient of the outcome and the executor of the work. The customer/stakeholder persona influences required communication, quality, evidence, and risk, while the execution persona defines capabilities, tools, collaboration style, and authority.

**Proof:** controlled evaluations show that dual-context assignment improves task success, reduces rework, or improves stakeholder acceptance compared with capability-only routing.

### 3. Real multi-agent planning

AxWise proposes teams, roles, dependencies, parallel branches, reviewers, approval gates, fallbacks, and recovery paths—not only one recommended agent.

**Proof:** plans execute successfully across multiple domains and recover from unavailable agents, failed tools, rejected outputs, and budget changes.

### 4. Outcome-learning assignment model

Ranking improves from execution outcomes rather than static prompt engineering. Learning remains tenant-safe, explainable, reversible, and protected against popularity bias and metric gaming.

**Proof:** offline and online evaluations show calibrated improvement over a deterministic baseline without degrading safety or minority task classes.

### 5. Trustworthy policy boundary

AxWise recommends; Orqaly authorizes and executes. Both sides preserve tenant isolation, decision versions, policy inputs, approval records, execution receipts, and human overrides.

**Proof:** independent security testing, reliable audit reconstruction, key rotation, replay protection, least-privilege tool scopes, and tested failure policies.

### 6. Measurable economic value

The product must prove better outcomes than round-robin routing, manual assignment, or a general LLM router.

**Proof:** paid pilots show material improvement in completion quality, assignment accuracy, time-to-completion, cost, rework, escalation rate, or SLA performance.

### 7. Domain-neutral developer experience

Developers integrate one contract, one decision model, and one evaluation framework. Domain packages add capability vocabulary and policies without forking the engine.

**Proof:** a new domain can be integrated using configuration, evaluators, and adapters rather than changes to the orchestration core.

### 8. Scientifically credible persona and uncertainty models

OCEAN, occupation, age, and behavioral models need versioned sources, limitations, validation, bias analysis, and confidence calibration. Synthetic research must be clearly labelled as hypothesis generation.

**Proof:** published methodology, reproducible datasets or licensed source lineage, benchmark results, and explicit uncertainty reporting.

### 9. Open ecosystem with a defensible moat

The open-source engine should make adoption easy while hosted and enterprise value comes from governance, managed evaluation, connectors, observability, policy packs, outcome intelligence, and proprietary or customer-specific performance data.

**Proof:** external adapters and evaluators exist, while production customers pay for capabilities that are difficult to reproduce by merely hosting the repository.

### 10. Category clarity

The product must own a clear category: **evidence-aware cognitive orchestration and assignment for agentic work**.

**Proof:** users describe AxWise as the system that improves who or what executes a task—not merely as a persona generator, research tool, prompt router, or workflow engine.

## Recommended delivery sequence

1. Publish a versioned generic task and orchestration-decision schema.
2. Implement a fast single-agent decision path that does not require research.
3. Convert A+B into an optional uncertainty-reduction tool selected by the router.
4. Add team construction, dependency planning, approvals, and recovery.
5. Connect Orqaly execution outcomes back to a versioned evaluation store.
6. Benchmark against manual, round-robin, capability-only, and general LLM routing.
7. Prove value in three deliberately different domains before claiming domain neutrality.
8. Open the adapter and evaluator ecosystem while keeping enterprise governance and managed intelligence commercially defensible.

## Strategic anti-goals

To preserve differentiation:

- Do not rebuild Orqaly's workflow runtime, permissions, integrations, or delivery layer inside AxWise.
- Do not force every task through personas, simulations, or A+B research.
- Do not lead the category with “digital twins”; treat them as an optional evidence and uncertainty tool.
- Do not claim scientific authority for synthetic personas without sources, validation, calibration, limitations, and bias analysis.
- Do not hard-code the orchestration core around software development or any single vertical.
- Do not optimise only for agent selection accuracy; optimise for completed-task quality, cost, time, safety, stakeholder acceptance, and recovery.

## Canonical positioning

> **AxWise is the evidence-aware cognitive orchestration and assignment engine for agentic work. Orqaly is the operating system that authorizes and executes the plan.**

Short form: **AxWise decides. Orqaly executes.**
