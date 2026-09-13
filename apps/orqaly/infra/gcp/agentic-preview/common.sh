#!/usr/bin/env bash

# Shared, hard-pinned Preview constants. This file deliberately has no
# Production overrides and contains no secret values.
PROJECT_ID="axwise-v2-preview-001"
PROJECT_NUMBER="161074549006"
REGION="europe-west4"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
SQL_CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
VPC_NETWORK="workflow-v2-preview"
VPC_SUBNET="workflow-v2-preview-ew4"
ARTIFACT_REPOSITORY="workflow-v2-preview"
BUILD_SOURCE_BUCKET="${PROJECT_ID}_cloudbuild"
BUILD_SERVICE_ACCOUNT="projects/${PROJECT_ID}/serviceAccounts/workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com"

CONTROL_PLANE_SERVICE="orqaly-agentic-control-preview"
N8N_SERVICE="orqaly-agentic-n8n-preview"
CONTROL_PLANE_MIGRATION_JOB="orqaly-agentic-migrate-preview"
N8N_BOOTSTRAP_JOB="orqaly-n8n-bootstrap-preview"
ORQALY_API_SERVICE="orqaly-v2-api-preview"

CONTROL_PLANE_ACCOUNT="orqaly-agentic-preview"
CONTROL_PLANE_MIGRATION_ACCOUNT="orqaly-agentic-migrate-prev"
N8N_ACCOUNT="orqaly-n8n-preview"
N8N_BOOTSTRAP_ACCOUNT="orqaly-n8n-bootstrap-prev"
ORQALY_API_ACCOUNT="orqaly-v2-api-preview"
CONTROL_PLANE_SERVICE_ACCOUNT="${CONTROL_PLANE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT="${CONTROL_PLANE_MIGRATION_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
N8N_SERVICE_ACCOUNT="${N8N_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
N8N_BOOTSTRAP_SERVICE_ACCOUNT="${N8N_BOOTSTRAP_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
ORQALY_API_SERVICE_ACCOUNT="${ORQALY_API_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"

CONTROL_PLANE_DATABASE="orqaly_agentic_preview_001"
N8N_DATABASE="orqaly_n8n_preview_001"
CONTROL_PLANE_DATABASE_USER="orqaly_agentic_preview_001_runtime"
CONTROL_PLANE_MIGRATION_USER="orqaly_agentic_preview_001_migrator"
N8N_DATABASE_USER="orqaly_n8n_preview_001_login"

CONTROL_PLANE_DATABASE_PASSWORD_SECRET="orqaly-agentic-preview-db-password"
CONTROL_PLANE_DATABASE_URL_SECRET="orqaly-agentic-preview-db-url"
CONTROL_PLANE_MIGRATION_PASSWORD_SECRET="orqaly-agentic-preview-migrator-password"
CONTROL_PLANE_MIGRATION_URL_SECRET="orqaly-agentic-preview-migrator-url"
PRINCIPAL_SIGNING_KEY_SECRET="orqaly-agentic-preview-principal-key"
N8N_DATABASE_PASSWORD_SECRET="orqaly-n8n-preview-db-password"
N8N_ENCRYPTION_KEY_SECRET="orqaly-n8n-preview-encryption-key"
N8N_API_KEY_SECRET="orqaly-n8n-preview-api-key"
ADMIN_DATABASE_PASSWORD_SECRET="orqaly-v2-preview-001-db-admin-password"

CONTROL_PLANE_ORIGIN="https://${CONTROL_PLANE_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
N8N_ORIGIN="https://${N8N_SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"
PRINCIPAL_AUDIENCE="orqaly-agentic-control-plane"

readonly PROJECT_ID PROJECT_NUMBER REGION SQL_INSTANCE SQL_CONNECTION_NAME
readonly VPC_NETWORK VPC_SUBNET ARTIFACT_REPOSITORY BUILD_SOURCE_BUCKET
readonly BUILD_SERVICE_ACCOUNT CONTROL_PLANE_SERVICE N8N_SERVICE
readonly CONTROL_PLANE_MIGRATION_JOB N8N_BOOTSTRAP_JOB ORQALY_API_SERVICE
readonly CONTROL_PLANE_ACCOUNT
readonly CONTROL_PLANE_MIGRATION_ACCOUNT N8N_ACCOUNT N8N_BOOTSTRAP_ACCOUNT
readonly ORQALY_API_ACCOUNT CONTROL_PLANE_SERVICE_ACCOUNT
readonly CONTROL_PLANE_MIGRATION_SERVICE_ACCOUNT N8N_SERVICE_ACCOUNT
readonly N8N_BOOTSTRAP_SERVICE_ACCOUNT ORQALY_API_SERVICE_ACCOUNT CONTROL_PLANE_DATABASE
readonly N8N_DATABASE CONTROL_PLANE_DATABASE_USER CONTROL_PLANE_MIGRATION_USER
readonly N8N_DATABASE_USER
readonly CONTROL_PLANE_DATABASE_PASSWORD_SECRET CONTROL_PLANE_DATABASE_URL_SECRET
readonly CONTROL_PLANE_MIGRATION_PASSWORD_SECRET CONTROL_PLANE_MIGRATION_URL_SECRET
readonly PRINCIPAL_SIGNING_KEY_SECRET N8N_DATABASE_PASSWORD_SECRET
readonly N8N_ENCRYPTION_KEY_SECRET N8N_API_KEY_SECRET ADMIN_DATABASE_PASSWORD_SECRET
readonly CONTROL_PLANE_ORIGIN N8N_ORIGIN PRINCIPAL_AUDIENCE

agentic_preview_require_tools() {
  local tool
  for tool in "$@"; do
    command -v "${tool}" >/dev/null || {
      echo "${tool} is required." >&2
      return 69
    }
  done
}

agentic_preview_require_numeric_secret_version() {
  local secret_name="$1" version="$2" state
  if [[ ! "${version}" =~ ^[1-9][0-9]*$ ]]; then
    echo "${secret_name} requires an explicit positive numeric version." >&2
    return 64
  fi
  state="$(gcloud secrets versions describe "${version}" \
    --secret="${secret_name}" --project="${PROJECT_ID}" --format='value(state)')"
  if test "${state}" != "ENABLED"; then
    echo "Secret ${secret_name} version ${version} is not enabled." >&2
    return 78
  fi
}

agentic_preview_assert_foundation() {
  local project_number connection_name network subnet repository api_account
  project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
  test "${project_number}" = "${PROJECT_NUMBER}" || {
    echo "Refusing a project-number mismatch for ${PROJECT_ID}." >&2
    return 77
  }

  connection_name="$(gcloud sql instances describe "${SQL_INSTANCE}" \
    --project="${PROJECT_ID}" --format='value(connectionName)')"
  test "${connection_name}" = "${SQL_CONNECTION_NAME}" || {
    echo "The expected Preview Cloud SQL instance was not found in ${REGION}." >&2
    return 77
  }

  network="$(gcloud compute networks describe "${VPC_NETWORK}" \
    --project="${PROJECT_ID}" --format='value(name)')"
  subnet="$(gcloud compute networks subnets describe "${VPC_SUBNET}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format='value(name)')"
  repository="$(gcloud artifacts repositories describe "${ARTIFACT_REPOSITORY}" \
    --project="${PROJECT_ID}" --location="${REGION}" --format='value(name)')"
  api_account="$(gcloud iam service-accounts describe "${ORQALY_API_SERVICE_ACCOUNT}" \
    --project="${PROJECT_ID}" --format='value(email)')"
  test "${network}" = "${VPC_NETWORK}" \
    && test "${subnet}" = "${VPC_SUBNET}" \
    && test -n "${repository}" \
    && test "${api_account}" = "${ORQALY_API_SERVICE_ACCOUNT}" || {
      echo "The existing Preview VPC, subnet, repository or Orqaly API identity is missing." >&2
      return 77
    }
}

