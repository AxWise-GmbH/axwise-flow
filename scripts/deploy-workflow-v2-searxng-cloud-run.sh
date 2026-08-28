#!/usr/bin/env bash

# Build and deploy the private, stateless search-discovery service used by the
# clean workflow-v2 Preview worker. This helper owns only that search service;
# it never deploys or mutates the worker.

set -euo pipefail
set +x
umask 077

EXPECTED_PROJECT_ID="axwise-v2-preview-001"
EXPECTED_REGION="europe-west4"
EXPECTED_SERVICE="axwise-v2-search-preview"
EXPECTED_WORKER_SERVICE="axwise-v2-worker-preview"
EXPECTED_REPOSITORY="workflow-v2-preview"
EXPECTED_BUILD_SOURCE_BUCKET="axwise-v2-preview-001_cloudbuild"
EXPECTED_BUILD_ACCOUNT_ID="workflow-v2-preview-build"
EXPECTED_SEARCH_ACCOUNT_ID="axwise-v2-search-preview"
EXPECTED_SECRET="axwise-v2-search-preview-secret"

PROJECT_ID="${PROJECT_ID:-${EXPECTED_PROJECT_ID}}"
REGION="${REGION:-${EXPECTED_REGION}}"
SERVICE="${SEARXNG_SERVICE:-${EXPECTED_SERVICE}}"
WORKER_SERVICE="${WORKER_SERVICE:-${EXPECTED_WORKER_SERVICE}}"
REPOSITORY="${REPOSITORY:-${EXPECTED_REPOSITORY}}"
BUILD_SOURCE_BUCKET="${BUILD_SOURCE_BUCKET:-${EXPECTED_BUILD_SOURCE_BUCKET}}"
BUILD_ACCOUNT_ID="${BUILD_ACCOUNT_ID:-${EXPECTED_BUILD_ACCOUNT_ID}}"
SEARCH_ACCOUNT_ID="${SEARXNG_SERVICE_ACCOUNT_ID:-${EXPECTED_SEARCH_ACCOUNT_ID}}"
SECRET="${SEARXNG_SECRET_NAME:-${EXPECTED_SECRET}}"
EXPECTED_AXWISE_WORKER_IMAGE="${EXPECTED_AXWISE_WORKER_IMAGE:-}"
EXPECTED_EXISTING_SEARXNG_DIGEST="${EXPECTED_EXISTING_SEARXNG_DIGEST:-}"

readonly EXPECTED_PROJECT_ID EXPECTED_REGION EXPECTED_SERVICE
readonly EXPECTED_WORKER_SERVICE EXPECTED_REPOSITORY
readonly EXPECTED_BUILD_SOURCE_BUCKET EXPECTED_BUILD_ACCOUNT_ID
readonly EXPECTED_SEARCH_ACCOUNT_ID EXPECTED_SECRET
readonly PROJECT_ID REGION SERVICE WORKER_SERVICE REPOSITORY BUILD_SOURCE_BUCKET
readonly BUILD_ACCOUNT_ID SEARCH_ACCOUNT_ID SECRET EXPECTED_AXWISE_WORKER_IMAGE
readonly EXPECTED_EXISTING_SEARXNG_DIGEST

refuse_target() {
  echo "Refusing workflow-v2 search deployment: $1" >&2
  exit 64
}

# Preview resource and identity names are not extension points. Fail on ambient
# overrides instead of letting a caller run the third-party image as another
# service account or mount an unrelated secret.
test "${PROJECT_ID}" = "${EXPECTED_PROJECT_ID}" \
  || refuse_target "PROJECT_ID must be ${EXPECTED_PROJECT_ID}."
test "${REGION}" = "${EXPECTED_REGION}" \
  || refuse_target "REGION must be ${EXPECTED_REGION}."
test "${SERVICE}" = "${EXPECTED_SERVICE}" \
  || refuse_target "SEARXNG_SERVICE must be ${EXPECTED_SERVICE}."
test "${WORKER_SERVICE}" = "${EXPECTED_WORKER_SERVICE}" \
  || refuse_target "WORKER_SERVICE must be ${EXPECTED_WORKER_SERVICE}."
