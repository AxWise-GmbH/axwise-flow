#!/usr/bin/env bash

# Build an immutable image, quiesce the worker, migrate, then deploy API and worker.
# Required credentials must already exist in Google Secret Manager.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ID="${PROJECT_ID:-axwise-73425}"
REGION="${REGION:-europe-west4}"
API_SERVICE="${API_SERVICE:-axwise-backend}"
WORKER_SERVICE="${WORKER_SERVICE:-axwise-orqaly-worker}"
SCOPE_WORKER_SERVICE="${SCOPE_WORKER_SERVICE:-axwise-orqaly-scope-worker}"
MIGRATION_JOB="${MIGRATION_JOB:-axwise-db-migrate}"
REPOSITORY="${REPOSITORY:-axwise-backend-repo}"
REVISION="${REVISION:-$(git rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${API_SERVICE}:${REVISION}"
GEMINI_MODEL="${GEMINI_MODEL:-models/gemini-3.8-flash}"
OPENREGISTER_SECRET="${OPENREGISTER_SECRET:-OPENREGISTER_API_KEY}"
REQUIRE_OPENREGISTER="${REQUIRE_OPENREGISTER:-false}"
SEARXNG_SERVICE="${SEARXNG_SERVICE:-axwise-searxng}"
SEARXNG_URL="${SEARXNG_URL:-}"
SEARXNG_PREFLIGHT_TIMEOUT_SECONDS="${SEARXNG_PREFLIGHT_TIMEOUT_SECONDS:-30}"
AXWISE_MARKET_CELL_CONCURRENCY="${AXWISE_MARKET_CELL_CONCURRENCY:-6}"
AXWISE_PERSONA_CONCURRENCY="${AXWISE_PERSONA_CONCURRENCY:-5}"
AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS="${AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS:-}"
ENABLE_CLERK_VALIDATION="${ENABLE_CLERK_VALIDATION:-true}"

if [[ "${REQUIRE_OPENREGISTER}" != "true" && "${REQUIRE_OPENREGISTER}" != "false" ]]; then
  echo "REQUIRE_OPENREGISTER must be true or false" >&2
  exit 1
fi

for concurrency in "${AXWISE_MARKET_CELL_CONCURRENCY}" "${AXWISE_PERSONA_CONCURRENCY}"; do
  if [[ ! "${concurrency}" =~ ^[1-8]$ ]]; then
    echo "Research concurrency values must be integers from 1 to 8" >&2
    exit 1
  fi
done

if [[ ! "${SEARXNG_PREFLIGHT_TIMEOUT_SECONDS}" =~ ^[1-9][0-9]?$ ]]; then
  echo "SEARXNG_PREFLIGHT_TIMEOUT_SECONDS must be an integer from 1 to 99" >&2
  exit 1
fi

if [[ -n "${AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS}" && "${AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS}" != "physical_product" ]]; then
  echo "AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS must be empty or physical_product" >&2
  exit 1
fi

if [[ "${ENABLE_CLERK_VALIDATION}" != "true" ]]; then
  echo "Production deployment requires ENABLE_CLERK_VALIDATION=true" >&2
  exit 1
fi

required_secrets=(
  DATABASE_URL
  CLERK_SECRET_KEY
  GEMINI_API_KEY
  AXWISE_AUTHORITY_PROOF_SECRET
  ORQALY_API_KEY
  axwise-orqaly-m2m-key
  axwise-orqaly-webhook-signing-secret
)

for secret in "${required_secrets[@]}"; do
  gcloud secrets describe "${secret}" --project "${PROJECT_ID}" >/dev/null
done

# Authority attestations are only meaningful when every serving process uses a
# strong shared signing secret. Validate the latest value before the image is
# built, consume it only through stdin, and never print or interpolate it.
if ! gcloud secrets versions access latest \
  --secret AXWISE_AUTHORITY_PROOF_SECRET \
  --project "${PROJECT_ID}" \
  | python3 -c 'import sys
