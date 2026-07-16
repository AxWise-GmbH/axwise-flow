---
type: Technical Documentation
title: "AxWise Orchestration Phase 2"
description: "Implemented uncertainty classification, value-of-information routing, evidence adapters, bounded A+B research, immutable refresh, and failure handling."
tags: [axwise, orqaly, orchestration, evidence, research, uncertainty, phase-2]
timestamp: 2026-07-16T17:00:00Z
---

# AxWise orchestration Phase 2

Phase 2 is implemented in this repository. It extends the Phase 1 direct-assignment decision with deterministic uncertainty classification and an economic choice between:

- direct assignment;
- assignment using already-authorized evidence;
- bounded asynchronous A+B research;
- human clarification.

The product boundary remains:

> **AxWise recommends and explains. Orqaly revalidates, authorizes, and executes.**

Every result still contains `requires_orqaly_authorization: true`. This document describes repository state, not a deployed production environment.

## API lifecycle

### Create and route a decision

```text
POST /api/orqaly-axwise/v1/orchestration/decisions
```

The authenticated request can now include:

- an `evidence_catalogue` containing bounded, reference-only evidence metadata;
- `research_policy` thresholds and stop conditions;
- an optional `research_brief` that can be used only when hybrid research is explicitly enabled.

OpenAPI publishes a bounded-research example alongside the five Phase 1 domain examples.

The router evaluates the task before assignment scoring. Clear tasks remain synchronous and do not enqueue or execute A+B research. Sufficient existing evidence produces `evidence_assisted`. Research with positive expected value produces an immutable `research_assisted` decision with `pending_research` status, a durable A+B `job_id`, no recommended agent, no executable plan node, and confidence `0`.

### Resume and immutably rescore

```text
POST /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/research/refresh
```

The refresh call uses the same M2M key, exact organization/user headers, and a new `Idempotency-Key`.

| Response | Meaning |
|---|---|
| `202 Accepted` | The durable research job is still queued or running. The original immutable decision is returned. |
| `201 Created` | Research reached a terminal state and a new linked immutable decision was persisted. |
| `200 OK` | The same completed refresh was retried and the existing linked decision was returned. |
| `404 Not Found` | The exact external organization/user cannot access the parent decision. |
| `409 Conflict` | The decision has no research job or the idempotency key changed meaning. |

The parent record is never rewritten. The new decision contains `parent_decision_id`, terminal research status, evidence references, refreshed rankings, and `ranking_changes` showing which agent rank or score changed.

## Deterministic task and uncertainty signals

Router version `deterministic-voi-v1.0.0` uses explicit inputs and rules; Phase 2 makes no hidden LLM classification call.

| Signal | Deterministic inputs |
|---|---|
| Ambiguity | Objective and outcome specificity, generic language, explicit capability requirements, and named stakeholders. |
| Evidence sufficiency | Relevance, quality, provenance, verification source, and contradiction penalty. |
| Stakeholder sensitivity | Stakeholder count/type and data classification. |
| Consequence | Risk, reversibility, and requested actions. |
| Deadline pressure | Remaining time until the supplied task deadline. |
| Uncertainty | Weighted ambiguity, unresolved evidence need, contradiction, and deadline pressure. |
| Value of information | Expected uncertainty reduction and stakeholder/consequence value minus cost and latency penalties. |

Each published signal identifies whether it came from a deterministic rule, verified operational evidence, or unverified caller input. No raw model confidence is presented as a calibrated probability.

Calibration bands and their labeled regression fixtures are versioned in:

```text
backend/config/orchestration/routing.json
backend/config/orchestration/calibration_fixtures.json
```

These fixtures protect rule behavior and uncertainty bands. They are not yet statistical probability calibration on production outcomes; that remains Phase 4 work.

## Routing rules

### Direct

Direct assignment is selected when the task is sufficiently clear, verified catalogue authority is present, unresolved evidence need is below the clarification threshold, and additional evidence has insufficient expected value.

A clear task never invokes A+B, even when a research adapter exists.

### Existing evidence

Existing evidence is selected before new research when its contradiction-adjusted sufficiency meets the request threshold. Evidence-derived capability hints can affect preferred-capability scoring, but they cannot bypass Phase 1 hard eligibility.

The SQL evidence adapter only resolves explicit references owned by the mapped AxWise workspace:

- `analysis_result` or `research_result` references;
- interview or transcript references.

