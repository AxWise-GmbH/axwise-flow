---
type: Technical Documentation
title: "Orqaly and AxWise Current API Contract"
description: "The current non-secret API contract for AxWise Phase 1–3 decisions, evidence routing, team planning, recovery, conditions, and asynchronous A plus B research."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/ORQALY_INTEGRATION_SCHEMA.md
tags: [orqaly, axwise, api, contract, orchestration, assignment, planning, recovery, conditions, research, async]
timestamp: 2026-07-16T20:00:00Z
---

# Orqaly × AxWise current API contract

This is the shareable technical contract for the currently implemented integration surface; it does not contain credentials. The separate private production handoff contains the M2M secret, webhook secret, and deployment checklist.

AxWise provides domain-neutral cognitive orchestration and assignment for LLM-driven operational work, while Orqaly authorizes and executes the recommendation. Phases 1–3 publish the generic task contract, deterministic ranking and uncertainty routing, bounded evidence acquisition, validated multi-agent team plans, structured feasibility handoff, and immutable recovery replanning. Execution receipts, outcome learning, and production deployment hardening remain target capabilities defined in `AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md` and sequenced in `AXWISE_ORCHESTRATION_DEVELOPMENT_ROADMAP.md`.

Use this file as the source of truth for route and payload compatibility. Use `ORQALY_DEV_INTEGRATION_GUIDE.md` for Orqaly client behavior, `AXWISE_INTEGRATION_PLAN.md` for rollout and verification, `ORQALY_AXWISE_INTEGRATION_ONE_PAGER.md` for product positioning, and `ORQALY_INFRASTRUCTURE_ROUTING.md` for deciding whether a task belongs in AxWise or Orqaly. None of those companion documents overrides this contract.

## Base URL and authentication

```text
https://api.axwise.de/api/orqaly-axwise/v1
```

Every call originates from the Orqaly backend and includes:

```http
x-axwise-key: <M2M secret from the private production handoff>
```

The integration does **not** use a browser token, a per-user bearer token, or the legacy fallback key described in older documents.

## Published capabilities and readiness

| Capability | Route | Purpose | Current status |
|---|---|---|---|
| Phase 1–3 orchestration decision | `POST /orchestration/decisions` | Accepts a domain-neutral task, evaluates uncertainty/evidence value, and optionally constructs a validated single or multi-agent plan. | Implemented in the repository; requires the current migration, tenant mapping, M2M key, target-environment verification, and an active worker only when research can be selected. |
| Decision retrieval | `GET /orchestration/decisions/{decision_id}` | Retrieves the exact immutable input snapshot and decision for the mapped tenant. | Implemented with tenant-scoped lookup; verify deployment before use. |
| Research refresh and rescore | `POST /orchestration/decisions/{decision_id}/research/refresh` | Returns the pending decision or creates a linked immutable decision after terminal research. | Implemented with exact organization/user isolation and durable refresh idempotency. |
| Recovery replan | `POST /orchestration/decisions/{decision_id}/replan` | Creates a linked immutable plan after agent, tool, output, budget, or human-override changes. | Implemented with structured feasibility rejection, exact-user isolation, and durable idempotency. |
| Decision-request schema | `GET /orchestration/schemas/decision-request-v1` | Publishes the authenticated backward-compatible v1 JSON Schema, including Phase 2 evidence/research and Phase 3 planning controls. | Implemented in the repository. |
| Conditions gateway | `POST /conditions/evaluate` | A synchronous decision/grounding call at a defined Orqaly workflow point. | Implemented; verify deployment and authentication before use. Advisory/shadow use only while chat history remains unused. |
| Durable A+B research | `POST /simulate-enhanced-async` | Queues evidence-audited research with idempotency, status, results, cancellation, and optional terminal webhook. | Implemented in the repository; production readiness requires current schema, worker, tenant, secret, and callback verification. |
| Run status | `GET /runs/{job_id}/status` | Retrieves durable job stage and progress. | Implemented; verify deployment before use. |
| Completed result | `GET /runs/{job_id}` | Retrieves the persisted research output after completion. | Implemented; verify deployment before use. |
| Cancellation | `POST /runs/{job_id}/cancel` | Cancels a queued or running tenant-owned job. | Implemented with terminal-state conflict behaviour; verify deployment before use. |

## 1. Phase 1–3 orchestration decision

Create a recommendation with:

```http
POST /orchestration/decisions
Idempotency-Key: <non-empty value stable for retries>
X-Request-ID: <recommended Orqaly trace ID>
x-axwise-key: <M2M secret>
```

The strict body contains:

