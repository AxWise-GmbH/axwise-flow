#!/usr/bin/env bash
# Local dev worker loop — polls /api/agent?path=process-next every 15s with
# the WORKER_SECRET pulled from .env.local. Standalone script because shell
# escaping inside package.json + concurrently is fragile with multi-line
# .env.local files.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "[worker] .env.local not found; sleeping forever" >&2
  sleep 999999
fi

WORKER_SECRET="$(grep -E '^WORKER_SECRET=' .env.local | head -n1 | cut -d= -f2-)"
if [ -z "${WORKER_SECRET}" ]; then
  echo "[worker] WORKER_SECRET missing from .env.local; sleeping forever" >&2
  sleep 999999
fi

echo "[worker] loop starting (15s interval)"
sleep 5
while true; do
  curl -s -o /dev/null -w "[worker] %{http_code} %{time_total}s\n" \
    --max-time 30 \
    -X POST \
    -H "Authorization: Bearer ${WORKER_SECRET}" \
    'http://localhost:3001/api/agent?path=process-next' || true
  sleep 15
done
