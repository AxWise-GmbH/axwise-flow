---
type: Product Integration Overview
title: "Orqaly and AxWise Integration One Pager"
description: "A non-secret overview of AxWise cognitive orchestration and assignment, the current research-assisted integration, and the production readiness requirements."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/ORQALY_AXWISE_INTEGRATION_ONE_PAGER.md
tags: [orqaly, axwise, integration, orchestration, assignment, research, conditions, personas, production]
timestamp: 2026-07-13T11:30:00Z
---

# Orqaly × AxWise integration

## The decision

Orqaly remains the product, workflow, tenancy, integrations, and user-facing execution layer. AxWise is the cognitive orchestration and assignment layer: it determines who should perform a task, why that agent or team is appropriate, and which context, evidence, guardrails, approvals, and fallbacks should accompany the recommendation.

The long-term scope is domain-neutral LLM-driven work, including software engineering, research, sales, marketing, support, finance, compliance, HR, procurement, and general operations. Pipeline A+B is an optional research-assisted decision mode, not the definition of the whole product and not a mandatory step for every task.

The current production-facing integration remains intentionally narrow while the generic orchestration contract is built. Use the implemented A+B workflow for high-value research and dual-persona resolution, and use Conditions only as advisory decision support. Do not treat demonstration twin routes as production orchestration.

## What Orqaly should use

| Capability | What it does | Best use cases | Integration style |
|---|---|---|---|
| **Cognitive orchestration and assignment** | Classifies an operational task, identifies stakeholders and required capabilities, selects an execution pattern, and recommends an agent, team, workflow, or human escalation with evidence and guardrails. | Any LLM-driven development, research, commercial, administrative, or operational task. | **Strategic target.** A versioned generic task/decision API and multi-agent planner are not yet published. |
| **Async A+B dual-persona research** | Simulates stakeholder interviews (Pipeline B), produces evidence-audited customer personas (Pipeline A), and resolves the ideal and best available Orqaly agent persona for the task. | Identifying who the task is for, what evidence-backed needs should guide it, and which authorised Orqaly agent should execute it. | Start a durable job with task context and a server-derived agent catalogue, then poll its status/result and optionally receive a signed terminal webhook. |
| **Conditions gateway** | Supplies fast rule-based/advisory tone, security, governance, classification, and grounding checks. | Shadow-mode pre-flight checks for selected Orqaly agent or copilot decision points. | One server-to-server request at a defined workflow point; do not call it on every chat by default. |

The differentiated long-term value is evidence-aware orchestration: matching a task and its affected stakeholders to the right authorised execution resources. A+B is the current high-value uncertainty-reduction and dual-persona workflow. Conditions is a supporting control layer and should remain shadow-only until it demonstrably improves Orqaly's existing guardrails and uses prior conversation context correctly.

The repository contains the A+B API, database migration, durable lifecycle, dedicated worker, tenant mapping, idempotency, persona resolution, and signed webhook implementation. Local verification has completed a mapped-tenant dual-persona run with exact evidence-offset checks. Deployment readiness must be established from the current production schema, worker, tenant mapping, secret, and callback state rather than inferred from repository documentation. Orqaly remains responsible for final agent authorisation.

## General orchestration flow

1. Orqaly supplies a verified operational task, tenant, policy, budget, context references, available agents, and available tools.
2. AxWise classifies the objective, domain, stakeholders, uncertainty, risk, and required capabilities.
3. AxWise selects the least expensive reliable routing mode: direct, evidence-assisted, research-assisted, sequential, parallel, supervised, human-controlled, or recovery.
4. AxWise invokes grounding or A+B only when it would materially reduce uncertainty.
5. AxWise recommends an agent or team, execution graph, context packages, guardrails, approval points, fallbacks, confidence, and assignment factors.
6. Orqaly rechecks ownership, availability, RBAC, budget, and tool scope, then executes the approved plan.
7. Orqaly returns outcomes, costs, failures, corrections, and human feedback so AxWise can evaluate and improve future assignments.

The current API implements only part of this flow. The canonical target contract and acceptance criteria are defined in `AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md`.

## Domain examples

| Domain | Example AxWise decision | Orqaly responsibility |
|---|---|---|
| Software engineering | Construct an implementation, test, security, and review team. | Run repository and delivery workflows. |
| Customer research | Select A+B, derive stakeholder evidence, and recommend a research or product agent. | Store, present, and act on the result. |
| Sales and marketing | Match account context and audience needs to research, copy, design, and compliance specialists. | Access CRM systems, create assets, and deliver approved communications. |
| Support and customer success | Classify urgency and risk, then assign the appropriate specialist and approval path. | Operate the ticket, CRM, communication, and escalation workflow. |
| Finance, legal, and compliance | Select restricted specialists, evidence requirements, and mandatory human gates. | Enforce data access and execute approved actions. |
| General operations | Build a team and remediation plan for an SLA breach or process failure. | Access operational systems, manage state, retry, notify, and close the work. |

