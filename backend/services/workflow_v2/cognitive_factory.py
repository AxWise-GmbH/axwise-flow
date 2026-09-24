"""Production provider composition, separate from cognitive operation dispatch.

This is the cloud/server factory, not the local Axwise specialist runtime. Import
and construction remain lazy. The historical dispatcher entrypoint delegates
here and its injectable adapter symbols are resolved at invocation time.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.services.workflow_v2.cognitive_executor import (
        ArtifactResolver,
        GeminiCognitiveExecutor,
    )


def build_cognitive_executor(
    artifact_resolver: ArtifactResolver,
) -> GeminiCognitiveExecutor:
    # Keep late binding to the original adapter surface for existing integrations
    # and offline wiring fixtures; importing this module does not create clients.
    from backend.services.workflow_v2 import cognitive_executor as adapters
    from backend.services.generative.searxng_search_service import SearxngSearchService
    from backend.services.workflow_v2.exact_span_extractor import (
        PydanticAIExactSpanExtractor,
    )
    from backend.services.workflow_v2.resilient_research_runner import (
        ResilientResearchRunner,
    )
    from backend.services.workflow_v2.assistant.answer_quality import (
        assistant_answer_defects,
        assistant_repair_query,
    )
    from backend.services.workflow_v2.assistant.publication import (
        assistant_parsed_response_defects,
        assistant_source_url_allowed,
    )
    from backend.services.workflow_v2.assistant.image_runner import (
        GeminiAssistantImageRunner,
    )
    from backend.services.workflow_v2.assistant.structured_widget_runner import (
        StructuredWidgetRunner,
    )
    from backend.services.workflow_v2.assistant.quick_info_runner import (
        GeminiAssistantQuickInfoRunner,
    )

    api_key = os.getenv("GEMINI_API_KEY")
    authority_key = os.getenv("AXWISE_AUTHORITY_SEAL_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    if not authority_key:
        raise RuntimeError("AXWISE_AUTHORITY_SEAL_KEY is required")
    from backend.services.workflow_v2.capability_provider_config import (
        capability_generator_options,
    )

    capability_generators = capability_generator_options(
        os.getenv("AXWISE_CAPABILITY_GENERATORS_ENABLED"), api_key
    )
    model = adapters.get_shared_workflow_model(api_key)
    research_runner = ResilientResearchRunner(
        adapters.GeminiGroundedResearchRunner(api_key),
        searxng=SearxngSearchService(),
        extractor=PydanticAIExactSpanExtractor(model),
        source_type_classifier=adapters._classify_source_types,
    )
    # One-shot chat can give HIGH-reasoning grounded search a full attempt.
    # Keep durable multi-requirement research's proven 510-second budget and
    # circuit breaker independent; executor.close() owns both runner lifetimes.
    assistant_runner = ResilientResearchRunner(
        adapters.GeminiGroundedResearchRunner(
            api_key,
            search_operation_seconds=adapters._ASSISTANT_PRIMARY_SEARCH_OPERATION_SECONDS,
            search_attempt_seconds=adapters._ASSISTANT_PRIMARY_SEARCH_ATTEMPT_SECONDS,
            response_validator=assistant_answer_defects,
            repair_query_builder=assistant_repair_query,
            parsed_response_validator=assistant_parsed_response_defects,
        ),
        searxng=SearxngSearchService(),
        extractor=PydanticAIExactSpanExtractor(model),
        source_type_classifier=adapters._classify_source_types,
        discovery_seconds=20.0,
        source_url_validator=assistant_source_url_allowed,
    )
    return adapters.GeminiCognitiveExecutor(
        adapters.PydanticAIScopeDrafter(model),
        authority_key.encode("utf-8"),
        research_runner,
        artifact_resolver,
        adapters.PydanticAISynthesisWriter(model),
        adapters.PydanticAIScopeReviser(model),
        assistant_runner=assistant_runner,
        assistant_chat_runner=adapters.PydanticAIConversationalAssistantRunner(model),
        assistant_image_runner=GeminiAssistantImageRunner(api_key),
        assistant_widget_runner=StructuredWidgetRunner(),
        assistant_quick_info_runner=GeminiAssistantQuickInfoRunner(
            api_key, verify_discovery=True
        ),
        solution_preparer=adapters.PydanticAISolutionPreparer(model),
        solution_preparer_v2=adapters.PydanticAINativeSolutionPreparer(model),
        **capability_generators,
    )
