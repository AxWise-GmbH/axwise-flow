---
type: Technical Documentation
title: "Orqaly and AxWise Developer Integration Guide"
description: "A current developer guide for Phase 1–4 orchestration, Conditions, and durable asynchronous A plus B research."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/ORQALY_DEV_INTEGRATION_GUIDE.md
tags: [orqaly, axwise, orchestration, assignment, planning, recovery, evidence, research, conditions, api, development, security, rollout]
timestamp: 2026-07-16T20:00:00Z
---

# Orqaly ↔ AxWise developer integration guide

This guide is for the Orqaly backend team. It covers the implemented Phase 1–4 orchestration lifecycle, conditional customer intelligence, outcomes, the Conditions Gateway, and standalone durable A+B research. Use `ORQALY_INTEGRATION_SCHEMA.md` as the canonical non-secret field contract.

Repository implementation is not a deployment guarantee. Do not enable a route until it passes authenticated verification in the intended environment.

## 1. Boundary and responsibility

Orqaly owns authentication UX, tenants, current agent and tool state, permissions, workflow execution, third-party integrations, storage, billing, approvals, and user-facing results. AxWise supplies explainable cognitive decisions, evidence routing, research output, team-plan recommendations, and recovery recommendations.

> **AxWise recommends. Orqaly revalidates, authorizes, and executes.**

Every orchestration response contains `requires_orqaly_authorization: true`. Never interpret an AxWise agent ID, plan, feasibility result, or confidence value as proof of current authority.

Call AxWise from Orqaly's backend only. Do not put the M2M key in a browser bundle, client-side route, query string, log, analytics event, exception message, or test fixture.

## 2. Server configuration

```dotenv
AXWISE_API_URL=https://api.axwise.de/api/orqaly-axwise/v1
AXWISE_API_KEY=<read-from-Orqaly-secret-manager>

# Orqaly-owned rollout controls
AXWISE_ORCHESTRATION_MODE=disabled # disabled | shadow | selective
AXWISE_CONDITIONS_MODE=disabled    # disabled | shadow | authoritative
AXWISE_RESEARCH_ENABLED=false
AXWISE_PLANNING_ENABLED=false
AXWISE_REQUEST_TIMEOUT_MS=8000
AXWISE_RESEARCH_TIMEOUT_MS=30000
```

`selective` means an approved AxWise recommendation may influence only explicitly enabled workflows after Orqaly's live-state checks. It does not delegate execution authority to AxWise.

Use production keys and the webhook secret only from the private handoff. Never copy live values into this file or Git history.

## 3. Choose the correct surface

| Orqaly need | Call | Lifecycle |
|---|---|---|
| Choose an agent or team for an operational task | `POST /orchestration/decisions` | Synchronous unless bounded Phase 2 research is selected. |
| Restore or audit a prior decision | `GET /orchestration/decisions/{decision_id}` | Synchronous, exact tenant user and organization required. |
| Resume a decision waiting for bounded research | `POST /orchestration/decisions/{decision_id}/research/refresh` | `202` while pending; linked immutable child after terminal research. |
| Recover from changed execution state | `POST /orchestration/decisions/{decision_id}/replan` | Synchronous linked immutable child. |
| Validate client compatibility | `GET /orchestration/schemas/decision-request-v1` | Authenticated JSON Schema. |
| Apply a bounded workflow condition or grounding check | `POST /conditions/evaluate` | Synchronous advisory/control result. |
| Produce a research deliverable independently of a decision | `POST /simulate-enhanced-async` | Durable asynchronous job with polling and optional webhook. |
| Report execution and node outcomes | `POST /orchestration/decisions/{decision_id}/outcomes` | Idempotent Phase 4 receipt and versioned evaluation. |
| Inspect stored outcomes | `GET /orchestration/decisions/{decision_id}/outcomes` | Exact-tenant audit/reconciliation read. |

Do not call standalone A+B merely because a decision is `pending_research`. That decision already owns a tenant-scoped research job; poll it and use the research-refresh route.

