"""Prompt contract regressions, not evidence that a model follows the instructions."""

from __future__ import annotations

import pytest

from backend.services.workflow_v2.cognitive.policy import (
    _DESIGN_CONSISTENCY_METHOD,
    _SYNTHESIS_BODY,
    EVALUATION_SYSTEM_PROMPT,
    SYNTHESIS_SYSTEM_PROMPT,
    TASK_SYSTEM_PROMPT,
)


pytestmark = pytest.mark.contract

PROMPTS = (
    pytest.param(TASK_SYSTEM_PROMPT, id="task-and-core"),
    pytest.param(EVALUATION_SYSTEM_PROMPT, id="evaluation"),
    pytest.param(SYNTHESIS_SYSTEM_PROMPT, id="final-repair"),
)


def normalized(prompt: str) -> str:
    return " ".join(prompt.split())


@pytest.mark.parametrize("prompt", PROMPTS)
def test_allowed_claim_lineage_is_not_external_truth(prompt: str) -> None:
    text = normalized(prompt)
    assert "admission and lineage, not infallible external truth" in text
    assert "supplied source excerpts and metadata" in text
    assert "a URL, title or source-class label alone is not proof" in text
    assert "draft, proposal or logical model" in text
    assert "without rewriting its immutable record" in text


def test_core_must_reconcile_specialists_instead_of_echoing_coverage() -> None:
    text = normalized(TASK_SYSTEM_PROMPT)
    assert "Specialists advise; the core_draft owns the coherent design" in text
    assert "each specialist's existing conclusions field" in text
    assert "not a competing complete specification" in text
    assert "core's conclusions field records the selected decisions" in text
    assert "materially conflicting alternatives were rejected" in text
    assert "Keep unresolved decisions in unknowns" in text
    assert "mark affected requirement_coverage as gap" in text
    assert "Do not silently combine alternatives" in text
    assert "requirement satisfied just because its heading appears" in text


@pytest.mark.parametrize("prompt", PROMPTS)
def test_one_shared_method_requires_conservation_authority_and_replay_rules(
    prompt: str,
) -> None:
    text = normalized(prompt)
    assert text.count(normalized(_DESIGN_CONSISTENCY_METHOD)) == 1
    assert "quantities and commitments are conserved" in text
    assert "state changes require the responsible authority" in text
    assert (
        "duplicate or older events cannot repeat an effect or reverse a newer decision"
        in text
    )
    assert "Identity and local arrival order do not prove source freshness" in text
    assert "unknown outcome remains unresolved until authoritative confirmation" in text
    assert "initial -> event -> intermediate -> final quantities" in text
    assert (
        "Derive every journey, equation, recovery path and acceptance example" in text
    )


def test_evaluator_requires_counterexamples_not_format_based_approval() -> None:
    text = normalized(EVALUATION_SYSTEM_PROMPT)
    assert "Review the selected design decisions first" in text
    assert "compare each relevant section with them" in text
    assert (
        "core resolved conflicting specialist proposals rather than preserving both"
        in text
    )
    assert "exact sections and a short counterexample" in text
    assert "input/event order -> claimed versus computed outcome" in text
    assert "appropriate typed field" in text
    assert (
        "Keep contradictions, unsupported facts and formatting findings distinct"
        in text
    )
    assert "what was actually checked and its limits" in text
    assert "it is not a pass certificate" in text
    assert "Do not claim that calculations or live tests were executed" in text
    assert (
        "Requirements, hypothetical test inputs and permission labels are not reported external facts"
        in text
    )


def test_evaluator_does_not_treat_qualifications_as_contradiction_repairs() -> None:
    text = normalized(EVALUATION_SYSTEM_PROMPT)
    assert (
        "A qualification or 'pending verification' label cannot repair a contradiction"
        in text
    )
    assert "correct the decision or retain the affected requirement as a gap" in text
    assert "If an accepted claim overreaches the available source" in text
    assert "flag the exact uncertainty without rewriting its immutable record" in text


