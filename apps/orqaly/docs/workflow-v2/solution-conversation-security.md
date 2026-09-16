# Workflow-local conversation boundary

Security contract and explicitly labeled verification records. Local model tests and deployed browser acceptance are distinguished below.

## Contract

- `GET /v2/solutions` lists at most 50 Solutions for the verified owner and tenant.
- `GET /v2/solutions/:id/conversation?draftId=...` returns current version/hash context, recent durable turns, and recent run metadata. It never returns raw model envelopes or internal credential-reference snapshots.
- `POST /v2/solutions/:id/conversation/turns` requires an idempotency key and `{turnId, mode, message, expectedSolutionVersion, workflowHash, draft?}`. A selected draft supplies its exact ID, row version and hash. New admissions return `202`; exact replays return `200`.
- Optional `{includeInvocation:{id,inputOutput:true}}` is explicit consent for one selected run, for this message only. It is not inferred from previous messages.
- States are `queued`, `running`, `completed`, `blocked`, and `failed`. A completed question means the model answered, not that any work was executed.

## Durable flow

```text
Signed-in user → exact Solution/draft CAS → immutable turn/context/envelope
                                               ↓
                                  worker-only expiring lease
                                               ↓
                      existing AxWise / Google model operation
                            ┌──────────────────┴────────────────┐
                         ask                                  change
                 AssistantTurnV1                         PrepareSolutionV2
                  direct_answer                           phase = design
                            │                                   │
                    persisted answer               schema + graph + scope checks
                                                                │
                                                fresh Solution/draft CAS
                                                                │
                                                 genuine unapproved draft
```

The API does not wait on a model. An interrupted worker resumes the same operation ID, input hash and status URL. Claims have a 90-second lease; a turn stops after 10 minutes or 100 claim iterations. A tenant suspended after admission is blocked before model dispatch and again before completion. No database transaction is held during model I/O.

`change` deliberately uses **design**, not **repair**: a user may change business requirements and acceptance cases. Those are a proposal for the existing explicit review/test/approval/activation flow, not an automatic release. Clarification is another scoped change message that includes bounded prior discussion and blocked diagnostics for the same active version and selected draft.

## Isolation and authority

Migration 019 forces row-level security on turns, scoped by tenant and owner. The API can insert immutable request columns and read its own turns; it cannot write outcomes. The worker cannot generally write revisions. A narrow completion function can save only the preallocated or explicitly selected draft from an immutable change request, after a fresh active-release and draft CAS. The original release, active pointer, existing run evidence, approvals and application keys are not updated.

If an editable draft already exists, an unselected change request is rejected. If any selected hash/version changes during model work, completion is blocked and the user's draft is preserved.

Connection requirements and every connected node's ID, type, version and parameters must remain exact. A proposal may change pure mappings around that unchanged connector. Existing opaque native credential selectors are kept in a separate internal snapshot, never sent to the model, and restored only after model-safe validation. SQL independently compares them to the actual current selected graph. Changed/new selectors or connection scope are rejected. Later release review rechecks the current owned connection; revocation therefore remains effective. Chat never creates or verifies credentials.

## Evidence consent

Default model context contains workflow design, bounded acceptance cases, original scoped task context, run IDs/statuses/hashes and safe diagnostic codes. It does **not** contain run payloads. The prompt explicitly states that absent inputs/outputs must not be invented.

With the per-message opt-in, the API reads only the exact tenant/owner/Solution/run selected. Input and output are each limited to 2,000 bytes; selected diagnostic details to 1,000 bytes. Credential-like fields or known token patterns cause the whole affected value to be omitted, with a visible reason. Missing values and oversized values are marked explicitly. A prior-version run is labeled as not matching the selected workflow. This conservative preflight is not a general-purpose DLP guarantee.

Previously consented turns, including their model replies, are excluded from future model history unless that new message explicitly selects the same run again. Consent remains part of the immutable request and idempotency hash.

## Deployment and verification gates

