---
type: Technical Documentation
title: "AxWise Orchestration Phase 3"
description: "Implemented multi-agent team planning, graph and policy validation, Orqaly feasibility handoff, approvals, and immutable recovery replanning."
tags: [axwise, orqaly, orchestration, multi-agent, planning, recovery, phase-3]
timestamp: 2026-07-16T19:00:00Z
---

# AxWise orchestration Phase 3

Phase 3 is implemented in this repository. It extends the Phase 1–2 evidence-aware assignment decision with explicit multi-agent team plans, validation, approval gates, structured Orqaly feasibility checks, and immutable recovery decisions.

The authority boundary is unchanged:

> **AxWise recommends and explains. Orqaly validates current state, authorizes, and executes.**

Phase 3 does not make AxWise an execution engine. Every decision still contains `requires_orqaly_authorization: true`.

## Backward-compatible activation

Existing Phase 1–2 requests require no changes and keep their single-agent behavior. Team planning activates only when the authenticated Orqaly backend includes a typed `planning` object in `DecisionCreateRequestV1`.

The planning input contains:

- an explicit `single`, `sequential`, `parallel`, `supervisor`, or `human_controlled` pattern;
- one or more typed steps;
- required and preferred capabilities, tools, and requested actions per step;
- dependencies and non-empty input/output contracts;
- completion criteria and review rules;
- optional distinct-reviewer requirements;
- per-step and total budgets;
- maximum team size, collaboration tags, and separation-of-duty rules.

The strict contract rejects duplicate step identifiers, self-dependencies, unknown dependencies, and separation rules that refer to unknown steps. OpenAPI publishes a complete `multi_agent_plan` example.

## Team construction

`TeamPlanner` evaluates each step through the existing Phase 1 hard-eligibility and weighted-scoring mechanism. It then applies team constraints:

- tenant ownership and current availability;
- capability and tool coverage;
- data-classification and risk clearance;
- denied agents, denied tools, and prohibited actions;
- required collaboration tags;
- declared agent incompatibilities;
- separation of duties between named steps;
- a distinct eligible reviewer when required;
- maximum team size;
- per-step and aggregate cost/latency feasibility.

Selection is deterministic. Ties are resolved through the stable scorer ordering rather than a hidden model call.

### Supported patterns

| Pattern | Plan behavior |
|---|---|
| `single` | One explicitly contracted node, preserving direct or evidence-assisted routing. |
| `sequential` | Steps execute through an acyclic dependency chain; missing sequential dependencies are added deterministically. |
| `parallel` | Independent steps can execute concurrently; explicit dependencies remain supported. |
| `supervisor` | Work nodes are followed by a supervisor node that reviews every terminal output. |
| `human_controlled` | Every node receives an approval gate before Orqaly execution. |

## Plan-node contract and failure paths

Every generated node contains:

- a stable node identifier and owner;
- normalized required capabilities and authorized tools;
- declared dependencies;
- non-empty input and output contracts;
- explicit completion criteria;
- optional distinct reviewer and review rules;
- approval-gate references;
- estimated cost and latency;
- four bounded failure paths.

The default failure paths are:

| Trigger | Action |
|---|---|
| Transient failure | Retry once. |
| Agent unavailable | Request an eligible substitute. |
| Tool failure | Request an immutable replan. |
| Approval rejected | Escalate to a human. |

The validator requires at least one terminal replan or human-escalation path, so retries cannot loop without a reachable safe fallback.

## Validation and approval safety

`PlanValidator` independently checks the completed plan rather than trusting planner output. It rejects:

- duplicate, unknown, cyclic, or unreachable dependency state;
- missing inputs, outputs, completion signals, or failure paths;
- owners or reviewers outside the tenant catalogue;
- unavailable, denied, under-cleared, or capability-ineligible owners;
- unavailable, denied, classification-incompatible, or owner-unauthorized tools;
- requested actions not covered by the selected tools;
- missing approval gates for configured consequential actions;
- reviewer/owner identity collisions;
- collaboration, incompatibility, team-size, or separation-of-duty violations;
- unknown cost/latency where a bounded budget requires proof;
- per-request or planning-budget overruns.

