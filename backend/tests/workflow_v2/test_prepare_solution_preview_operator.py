from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[3]
PATH = ROOT / "deploy/workflow-v2/apply-prepare-solution-preview.py"
spec = importlib.util.spec_from_file_location("prepare_solution_preview_operator", PATH)
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)


def marker():
    value = {
        "bindings_path": "deploy/workflow-v2/preview-role-bindings.sql",
        "bindings_sha256": "2b885c6089b0b3c45030fc2e88e950cb582ecd617d2af293066041f277f0f48b",
    }
    for key, (filename, checksum) in operator.BASE_MARKERS.items():
        value["migration_path" if key == "migration" else f"{key}_migration_path"] = (
            "backend/database/workflow_v2/" + filename
        )
        value["sha256" if key == "migration" else f"{key}_sha256"] = checksum
    return value


class Cursor:
    def __init__(
        self,
        *,
        applied=False,
        database=None,
        rls=(True, True),
        checksum=None,
        extra_type=False,
    ):
        self.database = database or operator.DATABASE
        self.rls = rls
        self.marker = marker()
        if applied:
            self.marker.update(
                prepare_solution_migration_path=operator.MIGRATION_PATH,
                prepare_solution_sha256=checksum or operator.MIGRATION_HASH,
            )
        self.types = (
            operator.BASE_TYPES
            | ({"PrepareSolutionV1"} if applied else set())
            | ({"ArbitraryCodeV1"} if extra_type else set())
        )
        self.statements = []

    def execute(self, sql):
        self.statements.append(sql)

    def fetchone(self):
        return (
            (self.database,) if "current_database" in self.statements[-1] else self.rls
        )

    def fetchall(self):
        if "to_jsonb" in self.statements[-1]:
            return [(self.marker,)]
        return [
            (
                True,
                "CHECK (operation_type = ANY (ARRAY["
                + ",".join(f"'{item}'::text" for item in self.types)
                + "]))",
            )
        ]


@pytest.mark.parametrize("applied", [False, True])
def test_inspection_accepts_only_exact_marked_schema_and_only_selects(applied):
    cursor = Cursor(applied=applied)
    assert operator.inspect(cursor) is applied
    assert all(sql.startswith("SELECT ") for sql in cursor.statements)
    assert all("cognitive_operations " not in sql for sql in cursor.statements)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"database": "production"},
        {"rls": (True, False)},
        {"extra_type": True},
        {"applied": True, "checksum": "0" * 64},
    ],
)
def test_inspection_rejects_drift_without_mutations(kwargs):
    with pytest.raises(RuntimeError, match="precondition"):
        operator.inspect(Cursor(**kwargs))


def test_baseline_checksum_must_match():
    value = marker()
    value["runtime_sha256"] = "0" * 64
    with pytest.raises(RuntimeError):
        operator.assert_marker(value)


def test_operator_has_no_role_grant_or_unbounded_target():
    source = PATH.read_text()
    assert "GRANT " not in source and "DISABLE ROW LEVEL SECURITY" not in source
    assert "assert " not in source  # Python -O cannot remove fail-closed preconditions.
    assert "capture_output=True" in source
    assert "proxy.terminate()" in source and "connection.close()" in source
