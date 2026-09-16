"""CI must apply every pinned additive migration before readiness/store gates."""

from pathlib import Path
import re

import pytest


pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/workflow-v2.yml"
SCHEMA = ROOT / "backend/database/workflow_v2/SCHEMA_SHA256"


def test_ci_applies_the_exact_pinned_migration_chain_in_order():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    expected = [
        f"backend/database/workflow_v2/{line.split()[1]}"
        for line in SCHEMA.read_text(encoding="utf-8").splitlines()
    ]
    actual = re.findall(r"--file=(backend/database/workflow_v2/\S+\.sql)", workflow)
    assert actual == expected
    assert actual[-2:] == [
        "backend/database/workflow_v2/008_capability_analysis.sql",
        "backend/database/workflow_v2/009_capability_simulation.sql",
    ]


def test_ci_checks_bytes_then_migrates_with_fail_closed_role_before_database_tests():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    checksum = workflow.index("run: sha256sum --check SCHEMA_SHA256")
    migration = workflow.index("- name: Apply clean baseline migrations")
    tests = workflow.index("- name: Run real PostgreSQL RLS and lease tests")
    assert checksum < migration < tests
    block = workflow[migration : workflow.index("- name:", migration + 1)]
    assert 'psql "${AXWISE_V2_MIGRATION_DATABASE_URL}" --set=ON_ERROR_STOP=1' in block
    assert "--file=backend/database/workflow_v2/009_capability_simulation.sql" in block
    assert "|| true" not in block and "continue-on-error" not in block
    assert "image: postgres:16" in workflow


def test_ci_runs_capability_counter_regressions_in_the_real_postgres_step():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    pure_start = workflow.index(
        "- name: Run pure contracts and durable worker/API tests"
    )
    pure = workflow[pure_start : workflow.index("- name:", pure_start + 1)]
    database_start = workflow.index("- name: Run real PostgreSQL RLS and lease tests")
    database = workflow[database_start : workflow.index("- name:", database_start + 1)]
    for name in (
        "test_operation_store_postgres.py",
        "test_capability_operations_postgres.py",
    ):
        path = f"backend/tests/workflow_v2/{name}"
        assert f"--ignore={path}" in pure
        assert path in database and f"--ignore={path}" not in database
    assert "|| true" not in database and "continue-on-error" not in database
