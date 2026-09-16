from __future__ import annotations

import hashlib
import subprocess
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.domain.workflow_v2.contracts import AxWiseOperationEnvelope, canonical_hash
from backend.services.workflow_v2.operation_store import (
    OperationConflict,
    PostgresOperationStore,
)


pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[3]
MIGRATION = (
    ROOT / "backend" / "database" / "workflow_v2" / "005_compile_scope_v3.sql"
)
SCHEMA_CHECKSUMS = (
    ROOT / "backend" / "database" / "workflow_v2" / "SCHEMA_SHA256"
)
PREVIEW_SCHEMA_APPLY = ROOT / "deploy" / "workflow-v2" / "apply-preview-schema.sh"
WORKFLOW = ROOT / ".github" / "workflows" / "workflow-v2.yml"


def _envelope() -> AxWiseOperationEnvelope:
    input_payload = {
        "type": "CompileScopeV2",
        "request": "Create an Estonia cat-food launch PRD.",
        "objectiveOnlyContext": [],
        "safeDefaults": {
            "geography": [],
            "acceptedSourceTypes": [],
            "assumptions": [],
            "limits": [],
            "policies": [],
        },
    }
    return AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000501",
            "operationType": "CompileScopeV2",
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000502",
                "organizationId": None,
                "userId": "user_v3persistencetest123",
            },
            "workflow": {
                "runId": "00000000-0000-4000-8000-000000000503",
                "stageId": "00000000-0000-4000-8000-000000000504",
                "stageAttemptId": "00000000-0000-4000-8000-000000000505",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )


class _Result:
    def __init__(self, row=None) -> None:
        self.row = row

    def first(self):
        return self.row


class _Connection:
    def __init__(self) -> None:
        self.statements: list[str] = []
        self.responses = iter(
            (
                _Result(),
                _Result(),
                _Result(SimpleNamespace(operation_id="occupied")),
            )
        )

    def execute(self, statement, _parameters=None):
        rendered = str(statement)
        self.statements.append(rendered)
        if "set_config('axwise.tenant_id'" in rendered:
            return _Result()
        return next(self.responses)


class _Engine:
    def __init__(self) -> None:
        self.connection = _Connection()

    @contextmanager
    def begin(self):
        yield self.connection


def test_migration_is_additive_fail_closed_and_replaces_the_stage_slot_key() -> None:
    migration = MIGRATION.read_text(encoding="utf-8")

    assert migration.startswith("BEGIN;\n")
    assert migration.endswith("COMMIT;\n")
    assert "'CompileScopeV3'" in migration
    assert "UNIQUE (tenant_id, stage_attempt_id);" in migration
    assert "UNIQUE (tenant_id, stage_attempt_id, operation_type)" not in migration
    assert "ARRAY['tenant_id', 'stage_attempt_id', 'operation_type']" in migration
    assert "HAVING count(*) > 1" in migration
    assert "stage attempt has more than one cognitive operation" in migration
    assert "DELETE FROM" not in migration
    assert "UPDATE axwise.cognitive_operations" not in migration

    checksum = hashlib.sha256(MIGRATION.read_bytes()).hexdigest()
    assert f"{checksum}  005_compile_scope_v3.sql" in SCHEMA_CHECKSUMS.read_text(
        encoding="utf-8"
    )


def test_preview_and_ci_schema_application_advance_through_005() -> None:
    script = PREVIEW_SCHEMA_APPLY.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")
    subprocess.run(["bash", "-n", str(PREVIEW_SCHEMA_APPLY)], check=True)

    checksum = hashlib.sha256(MIGRATION.read_bytes()).hexdigest()
    assert (
        'COMPILE_SCOPE_V3_MIGRATION_PATH="backend/database/workflow_v2/'
        '005_compile_scope_v3.sql"' in script
    )
    assert f'EXPECTED_COMPILE_SCOPE_V3_CHECKSUM="{checksum}"' in script
    assert "compile_scope_v3_migration_path" in script
    assert "compile_scope_v3_sha256" in script
    assert "expected_release_marker_v4" in script
    assert "migrations 002-005" in script
    assert "single_operation_per_attempt" in script

    fresh_apply = script[script.index('if test "${user_schemas}" != public') :]
    assert fresh_apply.index('"${EVENTS_MIGRATION}"') < fresh_apply.index(
        '"${COMPILE_SCOPE_V3_MIGRATION}"'
    )
    assert fresh_apply.index('"${COMPILE_SCOPE_V3_MIGRATION}"') < fresh_apply.index(
        '"${BINDINGS}"'
    )
    assert "--file=backend/database/workflow_v2/005_compile_scope_v3.sql" in workflow


def test_store_checks_the_whole_stage_attempt_slot_after_insert_conflict() -> None:
    engine = _Engine()
    store = PostgresOperationStore(engine)

    with pytest.raises(
        OperationConflict, match="stage attempt already uses another operation ID"
    ):
        store.adopt_or_create(_envelope())

    occupancy_query = engine.connection.statements[-1]
    assert "stage_attempt_id = :stage_attempt_id" in occupancy_query
    assert "operation_type = :operation_type" not in occupancy_query


def test_store_readiness_requires_the_v3_type_and_single_attempt_key() -> None:
    source = (
        ROOT / "backend" / "services" / "workflow_v2" / "operation_store.py"
    ).read_text(encoding="utf-8")

    assert "LIKE '%CompileScopeV3%'" in source
    assert "'UNIQUE (tenant_id, stage_attempt_id)'" in source
