"""Credential-safety contracts for tracked production release scripts."""

from pathlib import Path
import re
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[3]
MIGRATION_NOTIFICATION_SCRIPT = ROOT / "scripts" / "draft_migration_notification.py"
DATABASE_URL_ENV = "AXWISE_MIGRATION_NOTIFICATION_DATABASE_URL"
pytestmark = pytest.mark.contract

# Match a URL containing literal user:password userinfo. Failure diagnostics
# intentionally report only file and line so CI cannot repeat a leaked value.
CREDENTIAL_BEARING_URL = re.compile(
    r"(?i)\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|https?)://"
    r"[^\s/'\"@:]+:[^\s/'\"@]+@"
)


def _tracked_release_scripts() -> list[Path]:
    completed = subprocess.run(
        ["git", "ls-files", "--", "scripts"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    release_scripts = []
    for relative_name in completed.stdout.splitlines():
        relative_path = Path(relative_name)
        name = relative_path.name
        if relative_path.parent != Path("scripts"):
            continue
        if relative_path.suffix not in {".py", ".sh"}:
            continue
        if (
            name.startswith("deploy-")
            or "migration" in name
            or name == "verify_cloud_run_worker_release.py"
        ):
            release_scripts.append(ROOT / relative_path)
    assert release_scripts, "expected tracked production release scripts"
    return release_scripts


def test_tracked_release_scripts_do_not_embed_credential_bearing_urls() -> None:
    findings = []
    for script_path in _tracked_release_scripts():
        for line_number, line in enumerate(
            script_path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if CREDENTIAL_BEARING_URL.search(line):
                findings.append(f"{script_path.relative_to(ROOT)}:{line_number}")

    assert not findings, (
        "credential-bearing URLs are forbidden in tracked release scripts: "
        + ", ".join(findings)
    )


def test_migration_notification_uses_unlogged_environment_database_url() -> None:
    script = MIGRATION_NOTIFICATION_SCRIPT.read_text(encoding="utf-8")

    assert f'DATABASE_URL_ENV = "{DATABASE_URL_ENV}"' in script
    assert 'os.getenv(DATABASE_URL_ENV, "").strip()' in script
    assert "create_engine(database_url," in script
    assert "PROD_DATABASE_URL" not in script
    assert "print(database_url" not in script
    assert "{database_url}" not in script
    assert "except Exception as" not in script
