#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
DATABASE_NAME="axwise_v2_preview_001"
MIGRATION_PATH="backend/database/workflow_v2/001_cognitive_operations.sql"
ASSISTANT_MIGRATION_PATH="backend/database/workflow_v2/002_assistant_turn.sql"
RUNTIME_MIGRATION_PATH="backend/database/workflow_v2/003_assistant_runtime.sql"
EVENTS_MIGRATION_PATH="backend/database/workflow_v2/004_operation_events.sql"
COMPILE_SCOPE_V3_MIGRATION_PATH="backend/database/workflow_v2/005_compile_scope_v3.sql"
BINDINGS_PATH="deploy/workflow-v2/preview-role-bindings.sql"
EXPECTED_CHECKSUM="ae8881b1e734e2fcd059895611d94b2127772131083c55299cf9c6be7657c7c8"
EXPECTED_ASSISTANT_CHECKSUM="4329c8188d9c62f745bdaaac9dcd0f9428f72a0217b6144a53900487188aa333"
EXPECTED_RUNTIME_CHECKSUM="803923e49e15bb8c24fdb3dc133e9a641a1c233caa1375058b2fa0f109f18307"
EXPECTED_EVENTS_CHECKSUM="1839f4f9b5b75ee7463284d8c776332ed01261e2a28df091a16ca6cb2570ac4d"
EXPECTED_COMPILE_SCOPE_V3_CHECKSUM="7415c5d6af607ef18c1addfac51b057d9d29f6501e255fd0a1cc8f11f77f9ae4"
EXPECTED_BINDINGS_CHECKSUM="2b885c6089b0b3c45030fc2e88e950cb582ecd617d2af293066041f277f0f48b"
ADMIN_DB_SECRET_VERSION="${ADMIN_DB_SECRET_VERSION:?numeric Preview 001 admin-password version is required}"
REPOSITORY_ROOT="$(git -C "$(dirname "$0")/../.." rev-parse --show-toplevel)"
MIGRATION="${REPOSITORY_ROOT}/${MIGRATION_PATH}"
ASSISTANT_MIGRATION="${REPOSITORY_ROOT}/${ASSISTANT_MIGRATION_PATH}"
RUNTIME_MIGRATION="${REPOSITORY_ROOT}/${RUNTIME_MIGRATION_PATH}"
EVENTS_MIGRATION="${REPOSITORY_ROOT}/${EVENTS_MIGRATION_PATH}"
COMPILE_SCOPE_V3_MIGRATION="${REPOSITORY_ROOT}/${COMPILE_SCOPE_V3_MIGRATION_PATH}"
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
actual_assistant_checksum="$(shasum -a 256 "${ASSISTANT_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_checksum}" != "${EXPECTED_ASSISTANT_CHECKSUM}"; then
  echo "Refusing Preview migration: AxWise Assistant schema checksum changed." >&2
  exit 1
fi
actual_runtime_checksum="$(shasum -a 256 "${RUNTIME_MIGRATION}" | awk '{print $1}')"
if test "${actual_runtime_checksum}" != "${EXPECTED_RUNTIME_CHECKSUM}"; then
  echo "Refusing Preview migration: AxWise Assistant runtime schema checksum changed." >&2
  exit 1
fi
actual_events_checksum="$(shasum -a 256 "${EVENTS_MIGRATION}" | awk '{print $1}')"
if test "${actual_events_checksum}" != "${EXPECTED_EVENTS_CHECKSUM}"; then
  echo "Refusing Preview migration: AxWise operation-events schema checksum changed." >&2
  exit 1
fi
actual_compile_scope_v3_checksum="$(shasum -a 256 "${COMPILE_SCOPE_V3_MIGRATION}" | awk '{print $1}')"
if test "${actual_compile_scope_v3_checksum}" != "${EXPECTED_COMPILE_SCOPE_V3_CHECKSUM}"; then
  echo "Refusing Preview migration: AxWise CompileScopeV3 schema checksum changed." >&2
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