A planning budget can narrow but cannot widen the top-level request budget. Currency mismatches are rejected.

## Orqaly feasibility handoff

Every plan decision publishes a typed `plan_feasibility_request` containing the decision ID, verified tenant, complete plan, and required approval-gate identifiers. The configured feasibility adapter returns:

- `feasible`;
- a source of `catalogue_snapshot` or `orqaly_live_state`;
- structured rejection codes with optional node, agent, and tool identifiers.

The repository default revalidates against the latest authenticated catalogue supplied with the request. A live Orqaly adapter can implement the same typed port. A live-state rejection changes the decision to `human_controlled`, clears recommended agents, marks the plan non-executable, preserves the proposed graph for explanation, and adds a human repair gate.

## Immutable replanning API

```text
POST /api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/replan
```

The request uses the M2M key, exact organization/user headers, and a new `Idempotency-Key`. It accepts exactly one typed operational trigger:

| Trigger | Required changed state | Behavior |
|---|---|---|
| `agent_unavailable` | Unavailable agent IDs; optional replacements. | Removes the unavailable owner and selects an eligible substitute. |
| `tool_failure` | Failed tool IDs; optional replacement tools. | Revalidates the plan with the failed tool disabled. |
| `output_rejected` | Rejected node IDs. | Adds an independent reviewer and explicit rejected-output review rule. |
| `budget_changed` | Updated budget. | Revalidates both the new top-level and planning limits. |
| `human_override` | Human instruction. | Converts the plan to human-controlled and gates every node. |

A feasible automated replan produces `routing_mode: recovery`; `execution_plan.template_mode` records the underlying single/sequential/parallel/supervisor pattern. The new decision contains `parent_decision_id` and `replan_context` with the trigger, reason, failed node, changed entities, and changed facts.

The parent decision is never updated. An identical retry returns the existing child with `200`; changed replan meaning under the same key returns `409`; an organization or exact-user mismatch returns `404` without record details.

If the changed state makes the plan infeasible, the child is still durably recorded but is `human_controlled`, has confidence `0`, contains no recommended agents, and marks its explanatory plan `executable: false`.

## Verification coverage

The supported tests cover:

- all five plan templates;
- acyclic graph and complete contract validation;
- unauthorized tools, missing fallbacks, collaboration failures, and both budget levels;
- unknown dependency and misbound approval-gate rejection without planner crashes;
- separation-of-duty and consequential-action approval gates;
- a published multi-agent OpenAPI example;
- end-to-end Orqaly execution doubles for software operations, customer support, and finance;
- live Orqaly feasibility rejection;
- agent substitution and exact parent preservation;
- tool replacement and no-tool human escalation;
- rejected-output independent review;
- reduced-budget rejection and fully gated human override;
- linked replan persistence, exact-user isolation, idempotent retry, and changed-input conflict.
- rejection of execution-state references that are outside the immutable parent snapshot.

Run:

```bash
backend/venv/bin/python -m pytest -q backend/tests/orchestration
backend/venv/bin/python -m pytest -q
```

## Explicit Phase 3 limitations

Phase 3 does not yet claim:

- that AxWise itself executes, schedules, or monitors plan nodes;
- durable per-node progress, execution receipts, or outcome ingestion;
- resume-from-completed-node behavior—without Phase 4 receipts, a replan recommends a complete replacement graph;
- a remote production Orqaly live-state deployment; the typed port and rejection behavior are implemented, while the default adapter validates the authenticated catalogue snapshot;
- globally optimal team selection; the current planner is deterministic and greedy;
- learned collaboration performance or outcome-calibrated team confidence;
- queryable plan-node tables separate from immutable decision JSON;
- PostgreSQL deployment rehearsal, atomic outbox delivery, or a production SLO.

Execution receipts, outcomes, evaluation, and safe learning remain Phase 4. Enterprise deployment hardening and operator tooling remain Phase 5.
