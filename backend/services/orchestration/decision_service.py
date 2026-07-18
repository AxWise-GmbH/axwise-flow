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
    ResearchPolicyV1,
    ResearchResultV1,
    RoutingAssessmentV1,
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
from backend.services.orchestration.assignment_scorer import AssignmentScorer
from backend.services.orchestration.adapters.plan_feasibility_adapter import (
    CataloguePlanFeasibilityAdapter,
)
from backend.services.orchestration.team_planner import TeamPlanner
from backend.services.orchestration.replanning_service import ReplanningService
from backend.services.orchestration.uncertainty_router import UncertaintyRouter


PARTNER_ID = "orqaly"
PENDING_RESEARCH_STATUSES = {"queued", "running"}
USABLE_RESEARCH_STATUSES = {"completed", "partial"}


class IdempotencyConflict(ValueError):
    """Raised when a tenant reuses an idempotency key with changed input."""


class ResearchRefreshError(ValueError):
    """Raised when a decision cannot be resumed through the research path."""


class ReplanError(ValueError):
    """Raised when an immutable decision cannot be replanned."""


class DecisionLinkError(ValueError):
    """Raised when an upstream decision is missing or crosses a tenant boundary."""


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

    @staticmethod
    def _legacy_phase1_request_hash(
        request: DecisionCreateRequestV1,
    ) -> str | None:
        if (
            request.upstream_decision_id is not None
            or request.evidence_catalogue
            or request.research_brief is not None
            or request.research_policy != ResearchPolicyV1()
            or request.planning is not None
        ):
            return None
        payload = request.model_dump(
            mode="json",
            by_alias=True,
            exclude_none=False,
        )
        payload.pop("evidence_catalogue", None)
        payload.pop("research_policy", None)
        payload.pop("research_brief", None)
        payload.pop("planning", None)
        payload.pop("upstream_decision_id", None)
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _legacy_phase2_request_hash(
        request: DecisionCreateRequestV1,
    ) -> str | None:
        if request.upstream_decision_id is not None or request.planning is not None:
            return None
        payload = request.model_dump(
            mode="json",
            by_alias=True,
            exclude_none=False,
        )
        payload.pop("planning", None)
        payload.pop("upstream_decision_id", None)
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _legacy_pre_link_request_hash(
        request: DecisionCreateRequestV1,
    ) -> str | None:
        """Hash produced by Phase 1–3 before upstream decision links existed."""
        if request.upstream_decision_id is not None:
            return None
        payload = request.model_dump(
            mode="json",
            by_alias=True,
            exclude_none=False,
        )
        payload.pop("upstream_decision_id", None)
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @classmethod
    def _request_hash_matches(
        cls,
        stored_hash: str,
        current_hash: str,
        request: DecisionCreateRequestV1,
    ) -> bool:
        return stored_hash in {
            current_hash,
            cls._legacy_phase1_request_hash(request),
            cls._legacy_phase2_request_hash(request),
            cls._legacy_pre_link_request_hash(request),
        }

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
    ) -> OrchestrationDecisionV1:
        task = request.task
        policy = request.policy_context
        routing_mode = assessment.selected_mode
        scoring_request = self._scoring_request(request, evidence, routing_mode)
        scoring = self.scorer.score(scoring_request)
        selected = scoring.selected
        approval_required, approval_reasons = self._approval_state(request)

        if routing_mode == RoutingMode.RESEARCH_ASSISTED and research_job is None:
            if self.research_port and research_idempotency_key:
                try:
                    research_job = self.research_port.start(
                        request,
                        decision_id,
                        research_idempotency_key,
                    )
                except Exception as exc:
                    routing_mode = RoutingMode.HUMAN_CLARIFICATION
                    assessment = self._override_assessment(
                        assessment,
                        routing_mode,
                        f"research could not be started: {type(exc).__name__}",
                    )
            else:
                routing_mode = RoutingMode.HUMAN_CLARIFICATION
                assessment = self._override_assessment(
                    assessment,
                    routing_mode,
                    "research adapter is unavailable",
                )

        approval_points: list[ApprovalGate] = []
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

        can_plan = routing_mode in {
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
            if selected and executable_mode:
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

        if routing_mode == RoutingMode.RESEARCH_ASSISTED:
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
    ) -> OrchestrationDecisionRecordV1:
        request_hash = canonical_request_hash(request)
        existing = self.store.find_by_idempotency(
            PARTNER_ID,
            request.tenant.org_id,
            request.tenant.user_id,
            idempotency_key,
        )
        if existing:
            if not self._request_hash_matches(
                existing.request_hash,
                request_hash,
                request,
            ):
                raise IdempotencyConflict(
                    "Idempotency key was reused with a different request"
                )
            return self._record_from_row(existing, reused=True)

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
        assessment = self.router.route(evaluated_request, evidence)
        parent = None
        if request.upstream_decision_id:
            parent_row = self.store.get_for_tenant(
                request.upstream_decision_id,
                request.tenant.org_id,
                request.tenant.user_id,
                user_id,
            )
            if not parent_row:
                raise DecisionLinkError("upstream orchestration decision was not found")
            parent = self._record_from_row(parent_row)
            if parent.task_id != request.task.task_id:
                raise DecisionLinkError(
                    "upstream decision belongs to a different task"
                )
        decision_id = f"decision-{uuid.uuid4()}"
        decision = self._build_decision(
            request=evaluated_request,
            request_id=request_id or str(uuid.uuid4()),
            evidence=evidence,
            assessment=assessment,
            decision_id=decision_id,
            research_idempotency_key=idempotency_key,
            parent=parent,
            learned_features=learned_features,
        )
        return self._persist(
            evaluated_request,
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
            }
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
        decision = self._build_decision(
            request=enriched_request,
            request_id=request_id or str(uuid.uuid4()),
            evidence=bounded_evidence,
            assessment=assessment,
            decision_id=f"decision-{uuid.uuid4()}",
            research_job=result.job,
            parent=parent,
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
        request = application.request
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
