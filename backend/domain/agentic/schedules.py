"""Schedule lifetime contracts that cannot outlive delegated authority."""

from __future__ import annotations

from datetime import timedelta
from typing import Literal

from pydantic import AwareDatetime, Field, computed_field, model_validator

from backend.domain.agentic.base import (
    AgenticContractModel,
    OpaqueReference,
    Sha256Digest,
)
from backend.domain.agentic.enums import (
    AgentKind,
    ScheduleMisfirePolicy,
    ScheduleOverlapPolicy,
    ScheduleStatus,
)


class AgentScheduleLifetimeV1(AgenticContractModel):
    """Immutable activation snapshot; ``end_at`` is a completion horizon."""

    contract_version: Literal["1.0"] = "1.0"
    schedule_id: OpaqueReference
    schedule_version: int = Field(..., ge=1)
    agent_id: OpaqueReference
    agent_kind: AgentKind
    agent_lifecycle_version: int = Field(..., ge=1)
    status: ScheduleStatus
    created_at: AwareDatetime
    activated_at: AwareDatetime | None = None
    originating_run_terminal_at: AwareDatetime | None = None
    agent_expires_at: AwareDatetime | None = None
    end_at: AwareDatetime
    maximum_run_duration_seconds: int = Field(..., ge=1, le=604_800)
    activation_approval_hash: Sha256Digest | None = None
    misfire_policy: ScheduleMisfirePolicy = ScheduleMisfirePolicy.SKIP
    overlap_policy: ScheduleOverlapPolicy = ScheduleOverlapPolicy.FORBID

    @model_validator(mode="after")
    def validate_lifetime(self) -> "AgentScheduleLifetimeV1":
        if self.end_at <= self.created_at:
            raise ValueError("schedule end_at must be after created_at")
        if self.activated_at is not None and self.activated_at < self.created_at:
            raise ValueError("schedule activation cannot precede creation")

        has_been_activated = self.status in {
            ScheduleStatus.ACTIVE,
            ScheduleStatus.PAUSED,
            ScheduleStatus.REVOKED,
            ScheduleStatus.EXPIRED,
        }
        if has_been_activated:
            if self.activated_at is None or self.activation_approval_hash is None:
                raise ValueError(
                    "an activated schedule requires activation time and "
                    "approval binding"
                )

        if self.agent_kind == AgentKind.TEMPORARY:
            if (
                self.agent_expires_at is not None
                and self.originating_run_terminal_at is None
            ):
                raise ValueError(
                    "temporary Agent expiry requires originating terminal run time"
                )
            if has_been_activated and self.originating_run_terminal_at is None:
                raise ValueError(
                    "a temporary Agent schedule cannot activate before its "
                    "originating run is terminal"
                )
            if has_been_activated and self.agent_expires_at is None:
                raise ValueError(
                    "an activated temporary Agent schedule requires bound agent expiry"
                )
            if self.agent_expires_at is not None:
                if (
                    self.originating_run_terminal_at is not None
                    and self.agent_expires_at <= self.originating_run_terminal_at
                ):
                    raise ValueError(
                        "temporary Agent expiry must follow terminal run time"
                    )
                if self.end_at > self.agent_expires_at:
                    raise ValueError(
                        "schedule end_at cannot exceed temporary Agent expiry"
                    )
            if (
                has_been_activated
                and self.activated_at is not None
                and self.originating_run_terminal_at is not None
                and self.activated_at < self.originating_run_terminal_at
            ):
                raise ValueError(
                    "temporary Agent schedule activation cannot precede "
                    "terminal run time"
                )
        elif self.agent_expires_at is not None:
            raise ValueError("a persistent Agent schedule cannot bind temporary expiry")

        if self.activated_at is not None:
            horizon = min(
                value
                for value in (self.end_at, self.agent_expires_at)
                if value is not None
            )
            if (
                self.activated_at + timedelta(seconds=self.maximum_run_duration_seconds)
                > horizon
            ):
                raise ValueError("schedule has no room for its maximum run duration")
        return self

    @property
    def completion_horizon(self) -> AwareDatetime:
        if self.agent_expires_at is None:
            return self.end_at
        return min(self.end_at, self.agent_expires_at)


class ScheduleOccurrenceAdmissionV1(AgenticContractModel):
    lifetime: AgentScheduleLifetimeV1
    scheduled_for: AwareDatetime
    claim_time: AwareDatetime

    @model_validator(mode="after")
    def validate_occurrence_window(self) -> "ScheduleOccurrenceAdmissionV1":
        if self.lifetime.status != ScheduleStatus.ACTIVE:
            raise ValueError("only an active schedule can admit an occurrence")
        if (
            self.lifetime.activated_at is not None
            and self.scheduled_for < self.lifetime.activated_at
        ):
            raise ValueError("an occurrence cannot be scheduled before activation")
        effective_start = max(self.scheduled_for, self.claim_time)
        maximum_finish = effective_start + timedelta(
            seconds=self.lifetime.maximum_run_duration_seconds
        )
        if maximum_finish > self.lifetime.completion_horizon:
            raise ValueError(
                "occurrence cannot finish before the schedule and Agent horizons"
            )
        return self

    @computed_field
    @property
    def effective_start(self) -> AwareDatetime:
        return max(self.scheduled_for, self.claim_time)

    @computed_field
    @property
    def run_deadline(self) -> AwareDatetime:
        """Upper bound also used to clamp every tool and capability grant."""

        return self.lifetime.completion_horizon


def validate_schedule_occurrence_lifetime(
    lifetime: AgentScheduleLifetimeV1,
    *,
    scheduled_for: AwareDatetime,
    claim_time: AwareDatetime,
) -> ScheduleOccurrenceAdmissionV1:
    return ScheduleOccurrenceAdmissionV1(
        lifetime=lifetime,
        scheduled_for=scheduled_for,
        claim_time=claim_time,
    )


ScheduleLifetimeV1 = AgentScheduleLifetimeV1


__all__ = [
    "AgentScheduleLifetimeV1",
    "ScheduleLifetimeV1",
    "ScheduleOccurrenceAdmissionV1",
    "validate_schedule_occurrence_lifetime",
]
