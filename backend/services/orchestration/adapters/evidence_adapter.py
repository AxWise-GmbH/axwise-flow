"""Tenant-scoped adapter for already persisted AxWise evidence."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable

from sqlalchemy.orm import Session

from backend.domain.orchestration.models import (
    ContextReference,
    DecisionCreateRequestV1,
    EvidenceItemV1,
)
from backend.models import AnalysisResult, InterviewData


class SqlAlchemyEvidenceAdapter:
    """Resolve explicit context references without copying raw source documents."""

    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def _tokens(values: Iterable[str]) -> set[str]:
        return {
            token
            for value in values
            for token in re.findall(r"[a-z0-9_+-]{3,}", value.casefold())
        }

    def _relevance(self, request: DecisionCreateRequestV1, values: Iterable[str]) -> float:
        task_tokens = self._tokens(
            [request.task.objective, request.task.desired_outcome, request.task.domain]
        )
        evidence_tokens = self._tokens(values)
        if not task_tokens or not evidence_tokens:
            return 0.5
        overlap = len(task_tokens.intersection(evidence_tokens)) / max(
            1,
            min(len(task_tokens), 20),
        )
        return round(min(1.0, 0.4 + overlap), 6)

    @staticmethod
    def _identifier(value: str) -> int | None:
        match = re.search(r"(\d+)$", value)
        return int(match.group(1)) if match else None

    @staticmethod
    def _hash(value: Any) -> str:
        canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _strings(value: Any) -> list[str]:
        found: list[str] = []
        if isinstance(value, str):
            found.append(value)
        elif isinstance(value, list):
            for item in value:
                found.extend(SqlAlchemyEvidenceAdapter._strings(item))
        elif isinstance(value, dict):
            for key, item in value.items():
                if key not in {"raw_text", "original_text", "source_text"}:
                    found.extend(SqlAlchemyEvidenceAdapter._strings(item))
        return found

    @staticmethod
    def _capability_hints(results: dict[str, Any]) -> list[str]:
        resolution = results.get("persona_resolution") or {}
        ideal = resolution.get("ideal_agent_persona") or {}
        capabilities = ideal.get("required_capabilities") or []
        return [str(value) for value in capabilities[:20]]

    def _analysis_item(
        self,
        request: DecisionCreateRequestV1,
        reference: ContextReference,
        user_id: str,
    ) -> EvidenceItemV1 | None:
        result_id = self._identifier(reference.reference_id)
        if result_id is None:
            return None
        row = (
            self.session.query(AnalysisResult)
            .join(InterviewData, AnalysisResult.data_id == InterviewData.id)
            .filter(
                AnalysisResult.result_id == result_id,
                InterviewData.user_id == user_id,
                AnalysisResult.status == "completed",
            )
            .first()
        )
        if not row:
            return None
        results = row.results if isinstance(row.results, dict) else {}
        source_type = str(results.get("source_type") or "").casefold()
        provenance = "synthetic" if "simulation" in source_type else "empirical"
        metadata = ((results.get("source") or {}).get("hybrid_metadata") or {})
        audited = int(metadata.get("audited_evidence_count") or 0)
        quality_value = results.get("confidence_score")
        quality = (
            float(quality_value)
            if isinstance(quality_value, (int, float))
            else 0.75 if audited else 0.6
        )
        public_values = self._strings(results)[:200]
        return EvidenceItemV1(
            reference_id=reference.reference_id,
            provenance=provenance,
            content_hash=reference.content_hash or self._hash(results),
            relevance=self._relevance(request, public_values),
            quality=max(0.0, min(quality, 1.0)),
            verified=audited > 0,
            verification_source="axwise_audit" if audited > 0 else "none",
            capability_hints=self._capability_hints(results),
            classification=reference.classification,
        )

    def _interview_item(
        self,
        request: DecisionCreateRequestV1,
        reference: ContextReference,
        user_id: str,
    ) -> EvidenceItemV1 | None:
        interview_id = self._identifier(reference.reference_id)
        if interview_id is None:
            return None
        row = (
            self.session.query(InterviewData)
            .filter(
                InterviewData.id == interview_id,
                InterviewData.user_id == user_id,
            )
            .first()
        )
        if not row:
            return None
        text = row.original_data or ""
        return EvidenceItemV1(
            reference_id=reference.reference_id,
            provenance="empirical",
            content_hash=reference.content_hash or self._hash(text),
            relevance=self._relevance(request, [text[:20000]]),
            quality=0.55,
            verified=False,
            classification=reference.classification,
        )

    def retrieve(
        self,
        request: DecisionCreateRequestV1,
        user_id: str,
    ) -> list[EvidenceItemV1]:
        items = {item.reference_id: item for item in request.evidence_catalogue}
        if not request.research_policy.allow_existing_evidence:
            return list(items.values())
        for reference in request.task.context_references:
            if reference.reference_id in items:
                continue
            kind = reference.kind.casefold()
            if kind in {"analysis", "analysis_result", "research_result"}:
                resolved = self._analysis_item(request, reference, user_id)
            elif kind in {"interview", "transcript"}:
                resolved = self._interview_item(request, reference, user_id)
            else:
                resolved = None
            if resolved:
                items[resolved.reference_id] = resolved
        return list(items.values())[: request.research_policy.maximum_evidence_items]
