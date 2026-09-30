# Preview agent evaluations

`orqanix-agent-evaluations-preview` is a separate Cloud Run Job from the HTTP
uptime collector `orqanix-heartbeat-preview`. It compares Orqanix and a vanilla
model on the same deterministic, versioned inputs in five categories: message,
coding, search, research, and automated plan. Each 15-minute UTC slot selects
one case per category. The 15-minute, 3-hour, and 24-hour views aggregate real
observations only; empty windows stay empty and missed runs are not fabricated.

The Orqanix coding arm is retired and records failed execution with a
`not_evaluated` verdict and `NATIVE_CODING_ADAPTER_UNAVAILABLE`; it makes no model
request and runs no fixture. The direct-model coding comparator still checks its
output using the disposable fixture and Jev review. The runner exits nonzero
while the native adapter is unavailable, so scheduled runs cannot appear fully
successful. Use `scripts/benchmark-native-engineering.mjs` for the separate
native Goose benchmark. This cloud job does not test the installed desktop UI. Automated plan evaluates a
generated implementation plan; it does not approve or execute a Goal. Jev is
advisory review alongside deterministic checks, not a factual-correctness
guarantee. Inspect execution status and evaluation verdict separately. Historical receipts remain unchanged; their source revision identifies the earlier method.

The judge receives the exact task prompt as well as the output and criteria.
Facts supplied in a transformation task are part of that task's evidence;
source-backed Search and Research claims also receive bounded, hashed excerpts
from the cited official pages. A completed request can still fail quality
checks, and a judge or evidence-fetch failure must not be presented as a pass.
The runner commit and template version identify the method used for each run.
Word limits count visible prose, including headings and descriptive link labels;
Markdown-only markers, URLs and numeric citation labels do not count as words.
The runner checks these limits deterministically and supplies the measured count
to Jev. Jev assesses semantic criteria without recounting words; its original
advisory probabilities and overall threshold remain part of the receipt.
When the same official document is cited both by root URL and fragment, the
explicit root citation uses the catalog's relevant section mapping. An invalid
fragment alone does not become supporting evidence.

Orqanix token usage currently remains unreported because the Assistant message
contract does not preserve AxWise usage metrics. The dashboard does not infer
usage from text length or cloud logs. A coding model alias is likewise not
enough to claim a matching resolved model or calculate a latency ratio.

## Resources and access

All resources are fixed to project `axwise-v2-preview-001` (number
`161074549006`), region `europe-west4`. The deployment script verifies the
project number and rejects unrelated API origins, image repositories, and image tags.

| Resource | Purpose and access |
| --- | --- |
| `orqanix-agent-evaluations-preview-161074549006` bucket | Private, uniform bucket-level access, enforced public-access prevention; deletes objects after 30 days |
| `orqanix-evaluations-runner@axwise-v2-preview-001.iam.gserviceaccount.com` | Object user on that bucket; workload identity accepted by the preview evaluation API |
| `orqanix-evaluations-trigger@axwise-v2-preview-001.iam.gserviceaccount.com` | Invoker on this Cloud Run Job only |
| `orqaly-v2-web-preview@axwise-v2-preview-001.iam.gserviceaccount.com` | Object viewer on the evaluation bucket; read-only web mount |

The runner obtains short-lived Google workload tokens from its runtime. Model
and judge keys remain in the API; the runner and trigger receive no secret
access roles or service-account keys. The API fixes the Clerk tenant owner to
the dedicated development user `user_3JcxJdUZieTRXs5AqIW7BTx3c1G` (external ID
`orqanix-preview-agent-evaluations`). This is not a human session or login grant.

## Provision and deploy

Use the existing authenticated `gcloud` CLI; do not switch its default project
or account. The script passes the preview target explicitly on every mutation.
Provision storage and identities before an image is available:

```bash
./scripts/deploy-agent-evaluations-preview.sh --provision-only
```

Build the reviewed runner with the evaluation container configuration. Record
the Cloud Build ID, full source commit, and Artifact Registry digest. Deploy
only the immutable image matching that source:

```bash
export RUNNER_REVISION="$(git rev-parse --verify HEAD)"
export EVALUATION_IMAGE='europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqanix-agent-evaluations@sha256:REPLACE_WITH_64_CHARACTER_DIGEST'
./scripts/deploy-agent-evaluations-preview.sh
```

The job has one task, two CPUs, 2 GiB memory, a 14-minute timeout, and zero
retries. Its only configured environment values are `EVALUATION_BUCKET`,
`EVALUATION_API_ORIGIN`, and `RUNNER_REVISION`. The API origin defaults to the
canonical preview API below. For candidate verification it also accepts the
known preview origin `https://orqaly-v2-api-preview-6b2bpwa4kq-ez.a.run.app`
or that origin prefixed with `evaluations-<8 lowercase hex characters>---`.
The OIDC audience remains canonical. Bucket records, public evidence, and slot claims expire
after 30 days. The script reconciles those dedicated resources idempotently;
it does not delete history or change the API/web services.