test "${REPOSITORY}" = "${EXPECTED_REPOSITORY}" \
  || refuse_target "REPOSITORY must be ${EXPECTED_REPOSITORY}."
test "${BUILD_SOURCE_BUCKET}" = "${EXPECTED_BUILD_SOURCE_BUCKET}" \
  || refuse_target "BUILD_SOURCE_BUCKET must be ${EXPECTED_BUILD_SOURCE_BUCKET}."
test "${BUILD_ACCOUNT_ID}" = "${EXPECTED_BUILD_ACCOUNT_ID}" \
  || refuse_target "BUILD_ACCOUNT_ID must be ${EXPECTED_BUILD_ACCOUNT_ID}."
test "${SEARCH_ACCOUNT_ID}" = "${EXPECTED_SEARCH_ACCOUNT_ID}" \
  || refuse_target "SEARXNG_SERVICE_ACCOUNT_ID must be ${EXPECTED_SEARCH_ACCOUNT_ID}."
test "${SECRET}" = "${EXPECTED_SECRET}" \
  || refuse_target "SEARXNG_SECRET_NAME must be ${EXPECTED_SECRET}."

case "${PROJECT_ID}:${SERVICE}:${WORKER_SERVICE}:${SEARCH_ACCOUNT_ID}:${SECRET}" in
  *axwise-73425*|*axwise-searxng*|*axwise-orqaly-worker*)
    refuse_target "legacy project and service identities are forbidden."
    ;;
esac

EXPECTED_WORKER_IMAGE_PREFIX="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/axwise-service@sha256:"
if [[ "${EXPECTED_AXWISE_WORKER_IMAGE}" != "${EXPECTED_WORKER_IMAGE_PREFIX}"* ]]; then
  refuse_target "EXPECTED_AXWISE_WORKER_IMAGE must be the exact Preview AxWise image digest reference."
fi
EXPECTED_WORKER_DIGEST="${EXPECTED_AXWISE_WORKER_IMAGE#"${EXPECTED_WORKER_IMAGE_PREFIX}"}"
if [[ ! "${EXPECTED_WORKER_DIGEST}" =~ ^[a-f0-9]{64}$ ]]; then
  refuse_target "EXPECTED_AXWISE_WORKER_IMAGE must be the exact Preview AxWise image digest reference."
