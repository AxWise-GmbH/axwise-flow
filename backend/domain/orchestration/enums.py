"""Stable enumerations for orchestration contract version 1."""

from enum import Enum


class DataClassification(str, Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Urgency(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class Reversibility(str, Enum):
    REVERSIBLE = "reversible"
    PARTIALLY_REVERSIBLE = "partially_reversible"
    IRREVERSIBLE = "irreversible"


class AgentAvailability(str, Enum):
    AVAILABLE = "available"
    BUSY = "busy"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


class RoutingMode(str, Enum):
    DIRECT = "direct"
    EVIDENCE_ASSISTED = "evidence_assisted"
    RESEARCH_ASSISTED = "research_assisted"
    HUMAN_CLARIFICATION = "human_clarification"
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    SUPERVISOR = "supervisor"
    HUMAN_CONTROLLED = "human_controlled"
    RECOVERY = "recovery"


class DecisionStatus(str, Enum):
    RECOMMENDED = "recommended"
    ESCALATED = "escalated"
    PENDING_RESEARCH = "pending_research"


class ReplanTrigger(str, Enum):
    AGENT_UNAVAILABLE = "agent_unavailable"
    TOOL_FAILURE = "tool_failure"
    OUTPUT_REJECTED = "output_rejected"
    BUDGET_CHANGED = "budget_changed"
    HUMAN_OVERRIDE = "human_override"


class FactorStatus(str, Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    MISSING = "missing"
    EXCLUDED = "excluded"


CLASSIFICATION_ORDER = {
    DataClassification.PUBLIC: 0,
    DataClassification.INTERNAL: 1,
    DataClassification.CONFIDENTIAL: 2,
    DataClassification.RESTRICTED: 3,
}

RISK_ORDER = {
    RiskLevel.LOW: 0,
    RiskLevel.MEDIUM: 1,
    RiskLevel.HIGH: 2,
    RiskLevel.CRITICAL: 3,
}
