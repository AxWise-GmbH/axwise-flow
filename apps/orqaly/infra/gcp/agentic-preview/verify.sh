#!/usr/bin/env bash
set -euo pipefail
set +x

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${script_directory}/common.sh"

CONTROL_PLANE_IMAGE="${CONTROL_PLANE_IMAGE:?set the deployed control-plane image digest}"
N8N_IMAGE="${N8N_IMAGE:?set the deployed n8n image digest}"
CONTROL_PLANE_DATABASE_URL_SECRET_VERSION="${CONTROL_PLANE_DATABASE_URL_SECRET_VERSION:?set the deployed control-plane database URL secret version}"
CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION="${CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION:?set the deployed migration database URL secret version}"
CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION="${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION:?set the deployed migration database-password secret version}"
PRINCIPAL_SIGNING_KEY_SECRET_VERSION="${PRINCIPAL_SIGNING_KEY_SECRET_VERSION:?set the deployed principal signing-key secret version}"
N8N_DATABASE_PASSWORD_SECRET_VERSION="${N8N_DATABASE_PASSWORD_SECRET_VERSION:?set the deployed n8n database-password secret version}"
N8N_ENCRYPTION_KEY_SECRET_VERSION="${N8N_ENCRYPTION_KEY_SECRET_VERSION:?set the deployed n8n encryption-key secret version}"
readonly CONTROL_PLANE_IMAGE N8N_IMAGE CONTROL_PLANE_DATABASE_URL_SECRET_VERSION
readonly CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION
readonly CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION
readonly PRINCIPAL_SIGNING_KEY_SECRET_VERSION N8N_DATABASE_PASSWORD_SECRET_VERSION
readonly N8N_ENCRYPTION_KEY_SECRET_VERSION

agentic_preview_require_tools gcloud jq node
agentic_preview_assert_foundation
agentic_preview_require_digest CONTROL_PLANE_IMAGE \
  "${CONTROL_PLANE_IMAGE}" agentic-control-plane
agentic_preview_require_digest N8N_IMAGE "${N8N_IMAGE}" n8n
agentic_preview_require_numeric_secret_version "${CONTROL_PLANE_DATABASE_URL_SECRET}" \
  "${CONTROL_PLANE_DATABASE_URL_SECRET_VERSION}"
agentic_preview_require_numeric_secret_version "${CONTROL_PLANE_MIGRATION_URL_SECRET}" \
  "${CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION}"
agentic_preview_require_numeric_secret_version "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET}" \
  "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION}"
agentic_preview_require_numeric_secret_version "${PRINCIPAL_SIGNING_KEY_SECRET}" \
  "${PRINCIPAL_SIGNING_KEY_SECRET_VERSION}"
agentic_preview_require_numeric_secret_version "${N8N_DATABASE_PASSWORD_SECRET}" \
  "${N8N_DATABASE_PASSWORD_SECRET_VERSION}"
agentic_preview_require_numeric_secret_version "${N8N_ENCRYPTION_KEY_SECRET}" \
  "${N8N_ENCRYPTION_KEY_SECRET_VERSION}"

service_document() {
  gcloud run services describe "$1" --project="${PROJECT_ID}" \
    --region="${REGION}" --format=json
}

