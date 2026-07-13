---
type: Technical Documentation
title: "Orqaly Async A+B Hybrid Integration Implementation Plan"
description: "Implementation-ready plan for exposing AxWise's evidence-audited A+B research pipeline, optional PRD deliverables, and production-grade Orqaly service integration through a durable asynchronous API."
resource: file:///Users/admin/axwise-opensource/axwise-flow-oss/ORQALY_ASYNC_HYBRID_INTEGRATION_PLAN.md
tags: [orqaly, axwise, integration, async, hybrid, personas, evidence, prd, security]
timestamp: 2026-07-13T08:39:16.432Z
---

# Orqaly Async A+B Hybrid Integration Implementation Plan

## 1. Executive decision

AxWise's synchronous `POST /api/orqaly-axwise/v1/simulate-enhanced` route is the quality reference implementation for research generation. Its A+B core is ready to be productized: Pipeline B generates psychologically varied people and interviews, and Pipeline A reconstructs evidence-grounded empirical personas with exact source quotes and audited offsets.

## Implementation status — 2026-07-13

The first AxWise implementation is complete and locally verified:

- `POST /api/orqaly-axwise/v1/simulate-enhanced-async` creates a tenant-owned queued job and returns stable `job_id` and `simulation_id` values.
- Jobs use persistent, partner-and-organization-scoped idempotency; a repeated request returns the same job and a changed request is rejected.
- `backend/scripts/run_orqaly_hybrid_worker.py` claims queued jobs outside the API process, recovers stale interrupted jobs, and runs Pipeline B with terminal publication deferred.
- Pipeline A enrichment, exact evidence auditing, result persistence, canonical `AnalysisResult` creation, optional PRD generation, and final result publication happen in that order.
- Status, result, and cancellation endpoints require both the Orqaly service key and a persisted external-tenant-to-AxWise-workspace mapping.
- Terminal webhooks are HMAC signed and retried three times when a signing secret and approved callback configuration are available.

Local end-to-end verification covered a full worker-run A+B job: `202` acceptance, idempotent retry, independent status polling, completion, durable retrieval after API restart, one empirical persona, 11 audited evidence items, 11/11 exact offset matches, and a persisted analysis deliverable.

Production API deployment and authentication were verified on 2026-07-13:

- The enhanced async route is published at `api.axwise.de`.
- AxWise now holds dedicated M2M and webhook-signing secrets in Google Secret Manager; the backend reads them from the current production revision.
- Missing and invalid keys return `401`; a valid key reaches the live request contract.

The 2026-07-13 production schema audit found that the migration is **not applied**: `orqaly_tenant_mappings` is absent and `pipeline_runs` has none of the durable A+B columns. A schema-valid async request therefore returns `500`, not the intended unmapped-tenant `403`.

Still required before the first real tenant production run: apply the migration, provision an active mapping for the real Orqaly organization/user IDs, deploy the worker as a managed process, configure the Orqaly callback/client, and complete an end-to-end tenant smoke test. Longer-term hardening remains: partner key IDs/scopes and rotation procedure, an administrative tenant-mapping workflow, and a transactional webhook outbox with durable delivery history.

The durable asynchronous architecture is implemented; do not revert the production path to the legacy Pipeline B-only `simulate-async` flow. Completion must remain gated on persisted Pipeline B and Pipeline A output so Orqaly never receives a false `completed` event or loses empirical output after an AxWise restart.

## Orqaly compatibility review — `main` at `d8a6e2d5`

A read-only review of `Orqaly/Orqaly` on 2026-07-13 established:

- No AxWise client, `x-axwise-key` call, Conditions call, or A+B job client exists in the current code.
- `src/services/copilotChatApiService.js` already sends the current message, history, organization ID, conversation ID, page context, and attachments to Orqaly's backend.
- `lib/agent-handlers/copilot.js` authenticates the Supabase user, applies the local content guard, validates the organization/conversation identifiers, and sends history into the Copilot loop.
- `lib/_shared/chat-history.js` keeps up to 40 recent turns within a 12,000-character budget and flags when earlier history was omitted.
- Forty targeted Orqaly tests passed for chat sessions, history windowing, conversation behavior, and Copilot propagation.

This proves Orqaly preserves chat context internally. It does **not** prove AxWise receives or uses it.

The live AxWise test sent the same ambiguous follow-up with two different prior histories—one finance-sensitive, one general. Both returned the same allowed/general classification. The current `_process_copilot_chat` reads only `message`, `sender_role`, and `active_twin_id`; `conversation_history` is accepted as an extra payload field but ignored.

Required chat bridge:

