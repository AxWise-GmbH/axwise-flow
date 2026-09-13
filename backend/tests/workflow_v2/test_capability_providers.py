"""Real pinned Google SDK on a fake transport; never source/cloud/network work."""

from __future__ import annotations

import asyncio
import copy
import gc
from dataclasses import replace
import hashlib
import json
import socket
import ssl
import time
from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest
from opentelemetry import context as telemetry_context

from backend.domain.workflow_v2.capability_limits import CapabilityLimitsV1
from backend.domain.workflow_v2.contracts import canonical_hash
from backend.domain.workflow_v2.simulation import (
    SimulationCandidateV1,
    SimulationGroundingPassageV1,
    simulation_plan,
)
from backend.domain.workflow_v2.transcript_corpus import (
    CorpusArtifactRefV1,
    validate_transcript_corpus,
)
from backend.services.llm.gemini_runtime import RESEARCH_MODEL, RESEARCH_MODEL_RESOURCE
from backend.services.workflow_v2 import capability_providers as providers
from backend.services.workflow_v2.analysis_service import AnalysisGenerationContext
from backend.services.workflow_v2.capability_generation_payloads import (
    analysis_generation_payload,
    simulation_generation_payload,
)
from backend.services.workflow_v2.capability_processing import issue_processing_permit
from backend.services.workflow_v2.cognitive_executor import GeminiCognitiveExecutor
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.simulation_service import SimulationGenerationContext
from backend.tests.workflow_v2.analysis_test_support import (
    AUTHORITY_KEY,
    Resolver,
    analysis_input,
    candidate as analysis_candidate,
    corpus,
    corpus_fact,
    document,
    envelope,
    scope_fact,
    uid,
)
from backend.tests.workflow_v2.simulation_test_support import (
    research_fact,
    simulation_input,
)
from backend.tests.workflow_v2.test_simulation_contracts import (
    candidate as simulation_candidate,
)


pytestmark = pytest.mark.contract
API_KEY = "synthetic-offline-only-key"
KINDS = ["AnalyzeEvidenceV1", "SimulateV1"]
_ABSENT = object()


@pytest.fixture(autouse=True)
async def drain_sdk_finalizers():
    yield
    # The pinned SDK schedules redundant aclose tasks from __del__ even after
    # explicit close. Drain them while each isolated test loop is still alive;
    # production transports are independently asserted closed on every path.
    gc.collect()
    await asyncio.sleep(0)
    gc.collect()
    await asyncio.sleep(0)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def fail(*_args, **_kwargs):
        raise AssertionError("capability provider tests must not use network or DNS")

    for name in ("connect", "connect_ex"):
        monkeypatch.setattr(socket.socket, name, fail)
    for name in (
        "create_connection",
        "getaddrinfo",
        "gethostbyname",
        "gethostbyname_ex",
        "gethostbyaddr",
    ):
        monkeypatch.setattr(socket, name, fail)


def fixture(kind, *, permit=True, selected=False, **limit_overrides):
    scope = scope_fact()
    if kind == "AnalyzeEvidenceV1":
        source = corpus_fact(corpus(document(text="Café é 🧭\r\nUpdates stay exact.")))
        operation = envelope(analysis_input(scope=scope, source=source))
        context = AnalysisGenerationContext(
            corpus=validate_transcript_corpus(source.payload),
            request=operation.input.request,
            accepted_scope=CorpusArtifactRefV1.model_validate(
                operation.input.accepted_scope.model_dump(mode="json", by_alias=True)
            ),
            source_artifacts=(
                CorpusArtifactRefV1.model_validate(
                    operation.input.source.artifact.model_dump(
                        mode="json", by_alias=True
                    )
                ),
            ),
            operation_id=operation.operation_id,
        )
        plan = None
        payload = analysis_generation_payload(context.corpus, context.request)
        candidate = analysis_candidate(context).model_dump(mode="json", by_alias=True)
    else:
        source = (
            research_fact(text="Only this selected observation is approved.")
            if selected
            else None
        )
        entries = (
            [
                next(
                    row
                    for row in source.payload["selectedClaims"]
                    if row["text"].startswith("Only this")
                )
            ]
            if source
            else None
        )
        operation = envelope(
            simulation_input(scope=scope, source=source, entries=entries)
        )
        grounding = ()
        if source:
            selection = operation.input.selected_grounding[0]
            grounding = (
                SimulationGroundingPassageV1.model_validate(
                    {
                        **selection.model_dump(mode="json", by_alias=True),
                        "text": entries[0]["text"],
                        "textSha256": hashlib.sha256(
                            entries[0]["text"].encode()
                        ).hexdigest(),
                    }
                ),
            )
        context = SimulationGenerationContext(
            request=operation.input.request,
            operation_id=operation.operation_id,
            accepted_scope=CorpusArtifactRefV1.model_validate(
                operation.input.accepted_scope.model_dump(mode="json", by_alias=True)
            ),
            grounding=grounding,
        )
        plan = simulation_plan(context.request, operation_id=context.operation_id)
        payload = simulation_generation_payload(
            context.request, plan, context.grounding
        )
        candidate = simulation_candidate(
            context.request, operation=context.operation_id
        )
    limits = CapabilityLimitsV1.model_validate(
        {
            **operation.input.limits.model_dump(mode="json", by_alias=True),
            **limit_overrides,
        }
    )
    deadline = time.monotonic() + min(limits.deadline_ms / 1000, 60)
    if permit:
        context = replace(
            context,
            processing_permit=issue_processing_permit(
                operation, provider_payload=payload, deadline=deadline
            ),
        )
    return SimpleNamespace(
        kind=kind,
        operation=operation,
        scope=scope,
        source=source,
        context=context,
        plan=plan,
        payload=payload,
        candidate=candidate,
        limits=limits,
        deadline=deadline,
    )


