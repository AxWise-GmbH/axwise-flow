"""Mode-aware orchestration for one workflow-v2 Assistant turn."""

from __future__ import annotations

from backend.domain.workflow_v2.contracts import (
    AssistantTurnCompletedResult,
    AssistantTurnInputV1,
)
from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.services.workflow_v2.assistant.answer_quality import (
    assistant_answer_defects,
)
from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
from backend.services.workflow_v2.assistant.publishers import (
    reviewed_publisher_bindings,
)
from backend.services.workflow_v2.assistant.source_policy import (
    resolve_assistant_source_policy,
)
from backend.services.workflow_v2.assistant.protocols import (
    AssistantRunner,
    MetricsFactory,
    SourceTypeClassifier,
    UsageReader,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure


class AssistantTurnService:
    """Execute an Assistant turn using the explicitly selected capability."""

    def __init__(
        self,
        *,
        grounded_runner: AssistantRunner | None,
        conversational_runner: AssistantRunner | None,
        source_type_classifier: SourceTypeClassifier,
        usage_reader: UsageReader,
        metrics_factory: MetricsFactory,
    ) -> None:
        self.grounded_runner = grounded_runner
        self.conversational_runner = conversational_runner
        self.source_type_classifier = source_type_classifier
        self.usage_reader = usage_reader
        self.metrics_factory = metrics_factory

    async def execute(
        self, input_value: AssistantTurnInputV1
    ) -> AssistantTurnCompletedResult:
        runner = (
            self.grounded_runner
            if input_value.response_mode == "one_shot"
            else self.conversational_runner
        )
        if runner is None:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_UNAVAILABLE", retryable=True
            )
        policy = resolve_assistant_source_policy(
            input_value, reviewed_publisher_bindings()
        )
        if input_value.response_mode == "one_shot" and not policy.resolved:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_SOURCE_REFERENCE_REQUIRED",
                retryable=False,
                diagnostics={
                    "route": "assistant_source_policy",
                    "status": "source_authority_required",
                    "call_count": 0,
                },
            )
        query = assistant_turn_query(input_value, source_policy=policy)
        raw = await runner.search(query)
        if (
            input_value.response_mode == "one_shot"
            and raw.get("provider") != "searxng_direct_fetch"
        ):
            diagnostics = raw.get("runtime_diagnostics")
            quality_exhausted = (
                isinstance(diagnostics, dict)
                and diagnostics.get("status") == "quality_rejected"
            )
            if quality_exhausted or assistant_answer_defects(
                query, str(raw.get("text") or "")
            ):
                # The production provider already had one bounded repair chance.
                # Custom/test runners must meet the same publication boundary;
                # do not start a second search/retry lifecycle here.
                raise CognitiveExecutionFailure(
                    "AXWISE_ASSISTANT_QUALITY_REJECTED",
                    retryable=False,
                    diagnostics={
                        **(diagnostics if isinstance(diagnostics, dict) else {}),
                        "route": "assistant_one_shot",
                        "status": "quality_rejected",
                    },
                )
        return project_assistant_result(
            raw,
            response_mode=input_value.response_mode,
            source_type_classifier=self.source_type_classifier,
            usage_reader=self.usage_reader,
            metrics_factory=self.metrics_factory,
            source_policy=policy,
        )


__all__ = ["AssistantTurnService"]
