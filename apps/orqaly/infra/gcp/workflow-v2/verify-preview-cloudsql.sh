#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
DATABASE_PREFIX="orqaly_v2_release_"
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
EXPECTED_FULL_CATALOG_FINGERPRINT="a020d093fa84aae59ba84b000686a1147776eb343effff9074c1b4a1a39ea363"
ADMIN_DB_SECRET_VERSION="${ADMIN_DB_SECRET_VERSION:?numeric Preview 001 admin-password version is required}"
GATEWAY_DB_PASSWORD_SECRET_VERSION="${GATEWAY_DB_PASSWORD_SECRET_VERSION:?numeric Preview 001 Gateway-password version is required}"
REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
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
proxy_path="$(command -v cloud-sql-proxy)"
proxy_port="19472"
proxy_log="$(mktemp -t orqaly-v2-preview-verify.XXXXXX)"
staged_baseline_source="$(mktemp -t orqaly-v2-verify-001-source.XXXXXX)"
staged_assistant_source="$(mktemp -t orqaly-v2-verify-002-source.XXXXXX)"
staged_personal_source="$(mktemp -t orqaly-v2-verify-003-source.XXXXXX)"
staged_assistant_retry_source="$(mktemp -t orqaly-v2-verify-004-source.XXXXXX)"
staged_assistant_events_source="$(mktemp -t orqaly-v2-verify-005-source.XXXXXX)"
staged_assistant_turn_provenance_source="$(mktemp -t orqaly-v2-verify-006-source.XXXXXX)"
staged_assistant_grounded_sources_reason_source="$(mktemp -t orqaly-v2-verify-007-source.XXXXXX)"
staged_agentic_execution_source="$(mktemp -t orqaly-v2-verify-008-source.XXXXXX)"
staged_baseline="$(mktemp -t orqaly-v2-verify-001-staged.XXXXXX)"
staged_assistant="$(mktemp -t orqaly-v2-verify-002-staged.XXXXXX)"
staged_personal="$(mktemp -t orqaly-v2-verify-003-staged.XXXXXX)"
staged_assistant_retry="$(mktemp -t orqaly-v2-verify-004-staged.XXXXXX)"
staged_assistant_events="$(mktemp -t orqaly-v2-verify-005-staged.XXXXXX)"
staged_assistant_turn_provenance="$(mktemp -t orqaly-v2-verify-006-staged.XXXXXX)"
staged_assistant_grounded_sources_reason="$(mktemp -t orqaly-v2-verify-007-staged.XXXXXX)"
staged_agentic_execution="$(mktemp -t orqaly-v2-verify-008-staged.XXXXXX)"
staged_bindings="$(mktemp -t orqaly-v2-verify-bindings.XXXXXX)"
staged_agentic_bindings="$(mktemp -t orqaly-v2-verify-agentic-bindings.XXXXXX)"
staged_additive_marker="$(mktemp -t orqaly-v2-verify-additive-marker.XXXXXX)"
staged_catalog_fingerprint="$(mktemp -t orqaly-v2-verify-catalog-fingerprint.XXXXXX)"

for tool in jq openssl; do
  command -v "${tool}" >/dev/null || { echo "${tool} is required." >&2; exit 69; }
done
instance_json="$(gcloud sql instances describe "${SQL_INSTANCE}" \
  --project="${PROJECT_ID}" --format=json)"
