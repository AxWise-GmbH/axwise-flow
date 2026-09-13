# GCP Preview execution release contract

This pack makes the existing self-hosted n8n service an atomic connector
executor. It does not expose the n8n editor to customers and does not use n8n
Cloud.

## Pinned Preview identities and routes

| Boundary | Exact value |
|---|---|
| n8n service | `orqaly-agentic-n8n-preview` |
| n8n service account | `orqaly-n8n-preview@axwise-v2-preview-001.iam.gserviceaccount.com` |
| Gateway service | `orqaly-agentic-tool-gateway-preview` |
| Gateway service account | `orqaly-gateway-preview@axwise-v2-preview-001.iam.gserviceaccount.com` |
| Gateway request URL | `https://orqaly-agentic-tool-gateway-preview-161074549006.europe-west4.run.app/v1/effects/execute` |
| Gateway custom audience | `https://tool-gateway.agentic.internal` |
| n8n webhook | `/webhook/orqaly-tool-gateway-connector-v1` |
| descriptor | `operational_record_create_v1` |
| connection | `orqaly-internal-operational-record-v1` |

The deterministic `run.app` route is used in the content-addressed workflow.
The Gateway service must explicitly configure the custom audience above.

## Required n8n revision settings

The existing Preview revision must be updated with these exact fail-closed
settings before the workflow is published:

```text
N8N_PUBLIC_API_DISABLED=true
N8N_SSRF_PROTECTION_ENABLED=true
N8N_SSRF_BLOCKED_IP_RANGES=default
N8N_SSRF_ALLOWED_HOSTNAMES=metadata.google.internal,orqaly-agentic-tool-gateway-preview-161074549006.europe-west4.run.app
EXECUTIONS_TIMEOUT=30
EXECUTIONS_TIMEOUT_MAX=30
```

