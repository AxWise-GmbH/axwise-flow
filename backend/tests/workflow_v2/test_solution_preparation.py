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

from backend.api.routes.workflow_v2_operations import get_operation_service, router
from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    PrepareSolutionInputV1,
    PrepareSolutionResponseV1,
    canonical_hash,
)
from backend.services.workflow_v2.cognitive_executor import GeminiCognitiveExecutor
from backend.services.workflow_v2.operation_service import (
    CognitiveExecutionFailure,
    OperationService,
)
from backend.services.workflow_v2.solution_preparation import (
    GroundedSolutionDesignV1,
    PydanticAISolutionPreparer,
    _validate_design,
)
from backend.tests.workflow_v2.test_operation_api import Store as ApiStore

pytestmark = pytest.mark.contract
ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads(
    (Path(__file__).with_name("fixtures") / "prepare_solution_v1.json").read_text()
)


def envelope(input_value=None):
    value = deepcopy(input_value or FIXTURE["initialInput"])
    return AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000609",
            "operationType": "PrepareSolutionV1",
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000608",
                "organizationId": None,
                "userId": "user_solutiontest123",
            },
            "workflow": {
                "runId": value["source"]["runId"],
                "stageId": value["buildRequestId"],
                "stageAttemptId": "00000000-0000-4000-8000-000000000609",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": canonical_hash(value),
            "input": value,
        }
    )


def model_output(key="needsInput"):
    value = deepcopy(FIXTURE[key])
    if key == "unsupported":
        return {
            **value,
            "requestedCapabilities": ["provider_action", "credentials"],
            "fieldEvidence": [],
        }
    return {
        **value,
        "requestedCapabilities": ["webhook_transform_v1"],
        "fieldEvidence": [
            {
                "sourceQuote": "email",
                "targetQuote": "contactEmail" if key == "candidate" else None,
                "transformQuote": "lowercases the email field",
            }
        ],
    }


@pytest.mark.parametrize("key", ["initialInput", "answeredInput"])
def test_typed_input_roundtrip_and_exact_envelope(key):
    value = FIXTURE[key]
    assert (
        PrepareSolutionInputV1.model_validate(value).model_dump(
            mode="json", by_alias=True
        )
        == value
    )
    assert envelope(value).canonical_input_hash == canonical_hash(value)


@pytest.mark.parametrize("key", ["needsInput", "candidate", "unsupported"])
def test_typed_completion_roundtrip(key):
    value = FIXTURE[key]
    assert (
        PrepareSolutionResponseV1.model_validate(value).model_dump(
            mode="json", by_alias=True
        )
        == value
    )
    result = TypeAdapter(CompletionResult).validate_python(
        {"resultType": "solution_prepared", "response": value}
    )
    assert result.response.outcome == value["outcome"]


@pytest.mark.parametrize(
    "change",
    [
        lambda value: value["spec"]["fields"][0].update(transform="eval"),
        lambda value: value["spec"]["fields"][0].update(source="email.toString()"),
        lambda value: value["spec"]["fields"][0].update(target="constructor"),
        lambda value: value["spec"].update(credentials={"provider": "secret"}),
        lambda value: value.update(workflow={"nodes": []}),
        lambda value: value["partialFields"][0].update(target="other"),
        lambda value: value.update(questions=FIXTURE["needsInput"]["questions"]),
        lambda value: value["spec"]["fields"].append(value["spec"]["fields"][0]),
    ],
)
def test_unsafe_or_inconsistent_candidate_rejected(change):
    value = deepcopy(FIXTURE["candidate"])
    change(value)
    with pytest.raises(ValidationError):
        PrepareSolutionResponseV1.model_validate(value)


def test_unknown_output_name_is_retained_without_a_spec():
    design = GroundedSolutionDesignV1.model_validate(model_output())
    _validate_design(
        PrepareSolutionInputV1.model_validate(FIXTURE["initialInput"]), design
    )
    assert design.partial_fields[0].target is None
    assert design.spec is None


