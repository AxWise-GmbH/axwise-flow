"""Mode-aware orchestration for one workflow-v2 Assistant turn."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.domain.workflow_v2.contracts import (
    AssistantCurrencyPresentationV1,
    AssistantFactV1,
    AssistantGeneratedImagePresentationV1,
    AssistantPresentationSourceV1,
    AssistantSourceV1,
    AssistantTurnCompletedResult,
    AssistantTurnInputV1,
    AssistantTurnInputV2,
    AssistantTurnV1,
    AssistantTurnV2,
    AssistantWeatherForecastV1,
    AssistantWeatherPresentationV1,
    OperationMetrics,
)
from backend.services.workflow_v2.assistant.image_runner import (
    AssistantImageGenerationError,
    GeminiAssistantImageRunner,
)
from backend.services.workflow_v2.assistant.quick_info_runner import (
    AssistantQuickInfoError,
    GeminiAssistantQuickInfoRunner,
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
from backend.services.workflow_v2.assistant.widget_runner import (
    AssistantWidgetError,
    CurrencyCandidate,
    GeminiAssistantWidgetRunner,
    WeatherCandidate,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure


def _utc_timestamp(value: str) -> str:
    """Normalize provider timestamps to the contract's exact UTC wire form."""

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise CognitiveExecutionFailure(
            "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT", retryable=True
        ) from None
    if parsed.tzinfo is None:
        raise CognitiveExecutionFailure(
            "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT", retryable=True
        )
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _usage_metrics(
    *,
    model: str,
    model_version: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
    search_calls: int,
) -> OperationMetrics:
    values: dict[str, object] = {
        "latency_ms": 0,
        "provider": "google",
        "model": model,
        "search_calls": search_calls,
    }
    if model_version is not None:
        values["model_version"] = model_version
    if input_tokens is not None:
        values["input_tokens"] = input_tokens
    if output_tokens is not None:
        values["output_tokens"] = output_tokens
    if input_tokens is not None and output_tokens is not None:
        values["total_tokens"] = input_tokens + output_tokens
    # Image output and grounded-search prices do not share the old token-only
    # estimator. Preserve receipts without inventing a cost or serializing nulls.
    return OperationMetrics(**values)