1. Add a server-only Orqaly module such as `lib/integrations/axwise/client.js`; never expose the key through `src/`.
2. In `handleCopilot`, call AxWise after Orqaly authentication/content guarding and before `runCopilotLoop`.
3. Build tenant identity from the verified Supabase user and validated organization. Derive the sender role server-side; never trust a client-provided role.
4. Send the already-windowed history, current message, conversation ID, page context, and active twin identifier with bounded size and explicit omission metadata.
5. Extend AxWise `_process_copilot_chat` to use prior turns when classifying ambiguous follow-ups; add a regression test where finance-sensitive prior context changes the result.
6. In shadow mode, merge only the AxWise prompt fragment/trace into observability. Promote enforcement only after agreement, latency, and false-deny measurements pass.
7. Use `copilot.ground` after a draft only when authorised source text is available. Do not send arbitrary attachment contents merely because they are present.

The A+B integration should be an explicit Orqaly research action/tool with persisted job state and progress UI. It should not run on every chat message.

Recommended public route:

```http
POST /api/orqaly-axwise/v1/simulate-enhanced-async
```

Keep the existing routes temporarily for compatibility:

- `POST /simulate-enhanced`: synchronous A+B reference and debugging route.
- `POST /simulate-async`: legacy Pipeline B-only route, explicitly labeled `pipeline_b`.
- `POST /simulate-enhanced-async`: production Orqaly A+B route.

Do not silently change the meaning of the existing Pipeline B route until Orqaly has migrated.

## 2. Sources reviewed

This plan reconciles the latest integration documents with the running implementation:

| Document | Intended responsibility | Finding |
|---|---|---|
| `ORQALY_DEV_INTEGRATION_GUIDE.md` | Current Orqaly-side Conditions and A+B client guidance | Correct contract and rollout posture; now needs implementation in the Orqaly repository. |
| `AXWISE_INTEGRATION_PLAN.md` | Conditions gateway verification plan | Conditions-only plan; it does not mean A+B production readiness. |
| `ORQALY_INFRASTRUCTURE_ROUTING.md` | Product opportunity boundary | Useful as a non-binding opportunity catalogue, not a shipped-capability list. |
| `ORQALY_INTEGRATION_SCHEMA.md` | Current shareable partner contract | Correct M2M, tenant, job, polling, and webhook contract; no live credentials. |
| `pipeline_comparison_metrics.md` | Historical A+B quality comparison | Useful historical evidence, but its “partial offsets” statement is stale after strict evidence re-anchoring was added. |

## 3. Current implementation truth

### 3.1 What is production-quality in the core

The enhanced A+B pipeline currently provides:

- Configurable simulation depth and one to ten people per stakeholder.
- OCEAN-grounded synthetic people.
- Parallel multi-person interviews.
- Simulation-level insights, themes, risks, opportunities, and recommendations.
- Empirical personas built from the generated interview transcripts.
- Structured traits with confidence and direct evidence.
- Exact quote-source validation.
- Character offsets re-anchored to unique per-interview evidence documents.
- Strict failure when empirical personas or offset-linked evidence cannot be produced.

The July 12 comprehensive verification generated four simulated people, four interviews, four empirical personas, and 35 primary evidence items. All 35 quotes were exact source substrings and all 35 offset ranges resolved to the exact quoted transcript slice.

### 3.2 What remains incomplete

| Area | Current state | Required state |
|---|---|---|
| Async research core | A+B orchestration, evidence audit, persistence, analysis result, optional PRD, and durable worker code are implemented and locally tested. | Apply the production migration and exercise the same path against production. |
| Production schema | Legacy `pipeline_runs`; no durable columns; no `orqaly_tenant_mappings`. | Apply `20260712_1400_add_orqaly_async_hybrid_runs.py` and verify schema metadata. |
| Worker runtime | Standalone worker script exists and stale-run recovery is tested locally. | Deploy a continuously managed production worker with monitoring and restart policy. |
| Completion boundary | Pipeline B can defer finalization; A+B publishes only after persistence in local tests. | Verify this invariant in the production smoke run. |
| Persistent result | Durable retrieval survives local API restart. | Verify after a production worker/API restart. |
| PRD | Canonical analysis result and optional/required PRD policy exist in code. | Exercise optional and required production cases after the core smoke run. |
| Authentication | Dedicated M2M secret is deployed and valid/missing/invalid behavior is verified. | Add scoped/key-ID rotation later; install the key in Orqaly's secret store. |
| Idempotency | Persistent tenant-scoped request hashing is implemented locally. | Verify against the migrated production database. |
| Authorization | Tenant mapping and ownership filters exist in code. | Create the real mapping and verify cross-tenant denial in production. |
| Webhooks | HTTPS host allowlist, HMAC signature, and three immediate retries exist. | Add the Orqaly receiver; later add a transactional outbox and durable delivery history. |
| Conditions | Live and authenticated, but heuristic and history-agnostic. | Keep shadow-only until the Orqaly bridge and history-aware regression tests pass. |
| Twin registry/runtime | Several mock or hard-coded responses | Mark experimental or implement real persistence, retrieval, RBAC, and execution. |
| Conditions gateway | Mostly heuristic advisory processing | Keep advisory initially; add real policy/model-backed implementations only where justified. |

