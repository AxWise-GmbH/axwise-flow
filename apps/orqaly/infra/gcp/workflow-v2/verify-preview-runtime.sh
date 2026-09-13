#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
REGION="europe-west4"
REGION_UPPER="$(printf '%s' "${REGION}" | tr '[:lower:]' '[:upper:]')"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
ARTIFACT_BUCKET="${PROJECT_ID}-orqaly-v2-preview-001-artifacts"
ARTIFACT_REPOSITORY="workflow-v2-preview"
CLERK_INSTANCE_ID="ins_2vHl8PVNUNRJVv23OVqAcYOkVRK"
AXWISE_SEARCH_SERVICE="axwise-v2-search-preview"
ORQALY_N8N_SERVICE="orqaly-agentic-n8n-preview"
ORQALY_SERVICE_IMAGE="${ORQALY_SERVICE_IMAGE:?exact Orqaly service digest is required}"
ORQALY_WEB_IMAGE="${ORQALY_WEB_IMAGE:?exact Orqaly web digest is required}"
AXWISE_SERVICE_IMAGE="${AXWISE_SERVICE_IMAGE:?exact AxWise service digest is required}"
ORQALY_API_ORIGIN="${ORQALY_API_ORIGIN:?exact Orqaly API origin is required}"
ORQALY_WEB_ORIGIN="${ORQALY_WEB_ORIGIN:?exact Orqaly web origin is required}"
AXWISE_API_ORIGIN="${AXWISE_API_ORIGIN:?exact AxWise API origin is required}"
AXWISE_SEARCH_URL="${AXWISE_SEARCH_URL:?exact private AxWise search origin is required}"
ORQALY_N8N_BASE_URL="${ORQALY_N8N_BASE_URL:?exact private n8n origin is required}"

ORQALY_IDENTITY_DB_SECRET_VERSION="${ORQALY_IDENTITY_DB_SECRET_VERSION:?required}"
ORQALY_API_DB_SECRET_VERSION="${ORQALY_API_DB_SECRET_VERSION:?required}"
ORQALY_WORKER_DB_SECRET_VERSION="${ORQALY_WORKER_DB_SECRET_VERSION:?required}"
CLERK_SECRET_KEY_VERSION="${CLERK_SECRET_KEY_VERSION:?required}"
CLERK_PUBLISHABLE_KEY_VERSION="${CLERK_PUBLISHABLE_KEY_VERSION:?required}"
GATEWAY_PUBLIC_KEYS_SECRET_VERSION="${GATEWAY_PUBLIC_KEYS_SECRET_VERSION:?required}"
AXWISE_API_DB_SECRET_VERSION="${AXWISE_API_DB_SECRET_VERSION:?required}"
AXWISE_WORKER_DB_SECRET_VERSION="${AXWISE_WORKER_DB_SECRET_VERSION:?required}"
AXWISE_GEMINI_SECRET_VERSION="${AXWISE_GEMINI_SECRET_VERSION:?required}"
AXWISE_SEAL_SECRET_VERSION="${AXWISE_SEAL_SECRET_VERSION:?required}"
PREVIEW_ALLOWED_ADMIN_PRINCIPALS="${PREVIEW_ALLOWED_ADMIN_PRINCIPALS:?explicit Preview admin principals are required}"
REQUIRE_LATEST_TRAFFIC="${REQUIRE_LATEST_TRAFFIC:-true}"

if test "${REQUIRE_LATEST_TRAFFIC}" != true \
  && test "${REQUIRE_LATEST_TRAFFIC}" != false; then
  echo "REQUIRE_LATEST_TRAFFIC must be true or false." >&2
  exit 64
fi

