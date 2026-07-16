---
type: Technical Documentation
title: "AxWise and Orqaly Integration Implementation and Verification Plan"
description: "The implementation, rollout, and verification plan for Phase 1–3 orchestration, Conditions, and durable A plus B research."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/AXWISE_INTEGRATION_PLAN.md
tags: [axwise, orqaly, orchestration, assignment, research, planning, recovery, conditions, verification, rollout, security]
timestamp: 2026-07-16T20:00:00Z
---

# AxWise and Orqaly integration implementation and verification plan

This plan covers the complete current repository integration surface. Phase 1–3 orchestration is the primary decision and assignment path. The synchronous Conditions Gateway and durable standalone A+B research API remain supported companion paths.

Repository implementation is not proof of deployment. Each target environment must separately verify the current database migrations, M2M authentication, exact tenant mappings, worker state where research is used, and authenticated smoke tests.

## 1. Product and authority boundary

> **AxWise recommends and explains. Orqaly revalidates current state, authorizes, and executes.**

Orqaly owns users, organizations, agent and tool catalogues, workflow state, approvals, external integrations, billing, persistence of Orqaly-owned execution state, and the final user experience. AxWise owns task interpretation, eligibility filtering, explainable ranking, uncertainty and evidence routing, team-plan recommendations, research synthesis, guardrails, fallbacks, and immutable decision records.

Every orchestration response contains `requires_orqaly_authorization: true`. A recommendation never proves current ownership, availability, permission, budget, or tool authority.

## 2. Current integration surfaces

All calls originate from the Orqaly backend and use the private `x-axwise-key` M2M secret.

| Surface | Primary route | Purpose | Activation |
|---|---|---|---|
| Phase 1–3 orchestration | `POST /api/orqaly-axwise/v1/orchestration/decisions` | Create an immutable, explainable assignment or team-plan recommendation. | Preferred entry point for new operational orchestration use cases. |
| Decision retrieval | `GET /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}` | Recover the exact tenant-owned input snapshot and decision. | Use for audit, retry recovery, and Orqaly workflow restoration. |
| Research refresh | `POST /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/research/refresh` | Convert terminal bounded research into a linked immutable rescore. | Only when the parent decision is `pending_research`. |
| Recovery replan | `POST /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/replan` | Recommend a linked replacement plan after operational state changes. | Use for one typed agent, tool, output, budget, or human-override trigger. |
| Request schema | `GET /api/orqaly-axwise/v1/orchestration/schemas/decision-request-v1` | Retrieve the authenticated backward-compatible request schema. | Use in contract tests and integration validation. |
| Conditions Gateway | `POST /api/orqaly-axwise/v1/conditions/evaluate` | Fast advisory policy, tone, security, classification, or grounding support. | Keep shadow-only until the selected integration point passes its quality gate. |
| Standalone A+B research | `POST /api/orqaly-axwise/v1/simulate-enhanced-async` | Start durable evidence-audited stakeholder and dual-persona research. | Use when Orqaly needs a research deliverable independently of an orchestration decision. |

Exact request and response fields are canonical in `ORQALY_INTEGRATION_SCHEMA.md`.

## 3. Phase implementation

### Phase 1: generic task and direct assignment

Phase 1 accepts a strict domain-neutral task, tenant, agent catalogue, tool catalogue, policy, approval context, and budget. It applies hard eligibility before deterministic weighted ranking and returns either a direct recommendation or a human-controlled result.

Required Orqaly work:

1. Build catalogues only from authenticated server-side state.
2. Generate a new `Idempotency-Key` for each logical decision and preserve it across identical retries.
3. Persist `decision_id`, AxWise trace data, contract/scorer versions, and the Orqaly workflow reference.
4. Revalidate the recommended agent, tools, permissions, cost, and availability before execution.
5. Treat no-eligible-agent and approval-gated results as non-executable until repaired or approved.

### Phase 2: evidence and bounded research routing

