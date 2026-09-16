#!/usr/bin/env bash
set -euo pipefail
set +x

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${script_directory}/common.sh"

PRINCIPAL_SIGNING_KEY_SECRET_VERSION="${PRINCIPAL_SIGNING_KEY_SECRET_VERSION:?set the numeric principal signing-key secret version}"
traffic_snapshot_program="${script_directory}/cloud-run-traffic-snapshot.jq"
candidate_suffix="agent-$(date -u +%m%d%H%M%S)-${BASHPID:-$$}"
candidate_revision="${ORQALY_API_SERVICE}-${candidate_suffix}"
probe_tag="ap-${candidate_suffix}"
readonly PRINCIPAL_SIGNING_KEY_SECRET_VERSION traffic_snapshot_program
readonly candidate_suffix candidate_revision probe_tag

agentic_preview_require_tools curl gcloud jq
agentic_preview_assert_foundation
agentic_preview_require_numeric_secret_version "${PRINCIPAL_SIGNING_KEY_SECRET}" \
  "${PRINCIPAL_SIGNING_KEY_SECRET_VERSION}"

control_document="$(gcloud run services describe "${CONTROL_PLANE_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
api_document="$(gcloud run services describe "${ORQALY_API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! jq -e '
  .metadata.annotations["run.googleapis.com/ingress"] == "internal"
  and (.metadata.annotations["run.googleapis.com/invoker-iam-disabled"] // "false") != "true"
  ' <<<"${control_document}" >/dev/null; then
  echo "The exact private Agent control plane must be deployed first." >&2
  exit 77
fi
if ! agentic_preview_assert_service_origin_document \
  "${control_document}" "${CONTROL_PLANE_ORIGIN}"; then
  echo "The Agent control plane does not advertise its deterministic Preview origin." >&2
  exit 77
fi
if ! jq -e --arg network "${VPC_NETWORK}" --arg subnet "${VPC_SUBNET}" '
  .spec.template.metadata.annotations["run.googleapis.com/vpc-access-egress"] == "all-traffic"
  and ((.spec.template.metadata.annotations["run.googleapis.com/network-interfaces"] | fromjson)
    | any(.network == $network and .subnetwork == $subnet))
  ' <<<"${api_document}" >/dev/null; then
  echo "Orqaly API must retain all-traffic egress through the exact Preview VPC/subnet." >&2
  exit 77
fi

service_uid="$(jq -r '.metadata.uid // empty' <<<"${api_document}")"
previous_traffic_snapshot="$(jq -c -f "${traffic_snapshot_program}" \
  <<<"${api_document}")" || {
  echo "Orqaly API has no exact restorable traffic map." >&2
  exit 77
}
previous_allocations="$(jq -r '
  .allocations | map(.target + "=" + (.percent | tostring)) | join(",")
' <<<"${previous_traffic_snapshot}")"
previous_tags="$(jq -r '
  .tags | map(.tag + "=" + .target) | join(",")
' <<<"${previous_traffic_snapshot}")"
readonly service_uid previous_traffic_snapshot previous_allocations previous_tags

probe_tag_active=false
cleanup_probe_tag() {
  if test "${probe_tag_active}" != true; then
    return
  fi
  if ! gcloud run services update-traffic "${ORQALY_API_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" \
    --remove-tags="${probe_tag}" --quiet >/dev/null; then
    echo "WARNING: failed to remove temporary candidate probe tag ${probe_tag}." >&2
  fi
}
trap cleanup_probe_tag EXIT

restore_previous_traffic() {
  local owned_generation="$1"
  local owned_document
  local restored_document restored_snapshot
  local -a tag_option
  owned_document="$(gcloud run services describe "${ORQALY_API_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)" || return 1
  if ! jq -e --arg uid "${service_uid}" --arg candidate "${candidate_revision}" \
    --argjson generation "${owned_generation}" '
      .metadata.uid == $uid
      and .metadata.generation == $generation
      and .status.observedGeneration == $generation
      and .status.latestCreatedRevisionName == $candidate
      and ([.status.traffic[]? | select((.percent // 0) > 0)
        | select(.revisionName == $candidate) | .percent] | add // 0) == 100
    ' <<<"${owned_document}" >/dev/null; then
    echo "CRITICAL: refusing to roll back traffic not owned by this invocation." >&2
    return 1
  fi
  if test -n "${previous_tags}"; then
    tag_option=(--set-tags="${previous_tags}")
  else
    tag_option=(--clear-tags)
  fi
  if ! gcloud run services update-traffic "${ORQALY_API_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" \
    --to-revisions="${previous_allocations}" "${tag_option[@]}" --quiet >/dev/null; then
    echo "CRITICAL: failed to restore the previous Orqaly API traffic map." >&2
    return 1
  fi
  restored_document="$(gcloud run services describe "${ORQALY_API_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)" || return 1
  restored_snapshot="$(jq -c -f "${traffic_snapshot_program}" \
    <<<"${restored_document}")" || return 1
  if test "${restored_snapshot}" != "${previous_traffic_snapshot}" \
    || ! jq -e --arg uid "${service_uid}" '
      .metadata.uid == $uid
      and .status.observedGeneration == .metadata.generation
    ' <<<"${restored_document}" >/dev/null; then
    echo "CRITICAL: previous Orqaly API traffic was not restored exactly." >&2
    return 1
  fi
}

probe_tag_active=true
gcloud run services update "${ORQALY_API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --update-env-vars="AGENTIC_CONTROL_PLANE_URL=${CONTROL_PLANE_ORIGIN},AGENTIC_PRINCIPAL_AUDIENCE=${PRINCIPAL_AUDIENCE},AGENTIC_CONTROL_PLANE_USE_ID_TOKEN=true" \
  --update-secrets="AGENTIC_PRINCIPAL_SIGNING_KEY=${PRINCIPAL_SIGNING_KEY_SECRET}:${PRINCIPAL_SIGNING_KEY_SECRET_VERSION}" \
  --revision-suffix="${candidate_suffix}" --tag="${probe_tag}" --no-traffic \
  --quiet >/dev/null

updated_document="$(gcloud run services describe "${ORQALY_API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! jq -e --arg network "${VPC_NETWORK}" --arg subnet "${VPC_SUBNET}" \
  --arg uid "${service_uid}" --arg candidate "${candidate_revision}" '
  .metadata.uid == $uid
  and .status.observedGeneration == .metadata.generation
  and .status.latestCreatedRevisionName == $candidate
  and .spec.template.metadata.annotations["run.googleapis.com/vpc-access-egress"] == "all-traffic"
  and ((.spec.template.metadata.annotations["run.googleapis.com/network-interfaces"] | fromjson)
    | any(.network == $network and .subnetwork == $subnet))
  ' <<<"${updated_document}" >/dev/null; then
  echo "The API update raced another deployment or did not preserve its exact network route." >&2
  exit 77
fi

candidate_document="$(gcloud run revisions describe "${candidate_revision}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! jq -e \
  --arg origin "${CONTROL_PLANE_ORIGIN}" \
  --arg audience "${PRINCIPAL_AUDIENCE}" \
  --arg secret "${PRINCIPAL_SIGNING_KEY_SECRET}" \
  --arg version "${PRINCIPAL_SIGNING_KEY_SECRET_VERSION}" '
    def env($name): [.spec.containers[0].env[]? | select(.name == $name)];
    (env("AGENTIC_CONTROL_PLANE_URL") | length == 1 and .[0].value == $origin)
    and (env("AGENTIC_PRINCIPAL_AUDIENCE") | length == 1 and .[0].value == $audience)
    and (env("AGENTIC_CONTROL_PLANE_USE_ID_TOKEN") | length == 1 and .[0].value == "true")
    and (env("AGENTIC_PRINCIPAL_SIGNING_KEY") | length == 1
      and .[0].valueFrom.secretKeyRef.name == $secret
      and .[0].valueFrom.secretKeyRef.key == $version)
    and any(.status.conditions[]?; .type == "Ready" and .status == "True")
  ' <<<"${candidate_document}" >/dev/null; then
  echo "The exact connected API candidate is not ready or has the wrong Agent configuration." >&2
  exit 77
fi

candidate_url="$(jq -r --arg revision "${candidate_revision}" --arg tag "${probe_tag}" '
  [.status.traffic[]?
    | select(.revisionName == $revision and .tag == $tag)
    | .url][0] // empty
' <<<"${updated_document}")"
if test -z "${candidate_url}" \
  || ! curl -fsS --max-time 30 "${candidate_url}/readyz" \
    | jq -e '
      .status == "ok"
      and .database == "ok"
      and .environment == "preview"
    ' >/dev/null; then
  echo "The tagged Agent-enabled API candidate failed its active readiness probe." >&2
  exit 1
fi
if ! gcloud run services update-traffic "${ORQALY_API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --remove-tags="${probe_tag}" --quiet >/dev/null; then
  echo "The temporary Agent candidate probe tag could not be removed." >&2
  exit 1
fi
probe_tag_active=false

pre_promotion_document="$(gcloud run services describe "${ORQALY_API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
pre_promotion_snapshot="$(jq -c -f "${traffic_snapshot_program}" \
  <<<"${pre_promotion_document}")" || {
  echo "The effective API traffic became unreadable before promotion." >&2
  exit 77
}
pre_promotion_generation="$(jq -r '.metadata.generation // empty' \
  <<<"${pre_promotion_document}")"
pre_promotion_resource_version="$(jq -r '.metadata.resourceVersion // empty' \
  <<<"${pre_promotion_document}")"
if test "${pre_promotion_snapshot}" != "${previous_traffic_snapshot}" \
  || ! [[ "${pre_promotion_generation}" =~ ^[1-9][0-9]*$ ]] \
  || test -z "${pre_promotion_resource_version}" \
  || ! jq -e --arg uid "${service_uid}" --arg candidate "${candidate_revision}" '
    .metadata.uid == $uid
    and .status.observedGeneration == .metadata.generation
    and .status.latestCreatedRevisionName == $candidate
  ' <<<"${pre_promotion_document}" >/dev/null; then
  echo "The Agent candidate changed before promotion; traffic remains unchanged." >&2
  exit 77
fi
expected_promotion_generation="$((pre_promotion_generation + 1))"
readonly pre_promotion_snapshot pre_promotion_generation
readonly pre_promotion_resource_version expected_promotion_generation

recover_promotion_failure() {
  local reason="$1" current_document current_snapshot current_generation
  current_document="$(gcloud run services describe "${ORQALY_API_SERVICE}" \
    --project="${PROJECT_ID}" --region="${REGION}" --format=json)" || return 2
  current_snapshot="$(jq -c -f "${traffic_snapshot_program}" \
    <<<"${current_document}")" || return 2
  current_generation="$(jq -r '.metadata.generation // empty' <<<"${current_document}")"
  if test "${current_snapshot}" = "${previous_traffic_snapshot}" \
    && test "${current_generation}" = "${pre_promotion_generation}" \
    && jq -e --arg resource_version "${pre_promotion_resource_version}" '
      .metadata.resourceVersion == $resource_version
      and .status.observedGeneration == .metadata.generation
    ' <<<"${current_document}" >/dev/null; then
    echo "${reason}; effective traffic was unchanged." >&2
    return 0
  fi
  if ! jq -e --arg uid "${service_uid}" --arg candidate "${candidate_revision}" \
    --argjson generation "${expected_promotion_generation}" '
      .metadata.uid == $uid
      and .metadata.generation == $generation
      and .status.observedGeneration == $generation
      and .status.latestCreatedRevisionName == $candidate
      and ([.status.traffic[]? | select((.percent // 0) > 0)
        | select(.revisionName == $candidate) | .percent] | add // 0) == 100
    ' <<<"${current_document}" >/dev/null; then
    echo "CRITICAL: ${reason}; current traffic is not provably owned by this invocation." >&2
    return 2
  fi
  if ! restore_previous_traffic "${expected_promotion_generation}"; then
    echo "CRITICAL: ${reason}; exact rollback failed." >&2
    return 2
  fi
  echo "${reason}; previous effective traffic was restored and verified." >&2
}

if ! gcloud run services update-traffic "${ORQALY_API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" \
  --to-revisions="${candidate_revision}=100" --quiet >/dev/null; then
  recover_promotion_failure "The connected API candidate could not be promoted" || exit 2
  exit 1
fi

serving_document="$(gcloud run services describe "${ORQALY_API_SERVICE}" \
  --project="${PROJECT_ID}" --region="${REGION}" --format=json)"
if ! jq -e --arg revision "${candidate_revision}" --arg uid "${service_uid}" \
  --argjson generation "${expected_promotion_generation}" '
    .metadata.uid == $uid
    and .metadata.generation == $generation
    and .status.observedGeneration == $generation
    and .status.latestCreatedRevisionName == $revision
    and .status.latestReadyRevisionName == $revision
    and ([.status.traffic[]? | select(.revisionName == $revision) | (.percent // 0)]
      | add // 0) == 100
  ' <<<"${serving_document}" >/dev/null; then
  recover_promotion_failure "The connected API candidate failed post-promotion verification" \
    || exit 2
  exit 1
fi

echo "Orqaly API now reaches the private Agent control plane with IAM and signed user scope."
