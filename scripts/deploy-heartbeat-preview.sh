#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

PROJECT_ID="axwise-v2-preview-001"
PROJECT_NUMBER="161074549006"
REGION="europe-west4"
REPOSITORY="workflow-v2-preview"
IMAGE_NAME="orqanix-heartbeat"
JOB="orqanix-heartbeat-preview"
BUCKET="orqanix-heartbeat-preview-161074549006"
WRITER_ACCOUNT_ID="orqanix-heartbeat-writer"
TRIGGER_ACCOUNT_ID="orqanix-heartbeat-trigger"
WEB_ACCOUNT_ID="orqaly-v2-web-preview"
SCHEDULE="*/15 * * * *"
TIME_ZONE="Etc/UTC"
REGION_UPPER="EUROPE-WEST4"

HEARTBEAT_IMAGE="${HEARTBEAT_IMAGE:?set HEARTBEAT_IMAGE to the exact heartbeat image digest}"

readonly PROJECT_ID PROJECT_NUMBER REGION REPOSITORY IMAGE_NAME JOB BUCKET
readonly WRITER_ACCOUNT_ID TRIGGER_ACCOUNT_ID WEB_ACCOUNT_ID SCHEDULE TIME_ZONE REGION_UPPER
readonly HEARTBEAT_IMAGE

refuse_target() {
  echo "Refusing heartbeat deployment: $1" >&2
  exit 64
}

expected_image_prefix="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}@sha256:"
if [[ "${HEARTBEAT_IMAGE}" != "${expected_image_prefix}"* ]]; then
  refuse_target "HEARTBEAT_IMAGE must be the exact Preview heartbeat image digest."
fi
image_digest="${HEARTBEAT_IMAGE#"${expected_image_prefix}"}"
if [[ ! "${image_digest}" =~ ^[a-f0-9]{64}$ ]]; then
  refuse_target "HEARTBEAT_IMAGE must end in a 64-character sha256 digest."
fi
readonly expected_image_prefix image_digest

for tool in gcloud jq; do
  command -v "${tool}" >/dev/null \
    || { echo "${tool} is required." >&2; exit 69; }
done

actual_project_number="$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')"
if test "${actual_project_number}" != "${PROJECT_NUMBER}"; then
  refuse_target "${PROJECT_ID} must resolve to project number ${PROJECT_NUMBER}."
fi
unset actual_project_number

writer_account="${WRITER_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
trigger_account="${TRIGGER_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
web_account="${WEB_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
run_uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB}:run"
readonly writer_account trigger_account web_account run_uri

ensure_service_account() {
  local account_id="$1" display_name="$2" account output status
  account="${account_id}@${PROJECT_ID}.iam.gserviceaccount.com"
  set +e
  output="$(gcloud iam service-accounts describe "${account}" \
    --project="${PROJECT_ID}" --format='value(email)' 2>&1)"
  status=$?
  set -e
  if test "${status}" -eq 0; then
    test "${output}" = "${account}" \
      || { echo "Unexpected service-account identity for ${account_id}." >&2; exit 77; }
    return
  fi
  if [[ "${output}" != *"NOT_FOUND"* && "${output}" != *"not found"* \
    && "${output}" != *"Not found"* && "${output}" != *"does not exist"* ]]; then
    echo "Could not safely inspect ${account}." >&2
    exit 1
  fi
  gcloud iam service-accounts create "${account_id}" \
    --project="${PROJECT_ID}" --display-name="${display_name}" --quiet >/dev/null
}

gcloud services enable cloudscheduler.googleapis.com \
  --project="${PROJECT_ID}" --quiet >/dev/null

ensure_service_account "${WRITER_ACCOUNT_ID}" "Orqanix heartbeat snapshot writer"
ensure_service_account "${TRIGGER_ACCOUNT_ID}" "Orqanix heartbeat scheduler trigger"

set +e
bucket_lookup="$(gcloud storage buckets describe "gs://${BUCKET}" \
  --project="${PROJECT_ID}" --raw --format=json 2>&1)"
