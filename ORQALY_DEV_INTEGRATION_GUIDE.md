---
type: Technical Documentation
title: "Orqaly Conditions Gateway Developer Guide"
description: "A current developer guide for integrating Orqaly server workflows with the AxWise conditions gateway and durable asynchronous research API."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/ORQALY_DEV_INTEGRATION_GUIDE.md
tags: [orqaly, axwise, conditions, api, development, security, rollout]
timestamp: 2026-07-13T11:30:00Z
---

# Orqaly ↔ AxWise developer guide

This guide is for the Orqaly backend team. It covers the live Conditions Gateway and how it fits beside the durable A+B research API. Use the separate private production handoff for live secret values and deployment commands.

## 1. Boundary and responsibility

Orqaly owns authentication UX, tenant lifecycle, workflow execution, third-party integrations, storage, billing, and user-facing results. AxWise supplies cognitive decision support and research output.

Call AxWise from Orqaly's backend only. Do not put the M2M key in a browser bundle, a client-side route, logs, analytics, or a query string.

## 2. Server configuration

```dotenv
AXWISE_API_URL=https://api.axwise.de/api/orqaly-axwise/v1
AXWISE_API_KEY=<read-from-Orqaly-secret-manager>

# Recommended Orqaly-owned rollout controls
AXWISE_CONDITIONS_MODE=disabled # disabled | shadow | authoritative
AXWISE_REQUEST_TIMEOUT_MS=8000
```

Use the production key and webhook secret only from the private handoff. Never copy either value into this file, Git history, test fixtures, or monitoring payloads.

## 3. Conditions Gateway contract

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
  "hints": {
    "optional": "local context"
  }
}
```

`integrationPoint` is a top-level field. Do not nest it inside `payload`.

| Integration point | Invoke before / after | Expected Orqaly use |
|---|---|---|
| `consilium.create` | Before a governance workflow is created | Apply suggested quorum, consensus, and control defaults. |
| `agent.generate` | Before creating/executing a capable agent | Enforce deny decisions and record the trace ID. |
| `copilot.chat` | Before drafting a contextual copilot response | Merge approved prompt/tone/policy context. |
| `copilot.ground` | After a draft exists | Use grounding output to assess or annotate source support. |

The response has `applicableConditions`, `processedOutputs`, and `meta`. Preserve `meta.traceId`, latency, and degraded state in Orqaly's server-side observability record.

## 4. Minimal server client

```ts
type ConditionsMode = "disabled" | "shadow" | "authoritative";

