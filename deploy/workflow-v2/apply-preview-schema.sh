#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
DATABASE_NAME="axwise_v2_preview_001"
MIGRATION_PATH="backend/database/workflow_v2/001_cognitive_operations.sql"
BINDINGS_PATH="deploy/workflow-v2/preview-role-bindings.sql"
EXPECTED_CHECKSUM="ae8881b1e734e2fcd059895611d94b2127772131083c55299cf9c6be7657c7c8"
EXPECTED_BINDINGS_CHECKSUM="2b885c6089b0b3c45030fc2e88e950cb582ecd617d2af293066041f277f0f48b"
ADMIN_DB_SECRET_VERSION="${ADMIN_DB_SECRET_VERSION:?numeric Preview 001 admin-password version is required}"
REPOSITORY_ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"
MIGRATION="${REPOSITORY_ROOT}/${MIGRATION_PATH}"
BINDINGS="${REPOSITORY_ROOT}/${BINDINGS_PATH}"

if test -n "$(git -C "${REPOSITORY_ROOT}" status --porcelain=v1 --untracked-files=all)"; then
  echo "Refusing Preview migration: AxWise repository is not clean." >&2
  exit 65
fi

if [[ ! "${ADMIN_DB_SECRET_VERSION}" =~ ^[1-9][0-9]*$ ]]; then
  echo "ADMIN_DB_SECRET_VERSION must be a positive numeric version." >&2
  exit 64
fi

actual_checksum="$(shasum -a 256 "${MIGRATION}" | awk '{print $1}')"
if test "${actual_checksum}" != "${EXPECTED_CHECKSUM}"; then
  echo "Refusing Preview migration: AxWise schema checksum changed." >&2
  exit 1
fi
actual_bindings_checksum="$(shasum -a 256 "${BINDINGS}" | awk '{print $1}')"
if test "${actual_bindings_checksum}" != "${EXPECTED_BINDINGS_CHECKSUM}"; then
  echo "Refusing Preview migration: AxWise role-bindings checksum changed." >&2
  exit 1
fi

export PGPASSWORD
PGPASSWORD="$(gcloud secrets versions access "${ADMIN_DB_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-admin-password \
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

source_commit="$(git -C "${REPOSITORY_ROOT}" rev-parse --verify HEAD)"
database_query() {
  psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
    --dbname="${DATABASE_NAME}" --no-password --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 --command="$1"
}

# Baseline 001 is permitted only on a genuinely empty database or as an exact
# no-op adoption of the already-marked baseline. A marker never excuses extra
# schemas/tables, and an unmarked partial/legacy schema is never repaired.
user_schemas="$(database_query "SELECT string_agg(nspname, ',' ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'cloudsqladmin')")"
user_relations="$(database_query "SELECT string_agg(name, ',' ORDER BY name) FROM (SELECT DISTINCT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e' WHERE c.relkind IN ('r','p','v','m','S','f') AND n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema', 'cloudsqladmin') AND NOT (n.nspname = 'public' AND d.objid IS NOT NULL)) inventory")"
marker_exists="$(database_query "SELECT (to_regclass('workflow_v2_release.applied_baseline') IS NOT NULL)::text")"
expected_relations="axwise.cognitive_operations,workflow_v2_release.applied_baseline"
expected_marker="${MIGRATION_PATH}:${EXPECTED_CHECKSUM}:${BINDINGS_PATH}:${EXPECTED_BINDINGS_CHECKSUM}:${source_commit}"
if test "${marker_exists}" = true; then
  applied_marker="$(database_query "SELECT migration_path || ':' || sha256 || ':' || bindings_path || ':' || bindings_sha256 || ':' || source_commit FROM workflow_v2_release.applied_baseline WHERE component = 'axwise' AND migration_number = 1")"
  if test "${user_schemas}" = "axwise,public,workflow_v2_release" \
    && test "${user_relations}" = "${expected_relations}" \
    && test "${applied_marker}" = "${expected_marker}"; then
    echo "Exact AxWise Preview baseline is already applied; no database mutation was needed."
    exit 0
  fi
  echo "Refusing Preview migration: marked database is not the exact current baseline." >&2
  exit 77
fi
if test "${user_schemas}" != public || test -n "${user_relations}"; then
  echo "Refusing Preview migration: target database is neither fresh nor exactly marked." >&2
  exit 77
fi

psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" \
  --no-password --set=ON_ERROR_STOP=1 --single-transaction \
  --set=schema_checksum="${EXPECTED_CHECKSUM}" \
  --set=migration_path="${MIGRATION_PATH}" \
  --set=bindings_checksum="${EXPECTED_BINDINGS_CHECKSUM}" \
  --set=bindings_path="${BINDINGS_PATH}" \
  --set=source_commit="${source_commit}" \
  --set=database_name="${DATABASE_NAME}" \
  --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${MIGRATION}") \
  --file="${BINDINGS}"

echo "Applied exact AxWise Preview schema ${EXPECTED_CHECKSUM}."
