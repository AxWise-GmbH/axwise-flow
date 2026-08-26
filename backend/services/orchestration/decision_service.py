"""Create, retrieve, and resume immutable orchestration decisions."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from backend.domain.orchestration.enums import (
    RISK_ORDER,
    DecisionStatus,
    Reversibility,
    RoutingMode,
)
from backend.domain.orchestration.models import (
    AgentRanking,
    ApprovalGate,
    ContextPackage,
    DecisionCreateRequestV1,
    EvidenceItemV1,
    EvidenceReference,
    ExecutionPlan,
    Fallback,
    LearnedFeatureV1,
    OrchestrationDecisionRecordV1,
    OrchestrationDecisionV1,
    PlanFeasibilityRequestV1,
    PlanFeasibilityResultV1,
    PlanNode,
    RankingChange,
    ReplanContextV1,
    ReplanRequestV1,
    ResearchJobV1,
    ResearchResultV1,
    RoutingAssessmentV1,
)
from backend.domain.orchestration.scope_models import (
    ScopeConsumerInputsV1,
    ScopeContinuationRequestV1,
    ScopeCorrectionAcceptanceV1,
    ScopeCorrectionCompilationV1,
    ScopeCorrectionProposalV1,
    ScopeCorrectionRequestV1,
    ScopeProposalBindingV1,
    ScopeProposalAcceptanceV1,
    ScopeStateV1,
)
from backend.domain.orchestration.ports import (
    DecisionStore,
    EvidenceRetrievalPort,
    OutcomeLearningPort,
    PlanFeasibilityPort,
    ResearchToolPort,
)
from backend.domain.orchestration.validation import canonical_json, canonical_request_hash
from backend.models import OrchestrationDecisionSnapshot
from backend.services.orchestration.action_authority import (
    exact_tool_action_grants,
    normalized_action_ids,
    sealed_consequential_action_ids,
)
from backend.services.orchestration.adapters.plan_feasibility_adapter import (
    CataloguePlanFeasibilityAdapter,
)
from backend.services.orchestration.assignment_scorer import AssignmentScorer
from backend.services.orchestration.team_planner import TeamPlanner
from backend.services.orchestration.replanning_service import ReplanningService
from backend.services.orchestration.uncertainty_router import UncertaintyRouter
from backend.services.orchestration.scope_contract_service import (
    ScopeContractError,
    build_scope_confirmation,
    build_scope_proposal_binding,
    ensure_scope_packet,
    research_execution_inputs_hash,
    scope_contract_binding,
    validate_scope_research_acceptance,
    validate_scope_packet,
)
from backend.services.orchestration.scope_correction_service import (
    build_corrected_proposal_request,
    validate_continuation_request_authority,
    validate_scope_continuation,
)
from backend.services.orchestration.scope_proposal_service import (
    ScopeAcceptanceConflict,
    ScopeProposalError,
    ScopeProposalService,
)
from backend.services.orqaly_research_bundle_service import canonical_hash


PARTNER_ID = "orqaly"
PENDING_RESEARCH_STATUSES = {"queued", "running"}
USABLE_RESEARCH_STATUSES = {"completed", "partial"}


class IdempotencyConflict(ValueError):
    """Raised when a tenant reuses an idempotency key with changed input."""


class ResearchDispatchUnavailable(RuntimeError):
    """Raised when accepted research could not be durably queued."""


class ResearchRefreshError(ValueError):
    """Raised when a decision cannot be resumed through the research path."""


class ReplanError(ValueError):
    """Raised when an immutable decision cannot be replanned."""


class DecisionLinkError(ValueError):
    """Raised when an upstream decision is missing or crosses a tenant boundary."""


def _is_accepted_research_dispatch(request: DecisionCreateRequestV1) -> bool:
    """Identify the fail-atomic compact research capability."""

    return bool(
        request.scope_proposal_acceptance is not None
        and request.scope_continuation is not None
        and request.scope_continuation.purpose == "research"
        and request.scope_consumer_inputs is not None
        and request.scope_consumer_inputs.purpose == "research"
    )


@dataclass(frozen=True)
class ResearchRefresh:
    record: OrchestrationDecisionRecordV1
    pending: bool = False


class OrchestrationDecisionService:
    def __init__(
        self,
        store: DecisionStore,
        scorer: AssignmentScorer | None = None,
        router: UncertaintyRouter | None = None,
        evidence_port: EvidenceRetrievalPort | None = None,
        research_port: ResearchToolPort | None = None,
        team_planner: TeamPlanner | None = None,
        plan_feasibility_port: PlanFeasibilityPort | None = None,
        replanning_service: ReplanningService | None = None,
        outcome_learning_port: OutcomeLearningPort | None = None,
        scope_correction_store: object | None = None,
        scope_proposal_service: ScopeProposalService | None = None,
    ):
        self.store = store
        self.scorer = scorer or AssignmentScorer()
        self.router = router or UncertaintyRouter()
        self.evidence_port = evidence_port
        self.research_port = research_port
        self.team_planner = team_planner or TeamPlanner(self.scorer)
        self.plan_feasibility_port = (
            plan_feasibility_port or CataloguePlanFeasibilityAdapter()
        )
        self.replanning_service = replanning_service or ReplanningService()
        self.outcome_learning_port = outcome_learning_port
        self.scope_correction_store = scope_correction_store
        self.scope_proposal_service = scope_proposal_service

    @staticmethod
    def consumer_payload_hash(request: DecisionCreateRequestV1) -> str:
        """Shared compact digest of one exact downstream consumer request."""

        payload = request.model_dump(mode="json", by_alias=True, exclude_none=False)
        for field in (
            "scope_research_acceptance",
            "scope_proposal_acceptance",
            "scope_continuation",
            "scope_consumer_inputs",
        ):
            payload.pop(field, None)
        return canonical_hash(payload)

    @staticmethod
    def _record_from_row(
        row: OrchestrationDecisionSnapshot,
        reused: bool = False,
    ) -> OrchestrationDecisionRecordV1:
        decision = OrchestrationDecisionV1.model_validate(row.decision_payload)
        request = DecisionCreateRequestV1.model_validate(row.input_snapshot)
        return OrchestrationDecisionRecordV1(
            **decision.model_dump(),
            input_snapshot=request,
            request_hash=row.request_hash,
            reused=reused,
        )

    def _evidence(
        self,
        request: DecisionCreateRequestV1,
        user_id: str,
    ) -> list[EvidenceItemV1]:
        if self.evidence_port:
            evidence = self.evidence_port.retrieve(request, user_id)
        else:
            evidence = list(request.evidence_catalogue)
        return self._bounded_evidence(request, evidence)

    def _bounded_evidence(
        self,
        request: DecisionCreateRequestV1,
        evidence: list[EvidenceItemV1],
    ) -> list[EvidenceItemV1]:
        """Deduplicate and cap the full catalogue with replayable safety ordering."""
        unique = {item.reference_id: item for item in evidence}

        def priority(item: EvidenceItemV1) -> tuple[float, float, str]:
            provenance = self.router.classifier.provenance_weights[item.provenance]
            verification = (
                1.0
                if item.verified and item.verification_source != "none"
                else 0.75
            )
            contribution = item.relevance * item.quality * provenance * verification
            return (-float(item.contradictory), -contribution, item.reference_id)

        ordered = sorted(unique.values(), key=priority)
        return ordered[: request.research_policy.maximum_evidence_items]

    def _scoring_request(
        self,
        request: DecisionCreateRequestV1,
        evidence: list[EvidenceItemV1],
        mode: RoutingMode,
    ) -> DecisionCreateRequestV1:
        if mode != RoutingMode.EVIDENCE_ASSISTED:
            return request
        return self._request_with_evidence_capability_hints(request, evidence)

    def _request_with_evidence_capability_hints(
        self,
        request: DecisionCreateRequestV1,
        evidence: list[EvidenceItemV1],
    ) -> DecisionCreateRequestV1:
        """Apply discovered capabilities as soft ranking preferences only."""
        hints = self.scorer.registry.normalize_many(
            hint for item in evidence for hint in item.capability_hints
        )
        if not hints:
            return request
        preferred = list(
            dict.fromkeys([*request.task.preferred_capabilities, *hints])
        )
        return request.model_copy(
            update={
                "task": request.task.model_copy(
                    update={"preferred_capabilities": preferred}
                )
            }
        )

    @staticmethod
    def _request_with_research_scope_facts(
        request: DecisionCreateRequestV1,
        result: ResearchResultV1,
    ) -> DecisionCreateRequestV1:
        """Rebuild the child scope around exact, independently verified facts.

        The research adapter is the only producer of ``scope_facts``. Even at
        this boundary we accept only usable research, verified seeds with full
        authority metadata, and claims that do not overlap an assumption. A
        refreshed decision always rebuilds its packet so the immutable child
        snapshot is linked to the evidence state it actually evaluated.
        """

        state = request.scope_state or ScopeStateV1()
        assumption_claims = {
            " ".join(item.text.split()).casefold() for item in state.assumptions
        }
        verified_research_evidence = {
            item.reference_id: item
            for item in request.evidence_catalogue
            if (
                item.verified
                and item.verification_source == "axwise_audit"
                and item.provenance == "empirical"
                and not item.contradictory
            )
        }
        merged = {
            (
                " ".join(item.claim.split()).casefold(),
                tuple(sorted(item.source_refs)),
                tuple(sorted(item.source_authority_ids)),
            ): item
            for item in state.facts
        }
        if result.job.status in USABLE_RESEARCH_STATUSES:
            for item in result.scope_facts:
                normalized_claim = " ".join(item.claim.split()).casefold()
                if item.verification != "verified" or normalized_claim in assumption_claims:
                    continue
                if not (
                    item.source_refs
                    and item.source_authority_ids
                    and item.verbatim_excerpt
                    and item.content_hash
                ):
                    continue
                bound_evidence = [
                    verified_research_evidence.get(reference)
                    for reference in item.source_refs
                ]
                if any(evidence is None for evidence in bound_evidence) or not any(
                    evidence.content_hash == item.content_hash
                    for evidence in bound_evidence
                    if evidence is not None
                ):
                    continue
                merged[
                    (
                        normalized_claim,
                        tuple(sorted(item.source_refs)),
                        tuple(sorted(item.source_authority_ids)),
                    )
                ] = item
        scope_state = state.model_copy(
            update={"facts": [merged[key] for key in sorted(merged)]}
        )
        return request.model_copy(
            update={"scope_state": scope_state, "scope_packet": None}
        )

    @staticmethod
    def _evidence_references(
        evidence: list[EvidenceItemV1],
    ) -> list[EvidenceReference]:
        return [
            EvidenceReference(
                reference_id=item.reference_id,
                provenance=item.provenance,
                content_hash=item.content_hash,
                relevance=item.relevance,
                quality=item.quality,
                verified=item.verified,
                verification_source=item.verification_source,
                contradictory=item.contradictory,
                classification=item.classification,
            )
            for item in evidence
        ]

    def _approval_state(
        self,
        request: DecisionCreateRequestV1,
    ) -> tuple[bool, list[str]]:
        task = request.task
        policy = request.policy_context
        required_actions = set(
            self.scorer.registry.normalize_many(task.requested_actions)
        )
        approval_actions = required_actions.intersection(
            self.scorer.registry.normalize_many(policy.human_approval_required_for)
        )
        sealed_consequential_actions = sealed_consequential_action_ids(
            request,
            self.scorer.registry,
        )
        risk_requires_approval = (
            RISK_ORDER[task.risk_level]
            > RISK_ORDER[policy.maximum_risk_without_human]
        )
        irreversible_requires_approval = (
            task.reversibility == Reversibility.IRREVERSIBLE
        )
        required_tool_ids = set(task.required_tools)
        tool_requires_approval = any(
            tool.tool_id in required_tool_ids and tool.requires_approval
            for tool in request.available_tools
            if tool.org_id == request.tenant.org_id
        )
        reasons = []
        if approval_actions:
            reasons.append("configured actions require approval")
        if sealed_consequential_actions:
            reasons.append("sealed consequential actions require approval")
        if risk_requires_approval:
            reasons.append("task risk exceeds autonomous policy threshold")
        if irreversible_requires_approval:
            reasons.append("task is irreversible")
        if tool_requires_approval:
            reasons.append("a required tool requires approval")
        return bool(reasons), reasons

    @staticmethod
    def _override_assessment(
        assessment: RoutingAssessmentV1,
        mode: RoutingMode,
        reason: str,
    ) -> RoutingAssessmentV1:
        return assessment.model_copy(
            update={
                "selected_mode": mode,
                "reasons": list(dict.fromkeys([*assessment.reasons, reason])),
            }
        )

    @staticmethod
    def _ranking_changes(
        before: list[AgentRanking],
        after: list[AgentRanking],
        reason: str = "evidence-derived capability signals changed the weighted ranking",
    ) -> list[RankingChange]:
        before_by_id = {item.agent_id: item for item in before}
        after_by_id = {item.agent_id: item for item in after}
        changes = []
        for agent_id in sorted(set(before_by_id).union(after_by_id)):
            old = before_by_id.get(agent_id)
            new = after_by_id.get(agent_id)
            if old and new and old.rank == new.rank and old.score == new.score:
                continue
            changes.append(
                RankingChange(
                    agent_id=agent_id,
                    before_rank=old.rank if old else None,
                    after_rank=new.rank if new else None,
                    before_score=old.score if old else None,
                    after_score=new.score if new else None,
                    reason=reason,
                )
            )
        return changes

    def _build_decision(
        self,
        request: DecisionCreateRequestV1,
        request_id: str,
        evidence: list[EvidenceItemV1],
        assessment: RoutingAssessmentV1,
        decision_id: str,
        research_idempotency_key: str | None = None,
        research_job: ResearchJobV1 | None = None,
        parent: OrchestrationDecisionRecordV1 | None = None,
        force_recovery: bool = False,
        replan_context: ReplanContextV1 | None = None,
        learned_features: list[LearnedFeatureV1] | None = None,
        scope_proposal: ScopeProposalBindingV1 | None = None,
    ) -> OrchestrationDecisionV1:
        task = request.task
        scope_packet = request.scope_packet
        if scope_packet is None:
            raise ValueError("canonical scope_packet must be attached before decision creation")
        scope_validation = validate_scope_packet(scope_packet)
        policy = request.policy_context
        routing_mode = assessment.selected_mode
        evidence_mode = scope_packet.research_contract.evidence.mode
        completed_staged_research = bool(
            request.scope_continuation is not None
            and request.scope_continuation.purpose in {"planning", "assignment"}
            and request.scope_consumer_inputs is not None
            and evidence
        )
        accepted_research_dispatch = _is_accepted_research_dispatch(request)
        contract_requires_research = (
            evidence_mode != "none" and not completed_staged_research
        )
        if (
            research_job is None
            and contract_requires_research
            and routing_mode != RoutingMode.RESEARCH_ASSISTED
        ):
            routing_mode = RoutingMode.RESEARCH_ASSISTED
            assessment = self._override_assessment(
                assessment,
                routing_mode,
                "the accepted typed scope contract requires research",
            )
        elif (
            research_job is None
            and not contract_requires_research
            and routing_mode == RoutingMode.RESEARCH_ASSISTED
        ):
            routing_mode = RoutingMode.DIRECT
            assessment = self._override_assessment(
                assessment,
                routing_mode,
                "the typed scope contract explicitly authorizes no research",
            )
        scoring_request = self._scoring_request(request, evidence, routing_mode)
        scoring = self.scorer.score(scoring_request)
        selected = scoring.selected
        approval_required, approval_reasons = self._approval_state(request)
        unified_lifecycle = self.scope_proposal_service is not None
        scope_execution_approved = (
            request.scope_proposal_acceptance is not None
            if unified_lifecycle
            else (
                request.scope_research_acceptance is not None
                or not contract_requires_research
            )
        )
        if request.scope_research_acceptance is not None:
            validate_scope_research_acceptance(request, scope_packet)
        awaiting_scope_confirmation = (
            research_job is None
            and (
                not scope_execution_approved
                if unified_lifecycle
                else contract_requires_research and not scope_execution_approved
            )
        )
        if awaiting_scope_confirmation:
            assessment = self._override_assessment(
                assessment,
                RoutingMode.RESEARCH_ASSISTED,
                "owner scope acceptance is required before any downstream consumer",
            )

        if (
            routing_mode == RoutingMode.RESEARCH_ASSISTED
            and research_job is None
            and not awaiting_scope_confirmation
        ):
            if self.research_port and research_idempotency_key:
                try:
                    research_job = self.research_port.start(
                        request,
                        decision_id,
                        research_idempotency_key,
                    )
                    expected_binding = scope_contract_binding(scope_packet)
                    if (
                        research_job.scope_contract_binding != expected_binding
                        or research_job.scope_research_acceptance
                        != request.scope_research_acceptance
                        or research_job.scope_runtime_binding != scope_packet.runtime
                    ):
                        raise ScopeContractError(
                            "research job did not echo accepted scope bindings"
                        )
                except ScopeContractError:
                    raise
                except ValueError:
                    # Adapter admission/contract failures are permanent input
                    # rejections, not transient queue outages.  Preserve the
                    # typed boundary error while create() still rolls back any
                    # run flushed before the rejection.
                    raise
                except Exception as exc:
                    if accepted_research_dispatch:
                        raise ResearchDispatchUnavailable(
                            "accepted research dispatch is temporarily unavailable"
                        ) from exc
                    routing_mode = RoutingMode.HUMAN_CLARIFICATION
                    assessment = self._override_assessment(
                        assessment,
                        routing_mode,
                        f"research could not be started: {type(exc).__name__}",
                    )
            else:
                if accepted_research_dispatch:
                    raise ResearchDispatchUnavailable(
                        "accepted research dispatch is temporarily unavailable"
                    )
                routing_mode = RoutingMode.HUMAN_CLARIFICATION
                assessment = self._override_assessment(
                    assessment,
                    routing_mode,
                    "research adapter is unavailable",
                )

        approval_points: list[ApprovalGate] = []
        if awaiting_scope_confirmation:
            approval_points.append(
                ApprovalGate(
                    gate_id="gate-scope-confirmation",
                    reason=(
                        "The owner must accept the exact immutable scope proposal "
                        "before planning, assignment, research, synthesis, or execution"
                    ),
                    required_before="scope_consumers",
                )
            )
        if approval_required:
            approval_points.append(
                ApprovalGate(
                    gate_id="gate-orqaly-authorization",
                    reason="; ".join(approval_reasons),
                    required_before="execution",
                )
            )
        plan = ExecutionPlan(mode=routing_mode, nodes=[], executable=False)
        recommended: list[AgentRanking] = []
        candidate_rankings = scoring.rankings
        plan_feasibility: PlanFeasibilityResultV1 | None = None
        required_capabilities = scoring.required_capabilities
        required_tools = list(task.required_tools)

        consumer_execution_allowed = scope_execution_approved or (
            not unified_lifecycle and research_job is not None
        )
        can_plan = consumer_execution_allowed and routing_mode in {
            RoutingMode.DIRECT,
            RoutingMode.EVIDENCE_ASSISTED,
            RoutingMode.HUMAN_CONTROLLED,
        }
        if request.planning and can_plan:
            team = self.team_planner.build(request, routing_mode)
            plan = team.plan
            approval_points.extend(team.approval_points)
            candidate_rankings = team.recommended_agents or scoring.rankings
            required_capabilities = self.scorer.registry.normalize_many(
                capability
                for step in request.planning.steps
                for capability in step.required_capabilities
            )
            required_tools = list(
                dict.fromkeys(
                    tool
                    for step in request.planning.steps
                    for tool in step.required_tools
                )
            )
            if approval_required:
                global_gate_ids = [
                    gate.gate_id
                    for gate in approval_points
                    if gate.gate_id == "gate-orqaly-authorization"
                ]
                plan = plan.model_copy(
                    update={
                        "nodes": [
                            node.model_copy(
                                update={
                                    "approval_gate_ids": list(
                                        dict.fromkeys(
                                            [*node.approval_gate_ids, *global_gate_ids]
                                        )
                                    )
                                }
                            )
                            for node in plan.nodes
                        ]
                    }
                )
            if team.validation.valid:
                plan_feasibility = self.plan_feasibility_port.validate(request, plan)
            else:
                plan_feasibility = PlanFeasibilityResultV1(
                    feasible=False,
                    source="catalogue_snapshot",
                    rejections=team.validation.rejections,
                )
            if plan_feasibility.feasible:
                recommended = team.recommended_agents
                routing_mode = plan.mode
                if force_recovery:
                    plan = plan.model_copy(
                        update={
                            "template_mode": plan.mode,
                            "mode": RoutingMode.RECOVERY,
                        }
                    )
                    routing_mode = RoutingMode.RECOVERY
                assessment = self._override_assessment(
                    assessment,
                    routing_mode,
                    f"validated {request.planning.pattern} team plan",
                )
            else:
                plan = plan.model_copy(update={"executable": False})
                routing_mode = RoutingMode.HUMAN_CONTROLLED
                assessment = self._override_assessment(
                    assessment,
                    routing_mode,
                    "plan feasibility was rejected: "
                    + plan_feasibility.rejections[0].reason,
                )
                approval_points.append(
                    ApprovalGate(
                        gate_id="gate-human-plan-repair",
                        reason="Orqaly must resolve the structured plan rejection",
                        required_before="assignment",
                    )
                )
        elif not request.planning:
            if not selected and routing_mode in {
                RoutingMode.DIRECT,
                RoutingMode.EVIDENCE_ASSISTED,
                RoutingMode.HUMAN_CONTROLLED,
                RoutingMode.HUMAN_CLARIFICATION,
            }:
                routing_mode = RoutingMode.HUMAN_CONTROLLED
                assessment = self._override_assessment(
                    assessment,
                    routing_mode,
                    "no eligible agent satisfies all hard requirements",
                )
            if (
                routing_mode in {RoutingMode.DIRECT, RoutingMode.EVIDENCE_ASSISTED}
                and approval_required
            ):
                routing_mode = RoutingMode.HUMAN_CONTROLLED
                assessment = self._override_assessment(
                    assessment,
                    routing_mode,
                    "execution requires a configured human approval",
                )
            executable_mode = routing_mode in {
                RoutingMode.DIRECT,
                RoutingMode.EVIDENCE_ASSISTED,
                RoutingMode.HUMAN_CONTROLLED,
            }
            nodes: list[PlanNode] = []
            direct_tool_action_grants = exact_tool_action_grants(
                request,
                task.required_tools,
                task.requested_actions,
                self.scorer.registry,
            )
            direct_action_ids = normalized_action_ids(
                task.requested_actions,
                self.scorer.registry,
            )
            direct_granted_action_ids = {
                action_id
                for grant in direct_tool_action_grants
                for action_id in grant.allowed_actions
            }
            direct_consequential_action_ids = sealed_consequential_action_ids(
                request,
                self.scorer.registry,
            )
            direct_tool_authority_exact = {
                grant.tool_id for grant in direct_tool_action_grants
            } == set(task.required_tools) and direct_consequential_action_ids.issubset(
                direct_action_ids.intersection(direct_granted_action_ids)
            )
            if (
                selected
                and executable_mode
                and consumer_execution_allowed
                and direct_tool_authority_exact
            ):
                agent = next(
                    item
                    for item in request.available_agents
                    if item.agent_id == selected.agent_id
                )
                nodes.append(
                    PlanNode(
                        node_id="node-direct-assignment",
                        title=task.objective,
                        assigned_agent_id=selected.agent_id,
                        required_capabilities=scoring.required_capabilities,
                        tool_ids=task.required_tools,
                        tool_action_grants=direct_tool_action_grants,
                        input_contract={
                            "task_id": task.task_id,
                            "context_reference_ids": [
                                item.reference_id for item in task.context_references
                            ],
                            "evidence_reference_ids": [
                                item.reference_id for item in evidence
                            ],
                            "dependency_outputs": [],
                        },
                        output_contract={"desired_outcome": task.desired_outcome},
                        completion_criteria=[task.desired_outcome],
                        approval_gate_ids=[
                            gate.gate_id for gate in approval_points
                        ],
                        estimated_cost=agent.estimated_cost,
                        estimated_latency_ms=agent.estimated_latency_ms,
                        failure_paths=self.team_planner.default_failure_paths(),
                    )
                )
                total_cost = agent.estimated_cost
                total_latency = agent.estimated_latency_ms
                plan = ExecutionPlan(
                    mode=routing_mode,
                    nodes=nodes,
                    team_member_ids=[selected.agent_id],
                    total_estimated_cost=total_cost,
                    critical_path_latency_ms=total_latency,
                    currency=request.budget.currency,
                )
                plan_feasibility = self.plan_feasibility_port.validate(request, plan)
                if plan_feasibility.feasible:
                    recommended = [selected]
                else:
                    plan = plan.model_copy(update={"executable": False})
                    routing_mode = RoutingMode.HUMAN_CONTROLLED
                    assessment = self._override_assessment(
                        assessment,
                        routing_mode,
                        "plan feasibility was rejected: "
                        + plan_feasibility.rejections[0].reason,
                    )
            elif selected and executable_mode and consumer_execution_allowed:
                routing_mode = RoutingMode.HUMAN_CONTROLLED
                assessment = self._override_assessment(
                    assessment,
                    routing_mode,
                    "required tool lacks an exact requested-action grant",
                )

        if awaiting_scope_confirmation and unified_lifecycle:
            status = DecisionStatus.ESCALATED
        elif routing_mode == RoutingMode.RESEARCH_ASSISTED:
            status = DecisionStatus.PENDING_RESEARCH
        elif routing_mode in {
            RoutingMode.HUMAN_CLARIFICATION,
            RoutingMode.HUMAN_CONTROLLED,
        }:
            status = DecisionStatus.ESCALATED
        else:
            status = DecisionStatus.RECOMMENDED

        if routing_mode == RoutingMode.HUMAN_CLARIFICATION:
            approval_points.append(
                ApprovalGate(
                    gate_id="gate-human-clarification",
                    reason=assessment.reasons[-1],
                    required_before="assignment",
                )
            )
        elif routing_mode == RoutingMode.HUMAN_CONTROLLED and not recommended and not any(
            gate.gate_id in {"gate-human-assignment", "gate-human-plan-repair"}
            for gate in approval_points
        ):
            approval_points.append(
                ApprovalGate(
                    gate_id="gate-human-assignment",
                    reason=assessment.reasons[-1],
                    required_before="assignment",
                )
            )

        context_packages: list[ContextPackage] = []
        if task.context_references:
            for ranking in recommended:
                context_packages.append(
                    ContextPackage(
                        package_id=f"context-{ranking.agent_id}",
                        assigned_agent_id=ranking.agent_id,
                        references=task.context_references,
                        instructions=[
                            "Use only tenant-authorized references supplied by Orqaly",
                            "Preserve empirical, inferred, and synthetic provenance labels",
                        ],
                    )
                )

        guardrails = list(
            dict.fromkeys(
                [
                    *task.constraints,
                    *policy.guardrails,
                    "Orqaly must revalidate ownership, availability, permissions, budget, and tool scope before execution",
                    "Synthetic evidence must never be represented as verified operational fact",
                ]
            )
        )
        fallbacks = [
            Fallback(
                trigger="authorization_rejected",
                action="request_replan" if recommended else "escalate_to_human",
                reason="AxWise recommendations never override Orqaly authorization",
            ),
            Fallback(
                trigger="agent_unavailable",
                action="request_new_catalogue",
                reason="Assignment was scored against a point-in-time catalogue",
            ),
            Fallback(
                trigger="research_failed_or_insufficient",
                action="escalate_to_human",
                reason="Failed or weak research cannot become a high-confidence assignment",
            ),
        ]
        ranking_changes = (
            self._ranking_changes(
                parent.candidate_rankings,
                candidate_rankings,
                reason=(
                    "verified execution-state changes altered team eligibility or ranking"
                    if replan_context
                    else "evidence-derived capability signals changed the weighted ranking"
                ),
            )
            if parent
            else []
        )
        if (
            scope_proposal is None
            and request.scope_research_acceptance is None
            and request.scope_continuation is None
            and research_job is None
        ):
            scope_proposal = build_scope_proposal_binding(
                request,
                scope_packet,
                proposal_decision_id=decision_id,
                parent_decision_id=parent.decision_id if parent else None,
            )
        return OrchestrationDecisionV1(
            scorer_version=self.scorer.version,
            decision_id=decision_id,
            request_id=request_id,
            created_at=datetime.now(timezone.utc),
            task_id=task.task_id,
            task_class=self.scorer.registry.task_class_for(task),
            routing_mode=routing_mode,
            status=status,
            required_capabilities=required_capabilities,
            required_tools=required_tools,
            recommended_agents=recommended,
            candidate_rankings=candidate_rankings,
            execution_plan=plan,
            context_packages=context_packages,
            guardrails=guardrails,
            approval_points=approval_points,
            fallbacks=fallbacks,
            assignment_factors=recommended[0].factors if recommended else [],
            evidence=self._evidence_references(evidence),
            confidence=min((item.score for item in recommended), default=0.0),
            router_version=self.router.version,
            routing_assessment=assessment,
            research_job=research_job,
            parent_decision_id=parent.decision_id if parent else None,
            ranking_changes=ranking_changes,
            plan_feasibility=plan_feasibility,
            plan_feasibility_request=(
                PlanFeasibilityRequestV1(
                    decision_id=decision_id,
                    tenant=request.tenant,
                    plan=plan,
                    required_approval_gate_ids=[
                        gate.gate_id for gate in approval_points
                    ],
                )
                if plan.nodes
                else None
            ),
            replan_context=replan_context,
            learned_features=(
                list(learned_features)
                if learned_features is not None
                else list(parent.learned_features) if parent else []
            ),
            scope_packet=scope_packet,
            scope_contract_binding=scope_contract_binding(scope_packet),
            research_execution_inputs_hash=research_execution_inputs_hash(
                request,
                scope_packet,
            ),
            scope_research_acceptance=request.scope_research_acceptance,
            scope_runtime_binding=scope_packet.runtime,
            scope_validation=scope_validation,
            scope_confirmation=build_scope_confirmation(scope_packet),
            scope_proposal=scope_proposal,
        )

    def _persist(
        self,
        request: DecisionCreateRequestV1,
        decision: OrchestrationDecisionV1,
        user_id: str,
        idempotency_key: str,
        request_hash: str,
    ) -> OrchestrationDecisionRecordV1:
        snapshot = canonical_json(
            request.model_dump(mode="json", by_alias=True, exclude_none=False)
        )
        payload = canonical_json(decision.model_dump(mode="json", exclude_none=False))
        row = OrchestrationDecisionSnapshot(
            decision_id=decision.decision_id,
            partner_id=PARTNER_ID,
            external_org_id=request.tenant.org_id,
            external_user_id=request.tenant.user_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            request_id=decision.request_id,
            request_hash=request_hash,
            contract_version=decision.contract_version,
            scorer_version=decision.scorer_version,
            input_snapshot=snapshot,
            decision_payload=payload,
            routing_mode=decision.routing_mode.value,
            selected_agent_id=(
                decision.recommended_agents[0].agent_id
                if decision.recommended_agents
                else None
            ),
            confidence=decision.confidence,
            status=decision.status.value,
            parent_decision_id=decision.parent_decision_id,
            created_at=decision.created_at,
        )
        try:
            self.store.add(row)
        except IntegrityError:
            self.store.rollback()
            existing = self.store.find_by_idempotency(
                PARTNER_ID,
                request.tenant.org_id,
                request.tenant.user_id,
                idempotency_key,
            )
            if existing and existing.request_hash == request_hash:
                return self._record_from_row(existing, reused=True)
            raise IdempotencyConflict(
                "Idempotency key was reused with a different request"
            )
        return OrchestrationDecisionRecordV1(
            **decision.model_dump(),
            input_snapshot=request,
            request_hash=request_hash,
            reused=False,
        )

    def create(
        self,
        request: DecisionCreateRequestV1,
        user_id: str,
        idempotency_key: str,
        request_id: str | None = None,
        *,
        _sealed_consumer: bool = False,
    ) -> OrchestrationDecisionRecordV1:
        submitted_request = request
        proposal_acceptance = submitted_request.scope_proposal_acceptance
        consumer_inputs = submitted_request.scope_consumer_inputs
        continuation = submitted_request.scope_continuation
        unified_downstream = proposal_acceptance is not None
        acceptance = submitted_request.scope_research_acceptance
        corrected_proposal: ScopeCorrectionProposalV1 | None = None
        corrected_proposal_request: DecisionCreateRequestV1 | None = None
        if self.scope_proposal_service is not None:
            supplied = (
                proposal_acceptance is not None,
                continuation is not None,
                consumer_inputs is not None,
            )
            if any(supplied) and not all(supplied):
                raise ScopeContractError(
                    "proposal acceptance, continuation, and consumer inputs are one capability"
                )
            if acceptance is not None:
                raise ScopeContractError(
                    "callers cannot submit the legacy research acceptance binding"
                )
            if submitted_request.upstream_decision_id is not None and not all(supplied):
                raise ScopeContractError(
                    "every downstream scope consumer requires a durable proposal acceptance"
                )
            if submitted_request.upstream_decision_id is None and (
                submitted_request.planning is not None or any(supplied)
            ):
                raise ScopeContractError(
                    "initial Gate-1 creation is admission-only"
                )
            if all(supplied):
                if not _sealed_consumer:
                    raise ScopeContractError(
                        "accepted scope consumers must use the compact proposal endpoint"
                    )
                if (
                    proposal_acceptance.org_id
                    != submitted_request.tenant.org_id
                    or proposal_acceptance.user_id
                    != submitted_request.tenant.user_id
                    or proposal_acceptance.task_id != submitted_request.task.task_id
                    or continuation.proposal_decision_id
                    != proposal_acceptance.proposal_decision_id
                    or submitted_request.upstream_decision_id
                    != proposal_acceptance.proposal_decision_id
                ):
                    raise ScopeContractError(
                        "accepted scope consumer contradicts its owner/proposal envelope"
                    )
                proposal_decision, proposal = (
                    self.scope_proposal_service.validate_continuation(
                        continuation,
                        consumer_inputs,
                        proposal_acceptance,
                        internal_user_id=user_id,
                    )
                )
                if (
                    submitted_request.scope_packet is None
                    or proposal_decision.scope_packet
                    != submitted_request.scope_packet
                    or proposal.scope_hash
                    != submitted_request.scope_packet.scope_hash
                    or consumer_inputs.task_id != submitted_request.task.task_id
                    or consumer_inputs.scope_hash != proposal.scope_hash
                    or consumer_inputs.scope_generation
                    != proposal.scope_generation
                ):
                    raise ScopeContractError(
                        "scope consumer request does not reproduce its exact compact commitment"
                    )
                validate_continuation_request_authority(
                    submitted_request,
                    submitted_request.scope_packet,
                )
                if consumer_inputs.purpose == "research":
                    acceptance = self.scope_proposal_service.research_acceptance(
                        proposal_acceptance
                    )
                    submitted_request = submitted_request.model_copy(
                        update={"scope_research_acceptance": acceptance}
                    )
                request = submitted_request
                continuation = submitted_request.scope_continuation
        if acceptance is not None and continuation is not None and not unified_downstream:
            raise ScopeContractError(
                "scope research acceptance and generic continuation are separate capabilities"
            )
        if acceptance is not None and (
            acceptance.org_id != submitted_request.tenant.org_id
            or acceptance.user_id != submitted_request.tenant.user_id
            or acceptance.goal_id != submitted_request.task.task_id
            or acceptance.proposal_decision_id
            != submitted_request.upstream_decision_id
        ):
            raise ScopeContractError(
                "scope research acceptance contradicts the submitted owner envelope"
            )
        parent = None
        if submitted_request.upstream_decision_id:
            parent_row = self.store.get_for_tenant(
                submitted_request.upstream_decision_id,
                submitted_request.tenant.org_id,
                submitted_request.tenant.user_id,
                user_id,
            )
            if not parent_row:
                raise DecisionLinkError("upstream orchestration decision was not found")
            parent = self._record_from_row(parent_row)
            if parent.task_id != submitted_request.task.task_id:
                raise DecisionLinkError(
                    "upstream decision belongs to a different task"
                )
        if continuation is not None and not unified_downstream:
            packet = submitted_request.scope_packet
            if parent is None or packet is None:
                raise DecisionLinkError(
                    "scope continuation requires its exact upstream decision and packet"
                )
            validate_scope_continuation(
                continuation,
                packet,
                org_id=submitted_request.tenant.org_id,
                user_id=submitted_request.tenant.user_id,
                task_id=submitted_request.task.task_id,
                upstream_decision_id=parent.decision_id,
                downstream_packet=packet,
            )
            if continuation.correction_id is None:
                if parent.scope_packet != packet:
                    raise ScopeContractError(
                        "uncorrected continuation must reuse the exact parent scope packet"
                    )
            else:
                store = self.scope_correction_store
                getter = getattr(store, "get_for_tenant", None)
                if getter is None:
                    raise ScopeContractError(
                        "corrected scope continuation store is unavailable"
                    )
                correction_row = getter(
                    continuation.correction_id,
                    submitted_request.tenant.org_id,
                    submitted_request.tenant.user_id,
                    user_id,
                )
                if (
                    correction_row is None
                    or correction_row.status != "accepted"
                    or correction_row.compilation_payload is None
                    or correction_row.acceptance_payload is None
                ):
                    raise ScopeContractError(
                        "scope continuation correction is not durably accepted"
                    )
                compilation = ScopeCorrectionCompilationV1.model_validate(
                    correction_row.compilation_payload
                )
                correction_acceptance = ScopeCorrectionAcceptanceV1.model_validate(
                    correction_row.acceptance_payload
                )
                corrected_proposal = compilation.proposal
                if (
                    correction_row.upstream_decision_id != parent.decision_id
                    or correction_row.task_id != submitted_request.task.task_id
                    or compilation.scope_packet != packet
                    or correction_acceptance.org_id
                    != submitted_request.tenant.org_id
                    or correction_acceptance.user_id
                    != submitted_request.tenant.user_id
                    or correction_acceptance.task_id
                    != submitted_request.task.task_id
                    or correction_acceptance.upstream_decision_id
                    != parent.decision_id
                    or correction_acceptance.result_scope_hash != packet.scope_hash
                    or correction_acceptance.delta_hash != continuation.delta_hash
                    or correction_acceptance.correction_id
                    != continuation.correction_id
                    or corrected_proposal is None
                    or correction_acceptance.proposal_id
                    != corrected_proposal.proposal_id
                    or correction_acceptance.proposal_hash
                    != corrected_proposal.proposal_hash
                    or correction_acceptance.research_execution_inputs_hash
                    != corrected_proposal.research_execution_inputs_hash
                    or corrected_proposal.scope_hash != packet.scope_hash
                    or corrected_proposal.contract_hash
                    != packet.research_contract.contract_hash
                ):
                    raise ScopeContractError(
                        "scope continuation does not match the accepted correction"
                    )
                correction_request = ScopeCorrectionRequestV1.model_validate(
                    correction_row.raw_request_payload
                )
                corrected_proposal_request = build_corrected_proposal_request(
                    correction_id=correction_row.correction_id,
                    request=correction_request,
                    proposal_source=parent.input_snapshot,
                    packet=packet,
                )
                expected_purpose = (
                    "research"
                    if packet.research_contract.evidence.mode != "none"
                    else "assignment"
                )
                if (
                    continuation.purpose != expected_purpose
                    or research_execution_inputs_hash(
                        corrected_proposal_request,
                        packet,
                    )
                    != corrected_proposal.research_execution_inputs_hash
                ):
                    raise ScopeContractError(
                        "accepted correction proposal inputs did not reproduce exactly"
                    )
                corrected_proposal_request = corrected_proposal_request.model_copy(
                    update={"scope_continuation": continuation}
                )
            validate_continuation_request_authority(submitted_request, packet)
        if acceptance is not None:
            if parent is None:
                raise DecisionLinkError(
                    "accepted research requires its exact scope proposal decision"
                )
            parent_binding = parent.scope_contract_binding
            if (
                parent.decision_id != acceptance.proposal_decision_id
                or parent.routing_mode != RoutingMode.RESEARCH_ASSISTED
                or parent.research_job is not None
                or parent.scope_research_acceptance is not None
                or parent.scope_packet is None
                or parent.input_snapshot.scope_research_acceptance is not None
                or parent.input_snapshot.scope_packet != parent.scope_packet
                or parent.scope_packet.scope_hash != acceptance.scope_hash
                or parent_binding is None
                or parent_binding.scope_hash != acceptance.scope_hash
                or parent_binding.contract_hash != acceptance.contract_hash
                or parent.research_execution_inputs_hash
                != acceptance.execution_inputs_hash
            ):
                raise DecisionLinkError(
                    "scope acceptance does not match the exact admission-only proposal"
                )

            packet = parent.scope_packet
            submitted_state = submitted_request.scope_state
            if (
                submitted_state is None
                or submitted_state.admission != packet.admission
                or submitted_state.deliverable != packet.deliverable
                or submitted_state.research_contract != packet.research_contract
                or (
                    submitted_request.scope_packet is not None
                    and submitted_request.scope_packet != packet
                )
            ):
                raise ScopeContractError(
                    "accepted request does not echo the exact proposed typed scope"
                )

            if unified_downstream:
                # The generic capability already binds the complete consumer
                # body.  Research-specific fields must additionally reproduce
                # the immutable proposal's sealed execution-input hash.
                request = submitted_request
                validate_continuation_request_authority(request, packet)
                validate_scope_research_acceptance(request, packet)
            else:
                # Transitional internal compatibility only. Production API
                # construction always injects ScopeProposalService and rejects
                # caller-supplied legacy acceptance bindings above.
                execution_state = parent.input_snapshot.scope_state or ScopeStateV1()
                execution_state = execution_state.model_copy(
                    update={
                        "admission": packet.admission,
                        "deliverable": packet.deliverable,
                        "research_contract": packet.research_contract,
                    }
                )
                execution_policy = parent.input_snapshot.research_policy.model_copy(
                    update={
                        "required_outputs": list(
                            packet.research_contract.evidence.required_outputs
                        )
                    }
                )
                request = parent.input_snapshot.model_copy(
                    update={
                        "upstream_decision_id": parent.decision_id,
                        "research_policy": execution_policy,
                        "scope_state": execution_state,
                        "scope_packet": packet,
                        "scope_research_acceptance": acceptance,
                    }
                )
                if packet.generation == 0:
                    request = ensure_scope_packet(request)
                else:
                    raise ScopeContractError(
                        "legacy corrected research acceptance is disabled"
                    )
                validate_scope_research_acceptance(request, packet)
            if request.scope_packet != packet:
                raise ScopeContractError(
                    "accepted execution did not reproduce the immutable proposal packet"
                )
        elif continuation is not None:
            # This path deliberately skips build_scope_packet: all downstream
            # planning and assignment consumes the exact accepted packet hash.
            request = corrected_proposal_request or submitted_request
        else:
            request = ensure_scope_packet(submitted_request)

        # The owner acceptance is a one-dispatch capability.  Network retries
        # may arrive with different HTTP idempotency keys, but they must resolve
        # to the same accepted decision instead of minting another decision/job.
        effective_idempotency_key = (
            (
                f"scope-research-{proposal_acceptance.acceptance_hash}"
                if unified_downstream and consumer_inputs.purpose == "research"
                else f"scope-consumer-{continuation.binding_hash}"
            )
            if unified_downstream
            else f"scope-acceptance-{acceptance.binding_hash}"
            if acceptance is not None
            else (
                f"scope-proposal-{corrected_proposal.proposal_hash}"
                if corrected_proposal is not None
                else idempotency_key
            )
        )
        request_hash = canonical_request_hash(request)
        existing = self.store.find_by_idempotency(
            PARTNER_ID,
            request.tenant.org_id,
            request.tenant.user_id,
            effective_idempotency_key,
        )
        if existing:
            if existing.request_hash != request_hash:
                raise IdempotencyConflict(
                    "Idempotency key was reused with a different request"
                )
            return self._record_from_row(existing, reused=True)

        if acceptance is not None:
            evidence = list(request.evidence_catalogue)
            evaluated_request = request
            learned_features = list(parent.learned_features)
        else:
            evidence = self._evidence(request, user_id)
            evaluated_request = request.model_copy(
                update={"evidence_catalogue": evidence}
            )
            learned_features: list[LearnedFeatureV1] = []
            if self.outcome_learning_port:
                evaluated_request, learned_features = self.outcome_learning_port.enrich(
                    evaluated_request,
                    self.scorer.version,
                )
            if continuation is not None:
                if evaluated_request.scope_packet != request.scope_packet:
                    raise ScopeContractError(
                        "outcome learning cannot replace continued scope"
                    )
                validate_continuation_request_authority(
                    evaluated_request,
                    request.scope_packet,
                )
            else:
                evaluated_request = ensure_scope_packet(evaluated_request)
        assessment = self.router.route(evaluated_request, evidence)
        decision_id = (
            corrected_proposal.proposal_id
            if corrected_proposal is not None
            else f"decision-{uuid.uuid4()}"
        )
        accepted_research_dispatch = _is_accepted_research_dispatch(evaluated_request)
        try:
            decision = self._build_decision(
                request=evaluated_request,
                request_id=request_id or str(uuid.uuid4()),
                evidence=evidence,
                assessment=assessment,
                decision_id=decision_id,
                research_idempotency_key=effective_idempotency_key,
                parent=parent,
                learned_features=learned_features,
            )
            if accepted_research_dispatch and decision.research_job is None:
                raise ResearchDispatchUnavailable(
                    "accepted research dispatch is temporarily unavailable"
                )
            if corrected_proposal is not None and (
                decision.scope_packet != request.scope_packet
                or decision.research_execution_inputs_hash
                != corrected_proposal.research_execution_inputs_hash
            ):
                raise ScopeContractError(
                    "corrected proposal decision did not reproduce its sealed inputs"
                )
            return self._persist(
                evaluated_request,
                decision,
                user_id,
                effective_idempotency_key,
                request_hash,
            )
        except Exception:
            if accepted_research_dispatch:
                # HybridRunService uses this same route-owned session.  A
                # rollback removes any run it flushed before the adapter
                # failed, so no paid job can outlive an unpersisted decision.
                self.store.rollback()
            raise

    def consume_scope_proposal(
        self,
        continuation_request: ScopeContinuationRequestV1,
        *,
        org_id: str,
        external_user_id: str,
        user_id: str,
        idempotency_key: str,
        request_id: str | None = None,
    ) -> OrchestrationDecisionRecordV1:
        """Consume one accepted proposal without client-side reconstruction.

        Research has no caller delta. Planning and assignment admit only their
        typed plan/catalogue overlays. Synthesis/execution remain fail-closed.
        """

        service = self.scope_proposal_service
        if service is None:
            raise ScopeContractError("scope proposal service is unavailable")
        consumer = continuation_request.consumer_inputs
        acceptance = service.accepted_for_proposal(
            continuation_request.proposal_decision_id,
            org_id=org_id,
            external_user_id=external_user_id,
            internal_user_id=user_id,
        )
        binding = service.continuation(
            continuation_request,
            org_id=org_id,
            external_user_id=external_user_id,
            internal_user_id=user_id,
        )
        sealed_request = service.consumer_request(
            binding,
            acceptance,
            consumer,
            internal_user_id=user_id,
        )
        return self.create(
            sealed_request,
            user_id=user_id,
            idempotency_key=idempotency_key,
            request_id=request_id,
            _sealed_consumer=True,
        )

    def create_precompiled_scope_proposal(
        self,
        request: DecisionCreateRequestV1,
        *,
        user_id: str,
        proposal_id: str,
        proposal_hash: str,
        expected_execution_inputs_hash: str,
        scope_proposal: ScopeProposalBindingV1,
    ) -> OrchestrationDecisionRecordV1:
        """Persist a corrected admission-only proposal produced by AxWise.

        This internal worker path never interprets prose or dispatches paid
        research. It accepts only a complete generation-N packet and a
        deterministic proposal identity already sealed by the correction
        compiler.
        """

        packet = request.scope_packet
        if (
            packet is None
            or packet.generation < 1
            or request.scope_continuation is not None
            or request.scope_consumer_inputs is not None
            or request.scope_proposal_acceptance is not None
            or request.scope_research_acceptance is not None
            or request.planning is not None
            or scope_proposal.proposal_decision_id != proposal_id
            or scope_proposal.proposal_hash != proposal_hash
            or scope_proposal.scope_hash != packet.scope_hash
            or scope_proposal.research_execution_inputs_hash
            != (
                expected_execution_inputs_hash
                if scope_proposal.disclosure.research_required
                else None
            )
        ):
            raise ScopeContractError(
                "corrected proposal must be an admission-only corrected packet"
            )
        if research_execution_inputs_hash(request, packet) != (
            expected_execution_inputs_hash
        ):
            raise ScopeContractError(
                "corrected proposal execution inputs did not reproduce"
            )
        if not request.upstream_decision_id:
            raise DecisionLinkError("corrected proposal requires its source decision")
        parent_row = self.store.get_for_tenant(
            request.upstream_decision_id,
            request.tenant.org_id,
            request.tenant.user_id,
            user_id,
        )
        if parent_row is None:
            raise DecisionLinkError("corrected proposal parent was not found")
        parent = self._record_from_row(parent_row)
        if parent.task_id != request.task.task_id:
            raise DecisionLinkError("corrected proposal parent belongs to another task")

        idempotency_key = f"scope-proposal-{proposal_hash}"
        request_hash = canonical_request_hash(request)
        existing = self.store.find_by_idempotency(
            PARTNER_ID,
            request.tenant.org_id,
            request.tenant.user_id,
            idempotency_key,
        )
        if existing is not None:
            if existing.request_hash != request_hash:
                raise IdempotencyConflict(
                    "corrected proposal identity was reused with changed inputs"
                )
            record = self._record_from_row(existing, reused=True)
            if (
                record.decision_id != proposal_id
                or record.scope_packet != packet
                or record.research_execution_inputs_hash
                != expected_execution_inputs_hash
                or record.scope_proposal != scope_proposal
            ):
                raise ScopeContractError(
                    "stored corrected proposal contradicts its compiler seal"
                )
            return record

        evidence: list[EvidenceItemV1] = []
        assessment = self.router.route(request, evidence)
        decision = self._build_decision(
            request=request,
            request_id=proposal_id,
            evidence=evidence,
            assessment=assessment,
            decision_id=proposal_id,
            research_idempotency_key=idempotency_key,
            parent=parent,
            learned_features=list(parent.learned_features),
            scope_proposal=scope_proposal,
        )
        if (
            decision.research_job is not None
            or decision.scope_packet != packet
            or decision.research_execution_inputs_hash
            != expected_execution_inputs_hash
        ):
            raise ScopeContractError(
                "corrected Gate-1 proposal attempted execution or changed scope"
            )
        return self._persist(
            request,
            decision,
            user_id,
            idempotency_key,
            request_hash,
        )

    def refresh_research(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
        idempotency_key: str,
        request_id: str | None = None,
    ) -> ResearchRefresh:
        row = self.store.get_for_tenant(
            decision_id,
            external_org_id,
            external_user_id,
            user_id,
        )
        if not row:
            raise ResearchRefreshError("orchestration decision was not found")
        parent = self._record_from_row(row)
        if not parent.research_job:
            raise ResearchRefreshError("decision has no research job to refresh")
        if not self.research_port:
            raise ResearchRefreshError("research adapter is unavailable")
        existing = self.store.find_by_idempotency(
            PARTNER_ID,
            external_org_id,
            external_user_id,
            idempotency_key,
        )
        if existing:
            if existing.parent_decision_id != parent.decision_id:
                raise IdempotencyConflict(
                    "Idempotency key was reused for a different research refresh"
                )
            return ResearchRefresh(
                record=self._record_from_row(existing, reused=True),
                pending=False,
            )

        result = self.research_port.collect(parent.input_snapshot, parent.research_job)
        expected_binding = parent.scope_contract_binding
        expected_acceptance = parent.scope_research_acceptance
        if (
            expected_binding is None
            or expected_acceptance is None
            or parent.research_job.scope_contract_binding != expected_binding
            or parent.research_job.scope_research_acceptance != expected_acceptance
            or result.scope_contract_binding != expected_binding
            or result.scope_research_acceptance != expected_acceptance
            or result.scope_runtime_binding != parent.scope_runtime_binding
            or result.job.scope_contract_binding != expected_binding
            or result.job.scope_research_acceptance != expected_acceptance
            or result.job.scope_runtime_binding != parent.scope_runtime_binding
        ):
            raise ResearchRefreshError(
                "research result did not echo the accepted scope bindings"
            )
        if result.job.status in PENDING_RESEARCH_STATUSES:
            return ResearchRefresh(record=parent, pending=True)

        merged = {
            item.reference_id: item for item in parent.input_snapshot.evidence_catalogue
        }
        for item in result.evidence:
            merged[item.reference_id] = item
        prior_policy = parent.input_snapshot.research_policy
        policy = prior_policy.model_copy(
            update={
                "allow_hybrid_research": False,
                "required": False,
                "completed_research_iterations": min(
                    prior_policy.maximum_research_iterations,
                    prior_policy.completed_research_iterations + 1,
                ),
            }
        )
        bounded_evidence = self._bounded_evidence(
            parent.input_snapshot,
            list(merged.values()),
        )
        enriched_request = parent.input_snapshot.model_copy(
            update={
                "evidence_catalogue": bounded_evidence,
                "research_policy": policy,
                # The acceptance authorized the completed research dispatch;
                # it is retained on the immutable job/result, not reused as a
                # blanket authorization for a new execution-input snapshot.
                "scope_research_acceptance": None,
            }
        )
        # Research can add evidence, but it cannot rewrite the owner-accepted
        # scope packet. Verified facts remain independently proof-bound on the
        # result/evidence surfaces (and in the research bundle).
        continuation_binding = enriched_request.scope_continuation
        if continuation_binding is not None:
            corrected_packet = enriched_request.scope_packet
            proposal_acceptance = enriched_request.scope_proposal_acceptance
            consumer_inputs = enriched_request.scope_consumer_inputs
            if corrected_packet is None:
                raise ResearchRefreshError(
                    "corrected research result lost its accepted scope packet"
                )
            if (
                proposal_acceptance is None
                or consumer_inputs is None
                or continuation_binding.scope_hash != corrected_packet.scope_hash
                or continuation_binding.scope_generation
                != corrected_packet.generation
                or continuation_binding.acceptance_hash
                != proposal_acceptance.acceptance_hash
                or continuation_binding.consumer_inputs_hash
                != consumer_inputs.consumer_inputs_hash
            ):
                raise ResearchRefreshError(
                    "research result lost its accepted proposal capability"
                )
        else:
            accepted_packet = enriched_request.scope_packet
            if accepted_packet is None:
                raise ResearchRefreshError(
                    "research result lost its owner-accepted scope packet"
                )
            # Research lifecycle flags may narrow after one dispatch (for
            # example, hybrid research is disabled), but evidence completion
            # must never mint a new semantic scope hash. Validate the narrowed
            # request against the exact accepted packet and retain it verbatim.
            validate_continuation_request_authority(
                enriched_request,
                accepted_packet,
                require_binding=False,
            )
        refresh_payload = {
            "parent_decision_id": parent.decision_id,
            "research_result": result.model_dump(mode="json"),
        }
        request_hash = hashlib.sha256(
            json.dumps(
                refresh_payload,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        assessment = self.router.route(enriched_request, bounded_evidence)
        if result.job.status not in USABLE_RESEARCH_STATUSES:
            assessment = self._override_assessment(
                assessment,
                RoutingMode.HUMAN_CLARIFICATION,
                f"research ended as {result.job.status}: "
                f"{result.job.failure_reason or 'no usable evidence'}",
            )
        elif result.job.status == "partial":
            assessment = assessment.model_copy(
                update={
                    "reasons": list(
                        dict.fromkeys(
                            [*assessment.reasons, "research returned partial evidence"]
                        )
                    )
                }
            )
        if result.job.status in USABLE_RESEARCH_STATUSES:
            # The research-derived capability model can improve the immutable
            # candidate ranking even when evidence remains too weak to authorize
            # execution. These are preferences, never eligibility requirements.
            enriched_request = self._request_with_evidence_capability_hints(
                enriched_request,
                bounded_evidence,
            )
        decision = self._build_decision(
            request=enriched_request,
            request_id=request_id or str(uuid.uuid4()),
            evidence=bounded_evidence,
            assessment=assessment,
            decision_id=f"decision-{uuid.uuid4()}",
            research_job=result.job,
            parent=parent,
        )
        decision = decision.model_copy(
            update={
                # This is an immutable provenance echo, not authorization for
                # another dispatch: enriched_request deliberately carries no
                # acceptance, so _build_decision cannot start research again.
                "scope_packet": parent.scope_packet,
                "scope_contract_binding": expected_binding,
                "research_execution_inputs_hash": (
                    expected_acceptance.execution_inputs_hash
                ),
                "scope_research_acceptance": expected_acceptance,
            }
        )
        record = self._persist(
            enriched_request,
            decision,
            user_id,
            idempotency_key,
            request_hash,
        )
        return ResearchRefresh(record=record, pending=False)

    def replan(
        self,
        decision_id: str,
        change: ReplanRequestV1,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
        idempotency_key: str,
        request_id: str | None = None,
    ) -> OrchestrationDecisionRecordV1:
        row = self.store.get_for_tenant(
            decision_id,
            external_org_id,
            external_user_id,
            user_id,
        )
        if not row:
            raise ReplanError("orchestration decision was not found")
        parent = self._record_from_row(row)
        replan_payload = {
            "parent_decision_id": parent.decision_id,
            "replan": change.model_dump(mode="json", by_alias=True),
        }
        request_hash = hashlib.sha256(
            json.dumps(
                replan_payload,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        existing = self.store.find_by_idempotency(
            PARTNER_ID,
            external_org_id,
            external_user_id,
            idempotency_key,
        )
        if existing:
            if (
                existing.parent_decision_id != parent.decision_id
                or existing.request_hash != request_hash
            ):
                raise IdempotencyConflict(
                    "Idempotency key was reused with a different replan request"
                )
            return self._record_from_row(existing, reused=True)

        try:
            application = self.replanning_service.apply(parent.input_snapshot, change)
        except ValueError as exc:
            raise ReplanError(str(exc)) from exc
        request = application.request.model_copy(update={"scope_packet": None})
        request = ensure_scope_packet(request)
        evidence = list(request.evidence_catalogue)
        assessment = self.router.route(request, evidence)
        decision = self._build_decision(
            request=request,
            request_id=request_id or str(uuid.uuid4()),
            evidence=evidence,
            assessment=assessment,
            decision_id=f"decision-{uuid.uuid4()}",
            parent=parent,
            force_recovery=change.trigger.value != "human_override",
            replan_context=application.context,
        )
        return self._persist(
            request,
            decision,
            user_id,
            idempotency_key,
            request_hash,
        )

    def get(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> OrchestrationDecisionRecordV1 | None:
        row = self.store.get_for_tenant(
            decision_id,
            external_org_id,
            external_user_id,
            user_id,
        )
        return self._record_from_row(row) if row else None
