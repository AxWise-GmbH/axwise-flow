from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine

from backend.domain.workflow_v2.contracts import AxWiseOperationEnvelope


class OperationConflict(ValueError):
    """An operation identity or stage-attempt slot was reused inconsistently."""


class StaleOperationLease(RuntimeError):
    """A worker tried to renew or finalize after losing its operation lease."""


@dataclass(frozen=True)
class OperationRecord:
    operation_id: UUID
    tenant_id: UUID
    canonical_input_hash: str
    status: str
    result_payload: dict[str, Any] | None
    retryable: bool | None
    error_class: str | None


@dataclass(frozen=True)
class ClaimedOperation:
    record: OperationRecord
    envelope: AxWiseOperationEnvelope
    lease_token: UUID


def _record(row: Any) -> OperationRecord:
    return OperationRecord(
        operation_id=row.operation_id,
        tenant_id=row.tenant_id,
        canonical_input_hash=row.canonical_input_hash,
        status=row.status,
        result_payload=row.result_payload,
        retryable=row.retryable,
        error_class=row.error_class,
    )


def _tenant_context(connection: Connection, tenant_id: UUID) -> None:
    connection.execute(
        text("SELECT set_config('axwise.tenant_id', :tenant_id, true)"),
        {"tenant_id": str(tenant_id)},
    )


