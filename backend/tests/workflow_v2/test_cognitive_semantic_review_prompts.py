"""Prompt contract regressions, not evidence that a model follows the instructions."""

from __future__ import annotations

import pytest

from backend.services.workflow_v2.cognitive.policy import (
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
    assert "reconcile specialist algorithms rather than concatenating them" in text
    assert "select one consistent accounting/authority model" in text
    assert "carry unresolved conflicts as gaps in requirement_coverage" in text
    assert "do not mark a requirement satisfied merely because its heading" in text
    assert "state variables, transaction boundaries and failure conditions" in text


def test_task_requires_visible_state_traces_and_unknown_outcome_handling() -> None:
    text = normalized(TASK_SYSTEM_PROMPT)
    assert "initial-state -> event -> intermediate-state -> final-state" in text
    assert "recompute quantities at each externally visible boundary" in text
    assert "reversed snapshot/acknowledgement arrival" in text
    assert "a digest or local lock does not establish remote freshness" in text
    assert "unknown outcomes stay fenced until authoritative resolution" in text
    assert (
        "replay horizons, durable operation identities and rollback writer handoffs"
        in text
    )


def test_evaluator_requires_counterexamples_not_format_based_approval() -> None:
    text = normalized(EVALUATION_SYSTEM_PROMPT)
    assert "not its confidence, length, headings or coverage labels" in text
    assert "recompute each requested numeric case" in text
    assert "not only whether the eventual final number looks correct" in text
    assert "Identity/hash equality is not freshness or causal inclusion" in text
    assert "local serialization is not remote source order" in text
    assert (
        "cancellation authority, replay-retention coverage and rollback writer fence"
        in text
    )
    assert (
        "a short witness (input/event order -> claimed versus computed outcome)" in text
    )
    assert "appropriate typed field" in text
    assert "without claiming live test execution" in text


def test_evaluator_does_not_treat_qualifications_as_contradiction_repairs() -> None:
    text = normalized(EVALUATION_SYSTEM_PROMPT)
    assert "Do not accept 'pending verification', a global prerequisite" in text
    assert "a fallback that still performs the unsafe action" in text
    assert "a legitimate evidence gap" in text
    assert (
        "actually provide its safety property or explicitly remain unavailable" in text
    )
    assert "source claims critically even when their IDs are allowed" in text


def test_final_repair_must_update_all_conflicting_algorithm_projections() -> None:
    text = normalized(SYNTHESIS_SYSTEM_PROMPT)
    assert "repair the actual conflicting state transition or authority rule" in text
    assert "not only its wording" in text
    assert (
        "every affected equation, example, journey, acceptance case and fallback"
        in text
    )
    assert "including intermediate externally visible quantities" in text
    assert (
        "release a commitment merely because a delayed acknowledgement is absent"
        in text
    )
    assert (
        "does not make contradictory arithmetic or an unsafe fallback acceptable"
        in text
    )
    assert "without inventing evidence or modifying the immutable claim ledger" in text


@pytest.mark.parametrize("prompt", PROMPTS)
def test_extra_adversarial_work_is_bounded_and_scenario_sensitive(prompt: str) -> None:
    text = normalized(prompt)
    assert "up to six" in text
    assert "requested" in text
    assert "reader-facing" in text
    for fixture_specific_text in ("SKU-500", "ORD-500", "20,000", "North Central Hub"):
        assert fixture_specific_text not in prompt


def test_stateful_checks_do_not_expand_unrelated_content_contracts() -> None:
    assert "do not add an engineering analysis" in normalized(TASK_SYSTEM_PROMPT)
    assert "do not impose inventory, concurrency or recovery rules" in normalized(
        EVALUATION_SYSTEM_PROMPT
    )
    assert "within the requested artifact type and reader-facing format" in normalized(
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
