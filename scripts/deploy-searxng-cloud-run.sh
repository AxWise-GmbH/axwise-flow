#!/usr/bin/env bash

# Deploy a private, JSON-only SearXNG secondary search route for AxWise.
# The worker authenticates with its Cloud Run service identity; no public
# SearXNG instance or static bearer token is used.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-axwise-73425}"
REGION="${REGION:-europe-west4}"
SERVICE="${SEARXNG_SERVICE:-axwise-searxng}"
WORKER_SERVICE="${WORKER_SERVICE:-axwise-orqaly-worker}"
REPOSITORY="${REPOSITORY:-axwise-backend-repo}"
SECRET="${SEARXNG_SECRET_NAME:-axwise-searxng-secret}"
SERVICE_ACCOUNT="${SEARXNG_SERVICE_ACCOUNT:-axwise-searxng@${PROJECT_ID}.iam.gserviceaccount.com}"
REVISION="${REVISION:-$(git rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${REVISION}"

gcloud secrets describe "${SECRET}" --project "${PROJECT_ID}" >/dev/null
gcloud iam service-accounts describe "${SERVICE_ACCOUNT}" \
  --project "${PROJECT_ID}" >/dev/null

WORKER_SERVICE_ACCOUNT="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(spec.template.spec.serviceAccountName)')"
if [[ -z "${WORKER_SERVICE_ACCOUNT}" ]]; then
  echo "Could not determine the AxWise worker service account" >&2
  exit 1
fi

echo "Building pinned SearXNG image ${IMAGE}"
gcloud builds submit deploy/searxng \
  --tag "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}"

echo "Deploying private SearXNG service"
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --service-account "${SERVICE_ACCOUNT}" \
  --no-allow-unauthenticated \
  --ingress all \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60 \
  --concurrency 10 \
  --min-instances 0 \
  --max-instances 2 \
  --set-secrets "SEARXNG_SECRET=${SECRET}:latest"

SEARXNG_URL="$(gcloud run services describe "${SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.url)')"
if [[ -z "${SEARXNG_URL}" ]]; then
  echo "Could not determine the SearXNG service URL" >&2
  exit 1
fi

gcloud run services add-iam-policy-binding "${SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --member "serviceAccount:${WORKER_SERVICE_ACCOUNT}" \
  --role roles/run.invoker >/dev/null

gcloud run services update "${SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --update-env-vars "SEARXNG_BASE_URL=${SEARXNG_URL}/" >/dev/null

gcloud run services update "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --update-env-vars "SEARXNG_URL=${SEARXNG_URL},SEARXNG_AUTH_MODE=google_identity" \
  >/dev/null

echo "Private SearXNG ready at ${SEARXNG_URL}; worker access granted to ${WORKER_SERVICE_ACCOUNT}"
