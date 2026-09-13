#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
REGION="europe-west4"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
ORQALY_DATABASE="orqaly_v2_preview_001"
AXWISE_DATABASE="axwise_v2_preview_001"
ORQALY_CHECKSUM="05bc70f8c263bad766d2bbb251936d14a079678a5923870d13263305d139c75b"
ORQALY_ASSISTANT_CHECKSUM="2bfac3fb1d342db03f55f157fb7f8be46e46fd7bb966c63e9f8d937640df38f5"
ORQALY_PERSONAL_SESSION_CHECKSUM="95063a8aff45de731b6dbe472d7a413eab03a85a45df51947533968d05483d5a"
ORQALY_ASSISTANT_RETRY_CHECKSUM="753186fd0c43a0b41b6318582ba680dc150a213aa8b54e4d5a25fbd30c517823"
ORQALY_ASSISTANT_EVENTS_CHECKSUM="6e2abfd9b07cc8360d485e0120e3be80fa8bc319940b3e16f08140a88179e6ee"
ORQALY_ASSISTANT_TURN_PROVENANCE_CHECKSUM="1e64db4857083e85576b4b32bf6376f9e05fc482d88b1abb465eededbab3968e"
ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM="4ca1289eb45f75c877a3f6b2afaf3b0af0f8286fbc7a041e93643381d9aeccd5"
ORQALY_AGENTIC_EXECUTION_CHECKSUM="a7423976f5e2345d467071bae263998ff682d26b37318bd6661ef1afa05fc142"
AXWISE_CHECKSUM="ae8881b1e734e2fcd059895611d94b2127772131083c55299cf9c6be7657c7c8"
ORQALY_MIGRATION_PATH="database/workflow-v2/migrations/001_clean_workflow_v2.sql"
ORQALY_ASSISTANT_MIGRATION_PATH="database/workflow-v2/migrations/002_assistant_goal.sql"
ORQALY_PERSONAL_SESSION_MIGRATION_PATH="database/workflow-v2/migrations/003_personal_tenant_jit.sql"
ORQALY_ASSISTANT_RETRY_MIGRATION_PATH="database/workflow-v2/migrations/004_assistant_retry_lineage.sql"
ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH="database/workflow-v2/migrations/005_assistant_turn_events.sql"
ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH="database/workflow-v2/migrations/006_assistant_turn_provenance.sql"
ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH="database/workflow-v2/migrations/007_assistant_grounded_sources_reason.sql"
ORQALY_AGENTIC_EXECUTION_MIGRATION_PATH="database/workflow-v2/migrations/008_agentic_execution_preview.sql"
ORQALY_CATALOG_FINGERPRINT_PATH="infra/gcp/workflow-v2/catalog-fingerprint.sql"
ORQALY_CATALOG_FINGERPRINT_FILE_CHECKSUM="e8881812f4d176adf2a3e1c251b71ab218c8f37e74fc558223bceef0d09c4454"
ORQALY_FULL_CATALOG_FINGERPRINT="a020d093fa84aae59ba84b000686a1147776eb343effff9074c1b4a1a39ea363"
ORQALY_BINDINGS_PATH="infra/gcp/workflow-v2/preview-role-bindings.sql"
ORQALY_BINDINGS_CHECKSUM="9802c04a2de4547efce39bd15b6b611c4460e971b344c551ad7e7c588d9408f5"
ORQALY_AGENTIC_BINDINGS_PATH="infra/gcp/workflow-v2/agentic-preview-role-bindings.sql"
ORQALY_AGENTIC_BINDINGS_CHECKSUM="6b58aa0352a3e1677b70e8e687263d52b981d90a48ae93afe7bb6fceb31e4167"
AXWISE_MIGRATION_PATH="backend/database/workflow_v2/001_cognitive_operations.sql"
AXWISE_BINDINGS_PATH="deploy/workflow-v2/preview-role-bindings.sql"
AXWISE_BINDINGS_CHECKSUM="2b885c6089b0b3c45030fc2e88e950cb582ecd617d2af293066041f277f0f48b"
ADMIN_DB_SECRET_VERSION="${ADMIN_DB_SECRET_VERSION:?required}"
ORQALY_IDENTITY_PASSWORD_SECRET_VERSION="${ORQALY_IDENTITY_PASSWORD_SECRET_VERSION:?required}"
ORQALY_API_PASSWORD_SECRET_VERSION="${ORQALY_API_PASSWORD_SECRET_VERSION:?required}"
ORQALY_WORKER_PASSWORD_SECRET_VERSION="${ORQALY_WORKER_PASSWORD_SECRET_VERSION:?required}"
GATEWAY_DB_PASSWORD_SECRET_VERSION="${GATEWAY_DB_PASSWORD_SECRET_VERSION:?required}"
AXWISE_API_PASSWORD_SECRET_VERSION="${AXWISE_API_PASSWORD_SECRET_VERSION:?required}"
AXWISE_WORKER_PASSWORD_SECRET_VERSION="${AXWISE_WORKER_PASSWORD_SECRET_VERSION:?required}"
AXWISE_COMMIT="${AXWISE_COMMIT:?exact tested AxWise commit is required}"
REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
ORQALY_COMMIT="$(git -C "${REPOSITORY_ROOT}" rev-parse --verify HEAD)"
ORQALY_CATALOG_FINGERPRINT="${REPOSITORY_ROOT}/${ORQALY_CATALOG_FINGERPRINT_PATH}"
actual_catalog_fingerprint_file_checksum="$(shasum -a 256 "${ORQALY_CATALOG_FINGERPRINT}" | awk '{print $1}')"
if test "${actual_catalog_fingerprint_file_checksum}" != "${ORQALY_CATALOG_FINGERPRINT_FILE_CHECKSUM}"; then
  echo "Catalog-fingerprint verifier differs from the committed release." >&2
  exit 65