## 4. Target integration flow

```text
Orqaly
  |
  | POST /simulate-enhanced-async
  | Partner credential + tenant + request/idempotency IDs
  v
AxWise API
  |-- authenticate partner and resolve tenant
  |-- validate request and callback policy
  |-- create or reuse durable hybrid run
  |-- return 202 with job, status, and result URLs
  v
Durable Hybrid Worker
  |-- Pipeline B: generate people
  |-- Pipeline B: conduct interviews
  |-- generate cross-person insights
  |-- Pipeline A: empirical persona remapping
  |-- strict evidence and offset audit
  |-- persist canonical hybrid result
  |-- create canonical AnalysisResult
  |-- optionally generate PRD
  |-- atomically mark terminal status
  v
Orqaly
  |-- polls status/result and/or receives signed webhook
  |-- stores AxWise identifiers and evidence references
  |-- renders personas, insights, sources, and PRD links
```

## 5. Public API contract

### 5.1 Start a long A+B run

```http
POST /api/orqaly-axwise/v1/simulate-enhanced-async
Authorization: Bearer <partner-service-credential>
Idempotency-Key: <stable UUID for this logical request>
X-Request-ID: <unique trace UUID>
Content-Type: application/json
```

Recommended request:

```json
{
  "tenant": {
    "org_id": "orqaly-org-123",
    "user_id": "orqaly-user-456"
  },
  "business_context": {
    "business_idea": "Evidence-grounded operational research",
    "target_customer": "Research operations leaders",
    "problem": "Research plans are vague and difficult to audit",
    "industry": "Research technology",
    "location": "Warsaw, Poland"
  },
  "questions_data": {
    "stakeholders": {
      "customers": [
        {
          "id": "research-operations-lead",
          "name": "Research Operations Lead",
          "description": "Owns research quality and delivery",
          "questions": [
            "What creates the most friction in the current workflow?",
            "What evidence is required before acting on a persona?"
          ]
        }
      ]
    }
  },
  "config": {
    "depth": "comprehensive",
    "people_per_stakeholder": 5,
    "response_style": "mixed",
    "include_insights": true,
    "temperature": 0.5
  },
  "outputs": {
    "empirical_personas": true,
    "insights": true,
    "analysis_result": true,
    "prd": {
      "enabled": true,
      "type": "both",
      "required": false
    }
  },
  "callback": {
    "url": "https://api.orqaly.com/v1/webhooks/axwise-research",
    "events": ["run.progress", "run.completed", "run.failed"]
  }
}
```

Rules:

- `people_per_stakeholder` remains bounded from 1 to 10.
- `depth=comprehensive` is the recommended long-form mode.
- `outputs.empirical_personas` is always `true` for this route; reject `false` instead of degrading to Pipeline B.
- PRD is optional because it adds latency and can be regenerated from the canonical analysis result.
- Do not accept arbitrary callback URLs without validation.
- Do not trust `tenant.user_id` or `tenant.org_id` until they are resolved through the authenticated partner mapping.

### 5.2 Accepted response

Return HTTP `202 Accepted`:

```json
{
  "success": true,
  "job_id": "hybrid-018f...",
  "simulation_id": "2921a45b-...",
  "request_id": "018f...",
  "status": "queued",
  "pipeline": "hybrid_a_plus_b",
  "reused": false,
  "links": {
    "status": "/api/orqaly-axwise/v1/runs/hybrid-018f.../status",
    "result": "/api/orqaly-axwise/v1/runs/hybrid-018f...",
    "cancel": "/api/orqaly-axwise/v1/runs/hybrid-018f.../cancel"
  }
}
```

For the same tenant and `Idempotency-Key`, return the original job with `reused=true`. If the key is reused with a different normalized request hash, return `409 Conflict`.

### 5.3 Status endpoint

```http
GET /api/orqaly-axwise/v1/runs/{job_id}/status
```

```json
{
  "job_id": "hybrid-018f...",
  "simulation_id": "2921a45b-...",
  "status": "running",
  "stage": "empirical_remapping",
  "progress_percentage": 76,
  "current_task": "Constructing evidence-grounded personas",
  "attempt": 1,
  "counts": {
    "people_completed": 10,
    "people_total": 10,
    "interviews_completed": 10,
    "interviews_total": 10,
    "empirical_personas_completed": 6,
    "empirical_personas_total": 10,
    "evidence_items_audited": 44
  },
  "started_at": "2026-07-12T14:00:00Z",
  "updated_at": "2026-07-12T14:02:14Z",
  "completed_at": null,
  "error": null
}
```

Allowed top-level statuses:

- `queued`
- `running`
- `completed`
- `completed_with_warnings`
- `failed`
- `cancelled`