value = sys.stdin.buffer.read()
try:
    value.decode("utf-8")
except UnicodeDecodeError:
    raise SystemExit(1)
raise SystemExit(0 if len(value) >= 32 else 1)'
then
  echo "Latest AXWISE_AUTHORITY_PROOF_SECRET must be valid UTF-8 and at least 32 bytes" >&2
  exit 1
fi

# Google Search grounding uses GEMINI_API_KEY. OpenRegister is optional for
# hybrid web+registry research, but when its Secret Manager entry exists the
# durable worker receives it without exposing the value in this script. Set
# REQUIRE_OPENREGISTER=true for a release that must not proceed without
# registry-backed grounding.
WORKER_SECRET_BINDINGS="DATABASE_URL=DATABASE_URL:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ORQALY_API_KEY=ORQALY_API_KEY:latest,AXWISE_API_KEY=axwise-orqaly-m2m-key:latest,AXWISE_WEBHOOK_SIGNING_SECRET=axwise-orqaly-webhook-signing-secret:latest,AXWISE_AUTHORITY_PROOF_SECRET=AXWISE_AUTHORITY_PROOF_SECRET:latest"
WORKER_ENV_VARS="^@^ENVIRONMENT=production@LLM_PROVIDER=gemini@GEMINI_MODEL=${GEMINI_MODEL}@GEMINI_SEARCH_MODEL=${GEMINI_MODEL}@GEMINI_TEXT_MODEL=${GEMINI_MODEL}@STAKEHOLDER_GEMINI_MODEL=${GEMINI_MODEL}@MAX_PERSONAS=5@AXWISE_MARKET_CELL_CONCURRENCY=${AXWISE_MARKET_CELL_CONCURRENCY}@AXWISE_PERSONA_CONCURRENCY=${AXWISE_PERSONA_CONCURRENCY}@WORKER_POLL_SECONDS=1@AXWISE_WEBHOOK_ALLOWED_HOSTS=orqanix.com,api.orqanix.com@AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS=${AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS}@AXWISE_BUILD_REVISION=${REVISION}"
if gcloud secrets describe "${OPENREGISTER_SECRET}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  WORKER_SECRET_BINDINGS="${WORKER_SECRET_BINDINGS},OPENREGISTER_API_KEY=${OPENREGISTER_SECRET}:latest"
  echo "OpenRegister grounding enabled from Secret Manager secret ${OPENREGISTER_SECRET}"
elif [[ "${REQUIRE_OPENREGISTER}" == "true" ]]; then
  echo "Required Secret Manager secret ${OPENREGISTER_SECRET} is unavailable" >&2
  exit 1
else
  echo "OpenRegister secret ${OPENREGISTER_SECRET} is unavailable; grounded research will use Google Search sources and fail closed if its source policy is not satisfied" >&2
fi

# Resolve the private SearXNG service from Cloud Run instead of trusting a
# copied URL. Cloud Run URLs are project/service specific; accepting an old URL
# here silently turned every secondary search into a 404 in production.
DISCOVERED_SEARXNG_URL="$(gcloud run services describe "${SEARXNG_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.url)')"
DISCOVERED_SEARXNG_URL="${DISCOVERED_SEARXNG_URL%/}"
if [[ -z "${DISCOVERED_SEARXNG_URL}" ]]; then
  echo "Could not determine the ${SEARXNG_SERVICE} Cloud Run URL" >&2
  exit 1
