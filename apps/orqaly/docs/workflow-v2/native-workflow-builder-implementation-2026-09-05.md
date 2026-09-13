# Native workflow builder — implementation and evidence

Started: 2026-09-05. Local implementation handoff: 2026-09-06. This describes the new source changes, not the currently deployed GCP preview. The full general-builder plan is **not complete**; the held-out complex repair and remaining release packages below remain open.

## What the customer can do in this implementation

Start from an existing Orqaly task and its named Agent, obtain an actual native n8n graph, inspect/edit it in the native canvas, answer scoped questions, test the agreed cases, request or automatically perform bounded repair, review the exact graph, and create a Solution. A Solution is staged inactive, tested, explicitly activated and callable from an application. Editing a deployed Solution creates a separate revision; promotion retains the previous immutable snapshot.

The model is not restricted to the old three-node mapping compiler. Native graph types, versions, node parameters, connections, nested input/output contracts and acceptance cases are retained. Unsupported execution capabilities are shown as dependencies, not replaced with an unrelated workflow.

```text
Existing task + Agent
        │
Orqaly selects pinned skills and real node schemas
        │
AxWise proposes native JSON + requirements + acceptance cases
        │
Orqaly validates ──→ native draft / questions / capability dependencies
        │                         ↑
Customer-authorized n8n test ──→ failure evidence → bounded repair
        │                         (criteria remain frozen)
Exact review → Solution → stage inactive → test → activate
        │
Application request → actual n8n result + durable receipt
        │
Edit new draft → review/approve → stage/test → promote new version
```

## Implemented boundaries

- Orqaly owns authorization, scope, node/skill selection, validation, test admission, evidence, approvals, UI and runtime access. AxWise remains a non-executing cognitive adapter.
- V1 behavior is preserved. V2 has separate contracts and RFC 8785 cross-language hashing, including native decimal node versions. Pinned skill content preserves its exact hashed bytes.
- Official n8n skills are vendored at commit `180b8415e3b73f78828cfa01e908e67f89f2a139`, with license/provenance. Node definitions come from n8n 2.37.10: 30 known types / 96 versions. Authoring visibility is not execution permission.
- Initial executable profile is request-driven, pure data processing: nested JSON, transformations, conditions, array operations and responses, subject to exact installed-node and expression checks. The numeric-only, zero-argument native `.sum()` helper is verified against pinned n8n source and actual execution, including empty arrays and rejected mixed types. Arbitrary callbacks, `map`/`reduce` code and JavaScript evaluation in the validator remain prohibited.
- Build attempts, tests, failures, cancellations, questions, connection references and versioned evidence are stored in owner-scoped PostgreSQL tables. No Supabase dependency or data migration was added.
- At most three repair rounds; repeated identical runtime failures stop earlier. A test suite has a ten-minute admission deadline. Runtime calls are bounded. Unknown results or incomplete cleanup never authorize replay, handoff or activation.
- Initial user tests are queued durably, not executed inside the browser's HTTP request. The queue records the original command/key, exact candidate fingerprint, owner, expiry and consent. A worker verifies and claims that authorization before execution. Refresh/closing the page does not cancel queued work; cancel/edit supersedes it. Queue authorization expires after fifteen minutes. A restarted-worker integration test verifies this path.
- A clarification without a replacement graph preserves the exact saved graph, business contract and hash. Answering resumes the same repair context. Preserved context is not relabeled as a newly validated candidate, and dependency-only responses do not trigger automatic repair.
- Each AxWise V2 adapter invocation has a 180-second deadline (V1 retains 90 seconds), at most three generation requests, at most 32,768 output tokens per response, and explicit aggregate usage checks: 64,000 input tokens per request, 120,000 total input, 65,536 total output and 160,000 total tokens. Input is preflighted before Google requests; output totals are checked after a response, so this is not a zero-overrun dollar guarantee. Budget/deadline exhaustion is terminal and explained in plain language, not automatically renewed. A durable operation-wide spend ledger across process-loss recovery is not implemented; the ceilings must not be described as a guaranteed lifetime-operation cost cap.
- Test evidence checks the final derived artifact hash, real execution ID, output/status assertions, cleanup and immutable test record. An edit cannot erase an unresolved test barrier. A cancelled build cannot be revived by a late response.
- Connection forms and durable claims are implemented with server-defined fields, exact node/destination/operation binding and no raw secret storage in ordinary application JSON. **They are disabled by the current execution profile; this is not proof of working GitHub/SMS/HTTP service actions.**
- API/worker enablement is explicit: `ORQALY_NATIVE_WORKFLOW_BUILDER_ENABLED=true`. Default is off. Flag-off rejects new V2 test/repair dispatch and disables worker test processing while preserving reads, cancellation and existing deployed Solution access. API and worker flags must agree; an API-only enablement is not ready.