export async function evaluateAxWiseConditions(input: {
  integrationPoint: "consilium.create" | "agent.generate" | "copilot.chat" | "copilot.ground";
  requestId: string;
  tenant: { orgId: string; userId: string };
  payload: Record<string, unknown>;
  hints?: Record<string, unknown>;
}) {
  const response = await fetch(
    `${process.env.AXWISE_API_URL}/conditions/evaluate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-axwise-key": process.env.AXWISE_API_KEY!,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(
        Number(process.env.AXWISE_REQUEST_TIMEOUT_MS ?? 8000),
      ),
    },
  );

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`AxWise conditions failed: ${response.status}`);
  }
  return body;
}
```

Wrap the client with bounded retries only for transport failures and 5xx responses. Reuse the same `requestId` when retrying the same Conditions decision. Do not retry 401, 403, 409, or 422 responses blindly.

## 5. Current Orqaly repository hook

Compatibility was reviewed against `Orqaly/Orqaly` `main` commit `d8a6e2d5`:

- `src/services/copilotChatApiService.js::copilotChat` already forwards `message`, `history`, `orgId`, `conversationId`, `pageContext`, and attachments to Orqaly's backend.
- `lib/agent-handlers/copilot.js::handleCopilot` authenticates the user, applies the local content guard, and validates organization/conversation identifiers.
- `lib/_shared/chat-history.js::windowHistory` keeps up to 40 turns within 12,000 characters and records whether earlier history was omitted.
- No AxWise client or call currently exists.

Add the server-only client under `lib/integrations/axwise/`. Invoke Conditions in `handleCopilot` after authentication/local guarding and before `runCopilotLoop`. Build the tenant from `user.id` plus the validated organization; derive role from trusted server data.

Recommended payload:

```json
{
  "integrationPoint": "copilot.chat",
  "requestId": "stable-uuid-for-this-decision",
  "tenant": {
    "orgId": "validated-active-org",
    "userId": "verified-supabase-user"
  },
  "payload": {
    "message": "current cleaned message",
    "conversation_history": [
      { "role": "user", "content": "bounded prior turn" }
    ],
    "history_omitted": false,
    "conversation_id": "validated-conversation-id",
    "page_context": {},
    "sender_role": "server-derived-role",
    "active_twin_id": "orqaly_copilot"
  }
}
```

The current live AxWise handler ignores `conversation_history`, `history_omitted`, conversation ID, and page context. Do not claim end-to-end context propagation until AxWise uses those fields and the history-sensitive regression test passes.

Forty targeted Orqaly chat/session/Copilot tests passed during review. They prove Orqaly preserves history internally; they do not test the absent AxWise bridge.

## 6. Enforcement policy

| Mode | Behaviour |
|---|---|
| `disabled` | Make no outbound request; use the existing Orqaly behaviour. |
| `shadow` | Call AxWise, log a minimized comparison, but preserve the existing Orqaly decision. |
| `authoritative` | Enforce the documented AxWise output for the selected integration point. |

Start each integration point in shadow mode. Promote only after measuring latency, failure rate, and meaningful decision differences. For `agent.generate`, fail closed on an AxWise deny or degraded decision. For other points, document the local fallback posture before promotion.

## 7. Durable A+B research client

Use `POST /simulate-enhanced-async` for long-running research. It is a separate lifecycle from Conditions:

1. Generate a new `Idempotency-Key` for a logical research action.
2. Send the tenant, research context, configuration, outputs, and optional HTTPS callback URL.
3. Persist the returned `job_id` in Orqaly.
4. Poll the returned status link using the same tenant headers.
5. On completion, retrieve the persisted result; treat webhook delivery as a prompt to poll, not as the only source of truth.

The primary Orqaly call sets `outputs.persona_resolution: true` and includes:

- `task_context`, built from the task the user intends to execute;
- `agent_candidates`, loaded server-side from the authenticated user's active Orqaly agent catalogue;
- a research brief asking AxWise to identify the target customer/user persona and the ideal execution persona.

The Orqaly server implementation lives behind `/api/agent?path=axwise-research`. The browser never receives the AxWise M2M key. The completed `result.data.persona_resolution` is passed to Orqaly's assignment pipeline as a bounded scoring signal. Orqaly remains responsible for the final ownership, availability, RBAC, budget, and tool-scope checks before execution.

Required tenant headers when polling, reading results, or cancelling:

```http
X-Orqaly-Org-ID: <orgId>
X-Orqaly-User-ID: <userId>
x-axwise-key: <AXWISE_API_KEY>
```

The detailed payload, webhook HMAC verification, and error handling are in the current API contract and private handoff.

## 8. Webhook receiver requirements

The callback must be HTTPS on `api.orqaly.com`. AxWise sends terminal events with:

- `X-AxWise-Event-ID`: persist and deduplicate;
- `X-AxWise-Timestamp`: enforce a replay window;
- `X-AxWise-Signature`: validate `v1=<HMAC-SHA256>` over `timestamp + "." + raw body`.

Verify the raw body with a constant-time comparison before parsing or triggering follow-up actions. Return quickly after durable deduplication, then fetch the job status/result.

## 9. Operational readiness

AxWise production migration, durable storage, API lifecycle routes, and the managed A+B worker are live. A production smoke run completed on 2026-07-13 with exact evidence-offset verification and correct tenant/idempotency semantics.

Before enabling a real A+B run, confirm:

1. Orqaly's production secret store has the current M2M and webhook secrets.
2. The AxWise production migration has created `orqaly_tenant_mappings` and all durable `pipeline_runs` columns.
3. AxWise has an active mapping for the exact Orqaly `orgId` and `userId`.
4. The AxWise managed worker is deployed and claiming queued jobs.
5. The callback receiver is live and has passed signature, retry, and deduplication tests.

## 10. Test matrix

| Test | Expected result |
|---|---|
| Conditions without a key | 401 |
| Conditions with an invalid key | 401 |
| Conditions with a valid key and valid body | 200 |
| Ambiguous follow-up after finance-sensitive history | Different policy/classification from the same follow-up after ordinary history |
| A+B retry with identical idempotency key | Existing job returned |
| A+B retry with changed input | 409 |
| Unmapped tenant after migration | 403, never 500 |
| Result before completion | 409 |
| Duplicate webhook event | No duplicate downstream work |

## 11. Companion documents

- Product and architecture context: `ORQALY_AXWISE_INTEGRATION_ONE_PAGER.md`.
- Current API schema: `ORQALY_INTEGRATION_SCHEMA.md`.
- Internal async implementation status: `ORQALY_ASYNC_HYBRID_INTEGRATION_PLAN.md`.
- Private deployment credentials and exact smoke-test commands: private handoff only.
