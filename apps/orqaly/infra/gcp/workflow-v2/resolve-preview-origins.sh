#!/usr/bin/env bash
set -euo pipefail
set +x

# Read-only origin discovery for the hard-pinned Preview boundary. Cloud Run
# deterministic URLs can be computed before the first service deployment.
PROJECT_ID="axwise-v2-preview-001"
REGION="europe-west4"
readonly PROJECT_ID REGION

command -v gcloud >/dev/null || { echo "gcloud is required." >&2; exit 69; }

project_number="$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')"
if [[ ! "${project_number}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not resolve the hard-pinned Preview project number." >&2
  exit 77
fi
readonly project_number

origin_for() {
  local service="$1" dns_label
  dns_label="${service}-${project_number}"
  if test "${#dns_label}" -gt 63; then
    echo "${service} is too long for a deterministic Cloud Run URL." >&2
    exit 64
  fi
  printf 'https://%s.%s.run.app' "${dns_label}" "${REGION}"
}

printf 'ORQALY_API_ORIGIN=%s\n' "$(origin_for orqaly-v2-api-preview)"
printf 'ORQALY_WEB_ORIGIN=%s\n' "$(origin_for orqaly-v2-web-preview)"
printf 'AXWISE_API_ORIGIN=%s\n' "$(origin_for axwise-v2-preview)"
