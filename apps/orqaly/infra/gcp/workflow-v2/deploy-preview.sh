#!/usr/bin/env bash
set -euo pipefail
set +x

PROJECT_ID="axwise-v2-preview-001"
REGION="europe-west4"
SQL_INSTANCE="orqaly-v2-preview-001-pg"
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
ARTIFACT_BUCKET="${PROJECT_ID}-orqaly-v2-preview-001-artifacts"
VPC_NETWORK="workflow-v2-preview"
VPC_SUBNET="workflow-v2-preview-ew4"
CLERK_INSTANCE_ID="ins_2vHl8PVNUNRJVv23OVqAcYOkVRK"
AXWISE_SEARCH_SERVICE="axwise-v2-search-preview"
ORQALY_N8N_SERVICE="orqaly-agentic-n8n-preview"

ORQALY_SERVICE_IMAGE="${ORQALY_SERVICE_IMAGE:?exact Orqaly service image digest is required}"
ORQALY_WEB_IMAGE="${ORQALY_WEB_IMAGE:?exact Orqaly web image digest is required}"
AXWISE_SERVICE_IMAGE="${AXWISE_SERVICE_IMAGE:?exact AxWise service image digest is required}"
ORQALY_API_ORIGIN="${ORQALY_API_ORIGIN:?exact Orqaly API origin baked into the web image is required}"
ORQALY_WEB_ORIGIN="${ORQALY_WEB_ORIGIN:?exact Orqaly web origin is required}"
ORQALY_BROWSER_ORIGINS="${ORQALY_WEB_ORIGIN},https://preview.orqanix.com"
AXWISE_API_ORIGIN="${AXWISE_API_ORIGIN:?exact AxWise API origin is required}"
AXWISE_SEARCH_URL="${AXWISE_SEARCH_URL:?exact private AxWise search origin is required}"
ORQALY_N8N_BASE_URL="${ORQALY_N8N_BASE_URL:?exact private n8n origin is required}"
ORQALY_IDENTITY_DB_SECRET_VERSION="${ORQALY_IDENTITY_DB_SECRET_VERSION:?numeric identity DB secret version is required}"
ORQALY_API_DB_SECRET_VERSION="${ORQALY_API_DB_SECRET_VERSION:?numeric API DB secret version is required}"
ORQALY_WORKER_DB_SECRET_VERSION="${ORQALY_WORKER_DB_SECRET_VERSION:?numeric worker DB secret version is required}"
CLERK_SECRET_KEY_VERSION="${CLERK_SECRET_KEY_VERSION:?numeric Clerk secret-key version is required}"
CLERK_PUBLISHABLE_KEY_VERSION="${CLERK_PUBLISHABLE_KEY_VERSION:?numeric Clerk publishable-key version is required}"
GATEWAY_PUBLIC_KEYS_SECRET_VERSION="${GATEWAY_PUBLIC_KEYS_SECRET_VERSION:?numeric Gateway public-key registry version is required}"
AXWISE_API_DB_SECRET_VERSION="${AXWISE_API_DB_SECRET_VERSION:?numeric AxWise API DB secret version is required}"
AXWISE_WORKER_DB_SECRET_VERSION="${AXWISE_WORKER_DB_SECRET_VERSION:?numeric AxWise worker DB secret version is required}"
AXWISE_GEMINI_SECRET_VERSION="${AXWISE_GEMINI_SECRET_VERSION:?numeric Gemini secret version is required}"
AXWISE_SEAL_SECRET_VERSION="${AXWISE_SEAL_SECRET_VERSION:?numeric authority-seal secret version is required}"
BUILD_ATTESTATION_INPUT="${BUILD_ATTESTATION_INPUT:?absolute build-attestation input path is required}"
RUNTIME_ATTESTATION_OUTPUT="${RUNTIME_ATTESTATION_OUTPUT:?absolute create-only runtime-attestation path is required}"
PREVIEW_ALLOWED_ADMIN_PRINCIPALS="${PREVIEW_ALLOWED_ADMIN_PRINCIPALS:?explicit comma-separated Preview admin principals are required}"
ORQALY_REPOSITORY="${ORQALY_REPOSITORY:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)}"
AXWISE_REPOSITORY="${AXWISE_REPOSITORY:-$(git -C "${ORQALY_REPOSITORY}" rev-parse --show-toplevel)}"

readonly PROJECT_ID REGION SQL_INSTANCE CONNECTION_NAME ARTIFACT_BUCKET VPC_NETWORK VPC_SUBNET
readonly CLERK_INSTANCE_ID AXWISE_SEARCH_SERVICE ORQALY_N8N_SERVICE
readonly ORQALY_SERVICE_IMAGE ORQALY_WEB_IMAGE AXWISE_SERVICE_IMAGE
readonly ORQALY_API_ORIGIN ORQALY_WEB_ORIGIN AXWISE_API_ORIGIN AXWISE_SEARCH_URL ORQALY_N8N_BASE_URL
readonly ORQALY_BROWSER_ORIGINS
readonly ORQALY_IDENTITY_DB_SECRET_VERSION ORQALY_API_DB_SECRET_VERSION
readonly ORQALY_WORKER_DB_SECRET_VERSION CLERK_SECRET_KEY_VERSION CLERK_PUBLISHABLE_KEY_VERSION
readonly GATEWAY_PUBLIC_KEYS_SECRET_VERSION
readonly AXWISE_API_DB_SECRET_VERSION AXWISE_WORKER_DB_SECRET_VERSION
readonly AXWISE_GEMINI_SECRET_VERSION AXWISE_SEAL_SECRET_VERSION
readonly BUILD_ATTESTATION_INPUT RUNTIME_ATTESTATION_OUTPUT PREVIEW_ALLOWED_ADMIN_PRINCIPALS
readonly ORQALY_REPOSITORY AXWISE_REPOSITORY
export ORQALY_SERVICE_IMAGE ORQALY_WEB_IMAGE AXWISE_SERVICE_IMAGE
export ORQALY_API_ORIGIN ORQALY_WEB_ORIGIN AXWISE_API_ORIGIN AXWISE_SEARCH_URL ORQALY_N8N_BASE_URL
export ORQALY_IDENTITY_DB_SECRET_VERSION ORQALY_API_DB_SECRET_VERSION
export ORQALY_WORKER_DB_SECRET_VERSION CLERK_SECRET_KEY_VERSION CLERK_PUBLISHABLE_KEY_VERSION
export GATEWAY_PUBLIC_KEYS_SECRET_VERSION
export AXWISE_API_DB_SECRET_VERSION AXWISE_WORKER_DB_SECRET_VERSION
export AXWISE_GEMINI_SECRET_VERSION AXWISE_SEAL_SECRET_VERSION
export RUNTIME_ATTESTATION_OUTPUT PREVIEW_ALLOWED_ADMIN_PRINCIPALS

