"""Durable execution service for Orqaly's asynchronous A+B research runs."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from backend.api.research.simulation_bridge.models import SimulationRequest, SimulationResponse
from backend.api.research.simulation_bridge.services.market_scope import (
    resolve_market_scope,
)
from backend.api.research.simulation_bridge.services.closed_loop_hybrid import (
    enrich_with_empirical_personas,
)
from backend.database import SessionLocal
from backend.models import (
    AnalysisResult,
    CachedPRD,
    InterviewData,
    PipelineRun,
    SimulationData,
    User,
)
from backend.services.llm import LLMServiceFactory
from backend.services.processing.prd_generation_service import PRDGenerationService
from backend.services.orqaly_research_bundle_service import (
    HybridGroundingPolicy,
    HybridResearchMode,
    GroundingCollector,
    build_research_bundle,
    canonical_hash,
    collect_regional_grounding,
    complete_deferred_grounding_enrichment,
    request_with_grounding,
    valid_structured_market_sources,
)
from backend.services.orqaly_persona_resolution_service import (
    OrqalyAgentCandidate,
    OrqalyTaskContext,
    resolve_orqaly_personas,
)
from backend.services.research_quality_service import (
    COMMERCIAL_MARKET_LAUNCH,
    SUPPORTED_RESEARCH_PRD_TYPES,
    determine_claim_class_applicability,
    evaluate_critical_claims,
    normalize_research_prd_type,
)
from backend.services.research_topic_contract_service import (
    ConfirmedMarketScope,
    ImmutableGoalTopicFields,
    build_expected_trusted_topic_alias_expansion,
    build_topic_seed,
)
from backend.domain.market_scope import resolve_market_expression


logger = logging.getLogger(__name__)

PARTNER_ID = "orqaly"
TERMINAL_STATUSES = {"completed", "completed_with_warnings", "failed", "cancelled"}
_PRIVATE_GROUNDING_SOURCE_KEYS = {
    "_authority_document_artifact",
    "_structured_evidence_html",
}


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _strip_private_grounding_artifacts(grounding: Dict[str, Any]) -> Dict[str, Any]:
    """Remove evaluator-only fetched documents before any durable handoff."""

    grounding = dict(grounding)
    grounding["market_sources"] = [
        {
            key: value
            for key, value in source.items()
            if key not in _PRIVATE_GROUNDING_SOURCE_KEYS
        }
        for source in grounding.get("market_sources") or []
        if isinstance(source, dict)
    ]
    for entry in grounding.get("_deferred_company_enrichment") or []:
        pipeline = entry.get("pipeline") if isinstance(entry, dict) else None
        if pipeline is None:
            continue
        pipeline.market_sources = [
            {
                key: value
                for key, value in source.items()
                if key not in _PRIVATE_GROUNDING_SOURCE_KEYS
            }
            for source in pipeline.market_sources
            if isinstance(source, dict)
        ]
    return grounding


class HybridRunCancelled(Exception):
    """Raised when a queued or running job was cancelled by its tenant."""


class HybridPRDOutput(BaseModel):
    enabled: bool = False
    type: str = Field(
        default="both",
        pattern=(
            "^(operational|technical|both|commercial_market_launch|"
            "operational_process|product_strategy|software_product)$"
        ),
    )
    required: bool = False

    @property
    def document_intent(self) -> str:
        return normalize_research_prd_type(self.type)

    @property
    def storage_type(self) -> str:
        if self.type in {"operational", "technical", "both"}:
            return self.type
        return "technical" if self.type == "software_product" else "operational"


class HybridOutputs(BaseModel):
    """Requested result deliverables for a long-running hybrid research job."""

    empirical_personas: bool = True
    insights: bool = True
    analysis_result: bool = True
    persona_resolution: bool = False
    market_sources: bool = False
    market_claims: bool = False
    synthetic_participants: bool = False
    interviews: bool = False
    research_bundle: bool = False
    prd: HybridPRDOutput = Field(default_factory=HybridPRDOutput)


class HybridRunService:
    """Owns idempotency, stage state, persistence, and terminal hybrid delivery."""

    def __init__(
        self,
        orchestrator,
        session_factory: Callable = SessionLocal,
        enrichment=enrich_with_empirical_personas,
        grounding: GroundingCollector = collect_regional_grounding,
    ):
        self.orchestrator = orchestrator
        self.session_factory = session_factory
        self.enrichment = enrichment
        self.grounding = grounding

    @staticmethod
    def _requested_country_codes(
        request: SimulationRequest,
        grounding: Dict[str, Any],
    ) -> list[str]:
        scope = getattr(request.business_context, "market_scope", None)
        if scope:
            values = [
                str(country.country_code).upper()
                for country in scope.resolved_scope.countries
            ]
            if values:
                return list(dict.fromkeys(values))
        values = [
            str(value).upper()
            for value in (grounding.get("country_codes") or [])
            if value
        ]
        for cell in grounding.get("cell_coverage") or []:
            if isinstance(cell, dict):
                values.extend(
                    str(value).upper()
                    for value in (cell.get("country_codes") or [])
                    if value
                )
        return list(dict.fromkeys(values))

    @staticmethod
    def _claim_class_applicability(
        request: SimulationRequest,
        task_context: Optional[OrqalyTaskContext],
        requested_claim_classes: list[str],
    ) -> Dict[str, Any]:
        context = request.business_context
        return determine_claim_class_applicability(
            {
                "research_prd_type": (
                    task_context.research_prd_type if task_context else None
                ),
                "title": task_context.title if task_context else None,
                "description": task_context.description if task_context else None,
                "desired_outcome": (
                    task_context.desired_outcome if task_context else None
                ),
                "category": task_context.category if task_context else None,
                "constraints": task_context.constraints if task_context else [],
                "required_capabilities": (
                    task_context.required_capabilities if task_context else []
                ),
                "required_execution_roles": (
                    task_context.required_execution_roles if task_context else []
                ),
                "business_context": (
                    context.model_dump(mode="json") if context else None
                ),
                "research_questions": (
                    request.questions_data.model_dump(mode="json")
                    if request.questions_data
                    else None
                ),
            },
            requested_claim_classes,
        )

    @staticmethod
    def _topic_market_scope_contract(
        request: SimulationRequest,
        country_codes: list[str],
    ) -> Optional[Dict[str, Any]]:
        context = request.business_context
        if not context or not country_codes:
            return None
        market_scope = context.market_scope
        scope_label = (
            market_scope.raw_input
            if market_scope and market_scope.raw_input
            else context.location or ",".join(country_codes)
        )
        geography_terms = [scope_label]
        if context.location:
            geography_terms.append(context.location)
        if market_scope:
            for country in market_scope.resolved_scope.countries:
                geography_terms.append(country.country_name)
                geography_terms.extend(country.localities)
        try:
            scope = ConfirmedMarketScope(
                scope_label=scope_label,
                country_codes=tuple(country_codes),
                confirmed=True,
                resolution_hash=(
                    market_scope.resolution_hash if market_scope else None
                ),
                geography_terms=tuple(
                    value for value in dict.fromkeys(geography_terms) if value
                ),
            )
        except (TypeError, ValueError):
            return None
        return scope.model_dump(mode="json")

    @staticmethod
    def _topic_seed_contract(
        request: SimulationRequest,
        task_context: Optional[OrqalyTaskContext],
        country_codes: list[str],
    ) -> Optional[Dict[str, Any]]:
        context = request.business_context
        scope_contract = HybridRunService._topic_market_scope_contract(
            request, country_codes
        )
        if not context or not scope_contract:
            return None
        immutable = {
            "title": task_context.title if task_context else context.business_idea,
            "problem_scope": " ".join(
                value
                for value in (
                    task_context.description if task_context else "",
                    context.problem,
                )
                if value
            ),
            "desired_outcome": task_context.desired_outcome or ""
            if task_context
            else "",
            "mission": context.business_idea,
            "industry": context.industry or "",
            "target_user": context.target_customer,
        }
        goal_id = (
            task_context.task_id
            if task_context and task_context.task_id
            else "hybrid-" + hashlib.sha256(
                json.dumps(immutable, sort_keys=True).encode("utf-8")
            ).hexdigest()[:32]
        )
        try:
            seed = build_topic_seed(
                ImmutableGoalTopicFields(goal_id=goal_id, **immutable),
                ConfirmedMarketScope.model_validate(scope_contract),
            )
        except (TypeError, ValueError):
            return None
        return seed.model_dump(mode="json")

    @staticmethod
    def _evaluate_country_cell_claims(
        grounding: Dict[str, Any],
        *,
        critical_policy: Dict[str, Any],
        claim_class_applicability: Dict[str, Any],
    ) -> list[Dict[str, Any]]:
        """Fail closed per confirmed country cell, never on a global union."""

        coverage_rows = [
            row
            for row in grounding.get("cell_coverage") or []
            if isinstance(row, dict) and row.get("cell_id")
        ]
        if not coverage_rows:
            return []
        sources = [
            row for row in grounding.get("market_sources") or [] if isinstance(row, dict)
        ]
        claims = [
            row for row in grounding.get("market_claims") or [] if isinstance(row, dict)
        ]
        mandatory = list(critical_policy.get("mandatory_claim_classes") or [])
        results: list[Dict[str, Any]] = []
        for coverage in coverage_rows:
            cell_id = str(coverage["cell_id"])
            countries = [
                str(value).upper()
                for value in coverage.get("country_codes") or []
                if value
            ]
            cell_sources = [
                row
                for row in sources
                if cell_id in (row.get("research_cell_ids") or [])
                or (
                    not (row.get("research_cell_ids") or [])
                    and set(countries).intersection(
                        str(value).upper()
                        for value in row.get("country_codes") or []
                        if value
                    )
                )
            ]
            source_ids = {
                str(row.get("source_id"))
                for row in cell_sources
                if row.get("source_id")
            }
            cell_claims = [
                row
                for row in claims
                if source_ids.intersection(row.get("source_ids") or [])
                and (
                    cell_id in (row.get("research_cell_ids") or [])
                    or (
                        not (row.get("research_cell_ids") or [])
                        and set(countries).intersection(
                            str(value).upper()
                            for value in row.get("country_codes") or []
                            if value
                        )
                    )
                )
            ]
            quality = evaluate_critical_claims(
                {
                    "market_sources": cell_sources,
                    "market_claims": cell_claims,
                    "topic_seed_contract": grounding.get("topic_seed_contract"),
                    "topic_market_scope_contract": grounding.get(
                        "topic_market_scope_contract"
                    ),
                    "topic_alias_expansion": grounding.get(
                        "topic_alias_expansion"
                    ),
                },
                countries,
                freshness_days=int(critical_policy.get("freshness_days") or 120),
                freshness_by_class=critical_policy.get("freshness_by_class") or {},
                mandatory_claim_classes=mandatory,
                claim_class_applicability=claim_class_applicability,
            )
            coverage["critical_claim_status"] = quality.get("status")
            coverage["verified_claim_classes"] = list(
                quality.get("verified_claim_classes") or []
            )
            coverage["missing_claim_classes"] = list(
                quality.get("missing_claim_classes") or []
            )
            if quality.get("status") != "passed":
                coverage["status"] = "blocked"
            results.append(
                {
                    "cell_id": cell_id,
                    "country_codes": countries,
                    "status": quality.get("status"),
                    "verified_claim_classes": coverage["verified_claim_classes"],
                    "missing_claim_classes": coverage["missing_claim_classes"],
                    "blocked_reason_counts": {
                        reason: sum(
                            1
                            for row in quality.get("blocked_claims") or []
                            if str(row.get("reason") or "").split(":", 1)[0] == reason
                        )
                        for reason in sorted(
                            {
                                str(row.get("reason") or "").split(":", 1)[0]
                                for row in quality.get("blocked_claims") or []
                                if row.get("reason")
                            }
                        )
                    },
                }
            )
        return results

    @staticmethod
    def _with_resolved_required_market(
        request: SimulationRequest,
        policy: HybridGroundingPolicy,
    ) -> SimulationRequest:
        """Resolve safe country expressions and reject ambiguous research markets."""

        if not policy.research_required:
            return request
        context = request.business_context
        scope = context.market_scope if context else None
        if not scope and context and str(context.location or "").strip():
            inferred_scope = resolve_market_expression(str(context.location))
            if (
                inferred_scope.resolved_scope.countries
                and not inferred_scope.confirmation.required
            ):
                context = context.model_copy(update={"market_scope": inferred_scope})
                request = request.model_copy(update={"business_context": context})
                scope = inferred_scope
        if (
            not scope
            or not scope.resolved_scope.countries
            or (scope.confirmation.required and not scope.confirmation.confirmed)
        ):
            raise ValueError(
                "Required research needs a country-resolved, confirmed market_scope; "
                "a city-only or ambiguous business_context.location is insufficient"
            )
        return request

    @staticmethod
    def _validate_required_synthetic_cohort(
        request: SimulationRequest,
        result: SimulationResponse,
    ) -> None:
        """Required research cannot silently publish a partial simulated cohort."""

        stakeholders = request.questions_data.stakeholders if request.questions_data else {}
        planned = sum(len(group or []) for group in stakeholders.values()) * int(
            request.config.people_per_stakeholder
        )
        people = list(result.people or [])
        interviews = list(result.interviews or [])
        person_ids = [str(person.id or "") for person in people]
        interview_person_ids = [str(item.person_id or "") for item in interviews]
        complete = (
            planned > 0
            and len(people) == planned
            and len(interviews) == planned
            and all(person_ids)
            and len(set(person_ids)) == planned
            and set(interview_person_ids) == set(person_ids)
            and len(set(interview_person_ids)) == planned
        )
        if not complete:
            raise RuntimeError(
                "Required synthetic cohort incomplete "
                f"(planned={planned}; personas={len(people)}; "
                f"interviews={len(interviews)}; covered_people="
                f"{len(set(interview_person_ids) & set(person_ids))})"
            )

    @staticmethod
    def request_hash(
        request: SimulationRequest,
        outputs: HybridOutputs,
        task_context: Optional[OrqalyTaskContext] = None,
        agent_candidates: Optional[list[OrqalyAgentCandidate]] = None,
        research_mode: HybridResearchMode = HybridResearchMode.SYNTHETIC_ONLY,
        grounding_policy: Optional[HybridGroundingPolicy] = None,
    ) -> str:
        policy = grounding_policy or HybridGroundingPolicy(required=False)
        payload = {
            "simulation": request.model_dump(mode="json"),
            "outputs": outputs.model_dump(mode="json"),
            "task_context": task_context.model_dump(mode="json") if task_context else None,
            "agent_candidates": [item.model_dump(mode="json") for item in (agent_candidates or [])],
            "research_mode": research_mode.value,
            "grounding_policy": policy.model_dump(mode="json"),
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def validate_callback_url(callback_url: Optional[str]) -> None:
        """Reject unsafe callback destinations before a job is persisted."""
        if not callback_url:
            return
        parsed = urlparse(callback_url)
        environment = os.getenv("ENVIRONMENT", "development").lower()
        if parsed.scheme not in ({"https"} if environment == "production" else {"https", "http"}):
            raise ValueError("Callback URL must use HTTPS in production")
        if not parsed.hostname:
            raise ValueError("Callback URL must include a hostname")
        host = parsed.hostname.lower()
        if host in {"localhost", "localhost.localdomain"} and environment == "production":
            raise ValueError("Callback URL cannot target localhost in production")
        try:
            address = ipaddress.ip_address(host)
            if environment == "production" and (
                address.is_private
                or address.is_loopback
                or address.is_link_local
                or address.is_reserved
            ):
                raise ValueError("Callback URL cannot target a private address")
        except ValueError as exc:
            # A hostname is expected. Re-raise only validation errors generated above.
            if str(exc).startswith("Callback URL"):
                raise

        if environment == "production":
            allowed_hosts = {
                value.strip().lower()
                for value in os.getenv("AXWISE_WEBHOOK_ALLOWED_HOSTS", "").split(",")
                if value.strip()
            }
            if not allowed_hosts or host not in allowed_hosts:
                raise ValueError("Callback host is not allowlisted")

    def enqueue(
        self,
        request: SimulationRequest,
        outputs: HybridOutputs,
        user: User,
        external_org_id: str,
        external_user_id: str,
        idempotency_key: str,
        request_id: str,
        task_context: Optional[OrqalyTaskContext] = None,
        agent_candidates: Optional[list[OrqalyAgentCandidate]] = None,
        research_mode: HybridResearchMode = HybridResearchMode.SYNTHETIC_ONLY,
        grounding_policy: Optional[HybridGroundingPolicy] = None,
    ) -> Tuple[PipelineRun, bool]:
        """Persist a new hybrid run or return the matching idempotent run."""
        required_output_flags = {"empirical_personas": outputs.empirical_personas}
        if outputs.research_bundle:
            required_output_flags.update(
                {
                    "market_sources": outputs.market_sources,
                    "market_claims": outputs.market_claims,
                    "synthetic_participants": outputs.synthetic_participants,
                    "interviews": outputs.interviews,
                }
            )
        missing_outputs = [
            name for name, enabled in required_output_flags.items() if not enabled
        ]
        if missing_outputs:
            raise ValueError(
                "Enhanced async runs require outputs: " + ", ".join(missing_outputs)
            )
        if outputs.persona_resolution and not task_context:
            raise ValueError("Persona resolution requires task_context")
        policy = grounding_policy or HybridGroundingPolicy(required=False)
        request = self._with_resolved_required_market(request, policy)
        if research_mode == HybridResearchMode.SYNTHETIC_ONLY and policy.required:
            raise ValueError("Synthetic-only research cannot require market grounding")
        if policy.required:
            context = request.business_context
            if (
                context
                and context.market_scope
                and context.market_scope.confirmation.required
                and not context.market_scope.confirmation.confirmed
            ):
                raise ValueError("Required grounding needs confirmed market-scope membership")
            has_location = bool(context and str(context.location or "").strip())
            has_confirmed_scope = bool(
                context
                and context.market_scope
                and context.market_scope.resolved_scope.countries
                and (
                    not context.market_scope.confirmation.required
                    or context.market_scope.confirmation.confirmed
                )
            )
            resolved_location = (
                resolve_market_scope(str(context.location or ""))
                if has_location
                else None
            )
            location_has_country = bool(
                resolved_location and resolved_location.country_code
            )
            if not has_confirmed_scope and not location_has_country:
                raise ValueError(
                    "Required grounding needs a country-qualified location or a "
                    "confirmed market_scope; city-only locations cannot authorize a country"
                )
        self.validate_callback_url(request.callback_url)
        request_hash = self.request_hash(
            request,
            outputs,
            task_context,
            agent_candidates,
            research_mode,
            policy,
        )
        session = self.session_factory()
        try:
            existing = (
                session.query(PipelineRun)
                .filter(
                    PipelineRun.partner_id == PARTNER_ID,
                    PipelineRun.external_org_id == external_org_id,
                    PipelineRun.external_user_id == external_user_id,
                    PipelineRun.idempotency_key == idempotency_key,
                )
                .first()
            )
            if existing:
                if existing.request_hash != request_hash:
                    raise ValueError("Idempotency key was reused with a different request")
                session.expunge(existing)
                return existing, True

            run = PipelineRun(
                job_id=f"hybrid-{uuid.uuid4()}",
                simulation_id=str(uuid.uuid4()),
                user_id=user.user_id,
                status="queued",
                created_at=datetime.now(timezone.utc),
                business_context=request.business_context.model_dump(mode="json"),
                partner_id=PARTNER_ID,
                external_org_id=external_org_id,
                external_user_id=external_user_id,
                pipeline_mode="hybrid_a_plus_b",
                current_stage="queued",
                progress_percentage=0,
                request_id=request_id,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                request_payload={
                    "simulation": request.model_dump(mode="json"),
                    "task_context": task_context.model_dump(mode="json") if task_context else None,
                    "agent_candidates": [
                        item.model_dump(mode="json") for item in (agent_candidates or [])
                    ],
                    "research_mode": research_mode.value,
                    "grounding_policy": policy.model_dump(mode="json"),
                },
                requested_outputs=outputs.model_dump(mode="json"),
                callback_config=(
                    {"url": request.callback_url, "events": ["run.completed", "run.failed"]}
                    if request.callback_url
                    else None
                ),
                attempt_count=0,
                updated_at=datetime.now(timezone.utc),
            )
            session.add(run)
            session.commit()
            session.refresh(run)
            session.expunge(run)
            return run, False
        except IntegrityError:
            session.rollback()
            existing = (
                session.query(PipelineRun)
                .filter(
                    PipelineRun.partner_id == PARTNER_ID,
                    PipelineRun.external_org_id == external_org_id,
                    PipelineRun.external_user_id == external_user_id,
                    PipelineRun.idempotency_key == idempotency_key,
                )
                .first()
            )
            if existing and existing.request_hash == request_hash:
                session.expunge(existing)
                return existing, True
            raise ValueError("Idempotency key was reused with a different request")
        finally:
            session.close()

    def get_run_for_tenant(
        self,
        job_id: str,
        user_id: str,
        external_org_id: str,
        external_user_id: str | None = None,
    ) -> Optional[PipelineRun]:
        session = self.session_factory()
        try:
            query = session.query(PipelineRun).filter(
                PipelineRun.job_id == job_id,
                PipelineRun.partner_id == PARTNER_ID,
                PipelineRun.external_org_id == external_org_id,
                PipelineRun.user_id == user_id,
            )
            if external_user_id is not None:
                query = query.filter(PipelineRun.external_user_id == external_user_id)
            run = query.first()
            if run:
                session.expunge(run)
            return run
        finally:
            session.close()

    def cancel_for_tenant(
        self,
        job_id: str,
        user_id: str,
        external_org_id: str,
        external_user_id: str | None = None,
        reason: str = "cancelled by tenant",
    ) -> Optional[PipelineRun]:
        """Stop a non-terminal job through the same tenant boundary as retrieval."""
        session = self.session_factory()
        try:
            query = session.query(PipelineRun).filter(
                PipelineRun.job_id == job_id,
                PipelineRun.partner_id == PARTNER_ID,
                PipelineRun.external_org_id == external_org_id,
                PipelineRun.user_id == user_id,
            )
            if external_user_id is not None:
                query = query.filter(PipelineRun.external_user_id == external_user_id)
            run = query.first()
            if not run:
                return None
            if run.status in TERMINAL_STATUSES:
                raise ValueError("Hybrid research run is already terminal")
            now = datetime.now(timezone.utc)
            run.status = "cancelled"
            run.current_stage = "cancelled"
            run.error = reason[:4000]
            run.completed_at = now
            run.updated_at = now
            session.commit()
            session.refresh(run)
            session.expunge(run)
            return run
        finally:
            session.close()

    async def process_next(self) -> Optional[str]:
        """Claim one queued hybrid job; suitable for the standalone worker."""
        session = self.session_factory()
        try:
            query = (
                session.query(PipelineRun)
                .filter(
                    PipelineRun.pipeline_mode == "hybrid_a_plus_b",
                    PipelineRun.status == "queued",
                )
                .order_by(PipelineRun.created_at)
            )
            try:
                run = query.with_for_update(skip_locked=True).first()
            except Exception:
                run = query.first()
            if not run:
                return None
            job_id = run.job_id
            run.status = "running"
            run.current_stage = "initializing"
            run.progress_percentage = 1
            run.started_at = run.started_at or datetime.now(timezone.utc)
            run.updated_at = datetime.now(timezone.utc)
            run.attempt_count = (run.attempt_count or 0) + 1
            session.commit()
            return job_id
        finally:
            session.close()

    def recover_stale_runs(self, stale_after_minutes: int = 30) -> int:
        """Make interrupted A+B jobs claimable by a new worker process."""
        session = self.session_factory()
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=stale_after_minutes)
            stale_runs = (
                session.query(PipelineRun)
                .filter(
                    PipelineRun.pipeline_mode == "hybrid_a_plus_b",
                    PipelineRun.status == "running",
                    PipelineRun.updated_at < cutoff,
                )
                .all()
            )
            for run in stale_runs:
                trace = list(run.execution_trace or [])
                trace.append(
                    {
                        "stage": "queued",
                        "progress_percentage": 0,
                        "message": "Recovered after an interrupted worker attempt",
                        "at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                run.status = "queued"
                run.current_stage = "queued"
                run.progress_percentage = 0
                run.started_at = None
                run.updated_at = datetime.now(timezone.utc)
                run.execution_trace = trace
            if stale_runs:
                session.commit()
            return len(stale_runs)
        finally:
            session.close()

    async def process_job(self, job_id: str, already_claimed: bool = False) -> None:
        """Run the durable A+B job. Terminal publication happens only at the end."""
        claimed = (
            await self._load_claimed_job(job_id)
            if already_claimed
            else await self._claim_specific_job(job_id)
        )
        if not claimed:
            return
        started = time.monotonic()
        failure_diagnostics: Dict[str, Any] = {}
        try:
            request = SimulationRequest.model_validate(
                claimed["request_payload"]["simulation"]
            )
            outputs = HybridOutputs.model_validate(claimed["requested_outputs"] or {})
            raw_task_context = claimed["request_payload"].get("task_context")
            task_context = (
                OrqalyTaskContext.model_validate(raw_task_context)
                if raw_task_context
                else None
            )
            agent_candidates = [
                OrqalyAgentCandidate.model_validate(item)
                for item in claimed["request_payload"].get("agent_candidates", [])
            ]
            raw_research_mode = claimed["request_payload"].get("research_mode")
            research_mode = HybridResearchMode(
                raw_research_mode or HybridResearchMode.SYNTHETIC_ONLY.value
            )
            raw_grounding_policy = claimed["request_payload"].get("grounding_policy")
            grounding_policy = HybridGroundingPolicy.model_validate(
                raw_grounding_policy
                or {
                    "required": False,
                    "source_strategy": "hybrid",
                }
            )

            # API routes parse raw questionnaires before calling the legacy
            # orchestrator, but durable jobs bypass those routes in the worker.
            # Normalize the persisted request here as well so async A+B runs do
            # not reach simulate_with_persistence with questions_data=None.
            if request.raw_questionnaire_content and not request.questions_data:
                parsed = await self.orchestrator.parse_raw_questionnaire(
                    request.raw_questionnaire_content,
                    request.config,
                )
                request = request.model_copy(
                    update={"questions_data": parsed.questions_data}
                )
            if not request.questions_data or not request.questions_data.stakeholders:
                raise RuntimeError(
                    "Hybrid research requires parsed stakeholder questions"
                )
            bundle_request = request

            grounding = {
                "market_sources": [],
                "market_claims": [],
                "structured_source_count": 0,
                "claim_count": 0,
                "company_count": 0,
            }
            if research_mode == HybridResearchMode.GROUNDED_HYBRID:
                critical_policy = (
                    task_context.critical_claim_policy if task_context else {}
                )
                mandatory_claim_classes = list(
                    critical_policy.get("mandatory_claim_classes") or []
                )
                claim_class_applicability = self._claim_class_applicability(
                    request,
                    task_context,
                    mandatory_claim_classes,
                )
                applicable_claim_classes = {
                    str(value).casefold()
                    for value in claim_class_applicability.get(
                        "applicable_claim_classes", []
                    )
                    if value
                }
                requested_country_codes = self._requested_country_codes(request, {})
                if not requested_country_codes and request.business_context:
                    raw_location = str(
                        request.business_context.location or ""
                    ).strip()
                    if raw_location:
                        inferred_scope = resolve_market_expression(raw_location)
                        if (
                            inferred_scope.resolved_scope.countries
                            and not inferred_scope.confirmation.required
                        ):
                            requested_country_codes = [
                                str(country.country_code).upper()
                                for country in inferred_scope.resolved_scope.countries
                            ]
                topic_seed_contract = self._topic_seed_contract(
                    request,
                    task_context,
                    requested_country_codes,
                )
                topic_market_scope_contract = self._topic_market_scope_contract(
                    request,
                    requested_country_codes,
                )
                topic_alias_expansion = None
                if topic_seed_contract and topic_market_scope_contract:
                    try:
                        expected_alias_expansion = (
                            build_expected_trusted_topic_alias_expansion(
                                topic_seed_contract,
                                topic_market_scope_contract,
                            )
                        )
                        topic_alias_expansion = (
                            expected_alias_expansion.model_dump(mode="json")
                            if expected_alias_expansion is not None
                            else None
                        )
                    except (TypeError, ValueError):
                        topic_seed_contract = None
                        topic_market_scope_contract = None
                topic_contract_required = bool(
                    {"official_statistic", "observed_primary_market"}
                    & applicable_claim_classes
                )
                if (
                    topic_contract_required
                    and (not topic_seed_contract or not topic_market_scope_contract)
                ):
                    failure_diagnostics = {
                        "contract": "sanitized_grounding_failure_v1",
                        "critical_status": "blocked",
                        "missing_claim_classes": sorted(
                            {"official_statistic", "observed_primary_market"}
                            & applicable_claim_classes
                        ),
                        "blocked_reason_counts": {
                            "topic_contract_missing_or_invalid": 1
                        },
                    }
                    raise RuntimeError(
                        "Applicable topic-bound evidence requires a valid immutable "
                        "goal and confirmed-market topic contract"
                    )
                if request.business_context:
                    # Acquisition reads this data-only contract before any
                    # model output exists. It cannot be weakened by a search
                    # or synthesis model omitting a difficult evidence class.
                    acquisition_context = dict(
                        request.business_context.grounding_context or {}
                    )
                    acquisition_context["critical_claim_acquisition"] = {
                        "requested_claim_classes": mandatory_claim_classes,
                        "applicable_claim_classes": claim_class_applicability.get(
                            "applicable_claim_classes", []
                        ),
                        "applicability_reasons": claim_class_applicability.get(
                            "applicability_reasons", {}
                        ),
                        "research_prd_type": (
                            task_context.research_prd_type
                            if task_context
                            else None
                        ),
                    }
                    if topic_seed_contract:
                        acquisition_context["critical_claim_acquisition"][
                            "topic_seed_contract"
                        ] = topic_seed_contract
                        acquisition_context["critical_claim_acquisition"][
                            "topic_market_scope_contract"
                        ] = topic_market_scope_contract
                        if topic_alias_expansion is not None:
                            acquisition_context["critical_claim_acquisition"][
                                "topic_alias_expansion"
                            ] = topic_alias_expansion
                    request = request.model_copy(
                        update={
                            "business_context": request.business_context.model_copy(
                                update={"grounding_context": acquisition_context}
                            )
                        }
                    )
                expected_topic_seed_contract = topic_seed_contract
                expected_topic_market_scope_contract = topic_market_scope_contract
                expected_topic_alias_expansion = topic_alias_expansion
                await self._set_stage(
                    job_id,
                    "grounding_market",
                    3,
                    "Grounding the regional market with registry and Google sources",
                )
                try:
                    grounding = await self.grounding(request, grounding_policy)
                except Exception as exc:
                    raise RuntimeError("Regional market grounding failed") from exc
                if topic_contract_required:
                    returned_topic_seed = grounding.get("topic_seed_contract")
                    returned_topic_scope = grounding.get(
                        "topic_market_scope_contract"
                    )
                    returned_topic_alias_expansion = grounding.get(
                        "topic_alias_expansion"
                    )
                    if (
                        not isinstance(returned_topic_seed, dict)
                        or returned_topic_seed.get("seed_sha256")
                        != expected_topic_seed_contract.get("seed_sha256")
                        or returned_topic_seed != expected_topic_seed_contract
                        or returned_topic_scope
                        != expected_topic_market_scope_contract
                        or returned_topic_alias_expansion
                        != expected_topic_alias_expansion
                    ):
                        failure_diagnostics = {
                            "contract": "sanitized_grounding_failure_v1",
                            "critical_status": "blocked",
                            "missing_claim_classes": sorted(
                                {"official_statistic", "observed_primary_market"}
                                & applicable_claim_classes
                            ),
                            "blocked_reason_counts": {
                                "topic_contract_missing_or_invalid": 1
                            },
                        }
                        raise RuntimeError(
                            "Grounding omitted or replaced the immutable topic lifecycle"
                        )
                structured_sources = valid_structured_market_sources(
                    grounding, grounding_policy
                )
                valid_source_ids = {
                    str(item["source_id"])
                    for item in structured_sources
                    if item.get("source_id")
                }
                structured_claims = []
                for claim in grounding.get("market_claims") or []:
                    if not isinstance(claim, dict):
                        continue
                    source_ids = [
                        str(value)
                        for value in (claim.get("source_ids") or [])
                        if str(value) in valid_source_ids
                    ]
                    if source_ids:
                        structured_claims.append({**claim, "source_ids": source_ids})
                grounding = {
                    **grounding,
                    "market_sources": structured_sources,
                    "market_claims": structured_claims,
                    "structured_source_count": len(structured_sources),
                    "claim_count": len(structured_claims),
                }
                failure_diagnostics = self._sanitized_grounding_diagnostics(grounding)
                structured_source_count = len(structured_sources)
                blocked_cells = [
                    row
                    for row in grounding.get("cell_coverage") or []
                    if isinstance(row, dict) and row.get("status") != "complete"
                ]
                if grounding_policy.required and blocked_cells:
                    blocked = ",".join(
                        str(row.get("cell_id") or "unknown") for row in blocked_cells
                    )[:500]
                    raise RuntimeError(
                        "Required multi-market grounding did not satisfy every country cell "
                        f"(blocked_cells={blocked})"
                    )
                if (
                    grounding_policy.required
                    and structured_source_count
                    < grounding_policy.minimum_structured_sources
                ):
                    diagnostics = grounding.get("routing_diagnostics") or {}
                    providers = ",".join(
                        str(row.get("provider"))
                        for row in diagnostics.get("providers") or []
                        if isinstance(row, dict) and row.get("provider")
                    )[:300]
                    rejected = len(diagnostics.get("rejected_cross_market") or [])
                    raise RuntimeError(
                        "Required market grounding produced no sufficient structured real "
                        f"sources (market={diagnostics.get('requested_location') or 'unknown'}; "
                        f"accepted={structured_source_count}; required="
                        f"{grounding_policy.minimum_structured_sources}; providers="
                        f"{providers or 'none'}; cross_market_rejected={rejected})"
                    )
                if grounding_policy.required and not structured_claims:
                    raise RuntimeError(
                        "Required market grounding produced no source-linked market claims"
                    )
            elif grounding_policy.required:
                raise RuntimeError("Required market grounding cannot run in synthetic-only mode")

            critical_policy = (
                task_context.critical_claim_policy if task_context else {}
            )
            if critical_policy.get("required"):
                if research_mode != HybridResearchMode.GROUNDED_HYBRID:
                    raise RuntimeError(
                        "Critical-claim verification requires grounded research"
                    )
                await self._set_stage(
                    job_id,
                    "verifying_critical_claims",
                    4,
                    "Verifying current material claims against direct sources",
                )
                mandatory_claim_classes = list(
                    critical_policy.get("mandatory_claim_classes") or []
                )
                cell_critical_quality = self._evaluate_country_cell_claims(
                    {
                        **grounding,
                        "topic_seed_contract": expected_topic_seed_contract,
                        "topic_market_scope_contract": (
                            expected_topic_market_scope_contract
                        ),
                        "topic_alias_expansion": expected_topic_alias_expansion,
                    },
                    critical_policy=critical_policy,
                    claim_class_applicability=claim_class_applicability,
                )
                critical_quality = evaluate_critical_claims(
                    grounding,
                    self._requested_country_codes(request, grounding),
                    freshness_days=int(critical_policy.get("freshness_days") or 120),
                    freshness_by_class=(
                        critical_policy.get("freshness_by_class") or {}
                    ),
                    mandatory_claim_classes=mandatory_claim_classes,
                    claim_class_applicability=(
                        claim_class_applicability
                        if research_mode == HybridResearchMode.GROUNDED_HYBRID
                        else self._claim_class_applicability(
                            request,
                            task_context,
                            mandatory_claim_classes,
                        )
                    ),
                    topic_seed_contract=expected_topic_seed_contract,
                    topic_market_scope_contract=(
                        expected_topic_market_scope_contract
                    ),
                    topic_alias_expansion=expected_topic_alias_expansion,
                )
                grounding = {
                    **grounding,
                    "critical_claim_quality": critical_quality,
                    "cell_critical_claim_quality": cell_critical_quality,
                }
                # Structured cells/offers were independently re-derived above.
                # Never retain the private full document/raw HTML beyond the
                # quality boundary, including fail-closed runs.
                grounding = _strip_private_grounding_artifacts(grounding)
                failure_diagnostics = self._sanitized_grounding_diagnostics(grounding)
                blocked_critical_cells = [
                    row
                    for row in cell_critical_quality
                    if row.get("status") != "passed"
                ]
                if critical_policy.get("fail_closed", True) and blocked_critical_cells:
                    cell_summary = ",".join(
                        f"{row.get('cell_id')}:{'|'.join(row.get('missing_claim_classes') or []) or 'blocked'}"
                        for row in blocked_critical_cells
                    )[:1000]
                    raise RuntimeError(
                        "Required current material claims were not verified in every "
                        f"country cell (blocked_cells={cell_summary})"
                    )
                if (
                    critical_policy.get("fail_closed", True)
                    and critical_quality.get("status") != "passed"
                ):
                    reasons = ",".join(
                        str(item.get("reason") or "unknown")
                        for item in critical_quality.get("blocked_claims") or []
                    )[:1000]
                    raise RuntimeError(
                        "Required current material claims were not verified "
                        f"(reasons={reasons or 'unknown'})"
                    )
                grounding = await complete_deferred_grounding_enrichment(
                    grounding,
                    grounding_policy,
                )
                grounding = _strip_private_grounding_artifacts(grounding)
            # Non-critical grounded runs may still carry evaluator-only fetch
            # anchors. Scrub them before composing provider/user payloads or
            # any result/bundle persistence.
            grounding = _strip_private_grounding_artifacts(grounding)
            if research_mode == HybridResearchMode.GROUNDED_HYBRID:
                request = request_with_grounding(request, grounding)

            # The legacy orchestrator owns Pipeline B progress. It must not publish
            # a terminal result or callback while the empirical stage is pending.
            await self._set_stage(job_id, "generating_people", 5, "Generating simulated people")
            pipeline_b_request = request.model_copy(update={"callback_url": None})
            result = await self.orchestrator.simulate_with_persistence(
                pipeline_b_request,
                user_id=claimed["user_id"],
                simulation_id=claimed["simulation_id"],
                finalize=False,
            )
            if not result.success:
                raise RuntimeError(result.message)
            if grounding_policy.research_required:
                self._validate_required_synthetic_cohort(request, result)
            self._ensure_active(job_id)

            await self._set_stage(
                job_id,
                "empirical_remapping",
                70,
                "Constructing evidence-grounded personas",
            )
            result = await self.enrichment(result, request)
            self._ensure_active(job_id)
            result.data = {
                **(result.data or {}),
                "market_grounding": grounding,
            }
            result.metadata = {
                **(result.metadata or {}),
                "research_mode": research_mode.value,
                "structured_market_source_count": int(
                    grounding.get("structured_source_count")
                    or len(grounding.get("market_sources") or [])
                ),
                "market_claim_count": len(grounding.get("market_claims") or []),
            }

            if outputs.persona_resolution:
                await self._set_stage(
                    job_id,
                    "resolving_task_personas",
                    86,
                    "Matching the customer persona to the execution persona",
                )
                if not task_context:
                    raise RuntimeError("Persona resolution requires task_context")
                persona_resolution = resolve_orqaly_personas(
                    result.empirical_personas or [], task_context, agent_candidates
                )
                result.data = {
                    **(result.data or {}),
                    "persona_resolution": persona_resolution,
                }
                self._ensure_active(job_id)

            await self._set_stage(
                job_id,
                "auditing_evidence",
                90,
                "Validating exact evidence offsets",
            )
            metadata = result.metadata or {}
            if metadata.get("hybrid_status") != "completed":
                raise RuntimeError("Hybrid evidence audit did not complete")

            await self._set_stage(
                job_id,
                "persisting_analysis",
                94,
                "Persisting hybrid research deliverables",
            )
            analysis_result_id = self._create_canonical_analysis_result(
                result, request, claimed["user_id"], task_context
            )

            warning = None
            research_prd = {
                "status": "not_requested",
                "analysis_result_id": analysis_result_id,
                "cached_prd_id": None,
                "prd_type": outputs.prd.document_intent,
                "content_hash": None,
                "content": None,
            }
            if outputs.prd.enabled:
                await self._set_stage(job_id, "generating_prd", 96, "Generating PRD")
                research_prd, warning = await self._generate_prd(
                    analysis_result_id, request, outputs, claimed["user_id"]
                )
                if research_prd["status"] == "failed" and outputs.prd.required:
                    raise RuntimeError(warning or "Required PRD generation failed")

            if outputs.research_bundle:
                bundle = build_research_bundle(
                    job_id=job_id,
                    request=bundle_request,
                    requested_outputs=outputs.model_dump(mode="json"),
                    result=result,
                    grounding=grounding,
                    research_mode=research_mode,
                    grounding_policy=grounding_policy,
                    analysis_result_id=analysis_result_id,
                    research_prd=research_prd,
                    task_context=(
                        task_context.model_dump(mode="json") if task_context else None
                    ),
                    agent_candidates=[
                        item.model_dump(mode="json") for item in agent_candidates
                    ],
                    performance=self._run_performance(job_id),
                )
                result.data = {
                    **(result.data or {}),
                    "research_bundle": bundle,
                }
                self._attach_bundle_to_analysis(
                    analysis_result_id, bundle, claimed["user_id"]
                )

            terminal_status = "completed_with_warnings" if warning else "completed"
            self._persist_success(
                job_id,
                result,
                analysis_result_id,
                terminal_status,
                research_prd["status"],
                warning,
                time.monotonic() - started,
            )

            # In-memory compatibility and any legacy callback happen only after
            # the durable hybrid record is terminal.
            await self.orchestrator.finalize_hybrid_simulation(result)
            await self._deliver_terminal_webhook(job_id, terminal_status)
        except HybridRunCancelled:
            logger.info("Hybrid A+B run was cancelled: %s", job_id)
            return
        except Exception as exc:
            logger.exception("Hybrid A+B run failed: %s", job_id)
            self._persist_failure(
                job_id,
                str(exc),
                time.monotonic() - started,
                diagnostics=failure_diagnostics,
            )
            await self._deliver_terminal_webhook(job_id, "failed")

    async def _claim_specific_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        session = self.session_factory()
        try:
            run = session.query(PipelineRun).filter(PipelineRun.job_id == job_id).first()
            if not run or run.status in TERMINAL_STATUSES:
                return None
            if run.status == "running" and run.started_at:
                return None
            run.status = "running"
            run.current_stage = "initializing"
            run.progress_percentage = max(run.progress_percentage or 0, 1)
            run.started_at = run.started_at or datetime.now(timezone.utc)
            run.updated_at = datetime.now(timezone.utc)
            run.attempt_count = (run.attempt_count or 0) + 1
            snapshot = {
                "user_id": run.user_id,
                "simulation_id": run.simulation_id,
                "request_payload": run.request_payload,
                "requested_outputs": run.requested_outputs,
            }
            session.commit()
            return snapshot
        finally:
            session.close()

    def _ensure_active(self, job_id: str) -> None:
        session = self.session_factory()
        try:
            run = session.query(PipelineRun).filter(PipelineRun.job_id == job_id).first()
            if not run or run.status == "cancelled":
                raise HybridRunCancelled(job_id)
            if run.status in TERMINAL_STATUSES:
                raise RuntimeError(f"Hybrid job became terminal during processing: {run.status}")
        finally:
            session.close()

    async def _load_claimed_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        session = self.session_factory()
        try:
            run = (
                session.query(PipelineRun)
                .filter(
                    PipelineRun.job_id == job_id,
                    PipelineRun.status == "running",
                )
                .first()
            )
            if not run:
                return None
            return {
                "user_id": run.user_id,
                "simulation_id": run.simulation_id,
                "request_payload": run.request_payload,
                "requested_outputs": run.requested_outputs,
            }
        finally:
            session.close()

    async def _set_stage(
        self, job_id: str, stage: str, progress: int, message: str
    ) -> None:
        session = self.session_factory()
        try:
            run = session.query(PipelineRun).filter(PipelineRun.job_id == job_id).first()
            if not run or run.status in TERMINAL_STATUSES:
                return
            run.current_stage = stage
            run.progress_percentage = max(run.progress_percentage or 0, progress)
            trace = [dict(row) for row in (run.execution_trace or [])]
            now = datetime.now(timezone.utc)
            if trace and trace[-1].get("duration_ms") is None:
                try:
                    previous = _utc(datetime.fromisoformat(str(trace[-1]["at"])))
                    trace[-1]["duration_ms"] = max(
                        0, int((now - previous).total_seconds() * 1000)
                    )
                except (KeyError, TypeError, ValueError):
                    trace[-1]["duration_ms"] = None
            trace.append(
                {
                    "stage": stage,
                    "progress_percentage": run.progress_percentage,
                    "message": message,
                    "at": now.isoformat(),
                    "duration_ms": None,
                }
            )
            run.execution_trace = trace
            run.updated_at = datetime.now(timezone.utc)
            session.commit()
        finally:
            session.close()

    @staticmethod
    def _finalize_stage_trace(run: PipelineRun, now: datetime) -> Dict[str, int]:
        trace = [dict(row) for row in (run.execution_trace or [])]
        if trace and trace[-1].get("duration_ms") is None:
            try:
                previous = _utc(datetime.fromisoformat(str(trace[-1]["at"])))
                trace[-1]["duration_ms"] = max(
                    0, int((now - previous).total_seconds() * 1000)
                )
            except (KeyError, TypeError, ValueError):
                trace[-1]["duration_ms"] = None
        run.execution_trace = trace
        durations: Dict[str, int] = {}
        for row in trace:
            duration = row.get("duration_ms")
            stage = str(row.get("stage") or "unknown")
            if isinstance(duration, int):
                durations[stage] = durations.get(stage, 0) + duration
        return durations

    @staticmethod
    def _stage_performance(run: PipelineRun, now: datetime) -> Dict[str, Any]:
        trace = [dict(row) for row in (run.execution_trace or [])]
        durations: Dict[str, int] = {}
        normalized_trace: List[Dict[str, Any]] = []
        for index, row in enumerate(trace):
            duration = row.get("duration_ms")
            if duration is None and index == len(trace) - 1:
                try:
                    started = _utc(datetime.fromisoformat(str(row["at"])))
                    duration = max(0, int((now - started).total_seconds() * 1000))
                except (KeyError, TypeError, ValueError):
                    duration = None
            stage = str(row.get("stage") or "unknown")
            if isinstance(duration, int):
                durations[stage] = durations.get(stage, 0) + duration
            normalized_trace.append(
                {
                    "stage": stage,
                    "progress_percentage": int(row.get("progress_percentage") or 0),
                    "at": row.get("at"),
                    "duration_ms": duration,
                }
            )
        started_at = run.started_at or run.created_at
        elapsed_ms = (
            max(0, int((now - _utc(started_at)).total_seconds() * 1000))
            if started_at
            else None
        )
        return {
            "elapsed_ms": elapsed_ms,
            "current_stage": run.current_stage,
            "progress_percentage": int(run.progress_percentage or 0),
            "stage_durations_ms": durations,
            "stage_trace": normalized_trace[-25:],
        }

    def _run_performance(self, job_id: str) -> Dict[str, Any]:
        session = self.session_factory()
        try:
            run = session.query(PipelineRun).filter(PipelineRun.job_id == job_id).first()
            if not run:
                return {}
            terminal_time = (
                _utc(run.completed_at)
                if run.status in TERMINAL_STATUSES and run.completed_at
                else datetime.now(timezone.utc)
            )
            return self._stage_performance(run, terminal_time)
        finally:
            session.close()

    def _create_canonical_analysis_result(
        self,
        result: SimulationResponse,
        request: SimulationRequest,
        user_id: str,
        task_context: Optional[OrqalyTaskContext] = None,
    ) -> int:
        """Persist hybrid deliverables in the existing analysis/PRD data model."""
        session = self.session_factory()
        try:
            interview_text = "\n\n".join(
                response.response
                for interview in result.interviews or []
                for response in interview.responses
            )
            goal_contract = {
                "title": task_context.title if task_context else None,
                "description": task_context.description if task_context else None,
                "desired_outcome": (
                    task_context.desired_outcome if task_context else None
                ),
                "constraints": task_context.constraints if task_context else [],
                "required_execution_roles": (
                    task_context.required_execution_roles if task_context else []
                ),
                "research_prd_type": (
                    task_context.research_prd_type if task_context else None
                ),
                "customer_role_contract": (
                    task_context.customer_role_contract if task_context else {}
                ),
                "critical_claim_policy": (
                    task_context.critical_claim_policy if task_context else {}
                ),
                "business_context": (
                    request.business_context.model_dump(mode="json")
                    if request.business_context
                    else None
                ),
            }
            original_text = (
                "AUTHORITATIVE ORQALY GOAL CONTRACT\n"
                "Use this contract as the scope boundary. Interview evidence may "
                "refine the customer understanding but must not replace or expand "
                "the requested deliverables.\n"
                f"{json.dumps(goal_contract, ensure_ascii=False, sort_keys=True)}\n\n"
                "SYNTHETIC INTERVIEW CORPUS\n"
                f"{interview_text}"
            )
            interview_data = InterviewData(
                user_id=user_id,
                filename=f"hybrid_simulation_{result.simulation_id}.txt",
                input_type="hybrid_simulation",
                original_data=original_text,
            )
            session.add(interview_data)
            session.flush()

            insights = result.simulation_insights
            insight_items = []
            for recommendation in result.recommendations or []:
                insight_items.append({"title": recommendation, "description": recommendation})
            analysis_payload = {
                "status": "completed",
                "source_type": "hybrid_simulation",
                "simulation_id": result.simulation_id,
                "pipeline": "hybrid_a_plus_b",
                "industry": request.business_context.industry if request.business_context else None,
                "original_text": original_text,
                "themes": [
                    {"name": theme, "frequency": 1, "keywords": [], "statements": []}
                    for theme in ((insights.key_themes if insights else []) or [])
                ],
                "patterns": [
                    pattern.model_dump(mode="json")
                    for pattern in (result.persona_patterns or [])
                ],
                "insights": insight_items,
                "personas": result.empirical_personas or [],
                "persona_resolution": (result.data or {}).get("persona_resolution"),
                "research_prd_type": (
                    task_context.research_prd_type
                    if task_context and task_context.research_prd_type
                    else None
                ),
                "critical_claim_quality": (
                    ((result.data or {}).get("market_grounding") or {}).get(
                        "critical_claim_quality"
                    )
                ),
                "market_grounding": (result.data or {}).get("market_grounding"),
                "simulation_insights": (
                    insights.model_dump(mode="json") if insights else None
                ),
                "source": {
                    "simulation_id": result.simulation_id,
                    "hybrid_metadata": result.metadata or {},
                },
            }
            analysis_result = AnalysisResult(
                data_id=interview_data.id,
                results=analysis_payload,
                llm_provider="enhanced_gemini",
                llm_model="hybrid_a_plus_b",
                status="completed",
                completed_at=datetime.now(timezone.utc),
            )
            session.add(analysis_result)
            session.commit()
            return analysis_result.result_id
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    async def _generate_prd(
        self,
        analysis_result_id: int,
        request: SimulationRequest,
        outputs: HybridOutputs,
        user_id: str,
    ) -> Tuple[Dict[str, Any], Optional[str]]:
        session = self.session_factory()
        try:
            analysis = (
                session.query(AnalysisResult)
                .filter(AnalysisResult.result_id == analysis_result_id)
                .first()
            )
            user = session.query(User).filter(User.user_id == user_id).first()
            if not analysis or not user:
                return (
                    self._prd_metadata(
                        "failed", analysis_result_id, outputs.prd.document_intent
                    ),
                    "Hybrid analysis result is unavailable for PRD generation",
                )
            raw_intent = (
                (analysis.results or {}).get("research_prd_type")
                or outputs.prd.type
            )
            semantic_intent = normalize_research_prd_type(raw_intent)
            if (
                raw_intent
                and str(raw_intent) not in SUPPORTED_RESEARCH_PRD_TYPES
                and str(raw_intent) not in {"operational", "technical", "both"}
            ):
                raise ValueError(f"Unsupported research PRD type: {raw_intent}")
            critical_quality = (analysis.results or {}).get(
                "critical_claim_quality"
            ) or {}
            if (
                semantic_intent == COMMERCIAL_MARKET_LAUNCH
                and critical_quality.get("status") != "passed"
            ):
                raise ValueError(
                    "Commercial market-launch PRD requires passed current "
                    "critical-claim verification"
                )
            llm_service = LLMServiceFactory.create("enhanced_gemini")
            prd_service = PRDGenerationService(
                db=session, llm_service=llm_service, user=user
            )
            prd = await prd_service.generate_prd(
                analysis_results=analysis.results,
                prd_type=outputs.prd.storage_type,
                industry=(request.business_context.industry if request.business_context else None),
                result_id=analysis_result_id,
                document_intent=semantic_intent,
                critical_claim_quality=critical_quality,
            )
            if isinstance(prd, dict) and prd.get("error"):
                return (
                    self._prd_metadata("failed", analysis_result_id, semantic_intent),
                    str(prd["error"]),
                )
            cached = (
                session.query(CachedPRD)
                .filter(
                    CachedPRD.result_id == analysis_result_id,
                    CachedPRD.prd_type == outputs.prd.storage_type,
                )
                .first()
            )
            return (
                self._prd_metadata(
                    "completed",
                    analysis_result_id,
                    semantic_intent,
                    content=prd,
                    cached_prd_id=(cached.id if cached else None),
                ),
                None,
            )
        except Exception as exc:
            logger.exception("PRD generation failed for hybrid analysis %s", analysis_result_id)
            return (
                self._prd_metadata(
                    "failed", analysis_result_id, outputs.prd.document_intent
                ),
                str(exc),
            )
        finally:
            session.close()

    @staticmethod
    def _prd_metadata(
        status: str,
        analysis_result_id: int,
        prd_type: str,
        *,
        content: Optional[Dict[str, Any]] = None,
        cached_prd_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        return {
            "status": status,
            "analysis_result_id": analysis_result_id,
            "cached_prd_id": cached_prd_id,
            "prd_type": prd_type,
            "content_hash": canonical_hash(content) if content is not None else None,
            "content": content,
        }

    def _attach_bundle_to_analysis(
        self, analysis_result_id: int, bundle: Dict[str, Any], user_id: str
    ) -> None:
        """Persist the immutable handoff in the same tenant-owned analysis record."""
        session = self.session_factory()
        try:
            analysis = (
                session.query(AnalysisResult)
                .join(InterviewData, InterviewData.id == AnalysisResult.data_id)
                .filter(AnalysisResult.result_id == analysis_result_id)
                .filter(InterviewData.user_id == user_id)
                .first()
            )
            if not analysis:
                raise RuntimeError(
                    "Hybrid analysis result disappeared before bundle persistence"
                )
            analysis.results = {
                **(analysis.results or {}),
                "research_bundle": bundle,
                "research_prd": bundle.get("research_prd"),
            }
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _persist_success(
        self,
        job_id: str,
        result: SimulationResponse,
        analysis_result_id: int,
        status: str,
        prd_status: str,
        warning: Optional[str],
        duration: float,
    ) -> None:
        session = self.session_factory()
        try:
            run = session.query(PipelineRun).filter(PipelineRun.job_id == job_id).first()
            simulation = (
                session.query(SimulationData)
                .filter(SimulationData.simulation_id == result.simulation_id)
                .first()
            )
            if not run or not simulation:
                raise RuntimeError("Hybrid run persistence record was not found")
            research_bundle = (
                ((result.data or {}).get("research_bundle") or {})
                if isinstance(result.data, dict)
                else {}
            )
            bundle_quality = research_bundle.get("quality") or {}
            completed_at = datetime.now(timezone.utc)
            stage_durations_ms = self._finalize_stage_trace(run, completed_at)
            summary = {
                "hybrid_status": "completed",
                "people_count": len(result.people or []),
                "interview_count": len(result.interviews or []),
                "empirical_persona_count": len(result.empirical_personas or []),
                "evidence_item_count": (result.metadata or {}).get("audited_evidence_count", 0),
                "analysis_result_id": analysis_result_id,
                "prd_status": prd_status,
                "persona_resolution_status": (
                    ((result.data or {}).get("persona_resolution") or {}).get(
                        "selection_status", "not_requested"
                    )
                ),
                "recommended_agent_id": (
                    ((((result.data or {}).get("persona_resolution") or {}).get(
                        "recommended_agent"
                    ) or {}).get("agent_id"))
                ),
                "research_bundle_version": research_bundle.get("version"),
                "research_bundle_id": research_bundle.get("bundle_id"),
                "research_bundle_hash": research_bundle.get("bundle_hash"),
                "structured_market_source_count": bundle_quality.get(
                    "structured_source_count", 0
                ),
                "market_claim_count": bundle_quality.get("claim_count", 0),
                "artifact_count": bundle_quality.get("artifact_count", 0),
                "market_cell_count": bundle_quality.get("market_cell_count", 0),
                "completed_market_cell_count": bundle_quality.get(
                    "completed_market_cell_count", 0
                ),
                "stage_durations_ms": stage_durations_ms,
            }
            run.status = status
            run.current_stage = "completed"
            run.progress_percentage = 100
            run.completed_at = completed_at
            run.updated_at = completed_at
            run.total_duration_seconds = duration
            run.dataset = result.model_dump(mode="json")
            run.result_summary = summary
            run.simulation_id = result.simulation_id
            run.analysis_id = str(analysis_result_id)
            run.persona_count = len(result.empirical_personas or [])
            run.interview_count = len(result.interviews or [])
            run.warning = warning

            simulation.empirical_personas = result.empirical_personas or []
            simulation.hybrid_metadata = result.metadata or {}
            simulation.status = "completed"
            simulation.completed_at = datetime.now(timezone.utc)
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    @staticmethod
    def _sanitized_grounding_diagnostics(grounding: Dict[str, Any]) -> Dict[str, Any]:
        safe_reason_codes = {
            "empty_or_failed",
            "unavailable",
            "provider_error",
            "timeout",
            "rate_limited",
            "captcha",
            "suspended",
            "unresponsive",
        }

        def reason_code(value: Any) -> Optional[str]:
            text = str(value or "").casefold()
            for candidate in sorted(safe_reason_codes):
                if candidate.replace("_", " ") in text or candidate in text:
                    return candidate
            if text.startswith("provider_error:"):
                return "provider_error"
            return None

        def sanitized_runtime(runtime: Dict[str, Any]) -> Dict[str, Any]:
            row = {
                key: runtime.get(key)
                for key in (
                    "route",
                    "model",
                    "status",
                    "elapsed_ms",
                    "call_count",
                    "retry_count",
                    "deadline_ms",
                    "fallback_used",
                    "http_status",
                    "result_count",
                )
                if runtime.get(key) is not None
            }
            engines = []
            for item in (runtime.get("unresponsive_engines") or [])[:20]:
                if not isinstance(item, dict):
                    continue
                engines.append(
                    {
                        "engine": re.sub(
                            r"[^a-z0-9_-]",
                            "",
                            str(item.get("engine") or "unknown").casefold(),
                        )[:40],
                        "reason_code": reason_code(item.get("reason"))
                        or "unresponsive",
                    }
                )
            if engines:
                row["unresponsive_engines"] = engines
            return row

        def sanitized_stage(value: Any) -> Dict[str, Any]:
            if not isinstance(value, dict):
                return {}
            return {
                key: value.get(key)
                for key in (
                    "status",
                    "candidate_count",
                    "publisher_count",
                    "host_count",
                    "route_count",
                    "retrieved_count",
                    "verified_count",
                    "source_count",
                    "company_count",
                    "accepted_verified_claims",
                    "cell_count",
                    "elapsed_ms",
                    "deadline_ms",
                )
                if value.get(key) is not None
            }

        routing = grounding.get("routing_diagnostics") or {}
        providers = []
        for row in (routing.get("providers") or [])[:24]:
            if not isinstance(row, dict):
                continue
            runtime = row.get("runtime") or {}
            providers.append(
                {
                    "provider": str(row.get("provider") or "")[:120],
                    "evidence_class": str(row.get("evidence_class") or "")[:80],
                    "query_id": str(row.get("query_id") or "")[:80],
                    "source_count": int(row.get("source_count") or 0),
                    "result_source_count": int(row.get("result_source_count") or 0),
                    "reason_code": reason_code(row.get("reason")),
                    "provider_error_type": re.sub(
                        r"[^A-Za-z0-9_]",
                        "",
                        str(row.get("provider_error") or ""),
                    )[:60]
                    or None,
                    "runtime": sanitized_runtime(runtime),
                }
            )
        sources = []
        for row in (grounding.get("market_sources") or [])[:24]:
            if not isinstance(row, dict):
                continue
            sources.append(
                {
                    "host": (urlparse(str(row.get("url") or "")).hostname or "")[:255],
                    "source_authority": str(row.get("source_authority") or "")[:80],
                    "authority_status": str(
                        row.get("authority_verification_status") or ""
                    )[:120],
                    "country_codes": list(row.get("country_codes") or [])[:8],
                }
            )
        critical = grounding.get("critical_claim_quality") or {}
        verified_classes = list(
            critical.get("verified_claim_classes")
            or critical.get("verified_evidence_classes")
            or []
        )[:8]
        missing_classes = list(
            critical.get("missing_claim_classes")
            or critical.get("missing_evidence_classes")
            or []
        )[:8]
        if not missing_classes:
            required_classes = set(
                critical.get("mandatory_claim_classes")
                or critical.get("applicable_claim_classes")
                or []
            )
            missing_classes = sorted(required_classes - set(verified_classes))[:8]
        blocked_reason_counts: Dict[str, int] = {}
        for row in (critical.get("blocked_claims") or [])[:100]:
            if not isinstance(row, dict):
                continue
            reason = str(row.get("reason") or "")
            reason_code_value = reason.split(":", 1)[0]
            if not re.fullmatch(r"[a-z0-9_]{1,80}", reason_code_value):
                continue
            blocked_reason_counts[reason_code_value] = (
                blocked_reason_counts.get(reason_code_value, 0) + 1
            )
        candidate_rejection_counts = {
            str(key)[:80]: max(0, int(value or 0))
            for key, value in (
                critical.get("candidate_rejection_counts") or {}
            ).items()
            if re.fullmatch(r"[a-z0-9_]{1,80}", str(key))
        }
        cell_critical = []
        for row in (grounding.get("cell_critical_claim_quality") or [])[:16]:
            if not isinstance(row, dict):
                continue
            cell_critical.append(
                {
                    "cell_id": str(row.get("cell_id") or "")[:120],
                    "country_codes": list(row.get("country_codes") or [])[:4],
                    "status": str(row.get("status") or "")[:40],
                    "verified_claim_classes": list(
                        row.get("verified_claim_classes") or []
                    )[:8],
                    "missing_claim_classes": list(
                        row.get("missing_claim_classes") or []
                    )[:8],
                    "blocked_reason_counts": {
                        str(key)[:80]: int(value or 0)
                        for key, value in (
                            row.get("blocked_reason_counts") or {}
                        ).items()
                    },
                }
            )
        attempted_sources = []
        for row in (routing.get("attempted_sources") or [])[:24]:
            if not isinstance(row, dict):
                continue
            attempted_sources.append(
                {
                    "retrieval_host": re.sub(
                        r"[^a-z0-9.-]", "", str(row.get("retrieval_host") or "").casefold()
                    )[:255],
                    "final_host": re.sub(
                        r"[^a-z0-9.-]", "", str(row.get("final_host") or "").casefold()
                    )[:255],
                    "acquisition_evidence_classes": [
                        str(value)[:80]
                        for value in row.get("acquisition_evidence_classes") or []
                    ][:4],
                    "direct_fetch_status": str(
                        row.get("direct_fetch_status") or ""
                    )[:80],
                    "jurisdiction_binding_status": str(
                        row.get("jurisdiction_binding_status") or ""
                    )[:80],
                    "authority_status": str(
                        row.get("authority_verification_status") or ""
                    )[:120],
                }
            )
        return {
            "contract": "sanitized_grounding_failure_v1",
            "required_evidence_classes": list(
                routing.get("required_evidence_classes") or []
            )[:8],
            "topic_mismatch_observation_count": min(
                10_000,
                max(0, int(routing.get("topic_mismatch_observation_count") or 0)),
            ),
            "providers": providers,
            "sources": sources,
            "attempted_sources": attempted_sources,
            "evidence_class_acquisition": {
                str(key)[:80]: {
                    metric: int(value or 0)
                    for metric, value in (counts or {}).items()
                    if metric in {
                        "attempted",
                        "retrieved",
                        "verified",
                        "claim_extracted",
                    }
                }
                for key, counts in (
                    routing.get("evidence_class_acquisition") or {}
                ).items()
                if isinstance(counts, dict)
            },
            "authority_resolution": sanitized_stage(
                routing.get("authority_resolution")
            ),
            "targeted_authority_attestation": sanitized_stage(
                routing.get("targeted_authority_attestation")
            ),
            "targeted_authority_resolution": sanitized_stage(
                routing.get("targeted_authority_resolution")
            ),
            "statutory_recovery": sanitized_stage(
                routing.get("statutory_recovery")
            ),
            "company_structuring": sanitized_stage(
                routing.get("company_structuring")
            ),
            "rejected_cross_market_source_count": len(
                routing.get("rejected_cross_market_sources") or []
            ),
            "rejected_invalid_source_count": len(
                routing.get("rejected_invalid_sources") or []
            ),
            "critical_status": critical.get("status"),
            "verified_claim_classes": verified_classes,
            "missing_claim_classes": missing_classes,
            "blocked_reason_counts": dict(
                sorted(blocked_reason_counts.items())[:16]
            ),
            # Candidate-local failures explain noisy retrieval without being
            # confused with fatal gate reasons once independent class coverage
            # is complete.
            "candidate_rejection_counts": dict(
                sorted(candidate_rejection_counts.items())[:16]
            ),
            "quarantined_count": max(
                0, int(critical.get("quarantined_count") or 0)
            ),
            "topic_contract_status": str(
                critical.get("topic_contract_status") or ""
            )[:40]
            or None,
            "topic_seed_sha256": (
                str(critical.get("topic_seed_sha256"))[:64]
                if critical.get("topic_seed_sha256")
                else (
                    str(routing.get("topic_seed_sha256"))[:64]
                    if routing.get("topic_seed_sha256")
                    else None
                )
            ),
            "cell_critical_claim_quality": cell_critical,
        }

    def _persist_failure(
        self,
        job_id: str,
        error: str,
        duration: float,
        *,
        diagnostics: Optional[Dict[str, Any]] = None,
    ) -> None:
        session = self.session_factory()
        try:
            run = session.query(PipelineRun).filter(PipelineRun.job_id == job_id).first()
            if not run:
                return
            completed_at = datetime.now(timezone.utc)
            self._finalize_stage_trace(run, completed_at)
            run.status = "failed"
            run.current_stage = "failed"
            run.error = error[:4000]
            if diagnostics:
                run.result_summary = {
                    **(run.result_summary or {}),
                    "failure_diagnostics": diagnostics,
                }
            run.completed_at = completed_at
            run.updated_at = completed_at
            run.total_duration_seconds = duration
            session.commit()
        finally:
            session.close()

    async def _deliver_terminal_webhook(self, job_id: str, status: str) -> None:
        """Deliver a signed terminal event with bounded retries when configured."""
        session = self.session_factory()
        try:
            run = session.query(PipelineRun).filter(PipelineRun.job_id == job_id).first()
            if not run or not run.callback_config or not run.callback_config.get("url"):
                return
            callback_url = run.callback_config["url"]
            secret = os.getenv("AXWISE_WEBHOOK_SIGNING_SECRET")
            if not secret:
                run.warning = self._append_warning(
                    run.warning, "Webhook skipped: signing secret is not configured"
                )
                session.commit()
                return
            event = {
                "event_id": f"evt-{uuid.uuid4()}",
                "event": "run.completed" if status.startswith("completed") else "run.failed",
                "job_id": run.job_id,
                "simulation_id": run.simulation_id,
                "status": status,
                "summary": run.result_summary or {},
                "occurred_at": datetime.now(timezone.utc).isoformat(),
            }
            body = json.dumps(event, separators=(",", ":"), sort_keys=True).encode("utf-8")
            timestamp = str(int(time.time()))
            signature = hmac.new(
                secret.encode("utf-8"), timestamp.encode("utf-8") + b"." + body, hashlib.sha256
            ).hexdigest()
            delivered = False
            async with httpx.AsyncClient() as client:
                for attempt in range(1, 4):
                    try:
                        response = await client.post(
                            callback_url,
                            content=body,
                            headers={
                                "Content-Type": "application/json",
                                "X-AxWise-Event-ID": event["event_id"],
                                "X-AxWise-Timestamp": timestamp,
                                "X-AxWise-Signature": f"v1={signature}",
                            },
                            timeout=10.0,
                        )
                        if 200 <= response.status_code < 300:
                            delivered = True
                            break
                    except httpx.HTTPError:
                        pass
                    await asyncio.sleep(0.25 * attempt)
            if not delivered:
                run.warning = self._append_warning(
                    run.warning, "Terminal webhook delivery failed after 3 attempts"
                )
            session.commit()
        finally:
            session.close()

    @staticmethod
    def _append_warning(existing: Optional[str], value: str) -> str:
        return f"{existing}; {value}" if existing else value

    @staticmethod
    def serialize_run(run: PipelineRun, include_result: bool = False) -> Dict[str, Any]:
        terminal_time = (
            _utc(run.completed_at)
            if run.status in TERMINAL_STATUSES and run.completed_at
            else datetime.now(timezone.utc)
        )
        performance = HybridRunService._stage_performance(run, terminal_time)
        data = {
            "job_id": run.job_id,
            "simulation_id": run.simulation_id,
            "analysis_result_id": int(run.analysis_id) if run.analysis_id else None,
            "status": run.status,
            "stage": run.current_stage,
            "progress_percentage": run.progress_percentage,
            "pipeline": run.pipeline_mode,
            "request_id": run.request_id,
            "attempt": run.attempt_count,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "error": run.error,
            "warning": run.warning,
            "summary": run.result_summary or {},
            "elapsed_ms": performance["elapsed_ms"],
            "stage_durations_ms": performance["stage_durations_ms"],
            "stage_trace": performance["stage_trace"],
        }
        if include_result and run.status in {"completed", "completed_with_warnings"}:
            data["result"] = run.dataset
            research_bundle = (
                (((run.dataset or {}).get("data") or {}).get("research_bundle"))
                if isinstance(run.dataset, dict)
                else None
            )
            data["research_bundle"] = research_bundle
            data["deliverables"] = {
                "analysis": (
                    {"status": "completed", "url": f"/api/results/{run.analysis_id}"}
                    if run.analysis_id
                    else None
                ),
                "prd": {
                    "status": (run.result_summary or {}).get("prd_status", "not_requested"),
                    "url": (
                        f"/api/prd/{run.analysis_id}?prd_type=both"
                        if run.analysis_id and (run.result_summary or {}).get("prd_status") == "completed"
                        else None
                    ),
                },
            }
        return data
