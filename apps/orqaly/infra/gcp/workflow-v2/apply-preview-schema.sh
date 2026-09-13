#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
DATABASE_NAME="orqaly_v2_preview_001"
MIGRATION_PATH="database/workflow-v2/migrations/001_clean_workflow_v2.sql"
ASSISTANT_MIGRATION_PATH="database/workflow-v2/migrations/002_assistant_goal.sql"
PERSONAL_SESSION_MIGRATION_PATH="database/workflow-v2/migrations/003_personal_tenant_jit.sql"
ASSISTANT_RETRY_MIGRATION_PATH="database/workflow-v2/migrations/004_assistant_retry_lineage.sql"
ASSISTANT_EVENTS_MIGRATION_PATH="database/workflow-v2/migrations/005_assistant_turn_events.sql"
ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH="database/workflow-v2/migrations/006_assistant_turn_provenance.sql"
ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH="database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql"
AGENTIC_EXECUTION_MIGRATION_PATH="database/workflow-v2/migrations/008_agentic_execution_preview.sql"
BINDINGS_PATH="infra/gcp/workflow-v2/preview-role-bindings.sql"
AGENTIC_BINDINGS_PATH="infra/gcp/workflow-v2/agentic-preview-role-bindings.sql"
ADDITIVE_MARKER_PATH="infra/gcp/workflow-v2/record-additive-migrations.sql"
CATALOG_FINGERPRINT_PATH="infra/gcp/workflow-v2/catalog-fingerprint.sql"
EXPECTED_CHECKSUM="05bc70f8c263bad766d2bbb251936d14a079678a5923870d13263305d139c75b"
EXPECTED_ASSISTANT_CHECKSUM="2bfac3fb1d342db03f55f157fb7f8be46e46fd7bb966c63e9f8d937640df38f5"
EXPECTED_PERSONAL_SESSION_CHECKSUM="95063a8aff45de731b6dbe472d7a413eab03a85a45df51947533968d05483d5a"
EXPECTED_ASSISTANT_RETRY_CHECKSUM="753186fd0c43a0b41b6318582ba680dc150a213aa8b54e4d5a25fbd30c517823"
EXPECTED_ASSISTANT_EVENTS_CHECKSUM="6e2abfd9b07cc8360d485e0120e3be80fa8bc319940b3e16f08140a88179e6ee"
EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM="1e64db4857083e85576b4b32bf6376f9e05fc482d88b1abb465eededbab3968e"
EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM="4ca1289eb45f75c877a3f6b2afaf3b0af0f8286fbc7a041e93643381d9aeccd5"
EXPECTED_AGENTIC_EXECUTION_CHECKSUM="a7423976f5e2345d467071bae263998ff682d26b37318bd6661ef1afa05fc142"
EXPECTED_BINDINGS_CHECKSUM="9802c04a2de4547efce39bd15b6b611c4460e971b344c551ad7e7c588d9408f5"
EXPECTED_AGENTIC_BINDINGS_CHECKSUM="6b58aa0352a3e1677b70e8e687263d52b981d90a48ae93afe7bb6fceb31e4167"
EXPECTED_ADDITIVE_MARKER_CHECKSUM="57343afff7af3378eb89fd14a80d3f79a12ae001bbe47fcc70feaaef219de9fc"
EXPECTED_CATALOG_FINGERPRINT_FILE_CHECKSUM="e8881812f4d176adf2a3e1c251b71ab218c8f37e74fc558223bceef0d09c4454"
EXPECTED_BASELINE_CATALOG_FINGERPRINT="684cb1b2dbbc5b6cef15c2de349f4b2d307f38029b1a31d05b2b8c49371feffd"
EXPECTED_BASELINE_NOINHERIT_CATALOG_FINGERPRINT="a48a1be077580485d4d636014dd8821a31dd2c5bf6509753b2e0586aa5026840"
EXPECTED_ASSISTANT_CATALOG_FINGERPRINT="996a46bfe7750d7b996d3e9a653a8c5aff7f21981de6a3a71706821bc8ee56af"
EXPECTED_ASSISTANT_NOINHERIT_CATALOG_FINGERPRINT="7a27660c13519e810ab9e0c164c8042a3e5c7e7347ae392d562ab5518f1ebdc4"
EXPECTED_PERSONAL_SESSION_CATALOG_FINGERPRINT="03706f24d36937bbde80b8ece5827ac476b1ca216cb2d4dd59924939d19b1133"
EXPECTED_ASSISTANT_RETRY_CATALOG_FINGERPRINT="e81f2929d25266632c71e3b098bc1cd4a03be270de28b619105767b0e474e0f9"
EXPECTED_ASSISTANT_EVENTS_CATALOG_FINGERPRINT="8d28f5677964c1d63cadf18817c3ed7edf832c3e96ae4485f833ce6796fb2c23"
EXPECTED_ASSISTANT_TURN_PROVENANCE_CATALOG_FINGERPRINT="0b4e25a9d5ea0d19ab3b41b040e4e621486d05968572262babd13e7cd0b83d1a"
EXPECTED_PRE_AGENTIC_EXECUTION_CATALOG_FINGERPRINT="0340ef9dd0fba543f4ee4f678c65ca184809a654e36a7dc281743f043255c2d9"
EXPECTED_FULL_CATALOG_FINGERPRINT="a020d093fa84aae59ba84b000686a1147776eb343effff9074c1b4a1a39ea363"
ADMIN_DB_SECRET_VERSION="${ADMIN_DB_SECRET_VERSION:?numeric Preview 001 admin-password version is required}"
GATEWAY_DB_PASSWORD_SECRET_VERSION="${GATEWAY_DB_PASSWORD_SECRET_VERSION:?numeric Preview 001 Gateway-password version is required}"
REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
WORKTREE_ROOT="$(git -C "${REPOSITORY_ROOT}" rev-parse --show-toplevel)"
MIGRATION="${REPOSITORY_ROOT}/${MIGRATION_PATH}"
ASSISTANT_MIGRATION="${REPOSITORY_ROOT}/${ASSISTANT_MIGRATION_PATH}"
PERSONAL_SESSION_MIGRATION="${REPOSITORY_ROOT}/${PERSONAL_SESSION_MIGRATION_PATH}"
ASSISTANT_RETRY_MIGRATION="${REPOSITORY_ROOT}/${ASSISTANT_RETRY_MIGRATION_PATH}"
ASSISTANT_EVENTS_MIGRATION="${REPOSITORY_ROOT}/${ASSISTANT_EVENTS_MIGRATION_PATH}"
ASSISTANT_TURN_PROVENANCE_MIGRATION="${REPOSITORY_ROOT}/${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}"
ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION="${REPOSITORY_ROOT}/${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}"
AGENTIC_EXECUTION_MIGRATION="${REPOSITORY_ROOT}/${AGENTIC_EXECUTION_MIGRATION_PATH}"
BINDINGS="${REPOSITORY_ROOT}/${BINDINGS_PATH}"
AGENTIC_BINDINGS="${REPOSITORY_ROOT}/${AGENTIC_BINDINGS_PATH}"
ADDITIVE_MARKER="${REPOSITORY_ROOT}/${ADDITIVE_MARKER_PATH}"
CATALOG_FINGERPRINT="${REPOSITORY_ROOT}/${CATALOG_FINGERPRINT_PATH}"

