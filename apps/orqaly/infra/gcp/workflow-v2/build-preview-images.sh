#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
REGION="europe-west4"
REPOSITORY="workflow-v2-preview"
BUILD_SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"
BUILD_SERVICE_ACCOUNT="projects/${PROJECT_ID}/serviceAccounts/workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com"
ORQALY_REPOSITORY="${ORQALY_REPOSITORY:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)}"
AXWISE_REPOSITORY="${AXWISE_REPOSITORY:-$(git -C "${ORQALY_REPOSITORY}" rev-parse --show-toplevel)}"
ORQALY_API_ORIGIN="${ORQALY_API_ORIGIN:?exact Orqaly API origin is required for the web build}"
CLERK_PUBLISHABLE_KEY_VERSION="${CLERK_PUBLISHABLE_KEY_VERSION:?numeric Clerk publishable-key version is required}"
BUILD_ATTESTATION_OUTPUT="${BUILD_ATTESTATION_OUTPUT:?absolute create-only build-attestation path is required}"

readonly PROJECT_ID REGION REPOSITORY BUILD_SOURCE_BUCKET BUILD_SERVICE_ACCOUNT ORQALY_REPOSITORY
readonly AXWISE_REPOSITORY ORQALY_API_ORIGIN CLERK_PUBLISHABLE_KEY_VERSION
readonly BUILD_ATTESTATION_OUTPUT

for tool in gcloud git node; do
  command -v "${tool}" >/dev/null || { echo "${tool} is required." >&2; exit 69; }
done

require_cloud_logging_only() {
  local config="$1" label="$2"
  if ! grep -Eq '^[[:space:]]*logging:[[:space:]]*CLOUD_LOGGING_ONLY[[:space:]]*$' "${config}"; then
    echo "${label} must use CLOUD_LOGGING_ONLY with the dedicated build service account." >&2
    exit 77
  fi
}

