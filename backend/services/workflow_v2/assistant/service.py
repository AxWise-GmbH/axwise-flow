"""Mode-aware orchestration for one workflow-v2 Assistant turn."""

from __future__ import annotations

from backend.domain.workflow_v2.contracts import (
    AssistantTurnCompletedResult,
    AssistantTurnInputV1,
)
from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.services.workflow_v2.assistant.prompts import assistant_turn_query
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
        raw = await runner.search(assistant_turn_query(input_value))
        return project_assistant_result(
            raw,
            response_mode=input_value.response_mode,
            source_type_classifier=self.source_type_classifier,
            usage_reader=self.usage_reader,
            metrics_factory=self.metrics_factory,
        )


__all__ = ["AssistantTurnService"]
