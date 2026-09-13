"""Production contracts for the AxWise Gemini 3.8 execution runtime."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import BaseModel, ValidationError
from instructor.providers.gemini.utils import handle_genai_tools

from backend.domain.orchestration.scope_models import TrustedRuntimeMetadataV1
from backend.services.generative.gemini_text_service import GeminiTextService
from backend.services.llm.config.genai_config import (
    GenAIConfigFactory,
    TaskType,
    is_supported_gemini_flash,
)
from backend.services.llm.gemini_runtime import (
    RESEARCH_MODEL,
    RESEARCH_MODEL_RESOURCE,
    build_research_model,
)
from backend.services.llm.gemini_service import GeminiService
from backend.services.llm.instructor_gemini_client import (
    EnhancedInstructorGeminiClient,
)
from backend.services.llm.providers.gemini import GeminiProvider
from backend.services.llm.unified_llm_client import UnifiedLLMClient


ROOT = Path(__file__).resolve().parents[3]
pytestmark = pytest.mark.contract

RESEARCH_AGENT_FILES = (
    "api/research/simulation_bridge/services/persona_generator.py",
    "api/research/simulation_bridge/services/interview_simulator.py",
    "api/research/simulation_bridge/services/parallel_interview_simulator.py",
)

GEMINI_SEARCH_SERVICE = (
    ROOT / "backend" / "services" / "generative" / "gemini_search_service.py"
)
ENHANCED_GEMINI_SERVICE = (
    ROOT / "backend" / "services" / "llm" / "enhanced_gemini_llm_service.py"
)

GEMINI_FLASH_REQUEST_BOUNDARIES = (
    "services/generative/gemini_text_service.py",
    "services/llm/providers/gemini.py",
    "services/llm/gemini_service.py",
    "services/stakeholder_analysis_v2/theme_analyzer.py",
    "services/stakeholder_analysis_v2/influence_calculator.py",
    "services/stakeholder_analysis_v2/report_assembler.py",
)


class _StructuredReply(BaseModel):
    """Small schema used to inspect Instructor's transformed provider request."""

    answer: str


def _new_instructor_client(create, *, max_retries: int = 1):
    client = EnhancedInstructorGeminiClient.__new__(EnhancedInstructorGeminiClient)
    client.model_name = "models/gemini-3.8-flash"
    client.max_retries = max_retries
    client.enable_metrics = False
    client.metrics_history = []
    client.retry_strategies = [{}, {}, {}]
    client.instructor_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    return client


def _assert_instructor_tools_provider_request(request) -> None:
    _, transformed = handle_genai_tools(
        request["response_model"],
        {
            **request,
            "messages": [dict(message) for message in request["messages"]],
            "generation_config": dict(request["generation_config"]),
        },
    )

    dumped = transformed["config"].model_dump(exclude_none=True)
    assert dumped["max_output_tokens"] == 65_536
    assert dumped["system_instruction"].strip() == "Keep provenance attached."
    assert "temperature" not in dumped
    assert "top_p" not in dumped
    assert "top_k" not in dumped
    assert "candidate_count" not in dumped
    # GENAI_TOOLS uses a forced function call instead of JSON MIME transport.
    assert "response_mime_type" not in dumped

    contents = [content.model_dump(exclude_none=True) for content in transformed["contents"]]
    assert [content["role"] for content in contents] == ["user"]
    assert all(content["role"] != "model" for content in contents)


def test_operator_examples_and_local_services_use_exact_research_model() -> None:
    assert "GEMINI_MODEL=models/gemini-3.8-flash" in (
        ROOT / ".env.example"
    ).read_text(encoding="utf-8")
    assert "GEMINI_MODEL=models/gemini-3.8-flash" in (
        ROOT / "backend" / ".env.example"
    ).read_text(encoding="utf-8")
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    # Backend, paid research worker, and the isolated scope worker must all
    # share the exact accepted Gemini runtime.
    assert compose.count("GEMINI_MODEL:-models/gemini-3.8-flash") == 3
    assert "gemini-3-flash-preview" not in compose
    assert "gemini-3.6-flash" not in compose


@pytest.mark.parametrize("requirements_name", ["requirements.txt", "requirements.prod.txt"])
def test_production_gemini_dependencies_are_exact_and_compatible(
    requirements_name: str,
) -> None:
    requirements = (ROOT / "backend" / requirements_name).read_text(encoding="utf-8")

    assert "google-genai==2.17.0" in requirements
    assert "pydantic-ai-slim[google]==2.28.0" in requirements
    assert "pydantic==2.13.4" in requirements
    assert "instructor==1.15.4" in requirements
    assert "google-genai>=" not in requirements
    assert "pydantic-ai-slim>=" not in requirements
    assert "pydantic>=" not in requirements
    assert "instructor>=" not in requirements
    assert "***REMOVED***" not in requirements


