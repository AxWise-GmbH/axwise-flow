from __future__ import annotations

import asyncio
import math
import re
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, Protocol
from uuid import UUID

from pydantic import TypeAdapter

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    OperationAccepted,
    OperationCancelled,
    OperationCompleted,
    OperationEvent,
    OperationEventPage,
    OperationFailed,
    OperationFailureDiagnostics,
    OperationFailurePhaseDiagnostics,
    OperationResponse,
    Rfc3339Utc,
)
from backend.services.workflow_v2.operation_store import (
    OperationEventBatch,
    OperationRecord,
)
from backend.services.workflow_v2.research_diagnostics import (
    research_evidence_from_runtime_diagnostics,
)

_COMPLETION_RESULT_ADAPTER = TypeAdapter(CompletionResult)
_RFC3339_UTC_ADAPTER = TypeAdapter(Rfc3339Utc)
_DIAGNOSTIC_TOKEN = re.compile(r"^[A-Za-z0-9_:-]{1,100}$")


def _mapping_value(value: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in value:
            return value[key]
    return None


def _safe_token(value: Any) -> str | None:
    return (
        value
        if isinstance(value, str) and _DIAGNOSTIC_TOKEN.fullmatch(value)
        else None
    )


def _safe_int(
    value: Mapping[str, Any],
    *keys: str,
    minimum: int,
    maximum: int,
) -> int | None:
    candidate = _mapping_value(value, *keys)
    if type(candidate) is int and minimum <= candidate <= maximum:
        return candidate
    return None


def _safe_phase_diagnostics(value: Any) -> dict[str, Any] | None:
    if isinstance(value, OperationFailurePhaseDiagnostics):
        return value.model_dump(mode="json", exclude_none=True, exclude_unset=True)
    if not isinstance(value, Mapping):
        return None
    route = _safe_token(value.get("route"))
    status = _safe_token(value.get("status"))
    if route is None or status is None:
        return None
    result: dict[str, Any] = {"route": route, "status": status}
    for field, aliases, minimum, maximum in (
        ("elapsed_ms", ("elapsed_ms", "elapsedMs"), 0, 900_000),
        ("call_count", ("call_count", "callCount"), 0, 100),
        ("retry_count", ("retry_count", "retryCount"), 0, 100),
        ("input_tokens", ("input_tokens", "inputTokens"), 0, 2_000_000),
        ("output_tokens", ("output_tokens", "outputTokens"), 0, 2_000_000),
        ("total_tokens", ("total_tokens", "totalTokens"), 0, 2_000_000),
        ("reasoning_tokens", ("reasoning_tokens", "reasoningTokens"), 0, 2_000_000),
        (
            "upstream_status_code",
            ("upstream_status_code", "upstreamStatusCode"),
            100,
            599,
        ),
        (
            "retry_after_seconds",
            ("retry_after_seconds", "retryAfterSeconds"),
            1,
            900,
        ),
    ):
        normalized = _safe_int(
            value,
            *aliases,
            minimum=minimum,
            maximum=maximum,
        )
        if normalized is not None:
            result[field] = normalized
    limit_kind = _mapping_value(value, "limit_kind", "limitKind")
    if limit_kind in (
        "request", "per_request_input", "input", "output", "total",
        "provider_output", "deadline", "unknown",
    ):
        result["limit_kind"] = limit_kind
    usage_complete = _mapping_value(value, "usage_complete", "usageComplete")
    if type(usage_complete) is bool:
        result["usage_complete"] = usage_complete
    if _mapping_value(value, "primary_skipped", "primarySkipped") is True:
        result["primary_skipped"] = True
        result["circuit_state"] = "open"
    return OperationFailurePhaseDiagnostics.model_validate(result).model_dump(
        mode="json", exclude_none=True, exclude_unset=True
    )


def sanitize_failure_diagnostics(value: Any) -> dict[str, Any] | None:
    """Return only bounded counters and status tokens, never provider content."""

    if isinstance(value, OperationFailureDiagnostics):
        return value.model_dump(mode="json", exclude_none=True, exclude_unset=True)
    if not isinstance(value, Mapping):
        return None
    result = _safe_phase_diagnostics(value)
    if result is None:
        return None
    primary_status = _safe_token(
        _mapping_value(value, "primary_status", "primaryStatus")
    )
    if primary_status is not None:
        result["primary_status"] = primary_status
    for field, aliases in (
        ("fallback_attempted", ("fallback_attempted", "fallbackAttempted")),
        ("fallback_used", ("fallback_used", "fallbackUsed")),
    ):
        candidate = _mapping_value(value, *aliases)
        if type(candidate) is bool:
            result[field] = candidate
    for field in ("primary", "fallback"):
        phase = _safe_phase_diagnostics(value.get(field))
        if phase is not None:
            result[field] = phase
    discovery_value = value.get("discovery")
    fallback_value = value.get("fallback")
    if discovery_value is None and isinstance(fallback_value, Mapping):
        discovery_value = fallback_value.get("discovery")
    discovery = _safe_phase_diagnostics(discovery_value)
    if discovery is not None:
        result["discovery"] = discovery
    return OperationFailureDiagnostics.model_validate(result).model_dump(
        mode="json", exclude_none=True, exclude_unset=True
    )


def _safe_retry_after_seconds(value: Any) -> int | None:
    return value if type(value) is int and 1 <= value <= 900 else None


def _retry_after_from_diagnostics(value: Mapping[str, Any] | None) -> int | None:
    if value is None:
        return None
    direct = _safe_retry_after_seconds(value.get("retry_after_seconds"))
    if direct is not None:
        return direct
    primary = value.get("primary")
    return (
        _safe_retry_after_seconds(primary.get("retry_after_seconds"))
        if isinstance(primary, Mapping)
        else None
    )


def _safe_retry_at(value: Any) -> str | None:
    try:
        return (
            _RFC3339_UTC_ADAPTER.validate_python(value)
            if value is not None
            else None
        )
    except (TypeError, ValueError):
        return None


def _retry_at_after(seconds: int) -> str:
    return (
        (datetime.now(timezone.utc) + timedelta(seconds=seconds))
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


class CognitiveExecutionFailure(RuntimeError):
    def __init__(
        self,
        error_class: str,
        *,
        retryable: bool,
        retry_at: str | None = None,
        retry_after_seconds: int | None = None,
        diagnostics: Mapping[str, Any] | OperationFailureDiagnostics | None = None,
    ) -> None:
        super().__init__(error_class)
        self.error_class = error_class
        self.retryable = retryable
        # Operator-only facts do not extend the strict public/SQL failure
        # contract. Capture their bounded snapshot before that sanitizer drops
        # unrecognized keys; never retain the raw provider diagnostics.
        self.evidence_diagnostics = research_evidence_from_runtime_diagnostics(diagnostics)
        self.diagnostics = sanitize_failure_diagnostics(diagnostics)
        normalized_retry_after = _safe_retry_after_seconds(retry_after_seconds)
        if normalized_retry_after is None:
            normalized_retry_after = _retry_after_from_diagnostics(self.diagnostics)
        self.retry_after_seconds = normalized_retry_after if retryable else None
        normalized_retry_at = _safe_retry_at(retry_at)
        if retryable and normalized_retry_at is None and normalized_retry_after:
            normalized_retry_at = _retry_at_after(normalized_retry_after)
        self.retry_at = normalized_retry_at if retryable else None


class OperationStore(Protocol):
    def adopt_or_create(self, envelope: AxWiseOperationEnvelope) -> OperationRecord: ...

    def get(self, tenant_id: UUID, operation_id: UUID) -> OperationRecord | None: ...

    def request_cancel(
        self, tenant_id: UUID, operation_id: UUID
    ) -> OperationRecord | None: ...

    def events_after(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        *,
        after: int,
        limit: int,
    ) -> OperationEventBatch: ...


def _remaining_retry_seconds(retry_at: str | None, now: datetime) -> int | None:
    if retry_at is None:
        return None
    try:
        retry_time = datetime.fromisoformat(retry_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    if retry_time.tzinfo is None:
        return None
    remaining = math.ceil(
        (retry_time.astimezone(timezone.utc) - now.astimezone(timezone.utc)).total_seconds()
    )
    return min(900, remaining) if remaining >= 1 else None


def _current_failure_diagnostics(
    value: dict[str, Any] | None, remaining_retry_seconds: int | None
) -> dict[str, Any] | None:
    if value is None:
        return None
    result = deepcopy(value)
    for container in (
        result,
        result.get("primary"),
        result.get("fallback"),
        result.get("discovery"),
    ):
        if not isinstance(container, dict) or "retry_after_seconds" not in container:
            continue
        if remaining_retry_seconds is None:
            container.pop("retry_after_seconds", None)
        else:
            container["retry_after_seconds"] = remaining_retry_seconds
    return result


def _restore_legacy_assistant_schema_version(value: Any) -> Any:
    """Repair omitted discriminators in older sparse assistant results."""

    if not isinstance(value, dict) or _mapping_value(
        value, "result_type", "resultType"
    ) != "assistant_turn_completed":
        return value
    response = value.get("response")
    if not isinstance(response, dict):
        return value

    response_version = _mapping_value(response, "schema_version", "schemaVersion")
    missing_response_version = (
        "schema_version" not in response and "schemaVersion" not in response
    )
    if missing_response_version:
        response_version = (
            "axwise.assistant-turn.v2"
            if "presentations" in response
            else "axwise.assistant-turn.v1"
        )
    presentation_versions = {
        "generated_image": "axwise.presentation.generated-image.v1",
        "weather": "axwise.presentation.weather.v1",
        "currency": "axwise.presentation.currency.v1",
    }
    presentations = response.get("presentations")
    missing_presentation_versions = (
        response_version == "axwise.assistant-turn.v2"
        and isinstance(presentations, list)
        and any(
            isinstance(presentation, dict)
            and isinstance(presentation.get("kind"), str)
            and presentation.get("kind") in presentation_versions
            and "schema_version" not in presentation
            and "schemaVersion" not in presentation
            for presentation in presentations
        )
    )
    if not missing_response_version and not missing_presentation_versions:
        return value

    repaired = deepcopy(value)
    repaired_response = repaired["response"]
    if missing_response_version:
        repaired_response["schemaVersion"] = response_version
    if missing_presentation_versions:
        for presentation in repaired_response["presentations"]:
            if not isinstance(presentation, dict):
                continue
            kind = presentation.get("kind")
            version = presentation_versions.get(kind) if isinstance(kind, str) else None
            if (
                version is not None
                and "schema_version" not in presentation
                and "schemaVersion" not in presentation
            ):
                presentation["schemaVersion"] = version
    return repaired


def response_for(
    record: OperationRecord,
    status_url: str,
    *,
    now: datetime | None = None,
) -> OperationResponse:
    common = {
        "operation_id": record.operation_id,
        "canonical_input_hash": record.canonical_input_hash,
    }
    if record.status == "completed":
        return OperationCompleted(
            **common,
            status="completed",
            result=_COMPLETION_RESULT_ADAPTER.validate_python(
                _restore_legacy_assistant_schema_version(record.result_payload)
            ),
        )
    if record.status == "failed":
        retryable = bool(record.retryable)
        optional: dict[str, Any] = {}
        remaining_retry_seconds = _remaining_retry_seconds(
            record.retry_at,
            now or datetime.now(timezone.utc),
        )
        if retryable and record.retry_at is not None:
            optional["retry_at"] = record.retry_at
        if retryable and remaining_retry_seconds is not None:
            optional["retry_after_seconds"] = remaining_retry_seconds
        diagnostics = _current_failure_diagnostics(
            record.failure_diagnostics,
            remaining_retry_seconds,
        )
        if diagnostics is not None:
            optional["diagnostics"] = diagnostics
        return OperationFailed(
            **common,
            status="failed",
            retryable=retryable,
            error_class=record.error_class or "AXWISE_FAILED",
            **optional,
        )
    if record.status == "cancelled":
        return OperationCancelled(**common, status="cancelled")
    return OperationAccepted(
        **common,
        status=(
            record.status
            if record.status in {"accepted", "running", "cancel_requested"}
            else "accepted"
        ),
        status_url=status_url,
        retry_after_seconds=2,
    )


class OperationService:
    """Persist/adopt only; the dedicated worker owns all cognition."""

    def __init__(self, store: OperationStore) -> None:
        self.store = store

    async def submit(
        self,
        envelope: AxWiseOperationEnvelope,
        status_url: str,
    ) -> OperationResponse:
        record = await asyncio.to_thread(self.store.adopt_or_create, envelope)
        return response_for(record, status_url)

    async def status(
        self, tenant_id: UUID, operation_id: UUID, status_url: str
    ) -> OperationResponse | None:
        record = await asyncio.to_thread(self.store.get, tenant_id, operation_id)
        return response_for(record, status_url) if record else None

    async def cancel(
        self, tenant_id: UUID, operation_id: UUID, status_url: str
    ) -> OperationResponse | None:
        record = await asyncio.to_thread(
            self.store.request_cancel,
            tenant_id,
            operation_id,
        )
        return response_for(record, status_url) if record else None

    async def events(
        self,
        tenant_id: UUID,
        operation_id: UUID,
        *,
        after: int,
        limit: int,
        now: datetime | None = None,
    ) -> OperationEventPage | None:
        record = await asyncio.to_thread(self.store.get, tenant_id, operation_id)
        if record is None:
            return None
        batch = await asyncio.to_thread(
            self.store.events_after,
            tenant_id,
            operation_id,
            after=after,
            limit=limit,
        )
        event_time = now or datetime.now(timezone.utc)
        events = []
        for stored in batch.events:
            optional: dict[str, Any] = {}
            if stored.event_type == "failed":
                retryable = bool(stored.retryable)
                optional["retryable"] = retryable
                if stored.error_class is not None:
                    optional["error_class"] = stored.error_class
                remaining_retry_seconds = _remaining_retry_seconds(
                    stored.retry_at,
                    event_time,
                )
                if retryable and stored.retry_at is not None:
                    optional["retry_at"] = stored.retry_at
                if retryable and remaining_retry_seconds is not None:
                    optional["retry_after_seconds"] = remaining_retry_seconds
                diagnostics = _current_failure_diagnostics(
                    stored.failure_diagnostics,
                    remaining_retry_seconds,
                )
                if diagnostics is not None:
                    optional["diagnostics"] = diagnostics
            events.append(
                OperationEvent(
                    operation_id=stored.operation_id,
                    sequence=stored.sequence,
                    event_type=stored.event_type,
                    status=stored.status,
                    occurred_at=stored.occurred_at,
                    **optional,
                )
            )
        return OperationEventPage(
            operation_id=operation_id,
            after=after,
            next_after=events[-1].sequence if events else after,
            has_more=batch.has_more,
            events=events,
        )
