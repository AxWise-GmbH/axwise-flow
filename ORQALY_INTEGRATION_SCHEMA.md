---
type: Technical Documentation
title: "Orqaly and AxWise Current API Contract"
description: "The current non-secret API contract for AxWise conditions and asynchronous A plus B research, with an explicit boundary to the target generic orchestration product."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/ORQALY_INTEGRATION_SCHEMA.md
tags: [orqaly, axwise, api, contract, orchestration, assignment, conditions, research, async]
timestamp: 2026-07-13T11:30:00Z
---

# Orqaly × AxWise current API contract

This is the shareable technical contract for the currently implemented integration surface; it does not contain credentials. The separate private production handoff contains the M2M secret, webhook secret, and deployment checklist.

The strategic product is broader than this API: AxWise is intended to provide domain-neutral cognitive orchestration and assignment for LLM-driven operational work, while Orqaly authorizes and executes the recommended plan. The generic task contract, routing modes, multi-agent plan, and outcome-learning requirements are defined in `AXWISE_ORQALY_COGNITIVE_ORCHESTRATION.md`; the implementation sequence is defined in `AXWISE_ORCHESTRATION_DEVELOPMENT_ROADMAP.md`. They are target capabilities and must not be inferred from the current A+B routes.

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
| Generic cognitive orchestration | Not yet published | Accepts an arbitrary operational task and recommends an agent, team, execution pattern, context, guardrails, approvals, and fallbacks. | Strategic target; not implemented as a stable API. |
| Conditions gateway | `POST /conditions/evaluate` | A synchronous decision/grounding call at a defined Orqaly workflow point. | Implemented; verify deployment and authentication before use. Advisory/shadow use only while chat history remains unused. |
| Durable A+B research | `POST /simulate-enhanced-async` | Queues evidence-audited research with idempotency, status, results, cancellation, and optional terminal webhook. | Implemented in the repository; production readiness requires current schema, worker, tenant, secret, and callback verification. |
| Run status | `GET /runs/{job_id}/status` | Retrieves durable job stage and progress. | Implemented; verify deployment before use. |
| Completed result | `GET /runs/{job_id}` | Retrieves the persisted research output after completion. | Implemented; verify deployment before use. |
| Cancellation | `POST /runs/{job_id}/cancel` | Cancels a queued or running tenant-owned job. | Implemented with terminal-state conflict behaviour; verify deployment before use. |

## 1. Conditions gateway

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

## 2. Durable asynchronous A+B research

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

## 3. Tenant isolation and idempotency

AxWise resolves the external `orgId` and `userId` through an active `orqaly_tenant_mappings` record. It does not trust free-form tenant information alone.

For status, result, and cancellation calls, send:

```http
X-Orqaly-Org-ID: <same tenant orgId>
X-Orqaly-User-ID: <same tenant userId>
```

The idempotency key is scoped to the partner and external organization. Retrying the same logical request returns the existing job. Reusing the same key for different input returns `409 Conflict`.

## 4. Polling and webhooks

Poll `GET /runs/{job_id}/status` until the run reaches `completed`, `completed_with_warnings`, `failed`, or `cancelled`. Polling is the source of truth.

If a callback URL is supplied, AxWise sends terminal webhooks to the allow-listed `api.orqaly.com` host. Verify:

- `X-AxWise-Event-ID` for durable deduplication;
- `X-AxWise-Timestamp` for replay protection;
- `X-AxWise-Signature: v1=<HMAC-SHA256>` over `timestamp + "." + raw request body`.

The webhook is retried up to three times. Orqaly should return a quick 2xx after durable deduplication and continue polling as recovery.

## 5. Expected error semantics

| Status | Meaning | Orqaly action |
|---|---|---|
| `401` | Missing or invalid M2M key. | Stop and alert; do not retry with the same request. |
| `403` | Tenant has no active AxWise workspace mapping. | Provision or correct the mapping. |
| `409` | Idempotency mismatch, job not complete, or terminal cancellation conflict. | Follow the documented job state. |
| `422` | Invalid request body or callback URL. | Correct the request; do not blind-retry. |
| `5xx` | Service or mapped workspace unavailable. | Retry with bounded backoff and preserve the idempotency key. |

## 6. Explicitly out of scope

The legacy `/twins/*` routes and legacy `/simulate-async` flow are not the production A+B research contract. Do not build a production dependency on them.

## 7. Historical production record and current verification

Project records state that on 2026-07-13 production was migrated to `20260712_orqaly_hybrid`, a dedicated managed worker was deployed, and a mapped-tenant A+B dual-persona run completed successfully. They also record successful evidence-range, idempotency-conflict, and unmapped-tenant checks. This historical record is not a current deployment guarantee and cannot be independently established from repository code.

Before enabling a real Orqaly organisation, verify the migration and worker in the target environment, create an active mapping for its exact `orgId` and `userId`, install the current M2M secret in Orqaly's server-side secret store, and complete a fresh tenant-scoped smoke test. Treat signed callbacks as optional until Orqaly's receiver has separately passed signature, replay, retry, and deduplication tests.
