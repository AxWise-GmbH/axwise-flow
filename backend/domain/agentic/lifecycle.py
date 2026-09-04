"""Delegated Agent and bounded Agent-team lifecycle snapshots."""

from __future__ import annotations

from typing import Literal, Tuple

from pydantic import AwareDatetime, Field, model_validator

from backend.domain.agentic.base import AgenticContractModel, OpaqueReference
from backend.domain.agentic.enums import (
    AgentKind,
    AgentLifecycleStatus,
    AgentTeamRole,
    AgentTeamStatus,
)
from backend.domain.agentic.references import PersonaVersionRefV1


AGENT_LIFECYCLE_TRANSITIONS = frozenset(
    {
        (AgentLifecycleStatus.DRAFT, AgentLifecycleStatus.PROPOSED),
        (AgentLifecycleStatus.PROPOSED, AgentLifecycleStatus.ACTIVE),
        (AgentLifecycleStatus.PROPOSED, AgentLifecycleStatus.ARCHIVED),
        (AgentLifecycleStatus.ACTIVE, AgentLifecycleStatus.PAUSED),
        (AgentLifecycleStatus.ACTIVE, AgentLifecycleStatus.REVOKED),
        (AgentLifecycleStatus.ACTIVE, AgentLifecycleStatus.EXPIRED),
        (AgentLifecycleStatus.PAUSED, AgentLifecycleStatus.ACTIVE),
        (AgentLifecycleStatus.PAUSED, AgentLifecycleStatus.REVOKED),
        (AgentLifecycleStatus.PAUSED, AgentLifecycleStatus.EXPIRED),
        (AgentLifecycleStatus.REVOKED, AgentLifecycleStatus.ARCHIVED),
        (AgentLifecycleStatus.EXPIRED, AgentLifecycleStatus.ARCHIVED),
    }
)

TEAM_LIFECYCLE_TRANSITIONS = frozenset(
    {
        (AgentTeamStatus.PROPOSED, AgentTeamStatus.ACTIVE),
        (AgentTeamStatus.PROPOSED, AgentTeamStatus.ARCHIVED),
        (AgentTeamStatus.ACTIVE, AgentTeamStatus.PAUSED),
        (AgentTeamStatus.ACTIVE, AgentTeamStatus.REVOKED),
        (AgentTeamStatus.PAUSED, AgentTeamStatus.ACTIVE),
        (AgentTeamStatus.PAUSED, AgentTeamStatus.REVOKED),
        (AgentTeamStatus.REVOKED, AgentTeamStatus.ARCHIVED),
    }
)


def validate_agent_lifecycle_transition(
    source: AgentLifecycleStatus,
    target: AgentLifecycleStatus,
) -> None:
    if (source, target) not in AGENT_LIFECYCLE_TRANSITIONS:
        raise ValueError(
            f"illegal Agent lifecycle transition: {source.value} -> {target.value}"
        )


def validate_team_lifecycle_transition(
    source: AgentTeamStatus,
    target: AgentTeamStatus,
) -> None:
    if (source, target) not in TEAM_LIFECYCLE_TRANSITIONS:
        raise ValueError(
            f"illegal team lifecycle transition: {source.value} -> {target.value}"
        )


class AgentLifecycleV1(AgenticContractModel):
    contract_version: Literal["1.0"] = "1.0"
    agent_id: OpaqueReference
    agent_kind: AgentKind
    status: AgentLifecycleStatus
    persona_version: PersonaVersionRefV1
    originating_run_id: OpaqueReference
    team_id: OpaqueReference | None = None
    parent_agent_id: OpaqueReference | None = None
    state_version: int = Field(default=1, ge=1)
    created_at: AwareDatetime
    activated_at: AwareDatetime | None = None
    paused_at: AwareDatetime | None = None
    revoked_at: AwareDatetime | None = None
    expires_at: AwareDatetime | None = None
    archived_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_lifecycle(self) -> "AgentLifecycleV1":
        if self.parent_agent_id == self.agent_id:
            raise ValueError("an Agent cannot be its own parent")
        if self.activated_at is not None and self.activated_at < self.created_at:
            raise ValueError("activation cannot precede Agent creation")
        if self.expires_at is not None and self.expires_at <= self.created_at:
            raise ValueError("Agent expiry must be after creation")
        if self.agent_kind == AgentKind.PERSISTENT and self.expires_at is not None:
            raise ValueError("a persistent Agent cannot retain a temporary expiry")
        if self.status in {AgentLifecycleStatus.ACTIVE, AgentLifecycleStatus.PAUSED}:
            if self.activated_at is None:
                raise ValueError("an active or paused Agent requires activated_at")
        if self.status == AgentLifecycleStatus.PAUSED and self.paused_at is None:
            raise ValueError("a paused Agent requires paused_at")
        if self.status == AgentLifecycleStatus.REVOKED and self.revoked_at is None:
            raise ValueError("a revoked Agent requires revoked_at")
        if self.status == AgentLifecycleStatus.EXPIRED:
            if self.agent_kind != AgentKind.TEMPORARY or self.expires_at is None:
                raise ValueError("only a temporary Agent with expires_at can expire")
        if self.status == AgentLifecycleStatus.ARCHIVED and self.archived_at is None:
            raise ValueError("an archived Agent requires archived_at")
        return self


