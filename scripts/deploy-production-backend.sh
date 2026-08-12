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
GEMINI_MODEL="${GEMINI_MODEL:-models/gemini-3.6-flash}"
OPENREGISTER_SECRET="${OPENREGISTER_SECRET:-OPENREGISTER_API_KEY}"
REQUIRE_OPENREGISTER="${REQUIRE_OPENREGISTER:-false}"
SEARXNG_URL="${SEARXNG_URL:-}"
AXWISE_MARKET_CELL_CONCURRENCY="${AXWISE_MARKET_CELL_CONCURRENCY:-6}"
AXWISE_PERSONA_CONCURRENCY="${AXWISE_PERSONA_CONCURRENCY:-5}"

if [[ "${REQUIRE_OPENREGISTER}" != "true" && "${REQUIRE_OPENREGISTER}" != "false" ]]; then
  echo "REQUIRE_OPENREGISTER must be true or false" >&2
  exit 1
fi

for concurrency in "${AXWISE_MARKET_CELL_CONCURRENCY}" "${AXWISE_PERSONA_CONCURRENCY}"; do
  if [[ ! "${concurrency}" =~ ^[1-8]$ ]]; then
    echo "Research concurrency values must be integers from 1 to 8" >&2
    exit 1
  fi
done

required_secrets=(
  DATABASE_URL
  CLERK_SECRET_KEY
  GEMINI_API_KEY
  AXWISE_AUTHORITY_PROOF_SECRET
  ORQALY_API_KEY
  axwise-orqaly-m2m-key
  axwise-orqaly-webhook-signing-secret
)

for secret in "${required_secrets[@]}"; do
  gcloud secrets describe "${secret}" --project "${PROJECT_ID}" >/dev/null
done

# Authority attestations are only meaningful when every serving process uses a
# strong shared signing secret. Validate the latest value before the image is
# built, consume it only through stdin, and never print or interpolate it.
if ! gcloud secrets versions access latest \
  --secret AXWISE_AUTHORITY_PROOF_SECRET \
  --project "${PROJECT_ID}" \
  | python3 -c 'import sys
value = sys.stdin.buffer.read()
try:
    value.decode("utf-8")
except UnicodeDecodeError:
    raise SystemExit(1)
raise SystemExit(0 if len(value) >= 32 else 1)'
then
  echo "Latest AXWISE_AUTHORITY_PROOF_SECRET must be valid UTF-8 and at least 32 bytes" >&2
  exit 1
fi

# Google Search grounding uses GEMINI_API_KEY. OpenRegister is optional for
# hybrid web+registry research, but when its Secret Manager entry exists the
# durable worker receives it without exposing the value in this script. Set
# REQUIRE_OPENREGISTER=true for a release that must not proceed without
# registry-backed grounding.
WORKER_SECRET_BINDINGS="DATABASE_URL=DATABASE_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ORQALY_API_KEY=ORQALY_API_KEY:latest,AXWISE_API_KEY=axwise-orqaly-m2m-key:latest,AXWISE_WEBHOOK_SIGNING_SECRET=axwise-orqaly-webhook-signing-secret:latest,AXWISE_AUTHORITY_PROOF_SECRET=AXWISE_AUTHORITY_PROOF_SECRET:latest"
WORKER_ENV_VARS="^@^ENVIRONMENT=production@LLM_PROVIDER=gemini@GEMINI_MODEL=${GEMINI_MODEL}@GEMINI_SEARCH_MODEL=${GEMINI_MODEL}@GEMINI_TEXT_MODEL=${GEMINI_MODEL}@STAKEHOLDER_GEMINI_MODEL=${GEMINI_MODEL}@MAX_PERSONAS=5@AXWISE_MARKET_CELL_CONCURRENCY=${AXWISE_MARKET_CELL_CONCURRENCY}@AXWISE_PERSONA_CONCURRENCY=${AXWISE_PERSONA_CONCURRENCY}@WORKER_POLL_SECONDS=1@AXWISE_WEBHOOK_ALLOWED_HOSTS=orqaly.com,api.orqaly.com@AXWISE_BUILD_REVISION=${REVISION}"
if gcloud secrets describe "${OPENREGISTER_SECRET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  WORKER_SECRET_BINDINGS="${WORKER_SECRET_BINDINGS},OPENREGISTER_API_KEY=${OPENREGISTER_SECRET}:latest"
  echo "OpenRegister grounding enabled from Secret Manager secret ${OPENREGISTER_SECRET}"
