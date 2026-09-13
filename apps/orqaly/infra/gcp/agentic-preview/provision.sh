#!/usr/bin/env bash
set -euo pipefail
set +x

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${script_directory}/common.sh"

ADMIN_DB_SECRET_VERSION="${ADMIN_DB_SECRET_VERSION:?set the explicit numeric Preview database-admin secret version}"
readonly ADMIN_DB_SECRET_VERSION

agentic_preview_require_tools cloud-sql-proxy gcloud jq openssl pg_isready psql
agentic_preview_assert_foundation
agentic_preview_require_numeric_secret_version \
  "${ADMIN_DATABASE_PASSWORD_SECRET}" "${ADMIN_DB_SECRET_VERSION}"

ensure_service_account() {
  local account_id="$1" display_name="$2"
  if ! gcloud iam service-accounts describe \
    "${account_id}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${account_id}" \
      --project="${PROJECT_ID}" --display-name="${display_name}" >/dev/null
  fi
}

ensure_secret_container() {
  local secret_name="$1"
  if ! gcloud secrets describe "${secret_name}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "${secret_name}" --project="${PROJECT_ID}" \
      --replication-policy=automatic >/dev/null
  fi
}

latest_enabled_secret_version() {
  gcloud secrets versions list "$1" --project="${PROJECT_ID}" --format=json \
    | jq -r '[.[] | select(.state == "ENABLED")]
      | if length == 0 then ""
        else sort_by(.createTime) | last | .name | split("/") | last
        end'
}