assert_service() {
  local service="$1" image="$2" account="$3" concurrency="$4"
  local memory="$5" origin="$6" throttle="$7" document
  document="$(service_document "${service}")"
  if ! jq -e --arg image "${image}" --arg account "${account}" \
    --arg concurrency "${concurrency}" --arg memory "${memory}" \
    --arg throttle "${throttle}" \
    --arg connection "${SQL_CONNECTION_NAME}" --arg network "${VPC_NETWORK}" \
    --arg subnet "${VPC_SUBNET}" '
      .spec.template.spec.containers[0].image == $image
      and .spec.template.spec.serviceAccountName == $account
      and .metadata.annotations["run.googleapis.com/ingress"] == "internal"
      and (.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false") != "true"
      and (.spec.template.spec.containerConcurrency | tostring) == $concurrency
      and .spec.template.spec.containers[0].resources.limits.memory == $memory
      and (.spec.template.spec.containers[0].resources.limits.cpu == "1"
        or .spec.template.spec.containers[0].resources.limits.cpu == "1000m")
      and (.spec.template.metadata.annotations["run.googleapis.com/cpu-throttling"] // "true") == $throttle
      and .spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"] == $connection
      and .spec.template.metadata.annotations["run.googleapis.com/vpc-access-egress"] == "all-traffic"
      and ((.spec.template.metadata.annotations["run.googleapis.com/network-interfaces"] | fromjson)
        | any(.network == $network and .subnetwork == $subnet))
      and .status.latestCreatedRevisionName == .status.latestReadyRevisionName
      and (.status.latestReadyRevisionName as $latest
        | ([.status.traffic[]? | select(.revisionName == $latest) | (.percent // 0)] | add // 0) == 100)
    ' <<<"${document}" >/dev/null; then
    echo "${service} differs from the private Agentic Preview runtime contract." >&2
    exit 77
  fi
  if ! agentic_preview_assert_service_origin_document "${document}" "${origin}"; then
    echo "${service} does not advertise its deterministic Preview origin." >&2
    exit 77
  fi
  printf '%s' "${document}"
}

assert_plain_env() {
  local document="$1" name="$2" expected="$3" service="$4"
  jq -e --arg name "${name}" --arg expected "${expected}" '
    [(.spec.template.spec.containers[0] // .spec.containers[0]).env[]?
      | select(.name == $name and .value == $expected)] | length == 1
  ' <<<"${document}" >/dev/null || {
    echo "${service}/${name} differs from the fail-closed contract." >&2
    exit 77
  }
}

assert_secret_env() {
  local document="$1" name="$2" secret="$3" version="$4" service="$5"
  jq -e --arg name "${name}" --arg secret "${secret}" --arg version "${version}" '
    [(.spec.template.spec.containers[0] // .spec.containers[0]).env[]?
      | select(.name == $name)
      | select(.valueFrom.secretKeyRef.name == $secret
        and .valueFrom.secretKeyRef.key == $version)] | length == 1
  ' <<<"${document}" >/dev/null || {
    echo "${service}/${name} is not pinned to the requested secret version." >&2
    exit 77
  }
}

assert_exact_invokers() {
  local service="$1" expected="$2" actual policy
  policy="$(gcloud run services get-iam-policy "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
  actual="$(jq -r '.bindings[]? | select(.role == "roles/run.invoker") | .members[]?' \
    <<<"${policy}" | sort -u)"
  test "${actual}" = "${expected}" \
    && jq -e 'all(.bindings[]?; .role == "roles/run.invoker" and .condition == null)' \
      <<<"${policy}" >/dev/null || {
    echo "${service} has invokers outside its exact allowlist." >&2
    exit 77
  }
}

assert_secret_readers() {
  local secret="$1" expected="$2" actual
  actual="$(gcloud secrets get-iam-policy "${secret}" --project="${PROJECT_ID}" \
    --format=json | jq -r '
      .bindings[]? | select(.role == "roles/secretmanager.secretAccessor")
      | .members[]?
    ' | sort -u)"
  test "${actual}" = "${expected}" || {
    echo "${secret} has readers outside its exact runtime allowlist." >&2
    exit 77
  }
  gcloud secrets get-iam-policy "${secret}" --project="${PROJECT_ID}" \
    --format=json | jq -e '
      all(.bindings[]?;
        .role == "roles/secretmanager.secretAccessor" and .condition == null)
    ' >/dev/null || {
      echo "${secret} has a conditional or privileged resource binding." >&2
      exit 77
    }
}

control_document="$(assert_service "${CONTROL_PLANE_SERVICE}" \
  "${CONTROL_PLANE_IMAGE}" "${CONTROL_PLANE_SERVICE_ACCOUNT}" 20 512Mi \
  "${CONTROL_PLANE_ORIGIN}" true)"
n8n_document="$(assert_service "${N8N_SERVICE}" "${N8N_IMAGE}" \
  "${N8N_SERVICE_ACCOUNT}" 1 2Gi "${N8N_ORIGIN}" false)"
node "${script_directory}/../../../scripts/workflow-v2-cloud-run-scaling.mjs" \
  --min 0 --max 2 <<<"${control_document}"
node "${script_directory}/../../../scripts/workflow-v2-cloud-run-scaling.mjs" \
  --min 0 --max 1 <<<"${n8n_document}"

assert_plain_env "${control_document}" AGENTIC_EXECUTION_ENABLED false "${CONTROL_PLANE_SERVICE}"
assert_plain_env "${control_document}" AGENTIC_CAPABILITIES_JSON \
  '{"executors":[],"descriptors":[],"connections":[]}' "${CONTROL_PLANE_SERVICE}"
assert_secret_env "${control_document}" DATABASE_URL \
  "${CONTROL_PLANE_DATABASE_URL_SECRET}" \
  "${CONTROL_PLANE_DATABASE_URL_SECRET_VERSION}" "${CONTROL_PLANE_SERVICE}"
assert_secret_env "${control_document}" ORQALY_PRINCIPAL_SIGNING_KEY \
  "${PRINCIPAL_SIGNING_KEY_SECRET}" "${PRINCIPAL_SIGNING_KEY_SECRET_VERSION}" \
  "${CONTROL_PLANE_SERVICE}"

for assignment in \
  'N8N_DISABLE_UI=true' \
  'N8N_PUBLIC_API_DISABLED=false' \
  'N8N_PUBLIC_API_SWAGGERUI_DISABLED=true' \
  'N8N_CONCURRENCY_PRODUCTION_LIMIT=1' \
  'EXECUTIONS_MODE=regular' \
  'EXECUTIONS_DATA_SAVE_ON_ERROR=none' \
  'EXECUTIONS_DATA_SAVE_ON_SUCCESS=none' \
  'N8N_DIAGNOSTICS_ENABLED=false' \
  'N8N_PERSONALIZATION_ENABLED=false'; do
  assert_plain_env "${n8n_document}" "${assignment%%=*}" "${assignment#*=}" "${N8N_SERVICE}"
done
assert_secret_env "${n8n_document}" DB_POSTGRESDB_PASSWORD \
  "${N8N_DATABASE_PASSWORD_SECRET}" "${N8N_DATABASE_PASSWORD_SECRET_VERSION}" \
  "${N8N_SERVICE}"
assert_secret_env "${n8n_document}" N8N_ENCRYPTION_KEY \
  "${N8N_ENCRYPTION_KEY_SECRET}" "${N8N_ENCRYPTION_KEY_SECRET_VERSION}" \
  "${N8N_SERVICE}"

assert_exact_invokers "${CONTROL_PLANE_SERVICE}" \
  "serviceAccount:${ORQALY_API_SERVICE_ACCOUNT}"
assert_exact_invokers "${N8N_SERVICE}" \
  "$(printf '%s\n%s' "serviceAccount:${CONTROL_PLANE_SERVICE_ACCOUNT}" \
    "serviceAccount:${N8N_BOOTSTRAP_SERVICE_ACCOUNT}" | sort -u)"
agentic_preview_assert_no_public_invoker "${CONTROL_PLANE_SERVICE}"
agentic_preview_assert_no_public_invoker "${N8N_SERVICE}"

assert_secret_readers "${CONTROL_PLANE_DATABASE_URL_SECRET}" \
  "serviceAccount:${CONTROL_PLANE_SERVICE_ACCOUNT}"
assert_secret_readers "${CONTROL_PLANE_DATABASE_PASSWORD_SECRET}" ""
assert_secret_readers "${CONTROL_PLANE_MIGRATION_URL_SECRET}" \
  "serviceAccount:${CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT}"
assert_secret_readers "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET}" \
  ""
assert_secret_readers "${PRINCIPAL_SIGNING_KEY_SECRET}" \
  "$(printf '%s\n%s' "serviceAccount:${CONTROL_PLANE_SERVICE_ACCOUNT}" \
    "serviceAccount:${ORQALY_API_SERVICE_ACCOUNT}" | sort -u)"
assert_secret_readers "${N8N_DATABASE_PASSWORD_SECRET}" \
  "serviceAccount:${N8N_SERVICE_ACCOUNT}"
assert_secret_readers "${N8N_ENCRYPTION_KEY_SECRET}" \
  "serviceAccount:${N8N_SERVICE_ACCOUNT}"
assert_secret_readers "${N8N_API_KEY_SECRET}" \
  "serviceAccount:${N8N_BOOTSTRAP_SERVICE_ACCOUNT}"

project_policy="$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json)"
assert_project_roles() {
  local account="$1" expected="$2" actual
  actual="$(jq -r --arg member "serviceAccount:${account}" '
      .bindings[]? | select(any(.members[]?; . == $member))
      | if .condition == null then .role else (.role + "#conditional") end
    ' <<<"${project_policy}" | sort -u)"
  test "${actual}" = "${expected}" || {
    echo "${account} has project roles outside its exact allowlist." >&2
    exit 77
  }
}
assert_project_roles "${CONTROL_PLANE_SERVICE_ACCOUNT}" roles/cloudsql.client
assert_project_roles "${CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT}" roles/cloudsql.client
assert_project_roles "${N8N_SERVICE_ACCOUNT}" roles/cloudsql.client
assert_project_roles "${N8N_BOOTSTRAP_SERVICE_ACCOUNT}" ""

api_document="$(service_document "${ORQALY_API_SERVICE}")"
if ! jq -e '
    .status.observedGeneration == .metadata.generation
    and ([.status.traffic[]?
      | select((.percent // 0) == 100 and (.revisionName | type) == "string")]
      | length) == 1
  ' <<<"${api_document}" >/dev/null; then
  echo "${ORQALY_API_SERVICE} does not have one settled 100-percent serving revision." >&2
  exit 77
fi
api_revision="$(jq -r '
  [.status.traffic[]?
    | select((.percent // 0) == 100 and (.revisionName | type) == "string")
    | .revisionName][0]
' <<<"${api_document}")"
if ! jq -e --arg revision "${api_revision}" '
    .status.latestCreatedRevisionName == $revision
    and .status.latestReadyRevisionName == $revision
  ' <<<"${api_document}" >/dev/null; then
  echo "${ORQALY_API_SERVICE} has an unpromoted or stale API revision." >&2
  exit 77
fi
api_runtime_document="$(gcloud run revisions describe "${api_revision}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! jq -e '
    any(.status.conditions[]?; .type == "Ready" and .status == "True")
    and any(.status.conditions[]?; .type == "Active" and .status == "True")
  ' <<<"${api_runtime_document}" >/dev/null; then
  echo "${ORQALY_API_SERVICE} serving revision is not ready and active." >&2
  exit 77
fi
assert_plain_env "${api_runtime_document}" AGENTIC_CONTROL_PLANE_URL \
  "${CONTROL_PLANE_ORIGIN}" "${ORQALY_API_SERVICE}"
assert_plain_env "${api_runtime_document}" AGENTIC_PRINCIPAL_AUDIENCE \
  "${PRINCIPAL_AUDIENCE}" "${ORQALY_API_SERVICE}"
assert_plain_env "${api_runtime_document}" AGENTIC_CONTROL_PLANE_USE_ID_TOKEN true \
  "${ORQALY_API_SERVICE}"
assert_secret_env "${api_runtime_document}" AGENTIC_PRINCIPAL_SIGNING_KEY \
  "${PRINCIPAL_SIGNING_KEY_SECRET}" "${PRINCIPAL_SIGNING_KEY_SECRET_VERSION}" \
  "${ORQALY_API_SERVICE}"

database_names="$(gcloud sql databases list --instance="${SQL_INSTANCE}" \
  --project="${PROJECT_ID}" --format='value(name)' \
  | awk -v cp="${CONTROL_PLANE_DATABASE}" -v n8n="${N8N_DATABASE}" \
      '$0 == cp || $0 == n8n' | sort -u)"
expected_database_names="$(printf '%s\n%s' "${CONTROL_PLANE_DATABASE}" "${N8N_DATABASE}" | sort -u)"
test "${database_names}" = "${expected_database_names}" || {
  echo "The two isolated Preview databases are not both present." >&2
  exit 77
}

echo "Agentic Preview verification passed: private, isolated, execution-disabled, and UI-disabled."
