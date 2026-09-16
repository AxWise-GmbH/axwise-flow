from __future__ import annotations

import asyncio
import hashlib
import json
from copy import deepcopy
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from pydantic import TypeAdapter, ValidationError
from pydantic_ai.messages import ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.usage import RequestUsage

from backend.api.routes.workflow_v2_operations import get_operation_service, router
from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    PrepareSolutionInputV1,
    PrepareSolutionInputV2,
    PrepareSolutionResponseV2,
    canonical_hash,
    native_canonical_hash,
    native_canonical_json,
    validate_native_json,
)
from backend.services.workflow_v2.cognitive_executor import GeminiCognitiveExecutor
from backend.services.workflow_v2.operation_service import (
    CognitiveExecutionFailure,
    OperationService,
    sanitize_failure_diagnostics,
)
from backend.services.workflow_v2.solution_preparation import (
    NATIVE_SOLUTION_PER_RESPONSE_OUTPUT_TOKENS,
    NATIVE_SOLUTION_PREPARATION_DEADLINE_SECONDS,
    SOLUTION_PREPARATION_DEADLINE_SECONDS,
    NativeGraphRepairResponseV2,
    PydanticAINativeSolutionPreparer,
    PydanticAISolutionPreparer,
    _complete_native_repair,
    _native_solution_usage_limits,
    _validate_native_design,
)
from backend.tests.workflow_v2.test_operation_api import Store as ApiStore
from backend.tests.workflow_v2.test_solution_preparation import FIXTURE as V1_FIXTURE

pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[3]


class CountingFunctionModel(FunctionModel):
    """Local generation fixture with the actual Google preflight counting API."""

    counted_input_tokens = 100

    async def count_tokens(self, _messages, _settings, _parameters):
        return RequestUsage(input_tokens=self.counted_input_tokens)


def native_workflow():
    return {
        "name": "Reject empty names; normalize accepted requests",
        "nodes": [
            {
                "id": "receive",
                "name": "Receive",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 2.1,
                "position": [0, 0],
                "parameters": {
                    "httpMethod": "POST",
                    "path": "draft",
                    "responseMode": "responseNode",
                    "options": {},
                },
            },
            {
                "id": "normalize",
                "name": "Normalize",
                "type": "n8n-nodes-base.set",
                "typeVersion": 3.4,
                "position": [220, 0],
                "parameters": {
                    "assignments": {
                        "assignments": [
                            {
                                "id": "normalized",
                                "name": "name",
                                "type": "string",
                                "value": "={{ $json.body.name.trim() }}",
                            }
                        ]
                    },
                    "options": {},
                },
            },
            {
                "id": "check",
                "name": "Check name",
                "type": "n8n-nodes-base.if",
                "typeVersion": 2.2,
                "position": [440, 0],
                "parameters": {
                    "conditions": {
                        "options": {"typeValidation": "strict", "version": 2},
                        "conditions": [
                            {
                                "id": "nonempty",
                                "leftValue": "={{ $json.name }}",
                                "rightValue": "",
                                "operator": {
                                    "type": "string",
                                    "operation": "notEmpty",
                                    "singleValue": True,
                                },
                            }
                        ],
                        "combinator": "and",
                    },
                    "options": {},
                },
            },
            {
                "id": "accept",
                "name": "Accept",
                "type": "n8n-nodes-base.respondToWebhook",
                "typeVersion": 1.4,
                "position": [660, -100],
                "parameters": {
                    "respondWith": "json",
                    "responseBody": "={{ $json }}",
                    "options": {"responseCode": 200},
                },
            },
            {
                "id": "reject",
                "name": "Reject",
                "type": "n8n-nodes-base.respondToWebhook",
                "typeVersion": 1.4,
                "position": [660, 100],
                "parameters": {
                    "respondWith": "json",
                    "responseBody": '{"error":"empty_name"}',
                    "options": {"responseCode": 422},
                },
            },
        ],
        "connections": {
            "Receive": {"main": [[{"node": "Normalize", "type": "main", "index": 0}]]},
            "Normalize": {
                "main": [[{"node": "Check name", "type": "main", "index": 0}]]
            },
            "Check name": {
                "main": [
                    [{"node": "Accept", "type": "main", "index": 0}],
                    [{"node": "Reject", "type": "main", "index": 0}],
                ]
            },
        },
        "settings": {"executionOrder": "v1"},
    }