# The clean 001 baseline remains immutable. Migrations 002-005 are ordered and
# may advance only an exact marked prior stage (or run with 001 on a fresh DB).
user_schemas="$(database_query "SELECT string_agg(nspname, ',' ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'cloudsqladmin')")"
user_relations="$(database_query "SELECT string_agg(name, ',' ORDER BY name) FROM (SELECT DISTINCT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e' WHERE c.relkind IN ('r','p','v','m','S','f') AND n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema', 'cloudsqladmin') AND NOT (n.nspname = 'public' AND d.objid IS NOT NULL)) inventory")"
marker_exists="$(database_query "SELECT (to_regclass('workflow_v2_release.applied_baseline') IS NOT NULL)::text")"
expected_relations_before_events="axwise.cognitive_operations,workflow_v2_release.applied_baseline"
expected_relations_with_events="axwise.cognitive_operations,axwise.operation_events,workflow_v2_release.applied_baseline"
expected_marker="${MIGRATION_PATH}:${EXPECTED_CHECKSUM}:${BINDINGS_PATH}:${EXPECTED_BINDINGS_CHECKSUM}"
expected_release_marker_v4="${ASSISTANT_MIGRATION_PATH}:${EXPECTED_ASSISTANT_CHECKSUM}:${RUNTIME_MIGRATION_PATH}:${EXPECTED_RUNTIME_CHECKSUM}:${EVENTS_MIGRATION_PATH}:${EXPECTED_EVENTS_CHECKSUM}"
expected_release_marker="${expected_release_marker_v4}:${COMPILE_SCOPE_V3_MIGRATION_PATH}:${EXPECTED_COMPILE_SCOPE_V3_CHECKSUM}"
marker_upgrade_sql="
ALTER TABLE workflow_v2_release.applied_baseline
  ADD COLUMN IF NOT EXISTS assistant_migration_path text,
  ADD COLUMN IF NOT EXISTS assistant_sha256 text,
  ADD COLUMN IF NOT EXISTS runtime_migration_path text,
  ADD COLUMN IF NOT EXISTS runtime_sha256 text,
  ADD COLUMN IF NOT EXISTS events_migration_path text,
  ADD COLUMN IF NOT EXISTS events_sha256 text,
  ADD COLUMN IF NOT EXISTS compile_scope_v3_migration_path text,
  ADD COLUMN IF NOT EXISTS compile_scope_v3_sha256 text;
UPDATE workflow_v2_release.applied_baseline
SET assistant_migration_path = '${ASSISTANT_MIGRATION_PATH}',
    assistant_sha256 = '${EXPECTED_ASSISTANT_CHECKSUM}',
    runtime_migration_path = '${RUNTIME_MIGRATION_PATH}',
    runtime_sha256 = '${EXPECTED_RUNTIME_CHECKSUM}',
    events_migration_path = '${EVENTS_MIGRATION_PATH}',
    events_sha256 = '${EXPECTED_EVENTS_CHECKSUM}',
    compile_scope_v3_migration_path = '${COMPILE_SCOPE_V3_MIGRATION_PATH}',
    compile_scope_v3_sha256 = '${EXPECTED_COMPILE_SCOPE_V3_CHECKSUM}',
    source_commit = '${source_commit}'
WHERE component = 'axwise' AND migration_number = 1;
ALTER TABLE workflow_v2_release.applied_baseline
  ALTER COLUMN assistant_migration_path SET NOT NULL,
  ALTER COLUMN assistant_sha256 SET NOT NULL,
  ALTER COLUMN runtime_migration_path SET NOT NULL,
  ALTER COLUMN runtime_sha256 SET NOT NULL,
  ALTER COLUMN events_migration_path SET NOT NULL,
  ALTER COLUMN events_sha256 SET NOT NULL,
  ALTER COLUMN compile_scope_v3_migration_path SET NOT NULL,
  ALTER COLUMN compile_scope_v3_sha256 SET NOT NULL;