elif [[ "${REQUIRE_OPENREGISTER}" == "true" ]]; then
  echo "Required Secret Manager secret ${OPENREGISTER_SECRET} is unavailable" >&2
  exit 1
else
  echo "OpenRegister secret ${OPENREGISTER_SECRET} is unavailable; grounded research will use Google Search sources and fail closed if its source policy is not satisfied" >&2
fi

# SearXNG is an optional self-hosted secondary search route. Remote cleartext
# endpoints and credential-bearing URLs are rejected; Gemini Google Search
# remains the default provider when this is unset.
if [[ -n "${SEARXNG_URL}" ]]; then
  if [[ "${SEARXNG_URL}" == *"@"* ]] || [[ ! "${SEARXNG_URL}" =~ ^https:// ]]; then
    echo "SEARXNG_URL must be a credential-free HTTPS endpoint" >&2
    exit 1
  fi
  WORKER_ENV_VARS="${WORKER_ENV_VARS}@SEARXNG_URL=${SEARXNG_URL}@SEARXNG_AUTH_MODE=google_identity"
  echo "Optional self-hosted SearXNG secondary route enabled"
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
  --update-env-vars "^@^ENVIRONMENT=production@LLM_PROVIDER=gemini@GEMINI_MODEL=${GEMINI_MODEL}@GEMINI_SEARCH_MODEL=${GEMINI_MODEL}@GEMINI_TEXT_MODEL=${GEMINI_MODEL}@STAKEHOLDER_GEMINI_MODEL=${GEMINI_MODEL}@AXWISE_WEBHOOK_ALLOWED_HOSTS=orqaly.com,api.orqaly.com@AXWISE_BUILD_REVISION=${REVISION}" \
  --update-secrets "DATABASE_URL=DATABASE_URL:latest,CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ORQALY_API_KEY=ORQALY_API_KEY:latest,AXWISE_API_KEY=axwise-orqaly-m2m-key:latest,AXWISE_WEBHOOK_SIGNING_SECRET=axwise-orqaly-webhook-signing-secret:latest,AXWISE_AUTHORITY_PROOF_SECRET=AXWISE_AUTHORITY_PROOF_SECRET:latest"

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
  --set-env-vars "${WORKER_ENV_VARS}" \
  --set-secrets "${WORKER_SECRET_BINDINGS}"

# As with the API, Cloud Run can preserve a previously pinned worker revision.
# Resolve the revision created by this deployment and route all worker traffic
# to it before declaring the durable execution path healthy.
WORKER_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestCreatedRevisionName)')"
if [[ -z "${WORKER_REVISION}" ]]; then
  echo "Could not determine the newly created worker revision" >&2
  exit 1
fi

echo "Switching worker traffic to ${WORKER_REVISION}"
gcloud run services update-traffic "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --to-revisions "${WORKER_REVISION}=100"

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

WORKER_READY_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)')"
if [[ "${WORKER_READY_REVISION}" != "${WORKER_REVISION}" ]]; then
  echo "Expected worker revision ${WORKER_REVISION} to be ready; Cloud Run reports ${WORKER_READY_REVISION}" >&2
  exit 1
fi

WORKER_TRAFFIC_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].revisionName)')"
WORKER_TRAFFIC_PERCENT="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].percent)')"
if [[ "${WORKER_TRAFFIC_REVISION}" != "${WORKER_REVISION}" || "${WORKER_TRAFFIC_PERCENT}" != "100" ]]; then
  echo "Expected 100% worker traffic on ${WORKER_REVISION}; received ${WORKER_TRAFFIC_REVISION} at ${WORKER_TRAFFIC_PERCENT}%" >&2
  exit 1
fi

echo "Deployment complete: ${IMAGE} (${API_REVISION})"
