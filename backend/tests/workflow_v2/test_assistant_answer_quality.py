from __future__ import annotations

import json

import pytest

from backend.domain.workflow_v2.contracts import AssistantTurnInputV1
from backend.services.workflow_v2.assistant.answer_quality import (
    assistant_answer_defects,
    assistant_claim_source_matches,
    assistant_claim_statement_context,
    assistant_repair_query,
)
from backend.services.workflow_v2.assistant.prompts import assistant_turn_query


pytestmark = pytest.mark.contract


def query(
    message: str = "Research an n8n workflow. Do not execute it.", conversation=None
) -> str:
    return assistant_turn_query(
        AssistantTurnInputV1.model_validate(
            {
                "type": "AssistantTurnV1",
                "responseMode": "one_shot",
                "message": message,
                "conversation": conversation or [],
            }
        )
    )


@pytest.mark.parametrize(
    "markdown",
    [
        "## Code node\n\nRun Once for Each Item:\n\n```js\nreturn $input.first();\n```",
        "## n8n Code\n\nChoose either Run Once for All Items or Run Once for Each Item.\n\n```js\nreturn $input.first();\n```",
        "Use `$input.first()` in Run Once for Each Item mode.",
        "### Code node\n\nMode: `runOnceForEachItem`\n\n~~~javascript\nreturn $input.all();\n~~~",
    ],
)
def test_rejects_positively_recommended_incompatible_n8n_examples(
    markdown: str,
) -> None:
    assert assistant_answer_defects(query(), markdown) == ("n8n_code_mode_mismatch",)


@pytest.mark.parametrize(
    "markdown",
    [
        "## Run Once for All Items\n\n```js\nreturn [$input.first()];\n```\n\n## Run Once for Each Item\n\n```js\nreturn $input.item;\n```",
        "Run Once for Each Item: do not use `$input.first()`.",
        "## Invalid example\n\nRun Once for Each Item:\n\n```js\nreturn $input.first();\n```",
        "Run Once for Each Item rejects `$input.all()`. Use `$json` instead.",
        "## Code node\n\nRun Once for All Items:\n\n```js\nreturn [$input.first()];\n```",
        "Run Once for All Items: use `$input.first()`. Run Once for Each Item: use `$json`.",
        "| Mode | Expression |\n| --- | --- |\n| Run Once for All Items | `$input.first()` |\n| Run Once for Each Item | `$json` |",
        "Run Once for Each Item:\n\n```js\n// Do not use $input.first() here.\nreturn $input.item;\n```",
        "Run Once for Each Item:\n\n```js\nreturn {json: {example: '$input.first()'}};\n```",
    ],
)
def test_accepts_correct_modes_and_explanations_of_invalid_code(markdown: str) -> None:
    assert assistant_answer_defects(query(), markdown) == ()


@pytest.mark.parametrize(
    "markdown",
    [
        "Authentication: **None** (provider-free).",
        "- [ ] **Authentication:** Set to `None` (provider-free).",
        "Authentication=None therefore makes this workflow provider-free.",
        "This workflow is provider-free because Authentication is None.",
    ],
)
def test_rejects_authentication_as_proof_of_provider_independence(
    markdown: str,
) -> None:
    assert assistant_answer_defects(query(), markdown) == (
        "authentication_provider_conflation",
    )


@pytest.mark.parametrize(
    "markdown",
    [
        "Authentication=None does not make the workflow provider-free.",
        "Use Authentication=None only for this isolated synthetic demo. It is provider-free because its output is hardcoded.",
        "A provider-free mock flow can use Authentication=None on an isolated test endpoint.",
        "The provider-free example uses Header Auth. No external service is called.",
        "Inbound Authentication=None is independent of whether the workflow is provider-free.",
    ],
)
def test_accepts_authentication_and_provider_requirements_kept_separate(
    markdown: str,
) -> None:
    assert assistant_answer_defects(query(), markdown) == ()


@pytest.mark.parametrize(
    "markdown",
    [
        "There are no existing workspace credentials or executions.",
        "Your n8n instance has no saved credentials.",
        "## Workspace inventory\n\nNo execution history exists.",
        "Operational Boundary Notice: This response provides an inline specification and checklist based exclusively on official n8n documentation. No live workflows have been created or modified, no schedules or providers have been altered, and no live credentials or executions exist in this workspace.",
    ],
)
def test_research_only_instruction_does_not_establish_absent_inventory(
    markdown: str,
) -> None:
    assert assistant_answer_defects(query(), markdown) == (
        "unsupported_workspace_inventory",
    )


@pytest.mark.parametrize(
    "markdown",
    [
        "No workspace credentials were inspected or used.",
        "No executions were started in your workspace.",
        "No workspace credentials are required for this synthetic example.",
        "If your workspace has no credentials, create one before using the provider.",
        "The proposed new workspace will have no existing credentials.",
        "> There are no existing workspace credentials.\n\nThat earlier claim is unverified.",
        "Workspace credentials and execution history remain unknown.",
        "Does your workspace have no existing credentials?",
    ],
)
def test_does_not_confuse_unobserved_unused_or_proposed_state_with_inventory(
    markdown: str,
) -> None:
    assert assistant_answer_defects(query(), markdown) == ()


