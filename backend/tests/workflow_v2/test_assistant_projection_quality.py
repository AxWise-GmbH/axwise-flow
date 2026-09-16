"""Publication boundary for source correspondence and incomplete metering."""

from __future__ import annotations

import pytest

from backend.services.workflow_v2.assistant.projection import project_assistant_result
from backend.tests.workflow_v2.test_assistant_claim_spans import grounded_response
from backend.tests.workflow_v2.test_assistant_service import metrics_factory, source_types, usage_reader
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure

pytestmark = pytest.mark.contract

WEBHOOK = "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/"
CHAT = "https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger/"


def project(raw: dict):
    return project_assistant_result(
        raw, response_mode="one_shot", source_type_classifier=source_types,
        usage_reader=usage_reader, metrics_factory=metrics_factory,
    )


def test_explicitly_different_node_source_is_not_a_supported_fact() -> None:
    statement = "The Webhook node supports authentication."
    raw = grounded_response(statement, [statement], urls=[CHAT])
    with pytest.raises(CognitiveExecutionFailure) as raised:
        project(raw)
    assert raised.value.error_class == "AXWISE_ASSISTANT_SOURCE_MISMATCH"


def test_unrelated_valid_fact_cannot_hide_an_explicit_source_mismatch() -> None:
    wrong = "The Webhook node supports authentication."
    valid = "The Webhook node accepts requests."
    raw = grounded_response(f"{wrong}\n\n{valid}", [wrong, valid], urls=[CHAT, WEBHOOK])
    with pytest.raises(CognitiveExecutionFailure) as raised:
        project(raw)
    assert raised.value.error_class == "AXWISE_ASSISTANT_SOURCE_MISMATCH"


def test_exact_heading_context_filters_only_mismatched_fact_source() -> None:
    statement = "Authentication can be configured."
    raw = grounded_response(f"## Webhook\n\n{statement}", [statement], urls=[CHAT])
    raw["sources"].append({"title": "Webhook node documentation", "url": WEBHOOK})
    raw["claims"][0]["source_urls"].append(WEBHOOK)
    result = project(raw)
    assert result.response.facts[0].statement == statement
    assert result.response.facts[0].source_urls == [WEBHOOK]


def test_cumulative_metering_does_not_reuse_final_only_query_count() -> None:
    raw = grounded_response("The setting is optional.", ["The setting is optional."])
    raw.update(provider_queries=["accepted query"], usage_metadata={
        "input_tokens": 30, "output_tokens": 15, "total_tokens": 45,
        "search_calls": 4, "usage_complete": True,
    })
    metrics = project(raw).metrics
    assert (metrics.input_tokens, metrics.output_tokens, metrics.total_tokens) == (30, 15, 45)
    assert metrics.search_calls == 4


@pytest.mark.parametrize("search_calls", [None, 3])
def test_missing_attempt_receipts_are_unknown_not_zero_cost(search_calls) -> None:
    raw = grounded_response("The setting is optional.", ["The setting is optional."])
    raw.update(provider_queries=["accepted query"], usage_metadata={
        "input_tokens": None, "output_tokens": None, "total_tokens": None,
        "search_calls": search_calls, "usage_complete": False,
    })
    metrics = project(raw).metrics
    assert metrics.input_tokens is None
    assert metrics.output_tokens is None
    assert metrics.total_tokens is None
    assert metrics.estimated_cost_micros is None
    assert metrics.search_calls == search_calls