@pytest.mark.parametrize(
    "task",
    [
        TaskType.TRANSCRIPT_STRUCTURING,
        TaskType.PERSONA_FORMATION,
        TaskType.PRD_GENERATION,
    ],
)
def test_gemini_flash_config_uses_native_system_instruction_and_supported_limits(
    task: TaskType,
) -> None:
    config = GenAIConfigFactory.create_config(
        task,
        {
            "max_output_tokens": 131_072,
            "temperature": 0.1,
            "top_p": 0.9,
            "top_k": 12,
        },
        model="models/gemini-3.8-flash",
        system_instruction="Keep provenance attached to every material claim.",
    )
    dumped = config.model_dump(exclude_none=True)

    assert dumped["max_output_tokens"] == 65_536
    assert "temperature" not in dumped
    assert "top_p" not in dumped
    assert "top_k" not in dumped
    assert dumped["system_instruction"] == (
        "Keep provenance attached to every material claim."
    )


@pytest.mark.parametrize(
    "model",
    [
        "gemini-3.7-flash",
        "models/gemini-3.7-flash",
        "gemini-3.8-flash",
        "models/gemini-3.8-flash",
    ],
)
def test_sampling_sanitizer_accepts_current_and_persisted_flash_models(
    model: str,
) -> None:
    assert is_supported_gemini_flash(model)


def test_persisted_gemini_37_runtime_metadata_still_replays() -> None:
    legacy_payload = {
        "runtime_contract_version": "axwise_gemini_runtime_v1",
        "runtime_authority_id": "axwise.runtime.gemini-research.v1",
        "provider": "google",
        "model": "gemini-3.7-flash",
        "model_resource": "models/gemini-3.7-flash",
        "reasoning_mode": "high",
        "context_window": 1_048_576,
        "max_output_tokens": 65_536,
        "output_policy": "provider_maximum_no_workflow_cap",
        "configuration_sources": [
            "backend.services.llm.gemini_runtime",
            "backend.services.llm.config.genai_config",
            "backend.infrastructure.data.config.MODEL_CAPABILITIES",
        ],
    }

    assert TrustedRuntimeMetadataV1.model_validate(legacy_payload).model_dump(
        mode="json"
    ) == legacy_payload


def test_runtime_metadata_rejects_cross_version_model_resource_pair() -> None:
    with pytest.raises(ValidationError, match="model and resource must match exactly"):
        TrustedRuntimeMetadataV1(
            model="gemini-3.8-flash",
            model_resource="models/gemini-3.7-flash",
        )


def test_current_runtime_defaults_emit_gemini_38_provenance() -> None:
    runtime = TrustedRuntimeMetadataV1()

    assert runtime.model == RESEARCH_MODEL == "gemini-3.8-flash"
    assert (
        runtime.model_resource
        == RESEARCH_MODEL_RESOURCE
        == "models/gemini-3.8-flash"
    )


def test_live_runtime_rejects_legacy_gemini_37_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.7-flash")

    with pytest.raises(RuntimeError, match="models/gemini-3.8-flash"):
        build_research_model("test-key")


def test_legacy_model_keeps_supported_sampling_controls() -> None:
    config = GenAIConfigFactory.create_config(
        TaskType.TEXT_GENERATION,
        {"temperature": 0.4, "top_p": 0.8, "top_k": 20},
        model="models/gemini-2.5-flash",
    )
    dumped = config.model_dump(exclude_none=True)

    assert dumped["temperature"] == 0.4
    assert dumped["top_p"] == 0.8
    assert dumped["top_k"] == 20


def test_research_agents_use_the_pinned_pydanticai_retry_api() -> None:
    """PydanticAI 2.28 uses ``retries``, not the removed ``output_retries`` kwarg."""

    for relative_path in RESEARCH_AGENT_FILES:
        source = (ROOT / "backend" / relative_path).read_text(encoding="utf-8")
        assert "output_retries=" not in source
        assert "retries=" in source


def test_grounded_search_uses_exact_model_guards_without_sampling_controls() -> None:
    source = GEMINI_SEARCH_SERVICE.read_text(encoding="utf-8")

    # Three single-shot helpers resolve at the call site. The bounded sync and
    # async searches each resolve once before their retry loop, then reuse that
    # exact model.
    assert source.count("model=require_search_model()") == 3
    assert source.count("model = require_search_model()") == 2
    assert 'os.getenv("GEMINI_SEARCH_MODEL"' not in source
    assert "temperature=" not in source
    assert "top_p=" not in source
    assert "top_k=" not in source
    assert "candidate_count=" not in source


