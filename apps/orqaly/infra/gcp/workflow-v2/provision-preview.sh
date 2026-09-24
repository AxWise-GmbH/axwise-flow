#!/usr/bin/env bash
set -euo pipefail
set +x

# Fail closed: this Preview-only script cannot be redirected to Production or
# to either diagnostic database through ambient shell variables.
PROJECT_ID="axwise-v2-preview-001"
REGION="europe-west4"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
ARTIFACT_REPOSITORY="workflow-v2-preview"
ARTIFACT_BUCKET="${PROJECT_ID}-orqaly-v2-preview-001-artifacts"
BUILD_SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"
ORQALY_DATABASE="orqaly_v2_preview_001"
AXWISE_DATABASE="axwise_v2_preview_001"
VPC_NETWORK="workflow-v2-preview"
VPC_SUBNET="workflow-v2-preview-ew4"
VPC_ROUTER="workflow-v2-preview-ew4"
VPC_NAT="workflow-v2-preview-ew4"
BUILD_ACCOUNT="workflow-v2-preview-build"
REGION_UPPER="$(printf '%s' "${REGION}" | tr '[:lower:]' '[:upper:]')"

readonly PROJECT_ID REGION SQL_INSTANCE CONNECTION_NAME ARTIFACT_REPOSITORY
readonly ARTIFACT_BUCKET BUILD_SOURCE_BUCKET ORQALY_DATABASE AXWISE_DATABASE VPC_NETWORK VPC_SUBNET
readonly VPC_ROUTER VPC_NAT BUILD_ACCOUNT
readonly REGION_UPPER

for tool in cloud-sql-proxy gcloud jq openssl pg_isready psql; do
  command -v "${tool}" >/dev/null || { echo "${tool} is required." >&2; exit 69; }
done

ensure_service_account() {
  local account_id="$1"
  if ! gcloud iam service-accounts describe \
    "${account_id}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${account_id}" \
      --project="${PROJECT_ID}" --display-name="$2" >/dev/null
  fi
}

ensure_secret() {
  if ! gcloud secrets describe "$1" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud secrets create "$1" --project="${PROJECT_ID}" \
      --replication-policy=automatic >/dev/null
  fi
}

latest_enabled_secret_version() {
  gcloud secrets versions list "$1" --project="${PROJECT_ID}" --format=json \
    | jq -r '[.[] | select(.state == "ENABLED")] as $enabled
      | if ($enabled | length) == 0 then ""
        else ($enabled | sort_by(.createTime) | last | .name | split("/") | last)
        end'
}

