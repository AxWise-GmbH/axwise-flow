"""Production contracts for the AxWise Gemini 3.6 execution runtime."""

from pathlib import Path

import pytest

from backend.services.llm.config.genai_config import GenAIConfigFactory, TaskType


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


def test_operator_examples_and_local_services_use_exact_research_model() -> None:
    assert "GEMINI_MODEL=models/gemini-3.6-flash" in (
        ROOT / ".env.example"
    ).read_text(encoding="utf-8")
    assert "GEMINI_MODEL=models/gemini-3.6-flash" in (
        ROOT / "backend" / ".env.example"
    ).read_text(encoding="utf-8")
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    assert compose.count("GEMINI_MODEL:-models/gemini-3.6-flash") == 2
    assert "gemini-3-flash-preview" not in compose


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
def test_gemini36_config_uses_native_system_instruction_and_supported_limits(
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
        model="models/gemini-3.6-flash",
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


def test_grounded_search_uses_one_exact_model_guard_without_sampling_controls() -> None:
    source = GEMINI_SEARCH_SERVICE.read_text(encoding="utf-8")

    # Three single-shot helpers resolve at the call site. The bounded general
    # search resolves once before its retry loop, then reuses that exact model.
    assert source.count("model=require_search_model()") == 3
    assert source.count("model = require_search_model()") == 1
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
