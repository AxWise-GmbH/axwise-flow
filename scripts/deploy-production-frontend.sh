#!/usr/bin/env bash

# Build and deploy an immutable AxWise frontend revision, switch all traffic to
# it, then verify both the Cloud Run URL and the public axwise.de domain.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-axwise-73425}"
REGION="${REGION:-europe-west4}"
SERVICE_NAME="${SERVICE_NAME:-axwise-flow}"
REPOSITORY="${REPOSITORY:-firebaseapphosting-images}"
CLERK_SECRET_NAME="${CLERK_SECRET_NAME:-CLERK_SECRET_KEY}"
REVISION="${REVISION:-$(git rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:${REVISION}"

gcloud secrets describe "${CLERK_SECRET_NAME}" --project "${PROJECT_ID}" >/dev/null

SUBSTITUTIONS="_IMAGE_NAME=${IMAGE}"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_API_URL=https://api.axwise.de"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_ENABLE_CLERK_AUTH=true"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuYXh3aXNlLmRlJA"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_CLERK_DOMAIN=axwise.de"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyFakeFirebaseBrowserKeyForTesting123"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT_ID}"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_ENABLE_FIREBASE_INTEGRATION=true"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_PERSONAS_ONLY=true"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_ENABLE_MULTI_STAKEHOLDER=false"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_MAX_STAKEHOLDERS=10"
SUBSTITUTIONS="${SUBSTITUTIONS},_NEXT_PUBLIC_STAKEHOLDER_CONFIDENCE_THRESHOLD=0.3"

echo "Building ${IMAGE}"
gcloud builds submit \
  --config cloudbuild.frontend.yaml \
  --region "${REGION}" \
  --substitutions "${SUBSTITUTIONS}" \
  --project "${PROJECT_ID}" \
  .

echo "Deploying ${SERVICE_NAME}"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 80 \
  --min-instances 1 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production,ENVIRONMENT=production,AXWISE_BUILD_REVISION=${REVISION},NEXT_PUBLIC_ENABLE_CLERK_AUTH=true,NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_Y2xlcmsuYXh3aXNlLmRlJA,NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in,NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up,NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/unified-dashboard,NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/unified-dashboard,NEXT_PUBLIC_API_URL=https://api.axwise.de,NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyFakeFirebaseBrowserKeyForTesting123,NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT_ID},NEXT_PUBLIC_PERSONAS_ONLY=true,NEXT_PUBLIC_ENABLE_MULTI_STAKEHOLDER=false,NEXT_PUBLIC_MAX_STAKEHOLDERS=10,NEXT_PUBLIC_STAKEHOLDER_CONFIDENCE_THRESHOLD=0.3" \
  --set-secrets "CLERK_SECRET_KEY=${CLERK_SECRET_NAME}:latest" \
  --port 8080 \
  --project "${PROJECT_ID}"

CREATED_REVISION="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestCreatedRevisionName)')"
if [[ -z "${CREATED_REVISION}" ]]; then
  echo "Could not determine the newly created frontend revision" >&2
  exit 1
fi

echo "Switching frontend traffic to ${CREATED_REVISION}"
gcloud run services update-traffic "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --to-revisions "${CREATED_REVISION}=100"

READY_REVISION="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)')"
if [[ "${READY_REVISION}" != "${CREATED_REVISION}" ]]; then
  echo "Expected ${CREATED_REVISION} to be ready, but Cloud Run reports ${READY_REVISION}" >&2
  exit 1
fi

TRAFFIC_REVISION="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].revisionName)')"
TRAFFIC_PERCENT="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].percent)')"
if [[ "${TRAFFIC_REVISION}" != "${CREATED_REVISION}" || "${TRAFFIC_PERCENT}" != "100" ]]; then
  echo "Expected 100% frontend traffic on ${CREATED_REVISION}; received ${TRAFFIC_REVISION} at ${TRAFFIC_PERCENT}%" >&2
  exit 1
fi

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.url)')"

EXPECTED_REVISION="${REVISION}" python3 - "${SERVICE_URL}/api/health" <<'PY'
import json
import os
import sys
import urllib.request

with urllib.request.urlopen(sys.argv[1], timeout=30) as response:
    payload = json.load(response)
if payload.get("revision") != os.environ["EXPECTED_REVISION"]:
    raise SystemExit(
        f"frontend revision mismatch: expected {os.environ['EXPECTED_REVISION']}, "
        f"received {payload.get('revision')}"
    )
PY

EXPECTED_REVISION="${REVISION}" python3 - "https://axwise.de/api/health" <<'PY'
import json
import os
import sys
import urllib.request

request = urllib.request.Request(
    sys.argv[1],
    headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
)
with urllib.request.urlopen(request, timeout=30) as response:
    payload = json.load(response)
if payload.get("revision") != os.environ["EXPECTED_REVISION"]:
    raise SystemExit(
        f"public frontend revision mismatch: expected {os.environ['EXPECTED_REVISION']}, "
        f"received {payload.get('revision')}"
    )
PY

curl --fail --silent --show-error \
  -H 'Cache-Control: no-cache' \
  "https://axwise.de/" |
  grep -F 'Give agents the context to solve the' >/dev/null
curl --fail --silent --show-error \
  -H 'Cache-Control: no-cache' \
  "https://axwise.de/docs" |
  grep -F 'Run the Reference Stack' >/dev/null

echo "Deployment complete: ${IMAGE} (${CREATED_REVISION})"
