#!/usr/bin/env bash
set -euo pipefail
set +x

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${script_directory}/common.sh"

CONTROL_PLANE_IMAGE="${CONTROL_PLANE_IMAGE:?set the digest-pinned control-plane image}"
CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION="${CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION:?set the numeric migration database URL secret version}"
CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION="${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION:?set the numeric migration database-password secret version}"
readonly CONTROL_PLANE_IMAGE CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION
readonly CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION

agentic_preview_require_tools cloud-sql-proxy gcloud jq pg_isready psql
agentic_preview_assert_foundation
agentic_preview_require_digest CONTROL_PLANE_IMAGE \
  "${CONTROL_PLANE_IMAGE}" agentic-control-plane
agentic_preview_require_numeric_secret_version "${CONTROL_PLANE_MIGRATION_URL_SECRET}" \
  "${CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION}"
agentic_preview_require_numeric_secret_version "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET}" \
  "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION}"

gcloud run jobs deploy "${CONTROL_PLANE_MIGRATION_JOB}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --image="${CONTROL_PLANE_IMAGE}" \
  --command=node --args=src/db/migrate.js \
  --service-account="${CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${SQL_CONNECTION_NAME}" \
  --network="${VPC_NETWORK}" --subnet="${VPC_SUBNET}" --vpc-egress=all-traffic \
  --set-env-vars="NODE_ENV=production,AGENTIC_EXECUTION_ENABLED=false,ORQALY_PRINCIPAL_SIGNING_KEY=migration-only-not-a-request-signing-key" \
  --set-secrets="DATABASE_URL=${CONTROL_PLANE_MIGRATION_URL_SECRET}:${CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION}" \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=10m \
  --cpu=1 --memory=512Mi --execute-now --wait --quiet >/dev/null

job_document="$(gcloud run jobs describe "${CONTROL_PLANE_MIGRATION_JOB}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! jq -e --arg image "${CONTROL_PLANE_IMAGE}" \
  --arg account "${CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT}" \
  --arg secret "${CONTROL_PLANE_MIGRATION_URL_SECRET}" \
  --arg version "${CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION}" '
    .spec.template.spec.template.spec.containers[0].image == $image
    and .spec.template.spec.template.spec.serviceAccountName == $account
    and ([.spec.template.spec.template.spec.containers[0].env[]?
      | select(.name == "DATABASE_URL")
      | select(.valueFrom.secretKeyRef.name == $secret
        and .valueFrom.secretKeyRef.key == $version)] | length) == 1
  ' <<<"${job_document}" >/dev/null; then
  echo "The migration job does not retain the exact image or runtime identity." >&2
  exit 77
fi

export PGPASSWORD
PGPASSWORD="$(gcloud secrets versions access \
  "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION}" \
  --secret="${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET}" --project="${PROJECT_ID}")"
[[ "${PGPASSWORD}" =~ ^[a-f0-9]{48}$ ]] || {
  echo "Refusing a migration password outside the generated Preview format." >&2
  exit 78
}

proxy_port="19483"
proxy_log="$(mktemp -t orqaly-agentic-grants-proxy.XXXXXX)"
cloud-sql-proxy "${SQL_CONNECTION_NAME}" --gcloud-auth \
  --address=127.0.0.1 --port="${proxy_port}" >"${proxy_log}" 2>&1 &
proxy_pid="$!"
cleanup() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f -- "${proxy_log}"
  unset PGPASSWORD
}
trap cleanup EXIT
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  pg_isready --host=127.0.0.1 --port="${proxy_port}" >/dev/null 2>&1 && break
  sleep 1
done
if ! pg_isready --host=127.0.0.1 --port="${proxy_port}" >/dev/null 2>&1; then
  sed -n '1,80p' "${proxy_log}" >&2
  exit 1
fi

psql --host=127.0.0.1 --port="${proxy_port}" \
  --username="${CONTROL_PLANE_MIGRATION_USER}" \
  --dbname="${CONTROL_PLANE_DATABASE}" --no-password \
  --set=ON_ERROR_STOP=1 \
  --set="runtime_role=${CONTROL_PLANE_DATABASE_USER}" \
  --set="migration_role=${CONTROL_PLANE_MIGRATION_USER}" \
  --file="${script_directory}/control-plane-runtime-grants.sql" >/dev/null

echo "Agent control-plane migrations are current for the isolated Preview database."