The frontend and Orqaly must stop polling only for these terminal states: `completed`, `completed_with_warnings`, `failed`, or `cancelled`.

### 5.4 Stage model and progress allocation

| Stage | Progress range | Completion condition |
|---|---:|---|
| `queued` | 0 | Durable job exists and is claimable. |
| `initializing` | 1–5 | Tenant, configuration, and provider availability validated. |
| `generating_people` | 5–20 | Requested people generated and persisted. |
| `simulating_interviews` | 20–55 | Every successful person has a completed interview or an explicit failure record. |
| `generating_insights` | 55–65 | Simulation insights persisted. |
| `formatting_transcripts` | 65–70 | Unique evidence documents and participant transcript segments persisted. |
| `empirical_remapping` | 70–84 | Pipeline A returned empirical personas. |
| `auditing_evidence` | 84–90 | All published structured quotes pass exact source and offset checks. |
| `persisting_analysis` | 90–94 | Canonical `AnalysisResult` and source relationship committed. |
| `generating_prd` | 94–99 | Requested PRD completed or recorded as an optional warning. |
| `completed` | 100 | All required outputs committed and retrievable. |

Progress must be monotonic. A route must never infer completion from elapsed time or from the existence of a database row.

### 5.5 Completed result

```http
GET /api/orqaly-axwise/v1/runs/{job_id}
```

The response should contain or link to:

```json
{
  "job_id": "hybrid-018f...",
  "simulation_id": "2921a45b-...",
  "analysis_result_id": 221,
  "status": "completed",
  "pipeline": "hybrid_a_plus_b",
  "quality": {
    "hybrid_status": "completed",
    "people_count": 10,
    "interview_count": 10,
    "empirical_persona_count": 10,
    "evidence_item_count": 87,
    "exact_quote_match_rate": 1.0,
    "exact_offset_match_rate": 1.0,
    "evidence_document_count": 10
  },
  "people": [],
  "interviews": [],
  "simulation_insights": {},
  "empirical_personas": [],
  "recommendations": [],
  "deliverables": {
    "analysis": {
      "status": "completed",
      "url": "/api/results/221"
    },
    "prd": {
      "status": "completed",
      "type": "both",
      "url": "/api/prd/221?prd_type=both"
    }
  },
  "created_at": "2026-07-12T14:00:00Z",
  "completed_at": "2026-07-12T14:03:01Z"
}
```

Large interview bodies may later move to paginated or signed artifact URLs, but the first implementation should preserve the current response for compatibility.

## 6. Correct completion boundary

This is the most important orchestration change.

Today `SimulationOrchestrator.simulate_with_persistence()` performs all of the following inside Pipeline B:

1. Saves people, interviews, insights, and formatted data.
2. Updates progress to 100 percent.
3. Places the result in the in-memory completed cache.
4. Fires the `completed` webhook.
5. Returns to the caller.

The synchronous enhanced route then performs Pipeline A. Reusing that method unchanged in an asynchronous hybrid worker would therefore publish a false completion before empirical remapping and evidence audit.

Required refactor:

```python
simulation = await simulation_service.run_pipeline_b(
    request,
    tenant,
    simulation_id,
    finalize=False,
)

hybrid = await hybrid_service.enrich_and_audit(simulation, request)
analysis_result = await hybrid_analysis_service.persist(hybrid, tenant)
prd = await prd_delivery_service.generate_if_requested(
    analysis_result,
    request.outputs.prd,
)

await hybrid_run_service.finalize(
    job_id=job_id,
    hybrid_result=hybrid,
    analysis_result=analysis_result,
    prd=prd,
)
```

Only `finalize()` may:

- Set progress to 100 percent.
- Set `completed_at`.
- Publish a terminal webhook.
- Expose the result through the completed endpoint.

## 7. Persistence design

### 7.1 Reuse `pipeline_runs` as the job record

The existing `pipeline_runs` table already has `job_id`, `user_id`, status, timestamps, execution trace, simulation ID, analysis ID, counts, error, and a JSON dataset. Extend it instead of creating another disconnected job table.

Required columns:

```text
partner_id                 string, indexed, non-null
external_org_id            string, indexed, non-null
external_user_id           string, indexed, non-null
pipeline_mode              string, non-null, default hybrid_a_plus_b
current_stage              string, non-null, default queued
progress_percentage        integer, non-null, default 0
request_id                 string, indexed, non-null
idempotency_key            string, non-null
request_hash               string, non-null
request_payload            jsonb, non-null
requested_outputs          jsonb, non-null
result_summary             jsonb, nullable
callback_config            jsonb, nullable
attempt_count              integer, non-null, default 0
lease_owner                string, nullable
lease_expires_at           timestamp, nullable
updated_at                 timestamp, non-null
warning                    text, nullable
```

Add a unique constraint over `(partner_id, external_org_id, idempotency_key)`.