class PostgresOperationStore:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    @classmethod
    def from_environment(cls) -> "PostgresOperationStore":
        database_url = os.getenv("AXWISE_OPERATION_DATABASE_URL")
        if not database_url:
            raise RuntimeError("AXWISE_OPERATION_DATABASE_URL is required")
        pool_size = int(os.getenv("AXWISE_OPERATION_DATABASE_POOL_SIZE", "3"))
        if not 1 <= pool_size <= 8:
            raise RuntimeError("AXWISE_OPERATION_DATABASE_POOL_SIZE must be between 1 and 8")
        return cls(
            create_engine(
                database_url,
                pool_pre_ping=True,
                pool_size=pool_size,
                max_overflow=0,
                pool_recycle=1800,
            )
        )

    def ready(self) -> bool:
        with self.engine.connect() as connection:
            return connection.execute(text("SELECT 1")).scalar_one() == 1

    def adopt_or_create(self, envelope: AxWiseOperationEnvelope) -> OperationRecord:
        payload = envelope.model_dump(mode="json", by_alias=True)
        parameters = {
            "operation_id": envelope.operation_id,
            "operation_type": envelope.operation_type,
            "canonical_input_hash": envelope.canonical_input_hash,
            "contract_version": envelope.contract_version,
            "tenant_id": envelope.owner.tenant_id,
            "organization_id": envelope.owner.organization_id,
            "user_id": envelope.owner.user_id,
            "run_id": envelope.workflow.run_id,
            "stage_id": envelope.workflow.stage_id,
            "stage_attempt_id": envelope.workflow.stage_attempt_id,
            "input_payload": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        }
        with self.engine.begin() as connection:
            _tenant_context(connection, envelope.owner.tenant_id)
            inserted = connection.execute(
                text(
                    """
                        INSERT INTO axwise.cognitive_operations (
                          operation_id, operation_type, canonical_input_hash, contract_version,
                          tenant_id, organization_id, user_id, run_id, stage_id,
                          stage_attempt_id, input_payload
                        ) VALUES (
                          :operation_id, :operation_type, :canonical_input_hash, :contract_version,
                          :tenant_id, :organization_id, :user_id, :run_id, :stage_id,
                          :stage_attempt_id, CAST(:input_payload AS jsonb)
                        )
                        ON CONFLICT DO NOTHING
                        RETURNING operation_id, tenant_id, canonical_input_hash, status,
                                  result_payload, retryable, error_class
                    """
                ),
                parameters,
            ).first()
            row = inserted or connection.execute(
                text(
                    """
                    SELECT operation_id, tenant_id, canonical_input_hash, status, result_payload,
                           retryable, error_class, input_payload
                    FROM axwise.cognitive_operations
                    WHERE tenant_id = :tenant_id AND operation_id = :operation_id
                    """
                ),
                parameters,
            ).first()
            if row is None:
                occupied = connection.execute(
                    text(
                        """
                        SELECT operation_id
                        FROM axwise.cognitive_operations
                        WHERE tenant_id = :tenant_id
                          AND stage_attempt_id = :stage_attempt_id
                          AND operation_type = :operation_type
                        """
                    ),
                    parameters,
                ).first()
                if occupied is not None:
                    raise OperationConflict(
                        "stage attempt and operation type already use another operation ID"
                    )
                raise OperationConflict("operation ID belongs to another immutable owner")
            if row.canonical_input_hash != envelope.canonical_input_hash:
                raise OperationConflict("operation ID was reused with changed input")
            if hasattr(row, "input_payload") and row.input_payload != payload:
                raise OperationConflict("operation ID was reused with changed envelope")
            return _record(row)

    def get(self, tenant_id: UUID, operation_id: UUID) -> OperationRecord | None:
        with self.engine.begin() as connection:
            _tenant_context(connection, tenant_id)
            row = connection.execute(
                text(
                    """
                    SELECT operation_id, tenant_id, canonical_input_hash, status, result_payload,
                           retryable, error_class
                    FROM axwise.cognitive_operations
                    WHERE tenant_id = :tenant_id AND operation_id = :operation_id
                    """
                ),
                {"tenant_id": tenant_id, "operation_id": operation_id},
            ).first()
            return _record(row) if row else None

    def artifact_fact(self, tenant_id: UUID, artifact_id: UUID) -> dict[str, Any] | None:
        with self.engine.begin() as connection:
            _tenant_context(connection, tenant_id)
            row = connection.execute(
                text(
                    """
                    SELECT result_payload -> 'artifact' AS artifact
                    FROM axwise.cognitive_operations
                    WHERE tenant_id = :tenant_id
                      AND status = 'completed'
                      AND result_payload -> 'artifact' ->> 'artifactId' = :artifact_id
                    """
                ),
                {"tenant_id": tenant_id, "artifact_id": str(artifact_id)},
            ).first()
            return row.artifact if row else None

    def claim_next(self, lease_token: UUID, lease_seconds: int = 600) -> ClaimedOperation | None:
        if not 30 <= lease_seconds <= 3600:
            raise ValueError("operation lease must be between 30 and 3600 seconds")
        with self.engine.begin() as connection:
            row = connection.execute(
                text(
                    """
                    SELECT *
                    FROM axwise.claim_cognitive_operation(:lease_token, :lease_seconds)
                    """
                ),
                {"lease_token": lease_token, "lease_seconds": lease_seconds},
            ).first()
            if row is None:
                return None
            envelope = AxWiseOperationEnvelope.model_validate(row.input_payload)
            record = _record(row)
            if (
                envelope.operation_id != record.operation_id
                or envelope.owner.tenant_id != record.tenant_id
            ):
                raise RuntimeError("claimed operation envelope identity is inconsistent")
            return ClaimedOperation(record=record, envelope=envelope, lease_token=lease_token)

    def renew(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        lease_token: UUID,
        lease_seconds: int = 600,
    ) -> bool:
        if not 30 <= lease_seconds <= 3600:
            raise ValueError("operation lease must be between 30 and 3600 seconds")
        with self.engine.begin() as connection:
            _tenant_context(connection, tenant_id)
            renewed = connection.execute(
                text(
                    "SELECT axwise.renew_cognitive_operation("
                    ":tenant_id, :operation_id, :lease_token, :lease_seconds)"
                ),
                {
                    "tenant_id": tenant_id,
                    "operation_id": operation_id,
                    "lease_token": lease_token,
                    "lease_seconds": lease_seconds,
                },
            ).scalar_one()
            return bool(renewed)

    def complete(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        lease_token: UUID,
        result: dict[str, Any],
    ) -> None:
        self._finalize(
            tenant_id,
            operation_id,
            lease_token,
            status="completed",
            result_payload=result,
            retryable=None,
            error_class=None,
        )

    def fail(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        lease_token: UUID,
        *,
        retryable: bool,
        error_class: str,
    ) -> None:
        self._finalize(
            tenant_id,
            operation_id,
            lease_token,
            status="failed",
            result_payload=None,
            retryable=retryable,
            error_class=error_class,
        )

    def _finalize(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        lease_token: UUID,
        *,
        status: str,
        result_payload: dict[str, Any] | None,
        retryable: bool | None,
        error_class: str | None,
    ) -> None:
        with self.engine.begin() as connection:
            _tenant_context(connection, tenant_id)
            parameters = {
                "tenant_id": tenant_id,
                "operation_id": operation_id,
                "lease_token": lease_token,
                "result_payload": (
                    json.dumps(result_payload, ensure_ascii=False, separators=(",", ":"))
                    if result_payload is not None
                    else None
                ),
                "retryable": retryable,
                "error_class": error_class,
            }
            if status == "completed":
                finalized = connection.execute(
                    text(
                        "SELECT axwise.complete_cognitive_operation("
                        ":tenant_id, :operation_id, :lease_token, "
                        "CAST(:result_payload AS jsonb))"
                    ),
                    parameters,
                ).scalar_one()
            else:
                finalized = connection.execute(
                    text(
                        "SELECT axwise.fail_cognitive_operation("
                        ":tenant_id, :operation_id, :lease_token, "
                        ":retryable, :error_class)"
                    ),
                    parameters,
                ).scalar_one()
            if not finalized:
                raise StaleOperationLease("expired or stale operation lease cannot finalize")
