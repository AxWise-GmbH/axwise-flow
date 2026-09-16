# Customer-owned executable solutions — implementation plan

Updated 2026-09-05. This plan supersedes the shared, internal-connector-only n8n
decision in the 2026-09-04 agentic implementation plan. It does not rewrite past
work or claim that the existing execution receipt is a customer solution.

The accepted [Native n8n integration design](./native-n8n-integration-design.md)
defines the next delivery stage: a native viewer and authenticated customer-scoped
editor, with edits becoming candidates for semantic review, approval and release.
It supersedes any interpretation that a read-only preview completes the editor
requirement. The design is recorded in both the AxWise and Orqaly repositories.

## Product contract

Orqaly and AxWise own the overarching Agent work: understand the request, retrieve
only task-relevant context, prepare a solution, ask for permission, review it and
maintain it. Self-hosted n8n runs the delivered automation. The customer controls
the solution through the existing Orqaly workspace. SMS is one future capability,
not the domain model. No Supabase data is imported, copied or used as a fallback.

Orqaly enforces ownership, permission, version and approval. AxWise supplies
cognition, evidence and semantic analysis. n8n supplies the native workflow
viewer/editor and execution engine; editing rights do not grant production rights.

```text
Customer request / Agent profile / explicit task context
                         |
                 Orqaly + AxWise
          prepare -> review -> request approval
                         |
                  Versioned Solution
             spec + actual n8n workflow + tests
                         |
                  approved deployment
                         v
        Isolated customer solution environment
          n8n service + its own DB identity/storage
                         |
              protected runnable endpoint
                         |
            execution ID + input/output evidence
                         v
       Orqaly: workflow, tests, controls and history
```

An Agent is a scoped identity, not a permanently running VM. A solution is a
durable deliverable, not a completed research task. Runtime allocation belongs to
the solution/customer. There is no cross-customer n8n database, credential pool or
workflow editor session. A browser-provided tenant ID is never authoritative.

## UX/UI

1. **Entry:** “Build a solution” on an Agent profile, also reachable from that
   Agent's card in chat. Existing research results remain documents, with no
   automatic conversion into deployment permission.
2. **Prepare:** name, purpose and a bounded, editable specification. Show what is
   supported before submission. First supported capability: webhook field
   transformation. Arbitrary code, provider connections and natural-language
   workflow generation must not be advertised as implemented until wired.
3. **Review:** show the exact workflow and version to deploy, input/output
   contract, selected Agent, isolation boundary, required connections and
   external effects. Generated descriptions are not evidence of deployment.
4. **Environment:** distinguish draft, awaiting environment, ready to test,
   active, paused and failure/unknown outcomes. A missing runtime explains the
   next required action. Do not show a successful deployment on a mocked timer.
5. **Test:** editable JSON input, explicit Run test, actual output and n8n
   execution ID. Test is permitted before production activation for this
   side-effect-free capability only.
6. **Use:** explicit Activate / Pause, an authenticated endpoint and sample
   request. Pausing blocks new production invocations, not already-running work.
7. **History:** durable per-invocation status, timestamps, workflow hash/version,
   execution ID and result. Unknown outcomes are not automatically replayed.
8. **Native edit:** open a customer-scoped n8n editing session on a draft based on
   the selected release. Saving persists a candidate and leaves production intact.
   Show the meaningful change in behavior, connections and external data use;
   bind approval to the exact validated candidate before deployment/activation.

Keep these controls in the existing design system. The Agent profile lists its
solutions separately from Tasks & results. A dedicated authenticated solution
detail route is linked from the profile; no separate demo app or n8n Cloud login.
The native graph renders the selected persisted draft or release. Label that
selection explicitly: a draft is not the currently deployed workflow. The full
editor uses a supported authenticated session in the customer's authoring scope.
Responsive layout and keyboard access are required.

## First vertical slice (customer-selected acceptance test)

Webhook automation: accept a JSON object, map selected fields with safe transforms,
and return the transformed result. Use deterministic workflow compilation, not
unrestricted model-generated expressions or arbitrary Code/HTTP nodes. Compilation
is a real capability but must be labelled as such, not presented as AxWise
autonomously implementing every kind of software task.

- [x] S1: versioned contracts, safe workflow compiler, approval hash, test vectors.
- [x] S2: tenant/owner-scoped PostgreSQL storage, authenticated API, idempotency,
      optimistic concurrency, immutable workflow and durable invocation ledger.
- [x] S3: isolated n8n deployment, workflow installation and exact-version
      verification, protected invocation, actual execution ID/result capture.
- [x] S4: integrated Agent solution list, review/workflow/test/use/history UI.
- [x] S5: real PostgreSQL + real n8n acceptance tests, tenant isolation tests,
      existing regression tests, frontend build and browser verification.
- [x] S6: bounded GCP preview deployment only with infrastructure approval;
      verify the whole browser -> API -> database -> n8n -> result path.

The existing SMS checklist and its diagnostic receipt are immutable audit data.
The checklist prohibited external actions and cannot authorize this deployment.

## Runtime, storage and safety

- Orqaly stores ownership, Agent reference/profile version, specification,
  immutable n8n JSON/hash, approval, lifecycle and bounded invocation evidence.
