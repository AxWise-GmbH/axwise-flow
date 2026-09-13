#!/usr/bin/env bash
set -euo pipefail
set +x

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${script_directory}/common.sh"

N8N_BOOTSTRAP_IMAGE="${N8N_BOOTSTRAP_IMAGE:?set the digest-pinned n8n bootstrap image}"
N8N_API_KEY_SECRET_VERSION="${N8N_API_KEY_SECRET_VERSION:?set the explicit n8n-issued API-key secret version}"
readonly N8N_BOOTSTRAP_IMAGE N8N_API_KEY_SECRET_VERSION

agentic_preview_require_tools gcloud jq
agentic_preview_assert_foundation
agentic_preview_require_digest N8N_BOOTSTRAP_IMAGE \
  "${N8N_BOOTSTRAP_IMAGE}" n8n-bootstrap
agentic_preview_require_numeric_secret_version "${N8N_API_KEY_SECRET}" \
  "${N8N_API_KEY_SECRET_VERSION}"

n8n_document="$(gcloud run services describe "${N8N_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! jq -e '
  .metadata.annotations["run.googleapis.com/ingress"] == "internal"
  and (.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false") != "true"
  and ([.spec.template.spec.containers[0].env[]?
    | select(.name == "N8N_DISABLE_UI" and .value == "true")] | length) == 1
  and ([.spec.template.spec.containers[0].env[]?
    | select(.name == "N8N_PUBLIC_API_DISABLED" and .value == "false")] | length) == 1
  ' <<<"${n8n_document}" >/dev/null; then
  echo "The private, UI-disabled n8n runtime must be deployed first." >&2
  exit 77
fi
if ! agentic_preview_assert_service_origin_document "${n8n_document}" "${N8N_ORIGIN}"; then
  echo "The n8n runtime does not advertise its deterministic Preview origin." >&2
  exit 77
fi
agentic_preview_assert_no_public_invoker "${N8N_SERVICE}"

gcloud run jobs deploy "${N8N_BOOTSTRAP_JOB}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --image="${N8N_BOOTSTRAP_IMAGE}" \
  --command=node --args=infra/gcp/agentic-preview/gcp-n8n-bootstrap.mjs,reconcile \
  --service-account="${N8N_BOOTSTRAP_SERVICE_ACCOUNT}" \
  --network="${VPC_NETWORK}" --subnet="${VPC_SUBNET}" --vpc-egress=all-traffic \
  --set-env-vars="N8N_API_BASE_URL=${N8N_ORIGIN}/api/v1/,N8N_CLOUD_RUN_AUDIENCE=${N8N_ORIGIN},N8N_BOOTSTRAP_TIMEOUT_MS=10000,N8N_BOOTSTRAP_MAXIMUM_ATTEMPTS=30,N8N_BOOTSTRAP_RETRY_DELAY_MS=2000" \
  --set-secrets="N8N_API_KEY=${N8N_API_KEY_SECRET}:${N8N_API_KEY_SECRET_VERSION}" \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=10m \
  --cpu=1 --memory=512Mi --execute-now --wait --quiet >/dev/null

job_document="$(gcloud run jobs describe "${N8N_BOOTSTRAP_JOB}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! jq -e --arg image "${N8N_BOOTSTRAP_IMAGE}" \
  --arg account "${N8N_BOOTSTRAP_SERVICE_ACCOUNT}" \
  --arg secret "${N8N_API_KEY_SECRET}" --arg version "${N8N_API_KEY_SECRET_VERSION}" '
    .spec.template.spec.template.spec.containers[0].image == $image
    and .spec.template.spec.template.spec.serviceAccountName == $account
    and ([.spec.template.spec.template.spec.containers[0].env[]?
      | select(.name == "N8N_API_KEY")
      | select(.valueFrom.secretKeyRef.name == $secret
        and .valueFrom.secretKeyRef.key == $version)] | length) == 1
  ' <<<"${job_document}" >/dev/null; then
  echo "The n8n bootstrap job does not retain its exact image, identity or key version." >&2
  exit 77
fi

echo "The content-addressed, reviewed n8n workflow is published and ready."
echo "Agent external execution remains disabled in the control plane."