A new Scheduler job is left **PAUSED** at `*/15 * * * *`, `Etc/UTC`, with zero
retries. Because Scheduler has no create-paused option, initial creation uses
a distant daily fire time, pauses the job, and then sets the 15-minute schedule.
An existing schedule keeps its prior enabled/paused state. A deployment never
resumes a schedule. If initial provisioning fails, inspect and pause the
schedule before retrying.

## API and web candidates

Deploy the reviewed API image as a tagged preview candidate with these exact
environment values. Use `--update-env-vars`, retaining all existing settings
and secret references:

```text
ORQALY_ENVIRONMENT=preview
ORQALY_AGENT_EVALUATION_ENABLED=true
ORQALY_AGENT_EVALUATION_AUDIENCE=https://orqaly-v2-api-preview-161074549006.europe-west4.run.app
ORQALY_AGENT_EVALUATION_SERVICE_ACCOUNT=orqanix-evaluations-runner@axwise-v2-preview-001.iam.gserviceaccount.com
ORQALY_EVALUATION_USER_ID=user_3JcxJdUZieTRXs5AqIW7BTx3c1G
```

The ingress verifies Google OIDC audience and the exact runner service-account
email, then uses the fixed Clerk user for tenant binding. Keep production
evaluation ingress disabled. Set `EVALUATION_API_ORIGIN` to the allowed tagged
preview candidate when deploying the job for its first verification. After
promoting the reviewed API revision, unset that override and redeploy the job
to use the canonical origin before resuming the schedule.

Deploy the matching web candidate with its existing web service account and
this additional read-only mount; preserve the separate uptime mount:

```bash
gcloud run services update orqaly-v2-web-preview \
  --project=axwise-v2-preview-001 --region=europe-west4 \
  --image="${WEB_IMAGE}" --revision-suffix="${REVISION_SUFFIX}" \
  --add-volume='name=agent-evaluations,type=cloud-storage,bucket=orqanix-agent-evaluations-preview-161074549006,readonly=true,mount-options=metadata-cache-ttl-secs=0' \
  --add-volume-mount=volume=agent-evaluations,mount-path=/var/run/orqanix-agent-evaluations \
  --tag="${REVISION_SUFFIX}" --no-traffic
```

Nginx serves exactly `/heartbeat/evaluations.json` from
`/var/run/orqanix-agent-evaluations/public/evaluations.json` and UUID-shaped
`/heartbeat/evidence/<uuid>.json` paths from `public/evidence/<uuid>.json`.
It must never expose bucket listings, `records/`, or `claims/`. The bucket is
not public: only these intentionally public benchmark outputs are served by
the web service. Requests use no-store responses; the mount's metadata TTL is
zero so new objects become visible promptly.

## Verify, then enable

With the schedule paused, run one real execution:

```bash
gcloud run jobs execute orqanix-agent-evaluations-preview \
  --project=axwise-v2-preview-001 --region=europe-west4 --wait
gcloud run jobs executions list --job=orqanix-agent-evaluations-preview \
  --project=axwise-v2-preview-001 --region=europe-west4 --limit=3
```

Verify the new record's source revision, timestamp, five category records (including the explicitly unavailable coding arm),
evidence links, and actual execution/evaluation outcomes on the web candidate.
Read `/heartbeat/evaluations.json` and one referenced evidence URL. Verify that
unrelated paths under `/heartbeat/evidence/` cannot read arbitrary objects.
Check the existing `/heartbeat.json` still works, then promote the reviewed web
revision. Do not backfill old timestamps to populate the historical windows.

Slot claims prevent duplicate runs. If another execution already claimed the
current slot, wait for the next slot instead of removing claims to force a
green result. A failed claimed execution can leave a missing observation;
inspect Cloud Run execution logs rather than interpreting it as success.

After those checks, explicitly enable unattended execution:

```bash
gcloud scheduler jobs resume orqanix-agent-evaluations-preview \
  --project=axwise-v2-preview-001 --location=europe-west4
```

Inspect the first scheduled Cloud Run execution and its published evidence.
Scheduler acceptance only means the Run API accepted the launch; it does not
prove the evaluations completed. Incomplete and failed observations remain
visible; the zero-retry policy prevents immediate replacement of an outcome.

## Pause and rollback

```bash
gcloud scheduler jobs pause orqanix-agent-evaluations-preview \
  --project=axwise-v2-preview-001 --location=europe-west4
```

Pause before investigating unexpected model usage or outcomes. Roll back the
runner by deploying its prior reviewed image and matching `RUNNER_REVISION`;
the deployment preserves the pause. Revert API/web traffic to their recorded
prior revisions if needed. To remove evaluation ingress from the preview API,
remove only `ORQALY_AGENT_EVALUATION_ENABLED`,
`ORQALY_AGENT_EVALUATION_AUDIENCE`,
`ORQALY_AGENT_EVALUATION_SERVICE_ACCOUNT`, and `ORQALY_EVALUATION_USER_ID`;
retain `ORQALY_ENVIRONMENT` and all unrelated settings. Remove only this task's
unused tagged candidate revisions after confirming they receive no traffic.
Keep the private evidence bucket for its 30-day lifecycle. Do not delete the
HTTP uptime job, shared secrets, existing service identities, or product data.
