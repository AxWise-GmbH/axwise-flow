# E2E Implementation & Verification Plan: Orqaly ↔ AxWise Flow Engine Integration

This plan outlines the design, implementation, and verification steps for the secure service-to-service integration gateway on the AxWise side.

---

## 1. Architectural Strategy & Design Rules

* **Service-to-Service Authentication**: Instead of user-level OAuth, Orqaly communicates with AxWise machine-to-machine. Authentication is validated using the secure `x-axwise-key` header.
* **Point-Specific Dispatching**: A single greenfield endpoint `POST /api/orqaly-axwise/v1/conditions/evaluate` serves as the entry point, routing requests internally based on the `payload.integrationPoint` parameter.
* **Separation of Grounding Phase**: Grounding is handled as an asynchronous, post-hoc call (`IntegrationPoint.COPILOT_GROUND`). It compares the draft assistant response (rather than the user prompt) against provided resource contents to map character-level offsets via `RapidFuzz`.
* **Fail-Closed Security Posture**: In case of runtime errors (`meta.degraded = true`), the `agent.generate` point returns a strict `denied` verdict to prevent authorization bypasses on Orqaly's side.

---

## 2. API Contract & Payload Taxonomy

### Integration Points:
1. **`consilium.create`**: Generates default governance thresholds, quorum, and regulatory charter templates based on `security_level`.
2. **`agent.generate`**: Performs heuristic safety scans on system prompts and matches required skills to tools.
3. **`copilot.chat`**: Performs advisory RBAC validation, intent classification, and generates tone-perfect system prompt fragments.
4. **`copilot.ground`**: Matches sentence clauses of draft assistant responses against sources, computing precise coordinate offset boundaries.

---

## 3. Implementation Checklist

### AxWise Backend:
- [x] Declare `IntegrationPoint`, `SecurityDecision`, and `ExecutionMode` enums in `backend/api/routes/orqaly_integration.py`.
- [x] Create Pydantic request/response schemas matching the Orqaly specification contract.
- [x] Implement the service-to-service `verify_service_key` authenticator.
- [x] Implement the `RequestIDCache` idempotency tracker.
- [x] Define `_process_consilium_create` with dynamic quorum/consensus levels.
- [x] Define `_process_agent_generate` with multi-tiered injection scans.
- [x] Define `_process_copilot_chat` with advisory RBAC and intent checks.
- [x] Define `_process_copilot_ground` with RapidFuzz grounding offset mapping.
- [x] Register the unified `/conditions/evaluate` endpoint.

---

## 4. Verification & Testing Strategy

### Automatic E2E Validation Tests:
Create a dedicated test file `tests/test_orqaly_conditions_evaluation.py` to verify:
1. **Successful Authentication**: Verify that requests with valid `x-axwise-key` headers pass, and unauthorized requests return a `401`.
2. **Idempotency**: Confirm that consecutive duplicate requests retrieve cached results rather than executing calculations twice.
3. **Fail-Closed on Degradation**: Force a simulated runtime failure in `agent.generate` to verify that `degraded: true` and `scopeDecision: denied` are correctly returned.
4. **Sentence Grounding**: Verify that the RapidFuzz engine successfully calculates character-level offsets inside responses against reference sources.

---

## 5. Rollout Phases
1. **Shadow Deployment (`AXWISE_ENFORCE=shadow`)**: Run side-by-side with local heuristics in Orqaly, logging outputs for auditing.
2. **Authoritative Swap (`AXWISE_ENFORCE=authoritative`)**: Decommission local heuristics into fallbacks and transition to AxWise authoritative conditions.
