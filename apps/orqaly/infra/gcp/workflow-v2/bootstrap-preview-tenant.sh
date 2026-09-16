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
BOOTSTRAP_PATH="infra/gcp/workflow-v2/bootstrap-preview-tenant.sql"
EXPECTED_MIGRATION_CHECKSUM="05bc70f8c263bad766d2bbb251936d14a079678a5923870d13263305d139c75b"
EXPECTED_ASSISTANT_MIGRATION_CHECKSUM="2bfac3fb1d342db03f55f157fb7f8be46e46fd7bb966c63e9f8d937640df38f5"
EXPECTED_PERSONAL_SESSION_MIGRATION_CHECKSUM="95063a8aff45de731b6dbe472d7a413eab03a85a45df51947533968d05483d5a"
EXPECTED_ASSISTANT_RETRY_MIGRATION_CHECKSUM="753186fd0c43a0b41b6318582ba680dc150a213aa8b54e4d5a25fbd30c517823"
EXPECTED_ASSISTANT_EVENTS_MIGRATION_CHECKSUM="6e2abfd9b07cc8360d485e0120e3be80fa8bc319940b3e16f08140a88179e6ee"
EXPECTED_ASSISTANT_TURN_PROVENANCE_MIGRATION_CHECKSUM="1e64db4857083e85576b4b32bf6376f9e05fc482d88b1abb465eededbab3968e"
EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_CHECKSUM="4ca1289eb45f75c877a3f6b2afaf3b0af0f8286fbc7a041e93643381d9aeccd5"
EXPECTED_AGENTIC_EXECUTION_MIGRATION_CHECKSUM="a7423976f5e2345d467071bae263998ff682d26b37318bd6661ef1afa05fc142"
EXPECTED_BINDINGS_CHECKSUM="9802c04a2de4547efce39bd15b6b611c4460e971b344c551ad7e7c588d9408f5"
EXPECTED_AGENTIC_BINDINGS_CHECKSUM="6b58aa0352a3e1677b70e8e687263d52b981d90a48ae93afe7bb6fceb31e4167"
EXPECTED_ADDITIVE_MARKER_CHECKSUM="57343afff7af3378eb89fd14a80d3f79a12ae001bbe47fcc70feaaef219de9fc"
EXPECTED_CATALOG_FINGERPRINT_FILE_CHECKSUM="e8881812f4d176adf2a3e1c251b71ab218c8f37e74fc558223bceef0d09c4454"
EXPECTED_FULL_CATALOG_FINGERPRINT="a020d093fa84aae59ba84b000686a1147776eb343effff9074c1b4a1a39ea363"
EXPECTED_BOOTSTRAP_CHECKSUM="dcc6b504f7d61dcda21b154c5ca9504d4876d35eb6cfb57e2147c5b475a82c31"
CLERK_USER_ID="${CLERK_USER_ID:?CLERK_USER_ID is required}"
TENANT_DISPLAY_NAME="${TENANT_DISPLAY_NAME:-Orqaly v2 Preview}"
ADMIN_DB_SECRET_VERSION="${ADMIN_DB_SECRET_VERSION:?numeric Preview 001 admin-password version is required}"
REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)"
WORKTREE_ROOT="$(git -C "${REPOSITORY_ROOT}" rev-parse --show-toplevel)"
BOOTSTRAP_SQL="${REPOSITORY_ROOT}/${BOOTSTRAP_PATH}"
CATALOG_FINGERPRINT="${REPOSITORY_ROOT}/${CATALOG_FINGERPRINT_PATH}"

if test -n "$(git -C "${WORKTREE_ROOT}" status --porcelain=v1 --untracked-files=all)"; then
  echo "Refusing bootstrap from a dirty Orqaly repository." >&2
  exit 65
fi
source_commit="$(git -C "${REPOSITORY_ROOT}" rev-parse --verify HEAD)"
[[ "${source_commit}" =~ ^[a-f0-9]{40}$ ]] || {
  echo "Could not resolve the exact Orqaly HEAD." >&2
  exit 65
}

assert_exact_head_file() {
  local path="$1" expected="$2" worktree_sha head_sha
  git -C "${REPOSITORY_ROOT}" ls-files --error-unmatch "${path}" >/dev/null
  worktree_sha="$(shasum -a 256 "${REPOSITORY_ROOT}/${path}" | awk '{print $1}')"
  head_sha="$(git -C "${REPOSITORY_ROOT}" show "HEAD:./${path}" | shasum -a 256 | awk '{print $1}')"
  if test "${worktree_sha}" != "${expected}" || test "${head_sha}" != "${expected}"; then
    echo "Refusing bootstrap: ${path} is not the expected tracked HEAD bytes." >&2
    exit 65
  fi
}