fi

for value in "${ADMIN_DB_SECRET_VERSION}" \
  "${ORQALY_IDENTITY_PASSWORD_SECRET_VERSION}" \
  "${ORQALY_API_PASSWORD_SECRET_VERSION}" \
  "${ORQALY_WORKER_PASSWORD_SECRET_VERSION}" \
  "${GATEWAY_DB_PASSWORD_SECRET_VERSION}" \
  "${AXWISE_API_PASSWORD_SECRET_VERSION}" \
  "${AXWISE_WORKER_PASSWORD_SECRET_VERSION}"; do
  [[ "${value}" =~ ^[1-9][0-9]*$ ]] || {
    echo "All database credential versions must be positive numeric values." >&2
    exit 64
  }
done
[[ "${AXWISE_COMMIT}" =~ ^[a-f0-9]{40}$ ]] || {
  echo "AXWISE_COMMIT must be an exact 40-character commit." >&2
  exit 64
}
[[ "${ORQALY_COMMIT}" =~ ^[a-f0-9]{40}$ ]] || {
  echo "Could not resolve the exact Orqaly commit." >&2
  exit 64
}

admin_password="$(gcloud secrets versions access "${ADMIN_DB_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-admin-password --project="${PROJECT_ID}")"
orqaly_identity_password="$(gcloud secrets versions access \
  "${ORQALY_IDENTITY_PASSWORD_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-identity-password --project="${PROJECT_ID}")"
orqaly_api_password="$(gcloud secrets versions access "${ORQALY_API_PASSWORD_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-api-password --project="${PROJECT_ID}")"
orqaly_worker_password="$(gcloud secrets versions access \
  "${ORQALY_WORKER_PASSWORD_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-worker-password --project="${PROJECT_ID}")"
gateway_password="$(gcloud secrets versions access \
  "${GATEWAY_DB_PASSWORD_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-gateway-password --project="${PROJECT_ID}")"
axwise_api_password="$(gcloud secrets versions access "${AXWISE_API_PASSWORD_SECRET_VERSION}" \
  --secret=axwise-v2-preview-001-db-api-password --project="${PROJECT_ID}")"
axwise_worker_password="$(gcloud secrets versions access \
  "${AXWISE_WORKER_PASSWORD_SECRET_VERSION}" \
  --secret=axwise-v2-preview-001-db-worker-password --project="${PROJECT_ID}")"

proxy_path="$(command -v cloud-sql-proxy)"
proxy_port="19473"
proxy_log="$(mktemp -t workflow-v2-preview-boundary.XXXXXX)"
staged_catalog_fingerprint="$(mktemp -t workflow-v2-preview-catalog-fingerprint.XXXXXX)"
cp "${ORQALY_CATALOG_FINGERPRINT}" "${staged_catalog_fingerprint}"
staged_catalog_fingerprint_sha="$(shasum -a 256 "${staged_catalog_fingerprint}" | awk '{print $1}')"
if test "${staged_catalog_fingerprint_sha}" != "${ORQALY_CATALOG_FINGERPRINT_FILE_CHECKSUM}"; then
  echo "Staged catalog-fingerprint verifier bytes changed." >&2
  exit 65