- Each deployed environment has a separate n8n database/user and encryption key;
  GCP preview uses the existing Cloud SQL server with a dedicated database, not
  ephemeral Cloud Run filesystem storage. Local acceptance uses its own Docker
  network and persistent volume. A container alone is not the entire isolation
  boundary: identity, database grants, ingress and credentials matter too.
- Runtime binding is trusted server configuration/operator state, never a URL
  supplied by a customer. Redirects, alternate hosts and arbitrary outbound
  actions are denied. n8n is private; Orqaly authenticates customer invocations.
- Infrastructure approval and production activation are separate decisions.
  Deployment approval binds the exact workflow/specification and environment.
- No n8n editor credentials, provider secrets or cloud credentials are exposed in
  browser payloads. No customer-supplied code runs in the Orqaly API process.
- Record invocation intent before dispatch. One idempotency key binds one input
  and workflow version. Timeouts become outcome unknown, never “failed, retry
  automatically”. Keep database transactions short; no network calls under locks.
- Webhook-only preview can scale to zero. Schedules and long waits need a separate
  always-on/queue-mode capacity design and explicit cost approval before offering
  them. Self-hosting removes n8n Cloud subscription, not infrastructure costs.

## Subsequent capabilities (not claimed by the first slice)

1. Wire AxWise planning to the same typed solution specification; preserve exact
   task context/provenance and surface unsupported requests as such.
2. Add approved connector capabilities and credential setup, with separate test
   and live accounts; SMS gateway then becomes one real integration.
3. Add a restricted provisioning worker with durable jobs, reconciliation,
   resource quotas and teardown/retention controls; avoid giving the public API
   broad project-admin permissions.
4. Add native customer editing and revisions: candidate -> semantic diff and
   validation -> exact approval -> immutable release -> verified deployment ->
   activation. Configuration rollback follows the same controls and does not
   undo external effects already performed.
5. Add scheduled execution, proactive notifications and scoped memory retrieval.
6. Add isolated software-build workers behind n8n for repository changes, tests
   and PR proposals; no automatic merge/deploy without separate approval.

## Done means

On the actual preview, a customer opens their Agent, creates the supported
solution, sees the exact deployed workflow, runs two different inputs and gets
the corresponding real results with execution IDs. Refresh preserves history.
Another tenant cannot read or invoke it. Duplicate submissions do not dispatch
twice. Production calls are blocked until activation and again after pausing.
Unconfigured infrastructure or failures are visible and never called success.
Broader Agent capabilities above remain explicitly tracked until implemented.

## Current verification checkpoint

The local vertical slice passed against real n8n 2.37.10 and PostgreSQL 17 on an
internal Docker network: two different outputs/execution IDs, persistent history,
tenant read/invoke/RLS denial, activation/pause gates, request idempotency and
database credential isolation. Agent profile retrieval in this local fixture is
stubbed; this does not certify the live Clerk/Agent/browser boundary.

547 API/UI regression tests passed again on the final application source after
environment-approval binding hardening. The real isolated test also passed. The
GCP build verifier reports 1,092,437 retained JavaScript bytes, below the existing
1,150,000-byte budget. No budget increase or new project dependency was needed.

The user approved one GCP preview environment. Its dedicated n8n service, database,
identity and secrets are provisioned. Cloud Run service and revision caps are one;
no anonymous invoker is granted. API/UI rollout and the signed-in browser -> API
-> database -> n8n -> result acceptance flow passed. The actual preview solution
is `2031decc-b21e-48b5-9bd5-3ed3d4dfd024`, with n8n execution IDs 1 (test), 2 and 3
(separate production-mode button submissions). Reload preserves history. A
rollback-only probe against the live API database role verified same-key replay
without dispatch, paused-call denial, cross-tenant RLS denial and the unchanged
original checklist's canonical artifact hash. Anonymous API access returns 401;
direct anonymous n8n access returns 403. Browser checks found no console errors.

The current workflow visualization is a simplified read-only set of step cards,
not n8n's native canvas or editor. The customer has accepted the full
[native n8n integration design](./native-n8n-integration-design.md). The following
items remain open; recording this design does not complete them:

- [ ] S7: embed the actual self-hosted native n8n viewer with nodes/icons,
      connections, branches, pan/zoom and inspectable redacted configuration.
      Preserve selected version, tenant authorization and Orqaly controls. Verify
      small-screen layout. Do not send workflows to the default n8n-hosted preview
      service. A viewer alone does not fulfill editing or per-node evidence.
- [ ] S8: authenticate the native editor to a customer-scoped authoring environment;
      enforce draft-only authority server-side, including save/run/publish paths.
      Persist candidates without modifying the deployed workflow.
- [ ] S9: capture immutable candidate snapshots and meaningful semantic changes;
      validate capabilities/connections/effects and bind review, tests and approval
      to the exact version. Later edits invalidate the earlier approval.
- [ ] S10: release and activate only the verified approved revision. Demonstrate
      native edit -> save -> reject/revise -> approve -> deploy -> test -> activate
      -> persisted evidence, including cross-customer access denial.

The first slice does not complete S7–S10 or the subsequent capabilities above.
Detailed release evidence and credential-rotation recovery are recorded in
[customer-solutions-release-2026-09-05.md](./customer-solutions-release-2026-09-05.md).
Managed Google Agent environment findings are in
[google-agent-environments.md](./google-agent-environments.md).
