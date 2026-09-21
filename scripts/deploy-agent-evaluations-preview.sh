#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

readonly PROJECT_ID="axwise-v2-preview-001"
readonly PROJECT_NUMBER="161074549006"
readonly REGION="europe-west4"
readonly JOB="orqanix-agent-evaluations-preview"
readonly BUCKET="orqanix-agent-evaluations-preview-161074549006"
readonly RUNNER_ACCOUNT_ID="orqanix-evaluations-runner"
readonly TRIGGER_ACCOUNT_ID="orqanix-evaluations-trigger"
readonly WEB_ACCOUNT_ID="orqaly-v2-web-preview"
readonly API_ORIGIN="https://orqaly-v2-api-preview-161074549006.europe-west4.run.app"
readonly IMAGE_PREFIX="${REGION}-docker.pkg.dev/${PROJECT_ID}/workflow-v2-preview/orqanix-agent-evaluations@sha256:"
readonly SCHEDULE="*/15 * * * *"
readonly TIME_ZONE="Etc/UTC"

refuse() { echo "Refusing preview evaluation deployment: $1" >&2; exit 64; }
missing_resource() {
  [[ "$1" == *"NOT_FOUND"* || "$1" == *"not found"* || "$1" == *"Not Found"* || "$1" == *"Not found"* || "$1" == *"does not exist"* ]]
}

provision_only=false
case "${1:-}" in
  --provision-only) provision_only=true; shift ;;
  --help|-h)
    echo "Usage: $0 [--provision-only]"
    echo "Full deployment requires EVALUATION_IMAGE (digest) and RUNNER_REVISION (40-character commit)."
    echo "Provision-only reconciles dedicated preview identities and storage; it leaves jobs and schedules untouched."
    exit 0 ;;
  "") ;;
  *) refuse "unknown argument: $1" ;;
esac
test "$#" -eq 0 || refuse "unexpected arguments"

if ! "${provision_only}"; then
  test -n "${EVALUATION_IMAGE:-}" || refuse "set EVALUATION_IMAGE to the reviewed image digest"
  [[ "${EVALUATION_IMAGE}" == "${IMAGE_PREFIX}"* ]] || refuse "image must belong to the dedicated preview repository"
  digest="${EVALUATION_IMAGE#"${IMAGE_PREFIX}"}"
  [[ "${digest}" =~ ^[a-f0-9]{64}$ ]] || refuse "image must end in a 64-character sha256 digest"
  [[ "${RUNNER_REVISION:-}" =~ ^[a-f0-9]{40}$ ]] || refuse "RUNNER_REVISION must be the full reviewed Git commit"
