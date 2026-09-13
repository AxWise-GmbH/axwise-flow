#!/usr/bin/env bash
set -euo pipefail
set +x

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${script_directory}/common.sh"

CONTROL_PLANE_IMAGE="${CONTROL_PLANE_IMAGE:?set the digest-pinned control-plane image}"
N8N_IMAGE="${N8N_IMAGE:?set the digest-pinned mirrored n8n image}"
CONTROL_PLANE_DATABASE_URL_SECRET_VERSION="${CONTROL_PLANE_DATABASE_URL_SECRET_VERSION:?set the numeric control-plane database URL secret version}"
CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION="${CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION:?set the numeric migration database URL secret version}"
CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION="${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION:?set the numeric migration database-password secret version}"
PRINCIPAL_SIGNING_KEY_SECRET_VERSION="${PRINCIPAL_SIGNING_KEY_SECRET_VERSION:?set the numeric principal signing-key secret version}"
N8N_DATABASE_PASSWORD_SECRET_VERSION="${N8N_DATABASE_PASSWORD_SECRET_VERSION:?set the numeric n8n database-password secret version}"
N8N_ENCRYPTION_KEY_SECRET_VERSION="${N8N_ENCRYPTION_KEY_SECRET_VERSION:?set the numeric n8n encryption-key secret version}"
readonly CONTROL_PLANE_IMAGE N8N_IMAGE CONTROL_PLANE_DATABASE_URL_SECRET_VERSION
readonly CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION
readonly CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION
readonly PRINCIPAL_SIGNING_KEY_SECRET_VERSION N8N_DATABASE_PASSWORD_SECRET_VERSION
readonly N8N_ENCRYPTION_KEY_SECRET_VERSION

agentic_preview_require_tools gcloud jq
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

for service in "${CONTROL_PLANE_SERVICE}" "${N8N_SERVICE}"; do
  if gcloud run services describe "${service}" --project="${PROJECT_ID}" \
    --region="${REGION}" >/dev/null 2>&1; then
    agentic_preview_assert_no_public_invoker "${service}"
  fi
done

# Every deployment proves and applies all immutable migrations before a new
# control-plane revision can become ready. Replays are checksum-verified.
env CONTROL_PLANE_IMAGE="${CONTROL_PLANE_IMAGE}" \
  CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION="${CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION}" \
  CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION="${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION}" \
  "${script_directory}/apply-control-plane-schema.sh"

