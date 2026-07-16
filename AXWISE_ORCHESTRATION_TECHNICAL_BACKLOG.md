---
type: Engineering Backlog
title: "AxWise Cognitive Orchestration Technical Backlog"
description: "Prioritized, repository-specific implementation epics and acceptance criteria for the AxWise orchestration roadmap."
tags: [axwise, orqaly, backlog, engineering, orchestration, assignment]
timestamp: 2026-07-16T12:00:00Z
---

# AxWise cognitive orchestration technical backlog

## How to use this backlog

This document breaks `AXWISE_ORCHESTRATION_DEVELOPMENT_ROADMAP.md` into implementation epics. Check an item only after its acceptance evidence exists. Priorities mean:

- **P0** — required for trustworthy development or contract safety.
- **P1** — required for the first useful orchestration product slice.
- **P2** — required for differentiated multi-agent operation and learning.
- **P3** — ecosystem, advanced intelligence, and scale work after product proof.

Do not start learned ranking or a broad UI before the generic contract, persistence, and evaluation baseline are stable.

## Existing foundation to preserve

- [x] Durable tenant-scoped A+B job record and idempotency.
- [x] Dedicated A+B worker entry point and stale-run recovery.
- [x] Pipeline A+B evidence-audit and persistence ordering.
- [x] Signed terminal webhook implementation with bounded retries.
- [x] Initial customer-persona and execution-persona resolution.
- [x] Explicit `requires_orqaly_authorization` boundary.

These checks mean code exists in the repository. They do not certify a current deployment.

## Epic 0 — repository and CI baseline

Priority: **P0**

Target areas: `backend/tests/`, `frontend/`, `packages/axwise-mcp-connector/`, `.github/workflows/`, `docker-compose.yml`.

- [x] Fix or retire the 14 backend test modules importing removed routes, services, or models.
- [x] Add pytest markers for `unit`, `contract`, `integration`, `live`, `manual`, and `llm` tests.
- [x] Convert `backend/tests/test_orqaly_conditions_evaluation.py` to an ASGI/TestClient contract test.
- [ ] Keep live endpoint verification in a separately invoked smoke test with timeouts and explicit environment requirements.
- [x] Add a frontend `vitest.config.ts` and Vitest setup file.
- [x] Replace Jest-only globals/mocks or deliberately configure compatible types; do not mix runners accidentally.
- [x] Fix Next metadata duplication, Clerk option drift, API type exports, component strictness errors, and stale generated `.next` types.
- [ ] Generate or validate frontend API types from the backend OpenAPI contract.
- [ ] Add MCP tests for tool discovery, authentication headers, request schemas, backend errors, and successful calls.
- [x] Add the hybrid worker service and health check to Compose.
- [x] Add CI jobs for backend collection/tests, migrations, frontend type-check/tests/build, MCP build/tests, and Compose validation.
- [x] Put legacy mock `/twins/*` routes behind `ENABLE_DEMO_TWIN_ROUTES=false` by default or remove them.

Acceptance:

- `pytest --collect-only` completes without errors.
- The default backend suite has no dependency on a manually started localhost server.
- Frontend type-check, test, and production build commands pass.
- MCP build and contract tests pass against implemented backend routes.
- A clean checkout can start the documented local stack and process one queued A+B job.

## Epic 1 — orchestration domain contracts

Priority: **P0/P1**

Proposed files:

```text
backend/domain/orchestration/models.py
backend/domain/orchestration/enums.py
backend/domain/orchestration/ports.py
backend/domain/orchestration/validation.py
backend/tests/orchestration/contract/
```

- [ ] Define `TaskEnvelopeV1` with objective, desired outcome, constraints, deadline, context references, and data classification.
- [ ] Define verified tenant, agent, tool, policy, approval, and budget models.
- [ ] Define direct, evidence-assisted, research-assisted, sequential, parallel, supervisor, human-controlled, and recovery modes.
- [ ] Define `AssignmentFactor`, `EvidenceReference`, `ContextPackage`, `ApprovalGate`, and `Fallback` models.
- [ ] Define `PlanNode` and `ExecutionPlan` with stable identifiers and typed input/output contracts.
- [ ] Define `OrchestrationDecisionV1`, `ReplanRequestV1`, and `ExecutionOutcomeV1`.
- [ ] Validate that browser-provided fields cannot assert authority, ownership, permission, or secret values.
- [ ] Publish JSON Schema and OpenAPI examples for at least five domains.
- [ ] Add forward/backward compatibility tests and reject unknown breaking contract versions.

Acceptance:

- The same top-level schema validates software, support, compliance, marketing, and finance fixtures.
- No required field assumes research, software development, or a particular vertical.
- Every decision carries contract and scorer versions plus `requires_orqaly_authorization: true`.

## Epic 2 — decision API and immutable persistence

Priority: **P1**

Proposed files:

```text
backend/api/routes/orchestration.py
backend/services/orchestration/decision_service.py
backend/infrastructure/persistence/orchestration_repositories.py
backend/migrations/versions/<revision>_add_orchestration_decisions.py
backend/tests/orchestration/integration/
```