add_secret_version() {
  local secret_name="$1" secret_value="$2" output_variable="$3"
  local document created_version
  [[ "${output_variable}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || return 64
  document="$(printf '%s' "${secret_value}" | gcloud secrets versions add \
    "${secret_name}" --project="${PROJECT_ID}" --data-file=- --format=json)"
  created_version="$(jq -r '.name | split("/") | last' <<<"${document}")"
  [[ "${created_version}" =~ ^[1-9][0-9]*$ ]] || {
    echo "Secret Manager did not return a numeric version for ${secret_name}." >&2
    return 1
  }
  printf -v "${output_variable}" '%s' "${created_version}"
}

ensure_generated_secret() {
  local secret_name="$1" byte_count="$2" output_variable="$3"
  local version generated_value
  ensure_secret_container "${secret_name}"
  version="$(latest_enabled_secret_version "${secret_name}")"
  if test -z "${version}"; then
    generated_value="$(openssl rand -hex "${byte_count}")"
    add_secret_version "${secret_name}" "${generated_value}" version
    unset generated_value
  fi
  [[ "${version}" =~ ^[1-9][0-9]*$ ]] || {
    echo "Secret ${secret_name} has no enabled numeric version." >&2
    return 78
  }
  printf -v "${output_variable}" '%s' "${version}"
}

secret_value() {
  gcloud secrets versions access "$2" --secret="$1" --project="${PROJECT_ID}"
}

grant_project_role() {
  local service_account="$1" role="$2"
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${service_account}" --role="${role}" \
    --condition=None --quiet >/dev/null
}

grant_secret_access() {
  local secret_name="$1" service_account="$2"
  gcloud secrets add-iam-policy-binding "${secret_name}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${service_account}" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
}

ensure_service_account "${CONTROL_PLANE_ACCOUNT}" "Orqaly Agent control plane (Preview)"
ensure_service_account "${CONTROL_PLANE_MIGRATION_ACCOUNT}" "Orqaly Agent schema migrator (Preview)"
ensure_service_account "${N8N_ACCOUNT}" "Orqaly private n8n (Preview)"
ensure_service_account "${N8N_BOOTSTRAP_ACCOUNT}" "Orqaly private n8n bootstrap (Preview)"

ensure_generated_secret "${CONTROL_PLANE_DATABASE_PASSWORD_SECRET}" 24 control_plane_password_version
ensure_generated_secret "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET}" 24 control_plane_migration_password_version
ensure_generated_secret "${N8N_DATABASE_PASSWORD_SECRET}" 24 n8n_password_version
ensure_generated_secret "${PRINCIPAL_SIGNING_KEY_SECRET}" 32 principal_key_version
ensure_generated_secret "${N8N_ENCRYPTION_KEY_SECRET}" 32 n8n_encryption_key_version
# The management key must be created by n8n for an initialized owner. Only the
# empty container is prepared here; random bytes are not a valid n8n API key.
ensure_secret_container "${N8N_API_KEY_SECRET}"

export PGPASSWORD
PGPASSWORD="$(secret_value "${ADMIN_DATABASE_PASSWORD_SECRET}" "${ADMIN_DB_SECRET_VERSION}")"
control_plane_password="$(secret_value \
  "${CONTROL_PLANE_DATABASE_PASSWORD_SECRET}" "${control_plane_password_version}")"
control_plane_migration_password="$(secret_value \
  "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET}" \
  "${control_plane_migration_password_version}")"
n8n_password="$(secret_value "${N8N_DATABASE_PASSWORD_SECRET}" "${n8n_password_version}")"

[[ "${control_plane_password}" =~ ^[a-f0-9]{48}$ ]] \
  && [[ "${control_plane_migration_password}" =~ ^[a-f0-9]{48}$ ]] \
  && [[ "${n8n_password}" =~ ^[a-f0-9]{48}$ ]] || {
    echo "Refusing database credentials that were not generated by this Preview bootstrap." >&2
    exit 78
  }
if test "${control_plane_password}" = "${control_plane_migration_password}" \
  || test "${control_plane_password}" = "${n8n_password}" \
  || test "${control_plane_migration_password}" = "${n8n_password}"; then
  echo "Generated database credentials must be distinct." >&2
  exit 78
fi

proxy_port="19482"
proxy_log="$(mktemp -t orqaly-agentic-preview-proxy.XXXXXX)"
admin_owner_memberships_granted=false
cloud-sql-proxy "${SQL_CONNECTION_NAME}" --gcloud-auth \
  --address=127.0.0.1 --port="${proxy_port}" >"${proxy_log}" 2>&1 &
proxy_pid="$!"
cleanup() {
  if test "${admin_owner_memberships_granted}" = true; then
    printf 'REVOKE %s, %s FROM postgres;\n' \
      "${CONTROL_PLANE_MIGRATION_USER}" "${N8N_DATABASE_USER}" \
      | psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
        --dbname=postgres --no-password --set=ON_ERROR_STOP=1 --file=- >/dev/null 2>&1 || true
    admin_owner_memberships_granted=false
  fi
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f -- "${proxy_log}"
  unset PGPASSWORD control_plane_password control_plane_migration_password n8n_password
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

admin_psql=(psql --host=127.0.0.1 --port="${proxy_port}" --username=postgres \
  --dbname=postgres --no-password --set=ON_ERROR_STOP=1)

# Passwords are fixed-format hex and are sent through stdin, never argv or logs.
printf '%s\n' \
  'BEGIN;' \
  "DO \$role\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${CONTROL_PLANE_DATABASE_USER}') THEN CREATE ROLE ${CONTROL_PLANE_DATABASE_USER} LOGIN PASSWORD '${control_plane_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${CONTROL_PLANE_DATABASE_USER}' AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'Existing Agent runtime role is privileged'; ELSE ALTER ROLE ${CONTROL_PLANE_DATABASE_USER} WITH LOGIN PASSWORD '${control_plane_password}'; END IF; END \$role\$;" \
  "DO \$role\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${CONTROL_PLANE_MIGRATION_USER}') THEN CREATE ROLE ${CONTROL_PLANE_MIGRATION_USER} LOGIN PASSWORD '${control_plane_migration_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${CONTROL_PLANE_MIGRATION_USER}' AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'Existing Agent migration role is privileged'; ELSE ALTER ROLE ${CONTROL_PLANE_MIGRATION_USER} WITH LOGIN PASSWORD '${control_plane_migration_password}'; END IF; END \$role\$;" \
  "DO \$role\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${N8N_DATABASE_USER}') THEN CREATE ROLE ${N8N_DATABASE_USER} LOGIN PASSWORD '${n8n_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS; ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${N8N_DATABASE_USER}' AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'Existing n8n database role is privileged'; ELSE ALTER ROLE ${N8N_DATABASE_USER} WITH LOGIN PASSWORD '${n8n_password}'; END IF; END \$role\$;" \
  "DO \$verify\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('${CONTROL_PLANE_DATABASE_USER}', '${CONTROL_PLANE_MIGRATION_USER}', '${N8N_DATABASE_USER}') AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'Agentic Preview database role is privileged'; END IF; END \$verify\$;" \
  'COMMIT;' | "${admin_psql[@]}" --file=- >/dev/null

# Cloud SQL's managed postgres account is intentionally not a PostgreSQL superuser.
# PostgreSQL therefore requires SET-role membership before it can create a database
# owned by one of the narrow login roles. Refuse an unexpected standing membership,
# grant only the two owner roles for this short creation window, and always revoke
# them in both the success path and the EXIT trap.
existing_admin_owner_memberships="$("${admin_psql[@]}" --tuples-only --no-align --command="
  select coalesce(string_agg(owner_role.rolname, ',' order by owner_role.rolname), '')
    from pg_auth_members membership
    join pg_roles owner_role on owner_role.oid = membership.roleid
    join pg_roles member_role on member_role.oid = membership.member
   where member_role.rolname = 'postgres'
     and owner_role.rolname in (
       '${CONTROL_PLANE_MIGRATION_USER}',
       '${N8N_DATABASE_USER}'
     )
")"
if test -n "${existing_admin_owner_memberships}"; then
  echo "The Cloud SQL admin has an unexpected standing Agentic database-owner membership." >&2
  exit 77
fi
printf 'GRANT %s, %s TO postgres;\n' \
  "${CONTROL_PLANE_MIGRATION_USER}" "${N8N_DATABASE_USER}" \
  | "${admin_psql[@]}" --file=- >/dev/null
admin_owner_memberships_granted=true

ensure_database() {
  local database_name="$1" owner="$2" exists observed_owner
  exists="$("${admin_psql[@]}" --tuples-only --no-align \
    --command="select (count(*) = 1)::text from pg_database where datname = '${database_name}'")"
  if test "${exists}" = false; then
    printf 'CREATE DATABASE %s OWNER %s TEMPLATE template0 ENCODING '\''UTF8'\'';\n' \
      "${database_name}" "${owner}" | "${admin_psql[@]}" --file=- >/dev/null
  elif test "${exists}" != true; then
    echo "Could not resolve database ${database_name}." >&2
    return 77
  fi
  observed_owner="$("${admin_psql[@]}" --tuples-only --no-align \
    --command="select pg_get_userbyid(datdba) from pg_database where datname = '${database_name}'")"
  test "${observed_owner}" = "${owner}" || {
    echo "Existing database ${database_name} has unexpected owner ${observed_owner}." >&2
    return 77
  }
  printf 'SET ROLE %s;\nREVOKE ALL ON DATABASE %s FROM PUBLIC;\nGRANT CONNECT, TEMPORARY ON DATABASE %s TO %s;\nRESET ROLE;\n' \
    "${owner}" "${database_name}" "${database_name}" "${owner}" \
    | "${admin_psql[@]}" --file=- >/dev/null
}

ensure_database "${CONTROL_PLANE_DATABASE}" "${CONTROL_PLANE_MIGRATION_USER}"
ensure_database "${N8N_DATABASE}" "${N8N_DATABASE_USER}"

printf '%s\n' \
  "SET ROLE ${CONTROL_PLANE_MIGRATION_USER};" \
  "GRANT CONNECT ON DATABASE ${CONTROL_PLANE_DATABASE} TO ${CONTROL_PLANE_DATABASE_USER};" \
  "REVOKE TEMPORARY ON DATABASE ${CONTROL_PLANE_DATABASE} FROM ${CONTROL_PLANE_DATABASE_USER};" \
  'RESET ROLE;' \
  | "${admin_psql[@]}" --file=- >/dev/null

printf 'REVOKE %s, %s FROM postgres;\n' \
  "${CONTROL_PLANE_MIGRATION_USER}" "${N8N_DATABASE_USER}" \
  | "${admin_psql[@]}" --file=- >/dev/null
admin_owner_memberships_granted=false
unset existing_admin_owner_memberships

control_plane_database_url="postgresql://${CONTROL_PLANE_DATABASE_USER}:${control_plane_password}@/${CONTROL_PLANE_DATABASE}?host=/cloudsql/${SQL_CONNECTION_NAME}"
ensure_secret_container "${CONTROL_PLANE_DATABASE_URL_SECRET}"
control_plane_database_url_version="$(latest_enabled_secret_version \
  "${CONTROL_PLANE_DATABASE_URL_SECRET}")"
current_database_url=""
if test -n "${control_plane_database_url_version}"; then
  current_database_url="$(secret_value "${CONTROL_PLANE_DATABASE_URL_SECRET}" \
    "${control_plane_database_url_version}")"
fi
if test "${current_database_url}" != "${control_plane_database_url}"; then
  add_secret_version "${CONTROL_PLANE_DATABASE_URL_SECRET}" \
    "${control_plane_database_url}" control_plane_database_url_version
fi

control_plane_migration_url="postgresql://${CONTROL_PLANE_MIGRATION_USER}:${control_plane_migration_password}@/${CONTROL_PLANE_DATABASE}?host=/cloudsql/${SQL_CONNECTION_NAME}"
ensure_secret_container "${CONTROL_PLANE_MIGRATION_URL_SECRET}"
control_plane_migration_url_version="$(latest_enabled_secret_version \
  "${CONTROL_PLANE_MIGRATION_URL_SECRET}")"
current_migration_url=""
if test -n "${control_plane_migration_url_version}"; then
  current_migration_url="$(secret_value "${CONTROL_PLANE_MIGRATION_URL_SECRET}" \
    "${control_plane_migration_url_version}")"
fi
if test "${current_migration_url}" != "${control_plane_migration_url}"; then
  add_secret_version "${CONTROL_PLANE_MIGRATION_URL_SECRET}" \
    "${control_plane_migration_url}" control_plane_migration_url_version
fi
unset current_database_url current_migration_url control_plane_database_url
unset control_plane_migration_url control_plane_password control_plane_migration_password
unset n8n_password

grant_project_role "${CONTROL_PLANE_SERVICE_ACCOUNT}" roles/cloudsql.client
grant_project_role "${CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT}" roles/cloudsql.client
grant_project_role "${N8N_SERVICE_ACCOUNT}" roles/cloudsql.client
grant_secret_access "${CONTROL_PLANE_DATABASE_URL_SECRET}" "${CONTROL_PLANE_SERVICE_ACCOUNT}"
grant_secret_access "${CONTROL_PLANE_MIGRATION_URL_SECRET}" \
  "${CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT}"
grant_secret_access "${PRINCIPAL_SIGNING_KEY_SECRET}" "${CONTROL_PLANE_SERVICE_ACCOUNT}"
grant_secret_access "${PRINCIPAL_SIGNING_KEY_SECRET}" "${ORQALY_API_SERVICE_ACCOUNT}"
grant_secret_access "${N8N_DATABASE_PASSWORD_SECRET}" "${N8N_SERVICE_ACCOUNT}"
grant_secret_access "${N8N_ENCRYPTION_KEY_SECRET}" "${N8N_SERVICE_ACCOUNT}"
grant_secret_access "${N8N_API_KEY_SECRET}" "${N8N_BOOTSTRAP_SERVICE_ACCOUNT}"

assert_secret_accessors() {
  local secret_name="$1" expected="$2" actual
  actual="$(gcloud secrets get-iam-policy "${secret_name}" --project="${PROJECT_ID}" \
    --format=json | jq -r '
      .bindings[]? | select(.role == "roles/secretmanager.secretAccessor")
      | .members[]?
    ' | sort -u)"
  test "${actual}" = "${expected}" || {
    echo "Secret ${secret_name} has accessors outside its exact allowlist." >&2
    exit 77
  }
  gcloud secrets get-iam-policy "${secret_name}" --project="${PROJECT_ID}" \
    --format=json | jq -e '
      all(.bindings[]?;
        .role == "roles/secretmanager.secretAccessor" and .condition == null)
    ' >/dev/null || {
      echo "Secret ${secret_name} has a conditional or privileged resource binding." >&2
      exit 77
    }
}

project_policy="$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json)"
assert_project_roles() {
  local service_account="$1" expected="$2" actual
  actual="$(jq -r --arg member "serviceAccount:${service_account}" '
      .bindings[]? | select(any(.members[]?; . == $member))
      | if .condition == null then .role else (.role + "#conditional") end
    ' <<<"${project_policy}" | sort -u)"
  test "${actual}" = "${expected}" || {
    echo "${service_account} has project roles outside its exact allowlist." >&2
    exit 77
  }
}

assert_project_roles "${CONTROL_PLANE_SERVICE_ACCOUNT}" roles/cloudsql.client
assert_project_roles "${CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT}" roles/cloudsql.client
assert_project_roles "${N8N_SERVICE_ACCOUNT}" roles/cloudsql.client
assert_project_roles "${N8N_BOOTSTRAP_SERVICE_ACCOUNT}" ""
assert_secret_accessors "${CONTROL_PLANE_DATABASE_PASSWORD_SECRET}" ""
assert_secret_accessors "${CONTROL_PLANE_DATABASE_URL_SECRET}" \
  "serviceAccount:${CONTROL_PLANE_SERVICE_ACCOUNT}"
assert_secret_accessors "${CONTROL_PLANE_MIGRATION_PASSWORD_SECRET}" ""
assert_secret_accessors "${CONTROL_PLANE_MIGRATION_URL_SECRET}" \
  "serviceAccount:${CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT}"
assert_secret_accessors "${PRINCIPAL_SIGNING_KEY_SECRET}" \
  "$(printf '%s\n%s' "serviceAccount:${CONTROL_PLANE_SERVICE_ACCOUNT}" \
    "serviceAccount:${ORQALY_API_SERVICE_ACCOUNT}" | sort -u)"
assert_secret_accessors "${N8N_DATABASE_PASSWORD_SECRET}" \
  "serviceAccount:${N8N_SERVICE_ACCOUNT}"
assert_secret_accessors "${N8N_ENCRYPTION_KEY_SECRET}" \
  "serviceAccount:${N8N_SERVICE_ACCOUNT}"
assert_secret_accessors "${N8N_API_KEY_SECRET}" \
  "serviceAccount:${N8N_BOOTSTRAP_SERVICE_ACCOUNT}"

echo "Agentic Preview foundation is ready. No Supabase service was read or written."
echo "CONTROL_PLANE_DATABASE_PASSWORD_SECRET_VERSION=${control_plane_password_version}"
echo "CONTROL_PLANE_DATABASE_URL_SECRET_VERSION=${control_plane_database_url_version}"
echo "CONTROL_PLANE_MIGRATION_PASSWORD_SECRET_VERSION=${control_plane_migration_password_version}"
echo "CONTROL_PLANE_MIGRATION_URL_SECRET_VERSION=${control_plane_migration_url_version}"
echo "PRINCIPAL_SIGNING_KEY_SECRET_VERSION=${principal_key_version}"
echo "N8N_DATABASE_PASSWORD_SECRET_VERSION=${n8n_password_version}"
echo "N8N_ENCRYPTION_KEY_SECRET_VERSION=${n8n_encryption_key_version}"
echo "N8N_API_KEY_SECRET_VERSION=UNSET_UNTIL_N8N_OWNER_ONBOARDING"