def native_spec():
    return {
        "kind": "n8n_workflow_v2",
        "requirements": [
            {"id": "normalize", "description": "Trim names and reject empty names."}
        ],
        "inputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
            "additionalProperties": False,
        },
        "outputSchema": {
            "type": "object",
            "properties": {"name": {"type": "string"}, "error": {"type": "string"}},
            "additionalProperties": False,
        },
        "acceptanceCases": [
            {
                "id": "trim",
                "description": "Trim a nonempty name",
                "requirementIds": ["normalize"],
                "input": {"name": " Ada "},
                "expectedOutput": {"name": "Ada"},
                "assertions": [],
            },
            {
                "id": "reject",
                "description": "Reject an empty name",
                "requirementIds": ["normalize"],
                "input": {"name": " "},
                "expectedStatus": 422,
                "assertions": [
                    {"path": "/error", "operator": "equals", "value": "empty_name"},
                    {"path": "/error", "operator": "exists"},
                ],
            },
        ],
        "connections": [],
        "runtimeProfile": "request_automation",
    }


def input_payload():
    base = deepcopy(V1_FIXTURE["initialInput"])
    content = (
        "Use named connections and exact installed node versions. No authority to run."
    )
    nodes = [
        {
            "type": kind,
            "typeVersion": version,
            "definition": {"name": kind, "version": version, "properties": []},
        }
        for kind, version in [
            ("n8n-nodes-base.webhook", 2.1),
            ("n8n-nodes-base.set", 3.4),
            ("n8n-nodes-base.if", 2.2),
            ("n8n-nodes-base.respondToWebhook", 1.4),
        ]
    ]
    return {
        "type": "PrepareSolutionV2",
        "buildRequestId": base["buildRequestId"],
        "inputVersion": 1,
        "instruction": "Accept a name, trim it, return the same field; reject empty names with 422 and error empty_name.",
        "agent": base["agent"],
        "source": base["source"],
        "answers": [],
        "knowledge": {
            "version": "n8n-native-2.37.10-v1",
            "skills": [
                {
                    "id": "connections",
                    "sourceCommit": "a" * 40,
                    "contentHash": hashlib.sha256(content.encode()).hexdigest(),
                    "content": content,
                }
            ],
            "nodes": nodes,
            "catalogHash": native_canonical_hash(nodes),
        },
        "draft": None,
        "diagnostics": [],
        "phase": "design",
        "frozenAcceptanceCases": [],
    }


def candidate(value=None):
    value = value or input_payload()
    return {
        "schemaVersion": "axwise.solution-preparation.v2",
        "buildRequestId": value["buildRequestId"],
        "inputVersion": value["inputVersion"],
        "outcome": "candidate",
        "name": "Name gate",
        "purpose": "Normalize input and reject empty names.",
        "explanation": "Draft branching workflow for review; it has not been executed.",
        "workflow": native_workflow(),
        "spec": native_spec(),
        "questions": [],
        "dependencies": [],
        "baseWorkflowHash": value["draft"]["workflowHash"] if value["draft"] else None,
        "semanticReview": {
            "advisory": True,
            "summary": "The graph appears to cover the requested behavior; runtime validation and testing remain required.",
            "concerns": [],
        },
    }


def envelope(value=None):
    value = deepcopy(value or input_payload())
    return AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000709",
            "operationType": "PrepareSolutionV2",
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000708",
                "organizationId": None,
                "userId": "user_solutiontest123",
            },
            "workflow": {
                "runId": value["source"]["runId"],
                "stageId": value["buildRequestId"],
                "stageAttemptId": "00000000-0000-4000-8000-000000000709",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": native_canonical_hash(value),
            "input": value,
        }
    )