def response_payload(
    candidate, *, usage=_ABSENT, version="gemini-3.8-flash-20260901", finish="STOP"
):
    raw = {
        "candidates": [
            {
                "content": {
                    "role": "model",
                    "parts": [{"text": json.dumps(candidate, ensure_ascii=False)}],
                },
                "finishReason": finish,
                "index": 0,
            }
        ],
        "modelVersion": version,
    }
    if usage is _ABSENT:
        usage = {
            "promptTokenCount": 20,
            "candidatesTokenCount": 10,
            "thoughtsTokenCount": 5,
            "totalTokenCount": 35,
        }
    if usage is not None:
        raw["usageMetadata"] = usage
    return raw


class ProviderHarness:
    def __init__(self, monkeypatch, data, *, count=20, response=None, handler=None):
        self.data = data
        self.requests = []
        self.sdk_constructions = []
        self.transport_constructions = 0
        self.closes = 0
        self.count = count
        self.response = (
            response if response is not None else response_payload(data.candidate)
        )
        self.handler = handler
        original_client = providers.GoogleGenAIClient

        def sdk(**kwargs):
            self.sdk_constructions.append(kwargs)
            return original_client(**kwargs)

        harness = self

        class Transport(httpx.MockTransport):
            async def aclose(self):
                harness.closes += 1
                await super().aclose()

        def make_transport():
            self.transport_constructions += 1
            return Transport(self.respond)

        monkeypatch.setattr(providers, "GoogleGenAIClient", sdk)
        monkeypatch.setattr(providers, "_new_http_transport", make_transport)

    async def respond(self, request):
        self.requests.append(request)
        assert (
            telemetry_context.get_value(telemetry_context._SUPPRESS_INSTRUMENTATION_KEY)
            is True
        )
        assert (
            telemetry_context.get_value(
                telemetry_context._SUPPRESS_HTTP_INSTRUMENTATION_KEY
            )
            is True
        )
        if self.handler:
            return await self.handler(request)
        if request.url.path.endswith(":countTokens"):
            return httpx.Response(200, json={"totalTokens": self.count})
        return httpx.Response(200, json=self.response)

    def generator(self):
        cls = (
            providers.GoogleAnalysisGenerator
            if self.data.kind == "AnalyzeEvidenceV1"
            else providers.GoogleSimulationGenerator
        )
        return cls(API_KEY)

    async def run(self, *, context=None, plan=_ABSENT, limits=None, deadline=None):
        context = context if context is not None else self.data.context
        options = {
            "limits": limits if limits is not None else self.data.limits,
            "deadline": deadline if deadline is not None else self.data.deadline,
        }
        if self.data.kind == "AnalyzeEvidenceV1":
            return await self.generator().analyze(context, **options)
        return await self.generator().generate(
            context, self.data.plan if plan is _ABSENT else plan, **options
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
async def test_real_sdk_exact_disclosed_payload_and_single_bounded_generation(
    monkeypatch, kind
):
    data = fixture(kind, selected=True)
    harness = ProviderHarness(monkeypatch, data)
    before = telemetry_context.get_value(
        telemetry_context._SUPPRESS_INSTRUMENTATION_KEY
    )
    result = await harness.run()
    assert result.candidate.model_dump(mode="json", by_alias=True) == data.candidate
    assert (result.model_calls, result.input_tokens, result.output_tokens) == (
        1,
        20,
        15,
    )
    assert (result.provider, result.model, result.model_version) == (
        "google",
        RESEARCH_MODEL,
        "gemini-3.8-flash-20260901",
    )
    assert (
        len(harness.sdk_constructions)
        == harness.transport_constructions
        == harness.closes
        == 1
    )
    assert len(harness.requests) == 2
    count, generation = (json.loads(request.content) for request in harness.requests)
    assert count["contents"] == generation["contents"]
    prompt = json.loads(count["contents"][0]["parts"][0]["text"])
    assert set(prompt) == {"instructions", "candidateSchema", "reviewedPayload"}
    assert prompt["reviewedPayload"] == data.payload
    assert generation["generationConfig"] == {
        "responseMimeType": "application/json",
        "candidateCount": 1,
        "maxOutputTokens": data.limits.max_output_tokens,
        "thinkingConfig": {"thinking_level": "HIGH", "include_thoughts": False},
    }
    for request in harness.requests:
        assert str(request.url).startswith(
            f"https://generativelanguage.googleapis.com/v1beta/{RESEARCH_MODEL_RESOURCE}:"
        )
        assert not request.url.query
        assert set(request.headers) == {
            "host",
            "content-length",
            "content-type",
            "accept",
            "accept-encoding",
            "x-goog-api-key",
        }
        assert request.headers["x-goog-api-key"] == API_KEY
        assert request.headers["accept-encoding"] == "identity"
        for value in (
            str(data.operation.operation_id),
            data.operation.owner.user_id,
            str(data.operation.owner.tenant_id),
            data.operation.input.scope.authority.seal,
        ):
            assert value not in request.content.decode()
    if kind == "SimulateV1":
        wire = harness.requests[1].content.decode()
        assert "Only this selected observation is approved." in wire
        assert "must not be selected implicitly" not in wire
        assert str(data.source.artifact_id) not in wire
        assert data.operation.input.selected_grounding[0].entry_id not in wire
    options = harness.sdk_constructions[0]
    assert options["enterprise"] is False
    assert options["debug_config"].model_dump() == {
        "client_mode": None,
        "replays_directory": None,
        "replay_id": None,
    }
    assert options["http_options"].base_url == providers.GOOGLE_CAPABILITY_BASE_URL
    assert options["http_options"].retry_options.attempts == 1
    assert options["http_options"].httpx_client.is_closed
    assert options["http_options"].httpx_async_client.is_closed
    assert (
        telemetry_context.get_value(telemetry_context._SUPPRESS_INSTRUMENTATION_KEY)
        == before
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "drift",
    ["missing", "issuer", "purpose", "operation", "hash", "expired", "permit_limits"],
)
async def test_no_provider_or_transport_construction_without_exact_permit(
    monkeypatch, kind, drift
):
    data = fixture(kind)
    harness = ProviderHarness(monkeypatch, data)
    permit = data.context.processing_permit
    changes = {
        "issuer": {"_issuer": object()},
        "purpose": {"purpose": "other"},
        "operation": {"operation_id": UUID(uid(999))},
        "hash": {"provider_payload_hash": "0" * 64},
        "expired": {"deadline": time.monotonic() - 1},
        "permit_limits": {
            "limits": permit.limits.model_copy(update={"max_model_calls": True})
        },
    }
    context = replace(
        data.context,
        processing_permit=(
            None if drift == "missing" else replace(permit, **changes[drift])
        ),
    )
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run(context=context)
    assert caught.value.error_class == "AXWISE_CAPABILITY_PROCESSING_CONSENT_INVALID"
    assert caught.value.retryable is False
    assert (
        not harness.requests
        and not harness.sdk_constructions
        and not harness.transport_constructions
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("deadline", [True, float("nan"), float("inf"), "future", -1])
async def test_bad_deadline_never_constructs_sdk(monkeypatch, kind, deadline):
    data = fixture(kind)
    harness = ProviderHarness(monkeypatch, data)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run(deadline=deadline)
    assert caught.value.retryable is False
    assert (
        not harness.requests
        and not harness.sdk_constructions
        and not harness.transport_constructions
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
async def test_changed_reviewed_payload_cannot_reuse_permit(monkeypatch, kind):
    data = fixture(kind)
    harness = ProviderHarness(monkeypatch, data)
    if kind == "AnalyzeEvidenceV1":
        request = data.context.request.model_copy(
            update={"decision_question": "A changed question"}
        )
    else:
        request = data.context.request.model_copy(update={"response_style": "concise"})
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run(context=replace(data.context, request=request))
    assert caught.value.retryable is False
    assert (
        not harness.requests
        and not harness.sdk_constructions
        and not harness.transport_constructions
    )


@pytest.mark.asyncio
async def test_simulation_rejects_changed_plan_before_provider_creation(monkeypatch):
    data = fixture("SimulateV1")
    harness = ProviderHarness(monkeypatch, data)
    plan = (data.plan[0].model_copy(update={"participant_id": UUID(uid(999))}),)
    with pytest.raises(CognitiveExecutionFailure, match="INVALID_INPUT"):
        await harness.run(plan=plan)
    assert not harness.sdk_constructions and not harness.transport_constructions


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("count", [None, True, 1.5, "20", -1, 0, 120001])
async def test_token_preflight_must_be_known_and_within_full_prompt_budget(
    monkeypatch, kind, count
):
    data = fixture(kind)
    harness = ProviderHarness(monkeypatch, data, count=count)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run()
    assert caught.value.retryable is False
    assert len(harness.requests) == 1
    assert harness.requests[0].url.path.endswith(":countTokens")
    assert harness.closes == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "usage,expected",
    [
        (None, (None, None)),
        ({"promptTokenCount": 20}, (20, None)),
        ({"candidatesTokenCount": 10}, (None, None)),
        ({"promptTokenCount": 20, "candidatesTokenCount": 10}, (20, None)),
        ({"candidatesTokenCount": 10, "thoughtsTokenCount": 5}, (None, 15)),
        ({"promptTokenCount": 20, "totalTokenCount": 35}, (20, 15)),
        (
            {
                "promptTokenCount": 20,
                "candidatesTokenCount": 10,
                "thoughtsTokenCount": 0,
            },
            (20, 10),
        ),
    ],
)
async def test_unknown_usage_is_not_inferred_from_preflight_or_missing_thought_counts(
    monkeypatch, kind, usage, expected
):
    data = fixture(kind)
    harness = ProviderHarness(
        monkeypatch, data, response=response_payload(data.candidate, usage=usage)
    )
    result = await harness.run()
    assert (result.input_tokens, result.output_tokens) == expected
    assert result.model_calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "usage",
    [
        {"promptTokenCount": True},
        {"promptTokenCount": "20"},
        {"promptTokenCount": 1.5},
        {"promptTokenCount": -1},
        {"promptTokenCount": 0},
        {"candidatesTokenCount": 0, "thoughtsTokenCount": 5},
        {"promptTokenCount": 120001},
        {"candidatesTokenCount": 65537},
        {"thoughtsTokenCount": 65537},
        {"candidatesTokenCount": 65000, "thoughtsTokenCount": 1000},
        {"promptTokenCount": 20, "totalTokenCount": 19},
        {"promptTokenCount": 20, "totalTokenCount": 20},
        {
            "promptTokenCount": 20,
            "candidatesTokenCount": 10,
            "thoughtsTokenCount": 5,
            "totalTokenCount": 34,
        },
        {"promptTokenCount": 20, "cachedContentTokenCount": 21},
        {"toolUsePromptTokenCount": 1},
    ],
)
async def test_invalid_or_excess_usage_is_terminal_and_never_repaired(
    monkeypatch, kind, usage
):
    data = fixture(kind)
    harness = ProviderHarness(
        monkeypatch, data, response=response_payload(data.candidate, usage=usage)
    )
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run()
    assert caught.value.retryable is False
    assert len(harness.requests) == 2 and harness.closes == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["countTokens", "generateContent"])
