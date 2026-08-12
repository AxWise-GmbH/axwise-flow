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

    assert 'GEMINI_MODEL="${GEMINI_MODEL:-models/gemini-3.5-flash}"' in script
    assert 'OPENREGISTER_SECRET="${OPENREGISTER_SECRET:-OPENREGISTER_API_KEY}"' in script
    assert "OPENREGISTER_API_KEY=${OPENREGISTER_SECRET}:latest" in script
    assert '--set-secrets "${WORKER_SECRET_BINDINGS}"' in script
    assert "GEMINI_API_KEY=GEMINI_API_KEY:latest" in script
    assert "GEMINI_MODEL=${GEMINI_MODEL}" in script


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