def test_fabricated_output_name_is_rejected_even_when_structurally_valid():
    value = model_output("candidate")
    value["inputVersion"] = 1
    value["fieldEvidence"][0]["targetQuote"] = "contactEmail"
    with pytest.raises(ValueError, match="Do not invent"):
        _validate_design(
            PrepareSolutionInputV1.model_validate(FIXTURE["initialInput"]),
            GroundedSolutionDesignV1.model_validate(value),
        )


def test_unsupported_effect_cannot_be_hidden_in_a_webhook_candidate():
    value = model_output("candidate")
    value["requestedCapabilities"].append("provider_action")
    with pytest.raises(ValueError, match="unsupported"):
        _validate_design(
            PrepareSolutionInputV1.model_validate(FIXTURE["answeredInput"]),
            GroundedSolutionDesignV1.model_validate(value),
        )


@pytest.mark.parametrize(
    "prompt",
    [
        "Paste your API key",
        "What is the password?",
        "Register an account for this workflow",
    ],
)
def test_questions_cannot_be_a_secret_or_registration_flow(prompt):
    value = model_output()
    value["questions"][0]["prompt"] = prompt
    with pytest.raises(ValueError, match="non-secret"):
        _validate_design(
            PrepareSolutionInputV1.model_validate(FIXTURE["initialInput"]),
            GroundedSolutionDesignV1.model_validate(value),
        )


def test_design_cannot_rebind_version_or_reask_answered_id():
    initial = PrepareSolutionInputV1.model_validate(FIXTURE["initialInput"])
    value = model_output()
    value["inputVersion"] = 2
    with pytest.raises(ValueError, match="exact current"):
        _validate_design(initial, GroundedSolutionDesignV1.model_validate(value))
    answered = PrepareSolutionInputV1.model_validate(FIXTURE["answeredInput"])
    with pytest.raises(ValueError, match="already answered"):
        _validate_design(answered, GroundedSolutionDesignV1.model_validate(value))


@pytest.mark.asyncio
async def test_real_model_adapter_receives_scoped_context_and_resumes_after_answer():
    requests = []

    async def respond(messages, info):
        assert not info.function_tools
        request = next(
            part.content
            for message in reversed(messages)
            for part in message.parts
            if isinstance(part, UserPromptPart)
        )
        payload = json.loads(request)
        requests.append(payload)
        return ModelResponse(
            parts=[
                TextPart(
                    json.dumps(
                        model_output(
                            "candidate"
                            if payload["inputVersion"] == 2
                            else "needsInput"
                        )
                    )
                )
            ],
            model_name="gemini-3.8-flash",
        )

    preparer = PydanticAISolutionPreparer(FunctionModel(respond))
    executor = GeminiCognitiveExecutor(None, b"a" * 32, solution_preparer=preparer)
    paused = await executor.execute(envelope())
    assert paused.result_type == "solution_prepared"
    assert paused.response.outcome == "needs_input"
    assert paused.response.spec is None
    resumed = await executor.execute(envelope(FIXTURE["answeredInput"]))
    assert resumed.response.outcome == "candidate"
    assert resumed.response.spec.fields[0].target == "contactEmail"
    assert resumed.metrics.provider == "google"
    assert resumed.metrics.model == "gemini-3.8-flash"
    assert resumed.metrics.search_calls == 0
    assert requests == [FIXTURE["initialInput"], FIXTURE["answeredInput"]]
    wire = resumed.response.model_dump(mode="json", by_alias=True)
    assert "fieldEvidence" not in wire and "requestedCapabilities" not in wire
    assert "workflow" not in wire


@pytest.mark.asyncio
async def test_model_unsupported_sms_has_no_substitute_draft():
    calls = []

    async def respond(messages, _info):
        calls.append(messages)
        return ModelResponse(parts=[TextPart(json.dumps(model_output("unsupported")))])

    value = deepcopy(FIXTURE["initialInput"])
    value["instruction"] = "Build an SMS gateway using a provider account."
    prepared = await PydanticAISolutionPreparer(FunctionModel(respond)).prepare(
        PrepareSolutionInputV1.model_validate(value)
    )
    assert len(calls) == 1
    assert prepared.response.outcome == "unsupported"
    assert prepared.response.partial_fields == [] and prepared.response.spec is None


