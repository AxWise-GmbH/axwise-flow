import asyncio
import copy
import time
import types
from types import SimpleNamespace

import pytest

from backend.api.research.simulation_bridge.models import (
    SimulationConfig,
    SimulationPerformanceProfile,
)
from backend.api.research.simulation_bridge.services.persona_generator import (
    PersonaGenerator,
)
from backend.domain.market_scope import resolve_market_expression
from backend.services.processing.persona_formation_v2.facade import (
    PersonaFormationFacade,
)


pytestmark = pytest.mark.contract


class DummyLLMService:
    async def analyze(self, *args, **kwargs):
        return {}


def _attributes():
    return {
        "name": "Generated name",
        "description": "A quality lead balancing speed, safety, and compliance.",
        "goals_and_motivations": {
            "value": "zero-deviation safety protocols and complete audit trails",
            "confidence": 0.9,
            "evidence": [],
        },
        "challenges_and_frustrations": {
            "value": "rushing work creates missing signatures and non-compliance",
            "confidence": 0.9,
            "evidence": [],
        },
        "technology_and_tools": {
            "value": "audit trail and compliance tracking",
            "confidence": 0.8,
            "evidence": [],
        },
        "key_quotes": {"value": "", "confidence": 0.8, "evidence": []},
    }


def _transcript():
    return [
        {
            "speaker_id": "Interviewer",
            "role": "interviewer",
            "dialogue": "What does success look like?",
            "document_id": "interview-1",
        },
        {
            "speaker_id": "Ingrid",
            "role": "participant",
            "dialogue": (
                "Success means zero-deviation safety protocols and complete audit trails. "
                "Rushing work creates missing signatures and non-compliance. "
                "I verify every change in our audit trail and compliance tracking system."
            ),
            "document_id": "interview-1",
        },
    ]


def test_multi_market_persona_prompt_assigns_exact_country_cells_without_defaulting():
    generator = object.__new__(PersonaGenerator)
    generator.used_names_by_category = {}
    generator.used_names_global = set()
    trait = SimpleNamespace(
        openness=0.5,
        conscientiousness=0.7,
        extraversion=0.4,
        agreeableness=0.6,
        neuroticism=0.3,
    )
    context = SimpleNamespace(
        business_idea="Launch a cat-food product",
        target_customer="Retail category managers",
        problem="Validate pricing and channel fit",
        industry="Pet food",
        location="BENELUX",
        market_scope=resolve_market_expression("BENELUX"),
    )
    stakeholder = SimpleNamespace(
        name="Retail decision authority",
        description="Approves the category listing",
        questions=["What determines listing approval?"],
    )

    prompt = generator._build_person_prompt(
        stakeholder,
        context,
        SimulationConfig(people_per_stakeholder=2),
        [(40, trait), (45, trait)],
        market_offset=1,
    )

    assert "Countries: Belgium (BE), Netherlands (NL), Luxembourg (LU)" in prompt
    assert "Profile Index 1: Netherlands (NL)" in prompt
    assert "Profile Index 2: Luxembourg (LU)" in prompt
    assert "Do not substitute Germany" in prompt


def _evidence_snapshot(personas):
    evidence_map = personas[0]["_evidence_linking_v2"]["evidence_map"]
    return {
        field: [
            (
                item["quote"],
                item["speaker"],
                item["document_id"],
                item["start_char"],
                item["end_char"],
            )
            for item in items
        ]
        for field, items in evidence_map.items()
    }


def _quality_metrics(personas, participant_text):
    evidence_map = personas[0]["_evidence_linking_v2"]["evidence_map"]
    items = [item for values in evidence_map.values() for item in values]
    exact = sum(
        participant_text[item["start_char"] : item["end_char"]] == item["quote"]
        for item in items
    )
    valid_speaker = sum(item["speaker"] == "Ingrid" for item in items)
    valid_document = sum(item["document_id"] == "interview-1" for item in items)
    contamination = sum(item["quote"].strip().endswith("?") for item in items)
    covered_fields = sum(bool(values) for values in evidence_map.values())
    return {
        "evidence_items": len(items),
        "exact_offset_rate": exact / max(1, len(items)),
        "speaker_accuracy_rate": valid_speaker / max(1, len(items)),
        "document_accuracy_rate": valid_document / max(1, len(items)),
        "interviewer_contamination_rate": contamination / max(1, len(items)),
        "covered_fields": covered_fields,
    }


