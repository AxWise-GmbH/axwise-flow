#!/usr/bin/env bash

# Build an immutable backend image, migrate production, then deploy API and worker.
# Required credentials must already exist in Google Secret Manager.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-axwise-73425}"
REGION="${REGION:-europe-west4}"
API_SERVICE="${API_SERVICE:-axwise-backend}"
WORKER_SERVICE="${WORKER_SERVICE:-axwise-orqaly-worker}"
MIGRATION_JOB="${MIGRATION_JOB:-axwise-db-migrate}"
REPOSITORY="${REPOSITORY:-axwise-backend-repo}"
REVISION="${REVISION:-$(git rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${API_SERVICE}:${REVISION}"
GEMINI_MODEL="${GEMINI_MODEL:-models/gemini-3.5-flash}"
OPENREGISTER_SECRET="${OPENREGISTER_SECRET:-OPENREGISTER_API_KEY}"
REQUIRE_OPENREGISTER="${REQUIRE_OPENREGISTER:-false}"

if [[ "${REQUIRE_OPENREGISTER}" != "true" && "${REQUIRE_OPENREGISTER}" != "false" ]]; then
  echo "REQUIRE_OPENREGISTER must be true or false" >&2
  exit 1
fi

required_secrets=(
  DATABASE_URL
  CLERK_SECRET_KEY
  GEMINI_API_KEY
  ORQALY_API_KEY
  axwise-orqaly-m2m-key
  axwise-orqaly-webhook-signing-secret
)

for secret in "${required_secrets[@]}"; do
  gcloud secrets describe "${secret}" --project "${PROJECT_ID}" >/dev/null
done

# Google Search grounding uses GEMINI_API_KEY. OpenRegister is optional for
# hybrid web+registry research, but when its Secret Manager entry exists the
# durable worker receives it without exposing the value in this script. Set
# REQUIRE_OPENREGISTER=true for a release that must not proceed without
# registry-backed grounding.
WORKER_SECRET_BINDINGS="DATABASE_URL=DATABASE_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ORQALY_API_KEY=ORQALY_API_KEY:latest,AXWISE_API_KEY=axwise-orqaly-m2m-key:latest,AXWISE_WEBHOOK_SIGNING_SECRET=axwise-orqaly-webhook-signing-secret:latest"
if gcloud secrets describe "${OPENREGISTER_SECRET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  WORKER_SECRET_BINDINGS="${WORKER_SECRET_BINDINGS},OPENREGISTER_API_KEY=${OPENREGISTER_SECRET}:latest"
  echo "OpenRegister grounding enabled from Secret Manager secret ${OPENREGISTER_SECRET}"
elif [[ "${REQUIRE_OPENREGISTER}" == "true" ]]; then
  echo "Required Secret Manager secret ${OPENREGISTER_SECRET} is unavailable" >&2
  exit 1
else
  echo "OpenRegister secret ${OPENREGISTER_SECRET} is unavailable; grounded research will use Google Search sources and fail closed if its source policy is not satisfied" >&2
fi

echo "Building ${IMAGE}"
gcloud builds submit \
  --config cloudbuild.yaml \
  --region "${REGION}" \
  --substitutions "_IMAGE_NAME=${IMAGE}" \
  --project "${PROJECT_ID}" \
  .

echo "Deploying migration job"
gcloud run jobs deploy "${MIGRATION_JOB}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --command python \
  --args=-m,alembic,-c,/app/backend/alembic.ini,upgrade,head \
  --set-env-vars ENVIRONMENT=production \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --max-retries 0 \
  --task-timeout 30m

echo "Running migration job"
gcloud run jobs execute "${MIGRATION_JOB}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --wait

echo "Deploying API"
gcloud run deploy "${API_SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 8Gi \
  --cpu 4 \
  --timeout 3600 \
  --concurrency 5 \
  --min-instances 1 \
  --max-instances 5 \
  --update-env-vars "^@^ENVIRONMENT=production@LLM_PROVIDER=gemini@GEMINI_MODEL=${GEMINI_MODEL}@AXWISE_WEBHOOK_ALLOWED_HOSTS=orqaly.com,api.orqaly.com@AXWISE_BUILD_REVISION=${REVISION}" \
  --update-secrets "DATABASE_URL=DATABASE_URL:latest,CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ORQALY_API_KEY=ORQALY_API_KEY:latest,AXWISE_API_KEY=axwise-orqaly-m2m-key:latest,AXWISE_WEBHOOK_SIGNING_SECRET=axwise-orqaly-webhook-signing-secret:latest"

# Cloud Run preserves an explicit revision pin when a service was previously
# configured with one. Route to the revision created above so the health check
# cannot accidentally validate an older serving revision.
API_REVISION="$(gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestCreatedRevisionName)')"
if [[ -z "${API_REVISION}" ]]; then
  echo "Could not determine the newly created API revision" >&2
  exit 1
fi

echo "Switching API traffic to ${API_REVISION}"
gcloud run services update-traffic "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --to-revisions "${API_REVISION}=100"

echo "Deploying durable Orqaly A+B worker"
gcloud run deploy "${WORKER_SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --no-allow-unauthenticated \
  --command python \
  --args=-m,backend.scripts.run_orqaly_hybrid_worker_service \
  --memory 8Gi \
  --cpu 4 \
  --timeout 3600 \
  --concurrency 1 \
  --min-instances 1 \
  --max-instances 1 \
  --set-env-vars "^@^ENVIRONMENT=production@LLM_PROVIDER=gemini@GEMINI_MODEL=${GEMINI_MODEL}@MAX_PERSONAS=5@WORKER_POLL_SECONDS=1@AXWISE_WEBHOOK_ALLOWED_HOSTS=orqaly.com,api.orqaly.com@AXWISE_BUILD_REVISION=${REVISION}" \
  --set-secrets "${WORKER_SECRET_BINDINGS}"

API_URL="$(gcloud run services describe "${API_SERVICE}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
EXPECTED_REVISION="${REVISION}" python3 - "${API_URL}/health" <<'PY'
import json
import os
import sys
import urllib.request

with urllib.request.urlopen(sys.argv[1], timeout=30) as response:
    payload = json.load(response)
if payload.get("revision") != os.environ["EXPECTED_REVISION"]:
    raise SystemExit(
        f"backend revision mismatch: expected {os.environ['EXPECTED_REVISION']}, "
        f"received {payload.get('revision')}"
    )
PY

READY_REVISION="$(gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)')"
if [[ "${READY_REVISION}" != "${API_REVISION}" ]]; then
  echo "Expected ${API_REVISION} to be ready, but Cloud Run reports ${READY_REVISION}" >&2
  exit 1
fi

TRAFFIC_REVISION="$(gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].revisionName)')"
TRAFFIC_PERCENT="$(gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].percent)')"
if [[ "${TRAFFIC_REVISION}" != "${API_REVISION}" || "${TRAFFIC_PERCENT}" != "100" ]]; then
  echo "Expected 100% API traffic on ${API_REVISION}; received ${TRAFFIC_REVISION} at ${TRAFFIC_PERCENT}%" >&2
  exit 1
fi

WORKER_CREATED_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestCreatedRevisionName)')"
WORKER_READY_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)')"
if [[ -z "${WORKER_CREATED_REVISION}" || "${WORKER_READY_REVISION}" != "${WORKER_CREATED_REVISION}" ]]; then
  echo "Expected worker revision ${WORKER_CREATED_REVISION} to be ready; Cloud Run reports ${WORKER_READY_REVISION}" >&2
  exit 1
fi

echo "Deployment complete: ${IMAGE} (${API_REVISION})"