### 7.2 Persist the complete hybrid result

The current `simulation_data` record persists Pipeline B fields but not `empirical_personas`, evidence audit metrics, or deliverable references. Add:

```text
empirical_personas         jsonb, nullable
hybrid_metadata            jsonb, nullable
analysis_result_id         integer, nullable
prd_status                 string, nullable
```

Alternatively, store the complete canonical hybrid dataset in `pipeline_runs.dataset` and keep `simulation_data` as Pipeline B source storage. Whichever approach is selected, completed retrieval after a process restart must return empirical personas and quality metadata. Memory-only enrichment is not acceptable.

### 7.3 Canonical analysis bridge for PRD

PRD generation currently accepts an `AnalysisResult.result_id`. The hybrid worker should create an authenticated, tenant-owned `AnalysisResult` after evidence audit using a deterministic adapter:

```text
SimulationResponse
  -> people and interviews
  -> empirical personas
  -> themes, patterns, insights, sentiment, sources
  -> canonical AnalysisResult.results
  -> analysis_result_id
  -> cached PRD generation
```

Add source metadata to the analysis result:

```json
{
  "source_type": "hybrid_simulation",
  "simulation_id": "2921a45b-...",
  "job_id": "hybrid-018f...",
  "pipeline": "hybrid_a_plus_b"
}
```

Do not generate a PRD from empty or still-running analysis data. The existing `409` readiness guard remains required.

## 8. Durable worker execution

FastAPI `BackgroundTasks` runs inside the web process. It does not guarantee completion across deploys, crashes, autoscaling, or restarts. A long comprehensive run may last several minutes and must be claimed by a durable worker.

Recommended implementation order:

1. Introduce `HybridRunService` for state transitions and persistence.
2. Introduce `HybridRunWorker` that claims queued database rows with a lease.
3. Run the worker as a separate process/container.
4. Recover expired leases and retry only retry-safe stages.
5. Move to a queue such as ARQ, Celery, Dramatiq, or a managed queue later if operational scale requires it.

Minimum database-worker guarantees:

- Atomic job claiming.
- Lease expiration and stale job recovery.
- Maximum attempts.
- Heartbeat updates.
- Stage checkpoint persistence.
- No two workers execute the same active attempt.
- Cancellation checked between expensive stages.
- A failed attempt cannot overwrite a later successful attempt.

## 9. Authentication, tenancy, and authorization

### 9.1 Resolve the current documentation conflict

The current documents specify two different systems:

- `ORQALY_DEV_INTEGRATION_GUIDE.md`: one shared `x-axwise-key` M2M secret.
- `ORQALY_INTEGRATION_SCHEMA.md`: personal AxWise bearer keys for each Orqaly user, plus a global fallback key.

Recommended production model:

1. Orqaly authenticates as a partner service using a rotatable partner credential.
2. Every request includes an external organization and user identity.
3. AxWise resolves that external identity through a persisted partner-tenant mapping.
4. AxWise derives the internal user/workspace; it does not trust free-form tenant headers.
5. Every job row stores both the external tenant and the resolved AxWise owner.
6. Status, result, cancellation, retry, PRD, and artifact endpoints query by both job ID and resolved tenant.

Near-term credentials may use a secret bearer token or `x-axwise-key`; the long-term mechanism should support key IDs, rotation, revocation, scopes, and audit timestamps. Remove the hard-coded fallback secret from source code and documentation.

### 9.2 Required scopes

Suggested service scopes:

- `research:runs:create`
- `research:runs:read`
- `research:runs:cancel`
- `research:prd:generate`
- `conditions:evaluate`
- `twins:write`
- `twins:execute`

The simulation credential must not automatically grant twin execution or administration scopes.

### 9.3 Fail-closed ownership

Ownership checks must not be disabled merely because Clerk validation is disabled, and database errors must not skip authorization. For production Orqaly routes:

- Missing tenant mapping: `401` or `403`.
- Job exists under another tenant: `404` to avoid enumeration.
- Ownership database unavailable: `503`, not a skipped check.
- Invalid or revoked credential: `401`.
- Missing scope: `403`.

## 10. Persistent idempotency and request tracing

The in-memory `RequestIDCache` used by the conditions gateway is not sufficient for long jobs or multiple AxWise instances.

For every create request:

1. Normalize the request body.
2. Compute a SHA-256 request hash.
3. Look up `(partner_id, org_id, idempotency_key)`.
4. If absent, atomically insert the job.
5. If present with the same hash, return the existing job.
6. If present with a different hash, return `409 Conflict`.

Keep separate identifiers:

- `request_id`: one transport attempt and distributed trace.
- `idempotency_key`: one logical user operation.
- `job_id`: AxWise hybrid execution.
- `simulation_id`: Pipeline B source dataset.
- `analysis_result_id`: canonical analysis and PRD source.
- `webhook_event_id`: one webhook delivery event.