- [ ] Implement create, retrieve, replan, and outcome routes under `/api/orqaly-axwise/v1/orchestration`.
- [ ] Reuse constant-time M2M authentication and persisted tenant mapping through extracted shared dependencies.
- [ ] Add tenant-scoped durable idempotency and canonical request hashing.
- [ ] Persist immutable input snapshot, decision, versions, factor values, evidence references, and audit events.
- [ ] Add plan-node, outcome, evaluation-run, performance-snapshot, and outbox tables.
- [ ] Add repository methods that require tenant identity in every query.
- [ ] Add retention and deletion metadata without destroying required audit linkage.
- [ ] Add migration upgrade/downgrade and PostgreSQL integration tests.

Acceptance:

- Cross-tenant decision reads, replans, and outcomes return no information.
- Identical retries return the original decision; changed input with the same key conflicts.
- Replanning creates a linked immutable decision.
- Audit reconstruction reproduces the exact request, versions, factors, and output.

## Epic 3 — task understanding and uncertainty router

Priority: **P1**

Proposed files:

```text
backend/services/orchestration/task_classifier.py
backend/services/orchestration/uncertainty_router.py
backend/services/orchestration/policy_annotator.py
backend/tests/orchestration/unit/test_task_classifier.py
backend/tests/orchestration/unit/test_uncertainty_router.py
```

- [ ] Normalize objective, outcome, domain, urgency, consequence, reversibility, stakeholders, and capability requirements.
- [ ] Separate deterministic rules, model inference, and unverified input in the result.
- [ ] Calculate evidence sufficiency and value-of-information signals.
- [ ] Implement direct, existing-evidence, A/B/A+B research, and human-clarification choices.
- [ ] Enforce per-mode budgets, deadlines, timeouts, and maximum expansion.
- [ ] Make high-consequence ambiguity escalate rather than silently guessing.
- [ ] Add calibration fixtures and adversarial cross-domain cases.

Acceptance:

- Clear tasks stay on the direct path.
- Missing authority never triggers an executable recommendation.
- Research selection is explainable and bounded by value, cost, and time.
- Contradictory or insufficient evidence produces an explicit uncertainty state.

## Epic 4 — explainable assignment scorer

Priority: **P1**

Proposed files:

```text
backend/services/orchestration/assignment_scorer.py
backend/services/orchestration/capability_registry.py
backend/config/orchestration/
backend/tests/orchestration/evaluation/test_assignment_baselines.py
```

- [ ] Replace token-overlap selection as the primary production scorer.
- [ ] Add hard eligibility filters for tenant ownership, availability, tools, policy, data access, and required approvals.
- [ ] Add versioned features for capability coverage, relevant outcomes, stakeholder fit, collaboration fit, risk, cost, and latency.
- [ ] Represent missing values separately from average or poor performance.
- [ ] Return factor contributions, exclusions, alternatives, confidence, and calibration metadata.
- [ ] Add configurable capability aliases and domain packs without changing scorer code.
- [ ] Implement deterministic baseline scorers: round-robin, capability-only, and weighted rules.
- [ ] Add offline ranking metrics and minority-task/fairness slices.

Acceptance:

- An ineligible agent cannot outrank an eligible candidate.
- The same input and version replay deterministically.
- Explanations identify every material factor and hard exclusion.
- Evaluation demonstrates benefit over token overlap and simple baselines before promotion.

## Epic 5 — optional evidence and A+B adapters

Priority: **P1/P2**

Proposed files:

```text
backend/services/orchestration/adapters/evidence_adapter.py
backend/services/orchestration/adapters/hybrid_research_adapter.py
backend/tests/orchestration/integration/test_research_assisted_decision.py
```

- [ ] Wrap existing evidence services behind a typed retrieval port.
- [ ] Wrap `HybridRunService` behind a research-tool port rather than invoking its HTTP route internally.
- [ ] Pass decision and tenant correlation identifiers through A+B jobs.
- [ ] Label empirical, inferred, and synthetic evidence separately.
- [ ] Re-score after evidence completion and record factor/rank changes.
- [ ] Implement timeout, cancellation, no-result, low-quality, and partial-result fallbacks.
- [ ] Prevent A+B from being the default route.

Acceptance:

- Direct tasks complete without research dependencies.
- Research-assisted decisions remain durable and resumable.
- Evidence provenance and synthetic status survive into the final decision.
- Failed research cannot silently become high-confidence assignment.

## Epic 6 — multi-agent planner and replanning

Priority: **P2**

Proposed files:

```text
backend/services/orchestration/team_planner.py
backend/services/orchestration/plan_validator.py
backend/services/orchestration/replanning_service.py
backend/tests/orchestration/unit/test_plan_validator.py
backend/tests/orchestration/integration/test_replanning.py
```