## Verification completed locally

`scripts/native-workflow-build-local-e2e.mjs` uses real PostgreSQL 16 and n8n 2.37.10 with synthetic customer data. It proved:

1. Source-bound V2 build and pinned knowledge dispatch.
2. A test is queued without a runtime invocation; a separately created worker picks it up. A genuine five-node graph produces an incorrect result in n8n; its exact failed receipt is retained.
3. A deterministic AxWise test fixture repairs the graph; a restarted worker claims the durable retest and passes unchanged positive/negative cases.
4. Exact review/handoff, inactive deployment, coverage of all agreed cases, activation and actual production-shaped invocation.
5. Native revision save, review/approval, real test, pause-old/publish-new promotion and preservation of the initial immutable snapshot.
6. A real local HTTP application endpoint accepts nested JSON with a scoped application key, replays the same receipt without another execution, and rejects browser-origin and revoked-key access.
7. Owner isolation, immutable evidence, worker-only retest claims, and unknown-outcome blocking after native edits.

That run made **10 actual n8n executions**. Its model/Agent services are explicitly deterministic fixtures, not live-model proof.

Separate browser verification used the actual n8n frontend through the scoped gateway: five nodes, genuine branches/icons, native If configuration, save and reload (threshold 150), while the approved snapshot stayed at 100. It was a local UI test fixture, not a newly deployed product demo. Read-only/mobile overview also passed; detailed native editing remains desktop-oriented.

Separate runtime tests exercise genuine node failure capture, exact correlation and temporary-workflow cleanup. The retained GCP frontend build and its prohibited-module check pass. The V1 PostgreSQL lifecycle regression also passes.

Separate **real-model** verification used the product AxWise adapter and `gemini-3.8-flash` for one design and one repair. The model produced a five-node native graph (Webhook → Set → If → two Responses), then repaired an intentionally injected HTTP-status error without changing the frozen acceptance cases. Selected skills, node versions, exact model responses and token usage are retained in `server/workflow-v2/fixtures/native-model-order-acceptance-2026-09-05.json`; it contains synthetic inputs, not credentials.

`scripts/native-model-artifact-local-e2e.mjs` then executed that exact model-generated business graph in real n8n, without manual parameter correction or another model call:

| Agreed case         | Actual result                                     | Actual n8n execution ID |
| ------------------- | ------------------------------------------------- | ----------------------- |
| Valid order         | HTTP 200; accepted; normalized email; total 59.97 | 1                       |
| Zero quantity       | HTTP 422; `invalid_order`                         | 2                       |
| Negative unit price | HTTP 422; `invalid_order`                         | 3                       |

All three passed their agreed assertions and removed their exact temporary workflows. These IDs belong to the disposable local runtime, not GCP. The recorded business-artifact hash is `6049d0a1c2cb844588221640bcd90f02774d333c982622f8f543bc9a418d211b`. This is actual model authoring plus actual execution proof; it is not yet one authenticated GCP browser-to-model-to-runtime acceptance session.

The final broad Orqaly regression run passed **979 tests in 65 files**, with nine explicitly gated runtime cases skipped in that ordinary run. The separate opt-in runtime/expression run passed **66 tests**, including all nine real-runtime cases and the V1 runtime suite. AxWise passed **855 pure tests** (including 65 V2 tests) and **24 PostgreSQL 16 tests**. ESLint and the retained GCP frontend verifier passed (29 scripts / 1,166,649 bytes). The existing main-bundle size warning remains (708.77 kB minified).

The production Orqaly service image also built locally. A non-root (`uid=1000`), network-disabled, read-only container successfully imported the actual build/runtime/gateway modules and loaded all 96 known node versions. The image was not published or deployed.

### Held-out complex workflow: not passed

A separate real-model task requested a ten-node nested-array workflow: Split Out → Filter → compute subtotals → Aggregate → respond, including empty/all-nonpositive paths. The model produced a genuine different graph, but Orqaly rejected an unsupported node `settings` field and a response that was not explicit business JSON. Its first repair reached the inherited 90-second deadline; after a V2-only increase to 180 seconds, one final explicit repair exhausted its usage/request budget. Neither attempt returned an accepted repair. The interrupted attempts' actual usage and the specific exhausted budget are unavailable—not zero.

