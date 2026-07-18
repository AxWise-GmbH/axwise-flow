---
type: Product Integration Overview
title: "Orqaly and AxWise Integration One Pager"
description: "A non-secret overview of AxWise cognitive orchestration and assignment, the current research-assisted integration, and the production readiness requirements."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/ORQALY_AXWISE_INTEGRATION_ONE_PAGER.md
tags: [orqaly, axwise, integration, orchestration, assignment, research, conditions, personas, production]
timestamp: 2026-07-16T20:00:00Z
---

# Orqaly × AxWise integration

## The decision

Orqaly remains the product, workflow, tenancy, integrations, and user-facing execution layer. AxWise is the cognitive orchestration and assignment layer: it determines who should perform a task, why that agent or team is appropriate, and which context, evidence, guardrails, approvals, and fallbacks should accompany the recommendation.

The long-term scope is domain-neutral LLM-driven work, including software engineering, research, sales, marketing, support, finance, compliance, HR, procurement, and general operations. Pipeline A+B is an optional research-assisted decision mode, not the definition of the whole product and not a mandatory step for every task.

The generic Phase 1–4 orchestration contract is now implemented in the `axwise-flow-oss` repository. It supports domain-neutral assignment, conditional evidence/research routing, multi-agent planning, immutable recovery, execution outcomes, and human-governed scorer versions. This is repository capability, not proof that the routes are deployed or verified in a target environment. Use A+B only when the AxWise router selects valuable bounded research or research is itself the deliverable.

## What Orqaly should use

| Capability | What it does | Best use cases | Integration style |
|---|---|---|---|
| **Cognitive orchestration and assignment** | Classifies an operational task, applies hard eligibility, ranks candidates, chooses an evidence path, and recommends an agent, team, workflow, or human escalation with explanations and guardrails. | Any LLM-driven development, research, commercial, administrative, or operational task. | **Implemented repository contract.** Create and retrieve immutable decisions through the versioned orchestration API; verify target deployment before use. |
| **Evidence and bounded research routing** | Chooses direct, evidence-assisted, research-assisted, or human-clarification routing from deterministic uncertainty and value-of-information signals. | Tasks where stakeholder uncertainty or evidence quality could materially change the assignment. | **Implemented in Phase 2.** Research-assisted decisions remain non-executable until terminal research is refreshed into a linked decision. |
| **Multi-agent planning and recovery** | Builds and validates single, sequential, parallel, supervisor, or human-controlled plans, then replans immutably when execution state changes. | Work requiring capability-specialized teams, dependencies, reviewers, approvals, separation of duties, or recovery. | **Implemented in Phase 3.** Orqaly must validate live feasibility, authorize, execute, and report state changes. |
| **Outcomes and safe learning** | Stores decision/node receipts, evaluates success/quality/cost/latency/rework/escalation/acceptance, and gates tenant-scoped scorer promotion and rollback. | Proving which assignments work and improving later ranking without uncontrolled online learning. | **Implemented in Phase 4.** Orqaly reports execution; human-reviewed offline evidence is mandatory before promotion. |
| **Async A+B dual-persona research** | Simulates stakeholder interviews (Pipeline B), produces evidence-audited customer personas (Pipeline A), and resolves the ideal and best available Orqaly agent persona for the task. | Identifying who the task is for, what evidence-backed needs should guide it, and which authorised Orqaly agent should execute it. | Start a durable job with task context and a server-derived agent catalogue, then poll its status/result and optionally receive a signed terminal webhook. |
| **Conditions gateway** | Supplies fast rule-based/advisory tone, security, governance, classification, and grounding checks. | Shadow-mode pre-flight checks for selected Orqaly agent or copilot decision points. | One server-to-server request at a defined workflow point; do not call it on every chat by default. |

The differentiated value is evidence-aware orchestration: matching a task and its affected stakeholders to the right authorised execution resources, explaining the assignment, constructing a feasible team plan, and producing a safe recovery path when execution state changes. A+B is the high-value uncertainty-reduction and dual-persona workflow. Conditions is a supporting control layer and should remain shadow-only until it demonstrably improves Orqaly's existing guardrails and uses prior conversation context correctly.

The repository contains the Phase 1–4 decision/outcome APIs and schemas, immutable persistence, deterministic scoring and uncertainty routing, conditional research refresh, linked context-to-plan decisions, multi-agent planning, replanning, governed scorer versions, and the A+B lifecycle. Deployment readiness must still be established in the target environment. Orqaly remains responsible for final agent and plan authorisation.

## General orchestration flow

