"""Deployment contract for grounded Orqaly research in Cloud Run."""

from pathlib import Path
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[3]
DEPLOY_SCRIPT = ROOT / "scripts" / "deploy-production-backend.sh"
SEARXNG_DEPLOY_SCRIPT = ROOT / "scripts" / "deploy-searxng-cloud-run.sh"
pytestmark = pytest.mark.contract


def test_production_backend_deploy_script_is_valid_bash() -> None:
    subprocess.run(["bash", "-n", str(DEPLOY_SCRIPT)], check=True)
    subprocess.run(["bash", "-n", str(SEARXNG_DEPLOY_SCRIPT)], check=True)


def test_grounded_worker_uses_secret_manager_and_pinned_gemini_configuration() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'GEMINI_MODEL="${GEMINI_MODEL:-models/gemini-3.6-flash}"' in script
    assert "GEMINI_SEARCH_MODEL=${GEMINI_MODEL}" in script
    assert "GEMINI_TEXT_MODEL=${GEMINI_MODEL}" in script
    assert "STAKEHOLDER_GEMINI_MODEL=${GEMINI_MODEL}" in script
    assert 'OPENREGISTER_SECRET="${OPENREGISTER_SECRET:-OPENREGISTER_API_KEY}"' in script
    assert "OPENREGISTER_API_KEY=${OPENREGISTER_SECRET}:latest" in script
    assert '--set-secrets "${WORKER_SECRET_BINDINGS}"' in script
    assert "GEMINI_API_KEY=GEMINI_API_KEY:latest" in script
    assert "GEMINI_MODEL=${GEMINI_MODEL}" in script
    assert 'AXWISE_MARKET_CELL_CONCURRENCY="${AXWISE_MARKET_CELL_CONCURRENCY:-6}"' in script
    assert 'AXWISE_PERSONA_CONCURRENCY="${AXWISE_PERSONA_CONCURRENCY:-5}"' in script
    assert "AXWISE_MARKET_CELL_CONCURRENCY=${AXWISE_MARKET_CELL_CONCURRENCY}" in script
    assert "AXWISE_PERSONA_CONCURRENCY=${AXWISE_PERSONA_CONCURRENCY}" in script
    assert "Research concurrency values must be integers from 1 to 8" in script


def test_worker_deploy_routes_and_verifies_the_new_revision() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    worker_revision = (
        'WORKER_REVISION="$(gcloud run services describe "${WORKER_SERVICE}"'
    )
    worker_traffic_switch = (
        'gcloud run services update-traffic "${WORKER_SERVICE}"'
    )
    worker_traffic_revision = "WORKER_TRAFFIC_REVISION="
    worker_traffic_percent = "WORKER_TRAFFIC_PERCENT="

    assert worker_revision in script
    assert '--to-revisions "${WORKER_REVISION}=100"' in script
    assert worker_traffic_switch in script
    assert "status.latestReadyRevisionName" in script
    assert "${WORKER_READY_REVISION}" in script
    assert "${WORKER_REVISION}" in script
    assert worker_traffic_revision in script
    assert worker_traffic_percent in script
    assert "status.traffic[0].revisionName" in script
    assert "status.traffic[0].percent" in script
    assert '"${WORKER_TRAFFIC_PERCENT}" != "100"' in script

    deploy = 'gcloud run deploy "${WORKER_SERVICE}"'
    switch = script.index(worker_traffic_switch)
    assert script.index(deploy) < script.index(worker_revision) < switch
    assert switch < script.index(worker_traffic_revision)


def test_authority_proof_secret_is_validated_without_printing_before_build() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    access = "gcloud secrets versions access latest"
    build = 'echo "Building ${IMAGE}"'
    binding = (
        "AXWISE_AUTHORITY_PROOF_SECRET="
        "AXWISE_AUTHORITY_PROOF_SECRET:latest"
    )

    assert "AXWISE_AUTHORITY_PROOF_SECRET" in script.split("required_secrets=(", 1)[1]
    assert access in script
    assert "--secret AXWISE_AUTHORITY_PROOF_SECRET" in script
    assert "value = sys.stdin.buffer.read()" in script
    assert 'value.decode("utf-8")' in script
    assert "len(value) >= 32" in script
    assert script.index(access) < script.index(build)
    assert script.count(binding) == 2

    # The value must flow only from Secret Manager to the validating process;
    # neither command tracing nor a diagnostic may expose the secret bytes.
    assert "set -x" not in script
    assert "print(value)" not in script
    assert "echo ${AXWISE_AUTHORITY_PROOF_SECRET}" not in script


def test_registry_grounding_can_be_made_a_fail_fast_release_requirement() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'REQUIRE_OPENREGISTER="${REQUIRE_OPENREGISTER:-false}"' in script
    assert 'elif [[ "${REQUIRE_OPENREGISTER}" == "true" ]]' in script
    assert "Required Secret Manager secret" in script


def test_optional_searxng_route_requires_a_credential_free_https_endpoint() -> None:
    script = DEPLOY_SCRIPT.read_text(encoding="utf-8")

    assert 'SEARXNG_URL="${SEARXNG_URL:-}"' in script
    assert '[[ "${SEARXNG_URL}" == *"@"* ]]' in script
    assert '[[ ! "${SEARXNG_URL}" =~ ^https:// ]]' in script
    assert (
        'WORKER_ENV_VARS="${WORKER_ENV_VARS}@SEARXNG_URL=${SEARXNG_URL}'
        '@SEARXNG_AUTH_MODE=google_identity"' in script
    )
    assert '--set-env-vars "${WORKER_ENV_VARS}"' in script


def test_private_searxng_deployment_uses_identity_and_pinned_image() -> None:
    script = SEARXNG_DEPLOY_SCRIPT.read_text(encoding="utf-8")
    dockerfile = (ROOT / "deploy" / "searxng" / "Dockerfile").read_text(
        encoding="utf-8"
    )
    settings = (ROOT / "deploy" / "searxng" / "settings.yml").read_text(
        encoding="utf-8"
    )

    assert "searxng/searxng@sha256:" in dockerfile
    assert "--no-allow-unauthenticated" in script
    assert '--service-account "${SERVICE_ACCOUNT}"' in script
    assert "gcloud iam service-accounts describe" in script
    assert 'serviceAccount:${WORKER_SERVICE_ACCOUNT}' in script
    assert "roles/run.invoker" in script
    assert "SEARXNG_AUTH_MODE=google_identity" in script
    assert "SEARXNG_SECRET=" in script
    assert "- json" in settings