All logs and telemetry should include these identifiers where available.

## 11. Webhook delivery

Webhook events must be treated as an outbox, not a best-effort in-memory callback.

Required behavior:

- Persist callback configuration with the job.
- Permit HTTPS only in production.
- Reject loopback, link-local, private-network, and metadata-service destinations unless explicitly allowlisted.
- Resolve DNS safely and defend against redirect-based SSRF.
- Sign the raw payload with HMAC and a timestamp.
- Include an immutable event ID.
- Retry with exponential backoff and jitter.
- Record response status, attempt count, and final delivery state.
- Make Orqaly deduplicate events by event ID.
- Never put secrets, raw credentials, or unnecessary PII in webhook payloads.

Suggested headers:

```http
X-AxWise-Event-ID: evt_...
X-AxWise-Timestamp: 1783865000
X-AxWise-Signature: v1=<hex-hmac>
```

Terminal events must be produced from the same database transaction/outbox boundary as the terminal job status.

## 12. Quality contract

An A+B job must fail before publication if any required invariant fails.

### 12.1 Required invariants

- At least one simulated person exists.
- Every published empirical persona maps to a known simulated speaker.
- At least one participant interview exists.
- At least one structured evidence item exists.
- Every structured evidence quote is a non-empty exact transcript substring.
- Every `start_char:end_char` slice equals its quote exactly.
- Every evidence item has a unique per-interview `document_id`.
- Interviewer, moderator, and researcher turns are excluded from persona evidence.
- `empirical_persona_count` equals the number published in the response.
- `hybrid_status=completed` is set only after the audit passes.
- A requested canonical analysis result is committed before its URL is returned.
- A required PRD is committed before the run becomes `completed`.

### 12.2 Warning versus failure policy

| Condition | Result |
|---|---|
| Pipeline B cannot generate people/interviews | `failed` |
| Pipeline A returns no empirical personas | `failed` |
| Any published evidence quote or offset is invalid | `failed` |
| Required PRD fails | `failed` or remains retryable in `generating_prd` |
| Optional PRD fails after valid A+B result | `completed_with_warnings` |
| One individual interview fails but configured minimum coverage is satisfied | `completed_with_warnings`, with explicit counts |
| Tenant or ownership cannot be verified | request fails closed |

Never label a Pipeline B-only result as a degraded A+B success.

## 13. PRD delivery policy

PRD should be linked to the enhanced run, but it should not always block core persona delivery.

Recommended defaults:

- `outputs.prd.enabled=false` unless Orqaly requests it.
- `outputs.prd.required=false` by default.
- Create `analysis_result_id` for every A+B run so PRD can be requested later without rerunning the simulation.
- Cache PRD output by `(analysis_result_id, prd_type, source_version)`.
- Return both an analysis URL and PRD URL when available.
- Expose a separate retry action for an optional failed PRD.

Suggested follow-up route:

```http
POST /api/orqaly-axwise/v1/runs/{job_id}/deliverables/prd
```

This route resolves the tenant-owned `analysis_result_id`, starts or retrieves cached PRD generation, and never accepts an arbitrary result ID belonging to another tenant.

## 14. `/twins/*` routes

The `/twins/sync`, `/twins/{id}/execute`, and `/twins/{id}/rbac-check` routes are not blockers for async A+B research integration. They must, however, be described accurately.

Immediate action:

- Mark them `experimental` or `demo` in OpenAPI and integration documentation.
- Remove claims that registration provisions indexes or that execution performs real retrieval until those operations exist.
- Remove the hard-coded CFO behavior and generic mock success before production use.
- Do not let Orqaly depend on these routes for authorization.

Requirements for later productionization:

### Twin synchronization

- Persist twin identity, owner tenant, version, behavioral DNA, allowed tools, and grounding partitions.
- Enforce create/update scopes.
- Return version and immutable audit reference.
- Support safe update and deactivation.

### Twin execution

- Load the persisted twin instead of branching on a hard-coded ID.
- Apply authoritative tenant and resource authorization.
- Retrieve from real tenant-scoped grounding partitions.
- Produce citations backed by content hashes and retrievable sources.
- Track provider usage, cost, latency, and model.
- Apply timeouts and budget limits.

### RBAC

- Use persisted roles, policies, resource scopes, and organization membership.
- Keep policy evaluation deterministic and separately testable.
- Store an audit record for allow and deny decisions.
- Do not report `logged_to_hsm=true` unless an HSM-backed audit operation actually occurred.

## 15. Conditions gateway

The conditions gateway is useful as a small, fast advisory API and should remain separate from the long research pipeline.

Immediate action:

- Preserve `conditions/evaluate` as a low-latency contract.
- Label heuristic outputs as advisory.
- Replace its in-memory idempotency cache with persistent or distributed storage before horizontal scaling.
- Apply the same partner credential, tenant resolution, scopes, and trace conventions used by research runs.
- Keep `agent.generate` fail-closed when the security evaluator is unavailable.
- Do not describe OCEAN, regulatory, grounding, or governance output as model-backed when a branch is a static template or simple keyword heuristic.
- Replace the current `meta.model = "enhanced_gemini"` label with an honest implementation label such as `heuristic_rules_v1` until a model is actually invoked.
- Separate estimated integration pricing from actual model cost; the current deterministic branches should not imply LLM spend.

Conditions maturity does not block A+B launch, provided its claims and enforcement posture are accurate.

## 16. AxWise work-package status

| Package | Code state | Production state / next action |
|---|---|---|
| Contracts and persistence | Request/result models, durable columns, tenant mapping model, migration, and persistent idempotency are implemented. | **Blocked:** apply the migration; production currently has none of these schema changes. |
| A+B orchestration | Pipeline B finalization split, Pipeline A audit, persistence ordering, cancellation, and stale recovery are implemented and locally tested. | Verify after the migrated database and worker are live. |
| Durable worker | Standalone claim/process loop exists. | Deploy as a managed production process with restart and monitoring. |
| Analysis and PRD | Canonical analysis adapter and optional/required PRD flow exist. | Exercise only after the base A+B production smoke test. |
| Partner security | Hard-coded fallback removed; secret and tenant ownership checks exist. | Install Orqaly-side secret, provision mapping, then add scoped key IDs/rate limits later. |
| Webhooks | Callback validation, HMAC signing, and three retries exist. | Implement Orqaly receiver; add transactional outbox/delivery history as hardening. |
| Documentation | Current contract, developer guide, one-pager, private handoff, and this status plan are aligned. | Revalidate after any Orqaly or deployment change. |

## 17. Orqaly implementation work packages

### Package O1: Server-only AxWise client

- Add `lib/integrations/axwise/client.js` and configuration validation.
- Keep all secrets in the Orqaly backend runtime.
- Implement bounded timeout/retry and structured trace metadata without logging request bodies or keys.

### Package O2: Chat Conditions bridge

- Hook after verified auth/local content guard and before `runCopilotLoop`.
- Send verified tenant IDs, server-derived role, current message, bounded history, conversation/page context, and omission flag.
- Merge approved prompt/context output in shadow mode first.
- Add the history-sensitive finance-follow-up regression test on both sides.

### Package O3: A+B research lifecycle

- Expose an explicit research action/tool; do not invoke A+B on every chat message.
- Persist idempotency key, `job_id`, `simulation_id`, `analysis_result_id`, stage, and terminal status.
- Map AxWise stages to progress UI and render `completed_with_warnings` separately.
- Retrieve result/evidence coordinates and link analysis/PRD deliverables.

### Package O4: Webhook and recovery

- Verify signatures from raw bytes, reject stale timestamps, and deduplicate event IDs.
- Treat webhooks as wake-up signals and poll the authoritative status/result.
- Test duplicate, delayed, missing, and out-of-order terminal events.

### Package O5: Controlled launch

- Complete one mapped-tenant end-to-end smoke run.
- Run Conditions in shadow mode and A+B with an explicitly selected pilot workflow.
- Measure user-visible usefulness, completion reliability, latency, cost, and evidence quality before wider rollout.
- Keep infrastructure tasks, binary generation, messaging, and SaaS writes inside Orqaly.

## 18. Test strategy

### 18.1 Unit tests

- Request normalization and request hash stability.
- Idempotency same-body reuse and different-body conflict.
- Tenant mapping and scope enforcement.
- Legal state transitions and monotonic progress.
- Exact quote and offset audit.
- No interviewer evidence.
- PRD required/optional outcome policy.
- Callback URL validation and signature creation.
- Lease claim, heartbeat, expiration, and retry.

### 18.2 Integration tests

- API creates a durable queued job and returns `202`.
- Worker claims and completes a comprehensive A+B run.
- Result survives API and worker restart.
- Database retrieval contains empirical personas and quality metadata.
- Duplicate create request returns the original job.
- Cross-tenant status/result access is denied.
- Callback retry does not rerun the research pipeline.
- Optional PRD failure yields `completed_with_warnings`.
- Required PRD failure does not report completed.
- Cancellation prevents later stages and terminal success.

### 18.3 End-to-end quality tests

Test at least these profiles:

1. One stakeholder, one person, detailed depth.
2. Two stakeholder groups, two people each, comprehensive depth.
3. Five stakeholder groups with the intended production persona count.
4. Unicode names and multilingual transcripts.
5. Duplicate or similar speaker names.
6. Long answers containing repeated quotes.
7. Provider retry and partial interview failure.
8. PRD enabled and disabled.

For every successful run assert:

- Exact quote match rate equals 1.0.
- Exact offset match rate equals 1.0.
- Evidence document IDs resolve to stored sources.
- Empirical persona count meets the configured coverage policy.
- No terminal event is emitted before all required outputs commit.

