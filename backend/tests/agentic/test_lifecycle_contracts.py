from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from backend.domain.agentic import (
    AgentKind,
    AgentLifecycleStatus,
    AgentLifecycleV1,
    AgentTeamLifecycleV1,
    AgentTeamMemberV1,
    AgentTeamRole,
    AgentTeamStatus,
    DescriptorVersionRefV1,
    PersonaVersionRefV1,
    validate_agent_lifecycle_transition,
    validate_team_lifecycle_transition,
)


pytestmark = [pytest.mark.contract, pytest.mark.unit]
NOW = datetime(2026, 9, 4, 10, 0, tzinfo=timezone.utc)
HASH_A = "a" * 64


def persona_ref() -> PersonaVersionRefV1:
    return PersonaVersionRefV1(
        persona_id="persona-1",
        persona_version="1.0",
        content_hash=HASH_A,
    )


def test_version_references_are_frozen_hashable_and_reject_unknown_fields():
    reference = DescriptorVersionRefV1(
        descriptor_key="agent_reason_v1",
        schema_version="1.0",
        content_hash=HASH_A,
    )

    assert {reference: "pinned"}[reference] == "pinned"
    with pytest.raises(ValidationError, match="frozen"):
        reference.content_hash = "b" * 64  # type: ignore[misc]
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        DescriptorVersionRefV1.model_validate(
            {
                "descriptor_key": "agent_reason_v1",
                "schema_version": "1.0",
                "content_hash": HASH_A,
                "workflow_id": "hidden-runtime-detail",
            }
        )


def test_active_temporary_agent_can_wait_for_originating_run_to_fix_expiry():
    agent = AgentLifecycleV1(
        agent_id="agent-1",
        agent_kind=AgentKind.TEMPORARY,
        status=AgentLifecycleStatus.ACTIVE,
        persona_version=persona_ref(),
        originating_run_id="run-1",
        created_at=NOW,
        activated_at=NOW + timedelta(seconds=1),
    )

    assert agent.expires_at is None
    assert agent.agent_kind is AgentKind.TEMPORARY


def test_persistent_agent_cannot_retain_temporary_expiry():
    with pytest.raises(ValidationError, match="persistent Agent"):
        AgentLifecycleV1(
            agent_id="agent-1",
            agent_kind=AgentKind.PERSISTENT,
            status=AgentLifecycleStatus.ACTIVE,
            persona_version=persona_ref(),
            originating_run_id="run-1",
            created_at=NOW,
            activated_at=NOW,
            expires_at=NOW + timedelta(days=7),
        )


def test_terminal_lifecycle_states_require_their_evidence_timestamp():
    with pytest.raises(ValidationError, match="revoked Agent requires revoked_at"):
        AgentLifecycleV1(
            agent_id="agent-1",
            agent_kind=AgentKind.TEMPORARY,
            status=AgentLifecycleStatus.REVOKED,
            persona_version=persona_ref(),
            originating_run_id="run-1",
            created_at=NOW,
            activated_at=NOW,
        )


def test_lifecycle_transition_tables_fail_closed():
    validate_agent_lifecycle_transition(
        AgentLifecycleStatus.PROPOSED,
        AgentLifecycleStatus.ACTIVE,
    )
    validate_team_lifecycle_transition(AgentTeamStatus.ACTIVE, AgentTeamStatus.PAUSED)

    with pytest.raises(ValueError, match="illegal Agent lifecycle transition"):
        validate_agent_lifecycle_transition(
            AgentLifecycleStatus.REVOKED,
            AgentLifecycleStatus.ACTIVE,
        )
    with pytest.raises(ValueError, match="illegal team lifecycle transition"):
        validate_team_lifecycle_transition(
            AgentTeamStatus.REVOKED,
            AgentTeamStatus.ACTIVE,
        )


def valid_team() -> AgentTeamLifecycleV1:
    return AgentTeamLifecycleV1(
        team_id="team-1",
        status=AgentTeamStatus.ACTIVE,
        coordinator_agent_id="agent-coordinator",
        members=(
            AgentTeamMemberV1(
                agent_id="agent-coordinator",
                role=AgentTeamRole.COORDINATOR,
            ),
            AgentTeamMemberV1(
                agent_id="agent-worker",
                role=AgentTeamRole.WORKER,
                parent_agent_id="agent-coordinator",
            ),
            AgentTeamMemberV1(
                agent_id="agent-reviewer",
                role=AgentTeamRole.REVIEWER,
            ),
        ),
        created_at=NOW,
        activated_at=NOW,
    )


def test_team_validates_coordinator_and_reviewer_independence():
    team = valid_team()

    assert team.is_independent_reviewer("agent-reviewer", "agent-worker")
    assert not team.is_independent_reviewer("agent-worker", "agent-worker")
    assert not team.is_independent_reviewer("agent-coordinator", "agent-worker")


def test_team_rejects_unknown_parent_cycle_and_excess_depth():
    base = valid_team().model_dump()
    base["members"][1]["parent_agent_id"] = "missing-agent"
    with pytest.raises(ValidationError, match="unknown parent"):
        AgentTeamLifecycleV1.model_validate(base)

    cycle = valid_team().model_dump()
    cycle["members"][0]["parent_agent_id"] = "agent-worker"
    with pytest.raises(ValidationError, match="coordinator cannot have a parent"):
        AgentTeamLifecycleV1.model_validate(cycle)

    deep = valid_team().model_dump()
    deep["members"] = list(deep["members"]) + [
        {
            "agent_id": "agent-child",
            "role": "worker",
            "parent_agent_id": "agent-worker",
        },
        {
            "agent_id": "agent-grandchild",
            "role": "worker",
            "parent_agent_id": "agent-child",
        },
    ]
    with pytest.raises(ValidationError, match="maximum_parent_child_depth"):
        AgentTeamLifecycleV1.model_validate(deep)


def test_preview_team_size_and_depth_match_the_orqaly_control_plane():
    schema = AgentTeamLifecycleV1.model_json_schema()["properties"]

    assert schema["members"]["maxItems"] == 5
    assert schema["maximum_parent_child_depth"]["maximum"] == 2

    oversized = valid_team().model_dump()
    oversized["members"] = list(oversized["members"]) + [
        {
            "agent_id": f"agent-extra-{index}",
            "role": "worker",
            "parent_agent_id": "agent-coordinator",
        }
        for index in range(3)
    ]
    with pytest.raises(ValidationError, match="at most 5 items"):
        AgentTeamLifecycleV1.model_validate(oversized)
