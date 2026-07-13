---
type: Product Integration Overview
title: "Orqaly and AxWise Integration One Pager"
description: "A non-secret overview of the AxWise capabilities Orqaly should use, the resulting research workflow, and the current production readiness requirements."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/ORQALY_AXWISE_INTEGRATION_ONE_PAGER.md
tags: [orqaly, axwise, integration, research, conditions, personas, production]
timestamp: 2026-07-13T11:30:00Z
---

# Orqaly × AxWise integration

## The decision

Orqaly remains the product, workflow, tenancy, integrations, and user-facing execution layer. AxWise is the cognitive research and evidence layer. The production integration is intentionally narrow: use AxWise for high-value reasoning and evidence-backed research, not for general application infrastructure or legacy twin demonstrations.

## What Orqaly should use

| Capability | What it does | Best use cases | Integration style |
|---|---|---|---|
| **Async A+B dual-persona research** | Simulates stakeholder interviews (Pipeline B), produces evidence-audited customer personas (Pipeline A), and resolves the ideal and best available Orqaly agent persona for the task. | Identifying who the task is for, what evidence-backed needs should guide it, and which authorised Orqaly agent should execute it. | Start a durable job with task context and a server-derived agent catalogue, then poll its status/result and optionally receive a signed terminal webhook. |
| **Conditions gateway** | Supplies fast rule-based/advisory tone, security, governance, classification, and grounding checks. | Shadow-mode pre-flight checks for selected Orqaly agent or copilot decision points. | One server-to-server request at a defined workflow point; do not call it on every chat by default. |

The differentiated customer value is A+B research. Conditions is a supporting control layer and should remain shadow-only until it demonstrably improves Orqaly's existing guardrails and uses prior conversation context correctly.

As of 2026-07-13, the production A+B API, database migration, durable lifecycle, and dedicated worker are live. A complete mapped-tenant dual-persona run finished successfully on its first attempt and all returned evidence ranges matched their source interview text. Real Orqaly tenants still require explicit workspace mapping, and Orqaly remains responsible for final agent authorisation.

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
| Authentication UX, organizations, users, billing, workflows, agent execution, external SaaS calls, storage, UI, notifications, and final user experience. | Research simulation, evidence linking, persona formation, cognitive conditions, auditability, and research-result persistence. |

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

The live API and M2M authentication are deployed, but A+B is not yet production-ready. The 2026-07-13 audit confirmed that the production database migration is missing. Before Orqaly enables real long-running A+B research for a tenant, all of the following must be true:

1. Orqaly has installed the private M2M and webhook secrets in its production secret store.
2. AxWise has applied and verified the durable A+B database migration.
3. AxWise has an active mapping from the real Orqaly organization and user IDs to the intended AxWise workspace owner.
4. The managed AxWise A+B worker is running and claims queued durable jobs.
5. Orqaly's HTTPS webhook endpoint is live and verifies signed terminal events.
6. The team has completed one tenant-scoped smoke run: accept → poll → complete → retrieve evidence → validate webhook deduplication.

## Who should receive which document

| Audience | Share |
|---|---|
| Orqaly product, architecture, and delivery stakeholders | This one-pager. |
| Orqaly backend owner / DevOps owner | This one-pager plus the private production handoff containing the credentials and request contract. |
| External or broad audiences | This one-pager only, after removing any internal launch-gate detail that is not relevant. |

Use the rewritten `ORQALY_INTEGRATION_SCHEMA.md` as the non-secret implementation contract. The detailed async integration plan remains an AxWise internal engineering/status document, not the partner-facing handoff.
