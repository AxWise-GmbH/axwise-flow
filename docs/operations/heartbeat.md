# Orqanix heartbeat operations

The public heartbeat is collected by `orqanix-heartbeat-preview`, a Cloud Run
Job in `axwise-v2-preview-001`. Cloud Scheduler starts it every 15 minutes. The
job writes only `latest.json` to the dedicated private bucket
`orqanix-heartbeat-preview-161074549006`; both Orqanix domains serve that object
through their same-origin `/heartbeat.json` endpoint. The web service mounts
the bucket read-only using its service identity. Public bucket access is
prevented; only the status JSON is served by Nginx.

GitHub Actions retains a manual diagnostic workflow, but does not schedule or
publish the public status page.

## Build and deploy

Build from a clean, reviewed commit. Export only the four tracked heartbeat
files so ignored artifacts and local credentials cannot enter the build
context:

```bash
test -z "$(git status --porcelain=v1 --untracked-files=all)"
SOURCE_COMMIT="$(git rev-parse --verify HEAD)"
BUILD_CONTEXT="$(mktemp -d)"
git archive --format=tar "${SOURCE_COMMIT}" -- \
  deploy/heartbeat/Dockerfile \
  deploy/heartbeat/cloudbuild.yaml \
  scripts/heartbeat-service.mjs \
  scripts/heartbeat-publish.mjs \
  | tar -xf - -C "${BUILD_CONTEXT}"

IMAGE_TAG="europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqanix-heartbeat:${SOURCE_COMMIT}"
BUILD_ID="$(gcloud builds submit "${BUILD_CONTEXT}" \
  --project=axwise-v2-preview-001 \
  --region=europe-west4 \
  --gcs-source-staging-dir=gs://axwise-v2-preview-001_cloudbuild/source \
  --service-account=projects/axwise-v2-preview-001/serviceAccounts/workflow-v2-preview-build@axwise-v2-preview-001.iam.gserviceaccount.com \
  --config="${BUILD_CONTEXT}/deploy/heartbeat/cloudbuild.yaml" \
  --substitutions="_IMAGE_NAME=${IMAGE_TAG}" \
  --format='value(id)' --quiet)"
IMAGE_DIGEST="$(gcloud artifacts docker images describe "${IMAGE_TAG}" \
  --project=axwise-v2-preview-001 \
  --format='value(image_summary.digest)')"
export HEARTBEAT_IMAGE="${IMAGE_TAG%:*}@${IMAGE_DIGEST}"
./scripts/deploy-heartbeat-preview.sh
```

Keep the build ID with the release evidence. The deploy script rejects tags
and accepts only the expected Artifact Registry image at an exact sha256
digest. It creates or reconciles two service accounts, one bucket, one Cloud
Run Job and one Cloud Scheduler job. It does not create service-account keys or
grant project-wide runtime roles. The existing web service identity receives
object-viewer access only on this status bucket.

Build the matching web image using the existing web Cloud Build configuration
and pinned API/publishable-key inputs. Deploy it with this read-only mount
(replace `WEB_IMAGE` with its reviewed image digest and `REVISION_SUFFIX` with
a unique release suffix):

```bash
gcloud run services update orqaly-v2-web-preview \
  --project=axwise-v2-preview-001 --region=europe-west4 \
  --image="${WEB_IMAGE}" --revision-suffix="${REVISION_SUFFIX}" \
  --add-volume='name=heartbeat,type=cloud-storage,bucket=orqanix-heartbeat-preview-161074549006,readonly=true,mount-options=metadata-cache-ttl-secs=0' \
  --add-volume-mount=volume=heartbeat,mount-path=/var/run/orqanix-heartbeat \
  --tag="${REVISION_SUFFIX}" --no-traffic
```

Verify `/heartbeat.json` on the candidate revision after the first collector
execution, then promote that exact revision with `gcloud run services
update-traffic --to-revisions=REVISION=100`. Keep the prior revision for rollback.

Remove the temporary build context after recording the digest:

```bash
rm -rf -- "${BUILD_CONTEXT}"
```

## Smoke test

Exercise the configured OAuth path instead of invoking the Cloud Run Job
directly:

```bash
gcloud scheduler jobs run orqanix-heartbeat-preview \
  --project=axwise-v2-preview-001 --location=europe-west4
gcloud run jobs executions list \
  --job=orqanix-heartbeat-preview \
  --project=axwise-v2-preview-001 --region=europe-west4 --limit=1
curl -fsS https://orqanix.com/heartbeat.json | jq '{timestamp,allHealthy,endpoints}'
curl -fsS https://preview.orqanix.com/heartbeat.json | jq '{timestamp,allHealthy,endpoints}'
```

The timestamp should be from the new execution, and both domains should return
the same snapshot. A probe failure is still published with `allHealthy: false`
before the Cloud Run execution exits unsuccessfully. That failed observation is
useful status data, so the scheduler has zero retries and cannot immediately
overwrite it. The Scheduler invocation can succeed once the Run API accepts the
request even when the resulting execution fails; inspect the execution and the
published JSON together.

The browser labels a snapshot older than `staleAfterSeconds` (30 minutes) as
`STALE` and removes its healthy styling. This gives one missed 15-minute run
before the public status turns stale. It must not be interpreted as proof that
the endpoints are down.

## Cadence and rollback

Change cadence only on the existing Scheduler job, keeping UTC explicit. If the
cadence is made slower, update `staleAfterSeconds` in the reviewed collector at
the same time so healthy data does not become stale between expected runs.

```bash
gcloud scheduler jobs update http orqanix-heartbeat-preview \
  --project=axwise-v2-preview-001 --location=europe-west4 \
  --schedule='*/15 * * * *' --time-zone=Etc/UTC
```

To roll back collector code, deploy the previous reviewed image digest through
`HEARTBEAT_IMAGE=... ./scripts/deploy-heartbeat-preview.sh`, then run the
scheduler smoke test. To stop publication during an incident, pause the
scheduler. The current observation remains available and becomes visibly stale
after 30 minutes:

```bash
gcloud scheduler jobs pause orqanix-heartbeat-preview \
  --project=axwise-v2-preview-001 --location=europe-west4
```

Resume it and run one smoke test after the incident. Keep only the status object
in this bucket; application data, logs and secrets belong elsewhere. The web
mount is read-only and Nginx serves only the fixed `latest.json` path.