for tool in curl gcloud git jq node openssl; do
  command -v "${tool}" >/dev/null || { echo "${tool} is required." >&2; exit 69; }
done

require_digest() {
  local name="$1"
  local value="$2"
  local package="$3"
  local digest="${value##*@sha256:}"
  if test "${value}" != "${package}@sha256:${digest}" \
    || [[ ! "${digest}" =~ ^[a-f0-9]{64}$ ]]; then
    echo "${name} must be the exact Preview ${package} Artifact Registry digest." >&2
    exit 64
  fi
}

require_absolute_file() {
  local name="$1" value="$2"
  if [[ "${value}" != /* ]] || test ! -f "${value}" || test -L "${value}"; then
    echo "${name} must be an absolute, regular, non-symlink file." >&2
    exit 64
  fi
}

require_create_only_output() {
  local name="$1" value="$2"
  if [[ "${value}" != /* ]] || test -e "${value}"; then
    echo "${name} must be an unused absolute create-only path." >&2
    exit 64
  fi
}

require_origin() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
    echo "${name} must be a canonical HTTPS origin without a path." >&2
    exit 64
  fi
}

project_number="$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')"
if [[ ! "${project_number}" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not resolve the hard-pinned Preview project number." >&2
  exit 77
fi
readonly project_number

expected_service_origin() {
  local service="$1"
  local dns_label="${service}-${project_number}"
  if test "${#dns_label}" -gt 63; then
    echo "${service} is too long for a deterministic Cloud Run URL." >&2
    exit 64
  fi
  printf 'https://%s.%s.run.app' "${dns_label}" "${REGION}"
}

assert_deterministic_origin_input() {
  local service="$1" supplied="$2" expected
  expected="$(expected_service_origin "${service}")"
  if test "${supplied}" != "${expected}"; then
    echo "${service} origin must be the deterministic Preview URL ${expected}." >&2
    exit 64
  fi
}

require_secret_version() {
  local secret_name="$1"
  local version="$2"
  if [[ ! "${version}" =~ ^[1-9][0-9]*$ ]]; then
    echo "${secret_name} version must be numeric." >&2
    exit 64
  fi
  local state
  state="$(gcloud secrets versions describe "${version}" --secret="${secret_name}" \
    --project="${PROJECT_ID}" --format='value(state)')"
  if test "${state}" != "ENABLED"; then
    echo "Secret ${secret_name} version ${version} is not enabled." >&2
    exit 78
  fi
}

assert_deployed_digest() {
  local service="$1"
  local expected="$2"
  local actual
  actual="$(gcloud run services describe "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" \
    --format='value(spec.template.spec.containers[0].image)')"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "${service} is not pinned to the requested digest." >&2
    exit 1
  fi
}

assert_service_origin() {
  local service="$1" expected="$2" document
  document="$(gcloud run services describe "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
  if ! jq -e --arg expected "${expected}" '
    (.metadata.annotations["run.googleapis.com/urls"] | fromjson) as $urls
    | ($urls | index($expected)) != null
      and (.status.url as $statusUrl | ($urls | index($statusUrl)) != null)
  ' <<<"${document}" >/dev/null; then
    echo "${service} does not advertise the supplied deterministic origin." >&2
    exit 64
  fi
}

assert_private_search_service() {
  local document policy expected_invoker actual_invokers
  document="$(gcloud run services describe "${AXWISE_SEARCH_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
  if ! jq -e \
    --arg service "${AXWISE_SEARCH_SERVICE}" \
    --arg region "${REGION}" \
    --arg origin "${AXWISE_SEARCH_URL}" \
    --arg account "${AXWISE_SEARCH_SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com" '
      .metadata.name == $service
      and .metadata.labels["cloud.googleapis.com/location"] == $region
      and .status.url == $origin
      and .spec.template.spec.serviceAccountName == $account
      and (.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false") != "true"
    ' <<<"${document}" >/dev/null; then
    echo "${AXWISE_SEARCH_SERVICE} does not match the explicit private Preview search origin." >&2
    exit 77
  fi

  policy="$(gcloud run services get-iam-policy "${AXWISE_SEARCH_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
  expected_invoker="serviceAccount:axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com"
  actual_invokers="$(jq -r '
      .bindings[]? | select(.role == "roles/run.invoker") | .members[]?
    ' <<<"${policy}" | sort -u)"
  if test "${actual_invokers}" != "${expected_invoker}" \
    || ! jq -e '
      all(.bindings[]?; .role == "roles/run.invoker" and .condition == null)
    ' <<<"${policy}" >/dev/null; then
    echo "${AXWISE_SEARCH_SERVICE} is not private to the exact AxWise Preview worker." >&2
    exit 77
  fi
}

assert_latest_revision_ready() {
  local service="$1" created revision_document attempt
  for attempt in {1..24}; do
    created="$(gcloud run services describe "${service}" --project="${PROJECT_ID}" \
      --region="${REGION}" --format='value(status.latestCreatedRevisionName)')"
    if test -n "${created}"; then
      revision_document="$(gcloud run revisions describe "${created}" \
        --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
      if jq -e '.status.conditions[]? | select(.type == "Ready" and .status == "True")' \
        <<<"${revision_document}" >/dev/null; then
        printf '%s' "${created}"
        return
      fi
    fi
    test "${attempt}" -eq 24 || sleep 5
  done
  echo "${service} candidate revision is not ready; traffic remains unchanged." >&2
  exit 1
}

capture_traffic() {
  local service="$1" document
  document="$(gcloud run services describe "${service}" --project="${PROJECT_ID}" \
    --region="${REGION}" --format=json)"
  if ! jq -e '
    (.status.traffic // []) as $traffic
    | ($traffic | length) > 0
      and all($traffic[];
        (.revisionName | type == "string")
        and (.revisionName | test("^[a-z0-9-]+$"))
        and ((.tag // "") == "")
        and ((.percent | type) == "number")
        and (.percent > 0)
        and (.percent == (.percent | floor)))
      and (($traffic | map(.percent) | add) == 100)
      and (($traffic | map(.revisionName) | unique | length) == ($traffic | length))
  ' <<<"${document}" >/dev/null; then
    echo "${service} has an unsupported or ambiguous pre-cutover traffic map." >&2
    return 77
  fi
  jq -r '
    .status.traffic
    | sort_by(.revisionName)
    | map(.revisionName + "=" + (.percent | tostring))
    | join(",")
  ' <<<"${document}"
}

promote_candidate_revision() {
  local service="$1" revision="$2"
  gcloud run services update-traffic "${service}" --project="${PROJECT_ID}" \
    --region="${REGION}" --to-revisions="${revision}=100" --quiet >/dev/null
}

assert_candidate_revision_has_all_traffic() {
  local service="$1" expected_revision="$2" document
  document="$(gcloud run services describe "${service}" --project="${PROJECT_ID}" \
    --region="${REGION}" --format=json)"
  if ! jq -e --arg revision "${expected_revision}" '
    .status.latestReadyRevisionName == $revision
    and ([.status.traffic[]? | select(.revisionName == $revision) | (.percent // 0)] | add // 0) == 100
  ' <<<"${document}" >/dev/null; then
    echo "${service} does not route 100% to its exact verified candidate revision." >&2
    return 1
  fi
}

monitoring_sample_boundary() {
  node -e '
    const minute = 60_000;
    process.stdout.write(new Date((Math.floor(Date.now() / minute) + 1) * minute).toISOString());
  '
}

monitoring_window_start() {
  node -e '
    const boundary = Date.parse(process.argv[1]);
    if (!Number.isFinite(boundary)) process.exit(64);
    process.stdout.write(new Date(boundary - 60_000).toISOString());
  ' "$1"
}

wait_for_revision_instance_state() {
  local service="$1" revision="$2" not_before="$3" expected="$4"
  local access_token filter response window_start window_end attempt
  if test "${expected}" != zero && test "${expected}" != running; then
    echo "Invalid instance-count expectation for ${service}/${revision}." >&2
    return 64
  fi
  access_token="$(gcloud auth print-access-token)" || return
  window_start="$(monitoring_window_start "${not_before}")" || return
  filter="metric.type=\"run.googleapis.com/container/instance_count\" AND resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${service}\" AND resource.labels.revision_name=\"${revision}\" AND resource.labels.location=\"${REGION}\""

  for attempt in {1..48}; do
    window_end="$(node -e 'process.stdout.write(new Date().toISOString())')"
    if response="$(curl --fail --silent --show-error --get \
      --connect-timeout 10 --max-time 30 \
      --header "Authorization: Bearer ${access_token}" \
      "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries" \
      --data-urlencode "filter=${filter}" \
      --data-urlencode "interval.startTime=${window_start}" \
      --data-urlencode "interval.endTime=${window_end}" \
      --data-urlencode 'view=FULL')"; then
      if jq -e --arg notBefore "${not_before}" --arg expected "${expected}" '
        . as $document
        | def latest($state):
            [$document.timeSeries[]?
              | select(.metric.labels.state == $state)
              | .points[]?
              | select(.interval.endTime >= $notBefore)]
            | if length == 0 then null else max_by(.interval.endTime) end;
        (latest("active")) as $active
        | (latest("idle")) as $idle
        | $active != null
          and $idle != null
          and ([$active.value.int64Value, $idle.value.int64Value]
            | all(. != null and test("^(0|[1-9][0-9]*)$")))
          and (([$active.value.int64Value, $idle.value.int64Value]
            | map(tonumber) | add) as $instances
            | if $expected == "zero" then $instances == 0 else $instances > 0 end)
      ' <<<"${response}" >/dev/null; then
        return
      fi
    fi
    if (( attempt % 6 == 0 )); then
      echo "Waiting for ${service}/${revision} to report ${expected} instances after ${not_before}." >&2
    fi
    test "${attempt}" -eq 48 || sleep 10
  done
  echo "${service}/${revision} did not report the required fresh ${expected} instance count." >&2
  return 1
}

wait_for_traffic_map_zero_instances() {
  local service="$1" traffic_map="$2" not_before="$3" assignment revision
  local -a assignments
  IFS=',' read -r -a assignments <<<"${traffic_map}"
  for assignment in "${assignments[@]}"; do
    revision="${assignment%%=*}"
    if [[ ! "${revision}" =~ ^[a-z0-9-]+$ ]]; then
      echo "${service} has an invalid captured revision in its drain set." >&2
      return 77
    fi
    wait_for_revision_instance_state "${service}" "${revision}" "${not_before}" zero || return
  done
}

assert_worker_scaling_mode() {
  local service="$1" expected="$2" document
  document="$(gcloud run services describe "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)" || return
  if test "${expected}" = disabled; then
    jq -e '
      .metadata.annotations["run.googleapis.com/scalingMode"] == "manual"
      and .metadata.annotations["run.googleapis.com/manualInstanceCount"] == "0"
    ' <<<"${document}" >/dev/null || {
      echo "${service} did not enter the zero-instance manual scaling fence." >&2
      return 77
    }
  elif test "${expected}" = automatic; then
    jq -e '
      (.metadata.annotations["run.googleapis.com/scalingMode"] // "automatic") == "automatic"
      and (.metadata.annotations["run.googleapis.com/manualInstanceCount"] // null) == null
    ' <<<"${document}" >/dev/null \
      && node "${ORQALY_REPOSITORY}/scripts/workflow-v2-cloud-run-scaling.mjs" \
        --min 1 --max 1 <<<"${document}" || {
      echo "${service} did not restore the one-instance automatic worker scaling contract." >&2
      return 77
    }
  else
    echo "Invalid worker scaling expectation for ${service}." >&2
    return 64
  fi
}

disable_worker_service() {
  local service="$1"
  gcloud run services update "${service}" --project="${PROJECT_ID}" \
    --region="${REGION}" --scaling=0 --quiet >/dev/null \
    && assert_worker_scaling_mode "${service}" disabled
}

enable_worker_service() {
  local service="$1"
  gcloud run services update "${service}" --project="${PROJECT_ID}" \
    --region="${REGION}" --scaling=auto --min=1 --max=1 --quiet >/dev/null \
    && assert_worker_scaling_mode "${service}" automatic
}

traffic_state_directory="$(mktemp -d -t workflow-v2-preview-traffic.XXXXXX)"
consumer_floor_marker="${traffic_state_directory}/consumer-floor"
rollback_required=false
cutover_suffix="c$(openssl rand -hex 6)"
readonly consumer_floor_marker cutover_suffix

service_presence() {
  local service="$1" names
  names="$(gcloud run services list --project="${PROJECT_ID}" --region="${REGION}" \
    --filter="metadata.name=${service}" --format='value(metadata.name)')"
  if test -z "${names}"; then
    printf absent
  elif test "${names}" = "${service}"; then
    printf present
  else
    echo "Cloud Run returned an ambiguous service presence result for ${service}." >&2
    return 77
  fi
}

candidate_traffic_option() {
  local service="$1" state
  state="$(<"${traffic_state_directory}/${service}.state")"
  case "${state}" in
    present) printf '%s' --no-traffic ;;
    absent) ;;
    *)
      echo "${service} has an invalid pre-cutover state." >&2
      return 77
      ;;
  esac
}

ensure_orqaly_direct_vpc_all_traffic_egress() {
  local service="$1" minimum="$2" maximum="$3" cpu_throttling="$4"
  local state document actual
  local -a cpu_option
  if test "${cpu_throttling}" = true; then
    cpu_option=(--cpu-throttling)
  elif test "${cpu_throttling}" = false; then
    cpu_option=(--no-cpu-throttling)
  else
    echo "${service} has an invalid CPU throttling correction." >&2
    exit 64
  fi
  document="$(gcloud run services describe "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
  actual="$(jq -r '.spec.template.metadata.annotations["run.googleapis.com/vpc-access-egress"] // empty' \
    <<<"${document}")"
  if test "${actual}" = all-traffic; then
    return
  fi
  state="$(<"${traffic_state_directory}/${service}.state")"
  if test "${state}" != absent; then
    echo "${service} did not retain all-traffic Direct VPC egress." >&2
    exit 77
  fi
  # Cloud Run can ignore all-traffic egress on the initial create request. Once
  # the exact invocation-created service exists, a scoped update persists it.
  gcloud run services update "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" \
    --vpc-egress=all-traffic \
    --min="${minimum}" --max="${maximum}" \
    --min-instances=default --max-instances=default \
    "${cpu_option[@]}" --cpu-boost \
    --revision-suffix="${cutover_suffix}e" \
    --quiet >/dev/null
  document="$(gcloud run services describe "${service}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
  if test "$(jq -r '.spec.template.metadata.annotations["run.googleapis.com/vpc-access-egress"] // empty' \
    <<<"${document}")" != all-traffic; then
    echo "${service} first-create VPC egress correction did not persist." >&2
    exit 77
  fi
}

restore_service_target() {
  local service="$1" state presence previous expected_uid current_uid latest_created
  state="$(<"${traffic_state_directory}/${service}.state")"
  if test "${state}" = present; then
    previous="$(<"${traffic_state_directory}/${service}.before")"
    gcloud run services update-traffic "${service}" --project="${PROJECT_ID}" \
      --region="${REGION}" --to-revisions="${previous}" --quiet >/dev/null || {
      echo "Failed to restore the rollback traffic target for ${service}." >&2
      return 1
    }
    return
  fi

  presence="$(service_presence "${service}")" || return
  test "${presence}" = absent && return
  if test ! -f "${traffic_state_directory}/${service}.created-uid"; then
    latest_created="$(gcloud run services describe "${service}" \
      --project="${PROJECT_ID}" --region="${REGION}" \
      --format='value(status.latestCreatedRevisionName)')" || return
    if [[ "${latest_created}" != *-"${cutover_suffix}" ]]; then
      echo "Refusing to delete unproven service ${service} during rollback." >&2
      return 1
    fi
    current_uid="$(gcloud run services describe "${service}" \
      --project="${PROJECT_ID}" --region="${REGION}" \
      --format='value(metadata.uid)')" || return
    printf '%s' "${current_uid}" >"${traffic_state_directory}/${service}.created-uid"
  fi
  expected_uid="$(<"${traffic_state_directory}/${service}.created-uid")"
  current_uid="$(gcloud run services describe "${service}" --project="${PROJECT_ID}" \
    --region="${REGION}" --format='value(metadata.uid)')" || return
  if test "${current_uid}" != "${expected_uid}" \
    || ! gcloud run services delete "${service}" --project="${PROJECT_ID}" \
      --region="${REGION}" --quiet >/dev/null; then
    echo "Failed to remove the exact invocation-created service ${service}." >&2
    return 1
  fi
}

verify_restored_service_target() {
  local service="$1" state presence previous actual
  state="$(<"${traffic_state_directory}/${service}.state")"
  if test "${state}" = absent; then
    presence="$(service_presence "${service}")" || return
    if test "${presence}" = present; then
      echo "Invocation-created service ${service} still exists after rollback." >&2
      return 1
    fi
    return
  fi
  previous="$(<"${traffic_state_directory}/${service}.before")"
  actual="$(capture_traffic "${service}")" || return
  if test "${actual}" != "${previous}"; then
    echo "Restored traffic verification failed for ${service}." >&2
    return 1
  fi
}

restore_previous_traffic() {
  local service presence current_traffic drain_not_before
  local failed=false worker_fence=true retain_consumer_floor=false
  test -d "${consumer_floor_marker}" && retain_consumer_floor=true

  # Stop every database poller before changing any rollback traffic. This is
  # the same hard fence as the forward cutover, so an old parser is never
  # reintroduced while a newer producer can still enqueue work for it.
  for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do
    if ! presence="$(service_presence "${service}")"; then
      echo "Could not establish rollback presence for ${service}." >&2
      failed=true
      worker_fence=false
    elif test "${presence}" = present; then
      if ! current_traffic="$(capture_traffic "${service}")" \
        || ! disable_worker_service "${service}"; then
        echo "Could not disable ${service} for rollback." >&2
        failed=true
        worker_fence=false
      else
        printf '%s' "${current_traffic}" >"${traffic_state_directory}/${service}.rollback-current"
      fi
    fi
  done
  drain_not_before="$(monitoring_sample_boundary)"
  if test "${worker_fence}" = true; then
    for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do
      if test -f "${traffic_state_directory}/${service}.rollback-current" \
        && ! wait_for_traffic_map_zero_instances "${service}" \
          "$(<"${traffic_state_directory}/${service}.rollback-current")" \
          "${drain_not_before}"; then
        echo "Could not observe a complete rollback drain for ${service}." >&2
        failed=true
        worker_fence=false
      fi
    done
  fi

  # Restore the original Orqaly producers first while both worker services are
  # disabled. Once the atomic floor marker exists, AxWise API and both workers
  # must remain on their backward-compatible candidates; the immutable
  # pre-cutover snapshots are retained only for audit and pre-floor rollback.
  for service in orqaly-v2-api-preview orqaly-v2-web-preview; do
    restore_service_target "${service}" || failed=true
  done
  if test "${retain_consumer_floor}" = true; then
    promote_candidate_revision axwise-v2-preview \
      "$(<"${traffic_state_directory}/axwise-v2-preview.candidate")" || failed=true
  else
    restore_service_target axwise-v2-preview || failed=true
  fi

  if test "${worker_fence}" = true; then
    for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do
      if test "${retain_consumer_floor}" = true; then
        promote_candidate_revision "${service}" \
          "$(<"${traffic_state_directory}/${service}.candidate")" || failed=true
      else
        restore_service_target "${service}" || failed=true
      fi
    done
    for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do
      if test "${retain_consumer_floor}" = true \
        || test "$(<"${traffic_state_directory}/${service}.state")" = present; then
        enable_worker_service "${service}" || failed=true
      fi
    done
  fi

  for service in orqaly-v2-api-preview orqaly-v2-web-preview; do
    verify_restored_service_target "${service}" || failed=true
  done
  if test "${retain_consumer_floor}" = true; then
    for service in axwise-v2-worker-preview axwise-v2-preview orqaly-v2-worker-preview; do
      assert_candidate_revision_has_all_traffic "${service}" \
        "$(<"${traffic_state_directory}/${service}.candidate")" || failed=true
    done
    for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do
      assert_worker_scaling_mode "${service}" automatic || failed=true
    done
  else
    for service in axwise-v2-worker-preview axwise-v2-preview orqaly-v2-worker-preview; do
      verify_restored_service_target "${service}" || failed=true
    done
  fi
  test "${failed}" = false
}

assert_service_creation_precondition() {
  local service="$1" state presence
  state="$(<"${traffic_state_directory}/${service}.state")"
  presence="$(service_presence "${service}")"
  if test "${state}" = absent \
    && test "${presence}" = present; then
    echo "${service} appeared after preflight; refusing to overwrite concurrent state." >&2
    exit 73
  fi
}

record_invocation_created_service() {
  local service="$1" state uid
  state="$(<"${traffic_state_directory}/${service}.state")"
  if test "${state}" = absent; then
    uid="$(gcloud run services describe "${service}" --project="${PROJECT_ID}" \
      --region="${REGION}" --format='value(metadata.uid)')"
    if [[ ! "${uid}" =~ ^[a-f0-9-]{20,80}$ ]]; then
      echo "Could not bind the invocation-created identity for ${service}." >&2
      exit 73
    fi
    printf '%s' "${uid}" >"${traffic_state_directory}/${service}.created-uid"
  fi
}

on_exit() {
  local status="$?"
  local rollback_failed=false
  trap - EXIT
  if test "${status}" -ne 0 && test "${rollback_required}" = true; then
    echo "Cutover failed after mutation began; restoring the safe rollback traffic floor." >&2
    if ! restore_previous_traffic; then
      echo "Preview rollback failed; manual recovery is required before another cutover." >&2
      rollback_failed=true
    fi
  fi
  rm -rf "${traffic_state_directory}"
  if test "${rollback_failed}" = true; then
    exit 70
  fi
  exit "${status}"
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

require_digest ORQALY_SERVICE_IMAGE "${ORQALY_SERVICE_IMAGE}" \
  "europe-west4-docker.pkg.dev/${PROJECT_ID}/workflow-v2-preview/orqaly-service"
require_digest ORQALY_WEB_IMAGE "${ORQALY_WEB_IMAGE}" \
  "europe-west4-docker.pkg.dev/${PROJECT_ID}/workflow-v2-preview/orqaly-web"
require_digest AXWISE_SERVICE_IMAGE "${AXWISE_SERVICE_IMAGE}" \
  "europe-west4-docker.pkg.dev/${PROJECT_ID}/workflow-v2-preview/axwise-service"
require_absolute_file BUILD_ATTESTATION_INPUT "${BUILD_ATTESTATION_INPUT}"
require_create_only_output RUNTIME_ATTESTATION_OUTPUT "${RUNTIME_ATTESTATION_OUTPUT}"
require_origin ORQALY_API_ORIGIN "${ORQALY_API_ORIGIN}"
require_origin ORQALY_WEB_ORIGIN "${ORQALY_WEB_ORIGIN}"
require_origin AXWISE_API_ORIGIN "${AXWISE_API_ORIGIN}"
require_origin AXWISE_SEARCH_URL "${AXWISE_SEARCH_URL}"
require_origin ORQALY_N8N_BASE_URL "${ORQALY_N8N_BASE_URL}"
if [[ ! "${AXWISE_API_ORIGIN}" =~ \.run\.app$ ]]; then
  echo "AXWISE_API_ORIGIN must use its default run.app URL for internal VPC ingress." >&2
  exit 64
fi
if [[ ! "${AXWISE_SEARCH_URL}" =~ \.run\.app$ ]]; then
  echo "AXWISE_SEARCH_URL must use the private search service run.app origin." >&2
  exit 64
fi
if [[ ! "${ORQALY_N8N_BASE_URL}" =~ \.run\.app$ ]]; then
  echo "ORQALY_N8N_BASE_URL must use the private n8n service run.app origin." >&2
  exit 64
fi

# Cloud Run's deterministic service URL is computable before a service exists
# when SERVICE-PROJECT_NUMBER fits one DNS label. This makes the first Preview
# build independent of any legacy/scaffold service while still binding the
# exact origins before build-attestation verification and the first mutation.
assert_deterministic_origin_input orqaly-v2-api-preview "${ORQALY_API_ORIGIN}"
assert_deterministic_origin_input orqaly-v2-web-preview "${ORQALY_WEB_ORIGIN}"
assert_deterministic_origin_input axwise-v2-preview "${AXWISE_API_ORIGIN}"
assert_deterministic_origin_input "${ORQALY_N8N_SERVICE}" "${ORQALY_N8N_BASE_URL}"
assert_private_search_service

require_secret_version orqaly-v2-preview-001-db-identity-url "${ORQALY_IDENTITY_DB_SECRET_VERSION}"
require_secret_version orqaly-v2-preview-001-db-api-url "${ORQALY_API_DB_SECRET_VERSION}"
require_secret_version orqaly-v2-preview-001-db-worker-url "${ORQALY_WORKER_DB_SECRET_VERSION}"
require_secret_version orqaly-v2-preview-001-clerk-secret-key "${CLERK_SECRET_KEY_VERSION}"
require_secret_version orqaly-v2-preview-001-clerk-publishable-key "${CLERK_PUBLISHABLE_KEY_VERSION}"
require_secret_version orqaly-v2-preview-001-gateway-public-keys-json "${GATEWAY_PUBLIC_KEYS_SECRET_VERSION}"
require_secret_version axwise-v2-preview-001-db-api-url "${AXWISE_API_DB_SECRET_VERSION}"
require_secret_version axwise-v2-preview-001-db-worker-url "${AXWISE_WORKER_DB_SECRET_VERSION}"
require_secret_version axwise-v2-preview-001-gemini-api-key "${AXWISE_GEMINI_SECRET_VERSION}"
require_secret_version axwise-v2-preview-001-authority-seal "${AXWISE_SEAL_SECRET_VERSION}"

# The create-only build proof must bind the exact clean repository commits,
# role-specific image digests and web/Clerk build inputs before the first
# Cloud Run or IAM mutation occurs.
node "${ORQALY_REPOSITORY}/scripts/workflow-v2-verify-build-attestation.mjs" \
  --input "${BUILD_ATTESTATION_INPUT}" \
  --orqaly-repository "${ORQALY_REPOSITORY}" \
  --axwise-repository "${AXWISE_REPOSITORY}" \
  --orqaly-service-image "${ORQALY_SERVICE_IMAGE}" \
  --orqaly-web-image "${ORQALY_WEB_IMAGE}" \
  --axwise-service-image "${AXWISE_SERVICE_IMAGE}" \
  --orqaly-api-origin "${ORQALY_API_ORIGIN}" \
  --clerk-publishable-key-version "${CLERK_PUBLISHABLE_KEY_VERSION}"

fleet_presence=""
for service in axwise-v2-worker-preview axwise-v2-preview \
  orqaly-v2-worker-preview orqaly-v2-api-preview orqaly-v2-web-preview; do
  presence="$(service_presence "${service}")"
  if test -z "${fleet_presence}"; then
    fleet_presence="${presence}"
  elif test "${presence}" != "${fleet_presence}"; then
    echo "Preview fleet presence must be uniformly all-present or all-absent before cutover." >&2
    exit 73
  fi
  if test "${presence}" = present; then
    printf present >"${traffic_state_directory}/${service}.state"
    capture_traffic "${service}" >"${traffic_state_directory}/${service}.before"
  else
    printf absent >"${traffic_state_directory}/${service}.state"
  fi
done

rollback_required=true
assert_service_creation_precondition axwise-v2-preview
candidate_traffic_flag="$(candidate_traffic_option axwise-v2-preview)"
gcloud run deploy axwise-v2-preview \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${AXWISE_SERVICE_IMAGE}" \
  --revision-suffix="${cutover_suffix}" \
  --command="" \
  --args="" \
  --service-account="axwise-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-cloudsql-instances="${CONNECTION_NAME}" \
  --clear-network \
  --clear-vpc-connector \
  --set-env-vars="AXWISE_PROCESS_ROLE=api,AXWISE_SERVICE_URL=${AXWISE_API_ORIGIN},AXWISE_OPERATION_DATABASE_POOL_SIZE=3" \
  --set-secrets="AXWISE_OPERATION_DATABASE_URL=axwise-v2-preview-001-db-api-url:${AXWISE_API_DB_SECRET_VERSION}" \
  --execution-environment=gen2 \
  --ingress=internal \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=20 \
  --min=0 \
  --max=4 \
  --min-instances=default \
  --max-instances=default \
  --cpu-boost \
  --port=8080 \
  --startup-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=24" \
  --liveness-probe="httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=10,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" \
  --readiness-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" \
  --invoker-iam-check \
  --no-allow-unauthenticated \
  ${candidate_traffic_flag:+"${candidate_traffic_flag}"} \
  --quiet >/dev/null
record_invocation_created_service axwise-v2-preview

gcloud run services add-iam-policy-binding axwise-v2-preview \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --quiet >/dev/null
gcloud run services add-iam-policy-binding axwise-v2-preview \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --quiet >/dev/null

assert_service_creation_precondition axwise-v2-worker-preview
candidate_traffic_flag="$(candidate_traffic_option axwise-v2-worker-preview)"
gcloud run deploy axwise-v2-worker-preview \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${AXWISE_SERVICE_IMAGE}" \
  --revision-suffix="${cutover_suffix}" \
  --command="" \
  --args="" \
  --service-account="axwise-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-cloudsql-instances="${CONNECTION_NAME}" \
  --clear-network \
  --clear-vpc-connector \
  --set-env-vars="AXWISE_PROCESS_ROLE=worker,AXWISE_SERVICE_URL=${AXWISE_API_ORIGIN},AXWISE_OPERATION_DATABASE_POOL_SIZE=3,GEMINI_MODEL=models/gemini-3.8-flash,GEMINI_SEARCH_MODEL=gemini-3.8-flash,GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS=750000,GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS=3750000,GEMINI_SEARCH_COST_MICROS_PER_QUERY=14000,AXWISE_OPERATION_LEASE_SECONDS=600,AXWISE_OPERATION_HEARTBEAT_SECONDS=30,AXWISE_OPERATION_IDLE_SECONDS=1,AXWISE_RESEARCH_CONCURRENCY=4,AXWISE_RESEARCH_DEADLINE_SECONDS=300,AXWISE_COGNITIVE_DEADLINE_SECONDS=540,SEARXNG_URL=${AXWISE_SEARCH_URL},SEARXNG_AUTH_MODE=google_identity" \
  --set-secrets="AXWISE_OPERATION_DATABASE_URL=axwise-v2-preview-001-db-worker-url:${AXWISE_WORKER_DB_SECRET_VERSION},GEMINI_API_KEY=axwise-v2-preview-001-gemini-api-key:${AXWISE_GEMINI_SECRET_VERSION},AXWISE_AUTHORITY_SEAL_KEY=axwise-v2-preview-001-authority-seal:${AXWISE_SEAL_SECRET_VERSION}" \
  --execution-environment=gen2 \
  --ingress=internal \
  --cpu=1 \
  --memory=1Gi \
  --concurrency=1 \
  --min=1 \
  --max=1 \
  --min-instances=default \
  --max-instances=default \
  --no-cpu-throttling \
  --cpu-boost \
  --port=8080 \
  --startup-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=24" \
  --liveness-probe="httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=10,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" \
  --readiness-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" \
  --invoker-iam-check \
  --no-allow-unauthenticated \
  ${candidate_traffic_flag:+"${candidate_traffic_flag}"} \
  --quiet >/dev/null
record_invocation_created_service axwise-v2-worker-preview

assert_service_creation_precondition orqaly-v2-api-preview
candidate_traffic_flag="$(candidate_traffic_option orqaly-v2-api-preview)"
gcloud run deploy orqaly-v2-api-preview \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${ORQALY_SERVICE_IMAGE}" \
  --revision-suffix="${cutover_suffix}" \
  --command="" \
  --args="" \
  --service-account="orqaly-v2-api-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-cloudsql-instances="${CONNECTION_NAME}" \
  --network="${VPC_NETWORK}" \
  --subnet="${VPC_SUBNET}" \
  --vpc-egress=all-traffic \
  --set-env-vars="^|^ORQALY_ENVIRONMENT=preview|ORQALY_BROWSER_ORIGINS=${ORQALY_BROWSER_ORIGINS}|CLERK_INSTANCE_ID=${CLERK_INSTANCE_ID}|AXWISE_SERVICE_URL=${AXWISE_API_ORIGIN}|ORQALY_IDENTITY_POOL_MAX=2|ORQALY_API_POOL_MAX=4|ORQALY_N8N_BASE_URL=${ORQALY_N8N_BASE_URL}|ORQALY_N8N_BINDING_MANIFEST_PATH=/app/n8n/executor-bindings.json|ORQALY_N8N_BINDING_KEY=tool_gateway_connector_v1|ORQALY_N8N_BINDING_VERSION=1.0|ORQALY_N8N_TIMEOUT_MS=90000" \
  --set-secrets="ORQALY_IDENTITY_DATABASE_URL=orqaly-v2-preview-001-db-identity-url:${ORQALY_IDENTITY_DB_SECRET_VERSION},ORQALY_API_DATABASE_URL=orqaly-v2-preview-001-db-api-url:${ORQALY_API_DB_SECRET_VERSION},CLERK_SECRET_KEY=orqaly-v2-preview-001-clerk-secret-key:${CLERK_SECRET_KEY_VERSION},CLERK_PUBLISHABLE_KEY=orqaly-v2-preview-001-clerk-publishable-key:${CLERK_PUBLISHABLE_KEY_VERSION},ORQALY_GATEWAY_PUBLIC_KEYS_JSON=orqaly-v2-preview-001-gateway-public-keys-json:${GATEWAY_PUBLIC_KEYS_SECRET_VERSION}" \
  --execution-environment=gen2 \
  --ingress=all \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=80 \
  --min=0 \
  --max=4 \
  --min-instances=default \
  --max-instances=default \
  --cpu-boost \
  --port=8080 \
  --startup-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=24" \
  --liveness-probe="httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=10,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" \
  --readiness-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" \
  --no-invoker-iam-check \
  ${candidate_traffic_flag:+"${candidate_traffic_flag}"} \
  --quiet >/dev/null
record_invocation_created_service orqaly-v2-api-preview
ensure_orqaly_direct_vpc_all_traffic_egress orqaly-v2-api-preview 0 4 true

assert_service_creation_precondition orqaly-v2-worker-preview
candidate_traffic_flag="$(candidate_traffic_option orqaly-v2-worker-preview)"
gcloud run deploy orqaly-v2-worker-preview \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${ORQALY_SERVICE_IMAGE}" \
  --revision-suffix="${cutover_suffix}" \
  --command=node \
  --args=server/workflow-v2/worker-main.js \
  --service-account="orqaly-v2-worker-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-cloudsql-instances="${CONNECTION_NAME}" \
  --network="${VPC_NETWORK}" \
  --subnet="${VPC_SUBNET}" \
  --vpc-egress=all-traffic \
  --set-env-vars="ORQALY_ENVIRONMENT=preview,AXWISE_SERVICE_URL=${AXWISE_API_ORIGIN},ORQALY_ARTIFACT_BUCKET=${ARTIFACT_BUCKET},ORQALY_WORKER_POOL_MAX=4" \
  --set-secrets="ORQALY_WORKER_DATABASE_URL=orqaly-v2-preview-001-db-worker-url:${ORQALY_WORKER_DB_SECRET_VERSION}" \
  --execution-environment=gen2 \
  --ingress=internal \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=1 \
  --min=1 \
  --max=1 \
  --min-instances=default \
  --max-instances=default \
  --no-cpu-throttling \
  --cpu-boost \
  --port=8080 \
  --startup-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=24" \
  --liveness-probe="httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=10,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" \
  --readiness-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" \
  --invoker-iam-check \
  --no-allow-unauthenticated \
  ${candidate_traffic_flag:+"${candidate_traffic_flag}"} \
  --quiet >/dev/null
record_invocation_created_service orqaly-v2-worker-preview
ensure_orqaly_direct_vpc_all_traffic_egress orqaly-v2-worker-preview 1 1 false

assert_service_creation_precondition orqaly-v2-web-preview
candidate_traffic_flag="$(candidate_traffic_option orqaly-v2-web-preview)"
gcloud run deploy orqaly-v2-web-preview \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${ORQALY_WEB_IMAGE}" \
  --revision-suffix="${cutover_suffix}" \
  --command="" \
  --args="" \
  --service-account="orqaly-v2-web-preview@${PROJECT_ID}.iam.gserviceaccount.com" \
  --clear-network \
  --clear-vpc-connector \
  --execution-environment=gen2 \
  --ingress=all \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=80 \
  --min=0 \
  --max=4 \
  --min-instances=default \
  --max-instances=default \
  --cpu-boost \
  --port=8080 \
  --startup-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=5,failureThreshold=24" \
  --liveness-probe="httpGet.path=/healthz,httpGet.port=8080,initialDelaySeconds=10,timeoutSeconds=5,periodSeconds=30,failureThreshold=3" \
  --readiness-probe="httpGet.path=/readyz,httpGet.port=8080,timeoutSeconds=5,periodSeconds=10,failureThreshold=3" \
  --no-invoker-iam-check \
  ${candidate_traffic_flag:+"${candidate_traffic_flag}"} \
  --quiet >/dev/null
record_invocation_created_service orqaly-v2-web-preview

for service in axwise-v2-preview axwise-v2-worker-preview orqaly-v2-api-preview \
  orqaly-v2-worker-preview orqaly-v2-web-preview; do
  assert_latest_revision_ready "${service}" >"${traffic_state_directory}/${service}.candidate"
done

# Existing services keep traffic on their previous revisions. Cloud Run cannot
# create a first revision with no traffic, so a first deployment is immediately
# live but is bound to this invocation and removed exactly if fleet verification
# fails. Verify every candidate and its surrounding IAM, network and storage
# boundary before changing any pre-existing service traffic.
REQUIRE_LATEST_TRAFFIC=false \
  infra/gcp/workflow-v2/verify-preview-runtime.sh

# A traffic move is not a worker fence: a zero-traffic Cloud Run revision can
# remain alive briefly and these two services continuously poll PostgreSQL with
# allocated CPU. Disable both worker services at the Cloud Run service level,
# then require a fresh platform instance-count sample proving every old traffic
# revision has reached zero before either producer can emit Agent-bearing input.
for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do
  disable_worker_service "${service}"
done
worker_drain_not_before="$(monitoring_sample_boundary)"
for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do
  if test "$(<"${traffic_state_directory}/${service}.state")" = present; then
    wait_for_traffic_map_zero_instances "${service}" \
      "$(<"${traffic_state_directory}/${service}.before")" \
      "${worker_drain_not_before}"
  fi
done

# Change worker traffic only while the fleet is disabled. Bring each candidate
# back with the exact automatic 1/1 scaling contract and require a fresh
# instance-count sample before activating the producer immediately above it.
for service in axwise-v2-worker-preview orqaly-v2-worker-preview; do
  promote_candidate_revision "${service}" \
    "$(<"${traffic_state_directory}/${service}.candidate")"
  assert_candidate_revision_has_all_traffic "${service}" \
    "$(<"${traffic_state_directory}/${service}.candidate")"
done

# mkdir is the single atomic phase transition. It happens after both workers
# route to verified candidates while disabled and before the first candidate is
# enabled. From this point rollback can only retain all three new consumers.
mkdir "${consumer_floor_marker}"
enable_worker_service axwise-v2-worker-preview
axwise_worker_running_not_before="$(monitoring_sample_boundary)"
wait_for_revision_instance_state axwise-v2-worker-preview \
  "$(<"${traffic_state_directory}/axwise-v2-worker-preview.candidate")" \
  "${axwise_worker_running_not_before}" running
promote_candidate_revision axwise-v2-preview \
  "$(<"${traffic_state_directory}/axwise-v2-preview.candidate")"
assert_candidate_revision_has_all_traffic axwise-v2-preview \
  "$(<"${traffic_state_directory}/axwise-v2-preview.candidate")"

enable_worker_service orqaly-v2-worker-preview
orqaly_worker_running_not_before="$(monitoring_sample_boundary)"
wait_for_revision_instance_state orqaly-v2-worker-preview \
  "$(<"${traffic_state_directory}/orqaly-v2-worker-preview.candidate")" \
  "${orqaly_worker_running_not_before}" running

promote_candidate_revision orqaly-v2-api-preview \
  "$(<"${traffic_state_directory}/orqaly-v2-api-preview.candidate")"
promote_candidate_revision orqaly-v2-web-preview \
  "$(<"${traffic_state_directory}/orqaly-v2-web-preview.candidate")"

assert_deployed_digest axwise-v2-preview "${AXWISE_SERVICE_IMAGE}"
assert_deployed_digest axwise-v2-worker-preview "${AXWISE_SERVICE_IMAGE}"
assert_deployed_digest orqaly-v2-api-preview "${ORQALY_SERVICE_IMAGE}"
assert_deployed_digest orqaly-v2-worker-preview "${ORQALY_SERVICE_IMAGE}"
assert_deployed_digest orqaly-v2-web-preview "${ORQALY_WEB_IMAGE}"
assert_service_origin orqaly-v2-api-preview "${ORQALY_API_ORIGIN}"
assert_service_origin orqaly-v2-web-preview "${ORQALY_WEB_ORIGIN}"
assert_service_origin axwise-v2-preview "${AXWISE_API_ORIGIN}"
for service in axwise-v2-preview axwise-v2-worker-preview orqaly-v2-api-preview \
  orqaly-v2-worker-preview orqaly-v2-web-preview; do
  assert_candidate_revision_has_all_traffic \
    "${service}" "$(<"${traffic_state_directory}/${service}.candidate")"
done

infra/gcp/workflow-v2/verify-preview-runtime.sh

node "${ORQALY_REPOSITORY}/scripts/workflow-v2-gcp-attestation.mjs" runtime \
  --output "${RUNTIME_ATTESTATION_OUTPUT}" \
  --orqaly-repository "${ORQALY_REPOSITORY}" \
  --axwise-repository "${AXWISE_REPOSITORY}" \
  --orqaly-commit "$(git -C "${ORQALY_REPOSITORY}" rev-parse --verify HEAD)" \
  --axwise-commit "$(git -C "${AXWISE_REPOSITORY}" rev-parse --verify HEAD)" \
  --orqaly-service-image "${ORQALY_SERVICE_IMAGE}" \
  --orqaly-web-image "${ORQALY_WEB_IMAGE}" \
  --axwise-service-image "${AXWISE_SERVICE_IMAGE}"

rollback_required=false

echo "Five verified Preview roles now route to the exact requested candidate revisions."