@pytest.mark.parametrize("status", [307, 408, 429, 500, 503])
async def test_actual_sdk_http_failures_never_retry_or_expose_provider_body(
    monkeypatch, caplog, phase, status
):
    data = fixture("AnalyzeEvidenceV1")
    secret = "synthetic-provider-error-body-must-stay-private"

    async def handler(request):
        if request.url.path.endswith(":" + phase):
            return httpx.Response(
                status,
                json={"error": {"message": secret}},
                headers={"location": "https://unapproved.invalid/"},
            )
        return httpx.Response(200, json={"totalTokens": 20})

    harness = ProviderHarness(monkeypatch, data, handler=handler)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run()
    assert caught.value.error_class == "AXWISE_ANALYSIS_PROVIDER_FAILED"
    assert caught.value.retryable is False
    assert secret not in str(caught.value) and secret not in caplog.text
    assert len(harness.requests) == (1 if phase == "countTokens" else 2)
    assert harness.closes == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
async def test_ambiguous_generation_network_failure_is_terminal_without_retry(
    monkeypatch, kind
):
    data = fixture(kind)

    async def handler(request):
        if request.url.path.endswith(":countTokens"):
            return httpx.Response(200, json={"totalTokens": 20})
        raise httpx.RemoteProtocolError(
            "synthetic error after request may have been accepted"
        )

    harness = ProviderHarness(monkeypatch, data, handler=handler)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run()
    assert caught.value.retryable is False
    assert caught.value.__suppress_context__ is True
    assert len(harness.requests) == 2 and harness.closes == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