fi
"${proxy_path}" "${PROJECT_ID}:${REGION}:${SQL_INSTANCE}" --gcloud-auth \
  --address=127.0.0.1 --port="${proxy_port}" >"${proxy_log}" 2>&1 &
proxy_pid="$!"
cleanup() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f "${proxy_log}" "${staged_catalog_fingerprint}"
  unset admin_password orqaly_identity_password orqaly_api_password
  unset orqaly_worker_password axwise_api_password axwise_worker_password
  unset gateway_password
}
trap cleanup EXIT

for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  pg_isready --host=127.0.0.1 --port="${proxy_port}" >/dev/null 2>&1 && break
  sleep 1
done
if ! pg_isready --host=127.0.0.1 --port="${proxy_port}" >/dev/null 2>&1; then
  sed -n '1,120p' "${proxy_log}" >&2
  exit 1
fi

orqaly_marker="$(PGPASSWORD="${admin_password}" psql --host=127.0.0.1 \
  --port="${proxy_port}" --username=postgres --dbname="${ORQALY_DATABASE}" \
  --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT migration_path || ':' || sha256 || ':' || bindings_path || ':' || bindings_sha256 || ':' || source_commit FROM workflow_v2_release.applied_baseline WHERE component = 'orqaly' AND migration_number = 1")"
expected_orqaly_marker="${ORQALY_MIGRATION_PATH}:${ORQALY_CHECKSUM}:${ORQALY_BINDINGS_PATH}:${ORQALY_BINDINGS_CHECKSUM}:${ORQALY_COMMIT}"
test "${orqaly_marker}" = "${expected_orqaly_marker}" || {
  echo "Orqaly applied-baseline marker differs from the committed release." >&2
  exit 77
}
orqaly_additives="$(PGPASSWORD="${admin_password}" psql --host=127.0.0.1 \
  --port="${proxy_port}" --username=postgres --dbname="${ORQALY_DATABASE}" \
  --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT string_agg(migration_number::text || ':' || migration_path || ':' || sha256 || ':' || source_commit, ',' ORDER BY migration_number) FROM workflow_v2_release.applied_additive_migrations WHERE component = 'orqaly'")"
expected_orqaly_additives="2:${ORQALY_ASSISTANT_MIGRATION_PATH}:${ORQALY_ASSISTANT_CHECKSUM}:${ORQALY_COMMIT},3:${ORQALY_PERSONAL_SESSION_MIGRATION_PATH}:${ORQALY_PERSONAL_SESSION_CHECKSUM}:${ORQALY_COMMIT},4:${ORQALY_ASSISTANT_RETRY_MIGRATION_PATH}:${ORQALY_ASSISTANT_RETRY_CHECKSUM}:${ORQALY_COMMIT},5:${ORQALY_ASSISTANT_EVENTS_MIGRATION_PATH}:${ORQALY_ASSISTANT_EVENTS_CHECKSUM}:${ORQALY_COMMIT},6:${ORQALY_ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}:${ORQALY_ASSISTANT_TURN_PROVENANCE_CHECKSUM}:${ORQALY_COMMIT},7:${ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}:${ORQALY_ASSISTANT_GROUNDED_SOURCES_REASON_CHECKSUM}:${ORQALY_COMMIT},8:${ORQALY_AGENTIC_EXECUTION_MIGRATION_PATH}:${ORQALY_AGENTIC_EXECUTION_CHECKSUM}:${ORQALY_COMMIT}"
test "${orqaly_additives}" = "${expected_orqaly_additives}" || {
  echo "Orqaly additive migration ledger differs from the committed release." >&2
  exit 77
}
orqaly_catalog_fingerprint="$(PGPASSWORD="${admin_password}" psql --host=127.0.0.1 \
  --port="${proxy_port}" --username=postgres --dbname="${ORQALY_DATABASE}" \
  --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --file="${staged_catalog_fingerprint}")"
test "${orqaly_catalog_fingerprint}" = "${ORQALY_FULL_CATALOG_FINGERPRINT}" || {
  echo "Orqaly live catalog differs from the exact committed release." >&2
  exit 77
}
orqaly_agentic_binding="$(PGPASSWORD="${admin_password}" psql --host=127.0.0.1 \
  --port="${proxy_port}" --username=postgres --dbname="${ORQALY_DATABASE}" \
  --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT migration_number::text || ':' || bindings_path || ':' || bindings_sha256 || ':' || source_commit FROM workflow_v2_release.applied_additive_bindings WHERE component = 'orqaly' AND migration_number = 8")"