capabilities='{"executors":[],"descriptors":[],"connections":[]}'
gcloud run deploy "${CONTROL_PLANE_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --image="${CONTROL_PLANE_IMAGE}" --command="" --args="" \
  --service-account="${CONTROL_PLANE_SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${SQL_CONNECTION_NAME}" \
  --network="${VPC_NETWORK}" --subnet="${VPC_SUBNET}" --vpc-egress=all-traffic \
  --set-env-vars="^@^NODE_ENV=production@AGENTIC_EXECUTION_ENABLED=false@AGENTIC_CAPABILITIES_JSON=${capabilities}@ORQALY_PRINCIPAL_AUDIENCE=${PRINCIPAL_AUDIENCE}@ORQALY_PRINCIPAL_MAX_TTL_SECONDS=300@HTTP_JSON_LIMIT=256kb@RATE_LIMIT_WINDOW_MS=60000@RATE_LIMIT_MAX_REQUESTS=120@DB_POOL_MAX=5@DB_IDLE_TIMEOUT_MS=30000" \
  --set-secrets="DATABASE_URL=${CONTROL_PLANE_DATABASE_URL_SECRET}:${CONTROL_PLANE_DATABASE_URL_SECRET_VERSION},ORQALY_PRINCIPAL_SIGNING_KEY=${PRINCIPAL_SIGNING_KEY_SECRET}:${PRINCIPAL_SIGNING_KEY_SECRET_VERSION}" \
  --execution-environment=gen2 --ingress=internal --scaling=auto \
  --cpu=1 --memory=512Mi --concurrency=20 --min=0 --max=2 \
  --min-instances=default --max-instances=default --cpu-throttling --cpu-boost \
  --port=8080 \
  --startup-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=24" \
  --liveness-probe="httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=10,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" \
  --readiness-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" \
  --invoker-iam-check --no-allow-unauthenticated --quiet >/dev/null

n8n_host="${N8N_ORIGIN#https://}"
excluded_nodes='["n8n-nodes-base.code","n8n-nodes-base.executeCommand","n8n-nodes-base.readWriteFile","n8n-nodes-base.ssh"]'
gcloud run deploy "${N8N_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --image="${N8N_IMAGE}" --command="" --args="" \
  --service-account="${N8N_SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${SQL_CONNECTION_NAME}" \
  --network="${VPC_NETWORK}" --subnet="${VPC_SUBNET}" --vpc-egress=all-traffic \
  --set-env-vars="^@^DB_TYPE=postgresdb@DB_POSTGRESDB_HOST=/cloudsql/${SQL_CONNECTION_NAME}@DB_POSTGRESDB_PORT=5432@DB_POSTGRESDB_DATABASE=${N8N_DATABASE}@DB_POSTGRESDB_USER=${N8N_DATABASE_USER}@N8N_LISTEN_ADDRESS=0.0.0.0@N8N_PORT=8080@N8N_PROTOCOL=https@N8N_HOST=${n8n_host}@N8N_EDITOR_BASE_URL=${N8N_ORIGIN}@WEBHOOK_URL=${N8N_ORIGIN}/@N8N_PROXY_HOPS=1@GENERIC_TIMEZONE=UTC@TZ=UTC@EXECUTIONS_MODE=regular@EXECUTIONS_TIMEOUT=300@EXECUTIONS_TIMEOUT_MAX=300@EXECUTIONS_DATA_SAVE_ON_ERROR=none@EXECUTIONS_DATA_SAVE_ON_SUCCESS=none@EXECUTIONS_DATA_SAVE_ON_PROGRESS=false@EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false@EXECUTIONS_DATA_PRUNE=true@EXECUTIONS_DATA_MAX_AGE=24@EXECUTIONS_DATA_PRUNE_MAX_COUNT=1000@EXECUTIONS_DATA_HARD_DELETE_BUFFER=1@N8N_CONCURRENCY_PRODUCTION_LIMIT=1@N8N_PAYLOAD_SIZE_MAX=1@N8N_BLOCK_ENV_ACCESS_IN_NODE=true@N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES=true@N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true@N8N_SECURE_COOKIE=true@N8N_SAMESITE_COOKIE=strict@N8N_DIAGNOSTICS_ENABLED=false@N8N_PERSONALIZATION_ENABLED=false@N8N_VERSION_NOTIFICATIONS_ENABLED=false@N8N_TEMPLATES_ENABLED=false@N8N_PUBLIC_API_DISABLED=false@N8N_PUBLIC_API_SWAGGERUI_DISABLED=true@N8N_DISABLE_UI=true@N8N_METRICS=false@N8N_LOG_LEVEL=warn@N8N_RUNNERS_ENABLED=false@NODES_EXCLUDE=${excluded_nodes}" \
  --set-secrets="DB_POSTGRESDB_PASSWORD=${N8N_DATABASE_PASSWORD_SECRET}:${N8N_DATABASE_PASSWORD_SECRET_VERSION},N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY_SECRET}:${N8N_ENCRYPTION_KEY_SECRET_VERSION}" \
  --execution-environment=gen2 --ingress=internal --scaling=auto \
  --cpu=1 --memory=2Gi --concurrency=1 --min=0 --max=1 \
  --min-instances=default --max-instances=default --no-cpu-throttling --cpu-boost \
  --port=8080 \
  --startup-probe="httpGet.path=/healthz/readiness,httpGet.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=60" \
  --liveness-probe="httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=20,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" \
  --readiness-probe="httpGet.path=/healthz/readiness,httpGet.port=8080,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" \
  --invoker-iam-check --no-allow-unauthenticated --quiet >/dev/null

control_plane_document="$(gcloud run services describe "${CONTROL_PLANE_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
n8n_document="$(gcloud run services describe "${N8N_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! agentic_preview_assert_service_origin_document \
  "${control_plane_document}" "${CONTROL_PLANE_ORIGIN}" \
  || ! agentic_preview_assert_service_origin_document \
    "${n8n_document}" "${N8N_ORIGIN}"; then
    echo "A private service did not receive its deterministic Preview origin." >&2
    exit 77
fi

gcloud run services add-iam-policy-binding "${CONTROL_PLANE_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --member="serviceAccount:${ORQALY_API_SERVICE_ACCOUNT}" \
  --role=roles/run.invoker --quiet >/dev/null
gcloud run services add-iam-policy-binding "${N8N_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --member="serviceAccount:${CONTROL_PLANE_SERVICE_ACCOUNT}" \
  --role=roles/run.invoker --quiet >/dev/null
gcloud run services add-iam-policy-binding "${N8N_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --member="serviceAccount:${N8N_BOOTSTRAP_SERVICE_ACCOUNT}" \
  --role=roles/run.invoker --quiet >/dev/null

agentic_preview_assert_no_public_invoker "${CONTROL_PLANE_SERVICE}"
agentic_preview_assert_no_public_invoker "${N8N_SERVICE}"

assert_exact_service_policy() {
  local service="$1" expected="$2" policy actual
  policy="$(gcloud run services get-iam-policy "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
  actual="$(jq -r '
    .bindings[]? | select(.role == "roles/run.invoker") | .members[]?
  ' <<<"${policy}" | sort -u)"
  test "${actual}" = "${expected}" \
    && jq -e 'all(.bindings[]?; .role == "roles/run.invoker" and .condition == null)' \
      <<<"${policy}" >/dev/null || {
    echo "${service} has IAM bindings outside its exact invoker allowlist." >&2
    exit 77
  }
}
assert_exact_service_policy "${CONTROL_PLANE_SERVICE}" \
  "serviceAccount:${ORQALY_API_SERVICE_ACCOUNT}"
assert_exact_service_policy "${N8N_SERVICE}" \
  "$(printf '%s\n%s' "serviceAccount:${CONTROL_PLANE_SERVICE_ACCOUNT}" \
    "serviceAccount:${N8N_BOOTSTRAP_SERVICE_ACCOUNT}" | sort -u)"

echo "Private Agent control plane and self-hosted n8n Preview services are deployed."
echo "AGENTIC_EXECUTION_ENABLED=false"
echo "CONTROL_PLANE_ORIGIN=${CONTROL_PLANE_ORIGIN}"
echo "N8N_ORIGIN=${N8N_ORIGIN}"
echo "Run connect-orqaly-api.sh after every standard Orqaly API deployment."
