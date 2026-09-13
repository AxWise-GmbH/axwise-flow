#!/bin/sh
set -eu

readonly workflow_file=/opt/orqaly/workflows/tool-gateway-connector-v1.json
readonly workflow_id=orqalyToolGwV1
readonly expected_hash=bb70d048e588eb2be1ae706668e3c2016a4fc2b876c2830ba2f65838c1ca823b

actual_hash="$(sha256sum "${workflow_file}" | cut -d ' ' -f 1)"
if [ "${actual_hash}" != "${expected_hash}" ]; then
  echo "workflow_content_hash_mismatch" >&2
  exit 1
fi

n8n import:workflow --input="${workflow_file}"

case "${ORQALY_N8N_WORKFLOW_STATE:-unpublished}" in
  published)
    n8n publish:workflow --id="${workflow_id}"
    ;;
  unpublished)
    n8n unpublish:workflow --id="${workflow_id}"
    ;;
  *)
    echo "ORQALY_N8N_WORKFLOW_STATE must be published or unpublished" >&2
    exit 1
    ;;
esac

echo "workflow_bootstrap_complete id=${workflow_id} state=${ORQALY_N8N_WORKFLOW_STATE:-unpublished} sha256=${actual_hash}"
