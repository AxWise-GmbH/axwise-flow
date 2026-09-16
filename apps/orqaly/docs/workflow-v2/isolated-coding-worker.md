# Isolated coding worker: implemented capability and limits

## Customer journey

The existing Solution page has **Code & tests**, bound to the Solution's actual
Build Request/task. A prepared proposal contains exact source files, proposed
file changes, immutable test files, selected outputs and limits. The customer
inspects these, approves their hash, then explicitly selects **Run via n8n**.

```text
Prepared source change + fixed tests
            │ exact version / user approval
            ▼
Orqaly durable dispatch intent
            │ five-minute, one-job capability (encrypted n8n credential)
            ▼
Real self-hosted n8n: Webhook → bounded HTTPS dispatch → queue receipt
            │ POST exact approved job to Orqaly; no source/Google credentials
            ▼
PostgreSQL queued job → worker-only atomic claim
            │ private Google IAM invocation, API/worker service accounts only
            ▼
Dedicated Cloud Run supervisor → pristine, isolated Cloud Run Sandbox
            │ apply reviewed files / run immutable Node tests / kill descendants
            ▼
Actual exit or signal + test output + hashed output files + cleanup proof
            │ immutable durable result, scoped to tenant/user/Solution/task
            ▼
Solution page: inspect evidence and download actual files
```

This is **not yet automatic Agent preparation**, repository cloning, GitHub
publishing, npm installation, arbitrary shell commands, or external credentials
inside generated code. The API accepts controlled-source proposals; no demo
proposal is silently substituted. A source proposal/model hook is a separate
integration and must remain explicit in the UI until genuinely connected.

## Runtime

The approved preview uses one IAM-private Cloud Run service, not a VM:

- Project `axwise-v2-preview-001`, region `europe-west4`.
- Service `orqaly-coding-sandbox-preview`, sandbox launcher enabled, Gen2.
- Service/revision max1, min0, concurrency1, 1CPU, 1GiB, 300s request timeout.
- Final image `sha256:f187c466ed8e0719d8cb5f621580c3a96044182ed5de98e357432e15f7802ac1`.
- Runtime SA has no project, secret or database access. Only existing Orqaly
  API/worker SAs have explicit service invoker bindings; no public invoker.
- Separate pristine Node22 rootfs, not the supervisor filesystem. Only the
  exact job workspace and read-only approved tests are mounted. No inherited
  supervisor environment, metadata, network, Docker socket or cloud credentials.
- Node heap128MiB; supervisor and sandbox share the explicitly capped1GiB.
  No separate per-sandbox memory guarantee is claimed. Command timeout1–120s,
  file-size/resource controls, bounded logs and selected artifacts.

Google's sandbox CLI is `/usr/local/gcp/bin/sandbox`; default rootfs sharing is
deliberately not used. Timeouts close remote CLI pipes immediately, then force
delete the exact named sandbox. Cleanup must be confirmed before reading output
files or releasing the global coding queue. Google CLI currently reports our
genuine failed Node test via `SIGPIPE`/null exit code; this is shown honestly,
not translated into an invented numeric exit status.

Reconciliation also requires this supervisor instance's recorded scope, job,
spec and execution identity. It may return its cached removal proof after a lost
response. A fresh/different Cloud Run instance cannot infer that the original
sandbox vanished from local absence; that case stays pending for operator review.