if [[ ! "${AXWISE_SEARCH_URL}" =~ ^https://[A-Za-z0-9.-]+$ ]] \
  || [[ ! "${AXWISE_SEARCH_URL}" =~ \.run\.app$ ]]; then
  echo "AXWISE_SEARCH_URL must be a canonical HTTPS run.app origin without a path." >&2
  exit 64
fi

for tool in gcloud jq node; do
  command -v "${tool}" >/dev/null || { echo "${tool} is required." >&2; exit 69; }
done

project_number="$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')"
if [[ ! "${project_number}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not resolve the Preview project number." >&2
  exit 77
fi
readonly project_number

for service_origin in \
  "orqaly-v2-api-preview:${ORQALY_API_ORIGIN}" \
  "orqaly-v2-web-preview:${ORQALY_WEB_ORIGIN}" \
  "axwise-v2-preview:${AXWISE_API_ORIGIN}" \
  "${ORQALY_N8N_SERVICE}:${ORQALY_N8N_BASE_URL}"; do
  service="${service_origin%%:*}"
  supplied_origin="${service_origin#*:}"
  dns_label="${service}-${project_number}"
  expected_origin="https://${dns_label}.${REGION}.run.app"
  if test "${#dns_label}" -gt 63 || test "${supplied_origin}" != "${expected_origin}"; then
    echo "${service} does not use its deterministic Preview Cloud Run origin." >&2
    exit 77
  fi
done

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

for constraint in \
  constraints/compute.skipDefaultNetworkCreation \
  constraints/iam.automaticIamGrantsForDefaultServiceAccounts \
  constraints/iam.disableServiceAccountKeyCreation \
  constraints/iam.disableServiceAccountKeyUpload; do
  assert_effective_boolean_policy "${constraint}"
done

cloud_sql_json="$(gcloud sql instances describe "${SQL_INSTANCE}" \
  --project="${PROJECT_ID}" --format=json)"
if ! jq -e '
  .settings.connectorEnforcement == "REQUIRED"
  and ((.settings.ipConfiguration.authorizedNetworks // []) | length) == 0
' <<<"${cloud_sql_json}" >/dev/null; then
  echo "Cloud SQL must require approved connectors and have no authorized networks." >&2
  exit 77
fi

allowed_admin_principals="$(node scripts/workflow-v2-effective-iam.mjs \
  normalize-admins --principals "${PREVIEW_ALLOWED_ADMIN_PRINCIPALS}")"
ancestors_json="$(gcloud projects get-ancestors "${PROJECT_ID}" --format=json)"
if ! jq -e '
  type == "array"
  and ([.[] | select(.type == "project")] | length) == 1
  and ([.[] | select(.type == "project" and .id == "axwise-v2-preview-001")] | length) == 1
  and ([.[] | select(.type == "organization")] | length) <= 1
  and all(.[]; .type == "project" or .type == "folder" or .type == "organization")
  and all(.[];
    if .type == "project" then .id == "axwise-v2-preview-001"
    else (.id | test("^[1-9][0-9]*$"))
    end)
' <<<"${ancestors_json}" >/dev/null; then
  echo "Could not establish the exact Cloud Asset hierarchy scope." >&2
  exit 77
fi
organization_id="$(jq -r '[.[] | select(.type == "organization") | .id] | first // empty' \
  <<<"${ancestors_json}")"
if test -n "${organization_id}"; then
  [[ "${organization_id}" =~ ^[1-9][0-9]*$ ]] || {
    echo "Invalid organization id in project ancestry." >&2
    exit 77
  }
  asset_scope="organizations/${organization_id}"
elif jq -e '[.[] | select(.type == "folder")] | length > 0' \
  <<<"${ancestors_json}" >/dev/null; then
  echo "Project has folder ancestry but no analyzable organization root." >&2
  exit 77
else
  asset_scope="projects/${PROJECT_ID}"
fi
ancestor_resources_json="$(jq -c '
  map(
    if .type == "project" then
      "//cloudresourcemanager.googleapis.com/projects/" + .id
    elif .type == "folder" then
      "//cloudresourcemanager.googleapis.com/folders/" + .id
    else
      "//cloudresourcemanager.googleapis.com/organizations/" + .id
    end
  )
' <<<"${ancestors_json}")"

v2_members_json="$(jq -cn \
  --arg orqalyApi "serviceAccount:orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --arg orqalyWorker "serviceAccount:orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --arg orqalyWeb "serviceAccount:orqaly-v2-web-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --arg axwiseApi "serviceAccount:axwise-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --arg axwiseWorker "serviceAccount:axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --arg axwiseSearch "serviceAccount:axwise-v2-search-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --arg n8n "serviceAccount:orqaly-n8n-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --arg gateway "serviceAccount:orqaly-gateway-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --arg build "serviceAccount:workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com" \
  '[$orqalyApi, $orqalyWorker, $orqalyWeb, $axwiseApi, $axwiseWorker, $axwiseSearch, $n8n, $gateway, $build]')"

assert_no_v2_members_with_roles() {
  local label="$1" policy="$2"
  shift 2
  local forbidden_roles_json
  forbidden_roles_json="$(printf '%s\n' "$@" | jq -R . | jq -s .)"
  if ! jq -e --argjson members "${v2_members_json}" \
    --argjson forbidden "${forbidden_roles_json}" '
      [.bindings[]?
        | select((.role as $role | $forbidden | index($role)) != null
          or (.role | startswith("projects/") or startswith("organizations/")))
        | .members[]?
        | select((. as $member | $members | index($member)) != null)]
      | length == 0
    ' <<<"${policy}" >/dev/null; then
    echo "${label} gives a v2 identity a stronger or unknown custom role." >&2
    exit 77
  fi
}

assert_secret_version() {
  [[ "$2" =~ ^[1-9][0-9]*$ ]] || { echo "$1 version is not positive numeric." >&2; exit 64; }
  test "$(gcloud secrets versions describe "$2" --secret="$1" \
    --project="${PROJECT_ID}" --format='value(state)')" = "ENABLED" || {
    echo "$1 version $2 is not enabled." >&2
    exit 78
  }
}

assert_direct_secret_service_accounts() {
  local secret_name="$1" expected actual policy
  shift
  policy="$(gcloud secrets get-iam-policy "${secret_name}" --project="${PROJECT_ID}" \
    --format=json)"
  expected="$(printf '%s\n' "$@" | sed '/^$/d; s/^/serviceAccount:/' | sort -u)"
  actual="$(jq -r '
      .bindings[]? | select(.role == "roles/secretmanager.secretAccessor")
      | .members[]?
    ' <<<"${policy}" | sort -u)"
  test "${actual}" = "${expected}" \
    && jq -e '
      [.bindings[]?
        | select(.role == "roles/secretmanager.secretAccessor" and .condition != null)]
      | length == 0
    ' <<<"${policy}" >/dev/null \
    && jq -e '
      all(.bindings[]?;
        .role == "roles/secretmanager.secretAccessor" and .condition == null)
    ' <<<"${policy}" >/dev/null || {
    echo "${secret_name} direct service-account allowlist differs from the release boundary." >&2
    exit 77
  }
  assert_no_v2_members_with_roles "Secret ${secret_name}" "${policy}" \
    roles/owner roles/editor roles/secretmanager.admin \
    roles/secretmanager.secretVersionAdder roles/secretmanager.secretVersionManager
}

assert_exact_project_roles() {
  local account="$1" expected="$2" policy actual
  policy="${project_policy_json}"
  actual="$(jq -r --arg member "serviceAccount:${account}" '
    .bindings[]? | select(any(.members[]?; . == $member))
    | if .condition == null then .role else (.role + "#conditional") end
  ' <<<"${policy}" | sort -u)"
  test "${actual}" = "${expected}" || {
    echo "${account} project-level role allowlist differs from Preview 001." >&2
    exit 77
  }
}

service_document() {
  gcloud run services describe "$1" --project="${PROJECT_ID}" \
    --region="${REGION}" --format=json
}

assert_search_service_origin() {
  local document
  document="$(service_document "${AXWISE_SEARCH_SERVICE}")"
  jq -e \
    --arg service "${AXWISE_SEARCH_SERVICE}" \
    --arg region "${REGION}" \
    --arg origin "${AXWISE_SEARCH_URL}" \
    --arg account "${AXWISE_SEARCH_SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com" '
      .metadata.name == $service
      and .metadata.labels["cloud.googleapis.com/location"] == $region
      and .status.url == $origin
      and .spec.template.spec.serviceAccountName == $account
    ' <<<"${document}" >/dev/null || {
    echo "${AXWISE_SEARCH_SERVICE} does not match the explicit Preview search origin." >&2
    exit 77
  }
}

assert_service() {
  local service="$1" image="$2" account="$3" ingress="$4"
  local concurrency="$5" min_scale="$6" max_scale="$7" throttle="$8"
  local boost="$9" cpu="${10}" memory="${11}" origin="${12}" document
  document="$(service_document "${service}")"
  if ! jq -e --arg image "${image}" --arg account "${account}" \
    --arg ingress "${ingress}" --arg concurrency "${concurrency}" \
    --arg throttle "${throttle}" \
    --arg boost "${boost}" --arg cpu "${cpu}" --arg memory "${memory}" \
    --arg origin "${origin}" --arg requireTraffic "${REQUIRE_LATEST_TRAFFIC}" '
      .spec.template.spec.containers[0].image == $image
      and .spec.template.spec.serviceAccountName == $account
      and .metadata.annotations["run.googleapis.com/ingress"] == $ingress
      and (.spec.template.spec.containerConcurrency | tostring) == $concurrency
      and (.spec.template.metadata.annotations["run.googleapis.com/cpu-throttling"] // "true") == $throttle
      and (.spec.template.metadata.annotations["run.googleapis.com/startup-cpu-boost"] // "false") == $boost
      and (.spec.template.spec.containers[0].resources.limits.cpu == $cpu
        or .spec.template.spec.containers[0].resources.limits.cpu
          == (((($cpu | tonumber) * 1000) | tostring) + "m"))
      and .spec.template.spec.containers[0].resources.limits.memory == $memory
      and (.spec.template.spec.containers[0].ports | length) == 1
      and .spec.template.spec.containers[0].ports[0].containerPort == 8080
      and .spec.template.spec.containers[0].startupProbe.httpGet.path == "/readyz"
      and .spec.template.spec.containers[0].startupProbe.httpGet.port == 8080
      and .spec.template.spec.containers[0].startupProbe.timeoutSeconds == 5
      and .spec.template.spec.containers[0].startupProbe.periodSeconds == 5
      and .spec.template.spec.containers[0].startupProbe.failureThreshold == 24
      and .spec.template.spec.containers[0].livenessProbe.httpGet.path == "/healthz"
      and .spec.template.spec.containers[0].livenessProbe.httpGet.port == 8080
      and .spec.template.spec.containers[0].livenessProbe.initialDelaySeconds == 10
      and .spec.template.spec.containers[0].livenessProbe.timeoutSeconds == 5
      and .spec.template.spec.containers[0].livenessProbe.periodSeconds == 30
      and .spec.template.spec.containers[0].livenessProbe.failureThreshold == 3
      and .spec.template.spec.containers[0].readinessProbe.httpGet.path == "/readyz"
      and .spec.template.spec.containers[0].readinessProbe.httpGet.port == 8080
      and .spec.template.spec.containers[0].readinessProbe.timeoutSeconds == 5
      and .spec.template.spec.containers[0].readinessProbe.periodSeconds == 10
      and .spec.template.spec.containers[0].readinessProbe.failureThreshold == 3
      and (.status.url as $statusUrl
        | (.metadata.annotations["run.googleapis.com/urls"] | fromjson) as $urls
        | ($urls | index($origin)) != null
          and ($urls | index($statusUrl)) != null)
      and (.status.latestCreatedRevisionName | type == "string" and length > 0)
      and ($requireTraffic == "false" or (
        .status.latestCreatedRevisionName == .status.latestReadyRevisionName
        and (.status.latestReadyRevisionName as $latest
          | ([.status.traffic[]? | select(.revisionName == $latest) | (.percent // 0)] | add // 0) == 100)
      ))
    ' <<<"${document}" >/dev/null; then
    echo "${service} runtime configuration differs from the verified Preview 001 contract." >&2
    exit 77
  fi
  if ! node scripts/workflow-v2-cloud-run-scaling.mjs \
    --min "${min_scale}" --max "${max_scale}" <<<"${document}"; then
    echo "${service} scaling differs from the verified Preview 001 contract." >&2
    exit 77
  fi
}

assert_secret_ref() {
  local service="$1" environment_name="$2" secret_name="$3" version="$4" document
  document="$(service_document "${service}")"
  if ! jq -e --arg env "${environment_name}" --arg secret "${secret_name}" \
    --arg version "${version}" '
      [.spec.template.spec.containers[0].env[]?
        | select(.name == $env)
        | select(.valueFrom.secretKeyRef.name == $secret and .valueFrom.secretKeyRef.key == $version)]
      | length == 1
    ' <<<"${document}" >/dev/null; then
    echo "${service}/${environment_name} does not bind the exact secret version." >&2
    exit 77
  fi
}

assert_plain_env() {
  local service="$1" environment_name="$2" expected="$3" document
  document="$(service_document "${service}")"
  jq -e --arg env "${environment_name}" --arg expected "${expected}" '
    [.spec.template.spec.containers[0].env[]?
      | select(.name == $env and .value == $expected)] | length == 1
  ' <<<"${document}" >/dev/null || {
    echo "${service}/${environment_name} differs from the release contract." >&2
    exit 77
  }
}

assert_absent_env() {
  local service="$1" environment_name="$2" document
  document="$(service_document "${service}")"
  jq -e --arg env "${environment_name}" '
    [.spec.template.spec.containers[0].env[]? | select(.name == $env)] | length == 0
  ' <<<"${document}" >/dev/null || {
    echo "${service} must not receive ${environment_name}." >&2
    exit 77
  }
}

assert_container_command() {
  local service="$1" expected_command="$2" expected_argument="$3" document
  document="$(service_document "${service}")"
  jq -e --arg command "${expected_command}" --arg argument "${expected_argument}" '
    if $command == "" then
      ((.spec.template.spec.containers[0].command // []) | length) == 0
      and ((.spec.template.spec.containers[0].args // []) | length) == 0
    else
      .spec.template.spec.containers[0].command == [$command]
      and .spec.template.spec.containers[0].args == [$argument]
    end
  ' <<<"${document}" >/dev/null || {
    echo "${service} command/arguments differ from the release contract." >&2
    exit 77
  }
}

assert_cloud_sql_binding() {
  local service="$1" document
  document="$(service_document "${service}")"
  jq -e --arg connection "${CONNECTION_NAME}" '
    .spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"] == $connection
  ' <<<"${document}" >/dev/null || {
    echo "${service} does not bind the dedicated Preview 001 Cloud SQL instance." >&2
    exit 77
  }
}

assert_no_vpc_binding() {
  local service="$1" document
  document="$(service_document "${service}")"
  jq -e '
    (.spec.template.metadata.annotations["run.googleapis.com/network-interfaces"] // "") == ""
    and (.spec.template.metadata.annotations["run.googleapis.com/vpc-access-connector"] // "") == ""
  ' <<<"${document}" >/dev/null || {
    echo "${service} has an unintended VPC attachment." >&2
    exit 77
  }
}

assert_run_invokers() {
  local service="$1" expected="$2" actual policy
  policy="$(gcloud run services get-iam-policy "${service}" --project="${PROJECT_ID}" \
    --region="${REGION}" --format=json)"
  actual="$(jq -r '
      .bindings[]? | select(.role == "roles/run.invoker") | .members[]?
    ' <<<"${policy}" | sort -u)"
  test "${actual}" = "${expected}" \
    && jq -e '
      [.bindings[]? | select(.role == "roles/run.invoker" and .condition != null)]
      | length == 0
    ' <<<"${policy}" >/dev/null \
    && jq -e '
      all(.bindings[]?; .role == "roles/run.invoker" and .condition == null)
    ' <<<"${policy}" >/dev/null || {
    echo "${service} invoker allowlist differs from the release boundary." >&2
    exit 77
  }
  assert_no_v2_members_with_roles "Cloud Run service ${service}" "${policy}" \
    roles/owner roles/editor roles/run.admin roles/run.developer
}

assert_invoker_iam_mode() {
  local service="$1" expected="$2" document
  document="$(service_document "${service}")"
  if test "${expected}" = disabled; then
    jq -e '.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] == "true"' \
      <<<"${document}" >/dev/null || {
      echo "${service} must explicitly disable the invoker IAM check." >&2
      exit 77
    }
  elif test "${expected}" = enforced; then
    jq -e '(.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false") != "true"' \
      <<<"${document}" >/dev/null || {
      echo "${service} must enforce the invoker IAM check." >&2
      exit 77
    }
  else
    echo "Invalid invoker IAM mode ${expected}." >&2
    exit 64
  fi
}

for pair in \
  "orqaly-v2-preview-001-db-identity-url:${ORQALY_IDENTITY_DB_SECRET_VERSION}" \
  "orqaly-v2-preview-001-db-api-url:${ORQALY_API_DB_SECRET_VERSION}" \
  "orqaly-v2-preview-001-db-worker-url:${ORQALY_WORKER_DB_SECRET_VERSION}" \
  "orqaly-v2-preview-001-clerk-secret-key:${CLERK_SECRET_KEY_VERSION}" \
  "orqaly-v2-preview-001-clerk-publishable-key:${CLERK_PUBLISHABLE_KEY_VERSION}" \
  "orqaly-v2-preview-001-gateway-public-keys-json:${GATEWAY_PUBLIC_KEYS_SECRET_VERSION}" \
  "axwise-v2-preview-001-db-api-url:${AXWISE_API_DB_SECRET_VERSION}" \
  "axwise-v2-preview-001-db-worker-url:${AXWISE_WORKER_DB_SECRET_VERSION}" \
  "axwise-v2-preview-001-gemini-api-key:${AXWISE_GEMINI_SECRET_VERSION}" \
  "axwise-v2-preview-001-authority-seal:${AXWISE_SEAL_SECRET_VERSION}"; do
  assert_secret_version "${pair%%:*}" "${pair##*:}"
done

project_policy_json="$(gcloud projects get-iam-policy "${PROJECT_ID}" --format=json)"
for account in orqaly-v2-api-preview orqaly-v2-worker-preview \
  axwise-v2-api-preview axwise-v2-worker-preview; do
  assert_exact_project_roles "${account}@${PROJECT_ID}.iam.gserviceaccount.com" \
    roles/cloudsql.client
done
assert_exact_project_roles \
  "orqaly-v2-web-preview@${PROJECT_ID}.iam.gserviceaccount.com" ""
assert_exact_project_roles \
  "axwise-v2-search-preview@${PROJECT_ID}.iam.gserviceaccount.com" ""
assert_exact_project_roles \
  "workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com" \
  roles/logging.logWriter

build_token_creators="$(gcloud iam service-accounts get-iam-policy \
  "workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" --format=json | jq -r '
    .bindings[]? | select(.role == "roles/iam.serviceAccountTokenCreator") | .members[]?
  ' | sort -u)"
test "${build_token_creators}" = \
  "serviceAccount:service-${project_number}@gcp-sa-cloudbuild.iam.gserviceaccount.com" || {
  echo "Dedicated build-account Token Creator allowlist differs from Cloud Build's service agent." >&2
  exit 77
}
build_service_account_policy_json="$(gcloud iam service-accounts get-iam-policy \
  "workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" --format=json)"
jq -e --arg member \
  "serviceAccount:service-${project_number}@gcp-sa-cloudbuild.iam.gserviceaccount.com" '
  (.bindings // []) == [{
    role: "roles/iam.serviceAccountTokenCreator",
    members: [$member]
  }]
' <<<"${build_service_account_policy_json}" >/dev/null || {
  echo "Dedicated build-account direct IAM policy has an unexpected binding." >&2
  exit 77
}
for account in orqaly-v2-api-preview orqaly-v2-worker-preview orqaly-v2-web-preview \
  axwise-v2-api-preview axwise-v2-worker-preview axwise-v2-search-preview; do
  runtime_account_policy_json="$(gcloud iam service-accounts get-iam-policy \
    "${account}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="${PROJECT_ID}" --format=json)"
  jq -e '(.bindings // []) | length == 0' \
    <<<"${runtime_account_policy_json}" >/dev/null || {
    echo "${account} service account has an unexpected direct IAM binding." >&2
    exit 77
  }
done

for password_secret in \
  orqaly-v2-preview-001-db-admin-password \
  orqaly-v2-preview-001-db-identity-password \
  orqaly-v2-preview-001-db-api-password \
  orqaly-v2-preview-001-db-worker-password \
  axwise-v2-preview-001-db-api-password \
  axwise-v2-preview-001-db-worker-password; do
  assert_direct_secret_service_accounts "${password_secret}" ""
done
assert_direct_secret_service_accounts orqaly-v2-preview-001-db-identity-url "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts orqaly-v2-preview-001-db-api-url "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts orqaly-v2-preview-001-db-worker-url "orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts orqaly-v2-preview-001-clerk-secret-key "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts orqaly-v2-preview-001-gateway-public-keys-json "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts axwise-v2-preview-001-db-api-url "axwise-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts axwise-v2-preview-001-db-worker-url "axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts axwise-v2-preview-001-gemini-api-key "axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts axwise-v2-preview-001-authority-seal "axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_direct_secret_service_accounts orqaly-v2-preview-001-clerk-publishable-key \
  "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  "workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com"

assert_search_service_origin

assert_service axwise-v2-preview "${AXWISE_SERVICE_IMAGE}" \
  "axwise-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" internal 20 0 4 true true \
  1 512Mi "${AXWISE_API_ORIGIN}"
assert_service axwise-v2-worker-preview "${AXWISE_SERVICE_IMAGE}" \
  "axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" internal 1 1 1 false true \
  2 2Gi \
  "$(gcloud run services describe axwise-v2-worker-preview --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.url)')"
assert_service orqaly-v2-api-preview "${ORQALY_SERVICE_IMAGE}" \
  "orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" all 20 0 4 true true \
  1 512Mi "${ORQALY_API_ORIGIN}"
assert_service orqaly-v2-worker-preview "${ORQALY_SERVICE_IMAGE}" \
  "orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" internal 1 1 1 false true \
  1 512Mi \
  "$(gcloud run services describe orqaly-v2-worker-preview --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.url)')"
assert_service orqaly-v2-web-preview "${ORQALY_WEB_IMAGE}" \
  "orqaly-v2-web-preview@${PROJECT_ID}.iam.gserviceaccount.com" all 80 0 4 true true \
  1 512Mi "${ORQALY_WEB_ORIGIN}"

assert_container_command axwise-v2-preview "" ""
assert_container_command axwise-v2-worker-preview "" ""
assert_container_command orqaly-v2-api-preview "" ""
assert_container_command orqaly-v2-worker-preview node server/workflow-v2/worker-main.js
assert_container_command orqaly-v2-web-preview "" ""

for service in axwise-v2-preview axwise-v2-worker-preview \
  orqaly-v2-api-preview orqaly-v2-worker-preview; do
  assert_cloud_sql_binding "${service}"
done
for service in axwise-v2-preview axwise-v2-worker-preview \
  orqaly-v2-web-preview; do
  assert_no_vpc_binding "${service}"
done

assert_secret_ref axwise-v2-preview AXWISE_OPERATION_DATABASE_URL axwise-v2-preview-001-db-api-url "${AXWISE_API_DB_SECRET_VERSION}"
assert_plain_env axwise-v2-preview AXWISE_PROCESS_ROLE api
assert_plain_env axwise-v2-preview AXWISE_SERVICE_URL "${AXWISE_API_ORIGIN}"
assert_absent_env axwise-v2-preview GEMINI_API_KEY
assert_absent_env axwise-v2-preview AXWISE_AUTHORITY_SEAL_KEY
assert_absent_env axwise-v2-preview GEMINI_MODEL
assert_absent_env axwise-v2-preview GEMINI_SEARCH_MODEL
assert_absent_env axwise-v2-preview GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS
assert_absent_env axwise-v2-preview GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS
assert_absent_env axwise-v2-preview GEMINI_SEARCH_COST_MICROS_PER_QUERY
assert_absent_env axwise-v2-preview SEARXNG_URL
assert_absent_env axwise-v2-preview SEARXNG_AUTH_MODE
assert_secret_ref axwise-v2-worker-preview AXWISE_OPERATION_DATABASE_URL axwise-v2-preview-001-db-worker-url "${AXWISE_WORKER_DB_SECRET_VERSION}"
assert_secret_ref axwise-v2-worker-preview GEMINI_API_KEY axwise-v2-preview-001-gemini-api-key "${AXWISE_GEMINI_SECRET_VERSION}"
assert_secret_ref axwise-v2-worker-preview AXWISE_AUTHORITY_SEAL_KEY axwise-v2-preview-001-authority-seal "${AXWISE_SEAL_SECRET_VERSION}"
assert_plain_env axwise-v2-worker-preview AXWISE_PROCESS_ROLE worker
assert_plain_env axwise-v2-worker-preview AXWISE_SERVICE_URL "${AXWISE_API_ORIGIN}"
assert_plain_env axwise-v2-worker-preview GEMINI_MODEL models/gemini-3.8-flash
assert_plain_env axwise-v2-worker-preview GEMINI_SEARCH_MODEL gemini-3.8-flash
assert_plain_env axwise-v2-worker-preview GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS 750000
assert_plain_env axwise-v2-worker-preview GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS 3750000
assert_plain_env axwise-v2-worker-preview GEMINI_SEARCH_COST_MICROS_PER_QUERY 14000
assert_plain_env axwise-v2-worker-preview AXWISE_OPERATION_LEASE_SECONDS 600
assert_plain_env axwise-v2-worker-preview AXWISE_OPERATION_HEARTBEAT_SECONDS 30
assert_plain_env axwise-v2-worker-preview SEARXNG_URL "${AXWISE_SEARCH_URL}"
assert_plain_env axwise-v2-worker-preview SEARXNG_AUTH_MODE google_identity
assert_secret_ref orqaly-v2-api-preview ORQALY_IDENTITY_DATABASE_URL orqaly-v2-preview-001-db-identity-url "${ORQALY_IDENTITY_DB_SECRET_VERSION}"
assert_secret_ref orqaly-v2-api-preview ORQALY_API_DATABASE_URL orqaly-v2-preview-001-db-api-url "${ORQALY_API_DB_SECRET_VERSION}"
assert_secret_ref orqaly-v2-api-preview CLERK_SECRET_KEY orqaly-v2-preview-001-clerk-secret-key "${CLERK_SECRET_KEY_VERSION}"
assert_secret_ref orqaly-v2-api-preview CLERK_PUBLISHABLE_KEY orqaly-v2-preview-001-clerk-publishable-key "${CLERK_PUBLISHABLE_KEY_VERSION}"
assert_secret_ref orqaly-v2-api-preview ORQALY_GATEWAY_PUBLIC_KEYS_JSON orqaly-v2-preview-001-gateway-public-keys-json "${GATEWAY_PUBLIC_KEYS_SECRET_VERSION}"
assert_plain_env orqaly-v2-api-preview ORQALY_BROWSER_ORIGINS "${ORQALY_WEB_ORIGIN}"
assert_plain_env orqaly-v2-api-preview CLERK_INSTANCE_ID "${CLERK_INSTANCE_ID}"
assert_plain_env orqaly-v2-api-preview AXWISE_SERVICE_URL "${AXWISE_API_ORIGIN}"
assert_plain_env orqaly-v2-api-preview ORQALY_N8N_BASE_URL "${ORQALY_N8N_BASE_URL}"
assert_plain_env orqaly-v2-api-preview ORQALY_N8N_BINDING_MANIFEST_PATH /app/n8n/executor-bindings.json
assert_plain_env orqaly-v2-api-preview ORQALY_N8N_BINDING_KEY tool_gateway_connector_v1
assert_plain_env orqaly-v2-api-preview ORQALY_N8N_BINDING_VERSION 1.0
assert_plain_env orqaly-v2-api-preview ORQALY_N8N_TIMEOUT_MS 90000
assert_secret_ref orqaly-v2-worker-preview ORQALY_WORKER_DATABASE_URL orqaly-v2-preview-001-db-worker-url "${ORQALY_WORKER_DB_SECRET_VERSION}"
assert_plain_env orqaly-v2-worker-preview AXWISE_SERVICE_URL "${AXWISE_API_ORIGIN}"
assert_plain_env orqaly-v2-worker-preview ORQALY_ARTIFACT_BUCKET "${ARTIFACT_BUCKET}"

for service in orqaly-v2-api-preview orqaly-v2-worker-preview; do
  orqaly_service_json="$(service_document "${service}")"
  jq -e --arg connection "${CONNECTION_NAME}" --arg network "workflow-v2-preview" \
    --arg subnet "workflow-v2-preview-ew4" '
    .spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"] == $connection
    and .spec.template.metadata.annotations["run.googleapis.com/vpc-access-egress"] == "all-traffic"
    and (.spec.template.metadata.annotations["run.googleapis.com/network-interfaces"] | fromjson
      | .[0].network == $network and .[0].subnetwork == $subnet)
  ' <<<"${orqaly_service_json}" >/dev/null || {
    echo "${service} Cloud SQL/VPC route differs from the internal AxWise contract." >&2
    exit 77
  }
done

network_json="$(gcloud compute networks describe workflow-v2-preview \
  --project="${PROJECT_ID}" --format=json)"
subnet_json="$(gcloud compute networks subnets describe workflow-v2-preview-ew4 \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
router_json="$(gcloud compute routers describe workflow-v2-preview-ew4 \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
nat_json="$(gcloud compute routers nats describe workflow-v2-preview-ew4 \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --router=workflow-v2-preview-ew4 --format=json)"
network_names="$(gcloud compute networks list --project="${PROJECT_ID}" \
  --format='value(name)' | sort -u)"
test "${network_names}" = workflow-v2-preview \
  && jq -e '.autoCreateSubnetworks == false' <<<"${network_json}" >/dev/null \
  && jq -e --arg region "${REGION}" --arg network workflow-v2-preview '
    (.region | endswith("/regions/" + $region))
    and (.network | endswith("/networks/" + $network))
    and .ipCidrRange == "10.42.0.0/24"
    and .privateIpGoogleAccess == true
  ' <<<"${subnet_json}" >/dev/null \
  && jq -e --arg network workflow-v2-preview '
    .network | endswith("/networks/" + $network)
  ' <<<"${router_json}" >/dev/null \
  && jq -e --arg subnet workflow-v2-preview-ew4 '
    .natIpAllocateOption == "AUTO_ONLY"
    and .sourceSubnetworkIpRangesToNat == "LIST_OF_SUBNETWORKS"
    and .logConfig.enable == true
    and ([.subnetworks[]?
      | select(.name | endswith("/subnetworks/" + $subnet))
      | select(.sourceIpRangesToNat == ["PRIMARY_IP_RANGE"])] | length) == 1
  ' <<<"${nat_json}" >/dev/null || {
  echo "Preview VPC and Cloud NAT differ from the internal AxWise route." >&2
  exit 77
}

assert_run_invokers axwise-v2-preview \
  "serviceAccount:orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com
serviceAccount:orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_run_invokers axwise-v2-search-preview \
  "serviceAccount:axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
assert_run_invokers axwise-v2-worker-preview ""
assert_run_invokers orqaly-v2-worker-preview ""
assert_run_invokers orqaly-v2-api-preview ""
assert_run_invokers orqaly-v2-web-preview ""
for service in axwise-v2-preview axwise-v2-worker-preview axwise-v2-search-preview \
  orqaly-v2-worker-preview; do
  assert_invoker_iam_mode "${service}" enforced
done
for service in orqaly-v2-api-preview orqaly-v2-web-preview; do
  assert_invoker_iam_mode "${service}" disabled
done

bucket_json="$(gcloud storage buckets describe "gs://${ARTIFACT_BUCKET}" \
  --project="${PROJECT_ID}" --format=json)"
jq -e --arg location "${REGION_UPPER}" '
  .location == $location
  and ((.uniform_bucket_level_access // .iamConfiguration.uniformBucketLevelAccess.enabled // false) == true)
  and ((.public_access_prevention // .iamConfiguration.publicAccessPrevention // "") == "enforced")
' <<<"${bucket_json}" >/dev/null || { echo "Artifact bucket configuration is unsafe." >&2; exit 77; }
bucket_policy_json="$(gcloud storage buckets get-iam-policy "gs://${ARTIFACT_BUCKET}" \
  --project="${PROJECT_ID}" --format=json)"
for role in roles/storage.objectCreator roles/storage.objectViewer; do
  members="$(jq -r --arg role "${role}" '
      .bindings[]? | select(.role == $role) | .members[]?
    ' <<<"${bucket_policy_json}" | sort -u)"
  test "${members}" = "serviceAccount:orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
    && jq -e --arg role "${role}" '
      [.bindings[]? | select(.role == $role and .condition != null)] | length == 0
    ' <<<"${bucket_policy_json}" >/dev/null || {
    echo "Artifact bucket ${role} allowlist differs from the release boundary." >&2
    exit 77
  }
done
assert_no_v2_members_with_roles "Artifact bucket" "${bucket_policy_json}" \
  roles/owner roles/editor roles/storage.admin roles/storage.objectAdmin \
  roles/storage.objectUser roles/storage.legacyBucketOwner \
  roles/storage.legacyBucketWriter roles/storage.legacyObjectOwner

repository_json="$(gcloud artifacts repositories describe "${ARTIFACT_REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" --format=json)"
jq -e '.format == "DOCKER" and .dockerConfig.immutableTags == true' \
  <<<"${repository_json}" >/dev/null || { echo "Artifact Registry is mutable." >&2; exit 77; }
repository_policy_json="$(gcloud artifacts repositories get-iam-policy \
  "${ARTIFACT_REPOSITORY}" --location="${REGION}" \
  --project="${PROJECT_ID}" --format=json)"
repository_writers="$(jq -r '
    .bindings[]? | select(.role == "roles/artifactregistry.writer") | .members[]?
  ' <<<"${repository_policy_json}" | sort -u)"
test "${repository_writers}" = \
  "serviceAccount:workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com" \
  && jq -e '
    [.bindings[]?
      | select(.role == "roles/artifactregistry.writer" and .condition != null)]
    | length == 0
  ' <<<"${repository_policy_json}" >/dev/null || {
  echo "Artifact Registry writer allowlist differs from the release boundary." >&2
  exit 77
}
jq -e '
  all(.bindings[]?;
    .role == "roles/artifactregistry.writer" and .condition == null)
' <<<"${repository_policy_json}" >/dev/null || {
  echo "Artifact Registry has an unexpected direct IAM binding." >&2
  exit 77
}
assert_no_v2_members_with_roles "Artifact Registry" "${repository_policy_json}" \
  roles/owner roles/editor roles/artifactregistry.admin \
  roles/artifactregistry.editor roles/artifactregistry.repoAdmin \
  roles/artifactregistry.createOnPushRepoAdmin \
  roles/artifactregistry.createOnPushWriter

# Exact resource policies above pin workload access. One bounded Cloud Asset
# search now checks all project/folder/organization bindings that can flow down
# to those resources. This avoids the Policy Analyzer daily quota while still
# failing closed on arbitrary principals, conditions and unresolved roles.
assert_no_ancestor_custom_roles() {
  local label="$1" policy="$2"
  if ! jq -e '
    [.bindings[]?
      | select(.role | startswith("projects/") or startswith("organizations/"))]
    | length == 0
  ' <<<"${policy}" >/dev/null; then
    echo "${label} has an unresolved custom role binding." >&2
    exit 77
  fi
}

assert_no_ancestor_custom_roles "Preview project" "${project_policy_json}"
while IFS=$'\t' read -r ancestor_type ancestor_id; do
  case "${ancestor_type}" in
    project) ;;
    folder)
      ancestor_policy_json="$(gcloud resource-manager folders get-iam-policy \
        "${ancestor_id}" --format=json)"
      assert_no_ancestor_custom_roles "Ancestor folder ${ancestor_id}" \
        "${ancestor_policy_json}"
      ;;
    organization)
      ancestor_policy_json="$(gcloud organizations get-iam-policy \
        "${ancestor_id}" --format=json)"
      assert_no_ancestor_custom_roles "Ancestor organization ${ancestor_id}" \
        "${ancestor_policy_json}"
      ;;
  esac
done < <(jq -r '.[] | [.type, .id] | @tsv' <<<"${ancestors_json}")

artifact_worker="serviceAccount:orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
build_member="serviceAccount:workflow-v2-preview-build@${PROJECT_ID}.iam.gserviceaccount.com"
bucket_resource="//storage.googleapis.com/${ARTIFACT_BUCKET}"
direct_policies_json="$(jq -cn \
  --arg bucket "${bucket_resource}" --arg worker "${artifact_worker}" '
  {
    ($bucket): [
      {role: "roles/storage.objectCreator", members: [$worker]},
      {role: "roles/storage.objectViewer", members: [$worker]}
    ]
  }
')"
# Cloud Asset search can omit a Cloud Storage bucket's direct IAM policy even
# when the resource-specific API returns it. Preserve the complete policy from
# the authoritative bucket API. The verifier extracts the two target roles and
# every binding involving a v2 identity, so unrelated legacy project aliases do
# not cause a mismatch. That extracted set must match the allowlist exactly,
# and any Cloud Asset copy is still checked independently.
authoritative_direct_policies_json="$(jq -cn \
  --arg bucket "${bucket_resource}" --argjson policy "${bucket_policy_json}" '
  {($bucket): ($policy.bindings // [])}
')"
permission_rules_json="$(jq -cn \
  --arg artifactWorker "${artifact_worker}" --arg build "${build_member}" '
  {
    "secretmanager.versions.access": [],
    "secretmanager.versions.add": [],
    "secretmanager.secrets.update": [],
    "secretmanager.secrets.setIamPolicy": [],
    "storage.objects.create": [$artifactWorker],
    "storage.objects.get": [$artifactWorker],
    "storage.objects.list": [$artifactWorker],
    "storage.objects.delete": [],
    "storage.objects.update": [],
    "storage.buckets.delete": [],
    "storage.buckets.setIamPolicy": [],
    "run.routes.invoke": [],
    "run.services.update": [],
    "run.services.setIamPolicy": [],
    "iam.serviceAccounts.actAs": [],
    "iam.serviceAccounts.getAccessToken": [],
    "iam.serviceAccounts.getOpenIdToken": [],
    "iam.serviceAccounts.setIamPolicy": [],
    "artifactregistry.repositories.uploadArtifacts": [$build],
    "artifactregistry.repositories.deleteArtifacts": [],
    "artifactregistry.repositories.setIamPolicy": [],
    "cloudsql.instances.update": [],
    "cloudsql.instances.delete": []
  }
')"

# Google-managed service agents are trusted only as exact project-number/role
# pairs. The legacy default Cloud Build account and its broad builder role are
# intentionally absent.
trusted_platform_bindings_json="$(jq -cn \
  --arg artifact "serviceAccount:service-${project_number}@gcp-sa-artifactregistry.iam.gserviceaccount.com" \
  --arg cloudBuild "serviceAccount:service-${project_number}@gcp-sa-cloudbuild.iam.gserviceaccount.com" \
  --arg cloudServices "serviceAccount:${project_number}@cloudservices.gserviceaccount.com" \
  --arg compute "serviceAccount:service-${project_number}@compute-system.iam.gserviceaccount.com" \
  --arg containerRegistry "serviceAccount:service-${project_number}@containerregistry.iam.gserviceaccount.com" \
  --arg pubsub "serviceAccount:service-${project_number}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --arg run "serviceAccount:service-${project_number}@serverless-robot-prod.iam.gserviceaccount.com" '
  {
    "roles/artifactregistry.serviceAgent": [$artifact],
    "roles/cloudbuild.serviceAgent": [$cloudBuild],
    "roles/compute.instanceGroupManagerServiceAgent": [$cloudServices],
    "roles/compute.serviceAgent": [$compute],
    "roles/containerregistry.ServiceAgent": [$containerRegistry],
    "roles/pubsub.serviceAgent": [$pubsub],
    "roles/run.serviceAgent": [$run]
  }
')"

ancestor_resource_expression=""
while IFS= read -r ancestor_resource; do
  if test -n "${ancestor_resource_expression}"; then
    ancestor_resource_expression+=" OR "
  fi
  ancestor_resource_expression+="\"${ancestor_resource}\""
done < <(jq -r '.[]' <<<"${ancestor_resources_json}")
asset_query="(resource=\"${bucket_resource}\" AND roles:(roles/storage.objectCreator OR roles/storage.objectViewer)) OR (resource:(${ancestor_resource_expression}) AND policy.role.permissions:(secretmanager.versions.* OR secretmanager.secrets.* OR storage.objects.* OR storage.buckets.* OR run.routes.* OR run.services.* OR iam.serviceAccounts.* OR artifactregistry.repositories.* OR cloudsql.instances.*))"

gcloud asset search-all-iam-policies \
  --scope="${asset_scope}" --query="${asset_query}" \
  --format='json(resource,policy,explanation)' \
  | node scripts/workflow-v2-effective-iam.mjs assert-inherited-search \
    --ancestor-resources "${ancestor_resources_json}" \
    --direct-policies "${direct_policies_json}" \
    --authoritative-direct-policies "${authoritative_direct_policies_json}" \
    --authoritative-workload-members "${v2_members_json}" \
    --permission-rules "${permission_rules_json}" \
    --trusted-platform-bindings "${trusted_platform_bindings_json}" \
    --admin-members "${allowed_admin_principals}"

echo "Preview 001 runtime candidates, private AxWise search, Cloud SQL connector boundary, effective IAM, pinned secrets and artifact storage verified."