def test_accepts_explicit_user_inventory_facts_but_not_prior_assistant_claims() -> None:
    statement = "This workspace has no credentials or execution history."
    assert assistant_answer_defects(query(statement), statement) == ()
    assert (
        assistant_answer_defects(
            query(conversation=[{"role": "user", "content": statement}]), statement
        )
        == ()
    )
    assert assistant_answer_defects(
        query(conversation=[{"role": "assistant", "content": statement}]), statement
    ) == ("unsupported_workspace_inventory",)


def test_user_fact_about_credentials_does_not_establish_execution_history() -> None:
    assert assistant_answer_defects(
        query("This workspace has no credentials. Research a synthetic example."),
        "This workspace has no credentials or execution history.",
    ) == ("unsupported_workspace_inventory",)


def test_latest_explicit_inventory_correction_supersedes_prior_absence() -> None:
    request = query(
        "Our workspace now has credentials. Research a sample workflow.",
        conversation=[
            {"role": "user", "content": "This workspace has no credentials."}
        ],
    )
    assert assistant_answer_defects(request, "This workspace has no credentials.") == (
        "unsupported_workspace_inventory",
    )


def test_quoted_or_example_inventory_does_not_become_user_fact() -> None:
    request = query(
        "Explain this unsupported example:\n\n```text\nNo workspace credentials exist.\n```"
    )
    assert assistant_answer_defects(request, "No workspace credentials exist.") == (
        "unsupported_workspace_inventory",
    )


def test_inventory_question_does_not_become_user_fact() -> None:
    assert assistant_answer_defects(
        query("Does this workspace have no credentials?"),
        "This workspace has no credentials.",
    ) == ("unsupported_workspace_inventory",)


def test_repair_preserves_scope_conversation_and_exact_fallback_last_line() -> None:
    original = query(conversation=[{"role": "user", "content": "Use official docs."}])
    repaired = assistant_repair_query(
        original,
        (
            "unsupported_workspace_inventory",
            "n8n_code_mode_mismatch",
            "unknown code with rejected prose",
        ),
    )
    original_request, original_authority = original.split("\n", 1)
    repaired_request, repaired_authority = repaired.split("\n", 1)
    before, after = json.loads(original_request), json.loads(repaired_request)
    assert original_authority == repaired_authority
    assert before["message"] == after["message"]
    assert before["conversation"] == after["conversation"]
    assert after["instruction"].startswith(before["instruction"])
    assert "one compatible execution mode" in after["instruction"]
    assert "unknown code with rejected prose" not in repaired


def test_repair_handles_overlong_request_without_fallback_and_ignores_unknown_codes() -> (
    None
):
    original = query("Research " + "a" * 1100)
    assert "\n" not in original
    repaired = assistant_repair_query(original, ("source_component_mismatch",))
    assert "\n" not in repaired
    assert json.loads(repaired)["message"] == json.loads(original)["message"]
    assert assistant_repair_query(original, ("unknown",)) == original
    assert (
        assistant_repair_query("not canonical", ("n8n_code_mode_mismatch",))
        == "not canonical"
    )
    assert (
        assistant_answer_defects("not canonical", "No workspace credentials exist.")
        == ()
    )


@pytest.mark.parametrize(
    ("statement", "url", "title", "expected"),
    [
        (
            "The Webhook node supports Header Auth.",
            "https://docs.example.test/core/n8n-nodes-langchain.chattrigger/",
            "Chat Trigger",
            False,
        ),
        (
            "The Webhook node supports Header Auth.",
            "https://docs.example.test/core/n8n-nodes-base.webhook/",
            "Webhook",
            True,
        ),
        (
            "The Chat Trigger node has a webhook URL.",
            "https://docs.example.test/core/n8n-nodes-langchain.chattrigger/",
            "Chat Trigger",
            True,
        ),
        (
            "Requests reach the Webhook node.",
            "https://docs.example.test/core/n8n-nodes-base.webhook/",
            "Webhook",
            True,
        ),
        (
            "The Webhook node supports authentication.",
            "https://docs.example.test/general/authentication",
            "Authentication guidance",
            True,
        ),
        (
            "The Webhook node supports authentication.",
            "https://docs.example.test/general/nodes",
            "Generic n8n node documentation",
            True,
        ),
        (
            "Authentication is supported.",
            "https://docs.example.test/core/n8n-nodes-langchain.chattrigger/",
            "Chat Trigger",
            True,
        ),
        (
            "The Webhook node supports authentication.",
            "https://docs.example.test/arbitrary/path",
            "Chat Trigger node documentation",
            False,
        ),
        (
            "The Respond to Webhook node returns the response.",
            "https://docs.example.test/core/n8n-nodes-base.respondtowebhook/",
            "Respond to Webhook",
            True,
        ),
        (
            "The OpenAI Chat Model node supplies the model.",
            "https://docs.example.test/core/n8n-nodes-langchain.lmchatopenai/",
            "OpenAI Chat Model | n8n",
            True,
        ),
    ],
)
def test_rejects_only_explicit_source_component_mismatch(
    statement, url, title, expected
) -> None:
    assert assistant_claim_source_matches(statement, url, title) is expected