"
if test "${marker_exists}" = true; then
  applied_marker="$(database_query "SELECT migration_path || ':' || sha256 || ':' || bindings_path || ':' || bindings_sha256 FROM workflow_v2_release.applied_baseline WHERE component = 'axwise' AND migration_number = 1")"
  applied_source_commit="$(database_query "SELECT source_commit FROM workflow_v2_release.applied_baseline WHERE component = 'axwise' AND migration_number = 1")"
  assistant_allowed="$(database_query "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'axwise.cognitive_operations'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%operation_type%' AND pg_get_constraintdef(oid) LIKE '%AssistantTurnV1%')::text")"
  runtime_allowed="$(database_query "SELECT (EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'axwise.cognitive_operations'::regclass AND attname = 'retry_at' AND NOT attisdropped) AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'axwise.cognitive_operations'::regclass AND attname = 'failure_diagnostics' AND NOT attisdropped) AND to_regprocedure('axwise.fail_cognitive_operation(uuid,uuid,uuid,boolean,text,timestamp with time zone,integer,jsonb)') IS NOT NULL)::text")"
  events_allowed="$(database_query "SELECT (to_regclass('axwise.operation_events') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'axwise.cognitive_operations'::regclass AND attname = 'event_sequence' AND NOT attisdropped) AND to_regprocedure('axwise.request_cognitive_operation_cancel(uuid,uuid)') IS NOT NULL AND to_regprocedure('axwise.cancel_cognitive_operation(uuid,uuid,uuid)') IS NOT NULL)::text")"
  compile_scope_v3_allowed="$(database_query "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'axwise.cognitive_operations'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%operation_type%' AND pg_get_constraintdef(oid) LIKE '%CompileScopeV3%')::text")"
  single_operation_per_attempt="$(database_query "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'axwise.cognitive_operations'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, stage_attempt_id)')::text")"
  marker_v4_columns="$(database_query "SELECT (count(*) = 6)::text FROM information_schema.columns WHERE table_schema = 'workflow_v2_release' AND table_name = 'applied_baseline' AND column_name IN ('assistant_migration_path','assistant_sha256','runtime_migration_path','runtime_sha256','events_migration_path','events_sha256')")"
  marker_v5_columns="$(database_query "SELECT (count(*) = 8)::text FROM information_schema.columns WHERE table_schema = 'workflow_v2_release' AND table_name = 'applied_baseline' AND column_name IN ('assistant_migration_path','assistant_sha256','runtime_migration_path','runtime_sha256','events_migration_path','events_sha256','compile_scope_v3_migration_path','compile_scope_v3_sha256')")"
  release_marker_current=false
  if test "${marker_v4_columns}" = true; then
    applied_release_marker_v4="$(database_query "SELECT assistant_migration_path || ':' || assistant_sha256 || ':' || runtime_migration_path || ':' || runtime_sha256 || ':' || events_migration_path || ':' || events_sha256 FROM workflow_v2_release.applied_baseline WHERE component = 'axwise' AND migration_number = 1")"
    if test "${applied_release_marker_v4}" != "${expected_release_marker_v4}"; then
      echo "Refusing Preview migration: additive release marker does not match migrations 002-004." >&2
      exit 77
    fi
  fi
  if test "${marker_v5_columns}" = true; then
    applied_release_marker="$(database_query "SELECT assistant_migration_path || ':' || assistant_sha256 || ':' || runtime_migration_path || ':' || runtime_sha256 || ':' || events_migration_path || ':' || events_sha256 || ':' || compile_scope_v3_migration_path || ':' || compile_scope_v3_sha256 FROM workflow_v2_release.applied_baseline WHERE component = 'axwise' AND migration_number = 1")"
    if test "${applied_release_marker}" != "${expected_release_marker}"; then
      echo "Refusing Preview migration: additive release marker does not match migrations 002-005." >&2
      exit 77
    fi
    release_marker_current=true
  fi
  if test "${user_schemas}" != "axwise,public,workflow_v2_release" \
    || test "${applied_marker}" != "${expected_marker}"; then
    echo "Refusing Preview migration: marked database is not the exact current baseline." >&2
    exit 77
  fi

  if test "${user_relations}" = "${expected_relations_with_events}" \
    && test "${assistant_allowed}" = true \
    && test "${runtime_allowed}" = true \
    && test "${events_allowed}" = true \
    && test "${compile_scope_v3_allowed}" = true \
    && test "${single_operation_per_attempt}" = true; then
    if test "${release_marker_current}" != true \
      || test "${applied_source_commit}" != "${source_commit}"; then
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction --command="${marker_upgrade_sql}"
    fi
    echo "Exact AxWise Preview schema through migration 005 is already applied."
    exit 0
  fi
  if test "${release_marker_current}" = true; then
    echo "Refusing Preview migration: latest marker exists without the exact 005 schema." >&2
    exit 77
  fi
  if test "${user_relations}" = "${expected_relations_with_events}" \
    && test "${assistant_allowed}" = true \
    && test "${runtime_allowed}" = true \
    && test "${events_allowed}" = true \
    && test "${compile_scope_v3_allowed}" = false \
    && test "${single_operation_per_attempt}" = false; then
    psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
      --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
      --single-transaction \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${COMPILE_SCOPE_V3_MIGRATION}") \
      --command="${marker_upgrade_sql}"
    echo "Applied exact AxWise CompileScopeV3 migration ${EXPECTED_COMPILE_SCOPE_V3_CHECKSUM}."
    exit 0
  fi
  if test "${user_relations}" = "${expected_relations_before_events}" \
    && test "${assistant_allowed}" = true \
    && test "${runtime_allowed}" = true \
    && test "${events_allowed}" = false \
    && test "${compile_scope_v3_allowed}" = false \
    && test "${single_operation_per_attempt}" = false; then
    psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
      --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
      --single-transaction \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${EVENTS_MIGRATION}") \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${COMPILE_SCOPE_V3_MIGRATION}") \
      --command="${marker_upgrade_sql}"
    echo "Applied exact AxWise operation-events and CompileScopeV3 migrations ${EXPECTED_EVENTS_CHECKSUM}:${EXPECTED_COMPILE_SCOPE_V3_CHECKSUM}."
    exit 0
  fi
  if test "${user_relations}" = "${expected_relations_before_events}" \
    && test "${assistant_allowed}" = true \
    && test "${runtime_allowed}" = false \
    && test "${events_allowed}" = false \
    && test "${compile_scope_v3_allowed}" = false \
    && test "${single_operation_per_attempt}" = false; then
    psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
      --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
      --single-transaction \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${RUNTIME_MIGRATION}") \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${EVENTS_MIGRATION}") \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${COMPILE_SCOPE_V3_MIGRATION}") \
      --command="${marker_upgrade_sql}"
    echo "Applied exact AxWise runtime through CompileScopeV3 migrations ${EXPECTED_RUNTIME_CHECKSUM}:${EXPECTED_EVENTS_CHECKSUM}:${EXPECTED_COMPILE_SCOPE_V3_CHECKSUM}."
    exit 0
  fi
  if test "${user_relations}" = "${expected_relations_before_events}" \
    && test "${assistant_allowed}" = false \
    && test "${runtime_allowed}" = false \
    && test "${events_allowed}" = false \
    && test "${compile_scope_v3_allowed}" = false \
    && test "${single_operation_per_attempt}" = false; then
    psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
      --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
      --single-transaction \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${ASSISTANT_MIGRATION}") \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${RUNTIME_MIGRATION}") \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${EVENTS_MIGRATION}") \
      --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${COMPILE_SCOPE_V3_MIGRATION}") \
      --command="${marker_upgrade_sql}"
    echo "Applied exact AxWise migrations 002-005 ${EXPECTED_ASSISTANT_CHECKSUM}:${EXPECTED_RUNTIME_CHECKSUM}:${EXPECTED_EVENTS_CHECKSUM}:${EXPECTED_COMPILE_SCOPE_V3_CHECKSUM}."
    exit 0
  fi
  echo "Refusing Preview migration: marked database is not an exact ordered migration stage." >&2
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
  --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${ASSISTANT_MIGRATION}") \
  --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${RUNTIME_MIGRATION}") \
  --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${EVENTS_MIGRATION}") \
  --file=<(sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${COMPILE_SCOPE_V3_MIGRATION}") \
  --file="${BINDINGS}" \
  --command="${marker_upgrade_sql}"

echo "Applied exact AxWise Preview schema through migration 005 ${EXPECTED_CHECKSUM}:${EXPECTED_ASSISTANT_CHECKSUM}:${EXPECTED_RUNTIME_CHECKSUM}:${EXPECTED_EVENTS_CHECKSUM}:${EXPECTED_COMPILE_SCOPE_V3_CHECKSUM}."
