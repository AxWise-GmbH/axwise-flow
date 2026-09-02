from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import SQLAlchemyError

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    SynthesizeArtifactInputV1,
)


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
    retry_at: str | None = None
    retry_after_seconds: int | None = None
    failure_diagnostics: dict[str, Any] | None = None


@dataclass(frozen=True)
class ClaimedOperation:
    record: OperationRecord
    envelope: AxWiseOperationEnvelope
    lease_token: UUID


@dataclass(frozen=True)
class OperationEventRecord:
    operation_id: UUID
    sequence: int
    event_type: str
    status: str
    occurred_at: str
    retryable: bool | None = None
    error_class: str | None = None
    retry_at: str | None = None
    retry_after_seconds: int | None = None
    failure_diagnostics: dict[str, Any] | None = None


@dataclass(frozen=True)
class OperationEventBatch:
    events: tuple[OperationEventRecord, ...]
    has_more: bool


def _utc_timestamp(value: Any, *, field: str) -> str:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise RuntimeError(f"stored {field} must be a timezone-aware timestamp")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _record(row: Any) -> OperationRecord:
    retry_at = getattr(row, "retry_at", None)
    if isinstance(retry_at, datetime):
        retry_at = _utc_timestamp(retry_at, field="retry timestamp")
    return OperationRecord(
        operation_id=row.operation_id,
        tenant_id=row.tenant_id,
        canonical_input_hash=row.canonical_input_hash,
        status=row.status,
        result_payload=row.result_payload,
        retryable=row.retryable,
        error_class=row.error_class,
        retry_at=retry_at,
        retry_after_seconds=getattr(row, "retry_after_seconds", None),
        failure_diagnostics=getattr(row, "failure_diagnostics", None),
    )


def _event(row: Any) -> OperationEventRecord:
    retry_at = row.retry_at
    if isinstance(retry_at, datetime):
        retry_at = _utc_timestamp(retry_at, field="event retry timestamp")
    return OperationEventRecord(
        operation_id=row.operation_id,
        sequence=int(row.sequence),
        event_type=row.event_type,
        status=row.status,
        occurred_at=_utc_timestamp(row.occurred_at, field="event occurrence"),
        retryable=row.retryable,
        error_class=row.error_class,
        retry_at=retry_at,
        retry_after_seconds=row.retry_after_seconds,
        failure_diagnostics=row.failure_diagnostics,
    )


def _tenant_context(connection: Connection, tenant_id: UUID) -> None:
    connection.execute(
        text("SELECT set_config('axwise.tenant_id', :tenant_id, true)"),
        {"tenant_id": str(tenant_id)},
    )