fi
if test -n "${EXPECTED_EXISTING_SEARXNG_DIGEST}" \
  && [[ ! "${EXPECTED_EXISTING_SEARXNG_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  refuse_target "EXPECTED_EXISTING_SEARXNG_DIGEST must be an exact sha256 digest."
fi
readonly EXPECTED_WORKER_IMAGE_PREFIX EXPECTED_WORKER_DIGEST

for tool in gcloud git jq openssl tar; do
  command -v "${tool}" >/dev/null \
    || { echo "${tool} is required." >&2; exit 69; }
done

REPOSITORY_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
if test -n "$(git -C "${REPOSITORY_ROOT}" status --porcelain=v1 --untracked-files=all)"; then
  echo "Refusing immutable search build: AxWise repository is not clean." >&2
  exit 65
fi

SOURCE_COMMIT="$(git -C "${REPOSITORY_ROOT}" rev-parse --verify HEAD)"
if [[ ! "${SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Could not resolve the exact AxWise source commit." >&2
  exit 65
fi

TEMPORARY_DIRECTORY="$(mktemp -d)"
cleanup() {
  rm -rf -- "${TEMPORARY_DIRECTORY}"
}
trap cleanup EXIT
BUILD_CONTEXT="${TEMPORARY_DIRECTORY}/build-context"
mkdir "${BUILD_CONTEXT}"

# Export only the three reviewed, tracked files from the exact commit. Ignored
# files and unrelated tracked files can never enter Cloud Build source staging.
git -C "${REPOSITORY_ROOT}" archive --format=tar "${SOURCE_COMMIT}" -- \
  deploy/searxng/Dockerfile \
  deploy/searxng/settings.yml \
  deploy/searxng/cloudbuild.workflow-v2.yaml \
  | tar -xf - -C "${BUILD_CONTEXT}" --strip-components=2
for required_file in Dockerfile settings.yml cloudbuild.workflow-v2.yaml; do
  if ! test -f "${BUILD_CONTEXT}/${required_file}"; then
    echo "The immutable search build archive omitted ${required_file}." >&2
    exit 65
  fi
done

BUILD_SERVICE_ACCOUNT="projects/${PROJECT_ID}/serviceAccounts/${BUILD_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
SEARCH_SERVICE_ACCOUNT="${SEARCH_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
EXPECTED_WORKER_ACCOUNT="${EXPECTED_WORKER_SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_CONFIG="${BUILD_CONTEXT}/cloudbuild.workflow-v2.yaml"
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${SOURCE_COMMIT}"
SERVICE_SPEC="${TEMPORARY_DIRECTORY}/search-service.json"
IAM_POLICY_FILE="${TEMPORARY_DIRECTORY}/search-iam-policy.json"

readonly REPOSITORY_ROOT SOURCE_COMMIT TEMPORARY_DIRECTORY BUILD_CONTEXT
readonly BUILD_SERVICE_ACCOUNT SEARCH_SERVICE_ACCOUNT EXPECTED_WORKER_ACCOUNT
readonly BUILD_CONFIG IMAGE_TAG SERVICE_SPEC IAM_POLICY_FILE

verify_expected_worker() {
  local worker_document
  worker_document="$(gcloud run services describe "${WORKER_SERVICE}" \
    --region="${REGION}" --project="${PROJECT_ID}" --format=json)"
  if ! jq -e \
    --arg account "${EXPECTED_WORKER_ACCOUNT}" \
    --arg image "${EXPECTED_AXWISE_WORKER_IMAGE}" '
      .spec.template.spec.serviceAccountName == $account
      and .spec.template.spec.containers[0].image == $image
    ' <<<"${worker_document}" >/dev/null; then
    echo "Refusing search deployment: the Preview worker does not match its expected image and service account." >&2
    exit 77
  fi
}

existing_policy_is_safe() {
  jq -e --arg allowed "serviceAccount:${EXPECTED_WORKER_ACCOUNT}" '
    [
      .bindings[]? as $binding
      | ($binding.members // [])[]?
      | select(
          $binding.role != "roles/run.invoker"
          or . != $allowed
          or ($binding.condition != null)
        )
    ]
    | length == 0
  ' >/dev/null
}

write_service_spec() {
  local base_url="$1"
  jq -n \
    --arg service "${SERVICE}" \
    --arg image "${IMAGE_DIGEST_REF}" \
    --arg account "${SEARCH_SERVICE_ACCOUNT}" \
    --arg base_url "${base_url}" \
    --arg secret "${SECRET}" \
    --arg secret_version "${SECRET_VERSION}" '
      {
        apiVersion: "serving.knative.dev/v1",
        kind: "Service",
        metadata: {
          name: $service,
          annotations: {
            "run.googleapis.com/ingress": "all",
            "run.googleapis.com/invoker-iam-disabled": "false"
          }
        },
        spec: {
          template: {
            metadata: {
              annotations: {
                "autoscaling.knative.dev/maxScale": "2",
                "autoscaling.knative.dev/minScale": "0",
                "run.googleapis.com/cpu-throttling": "true"
              }
            },
            spec: {
              containerConcurrency: 10,
              timeoutSeconds: 60,
              serviceAccountName: $account,
              containers: [
                {
                  name: "searxng",
                  image: $image,
                  ports: [{name: "http1", containerPort: 8080}],
                  env: [
                    {name: "SEARXNG_BASE_URL", value: $base_url},
                    {
                      name: "SEARXNG_SECRET",
                      valueFrom: {
                        secretKeyRef: {name: $secret, key: $secret_version}
                      }
                    }
                  ],
                  resources: {limits: {cpu: "1", memory: "1Gi"}}
                }
              ]
            }
          },
          traffic: [{latestRevision: true, percent: 100}]
        }
      }
    ' >"${SERVICE_SPEC}"
}

verify_exact_search_service() {
  local search_document="$1"
  local expected_url="$2"
  jq -e \
    --arg account "${SEARCH_SERVICE_ACCOUNT}" \
    --arg image "${IMAGE_DIGEST_REF}" \
    --arg url "${expected_url}" \
    --arg base_url "${expected_url}/" \
    --arg secret "${SECRET}" \
    --arg secret_version "${SECRET_VERSION}" '
      .status.url == $url
      and .spec.template.spec.serviceAccountName == $account
      and (.spec.template.spec.containers | length) == 1
      and .spec.template.spec.containers[0].image == $image
      and ((.spec.template.spec.containers[0].command // []) | length) == 0
      and ((.spec.template.spec.containers[0].args // []) | length) == 0
      and ((.spec.template.spec.containers[0].volumeMounts // []) | length) == 0
      and ((.spec.template.spec.volumes // []) | length) == 0
      and ([.spec.template.spec.containers[0].env[]?] | length == 2)
      and (
        [.spec.template.spec.containers[0].env[]?
          | select(.name == "SEARXNG_BASE_URL" and .value == $base_url)]
        | length == 1
      )
      and (
        [.spec.template.spec.containers[0].env[]?
          | select(
              .name == "SEARXNG_SECRET"
              and .valueFrom.secretKeyRef.name == $secret
              and (.valueFrom.secretKeyRef.key | tostring) == $secret_version
            )]
        | length == 1
      )
      and (
        (.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false")
        != "true"
      )
      and (
        (.metadata.annotations["run.googleapis.com/network-interfaces"] // "")
        == ""
      )
      and (
        (.spec.template.metadata.annotations["run.googleapis.com/network-interfaces"] // "")
        == ""
      )
      and (
        (.spec.template.metadata.annotations["run.googleapis.com/vpc-access-connector"] // "")
        == ""
      )
      and (
        (.spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"] // "")
        == ""
      )
    ' <<<"${search_document}" >/dev/null
}

gcloud projects describe "${PROJECT_ID}" >/dev/null
REPOSITORY_DOCUMENT="$(gcloud artifacts repositories describe "${REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" --format=json)"
if ! jq -e '
  .format == "DOCKER"
  and .dockerConfig.immutableTags == true
' <<<"${REPOSITORY_DOCUMENT}" >/dev/null; then
  echo "The Preview Docker repository must enforce immutable tags." >&2
  exit 77
fi
unset REPOSITORY_DOCUMENT
gcloud iam service-accounts describe \
  "${BUILD_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" >/dev/null

# Refuse stale worker authority before the first GCP mutation.
verify_expected_worker

SEARCH_SERVICE_EXISTS=false
set +e
SEARCH_SERVICE_LOOKUP="$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" --format=json 2>&1)"
SEARCH_SERVICE_LOOKUP_STATUS=$?
set -e
if test "${SEARCH_SERVICE_LOOKUP_STATUS}" -eq 0; then
  SEARCH_SERVICE_EXISTS=true
  SEARCH_URL="$(jq -r '.status.url // empty' <<<"${SEARCH_SERVICE_LOOKUP}")"
  if [[ ! "${SEARCH_URL}" =~ ^https://[A-Za-z0-9.-]+\.run\.app$ ]]; then
    echo "The existing search service has no canonical Cloud Run URL." >&2
    exit 77
  fi
  if jq -e '
    (.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false")
    == "true"
  ' <<<"${SEARCH_SERVICE_LOOKUP}" >/dev/null; then
    echo "The existing search service has disabled invoker IAM enforcement." >&2
    exit 77
  fi
  EXISTING_SEARCH_POLICY="$(gcloud run services get-iam-policy "${SERVICE}" \
    --region="${REGION}" --project="${PROJECT_ID}" --format=json)"
  if ! existing_policy_is_safe <<<"${EXISTING_SEARCH_POLICY}"; then
    echo "The existing search service has an unexpected IAM principal or role." >&2
    exit 77
  fi
  unset EXISTING_SEARCH_POLICY
elif [[ "${SEARCH_SERVICE_LOOKUP}" == *"NOT_FOUND"* \
  || "${SEARCH_SERVICE_LOOKUP}" == *"not found"* \
  || "${SEARCH_SERVICE_LOOKUP}" == *"Cannot find service"* \
  || "${SEARCH_SERVICE_LOOKUP}" == *"Not Found"* ]]; then
  SEARCH_URL=""
else
  echo "Could not safely inspect the existing search service." >&2
  exit 1
fi
unset SEARCH_SERVICE_LOOKUP SEARCH_SERVICE_LOOKUP_STATUS

# Refuse an unpinned pre-existing commit tag before any GCP mutation. A missing
# tag is safe to build only because the repository's immutable-tag gate passed.
set +e
IMAGE_LOOKUP_OUTPUT="$(gcloud artifacts docker images describe "${IMAGE_TAG}" \
  --project="${PROJECT_ID}" --format='value(image_summary.digest)' 2>&1)"
IMAGE_LOOKUP_STATUS=$?
set -e

if test "${IMAGE_LOOKUP_STATUS}" -eq 0; then
  IMAGE_DIGEST="${IMAGE_LOOKUP_OUTPUT}"
  if test -z "${EXPECTED_EXISTING_SEARXNG_DIGEST}"; then
    echo "Refusing to adopt an existing search image without EXPECTED_EXISTING_SEARXNG_DIGEST." >&2
    exit 77
  fi
  if test "${IMAGE_DIGEST}" != "${EXPECTED_EXISTING_SEARXNG_DIGEST}"; then
    echo "The existing search-image digest does not match EXPECTED_EXISTING_SEARXNG_DIGEST." >&2
    exit 77
  fi
  BUILD_ID="adopted-explicit-existing-digest"
elif [[ "${IMAGE_LOOKUP_OUTPUT}" == *"NOT_FOUND"* \
  || "${IMAGE_LOOKUP_OUTPUT}" == *"not found"* \
  || "${IMAGE_LOOKUP_OUTPUT}" == *"Not Found"* ]]; then
  if test -n "${EXPECTED_EXISTING_SEARXNG_DIGEST}"; then
    echo "The explicitly expected existing search image tag does not exist." >&2
    exit 77
  fi
  BUILD_ID="$(gcloud builds submit "${BUILD_CONTEXT}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --gcs-source-staging-dir="gs://${BUILD_SOURCE_BUCKET}/source" \
    --service-account="${BUILD_SERVICE_ACCOUNT}" \
    --config="${BUILD_CONFIG}" \
    --substitutions="_IMAGE_NAME=${IMAGE_TAG}" \
    --format='value(id)' --quiet)"
  if [[ ! "${BUILD_ID}" =~ ^[a-f0-9-]{20,80}$ ]]; then
    echo "Cloud Build did not return an exact build ID." >&2
    exit 1
  fi
  IMAGE_DIGEST="$(gcloud artifacts docker images describe "${IMAGE_TAG}" \
    --project="${PROJECT_ID}" --format='value(image_summary.digest)')"
else
  echo "Could not inspect the immutable full-commit search-image tag." >&2
  exit 1
fi
unset IMAGE_LOOKUP_OUTPUT IMAGE_LOOKUP_STATUS

if [[ ! "${IMAGE_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "Artifact Registry did not return an exact search-image digest." >&2
  exit 1
fi
IMAGE_DIGEST_REF="${IMAGE_TAG%:*}@${IMAGE_DIGEST}"
readonly BUILD_ID IMAGE_DIGEST IMAGE_DIGEST_REF

# Everything below this line mutates only pinned Preview search resources.
if ! gcloud iam service-accounts describe "${SEARCH_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SEARCH_ACCOUNT_ID}" \
    --project="${PROJECT_ID}" \
    --display-name="AxWise v2 Preview private search" \
    --quiet >/dev/null
fi

if ! gcloud secrets describe "${SECRET}" --project="${PROJECT_ID}" \
  >/dev/null 2>&1; then
  gcloud secrets create "${SECRET}" --project="${PROJECT_ID}" \
    --replication-policy=automatic --quiet >/dev/null
fi

latest_enabled_secret_version() {
  local name
  name="$(gcloud secrets versions list "${SECRET}" --project="${PROJECT_ID}" \
    --filter='state=ENABLED' --sort-by='~createTime' --limit=1 \
    --format='value(name)')"
  printf '%s' "${name##*/}"
}

SECRET_VERSION="$(latest_enabled_secret_version)"
if test -z "${SECRET_VERSION}"; then
  openssl rand -hex 32 | gcloud secrets versions add "${SECRET}" \
    --project="${PROJECT_ID}" --data-file=- --quiet >/dev/null
  SECRET_VERSION="$(latest_enabled_secret_version)"
fi
if [[ ! "${SECRET_VERSION}" =~ ^[1-9][0-9]*$ ]]; then
  echo "The SearXNG secret has no enabled numeric version." >&2
  exit 78
fi
readonly SECRET_VERSION

gcloud secrets add-iam-policy-binding "${SECRET}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${SEARCH_SERVICE_ACCOUNT}" \
  --role=roles/secretmanager.secretAccessor --quiet >/dev/null

# Recheck immediately before a new secret-bearing search revision could become
# reachable by the worker's already-pinned identity.
verify_expected_worker

if test "${SEARCH_SERVICE_EXISTS}" = false; then
  # A new service has no invoker binding. Bootstrap its stable URL with an exact,
  # private one-container spec, then replace that spec with its canonical URL.
  write_service_spec "https://pending.invalid/"
  gcloud run services replace "${SERVICE_SPEC}" \
    --region="${REGION}" --project="${PROJECT_ID}" --quiet >/dev/null
  SEARCH_URL="$(gcloud run services describe "${SERVICE}" \
    --region="${REGION}" --project="${PROJECT_ID}" \
    --format='value(status.url)')"
  if [[ ! "${SEARCH_URL}" =~ ^https://[A-Za-z0-9.-]+\.run\.app$ ]]; then
    echo "The search service did not receive a canonical Cloud Run URL." >&2
    exit 77
  fi
fi

write_service_spec "${SEARCH_URL}/"
gcloud run services replace "${SERVICE_SPEC}" \
  --region="${REGION}" --project="${PROJECT_ID}" --quiet >/dev/null

SEARCH_DOCUMENT="$(gcloud run services describe "${SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" --format=json)"
if ! verify_exact_search_service "${SEARCH_DOCUMENT}" "${SEARCH_URL}"; then
  echo "The deployed search service does not match the exact isolated specification." >&2
  exit 77
fi
unset SEARCH_DOCUMENT

# The worker is deliberately read-only to this helper. Recheck its exact image
# and identity immediately before granting the only service invoker binding.
verify_expected_worker
CURRENT_SEARCH_POLICY="$(gcloud run services get-iam-policy "${SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" --format=json)"
jq --arg member "serviceAccount:${EXPECTED_WORKER_ACCOUNT}" '
  . as $policy
  | {
      version: ($policy.version // 1),
      bindings: [{role: "roles/run.invoker", members: [$member]}]
    }
    + (
      if ($policy.etag | type) == "string"
      then {etag: $policy.etag}
      else {}
      end
    )
' <<<"${CURRENT_SEARCH_POLICY}" >"${IAM_POLICY_FILE}"
unset CURRENT_SEARCH_POLICY
gcloud run services set-iam-policy "${SERVICE}" "${IAM_POLICY_FILE}" \
  --region="${REGION}" --project="${PROJECT_ID}" --quiet >/dev/null

SEARCH_POLICY="$(gcloud run services get-iam-policy "${SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" --format=json)"
if ! jq -e --arg member "serviceAccount:${EXPECTED_WORKER_ACCOUNT}" '
  .bindings == [{role: "roles/run.invoker", members: [$member]}]
' <<<"${SEARCH_POLICY}" >/dev/null; then
  echo "The search service IAM policy is not the exact worker-only policy." >&2
  exit 77
fi
unset SEARCH_POLICY

echo "AXWISE_COMMIT=${SOURCE_COMMIT}"
echo "SEARCH_BUILD_ID=${BUILD_ID}"
echo "SEARCH_IMAGE=${IMAGE_DIGEST_REF}"
echo "SEARCH_SERVICE_URL=${SEARCH_URL}"
echo "SEARCH_SECRET_VERSION=${SECRET_VERSION}"
echo "SEARCH_WORKER_AUTHORIZED=${WORKER_SERVICE}"