def test_final_repair_must_update_all_conflicting_algorithm_projections() -> None:
    text = normalized(SYNTHESIS_SYSTEM_PROMPT)
    assert (
        "BASE_MARKDOWN is the exact reviewed candidate, not a server-rewritten substitute"
        in text
    )
    assert "ACCEPTED_SCOPE remains authoritative" in text
    assert "CORE_DECISIONS records the author's choices" in text
    assert (
        "SPECIALIST_DECISIONS are advice, not additional requirements or verified facts"
        in text
    )
    assert "Repair the decision behind a concrete defect" in text
    assert (
        "every affected equation, example, journey, acceptance case and fallback"
        in text
    )
    assert "Preserve other valid decisions" in text
    assert "Do not change the algorithm independently in different sections" in text
    assert "replace a defect with a disclaimer" in text
    assert "add new requirements to satisfy an incidental draft shape" in text
    assert "keep it explicit as a gap rather than inventing an answer" in text


@pytest.mark.parametrize("prompt", PROMPTS)
def test_extra_adversarial_work_is_bounded_and_scenario_sensitive(prompt: str) -> None:
    text = normalized(prompt)
    assert "Check the requested examples" in text
    assert "vary event order or replay only where it tests one of those rules" in text
    assert "Do not add a catalogue of unrequested edge cases" in text
    assert "Apply this method only to stateful behavior actually requested" in text
    assert "Preserve reader-facing length and format" in text
    for fixture_specific_text in ("SKU-500", "ORD-500", "20,000", "North Central Hub"):
        assert fixture_specific_text not in prompt


def test_stateful_checks_do_not_expand_unrelated_content_contracts() -> None:
    for prompt in (
        TASK_SYSTEM_PROMPT,
        EVALUATION_SYSTEM_PROMPT,
        SYNTHESIS_SYSTEM_PROMPT,
    ):
        assert "do not add engineering sections to unrelated content" in normalized(
            prompt
        )
    assert (
        "honor the requested reader-facing length, item-count, and format exactly"
        in normalized(TASK_SYSTEM_PROMPT)
    )
    assert "accepted owner length, item-count, or format constraint" in normalized(
        EVALUATION_SYSTEM_PROMPT
    )
    assert "within the accepted reader-facing contract" in normalized(
        SYNTHESIS_SYSTEM_PROMPT
    )


def test_existing_typed_output_and_immutable_scope_boundaries_remain() -> None:
    for prompt in (
        TASK_SYSTEM_PROMPT,
        EVALUATION_SYSTEM_PROMPT,
        SYNTHESIS_SYSTEM_PROMPT,
    ):
        text = normalized(prompt)
        assert "The accepted scope is the sole semantic authority" in text
        assert "Never author a Sources or Source appendix" in text
    assert "`requirement_coverage`" in TASK_SYSTEM_PROMPT
    assert (
        "Return bounded repair instructions only for concrete defects"
        in EVALUATION_SYSTEM_PROMPT
    )
    assert "reviewer guidance, not a form to satisfy" in SYNTHESIS_SYSTEM_PROMPT


def test_unresolved_evidence_must_use_pending_verification_prefix() -> None:
    for prompt in (
        TASK_SYSTEM_PROMPT,
        EVALUATION_SYSTEM_PROMPT,
        SYNTHESIS_SYSTEM_PROMPT,
    ):
        text = normalized(prompt)
        assert (
            "Any requirement, specification, or claim subject to an unresolved evidence requirement or open evidence gap must be prefixed with '**Pending verification:** ' or designated with explicit provisional language"
            in text
        )
        assert (
            "never asserted as an established fact without exact immutable evidence markers"
            in text
        )

    synthesis_text = normalized(SYNTHESIS_SYSTEM_PROMPT)
    assert normalized(_SYNTHESIS_BODY) in synthesis_text
    assert (
        "When asserting any requirement or specification subject to an unresolved evidence requirement or open gap, always prefix the statement or bullet with '**Pending verification:** ' so it is clearly designated as provisional rather than an established fact"
        in synthesis_text
    )
