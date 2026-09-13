# Customer application access and service connections

Recorded 2026-09-05. Status: application access implemented, deployed to the existing
GCP preview and verified with real n8n execution and signed-in UI. Outgoing service connections remain a separate,
unimplemented phase pending the customer's first-provider choice.

## Outcome and boundary

An external customer application can invoke its approved active Solution without
a human browser session. A customer can connect an external service through a
dedicated secure setup flow, approve exactly what data will leave Orqaly, and see
the corresponding executable node on the native n8n canvas. n8n remains the
workflow executor; Orqaly owns identity, inputs, connections, approvals and history.

```text
Customer application
  → solution-scoped application access key
  → Orqaly: authenticate, version/activation checks, quotas, idempotency
  → isolated self-hosted n8n: receive → transform → approved service action
  → external destination through its separately scoped service connection
  → durable result/effect evidence in Orqaly

Customer in Orqaly
  → task → native draft → Needs you: information or secure connection setup
  → saved answer/verified connection → review exact data and effects
  → deploy → explicitly authorized test → activate → monitor/revoke/pause
```

Incoming **application access keys** and outgoing **service connections** are
different authorities and different UI sections. Neither is pasted into chat,
ordinary clarification answers, model inputs, native workflow JSON or logs.

The first external connector is a pending customer choice: customer-owned HTTPS
webhook, GitHub or SMS. Generic HTTPS delivery is the provider-neutral suggested
slice, not an assumption that every requested integration is already supported.
Other connectors remain explicit additional capabilities. This plan does not
quietly enable arbitrary URLs, n8n nodes, code execution or account registration.

## Plan review: design choices and hazards

1. Preserve Clerk authentication on all existing management/editor APIs. A separate
   machine invocation route accepts only a solution-scoped key and production
   input. It cannot edit, deploy, activate, read unrelated history or test drafts.
2. Store only a high-entropy key's digest plus safe metadata. Show new key material
   once, never persist it in browser storage, and support expiry and revocation.
   A key binds the exact approved workflow hash; a changed release requires a new
   explicit key grant. Do not forge a human Clerk identity for machine calls.
3. Resolve key selectors under RLS and authenticate before accepting any caller
   tenant/owner scope. Validate revocation, scope and quotas in the same transaction
   that claims an invocation. A per-process limiter alone is insufficient.
4. Namespace idempotency by application key. A repeated accepted request returns
   its existing receipt; a changed body with the same key conflicts. Revoked keys
   cannot retrieve receipts. Unknown outcomes are not automatically retried.
5. Keep provider credentials behind a controlled encrypted store. Native credential
   references may be used only after server-side ownership/environment verification;
   references are not permission. A successful credential save is not proof of a
   verified connection or delivery. Never enable credential export in the editor.
6. The first outbound action must have fixed reviewed destination, method, fields,
   connection/version and bounds. Block private/metadata egress, redirects and
   caller-controlled target/credential selection. Review pinned n8n behavior before
   relying on its SSRF controls. Connecting a service does not authorize every action.
7. An external test can have real effects. Show destination and sample data and
   obtain explicit effect approval. Keep local controlled-provider tests separate
   from live customer-provider evidence. Never send customer data to a public echo
   service or perform paid SMS/GitHub writes as an implicit test.
8. Preserve existing Solution 001 and current 002 releases and historical receipts.
   A scoped preview application-access acceptance may add one new synthetic
   production invocation to Solution 002; it must not rewrite earlier receipts.
   Additive schema
   changes only, no Supabase access/import and no GitHub push. Additional billable
   runtimes require explicit authority. Existing operator provisioning is not
   relabeled as automatic multi-customer provisioning.

## Implementation phases

- [x] A. Application access backend: typed contracts, scoped digest records, exact
      version grant, create/list/revoke, isolated machine route, durable quotas,
      per-key idempotency and actor evidence. Reuse the existing n8n invocation
      pipeline and authoritative pause gate.
