---
type: Technical Documentation
title: "AxWise Orchestration Phase 1"
description: "Implemented domain-neutral direct assignment contract, scoring model, API, persistence, and verification boundary."
tags: [axwise, orqaly, orchestration, assignment, api, phase-1]
timestamp: 2026-07-16T15:00:00Z
---

# AxWise orchestration Phase 1

Phase 1 is implemented in this repository. It provides a domain-neutral, explainable decision service for choosing one eligible agent or escalating the assignment to a human-controlled path.

The product boundary is unchanged:

> **AxWise recommends. Orqaly revalidates, authorizes, and executes.**

Every response therefore contains `requires_orqaly_authorization: true`. A recommendation is never proof of current permission, ownership, availability, budget approval, or tool authorization.

This document describes repository state, not deployment state. A target environment still needs the current migration, M2M key, active tenant mappings, and an authenticated smoke test.

## Implemented API

All routes require the server-to-server `x-axwise-key` header.

| Route | Purpose | Tenant input |
|---|---|---|
| `POST /api/orqaly-axwise/v1/orchestration/decisions` | Create and persist an immutable decision. | Verified `tenant.userId` and `tenant.orgId` in the strict request body. |
| `GET /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}` | Retrieve the exact tenant-owned input snapshot and decision. | `X-Orqaly-Org-ID` and `X-Orqaly-User-ID` headers. |
| `GET /api/orqaly-axwise/v1/orchestration/schemas/decision-request-v1` | Retrieve the published request JSON Schema. | M2M authentication; no decision data is returned. |

Creation also requires a non-empty `Idempotency-Key`. `X-Request-ID` is recommended for trace correlation. The create route returns:

- `201 Created` for a new immutable decision;
- `200 OK` and `reused: true` for an identical retry;
- `409 Conflict` if the same tenant and idempotency key are reused with changed input.

Five complete request examples are exposed in OpenAPI: software incident, customer escalation, compliance review, marketing preparation, and finance analysis.

## Input and output idea

The versioned `DecisionCreateRequestV1` input contains:

- the verified external tenant identity;
- a `TaskEnvelopeV1` with objective, desired outcome, domain, constraints, context references, classification, risk, urgency, reversibility, capabilities, tools, actions, stakeholders, and deadline;
- point-in-time agent and tool catalogues supplied by the authenticated Orqaly backend;
- policy and approval context;
- cost and latency budgets.

The immutable output contains:

- contract and scorer versions plus request hash;
- normalized task class and capability requirements;
- the selected routing mode and decision status;
- ranked candidates, hard exclusion reasons, factor contributions, and missing-data states;
- the recommended agent when one is eligible;
- a typed one-node direct execution plan, context package, guardrails, approval points, and fallbacks;
- the exact input snapshot used to make the decision;
- `requires_orqaly_authorization: true`.

Strict models reject unknown fields, including attempts to add undeclared authority or secret claims. Contract version `1.0` is accepted; an omitted version defaults to compatible v1, while unknown breaking versions are rejected.

## Eligibility before ranking

AxWise first applies hard eligibility rules. An agent is excluded if any applicable rule fails:

- agent and required tools must belong to the verified organization catalogue;
- the agent must be available and not denied by policy;
- all required capabilities and tools must be present;
- agent and tool data-classification limits must permit the task;
- agent risk clearance must permit the task;
- requested actions must not be prohibited and must fit the required tools' action scopes;
- required tools must be available and not denied by policy;
- agent cost and latency estimates must not exceed explicit budgets.

An excluded candidate receives `eligible: false`, score `0`, and explicit `exclusion_reasons`. High success, low cost, or any other positive score cannot override a hard exclusion.

## Weighted direct-assignment scorer

Eligible candidates are compared with the versioned `weighted-direct-v1.0.0` scorer:

| Factor | Weight |
|---|---:|
| Required capability coverage | 0.35 |
| Preferred capability coverage | 0.15 |
| Required-tool readiness | 0.15 |
| Relevant success rate | 0.15 |
| Cost efficiency | 0.08 |
| Stakeholder fit | 0.07 |
| Latency efficiency | 0.05 |