async def test_actual_owned_handler_publishes_receipts_and_terminal_provider_failures(
    monkeypatch, kind
):
    data = fixture(kind, selected=True)
    harness = ProviderHarness(monkeypatch, data)
    resolver = Resolver(data.scope)
    if data.source is not None:
        resolver.add(
            data.source,
            operation_type=(
                "ExecuteResearchV2"
                if kind == "SimulateV1"
                else "AdmitTranscriptCorpusV1"
            ),
        )
    executor = GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=resolver,
        analysis_generator=harness.generator() if kind == "AnalyzeEvidenceV1" else None,
        simulation_generator=harness.generator() if kind == "SimulateV1" else None,
    )
    result = await executor.execute(data.operation)
    assert result.metrics.provider == "google"
    assert result.metrics.model == RESEARCH_MODEL
    assert result.metrics.model_calls == 1 and result.metrics.usage_complete is True
    assert (
        result.metrics.input_tokens,
        result.metrics.output_tokens,
        result.metrics.total_tokens,
    ) == (20, 15, 35)
    assert (
        result.metrics.estimated_cost_micros is None
        and result.metrics.search_calls == 0
    )
    harness.response = response_payload(data.candidate, finish="MAX_TOKENS")
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await executor.execute(data.operation)
    assert caught.value.retryable is False


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "ownership", ["tenant", "user", "run", "producer", "authority"]
)
async def test_owned_source_and_scope_authority_fail_before_provider_construction(
    monkeypatch, kind, ownership
):
    data = fixture(kind, selected=True)
    harness = ProviderHarness(monkeypatch, data)
    resolver = Resolver(data.scope)
    if data.source is not None:
        resolver.add(
            data.source,
            operation_type=(
                "ExecuteResearchV2"
                if kind == "SimulateV1"
                else "AdmitTranscriptCorpusV1"
            ),
        )
    if ownership != "authority":
        resolver.facts[str(data.source.artifact_id)][
            ownership
        ] = "unowned-synthetic-value"
    executor = GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=(
            b"wrong-synthetic-authority-key-of-sufficient-length"
            if ownership == "authority"
            else AUTHORITY_KEY
        ),
        artifact_resolver=resolver,
        analysis_generator=harness.generator() if kind == "AnalyzeEvidenceV1" else None,
        simulation_generator=harness.generator() if kind == "SimulateV1" else None,
    )
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await executor.execute(data.operation)
    assert caught.value.retryable is False
    assert (
        not harness.requests
        and not harness.sdk_constructions
        and not harness.transport_constructions
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
async def test_host_proxy_endpoint_replay_and_certificate_environment_cannot_change_request(
    monkeypatch, kind
):
    data = fixture(kind)
    for name, value in {
        "HTTPS_PROXY": "http://unapproved-proxy.invalid:9999",
        "ALL_PROXY": "http://unapproved-proxy.invalid:9999",
        "GOOGLE_GEMINI_BASE_URL": "https://unapproved-provider.invalid/",
        "GOOGLE_VERTEX_BASE_URL": "https://unapproved-provider.invalid/",
        "GOOGLE_GENAI_USE_ENTERPRISE": "true",
        "GOOGLE_GENAI_USE_VERTEXAI": "true",
        "GOOGLE_GENAI_CLIENT_MODE": "record",
        "GOOGLE_GENAI_REPLAYS_DIRECTORY": "/unapproved-capability-replay-path",
        "GOOGLE_GENAI_REPLAY_ID": "unapproved-replay-id",
        "SSL_CERT_FILE": "/unapproved-capability-certificate-path",
        "SSL_CERT_DIR": "/unapproved-capability-certificate-directory",
        "SSLKEYLOGFILE": "/unapproved-capability-keylog-path",
        "GOOGLE_CLOUD_PROJECT": "unapproved-account-project",
        "GOOGLE_CLOUD_LOCATION": "unapproved-location",
    }.items():
        monkeypatch.setenv(name, value)

    def reject_default_context(*_args, **_kwargs):
        raise AssertionError("SDK must not read certificate or keylog environment")

    monkeypatch.setattr(ssl, "create_default_context", reject_default_context)
    real_transport = providers._new_http_transport()
    context = real_transport._pool._ssl_context
    assert context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
    assert context.keylog_filename is None
    await real_transport.aclose()
    harness = ProviderHarness(monkeypatch, data)
    await harness.run()
    assert len(harness.requests) == 2
    assert all(
        request.url.host == "generativelanguage.googleapis.com"
        for request in harness.requests
    )
    assert all(
        "unapproved-account-project" not in str(request.headers)
        for request in harness.requests
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["countTokens", "generateContent"])
@pytest.mark.parametrize(
    "mutation",
    [
        "host",
        "http",
        "model",
        "query",
        "extra_context",
        "extra_part",
        "system_instruction",
        "duplicate_json",
        "fractional_config",
    ],
)
async def test_real_sdk_unexpected_requests_are_rejected_before_transport(
    monkeypatch, phase, mutation
):
    data = fixture("AnalyzeEvidenceV1")
    harness = ProviderHarness(monkeypatch, data)
    original_send = httpx.AsyncClient.send

    async def mutate(client, request, **options):
        if request.url.path.endswith(":" + phase):
            url, body = str(request.url), json.loads(request.content)
            if mutation == "host":
                url = url.replace(
                    "generativelanguage.googleapis.com", "unapproved.invalid"
                )
            elif mutation == "http":
                url = url.replace("https://", "http://")
            elif mutation == "model":
                url = url.replace(RESEARCH_MODEL, "unapproved-model")
            elif mutation == "query":
                url += "?owner=user_private"
            elif mutation == "extra_context":
                body["owner"] = {"userId": "user_private"}
            elif mutation == "extra_part":
                body["contents"][0]["parts"].append(
                    {"fileData": {"fileUri": "https://unapproved.invalid/data"}}
                )
            elif mutation == "system_instruction":
                body["systemInstruction"] = {"parts": [{"text": "unapproved context"}]}
            elif mutation == "fractional_config":
                body.setdefault("generationConfig", {})["candidateCount"] = 1.0
            encoded = json.dumps(body).encode()
            if mutation == "duplicate_json":
                encoded = b'{"contents": [],' + encoded[1:]
            request = httpx.Request(
                request.method,
                url,
                content=encoded,
                headers=request.headers,
                extensions=request.extensions,
            )
        return await original_send(client, request, **options)

    monkeypatch.setattr(httpx.AsyncClient, "send", mutate)
    with pytest.raises(
        CognitiveExecutionFailure, match="PROVIDER_REQUEST_REJECTED"
    ) as caught:
        await harness.run()
    assert caught.value.retryable is False
    assert len(harness.requests) == (0 if phase == "countTokens" else 1)
    assert harness.closes == 1


@pytest.mark.asyncio
async def test_sdk_trace_account_cookie_headers_are_not_forwarded(monkeypatch):
    data = fixture("AnalyzeEvidenceV1")
    harness = ProviderHarness(monkeypatch, data)
    original_send = httpx.AsyncClient.send

    async def mutate(client, request, **options):
        for header in (
            "traceparent",
            "baggage",
            "cookie",
            "authorization",
            "x-goog-user-project",
            "x-owner-user-id",
        ):
            request.headers[header] = "unapproved-account-context"
        return await original_send(client, request, **options)

    monkeypatch.setattr(httpx.AsyncClient, "send", mutate)
    await harness.run()
    assert all(
        "unapproved-account-context" not in str(request.headers)
        for request in harness.requests
    )


class ByteStream(httpx.AsyncByteStream):
    def __init__(self, chunks):
        self.chunks = chunks
        self.consumed = 0
        self.closed = False

    async def __aiter__(self):
        for chunk in self.chunks:
            self.consumed += 1
            yield chunk

    async def aclose(self):
        self.closed = True


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["countTokens", "generateContent"])
@pytest.mark.parametrize(
    "mode",
    [
        "declared",
        "stream",
        "buffered",
        "compressed",
        "content_type",
        "duplicate",
        "deep",
        "nan",
        "invalid_utf8",
    ],
)
async def test_provider_raw_reply_bound_and_shape_precedes_sdk_parsing(
    monkeypatch, phase, mode
):
    data = fixture("AnalyzeEvidenceV1")
    maximum = (
        providers.MAX_COUNT_RESPONSE_BYTES
        if phase == "countTokens"
        else providers.MAX_RESPONSE_BYTES
    )
    stream = ByteStream([b"x" * 64000] * ((maximum // 64000) + 4))

    async def handler(request):
        if not request.url.path.endswith(":" + phase):
            return httpx.Response(200, json={"totalTokens": 20})
        headers = {"content-type": "application/json"}
        if mode == "declared":
            return httpx.Response(
                200,
                headers={**headers, "content-length": str(maximum + 1)},
                stream=stream,
            )
        if mode == "stream":
            return httpx.Response(200, headers=headers, stream=stream)
        if mode == "buffered":
            return httpx.Response(200, headers=headers, content=b"x" * (maximum + 1))
        if mode == "compressed":
            return httpx.Response(
                200, headers={**headers, "content-encoding": "gzip"}, stream=stream
            )
        if mode == "content_type":
            return httpx.Response(
                200, headers={"content-type": "text/plain"}, stream=stream
            )
        if mode == "duplicate":
            return httpx.Response(
                200, headers=headers, content=b'{"totalTokens":20,"totalTokens":21}'
            )
        if mode == "deep":
            return httpx.Response(
                200,
                headers=headers,
                content=b'{"nested":' + b"[" * 2000 + b"0" + b"]" * 2000 + b"}",
            )
        if mode == "nan":
            return httpx.Response(200, headers=headers, content=b'{"totalTokens":NaN}')
        return httpx.Response(200, headers=headers, content=b'{"bad":"\xff"}')

    harness = ProviderHarness(monkeypatch, data, handler=handler)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run()
    assert caught.value.retryable is False
    assert len(harness.requests) == (1 if phase == "countTokens" else 2)
    assert harness.closes == 1
    if mode in {"declared", "stream", "compressed", "content_type"}:
        assert stream.closed
    if mode in {"declared", "compressed", "content_type"}:
        assert stream.consumed == 0
    if mode == "stream":
        assert stream.consumed <= (maximum // 64000) + 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "mode",
    [
        "missing",
        "multiple",
        "truncated",
        "tool_call",
        "thought",
        "thought_integer",
        "text_too_big",
        "wrong_identity",
        "candidate_duplicate",
    ],
)
async def test_invalid_candidates_never_repair_or_publish(monkeypatch, kind, mode):
    data = fixture(kind)
    raw = response_payload(data.candidate)
    candidate = raw["candidates"][0]
    if mode == "missing":
        raw["candidates"] = []
    elif mode == "multiple":
        raw["candidates"] *= 2
    elif mode == "truncated":
        candidate["finishReason"] = "MAX_TOKENS"
    elif mode == "tool_call":
        candidate["content"]["parts"] = [
            {"functionCall": {"name": "unapproved", "args": {}}}
        ]
    elif mode == "thought":
        candidate["content"]["parts"][0]["thought"] = True
    elif mode == "thought_integer":
        candidate["content"]["parts"][0]["thought"] = 0
    elif mode == "text_too_big":
        candidate["content"]["parts"][0]["text"] = "x" * (
            providers.MAX_CANDIDATE_BYTES + 1
        )
    elif mode == "candidate_duplicate":
        candidate["content"]["parts"][0][
            "text"
        ] = '{"participants":[],"participants":[]}'
    else:
        altered = copy.deepcopy(data.candidate)
        if kind == "AnalyzeEvidenceV1":
            altered["quotes"][0]["documentId"] = uid(999)
        else:
            altered["participants"][0]["participantId"] = uid(999)
        candidate["content"]["parts"][0]["text"] = json.dumps(altered)
    harness = ProviderHarness(monkeypatch, data, response=raw)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await harness.run()
    assert caught.value.retryable is False
    assert len(harness.requests) == 2 and harness.closes == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize(
    "version",
    [
        None,
        RESEARCH_MODEL,
        RESEARCH_MODEL_RESOURCE,
        "bad model version",
        "\nsecret",
        "x" * 161,
    ],
)
async def test_ambiguous_model_version_is_unknown_not_configured_provenance(
    monkeypatch, kind, version
):
    data = fixture(kind)
    harness = ProviderHarness(
        monkeypatch, data, response=response_payload(data.candidate, version=version)
    )
    result = await harness.run()
    assert result.model == RESEARCH_MODEL and result.model_version is None


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["countTokens", "generateContent"])
async def test_deadline_bounds_both_actual_sdk_requests(monkeypatch, phase):
    data = fixture("AnalyzeEvidenceV1", deadlineMs=30)

    async def handler(request):
        if request.url.path.endswith(":" + phase):
            await asyncio.sleep(0.2)
        return httpx.Response(200, json={"totalTokens": 20})

    harness = ProviderHarness(monkeypatch, data, handler=handler)
    with pytest.raises(CognitiveExecutionFailure, match="DEADLINE") as caught:
        await harness.run()
    assert caught.value.retryable is False
    assert len(harness.requests) == (1 if phase == "countTokens" else 2)
    assert harness.closes == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
@pytest.mark.parametrize("phase", ["countTokens", "generateContent"])
@pytest.mark.parametrize("suppress", [False, True])
async def test_cancelled_provider_cannot_publish_or_start_another_request(
    monkeypatch, kind, phase, suppress
):
    data = fixture(kind)
    reached = asyncio.Event()

    async def handler(request):
        if request.url.path.endswith(":" + phase):
            reached.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                if not suppress:
                    raise
        return httpx.Response(
            200,
            json=(
                {"totalTokens": 20}
                if request.url.path.endswith(":countTokens")
                else response_payload(data.candidate)
            ),
        )

    harness = ProviderHarness(monkeypatch, data, handler=handler)
    task = asyncio.create_task(harness.run())
    await reached.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert len(harness.requests) == (1 if phase == "countTokens" else 2)
    assert harness.closes == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
async def test_requested_limits_are_intersected_with_consent_and_server_policy(
    monkeypatch, kind
):
    data = fixture(kind)
    harness = ProviderHarness(monkeypatch, data)
    wider = CapabilityLimitsV1.model_validate(
        {
            "deadlineMs": 900000,
            "maxModelCalls": 32,
            "maxInputTokens": 2000000,
            "maxOutputTokens": 2000000,
        }
    )
    result = await harness.run(limits=wider, deadline=time.monotonic() + 900)
    assert result.model_calls == 1
    generated = json.loads(harness.requests[1].content)
    assert (
        generated["generationConfig"]["maxOutputTokens"]
        == data.operation.input.limits.max_output_tokens
    )
    assert harness.requests[1].extensions["timeout"]["read"] < 60


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
async def test_first_claim_gate_prevents_reusing_consent_for_reclaimed_execution(
    monkeypatch, kind
):
    from backend.tests.workflow_v2.test_analysis_operation_lifecycle import worker_store
    from backend.services.workflow_v2.operation_worker import OperationWorker

    data = fixture(kind)
    harness = ProviderHarness(monkeypatch, data)
    resolver = Resolver(data.scope)
    if data.source is not None:
        resolver.add(data.source)
    executor = GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=resolver,
        analysis_generator=harness.generator() if kind == "AnalyzeEvidenceV1" else None,
        simulation_generator=harness.generator() if kind == "SimulateV1" else None,
    )
    store = worker_store(data.operation)
    store.claim = replace(store.claim, execution_count=2)
    worker = OperationWorker(store, executor)
    try:
        assert await worker.run_once()
    finally:
        await worker.close()
    assert store.failed["error_class"] == "AXWISE_CAPABILITY_RECONSENT_REQUIRED"
    assert store.failed["retryable"] is False
    assert (
        not harness.requests
        and not harness.sdk_constructions
        and not harness.transport_constructions
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,value",
    [
        ("provider", "unapproved-provider"),
        ("provider", True),
        ("model", "bad\nmodel"),
        ("model", "x" * 201),
        ("model", 3),
    ],
)
async def test_simulation_service_rejects_invalid_provider_model_receipt(field, value):
    from backend.services.workflow_v2.simulation_service import (
        SimulationExecutionError,
        SimulationGenerationResult,
        SimulationService,
    )

    data = fixture("SimulateV1")
    receipt = SimulationGenerationResult(
        SimulationCandidateV1.model_validate(data.candidate),
        model_calls=1,
        model=RESEARCH_MODEL,
        provider="google",
    )

    class Generator:
        async def generate(self, *_args, **_kwargs):
            return replace(receipt, **{field: value})

    with pytest.raises(SimulationExecutionError, match="INVALID_USAGE"):
        await SimulationService(Generator()).run(data.context, limits=data.limits)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", KINDS)
async def test_owned_handler_preserves_unknown_provider_usage_and_cost(
    monkeypatch, kind
):
    data = fixture(kind)
    harness = ProviderHarness(
        monkeypatch,
        data,
        response=response_payload(data.candidate, usage=None, version=None),
    )
    resolver = Resolver(data.scope)
    if data.source is not None:
        resolver.add(data.source)
    executor = GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=resolver,
        analysis_generator=harness.generator() if kind == "AnalyzeEvidenceV1" else None,
        simulation_generator=harness.generator() if kind == "SimulateV1" else None,
    )
    result = await executor.execute(data.operation)
    assert result.metrics.model_calls == 1 and result.metrics.usage_complete is False
    assert (
        result.metrics.model == RESEARCH_MODEL and result.metrics.provider == "google"
    )
    assert all(
        getattr(result.metrics, name) is None
        for name in (
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "estimated_cost_micros",
            "model_version",
        )
    )
