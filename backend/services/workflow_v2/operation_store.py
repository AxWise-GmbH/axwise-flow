from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from backend.domain.workflow_v2.contracts import AxWiseOperationEnvelope


class OperationConflict(ValueError):
    """An operation ID was reused with a changed immutable envelope."""


class StaleOperationLease(RuntimeError):
    """A worker tried to finalize after losing its operation lease."""


@dataclass(frozen=True)
class OperationRecord:
    operation_id: UUID
    canonical_input_hash: str
    status: str
    result_payload: dict[str, Any] | None
    retryable: bool | None
    error_class: str | None


def _record(row: Any) -> OperationRecord:
    return OperationRecord(
        operation_id=row.operation_id,
        canonical_input_hash=row.canonical_input_hash,
        status=row.status,
        result_payload=row.result_payload,
        retryable=row.retryable,
        error_class=row.error_class,
    )


class PostgresOperationStore:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    @classmethod
    def from_environment(cls) -> "PostgresOperationStore":
        database_url = os.getenv("AXWISE_OPERATION_DATABASE_URL")
        if not database_url:
            raise RuntimeError("AXWISE_OPERATION_DATABASE_URL is required")
        return cls(
            create_engine(
                database_url,
                pool_pre_ping=True,
                pool_size=int(os.getenv("AXWISE_OPERATION_DATABASE_POOL_SIZE", "8")),
                pool_recycle=1800,
            )
        )

    def adopt_or_create(self, envelope: AxWiseOperationEnvelope) -> OperationRecord:
        payload = envelope.model_dump(mode="json", by_alias=True)
        with self.engine.begin() as connection:
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
                    ON CONFLICT (operation_id) DO NOTHING
                    RETURNING operation_id, canonical_input_hash, status, result_payload,
                              retryable, error_class
                    """
                ),
                {
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
                    "input_payload": __import__("json").dumps(payload, separators=(",", ":")),
                },
            ).first()
            row = inserted or connection.execute(
                text(
                    """
                    SELECT operation_id, canonical_input_hash, status, result_payload,
                           retryable, error_class, input_payload
                    FROM axwise.cognitive_operations
                    WHERE operation_id = :operation_id
                    FOR UPDATE
                    """
                ),
                {"operation_id": envelope.operation_id},
            ).first()
            if row is None:
                raise RuntimeError("operation insert/adoption failed")
            if row.canonical_input_hash != envelope.canonical_input_hash:
                raise OperationConflict("operation ID was reused with changed input")
            if hasattr(row, "input_payload") and row.input_payload != payload:
                raise OperationConflict("operation ID was reused with changed envelope")
            return _record(row)

    def get(self, operation_id: UUID) -> OperationRecord | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                text(
                    """
                    SELECT operation_id, canonical_input_hash, status, result_payload,
                           retryable, error_class
                    FROM axwise.cognitive_operations
                    WHERE operation_id = :operation_id
                    """
                ),
                {"operation_id": operation_id},
            ).first()
            return _record(row) if row else None

    def artifact_payload(self, artifact_id: UUID) -> dict[str, Any] | None:
        with self.engine.connect() as connection:
            row = connection.execute(
                text(
                    """
                    SELECT result_payload -> 'artifact' -> 'payload' AS payload
                    FROM axwise.cognitive_operations
                    WHERE status = 'completed'
                      AND result_payload -> 'artifact' ->> 'artifactId' = :artifact_id
                    """
                ),
                {"artifact_id": str(artifact_id)},
            ).first()
            return row.payload if row else None

    def claim(self, operation_id: UUID, lease_token: UUID, lease_seconds: int = 600) -> bool:
        if not 30 <= lease_seconds <= 3600:
            raise ValueError("operation lease must be between 30 and 3600 seconds")
        now = datetime.now(timezone.utc)
        with self.engine.begin() as connection:
            row = connection.execute(
                text(
                    """
                    UPDATE axwise.cognitive_operations
                    SET status = 'running', lease_token = :lease_token,
                        lease_expires_at = :lease_expires_at
                    WHERE operation_id = :operation_id
                      AND status IN ('accepted', 'running')
                      AND (lease_token IS NULL OR lease_expires_at < :now)
                    RETURNING operation_id
                    """
                ),
                {
                    "operation_id": operation_id,
                    "lease_token": lease_token,
                    "lease_expires_at": now + timedelta(seconds=lease_seconds),
                    "now": now,
                },
            ).first()
            return row is not None

    def complete(self, operation_id: UUID, lease_token: UUID, result: dict[str, Any]) -> None:
        self._finalize(
            operation_id,
            lease_token,
            status="completed",
            result_payload=result,
            retryable=None,
            error_class=None,
        )

    def fail(
        self,
        operation_id: UUID,
        lease_token: UUID,
        *,
        retryable: bool,
        error_class: str,
    ) -> None:
        self._finalize(
            operation_id,
            lease_token,
            status="failed",
            result_payload=None,
            retryable=retryable,
            error_class=error_class,
        )

    def _finalize(
        self,
        operation_id: UUID,
        lease_token: UUID,
        *,
        status: str,
        result_payload: dict[str, Any] | None,
        retryable: bool | None,
        error_class: str | None,
    ) -> None:
        with self.engine.begin() as connection:
            row = connection.execute(
                text(
                    """
                    UPDATE axwise.cognitive_operations
                    SET status = :status, result_payload = CAST(:result_payload AS jsonb),
                        retryable = :retryable, error_class = :error_class,
                        lease_token = NULL, lease_expires_at = NULL,
                        completed_at = clock_timestamp()
                    WHERE operation_id = :operation_id
                      AND status = 'running'
                      AND lease_token = :lease_token
                      AND lease_expires_at >= clock_timestamp()
                    RETURNING operation_id
                    """
                ),
                {
                    "operation_id": operation_id,
                    "lease_token": lease_token,
                    "status": status,
                    "result_payload": (
                        __import__("json").dumps(result_payload, separators=(",", ":"))
                        if result_payload is not None
                        else None
                    ),
                    "retryable": retryable,
                    "error_class": error_class,
                },
            ).first()
            if row is None:
                raise StaleOperationLease("expired or stale operation lease cannot finalize")
