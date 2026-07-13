---
type: Technical Documentation
title: "AxWise Conditions Gateway Implementation and Verification Plan"
description: "The current implementation, verification, and rollout plan for the Orqaly server-to-server conditions gateway."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/AXWISE_INTEGRATION_PLAN.md
tags: [axwise, orqaly, conditions, verification, rollout, security]
timestamp: 2026-07-12T22:18:49.264Z
---

# AxWise Conditions Gateway implementation and verification plan

This document covers the synchronous Conditions Gateway only. Durable A+B research has its own lifecycle and plan in `ORQALY_ASYNC_HYBRID_INTEGRATION_PLAN.md`.

## 1. Contract decision

Orqaly calls one AxWise endpoint from its backend:

```http
POST /api/orqaly-axwise/v1/conditions/evaluate
x-axwise-key: <server-side M2M secret>
```

The request contract has these **top-level** fields:

```json
{
  "integrationPoint": "copilot.chat",
  "requestId": "orqaly-uuid",
  "tenant": { "orgId": "org-id", "userId": "user-id" },
  "payload": {},
  "hints": {}
}
```

AxWise returns applicable conditions, processed outputs, and traceable execution metadata. Orqaly remains responsible for deciding and executing its local workflow action.

## 2. Supported decision points

| Point | AxWise responsibility | Orqaly responsibility |
|---|---|---|
| `consilium.create` | Governance defaults and decision thresholds. | Persist and present the selected controls. |
| `agent.generate` | Security/tool-scope assessment. | Enforce deny decisions and prevent unsafe execution. |
| `copilot.chat` | Context classification, tone, and policy fragments. | Compose and deliver the final response. |
| `copilot.ground` | Post-hoc claim/source grounding. | Display, retain, or act on the result. |

## 3. Current implementation status

- [x] M2M authentication via `x-axwise-key` with constant-time comparison.
- [x] Typed request and response schemas.
- [x] Request-ID response caching for repeated Conditions calls.
- [x] Four supported integration points.
- [x] Fail-closed degraded response for `agent.generate`.
- [x] Production secret deployment and live authentication verification.
- [ ] Orqaly shadow-mode implementation and telemetry comparison.
- [ ] Orqaly authoritative rollout for selected decision points.
- [ ] Automated cross-service tests using non-production secrets.

## 4. Verification matrix

| Scenario | Expected result |
|---|---|
| Missing key | 401 and no condition evaluation. |
| Incorrect key | 401 and no condition evaluation. |
| Valid key, valid contract | 200 with `applicableConditions`, `processedOutputs`, and `meta.traceId`. |
| Repeated equivalent request ID | Cached response semantics. |
| `agent.generate` degradation | `meta.degraded: true` and a deny security decision. |
| Grounding request | Grounding claims reference offsets within the provided response/source material. |
| 5xx or timeout at Orqaly | Bounded retry or documented local fallback; no duplicate unsafe action. |

## 5. Rollout

1. **Disabled:** Orqaly keeps the existing local behaviour and makes no call.
2. **Shadow:** Orqaly sends representative traffic, logs a minimized decision comparison with AxWise trace IDs, and does not change the end-user outcome.
3. **Review:** Measure latency, availability, costs, disagreement rate, and any false-deny/false-allow cases.
4. **Authoritative:** Enable only the intended decision point. Start with a narrow workflow and retain a documented fallback.
5. **Operate:** Monitor authentication failures, degradation, endpoint latency, and trace IDs; rotate secrets through the shared private process.

## 6. Non-goals

- This gateway does not execute SaaS operations, render files, make payments, send email/SMS, or manage Orqaly users.
- It does not replace the durable research endpoint.
- It must not be called directly from a browser.

## 7. References

- Current partner contract: `ORQALY_INTEGRATION_SCHEMA.md`.
- Orqaly implementation guide: `ORQALY_DEV_INTEGRATION_GUIDE.md`.
- Product decision boundary: `ORQALY_AXWISE_INTEGRATION_ONE_PAGER.md`.