Phase 2 adds optional evidence metadata, research policy, and a bounded research brief. AxWise chooses among direct, evidence-assisted, research-assisted, and human-clarification paths based on deterministic uncertainty and value-of-information rules.

Required Orqaly work:

1. Send evidence references and metadata, not unrestricted tenant documents or secrets.
2. Enable hybrid research only when explicit cost, latency, iteration, evidence, and deadline limits are present.
3. Persist the returned research `job_id` when status is `pending_research`; do not execute a provisional assignment.
4. Poll the durable job and call the research-refresh route after a terminal state.
5. Adopt only the linked child decision returned by refresh; never mutate the parent decision locally.
6. Route failed, contradictory, empty, timed-out, or low-quality research to clarification rather than silently restoring a confident assignment.

### Phase 3: team planning and immutable recovery

Phase 3 activates only when Orqaly supplies a typed `planning` object. It supports single, sequential, parallel, supervisor, and human-controlled plans, with contracts, dependencies, reviewers, approvals, budgets, failure paths, feasibility handoff, and separation-of-duty rules.

Required Orqaly work:

1. Validate `plan_feasibility_request` against live Orqaly ownership, RBAC, availability, tool scopes, and approval state.
2. Execute only plans marked executable after Orqaly authorization.
3. Preserve node inputs, outputs, completion criteria, approval gates, and failure paths in Orqaly workflow state.
4. Request a replan with one typed trigger when agent, tool, output, budget, or human state changes.
5. Adopt the linked child plan only after the same live-state authorization checks.
6. Treat an infeasible child as a durable explanation and human-repair path, not as an executable plan.

## 4. Companion paths

### Conditions Gateway

Supported points remain `consilium.create`, `agent.generate`, `copilot.chat`, and `copilot.ground`. Conditions does not replace orchestration. It supplies bounded advisory or control fragments at a known Orqaly workflow point.

For `agent.generate`, fail closed on an AxWise deny or degraded response. For other points, retain a documented local fallback. Because current `copilot.chat` evaluation does not yet use prior conversation history, keep that integration in shadow mode until the history-sensitive regression test passes.

### Standalone A+B research

Use standalone A+B when research itself is the requested deliverable or when Orqaly needs the dual-persona result independently of an orchestration decision. Persist the returned job, poll status as the source of truth, and treat a signed webhook only as a prompt to poll.

Research started automatically by a Phase 2 decision is resumed through `/orchestration/decisions/{decision_id}/research/refresh`; it must not be manually substituted with an unrelated standalone result.

## 5. Repository implementation status

- [x] Strict versioned Phase 1 decision contract and authenticated schema route.
- [x] Tenant-scoped immutable decisions, retrieval, audit events, and durable idempotency.
- [x] Hard eligibility, deterministic ranking, explanations, and human-controlled fallback.
- [x] Phase 2 uncertainty, evidence, value-of-information, bounded A+B routing, and immutable refresh.
- [x] Phase 3 team templates, graph and policy validation, feasibility handoff, failure paths, and immutable replan.
- [x] Conditions Gateway authentication, typed contract, four integration points, and request caching.
- [x] Durable standalone A+B lifecycle, tenant mapping, idempotency, persona resolution, polling, cancellation, and signed webhooks.
- [ ] Current target-environment verification for the Phase 1–3 routes and schema.
- [ ] Remote Orqaly live-state feasibility adapter deployment.
- [ ] Orqaly shadow-mode integration and telemetry comparison for selected workflows.
- [ ] Fresh production smoke run covering direct decision, research refresh, team planning, and replan.
- [ ] Phase 4 execution receipts, outcomes, evaluation, and safe learning.
- [ ] Phase 5 enterprise hardening, PostgreSQL rehearsal, release SLOs, and operator tooling.

## 6. Verification matrix