if ! jq -e '
  .settings.connectorEnforcement == "REQUIRED"
  and ((.settings.ipConfiguration.authorizedNetworks // []) | length) == 0
' <<<"${instance_json}" >/dev/null; then
  echo "Refusing verification on a Cloud SQL instance outside the connector-only boundary." >&2
  exit 77
fi
DATABASE_NAME="${DATABASE_PREFIX}$(openssl rand -hex 8)"
if [[ ! "${DATABASE_NAME}" =~ ^orqaly_v2_release_[a-f0-9]{16}$ ]]; then
  echo "Refusing unsafe generated release-test database name." >&2
  exit 70
fi
database_created=false
proxy_pid=""
cleanup() {
  if test -n "${proxy_pid}"; then
    kill "${proxy_pid}" >/dev/null 2>&1 || true
    wait "${proxy_pid}" >/dev/null 2>&1 || true
  fi
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
  if test "${database_created}" = true; then
    gcloud sql databases delete "${DATABASE_NAME}" \
      --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" --quiet >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

export PGPASSWORD
actual_checksum="$(shasum -a 256 "${MIGRATION}" | awk '{print $1}')"
if test "${actual_checksum}" != "${EXPECTED_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: schema checksum changed." >&2
  exit 1
fi
actual_assistant_checksum="$(shasum -a 256 "${ASSISTANT_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_checksum}" != "${EXPECTED_ASSISTANT_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: Assistant schema checksum changed." >&2
  exit 1
fi
actual_personal_session_checksum="$(shasum -a 256 "${PERSONAL_SESSION_MIGRATION}" | awk '{print $1}')"
if test "${actual_personal_session_checksum}" != "${EXPECTED_PERSONAL_SESSION_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: personal-session schema checksum changed." >&2
  exit 1
fi
actual_assistant_retry_checksum="$(shasum -a 256 "${ASSISTANT_RETRY_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_retry_checksum}" != "${EXPECTED_ASSISTANT_RETRY_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: Assistant retry schema checksum changed." >&2
  exit 1
fi
actual_assistant_events_checksum="$(shasum -a 256 "${ASSISTANT_EVENTS_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_events_checksum}" != "${EXPECTED_ASSISTANT_EVENTS_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: Assistant events schema checksum changed." >&2
  exit 1
fi
actual_assistant_turn_provenance_checksum="$(shasum -a 256 "${ASSISTANT_TURN_PROVENANCE_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_turn_provenance_checksum}" != "${EXPECTED_ASSISTANT_TURN_PROVENANCE_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: Assistant turn-provenance schema checksum changed." >&2
  exit 1
fi
actual_assistant_grounded_sources_reason_checksum="$(shasum -a 256 "${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION}" | awk '{print $1}')"
if test "${actual_assistant_grounded_sources_reason_checksum}" != "${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: Assistant grounded-sources reason schema checksum changed." >&2
  exit 1
fi
actual_agentic_execution_checksum="$(shasum -a 256 "${AGENTIC_EXECUTION_MIGRATION}" | awk '{print $1}')"
if test "${actual_agentic_execution_checksum}" != "${EXPECTED_AGENTIC_EXECUTION_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: Agentic execution schema checksum changed." >&2
  exit 1
fi
actual_bindings_checksum="$(shasum -a 256 "${BINDINGS}" | awk '{print $1}')"
if test "${actual_bindings_checksum}" != "${EXPECTED_BINDINGS_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: role-bindings checksum changed." >&2
  exit 1
fi
actual_agentic_bindings_checksum="$(shasum -a 256 "${AGENTIC_BINDINGS}" | awk '{print $1}')"
if test "${actual_agentic_bindings_checksum}" != "${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: Agentic role-bindings checksum changed." >&2
  exit 1
fi
actual_additive_marker_checksum="$(shasum -a 256 "${ADDITIVE_MARKER}" | awk '{print $1}')"
if test "${actual_additive_marker_checksum}" != "${EXPECTED_ADDITIVE_MARKER_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: additive release-marker checksum changed." >&2
  exit 1
fi
actual_catalog_fingerprint_file_checksum="$(shasum -a 256 "${CATALOG_FINGERPRINT}" | awk '{print $1}')"
if test "${actual_catalog_fingerprint_file_checksum}" != "${EXPECTED_CATALOG_FINGERPRINT_FILE_CHECKSUM}"; then
  echo "Refusing Cloud SQL verification: catalog-fingerprint verifier checksum changed." >&2
  exit 1
fi

stage_migration() {
  local source="$1" snapshot="$2" staged="$3" expected="$4" label="$5" snapshot_sha
  cp "${source}" "${snapshot}"
  snapshot_sha="$(shasum -a 256 "${snapshot}" | awk '{print $1}')"
  if test "${snapshot_sha}" != "${expected}"; then
    echo "Refusing Cloud SQL verification: staged ${label} bytes changed." >&2
    exit 1
  fi
  sed -e '1{/^BEGIN;$/d;}' -e '${/^COMMIT;$/d;}' "${snapshot}" >"${staged}"
  test -s "${staged}" || {
    echo "Refusing Cloud SQL verification: staged ${label} is empty." >&2
    exit 1
  }
}
stage_exact_file() {
  local source="$1" staged="$2" expected="$3" label="$4" staged_sha
  cp "${source}" "${staged}"
  staged_sha="$(shasum -a 256 "${staged}" | awk '{print $1}')"
  if test "${staged_sha}" != "${expected}"; then
    echo "Refusing Cloud SQL verification: staged ${label} bytes changed." >&2
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
if [[ ! "${ADMIN_DB_SECRET_VERSION}" =~ ^[1-9][0-9]*$ ]] \
  || [[ ! "${GATEWAY_DB_PASSWORD_SECRET_VERSION}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Admin and Gateway database secret versions must be positive numeric versions." >&2
  exit 64
fi

PGPASSWORD="$(gcloud secrets versions access "${ADMIN_DB_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-admin-password \
  --project="${PROJECT_ID}")"
export ORQALY_GATEWAY_DB_PASSWORD_VALUE
ORQALY_GATEWAY_DB_PASSWORD_VALUE="$(gcloud secrets versions access \
  "${GATEWAY_DB_PASSWORD_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-gateway-password \
  --project="${PROJECT_ID}")"
if [[ ! "${ORQALY_GATEWAY_DB_PASSWORD_VALUE}" =~ ^[a-f0-9]{48}$ ]]; then
  echo "Refusing Cloud SQL verification: Gateway password has unexpected bytes." >&2
  exit 78
fi

if gcloud sql databases describe "${DATABASE_NAME}" \
  --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Generated release-test database unexpectedly already exists; refusing to delete it." >&2
  exit 73
fi
gcloud sql databases create "${DATABASE_NAME}" \
  --instance="${SQL_INSTANCE}" --project="${PROJECT_ID}" --charset=UTF8 >/dev/null
database_created=true

"${proxy_path}" "${PROJECT_ID}:europe-west4:${SQL_INSTANCE}" \
  --gcloud-auth --address=127.0.0.1 --port="${proxy_port}" >"${proxy_log}" 2>&1 &
proxy_pid="$!"

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
  --file="${staged_additive_marker}" >/dev/null

observed_catalog_fingerprint="$(psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" --no-password \
  --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --file="${staged_catalog_fingerprint}")"
if test "${observed_catalog_fingerprint}" != "${EXPECTED_FULL_CATALOG_FINGERPRINT}"; then
  echo "Cloud SQL verification schema differs from the exact full catalog." >&2
  exit 77
fi

WORKFLOW_V2_TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:${proxy_port}/${DATABASE_NAME}" \
  npm run test:workflow-v2:pg

echo "Cloud SQL Preview structural/CAS/RLS verification passed."