def repair_input():
    value = input_payload()
    workflow, spec = native_workflow(), native_spec()
    value.update(
        phase="repair",
        inputVersion=3,
        draft={
            "workflow": workflow,
            "spec": spec,
            "workflowHash": native_canonical_hash(workflow),
            "rowVersion": 5,
        },
        diagnostics=[
            {
                "code": "parameter_shape",
                "message": "Check the supplied condition parameters.",
                "nodeId": "check",
            }
        ],
        frozenAcceptanceCases=deepcopy(spec["acceptanceCases"]),
    )
    return value


@pytest.mark.parametrize(
    "value,expected",
    [
        (1.0, "1"),
        (3.4, "3.4"),
        (-0.0, "0"),
        (1e-7, "1e-7"),
        (1e-6, "0.000001"),
        (10**20, "100000000000000000000"),
        (10**21, "1e+21"),
        ({"\ue000": 1, "😀": 2, "a": 3}, '{"a":3,"😀":2,"":1}'),
    ],
)
def test_rfc8785_native_vectors_preserve_legacy(value, expected):
    assert native_canonical_json(value) == expected
    assert native_canonical_hash(value) == hashlib.sha256(expected.encode()).hexdigest()
    with pytest.raises(TypeError):
        canonical_hash({"version": 3.4})


@pytest.mark.parametrize("value", [input_payload, repair_input])
def test_exact_native_contract_and_envelope_roundtrip(value):
    payload = value()
    assert (
        PrepareSolutionInputV2.model_validate(payload).model_dump(
            mode="json", by_alias=True
        )
        == payload
    )
    assert envelope(payload).canonical_input_hash == native_canonical_hash(payload)
    response = candidate(payload)
    assert (
        PrepareSolutionResponseV2.model_validate(response).model_dump(
            mode="json", by_alias=True
        )
        == response
    )
    assert (
        TypeAdapter(CompletionResult)
        .validate_python({"resultType": "solution_prepared", "response": response})
        .response.schema_version.endswith(".v2")
    )


@pytest.mark.parametrize(
    "change",
    [
        lambda v: v["knowledge"].update(catalogHash="0" * 64),
        lambda v: v["knowledge"]["skills"][0].update(content="Changed content"),
        lambda v: v.update(instruction="Use sk-" + "a" * 30),
        lambda v: v.update(inputVersion=1.5),
        lambda v: v["knowledge"]["nodes"][0].update(typeVersion=float("nan")),
        lambda v: v.update(phase="repair"),
        lambda v: v["source"].update(taskText="x" * 24_001),
        lambda v: v.update(
            answers=[
                {"questionId": "same", "value": "a"},
                {"questionId": "same", "value": "b"},
            ]
        ),
    ],
)
def test_rejects_invalid_unbound_or_secret_input(change):
    value = input_payload()
    change(value)
    with pytest.raises(ValidationError):
        PrepareSolutionInputV2.model_validate(value)


def test_stale_envelope_and_repair_criteria_are_rejected():
    value = envelope().model_dump(mode="json", by_alias=True)
    value["input"]["inputVersion"] += 1
    with pytest.raises(ValidationError, match="canonical input hash"):
        AxWiseOperationEnvelope.model_validate(value)
    value = envelope().model_dump(mode="json", by_alias=True)
    value["workflow"]["runId"] = "00000000-0000-4000-8000-000000000799"
    with pytest.raises(ValidationError, match="source run"):
        AxWiseOperationEnvelope.model_validate(value)
    repair = repair_input()
    repair["frozenAcceptanceCases"][0]["expectedOutput"] = {"name": "Different"}
    with pytest.raises(ValidationError, match="criteria"):
        PrepareSolutionInputV2.model_validate(repair)