expected_orqaly_agentic_binding="8:${ORQALY_AGENTIC_BINDINGS_PATH}:${ORQALY_AGENTIC_BINDINGS_CHECKSUM}:${ORQALY_COMMIT}"
test "${orqaly_agentic_binding}" = "${expected_orqaly_agentic_binding}" || {
  echo "Orqaly Agentic role-binding marker differs from the committed release." >&2
  exit 77
}

axwise_marker="$(PGPASSWORD="${admin_password}" psql --host=127.0.0.1 \
  --port="${proxy_port}" --username=postgres --dbname="${AXWISE_DATABASE}" \
  --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT migration_path || ':' || sha256 || ':' || bindings_path || ':' || bindings_sha256 || ':' || source_commit FROM workflow_v2_release.applied_baseline WHERE component = 'axwise' AND migration_number = 1")"
test "${axwise_marker}" = "${AXWISE_MIGRATION_PATH}:${AXWISE_CHECKSUM}:${AXWISE_BINDINGS_PATH}:${AXWISE_BINDINGS_CHECKSUM}:${AXWISE_COMMIT}" || {
  echo "AxWise applied-baseline marker differs from the tested release." >&2
  exit 77
}

assert_connects() {
  local login="$1" password="$2" database="$3"
  PGPASSWORD="${password}" psql --host=127.0.0.1 --port="${proxy_port}" \
    --username="${login}" --dbname="${database}" --no-password \
    --tuples-only --command='SELECT 1' >/dev/null
}

assert_cannot_connect() {
  local login="$1" password="$2" database="$3"
  if PGPASSWORD="${password}" psql --host=127.0.0.1 --port="${proxy_port}" \
    --username="${login}" --dbname="${database}" --no-password \
    --command='SELECT 1' >/dev/null 2>&1; then
    echo "${login} unexpectedly connected to ${database}." >&2
    exit 77
  fi
}

assert_connects orqaly_v2_001_identity_login "${orqaly_identity_password}" "${ORQALY_DATABASE}"
assert_connects orqaly_v2_001_api_login "${orqaly_api_password}" "${ORQALY_DATABASE}"
assert_connects orqaly_v2_001_worker_login "${orqaly_worker_password}" "${ORQALY_DATABASE}"
assert_connects orqaly_v2_001_gateway_login "${gateway_password}" "${ORQALY_DATABASE}"
assert_connects axwise_v2_001_api_login "${axwise_api_password}" "${AXWISE_DATABASE}"
assert_connects axwise_v2_001_worker_login "${axwise_worker_password}" "${AXWISE_DATABASE}"

assert_cannot_connect orqaly_v2_001_identity_login "${orqaly_identity_password}" "${AXWISE_DATABASE}"
assert_cannot_connect orqaly_v2_001_api_login "${orqaly_api_password}" "${AXWISE_DATABASE}"
assert_cannot_connect orqaly_v2_001_worker_login "${orqaly_worker_password}" "${AXWISE_DATABASE}"
assert_cannot_connect orqaly_v2_001_gateway_login "${gateway_password}" "${AXWISE_DATABASE}"
assert_cannot_connect axwise_v2_001_api_login "${axwise_api_password}" "${ORQALY_DATABASE}"
assert_cannot_connect axwise_v2_001_worker_login "${axwise_worker_password}" "${ORQALY_DATABASE}"

gateway_timeout="$(PGPASSWORD="${gateway_password}" psql --host=127.0.0.1 \
  --port="${proxy_port}" --username=orqaly_v2_001_gateway_login \
  --dbname="${ORQALY_DATABASE}" --no-password --tuples-only --no-align \
  --set=ON_ERROR_STOP=1 --command='SHOW statement_timeout')"
test "${gateway_timeout}" = 15s || {
  echo "Gateway database login does not retain the exact 15-second timeout." >&2
  exit 77
}
PGPASSWORD="${gateway_password}" psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=orqaly_v2_001_gateway_login --dbname="${ORQALY_DATABASE}" \
  --no-password --set=ON_ERROR_STOP=1 \
  --command='SELECT 1 FROM orqaly.agentic_operational_records LIMIT 0; SELECT 1 FROM orqaly.agentic_gateway_effects LIMIT 0' \
  >/dev/null
if PGPASSWORD="${gateway_password}" psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=orqaly_v2_001_gateway_login --dbname="${ORQALY_DATABASE}" \
  --no-password --set=ON_ERROR_STOP=1 \
  --command='SELECT 1 FROM orqaly.tenants LIMIT 0' >/dev/null 2>&1; then
  echo "Gateway database login unexpectedly reads tenant-control data." >&2
  exit 77
fi

echo "Preview 001 applied checksums and cross-database CONNECT denial verified."
