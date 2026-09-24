"""Contract checks for the forward-only AssistantTurnV2 ledger migration."""

from hashlib import sha256
from pathlib import Path
import re

import pytest


pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[3]
MIGRATION_ROOT = ROOT / "backend/database/workflow_v2"
MIGRATION = MIGRATION_ROOT / "010_assistant_turn_v2.sql"
PREVIOUS_MIGRATION = MIGRATION_ROOT / "009_capability_simulation.sql"
SCHEMA = MIGRATION_ROOT / "SCHEMA_SHA256"


def _final_allowed_operation_types(sql: str) -> list[str]:
    match = re.search(
        r"ADD CONSTRAINT cognitive_operations_operation_type_check CHECK "
        r"\(operation_type IN \((.*?)\)\);",
        sql,
        flags=re.DOTALL,
    )
    assert match is not None
    return re.findall(r"'([^']+)'", match.group(1))


def test_migration_retains_every_existing_operation_type_and_adds_only_v2():
    previous = _final_allowed_operation_types(
        PREVIOUS_MIGRATION.read_text(encoding="utf-8")
    )
    current = _final_allowed_operation_types(MIGRATION.read_text(encoding="utf-8"))

    assert set(current) == {*previous, "AssistantTurnV2"}
    assert len(current) == len(set(current))
    assert "AssistantTurnV1" in current


def test_migration_is_idempotent_and_fails_closed_on_schema_drift():
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "IF current_definition = expected_definition THEN\n    RETURN;" in sql
    assert "IF current_definition IS DISTINCT FROM previous_definition THEN" in sql
    assert "expected exact migration 009" in sql
    assert "relrowsecurity AND relforcerowsecurity" in sql
    assert "candidate.conname = 'cognitive_operations_operation_type_check'" in sql
    assert "candidate.convalidated" in sql
    assert "AND NOT candidate.connoinherit" in sql
    assert "attname = 'operation_type'" in sql
    assert "SET LOCAL lock_timeout = '5s';" in sql
    assert "SET LOCAL statement_timeout = '30s';" in sql


def test_migration_checksum_is_pinned_as_latest_schema_entry():
    digest = sha256(MIGRATION.read_bytes()).hexdigest()
    entries = SCHEMA.read_text(encoding="utf-8").splitlines()

    assert entries[-1] == f"{digest}  {MIGRATION.name}"