`server/workflow-v2/fixtures/native-model-array-acceptance-2026-09-06.json` retains the original graph, exact diagnostics, frozen business contract and both failed attempt records. Workflow hash: `4b301fb8ae8518ef84aeab9170b15fd1b8ab26f49428813d85e9df759e55b678`. It remains statically blocked and **was not executed**. No manual graph correction or substitute passing example was used.

Consequently, multiple-topology automatic repair is a remaining acceptance requirement. The next implementation pass should capture structured, redacted budget/validation-attempt diagnostics, reduce unnecessary repair context, and evaluate a bounded graph-only repair response with server-retained immutable business contracts. Those are follow-up proposals, not claims of fixes already made. The separately verified numeric `.sum()` helper is not proof that this whole generated workflow works.

## What is not finished or enabled

This is a substantial implementation of the **native request-workflow core**, not completion of every package in the larger plan:

| Plan package                                     | Current status                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| P0: versioned contracts and V1 preservation      | Implemented and regression-tested locally                                                                                   |
| P1: pinned skills/catalog and genuine generation | Implemented; real-model design and repair recorded                                                                          |
| P2: native authoring and independent checks      | Implemented; native edit/save/reload verified                                                                               |
| P3: controlled execution and bounded repair      | Implemented for pure request workflows; operator unknown-outcome recovery still outstanding                                 |
| P4: outgoing connections/actions                 | Partial: scoped records, binding validation and UI exist; provider adapters/bounded transport are not enabled               |
| P5: integrated customer journey                  | Implemented for the executable core; local component/browser/runtime evidence, not a single live preview acceptance session |
| P6: triggers, persistent waits and code workers  | Not implemented/enabled by this change                                                                                      |
| P7: guarded GCP rollout                          | Pending authorized environment and live acceptance                                                                          |

- **GCP release:** no new native-builder migration, service revision, environment or feature flag has been applied to preview during this implementation. Environments 001/002 and their Solutions remain untouched. An additional isolated environment has been requested for acceptance; approval is still required.
- **Provider actions:** the reviewed bound outbound transport and actual n8n credential-create/revoke adapters are not enabled. HTTP/GitHub/SMS workflows can be drafted, but their execution remains a visible dependency. No external provider write, account registration or paid provider test has been performed.
- **Other runtime profiles:** schedules, persistent polling/waits, arbitrary Code, sub-workflows and software-development workers remain blocked until their specific isolation, version-pinning, activation and recovery tests pass. This is not an automatic multitenant provisioning fleet.
- **Unknown-test recovery:** uncertain effects remain a durable block. There is no generic customer override which turns uncertainty into success or silently clears it. Operator reconciliation tooling for those cases is a remaining release requirement; explicit lifecycle pause reconciliation is implemented separately.
- **GCP identity transport:** native business requests use `X-Serverless-Authorization`, not ordinary `Authorization` or the n8n management key. Google documents signature removal before forwarding to the container, but a real preview header-forwarding probe is still required before enablement. [Google Cloud authentication contract](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).
- **Worker release configuration:** both API and worker need the same new owner-scoped native binding and their own authorized n8n invocation identities. The worker must have CPU available outside requests. The existing API-only IAM grants and three-node 001/002 images are not V2 runtime proof.
- No email/push notification channel was configured; saved in-app progress and action links are not out-of-app delivery proof.

## Running the checks

From the Orqaly checkout, with installed dependencies and Docker available:

```sh
node scripts/native-workflow-build-local-e2e.mjs
node scripts/native-model-artifact-local-e2e.mjs
ORQALY_NATIVE_RUNTIME_LIVE=1 npx vitest run --maxWorkers=1 server/workflow-v2/native-workflow-runtime.test.js
npx vitest run --maxWorkers=2 server/workflow-v2 shared/workflow-v2 src/pages/GcpWorkspace src/workflow-v2
npm run build:gcp
npm run verify:gcp-web
```

The local helpers bind loopback ports, use synthetic temporary credentials and remove only their own disposable containers. They do not access Supabase, modify GCP, or push to GitHub.

Before enabling preview: apply Orqaly migration 015 and AxWise migration 007 using restricted migration roles; deploy compatible API/worker/AxWise/frontend revisions; supply a separately authorized pinned native runtime binding; verify role readiness, Cloud Run identity stripping and the actual browser-to-model-to-runtime path. Preserve the existing Solutions and retain a compatible feature-flag-off rollback. Do not drop V2 data or roll back to a V1-only consumer after creating V2 records.

The feature flag disables new V2 creation, test/repair admission and worker test processing; it is **not** an emergency execution kill switch for already deployed Solutions. To stop their execution, remove/revoke the native runtime policy and invocation authority as well. Preserve read access and unresolved evidence during rollback.