bucket_lookup_status=$?
set -e
if test "${bucket_lookup_status}" -eq 0; then
  if ! jq -e --arg expected_region "${REGION_UPPER}" \
    --arg expected_project "${PROJECT_NUMBER}" '
      (.location | ascii_upcase) == $expected_region
      and (((.project_number // .projectNumber // "") | tostring) == $expected_project)
    ' <<<"${bucket_lookup}" >/dev/null; then
    echo "The existing heartbeat bucket has the wrong project or location." >&2
    exit 77
  fi
  gcloud storage buckets update "gs://${BUCKET}" \
    --project="${PROJECT_ID}" --uniform-bucket-level-access \
    --public-access-prevention --quiet >/dev/null
elif [[ "${bucket_lookup}" == *"NOT_FOUND"* || "${bucket_lookup}" == *"not found"* \
  || "${bucket_lookup}" == *"Not Found"* || "${bucket_lookup}" == *"does not exist"* ]]; then
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="${PROJECT_ID}" --location="${REGION}" \
    --uniform-bucket-level-access --public-access-prevention --quiet >/dev/null
else
  echo "Could not safely inspect the heartbeat bucket." >&2
  exit 1
fi
unset bucket_lookup bucket_lookup_status

bucket_document="$(gcloud storage buckets describe "gs://${BUCKET}" \
  --project="${PROJECT_ID}" --raw --format=json)"
if ! jq -e --arg expected_region "${REGION_UPPER}" \
  --arg expected_project "${PROJECT_NUMBER}" '
  (.location | ascii_upcase) == $expected_region
  and (((.project_number // .projectNumber // "") | tostring) == $expected_project)
  and ((.uniform_bucket_level_access
    // .iamConfiguration.uniformBucketLevelAccess.enabled // false) == true)
  and ((.public_access_prevention
    // .iamConfiguration.publicAccessPrevention // "inherited") == "enforced")
' <<<"${bucket_document}" >/dev/null; then
  echo "Heartbeat bucket location or public access controls are incorrect." >&2
  exit 77
fi
unset bucket_document

bucket_objects="$(gcloud storage objects list "gs://${BUCKET}/**" \
  --project="${PROJECT_ID}" --format='value(name)')"
while IFS= read -r object; do
  if test -n "${object}" && test "${object}" != "latest.json"; then
    echo "Unexpected object in dedicated heartbeat bucket: ${object}" >&2
    exit 77
  fi
done <<<"${bucket_objects}"
unset bucket_objects object

# Keep storage private. The collector replaces the status object; only the
# existing web identity reads it through a read-only Cloud Run volume mount.
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${writer_account}" \
  --role="roles/storage.objectUser" --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${web_account}" \
  --role="roles/storage.objectViewer" --quiet >/dev/null

gcloud run jobs deploy "${JOB}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --image="${HEARTBEAT_IMAGE}" \
  --service-account="${writer_account}" \
  --set-env-vars="HEARTBEAT_BUCKET=${BUCKET}" \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=60s \
  --cpu=1 --memory=512Mi --quiet >/dev/null

gcloud run jobs add-iam-policy-binding "${JOB}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --member="serviceAccount:${trigger_account}" \
  --role="roles/run.invoker" --quiet >/dev/null

set +e
scheduler_lookup="$(gcloud scheduler jobs describe "${JOB}" \
  --project="${PROJECT_ID}" --location="${REGION}" --format='value(name)' 2>&1)"
scheduler_lookup_status=$?
set -e
scheduler_arguments=(
  "${JOB}"
  "--project=${PROJECT_ID}"
  "--location=${REGION}"
  "--schedule=${SCHEDULE}"
  "--time-zone=${TIME_ZONE}"
  "--uri=${run_uri}"
  "--http-method=POST"
  "--message-body={}"
  "--oauth-service-account-email=${trigger_account}"
  "--oauth-token-scope=https://www.googleapis.com/auth/cloud-platform"
  "--attempt-deadline=30s"
  "--max-retry-attempts=0"
  "--description=Publish the Orqanix public endpoint heartbeat every 15 minutes"
  "--quiet"
)
if test "${scheduler_lookup_status}" -eq 0; then
  gcloud scheduler jobs update http "${scheduler_arguments[@]}" \
    --update-headers=Content-Type=application/json >/dev/null
elif [[ "${scheduler_lookup}" == *"NOT_FOUND"* || "${scheduler_lookup}" == *"not found"* \
  || "${scheduler_lookup}" == *"Not Found"* || "${scheduler_lookup}" == *"does not exist"* ]]; then
  gcloud scheduler jobs create http "${scheduler_arguments[@]}" \
    --headers=Content-Type=application/json >/dev/null
else
  echo "Could not safely inspect the heartbeat schedule." >&2
  exit 1
fi
unset scheduler_lookup scheduler_lookup_status scheduler_arguments

deployed_image="$(gcloud run jobs describe "${JOB}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --format='value(spec.template.spec.template.spec.containers[0].image)')"
deployed_account="$(gcloud run jobs describe "${JOB}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --format='value(spec.template.spec.template.spec.serviceAccountName)')"
if test "${deployed_image}" != "${HEARTBEAT_IMAGE}" \
  || test "${deployed_account}" != "${writer_account}"; then
  echo "The heartbeat job does not retain its pinned image and writer identity." >&2
  exit 77
fi

scheduler_state="$(gcloud scheduler jobs describe "${JOB}" \
  --project="${PROJECT_ID}" --location="${REGION}" --format='value(state)')"

echo "Heartbeat job and 15-minute server schedule are configured."
if test "${scheduler_state}" != "ENABLED"; then
  echo "The existing Scheduler job remains ${scheduler_state}; resume it when the pause is no longer intentional." >&2
fi
echo "Run it now with: gcloud scheduler jobs run ${JOB} --project=${PROJECT_ID} --location=${REGION}"
