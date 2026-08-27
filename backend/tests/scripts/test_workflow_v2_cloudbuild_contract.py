"""Fail-closed contract for the isolated workflow-v2 image build."""

from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
CLOUD_BUILD_CONFIG = ROOT / "cloudbuild.workflow-v2.yaml"
pytestmark = pytest.mark.contract


def test_workflow_v2_build_uses_custom_service_account_compatible_logging() -> None:
    config = CLOUD_BUILD_CONFIG.read_text(encoding="utf-8")

    assert config.count("logging: CLOUD_LOGGING_ONLY") == 1
    assert "logging: GCS_ONLY" not in config
    assert "logsBucket:" not in config
    assert '"backend/Dockerfile.workflow-v2"' in config
    assert config.count('"$_IMAGE_NAME"') >= 3
