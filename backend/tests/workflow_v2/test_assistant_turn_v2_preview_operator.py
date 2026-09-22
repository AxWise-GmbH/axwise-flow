from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[3]
PATH = ROOT / "deploy/workflow-v2/apply-assistant-turn-v2-preview.py"
spec = importlib.util.spec_from_file_location("assistant_turn_v2_preview_operator", PATH)
operator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operator)


def marker(*, applied: bool = False) -> dict:
    value = {
        "component": "axwise",
        "migration_number": 1,
        "bindings_path": "deploy/workflow-v2/preview-role-bindings.sql",
        "bindings_sha256": "2b885c6089b0b3c45030fc2e88e950cb582ecd617d2af293066041f277f0f48b",
        "source_commit": "a" * 40,
        "applied_at": "2026-09-22T00:00:00+00:00",
    }
    for prefix, (filename, checksum) in operator.MIGRATION_MARKERS.items():
        value[operator._marker_key(prefix, "path")] = (
            "backend/database/workflow_v2/" + filename
        )
        value[operator._marker_key(prefix, "hash")] = checksum
    if applied:
        value.update(
            {
                operator.MARKER_PATH_KEY: operator.MIGRATION_PATH,
                operator.MARKER_HASH_KEY: operator.MIGRATION_HASH,
            }
        )
    return value


class Cursor:
    def __init__(
        self,
        *,
        applied: bool = False,
        database: str | None = None,
        postgres_role: str | None = None,
        postgres_version: int = 160014,
        marker_value: dict | None = None,
        marker_columns: tuple | None = None,
        rls: tuple[bool, bool] = (True, True),
        constraint: str | None = None,
    ):
        self.identity = (
            database or operator.DATABASE,
            postgres_role or operator.POSTGRES_ROLE,
            postgres_role or operator.POSTGRES_ROLE,
            postgres_version,
        )
        self.marker = marker_value or marker(applied=applied)
        self.marker_columns = marker_columns or (
            operator.TARGET_MARKER_COLUMNS if applied else operator.BASE_MARKER_COLUMNS
        )
        self.rls = rls
        types = operator.TARGET_TYPES if applied else operator.BASE_TYPES
        self.constraint = constraint or operator._constraint_definition(types)
        self.statements: list[str] = []

    def execute(self, sql, _parameters=None):
        self.statements.append(sql)

    def fetchone(self):
        statement = self.statements[-1]
        if "current_database" in statement:
            return self.identity
        if "relrowsecurity" in statement:
            return self.rls
        raise AssertionError(f"Unexpected fetchone for {statement}")

    def fetchall(self):
        statement = self.statements[-1]
        if "information_schema.columns" in statement:
            return list(self.marker_columns)
        if "to_jsonb" in statement:
            return [(self.marker,)]
        if "pg_constraint" in statement:
            return [(True, False, self.constraint)]
        raise AssertionError(f"Unexpected fetchall for {statement}")


@pytest.mark.parametrize("applied", [False, True])
def test_inspection_accepts_only_exact_sql009_or_marked_sql010(applied):
    cursor = Cursor(applied=applied)
    result = operator.inspect(cursor)
    assert result.applied is applied
    assert result.recorded_source_commit == "a" * 40
    assert all(statement.startswith("SELECT ") for statement in cursor.statements)


@pytest.mark.parametrize(
    "cursor",
    [
        Cursor(database="production"),
        Cursor(postgres_role="axwise_v2_001_api"),
        Cursor(postgres_version=150014),
        Cursor(rls=(True, False)),
        Cursor(marker_columns=operator.BASE_MARKER_COLUMNS[:-1]),
        Cursor(constraint=operator._constraint_definition(operator.BASE_TYPES[::-1])),
    ],
)
def test_inspection_rejects_identity_schema_or_constraint_drift(cursor):
    with pytest.raises(RuntimeError, match="precondition"):
        operator.inspect(cursor)


def test_inspection_rejects_partial_unknown_or_false_sql010_marker():
    partial = marker()
    partial[operator.MARKER_PATH_KEY] = operator.MIGRATION_PATH
    with pytest.raises(RuntimeError, match="precondition"):
        operator.inspect(Cursor(marker_value=partial))

    unknown = marker()
    unknown["future_migration_sha256"] = "0" * 64
    with pytest.raises(RuntimeError, match="precondition"):
        operator.inspect(Cursor(marker_value=unknown))

    wrong = marker(applied=True)
    wrong[operator.MARKER_HASH_KEY] = "0" * 64
    with pytest.raises(RuntimeError, match="precondition"):
        operator.inspect(Cursor(applied=True, marker_value=wrong))


def test_all_live_sql001_through_sql009_markers_are_pinned():
    value = marker()
    assert operator.assert_marker(value) is False
    assert set(operator.MIGRATION_MARKERS) == {
        "migration",
        "assistant",
        "runtime",
        "events",
        "compile_scope_v3",
        "prepare_solution",
        "native_solution",
        "capability_analysis",
        "capability_simulation",
    }
    value["native_solution_sha256"] = "0" * 64
    with pytest.raises(RuntimeError, match="precondition"):
        operator.assert_marker(value)


def test_apply_path_is_clean_committed_atomic_and_non_authorizing():
    source = PATH.read_text()
    assert "--apply" in source
    assert "readonly=not args.apply" in source
    assert '"status", "--porcelain=v1", "--untracked-files=all"' in source
    assert 'f"{commit}:{MIGRATION_PATH}"' in source
    assert 'f"{commit}:{OPERATOR_PATH}"' in source
    assert "pg_advisory_xact_lock" in source
    assert "SET LOCAL lock_timeout='5s'" in source
    assert "SET LOCAL statement_timeout='30s'" in source
    assert "SET LOCAL idle_in_transaction_session_timeout='30s'" in source
    assert "GRANT " not in source and "DISABLE ROW LEVEL SECURITY" not in source
    assert "assert " not in source  # Python -O cannot remove fail-closed checks.
    assert "capture_output=True" in source
    assert "stderr=subprocess.DEVNULL" in source
    assert "proxy.terminate()" in source and "connection.close()" in source


def test_proxy_uses_a_private_single_use_unix_socket():
    source = PATH.read_text()
    assert 'TemporaryDirectory(prefix="axw-", dir="/tmp")' in source
    assert 'proxy_host / ".s.PGSQL.5432"' in source
    assert '"--unix-socket"' in source
    assert '"--max-connections=1"' in source
    assert "proxy.poll() is None" in source
    assert "proxy_socket.exists()" in source
    assert "host=str(proxy_host)" in source
    assert "proxy_socket_root.cleanup()" in source
    assert "--address=127.0.0.1" not in source


def test_source_validation_rejects_dirty_checkout(monkeypatch):
    original_capture = operator.capture

    def capture(*args: str) -> str:
        if args[:3] == ("git", "rev-parse", "--verify"):
            return "b" * 40
        if args[:2] == ("git", "status"):
            return "?? unexpected.py"
        return original_capture(*args)

    migration_bytes = (ROOT / operator.MIGRATION_PATH).read_bytes()

    def capture_bytes(*args: str) -> bytes:
        if args[:2] == ("git", "show"):
            if args[-1].endswith(operator.MIGRATION_PATH):
                return migration_bytes
            return PATH.read_bytes()
        raise AssertionError(args)

    monkeypatch.setattr(operator, "capture", capture)
    monkeypatch.setattr(operator, "capture_bytes", capture_bytes)
    with pytest.raises(RuntimeError, match="precondition"):
        operator.validate_source(require_clean=True)