- [ ] Implement single-agent, sequential, parallel, supervisor, and human-controlled templates.
- [ ] Select team members subject to capability coverage, separation of duties, collaboration, budget, and policy.
- [ ] Add node dependencies, input/output contracts, reviewers, completion criteria, and fallbacks.
- [ ] Validate acyclic graphs, reachable nodes, complete outputs, and total budget.
- [ ] Replan on agent unavailability, tool failure, rejected output, budget change, and human override.
- [ ] Produce a plan feasibility request that Orqaly can validate against live state.
- [ ] Preserve parent decision, reason, and changed factors in every replan.

Acceptance:

- At least three cross-domain plans execute against an Orqaly test double.
- Injected failures exercise retry, substitute-agent, plan-change, and human-escalation paths.
- No plan can bypass an approval or assign a tool the agent is not authorized to use.

## Epic 7 — outcome ingestion and learning

Priority: **P2**

Proposed files:

```text
backend/services/orchestration/outcome_service.py
backend/services/orchestration/evaluation_service.py
backend/services/orchestration/scorer_registry.py
backend/tests/orchestration/evaluation/
```

- [ ] Ingest idempotent decision-level and node-level execution receipts.
- [ ] Capture authorization rejection, quality, cost, latency, rework, escalation, override, acceptance, and failure taxonomy.
- [ ] Define normalized success metrics per task class while preserving raw observations.
- [ ] Build offline replay, shadow comparison, calibration, drift, and rollback tooling.
- [ ] Require human-reviewed scorer promotion with stored evaluation evidence.
- [ ] Protect against popularity bias, sparse-history overconfidence, gaming, and cross-tenant leakage.
- [ ] Add scheduled evaluation reports and regression gates.

Acceptance:

- A controlled test proves that outcomes can change a later ranking and that rollback restores the previous behavior.
- Unsafe, unfair, or materially more expensive scorer versions cannot be promoted.
- Every learned feature has tenant, time-window, provenance, and version metadata.

## Epic 8 — Orqaly, MCP, and operator experience

Priority: **P2/P3**

- [ ] Define an Orqaly catalogue adapter for current agents, tools, availability, policy, performance, and budgets.
- [ ] Define plan-feasibility and authorization-rejection contracts.
- [ ] Define execution receipt, progress, failure, override, and completion contracts.
- [ ] Replace digital-twin-only MCP tools with task decision, decision inspection, evidence request, and outcome submission tools.
- [x] Align MCP authentication and routes with the published backend contract.
- [ ] Add operator views for decision factors, alternatives, evidence, plan graph, approvals, outcomes, replay, and comparison.
- [ ] Keep browser clients away from M2M secrets and authority construction.

Acceptance:

- Orqaly can accept, reject, execute, report, and request replan through contract-tested flows.
- MCP tools call real routes and expose bounded schemas.
- Operators can explain why an assignment occurred and what changed after an override or replan.

## Epic 9 — security, reliability, science, and OSS readiness

Priority: **P2/P3**

- [ ] Extract shared auth dependencies and support safe key rotation.
- [ ] Replace in-memory Conditions idempotency with tenant-scoped durable storage where the endpoint requires replay safety.
- [ ] Add a durable webhook outbox, event delivery state, replay protection, and deduplication tests.
- [ ] Add rate limits, payload limits, context classification, retention, deletion, and audit export.
- [ ] Add threat models for prompt injection, poisoned outcomes, agent impersonation, authority forgery, SSRF, and cross-tenant retrieval.
- [ ] Add chaos tests for database, worker, model, tool, callback, and partial-plan failures.
- [ ] Publish OCEAN and synthetic-persona sources, methodology, licenses, limitations, calibration, and bias analysis.
- [ ] Define stable extension interfaces for agent adapters, tool adapters, domain packs, policies, and evaluators.
- [ ] Document the OSS versus managed/enterprise capability boundary.

Acceptance:

- Independent review can reconstruct authorization and data flows.
- Failure exercises do not lose decisions or publish false completion.
- Scientific claims are reproducible or explicitly limited.
- An external contributor can implement and test an adapter without editing orchestration-core code.

## Dependency order

```text
Epic 0
  -> Epic 1
  -> Epic 2
  -> Epic 3 + Epic 4
  -> Epic 5
  -> Epic 6
  -> Epic 7
  -> Epic 8 + Epic 9
```

Security, observability, evaluation fixtures, and Orqaly contract design should run continuously, but production learning depends on stable decisions and outcomes.

## First three implementation milestones

1. **Green baseline:** clean collection, frontend checks, MCP contract tests, worker in Compose, mock routes isolated.
2. **Decision v1:** one generic API, durable decision records, direct routing, explainable weighted assignment, five-domain fixtures.
3. **Differentiated pilot:** optional A+B, multi-agent plan and replan, Orqaly execution receipts, baseline comparison across three domains.

## Explicitly not first

- Autonomous online self-training.
- A visual workflow builder competing with Orqaly.
- More digital-twin demonstration routes.
- Hundreds of domain-specific endpoints.
- Unverified scientific or market claims.
- A broad marketplace before the decision and outcome contracts are stable.