assert_exact_head_file "${MIGRATION_PATH}" "${EXPECTED_MIGRATION_CHECKSUM}"
assert_exact_head_file "${ASSISTANT_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_MIGRATION_CHECKSUM}"
assert_exact_head_file "${PERSONAL_SESSION_MIGRATION_PATH}" "${EXPECTED_PERSONAL_SESSION_MIGRATION_CHECKSUM}"
assert_exact_head_file "${ASSISTANT_RETRY_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_RETRY_MIGRATION_CHECKSUM}"
assert_exact_head_file "${ASSISTANT_EVENTS_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_EVENTS_MIGRATION_CHECKSUM}"
assert_exact_head_file "${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_TURN_PROVENANCE_MIGRATION_CHECKSUM}"
assert_exact_head_file "${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}" "${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_CHECKSUM}"
assert_exact_head_file "${AGENTIC_EXECUTION_MIGRATION_PATH}" "${EXPECTED_AGENTIC_EXECUTION_MIGRATION_CHECKSUM}"
assert_exact_head_file "${BINDINGS_PATH}" "${EXPECTED_BINDINGS_CHECKSUM}"
assert_exact_head_file "${AGENTIC_BINDINGS_PATH}" "${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}"
assert_exact_head_file "${ADDITIVE_MARKER_PATH}" "${EXPECTED_ADDITIVE_MARKER_CHECKSUM}"
assert_exact_head_file "${CATALOG_FINGERPRINT_PATH}" "${EXPECTED_CATALOG_FINGERPRINT_FILE_CHECKSUM}"
assert_exact_head_file "${BOOTSTRAP_PATH}" "${EXPECTED_BOOTSTRAP_CHECKSUM}"

if [[ ! "${CLERK_USER_ID}" =~ ^user_[A-Za-z0-9]+$ ]]; then
  echo "Refusing invalid Clerk user id." >&2
  exit 1
fi
if [[ ! "${ADMIN_DB_SECRET_VERSION}" =~ ^[1-9][0-9]*$ ]]; then
  echo "ADMIN_DB_SECRET_VERSION must be a positive numeric version." >&2
  exit 64
fi

deterministic_uuid() {
  local namespace="$1"
  local digest
  digest="$(printf '%s' "${namespace}:${CLERK_USER_ID}" | shasum -a 256 | awk '{print $1}')"
  printf '%s-%s-5%s-8%s-%s' \
    "${digest:0:8}" "${digest:8:4}" "${digest:13:3}" "${digest:17:3}" "${digest:20:12}"
}

tenant_id="$(deterministic_uuid orqaly-v2-preview-tenant)"
agent_id="$(deterministic_uuid orqaly-v2-preview-agent)"

export PGPASSWORD
PGPASSWORD="$(gcloud secrets versions access "${ADMIN_DB_SECRET_VERSION}" \
  --secret=orqaly-v2-preview-001-db-admin-password \
  --project="${PROJECT_ID}")"

proxy_path="$(command -v cloud-sql-proxy)"
proxy_port="19472"
proxy_log="$(mktemp -t orqaly-v2-preview-bootstrap.XXXXXX)"
staged_bootstrap="$(mktemp -t orqaly-v2-preview-bootstrap-sql.XXXXXX)"
staged_catalog_fingerprint="$(mktemp -t orqaly-v2-preview-catalog-fingerprint.XXXXXX)"
cp "${BOOTSTRAP_SQL}" "${staged_bootstrap}"
staged_bootstrap_sha="$(shasum -a 256 "${staged_bootstrap}" | awk '{print $1}')"
if test "${staged_bootstrap_sha}" != "${EXPECTED_BOOTSTRAP_CHECKSUM}"; then
  echo "Refusing bootstrap: staged SQL bytes changed." >&2
  exit 65
fi
cp "${CATALOG_FINGERPRINT}" "${staged_catalog_fingerprint}"
staged_catalog_fingerprint_sha="$(shasum -a 256 "${staged_catalog_fingerprint}" | awk '{print $1}')"
if test "${staged_catalog_fingerprint_sha}" != "${EXPECTED_CATALOG_FINGERPRINT_FILE_CHECKSUM}"; then
  echo "Refusing bootstrap: staged catalog-fingerprint verifier bytes changed." >&2
  exit 65
fi
"${proxy_path}" "${PROJECT_ID}:europe-west4:${SQL_INSTANCE}" \
  --gcloud-auth --address=127.0.0.1 --port="${proxy_port}" >"${proxy_log}" 2>&1 &