def test_enhanced_research_client_rejects_cross_model_configuration() -> None:
    source = ENHANCED_GEMINI_SERVICE.read_text(encoding="utf-8")

    assert "normalized_research_model(configured_model) != RESEARCH_MODEL" in source
    assert 'model=f"models/{RESEARCH_MODEL}"' in source
    assert "provider/model fallback is disabled" in source


def test_structured_research_agents_use_native_output_and_semantic_retries() -> None:
    for relative_path in RESEARCH_AGENT_FILES:
        source = (ROOT / "backend" / relative_path).read_text(encoding="utf-8")
        assert "NativeOutput(" in source
        assert "@self.agent.output_validator" in source
        assert "raise ModelRetry(" in source
        assert 'retries={"output": 2}' in source


def test_gemini_flash_direct_request_boundaries_strip_unsupported_controls() -> None:
    text_service = (ROOT / "backend" / GEMINI_FLASH_REQUEST_BOUNDARIES[0]).read_text(
        encoding="utf-8"
    )
    assert "GenerateContentConfig(\n                response_mime_type=" in text_service

    provider = (ROOT / "backend" / GEMINI_FLASH_REQUEST_BOUNDARIES[1]).read_text(
        encoding="utf-8"
    )
    assert 'contents.append({"role": "model"' not in provider
    assert 'config_kwargs["system_instruction"] = system_instruction' in provider
    assert "is_supported_gemini_flash(self.config.model)" in provider

    legacy_service = (
        ROOT / "backend" / GEMINI_FLASH_REQUEST_BOUNDARIES[2]
    ).read_text(encoding="utf-8")
    assert "safe_config.pop(parameter, None)" in legacy_service
    for parameter in ("temperature", "top_p", "top_k", "candidate_count"):
        assert f'"{parameter}",' in legacy_service
    assert '"candidate_count",' in legacy_service
    assert "GEMINI_FLASH_MAX_OUTPUT_TOKENS" in legacy_service

    for relative_path in GEMINI_FLASH_REQUEST_BOUNDARIES[3:]:
        source = (ROOT / "backend" / relative_path).read_text(encoding="utf-8")
        assert "ModelSettings(timeout=300, temperature=" not in source

    split_script = (ROOT / "scripts" / "split_merged_dialogues.py").read_text(
        encoding="utf-8"
    )
    request_block = split_script[split_script.index("client.models.generate_content(") :]
    assert '"temperature"' not in request_block.split(")", 1)[0]


def test_gemini_flash_shared_legacy_clients_normalize_at_provider_boundary() -> None:
    instructor = (
        ROOT / "backend" / "services" / "llm" / "instructor_gemini_client.py"
    ).read_text(encoding="utf-8")
    assert "is_supported_gemini_flash(self.model_name)" in instructor
    assert instructor.count("GEMINI_FLASH_MAX_OUTPUT_TOKENS") >= 2
    assert instructor.count("generation_config=") >= 3
    assert "config=config" not in instructor
    assert "config={**config" not in instructor

    unified = (
        ROOT / "backend" / "services" / "llm" / "unified_llm_client.py"
    ).read_text(encoding="utf-8")
    assert unified.count("is_supported_gemini_flash(self.model_name)") == 2
    assert unified.count("GEMINI_FLASH_MAX_OUTPUT_TOKENS") >= 3
    assert "generation_config=config_params" in unified
    assert all(
        line.strip() != "config=config_params" for line in unified.splitlines()
    )

    optimizer = (ROOT / "backend" / "utils" / "gemini_optimization.py").read_text(
        encoding="utf-8"
    )
    assert 'settings = {}' in optimizer
    conservative = optimizer[optimizer.index("def get_conservative_retry_settings") :]
    conservative = conservative[: conservative.index("def analyze_error_for_optimization")]
    assert '"temperature"' not in conservative
    assert '"top_p"' not in conservative
    assert '"top_k"' not in conservative


def test_legacy_service_provider_boundary_strips_and_clamps() -> None:
    safe = GeminiService._provider_safe_config(
        {
            "temperature": 0.2,
            "top_p": 0.9,
            "top_k": 20,
            "candidate_count": 2,
            "max_output_tokens": 131_072,
            "response_mime_type": "application/json",
        },
        "models/gemini-3.8-flash",
    )

    assert safe == {
        "max_output_tokens": 65_536,
        "response_mime_type": "application/json",
    }