async def _run_facade(profile, delay_seconds=0.01):
    facade = PersonaFormationFacade(DummyLLMService())
    calls = {"clean": 0, "filter": 0, "profiles": []}

    async def extract(_self, text, role="Participant", industry=None, scope_meta=None):
        calls["profiles"].append(scope_meta.get("performance_profile"))
        return copy.deepcopy(_attributes())

    async def clean(text, scope_meta=None):
        calls["clean"] += 1
        await asyncio.sleep(delay_seconds)
        return text

    async def filter_quotes(quotes, scope_meta=None):
        calls["filter"] += 1
        await asyncio.sleep(delay_seconds)
        return set(range(len(quotes)))

    facade.extractor.extract_attributes_from_text = types.MethodType(
        extract, facade.extractor
    )
    facade.evidence_linker.llm_clean_scoped_text = clean
    facade.evidence_linker.llm_filter_quotes = filter_quotes

    started = time.perf_counter()
    personas = await facade.form_personas_from_transcript(
        _transcript(),
        context={
            "industry": "manufacturing",
            "document_id": "interview-1",
            "performance_profile": profile,
        },
    )
    return personas, calls, time.perf_counter() - started


@pytest.mark.asyncio
async def test_quality_fast_preserves_evidence_quality_without_per_field_llm_calls():
    standard, standard_calls, standard_elapsed = await _run_facade("standard")
    optimized, optimized_calls, optimized_elapsed = await _run_facade("quality_fast")

    participant_text = _transcript()[1]["dialogue"]
    assert _evidence_snapshot(optimized) == _evidence_snapshot(standard)
    assert _quality_metrics(optimized, participant_text) == _quality_metrics(
        standard, participant_text
    )
    assert _quality_metrics(optimized, participant_text) == {
        "evidence_items": 6,
        "exact_offset_rate": 1.0,
        "speaker_accuracy_rate": 1.0,
        "document_accuracy_rate": 1.0,
        "interviewer_contamination_rate": 0.0,
        "covered_fields": 4,
    }
    assert standard_calls["clean"] == 1
    assert standard_calls["filter"] >= 3
    assert optimized_calls["clean"] == 0
    assert optimized_calls["filter"] == 0
    assert optimized_calls["profiles"] == ["quality_fast"]
    assert optimized_elapsed < standard_elapsed * 0.5


@pytest.mark.asyncio
async def test_quality_fast_generates_stakeholder_groups_concurrently():
    generator = object.__new__(PersonaGenerator)
    generator.used_names_by_category = {}
    generator.used_names_global = set()
    active = 0
    maximum_active = 0
    market_offsets = []

    async def generate_people(_self, stakeholder, business_context, config, **kwargs):
        nonlocal active, maximum_active
        market_offsets.append(kwargs["market_offset"])
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.02)
        active -= 1
        return [stakeholder.name]

    generator.generate_people = types.MethodType(generate_people, generator)
    stakeholders = {
        "primary": [
            SimpleNamespace(id=f"primary-{index}", name=f"Primary {index}")
            for index in range(3)
        ],
        "secondary": [
            SimpleNamespace(id=f"secondary-{index}", name=f"Secondary {index}")
            for index in range(2)
        ],
    }
    config = SimulationConfig(
        people_per_stakeholder=2,
        performance_profile=SimulationPerformanceProfile.QUALITY_FAST,
    )

    started = time.perf_counter()
    people = await generator.generate_all_people(
        stakeholders, SimpleNamespace(), config
    )
    elapsed = time.perf_counter() - started

    assert len(people) == 5
    assert maximum_active == 5
    assert sorted(market_offsets) == [0, 2, 4, 6, 8]
    assert elapsed < 0.06


@pytest.mark.asyncio
async def test_standard_profile_also_parallelizes_independent_stakeholder_groups(monkeypatch):
    monkeypatch.setenv("AXWISE_PERSONA_CONCURRENCY", "3")
    generator = object.__new__(PersonaGenerator)
    generator.used_names_by_category = {}
    generator.used_names_global = set()
    active = 0
    maximum_active = 0

    async def generate_people(_self, stakeholder, business_context, config, **_kwargs):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.02)
        active -= 1
        return [stakeholder.name]

    generator.generate_people = types.MethodType(generate_people, generator)
    stakeholders = {
        "primary": [
            SimpleNamespace(id=f"primary-{index}", name=f"Primary {index}")
            for index in range(5)
        ]
    }
    config = SimulationConfig(
        people_per_stakeholder=2,
        performance_profile=SimulationPerformanceProfile.STANDARD,
    )

    people = await generator.generate_all_people(
        stakeholders, SimpleNamespace(), config
    )

    assert len(people) == 5
    assert maximum_active == 3