| Scenario | Expected result |
|---|---|
| Missing or incorrect M2M key | `401` and no tenant data or decision output. |
| Unmapped tenant | `403` without creating a decision or research run. |
| New valid decision | `201` with immutable snapshot, ranking/exclusions, routing, authorization flag, and decision ID. |
| Identical decision retry | `200` with the original decision and `reused: true`. |
| Changed input under the same idempotency key | `409`. |
| Cross-organization or cross-user read | `404` without record details. |
| Clear task | Synchronous direct or human-controlled result; no research enqueue. |
| Valuable bounded research | `pending_research`, confidence `0`, no executable plan, and a durable job ID. |
| Research refresh while pending | `202` with the unchanged parent decision. |
| Terminal research refresh | `201` linked immutable child, or `200` for an identical completed retry. |
| Valid multi-agent request | Acyclic typed plan with complete contracts, approvals, failure paths, and feasibility result. |
| Live-state feasibility rejection | Human-controlled, non-executable result with structured rejection reasons. |
| Feasible replan | Linked immutable `recovery` child preserving the parent. |
| Infeasible replan | Durable human-controlled child with confidence `0` and no recommended agents. |
| Conditions `agent.generate` degradation | Deny/fail-closed handling and retained trace ID. |
| Duplicate signed webhook | No duplicate downstream work; polling remains authoritative. |

## 7. Rollout sequence

1. **Contract validation:** Fetch the published decision schema and run Orqaly client fixtures against it.
2. **Disabled integration:** Deploy the client, persistence fields, and feature flags without outbound calls.
3. **Direct shadowing:** Send low-risk Phase 1 decisions and compare recommendations with existing Orqaly routing.
4. **Evidence shadowing:** Add authorized evidence references and measure whether ranking or clarification quality improves.
5. **Bounded research pilot:** Enable Phase 2 for one uncertainty-heavy workflow with strict cost and latency limits.
6. **Planning pilot:** Enable one typed Phase 3 template and connect the Orqaly live-state feasibility adapter.
7. **Recovery drill:** Exercise every replan trigger and verify parent preservation, idempotency, and human fallback.
8. **Selective authority:** Allow approved recommendations to influence only the intended workflow after quality, safety, latency, cost, and disagreement gates pass.
9. **Operate:** Monitor authentication, tenant isolation, decision status, research workers, webhook deduplication, replan rates, latency, cost, and trace IDs.

## 8. Deployment gates

Before enabling any Phase 1–3 route in production, confirm:

1. The current orchestration and hybrid-research migrations are applied in the target database.
2. Exact Orqaly organization/user mappings are active.
3. Orqaly holds the current M2M and webhook secrets only in its managed server-side secret store.
4. The published schema route and all enabled lifecycle routes pass authenticated target-environment smoke tests.
5. The managed A+B worker claims jobs whenever Phase 2 research or standalone A+B is enabled.
6. Orqaly persists decision IDs, parent-child links, job IDs, idempotency keys, and trace correlation.
7. Feature flags, bounded retries, timeouts, circuit breaking, and documented local fallbacks are active.
8. No browser request, analytics event, or ordinary log contains an M2M key, webhook secret, unrestricted source material, or unminimized decision payload.

## 9. Non-goals

- AxWise does not execute SaaS actions, send communications, make payments, render files, or manage Orqaly users.
- Phases 1–3 do not provide durable per-node execution receipts, outcome learning, or statistically calibrated assignment confidence.
- Repository tests and historical production records do not establish current deployment readiness.
- Legacy `/twins/*` and `/simulate-async` routes are not part of the production orchestration or evidence-audited A+B contract.

## 10. References

- Current partner API contract: `ORQALY_INTEGRATION_SCHEMA.md`.
- Orqaly implementation guide: `ORQALY_DEV_INTEGRATION_GUIDE.md`.
- Product decision boundary: `ORQALY_AXWISE_INTEGRATION_ONE_PAGER.md`.
- Phase details: `AXWISE_ORCHESTRATION_PHASE_1.md`, `AXWISE_ORCHESTRATION_PHASE_2.md`, and `AXWISE_ORCHESTRATION_PHASE_3.md`.
- Standalone research lifecycle: `ORQALY_ASYNC_HYBRID_INTEGRATION_PLAN.md`.