@pytest.mark.parametrize(
    "change",
    [
        lambda v: v.update(active=True),
        lambda v: v["workflow"].update(active=True),
        lambda v: v["workflow"]["nodes"][0].update(
            credentials={"httpHeaderAuth": {"id": "other_owner"}}
        ),
        lambda v: v["workflow"]["nodes"][0].update(typeVersion=999),
        lambda v: v["workflow"]["nodes"][0]["parameters"].update(
            token="sk-" + "x" * 30
        ),
        lambda v: v["workflow"]["nodes"][0].update(id="check"),
        lambda v: v["workflow"]["connections"]["Receive"]["main"][0][0].update(
            node="Missing"
        ),
        lambda v: v["spec"]["inputSchema"].update(**{"$ref": "https://schema.invalid"}),
        lambda v: v["spec"]["acceptanceCases"][0].update(requirementIds=["unknown"]),
        lambda v: v["semanticReview"].update(advisory=False),
        lambda v: v.update(inputVersion=4),
        lambda v: v.update(baseWorkflowHash="a" * 64),
    ],
)
def test_native_design_boundaries(change):
    payload = candidate()
    change(payload)
    with pytest.raises((ValidationError, ValueError)):
        _validate_native_design(
            PrepareSolutionInputV2.model_validate(input_payload()),
            PrepareSolutionResponseV2.model_validate(payload),
        )


@pytest.mark.parametrize("kind", ["information", "connection", "setup"])
@pytest.mark.parametrize(
    "unsafe_prompt", ["Paste your API key in this answer.", "What is your password?"]
)
def test_specific_missing_questions_are_not_fake_candidates(kind, unsafe_prompt):
    payload = candidate()
    payload.update(
        outcome="needs_input",
        workflow=None,
        spec=None,
        questions=[
            {
                "id": "missing-target",
                "kind": kind,
                "prompt": "Which customer workspace should this workflow target?",
                "reason": "This selects the destination without supplying secrets.",
            }
        ],
    )
    _validate_native_design(
        PrepareSolutionInputV2.model_validate(input_payload()),
        PrepareSolutionResponseV2.model_validate(payload),
    )
    payload["questions"][0]["prompt"] = unsafe_prompt
    with pytest.raises(ValueError, match="secure connection"):
        _validate_native_design(
            PrepareSolutionInputV2.model_validate(input_payload()),
            PrepareSolutionResponseV2.model_validate(payload),
        )


def test_missing_node_dependency_has_no_substitute_or_invented_graph():
    payload = candidate()
    payload.update(
        outcome="dependencies",
        workflow=None,
        spec=None,
        dependencies=[
            {
                "id": "node-definition",
                "kind": "node",
                "description": "The requested provider node schema is not in the pinned catalog.",
            }
        ],
    )
    _validate_native_design(
        PrepareSolutionInputV2.model_validate(input_payload()),
        PrepareSolutionResponseV2.model_validate(payload),
    )


def test_repair_preserves_frozen_cases_but_can_rewrite_native_graph():
    value = repair_input()
    payload = candidate(value)
    payload["workflow"]["nodes"][2]["position"] = [460, 20]
    _validate_native_design(
        PrepareSolutionInputV2.model_validate(value),
        PrepareSolutionResponseV2.model_validate(payload),
    )
    payload["spec"]["acceptanceCases"][1]["expectedStatus"] = 200
    with pytest.raises(ValueError, match="frozen acceptance"):
        _validate_native_design(
            PrepareSolutionInputV2.model_validate(value),
            PrepareSolutionResponseV2.model_validate(payload),
        )


@pytest.mark.asyncio
async def test_graph_only_model_repair_retains_complete_server_owned_spec():
    value = repair_input()
    response = candidate(value)
    response.pop("spec")
    response["workflow"]["nodes"][2]["position"] = [460, 20]

    async def respond(_messages, info):
        assert (
            "spec" not in NativeGraphRepairResponseV2.model_json_schema()["properties"]
        )
        return ModelResponse(
            parts=[TextPart(json.dumps(response))],
            usage=RequestUsage(
                input_tokens=300, output_tokens=200, details={"thoughts_tokens": 100}
            ),
        )

    result = await PydanticAINativeSolutionPreparer(
        CountingFunctionModel(respond)
    ).prepare(PrepareSolutionInputV2.model_validate(value))
    actual = result.response.model_dump(mode="json", by_alias=True)
    assert actual["spec"] == value["draft"]["spec"]
    assert actual["workflow"]["nodes"][2]["position"] == [460, 20]
    assert actual["baseWorkflowHash"] == value["draft"]["workflowHash"]


