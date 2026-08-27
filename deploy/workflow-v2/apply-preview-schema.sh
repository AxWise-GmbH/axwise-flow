#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="${PROJECT_ID:-axwise-73425}"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
DATABASE_NAME="${AXWISE_DATABASE:-axwise_v2_preview_001}"
MIGRATION="backend/database/workflow_v2/001_cognitive_operations.sql"
BINDINGS="deploy/workflow-v2/preview-role-bindings.sql"
EXPECTED_CHECKSUM="baa58ebfabbe3037a24f452125d07ea6d3d6620804eafa2d01e62bba74e72d9a"

actual_checksum="$(shasum -a 256 "${MIGRATION}" | awk '{print $1}')"
if test "${actual_checksum}" != "${EXPECTED_CHECKSUM}"; then
  echo "Refusing Preview migration: AxWise schema checksum changed." >&2
  exit 1
fi

export PGPASSWORD
PGPASSWORD="$(gcloud secrets versions access latest \
  --secret=orqaly-v2-preview-db-admin-password \
  --project="${PROJECT_ID}")"

proxy_path="$(command -v cloud-sql-proxy)"
proxy_port="19471"
proxy_log="$(mktemp -t axwise-v2-preview-proxy.XXXXXX)"
"${proxy_path}" "${PROJECT_ID}:europe-west4:${SQL_INSTANCE}" \
  --gcloud-auth --address=127.0.0.1 --port="${proxy_port}" >"${proxy_log}" 2>&1 &
proxy_pid="$!"
cleanup() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f "${proxy_log}"
  unset PGPASSWORD
}
trap cleanup EXIT

for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  if pg_isready --host=127.0.0.1 --port="${proxy_port}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! pg_isready --host=127.0.0.1 --port="${proxy_port}" >/dev/null 2>&1; then
  sed -n '1,120p' "${proxy_log}" >&2
  exit 1
fi

psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" \
  --no-password --set=ON_ERROR_STOP=1 \
  --file="${MIGRATION}" --file="${BINDINGS}"

echo "Applied exact AxWise Preview schema ${EXPECTED_CHECKSUM}."