- [x] B. Application access UX: existing Solution → Test & use → Connect your app.
      Show endpoint, safe copyable server-side request example, key name/expiry,
      one-time secret, revoke confirmation and current-version limitations.
      Keep the native workflow as the first tab and preserve browser testing.
- [ ] C. Chosen service connection: secure setup, server-verified ownership and
      capability, explicit missing-input state, revoke/version semantics, safe
      credential storage and no raw secrets in general workflow records.
- [ ] D. Chosen executable capability: typed AxWise preparation and compiler/review
      support, native action node, frozen connection/effect approval, real n8n
      execution and separately truthful provider outcome. No server-side substitute
      for the visible n8n action.
- [ ] E. Acceptance: restricted-role PostgreSQL tests; actual pinned n8n with a
      controlled destination; HTTP caller without Clerk/cookies; invalid/expired/
      revoked/wrong-solution keys; quotas/concurrency/idempotency; pause and version
      changes; secret non-disclosure; native/UI desktop/mobile checks. Preview
      deployment/effect tests only within the authorized resource and target scope.

## Customer-visible acceptance

The customer sees the task's intended workflow, supplies a missing connection in
a dedicated form, approves the exact effects, and receives a runnable Solution.
They create an application key and call it from a separate server-side client
without keeping Orqaly open. History identifies the calling app and real n8n run.
Revoking that key stops that app; pausing the Solution stops all new production
calls. A delivery failure or uncertain dispatch remains visible and cannot be
reported as successful delivery merely because a transform completed.

General chat-intent routing, arbitrary software-development execution, automatic
per-customer cloud provisioning, public unauthenticated webhooks, schedules and
additional providers are not silently included in this first connector release.
They remain tracked follow-on work, not removed requirements.

## Completed application-access verification

- 885 tests across 57 selected workflow/backend/UI/operator files passed. This is the
  selected regression suite, not a claim that every repository test was run.
- Restricted-role PostgreSQL 16 and 17 checks exercise migration 014, FORCE RLS,
  narrow grants, immutable credentials, expiry and concurrent admission.
- A disposable PostgreSQL 16 + pinned n8n 2.37.10 acceptance used real issued
  keys over HTTP without Clerk/cookies, actual n8n execution and persisted
  receipts. Replay, key isolation, pause, revoke and changed-release rejection
  passed. Human authentication in this local harness is explicitly a fixture.
- Browser checks used the production UI components with synthetic data at
  desktop and mobile sizes. They covered one-time reveal, keyboard interaction,
  explicit secret dismissal, revoke cancellation, refresh errors and no token
  persistence in browser storage. These are not live Clerk/provider evidence.
- The fixed GCP initial-script budget grew by 15 KB after a matched measurement:
  1,178,603 → 1,191,761 bytes (+13,158). All other build gates remain in place.

Current limits: server-to-server callers only; 5 unexpired non-revoked keys;
30/90-day expiry; 60 new requests/minute and 1,000/day per Solution across keys;
one application dispatch in flight. An ambiguous in-flight result does not
automatically become safe to retry. A changed release needs a new explicit key
grant. Revocation does not cancel an already dispatched action. Tenant suspension
is checked, but machine calls do not independently query Clerk user/session
lifecycle. Existing preview n8n management-credential expiry remains an operator
responsibility; app-key expiry does not extend an underlying runtime credential.

Phase E is complete for the local and live-preview application-access slice only.
The live test added exactly one synthetic production receipt to Solution 002;
both temporary acceptance keys were revoked. Native canvas, actual Clerk UI
issuance/dismissal/revocation, reload persistence and calling-app history were
verified. See [live acceptance evidence](./application-access-preview-acceptance-2026-09-05.md).
External
connection security findings and outstanding transport bounds are recorded in
[service-connection-security-review.md](./service-connection-security-review.md).
No outbound HTTP/GitHub/SMS node or automatic per-customer provisioner was enabled.
