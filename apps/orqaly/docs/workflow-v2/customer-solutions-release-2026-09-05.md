# Customer solution preview release — 2026-09-05

## Latest checkpoint — native workflow controls

The existing Solution now has the actual native n8n viewer/editor and durable
revision review, rejection, approval, deployment, testing and activation. The
signed-in native acceptance rejected a changed v2 without altering active v1,
then saved/reviewed/deployed/tested/activated v3. Actual n8n execution `4` verified
the changed uppercase behavior; production execution `5` verified a Bob input.
Reload preserved active v3 and history, including one earlier unknown-outcome test
without a verified receipt. Not every history entry is a successful execution.

Current image/revision identifiers, approval scope, exact v3 hashes and timestamps
are recorded in [the native release checkpoint](./native-n8n-release-2026-09-05.md).
The evidence below remains the original v1 release record, not a claim that its
old images still receive traffic. The
[task-to-Solution and Needs you handoff](./task-to-solution-handoff.md) remains
planned, not shipped.

## Original v1 acceptance — historical evidence

[Contact data webhook](https://orqaly-v2-web-preview-161074549006.europe-west4.run.app/workspace/solutions/2031decc-b21e-48b5-9bd5-3ed3d4dfd024)
is integrated into the existing B2B Operations Agent profile and reachable from
the Agent card in the original Assistant conversation. This is an executable
typed field-mapping capability, not autonomous natural-language workflow building.

The signed-in customer journey passed: prepare draft -> review exact workflow
and environment -> approve deployment -> actual n8n test -> activate production
calls -> actual production result -> pause -> reload persisted history.

| Invocation                          | n8n execution | Verified output                                    |
| ----------------------------------- | ------------- | -------------------------------------------------- |
| Test                                | 1             | `customer_name: Alice`, `email: alice@example.com` |
| Production-mode submission          | 2             | `customer_name: Bob`, `email: bob@example.com`     |
| Separate production-mode submission | 3             | Same Bob result, new intentional run               |

Each successful button submission starts a new intentional invocation. Transport
retries retain the request key. A separate rollback-only service/database probe
replayed the exact key for execution 2 and confirmed no additional dispatch.

Pause was verified both in the browser and against the service using the live
API database role. History remained intact after reload. The page subsequently
showed Active during the shared browser session; that state was not overwritten.
The customer can use Pause or Test from this same page.

## Original v1 deployed provenance — historical

Application source: `56cc580a36e75bb65a2d9b9320afb16e4a929b71`.
API and web images were built from a clean git archive of that commit.

| Component                              | Revision / identifier                                              |
| -------------------------------------- | ------------------------------------------------------------------ |
| API, 100% traffic at the v1 checkpoint | `orqaly-v2-api-preview-solutions-56cc580a-key2`                    |
| Web, 100% traffic at the v1 checkpoint | `orqaly-v2-web-preview-solutions-56cc580a`                         |
| Dedicated n8n at the v1 checkpoint     | `orqaly-solution-n8n-preview-00001-8dr`                            |
| n8n workflow                           | `HJy9MlaOleeP8Kj4`                                                 |
| Published workflow version             | `439333e7-baaf-4fbf-aec1-e0ec46a41265`                             |
| Approved workflow hash                 | `d2bab7be7a2cff3f3826e9eb8ba1fce8ddd54630dc8e9dabac17faf3215a31f0` |
| Migration 011 hash                     | `f601a836e6a7ea229558ceb96f0533eeb4795f87dff06b7fb8ccd62aaff398fe` |

Registry: `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview`.

- API `orqaly-service@sha256:eab98629eabdefb97ea933ccc8028973fede97eb8623e27f74d9224804e6f896`.
- Web `orqaly-web@sha256:5a16d5f91c80ec0a8fb04f9793420a2583364c167b9cfd8bcf0acfbf0ed056a9`.
- n8n `n8n@sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2`.
- Web Cloud Build: `047c4134-c36a-465d-b992-f1c0bc2bcf01`, SUCCESS.
- API Cloud Build: `27207347-6408-4b2c-9082-ce3cce0ac96e`, SUCCESS.

Only the approved single preview environment was provisioned. It has its own
Cloud Run service, service account, database/login and encryption key on the
existing Cloud SQL server. Maximum instances = 1, minimum = 0, webhook only.
Ingress accepts network requests but IAM denies anonymous invocation; the Orqaly
API service account is the authorized invoker. It is not a public n8n editor.

## Original v1 verification

- 547 tests / 38 files passed on the final application source.
- Real n8n 2.37.10 + PostgreSQL 17 local acceptance passed, including activation,
  pause, idempotency, owner/tenant denial and database credential isolation.
- Signed-in preview browser journey passed, with actual execution IDs above.
- Installed agent-browser CLI verified the anonymous solution route requires login.
- Anonymous solution API = 401; anonymous direct n8n API = 403.
- Live API-role rollback-only probes passed: same-key replay, paused production
  denial, other-owner denial and direct cross-tenant RLS denial.
- Browser console showed no errors after deployment and credential recovery.
- GCP web verifier: 1,092,437 retained JavaScript bytes; unchanged 1,150,000 budget.
- Original SMS checklist canonical artifact hash remains
  `3d88e4bd299f1a1f3560aa705664fb46f9bf1cb93463c86522cc0c61feeecf5a`.

The live negative probes used the actual API database role and explicit test
scopes, not a second real customer's Clerk login. Clerk's owner journey was
verified in the signed-in browser. These are distinct pieces of evidence.

## Security recovery during audit

A local audit's WHATWG URL parser rejected the existing PostgreSQL Unix-socket
connection string and included that string in a tool error. This exposed the
preview API database credential in the task transcript. No replacement secret
is recorded here. The error-handling boundary was fixed to suppress raw sensitive
errors, and the affected database login password was rotated. A new API revision
uses Secret Manager `orqaly-v2-preview-001-db-api-url:2`; version 1 is disabled.
The new credential and API database readiness were verified. Only the preview API
was found to reference that secret among current Cloud Run services and jobs.
The transcript cannot be treated as having had the old secret removed; rotation
invalidates it. Customer records and workflow definitions were not changed by
the credential recovery.

A subsequent process-inspection command printed the temporary Cloud Run proxy's
short-lived Google ID token from its command-line arguments. The exact proxy was
terminated and its listener closed. Stopping the proxy does not revoke the
already-issued token; its encoded expiry is 2026-09-05 11:06:32 UTC (13:06:32
Europe/Berlin). Treat the transcript as sensitive. Future diagnostics must not
print raw process arguments; inspect/redact them in memory and return only the
specific process identity and non-sensitive status needed for cleanup.

The v1 recovery required retaining secret version 2; simply routing traffic to
an old revision referencing disabled version 1 was not safe. At that checkpoint,
the documented image rollback would have deployed the previous API image with
current secret bindings, verified readiness, then changed traffic. Historical
previous API image:
`orqaly-service@sha256:c05b9e72be75ed52582be36387d1c73e5342e3e070934e70558fb55ab9549d6e`.
Previous web revision: `orqaly-v2-web-preview-ux-9ed65731454d`.
No such rollback was performed. Those pre-native API images are not a safe
rollback after v3 activation because they do not resolve active revision pointers.
Follow the [current rollback boundary](./native-n8n-release-2026-09-05.md#rollout-and-rollback-boundary),
retain secret version 2 and additive migrations 011/012, and preserve customer
records. Do not roll back by dropping data or silently restoring v1 behavior.

## Still not implemented

- AxWise natural-language generation of these solution specs.
- Task-context handoff, durable Solution-specific missing-input questions/answers,
  secure connection/registration setup and predeployment native authoring. These
  are defined in the planned task-to-Solution contract, not completed by native
  editing of an existing deployed webhook.
- Unrestricted native node editing, customer rollback controls and per-node run
  traces. Supported native webhook edits and version changes are now implemented
  and verified separately in the native release record.
- Long-lived application keys, provider connections, schedules and notifications.
- Automated customer-environment provisioning and isolated software-build workers.

The n8n management key expires after 30 days; operator rotation is required before
expiry and is not automated yet. Orqaly invocation evidence stores bounded input
and output; n8n execution payload saving is disabled. Do not claim detailed native
execution replay from the currently retained data.

No Supabase data was imported. No GitHub push was performed.
