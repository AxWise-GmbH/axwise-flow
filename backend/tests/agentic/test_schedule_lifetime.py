from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from backend.domain.agentic import (
    AgentKind,
    AgentScheduleLifetimeV1,
    ScheduleOccurrenceAdmissionV1,
    ScheduleStatus,
    validate_schedule_occurrence_lifetime,
)


pytestmark = [pytest.mark.contract, pytest.mark.unit]
NOW = datetime(2026, 9, 4, 10, 0, tzinfo=timezone.utc)
HASH_A = "a" * 64


def active_temporary_schedule(**changes) -> AgentScheduleLifetimeV1:
    payload = {
        "schedule_id": "schedule-1",
        "schedule_version": 1,
        "agent_id": "agent-1",
        "agent_kind": AgentKind.TEMPORARY,
        "agent_lifecycle_version": 3,
        "status": ScheduleStatus.ACTIVE,
        "created_at": NOW,
        "activated_at": NOW + timedelta(minutes=1),
        "originating_run_terminal_at": NOW + timedelta(seconds=30),
        "agent_expires_at": NOW + timedelta(hours=2),
        "end_at": NOW + timedelta(hours=2),
        "maximum_run_duration_seconds": 3_600,
        "activation_approval_hash": HASH_A,
    }
    payload.update(changes)
    return AgentScheduleLifetimeV1.model_validate(payload)


def test_temporary_schedule_activation_binds_terminal_run_and_expiry():
    schedule = active_temporary_schedule()

    assert schedule.completion_horizon == NOW + timedelta(hours=2)
    with pytest.raises(ValidationError, match="originating terminal run"):
        active_temporary_schedule(originating_run_terminal_at=None)
    with pytest.raises(ValidationError, match="bound agent expiry"):
        active_temporary_schedule(agent_expires_at=None)
    with pytest.raises(ValidationError, match="activation cannot precede"):
        active_temporary_schedule(
            activated_at=NOW + timedelta(seconds=15),
            originating_run_terminal_at=NOW + timedelta(seconds=30),
        )


def test_schedule_end_may_equal_but_never_exceed_agent_expiry():
    assert (
        active_temporary_schedule().end_at
        == active_temporary_schedule().agent_expires_at
    )
    with pytest.raises(ValidationError, match="cannot exceed"):
        active_temporary_schedule(end_at=NOW + timedelta(hours=2, microseconds=1))


def test_draft_temporary_schedule_can_wait_for_agent_expiry():
    schedule = AgentScheduleLifetimeV1(
        schedule_id="schedule-draft",
        schedule_version=1,
        agent_id="agent-1",
        agent_kind=AgentKind.TEMPORARY,
        agent_lifecycle_version=1,
        status=ScheduleStatus.DRAFT,
        created_at=NOW,
        end_at=NOW + timedelta(days=1),
        maximum_run_duration_seconds=60,
    )

    assert schedule.agent_expires_at is None

    with pytest.raises(ValidationError, match="expiry requires originating"):
        AgentScheduleLifetimeV1(
            schedule_id="schedule-draft",
            schedule_version=1,
            agent_id="agent-1",
            agent_kind=AgentKind.TEMPORARY,
            agent_lifecycle_version=1,
            status=ScheduleStatus.DRAFT,
            created_at=NOW,
            agent_expires_at=NOW + timedelta(days=2),
            end_at=NOW + timedelta(days=1),
            maximum_run_duration_seconds=60,
        )


def test_persistent_schedule_does_not_reuse_temporary_expiry():
    with pytest.raises(ValidationError, match="persistent Agent"):
        active_temporary_schedule(agent_kind=AgentKind.PERSISTENT)


def test_occurrence_exact_fit_is_accepted_and_deadline_is_clamped():
    schedule = active_temporary_schedule()
    admitted = validate_schedule_occurrence_lifetime(
        schedule,
        scheduled_for=NOW + timedelta(hours=1),
        claim_time=NOW + timedelta(hours=1),
    )

    assert admitted.effective_start == NOW + timedelta(hours=1)
    assert admitted.run_deadline == schedule.end_at


def test_late_claim_that_cannot_finish_is_rejected():
    schedule = active_temporary_schedule()
    with pytest.raises(ValidationError, match="cannot finish"):
        ScheduleOccurrenceAdmissionV1(
            lifetime=schedule,
            scheduled_for=NOW + timedelta(hours=1),
            claim_time=NOW + timedelta(hours=1, microseconds=1),
        )


def test_paused_schedule_cannot_admit_occurrence():
    schedule = active_temporary_schedule(status=ScheduleStatus.PAUSED)
    with pytest.raises(ValidationError, match="only an active schedule"):
        ScheduleOccurrenceAdmissionV1(
            lifetime=schedule,
            scheduled_for=NOW + timedelta(minutes=30),
            claim_time=NOW + timedelta(minutes=30),
        )


def test_naive_schedule_datetime_is_rejected():
    with pytest.raises(ValidationError, match="timezone"):
        active_temporary_schedule(end_at=datetime(2026, 9, 4, 12, 0))