### 18.4 Load and resilience tests

- Concurrent long jobs across multiple tenants.
- Worker restart during each stage.
- API restart while workers continue.
- Database connection interruption.
- LLM timeout and rate limiting.
- Webhook destination downtime.
- Duplicate webhook delivery.
- Queue backlog and lease recovery.

## 19. Operational targets

Initial targets should be measured and revised from real traffic:

- Create endpoint p95 below 750 ms, excluding cold database startup.
- Status endpoint p95 below 300 ms.
- Zero false completion events.
- Zero cross-tenant result exposure.
- 100 percent exact quote and offset match rate for published structured evidence.
- At least 99 percent durable job recovery after worker restart.
- Webhook delivery success above 99 percent within the retry window.
- Comprehensive A+B duration reported as telemetry rather than guaranteed below a fixed threshold.

Do not promise the current documentation's 30–90 second completion window for every comprehensive multi-person run. The measured four-person run took approximately 109 seconds, and larger runs will take longer.

## 20. Rollout sequence

### Phase 0: Contract correction

- Approve this route and status contract.
- Mark legacy and experimental routes accurately.
- Remove secrets and contradictory authentication instructions from documentation.

### Phase 1: Durable A+B internal API

- Implement persistent job state and worker.
- Refactor completion boundary.
- Persist full hybrid results.
- Validate through AxWise-only tests.

### Phase 2: Analysis and PRD delivery

- Create canonical analysis results.
- Add optional PRD generation and links.
- Verify caching, retry, and ownership.

### Phase 3: Orqaly development integration

- Implement create, poll, result, cancel, and webhook clients.
- Store identifiers and render progress.
- Run with test organizations and synthetic data.

### Phase 4: Shadow production

- Enable selected Orqaly tenants.
- Compare AxWise output and existing workflows.
- Measure latency, quality, failures, and cost.
- Keep downstream automation non-authoritative.

### Phase 5: Controlled authoritative rollout

- Enable production delivery per tenant.
- Add rate and budget limits.
- Monitor quality and operational SLOs.
- Expand only after acceptance criteria remain stable.

Twin runtime productionization and deeper conditions intelligence may proceed as separate tracks; neither should delay a truthful, secure A+B research launch.

## 21. Definition of done

### Verified in code/local execution

- [x] `simulate-enhanced-async` creates a persistent job ID.
- [x] Pipeline B defers terminal publication until Pipeline A finishes.
- [x] Successful local runs include empirical personas and exact evidence offsets.
- [x] Local completed results survive API restart.
- [x] Canonical analysis and optional/required PRD policy are implemented.
- [x] Persistent request hashing/idempotency and tenant ownership filters are implemented.
- [x] Hard-coded partner fallback secrets are removed.
- [x] Callback validation, signatures, and bounded immediate retries are implemented.
- [x] Worker cancellation and stale-run recovery are locally tested.
- [x] Public OpenAPI exposes the intended routes.

### Required before production acceptance

- [ ] Production migration is applied and durable schema metadata is verified.
- [ ] Real Orqaly tenant mapping exists and an unmapped tenant returns `403`, not `500`.
- [ ] Managed production worker claims and completes a queued job.
- [ ] A production result survives API/worker restart.
- [ ] Orqaly client persists IDs and renders progress/result states.
- [ ] Orqaly webhook receiver verifies, deduplicates, and recovers through polling.
- [ ] Cross-tenant production test denies status, result, and cancellation access.
- [ ] Conversation history reaches AxWise Conditions and changes the history-sensitive regression case.
- [ ] Conditions shadow metrics justify any authoritative use.
- [ ] One full mapped-tenant A+B smoke run passes before user rollout.

## 22. Immediate next actions

Execute in this order:

1. Apply the AxWise production migration and verify the mapping table plus durable `pipeline_runs` columns.
2. Provision the real Orqaly organization/user-to-AxWise workspace mapping.
3. Deploy and monitor the managed A+B worker.
4. Add the Orqaly server-only client and exact Copilot hook described in the compatibility review.
5. Make AxWise Conditions history-aware and add the ambiguous-follow-up regression test.
6. Add the Orqaly A+B job store, progress UI, polling, and signed webhook receiver.
7. Run one mapped-tenant production A+B test and one Conditions shadow test using a real multi-turn conversation.
8. Only then decide whether Conditions remains advisory or becomes authoritative for selected flows.
9. Add the durable webhook outbox, scoped partner keys, and rate limits as production hardening.

The clearest near-term customer value is the explicit A+B research workflow: structured stakeholder perspectives, audited persona evidence, risks, opportunities, and reusable analysis/PRD output. Conditions is a supporting control layer, not the headline product, until it uses real conversation context and demonstrates incremental value over Orqaly's existing guardrails.
