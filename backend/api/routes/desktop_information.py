"""IAM-only stateless desktop information; no operation store, worker or polling."""

from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Annotated, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from backend.domain.workflow_v2.contracts import (
    AssistantWeatherCapabilityV2,
    AssistantCurrencyCapabilityV2,
    AssistantQuickInfoCapabilityV2,
    AssistantTurnV1,
    AssistantSourceV1,
    AssistantFactV1,
)
from backend.services.workflow_v2.assistant.quick_info_runner import (
    GeminiAssistantQuickInfoRunner,
    AssistantQuickInfoError,
)
from backend.services.workflow_v2.assistant.service import AssistantTurnService
from backend.services.workflow_v2.assistant.widget_runner import AssistantWidgetError
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure

router = APIRouter(prefix="/v2/information", tags=["Desktop information"])


class InformationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)
    capability: Annotated[
        Union[
            AssistantWeatherCapabilityV2,
            AssistantCurrencyCapabilityV2,
            AssistantQuickInfoCapabilityV2,
        ],
        Field(discriminator="kind"),
    ]


class InformationService:
    def __init__(self, *, quick=None, widgets=None):
        from backend.services.workflow_v2.assistant.structured_widget_runner import (
            StructuredWidgetRunner,
        )

        # Structured providers must remain usable without Gemini credentials.
        # Construction is synchronous, so the first quick lookup initializes
        # exactly one runner before yielding to another request.
        self.quick = quick
        self.widgets = widgets if widgets is not None else StructuredWidgetRunner()
        self._closed = False
        # Reuse typed card projection, not AxWise orchestration/persistence.
        self.projection = AssistantTurnService(
            grounded_runner=None,
            conversational_runner=None,
            source_type_classifier=lambda _url, _title: ["grounded_web"],
            usage_reader=lambda *_args: None,
            metrics_factory=lambda **_kwargs: None,
            widget_runner=self.widgets,
        )

    def _get_quick_runner(self):
        if self.quick is None:
            try:
                self.quick = GeminiAssistantQuickInfoRunner(verify_discovery=True)
            except Exception:
                # Do not leak credential/configuration details or fail unrelated
                # structured capabilities when this optional provider is absent.
                raise AssistantQuickInfoError(
                    "AXWISE_ASSISTANT_QUICK_INFO_PROVIDER_UNAVAILABLE", retryable=True
                ) from None
        return self.quick

    async def lookup(self, request: InformationRequest):
        try:
            if self._closed:
                raise AssistantQuickInfoError(
                    "AXWISE_ASSISTANT_QUICK_INFO_SERVICE_CLOSED", retryable=False
                )
            async with asyncio.timeout(18):
                capability = request.capability
                if capability.kind == "quick_info":
                    quick_info_options = {
                        "location": capability.location,
                        "jev_enabled": capability.routing_mode == "jev",
                    }
                    if capability.discovery_kind is not None:
                        quick_info_options["discovery_kind"] = capability.discovery_kind
                    result = await self._get_quick_runner().quick_info(
                        request.question,
                        **quick_info_options,
                    )
                    response = AssistantTurnV1(
                        markdown=result.markdown,
                        sources=[
                            AssistantSourceV1(
                                title=s.title,
                                canonical_url=s.url,
                                source_types=["grounded_web"],
                            )
                            for s in result.sources
                        ],
                        facts=[
                            AssistantFactV1(
                                statement=f.statement, source_urls=list(f.source_urls)
                            )
                            for f in result.facts
                        ],
                    )
                    return {
                        "response": response.model_dump(by_alias=True, mode="json"),
                        "outcome": result.outcome,
                        "cacheHit": result.cache_hit,
                    }
                widget = (
                    await self.widgets.weather(
                        capability.location, temperature_unit=capability.temp_unit
                    )
                    if capability.kind == "weather"
                    else await self.widgets.currency(
                        capability.base, capability.quote, capability.amount
                    )
                )
                completed = self.projection.project_widget_result(widget)
                return {
                    "response": completed.response.model_dump(
                        by_alias=True, mode="json"
                    ),
                    "outcome": "complete",
                    "cacheHit": widget.cache_hit,
                }
        except (CognitiveExecutionFailure, AssistantWidgetError) as error:
            code = getattr(error, "error_class", getattr(error, "code", ""))
            if code in {
                "AXWISE_ASSISTANT_WIDGET_LOCATION_AMBIGUOUS",
                "AXWISE_ASSISTANT_WIDGET_LOCATION_NOT_FOUND",
            }:
                message = (
                    "Which country or region do you mean? Several places match that location."
                    if code.endswith("AMBIGUOUS")
                    else "I couldn’t find that location. Please give the city and country or region."
                )
                return {
                    "outcome": "needs_clarification",
                    "response": AssistantTurnV1(markdown=message).model_dump(
                        by_alias=True, mode="json"
                    ),
                }
            return {
                "outcome": "provider_unavailable",
                "response": AssistantTurnV1(
                    markdown="I couldn’t complete this live check just now. No alternative research or local commands were started."
                ).model_dump(by_alias=True, mode="json"),
            }
        except (AssistantQuickInfoError, TimeoutError):
            return {
                "outcome": "provider_unavailable",
                "response": AssistantTurnV1(
                    markdown="I couldn’t complete this live check just now. No alternative research or local commands were started."
                ).model_dump(by_alias=True, mode="json"),
            }

    async def close(self):
        if self._closed:
            return
        self._closed = True
        pending = [self.widgets.close()]
        if self.quick is not None:
            pending.append(self.quick.close())
        await asyncio.gather(*pending)


@lru_cache(maxsize=1)
def get_information_service():
    return InformationService()


@router.post("")
async def information(
    request: InformationRequest, service=Depends(get_information_service)
):
    return await service.lookup(request)
