"""Pydantic contracts for domain-neutral orchestration version 1."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    AliasChoices,
    field_validator,
    model_validator,
)

from backend.domain.orchestration.enums import (
    AgentAvailability,
    DataClassification,
    DecisionStatus,
    FactorStatus,
    Reversibility,
    ReplanTrigger,
    RiskLevel,
    RoutingMode,
    Urgency,
)
from backend.domain.market_scope import MarketScopeV2, resolve_market_expression


CONTRACT_VERSION = "1.0"
SCORER_VERSION = "weighted-direct-v1.0.0"
ROUTER_VERSION = "deterministic-voi-v1.0.0"


class ContractModel(BaseModel):
    """Strict base class: unknown authority or secret fields are rejected."""

    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class VerifiedTenantContext(ContractModel):
    """External identity accepted only through the authenticated Orqaly API."""

    user_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        validation_alias=AliasChoices("user_id", "userId"),
        serialization_alias="userId",
    )
    org_id: str = Field(
        ...,
        min_length=1,
        max_length=255,
        validation_alias=AliasChoices("org_id", "orgId"),
        serialization_alias="orgId",
    )


class ContextReference(ContractModel):
    reference_id: str = Field(..., min_length=1, max_length=512)
    kind: str = Field(default="document", min_length=1, max_length=80)
    classification: DataClassification = DataClassification.INTERNAL
    content_hash: Optional[str] = Field(default=None, max_length=128)


class TaskEnvelopeV1(ContractModel):
    contract_version: Literal["1.0"] = CONTRACT_VERSION
    task_id: str = Field(..., min_length=1, max_length=255)
    objective: str = Field(..., min_length=3, max_length=8000)
    desired_outcome: str = Field(..., min_length=3, max_length=8000)
    domain: str = Field(..., min_length=1, max_length=120)
    task_class: Optional[str] = Field(default=None, max_length=120)
    capability_profile: Optional[str] = Field(default=None, max_length=120)
    required_capabilities: List[str] = Field(default_factory=list, max_length=100)
    preferred_capabilities: List[str] = Field(default_factory=list, max_length=100)
    required_tools: List[str] = Field(default_factory=list, max_length=100)
    requested_actions: List[str] = Field(default_factory=list, max_length=100)
    stakeholders: List[str] = Field(default_factory=list, max_length=100)
    constraints: List[str] = Field(default_factory=list, max_length=100)
    context_references: List[ContextReference] = Field(default_factory=list, max_length=100)
    data_classification: DataClassification = DataClassification.INTERNAL
    risk_level: RiskLevel = RiskLevel.MEDIUM
    urgency: Urgency = Urgency.NORMAL
    reversibility: Reversibility = Reversibility.REVERSIBLE
    deadline: Optional[datetime] = None

    @field_validator(
        "required_capabilities",
        "preferred_capabilities",
        "required_tools",
        "requested_actions",
        "stakeholders",
        "constraints",
    )
    @classmethod
    def deduplicate_string_lists(cls, values: List[str]) -> List[str]:
        cleaned: List[str] = []
        seen = set()
        for value in values:
            item = value.strip()
            if item and item.casefold() not in seen:
                seen.add(item.casefold())
                cleaned.append(item)
        return cleaned


class AgentCandidateV1(ContractModel):
    agent_id: str = Field(..., min_length=1, max_length=255)
    org_id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    capabilities: List[str] = Field(default_factory=list, max_length=200)
    tool_ids: List[str] = Field(default_factory=list, max_length=100)
    availability: AgentAvailability = AgentAvailability.UNKNOWN
    success_rate: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    estimated_cost: Optional[float] = Field(default=None, ge=0.0)
    estimated_latency_ms: Optional[int] = Field(default=None, ge=0)
    max_data_classification: DataClassification = DataClassification.INTERNAL
    max_risk_level: RiskLevel = RiskLevel.MEDIUM
    stakeholder_tags: List[str] = Field(default_factory=list, max_length=100)
    collaboration_tags: List[str] = Field(default_factory=list, max_length=100)
    incompatible_agent_ids: List[str] = Field(default_factory=list, max_length=100)
    prohibited_actions: List[str] = Field(default_factory=list, max_length=100)


class ToolCandidateV1(ContractModel):
    tool_id: str = Field(..., min_length=1, max_length=255)
    org_id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    available: bool = False
    allowed_actions: List[str] = Field(default_factory=list, max_length=100)
    allowed_data_classifications: List[DataClassification] = Field(
        default_factory=lambda: [DataClassification.INTERNAL]
    )
    requires_approval: bool = False


class PolicyContextV1(ContractModel):
    denied_agent_ids: List[str] = Field(default_factory=list, max_length=100)
    denied_tool_ids: List[str] = Field(default_factory=list, max_length=100)
    human_approval_required_for: List[str] = Field(default_factory=list, max_length=100)
    allowed_data_classifications: List[DataClassification] = Field(
        default_factory=lambda: [
            DataClassification.PUBLIC,
            DataClassification.INTERNAL,
            DataClassification.CONFIDENTIAL,
            DataClassification.RESTRICTED,
        ]
    )
    maximum_risk_without_human: RiskLevel = RiskLevel.MEDIUM
    guardrails: List[str] = Field(default_factory=list, max_length=100)


class BudgetV1(ContractModel):
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    maximum_cost: Optional[float] = Field(default=None, ge=0.0)
    maximum_latency_ms: Optional[int] = Field(default=None, ge=1)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()


class EvidenceItemV1(ContractModel):
    reference_id: str = Field(..., min_length=1, max_length=512)
    provenance: Literal["operational", "empirical", "inferred", "synthetic"]
    content_hash: Optional[str] = Field(default=None, max_length=128)
    relevance: float = Field(default=0.0, ge=0.0, le=1.0)
    quality: float = Field(default=0.0, ge=0.0, le=1.0)
    verified: bool = False
    verification_source: Literal["none", "orqaly_asserted", "axwise_audit"] = "none"
    contradictory: bool = False
    capability_hints: List[str] = Field(default_factory=list, max_length=100)
    classification: DataClassification = DataClassification.INTERNAL


class ResearchPolicyV1(ContractModel):
    allow_existing_evidence: bool = True
    allow_hybrid_research: bool = False
    required: bool = False
    minimum_mode: Literal[
        "instant", "grounded_fast", "grounded_deep", "auto"
    ] = "instant"
    grounding_required: bool = False
    fail_closed: bool = True
    performance_profile: Literal["standard", "quality_fast"] = "quality_fast"
    required_outputs: List[
        Literal[
            "market_sources",
            "market_claims",
            "synthetic_participants",
            "interviews",
            "customer_personas",
            "persona_resolution",
            "research_prd",
            "research_bundle",
        ]
    ] = Field(
        default_factory=lambda: [
            "customer_personas",
            "persona_resolution",
        ],
        min_length=1,
        max_length=20,
    )
    allowed_source_types: Optional[
        List[
            Literal[
                "company_registry",
                "google_search_result",
                "official_company_website",
                "provided_document",
            ]
        ]
    ] = Field(default=None, min_length=1, max_length=4)
    minimum_evidence_sufficiency: float = Field(default=0.65, ge=0.0, le=1.0)
    minimum_value_of_information: float = Field(default=0.35, ge=0.0, le=1.0)
    minimum_evidence_quality: float = Field(default=0.55, ge=0.0, le=1.0)
    maximum_research_cost: Optional[float] = Field(default=None, ge=0.0)
    estimated_research_cost: Optional[float] = Field(default=None, ge=0.0)
    maximum_research_latency_ms: Optional[int] = Field(default=None, ge=1)
    estimated_research_latency_ms: Optional[int] = Field(default=None, ge=1)
    maximum_research_iterations: int = Field(default=0, ge=0, le=3)
    completed_research_iterations: int = Field(default=0, ge=0, le=3)
    maximum_evidence_items: int = Field(default=25, ge=1, le=100)

    @model_validator(mode="after")
    def validate_grounding_contract(self) -> "ResearchPolicyV1":
        self.required_outputs = list(dict.fromkeys(self.required_outputs))
        if self.allowed_source_types is not None:
            self.allowed_source_types = list(dict.fromkeys(self.allowed_source_types))
        if (
            self.grounding_required
            or self.minimum_mode in {"grounded_fast", "grounded_deep"}
        ) and not self.fail_closed:
            raise ValueError("grounded research must fail closed")
        if self.minimum_mode == "instant" and self.grounding_required:
            raise ValueError("instant research cannot require market grounding")
        return self


class CustomerRoleContractV1(ContractModel):
    primary_roles: List[
        Literal["economic_buyer", "decision_authority", "influencer", "operational_user", "beneficiary"]
    ] = Field(
        default_factory=lambda: ["economic_buyer", "decision_authority"],
        min_length=1,
        max_length=5,
    )
    require_primary_buyer: bool = False
    ineligible_roles: List[
        Literal["economic_buyer", "decision_authority", "influencer", "operational_user", "beneficiary"]
    ] = Field(default_factory=list, max_length=5)


class CriticalClaimPolicyV1(ContractModel):
    required: bool = False
    fail_closed: bool = True
    freshness_days: int = Field(default=120, ge=1, le=3650)
    freshness_by_class: Dict[
        Literal[
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        ],
        int,
    ] = Field(
        default_factory=lambda: {
            "official_statistic": 730,
            "observed_primary_market": 120,
        }
    )
    mandatory_claim_classes: List[
        Literal[
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        ]
    ] = Field(default_factory=list, max_length=3)


class BusinessEvidenceFactRequirementV1(ContractModel):
    """One typed, profile-owned fact requirement for broad research."""

    kind: Literal[
        "physical_product_offer",
        "subscription_plan",
        "usage_tariff",
        "project_service_quote",
    ]
    minimum_verified: int = Field(..., ge=0, le=100)
    applicability: Literal["required", "required_when_applicable", "optional"]

    @model_validator(mode="after")
    def validate_required_minimum(self) -> "BusinessEvidenceFactRequirementV1":
        if self.applicability == "required" and self.minimum_verified < 1:
            raise ValueError("required fact requirements need minimum_verified >= 1")
        return self


class BusinessEvidenceCalculationRequirementV1(ContractModel):
    """One reviewed calculation requirement over verified typed facts."""

    kind: Literal[
        "physical_offer_price_difference",
        "subscription_rate_difference",
        "usage_tariff_rate_difference",
        "project_quote_rate_difference",
    ]
    minimum_verified: int = Field(..., ge=0, le=100)
    applicability: Literal["required", "required_when_applicable", "optional"]

    @model_validator(mode="after")
    def validate_required_minimum(
        self,
    ) -> "BusinessEvidenceCalculationRequirementV1":
        if self.applicability == "required" and self.minimum_verified < 1:
            raise ValueError(
                "required calculation requirements need minimum_verified >= 1"
            )
        return self


class BusinessEvidenceProfileV1(ContractModel):
    """Immutable adapter-selection contract supplied by Orqaly.

    Economic models select reviewed fact and calculation adapters.  Industry or
    category strings never select an evidence parser or formula.
    """

    version: Literal["business_evidence_profile_v1"] = (
        "business_evidence_profile_v1"
    )
    intent: Literal[
        "commercial_market_launch",
        "operational_process",
        "product_strategy",
        "software_product",
    ]
    economic_model: Literal[
        "physical_product",
        "subscription",
        "usage_based",
        "project_service",
        "none",
    ]
    market_scope_hash: Optional[str] = Field(
        default=None,
        pattern=r"^[a-f0-9]{64}$",
    )
    fact_requirements: List[BusinessEvidenceFactRequirementV1] = Field(
        default_factory=list,
        max_length=4,
    )
    calculation_requirements: List[
        BusinessEvidenceCalculationRequirementV1
    ] = Field(default_factory=list, max_length=4)
    required_role_slots: List[
        Literal[
            "customer_market",
            "pricing_finance",
            "legal_compliance",
            "sales_distribution",
            "risk_operations",
            "domain_delivery",
        ]
    ] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def validate_adapter_contract(self) -> "BusinessEvidenceProfileV1":
        fact_kinds = [item.kind for item in self.fact_requirements]
        calculation_kinds = [item.kind for item in self.calculation_requirements]
        if len(fact_kinds) != len(set(fact_kinds)):
            raise ValueError("fact_requirements must have unique kind values")
        if len(calculation_kinds) != len(set(calculation_kinds)):
            raise ValueError(
                "calculation_requirements must have unique kind values"
            )
        if len(self.required_role_slots) != len(set(self.required_role_slots)):
            raise ValueError("required_role_slots must be unique")

        expected_fact_kind = {
            "physical_product": "physical_product_offer",
            "subscription": "subscription_plan",
            "usage_based": "usage_tariff",
            "project_service": "project_service_quote",
            "none": None,
        }[self.economic_model]
        expected_calculation_kind = {
            "physical_product": "physical_offer_price_difference",
            "subscription": "subscription_rate_difference",
            "usage_based": "usage_tariff_rate_difference",
            "project_service": "project_quote_rate_difference",
            "none": None,
        }[self.economic_model]
        if any(kind != expected_fact_kind for kind in fact_kinds):
            raise ValueError(
                "fact_requirements are incompatible with economic_model"
            )
        if any(kind != expected_calculation_kind for kind in calculation_kinds):
            raise ValueError(
                "calculation_requirements are incompatible with economic_model"
            )
        if self.economic_model == "none" and (
            fact_kinds or calculation_kinds
        ):
            raise ValueError(
                "economic_model none cannot request economic facts or calculations"
            )
        if self.economic_model != "none" and self.market_scope_hash is None:
            raise ValueError(
                "market_scope_hash is required when economic_model is not none"
            )
        return self


class ResearchBriefV1(ContractModel):
    business_idea: str = Field(..., min_length=3, max_length=4000)
    target_stakeholders: str = Field(..., min_length=2, max_length=2000)
    problem: str = Field(..., min_length=3, max_length=4000)
    research_questions: List[str] = Field(default_factory=list, max_length=30)
    required_execution_roles: List[str] = Field(default_factory=list, max_length=20)
    research_prd_type: Literal[
        "commercial_market_launch",
        "operational_process",
        "product_strategy",
        "software_product",
    ] = "operational_process"
    customer_role_contract: CustomerRoleContractV1 = Field(
        default_factory=CustomerRoleContractV1
    )
    critical_claim_policy: CriticalClaimPolicyV1 = Field(
        default_factory=CriticalClaimPolicyV1
    )
    business_evidence_profile: Optional[BusinessEvidenceProfileV1] = None
    industry: str = Field(default="general", min_length=1, max_length=120)
    location: Optional[str] = Field(default=None, max_length=255)
    market_scope: Optional[MarketScopeV2] = None
    depth: Literal["quick", "detailed", "comprehensive"] = "quick"
    sample_size: int = Field(default=2, ge=1, le=10)

    @field_validator("required_execution_roles")
    @classmethod
    def deduplicate_execution_roles(cls, values: List[str]) -> List[str]:
        cleaned: List[str] = []
        seen = set()
        for value in values:
            item = value.strip()
            if len(item) > 255:
                raise ValueError("required execution roles are limited to 255 characters")
            if item and item.casefold() not in seen:
                seen.add(item.casefold())
                cleaned.append(item)
        return cleaned

    @model_validator(mode="after")
    def validate_business_evidence_intent(self) -> "ResearchBriefV1":
        if (
            self.business_evidence_profile is not None
            and self.business_evidence_profile.intent != self.research_prd_type
        ):
            raise ValueError(
                "business_evidence_profile.intent must equal research_prd_type"
            )
        return self


class PlanStepV1(ContractModel):
    step_id: str = Field(..., min_length=1, max_length=255)
    title: str = Field(..., min_length=3, max_length=500)
    objective: str = Field(..., min_length=3, max_length=4000)
    required_capabilities: List[str] = Field(default_factory=list, max_length=100)
    preferred_capabilities: List[str] = Field(default_factory=list, max_length=100)
    required_tools: List[str] = Field(default_factory=list, max_length=100)
    requested_actions: List[str] = Field(default_factory=list, max_length=100)
    dependencies: List[str] = Field(default_factory=list, max_length=100)
    input_contract: Dict[str, Any] = Field(..., min_length=1)
    output_contract: Dict[str, Any] = Field(..., min_length=1)
    completion_criteria: List[str] = Field(..., min_length=1, max_length=50)
    review_rules: List[str] = Field(default_factory=list, max_length=50)
    requires_distinct_reviewer: bool = False
    reviewer_capabilities: List[str] = Field(default_factory=list, max_length=100)
    budget: BudgetV1 = Field(default_factory=BudgetV1)


class SeparationOfDutyRuleV1(ContractModel):
    rule_id: str = Field(..., min_length=1, max_length=255)
    step_ids: List[str] = Field(..., min_length=2, max_length=20)
    reason: str = Field(..., min_length=3, max_length=1000)

    @field_validator("step_ids")
    @classmethod
    def unique_step_ids(cls, values: List[str]) -> List[str]:
        if len(values) != len(set(values)):
            raise ValueError("separation-of-duty step_ids must be unique")
        return values


class PlanningRequirementsV1(ContractModel):
    pattern: Literal[
        "single",
        "sequential",
        "parallel",
        "supervisor",
        "human_controlled",
    ]
    steps: List[PlanStepV1] = Field(..., min_length=1, max_length=50)
    maximum_team_size: int = Field(default=8, ge=1, le=50)
    required_collaboration_tags: List[str] = Field(default_factory=list, max_length=50)
    separation_of_duty_rules: List[SeparationOfDutyRuleV1] = Field(
        default_factory=list,
        max_length=50,
    )
    supervisor_capabilities: List[str] = Field(
        default_factory=lambda: ["supervision"],
        max_length=50,
    )
    total_budget: Optional[BudgetV1] = None

    @model_validator(mode="after")
    def validate_plan_references(self) -> "PlanningRequirementsV1":
        step_ids = [step.step_id for step in self.steps]
        known = set(step_ids)
        if len(step_ids) != len(known):
            raise ValueError("planning steps must have unique step_id values")
        if self.pattern == "single" and len(self.steps) != 1:
            raise ValueError("single planning pattern requires exactly one step")
        for step in self.steps:
            unknown = set(step.dependencies) - known
            if unknown:
                raise ValueError(
                    f"step {step.step_id} references unknown dependencies: "
                    + ", ".join(sorted(unknown))
                )
            if step.step_id in step.dependencies:
                raise ValueError(f"step {step.step_id} cannot depend on itself")
        for rule in self.separation_of_duty_rules:
            unknown = set(rule.step_ids) - known
            if unknown:
                raise ValueError(
                    f"separation rule {rule.rule_id} references unknown steps: "
                    + ", ".join(sorted(unknown))
                )
        return self


class DecisionCreateRequestV1(ContractModel):
    contract_version: Literal["1.0"] = CONTRACT_VERSION
    tenant: VerifiedTenantContext
    upstream_decision_id: Optional[str] = Field(default=None, max_length=255)
    task: TaskEnvelopeV1
    available_agents: List[AgentCandidateV1] = Field(default_factory=list, max_length=500)
    available_tools: List[ToolCandidateV1] = Field(default_factory=list, max_length=500)
    policy_context: PolicyContextV1 = Field(default_factory=PolicyContextV1)
    budget: BudgetV1 = Field(default_factory=BudgetV1)
    evidence_catalogue: List[EvidenceItemV1] = Field(default_factory=list, max_length=500)
    research_policy: ResearchPolicyV1 = Field(default_factory=ResearchPolicyV1)
    research_brief: Optional[ResearchBriefV1] = None
    planning: Optional[PlanningRequirementsV1] = None

    @model_validator(mode="after")
    def validate_catalogue_identifiers(self) -> "DecisionCreateRequestV1":
        agent_ids = [item.agent_id for item in self.available_agents]
        tool_ids = [item.tool_id for item in self.available_tools]
        evidence_ids = [item.reference_id for item in self.evidence_catalogue]
        if len(agent_ids) != len(set(agent_ids)):
            raise ValueError("available_agents must have unique agent_id values")
        if len(tool_ids) != len(set(tool_ids)):
            raise ValueError("available_tools must have unique tool_id values")
        if len(evidence_ids) != len(set(evidence_ids)):
            raise ValueError("evidence_catalogue must have unique reference_id values")
        grounded_research = (
            self.research_policy.grounding_required
            or self.research_policy.minimum_mode
            in {"grounded_fast", "grounded_deep"}
        )
        if grounded_research:
            brief = self.research_brief
            if brief and not brief.market_scope and str(brief.location or "").strip():
                inferred_scope = resolve_market_expression(str(brief.location))
                if (
                    inferred_scope.resolved_scope.countries
                    and not inferred_scope.confirmation.required
                ):
                    brief.market_scope = inferred_scope
            has_confirmed_scope = bool(
                brief
                and brief.market_scope
                and brief.market_scope.resolved_scope.countries
                and (
                    not brief.market_scope.confirmation.required
                    or brief.market_scope.confirmation.confirmed
                )
            )
            if not has_confirmed_scope:
                raise ValueError(
                    "grounded research requires a country-resolved, confirmed market_scope; "
                    "a city-only or ambiguous research_brief.location is insufficient"
                )
        return self


class AssignmentFactor(ContractModel):
    factor: str
    weight: float = Field(ge=0.0, le=1.0)
    value: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    contribution: float = Field(ge=0.0, le=1.0)
    status: FactorStatus
    reason: str


class AgentRanking(ContractModel):
    rank: int = Field(ge=1)
    agent_id: str
    agent_name: str
    eligible: bool
    score: float = Field(ge=0.0, le=1.0)
    factors: List[AssignmentFactor] = Field(default_factory=list)
    exclusion_reasons: List[str] = Field(default_factory=list)


class EvidenceReference(ContractModel):
    reference_id: str
    provenance: Literal["operational", "empirical", "inferred", "synthetic"]
    content_hash: Optional[str] = None
    relevance: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    quality: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    verified: bool = False
    verification_source: Literal["none", "orqaly_asserted", "axwise_audit"] = "none"
    contradictory: bool = False
    classification: DataClassification = DataClassification.INTERNAL


class RoutingSignal(ContractModel):
    signal: str
    value: float = Field(ge=0.0, le=1.0)
    source: Literal["deterministic_rule", "verified_operational", "unverified_input"]
    reason: str


class RoutingAssessmentV1(ContractModel):
    router_version: str = ROUTER_VERSION
    ambiguity: float = Field(ge=0.0, le=1.0)
    evidence_sufficiency: float = Field(ge=0.0, le=1.0)
    contradiction: float = Field(ge=0.0, le=1.0)
    stakeholder_sensitivity: float = Field(ge=0.0, le=1.0)
    consequence: float = Field(ge=0.0, le=1.0)
    deadline_pressure: float = Field(ge=0.0, le=1.0)
    uncertainty: float = Field(ge=0.0, le=1.0)
    value_of_information: float = Field(ge=0.0, le=1.0)
    calibration_band: Literal["low", "medium", "high"]
    selected_mode: RoutingMode
    signals: List[RoutingSignal] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)


class ResearchJobV1(ContractModel):
    job_id: str
    status: Literal[
        "queued",
        "running",
        "completed",
        "partial",
        "low_quality",
        "no_result",
        "failed",
        "cancelled",
        "timed_out",
    ]
    pipeline: str = "hybrid_a_plus_b"
    decision_id: str
    evidence_count: int = Field(default=0, ge=0)
    failure_reason: Optional[str] = None


class ResearchResultV1(ContractModel):
    job: ResearchJobV1
    evidence: List[EvidenceItemV1] = Field(default_factory=list, max_length=100)


class RankingChange(ContractModel):
    agent_id: str
    before_rank: Optional[int] = Field(default=None, ge=1)
    after_rank: Optional[int] = Field(default=None, ge=1)
    before_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    after_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    reason: str


class ContextPackage(ContractModel):
    package_id: str
    assigned_agent_id: str
    references: List[ContextReference] = Field(default_factory=list)
    instructions: List[str] = Field(default_factory=list)


class ApprovalGate(ContractModel):
    gate_id: str
    reason: str
    required_before: str
    approver_role: str = "authorized_human"


class Fallback(ContractModel):
    trigger: str
    action: Literal["escalate_to_human", "request_new_catalogue", "request_replan"]
    reason: str


class NodeFailurePathV1(ContractModel):
    trigger: Literal[
        "transient_failure",
        "agent_unavailable",
        "tool_failure",
        "output_rejected",
        "budget_exceeded",
        "approval_rejected",
    ]
    action: Literal[
        "retry",
        "substitute_agent",
        "request_replan",
        "escalate_to_human",
    ]
    maximum_attempts: int = Field(default=0, ge=0, le=5)
    reason: str


class PlanNode(ContractModel):
    node_id: str
    title: str
    assigned_agent_id: str
    required_capabilities: List[str] = Field(default_factory=list)
    tool_ids: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    input_contract: Dict[str, Any] = Field(default_factory=dict)
    output_contract: Dict[str, Any] = Field(default_factory=dict)
    completion_criteria: List[str] = Field(default_factory=list)
    approval_gate_ids: List[str] = Field(default_factory=list)
    reviewer_agent_id: Optional[str] = None
    review_rules: List[str] = Field(default_factory=list)
    budget: BudgetV1 = Field(default_factory=BudgetV1)
    estimated_cost: Optional[float] = Field(default=None, ge=0.0)
    estimated_latency_ms: Optional[int] = Field(default=None, ge=0)
    failure_paths: List[NodeFailurePathV1] = Field(default_factory=list)


class ExecutionPlan(ContractModel):
    mode: RoutingMode
    nodes: List[PlanNode] = Field(default_factory=list)
    template_mode: Optional[RoutingMode] = None
    team_member_ids: List[str] = Field(default_factory=list)
    total_estimated_cost: Optional[float] = Field(default=None, ge=0.0)
    critical_path_latency_ms: Optional[int] = Field(default=None, ge=0)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    executable: bool = True

    @model_validator(mode="after")
    def empty_plan_is_never_executable(self) -> "ExecutionPlan":
        if not self.nodes:
            self.executable = False
        return self


class PlanFeasibilityRejectionV1(ContractModel):
    code: Literal[
        "agent_unavailable",
        "agent_not_owned",
        "agent_not_authorized",
        "tool_unavailable",
        "tool_not_authorized",
        "budget_exceeded",
        "policy_rejected",
        "invalid_plan",
    ]
    reason: str
    node_id: Optional[str] = None
    agent_id: Optional[str] = None
    tool_id: Optional[str] = None


class PlanFeasibilityResultV1(ContractModel):
    feasible: bool
    source: Literal["catalogue_snapshot", "orqaly_live_state"]
    rejections: List[PlanFeasibilityRejectionV1] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_feasibility(self) -> "PlanFeasibilityResultV1":
        if self.feasible and self.rejections:
            raise ValueError("a feasible plan cannot contain rejection reasons")
        if not self.feasible and not self.rejections:
            raise ValueError("an infeasible plan requires a structured rejection")
        return self


class PlanFeasibilityRequestV1(ContractModel):
    contract_version: Literal["1.0"] = CONTRACT_VERSION
    decision_id: str
    tenant: VerifiedTenantContext
    plan: ExecutionPlan
    required_approval_gate_ids: List[str] = Field(default_factory=list)


class ReplanContextV1(ContractModel):
    trigger: ReplanTrigger
    reason: str
    failed_node_id: Optional[str] = None
    unavailable_agent_ids: List[str] = Field(default_factory=list)
    failed_tool_ids: List[str] = Field(default_factory=list)
    rejected_output_node_ids: List[str] = Field(default_factory=list)
    changed_facts: List[str] = Field(default_factory=list)


class LearnedFeatureV1(ContractModel):
    """Tenant- and version-scoped feature derived from immutable outcomes."""

    agent_id: str
    feature_name: Literal["relevant_success_rate"] = "relevant_success_rate"
    value: float = Field(ge=0.0, le=1.0)
    sample_count: int = Field(ge=1)
    external_org_id: str
    window_start: datetime
    window_end: datetime
    provenance: Literal[
        "orchestration_outcomes",
        "orchestration_execution_receipts",
    ] = "orchestration_outcomes"
    scorer_version: str


class OrchestrationDecisionV1(ContractModel):
    contract_version: Literal["1.0"] = CONTRACT_VERSION
    scorer_version: str = SCORER_VERSION
    decision_id: str
    request_id: str
    created_at: datetime
    task_id: str
    task_class: str
    routing_mode: RoutingMode
    status: DecisionStatus
    required_capabilities: List[str]
    required_tools: List[str]
    recommended_agents: List[AgentRanking] = Field(default_factory=list)
    candidate_rankings: List[AgentRanking] = Field(default_factory=list)
    execution_plan: ExecutionPlan
    context_packages: List[ContextPackage] = Field(default_factory=list)
    guardrails: List[str] = Field(default_factory=list)
    approval_points: List[ApprovalGate] = Field(default_factory=list)
    fallbacks: List[Fallback] = Field(default_factory=list)
    assignment_factors: List[AssignmentFactor] = Field(default_factory=list)
    evidence: List[EvidenceReference] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    requires_orqaly_authorization: Literal[True] = True
    router_version: str = ROUTER_VERSION
    routing_assessment: Optional[RoutingAssessmentV1] = None
    research_job: Optional[ResearchJobV1] = None
    parent_decision_id: Optional[str] = None
    ranking_changes: List[RankingChange] = Field(default_factory=list)
    plan_feasibility: Optional[PlanFeasibilityResultV1] = None
    plan_feasibility_request: Optional[PlanFeasibilityRequestV1] = None
    replan_context: Optional[ReplanContextV1] = None
    learned_features: List[LearnedFeatureV1] = Field(default_factory=list)


class OrchestrationDecisionRecordV1(OrchestrationDecisionV1):
    input_snapshot: DecisionCreateRequestV1
    request_hash: str
    reused: bool = False


class ReplanRequestV1(ContractModel):
    contract_version: Literal["1.0"] = CONTRACT_VERSION
    trigger: ReplanTrigger
    reason: str = Field(..., min_length=3, max_length=4000)
    failed_node_id: Optional[str] = Field(default=None, max_length=255)
    changed_facts: List[str] = Field(default_factory=list)
    unavailable_agent_ids: List[str] = Field(default_factory=list, max_length=100)
    failed_tool_ids: List[str] = Field(default_factory=list, max_length=100)
    rejected_output_node_ids: List[str] = Field(default_factory=list, max_length=100)
    updated_budget: Optional[BudgetV1] = None
    human_instruction: Optional[str] = Field(default=None, max_length=4000)
    replacement_agents: List[AgentCandidateV1] = Field(default_factory=list)
    replacement_tools: List[ToolCandidateV1] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_trigger_details(self) -> "ReplanRequestV1":
        details = {
            ReplanTrigger.AGENT_UNAVAILABLE: bool(self.unavailable_agent_ids),
            ReplanTrigger.TOOL_FAILURE: bool(self.failed_tool_ids),
            ReplanTrigger.OUTPUT_REJECTED: bool(self.rejected_output_node_ids),
            ReplanTrigger.BUDGET_CHANGED: self.updated_budget is not None,
            ReplanTrigger.HUMAN_OVERRIDE: bool(self.human_instruction),
        }
        if not details[self.trigger]:
            raise ValueError(
                f"{self.trigger.value} replan requires its corresponding changed state"
            )
        return self


class ExecutionOutcomeV1(ContractModel):
    contract_version: Literal["1.0"] = CONTRACT_VERSION
    outcome_id: str = Field(..., min_length=1, max_length=255)
    decision_id: str = Field(..., min_length=1, max_length=255)
    authorization_status: Literal["approved", "rejected", "partially_approved"]
    execution_status: Literal["completed", "failed", "cancelled", "escalated"]
    task_success: Optional[bool] = None
    quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    stakeholder_acceptance: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
    )
    cost: Optional[float] = Field(default=None, ge=0.0)
    currency: str = Field(
        default="EUR",
        min_length=3,
        max_length=3,
        pattern=r"^[A-Za-z]{3}$",
    )
    latency_ms: Optional[int] = Field(default=None, ge=0)
    rework_count: int = Field(default=0, ge=0)
    escalation_count: int = Field(default=0, ge=0)
    human_override: bool = False
    override_reason: Optional[str] = Field(default=None, max_length=2000)
    failure_type: Optional[
        Literal[
            "agent_failure",
            "tool_failure",
            "invalid_output",
            "policy_rejection",
            "budget_exceeded",
            "timeout",
            "stakeholder_rejection",
            "cancelled_by_user",
            "unknown",
        ]
    ] = None
    completed_at: Optional[datetime] = None
    node_receipts: List["NodeExecutionReceiptV1"] = Field(
        default_factory=list,
        max_length=500,
    )
    notes: List[str] = Field(default_factory=list)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def validate_outcome(self) -> "ExecutionOutcomeV1":
        receipt_ids = [receipt.receipt_id for receipt in self.node_receipts]
        if len(receipt_ids) != len(set(receipt_ids)):
            raise ValueError("node_receipts must have unique receipt_id values")
        if self.human_override and not self.override_reason:
            raise ValueError("human_override requires override_reason")
        if self.execution_status == "failed" and not self.failure_type:
            self.failure_type = "unknown"
        return self


class NodeExecutionReceiptV1(ContractModel):
    """Append-only observation for one execution attempt of a planned node."""

    receipt_id: str = Field(..., min_length=1, max_length=255)
    node_id: str = Field(..., min_length=1, max_length=255)
    agent_id: Optional[str] = Field(default=None, max_length=255)
    attempt: int = Field(default=1, ge=1, le=100)
    status: Literal[
        "started",
        "completed",
        "failed",
        "cancelled",
        "escalated",
        "approval_rejected",
    ]
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    stakeholder_acceptance: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
    )
    cost: Optional[float] = Field(default=None, ge=0.0)
    currency: str = Field(
        default="EUR",
        min_length=3,
        max_length=3,
        pattern=r"^[A-Za-z]{3}$",
    )
    latency_ms: Optional[int] = Field(default=None, ge=0)
    token_count: Optional[int] = Field(default=None, ge=0)
    rework_count: int = Field(default=0, ge=0)
    escalation_count: int = Field(default=0, ge=0)
    human_override: bool = False
    override_reason: Optional[str] = Field(default=None, max_length=2000)
    failure_type: Optional[str] = Field(default=None, max_length=120)
    notes: List[str] = Field(default_factory=list, max_length=50)

    @field_validator("currency")
    @classmethod
    def normalize_receipt_currency(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def validate_timestamps(self) -> "NodeExecutionReceiptV1":
        if self.started_at and self.completed_at and self.completed_at < self.started_at:
            raise ValueError("completed_at cannot be earlier than started_at")
        if self.human_override and not self.override_reason:
            raise ValueError("receipt human_override requires override_reason")
        return self


class OutcomeEvaluationV1(ContractModel):
    """Reproducible normalized metrics derived from the raw outcome."""

    evaluation_version: str = "outcome-evaluator-v1.0.0"
    normalized_success: float = Field(ge=0.0, le=1.0)
    task_success: bool
    quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    stakeholder_acceptance: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
    )
    expected_cost: Optional[float] = Field(default=None, ge=0.0)
    expected_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    currency_matches: bool = True
    cost_delta_ratio: Optional[float] = None
    expected_latency_ms: Optional[int] = Field(default=None, ge=0)
    latency_delta_ratio: Optional[float] = None
    safety_flags: List[str] = Field(default_factory=list)
    promotable_observation: bool


class ExecutionOutcomeRecordV1(ContractModel):
    outcome: ExecutionOutcomeV1
    evaluation: OutcomeEvaluationV1
    scorer_version: str
    received_at: datetime
    request_hash: str
    reused: bool = False


class EvaluationSliceV1(ContractModel):
    slice_name: str = Field(..., min_length=1, max_length=255)
    sample_count: int = Field(ge=0)
    success_delta: float
    cost_delta: float = 0.0
    safety_regressions: int = Field(default=0, ge=0)


class ScorerEvaluationReportV1(ContractModel):
    """Stored evidence required before any scorer version can be promoted."""

    report_id: str = Field(..., min_length=1, max_length=255)
    external_org_id: str = Field(..., min_length=1, max_length=255)
    candidate_version: str = Field(..., min_length=1, max_length=255)
    baseline_version: str = Field(..., min_length=1, max_length=255)
    dataset_id: str = Field(..., min_length=1, max_length=255)
    sample_count: int = Field(ge=1)
    overall_success_delta: float
    cost_delta: float = 0.0
    calibration_error: float = Field(ge=0.0)
    drift_score: float = Field(ge=0.0)
    slices: List[EvaluationSliceV1] = Field(default_factory=list)
    passed: bool
    blockers: List[str] = Field(default_factory=list)
    created_at: datetime