def _plain_alt(prompt: str) -> str:
    normalized = " ".join(prompt.split())
    return f"Generated image: {normalized}"[:1000]


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
        image_runner: GeminiAssistantImageRunner | None = None,
        widget_runner: GeminiAssistantWidgetRunner | None = None,
        quick_info_runner: GeminiAssistantQuickInfoRunner | None = None,
    ) -> None:
        self.grounded_runner = grounded_runner
        self.conversational_runner = conversational_runner
        self.source_type_classifier = source_type_classifier
        self.usage_reader = usage_reader
        self.metrics_factory = metrics_factory
        self.image_runner = image_runner
        self.widget_runner = widget_runner
        self.quick_info_runner = quick_info_runner

    async def execute(
        self, input_value: AssistantTurnInputV1 | AssistantTurnInputV2
    ) -> AssistantTurnCompletedResult:
        if isinstance(input_value, AssistantTurnInputV2):
            if input_value.capability.kind == "text":
                return await self._execute_text(
                    AssistantTurnInputV1(
                        type="AssistantTurnV1",
                        response_mode=input_value.response_mode,
                        message=input_value.message,
                        conversation=input_value.conversation,
                    )
                )
            return await self._execute_capability(input_value)
        return await self._execute_text(input_value)

    async def _execute_text(
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

    async def _execute_capability(
        self, input_value: AssistantTurnInputV2
    ) -> AssistantTurnCompletedResult:
        capability = input_value.capability
        if capability.kind == "image_generate":
            return await self._execute_image(input_value)
        if capability.kind in {"weather", "currency"}:
            return await self._execute_widget(input_value)
        if capability.kind == "quick_info":
            return await self._execute_quick_info(input_value)
        raise CognitiveExecutionFailure(
            "AXWISE_ASSISTANT_CAPABILITY_UNSUPPORTED", retryable=False
        )

    async def _execute_image(
        self, input_value: AssistantTurnInputV2
    ) -> AssistantTurnCompletedResult:
        if self.image_runner is None:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_IMAGE_UNAVAILABLE", retryable=True
            )
        capability = input_value.capability
        try:
            generated = await self.image_runner.generate(
                input_value.message,
                aspect_ratio=capability.aspect_ratio,
                image_size=capability.image_size,
                input_image=None,
            )
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_IMAGE_INPUT_INVALID", retryable=False
            ) from error
        except AssistantImageGenerationError as error:
            raise CognitiveExecutionFailure(
                error.code, retryable=error.retryable
            ) from error
        return AssistantTurnCompletedResult(
            result_type="assistant_turn_completed",
            response=AssistantTurnV2(
                schema_version="axwise.assistant-turn.v2",
                markdown="Image generated successfully.",
                presentations=[
                    AssistantGeneratedImagePresentationV1(
                        schema_version="axwise.presentation.generated-image.v1",
                        kind="generated_image",
                        mime_type=generated.mime_type,
                        data=generated.data_base64,
                        sha256=generated.sha256,
                        alt=_plain_alt(input_value.message),
                        model=generated.model,
                    )
                ],
            ),
            metrics=_usage_metrics(
                model=generated.model,
                model_version=generated.model_version,
                input_tokens=generated.input_tokens,
                output_tokens=generated.output_tokens,
                search_calls=0,
            ),
        )

    async def _execute_quick_info(
        self, input_value: AssistantTurnInputV2
    ) -> AssistantTurnCompletedResult:
        if self.quick_info_runner is None:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_QUICK_INFO_UNAVAILABLE", retryable=True
            )
        capability = input_value.capability
        if capability.kind != "quick_info":
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_CAPABILITY_UNSUPPORTED", retryable=False
            )
        try:
            result = await self.quick_info_runner.quick_info(
                input_value.message,
                location=capability.location,
                jev_enabled=capability.routing_mode == "jev",
            )
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_QUICK_INFO_INPUT_INVALID", retryable=False
            ) from error
        except AssistantQuickInfoError as error:
            raise CognitiveExecutionFailure(
                error.code, retryable=error.retryable
            ) from error
        sources = [
            AssistantSourceV1(
                title=source.title,
                canonical_url=source.url,
                source_types=sorted(
                    self.source_type_classifier(source.url, source.title)
                ),
            )
            for source in result.sources
        ]
        facts = [
            AssistantFactV1(
                statement=fact.statement,
                source_urls=list(fact.source_urls),
            )
            for fact in result.facts
        ]
        if not sources or not facts:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_QUICK_INFO_UNGROUNDED", retryable=False
            )
        return AssistantTurnCompletedResult(
            result_type="assistant_turn_completed",
            response=AssistantTurnV1(
                schema_version="axwise.assistant-turn.v1",
                markdown=result.markdown,
                sources=sources,
                facts=facts,
            ),
            metrics=_usage_metrics(
                model=result.model,
                model_version=result.model_version,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                search_calls=result.search_calls,
            ),
        )

    async def _execute_widget(
        self, input_value: AssistantTurnInputV2
    ) -> AssistantTurnCompletedResult:
        if self.widget_runner is None:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_WIDGET_UNAVAILABLE", retryable=True
            )
        capability = input_value.capability
        try:
            if capability.kind == "weather":
                result = await self.widget_runner.weather(
                    capability.location, temperature_unit=capability.temp_unit
                )
            elif capability.kind == "currency":
                result = await self.widget_runner.currency(
                    capability.base, capability.quote, capability.amount
                )
            else:
                raise CognitiveExecutionFailure(
                    "AXWISE_ASSISTANT_CAPABILITY_UNSUPPORTED", retryable=False
                )
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_WIDGET_INPUT_INVALID", retryable=False
            ) from error
        except AssistantWidgetError as error:
            raise CognitiveExecutionFailure(
                error.code, retryable=error.retryable
            ) from error

        source = AssistantPresentationSourceV1(
            title=result.source.title,
            url=result.source.url,
        )
        assistant_source = AssistantSourceV1(
            title=result.source.title,
            canonical_url=result.source.url,
            source_types=sorted(
                self.source_type_classifier(result.source.url, result.source.title)
            ),
        )
        if result.kind == "weather" and isinstance(result.payload, WeatherCandidate):
            payload = result.payload
            statement = (
                f"Weather in {payload.location}: {payload.temperature}°"
                f"{payload.temperature_unit}, {payload.condition}."
            )
            presentation = AssistantWeatherPresentationV1(
                schema_version="axwise.presentation.weather.v1",
                kind="weather",
                location=payload.location,
                observed_at=_utc_timestamp(payload.observed_at),
                temperature_unit=payload.temperature_unit,
                temperature=payload.temperature,
                condition=payload.condition,
                high=payload.high,
                low=payload.low,
                forecast=[
                    AssistantWeatherForecastV1(
                        label=item.label,
                        condition=item.condition,
                        high=item.high,
                        low=item.low,
                    )
                    for item in payload.forecast
                ],
                source=source,
            )
        elif result.kind == "currency" and isinstance(
            result.payload, CurrencyCandidate
        ):
            payload = result.payload
            statement = (
                f"{payload.amount} {payload.base} is {payload.converted_amount} "
                f"{payload.quote} at {payload.rate} {payload.quote} per {payload.base}."
            )
            presentation = AssistantCurrencyPresentationV1(
                schema_version="axwise.presentation.currency.v1",
                kind="currency",
                base=payload.base,
                quote=payload.quote,
                amount=payload.amount,
                converted_amount=payload.converted_amount,
                rate=payload.rate,
                inverse_rate=payload.inverse_rate,
                as_of=_utc_timestamp(payload.as_of),
                source=source,
            )
        else:
            raise CognitiveExecutionFailure(
                "AXWISE_ASSISTANT_WIDGET_MISMATCH", retryable=True
            )
        return AssistantTurnCompletedResult(
            result_type="assistant_turn_completed",
            response=AssistantTurnV2(
                schema_version="axwise.assistant-turn.v2",
                markdown=f"{statement} [Source](<{result.source.url}>)",
                sources=[assistant_source],
                facts=[
                    AssistantFactV1(
                        statement=statement, source_urls=[result.source.url]
                    )
                ],
                presentations=[presentation],
            ),
            metrics=_usage_metrics(
                model=result.model,
                model_version=result.model_version,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                search_calls=result.search_calls,
            ),
        )


__all__ = ["AssistantTurnService"]
