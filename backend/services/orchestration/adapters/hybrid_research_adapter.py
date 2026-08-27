"""Typed Phase 2 adapter over the durable A+B hybrid-run service."""

from __future__ import annotations

import hashlib
import re
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
    ResearchPolicyV1,
    ResearchResultV1,
)
from backend.domain.market_scope import resolve_market_expression
from backend.services.orchestration.scope_contract_service import (
    research_execution_inputs_hash,
    research_execution_inputs_payload,
    scope_contract_binding,
    validate_scope_research_acceptance,
)
from backend.services.orchestration.scope_correction_service import (
    validate_continuation_request_authority,
)
from backend.domain.orchestration.scope_models import ScopeFactSeedV1
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
    def _ensure_dispatch_scope(
        request: DecisionCreateRequestV1,
    ) -> DecisionCreateRequestV1:
        """Preserve the exact proposal packet and its generic acceptance."""

        packet = request.scope_packet
        if packet is None:
            raise ValueError("research dispatch requires its exact proposal packet")
        binding = request.scope_continuation
        acceptance = request.scope_proposal_acceptance
        consumer = request.scope_consumer_inputs
        if binding is None and acceptance is None and consumer is None:
            # Internal generation-zero compatibility for existing focused
            # tests/callers. The authenticated production API never reaches
            # this branch, and the paid worker independently rejects legacy
            # rows before a provider call.
            if packet.generation != 0 or request.scope_research_acceptance is None:
                raise ValueError("research dispatch lacks unified scope acceptance")
            validate_scope_research_acceptance(request, packet)
            return request
        if (
            binding is None
            or acceptance is None
            or consumer is None
            or consumer.purpose != "research"
            or binding.purpose != "research"
            or binding.proposal_decision_id != acceptance.proposal_decision_id
            or binding.proposal_hash != acceptance.proposal_hash
            or binding.acceptance_id != acceptance.acceptance_id
            or binding.acceptance_hash != acceptance.acceptance_hash
            or binding.scope_hash != packet.scope_hash
            or binding.scope_generation != packet.generation
            or binding.consumer_inputs_hash != consumer.consumer_inputs_hash
        ):
            raise ValueError("research dispatch lost its accepted proposal capability")
        validate_continuation_request_authority(request, packet)
        return request

    @staticmethod
    def _task_context(request: DecisionCreateRequestV1) -> OrqalyTaskContext:
        task = request.task
        brief = request.research_brief
        packet = request.scope_packet
        if packet is None or packet.research_contract is None:
            raise ValueError("research requires a typed scope contract")
        contract = packet.research_contract
        if contract.evidence.mode not in {"synthetic", "grounded"}:
            raise ValueError(
                "hybrid research dispatch requires synthetic or grounded acquisition"
            )
        projection = research_execution_inputs_payload(request, packet)
        projected_task = projection["task"]
        projected_brief = projection["research_brief"] or {}
        return OrqalyTaskContext(
            task_id=task.task_id,
            title=task.objective,
            description=task.objective,
            desired_outcome=task.desired_outcome,
            category=projected_task["domain"],
            constraints=projected_task["constraints"],
            required_capabilities=projected_task["required_capabilities"],
            required_execution_roles=[
                slot.role for slot in contract.executor_role_slots
            ],
            # `custom` is a real scope intent, but it deliberately has no
            # legacy four-valued research PRD schema. The immutable binding
            # carries it; downstream PRD selection remains unset.
            research_prd_type=(
                None
                if contract.document_intent == "custom"
                else contract.document_intent
            ),
            customer_role_contract=(
                brief.customer_role_contract.model_dump(mode="json") if brief else {}
            ),
            critical_claim_policy=projected_brief.get("critical_claim_policy") or {},
            business_evidence_profile=projected_brief.get(
                "business_evidence_profile"
            ),
            scope_contract_binding=scope_contract_binding(packet),
            scope_runtime_binding=packet.runtime,
            research_execution_inputs_hash=research_execution_inputs_hash(
                request,
                packet,
            ),
            scope_research_acceptance=request.scope_research_acceptance,
            scope_proposal_acceptance=request.scope_proposal_acceptance,
            scope_continuation=request.scope_continuation,
            scope_consumer_inputs=request.scope_consumer_inputs,
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
    def _questions_data(
        request: DecisionCreateRequestV1,
        policy: ResearchPolicyV1 | None = None,
    ) -> QuestionsData:
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
        # Required grounded Orqaly bundles already synthesize role-specific
        # executor personas after customer research. Interviewing two more
        # synthetic "executor" cohorts duplicated that work and turned a
        # three-customer-cell study into fifteen interview calls. Preserve the
        # legacy direct-adapter topology, but make explicit grounded bundles
        # customer-centric: fast covers experiencer + buyer; deep also covers
        # a distinct beneficiary.
        policy = policy or request.research_policy
        if policy.required and policy.minimum_mode in {"grounded_fast", "grounded_deep"}:
            primary_count = 2 if policy.minimum_mode == "grounded_fast" else 3
            stakeholders = {"primary": stakeholders["primary"][:primary_count]}
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
        if request.scope_research_acceptance is None:
            raise ValueError(
                "research dispatch requires explicit owner scope acceptance"
            )
        request = self._ensure_dispatch_scope(request)
        brief = request.research_brief
        if not brief:
            raise ValueError("research brief is required")
        packet = request.scope_packet
        if packet is None or packet.research_contract is None:
            raise ValueError("research requires a typed scope contract")
        validate_scope_research_acceptance(request, packet)
        contract = packet.research_contract
        projection = research_execution_inputs_payload(request, packet)
        policy = ResearchPolicyV1.model_validate(
            projection["research_policy"]
        )
        raw_questions = "\n".join(
            f"- {question}" for question in brief.research_questions
        ) or f"- What evidence would resolve: {request.task.objective}?"
        grounded = contract.evidence.mode == "grounded"
        market_scope = (
            resolve_market_expression(" + ".join(contract.geographies))
            if contract.geographies
            else None
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
                business_idea=packet.intent.objective,
                target_customer="; ".join(packet.intent.audiences),
                problem=packet.intent.problem,
                industry=brief.industry,
                location=(
                    market_scope.raw_input
                    if market_scope
                    else brief.location
                ),
                market_scope=market_scope,
            ),
            raw_questionnaire_content=raw_questions,
            questions_data=self._questions_data(request, policy),
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
                empirical_personas="customer_personas" in contract.evidence.required_outputs,
                insights=True,
                analysis_result=True,
                persona_resolution=(
                    "persona_resolution" in contract.evidence.required_outputs
                ),
                market_sources="market_sources" in contract.evidence.required_outputs,
                market_claims="market_claims" in contract.evidence.required_outputs,
                synthetic_participants=(
                    "synthetic_participants" in contract.evidence.required_outputs
                ),
                interviews="interviews" in contract.evidence.required_outputs,
                research_bundle="research_bundle" in contract.evidence.required_outputs,
                prd=HybridPRDOutput(
                    enabled="research_prd" in contract.evidence.required_outputs,
                    required="research_prd" in contract.evidence.required_outputs,
                    type=(
                        contract.document_intent
                        if contract.document_intent != "custom"
                        else "both"
                    ),
                ),
            ),
            user=self.user,
            external_org_id=self.external_org_id,
            external_user_id=self.external_user_id,
            # One owner acceptance authorizes exactly one durable paid run.
            # Caller retry keys may vary across network retries, so the
            # tenant-scoped run identity derives from the immutable acceptance.
            idempotency_key=(
                "orchestration-research-acceptance:"
                f"{request.scope_research_acceptance.acceptance_id}:"
                f"{request.scope_research_acceptance.binding_hash}"
            ),
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
                research_required=(
                    policy.required or contract.evidence.external_sources_required
                ),
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
        if run.request_id != decision_id:
            raise ValueError(
                "scope acceptance is already bound to a different decision"
            )
        status = "partial" if run.status == "completed_with_warnings" else run.status
        return ResearchJobV1(
            job_id=run.job_id,
            status=status,
            decision_id=decision_id,
            scope_contract_binding=scope_contract_binding(packet),
            scope_research_acceptance=request.scope_research_acceptance,
            scope_runtime_binding=packet.runtime,
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

    @staticmethod
    def _authoritative_scope_contracts(
        run,
        maximum_items: int,
    ) -> tuple[list[ScopeFactSeedV1], list[EvidenceItemV1]]:
        """Project only proof-bound research facts into the scope ledger.

        Research bundles also contain synthetic interviews, persona hypotheses,
        source-associated observations, and owner declarations. None of those
        are facts here. A row must have passed the existing critical-claim
        authority gate, have no ledger conflict, bind an exact excerpt, and
        carry at least one signed source authority.
        """

        dataset = run.dataset if isinstance(run.dataset, dict) else {}
        data = dataset.get("data") if isinstance(dataset.get("data"), dict) else {}
        bundle = (
            data.get("research_bundle")
            if isinstance(data.get("research_bundle"), dict)
            else {}
        )
        quality = bundle.get("quality") if isinstance(bundle.get("quality"), dict) else {}
        critical = (
            quality.get("critical_claims")
            if isinstance(quality.get("critical_claims"), dict)
            else {}
        )
        if int(critical.get("conflict_count") or 0) > 0:
            return [], []
        ledger = critical.get("evidence_ledger")
        if not isinstance(ledger, list):
            return [], []
        claims = {
            str(item.get("claim_id")): item
            for item in (bundle.get("market_claims") or [])
            if isinstance(item, dict) and item.get("claim_id")
        }
        scope_facts: list[ScopeFactSeedV1] = []
        evidence: list[EvidenceItemV1] = []
        seen_references: set[str] = set()
        sha256_pattern = re.compile(r"^[a-f0-9]{64}$")
        for row in ledger:
            if (
                not isinstance(row, dict)
                or row.get("status") != "verified_current_authoritative"
                or row.get("evidence_class")
                not in {
                    "statutory_current",
                    "official_statistic",
                    "observed_primary_market",
                    "source_linked_observation",
                }
            ):
                continue
            claim_id = str(row.get("claim_id") or "")
            claim = claims.get(claim_id) or {}
            subject = " ".join(str(claim.get("subject") or "").split())
            predicate = " ".join(
                str(claim.get("predicate") or "").replace("_", " ").split()
            )
            claim_object = " ".join(str(claim.get("object") or "").split())
            if not claim_object:
                continue
            source_ids = {
                str(value) for value in (row.get("source_ids") or []) if value
            }
            authority_ids: list[str] = []
            for source in row.get("sources") or []:
                if not isinstance(source, dict):
                    continue
                source_id = str(source.get("source_id") or "")
                authority = str(source.get("source_authority") or "")
                signature = str(source.get("authority_proof_signature") or "")
                if (
                    not source_id
                    or source_id not in source_ids
                    or not authority
                    or not sha256_pattern.fullmatch(signature)
                ):
                    continue
                authority_digest = hashlib.sha256(
                    f"{source_id}:{authority}:{signature}".encode("utf-8")
                ).hexdigest()
                authority_ids.append(f"axwise-authority-{authority_digest}")
            authority_ids = sorted(set(authority_ids))
            if not authority_ids:
                continue
            for fact in row.get("facts") or []:
                if not isinstance(fact, dict) or fact.get("identity_complete") is not True:
                    continue
                fact_id = str(fact.get("fact_id") or "")
                fact_sources = {
                    str(value) for value in (fact.get("source_scope") or []) if value
                }
                display_value = " ".join(
                    str(fact.get("display_value") or "").split()
                )
                if not fact_id or not display_value or not fact_sources:
                    continue
                if not fact_sources.issubset(source_ids):
                    continue
                excerpt = (
                    claim_object
                    if display_value.casefold() in claim_object.casefold()
                    else display_value
                )
                if not excerpt:
                    continue
                reference_digest = hashlib.sha256(fact_id.encode("utf-8")).hexdigest()
                reference_id = f"axwise-research-fact-{reference_digest[:32]}"
                if reference_id in seen_references:
                    continue
                claim_text = " ".join(
                    value for value in (subject, predicate, claim_object) if value
                )[:4000]
                if len(claim_text) < 3:
                    continue
                content_hash = hashlib.sha256(excerpt.encode("utf-8")).hexdigest()
                scope_facts.append(
                    ScopeFactSeedV1(
                        claim=claim_text,
                        verification="verified",
                        source_refs=[reference_id],
                        source_authority_ids=authority_ids,
                        verbatim_excerpt=excerpt[:8000],
                        content_hash=content_hash,
                    )
                )
                evidence.append(
                    EvidenceItemV1(
                        reference_id=reference_id,
                        provenance="empirical",
                        content_hash=content_hash,
                        relevance=1.0,
                        quality=1.0,
                        verified=True,
                        verification_source="axwise_audit",
                        classification="public",
                    )
                )
                seen_references.add(reference_id)
                if len(scope_facts) >= maximum_items:
                    return scope_facts, evidence
        return scope_facts, evidence

    def _evidence_items(
        self,
        run,
        maximum_evidence_items: int,
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
            if len(unique) >= maximum_evidence_items:
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
        scope_facts: list[ScopeFactSeedV1] | None = None,
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
            scope_facts=scope_facts or [],
            scope_contract_binding=source.scope_contract_binding,
            scope_research_acceptance=source.scope_research_acceptance,
            scope_runtime_binding=source.scope_runtime_binding,
        )

    def collect(
        self,
        request: DecisionCreateRequestV1,
        job: ResearchJobV1,
    ) -> ResearchResultV1:
        request = self._ensure_dispatch_scope(request)
        if request.scope_packet is None:
            raise ValueError("research collection requires a typed scope packet")
        validate_scope_research_acceptance(request, request.scope_packet)
        policy = ResearchPolicyV1.model_validate(
            research_execution_inputs_payload(
                request,
                request.scope_packet,
            )["research_policy"]
        )
        if (
            job.scope_contract_binding
            != scope_contract_binding(request.scope_packet)
            or job.scope_research_acceptance
            != request.scope_research_acceptance
            or job.scope_runtime_binding != request.scope_packet.runtime
        ):
            raise ValueError("research job scope binding is stale or mismatched")
        run = self.service.get_run_for_tenant(
            job.job_id,
            self.user.user_id,
            self.external_org_id,
            self.external_user_id,
        )
        if not run:
            return self._result(job, "failed", reason="research job was not found")
        request_payload = run.request_payload or {}
        raw_task_context = request_payload.get("task_context")
        durable_task_context = (
            OrqalyTaskContext.model_validate(raw_task_context)
            if raw_task_context
            else None
        )
        durable_binding, durable_acceptance, durable_runtime = (
            HybridRunService._validated_orqaly_scope_context(
                durable_task_context,
                self.external_org_id,
                self.external_user_id,
                raw_task_context=raw_task_context,
            )
        )
        if (
            durable_binding != job.scope_contract_binding
            or durable_acceptance != job.scope_research_acceptance
            or durable_runtime != job.scope_runtime_binding
        ):
            raise ValueError(
                "durable research run does not match the accepted research job"
            )
        if run.status in {"queued", "running"}:
            maximum = policy.maximum_research_latency_ms
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

        scope_facts, authoritative_evidence = self._authoritative_scope_contracts(
            run,
            policy.maximum_evidence_items,
        )
        generic_evidence = self._evidence_items(
            run,
            policy.maximum_evidence_items,
        )
        evidence_by_reference = {
            item.reference_id: item
            for item in [*authoritative_evidence, *generic_evidence]
        }
        evidence = list(evidence_by_reference.values())[
            : policy.maximum_evidence_items
        ]
        retained_references = {item.reference_id for item in evidence}
        scope_facts = [
            fact
            for fact in scope_facts
            if set(fact.source_refs).issubset(retained_references)
        ]
        if not evidence:
            return self._result(job, "no_result", reason="research produced no usable evidence")
        mean_quality = sum(item.quality for item in evidence) / len(evidence)
        if mean_quality < policy.minimum_evidence_quality:
            return self._result(
                job,
                "low_quality",
                evidence,
                "evidence quality is below threshold",
            )
        if run.status == "completed_with_warnings" or run.warning:
            return self._result(
                job,
                "partial",
                evidence,
                run.warning,
                scope_facts=scope_facts,
            )
        return self._result(
            job,
            "completed",
            evidence,
            scope_facts=scope_facts,
        )