@pytest.mark.asyncio
async def test_model_validation_retry_is_bounded_and_never_falls_back_to_demo():
    calls = []

    async def respond(_messages, _info):
        calls.append(True)
        value = model_output("candidate")
        value["inputVersion"] = 1
        return ModelResponse(parts=[TextPart(json.dumps(value))])

    with pytest.raises(CognitiveExecutionFailure) as error:
        await PydanticAISolutionPreparer(FunctionModel(respond)).prepare(
            PrepareSolutionInputV1.model_validate(FIXTURE["initialInput"])
        )
    assert error.value.error_class == "AXWISE_SOLUTION_INVALID_DESIGN"
    assert error.value.retryable is False
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_obvious_secret_is_rejected_before_model_call():
    calls = []

    async def respond(_messages, _info):
        calls.append(True)
        raise AssertionError("model must not receive the secret")

    value = deepcopy(FIXTURE["initialInput"])
    value["instruction"] = "Use sk-" + "a" * 30
    with pytest.raises(CognitiveExecutionFailure) as error:
        await PydanticAISolutionPreparer(FunctionModel(respond)).prepare(
            PrepareSolutionInputV1.model_validate(value)
        )
    assert error.value.error_class == "AXWISE_SOLUTION_SECRET_INPUT"
    assert calls == []


@pytest.mark.asyncio
async def test_provider_timeout_is_unknown_design_failure_not_candidate(monkeypatch):
    async def respond(_messages, _info):
        await asyncio.sleep(10)

    monkeypatch.setattr(
        "backend.services.workflow_v2.solution_preparation.SOLUTION_PREPARATION_DEADLINE_SECONDS",
        0.01,
    )
    with pytest.raises(CognitiveExecutionFailure) as error:
        await PydanticAISolutionPreparer(FunctionModel(respond)).prepare(
            PrepareSolutionInputV1.model_validate(FIXTURE["initialInput"])
        )
    assert error.value.error_class == "AXWISE_SOLUTION_DESIGN_DEADLINE"
    assert error.value.retryable is True


@pytest.mark.asyncio
async def test_operation_api_accepts_and_polls_typed_completed_design(monkeypatch):
    monkeypatch.setenv("AXWISE_SERVICE_URL", "https://axwise.preview.test")
    app = FastAPI()
    app.include_router(router)
    store = ApiStore()
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
        store.record = replace(
            store.record,
            status="completed",
            result_payload={
                "resultType": "solution_prepared",
                "response": FIXTURE["needsInput"],
            },
        )
        response = await client.get(accepted.json()["statusUrl"])
        assert response.status_code == 200
        assert response.json()["result"]["response"]["outcome"] == "needs_input"
        assert response.json()["canonicalInputHash"] == payload["canonicalInputHash"]


def test_additive_migration_preserves_ownership_and_is_in_ci():
    sql_path = ROOT / "backend/database/workflow_v2/006_prepare_solution.sql"
    sql = sql_path.read_text()
    assert "'PrepareSolutionV1'" in sql
    assert "GRANT " not in sql and "DISABLE ROW LEVEL SECURITY" not in sql
    assert "tenant_stage_attempt" not in sql
    assert "lock_timeout" in sql and "statement_timeout" in sql
    checksums = (sql_path.parent / "SCHEMA_SHA256").read_text()
    assert (
        hashlib.sha256(sql_path.read_bytes()).hexdigest() + "  " + sql_path.name
        in checksums
    )
    assert (
        "--file=backend/database/workflow_v2/006_prepare_solution.sql"
        in (ROOT / ".github/workflows/workflow-v2.yml").read_text()
    )