fi
EVALUATION_API_ORIGIN="${EVALUATION_API_ORIGIN:-${API_ORIGIN}}"
if [[ "${EVALUATION_API_ORIGIN}" != "${API_ORIGIN}" \
  && ! "${EVALUATION_API_ORIGIN}" =~ ^https://(evaluations-[a-f0-9]{8}---)?orqaly-v2-api-preview-6b2bpwa4kq-ez\.a\.run\.app$ ]]; then
  refuse "API origin must be the canonical preview API or its known evaluation candidate"
fi
readonly EVALUATION_API_ORIGIN

for tool in gcloud jq date mktemp; do
  command -v "${tool}" >/dev/null || { echo "${tool} is required." >&2; exit 69; }
done
actual_project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
test "${actual_project_number}" = "${PROJECT_NUMBER}" || refuse "preview project number does not match ${PROJECT_NUMBER}"

readonly runner_account="${RUNNER_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
readonly trigger_account="${TRIGGER_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
readonly web_account="${WEB_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
readonly run_uri="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB}:run"

ensure_service_account() {
  local account_id="$1" display_name="$2" account output
  account="${account_id}@${PROJECT_ID}.iam.gserviceaccount.com"
  if output="$(gcloud iam service-accounts describe "${account}" --project="${PROJECT_ID}" --format='value(email)' 2>&1)"; then
    test "${output}" = "${account}" || refuse "unexpected service-account identity for ${account_id}"
  elif missing_resource "${output}"; then
    gcloud iam service-accounts create "${account_id}" --project="${PROJECT_ID}" \
      --display-name="${display_name}" --quiet >/dev/null
  else
    echo "Could not safely inspect ${account}." >&2
    exit 1
  fi
}

ensure_service_account "${RUNNER_ACCOUNT_ID}" "Orqanix preview agent evaluation runner"
ensure_service_account "${TRIGGER_ACCOUNT_ID}" "Orqanix preview agent evaluation scheduler"
actual_web_account="$(gcloud iam service-accounts describe "${web_account}" --project="${PROJECT_ID}" --format='value(email)')"
test "${actual_web_account}" = "${web_account}" || refuse "the existing preview web identity is required"

if bucket_document="$(gcloud storage buckets describe "gs://${BUCKET}" --project="${PROJECT_ID}" --raw --format=json 2>&1)"; then
  jq -e --arg project "${PROJECT_NUMBER}" --arg region "${REGION}" '
    ((.location | ascii_downcase) == $region)
    and (((.project_number // .projectNumber // "") | tostring) == $project)
  ' <<<"${bucket_document}" >/dev/null || refuse "existing evaluation bucket has a different owner or location"
elif missing_resource "${bucket_document}"; then
  gcloud storage buckets create "gs://${BUCKET}" --project="${PROJECT_ID}" --location="${REGION}" \
    --uniform-bucket-level-access --public-access-prevention --quiet >/dev/null
else
  echo "Could not safely inspect the evaluation bucket." >&2
  exit 1
fi

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/orqanix-evaluations-deploy.XXXXXX")"
trap 'rm -rf -- "${temporary_directory}"' EXIT
cat >"${temporary_directory}/lifecycle.json" <<'JSON'
{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}
JSON
gcloud storage buckets update "gs://${BUCKET}" --project="${PROJECT_ID}" \
  --uniform-bucket-level-access --public-access-prevention \
  --lifecycle-file="${temporary_directory}/lifecycle.json" --quiet >/dev/null

bucket_document="$(gcloud storage buckets describe "gs://${BUCKET}" --project="${PROJECT_ID}" --raw --format=json)"
jq -e --arg project "${PROJECT_NUMBER}" --arg region "${REGION}" '
  ((.location | ascii_downcase) == $region)
  and (((.project_number // .projectNumber // "") | tostring) == $project)
  and ((.uniform_bucket_level_access // .iamConfiguration.uniformBucketLevelAccess.enabled // false) == true)
  and ((.public_access_prevention // .iamConfiguration.publicAccessPrevention // "inherited") == "enforced")
  and any((.lifecycle.rule // .lifecycle_config.rule // [])[]; .action.type == "Delete" and .condition.age == 30)
' <<<"${bucket_document}" >/dev/null || refuse "bucket controls or 30-day lifecycle were not retained"

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --project="${PROJECT_ID}" \
  --member="serviceAccount:${runner_account}" --role=roles/storage.objectUser --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --project="${PROJECT_ID}" \
  --member="serviceAccount:${web_account}" --role=roles/storage.objectViewer --quiet >/dev/null

if "${provision_only}"; then
  echo "Dedicated preview evaluation identities and private 30-day storage are provisioned."
  echo "No Cloud Run job, schedule, API configuration, or web configuration was changed."
  exit 0
fi

gcloud services enable cloudscheduler.googleapis.com --project="${PROJECT_ID}" --quiet >/dev/null
gcloud run jobs deploy "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" \
  --image="${EVALUATION_IMAGE}" --service-account="${runner_account}" \
  --set-env-vars="EVALUATION_BUCKET=${BUCKET},EVALUATION_API_ORIGIN=${EVALUATION_API_ORIGIN},RUNNER_REVISION=${RUNNER_REVISION}" \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=14m \
  --cpu=2 --memory=2Gi --quiet >/dev/null
gcloud run jobs add-iam-policy-binding "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" \
  --member="serviceAccount:${trigger_account}" --role=roles/run.invoker --quiet >/dev/null

scheduler_arguments=(
  "${JOB}" "--project=${PROJECT_ID}" "--location=${REGION}"
  "--time-zone=${TIME_ZONE}" "--uri=${run_uri}" "--http-method=POST" "--message-body={}"
  "--oauth-service-account-email=${trigger_account}"
  "--oauth-token-scope=https://www.googleapis.com/auth/cloud-platform"
  "--attempt-deadline=30s" "--max-retry-attempts=0" "--max-retry-duration=0s"
  "--description=Run five deterministic live agent evaluation categories every 15 minutes in preview"
  "--quiet"
)
if scheduler_document="$(gcloud scheduler jobs describe "${JOB}" --project="${PROJECT_ID}" --location="${REGION}" --format=json 2>&1)"; then
  previous_scheduler_state="$(jq -r '.state' <<<"${scheduler_document}")"
  [[ "${previous_scheduler_state}" == "PAUSED" || "${previous_scheduler_state}" == "ENABLED" ]] \
    || refuse "existing schedule state is ${previous_scheduler_state}; inspect it before updating"
elif missing_resource "${scheduler_document}"; then
  # Scheduler cannot create a paused job. Keep its first possible dispatch at
  # least eleven hours away until pause completes, then install the real cadence.
  initial_hour=$(( (10#$(date -u +%H) + 12) % 24 ))
  gcloud scheduler jobs create http "${scheduler_arguments[@]}" \
    --schedule="0 ${initial_hour} * * *" --headers=Content-Type=application/json >/dev/null
  gcloud scheduler jobs pause "${JOB}" --project="${PROJECT_ID}" --location="${REGION}" --quiet >/dev/null
  previous_scheduler_state="PAUSED"
else
  echo "Could not safely inspect the evaluation schedule." >&2
  exit 1
fi
gcloud scheduler jobs update http "${scheduler_arguments[@]}" \
  --schedule="${SCHEDULE}" --update-headers=Content-Type=application/json >/dev/null

job_document="$(gcloud run jobs describe "${JOB}" --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
jq -e --arg image "${EVALUATION_IMAGE}" --arg account "${runner_account}" '
  .spec.template.spec.template.spec as $task
  | $task.containers[0].image == $image and $task.serviceAccountName == $account
' <<<"${job_document}" >/dev/null || refuse "deployed job lost its pinned image or runner identity"
scheduler_document="$(gcloud scheduler jobs describe "${JOB}" --project="${PROJECT_ID}" --location="${REGION}" --format=json)"
jq -e --arg state "${previous_scheduler_state}" --arg schedule "${SCHEDULE}" \
  --arg account "${trigger_account}" --arg uri "${run_uri}" '
  .state == $state and .schedule == $schedule and .timeZone == "Etc/UTC"
  and .httpTarget.uri == $uri and .httpTarget.oauthToken.serviceAccountEmail == $account
  and ((.retryConfig.retryCount // 0) == 0)
' <<<"${scheduler_document}" >/dev/null || refuse "schedule configuration or pause state changed unexpectedly"

echo "Preview evaluation job configured at ${EVALUATION_IMAGE}."
echo "Schedule remains ${previous_scheduler_state}; no resume operation was performed."
echo "Verify API configuration, a manual job execution, and public evidence before explicitly resuming a new schedule."