if test -n "$(git -C "${WORKTREE_ROOT}" status --porcelain=v1 --untracked-files=all)"; then
  echo "Refusing Preview migration: Orqaly repository is not clean." >&2
  exit 65
fi

if [[ ! "${ADMIN_DB_SECRET_VERSION}" =~ ^[1-9][0-9]*$ ]] \
  || [[ ! "${GATEWAY_DB_PASSWORD_SECRET_VERSION}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Admin and Gateway database secret versions must be positive numeric versions." >&2
  exit 64
fi

actual_checksum="$(shasum -a 256 "${MIGRATION}" | awk '{print $1}')"
if test "${actual_checksum}" != "${EXPECTED_CHECKSUM}"; then
  echo "Refusing Preview migration: schema checksum changed." >&2
  exit 1
fi
actual_assistant_checksum="$(shasum -a 256 "${ASSISTANT_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_checksum}" != "${EXPECTED_ASSISTANT_CHECKSUM}"; then
  echo "Refusing Preview migration: Assistant schema checksum changed." >&2
  exit 1
fi
actual_personal_session_checksum="$(shasum -a 256 "${PERSONAL_SESSION_MIGRATION}" | awk '{print $1}')"
if test "${actual_personal_session_checksum}" != "${EXPECTED_PERSONAL_SESSION_CHECKSUM}"; then
  echo "Refusing Preview migration: personal-session schema checksum changed." >&2
  exit 1
fi
actual_assistant_retry_checksum="$(shasum -a 256 "${ASSISTANT_RETRY_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_retry_checksum}" != "${EXPECTED_ASSISTANT_RETRY_CHECKSUM}"; then
  echo "Refusing Preview migration: Assistant retry schema checksum changed." >&2
  exit 1
fi
actual_assistant_events_checksum="$(shasum -a 256 "${ASSISTANT_EVENTS_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_events_checksum}" != "${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}"; then
  echo "Refusing Preview migration: Assistant events schema checksum changed." >&2
  exit 1
fi
actual_assistant_turn_provenance_checksum="$(shasum -a 256 "${ASSISTANT_TURN_PROVENANCE_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_turn_provenance_checksum}" != "${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}"; then
  echo "Refusing Preview migration: Assistant turn-provenance schema checksum changed." >&2
  exit 1
fi
actual_assistant_grounded_sources_reason_checksum="$(shasum -a 256 "${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_grounded_sources_reason_checksum}" != "${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}"; then
  echo "Refusing Preview migration: Assistant grounded-sources reason schema checksum changed." >&2
  exit 1
fi
actual_agentic_execution_checksum="$(shasum -a 256 "${AGENTIC_EXECUTION_MIGRATION}" | awk '{print $1}')"
if test "${actual_agentic_execution_checksum}" != "${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}"; then
  echo "Refusing Preview migration: Agentic execution schema checksum changed." >&2
  exit 1
fi
actual_bindings_checksum="$(shasum -a 256 "${BINDINGS}" | awk '{print $1}')"
if test "${actual_bindings_checksum}" != "${EXPECTED_BINDINGS_CHECKSUM}"; then
  echo "Refusing Preview migration: role-bindings checksum changed." >&2
  exit 1
fi
actual_agentic_bindings_checksum="$(shasum -a 256 "${AGENTIC_BINDINGS}" | awk '{print $1}')"
if test "${actual_agentic_bindings_checksum}" != "${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}"; then
  echo "Refusing Preview migration: Agentic role-bindings checksum changed." >&2
  exit 1
fi
actual_additive_marker_checksum="$(shasum -a 256 "${ADDITIVE_MARKER}" | awk '{print $1}')"
if test "${actual_additive_marker_checksum}" != "${EXPECTED_ADDITIVE_MARKER_CHECKSUM}"; then
  echo "Refusing Preview migration: additive release-marker checksum changed." >&2
  exit 1
fi
actual_catalog_fingerprint_file_checksum="$(shasum -a 256 "${CATALOG_FINGERPRINT}" | awk '{print $1}')"
if test "${actual_catalog_fingerprint_file_checksum}" != "${EXPECTED_CATALOG_FINGERPRINT_FILE_CHECKSUM}"; then
  echo "Refusing Preview migration: catalog-fingerprint verifier checksum changed." >&2
  exit 1
fi

export PGPASSWORD
PGPASSWORD="$(gcloud secrets versions access "${ADMIN_DB_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-admin-password \
  --project="${PROJECT_ID}")"
export ORQALY_GATEWAY_DB_PASSWORD_VALUE
ORQALY_GATEWAY_DB_PASSWORD_VALUE="$(gcloud secrets versions access \
  "${GATEWAY_DB_PASSWORD_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-gateway-password \
  --project="${PROJECT_ID}")"
if [[ ! "${ORQALY_GATEWAY_DB_PASSWORD_VALUE}" =~ ^[a-f0-9]{48}$ ]]; then
  echo "Refusing Preview migration: Gateway password is not generated Preview material." >&2
  exit 78
fi

proxy_path="$(command -v cloud-sql-proxy)"
proxy_port="19470"
proxy_log="$(mktemp -t orqaly-v2-preview-proxy.XXXXXX)"
staged_baseline_source="$(mktemp -t orqaly-v2-001-source.XXXXXX)"
staged_assistant_source="$(mktemp -t orqaly-v2-002-source.XXXXXX)"
staged_personal_source="$(mktemp -t orqaly-v2-003-source.XXXXXX)"
staged_assistant_retry_source="$(mktemp -t orqaly-v2-004-source.XXXXXX)"
staged_assistant_events_source="$(mktemp -t orqaly-v2-005-source.XXXXXX)"
staged_assistant_turn_provenance_source="$(mktemp -t orqaly-v2-006-source.XXXXXX)"
staged_assistant_grounded_sources_reason_source="$(mktemp -t orqaly-v2-007-source.XXXXXX)"
staged_agentic_execution_source="$(mktemp -t orqaly-v2-008-source.XXXXXX)"
staged_baseline="$(mktemp -t orqaly-v2-001-staged.XXXXXX)"
staged_assistant="$(mktemp -t orqaly-v2-002-staged.XXXXXX)"
staged_personal="$(mktemp -t orqaly-v2-003-staged.XXXXXX)"
staged_assistant_retry="$(mktemp -t orqaly-v2-004-staged.XXXXXX)"
staged_assistant_events="$(mktemp -t orqaly-v2-005-staged.XXXXXX)"
staged_assistant_turn_provenance="$(mktemp -t orqaly-v2-006-staged.XXXXXX)"
staged_assistant_grounded_sources_reason="$(mktemp -t orqaly-v2-007-staged.XXXXXX)"
staged_agentic_execution="$(mktemp -t orqaly-v2-008-staged.XXXXXX)"
staged_bindings="$(mktemp -t orqaly-v2-bindings-staged.XXXXXX)"
staged_agentic_bindings="$(mktemp -t orqaly-v2-agentic-bindings-staged.XXXXXX)"
staged_additive_marker="$(mktemp -t orqaly-v2-additive-marker-staged.XXXXXX)"
staged_catalog_fingerprint="$(mktemp -t orqaly-v2-catalog-fingerprint-staged.XXXXXX)"
"${proxy_path}" "${PROJECT_ID}:europe-west4:${SQL_INSTANCE}" \
  --gcloud-auth --address=127.0.0.1 --port="${proxy_port}" >"${proxy_log}" 2>&1 &
proxy_pid="$!"
cleanup() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f "${proxy_log}" \
    "${staged_baseline_source}" "${staged_assistant_source}" \
    "${staged_personal_source}" "${staged_baseline}" \
    "${staged_assistant_retry_source}" "${staged_assistant_events_source}" \
    "${staged_assistant_turn_provenance_source}" \
    "${staged_assistant_grounded_sources_reason_source}" \
    "${staged_agentic_execution_source}" \
    "${staged_assistant}" "${staged_personal}" "${staged_assistant_retry}" \
    "${staged_assistant_events}" "${staged_assistant_turn_provenance}" \
    "${staged_assistant_grounded_sources_reason}" \
    "${staged_agentic_execution}" "${staged_bindings}" \
    "${staged_agentic_bindings}" \
    "${staged_additive_marker}" "${staged_catalog_fingerprint}"
  unset PGPASSWORD
  unset ORQALY_GATEWAY_DB_PASSWORD_VALUE
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

stage_migration() {
  local source="$1" snapshot="$2" staged="$3" expected="$4" label="$5" snapshot_sha
  cp "${source}" "${snapshot}"
  snapshot_sha="$(shasum -a 256 "${snapshot}" | awk '{print $1}')"
  if test "${snapshot_sha}" != "${expected}"; then
    echo "Refusing Preview migration: staged ${label} bytes changed." >&2
    exit 1
  fi
  sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${snapshot}" >"${staged}"
  test -s "${staged}" || {
    echo "Refusing Preview migration: staged ${label} is empty." >&2
    exit 1
  }
}
stage_exact_file() {
  local source="$1" staged="$2" expected="$3" label="$4" staged_sha
  cp "${source}" "${staged}"
  staged_sha="$(shasum -a 256 "${staged}" | awk '{print $1}')"
  if test "${staged_sha}" != "${expected}"; then
    echo "Refusing Preview migration: staged ${label} bytes changed." >&2
    exit 1
  fi
}
stage_migration "${MIGRATION}" "${staged_baseline_source}" "${staged_baseline}" \
  "${EXPECTED_CHECKSUM}" baseline-001
stage_migration "${ASSISTANT_MIGRATION}" "${staged_assistant_source}" "${staged_assistant}" \
  "${EXPECTED_ASSISTANT_CHECKSUM}" assistant-002
stage_migration "${PERSONAL_SESSION_MIGRATION}" "${staged_personal_source}" \
  "${staged_personal}" "${EXPECTED_PERSONAL_SESSION_CHECKSUM}" personal-session-003
stage_migration "${ASSISTANT_RETRY_MIGRATION}" "${staged_assistant_retry_source}" \
  "${staged_assistant_retry}" "${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" assistant-retry-004
stage_migration "${ASSISTANT_EVENTS_MIGRATION}" "${staged_assistant_events_source}" \
  "${staged_assistant_events}" "${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" assistant-events-005
stage_migration "${ASSISTANT_TURN_PROVENANCE_MIGRATION}" \
  "${staged_assistant_turn_provenance_source}" "${staged_assistant_turn_provenance}" \
  "${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" assistant-turn-provenance-006
stage_migration "${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION}" \
  "${staged_assistant_grounded_sources_reason_source}" \
  "${staged_assistant_grounded_sources_reason}" \
  "${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" assistant-grounded-sources-reason-007
stage_migration "${AGENTIC_EXECUTION_MIGRATION}" \
  "${staged_agentic_execution_source}" "${staged_agentic_execution}" \
  "${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" agentic-execution-008
stage_exact_file "${BINDINGS}" "${staged_bindings}" "${EXPECTED_BINDINGS_CHECKSUM}" role-bindings
stage_exact_file "${AGENTIC_BINDINGS}" "${staged_agentic_bindings}" \
  "${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" agentic-role-bindings
stage_exact_file "${ADDITIVE_MARKER}" "${staged_additive_marker}" \
  "${EXPECTED_ADDITIVE_MARKER_CHECKSUM}" additive-release-marker
stage_exact_file "${CATALOG_FINGERPRINT}" "${staged_catalog_fingerprint}" \
  "${EXPECTED_CATALOG_FINGERPRINT_FILE_CHECKSUM}" catalog-fingerprint-verifier

source_commit="$(git -C "${REPOSITORY_ROOT}" rev-parse --verify HEAD)"
database_query() {
  psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
    --dbname="${DATABASE_NAME}" --no-password --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 --command="$1"
}
database_file_query() {
  psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
    --dbname="${DATABASE_NAME}" --no-password --tuples-only --no-align \
    --set=ON_ERROR_STOP=1 --file="${staged_catalog_fingerprint}"
}
assert_full_catalog() {
  local observed
  observed="$(database_file_query)"
  if test "${observed}" != "${EXPECTED_FULL_CATALOG_FINGERPRINT}"; then
    echo "Refusing Preview migration: live catalog differs from the exact full release." >&2
    exit 77
  fi
}

# The clean 001 baseline remains immutable. Additive migrations are permitted
# only on an exact known state or in the same transaction as a fresh 001.
user_schemas="$(database_query "SELECT string_agg(nspname, ',' ORDER BY nspname) FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('information_schema', 'cloudsqladmin')")"
user_relations="$(database_query "SELECT string_agg(name, ',' ORDER BY name) FROM (SELECT DISTINCT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e' WHERE c.relkind IN ('r','p','v','m','S','f') AND n.nspname !~ '^pg_' AND n.nspname NOT IN ('information_schema', 'cloudsqladmin') AND NOT (n.nspname = 'public' AND d.objid IS NOT NULL)) inventory")"
marker_exists="$(database_query "SELECT (to_regclass('workflow_v2_release.applied_baseline') IS NOT NULL)::text")"
baseline_relations="orqaly.approvals,orqaly.artifact_lineage,orqaly.artifacts,orqaly.outbox_events,orqaly.stage_attempts,orqaly.tenant_agents,orqaly.tenant_identity_bindings,orqaly.tenants,orqaly.workflow_events,orqaly.workflow_runs,orqaly.workflow_stage_dependencies,orqaly.workflow_stages,workflow_v2_release.applied_baseline"
assistant_relations="orqaly.approvals,orqaly.artifact_lineage,orqaly.artifacts,orqaly.assistant_messages,orqaly.assistant_threads,orqaly.outbox_events,orqaly.stage_attempts,orqaly.tenant_agents,orqaly.tenant_identity_bindings,orqaly.tenants,orqaly.workflow_events,orqaly.workflow_runs,orqaly.workflow_stage_dependencies,orqaly.workflow_stages,workflow_v2_release.applied_baseline"
assistant_retry_relations="orqaly.approvals,orqaly.artifact_lineage,orqaly.artifacts,orqaly.assistant_messages,orqaly.assistant_threads,orqaly.outbox_events,orqaly.stage_attempts,orqaly.tenant_agents,orqaly.tenant_identity_bindings,orqaly.tenants,orqaly.workflow_events,orqaly.workflow_runs,orqaly.workflow_stage_dependencies,orqaly.workflow_stages,workflow_v2_release.applied_additive_migrations,workflow_v2_release.applied_baseline"
pre_agentic_execution_relations="orqaly.approvals,orqaly.artifact_lineage,orqaly.artifacts,orqaly.assistant_messages,orqaly.assistant_threads,orqaly.assistant_turn_events,orqaly.outbox_events,orqaly.stage_attempts,orqaly.tenant_agents,orqaly.tenant_identity_bindings,orqaly.tenants,orqaly.workflow_events,orqaly.workflow_runs,orqaly.workflow_stage_dependencies,orqaly.workflow_stages,workflow_v2_release.applied_additive_migrations,workflow_v2_release.applied_baseline"
expected_relations="orqaly.agentic_gateway_effects,orqaly.agentic_gateway_grants,orqaly.agentic_operational_records,orqaly.approvals,orqaly.artifact_lineage,orqaly.artifacts,orqaly.assistant_messages,orqaly.assistant_threads,orqaly.assistant_turn_events,orqaly.executable_actions,orqaly.outbox_events,orqaly.stage_attempts,orqaly.tenant_agents,orqaly.tenant_identity_bindings,orqaly.tenants,orqaly.workflow_events,orqaly.workflow_runs,orqaly.workflow_stage_dependencies,orqaly.workflow_stages,workflow_v2_release.applied_additive_bindings,workflow_v2_release.applied_additive_migrations,workflow_v2_release.applied_baseline"
expected_marker="${MIGRATION_PATH}:${EXPECTED_CHECKSUM}:${BINDINGS_PATH}:${EXPECTED_BINDINGS_CHECKSUM}"
expected_personal_session_additives="2:${ASSISTANT_MIGRATION_PATH}:${EXPECTED_ASSISTANT_CHECKSUM},3:${PERSONAL_SESSION_MIGRATION_PATH}:${EXPECTED_PERSONAL_SESSION_CHECKSUM}"
expected_assistant_retry_additives="${expected_personal_session_additives},4:${ASSISTANT_RETRY_MIGRATION_PATH}:${EXPECTED_ASSISTANT_RETRY_CHECKSUM}"
expected_assistant_events_additives="${expected_assistant_retry_additives},5:${ASSISTANT_EVENTS_MIGRATION_PATH}:${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}"
expected_assistant_turn_provenance_additives="${expected_assistant_events_additives},6:${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}:${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}"
expected_pre_agentic_execution_additives="${expected_assistant_turn_provenance_additives},7:${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}:${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}"
expected_additives="${expected_pre_agentic_execution_additives},8:${AGENTIC_EXECUTION_MIGRATION_PATH}:${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}"
expected_agentic_binding="8:${AGENTIC_BINDINGS_PATH}:${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}"
legacy_identity_ready="$(database_query "SELECT (to_regprocedure('orqaly.resolve_tenant_identity(text,text,text)') IS NOT NULL AND to_regprocedure('orqaly.ensure_personal_tenant(text,text)') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('tenant_identity_bindings_personal_type_check','tenant_identity_bindings_personal_subject_check','workflow_runs_personal_owner_check','assistant_threads_personal_owner_check')))::text")"
personal_session_ready="$(database_query "SELECT (to_regprocedure('orqaly.ensure_personal_tenant(text,text)') IS NOT NULL AND to_regprocedure('orqaly.resolve_tenant_identity(text,text,text)') IS NOT NULL AND (SELECT count(*) = 4 FROM pg_constraint WHERE conname IN ('tenant_identity_bindings_personal_type_check','tenant_identity_bindings_personal_subject_check','workflow_runs_personal_owner_check','assistant_threads_personal_owner_check') AND convalidated))::text")"
if test "${marker_exists}" = true; then
  current_catalog_fingerprint="$(database_file_query)"
  applied_marker="$(database_query "SELECT migration_path || ':' || sha256 || ':' || bindings_path || ':' || bindings_sha256 FROM workflow_v2_release.applied_baseline WHERE component = 'orqaly' AND migration_number = 1")"
  additive_marker_exists="$(database_query "SELECT (to_regclass('workflow_v2_release.applied_additive_migrations') IS NOT NULL)::text")"
  if test "${user_schemas}" = "orqaly,public,workflow_v2_release" \
    && { test "${user_relations}" = "${expected_relations}" \
      || test "${user_relations}" = "${pre_agentic_execution_relations}" \
      || test "${user_relations}" = "${assistant_retry_relations}"; } \
    && test "${applied_marker}" = "${expected_marker}" \
    && test "${additive_marker_exists}" = true \
    && test "${personal_session_ready}" = true; then
    applied_additives="$(database_query "SELECT string_agg(migration_number::text || ':' || migration_path || ':' || sha256, ',' ORDER BY migration_number) FROM workflow_v2_release.applied_additive_migrations WHERE component = 'orqaly'")"
    if test "${user_relations}" = "${expected_relations}" \
      && test "${current_catalog_fingerprint}" = "${EXPECTED_FULL_CATALOG_FINGERPRINT}"; then
      if test "${applied_additives}" != "${expected_additives}"; then
        echo "Refusing Preview migration: additive release marker differs from exact HEAD." >&2
        exit 77
      fi
      applied_agentic_binding="$(database_query "SELECT migration_number::text || ':' || bindings_path || ':' || bindings_sha256 FROM workflow_v2_release.applied_additive_bindings WHERE component = 'orqaly' AND migration_number = 8")"
      if test "${applied_agentic_binding}" != "${expected_agentic_binding}"; then
        echo "Refusing Preview migration: Agentic role-binding marker differs from exact HEAD." >&2
        exit 77
      fi
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
        --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
        --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
        --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
        --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
        --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
        --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
        --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
        --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
        --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
        --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
        --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
        --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
        --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
        --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
        --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
        --set=database_name="${DATABASE_NAME}" \
        --set=source_commit="${source_commit}" \
        --file="${staged_agentic_bindings}" \
        --file="${staged_additive_marker}" \
        --command="UPDATE workflow_v2_release.applied_baseline SET source_commit = '${source_commit}' WHERE component = 'orqaly' AND migration_number = 1" >/dev/null
      assert_full_catalog
      echo "Exact Orqaly Preview schema and additive migration ledger are already applied."
      exit 0
    fi
    if test "${user_relations}" = "${pre_agentic_execution_relations}" \
      && test "${current_catalog_fingerprint}" = "${EXPECTED_PRE_AGENTIC_EXECUTION_CATALOG_FINGERPRINT}"; then
      if test "${applied_additives}" != "${expected_pre_agentic_execution_additives}"; then
        echo "Refusing Preview migration: pre-008 additive release marker differs from the exact known release." >&2
        exit 77
      fi
      agentic_binding_marker_exists="$(database_query "SELECT (to_regclass('workflow_v2_release.applied_additive_bindings') IS NOT NULL)::text")"
      if test "${agentic_binding_marker_exists}" != false; then
        echo "Refusing Preview migration: pre-008 database contains an Agentic binding marker." >&2
        exit 77
      fi
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
        --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
        --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
        --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
        --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
        --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
        --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
        --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
        --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
        --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
        --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
        --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
        --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
        --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
        --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
        --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
        --set=database_name="${DATABASE_NAME}" \
        --set=source_commit="${source_commit}" \
        --file="${staged_agentic_execution}" \
        --file="${staged_agentic_bindings}" \
        --file="${staged_additive_marker}" \
        --command="UPDATE workflow_v2_release.applied_baseline SET source_commit = '${source_commit}' WHERE component = 'orqaly' AND migration_number = 1"
      assert_full_catalog
      echo "Applied exact Orqaly Agentic execution migration 008 and its least-privilege Gateway binding."
      exit 0
    fi
    if test "${user_relations}" = "${pre_agentic_execution_relations}" \
      && test "${current_catalog_fingerprint}" = "${EXPECTED_ASSISTANT_TURN_PROVENANCE_CATALOG_FINGERPRINT}"; then
      if test "${applied_additives}" != "${expected_assistant_turn_provenance_additives}"; then
        echo "Refusing Preview migration: pre-007 additive release marker differs from the exact known release." >&2
        exit 77
      fi
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
        --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
        --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
        --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
        --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
        --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
        --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
        --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
        --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
        --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
        --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
        --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
        --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
        --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
        --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
        --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
        --set=database_name="${DATABASE_NAME}" \
        --set=source_commit="${source_commit}" \
        --file="${staged_assistant_grounded_sources_reason}" \
        --file="${staged_agentic_execution}" \
        --file="${staged_agentic_bindings}" \
        --file="${staged_additive_marker}" \
        --command="UPDATE workflow_v2_release.applied_baseline SET source_commit = '${source_commit}' WHERE component = 'orqaly' AND migration_number = 1"
      assert_full_catalog
      echo "Applied exact Orqaly additive migrations through Agentic execution 008."
      exit 0
    fi
    if test "${user_relations}" = "${pre_agentic_execution_relations}" \
      && test "${current_catalog_fingerprint}" = "${EXPECTED_ASSISTANT_EVENTS_CATALOG_FINGERPRINT}"; then
      if test "${applied_additives}" != "${expected_assistant_events_additives}"; then
        echo "Refusing Preview migration: pre-006 additive release marker differs from the exact known release." >&2
        exit 77
      fi
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
        --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
        --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
        --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
        --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
        --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
        --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
        --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
        --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
        --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
        --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
        --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
        --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
        --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
        --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
        --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
        --set=database_name="${DATABASE_NAME}" \
        --set=source_commit="${source_commit}" \
        --file="${staged_assistant_turn_provenance}" \
        --file="${staged_assistant_grounded_sources_reason}" \
        --file="${staged_agentic_execution}" \
        --file="${staged_agentic_bindings}" \
        --file="${staged_additive_marker}" \
        --command="UPDATE workflow_v2_release.applied_baseline SET source_commit = '${source_commit}' WHERE component = 'orqaly' AND migration_number = 1"
      assert_full_catalog
      echo "Applied exact Orqaly additive migrations through Agentic execution 008."
      exit 0
    fi
    if test "${user_relations}" = "${assistant_retry_relations}" \
      && test "${current_catalog_fingerprint}" = "${EXPECTED_ASSISTANT_RETRY_CATALOG_FINGERPRINT}"; then
      if test "${applied_additives}" != "${expected_assistant_retry_additives}"; then
        echo "Refusing Preview migration: pre-005 additive release marker differs from the exact known release." >&2
        exit 77
      fi
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
        --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
        --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
        --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
        --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
        --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
        --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
        --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
        --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
        --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
        --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
        --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
        --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
        --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
        --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
        --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
        --set=database_name="${DATABASE_NAME}" \
        --set=source_commit="${source_commit}" \
        --file="${staged_assistant_events}" \
        --file="${staged_assistant_turn_provenance}" \
        --file="${staged_assistant_grounded_sources_reason}" \
        --file="${staged_agentic_execution}" \
        --file="${staged_agentic_bindings}" \
        --file="${staged_additive_marker}" \
        --command="UPDATE workflow_v2_release.applied_baseline SET source_commit = '${source_commit}' WHERE component = 'orqaly' AND migration_number = 1"
      assert_full_catalog
      echo "Applied exact Orqaly additive migrations through Agentic execution 008."
      exit 0
    fi
    if test "${current_catalog_fingerprint}" = "${EXPECTED_PERSONAL_SESSION_CATALOG_FINGERPRINT}"; then
      if test "${applied_additives}" != "${expected_personal_session_additives}"; then
        echo "Refusing Preview migration: pre-004 additive release marker differs from the exact known release." >&2
        exit 77
      fi
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
        --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
        --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
        --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
        --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
        --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
        --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
        --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
        --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
        --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
        --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
        --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
        --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
        --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
        --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
        --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
        --set=database_name="${DATABASE_NAME}" \
        --set=source_commit="${source_commit}" \
        --file="${staged_assistant_retry}" \
        --file="${staged_assistant_events}" \
        --file="${staged_assistant_turn_provenance}" \
        --file="${staged_assistant_grounded_sources_reason}" \
        --file="${staged_agentic_execution}" \
        --file="${staged_agentic_bindings}" \
        --file="${staged_additive_marker}" \
        --command="UPDATE workflow_v2_release.applied_baseline SET source_commit = '${source_commit}' WHERE component = 'orqaly' AND migration_number = 1"
      assert_full_catalog
      echo "Applied exact Orqaly additive migrations through Agentic execution 008."
      exit 0
    fi
  fi
  known_pre_additive_catalog=false
  # PostgreSQL 16 derives a plain GRANT's membership INHERIT default from the
  # member role. Historical Cloud SQL Preview grants already have the runtime-
  # required TRUE option, while a locally prepared exact baseline can have
  # FALSE. Both complete catalog states are known and safe to advance because
  # migration 003 explicitly converges all three memberships to TRUE.
  if test "${user_relations}" = "${baseline_relations}" \
    && { test "${current_catalog_fingerprint}" = "${EXPECTED_BASELINE_CATALOG_FINGERPRINT}" \
      || test "${current_catalog_fingerprint}" = "${EXPECTED_BASELINE_NOINHERIT_CATALOG_FINGERPRINT}"; }; then
    known_pre_additive_catalog=true
  elif test "${user_relations}" = "${assistant_relations}" \
    && { test "${current_catalog_fingerprint}" = "${EXPECTED_ASSISTANT_CATALOG_FINGERPRINT}" \
      || test "${current_catalog_fingerprint}" = "${EXPECTED_ASSISTANT_NOINHERIT_CATALOG_FINGERPRINT}"; }; then
    known_pre_additive_catalog=true
  fi
  if test "${user_schemas}" = "orqaly,public,workflow_v2_release" \
    && { test "${user_relations}" = "${baseline_relations}" || test "${user_relations}" = "${assistant_relations}"; } \
    && test "${applied_marker}" = "${expected_marker}" \
    && test "${additive_marker_exists}" = false \
    && test "${legacy_identity_ready}" = true \
    && test "${known_pre_additive_catalog}" = true; then
    if test "${user_relations}" = "${baseline_relations}"; then
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
        --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
        --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
        --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
        --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
        --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
        --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
        --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
        --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
        --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
        --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
        --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
        --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
        --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
        --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
        --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
        --set=database_name="${DATABASE_NAME}" \
        --set=source_commit="${source_commit}" \
        --file="${staged_assistant}" \
        --file="${staged_personal}" \
        --file="${staged_assistant_retry}" \
        --file="${staged_assistant_events}" \
        --file="${staged_assistant_turn_provenance}" \
        --file="${staged_assistant_grounded_sources_reason}" \
        --file="${staged_agentic_execution}" \
        --file="${staged_agentic_bindings}" \
        --file="${staged_additive_marker}" \
        --command="UPDATE workflow_v2_release.applied_baseline SET source_commit = '${source_commit}' WHERE component = 'orqaly' AND migration_number = 1"
    else
      psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname="${DATABASE_NAME}" --no-password --set=ON_ERROR_STOP=1 \
        --single-transaction \
        --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
        --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
        --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
        --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
        --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
        --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
        --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
        --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
        --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
        --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
        --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
        --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
        --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
        --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
        --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
        --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
        --set=database_name="${DATABASE_NAME}" \
        --set=source_commit="${source_commit}" \
        --file="${staged_personal}" \
        --file="${staged_assistant_retry}" \
        --file="${staged_assistant_events}" \
        --file="${staged_assistant_turn_provenance}" \
        --file="${staged_assistant_grounded_sources_reason}" \
        --file="${staged_agentic_execution}" \
        --file="${staged_agentic_bindings}" \
        --file="${staged_additive_marker}" \
        --command="UPDATE workflow_v2_release.applied_baseline SET source_commit = '${source_commit}' WHERE component = 'orqaly' AND migration_number = 1"
    fi
    assert_full_catalog
    echo "Applied exact Orqaly additive migrations through Agentic execution 008."
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
  --set=assistant_migration_path="${ASSISTANT_MIGRATION_PATH}" \
  --set=assistant_migration_checksum="${EXPECTED_ASSISTANT_CHECKSUM}" \
  --set=personal_session_migration_path="${PERSONAL_SESSION_MIGRATION_PATH}" \
  --set=personal_session_migration_checksum="${EXPECTED_PERSONAL_SESSION_CHECKSUM}" \
  --set=assistant_retry_migration_path="${ASSISTANT_RETRY_MIGRATION_PATH}" \
  --set=assistant_retry_migration_checksum="${EXPECTED_ASSISTANT_RETRY_CHECKSUM}" \
  --set=assistant_events_migration_path="${ASSISTANT_EVENTS_MIGRATION_PATH}" \
  --set=assistant_events_migration_checksum="${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}" \
  --set=assistant_turn_provenance_migration_path="${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" \
  --set=assistant_turn_provenance_migration_checksum="${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}" \
  --set=assistant_grounded_sources_reason_migration_path="${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" \
  --set=assistant_grounded_sources_reason_migration_checksum="${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}" \
  --set=agentic_execution_migration_path="${AGENTIC_EXECUTION_MIGRATION_PATH}" \
  --set=agentic_execution_migration_checksum="${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}" \
  --set=agentic_binding_path="${AGENTIC_BINDINGS_PATH}" \
  --set=agentic_binding_checksum="${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}" \
  --file="${staged_baseline}" \
  --file="${staged_assistant}" \
  --file="${staged_personal}" \
  --file="${staged_assistant_retry}" \
  --file="${staged_assistant_events}" \
  --file="${staged_assistant_turn_provenance}" \
  --file="${staged_assistant_grounded_sources_reason}" \
  --file="${staged_agentic_execution}" \
  --file="${staged_bindings}" \
  --file="${staged_agentic_bindings}" \
  --file="${staged_additive_marker}"

assert_full_catalog
echo "Applied exact Orqaly Preview schema through Agentic execution ${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}."