agentic_preview_require_digest() {
  local label="$1" image="$2" package="$3"
  local expected_prefix="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${package}@sha256:"
  local digest="${image#"${expected_prefix}"}"
  if test "${image}" != "${expected_prefix}${digest}" \
    || [[ ! "${digest}" =~ ^[a-f0-9]{64}$ ]]; then
    echo "${label} must be an exact ${expected_prefix}<64-hex> image digest." >&2
    return 64
  fi
}

agentic_preview_assert_no_public_invoker() {
  local service="$1" policy
  policy="$(gcloud run services get-iam-policy "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
  if jq -e '
    [.bindings[]? | select(.role == "roles/run.invoker") | .members[]?]
    | any(. == "allUsers" or . == "allAuthenticatedUsers")
  ' <<<"${policy}" >/dev/null; then
    echo "${service} has a public invoker binding; remove it explicitly before continuing." >&2
    return 77
  fi
}

agentic_preview_assert_service_origin_document() {
  local document="$1" expected_origin="$2"
  jq -e --arg expected "${expected_origin}" '
    (.metadata.annotations["run.googleapis.com/urls"] | fromjson) as $urls
    | ($urls | index($expected)) != null
      and (.status.url as $status_url | ($urls | index($status_url)) != null)
  ' <<<"${document}" >/dev/null
}