def test_instructor_initial_and_retry_calls_transform_to_safe_provider_request() -> None:
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise RuntimeError("retry once")
        return _StructuredReply(answer="ok")

    client = _new_instructor_client(create)
    result = client.generate_with_model(
        "Return an answer.",
        _StructuredReply,
        temperature=0.4,
        max_output_tokens=131_072,
        top_p=0.8,
        top_k=12,
        candidate_count=3,
        response_mime_type="application/json",
        system_instruction="Keep provenance attached.",
    )

    assert result.answer == "ok"
    assert len(calls) == 2
    for request in calls:
        assert "config" not in request
        assert request["generation_config"] == {"max_tokens": 65_536}
        for parameter in (
            "temperature",
            "top_p",
            "top_k",
            "candidate_count",
            "response_mime_type",
        ):
            assert parameter not in request
    _assert_instructor_tools_provider_request(calls[-1])


@pytest.mark.asyncio
async def test_instructor_async_call_uses_safe_generation_config() -> None:
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return _StructuredReply(answer="ok")

    client = _new_instructor_client(create, max_retries=0)
    result = await client.generate_with_model_async(
        "Return an answer.",
        _StructuredReply,
        temperature=0.4,
        max_output_tokens=131_072,
        top_p=0.8,
        top_k=12,
        candidate_count=3,
        response_mime_type="application/json",
        system_instruction="Keep provenance attached.",
    )

    assert result.answer == "ok"
    assert len(calls) == 1
    assert "config" not in calls[0]
    assert calls[0]["generation_config"] == {"max_tokens": 65_536}
    _assert_instructor_tools_provider_request(calls[0])


@pytest.mark.asyncio
async def test_unified_structured_call_uses_instructor_generation_config() -> None:
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return _StructuredReply(answer="ok")

    client = UnifiedLLMClient.__new__(UnifiedLLMClient)
    client.model_name = "models/gemini-3.8-flash"
    client.max_retries = 0
    client.current_metrics = None
    client._instructor_client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )
    client._get_enhanced_client = lambda: None

    result = await client.generate_structured(
        "Return an answer.",
        _StructuredReply,
        system_instruction="Keep provenance attached.",
        temperature=0.4,
        top_p=0.8,
        top_k=12,
        candidate_count=3,
        max_tokens=131_072,
    )

    assert result.answer == "ok"
    assert len(calls) == 1
    assert "config" not in calls[0]
    assert calls[0]["generation_config"] == {"max_tokens": 65_536}
    assert [message["role"] for message in calls[0]["messages"]] == [
        "system",
        "user",
    ]
    _assert_instructor_tools_provider_request(calls[0])


def test_direct_json_transport_carries_supported_response_mime_type() -> None:
    requests = []

    def generate_content(**kwargs):
        requests.append(kwargs)
        return SimpleNamespace(text='{"answer": "ok"}')

    service = GeminiTextService.__new__(GeminiTextService)
    service.api_key = "test-key"
    service._client = SimpleNamespace(
        models=SimpleNamespace(generate_content=generate_content)
    )

    assert service.generate_json("Return JSON.", temperature=0.4) == {"answer": "ok"}
    dumped = requests[0]["config"].model_dump(exclude_none=True)
    assert dumped["response_mime_type"] == "application/json"
    assert "temperature" not in dumped
    assert "top_p" not in dumped
    assert "top_k" not in dumped
    assert "candidate_count" not in dumped


@pytest.mark.asyncio
async def test_provider_uses_native_system_instruction_without_prefilled_model_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = GeminiProvider(
        {
            "api_key": "test-key",
            "model": "models/gemini-3.8-flash",
            "max_tokens": 131_072,
        }
    )
    generate = AsyncMock(return_value=SimpleNamespace(text="ok"))
    provider._client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )

    result = await provider.generate_text(
        "hello",
        system_instruction="Follow the evidence.",
        temperature=0.4,
        top_p=0.8,
        max_tokens=131_072,
    )

    assert result == "ok"
    request = generate.await_args.kwargs
    assert request["contents"] == [
        {"role": "user", "parts": [{"text": "hello"}]}
    ]
    dumped = request["config"].model_dump(exclude_none=True)
    assert dumped["system_instruction"] == "Follow the evidence."
    assert dumped["max_output_tokens"] == 65_536
    assert "temperature" not in dumped
    assert "top_p" not in dumped
    assert "top_k" not in dumped
    assert "candidate_count" not in dumped