`ORQALY_SOLUTION_CONVERSATIONS_ENABLED` is explicitly false by default. Both API and worker must be enabled together after migration 019. Readiness checks FORCE RLS, worker-only claim/completion functions and absence of broad worker revision-write permissions.

No new AxWise image, migration, provider SDK or model setting is needed: both operation types already exist on the current GCP stack. This feature introduces no execution endpoint. It cannot run tests, dispatch providers, publish, activate, rotate application keys or alter schedules.

Verification is split deliberately: unit/HTTP tests exercise real contracts and guards; `scripts/solution-conversation-postgres.mjs` exercises the actual PostgreSQL 16 API-role queue, worker-role lease/completion and isolation with an explicitly labeled model fixture. Those tests are not a real Gemini, browser, n8n or cloud acceptance claim.

## Recorded real-model acceptance — 2026-09-06

`scripts/solution-conversation-model-local-e2e.mjs --two-synthetic-model-operations` passed using the exact current AxWise product adapters from clean source `2e4df7f90657c3a2686016eb8b6ce0744794cb83`, the existing preview Gemini credential in memory, and an isolated disposable PostgreSQL 16 database.

| Operation | Actual model | Latency | Input/output tokens | Durable result |
| --- | --- | --- | --- | --- |
| Ask `12ecac1c-d07b-587f-ba95-5ae7bde45b58` | `gemini-3.8-flash` | 5,601 ms | 1,884 / 1,389 | Explained the threshold and HTTP 200/422 branches; explicitly distinguished design evidence from absent runtime output. |
| Change `389cca5c-4c89-55c0-8f46-3336c11f0e77` | `gemini-3.8-flash` | 25,888 ms | 28,912 / 7,007 | Actual generated five-node draft changed the threshold to 150, retained `gte`, trim mapping and HTTP 422 rejection, and updated requirements/acceptance cases. |

The API returned a queued receipt before either model call. Worker completion persisted the real model answers/metadata and the new unapproved draft through the actual restricted-role completion function. The generated draft hash was `56fbdbb0f7b8586bc2947fa22cd980abae2b7522cbb0daeff028dde3dbd5b071`; pinned structural and execution-policy checks passed. No model-repair request or manual JSON substitution was used. Same-key replays made no additional model call. The original synthetic release stayed byte-identical, and the invocation table remained empty. The disposable database/container were removed afterward.

This is **real model + real persistence**, not deployed AxWise HTTP, browser or n8n execution proof. The actual AxWise Cloud Run service has internal ingress; no ingress or IAM workaround was made. No customer workflow, customer draft or production database was read or changed for this test. Monetary cost was not fabricated: the adapter reported token usage and a null cost estimate in this local harness.

## Deployed browser acceptance — 2026-09-06

API, worker and web revision `conversation-02849374` are live. Migration019 was applied with the exact reviewed digest and preservation checks; both actual restricted database logins passed readiness afterward. Existing resource limits, IAM, worker INTERNAL ingress and old traffic tags were preserved.

A signed-in browser submitted Ask turn `3d5ddace-93b3-4f0c-9d7e-c17614883e90` on Solution `637fcfaf-3864-468b-ad36-47337b80c484`, with run-data sharing off. The deployed worker completed actual AxWise operation `b1ce10f8-2915-501c-841e-addcdcd334b8` using Gemini3.8Flash (6,095ms, 1,980 input/1,603 output tokens). The 1,484-byte answer persisted and was visible after a full reload, alongside the native n8n canvas. It explicitly distinguished known execution statuses from omitted payloads.

`scripts/solution-conversation-preview-readiness.mjs --completed-turn 3d5ddace-93b3-4f0c-9d7e-c17614883e90` passed a read-only audit of exact request/context/operation binding, internal service destination, persisted reply/model accounting, absence of payload consent and draft mutation, and unchanged protected records: three Solutions, five revisions, 30 events and 11 invocations. The existing user draft was never used as a disposable change test. This is deployed **Ask** evidence; the real model **Change** evidence above deliberately used a disposable local database instead.