## A+B research flow

1. An Orqaly workflow supplies the task, target audience, research questions, verified tenant identity, and a server-derived catalogue of available agents.
2. AxWise creates a durable, idempotent A+B research job.
3. Pipeline B generates psychologically varied stakeholder perspectives and interviews.
4. Pipeline A extracts evidence-linked persona patterns, themes, risks, opportunities, and recommendations from those interview artifacts.
5. AxWise resolves the primary customer persona, ideal execution persona, and ranked match against the supplied Orqaly agents.
6. AxWise persists the final result before it declares completion.
7. Orqaly polls for the result, rechecks agent availability and authorisation, then assigns the selected agent and passes the customer persona into task execution context.

The output is designed for structured hypothesis exploration and decision support. It does not replace primary research with real customers; Orqaly should label and use it accordingly.

## What the result contains

- Empirical persona patterns built from the simulation interview corpus.
- Evidence quotes with exact source offsets, so a quote can be traced back to the source interview text.
- Interview themes, stakeholder priorities, risks, opportunities, and recommendations.
- A durable AxWise analysis record and, when requested, a linked PRD deliverable.
- Job stage, progress, warnings, and failure state for reliable Orqaly user experience.
- A `persona_resolution` object containing the evidence-backed customer persona, ideal agent persona, ranked candidate agents, and a recommended Orqaly agent ID. AxWise never silently auto-assigns the agent.

## Clear ownership boundary

| Orqaly owns | AxWise owns |
|---|---|
| Authentication UX, organizations, users, billing, workflows, agent execution, external SaaS calls, storage, UI, notifications, approvals, and final user experience. | Task understanding, stakeholder and capability analysis, routing recommendations, proposed agent/team assignment, execution-plan recommendations, research simulation, evidence linking, persona formation, cognitive conditions, and decision auditability. |

Do not send browser traffic, raw user secrets, payment actions, file rendering, email delivery, or arbitrary infrastructure tasks to AxWise. Make requests from the Orqaly backend only.

## What is not part of this production integration

- Do not use `/twins/*` as the production research interface. Those routes are demonstration/legacy surfaces, not the tenant-scoped A+B contract.
- Do not use the legacy `/simulate-async` route when evidence-audited A+B output is required; it is Pipeline B only.
- Do not rely only on a webhook. Polling is the source of truth and makes missed or retried webhooks safe.

## Production endpoint

```text
POST https://api.axwise.de/api/orqaly-axwise/v1/simulate-enhanced-async
```

The call requires server-side M2M authentication, an idempotency key, a tenant object, a simulation configuration, and an optional HTTPS callback on `api.orqaly.com`. Status, result, and cancellation routes are returned with the accepted job. Exact headers, payloads, webhook verification, and live credentials are in the separate private production handoff.

## Readiness and launch gate

Repository implementation does not by itself prove deployment readiness. Before Orqaly enables real long-running A+B research—or later enables generic orchestration—for a tenant, all of the following must be true:

1. Orqaly has installed the private M2M and webhook secrets in its production secret store.
2. AxWise has applied and verified the durable A+B database migration.
3. AxWise has an active mapping from the real Orqaly organization and user IDs to the intended AxWise workspace owner.
4. The managed AxWise A+B worker is running and claims queued durable jobs.
5. Orqaly's HTTPS webhook endpoint is live and verifies signed terminal events.
6. The team has completed one tenant-scoped smoke run: accept → poll → complete → retrieve evidence → validate webhook deduplication.

## Who should receive which document

| Audience | Share |
|---|---|
| AxWise and Orqaly product and architecture stakeholders | This one-pager plus `AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md`. |
| Orqaly delivery stakeholders | This one-pager. |
| AxWise and Orqaly engineering leads | This one-pager plus `AXWISE_ORCHESTRATION_DEVELOPMENT_ROADMAP.md` and `AXWISE_ORCHESTRATION_TECHNICAL_BACKLOG.md`. |
| Orqaly backend owner / DevOps owner | This one-pager, `ORQALY_INTEGRATION_SCHEMA.md`, and the private production handoff containing the credentials and deployment checklist. |
| External or broad audiences | This one-pager only, after removing any internal launch-gate detail that is not relevant. |

Use `AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md` as the canonical product and architecture doctrine. Use `ORQALY_INTEGRATION_SCHEMA.md` as the non-secret current implementation contract. The detailed async integration plan remains an AxWise internal engineering/status document, not the partner-facing handoff.
