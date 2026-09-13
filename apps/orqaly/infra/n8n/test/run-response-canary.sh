#!/usr/bin/env bash
set -euo pipefail

task_root="$(cd "$(dirname "$0")/../../.." && pwd)"
task_container="orqaly-response-canary-$$"
task_image='docker.io/n8nio/n8n:2.37.10@sha256:307d6065be25619aa24cfc63a7c2f04ca56d084a08c05c8e9f189a89f353b1ec'

# No ports, external network, credentials, volumes or customer data. The only
# writable database is tmpfs in this disposable container.
docker run --rm --detach --name "$task_container" --network none \
  --add-host fixture.internal:127.0.0.1 \
  --tmpfs /home/node/.n8n:uid=1000,gid=1000,mode=700 \
  --mount "type=bind,source=$task_root/infra/n8n/test,target=/opt/canary,readonly" \
  --mount "type=bind,source=$task_root/infra/n8n/workflows/tool-gateway-connector-v1.json,target=/opt/production-workflow.json,readonly" \
  -e N8N_DIAGNOSTICS_ENABLED=false -e N8N_VERSION_NOTIFICATIONS_ENABLED=false \
  -e N8N_TEMPLATES_ENABLED=false -e N8N_SSRF_PROTECTION_ENABLED=true \
  -e N8N_SSRF_ALLOWED_HOSTNAMES=fixture.internal \
  --entrypoint /bin/sh "$task_image" \
  -c 'node /opt/canary/response-canary.mjs serve & n8n import:workflow --input=/opt/canary/response-canary.workflow.json && n8n publish:workflow --id=orqalyResponseCanary && exec n8n start' >/dev/null
trap 'docker stop "$task_container" >/dev/null 2>&1 || true' EXIT
docker exec "$task_container" node /opt/canary/response-canary.mjs verify