For pre-planning customer intelligence, also do not call standalone A+B first. Create a normal orchestration decision with `planning: null` and explicit research budgets, then branch on the returned routing mode.

## 4. Shared server client

Use one server-only transport so authentication, timeouts, tenant headers, error parsing, and trace correlation remain consistent.

```ts
type AxWiseTenant = { orgId: string; userId: string };

type AxWiseRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  tenant?: AxWiseTenant;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
};

export class AxWiseHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseBody: unknown,
  ) {
    super(`AxWise request failed with status ${status}`);
  }
}

export async function axwiseRequest<T>(
  path: string,
  options: AxWiseRequestOptions = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-axwise-key": process.env.AXWISE_API_KEY!,
  };

  if (options.tenant) {
    headers["X-Orqaly-Org-ID"] = options.tenant.orgId;
    headers["X-Orqaly-User-ID"] = options.tenant.userId;
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  if (options.requestId) {
    headers["X-Request-ID"] = options.requestId;
  }

  const response = await fetch(`${process.env.AXWISE_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(
      options.timeoutMs ?? Number(process.env.AXWISE_REQUEST_TIMEOUT_MS ?? 8000),
    ),
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AxWiseHttpError(response.status, responseBody);
  }
  return { status: response.status, body: responseBody as T };
}
```

Redact response bodies from ordinary error logs. Log a minimized record containing the Orqaly workflow ID, HTTP status, AxWise decision/job ID, request ID, trace ID, latency, and rollout mode.

Retry transport failures, `429`, and `5xx` only with bounded backoff and the same idempotency key for the same logical write. Do not blind-retry `401`, `403`, `404`, `409`, or `422`.

## 5. Phase 1: create and retrieve a decision

### Build trusted input

The create body must follow `DecisionCreateRequestV1`. Fetch the current schema during contract tests:

```ts
const schema = await axwiseRequest<Record<string, unknown>>(
  "/orchestration/schemas/decision-request-v1",
);
```

Build these fields from authenticated Orqaly server state:

- `tenant.orgId` and `tenant.userId`;
- task objective, desired outcome, domain, constraints, classification, risk, urgency, reversibility, required capabilities, tools, actions, stakeholders, and context references;
- the point-in-time organization agent and tool catalogues;
- policy, approval, cost, and latency limits.

Do not accept tenant identity, agent ownership, tool authority, roles, approval state, or budget authority from an untrusted browser body without server-side replacement and validation.

### Create

```ts
export async function createAxWiseDecision(
  body: Record<string, unknown>,
  idempotencyKey: string,
  requestId: string,
) {
  return axwiseRequest<Record<string, unknown>>("/orchestration/decisions", {
    method: "POST",
    body,
    idempotencyKey,
    requestId,
  });
}
```

Persist the `decision_id`, idempotency key, request ID, Orqaly workflow ID, status, routing mode, parent decision ID when present, research job ID when present, and the version/trace fields needed for audit.

| Response | Meaning |
|---|---|
| `201` | New immutable decision. |
| `200` with `reused: true` | Identical create retry returned the existing decision. |
| `409` | The same organization/idempotency key was reused for changed input or another mapped user owns the original retry record. |

### Retrieve

```ts
export async function getAxWiseDecision(
  decisionId: string,
  tenant: AxWiseTenant,
) {
  return axwiseRequest<Record<string, unknown>>(
    `/orchestration/decisions/${encodeURIComponent(decisionId)}`,
    { tenant },
  );
}
```

Use the exact tenant organization and user that created the decision. A mismatch returns `404` without disclosing whether the record exists.

### Authorize before execution

Before Orqaly adopts a recommendation, recheck:

1. The agent and tools still belong to the organization and are available.
2. Required capabilities, data classification, risk clearance, and requested action scopes still pass.
3. Current costs, latency limits, policy denials, and approval gates still pass.
4. The decision is not `pending_research` or `human_clarification`.
5. The returned plan is present and executable.

## 6. Phase 2: evidence and research-assisted decisions

Phase 2 fields are optional, so existing Phase 1 callers remain compatible. Add them only when the workflow has a real evidence question:

- `evidence_catalogue`: bounded reference-only metadata for authorized evidence;
- `research_policy`: value, cost, latency, evidence, and iteration thresholds;
- `research_brief`: the bounded question for A+B when hybrid research is enabled.

Do not send unrestricted document bodies, credentials, or an entire tenant knowledge base. AxWise resolves only supported tenant-owned references.

### Handle routing modes

| Routing mode/status | Orqaly behavior |
|---|---|
| `direct` | Revalidate and authorize the returned recommendation. |
| `evidence_assisted` | Show provenance where relevant, then revalidate and authorize. |
| `research_assisted` + `pending_research` | Persist the job ID; do not execute; poll the durable job. |
| `human_clarification` | Ask for the missing authority, context, or evidence; do not execute. |

### Refresh after terminal research

```ts
export async function refreshAxWiseDecision(
  decisionId: string,
  tenant: AxWiseTenant,
  idempotencyKey: string,
) {
  return axwiseRequest<Record<string, unknown>>(
    `/orchestration/decisions/${encodeURIComponent(decisionId)}/research/refresh`,
    { method: "POST", tenant, idempotencyKey },
  );
}
```

| Response | Orqaly action |
|---|---|
| `202` | Research is still queued/running. Retain the immutable parent and poll later. |
| `201` | Persist the linked child decision and evaluate that child for authorization. |
| `200` | An identical terminal refresh already created the child; use the returned existing child. |

Failed, cancelled, timed-out, empty, contradictory, or low-quality research must remain visible and route to clarification unless the returned usable evidence independently meets the documented thresholds.

### Phase 3.1 pre-planning customer-intelligence route

For a vague goal, submit the active Agent Hub catalogue, declared context, verified user answers, a bounded `research_brief`, explicit cost/latency/iteration limits, and `planning: null` to the normal decision route.

- `direct`: store `orqaly_context_resolution_v2` with `source_type: declared_context`; plan immediately.
- `evidence_assisted`: store the same contextual format with `source_type: existing_evidence`; plan immediately.
- `research_assisted`: persist and poll the returned job, then call research refresh and consume `orqaly_dual_persona_v1`.
- `human_clarification`: pause through Orqaly's existing `awaiting_po_input` questions and resubmit after the user answers.

Pass the completed context decision as `upstream_decision_id` in the final plan request. AxWise rejects missing, cross-tenant, or different-task parents.

When AxWise selects `research_assisted`, build the A+B request with typed `questions_data` as well as the human-readable questionnaire. Use domain-neutral stakeholder roles such as problem experiencer, decision maker, beneficiary, executor, and outcome definer; do not hard-code PO/PM or software-development roles. Set `config.performance_profile` to `quality_fast` for the normal Orqaly path. This profile preserves the two-person-per-stakeholder scope and the same evidence/persona output contract, but avoids the raw-questionnaire parser, parallelizes independent persona generation, and removes duplicate evidence-cleaning/filter calls. AxWise still owns the empirical persona derivation and exact quote/source validation.

## 7. Phase 3: team planning and recovery

Planning is backward compatible and opt-in. Set `AXWISE_PLANNING_ENABLED=true` only for workflows whose request builder, UI, execution state, and approvals support the typed `planning` contract.

The planning object declares:

- `single`, `sequential`, `parallel`, `supervisor`, or `human_controlled` pattern;
- typed steps with capabilities, tools, actions, dependencies, input/output contracts, and completion criteria;
- review and distinct-reviewer rules;
- step and total budgets;
- team-size, collaboration, and separation-of-duty constraints.

### Feasibility handoff

For every plan, validate the returned `plan_feasibility_request` against live Orqaly state. Return or apply structured rejection reasons when an owner, tool, permission, approval, budget, or workflow condition changed. The repository default only checks the authenticated catalogue snapshot; it is not a substitute for a deployed Orqaly live-state adapter.

If feasibility is rejected, do not execute the preserved explanatory graph. A rejection produces a human-controlled, non-executable result for repair.

### Request an immutable replan

```ts
export async function replanAxWiseDecision(
  decisionId: string,
  tenant: AxWiseTenant,
  idempotencyKey: string,
  replanBody: Record<string, unknown>,
) {
  return axwiseRequest<Record<string, unknown>>(
    `/orchestration/decisions/${encodeURIComponent(decisionId)}/replan`,
    { method: "POST", tenant, idempotencyKey, body: replanBody },
  );
}
```

Send exactly one typed trigger:

| Trigger | Changed state supplied by Orqaly |
|---|---|
| `agent_unavailable` | Unavailable agent IDs and optional replacements. |
| `tool_failure` | Failed tool IDs and optional replacement tools. |
| `output_rejected` | Rejected node IDs. |
| `budget_changed` | The new bounded budget. |
| `human_override` | The human instruction. |

The parent is never mutated. A feasible child uses `routing_mode: recovery`. An infeasible child is durably recorded but remains human-controlled, non-executable, and confidence `0`. Revalidate and authorize every child as a new decision.

Although Phase 4 execution receipts now exist, a replan is still a complete replacement recommendation, not a resume-from-completed-node instruction. Orqaly must reconcile already completed work itself.

### Phase 4 outcome submission

At terminal execution, POST a decision-level outcome plus terminal plan-node receipts to `/orchestration/decisions/{decision_id}/outcomes`. Use the exact organization/user headers and a stable key such as `orqaly-outcome:{goal_id}:iteration:{iteration}:{decision_id}`. Include authorization, success, quality, acceptance, cost, latency, rework, escalation, overrides, failure taxonomy, and node attempt owners/statuses where observed.

AxWise validates node, owner, override, and currency linkage, stores raw observations, and returns `outcome-evaluator-v1.0.0` metrics. Reporting is best-effort: it must not change Orqaly's terminal state. Persist the returned outcome ID, normalized success, safety flags, currency-match status, and evaluation version for reconciliation. Scorer promotion is an offline tenant-bound, baseline-matched, human-governed operator action, never an Orqaly runtime call.

## 8. Conditions Gateway

```http
POST /conditions/evaluate
Content-Type: application/json
x-axwise-key: <AXWISE_API_KEY>
```

```json
{
  "integrationPoint": "copilot.chat",
  "requestId": "a-new-orqaly-uuid",
  "tenant": {
    "orgId": "orqaly-org-id",
    "userId": "orqaly-user-id"
  },
  "payload": {
    "message": "Facts required for this workflow decision"
  },
  "hints": {}
}
```

`integrationPoint` is top-level. Supported values remain `consilium.create`, `agent.generate`, `copilot.chat`, and `copilot.ground`. Preserve `meta.traceId`, latency, and degraded state in minimized server-side observability.

Start each point in shadow mode. For `agent.generate`, fail closed on a deny or degraded response. The current `copilot.chat` handler does not use prior conversation history, so do not claim history-sensitive protection or promote that point until the corresponding regression test passes.

## 9. Standalone durable A+B research

Use `POST /simulate-enhanced-async` when research itself is the requested deliverable rather than a step owned by a Phase 2 decision.

1. Generate a new `Idempotency-Key` for the logical research action.
2. Send server-verified tenant data, bounded research context, configuration, outputs, and an optional HTTPS callback.
3. For dual-persona resolution, build `agent_candidates` from the authenticated user's active catalogue and set `outputs.persona_resolution: true`.
4. Persist `job_id`, poll `/runs/{job_id}/status`, and retrieve `/runs/{job_id}` only after completion.
5. Recheck the returned recommended agent against current Orqaly ownership, availability, RBAC, budget, and tool scope.

Status, result, and cancel calls require:

```http
X-Orqaly-Org-ID: <orgId>
X-Orqaly-User-ID: <userId>
x-axwise-key: <AXWISE_API_KEY>
```

Polling is the source of truth. A callback is only a signed terminal notification.

## 10. Webhook receiver

The callback must be HTTPS on the configured allow-listed Orqaly host. AxWise sends terminal events with:

- `X-AxWise-Event-ID`: persist and deduplicate;
- `X-AxWise-Timestamp`: enforce a replay window;
- `X-AxWise-Signature`: validate `v1=<HMAC-SHA256>` over `timestamp + "." + raw body`.

Verify the raw body with constant-time comparison before parsing. Return quickly after durable event-ID deduplication, then fetch status/result from AxWise.

## 11. Orqaly integration placement

A review against Orqaly `main` commit `d8a6e2d5` found no AxWise client at that point and identified `lib/integrations/axwise/` as the appropriate server-only boundary. Treat that commit as historical review context and reconfirm current Orqaly paths before implementation.

Recommended ownership:

- one AxWise transport module for authentication, timeouts, tenant headers, and redacted errors;
- one decision service for create/get/refresh/replan lifecycle and Orqaly persistence;
- one Conditions adapter at explicitly selected workflow hooks;
- one standalone research service and webhook receiver;
- one live-state feasibility adapter that reads current Orqaly catalogues, RBAC, approval, and workflow state;
- feature flags by organization and workflow, never only a global switch.

## 12. Operational readiness

Before enabling a capability, confirm:

1. Current orchestration and hybrid-research migrations are applied in the target environment.
2. The exact Orqaly organization and user have an active tenant mapping.
3. The M2M and webhook secrets are present only in managed server-side secret storage.
4. The schema and every enabled lifecycle route pass an authenticated smoke test.
5. The A+B worker is running whenever research can be selected.
6. Orqaly persists decision/job IDs, parent-child links, idempotency keys, and trace correlation.
7. The live-state feasibility adapter and approval enforcement are connected before plan execution.
8. Timeouts, bounded retries, circuit breaking, local fallback, and rollout flags are deployed.
9. Logs and telemetry contain no secrets, unrestricted content, or complete sensitive decision payloads.

Historical repository or production notes are not a current readiness signal. Record the verification date, environment, route, revision, and trace ID for each launch gate.

## 13. Test matrix

| Test | Expected result |
|---|---|
| Schema contract fixture | Orqaly request builders validate against current authenticated v1 schema. |
| Missing/invalid M2M key | `401`. |
| Unmapped tenant | `403`. |
| Valid new decision | `201`; persist decision and trace correlation. |
| Identical create retry | `200`, same decision, `reused: true`. |
| Changed create retry | `409`; no second meaning under the same key. |
| Cross-user read/refresh/replan | `404` without record disclosure. |
| Clear task | No research adapter call. |
| Pending research | No recommended execution; confidence `0`; job persisted. |
| Research refresh pending/terminal/retry | `202` / `201` / `200` with correct immutable parent-child state. |
| Weak or failed research | Clarification or safe fallback; never silent confident assignment. |
| Multi-agent plan | Valid acyclic contracts, approvals, reviewers, budgets, and failure paths. |
| Live feasibility rejection | Human-controlled and non-executable. |
| Every replan trigger | Linked child, parent unchanged, idempotent retry, changed-input conflict. |
| Conditions history-sensitive case | Remains shadow until different histories produce the intended policy difference. |
| Standalone A+B duplicate webhook | No duplicate downstream work. |

## 14. Companion documents

- Canonical non-secret contract: `ORQALY_INTEGRATION_SCHEMA.md`.
- Product and authority boundary: `ORQALY_AXWISE_INTEGRATION_ONE_PAGER.md`.
- Rollout and verification: `AXWISE_INTEGRATION_PLAN.md`.
- Phase details: `AXWISE_ORCHESTRATION_PHASE_1.md`, `AXWISE_ORCHESTRATION_PHASE_2.md`, and `AXWISE_ORCHESTRATION_PHASE_3.md`.
- Standalone research status: `ORQALY_ASYNC_HYBRID_INTEGRATION_PLAN.md`.
- Live credentials and exact target-environment commands: private production handoff only.