add_secret_version() {
  local secret_name="$1" secret_value="$2" output_variable="$3"
  local before_version current_version attempt document created_version
  [[ "${output_variable}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || return 64
  before_version="$(latest_enabled_secret_version "${secret_name}")"
  before_version="${before_version:-0}"
  for attempt in 1 2 3 4 5 6; do
    if document="$(printf '%s' "${secret_value}" | gcloud secrets versions add \
      "${secret_name}" --project="${PROJECT_ID}" --data-file=- --format=json)"; then
      created_version="$(jq -r '.name | split("/") | last' <<<"${document}")"
      if [[ "${created_version}" =~ ^[1-9][0-9]*$ ]]; then
        printf -v "${output_variable}" '%s' "${created_version}"
        return
      fi
    fi
    # A lost successful response must adopt the single new enabled version,
    # never submit a duplicate value on the next retry.
    current_version="$(latest_enabled_secret_version "${secret_name}")"
    if [[ "${current_version}" =~ ^[1-9][0-9]*$ ]] \
      && test "${current_version}" -eq "$((before_version + 1))"; then
      printf -v "${output_variable}" '%s' "${current_version}"
      return
    fi
    sleep 2
  done
  echo "Could not create a numeric enabled version for ${secret_name}." >&2
  return 1
}

ensure_generated_secret() {
  local secret_name="$1" version generated_value
  ensure_secret "${secret_name}"
  version="$(latest_enabled_secret_version "${secret_name}")"
  if test -z "${version}"; then
    generated_value="$(openssl rand -hex "$2")"
    add_secret_version "${secret_name}" "${generated_value}" version
    unset generated_value
  fi
  [[ "${version}" =~ ^[1-9][0-9]*$ ]] || {
    echo "Secret ${secret_name} has no enabled numeric version." >&2
    exit 78
  }
  printf '%s' "${version}"
}

secret_value() {
  gcloud secrets versions access "$2" --secret="$1" --project="${PROJECT_ID}"
}

ensure_sql_login() {
  local username="$1" secret_name="$2" secret_version="$3" password_value
  [[ "${username}" =~ ^(orqaly_v2_001_(identity|api|worker)_login|axwise_v2_001_(api|worker)_login)$ ]] || {
    echo "Refusing unexpected Preview application login ${username}." >&2
    exit 64
  }
  password_value="$(secret_value "${secret_name}" "${secret_version}")"
  [[ "${password_value}" =~ ^[a-f0-9]{48}$ ]] || {
    echo "Refusing non-generated password bytes for ${username}." >&2
    exit 78
  }
  # Cloud SQL's Users API grants cloudsqlsuperuser (including CREATEDB and
  # CREATEROLE) to every PostgreSQL user it creates. Application logins must
  # therefore be ordinary PostgreSQL roles created through the connector.
  # The generated password is sent only over psql stdin and never appears in
  # argv, logs or shell tracing.
  printf '%s\n' \
    'BEGIN;' \
    "DO \$login\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${username}') THEN CREATE ROLE ${username} LOGIN PASSWORD '${password_value}' NOCREATEDB NOCREATEROLE NOINHERIT; ELSE ALTER ROLE ${username} WITH LOGIN PASSWORD '${password_value}' NOCREATEDB NOCREATEROLE NOINHERIT; END IF; END \$login\$;" \
    "REVOKE cloudsqlsuperuser FROM ${username};" \
    "DO \$verify\$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${username}' AND (NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolbypassrls)) OR pg_has_role('${username}', 'cloudsqlsuperuser', 'MEMBER') THEN RAISE EXCEPTION 'Preview application login is privileged'; END IF; END \$verify\$;" \
    'COMMIT;' \
    | psql --host=127.0.0.1 --port="${sql_proxy_port}" --username=postgres \
      --dbname=postgres --no-password --set=ON_ERROR_STOP=1 --file=- >/dev/null
  unset password_value
}

# Reuses an enabled version only when its complete value is exactly the URL for
# this dedicated instance/database/login. A stale diagnostic URL gets a new
# version and is never selected implicitly by deployment.
ensure_database_url_secret() {
  local secret_name="$1" username="$2" password_secret="$3"
  local password_version="$4" database_name="$5"
  local password_value expected_url version current_url=""
  ensure_secret "${secret_name}"
  password_value="$(secret_value "${password_secret}" "${password_version}")"
  expected_url="postgresql://${username}:${password_value}@/${database_name}?host=/cloudsql/${CONNECTION_NAME}"
  version="$(latest_enabled_secret_version "${secret_name}")"
  if test -n "${version}"; then
    current_url="$(secret_value "${secret_name}" "${version}")"
  fi
  if test "${current_url}" != "${expected_url}"; then
    add_secret_version "${secret_name}" "${expected_url}" version
  fi
  unset current_url expected_url password_value
  [[ "${version}" =~ ^[1-9][0-9]*$ ]] || {
    echo "Database URL secret ${secret_name} has no exact numeric version." >&2
    exit 78
  }
  printf '%s' "${version}"
}

grant_secret_access() {
  gcloud secrets add-iam-policy-binding "$1" --project="${PROJECT_ID}" \
    --member="serviceAccount:$2@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
}

grant_project_role() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:$1@${PROJECT_ID}.iam.gserviceaccount.com" \
      --role="$2" --condition=None --quiet >/dev/null 2>&1; then
      return
    fi
    sleep 5
  done
  echo "IAM binding failed after retries for $1/$2." >&2
  return 1
}

remove_project_role_if_present() {
  gcloud projects remove-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:$1@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="$2" --all --quiet >/dev/null 2>&1 || true
}

assert_secret_service_accounts() {
  local secret_name="$1" expected actual
  shift
  expected="$(printf '%s\n' "$@" | sed '/^$/d' | sort -u)"
  actual="$(gcloud secrets get-iam-policy "${secret_name}" \
    --project="${PROJECT_ID}" --format=json | jq -r \
    '.bindings[]? | select(.role == "roles/secretmanager.secretAccessor") | .members[]? | select(startswith("serviceAccount:")) | sub("^serviceAccount:"; "")' | sort -u)"
  if test "${actual}" != "${expected}"; then
    echo "Secret ${secret_name} has unexpected service-account accessors." >&2
    exit 77
  fi
}

assert_effective_boolean_policy() {
  local constraint="$1" document
  document="$(gcloud resource-manager org-policies describe "${constraint}" \
    --project="${PROJECT_ID}" --effective --format=json)"
  if ! jq -e '
    (.spec.rules // []) as $rules
    | (($rules | length) == 1
       and $rules[0].enforce == true
       and (($rules[0].condition // null) == null))
      or (.booleanPolicy.enforced == true)
  ' <<<"${document}" >/dev/null; then
    echo "Effective organization policy ${constraint} must be unconditionally enforced." >&2
    exit 77
  fi
}

echo "Provisioning isolated workflow-v2 Preview 001 resources."

gcloud services enable artifactregistry.googleapis.com cloudasset.googleapis.com cloudbuild.googleapis.com \
  compute.googleapis.com iamcredentials.googleapis.com run.googleapis.com \
  secretmanager.googleapis.com sqladmin.googleapis.com --project="${PROJECT_ID}" >/dev/null

for constraint in \
  constraints/compute.skipDefaultNetworkCreation \
  constraints/iam.automaticIamGrantsForDefaultServiceAccounts \
  constraints/iam.disableServiceAccountKeyCreation \
  constraints/iam.disableServiceAccountKeyUpload; do
  assert_effective_boolean_policy "${constraint}"
done

# Compute API activation must not leave a permissive auto-created VPC behind.
# Refuse every network except this architecture's dedicated custom-mode VPC.
network_names="$(gcloud compute networks list --project="${PROJECT_ID}" \
  --format='value(name)' | sort -u)"
if test -n "${network_names}" && test "${network_names}" != "${VPC_NETWORK}"; then
  echo "Preview contains a network outside ${VPC_NETWORK}; refusing provisioning." >&2
  echo "For an auto-created default VPC, inspect dependencies and delete it explicitly with: gcloud compute networks delete default --project=${PROJECT_ID}" >&2
  exit 77
fi

if ! gcloud compute networks describe "${VPC_NETWORK}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute networks create "${VPC_NETWORK}" --project="${PROJECT_ID}" \
    --subnet-mode=custom >/dev/null
fi
if ! gcloud compute networks subnets describe "${VPC_SUBNET}" \
  --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  gcloud compute networks subnets create "${VPC_SUBNET}" --project="${PROJECT_ID}" \
    --region="${REGION}" --network="${VPC_NETWORK}" --range=10.42.0.0/24 \
    --enable-private-ip-google-access >/dev/null
fi
if ! gcloud compute routers describe "${VPC_ROUTER}" \
  --project="${PROJECT_ID}" --region="${REGION}" >/dev/null 2>&1; then
  gcloud compute routers create "${VPC_ROUTER}" --project="${PROJECT_ID}" \
    --region="${REGION}" --network="${VPC_NETWORK}" >/dev/null
fi
if ! gcloud compute routers nats describe "${VPC_NAT}" --project="${PROJECT_ID}" \
  --region="${REGION}" --router="${VPC_ROUTER}" >/dev/null 2>&1; then
  gcloud compute routers nats create "${VPC_NAT}" --project="${PROJECT_ID}" \
    --region="${REGION}" --router="${VPC_ROUTER}" \
    --nat-custom-subnet-ip-ranges="${VPC_SUBNET}" \
    --auto-allocate-nat-external-ips --enable-logging >/dev/null
fi
network_json="$(gcloud compute networks describe "${VPC_NETWORK}" \
  --project="${PROJECT_ID}" --format=json)"
subnet_json="$(gcloud compute networks subnets describe "${VPC_SUBNET}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
router_json="$(gcloud compute routers describe "${VPC_ROUTER}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
nat_json="$(gcloud compute routers nats describe "${VPC_NAT}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --router="${VPC_ROUTER}" --format=json)"
network_names="$(gcloud compute networks list --project="${PROJECT_ID}" \
  --format='value(name)' | sort -u)"
if test "${network_names}" != "${VPC_NETWORK}" \
  || ! jq -e '.autoCreateSubnetworks == false' <<<"${network_json}" >/dev/null \
  || ! jq -e --arg region "${REGION}" --arg network "${VPC_NETWORK}" '
    .region | endswith("/regions/" + $region)
  ' <<<"${subnet_json}" >/dev/null \
  || ! jq -e --arg network "${VPC_NETWORK}" '
    .network | endswith("/networks/" + $network)
  ' <<<"${subnet_json}" >/dev/null \
  || ! jq -e '
    .ipCidrRange == "10.42.0.0/24" and .privateIpGoogleAccess == true
  ' <<<"${subnet_json}" >/dev/null \
  || ! jq -e --arg network "${VPC_NETWORK}" '
    .network | endswith("/networks/" + $network)
  ' <<<"${router_json}" >/dev/null \
  || ! jq -e --arg subnet "${VPC_SUBNET}" '
    .natIpAllocateOption == "AUTO_ONLY"
    and .sourceSubnetworkIpRangesToNat == "LIST_OF_SUBNETWORKS"
    and .logConfig.enable == true
    and ([.subnetworks[]?
      | select(.name | endswith("/subnetworks/" + $subnet))
      | select(.sourceIpRangesToNat == ["PRIMARY_IP_RANGE"])] | length) == 1
  ' <<<"${nat_json}" >/dev/null; then
  echo "Preview VPC, subnet, router or Cloud NAT differs from the release boundary." >&2
  exit 77
fi

if ! gcloud artifacts repositories describe "${ARTIFACT_REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${ARTIFACT_REPOSITORY}" \
    --location="${REGION}" --project="${PROJECT_ID}" --repository-format=docker \
    --immutable-tags --description="Immutable workflow-v2 Preview images" >/dev/null
else
  gcloud artifacts repositories update "${ARTIFACT_REPOSITORY}" \
    --location="${REGION}" --project="${PROJECT_ID}" --immutable-tags >/dev/null
fi
repository_json="$(gcloud artifacts repositories describe "${ARTIFACT_REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" --format=json)"
if ! jq -e '.format == "DOCKER" and .dockerConfig.immutableTags == true' \
  <<<"${repository_json}" >/dev/null; then
  echo "Artifact Registry must be Docker format with immutable tags." >&2
  exit 77
fi

if ! gcloud storage buckets describe "gs://${ARTIFACT_BUCKET}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${ARTIFACT_BUCKET}" --project="${PROJECT_ID}" \
    --location="${REGION}" --uniform-bucket-level-access \
    --public-access-prevention >/dev/null
else
  gcloud storage buckets update "gs://${ARTIFACT_BUCKET}" --project="${PROJECT_ID}" \
    --uniform-bucket-level-access --public-access-prevention >/dev/null
fi
bucket_json="$(gcloud storage buckets describe "gs://${ARTIFACT_BUCKET}" \
  --project="${PROJECT_ID}" --format=json)"
if ! jq -e --arg location "${REGION_UPPER}" '
  .location == $location
  and ((.uniform_bucket_level_access // .iamConfiguration.uniformBucketLevelAccess.enabled // false) == true)
  and ((.public_access_prevention // .iamConfiguration.publicAccessPrevention // "") == "enforced")
' <<<"${bucket_json}" >/dev/null; then
  echo "Artifact bucket location, UBLA or public-access prevention is incorrect." >&2
  exit 77
fi

if ! gcloud storage buckets describe "gs://${BUILD_SOURCE_BUCKET}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUILD_SOURCE_BUCKET}" --project="${PROJECT_ID}" \
    --location="${REGION}" --uniform-bucket-level-access \
    --public-access-prevention >/dev/null
else
  gcloud storage buckets update "gs://${BUILD_SOURCE_BUCKET}" --project="${PROJECT_ID}" \
    --uniform-bucket-level-access --public-access-prevention >/dev/null
fi
build_source_bucket_json="$(gcloud storage buckets describe "gs://${BUILD_SOURCE_BUCKET}" \
  --project="${PROJECT_ID}" --format=json)"
if ! jq -e '
  (.uniform_bucket_level_access // .iamConfiguration.uniformBucketLevelAccess.enabled // false) == true
  and ((.public_access_prevention // .iamConfiguration.publicAccessPrevention // "") == "enforced")
' <<<"${build_source_bucket_json}" >/dev/null; then
  echo "Cloud Build source bucket access controls are incorrect." >&2
  exit 77
fi

for account in orqaly-v2-api-preview orqaly-v2-worker-preview \
  axwise-v2-api-preview axwise-v2-worker-preview; do
  ensure_service_account "${account}" "${account}"
  grant_project_role "${account}" roles/cloudsql.client
done
ensure_service_account orqaly-v2-web-preview orqaly-v2-web-preview
ensure_service_account "${BUILD_ACCOUNT}" "Workflow v2 Preview immutable image builder"
# The custom builder needs only its exact repository, build-secret and log
# permissions. The broad default Cloud Build service-account role would grant
# project-wide artifact/storage powers and is explicitly removed from this
# dedicated identity.
remove_project_role_if_present "${BUILD_ACCOUNT}" roles/cloudbuild.builds.builder
grant_project_role "${BUILD_ACCOUNT}" roles/logging.logWriter
project_number="$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')"
[[ "${project_number}" =~ ^[1-9][0-9]*$ ]] || {
  echo "Could not resolve the Preview project number." >&2
  exit 77
}
gcloud iam service-accounts add-iam-policy-binding \
  "${BUILD_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:service-${project_number}@gcp-sa-cloudbuild.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator --quiet >/dev/null
gcloud artifacts repositories add-iam-policy-binding "${ARTIFACT_REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" \
  --member="serviceAccount:${BUILD_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/artifactregistry.writer --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${BUILD_SOURCE_BUCKET}" \
  --member="serviceAccount:${BUILD_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/storage.objectViewer --quiet >/dev/null
for role in roles/storage.objectCreator roles/storage.objectViewer; do
  gcloud storage buckets add-iam-policy-binding "gs://${ARTIFACT_BUCKET}" \
    --member="serviceAccount:orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="${role}" --quiet >/dev/null
done

if ! gcloud sql instances describe "${SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  # The installed stable track cannot set Cloud SQL labels at create time;
  # beta exposes the same Admin API field and lets the first persisted instance
  # state include the release-boundary labels.
  gcloud beta sql instances create "${SQL_INSTANCE}" --project="${PROJECT_ID}" \
    --region="${REGION}" --database-version=POSTGRES_16 --edition=enterprise \
    --tier=db-custom-1-3840 --availability-type=zonal --storage-type=SSD \
    --storage-size=20 --storage-auto-increase --backup-start-time=02:00 \
    --retained-backups-count=7 --enable-point-in-time-recovery --deletion-protection \
    --connector-enforcement=REQUIRED \
    --labels=environment=preview,architecture=workflow-v2,baseline=001 >/dev/null
fi
instance_json="$(gcloud sql instances describe "${SQL_INSTANCE}" \
  --project="${PROJECT_ID}" --format=json)"
if ! jq -e '
  .settings.connectorEnforcement == "REQUIRED"
  and ((.settings.ipConfiguration.authorizedNetworks // []) | length) == 0
' <<<"${instance_json}" >/dev/null; then
  gcloud sql instances patch "${SQL_INSTANCE}" --project="${PROJECT_ID}" \
    --connector-enforcement=REQUIRED --clear-authorized-networks --quiet >/dev/null
  instance_json="$(gcloud sql instances describe "${SQL_INSTANCE}" \
    --project="${PROJECT_ID}" --format=json)"
fi
if ! jq -e --arg region "${REGION}" '
  .region == $region
  and .databaseVersion == "POSTGRES_16"
  and .settings.edition == "ENTERPRISE"
  and .settings.tier == "db-custom-1-3840"
  and .settings.availabilityType == "ZONAL"
  and .settings.dataDiskType == "PD_SSD"
  and (.settings.dataDiskSizeGb | tostring) == "20"
  and .settings.storageAutoResize == true
  and .settings.backupConfiguration.enabled == true
  and .settings.backupConfiguration.startTime == "02:00"
  and .settings.backupConfiguration.pointInTimeRecoveryEnabled == true
  and .settings.backupConfiguration.backupRetentionSettings.retentionUnit == "COUNT"
  and .settings.backupConfiguration.backupRetentionSettings.retainedBackups == 7
  and .settings.deletionProtectionEnabled == true
  and .settings.connectorEnforcement == "REQUIRED"
  and ((.settings.ipConfiguration.authorizedNetworks // []) | length) == 0
  and .settings.userLabels.environment == "preview"
  and .settings.userLabels.architecture == "workflow-v2"
  and .settings.userLabels.baseline == "001"
' <<<"${instance_json}" >/dev/null; then
  echo "Cloud SQL Preview 001 instance configuration or labels differ from the baseline." >&2
  exit 77
fi
for database_name in "${ORQALY_DATABASE}" "${AXWISE_DATABASE}"; do
  if ! gcloud sql databases describe "${database_name}" --instance="${SQL_INSTANCE}" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud sql databases create "${database_name}" --instance="${SQL_INSTANCE}" \
      --project="${PROJECT_ID}" --charset=UTF8 >/dev/null
  fi
done

admin_password_version="$(ensure_generated_secret orqaly-v2-preview-001-db-admin-password 24)"
identity_password_version="$(ensure_generated_secret orqaly-v2-preview-001-db-identity-password 24)"
api_password_version="$(ensure_generated_secret orqaly-v2-preview-001-db-api-password 24)"
worker_password_version="$(ensure_generated_secret orqaly-v2-preview-001-db-worker-password 24)"
axwise_api_password_version="$(ensure_generated_secret axwise-v2-preview-001-db-api-password 24)"
axwise_worker_password_version="$(ensure_generated_secret axwise-v2-preview-001-db-worker-password 24)"
axwise_seal_version="$(ensure_generated_secret axwise-v2-preview-001-authority-seal 48)"

postgres_password="$(secret_value orqaly-v2-preview-001-db-admin-password "${admin_password_version}")"
gcloud sql users set-password postgres --instance="${SQL_INSTANCE}" \
  --project="${PROJECT_ID}" --password="${postgres_password}" >/dev/null
export PGPASSWORD="${postgres_password}"
unset postgres_password

sql_proxy_port="19469"
sql_proxy_log="$(mktemp -t workflow-v2-preview-provision.XXXXXX)"
cloud-sql-proxy "${CONNECTION_NAME}" --gcloud-auth --address=127.0.0.1 \
  --port="${sql_proxy_port}" >"${sql_proxy_log}" 2>&1 &
sql_proxy_pid="$!"
cleanup_sql_proxy() {
  if test -n "${sql_proxy_pid:-}"; then
    kill "${sql_proxy_pid}" >/dev/null 2>&1 || true
    wait "${sql_proxy_pid}" >/dev/null 2>&1 || true
    sql_proxy_pid=""
  fi
  rm -f "${sql_proxy_log}"
  unset PGPASSWORD
}
trap cleanup_sql_proxy EXIT
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  pg_isready --host=127.0.0.1 --port="${sql_proxy_port}" >/dev/null 2>&1 && break
  sleep 1
done
if ! pg_isready --host=127.0.0.1 --port="${sql_proxy_port}" >/dev/null 2>&1; then
  sed -n '1,120p' "${sql_proxy_log}" >&2
  exit 1
fi

ensure_sql_login orqaly_v2_001_identity_login orqaly-v2-preview-001-db-identity-password "${identity_password_version}"
ensure_sql_login orqaly_v2_001_api_login orqaly-v2-preview-001-db-api-password "${api_password_version}"
ensure_sql_login orqaly_v2_001_worker_login orqaly-v2-preview-001-db-worker-password "${worker_password_version}"
ensure_sql_login axwise_v2_001_api_login axwise-v2-preview-001-db-api-password "${axwise_api_password_version}"
ensure_sql_login axwise_v2_001_worker_login axwise-v2-preview-001-db-worker-password "${axwise_worker_password_version}"

cleanup_sql_proxy
trap - EXIT

identity_db_version="$(ensure_database_url_secret orqaly-v2-preview-001-db-identity-url \
  orqaly_v2_001_identity_login orqaly-v2-preview-001-db-identity-password \
  "${identity_password_version}" "${ORQALY_DATABASE}")"
api_db_version="$(ensure_database_url_secret orqaly-v2-preview-001-db-api-url \
  orqaly_v2_001_api_login orqaly-v2-preview-001-db-api-password \
  "${api_password_version}" "${ORQALY_DATABASE}")"
worker_db_version="$(ensure_database_url_secret orqaly-v2-preview-001-db-worker-url \
  orqaly_v2_001_worker_login orqaly-v2-preview-001-db-worker-password \
  "${worker_password_version}" "${ORQALY_DATABASE}")"
axwise_api_db_version="$(ensure_database_url_secret axwise-v2-preview-001-db-api-url \
  axwise_v2_001_api_login axwise-v2-preview-001-db-api-password \
  "${axwise_api_password_version}" "${AXWISE_DATABASE}")"
axwise_worker_db_version="$(ensure_database_url_secret axwise-v2-preview-001-db-worker-url \
  axwise_v2_001_worker_login axwise-v2-preview-001-db-worker-password \
  "${axwise_worker_password_version}" "${AXWISE_DATABASE}")"

for secret_name in orqaly-v2-preview-001-clerk-secret-key \
  orqaly-v2-preview-001-clerk-publishable-key axwise-v2-preview-001-gemini-api-key \
  axwise-v2-preview-001-typesafe-api-key; do
  ensure_secret "${secret_name}"
done

grant_secret_access orqaly-v2-preview-001-db-identity-url orqaly-v2-api-preview
grant_secret_access orqaly-v2-preview-001-db-api-url orqaly-v2-api-preview
grant_secret_access orqaly-v2-preview-001-clerk-secret-key orqaly-v2-api-preview
grant_secret_access orqaly-v2-preview-001-clerk-publishable-key orqaly-v2-api-preview
grant_secret_access axwise-v2-preview-001-typesafe-api-key orqaly-v2-api-preview
grant_secret_access orqaly-v2-preview-001-db-worker-url orqaly-v2-worker-preview
grant_secret_access axwise-v2-preview-001-db-api-url axwise-v2-api-preview
grant_secret_access axwise-v2-preview-001-db-worker-url axwise-v2-worker-preview
grant_secret_access axwise-v2-preview-001-authority-seal axwise-v2-worker-preview
grant_secret_access axwise-v2-preview-001-gemini-api-key axwise-v2-worker-preview
grant_secret_access axwise-v2-preview-001-typesafe-api-key axwise-v2-worker-preview
grant_secret_access axwise-v2-preview-001-gemini-api-key orqaly-v2-api-preview
grant_secret_access orqaly-v2-preview-001-clerk-publishable-key "${BUILD_ACCOUNT}"

assert_secret_service_accounts orqaly-v2-preview-001-db-identity-url "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts orqaly-v2-preview-001-db-api-url "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts orqaly-v2-preview-001-db-worker-url "orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts axwise-v2-preview-001-db-api-url "axwise-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts axwise-v2-preview-001-db-worker-url "axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts axwise-v2-preview-001-authority-seal "axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts axwise-v2-preview-001-gemini-api-key \
  "axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts orqaly-v2-preview-001-clerk-secret-key "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts axwise-v2-preview-001-typesafe-api-key \
  "axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_secret_service_accounts orqaly-v2-preview-001-clerk-publishable-key \
  "${BUILD_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
  "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Preview 001 baseline is provisioned. Add external Clerk/Gemini/TypeSafe values before build/deploy."
echo "ADMIN_DB_SECRET_VERSION=${admin_password_version}"
echo "ORQALY_IDENTITY_PASSWORD_SECRET_VERSION=${identity_password_version}"
echo "ORQALY_API_PASSWORD_SECRET_VERSION=${api_password_version}"
echo "ORQALY_WORKER_PASSWORD_SECRET_VERSION=${worker_password_version}"
echo "AXWISE_API_PASSWORD_SECRET_VERSION=${axwise_api_password_version}"
echo "AXWISE_WORKER_PASSWORD_SECRET_VERSION=${axwise_worker_password_version}"
echo "ORQALY_IDENTITY_DB_SECRET_VERSION=${identity_db_version}"
echo "ORQALY_API_DB_SECRET_VERSION=${api_db_version}"
echo "ORQALY_WORKER_DB_SECRET_VERSION=${worker_db_version}"
echo "AXWISE_API_DB_SECRET_VERSION=${axwise_api_db_version}"
echo "AXWISE_WORKER_DB_SECRET_VERSION=${axwise_worker_db_version}"
echo "AXWISE_SEAL_SECRET_VERSION=${axwise_seal_version}"