- `tenant.userId` and `tenant.orgId`, resolved through an active persisted tenant mapping;
- a versioned task envelope with the objective, desired outcome, domain, capabilities, tools, actions, constraints, context references, data classification, risk, urgency, and reversibility;
- Orqaly's current agent and tool catalogues for that organization;
- policy, approval, and budget context.
- optional reference-only evidence metadata, research thresholds, and a bounded research brief.
- optional typed planning steps, dependencies, contracts, review rules, collaboration constraints, separation of duties, and plan budgets.

The response returns the immutable input snapshot and hash, uncertainty and value-of-information signals, ranked candidates, hard exclusions, factor contributions, a routing mode, a typed execution plan, provenance, context, guardrails, approval points, node-level failure paths, a plan-feasibility request/result, and fallbacks. Every response has `requires_orqaly_authorization: true`.

An identical retry returns the original decision with `200 OK` and `reused: true`. Changed input under the same organization and idempotency key returns `409 Conflict`.

Retrieve a decision with:

```http
GET /orchestration/decisions/{decision_id}
X-Orqaly-Org-ID: <same tenant orgId>
X-Orqaly-User-ID: <same tenant userId>
x-axwise-key: <M2M secret>
```

A tenant mismatch returns `404` without revealing the record. Full field definitions, hard eligibility rules, scorer weights, five-domain examples, and non-goals are documented in `AXWISE_ORCHESTRATION_PHASE_1.md`.

When the created decision has `routing_mode: research_assisted`, it is deliberately non-executable: status is `pending_research`, confidence is `0`, and the response contains the durable A+B `research_job.job_id`. Refresh it with:

```http
POST /orchestration/decisions/{decision_id}/research/refresh
Idempotency-Key: <new stable key for this refresh result>
X-Orqaly-Org-ID: <same tenant orgId>
X-Orqaly-User-ID: <same tenant userId>
x-axwise-key: <M2M secret>
```

The refresh returns `202` while the job is pending, `201` with a new linked immutable decision after a terminal result, or `200` for an identical completed retry. Failed, cancelled, timed-out, empty, contradictory, or low-quality research cannot silently become a confident assignment. The full routing, budget, provenance, refresh, and failure contract is documented in `AXWISE_ORCHESTRATION_PHASE_2.md`.

When current execution state changes, request an immutable replan with:

```http
POST /orchestration/decisions/{decision_id}/replan
Idempotency-Key: <new stable key for this replan>
X-Orqaly-Org-ID: <same tenant orgId>
X-Orqaly-User-ID: <same tenant userId>
x-axwise-key: <M2M secret>
```

The strict body names one trigger—`agent_unavailable`, `tool_failure`, `output_rejected`, `budget_changed`, or `human_override`—and its corresponding changed state. A feasible replan returns a linked `recovery` decision. An infeasible replan returns a durable human-controlled child with `executable: false` and structured rejection reasons. Orqaly must validate the emitted `plan_feasibility_request` against live authority and may return the same typed rejection contract through the configured adapter. Full templates, graph validation, failure paths, approval rules, and limitations are documented in `AXWISE_ORCHESTRATION_PHASE_3.md`.

## 2. Conditions gateway

Use the conditions gateway for an Orqaly agent or workflow decision, not for arbitrary general chat.

```json
{
  "integrationPoint": "copilot.chat",
  "requestId": "uuid-generated-by-orqaly",
  "tenant": {
    "orgId": "orqaly-organization-id",
    "userId": "orqaly-user-id"
  },
  "payload": {
    "message": "The relevant local workflow facts go here."
  },
  "hints": {
    "optional": "implementation context"
  }
}
```

Supported `integrationPoint` values:

| Value | Intended use |
|---|---|
| `consilium.create` | Governance defaults and decision thresholds. |
| `agent.generate` | Pre-generation security and tool-scope assessment. |
| `copilot.chat` | Classification, tone, and advisory policy context. |
| `copilot.ground` | Post-hoc claim grounding against supplied source material. |

The response contains `applicableConditions`, `processedOutputs`, and `meta` with a trace ID, latency, model label, cost, and degraded flag. Orqaly owns the final action. For `agent.generate`, treat a denial or degraded response as fail-closed; for other points, use Orqaly's documented fallback policy.

For `copilot.chat`, the current implementation evaluates the latest `message`, server role, and active twin identifier. It does not yet use prior conversation history. Orqaly may include bounded history for forward compatibility, but must keep the result in shadow mode until the history-sensitive integration test passes.

## 3. Durable asynchronous A+B research

Start research with:

```http
POST /simulate-enhanced-async
Idempotency-Key: <non-empty UUID, stable for retries>
X-Request-ID: <recommended Orqaly trace ID>
```

The body must include:

- `tenant.orgId` and `tenant.userId`;
- `config` with simulation depth, people per stakeholder, response style, insight switch, and temperature;
- a business context and/or questionnaire content;
- `outputs` with `empirical_personas: true`; set `persona_resolution: true` for the primary Orqaly dual-persona workflow;
- `task_context` describing the task, desired outcome, category, and constraints when persona resolution is requested;
- `agent_candidates`, built by the Orqaly backend from the authenticated user's active agent catalogue rather than accepted from an untrusted browser payload;
- an optional HTTPS `callback_url` on `api.orqaly.com`.

A `202 Accepted` means the request has been persisted as a durable job. It is not a completion signal. The response includes a stable `job_id`, `simulation_id`, request ID, and links to status, result, and cancellation routes.

Pipeline B produces stakeholder simulations and interviews. Pipeline A then derives evidence-linked persona patterns, exact source offsets, themes, risks, opportunities, and recommendations from those interview artifacts. AxWise only publishes completion after the resulting analysis is persisted.

For the primary Orqaly workflow, the completed result also contains `result.data.persona_resolution`:

```json
{
  "version": "orqaly_dual_persona_v1",
  "customer_persona": {
    "name": "Evidence-first Event Lead",
    "confidence": 0.85,
    "profile": {},
    "evidence": [
      {
        "quote": "Exact source quote",
        "speaker": "Simulated participant",
        "document_id": "sim_session_...",
        "start_char": 0,
        "end_char": 18
      }
    ]
  },
  "ideal_agent_persona": {
    "role": "Customer Research Strategist",
    "communication_style": "direct and structured",
    "required_capabilities": ["customer research", "evidence analysis"]
  },
  "recommended_agent": {
    "agent_id": "orqaly-agent-id",
    "score": 0.82,
    "matched_task_terms": ["research"],
    "matched_customer_terms": ["evidence"]
  },
  "ranked_agents": [],
  "selection_status": "matched_candidate",
  "auto_assign_allowed": false,
  "requires_orqaly_authorization": true
}
```

Orqaly must recheck that the recommended agent still exists, is available, belongs to the authenticated user or organisation, and is authorised for the task. It may then use the recommendation as a bounded assignment signal and pass both persona objects into the execution context.

## 4. Tenant isolation and idempotency

AxWise resolves the external `orgId` and `userId` through an active `orqaly_tenant_mappings` record. It does not trust free-form tenant information alone.

For status, result, and cancellation calls, send:

```http
X-Orqaly-Org-ID: <same tenant orgId>
X-Orqaly-User-ID: <same tenant userId>
```

The idempotency key is scoped to the partner and external organization. Retrying the same logical request returns the existing job. Reusing the same key for different input returns `409 Conflict`.

## 5. Polling and webhooks

Poll `GET /runs/{job_id}/status` until the run reaches `completed`, `completed_with_warnings`, `failed`, or `cancelled`. Polling is the source of truth.

If a callback URL is supplied, AxWise sends terminal webhooks to the allow-listed `api.orqaly.com` host. Verify:

- `X-AxWise-Event-ID` for durable deduplication;
- `X-AxWise-Timestamp` for replay protection;
- `X-AxWise-Signature: v1=<HMAC-SHA256>` over `timestamp + "." + raw request body`.

The webhook is retried up to three times. Orqaly should return a quick 2xx after durable deduplication and continue polling as recovery.

## 6. Expected error semantics

| Status | Meaning | Orqaly action |
|---|---|---|
| `401` | Missing or invalid M2M key. | Stop and alert; do not retry with the same request. |
| `403` | Tenant has no active AxWise workspace mapping. | Provision or correct the mapping. |
| `409` | Idempotency mismatch, job not complete, or terminal cancellation conflict. | Follow the documented job state. |
| `422` | Invalid request body or callback URL. | Correct the request; do not blind-retry. |
| `5xx` | Service or mapped workspace unavailable. | Retry with bounded backoff and preserve the idempotency key. |

## 7. Explicitly out of scope

The legacy `/twins/*` routes and legacy `/simulate-async` flow are not the production A+B research contract. Do not build a production dependency on them.

## 8. Historical production record and current verification

Project records state that on 2026-07-13 production was migrated to `20260712_orqaly_hybrid`, a dedicated managed worker was deployed, and a mapped-tenant A+B dual-persona run completed successfully. They also record successful evidence-range, idempotency-conflict, and unmapped-tenant checks. This historical record is not a current deployment guarantee and cannot be independently established from repository code.

Before enabling a real Orqaly organisation, verify the migration and worker in the target environment, create an active mapping for its exact `orgId` and `userId`, install the current M2M secret in Orqaly's server-side secret store, and complete a fresh tenant-scoped smoke test. Treat signed callbacks as optional until Orqaly's receiver has separately passed signature, replay, retry, and deduplication tests.