Raw documents and unrestricted source text are not copied into the decision JSON. The audit record retains reference, content hash, classification, provenance, relevance, quality, verification source, and contradiction state.

The stored `input_snapshot` is the canonical evaluated input, so it includes evidence metadata resolved from authorized references and can be replayed during refresh. The `request_hash` remains the canonical caller-submitted payload identity used for idempotency; evidence resolved after receipt does not make an otherwise identical retry conflict.

### Bounded A+B research

A+B research is not a default. It requires all of the following:

- `allow_hybrid_research: true`;
- a research brief;
- remaining research iterations;
- explicit cost budget and estimate;
- explicit latency budget and estimate;
- value of information at or above the configured threshold;
- sufficient time before the task deadline.

The adapter passes the decision ID, organization, external user, internal workspace, and a derived durable idempotency key into `HybridRunService`. The existing standalone worker executes the job.

Expansion is bounded by maximum iterations and maximum evidence items across the combined existing-and-research catalogue. When the combined catalogue exceeds the cap, deterministic contribution ordering selects the retained items while contradictory evidence is retained first for safety. A queued/running job that exceeds the research latency limit is tenant-safely cancelled and returned as `timed_out`.

### Human clarification

Human clarification is required when:

- authority or required catalogue state is missing;
- high-consequence work is materially ambiguous;
- consequential evidence is contradictory;
- unresolved uncertainty remains but research is unauthorized, over budget, too slow, exhausted, or missing a brief;
- research fails or produces no usable evidence.

Human clarification publishes no executable plan and confidence remains `0`.

## Evidence provenance and verification

Evidence keeps two independent dimensions:

| Field | Meaning |
|---|---|
| `provenance` | `operational`, `empirical`, `inferred`, or `synthetic`. |
| `verification_source` | `none`, `orqaly_asserted`, or `axwise_audit`. |

An exact-offset audit can therefore mark synthetic evidence as AxWise-audited without misrepresenting it as an operational fact. Guardrails explicitly prohibit presenting synthetic evidence as verified operational reality.

## Research terminal states and fallbacks

| State | Decision behavior |
|---|---|
| `completed` | Re-evaluate evidence sufficiency and rescore eligible agents. |
| `partial` | Preserve the warning and evidence; route only if the usable evidence independently meets thresholds. |
| `low_quality` | Human clarification; evidence remains visible but confidence is `0`. |
| `no_result` | Human clarification with an explicit no-evidence reason. |
| `failed` | Human clarification with the bounded failure reason. |
| `cancelled` | Human clarification; never reuse stale provisional ranking as a confident result. |
| `timed_out` | Cancel the tenant-owned run and require clarification or a new bounded decision. |

Failed or weak research can never silently turn into a high-confidence assignment.

## Verification coverage

The supported suite now covers:

- five clear domains that never default to research;
- positive value-of-information research selection;
- cost, latency, near-deadline, iteration, and expansion limits;
- a hard cap across the combined existing-and-research evidence catalogue;
- sufficient existing evidence;
- consequential contradiction and high-consequence ambiguity;
- direct-path proof that the research adapter is never called;
- durable pending decisions with no executable assignment;
- authenticated `202` refresh, linked `201` rescore, idempotent `200`, and cross-user `404`;
- rank changes after evidence-derived capability signals;
- timeout cancellation, terminal cancellation, failure, no result, low quality, and partial results;
- workspace isolation for persisted analysis evidence;
- empirical, operational, inferred, and synthetic provenance behavior;
- labeled calibration-band regression fixtures.

Run:

```bash
backend/venv/bin/python -m pytest -q backend/tests/orchestration
backend/venv/bin/python -m pytest -q
```

The exact current counts should be taken from the test output rather than copied into release marketing.

## Explicit Phase 2 limitations

Phase 2 does not yet claim:

- a learned uncertainty model or statistically calibrated assignment confidence;
- autonomous broad search over a tenant's full knowledge base;
- independent Pipeline A versus Pipeline B versus A+B method selection;
- multi-agent team plans, dependency graphs, or general replanning;
- execution-outcome ingestion or learning from production results;
- atomic database/outbox coordination between research enqueue and decision persistence;
- PostgreSQL integration, deployed latency, or a production release SLO.

Multi-agent planning and immutable replanning are implemented separately under Phase 3. Outcomes, learning, and enterprise hardening remain Phases 4–5. The enqueue-before-decision-persist window is specifically a later outbox/reliability hardening item; a failed decision write can leave a safely tenant-scoped but orphaned research job.