@pytest.mark.parametrize(
    ("statement", "slug", "title"),
    [
        (
            "The Webhook node supports Header Auth.",
            "n8n-nodes-langchain.chattrigger",
            "Webhook",
        ),
        (
            "The Chat Trigger node accepts messages.",
            "n8n-nodes-base.webhook",
            "Chat Trigger | n8n",
        ),
        (
            "The HTTP Request node sends a request.",
            "n8n-nodes-base.code",
            "HTTP Request documentation",
        ),
    ],
)
def test_matching_title_cannot_override_known_conflicting_node_slug(
    statement, slug, title
) -> None:
    assert not assistant_claim_source_matches(
        statement, f"https://docs.example.test/core/{slug}/", title
    )


@pytest.mark.parametrize(
    "subject",
    [
        "Each node",
        "The current node",
        "Every node",
        "The next node",
        "The previous node",
    ],
)
def test_generic_node_references_do_not_establish_component_mismatch(
    subject: str,
) -> None:
    assert assistant_claim_source_matches(
        f"{subject} receives input items.",
        "https://docs.example.test/core/n8n-nodes-base.code/",
        "Code",
    )


def test_generic_qualifier_does_not_erase_an_explicit_component_name() -> None:
    assert not assistant_claim_source_matches(
        "Each Webhook node accepts requests.",
        "https://docs.example.test/core/n8n-nodes-langchain.chattrigger/",
        "Chat Trigger",
    )


def test_title_can_still_establish_a_display_name_alias_for_an_unknown_slug() -> None:
    assert assistant_claim_source_matches(
        "The Provider Chat Model node supplies the model.",
        "https://docs.example.test/core/n8n-nodes-langchain.lmchatprovider/",
        "Provider Chat Model | n8n",
    )


def exact_claim(part: str, statement: str, *, last: bool = False) -> dict:
    encoded = part.encode("utf-8")
    start = (
        encoded.rindex(statement.encode("utf-8"))
        if last
        else encoded.index(statement.encode("utf-8"))
    )
    return {
        "text": statement,
        "segment_start": start,
        "segment_end": start + len(statement.encode("utf-8")),
        "offset_unit": "utf8_bytes",
        "span_target": "provider_response_part",
        "provenance_artifact": {"text": part},
    }


def test_source_correspondence_uses_exact_claim_heading_without_rewriting_fact() -> (
    None
):
    statement = "[ ] **Authentication:** Set to `None` (provider-free)."
    part = f"# Checklist é\n\n## 1. Inbound Webhook Configuration\n\n- {statement}"
    raw = exact_claim(part, statement)
    contextual = assistant_claim_statement_context(statement, raw)
    assert contextual == f"webhook node: {statement}"
    assert raw["text"] == statement
    assert not assistant_claim_source_matches(
        contextual,
        "https://docs.example.test/core/n8n-nodes-langchain.chattrigger/",
        "Chat Trigger",
    )
    assert assistant_claim_source_matches(
        contextual,
        "https://docs.example.test/core/n8n-nodes-base.webhook/",
        "Webhook",
    )


def test_source_context_respects_section_boundaries_and_duplicate_claim_offsets() -> (
    None
):
    statement = "Authentication can be configured."
    part = (
        f"## Webhook Configuration\n\n{statement}\n\n"
        f"## Chat Trigger Configuration\n\n{statement}"
    )
    assert assistant_claim_statement_context(
        statement, exact_claim(part, statement)
    ) == (f"webhook node: {statement}")
    assert assistant_claim_statement_context(
        statement, exact_claim(part, statement, last=True)
    ) == (f"chat trigger node: {statement}")


@pytest.mark.parametrize(
    "part",
    [
        "## Webhook Configuration\n\n## General guidance\n\nAuthentication can be configured.",
        "## Webhook and Chat Trigger comparison\n\nAuthentication can be configured.",
        "```text\n## Webhook Configuration\n```\n\nAuthentication can be configured.",
    ],
)
def test_unknown_ambiguous_or_fenced_headings_do_not_supply_component(
    part: str,
) -> None:
    statement = "Authentication can be configured."
    assert (
        assistant_claim_statement_context(statement, exact_claim(part, statement))
        == statement
    )


def test_unbound_or_wrong_span_does_not_supply_component() -> None:
    statement = "Authentication can be configured."
    part = f"## Webhook Configuration\n\n{statement}"
    raw = exact_claim(part, statement)
    raw["segment_start"] += 1
    assert assistant_claim_statement_context(statement, raw) == statement
    assert assistant_claim_statement_context(statement, {}) == statement


def test_prompt_distinguishes_constraints_inventory_versions_and_components() -> None:
    instruction = json.loads(query().split("\n", 1)[0])["instruction"]
    assert "not evidence that workspace credentials" in instruction
    assert "one compatible execution mode and return shape per snippet" in instruction
    assert "user's pinned deployment version from current documentation" in instruction
    assert "specific component" in instruction
    assert "does not establish that a workflow is provider-free" in instruction
