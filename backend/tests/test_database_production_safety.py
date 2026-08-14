"""Fail-closed database startup contract for production processes."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.contract


def _import_database(
    tmp_path: Path,
    *,
    environment: str,
    database_url: str,
) -> subprocess.CompletedProcess[str]:
    process_environment = os.environ.copy()
    process_environment.update(
        {
            "ENVIRONMENT": environment,
            "DATABASE_URL": database_url,
            "PYTHONPATH": str(ROOT),
        }
    )
    return subprocess.run(
        [
            sys.executable,
            "-c",
            "import backend.database as database; print(database.DATABASE_URL)",
        ],
        cwd=tmp_path,
        env=process_environment,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )


def test_production_rejects_sqlite_without_creating_a_local_database(
    tmp_path: Path,
) -> None:
    result = _import_database(
        tmp_path,
        environment="production",
        database_url="sqlite:///./production.db",
    )

    assert result.returncode != 0
    assert "Production requires an explicit PostgreSQL DATABASE_URL" in result.stderr
    assert not (tmp_path / "production.db").exists()
    assert not (tmp_path / "axwise.db").exists()


def test_production_requires_database_url_even_when_settings_have_a_default(
    tmp_path: Path,
) -> None:
    result = _import_database(
        tmp_path,
        environment="production",
        database_url="",
    )

    assert result.returncode != 0
    assert "Production requires an explicit PostgreSQL DATABASE_URL" in result.stderr
    assert not (tmp_path / "axwise.db").exists()


def test_production_postgres_failure_never_falls_back_to_sqlite(
    tmp_path: Path,
) -> None:
    sentinel_password = "sentinel-password-must-not-appear"
    result = _import_database(
        tmp_path,
        environment="production",
        database_url=(
            f"postgresql://release-test:{sentinel_password}@127.0.0.1:1/"
            "unavailable?connect_timeout=1"
        ),
    )

    assert result.returncode != 0
    assert "Production PostgreSQL connection failed; refusing SQLite fallback" in result.stderr
    assert sentinel_password not in result.stdout
    assert sentinel_password not in result.stderr
    assert not (tmp_path / "axwise.db").exists()


def test_nonproduction_connection_failure_keeps_scoped_sqlite_fallback(
    tmp_path: Path,
) -> None:
    result = _import_database(
        tmp_path,
        environment="test",
        database_url=(
            "postgresql://release-test:release-test@127.0.0.1:1/"
            "unavailable?connect_timeout=1"
        ),
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "sqlite:///./axwise.db"