proxy_pid="$!"
cleanup() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f "${proxy_log}" "${staged_bootstrap}" "${staged_catalog_fingerprint}"
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

applied_marker="$(psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" --no-password \
  --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT migration_path || ':' || sha256 || ':' || bindings_path || ':' || bindings_sha256 || ':' || source_commit FROM workflow_v2_release.applied_baseline WHERE component = 'orqaly' AND migration_number = 1")"
expected_marker="${MIGRATION_PATH}:${EXPECTED_MIGRATION_CHECKSUM}:${BINDINGS_PATH}:${EXPECTED_BINDINGS_CHECKSUM}:${source_commit}"
if test "${applied_marker}" != "${expected_marker}"; then
  echo "Refusing bootstrap: applied Preview baseline marker differs from exact HEAD." >&2
  exit 77
fi
applied_additives="$(psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" --no-password \
  --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT string_agg(migration_number::text || ':' || migration_path || ':' || sha256 || ':' || source_commit, ',' ORDER BY migration_number) FROM workflow_v2_release.applied_additive_migrations WHERE component = 'orqaly'")"
expected_additives="2:${ASSISTANT_MIGRATION_PATH}:${EXPECTED_ASSISTANT_MIGRATION_CHECKSUM}:${source_commit},3:${PERSONAL_SESSION_MIGRATION_PATH}:${EXPECTED_PERSONAL_SESSION_MIGRATION_CHECKSUM}:${source_commit},4:${ASSISTANT_RETRY_MIGRATION_PATH}:${EXPECTED_ASSISTANT_RETRY_MIGRATION_CHECKSUM}:${source_commit},5:${ASSISTANT_EVENTS_MIGRATION_PATH}:${EXPECTED_ASSISTANT_EVENTS_MIGRATION_CHECKSUM}:${source_commit},6:${ASSISTANT_TURN_PROVENANCE_MIGRATION_PATH}:${EXPECTED_ASSISTANT_TURN_PROVENANCE_MIGRATION_CHECKSUM}:${source_commit},7:${ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_PATH}:${EXPECTED_ASSISTANT_GROUNDED_SOURCES_REASON_MIGRATION_CHECKSUM}:${source_commit},8:${AGENTIC_EXECUTION_MIGRATION_PATH}:${EXPECTED_AGENTIC_EXECUTION_MIGRATION_CHECKSUM}:${source_commit}"
if test "${applied_additives}" != "${expected_additives}"; then
  echo "Refusing bootstrap: applied additive migrations differ from exact HEAD." >&2
  exit 77
fi
applied_agentic_binding="$(psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" --no-password \
  --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT migration_number::text || ':' || bindings_path || ':' || bindings_sha256 || ':' || source_commit FROM workflow_v2_release.applied_additive_bindings WHERE component = 'orqaly' AND migration_number = 8")"
expected_agentic_binding="8:${AGENTIC_BINDINGS_PATH}:${EXPECTED_AGENTIC_BINDINGS_CHECKSUM}:${source_commit}"
if test "${applied_agentic_binding}" != "${expected_agentic_binding}"; then
  echo "Refusing bootstrap: Agentic role-binding marker differs from exact HEAD." >&2
  exit 77
fi
session_foundation_ready="$(psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" --no-password \
  --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command="SELECT (to_regprocedure('orqaly.ensure_personal_tenant(text,text)') IS NOT NULL AND to_regprocedure('orqaly.resolve_tenant_identity(text,text,text)') IS NOT NULL)::text")"
if test "${session_foundation_ready}" != true; then
  echo "Refusing bootstrap: personal-session database foundation is not ready." >&2
  exit 77
fi
observed_catalog_fingerprint="$(psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" --no-password \
  --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --file="${staged_catalog_fingerprint}")"
if test "${observed_catalog_fingerprint}" != "${EXPECTED_FULL_CATALOG_FINGERPRINT}"; then
  echo "Refusing bootstrap: live catalog differs from the exact full release." >&2
  exit 77
fi

psql --host=127.0.0.1 --port="${proxy_port}" \
  --username=postgres --dbname="${DATABASE_NAME}" \
  --no-password --set=ON_ERROR_STOP=1 \
  --set=tenant_id="${tenant_id}" \
  --set=tenant_display_name="${TENANT_DISPLAY_NAME}" \
  --set=clerk_user_id="${CLERK_USER_ID}" \
  --set=agent_id="${agent_id}" \
  --file="${staged_bootstrap}" >/dev/null

echo "Preview personal tenant binding and agent catalogue are ready."
