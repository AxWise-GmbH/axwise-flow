"""Stable provider-neutral enums for delegated-Agent execution contracts."""

from enum import Enum

from backend.domain.orchestration.enums import DataClassification


class AgentKind(str, Enum):
    TEMPORARY = "temporary"
    PERSISTENT = "persistent"


class AgentLifecycleStatus(str, Enum):
    DRAFT = "draft"
    PROPOSED = "proposed"
    ACTIVE = "active"
    PAUSED = "paused"
    REVOKED = "revoked"
    EXPIRED = "expired"
    ARCHIVED = "archived"


class AgentTeamStatus(str, Enum):
    PROPOSED = "proposed"
    ACTIVE = "active"
    PAUSED = "paused"
    REVOKED = "revoked"
    ARCHIVED = "archived"


class AgentTeamRole(str, Enum):
    COORDINATOR = "coordinator"
    WORKER = "worker"
    REVIEWER = "reviewer"


class StepKind(str, Enum):
    REASON = "reason"
    RETRIEVE = "retrieve"
    PRODUCE_ARTIFACT = "produce_artifact"
    CONNECTOR_READ = "connector_read"
    CONNECTOR_WRITE = "connector_write"
    SANDBOX_WORK = "sandbox_work"
    HUMAN_INPUT = "human_input"
    REVIEW = "review"
    WAIT_OR_MONITOR = "wait_or_monitor"
    NOTIFY = "notify"


class EffectExternality(str, Enum):
    NONE = "none"
    READ = "read"
    WRITE = "write"


class MutationKind(str, Enum):
    NONE = "none"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class EffectFlag(str, Enum):
    FINANCIAL = "financial"
    RECURRING_COMMITMENT = "recurring_commitment"
    COMMUNICATION = "communication"
    PUBLICATION = "publication"
    PRODUCTION = "production"
    DESTRUCTIVE = "destructive"
    SENSITIVE_DATA = "sensitive_data"
    EXTERNAL_DISCLOSURE = "external_disclosure"
    IRREVERSIBLE = "irreversible"


class DataEgressMode(str, Enum):
    DENY_ALL = "deny_all"
    INTERNAL_ONLY = "internal_only"
    POLICY_BOUND_EXTERNAL = "policy_bound_external"


class ApprovalPolicy(str, Enum):
    NEVER = "never"
    POLICY = "policy"
    ALWAYS = "always"


class DispatchStatus(str, Enum):
    ACCEPTED = "accepted"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    OUTCOME_UNKNOWN = "outcome_unknown"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class EffectOutcome(str, Enum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    OUTCOME_UNKNOWN = "outcome_unknown"
    NOT_APPLIED = "not_applied"


class ScheduleStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    REVOKED = "revoked"
    EXPIRED = "expired"


class ScheduleMisfirePolicy(str, Enum):
    SKIP = "skip"
    RUN_IF_TIME_REMAINS = "run_if_time_remains"


class ScheduleOverlapPolicy(str, Enum):
    FORBID = "forbid"
    SKIP = "skip"


# Compatibility names make the lifecycle meaning explicit without introducing
# duplicate wire values or types.
AgentLifecycleState = AgentLifecycleStatus
AgentTeamLifecycleState = AgentTeamStatus
EffectMutation = MutationKind
EgressProfileMode = DataEgressMode


__all__ = [
    "AgentKind",
    "AgentLifecycleState",
    "AgentLifecycleStatus",
    "AgentTeamLifecycleState",
    "AgentTeamRole",
    "AgentTeamStatus",
    "ApprovalPolicy",
    "DataEgressMode",
    "DataClassification",
    "DispatchStatus",
    "EffectExternality",
    "EffectFlag",
    "EffectMutation",
    "EffectOutcome",
    "EgressProfileMode",
    "MutationKind",
    "ScheduleMisfirePolicy",
    "ScheduleOverlapPolicy",
    "ScheduleStatus",
    "StepKind",
]