def _stored_envelope_payload(envelope: AxWiseOperationEnvelope) -> dict[str, Any]:
    """Normalize only the strict purpose-discriminated synthesis wire shape."""

    payload = envelope.model_dump(mode="json", by_alias=True)
    if isinstance(envelope.input, SynthesizeArtifactInputV1):
        payload["input"] = {
            key: value for key, value in payload["input"].items() if value is not None
        }
    return payload


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
        try:
            with self.engine.connect() as connection:
                return bool(
                    connection.execute(
                        text(
                            """
                            WITH surface AS (
                              SELECT
                                to_regclass(
                                  'axwise.cognitive_operations'
                                ) AS operations_relation,
                                to_regclass(
                                  'axwise.operation_events'
                                ) AS events_relation,
                                to_regprocedure(
                                  'axwise.fail_cognitive_operation(uuid,uuid,uuid,'
                                  'boolean,text,timestamp with time zone,integer,jsonb)'
                                ) AS fail_procedure,
                                to_regprocedure(
                                  'axwise.request_cognitive_operation_cancel(uuid,uuid)'
                                ) AS request_cancel_procedure,
                                to_regprocedure(
                                  'axwise.cancel_cognitive_operation(uuid,uuid,uuid)'
                                ) AS cancel_procedure,
                                to_regprocedure(
                                  'axwise.claim_cognitive_operation(uuid,integer)'
                                ) AS claim_procedure,
                                to_regprocedure(
                                  'axwise.renew_cognitive_operation(uuid,uuid,uuid,integer)'
                                ) AS renew_procedure,
                                to_regprocedure(
                                  'axwise.complete_cognitive_operation(uuid,uuid,uuid,jsonb)'
                                ) AS complete_procedure,
                                to_regrole('axwise_v2_api') AS api_role,
                                to_regrole('axwise_v2_worker') AS worker_role
                            )
                            SELECT COALESCE((
                              surface.operations_relation IS NOT NULL
                              AND surface.events_relation IS NOT NULL
                          AND (
                            SELECT count(*) = 3
                            FROM pg_attribute
                            WHERE attrelid = surface.operations_relation
                              AND attname IN (
                                'retry_at', 'failure_diagnostics', 'event_sequence'
                              )
                              AND NOT attisdropped
                          )
                          AND surface.fail_procedure IS NOT NULL
                          AND surface.request_cancel_procedure IS NOT NULL
                          AND surface.cancel_procedure IS NOT NULL
                          AND (
                            pg_has_role(current_user, surface.api_role, 'member')
                            OR pg_has_role(current_user, surface.worker_role, 'member')
                          )
                          AND (
                            NOT pg_has_role(current_user, surface.api_role, 'member')
                            OR (
                              has_table_privilege(
                                current_user, surface.operations_relation, 'SELECT'
                              )
                              AND has_table_privilege(
                                current_user, surface.operations_relation, 'INSERT'
                              )
                              AND has_table_privilege(
                                current_user, surface.events_relation, 'SELECT'
                              )
                              AND has_function_privilege(
                                current_user,
                                surface.request_cancel_procedure,
                                'EXECUTE'
                              )
                            )
                          )
                          AND (
                            NOT pg_has_role(current_user, surface.worker_role, 'member')
                            OR (
                              has_table_privilege(
                                current_user, surface.operations_relation, 'SELECT'
                              )
                              AND has_function_privilege(
                                current_user, surface.claim_procedure, 'EXECUTE'
                              )
                              AND has_function_privilege(
                                current_user, surface.renew_procedure, 'EXECUTE'
                              )
                              AND has_function_privilege(
                                current_user, surface.complete_procedure, 'EXECUTE'
                              )
                              AND has_function_privilege(
                                current_user, surface.fail_procedure, 'EXECUTE'
                              )
                              AND has_function_privilege(
                                current_user, surface.cancel_procedure, 'EXECUTE'
                              )
                            )
                          )
                            ), false)
                            FROM surface
                            """
                        )
                    ).scalar_one()
                )
        except SQLAlchemyError:
            return False

    def adopt_or_create(self, envelope: AxWiseOperationEnvelope) -> OperationRecord:
        payload = _stored_envelope_payload(envelope)
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
                                  result_payload, retryable, error_class, retry_at,
                                  retry_after_seconds, failure_diagnostics
                    """
                ),
                parameters,
            ).first()
            row = inserted or connection.execute(
                text(
                    """
                    SELECT operation_id, tenant_id, canonical_input_hash, status, result_payload,
                           retryable, error_class, retry_at, retry_after_seconds,
                           failure_diagnostics, input_payload
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
                           retryable, error_class, retry_at, retry_after_seconds,
                           failure_diagnostics
                    FROM axwise.cognitive_operations
                    WHERE tenant_id = :tenant_id AND operation_id = :operation_id
                    """
                ),
                {"tenant_id": tenant_id, "operation_id": operation_id},
            ).first()
            return _record(row) if row else None

    def request_cancel(
        self, tenant_id: UUID, operation_id: UUID
    ) -> OperationRecord | None:
        with self.engine.begin() as connection:
            _tenant_context(connection, tenant_id)
            resulting_status = connection.execute(
                text(
                    "SELECT axwise.request_cognitive_operation_cancel("
                    ":tenant_id, :operation_id)"
                ),
                {"tenant_id": tenant_id, "operation_id": operation_id},
            ).scalar_one_or_none()
            if resulting_status is None:
                return None
            row = connection.execute(
                text(
                    """
                    SELECT operation_id, tenant_id, canonical_input_hash, status,
                           result_payload, retryable, error_class, retry_at,
                           retry_after_seconds, failure_diagnostics
                    FROM axwise.cognitive_operations
                    WHERE tenant_id = :tenant_id AND operation_id = :operation_id
                    """
                ),
                {"tenant_id": tenant_id, "operation_id": operation_id},
            ).first()
            if row is None or row.status != resulting_status:
                raise RuntimeError("cancel transition did not return its stored operation")
            return _record(row)

    def events_after(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        *,
        after: int,
        limit: int,
    ) -> OperationEventBatch:
        if after < 0:
            raise ValueError("event cursor must be non-negative")
        if not 1 <= limit <= 200:
            raise ValueError("event page limit must be between 1 and 200")
        with self.engine.begin() as connection:
            _tenant_context(connection, tenant_id)
            rows = connection.execute(
                text(
                    """
                    SELECT operation_id, sequence, event_type, status, occurred_at,
                           retryable, error_class, retry_at, retry_after_seconds,
                           failure_diagnostics
                    FROM axwise.operation_events
                    WHERE tenant_id = :tenant_id
                      AND operation_id = :operation_id
                      AND sequence > :after
                    ORDER BY sequence
                    LIMIT :fetch_limit
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "operation_id": operation_id,
                    "after": after,
                    "fetch_limit": limit + 1,
                },
            ).all()
        return OperationEventBatch(
            events=tuple(_event(row) for row in rows[:limit]),
            has_more=len(rows) > limit,
        )

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

    def cancellation_requested(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        lease_token: UUID,
    ) -> bool:
        with self.engine.begin() as connection:
            _tenant_context(connection, tenant_id)
            return bool(
                connection.execute(
                    text(
                        """
                        SELECT EXISTS (
                          SELECT 1
                          FROM axwise.cognitive_operations
                          WHERE tenant_id = :tenant_id
                            AND operation_id = :operation_id
                            AND status = 'cancel_requested'
                            AND lease_token = :lease_token
                        )
                        """
                    ),
                    {
                        "tenant_id": tenant_id,
                        "operation_id": operation_id,
                        "lease_token": lease_token,
                    },
                ).scalar_one()
            )

    def cancel(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        lease_token: UUID,
    ) -> None:
        with self.engine.begin() as connection:
            _tenant_context(connection, tenant_id)
            cancelled = connection.execute(
                text(
                    "SELECT axwise.cancel_cognitive_operation("
                    ":tenant_id, :operation_id, :lease_token)"
                ),
                {
                    "tenant_id": tenant_id,
                    "operation_id": operation_id,
                    "lease_token": lease_token,
                },
            ).scalar_one()
            if not cancelled:
                raise StaleOperationLease(
                    "expired or stale operation lease cannot cancel"
                )

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
            retry_at=None,
            retry_after_seconds=None,
            failure_diagnostics=None,
        )

    def fail(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        lease_token: UUID,
        *,
        retryable: bool,
        error_class: str,
        retry_at: str | None = None,
        retry_after_seconds: int | None = None,
        failure_diagnostics: dict[str, Any] | None = None,
    ) -> None:
        self._finalize(
            tenant_id,
            operation_id,
            lease_token,
            status="failed",
            result_payload=None,
            retryable=retryable,
            error_class=error_class,
            retry_at=retry_at,
            retry_after_seconds=retry_after_seconds,
            failure_diagnostics=failure_diagnostics,
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
        retry_at: str | None,
        retry_after_seconds: int | None,
        failure_diagnostics: dict[str, Any] | None,
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
                "retry_at": retry_at,
                "retry_after_seconds": retry_after_seconds,
                "failure_diagnostics": (
                    json.dumps(
                        failure_diagnostics,
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    if failure_diagnostics is not None
                    else None
                ),
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
                        ":retryable, :error_class, :retry_at, "
                        ":retry_after_seconds, CAST(:failure_diagnostics AS jsonb))"
                    ),
                    parameters,
                ).scalar_one()
            if not finalized:
                raise StaleOperationLease("expired or stale operation lease cannot finalize")