Cloud Run Sandboxes are a public-preview Google feature. Ordinary host CPU,
memory and request charges apply; scale-to-zero is not a promise of free use.
References: [Google announcement](https://cloud.google.com/blog/topics/developers-practitioners/google-cloud-run-sandboxes-are-in-public-preview/),
[sandbox configuration](https://docs.cloud.google.com/run/docs/configuring/services/sandboxes),
[CLI and security defaults](https://docs.cloud.google.com/run/docs/reference/sandbox-cli).

## Durable boundaries and recovery

Migration017 adds forced-RLS coding jobs and n8n dispatch intents. Immutable
approval binds source, changes, tests, runtime image and limits. Only a worker
session through the claim RPC can enter `running`. The one capped supervisor
has a global queue barrier: any running job or unknown outcome without verified
sandbox removal blocks later coding jobs, including another tenant's.

Neither a timeout nor a missing receipt is automatically retried. A lost Run
response replays the same stored dispatch request without a second n8n effect.
The UI refreshes authoritative state. After the five-minute dispatch capability
expires, **Check n8n dispatch cleanup** can remove only the exact temporary
workflow and credential. Cleanup verifies deterministic identity, graph/hash,
transport and provider metadata and refuses ambiguous inventories. It does not
rerun the job or convert unknown evidence into success. A credential creation
whose response was lost requires the metadata-only `credential:list` scope to
find its unique UUID-derived name; missing privilege stays visibly unresolved.

An inactive tenant cannot use the ordinary owner API to reconcile. Its unknown
sandbox therefore deliberately blocks the global queue until an authorized
operator verifies and removes that exact sandbox and records cleanup proof.
There is no general privileged bypass or automatic skipping of that barrier.

Successful results require the complete frozen receipt: scope/runtime/source/
prepared/tests hashes, actual command outcome, cleanup, exact selected artifact
paths/content hashes/byte counts. A minimal or contradictory success response
is stored as unknown; a late completion cannot overwrite a prior reconciliation.

## Configuration and API

`codingWorkerConfiguredFromEnvironment` rejects partial configuration. API and
worker use the same five values:

```
ORQALY_CODING_WORKER_URL
ORQALY_CODING_WORKER_IMAGE_SHA256
ORQALY_CODING_DISPATCH_SIGNING_KEY       # base64 secret, API/worker only
ORQALY_CODING_N8N_ENVIRONMENT_ID       # explicit owned environment003
ORQALY_PUBLIC_API_ORIGIN
```

The human `/v2/solutions/:id/coding-jobs` router uses existing Clerk/Origin/rate
boundaries. Source creation and approval are distinct from `/run`. Raw dispatch
capabilities are not exposed through a human route. `/coding/v1/jobs/:id/dispatch`
only accepts a short-lived HMAC capability for one approved job; browser Origin
and Cookie authority are refused. The n8n graph contains no capability plaintext.

## Verification

- `coding-worker.test.js`: exact contracts, owner scope, no preapproval execution,
  restart/no retry, contradictory receipt and stale-completion races; four
  opt-in real Docker isolation/code/failure/timeout tests.
- `coding-worker-n8n.test.js`: native credential/graph boundary, same-key replay,
  expired exact cleanup, forbidden public mint route and runtime deletion guards.
- `SolutionCodingJobs.test.jsx`: exact review/approve/run controls, persisted
  artifacts, unknown outcomes, safe errors, scope changes and keyboard focus.
- `node scripts/coding-worker-postgres.mjs`: real PostgreSQL16 roles/RLS/initial
  states/immutability/concurrent claim guards plus actual pinned n8n → verified
  local TLS → production broker router → real queue → reconstructed worker →
  real Node tests/artifacts. No live model is claimed by this synthetic-source
  acceptance and no customer provider is contacted.
- `node scripts/coding-cloud-run-live-probe.mjs`: operator-authenticated synthetic
  probes of the actual final GCP image: source change/generated artifact, host/
  env/test/rootfs/metadata/public-network isolation, real failure, timeout and
  full cleanup. These probes are runtime acceptance, not an Orqaly customer job.

## Live product acceptance, 6 September 2026

The separate live release gate also passed after migration 017 and API/worker
revision `exec-7b330159` were deployed. The reviewed operator script used the
restricted API DB role and real production services to prepare/approve one
fixed synthetic job; actual self-hosted n8n 003 called the deployed broker, and
the deployed worker—not the operator process—executed it in Cloud Run Sandbox.

- Solution/Build: `8b606adc-91ba-46e5-86da-ece609df9c7d`.
- Verified source task: `c1cb54ec-00f5-5106-b7ff-16acf5640c07`.
- Coding job: `2a6d9d0e-e72f-4be6-bfd2-22626a21e668`.
- Frozen spec hash: `9a1823c716088a0174fca6ad93f51f70bd189584e370c6a069fb51531b3fabb4`.
- Native n8n execution: `4` in environment 003.
- Sandbox execution: `cb466d1b-1c21-46c8-bad5-aebefc102b2d` on final image `f187c466…`.
- Node tests passed with actual exit 0. Computed output: `{"total":10,"empty":0}`.
- Changed `src/total.mjs`: 79 bytes,
  SHA256 `d0105a4d95f01b93bebf2dbad044fb0aa2edb91de481a309dcf96a62b0801c44`.
- Generated `result.json`: 22 bytes,
  SHA256 `0dfd123a077e3987e1439bd0e5c04948674cdca60aaba9ac992333ccd15ddcdb`.

Native workflow/credential absence was read back, sandbox removal was bound to
the complete receipt, and same-key replay did not redispatch. Exactly one coding
job was created. Old 001/002 Solution/revision/history and Cloud Run/IAM hashes
were unchanged. The five-minute internal job capability was the only native
credential; Google identity was used solely for private management transport.

Reproducible acceptance: `scripts/coding-product-preview-e2e.mjs` plus six passing
guard tests in `scripts/workflow-v2/coding-product-preview-e2e.test.js`. Both
files passed ESLint. It uses fixed request keys and a credential-free, mode-0600 baseline/receipt
ledger at `/private/tmp/orqaly-coding-product-preview-20260906-v1.json`; rerunning
does not create another job or retry an unknown dispatch. The script-owned
Cloud SQL proxy was stopped and its loopback listener was confirmed absent.
This is **operator-initiated real product evidence**, not signed-in browser approval or automatic
Agent source generation. Those distinctions remain visible in the product UI.