Every factor contains its value, weight, contribution, status, and human-readable reason. Missing history, budget, latency, or stakeholder data is represented as `missing`; it is not silently treated as average performance. Ties are resolved by stable agent ID ordering, so the same contract and scorer version replay deterministically.

Capabilities are normalized through configuration-driven aliases and domain packs in `backend/config/orchestration/capabilities.json`. New vocabulary can be introduced without adding a vertical-specific field to the top-level contract.

## Direct versus human-controlled routing

Phase 1 deliberately supports the smallest useful routing choice:

- `direct` recommends an eligible agent and a one-node execution plan when no configured approval condition applies;
- `human_controlled` still explains the best eligible recommendation but adds an approval gate when risk exceeds policy, the task is irreversible, a requested action requires approval, or a required tool requires approval;
- `human_controlled` also becomes the explicit fallback when no eligible agent exists, with no executable plan node.

Orqaly must recheck the point-in-time catalogue and all permissions before using either result. Rejection should trigger the returned replan or human-escalation fallback, not forced execution.

## Immutable persistence and audit

Migration `20260716_orchestration_v1` creates:

- `orchestration_decisions`, containing the tenant-scoped canonical input, output, hash, versions, result summary, retention metadata, and soft-deletion metadata;
- `orchestration_events`, containing the append-only `decision.created` audit event.

Reads require the external organization, exact external user, and resolved internal AxWise user. Idempotency is unique within the Orqaly organization, but an existing retry record is only returned to the external user that created it; another mapped user receives a conflict without the decision payload. The stored request hash is calculated from canonical JSON so field ordering does not alter request identity.

The Phase 1 audit record reconstructs the exact decision request, versions, factors, exclusions, and output. Plan-node, outcome, evaluation-run, performance-snapshot, and delivery-outbox tables remain later-phase work.

## Cross-domain proof

The same contract and service are tested against five materially different fixtures:

| Domain | Example decision boundary |
|---|---|
| Software operations | Route an incident using incident-response capabilities and permitted operational tools. |
| Customer support | Assign a customer escalation using support and stakeholder-fit signals. |
| Compliance | Recommend a reviewer but require human control for consequential risk. |
| Marketing | Assign campaign preparation without introducing marketing-only contract fields. |
| Finance | Recommend an analyst while preserving classification, tool, risk, and approval constraints. |

The contract test suite also proves tenant-isolated retrieval, durable retry semantics, immutable audit data, unknown-version rejection, no-eligible-agent escalation, and deterministic rankings.

## Local direct-path benchmark

The repository benchmark command is:

```bash
backend/venv/bin/python -m backend.scripts.benchmark_orchestration_direct --iterations 1000 --warmup 100
```

One local run on 2026-07-16 measured the in-process deterministic scorer at approximately `0.027 ms` p95 and `$0` external-model cost. This measurement excludes HTTP parsing, authentication, tenant lookup, database writes, network latency, and infrastructure contention. It is evidence for the scorer's direct path, not a production SLO or deployment performance claim.

## Verification

Run the supported Phase 1 checks with:

```bash
backend/venv/bin/python -m pytest -q backend/tests/orchestration/contract/test_orchestration_decisions.py
backend/venv/bin/python -m pytest -q
backend/venv/bin/python -m alembic heads
```

Current repository evidence retains 14 passing Phase 1-specific contract cases, one Alembic head, and a CI-enforced SQLite upgrade/downgrade rehearsal for the Phase 1 revision. The total supported backend count grows as later phases add coverage and should be read from current pytest output. Historical quarantined tests are not release evidence, and the SQLite rehearsal is not a substitute for PostgreSQL integration testing.

## Explicit non-goals for Phase 1

Phase 1 does not yet claim:

- value-of-information routing to existing evidence or A+B research;
- multi-agent team construction, dependency planning, or execution recovery;
- replan or execution-outcome API routes;
- learning from outcomes, calibrated confidence, baseline superiority, or fairness evaluation;
- a live Orqaly plan-feasibility adapter or orchestration MCP tools;
- production PostgreSQL migration rehearsal, deployed latency, or a release SLO.

Those capabilities remain sequenced in Phases 2–5 of `AXWISE_ORCHESTRATION_DEVELOPMENT_ROADMAP.md`.