fi
if [[ "${DISCOVERED_SEARXNG_URL}" == *"@"* ]] || [[ ! "${DISCOVERED_SEARXNG_URL}" =~ ^https:// ]]; then
  echo "Discovered SearXNG URL must be a credential-free HTTPS endpoint" >&2
  exit 1
fi

if [[ -n "${SEARXNG_URL}" ]]; then
  SEARXNG_URL="${SEARXNG_URL%/}"
  if [[ "${SEARXNG_URL}" == *"@"* ]] || [[ ! "${SEARXNG_URL}" =~ ^https:// ]]; then
    echo "SEARXNG_URL must be a credential-free HTTPS endpoint" >&2
    exit 1
  fi
  if [[ "${SEARXNG_URL}" != "${DISCOVERED_SEARXNG_URL}" ]]; then
    echo "SEARXNG_URL does not match the live ${SEARXNG_SERVICE} Cloud Run URL" >&2
    exit 1
  fi
else
  SEARXNG_URL="${DISCOVERED_SEARXNG_URL}"
fi
if [[ "${SEARXNG_URL}" == */search ]]; then
  echo "SEARXNG_URL must be the service base URL, not the /search endpoint" >&2
  exit 1
fi

# Pin the worker identity explicitly. Verify its Cloud Run Invoker IAM binding,
# then use the already-authenticated deploy principal for a real JSON search
# preflight. This avoids requiring Service Account Token Creator solely for a
# release check while proving both halves of the production contract.
WORKER_SERVICE_ACCOUNT="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(spec.template.spec.serviceAccountName)')"
if [[ -z "${WORKER_SERVICE_ACCOUNT}" ]]; then
  echo "Could not determine the AxWise worker service account" >&2
  exit 1
fi
WORKER_STABLE_URL="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.url)')"
if [[ -z "${WORKER_STABLE_URL}" ]]; then
  echo "Could not determine the stable AxWise worker service URL" >&2
  exit 1
fi
SCOPE_WORKER_EXISTS=false
SCOPE_WORKER_STABLE_URL=""
if gcloud run services describe "${SCOPE_WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" >/dev/null 2>&1; then
  SCOPE_WORKER_EXISTS=true
  SCOPE_WORKER_STABLE_URL="$(gcloud run services describe "${SCOPE_WORKER_SERVICE}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --format='value(status.url)')"
fi

if ! gcloud run services get-iam-policy "${SEARXNG_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --flatten='bindings[].members' \
  --filter="bindings.role=roles/run.invoker AND bindings.members=serviceAccount:${WORKER_SERVICE_ACCOUNT}" \
  --format='value(bindings.members)' \
  | grep -Fxq "serviceAccount:${WORKER_SERVICE_ACCOUNT}"; then
  echo "Worker service account lacks roles/run.invoker on ${SEARXNG_SERVICE}" >&2
  exit 1
fi

SEARXNG_URL="${SEARXNG_URL}" \
SEARXNG_PREFLIGHT_TIMEOUT_SECONDS="${SEARXNG_PREFLIGHT_TIMEOUT_SECONDS}" \
python3 - <<'PY'
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

base_url = os.environ["SEARXNG_URL"].rstrip("/")
timeout = int(os.environ["SEARXNG_PREFLIGHT_TIMEOUT_SECONDS"])
try:
    token = subprocess.run(
        [
            "gcloud",
            "auth",
            "print-identity-token",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    ).stdout.strip()
except (subprocess.SubprocessError, OSError) as exc:
    raise SystemExit(
        f"Could not obtain the deploy identity token for SearXNG preflight: {type(exc).__name__}"
    ) from None
if not token:
    raise SystemExit("Deploy identity token for SearXNG preflight was empty")

query = urllib.parse.urlencode(
    {
        "q": "AxWise deployment preflight",
        "format": "json",
        "categories": "general",
        "safesearch": "1",
    }
)
request = urllib.request.Request(
    f"{base_url}/search?{query}",
    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
)
import ssl
try:
    import certifi
    ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    ctx = ssl.create_default_context()
try:
    with urllib.request.urlopen(request, timeout=timeout, context=ctx) as response:
        status = int(response.status)
        content_type = response.headers.get_content_type()
        body = response.read(2_000_001)
except urllib.error.HTTPError as exc:
    raise SystemExit(f"Authenticated SearXNG preflight returned HTTP {exc.code}") from None
except (urllib.error.URLError, TimeoutError, OSError) as exc:
    raise SystemExit(
        f"Authenticated SearXNG preflight failed: {type(exc).__name__}"
    ) from None
if status != 200:
    raise SystemExit(f"Authenticated SearXNG preflight returned HTTP {status}")
if content_type != "application/json":
    raise SystemExit(
        f"Authenticated SearXNG preflight returned non-JSON content type {content_type}"
    )
if len(body) > 2_000_000:
    raise SystemExit("Authenticated SearXNG preflight response exceeded 2 MB")
try:
    payload = json.loads(body)
except (json.JSONDecodeError, UnicodeDecodeError):
    raise SystemExit("Authenticated SearXNG preflight returned invalid JSON") from None
if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
    raise SystemExit("Authenticated SearXNG preflight returned an invalid search schema")
unresponsive = payload.get("unresponsive_engines") or []
if payload["results"]:
    print(
        "SearXNG preflight search route healthy; "
        f"results={len(payload['results'])} unresponsive_engines={len(unresponsive)}"
    )
else:
    print(
        "SearXNG preflight search route reachable but returned no results; "
        f"unresponsive_engines={len(unresponsive)}",
        file=sys.stderr,
    )
PY

WORKER_ENV_VARS="${WORKER_ENV_VARS}@SEARXNG_URL=${SEARXNG_URL}@SEARXNG_AUTH_MODE=google_identity"
echo "Authenticated private SearXNG preflight passed"

# Traffic tags address a revision directly even at 0% ordinary traffic. When
# combined with a historical revision-level minimum, an old pull worker stays
# alive and can claim new jobs. Clear every worker tag before the release starts
# and fail closed unless Cloud Run confirms the tag aliases are gone. This does
# not change the service's stable status.url or its existing traffic assignment.
echo "Clearing stale worker revision tags before deployment"
gcloud run services update-traffic "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --clear-tags
python3 "${SCRIPT_DIR}/verify_cloud_run_worker_release.py" \
  --service "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --tags-only
if [[ "${SCOPE_WORKER_EXISTS}" == "true" ]]; then
  gcloud run services update-traffic "${SCOPE_WORKER_SERVICE}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --clear-tags
  python3 "${SCRIPT_DIR}/verify_cloud_run_worker_release.py" \
    --service "${SCOPE_WORKER_SERVICE}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --tags-only
fi

echo "Building ${IMAGE}"
gcloud builds submit \
  --config cloudbuild.yaml \
  --region "${REGION}" \
  --substitutions "_IMAGE_NAME=${IMAGE}" \
  --project "${PROJECT_ID}" \
  .

# Stop queue consumption before switching the API or starting the new poller.
# Cloud Run provisions a new revision before retiring the previous revision, so
# a direct poller-to-poller deploy creates a window where either build can win a
# database claim. The quiescence revision serves health checks but never opens
# the durable queue. The release proceeds only after Cloud Run reports every
# previous revision retired with zero desired replicas.
QUIESCENCE_SUFFIX="${REVISION}-quiesce"
EXPECTED_QUIESCENCE_REVISION="${WORKER_SERVICE}-${QUIESCENCE_SUFFIX}"
if (( ${#EXPECTED_QUIESCENCE_REVISION} > 63 )); then
  echo "Quiescence worker revision name exceeds Cloud Run's 63-character limit" >&2
  exit 1
fi

echo "Stopping durable Orqaly queue consumption for release"
gcloud run deploy "${WORKER_SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --revision-suffix "${QUIESCENCE_SUFFIX}" \
  --no-allow-unauthenticated \
  --service-account "${WORKER_SERVICE_ACCOUNT}" \
  --command python \
  --args=-m,backend.scripts.run_orqaly_hybrid_worker_service \
  --memory 8Gi \
  --cpu 4 \
  --no-cpu-throttling \
  --timeout 3600 \
  --concurrency 1 \
  --scaling auto \
  --min 1 \
  --min-instances default \
  --max-instances 1 \
  --clear-secrets \
  --set-env-vars "^@^WORKER_MODE=health_only@WORKER_LANE=research@AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS=${AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS}@AXWISE_BUILD_REVISION=${REVISION}"

QUIESCENCE_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestCreatedRevisionName)')"
if [[ "${QUIESCENCE_REVISION}" != "${EXPECTED_QUIESCENCE_REVISION}" ]]; then
  echo "Expected quiescence revision ${EXPECTED_QUIESCENCE_REVISION}; Cloud Run reports ${QUIESCENCE_REVISION:-unset}" >&2
  exit 1
fi

echo "Routing worker service to release quiescence"
gcloud run services update-traffic "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --clear-tags \
  --to-revisions "${QUIESCENCE_REVISION}=100"

python3 "${SCRIPT_DIR}/verify_cloud_run_worker_release.py" \
  --service "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --expected-revision "${QUIESCENCE_REVISION}" \
  --expected-mode health_only \
  --expected-lane research \
  --expected-build-revision "${REVISION}"
echo "Durable Orqaly queue consumption stopped; all previous revisions retired"

if [[ "${SCOPE_WORKER_EXISTS}" == "true" ]]; then
  SCOPE_QUIESCENCE_SUFFIX="${REVISION}-quiesce"
  EXPECTED_SCOPE_QUIESCENCE_REVISION="${SCOPE_WORKER_SERVICE}-${SCOPE_QUIESCENCE_SUFFIX}"
  if (( ${#EXPECTED_SCOPE_QUIESCENCE_REVISION} > 63 )); then
    echo "Scope-worker quiescence revision name exceeds 63 characters" >&2
    exit 1
  fi
  echo "Stopping low-latency scope queue consumption for release"
  gcloud run deploy "${SCOPE_WORKER_SERVICE}" \
    --image "${IMAGE}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --platform managed \
    --revision-suffix "${SCOPE_QUIESCENCE_SUFFIX}" \
    --no-allow-unauthenticated \
    --service-account "${WORKER_SERVICE_ACCOUNT}" \
    --command python \
    --args=-m,backend.scripts.run_orqaly_hybrid_worker_service \
    --memory 4Gi \
    --cpu 2 \
    --no-cpu-throttling \
    --timeout 3600 \
    --concurrency 1 \
    --scaling auto \
    --min 1 \
    --min-instances default \
    --max-instances 1 \
    --clear-secrets \
    --set-env-vars "^@^WORKER_MODE=health_only@WORKER_LANE=scope@AXWISE_BUILD_REVISION=${REVISION}"
  SCOPE_QUIESCENCE_REVISION="$(gcloud run services describe "${SCOPE_WORKER_SERVICE}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --format='value(status.latestCreatedRevisionName)')"
  if [[ "${SCOPE_QUIESCENCE_REVISION}" != "${EXPECTED_SCOPE_QUIESCENCE_REVISION}" ]]; then
    echo "Expected ${EXPECTED_SCOPE_QUIESCENCE_REVISION}; received ${SCOPE_QUIESCENCE_REVISION:-unset}" >&2
    exit 1
  fi
  gcloud run services update-traffic "${SCOPE_WORKER_SERVICE}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --clear-tags \
    --to-revisions "${SCOPE_QUIESCENCE_REVISION}=100"
  python3 "${SCRIPT_DIR}/verify_cloud_run_worker_release.py" \
    --service "${SCOPE_WORKER_SERVICE}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --expected-revision "${SCOPE_QUIESCENCE_REVISION}" \
    --expected-mode health_only \
    --expected-lane scope \
    --expected-build-revision "${REVISION}"
fi

echo "Deploying migration job"
gcloud run jobs deploy "${MIGRATION_JOB}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --command python \
  --args=-m,alembic,-c,/app/backend/alembic.ini,upgrade,head \
  --set-env-vars ENVIRONMENT=production \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --max-retries 0 \
  --task-timeout 30m

echo "Running migration job"
gcloud run jobs execute "${MIGRATION_JOB}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --wait

echo "Deploying API"
gcloud run deploy "${API_SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 8Gi \
  --cpu 4 \
  --timeout 3600 \
  --concurrency 5 \
  --min-instances 1 \
  --max-instances 5 \
  --update-env-vars "^@^ENVIRONMENT=production@ENABLE_CLERK_VALIDATION=${ENABLE_CLERK_VALIDATION}@LLM_PROVIDER=gemini@GEMINI_MODEL=${GEMINI_MODEL}@GEMINI_SEARCH_MODEL=${GEMINI_MODEL}@GEMINI_TEXT_MODEL=${GEMINI_MODEL}@STAKEHOLDER_GEMINI_MODEL=${GEMINI_MODEL}@AXWISE_WEBHOOK_ALLOWED_HOSTS=orqanix.com,api.orqanix.com@AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS=${AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS}@AXWISE_BUILD_REVISION=${REVISION}" \
  --update-secrets "DATABASE_URL=DATABASE_URL:latest,CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,ORQALY_API_KEY=ORQALY_API_KEY:latest,AXWISE_API_KEY=axwise-orqaly-m2m-key:latest,AXWISE_WEBHOOK_SIGNING_SECRET=axwise-orqaly-webhook-signing-secret:latest,AXWISE_AUTHORITY_PROOF_SECRET=AXWISE_AUTHORITY_PROOF_SECRET:latest"

# Cloud Run preserves an explicit revision pin when a service was previously
# configured with one. Route to the revision created above so the health check
# cannot accidentally validate an older serving revision.
API_REVISION="$(gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestCreatedRevisionName)')"
if [[ -z "${API_REVISION}" ]]; then
  echo "Could not determine the newly created API revision" >&2
  exit 1
fi

echo "Switching API traffic to ${API_REVISION}"
gcloud run services update-traffic "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --to-revisions "${API_REVISION}=100"

# The durable worker polls and executes outside an inbound HTTP request. It
# must retain CPU after startup/request handling or an active research job can
# freeze indefinitely between provider calls.
echo "Deploying durable Orqaly A+B worker"
EXPECTED_WORKER_REVISION="${WORKER_SERVICE}-${REVISION}"
if (( ${#EXPECTED_WORKER_REVISION} > 63 )); then
  echo "Worker revision name exceeds Cloud Run's 63-character limit" >&2
  exit 1
fi
gcloud run deploy "${WORKER_SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --revision-suffix "${REVISION}" \
  --no-allow-unauthenticated \
  --service-account "${WORKER_SERVICE_ACCOUNT}" \
  --command python \
  --args=-m,backend.scripts.run_orqaly_hybrid_worker_service \
  --memory 8Gi \
  --cpu 4 \
  --no-cpu-throttling \
  --timeout 3600 \
  --concurrency 1 \
  --scaling auto \
  --min 1 \
  --min-instances default \
  --max-instances 1 \
  --set-env-vars "${WORKER_ENV_VARS}@WORKER_MODE=poll@WORKER_LANE=research" \
  --set-secrets "${WORKER_SECRET_BINDINGS}"

# As with the API, Cloud Run can preserve a previously pinned worker revision.
# Resolve the revision created by this deployment and route all worker traffic
# to it before declaring the durable execution path healthy.
WORKER_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestCreatedRevisionName)')"
if [[ -z "${WORKER_REVISION}" ]]; then
  echo "Could not determine the newly created worker revision" >&2
  exit 1
fi
if [[ "${WORKER_REVISION}" != "${EXPECTED_WORKER_REVISION}" ]]; then
  echo "Expected this deployment to create ${EXPECTED_WORKER_REVISION}; Cloud Run reports ${WORKER_REVISION}" >&2
  exit 1
fi

echo "Switching worker traffic to ${WORKER_REVISION}"
gcloud run services update-traffic "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --clear-tags \
  --to-revisions "${WORKER_REVISION}=100"

# Scope interpretation has an independent single-concurrency, warm worker so
# a long paid research provider call can never block chat correction latency.
echo "Deploying low-latency scope-correction worker"
EXPECTED_SCOPE_WORKER_REVISION="${SCOPE_WORKER_SERVICE}-${REVISION}"
if (( ${#EXPECTED_SCOPE_WORKER_REVISION} > 63 )); then
  echo "Scope-worker revision name exceeds Cloud Run's 63-character limit" >&2
  exit 1
fi
gcloud run deploy "${SCOPE_WORKER_SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --revision-suffix "${REVISION}" \
  --no-allow-unauthenticated \
  --service-account "${WORKER_SERVICE_ACCOUNT}" \
  --command python \
  --args=-m,backend.scripts.run_orqaly_hybrid_worker_service \
  --memory 4Gi \
  --cpu 2 \
  --no-cpu-throttling \
  --timeout 3600 \
  --concurrency 1 \
  --scaling auto \
  --min 1 \
  --min-instances default \
  --max-instances 1 \
  --set-env-vars "${WORKER_ENV_VARS}@WORKER_MODE=poll@WORKER_LANE=scope" \
  --set-secrets "${WORKER_SECRET_BINDINGS}"
SCOPE_WORKER_REVISION="$(gcloud run services describe "${SCOPE_WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestCreatedRevisionName)')"
if [[ "${SCOPE_WORKER_REVISION}" != "${EXPECTED_SCOPE_WORKER_REVISION}" ]]; then
  echo "Expected ${EXPECTED_SCOPE_WORKER_REVISION}; received ${SCOPE_WORKER_REVISION:-unset}" >&2
  exit 1
fi
gcloud run services update-traffic "${SCOPE_WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --clear-tags \
  --to-revisions "${SCOPE_WORKER_REVISION}=100"

API_URL="$(gcloud run services describe "${API_SERVICE}" --region "${REGION}" --project "${PROJECT_ID}" --format='value(status.url)')"
EXPECTED_REVISION="${REVISION}" python3 - "${API_URL}" <<'PY'
import json
import os
import sys
import urllib.request

base_url = sys.argv[1].rstrip("/")
with urllib.request.urlopen(f"{base_url}/health", timeout=30) as response:
    health = json.load(response)
if health.get("revision") != os.environ["EXPECTED_REVISION"]:
    raise SystemExit(
        f"backend revision mismatch: expected {os.environ['EXPECTED_REVISION']}, "
        f"received {health.get('revision')}"
    )

with urllib.request.urlopen(f"{base_url}/api/health", timeout=30) as response:
    details = json.load(response)
database = details.get("database") or {}
environment = details.get("environment") or {}
if database.get("status") != "connected":
    raise SystemExit("backend detailed health did not confirm a database connection")
if environment.get("DATABASE_URL_TYPE") != "postgresql":
    raise SystemExit("backend detailed health did not confirm PostgreSQL")
if str(environment.get("ENABLE_CLERK_VALIDATION") or "").lower() != "true":
    raise SystemExit("backend detailed health did not confirm Clerk validation")
PY

READY_REVISION="$(gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)')"
if [[ "${READY_REVISION}" != "${API_REVISION}" ]]; then
  echo "Expected ${API_REVISION} to be ready, but Cloud Run reports ${READY_REVISION}" >&2
  exit 1
fi

TRAFFIC_REVISION="$(gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].revisionName)')"
TRAFFIC_PERCENT="$(gcloud run services describe "${API_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].percent)')"
if [[ "${TRAFFIC_REVISION}" != "${API_REVISION}" || "${TRAFFIC_PERCENT}" != "100" ]]; then
  echo "Expected 100% API traffic on ${API_REVISION}; received ${TRAFFIC_REVISION} at ${TRAFFIC_PERCENT}%" >&2
  exit 1
fi

WORKER_READY_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.latestReadyRevisionName)')"
if [[ "${WORKER_READY_REVISION}" != "${WORKER_REVISION}" ]]; then
  echo "Expected worker revision ${WORKER_REVISION} to be ready; Cloud Run reports ${WORKER_READY_REVISION}" >&2
  exit 1
fi

WORKER_TRAFFIC_REVISION="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].revisionName)')"
WORKER_TRAFFIC_PERCENT="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.traffic[0].percent)')"
if [[ "${WORKER_TRAFFIC_REVISION}" != "${WORKER_REVISION}" || "${WORKER_TRAFFIC_PERCENT}" != "100" ]]; then
  echo "Expected 100% worker traffic on ${WORKER_REVISION}; received ${WORKER_TRAFFIC_REVISION} at ${WORKER_TRAFFIC_PERCENT}%" >&2
  exit 1
fi

# Verify the live revision retained instance-based CPU allocation. A deploy
# command can succeed while an unexpected service configuration still leaves
# this pull worker without CPU between requests.
WORKER_CPU_THROTTLING="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(spec.template.metadata.annotations."run.googleapis.com/cpu-throttling")')"
if [[ "${WORKER_CPU_THROTTLING}" != "false" ]]; then
  echo "Expected worker CPU throttling to be disabled; Cloud Run reports ${WORKER_CPU_THROTTLING:-unset}" >&2
  exit 1
fi

WORKER_STABLE_URL_AFTER="$(gcloud run services describe "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(status.url)')"
if [[ "${WORKER_STABLE_URL_AFTER}" != "${WORKER_STABLE_URL}" ]]; then
  echo "Worker stable URL changed during tag cleanup or deployment" >&2
  exit 1
fi

# One final authoritative JSON audit covers conditions that separate scalar
# format queries can miss: latest-created/latest-ready identity, all traffic
# entries and tags, service-level minimum instances, revision-level minima,
# and the complete revision inventory.
python3 "${SCRIPT_DIR}/verify_cloud_run_worker_release.py" \
  --service "${WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --expected-revision "${WORKER_REVISION}" \
  --expected-mode poll \
  --expected-lane research \
  --expected-build-revision "${REVISION}"

SCOPE_WORKER_CPU_THROTTLING="$(gcloud run services describe "${SCOPE_WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format='value(spec.template.metadata.annotations."run.googleapis.com/cpu-throttling")')"
if [[ "${SCOPE_WORKER_CPU_THROTTLING}" != "false" ]]; then
  echo "Expected scope-worker CPU throttling disabled; received ${SCOPE_WORKER_CPU_THROTTLING:-unset}" >&2
  exit 1
fi
if [[ "${SCOPE_WORKER_EXISTS}" == "true" ]]; then
  SCOPE_WORKER_STABLE_URL_AFTER="$(gcloud run services describe "${SCOPE_WORKER_SERVICE}" \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --format='value(status.url)')"
  if [[ "${SCOPE_WORKER_STABLE_URL_AFTER}" != "${SCOPE_WORKER_STABLE_URL}" ]]; then
    echo "Scope-worker stable URL changed during deployment" >&2
    exit 1
  fi
fi
python3 "${SCRIPT_DIR}/verify_cloud_run_worker_release.py" \
  --service "${SCOPE_WORKER_SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --expected-revision "${SCOPE_WORKER_REVISION}" \
  --expected-mode poll \
  --expected-lane scope \
  --expected-build-revision "${REVISION}"

echo "Deployment complete: ${IMAGE} (${API_REVISION})"