class AgentTeamMemberV1(AgenticContractModel):
    agent_id: OpaqueReference
    role: AgentTeamRole
    parent_agent_id: OpaqueReference | None = None

    @model_validator(mode="after")
    def parent_is_not_self(self) -> "AgentTeamMemberV1":
        if self.parent_agent_id == self.agent_id:
            raise ValueError("a team member cannot be its own parent")
        return self


class AgentTeamLifecycleV1(AgenticContractModel):
    contract_version: Literal["1.0"] = "1.0"
    team_id: OpaqueReference
    status: AgentTeamStatus
    coordinator_agent_id: OpaqueReference
    members: Tuple[AgentTeamMemberV1, ...] = Field(..., min_length=1, max_length=5)
    maximum_active_agents: int = Field(default=5, ge=1, le=50)
    maximum_parent_child_depth: int = Field(default=2, ge=0, le=2)
    state_version: int = Field(default=1, ge=1)
    created_at: AwareDatetime
    activated_at: AwareDatetime | None = None
    paused_at: AwareDatetime | None = None
    revoked_at: AwareDatetime | None = None
    archived_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_team(self) -> "AgentTeamLifecycleV1":
        member_ids = [member.agent_id for member in self.members]
        if len(member_ids) != len(set(member_ids)):
            raise ValueError("team members must have unique agent_id values")
        if len(self.members) > self.maximum_active_agents:
            raise ValueError("team exceeds maximum_active_agents")

        coordinators = [
            member
            for member in self.members
            if member.role == AgentTeamRole.COORDINATOR
        ]
        if len(coordinators) != 1:
            raise ValueError("a team requires exactly one coordinator")
        if coordinators[0].agent_id != self.coordinator_agent_id:
            raise ValueError(
                "coordinator_agent_id must identify the coordinator member"
            )
        if coordinators[0].parent_agent_id is not None:
            raise ValueError("the coordinator cannot have a parent Agent")

        known = set(member_ids)
        parent_by_member = {
            member.agent_id: member.parent_agent_id for member in self.members
        }
        for member in self.members:
            if (
                member.parent_agent_id is not None
                and member.parent_agent_id not in known
            ):
                raise ValueError(
                    f"team member {member.agent_id} references an unknown parent"
                )

        for member_id in member_ids:
            seen: set[str] = set()
            cursor: str | None = member_id
            depth = 0
            while cursor is not None:
                if cursor in seen:
                    raise ValueError("team parent relationships must be acyclic")
                seen.add(cursor)
                cursor = parent_by_member[cursor]
                if cursor is not None:
                    depth += 1
            if depth > self.maximum_parent_child_depth:
                raise ValueError("team exceeds maximum_parent_child_depth")

        if self.activated_at is not None and self.activated_at < self.created_at:
            raise ValueError("team activation cannot precede creation")
        if self.status in {AgentTeamStatus.ACTIVE, AgentTeamStatus.PAUSED}:
            if self.activated_at is None:
                raise ValueError("an active or paused team requires activated_at")
        if self.status == AgentTeamStatus.PAUSED and self.paused_at is None:
            raise ValueError("a paused team requires paused_at")
        if self.status == AgentTeamStatus.REVOKED and self.revoked_at is None:
            raise ValueError("a revoked team requires revoked_at")
        if self.status == AgentTeamStatus.ARCHIVED and self.archived_at is None:
            raise ValueError("an archived team requires archived_at")
        return self

    def is_independent_reviewer(self, reviewer_id: str, executor_id: str) -> bool:
        """Reject self-review and direct/indirect parent-child review."""

        if reviewer_id == executor_id:
            return False
        parent_by_member = {
            member.agent_id: member.parent_agent_id for member in self.members
        }
        if reviewer_id not in parent_by_member or executor_id not in parent_by_member:
            return False

        def ancestors(agent_id: str) -> set[str]:
            result: set[str] = set()
            cursor = parent_by_member[agent_id]
            while cursor is not None:
                result.add(cursor)
                cursor = parent_by_member[cursor]
            return result

        return reviewer_id not in ancestors(
            executor_id
        ) and executor_id not in ancestors(reviewer_id)


AgentV1 = AgentLifecycleV1
AgentTeamV1 = AgentTeamLifecycleV1


__all__ = [
    "AGENT_LIFECYCLE_TRANSITIONS",
    "AgentLifecycleV1",
    "AgentTeamLifecycleV1",
    "AgentTeamMemberV1",
    "AgentTeamV1",
    "AgentV1",
    "TEAM_LIFECYCLE_TRANSITIONS",
    "validate_agent_lifecycle_transition",
    "validate_team_lifecycle_transition",
]