if [[ ! "${ORQALY_API_ORIGIN}" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
  echo "ORQALY_API_ORIGIN must be a canonical HTTPS origin without a path." >&2
  exit 64
fi

project_number="$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')"
if [[ ! "${project_number}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not resolve the hard-pinned Preview project number." >&2
  exit 77
fi
api_dns_label="orqaly-v2-api-preview-${project_number}"
if test "${#api_dns_label}" -gt 63; then
  echo "Orqaly API service name is too long for a deterministic Cloud Run URL." >&2
  exit 64
fi
expected_api_origin="https://${api_dns_label}.${REGION}.run.app"
if test "${ORQALY_API_ORIGIN}" != "${expected_api_origin}"; then
  echo "ORQALY_API_ORIGIN must be the deterministic Preview URL ${expected_api_origin}." >&2
  exit 64
fi

require_clean_commit() {
  local repository_path="$1"
  local label="$2"
  local worktree_root
  worktree_root="$(git -C "${repository_path}" rev-parse --show-toplevel)"
  if test -n "$(git -C "${worktree_root}" status --porcelain=v1 --untracked-files=all)"; then
    echo "${label} repository must be clean before an immutable build." >&2
    exit 65
  fi
  git -C "${repository_path}" rev-parse --verify HEAD
}

resolve_digest_ref() {
  local tagged_ref="$1"
  local digest
  digest="$(gcloud artifacts docker images describe "${tagged_ref}" \
    --project="${PROJECT_ID}" \
    --format='value(image_summary.digest)')"
  if [[ ! "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
    echo "Artifact Registry did not return an exact digest for ${tagged_ref}." >&2
    exit 1
  fi
  printf '%s@%s' "${tagged_ref%%:*}" "${digest}"
}

if [[ ! "${CLERK_PUBLISHABLE_KEY_VERSION}" =~ ^[1-9][0-9]*$ ]]; then
  echo "CLERK_PUBLISHABLE_KEY_VERSION must be a positive numeric version." >&2
  exit 78
fi
clerk_publishable_state="$(gcloud secrets versions describe \
  "${CLERK_PUBLISHABLE_KEY_VERSION}" \
  --secret=orqaly-v2-preview-001-clerk-publishable-key \
  --project="${PROJECT_ID}" --format='value(state)')"
if test "${clerk_publishable_state}" != "ENABLED"; then
  echo "The pinned Clerk publishable-key version is not enabled." >&2
  exit 78
fi

require_cloud_logging_only \
  "${ORQALY_REPOSITORY}/deploy/workflow-v2/cloudbuild.service.yaml" \
  "Orqaly service Cloud Build config"
require_cloud_logging_only \
  "${ORQALY_REPOSITORY}/deploy/workflow-v2/cloudbuild.web.yaml" \
  "Orqaly web Cloud Build config"
require_cloud_logging_only \
  "${AXWISE_REPOSITORY}/cloudbuild.workflow-v2.yaml" \
  "AxWise Cloud Build config"

orqaly_commit="$(require_clean_commit "${ORQALY_REPOSITORY}" Orqaly)"
axwise_commit="$(require_clean_commit "${AXWISE_REPOSITORY}" AxWise)"
orqaly_short="${orqaly_commit:0:12}"
axwise_short="${axwise_commit:0:12}"
registry="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
# Service tags bind the exact release pair. Reusing a commit-only tag would
# collide when the same Orqaly commit is released with a different AxWise commit.
orqaly_service_tag="${registry}/orqaly-service:${orqaly_short}-${axwise_short}"
orqaly_web_inputs_sha256="$(printf '%s\n%s\n%s\n' \
  "${orqaly_commit}" "${ORQALY_API_ORIGIN}" "${CLERK_PUBLISHABLE_KEY_VERSION}" \
  | shasum -a 256 | awk '{print $1}')"
orqaly_web_tag="${registry}/orqaly-web:${orqaly_short}-${orqaly_web_inputs_sha256:0:12}"
# The AxWise image is released as part of this exact Orqaly/AxWise pair. This
# also prevents an earlier failed release attempt from forcing an immutable tag
# to move when the Orqaly build contract is corrected.
axwise_service_tag="${registry}/axwise-service:${axwise_short}-${orqaly_short}"

staging_root="$(mktemp -d -t workflow-v2-preview-build.XXXXXX)"
orqaly_archive="${staging_root}/orqaly-head.tar"
axwise_archive="${staging_root}/axwise-head.tar"
orqaly_context="${staging_root}/orqaly"
axwise_context="${staging_root}/axwise"
mkdir -p "${orqaly_context}" "${axwise_context}"
record_build_contexts() {
  printf 'Retained exact source archives and build contexts at %s\n' "${staging_root}" >&2
}
trap record_build_contexts EXIT

# Submit only tracked bytes from the exact commits. Ignored/untracked worktree
# files cannot enter either Cloud Build context.
git -C "${ORQALY_REPOSITORY}" archive --format=tar --output="${orqaly_archive}" "${orqaly_commit}"
git -C "${AXWISE_REPOSITORY}" archive --format=tar --output="${axwise_archive}" "${axwise_commit}"
orqaly_source_snapshot_sha256="$(shasum -a 256 "${orqaly_archive}" | awk '{print $1}')"
axwise_source_snapshot_sha256="$(shasum -a 256 "${axwise_archive}" | awk '{print $1}')"
tar -xf "${orqaly_archive}" -C "${orqaly_context}"
tar -xf "${axwise_archive}" -C "${axwise_context}"

orqaly_service_build_id="$(gcloud builds submit "${orqaly_context}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --gcs-source-staging-dir="gs://${BUILD_SOURCE_BUCKET}/source" \
  --ignore-file=/dev/null \
  --service-account="${BUILD_SERVICE_ACCOUNT}" \
  --config="${orqaly_context}/deploy/workflow-v2/cloudbuild.service.yaml" \
  --substitutions="_IMAGE_NAME=${orqaly_service_tag}" \
  --format='value(id)' --quiet)"

orqaly_web_build_id="$(gcloud builds submit "${orqaly_context}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --gcs-source-staging-dir="gs://${BUILD_SOURCE_BUCKET}/source" \
  --ignore-file=/dev/null \
  --service-account="${BUILD_SERVICE_ACCOUNT}" \
  --config="${orqaly_context}/deploy/workflow-v2/cloudbuild.web.yaml" \
  --substitutions="_IMAGE_NAME=${orqaly_web_tag},_ORQALY_API_URL=${ORQALY_API_ORIGIN},_CLERK_PUBLISHABLE_KEY_VERSION=${CLERK_PUBLISHABLE_KEY_VERSION}" \
  --format='value(id)' --quiet)"

axwise_service_build_id="$(gcloud builds submit "${axwise_context}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --gcs-source-staging-dir="gs://${BUILD_SOURCE_BUCKET}/source" \
  --ignore-file=/dev/null \
  --service-account="${BUILD_SERVICE_ACCOUNT}" \
  --config="${axwise_context}/cloudbuild.workflow-v2.yaml" \
  --substitutions="_IMAGE_NAME=${axwise_service_tag}" \
  --format='value(id)' --quiet)"

for build_id in "${orqaly_service_build_id}" "${orqaly_web_build_id}" \
  "${axwise_service_build_id}"; do
  [[ "${build_id}" =~ ^[a-f0-9-]{20,80}$ ]] || {
    echo "Cloud Build did not return an exact build ID." >&2
    exit 1
  }
done

orqaly_service_digest="$(resolve_digest_ref "${orqaly_service_tag}")"
orqaly_web_digest="$(resolve_digest_ref "${orqaly_web_tag}")"
axwise_service_digest="$(resolve_digest_ref "${axwise_service_tag}")"

node "${ORQALY_REPOSITORY}/scripts/workflow-v2-gcp-attestation.mjs" build \
  --output "${BUILD_ATTESTATION_OUTPUT}" \
  --orqaly-repository "${ORQALY_REPOSITORY}" \
  --axwise-repository "${AXWISE_REPOSITORY}" \
  --orqaly-commit "${orqaly_commit}" \
  --axwise-commit "${axwise_commit}" \
  --orqaly-source-snapshot-sha256 "${orqaly_source_snapshot_sha256}" \
  --axwise-source-snapshot-sha256 "${axwise_source_snapshot_sha256}" \
  --orqaly-api-origin "${ORQALY_API_ORIGIN}" \
  --clerk-publishable-key-version "${CLERK_PUBLISHABLE_KEY_VERSION}" \
  --orqaly-service-build-id "${orqaly_service_build_id}" \
  --orqaly-web-build-id "${orqaly_web_build_id}" \
  --axwise-service-build-id "${axwise_service_build_id}" \
  --orqaly-service-image "${orqaly_service_digest}" \
  --orqaly-web-image "${orqaly_web_digest}" \
  --axwise-service-image "${axwise_service_digest}"

echo "ORQALY_COMMIT=${orqaly_commit}"
echo "AXWISE_COMMIT=${axwise_commit}"
echo "ORQALY_SERVICE_IMAGE=${orqaly_service_digest}"
echo "ORQALY_WEB_IMAGE=${orqaly_web_digest}"
echo "AXWISE_SERVICE_IMAGE=${axwise_service_digest}"
echo "CLERK_PUBLISHABLE_KEY_VERSION=${CLERK_PUBLISHABLE_KEY_VERSION}"
echo "BUILD_ATTESTATION_OUTPUT=${BUILD_ATTESTATION_OUTPUT}"
