#!/usr/bin/env bash
set -euo pipefail
set +x

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${script_directory}/common.sh"

agentic_preview_require_tools gcloud git tar
agentic_preview_assert_foundation

repository_root="$(git -C "${script_directory}" rev-parse --show-toplevel)"
if test -n "$(git -C "${repository_root}" status --porcelain=v1 --untracked-files=all)"; then
  echo "Refusing an immutable Preview build from a dirty repository." >&2
  exit 65
fi
commit="$(git -C "${repository_root}" rev-parse --verify HEAD)"
[[ "${commit}" =~ ^[a-f0-9]{40}$ ]] || {
  echo "Could not resolve the exact source commit." >&2
  exit 77
}

for config in cloudbuild.control-plane.yaml cloudbuild.n8n.yaml cloudbuild.n8n-bootstrap.yaml; do
  grep -Eq '^[[:space:]]*logging:[[:space:]]*CLOUD_LOGGING_ONLY[[:space:]]*$' \
    "${script_directory}/${config}" || {
      echo "${config} must use Cloud Logging only." >&2
      exit 77
    }
done

registry="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}"
control_plane_tag="${registry}/agentic-control-plane:${commit:0:12}"
n8n_source_digest="307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec"
n8n_tag="${registry}/n8n:2.37.10-${n8n_source_digest:0:12}"
n8n_bootstrap_tag="${registry}/n8n-bootstrap:${commit:0:12}"

staging_root="$(mktemp -d -t orqaly-agentic-preview-build.XXXXXX)"
archive="${staging_root}/source.tar"
context="${staging_root}/source"
mkdir -p "${context}"
cleanup() {
  rm -rf -- "${staging_root}"
}
trap cleanup EXIT
git -C "${repository_root}" archive --format=tar --output="${archive}" "${commit}"
tar -xf "${archive}" -C "${context}"

control_plane_build_id="$(gcloud builds submit "${context}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --gcs-source-staging-dir="gs://${BUILD_SOURCE_BUCKET}/source" \
  --ignore-file=/dev/null --service-account="${BUILD_SERVICE_ACCOUNT}" \
  --config="${context}/infra/gcp/agentic-preview/cloudbuild.control-plane.yaml" \
  --substitutions="_IMAGE_NAME=${control_plane_tag}" --format='value(id)' --quiet)"
n8n_build_id="$(gcloud builds submit "${context}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --gcs-source-staging-dir="gs://${BUILD_SOURCE_BUCKET}/source" \
  --ignore-file=/dev/null --service-account="${BUILD_SERVICE_ACCOUNT}" \
  --config="${context}/infra/gcp/agentic-preview/cloudbuild.n8n.yaml" \
  --substitutions="_IMAGE_NAME=${n8n_tag}" --format='value(id)' --quiet)"
n8n_bootstrap_build_id="$(gcloud builds submit "${context}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --gcs-source-staging-dir="gs://${BUILD_SOURCE_BUCKET}/source" \
  --ignore-file=/dev/null --service-account="${BUILD_SERVICE_ACCOUNT}" \
  --config="${context}/infra/gcp/agentic-preview/cloudbuild.n8n-bootstrap.yaml" \
  --substitutions="_IMAGE_NAME=${n8n_bootstrap_tag}" --format='value(id)' --quiet)"

for build_id in "${control_plane_build_id}" "${n8n_build_id}" \
  "${n8n_bootstrap_build_id}"; do
  [[ "${build_id}" =~ ^[a-f0-9-]{20,80}$ ]] || {
    echo "Cloud Build did not return an exact build ID." >&2
    exit 1
  }
done

resolve_digest_ref() {
  local tag="$1" digest
  digest="$(gcloud artifacts docker images describe "${tag}" \
    --project="${PROJECT_ID}" --format='value(image_summary.digest)')"
  [[ "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]] || {
    echo "Artifact Registry did not return a digest for ${tag}." >&2
    return 1
  }
  printf '%s@%s' "${tag%:*}" "${digest}"
}

control_plane_image="$(resolve_digest_ref "${control_plane_tag}")"
n8n_image="$(resolve_digest_ref "${n8n_tag}")"
n8n_bootstrap_image="$(resolve_digest_ref "${n8n_bootstrap_tag}")"
agentic_preview_require_digest CONTROL_PLANE_IMAGE "${control_plane_image}" agentic-control-plane
agentic_preview_require_digest N8N_IMAGE "${n8n_image}" n8n
agentic_preview_require_digest N8N_BOOTSTRAP_IMAGE \
  "${n8n_bootstrap_image}" n8n-bootstrap

echo "SOURCE_COMMIT=${commit}"
echo "CONTROL_PLANE_BUILD_ID=${control_plane_build_id}"
echo "N8N_BUILD_ID=${n8n_build_id}"
echo "N8N_BOOTSTRAP_BUILD_ID=${n8n_bootstrap_build_id}"
echo "CONTROL_PLANE_IMAGE=${control_plane_image}"
echo "N8N_IMAGE=${n8n_image}"
echo "N8N_BOOTSTRAP_IMAGE=${n8n_bootstrap_image}"