def test_graph_only_repair_rejects_spec_replacement_and_stale_base():
    value = PrepareSolutionInputV2.model_validate(repair_input())
    response = candidate(repair_input())
    with pytest.raises(ValidationError):
        NativeGraphRepairResponseV2.model_validate(response)
    response.pop("spec")
    response["baseWorkflowHash"] = "b" * 64
    with pytest.raises(ValueError, match="latest native draft"):
        _complete_native_repair(
            value, NativeGraphRepairResponseV2.model_validate(response)
        )


def test_graph_only_repair_cannot_attach_new_credentials():
    value = repair_input()
    response = candidate(value)
    response.pop("spec")
    response["workflow"]["nodes"][0]["credentials"] = {
        "httpHeaderAuth": {"id": "invented"}
    }
    with pytest.raises(ValueError, match="credential"):
        _complete_native_repair(
            PrepareSolutionInputV2.model_validate(value),
            NativeGraphRepairResponseV2.model_validate(response),
        )


def test_native_failure_counters_cross_the_api_without_provider_content():
    safe = sanitize_failure_diagnostics(
        {
            "route": "native_repair",
            "status": "failed",
            "inputTokens": 17000,
            "outputTokens": 9000,
            "totalTokens": 26000,
            "reasoningTokens": 5000,
            "limitKind": "provider_output",
            "usageComplete": False,
            "rawProviderResponse": "not permitted",
            "prompt": "not permitted",
        }
    )
    assert safe["input_tokens"] == 17000
    assert safe["reasoning_tokens"] == 5000
    assert safe["limit_kind"] == "provider_output"
    assert safe["usage_complete"] is False
    assert "not permitted" not in json.dumps(safe)
    bounded = sanitize_failure_diagnostics(
        {
            "route": "native_repair",
            "status": "failed",
            "inputTokens": 2_000_001,
            "outputTokens": -1,
            "totalTokens": True,
            "reasoningTokens": "100",
            "limitKind": "raw provider exception",
            "usageComplete": "yes",
        }
    )
    assert bounded == {"route": "native_repair", "status": "failed"}


@pytest.mark.parametrize(
    "field", ["requirements", "inputSchema", "outputSchema", "runtimeProfile"]
)
def test_repair_cannot_weaken_the_frozen_business_contract(field):
    value = repair_input()
    payload = candidate(value)
    if field == "requirements":
        payload["spec"][field][0]["description"] = "Different weaker requirement"
    elif field == "runtimeProfile":
        payload["spec"][field] = "software_development"
    else:
        payload["spec"][field] = {"type": "object"}
    with pytest.raises(ValueError, match="frozen business contract"):
        _validate_native_design(
            PrepareSolutionInputV2.model_validate(value),
            PrepareSolutionResponseV2.model_validate(payload),
        )


@pytest.mark.asyncio
async def test_real_model_adapter_executor_has_no_tools_and_returns_native_graph():
    seen = []

    async def respond(messages, info):
        assert not info.function_tools
        query = next(
            part.content
            for message in reversed(messages)
            for part in message.parts
            if isinstance(part, UserPromptPart)
        )
        value = json.loads(query)
        seen.append(value)
        return ModelResponse(
            parts=[TextPart(json.dumps(candidate(value)))],
            model_name="gemini-3.8-flash",
        )

    executor = GeminiCognitiveExecutor(
        None,
        b"a" * 32,
        solution_preparer_v2=PydanticAINativeSolutionPreparer(
            CountingFunctionModel(respond)
        ),
    )
    result = await executor.execute(envelope())
    assert result.result_type == "solution_prepared"
    assert len(result.response.workflow["nodes"]) == 5
    assert result.response.spec.acceptance_cases[1].expected_status == 422
    assert seen == [input_payload()]
    assert result.metrics.model == "gemini-3.8-flash"
    # A FunctionModel does not provide a verified exact provider version.
    assert result.metrics.model_version is None
    assert result.metrics.search_calls == 0


