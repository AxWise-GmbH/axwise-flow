"""Offline scorer evaluation and conservative regression gates."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.domain.orchestration.models import (
    EvaluationSliceV1,
    ScorerEvaluationReportV1,
)


class ScorerEvaluationService:
    """Produces stored promotion evidence from replay/shadow observations."""

    @staticmethod
    def _blockers(
        *,
        sample_count: int,
        overall_success_delta: float,
        cost_delta: float,
        calibration_error: float,
        drift_score: float,
        slices: list[EvaluationSliceV1],
        minimum_samples: int = 30,
        maximum_cost_regression: float = 0.10,
        maximum_calibration_error: float = 0.15,
        maximum_drift_score: float = 0.20,
        maximum_slice_regression: float = 0.05,
    ) -> list[str]:
        blockers: list[str] = []
        if sample_count < minimum_samples:
            blockers.append("insufficient_evaluation_samples")
        if overall_success_delta < 0:
            blockers.append("overall_success_regression")
        if cost_delta > maximum_cost_regression:
            blockers.append("material_cost_regression")
        if calibration_error > maximum_calibration_error:
            blockers.append("calibration_regression")
        if drift_score > maximum_drift_score:
            blockers.append("distribution_drift")
        for item in slices:
            if item.sample_count and item.success_delta < -maximum_slice_regression:
                blockers.append(f"minority_slice_regression:{item.slice_name}")
            if item.safety_regressions:
                blockers.append(f"safety_regression:{item.slice_name}")
            if item.cost_delta > maximum_cost_regression:
                blockers.append(f"slice_cost_regression:{item.slice_name}")
        return list(dict.fromkeys(blockers))

    @classmethod
    def promotion_blockers(
        cls,
        report: ScorerEvaluationReportV1,
    ) -> list[str]:
        """Recompute non-negotiable platform gates; never trust caller `passed`."""
        return cls._blockers(
            sample_count=report.sample_count,
            overall_success_delta=report.overall_success_delta,
            cost_delta=report.cost_delta,
            calibration_error=report.calibration_error,
            drift_score=report.drift_score,
            slices=report.slices,
        )

    def build_report(
        self,
        *,
        report_id: str,
        external_org_id: str,
        candidate_version: str,
        baseline_version: str,
        dataset_id: str,
        sample_count: int,
        overall_success_delta: float,
        cost_delta: float,
        calibration_error: float,
        drift_score: float,
        slices: list[EvaluationSliceV1],
        minimum_samples: int = 30,
        maximum_cost_regression: float = 0.10,
        maximum_calibration_error: float = 0.15,
        maximum_drift_score: float = 0.20,
        maximum_slice_regression: float = 0.05,
    ) -> ScorerEvaluationReportV1:
        blockers = self._blockers(
            sample_count=sample_count,
            overall_success_delta=overall_success_delta,
            cost_delta=cost_delta,
            calibration_error=calibration_error,
            drift_score=drift_score,
            slices=slices,
            minimum_samples=minimum_samples,
            maximum_cost_regression=maximum_cost_regression,
            maximum_calibration_error=maximum_calibration_error,
            maximum_drift_score=maximum_drift_score,
            maximum_slice_regression=maximum_slice_regression,
        )
        return ScorerEvaluationReportV1(
            report_id=report_id,
            external_org_id=external_org_id,
            candidate_version=candidate_version,
            baseline_version=baseline_version,
            dataset_id=dataset_id,
            sample_count=sample_count,
            overall_success_delta=overall_success_delta,
            cost_delta=cost_delta,
            calibration_error=calibration_error,
            drift_score=drift_score,
            slices=slices,
            passed=not blockers,
            blockers=blockers,
            created_at=datetime.now(timezone.utc),
        )
