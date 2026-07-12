"""Durable execution service for Orqaly's asynchronous A+B research runs."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional, Tuple
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from backend.api.research.simulation_bridge.models import SimulationRequest, SimulationResponse
from backend.api.research.simulation_bridge.services.closed_loop_hybrid import (
    enrich_with_empirical_personas,
)
from backend.database import SessionLocal
from backend.models import AnalysisResult, InterviewData, PipelineRun, SimulationData, User
from backend.services.llm import LLMServiceFactory
from backend.services.processing.prd_generation_service import PRDGenerationService


logger = logging.getLogger(__name__)

PARTNER_ID = "orqaly"
TERMINAL_STATUSES = {"completed", "completed_with_warnings", "failed", "cancelled"}


class HybridRunCancelled(Exception):
    """Raised when a queued or running job was cancelled by its tenant."""


class HybridPRDOutput(BaseModel):
    enabled: bool = False
    type: str = Field(default="both", pattern="^(operational|technical|both)$")
    required: bool = False


class HybridOutputs(BaseModel):
    """Requested result deliverables for a long-running hybrid research job."""

    empirical_personas: bool = True
    insights: bool = True
    analysis_result: bool = True
    prd: HybridPRDOutput = Field(default_factory=HybridPRDOutput)


class HybridRunService:
    """Owns idempotency, stage state, persistence, and terminal hybrid delivery."""

    def __init__(
        self,
        orchestrator,
        session_factory: Callable = SessionLocal,
        enrichment=enrich_with_empirical_personas,
    ):
        self.orchestrator = orchestrator
        self.session_factory = session_factory
        self.enrichment = enrichment

    @staticmethod
    def request_hash(request: SimulationRequest, outputs: HybridOutputs) -> str:
        payload = {
            "simulation": request.model_dump(mode="json"),
            "outputs": outputs.model_dump(mode="json"),
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
    ) -> Tuple[PipelineRun, bool]:
        """Persist a new hybrid run or return the matching idempotent run."""
        if not outputs.empirical_personas:
            raise ValueError("Enhanced async runs must request empirical personas")
        self.validate_callback_url(request.callback_url)
        request_hash = self.request_hash(request, outputs)
        session = self.session_factory()
        try:
            existing = (
                session.query(PipelineRun)
                .filter(
                    PipelineRun.partner_id == PARTNER_ID,
                    PipelineRun.external_org_id == external_org_id,
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
                request_payload={"simulation": request.model_dump(mode="json")},
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
                    PipelineRun.idempotency_key == idempotency_key,
                )
                .first()
            )
            if existing and existing.request_hash == request_hash:
                session.expunge(existing)
                return existing, True
            raise
        finally:
            session.close()

    def get_run_for_tenant(
        self, job_id: str, user_id: str, external_org_id: str
    ) -> Optional[PipelineRun]:
        session = self.session_factory()
        try:
            run = (
                session.query(PipelineRun)
                .filter(
                    PipelineRun.job_id == job_id,
                    PipelineRun.partner_id == PARTNER_ID,
                    PipelineRun.external_org_id == external_org_id,
                    PipelineRun.user_id == user_id,
                )
                .first()
            )
            if run:
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
        try:
            request = SimulationRequest.model_validate(
                claimed["request_payload"]["simulation"]
            )
            outputs = HybridOutputs.model_validate(claimed["requested_outputs"] or {})

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
            self._ensure_active(job_id)

            await self._set_stage(
                job_id,
                "empirical_remapping",
                70,
                "Constructing evidence-grounded personas",
            )
            result = await self.enrichment(result, request)
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
                result, request, claimed["user_id"]
            )

            warning = None
            prd_status = "not_requested"
            if outputs.prd.enabled:
                await self._set_stage(job_id, "generating_prd", 96, "Generating PRD")
                prd_status, warning = await self._generate_prd(
                    analysis_result_id, request, outputs, claimed["user_id"]
                )
                if prd_status == "failed" and outputs.prd.required:
                    raise RuntimeError(warning or "Required PRD generation failed")

            terminal_status = "completed_with_warnings" if warning else "completed"
            self._persist_success(
                job_id,
                result,
                analysis_result_id,
                terminal_status,
                prd_status,
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
            self._persist_failure(job_id, str(exc), time.monotonic() - started)
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
            trace = list(run.execution_trace or [])
            trace.append(
                {
                    "stage": stage,
                    "progress_percentage": run.progress_percentage,
                    "message": message,
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            )
            run.execution_trace = trace
            run.updated_at = datetime.now(timezone.utc)
            session.commit()
        finally:
            session.close()

    def _create_canonical_analysis_result(
        self, result: SimulationResponse, request: SimulationRequest, user_id: str
    ) -> int:
        """Persist hybrid deliverables in the existing analysis/PRD data model."""
        session = self.session_factory()
        try:
            original_text = "\n\n".join(
                response.response
                for interview in result.interviews or []
                for response in interview.responses
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
    ) -> Tuple[str, Optional[str]]:
        session = self.session_factory()
        try:
            analysis = (
                session.query(AnalysisResult)
                .filter(AnalysisResult.result_id == analysis_result_id)
                .first()
            )
            user = session.query(User).filter(User.user_id == user_id).first()
            if not analysis or not user:
                return "failed", "Hybrid analysis result is unavailable for PRD generation"
            llm_service = LLMServiceFactory.create("enhanced_gemini")
            prd_service = PRDGenerationService(
                db=session, llm_service=llm_service, user=user
            )
            prd = await prd_service.generate_prd(
                analysis_results=analysis.results,
                prd_type=outputs.prd.type,
                industry=(request.business_context.industry if request.business_context else None),
                result_id=analysis_result_id,
            )
            if isinstance(prd, dict) and prd.get("error"):
                return "failed", str(prd["error"])
            return "completed", None
        except Exception as exc:
            logger.exception("PRD generation failed for hybrid analysis %s", analysis_result_id)
            return "failed", str(exc)
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
            summary = {
                "hybrid_status": "completed",
                "people_count": len(result.people or []),
                "interview_count": len(result.interviews or []),
                "empirical_persona_count": len(result.empirical_personas or []),
                "evidence_item_count": (result.metadata or {}).get("audited_evidence_count", 0),
                "analysis_result_id": analysis_result_id,
                "prd_status": prd_status,
            }
            run.status = status
            run.current_stage = "completed"
            run.progress_percentage = 100
            run.completed_at = datetime.now(timezone.utc)
            run.updated_at = datetime.now(timezone.utc)
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

    def _persist_failure(self, job_id: str, error: str, duration: float) -> None:
        session = self.session_factory()
        try:
            run = session.query(PipelineRun).filter(PipelineRun.job_id == job_id).first()
            if not run:
                return
            run.status = "failed"
            run.current_stage = "failed"
            run.error = error[:4000]
            run.completed_at = datetime.now(timezone.utc)
            run.updated_at = datetime.now(timezone.utc)
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
        }
        if include_result and run.status in {"completed", "completed_with_warnings"}:
            data["result"] = run.dataset
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