n8n 2.37.10's SSRF guard blocks link-local metadata through the `default`
range but evaluates an exact allowed hostname first. The workflow validator
separately pins the full metadata identity path and audience, not only the
hostname. See the
[exact 2.37.10 configuration source](https://github.com/n8n-io/n8n/blob/n8n%402.37.10/packages/%40n8n/config/src/configs/ssrf-protection.config.ts)
and [n8n's SSRF environment reference](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/ssrf-protection).

The identity request has a five-second node timeout, the Gateway write has a
20-second node timeout, and each n8n execution remains capped at 30 seconds.
Orqaly permits 90 seconds for the API-to-n8n transport envelope so a
scale-to-zero Cloud Run revision can cold-start; the one-operation Gateway
grant expires after 85 seconds. Neither the longer transport envelope nor the
grant increases n8n's runtime or attempt limit. n8n owns no retries.

The revision observed before this release had
`N8N_PUBLIC_API_DISABLED=false` and 300-second execution timeouts. Treat that
as configuration drift: do not publish the executable workflow until the new
revision reports all six values above.

Cloud Run startup and readiness probes must use `/healthz/readiness`, not
`/healthz`. The latter only proves that an HTTP listener exists and can admit a
request before webhook routes are ready, causing a cold-start 404. The pinned
[n8n readiness handler](https://github.com/n8n-io/n8n/blob/n8n%402.37.10/packages/cli/src/abstract-server.ts#L139)
also checks database connection, migrations and full server initialization.
Keep `/healthz` for liveness only. Do not mask this race by keeping a paid warm
instance or by automatically retrying an ambiguous write.

## Image and workflow bootstrap

Build `services/agentic-tool-gateway/Dockerfile` and
`infra/n8n/bootstrap/Dockerfile` into the existing Preview Artifact Registry.
The checked-in Cloud Build config uses only those two Dockerfiles. Submit a
clean reviewed commit with the dedicated Preview build identity:

```sh
IMAGE_TAG="$(git rev-parse --verify HEAD | cut -c1-12)"
test -z "$(git status --porcelain)"
gcloud builds submit . \
  --project=axwise-v2-preview-001 \
  --region=europe-west4 \
  --gcs-source-staging-dir=gs://axwise-v2-preview-001_cloudbuild/source \
  --service-account=projects/axwise-v2-preview-001/serviceAccounts/workflow-v2-preview-build@axwise-v2-preview-001.iam.gserviceaccount.com \
  --config=infra/n8n/cloudbuild.execution.yaml \
  --substitutions="_IMAGE_TAG=${IMAGE_TAG}"
```

Resolve both outputs to digests before deployment; never deploy the tag:

```sh
gcloud artifacts docker images describe \
  "europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqaly-agentic-tool-gateway:${IMAGE_TAG}" \
  --project=axwise-v2-preview-001 --format='value(image_summary.digest)'
gcloud artifacts docker images describe \
  "europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqaly-agentic-n8n-bootstrap:${IMAGE_TAG}" \
  --project=axwise-v2-preview-001 --format='value(image_summary.digest)'
```

Deploy only immutable Artifact Registry `@sha256:` references.

The bootstrap image contains exactly one workflow and verifies its SHA-256
before touching the n8n database. Run it as an operator-only Cloud Run Job with
the n8n Cloud SQL connection and only the existing n8n database-password and
encryption-key secrets. Set:

```text
ORQALY_N8N_WORKFLOW_STATE=published
```

`unpublished` imports the same bytes but removes the production webhook. The
job is never scheduled and the runtime n8n service receives no workflow-management
API key.

After publishing, roll the runtime with
`ORQALY_N8N_WORKFLOW_CONTENT_HASH=<verified workflow SHA-256>` as a revision
marker. Updating the same image alone is not proof that the running process
loaded the newly published workflow. Use a unique revision suffix and explicitly
route traffic to that revision when traffic was previously pinned. Check the
named revision and its startup logs, not only the deployment command's summary
or an older tagged URL. This marker is release metadata; the bootstrap hash
check and application manifest remain the enforcement boundaries.

## Required GCP authority (not applied automatically)

The release needs explicit review before creating these persistent IAM edges:

1. A dedicated Gateway service account receives Cloud SQL Client plus access
   only to `orqaly-v2-preview-001-db-gateway-url` and
   `orqaly-v2-preview-001-gateway-attestation-private-key`.
2. The n8n service account alone receives `roles/run.invoker` on the private
   Gateway service.
3. A dedicated operator-only bootstrap job identity receives Cloud SQL Client
   and only the two n8n database/encryption secrets.
4. The Orqaly API/control-plane identity receives only
   `orqaly-v2-preview-001-gateway-public-keys-json`, never the private key. Its
   value is a key-ID map such as
   `{ "preview_gateway_v1": "<PEM string or base64-encoded PEM>" }`.
5. No customer, `allUsers` or `allAuthenticatedUsers` binding is allowed on
   n8n, the Gateway or the bootstrap job.

These grants are release prerequisites, not code defaults. They were provisioned
for the existing Preview execution deployment; subsequent updates must preserve
the exact identities and private-service boundaries, not create broader grants.

## Network path

n8n obtains its own Google-signed identity token from the Cloud Run metadata
server. The workflow never accepts a control-plane-minted Gateway token. It
then calls the private Gateway with that token; Gateway Cloud Run IAM verifies
the token and allows only the exact n8n service account.

Because the existing n8n revision sends all egress through the Preview VPC,
its subnet must have Private Google Access and `run.app` DNS must route through
`private.googleapis.com` or `restricted.googleapis.com`, or the Gateway must be
fronted by an approved private endpoint. Keep the current deny-all remainder
rule. Do not open broad internet egress merely to reach the Gateway.

## Release order

1. Apply migration `008_agentic_execution_preview.sql` and provision the
   least-privilege Gateway database login.
2. Add Gateway signing keys and DB URL through Secret Manager; add the public
   key to the control-plane key registry.
3. Build, scan and deploy the digest-pinned Gateway with internal ingress and
   custom audience.
4. Add only the exact n8n invoker IAM binding and verify all anonymous calls
   fail.
5. Build and run the digest-pinned n8n bootstrap job with workflow state
   `unpublished`; verify imported bytes and execution-data retention settings.
6. Run negative identity, expired-grant, cross-tenant and idempotency tests.
7. Enable the backend execution flag and run the bootstrap job with state
   `published` in the same reviewed release.
   **After the job completes, roll n8n to a new revision**, preserving its
   image digest, private ingress, IAM, secrets and execution settings. The CLI
   changes the database; an already-running n8n process does not reload the
   published webhook until it restarts. Verify the production webhook through
   the authorized API path before declaring the release ready. Apply the same
   restart requirement after unpublishing during rollback.
8. Execute one approved record creation, verify the row and Ed25519 receipt,
   replay the same idempotency key and verify no second row exists.

Any missing key, grant, descriptor hash, binding hash, workload identity,
database permission or signature fails closed.

## Execution recovery repair (009)

The September 5 preview repair uses the additive migration
`database/workflow-v2/migrations/009_executable_action_recovery.sql`. After the
008 release is present, run the reviewed source from the repository root with
the existing Cloud SQL proxy on `127.0.0.1:19471`:

```sh
ORQALY_APPLY_PREVIEW_RECOVERY=apply-reviewed-migration-009 \
  node infra/n8n/scripts/apply-preview-recovery.mjs
```

The operator-only script checks the committed migration bytes and the existing
008 checksum, applies 009 and records its source/checksum atomically. It grants
the API only a scoped boolean recovery RPC, not Gateway table access. The
original 008-only catalog deployment gate must not be rerun against a 009
database: it deliberately rejects unknown additive state. Use this additive
repair entrypoint and component image updates for this Preview release.

The Gateway effect lookup needs no `FOR UPDATE`: the redeemed grant already
serializes the operation. Effects remain SELECT/INSERT-only. API proposals
serialize on the owned Goal and cannot replace an active/ambiguous action
without the database recovery proof. A replacement still requires a fresh
customer approval. Running progress is read from persisted API state while the
approval HTTP request waits for its verified receipt.

Publication/restart behavior is documented in the
[n8n CLI reference](https://docs.n8n.io/deploy/host-n8n/configure-n8n/use-the-command-line).