1. Orqaly supplies a verified operational task, tenant, policy, budget, context references, point-in-time agent and tool catalogues, and optional planning controls.
2. AxWise classifies the objective, domain, stakeholders, uncertainty, risk, and required capabilities.
3. AxWise selects the least expensive reliable routing mode: direct, evidence-assisted, research-assisted, sequential, parallel, supervised, human-controlled, or recovery.
4. AxWise invokes grounding or A+B only when it would materially reduce uncertainty.
5. AxWise persists and returns an immutable decision containing the agent or team recommendation, execution graph, context packages, guardrails, approval points, failure paths, fallbacks, confidence, and assignment factors.
6. Orqaly rechecks ownership, availability, RBAC, budget, and tool scope, then executes the approved plan.
7. When state changes, Orqaly requests an immutable replan and adopts the child plan only after renewed live-state authorization.
8. Orqaly returns durable execution receipts, outcomes, costs, failures, corrections, and human feedback for versioned evaluation and safe learning.

Phases 1–4 implement this audited loop. AxWise still does not execute or monitor Orqaly workflows, and measured market superiority still requires production-like replay and pilots. The canonical product doctrine and remaining acceptance criteria are defined in `AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md`.

## Phase 1–4 in one view

| Phase | Idea | Main output | Orqaly action |
|---|---|---|---|
| **Phase 1** | Choose the best eligible resource for a domain-neutral task. | Immutable direct or human-controlled decision with rankings, exclusions, factors, guardrails, and authorization requirement. | Revalidate the catalogue and authorize or escalate. |
| **Phase 2** | Spend on evidence only when it is expected to improve the decision. | Direct, evidence-assisted, research-assisted, or clarification decision; terminal research creates a linked immutable rescore. | Poll research where required, refresh the decision, then authorize only the child result. |
| **Phase 3** | Compose capability-specialized teams and recover safely from changed execution state. | Validated typed plan, feasibility handoff, approval gates, failure paths, and linked recovery replan. | Validate live feasibility, execute the approved plan, and trigger replan when state changes. |
| **Phase 3.1** | Decide whether customer research is actually needed before planning. | Direct/declared context, existing-evidence context, bounded A+B job, or human clarification; final plan links to this context decision. | Never start A+B first; branch on AxWise routing mode. |
| **Phase 4** | Learn safely from what happened. | Immutable outcome/node receipts, normalized evaluation, learned-feature provenance, and governed scorer version. | Report execution best-effort; promote only with human-reviewed passing evidence; retain rollback. |

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
2. AxWise creates a durable, idempotent A+B research job only after `research_assisted` is selected, or when standalone research is explicitly requested.
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

## Production API surface

```text
POST https://api.axwise.de/api/orqaly-axwise/v1/orchestration/decisions
```

This is the preferred entry point for new orchestration use cases. Decision retrieval, research refresh, replan, schema, Conditions, and standalone A+B routes share the same base URL. Every call requires server-side M2M authentication; create, refresh, and replan operations also require stable idempotency keys. Exact headers and non-secret payloads are in `ORQALY_INTEGRATION_SCHEMA.md`; live credentials and deployment checks are in the separate private production handoff.

## Readiness and launch gate

Repository implementation does not by itself prove deployment readiness. Before Orqaly enables generic orchestration or real long-running A+B research for a tenant, all of the following must be true:

1. Orqaly has installed the private M2M and webhook secrets in its production secret store.
2. AxWise has applied and verified the current orchestration and durable A+B database migrations.
3. AxWise has an active mapping from the real Orqaly organization and user IDs to the intended AxWise workspace owner.
4. The Phase 1–3 schema, create, retrieve, refresh, and replan routes pass authenticated target-environment checks before their corresponding features are enabled.
5. The managed AxWise A+B worker is running and claims queued durable jobs whenever research is enabled.
6. Orqaly's live-state feasibility adapter and approval enforcement are connected before a Phase 3 plan can influence execution.
7. Orqaly's HTTPS webhook endpoint is live and verifies signed terminal events when callbacks are used.
8. The team has completed tenant-scoped smoke paths for direct decision, bounded research refresh, multi-agent planning, recovery replan, and standalone A+B where each is enabled.

## Who should receive which document

| Audience | Share |
|---|---|
| AxWise and Orqaly product and architecture stakeholders | This one-pager plus `AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md`. |
| Orqaly delivery stakeholders | This one-pager. |
| AxWise and Orqaly engineering leads | This one-pager plus `AXWISE_ORCHESTRATION_DEVELOPMENT_ROADMAP.md` and `AXWISE_ORCHESTRATION_TECHNICAL_BACKLOG.md`. |
| Orqaly backend owner / DevOps owner | This one-pager, `ORQALY_INTEGRATION_SCHEMA.md`, and the private production handoff containing the credentials and deployment checklist. |
| External or broad audiences | This one-pager only, after removing any internal launch-gate detail that is not relevant. |

Use `AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md` as the canonical product and architecture doctrine. Use `ORQALY_INTEGRATION_SCHEMA.md` as the non-secret current implementation contract. The detailed async integration plan remains an AxWise internal engineering/status document, not the partner-facing handoff.