@pytest.mark.parametrize("failure", ["json", "secret", "stale", "weakened_repair"])
@pytest.mark.asyncio
async def test_model_retry_bounded_without_fallback(failure):
    value = repair_input() if failure == "weakened_repair" else input_payload()
    calls = []

    async def respond(_messages, _info):
        calls.append(True)
        payload = candidate(value)
        if failure == "secret":
            payload["explanation"] = "sk-" + "x" * 30
        if failure == "stale":
            payload["inputVersion"] += 1
        if failure == "weakened_repair":
            payload["spec"]["acceptanceCases"][0]["expectedOutput"] = {"name": "wrong"}
        return ModelResponse(
            parts=[TextPart("{malformed" if failure == "json" else json.dumps(payload))]
        )

    with pytest.raises(CognitiveExecutionFailure) as error:
        await PydanticAINativeSolutionPreparer(CountingFunctionModel(respond)).prepare(
            PrepareSolutionInputV2.model_validate(value)
        )
    assert error.value.error_class == "AXWISE_NATIVE_SOLUTION_INVALID_DESIGN"
    assert error.value.retryable is False and len(calls) == 3


@pytest.mark.asyncio
async def test_internal_unvalidated_secret_never_reaches_model():
    async def respond(_messages, _info):
        raise AssertionError("No model call is permitted")

    value = PrepareSolutionInputV2.model_validate(input_payload()).model_copy(
        update={"instruction": "sk-" + "a" * 30}
    )
    with pytest.raises(
        CognitiveExecutionFailure, match="AXWISE_NATIVE_SOLUTION_INVALID_INPUT"
    ):
        await PydanticAINativeSolutionPreparer(CountingFunctionModel(respond)).prepare(
            value
        )


def test_native_budget_is_explicit_and_does_not_mutate_v1_model_settings():
    assert NATIVE_SOLUTION_PREPARATION_DEADLINE_SECONDS == 180
    assert SOLUTION_PREPARATION_DEADLINE_SECONDS == 90
    limits = _native_solution_usage_limits()
    assert limits.request_limit == 3
    assert limits.per_request_input_tokens_limit == 64_000
    assert limits.input_tokens_limit == 120_000
    assert limits.output_tokens_limit == 65_536
    assert limits.total_tokens_limit == 160_000
    assert limits.count_tokens_before_request is True
    assert limits.tool_calls_limit == 0
    model = CountingFunctionModel(lambda _messages, _info: ModelResponse(parts=[]))
    assert PydanticAINativeSolutionPreparer(model).agent.model_settings == {
        "max_tokens": 32_768
    }
    assert PydanticAISolutionPreparer(model).agent.model_settings is None


@pytest.mark.asyncio
async def test_observed_real_design_usage_fits_native_budget_without_a_live_call():
    async def respond(_messages, info):
        assert (
            info.model_settings["max_tokens"]
            == NATIVE_SOLUTION_PER_RESPONSE_OUTPUT_TOKENS
        )
        return ModelResponse(
            parts=[TextPart(json.dumps(candidate()))],
            usage=RequestUsage(input_tokens=23_513, output_tokens=20_930),
        )

    model = CountingFunctionModel(respond)
    model.counted_input_tokens = 23_513
    result = await PydanticAINativeSolutionPreparer(model).prepare(
        PrepareSolutionInputV2.model_validate(input_payload())
    )
    assert (result.input_tokens, result.output_tokens) == (23_513, 20_930)


