---
type: Engineering Specification
title: "AxWise Orchestration Phase 4 — Outcomes, Evaluation, and Safe Learning"
tags: [axwise, orqaly, outcomes, evaluation, learning, governance]
timestamp: 2026-07-18T10:00:00Z
---

# AxWise orchestration Phase 4

## Outcome

Phase 4 closes the audited loop without giving AxWise execution authority:

```text
context decision -> plan/team decision -> Orqaly authorization/execution
       -> immutable outcome + node receipts -> versioned evaluation
       -> offline human-reviewed scorer candidate -> promote or rollback
```

Orqaly remains the source of truth for execution. AxWise stores observations and derives evaluation metrics; it never marks Orqaly work complete or changes a scorer automatically.

## API

```text
POST /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/outcomes
GET  /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/outcomes
GET  /api/orqaly-axwise/v1/orchestration/schemas/execution-outcome-v1
```

All calls require `x-axwise-key` plus exact `X-Orqaly-Org-ID` and `X-Orqaly-User-ID` headers. POST also requires a stable `Idempotency-Key`. An identical retry returns `200` with `reused: true`; changed meaning under the same key returns `409`; cross-tenant lookup returns `404`.

The outcome contract captures:

- authorization and execution status;
- task success, quality, stakeholder acceptance, cost, currency, and latency;
- rework, escalation, human override with reason, and failure taxonomy;
- per-node attempt receipts with owner, status, timestamps, quality, cost, tokens, rework, escalation, and failure details.

Outcome and receipt identifiers are unique inside the exact Orqaly organisation/user tenant rather than globally. Currency is validated against the immutable decision budget; a mismatched currency is preserved for audit but receives `currency_mismatch`, no cost comparison, and can never become a promotable observation.

Every receipt node must exist in the immutable decision plan. Its agent must be the assigned owner or reviewer unless the receipt explicitly records a human override. Unknown nodes and silent owner substitutions are rejected.

## Stored records

Migration `20260718_1000_add_orchestration_outcomes.py` adds:

| Table | Purpose |
|---|---|
| `orchestration_outcomes` | Immutable raw outcome plus derived evaluation, tenant, request hash, decision/scorer version, and normalized metrics. |
| `orchestration_execution_receipts` | Append-only plan-node execution attempts. |
| `orchestration_scorer_versions` | Tenant-scoped candidate/active/retired/rolled-back configurations and stored human-reviewed evaluation evidence. |

Each accepted outcome also appends `outcome.received` to `orchestration_events`.

## Evaluation

`outcome-evaluator-v1.0.0` keeps raw observations separate from derived metrics. It computes bounded normalized success and explicit cost/latency deltas against the immutable plan. Safety flags include incomplete authorization, failure/cancellation/escalation, low quality or acceptance, material cost/latency overrun, rework, escalation, override, and node failure.

`promotable_observation` means only that a single observation is safe to include in an offline candidate dataset. It does not promote anything.

## Safe learning and rollback

The default production scorer remains `weighted-direct-v1.0.0`. Outcome learning is inactive until an operator:

1. registers a tenant-scoped candidate with all published weights, a minimum sample floor, and time window;
2. evaluates it offline/shadow against a named dataset and baseline;
3. stores a tenant-bound report covering the governed parent baseline, overall success, cost, calibration, drift, minority-task slices, and safety regressions;
4. supplies a human reviewer identity and promotes only a blocker-free report.

Promotion is rejected for the wrong tenant or parent baseline, insufficient samples, overall or minority-slice success regression, material cost increase, calibration regression, drift, or any safety regression. The registry recomputes its non-negotiable gates and does not trust a caller-supplied `passed` flag. Active versions may derive `relevant_success_rate` only from the same tenant's promotable immutable outcomes. When node receipts exist, the observation is attributed to the agent that actually completed the node; decision-level attribution is only the fallback for outcomes without receipts. Multiple attempts by the same agent in one outcome count as one observation, preventing retries from inflating the learning sample. Every injected feature records tenant, time window, sample count, provenance, and scorer version in the resulting decision.

Rollback disables the active candidate and restores its governed parent or the immutable baseline. No online self-modification exists.

## Orqaly integration

At goal completion, Orqaly builds the decision-level outcome and terminal node receipts from `team_tasks`. It submits them best-effort and stores the returned evaluation summary under `goal.data.axwise_outcome`. An AxWise outage cannot change Orqaly's completed status.

Shadow decisions are reported as not fully authorized, so their execution is observable for comparison but is not attributed as a safe learned result of an applied AxWise assignment.

## Verification

The orchestration suite covers:

- idempotent outcome retry and changed-payload conflict;
- exact tenant isolation and append-only outcome audit events;
- plan-node and assigned-agent receipt validation;
- normalized success and promotion-safety flags;
- currency mismatch and tenant/baseline promotion rejection;
- three-observation tenant-scoped feature learning;
- human-reviewed scorer promotion changing a later ranking;
- rollback restoring the baseline ordering;
- unsafe, unfair, or materially more expensive candidates being blocked;
- Phase 4 migration upgrade/downgrade;
- Orqaly direct/research/clarification routing and outcome builders.

Run:

```bash
DATABASE_URL=sqlite:////tmp/axwise-tests.db backend/venv/bin/python -m pytest -q backend/tests/orchestration
```

## Remaining proof, not hidden scope

The mechanism is implemented; a 10/10 market claim still requires scheduled production-like replay reports, statistically meaningful samples, and pilots beating manual, round-robin, capability-only, and general-LLM baselines on customer-relevant quality, time, cost, rework, escalation, or acceptance. Phase 4 deliberately prevents code completion from being misrepresented as measured superiority.
