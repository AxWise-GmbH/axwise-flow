"""Typed Phase 2 adapter over the durable A+B hybrid-run service."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    QuestionsData,
    SimulationConfig,
    SimulationPerformanceProfile,
    SimulationRequest,
    Stakeholder,
)
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    EvidenceItemV1,
    ResearchJobV1,
    ResearchResultV1,
)
from backend.services.orqaly_hybrid_run_service import (
    HybridOutputs,
    HybridPRDOutput,
    HybridRunService,
)
from backend.services.orqaly_research_bundle_service import (
    HybridGroundingPolicy,
    HybridResearchMode,
)
from backend.services.orqaly_persona_resolution_service import (
    OrqalyAgentCandidate,
    OrqalyTaskContext,
)


class HybridResearchAdapter:
    def __init__(self, service: HybridRunService, user, external_org_id: str, external_user_id: str):
        self.service = service
        self.user = user
        self.external_org_id = external_org_id
        self.external_user_id = external_user_id

    @staticmethod
    def _task_context(request: DecisionCreateRequestV1) -> OrqalyTaskContext:
        task = request.task
        brief = request.research_brief
        return OrqalyTaskContext(
            task_id=task.task_id,
            title=task.objective,
            description=task.objective,
            desired_outcome=task.desired_outcome,
            category=task.domain,
            constraints=task.constraints,
            required_capabilities=task.required_capabilities,
            required_execution_roles=(
                brief.required_execution_roles if brief else []
            ),
        )

    @staticmethod
    def _agent_candidates(request: DecisionCreateRequestV1) -> list[OrqalyAgentCandidate]:
        return [
            OrqalyAgentCandidate(
                agent_id=agent.agent_id,
                name=agent.name,
                role=agent.name,
                capabilities=agent.capabilities,
                tools=agent.tool_ids,
                availability_status=agent.availability.value,
                success_rate=agent.success_rate,
            )
            for agent in request.available_agents
        ]

    @staticmethod
    def _questions_data(request: DecisionCreateRequestV1) -> QuestionsData:
        """Build a domain-neutral, typed questionnaire without invoking the parser."""
        brief = request.research_brief
        if not brief:
            raise ValueError("research brief is required")
        supplied = list(brief.research_questions)
        defaults = [
            "Who directly experiences the problem, and how does it affect their work or life?",
            "In what context, workflow, or situation does the problem occur?",
            "Who decides, approves, funds, or can block a solution?",
            "Who benefits from the outcome, including people different from the decision-maker?",
            "Which observable or measurable outcome would count as success?",
            "Which evidence, constraints, risks, or non-negotiable facts must guide the work?",
            "Which capabilities, tools, communication style, and boundaries should the executor have?",
        ]
        questions = [
            supplied[index] if index < len(supplied) else fallback
            for index, fallback in enumerate(defaults)
        ]
        stakeholders = {
            "primary": [
                Stakeholder(
                    id="problem_experiencer",
                    name="Problem experiencer",
                    description=(
                        "The person, team, organisation, community, user, or other party "
                        "that directly experiences the problem."
                    ),
                    questions=[questions[0], questions[1]],
                ),
                Stakeholder(
                    id="decision_authority",
                    name="Decision authority",
                    description=(
                        "The buyer, approver, funder, regulator, owner, or other party "
                        "that can authorize or block the outcome."
                    ),
                    questions=[questions[2], questions[5]],
                ),
                Stakeholder(
                    id="beneficiary",
                    name="Outcome beneficiary",
                    description=(
                        "The person or group that receives the intended benefit, whether "
                        "or not they are the buyer or direct user."
                    ),
                    questions=[questions[3], questions[4]],
                ),
            ],
            "secondary": [
                Stakeholder(
                    id="executor",
                    name="Executor",
                    description=(
                        "The person or agent responsible for carrying out the work in the "
                        "relevant operational domain."
                    ),
                    questions=[questions[6], questions[5]],
                ),
                Stakeholder(
                    id="outcome_definer",
                    name="Outcome definer",
                    description=(
                        "The accountable party that defines acceptable evidence, quality, "
                        "and observable success."
                    ),
                    questions=[questions[4], questions[5]],
                ),
            ],
        }
        return QuestionsData(
            stakeholders=stakeholders,
            timeEstimate={"totalQuestions": len(questions)},
        )

    def start(
        self,
        request: DecisionCreateRequestV1,
        decision_id: str,
        idempotency_key: str,
    ) -> ResearchJobV1:
        brief = request.research_brief
        if not brief:
            raise ValueError("research brief is required")
        raw_questions = "\n".join(
            f"- {question}" for question in brief.research_questions
        ) or f"- What evidence would resolve: {request.task.objective}?"
        policy = request.research_policy
        grounded = (
            policy.minimum_mode in {"grounded_fast", "grounded_deep"}
            or policy.grounding_required
            or (policy.minimum_mode == "auto" and bool(brief.location))
        )
        allowed_sources = set(policy.allowed_source_types or [])
        if allowed_sources and allowed_sources <= {"company_registry"}:
            source_strategy = "registry"
        elif allowed_sources & {
            "google_search_result",
            "official_company_website",
        } and not (allowed_sources & {"company_registry"}):
            source_strategy = "web"
        else:
            source_strategy = "hybrid"
        simulation = SimulationRequest(
            business_context=BusinessContext(
                business_idea=brief.business_idea,
                target_customer=brief.target_stakeholders,
                problem=brief.problem,
                industry=brief.industry,
                location=brief.location,
            ),
            raw_questionnaire_content=raw_questions,
            questions_data=self._questions_data(request),
            config=SimulationConfig(
                depth=brief.depth,
                people_per_stakeholder=brief.sample_size,
                include_insights=True,
                performance_profile=SimulationPerformanceProfile(
                    policy.performance_profile
                ),
            ),
        )
        run, _ = self.service.enqueue(
            request=simulation,
            outputs=HybridOutputs(
                empirical_personas=True,
                insights=True,
                analysis_result=True,
                persona_resolution=True,
                market_sources=True,
                market_claims=True,
                synthetic_participants=True,
                interviews=True,
                research_bundle=True,
                prd=HybridPRDOutput(
                    enabled="research_prd" in policy.required_outputs,
                    required="research_prd" in policy.required_outputs,
                    type="operational",
                ),
            ),
            user=self.user,
            external_org_id=self.external_org_id,
            external_user_id=self.external_user_id,
            idempotency_key=f"orchestration-research:{idempotency_key}",
            request_id=decision_id,
            task_context=self._task_context(request),
            agent_candidates=self._agent_candidates(request),
            research_mode=(
                HybridResearchMode.GROUNDED_HYBRID
                if grounded
                else HybridResearchMode.SYNTHETIC_ONLY
            ),
            grounding_policy=HybridGroundingPolicy(
                required=grounded,
                research_required=policy.required,
                requested_mode=policy.minimum_mode,
                fail_closed=policy.fail_closed,
                source_strategy=source_strategy,
                minimum_structured_sources=(
                    3 if policy.minimum_mode == "grounded_deep" else 1
                ),
                maximum_sources=(
                    50 if policy.minimum_mode == "grounded_deep" else 25
                ),
                maximum_claims=(
                    100 if policy.minimum_mode == "grounded_deep" else 50
                ),
                allowed_source_types=(
                    list(policy.allowed_source_types)
                    if policy.allowed_source_types
                    else [
                        "company_registry",
                        "google_search_result",
                        "official_company_website",
                    ]
                ),
            ),
        )
        status = "partial" if run.status == "completed_with_warnings" else run.status
        return ResearchJobV1(
            job_id=run.job_id,
            status=status,
            decision_id=decision_id,
        )

    @staticmethod
    def _find_evidence(value: Any) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        if isinstance(value, list):
            for child in value:
                found.extend(HybridResearchAdapter._find_evidence(child))
        elif isinstance(value, dict):
            if value.get("quote") and "start_char" in value:
                found.append(value)
            for child in value.values():
                found.extend(HybridResearchAdapter._find_evidence(child))
        return found

    @staticmethod
    def _capability_hints(dataset: dict[str, Any]) -> list[str]:
        resolution = ((dataset.get("data") or {}).get("persona_resolution") or {})
        ideal = resolution.get("ideal_agent_persona") or {}
        return [str(value) for value in (ideal.get("required_capabilities") or [])[:20]]

    def _evidence_items(
        self,
        request: DecisionCreateRequestV1,
        run,
    ) -> list[EvidenceItemV1]:
        dataset = run.dataset if isinstance(run.dataset, dict) else {}
        capabilities = self._capability_hints(dataset)
        unique: dict[str, EvidenceItemV1] = {}
        for index, item in enumerate(self._find_evidence(dataset)):
            quote = str(item.get("quote") or "")
            document_id = str(item.get("document_id") or run.simulation_id)
            start = item.get("start_char")
            end = item.get("end_char")
            digest = hashlib.sha256(quote.encode("utf-8")).hexdigest()
            reference_id = f"synthetic:{document_id}:{start}:{end}:{index}"
            unique[reference_id] = EvidenceItemV1(
                reference_id=reference_id,
                provenance="synthetic",
                content_hash=digest,
                relevance=0.8,
                quality=0.85,
                verified=start is not None and end is not None,
                verification_source=(
                    "axwise_audit"
                    if start is not None and end is not None
                    else "none"
                ),
                capability_hints=capabilities,
            )
            if len(unique) >= request.research_policy.maximum_evidence_items:
                break
        audited = int((run.result_summary or {}).get("evidence_item_count") or 0)
        if not unique and audited > 0:
            reference_id = f"synthetic-analysis:{run.analysis_id or run.simulation_id}"
            unique[reference_id] = EvidenceItemV1(
                reference_id=reference_id,
                provenance="synthetic",
                content_hash=hashlib.sha256(reference_id.encode("utf-8")).hexdigest(),
                relevance=0.7,
                quality=0.65,
                verified=True,
                verification_source="axwise_audit",
                capability_hints=capabilities,
            )
        return list(unique.values())

    @staticmethod
    def _result(
        source: ResearchJobV1,
        status: str,
        evidence: list[EvidenceItemV1] | None = None,
        reason: str | None = None,
    ) -> ResearchResultV1:
        items = evidence or []
        return ResearchResultV1(
            job=source.model_copy(
                update={
                    "status": status,
                    "evidence_count": len(items),
                    "failure_reason": reason,
                }
            ),
            evidence=items,
        )

    def collect(
        self,
        request: DecisionCreateRequestV1,
        job: ResearchJobV1,
    ) -> ResearchResultV1:
        run = self.service.get_run_for_tenant(
            job.job_id,
            self.user.user_id,
            self.external_org_id,
            self.external_user_id,
        )
        if not run:
            return self._result(job, "failed", reason="research job was not found")
        if run.status in {"queued", "running"}:
            maximum = request.research_policy.maximum_research_latency_ms
            created_at = run.created_at
            if created_at and maximum:
                normalized = (
                    created_at.replace(tzinfo=timezone.utc)
                    if created_at.tzinfo is None
                    else created_at.astimezone(timezone.utc)
                )
                elapsed_ms = (datetime.now(timezone.utc) - normalized).total_seconds() * 1000
                if elapsed_ms > maximum:
                    self.service.cancel_for_tenant(
                        job.job_id,
                        self.user.user_id,
                        self.external_org_id,
                        self.external_user_id,
                        "orchestration research timeout",
                    )
                    return self._result(job, "timed_out", reason="research time budget expired")
            return self._result(job, run.status)
        if run.status == "cancelled":
            return self._result(job, "cancelled", reason=run.error or "research was cancelled")
        if run.status == "failed":
            return self._result(job, "failed", reason=run.error or "research failed")

        evidence = self._evidence_items(request, run)
        if not evidence:
            return self._result(job, "no_result", reason="research produced no usable evidence")
        mean_quality = sum(item.quality for item in evidence) / len(evidence)
        if mean_quality < request.research_policy.minimum_evidence_quality:
            return self._result(job, "low_quality", evidence, "evidence quality is below threshold")
        if run.status == "completed_with_warnings" or run.warning:
            return self._result(job, "partial", evidence, run.warning)
        return self._result(job, "completed", evidence)