@pytest.mark.parametrize(
    "limit", ["per_request_input", "input", "output", "total", "requests"]
)
@pytest.mark.asyncio
async def test_native_budget_exhaustion_is_terminal_and_stops_further_generation(
    limit, monkeypatch
):
    calls = []

    async def respond(_messages, _info):
        calls.append(True)
        usage = RequestUsage(input_tokens=100, output_tokens=100)
        if limit == "input":
            usage = RequestUsage(input_tokens=60_001, output_tokens=100)
        if limit == "output":
            usage = RequestUsage(input_tokens=100, output_tokens=23_000)
        if limit == "total":
            usage = RequestUsage(input_tokens=60_000, output_tokens=25_000)
        # Force a validation retry until the actual usage guard, not valid JSON,
        # terminates the run. Each mocked response stays under max_tokens.
        return ModelResponse(parts=[TextPart("{malformed")], usage=usage)

    model = CountingFunctionModel(respond)
    if limit == "per_request_input":
        model.counted_input_tokens = 64_001
    if limit == "input":
        model.counted_input_tokens = 60_001
    if limit == "total":
        model.counted_input_tokens = 60_000
    if limit == "requests":
        monkeypatch.setattr(
            "backend.services.workflow_v2.solution_preparation.NATIVE_SOLUTION_REQUEST_LIMIT",
            1,
        )
    with pytest.raises(CognitiveExecutionFailure) as error:
        await PydanticAINativeSolutionPreparer(model).prepare(
            PrepareSolutionInputV2.model_validate(input_payload())
        )
    assert error.value.error_class == "AXWISE_NATIVE_SOLUTION_BUDGET_EXHAUSTED"
    assert error.value.retryable is False
    assert (
        len(calls)
        == {"per_request_input": 0, "input": 1, "output": 3, "total": 2, "requests": 1}[
            limit
        ]
    )
    assert "malformed" not in str(error.value)
    expected_kind = "request" if limit == "requests" else limit
    assert error.value.diagnostics["limit_kind"] == expected_kind
    assert error.value.diagnostics["call_count"] == len(calls)
    assert "malformed" not in json.dumps(error.value.diagnostics)


@pytest.mark.parametrize("valid_json", [True, False])
@pytest.mark.asyncio
async def test_provider_output_cap_is_never_accepted_as_a_complete_native_design(
    valid_json,
):
    calls = []

    async def respond(_messages, _info):
        calls.append(True)
        return ModelResponse(
            parts=[TextPart(json.dumps(candidate()) if valid_json else "{malformed")],
            usage=RequestUsage(input_tokens=100, output_tokens=32_768),
            finish_reason="length",
        )

    with pytest.raises(CognitiveExecutionFailure) as error:
        await PydanticAINativeSolutionPreparer(CountingFunctionModel(respond)).prepare(
            PrepareSolutionInputV2.model_validate(input_payload())
        )
    assert error.value.error_class == "AXWISE_NATIVE_SOLUTION_BUDGET_EXHAUSTED"
    assert error.value.retryable is False
    assert len(calls) <= 3
    assert error.value.diagnostics["limit_kind"] == "provider_output"
    assert error.value.diagnostics["output_tokens"] >= 32_768


@pytest.mark.asyncio
async def test_native_model_timeout_not_success(monkeypatch):
    async def respond(_messages, _info):
        await asyncio.sleep(10)

    monkeypatch.setattr(
        "backend.services.workflow_v2.solution_preparation.NATIVE_SOLUTION_PREPARATION_DEADLINE_SECONDS",
        0.01,
    )
    with pytest.raises(CognitiveExecutionFailure) as error:
        await PydanticAINativeSolutionPreparer(CountingFunctionModel(respond)).prepare(
            PrepareSolutionInputV2.model_validate(input_payload())
        )
    assert (
        error.value.error_class == "AXWISE_SOLUTION_DESIGN_DEADLINE"
        and error.value.retryable is False
    )
    assert error.value.diagnostics["limit_kind"] == "deadline"
    assert error.value.diagnostics["usage_complete"] is False
    assert "output_tokens" not in error.value.diagnostics


@pytest.mark.asyncio
async def test_v1_deadline_behavior_remains_retryable(monkeypatch):
    async def respond(_messages, _info):
        await asyncio.sleep(10)

    monkeypatch.setattr(
        "backend.services.workflow_v2.solution_preparation.SOLUTION_PREPARATION_DEADLINE_SECONDS",
        0.01,
    )
    with pytest.raises(CognitiveExecutionFailure) as error:
        await PydanticAISolutionPreparer(FunctionModel(respond)).prepare(
            PrepareSolutionInputV1.model_validate(deepcopy(V1_FIXTURE["initialInput"]))
        )
    assert error.value.error_class == "AXWISE_SOLUTION_DESIGN_DEADLINE"
    assert error.value.retryable is True


@pytest.mark.parametrize(
    "operation_type,expected_retryable",
    [("PrepareSolutionV2", False), ("PrepareSolutionV1", True)],
)
@pytest.mark.asyncio
async def test_outer_cognitive_timeout_cannot_automatically_renew_native_budget(
    operation_type, expected_retryable, monkeypatch
):
    async def timeout_before_dispatch(coroutine, **_kwargs):
        coroutine.close()
        raise asyncio.TimeoutError

    monkeypatch.setattr(
        "backend.services.workflow_v2.cognitive_executor.asyncio.wait_for",
        timeout_before_dispatch,
    )
    request = envelope().model_copy(update={"operation_type": operation_type})
    with pytest.raises(CognitiveExecutionFailure) as error:
        await GeminiCognitiveExecutor(None, b"a" * 32).execute(request)
    assert error.value.error_class == "AXWISE_OPERATION_DEADLINE"
    assert error.value.retryable is expected_retryable


@pytest.mark.asyncio
async def test_api_registry_accepts_idempotent_v2_and_polls_exact_result(monkeypatch):
    monkeypatch.setenv("AXWISE_SERVICE_URL", "https://axwise.preview.test")
    app, store = FastAPI(), ApiStore()
    app.include_router(router)
    app.dependency_overrides[get_operation_service] = lambda: OperationService(store)
    payload = envelope().model_dump(mode="json", by_alias=True)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="https://axwise.preview.test"
    ) as client:
        accepted = await client.post(
            "/v2/operations",
            json=payload,
            headers={"Idempotency-Key": payload["operationId"]},
        )
        assert accepted.status_code == 202
        replay = await client.post(
            "/v2/operations",
            json=payload,
            headers={"Idempotency-Key": payload["operationId"]},
        )
        assert replay.status_code == 202
        store.record = replace(
            store.record,
            status="completed",
            result_payload={"resultType": "solution_prepared", "response": candidate()},
        )
        response = await client.get(accepted.json()["statusUrl"])
        assert response.status_code == 200
        assert response.json()["result"]["response"] == candidate()
        assert response.json()["canonicalInputHash"] == payload["canonicalInputHash"]
        payload["input"]["inputVersion"] += 1
        stale = await client.post(
            "/v2/operations",
            json=payload,
            headers={"Idempotency-Key": payload["operationId"]},
        )
        assert stale.status_code == 422


def test_native_json_limits_and_prototype_keys():
    for value in ({"constructor": {}}, {"a": float("inf")}, {"a": "x" * 192_001}):
        with pytest.raises(ValueError):
            validate_native_json(value, max_bytes=192_000)
    deep = {}
    for _ in range(26):
        deep = {"a": deep}
    with pytest.raises(ValueError):
        validate_native_json(deep)


def test_additive_007_migration_has_no_new_authority_and_is_in_ci():
    path = ROOT / "backend/database/workflow_v2/007_prepare_solution_v2.sql"
    sql = path.read_text()
    assert "'PrepareSolutionV1'" in sql and "'PrepareSolutionV2'" in sql
    assert "GRANT " not in sql and "DISABLE ROW LEVEL SECURITY" not in sql
    assert "lock_timeout" in sql and "statement_timeout" in sql
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest() + "  " + path.name
        in (path.parent / "SCHEMA_SHA256").read_text()
    )
    assert (
        "--file=backend/database/workflow_v2/007_prepare_solution_v2.sql"
        in (ROOT / ".github/workflows/workflow-v2.yml").read_text()
    )
