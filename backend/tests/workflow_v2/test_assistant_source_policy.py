from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from backend.domain.workflow_v2.contracts import AssistantTurnInputV1, canonical_json
from backend.services.workflow_v2.assistant.source_policy import (
    AssistantSourcePolicy,
    ReviewedPublisherBinding,
    assistant_source_policy_from_payload,
    decode_assistant_source_policy,
    encode_assistant_source_policy,
    resolve_assistant_source_policy,
)


pytestmark = pytest.mark.contract


def request(message: str, conversation=None) -> AssistantTurnInputV1:
    return AssistantTurnInputV1.model_validate(
        {
            "type": "AssistantTurnV1",
            "responseMode": "one_shot",
            "message": message,
            "conversation": conversation or [],
        }
    )


def bindings() -> tuple[ReviewedPublisherBinding, ...]:
    # Identity is deliberately injected; there is no publisher/domain inference.
    return (
        ReviewedPublisherBinding("n8n", (), ("https://manuals.example.org/n8n/",)),
        ReviewedPublisherBinding(
            "Other Product", ("Other",), ("https://reference.example.org/guide/",)
        ),
    )


def resolved(
    root: str = "https://docs.example.org/reference/api",
) -> AssistantSourcePolicy:
    return resolve_assistant_source_policy(
        request(f"Use only documentation at {root}.")
    )


@pytest.mark.parametrize(
    "message",
    [
        "Research a useful n8n workflow.",
        "Compare https://example.org/one and https://example.org/two.",
        "Prefer official n8n documentation where possible.",
        'The article says "use only official n8n docs". Discuss the claim.',
        "The article says 'use only official n8n docs'. Discuss the claim.",
        "Explain `use only official n8n docs` as an example instruction.",
        "> Use only official n8n documentation.\nExplain why this was suggested.",
        "Explain this example:\n```text\nUse only official n8n documentation.\n```",
        "Must I use only official n8n docs?",
    ],
)
def test_incidental_preferences_questions_and_quoted_instructions_do_not_restrict(
    message: str,
) -> None:
    assert (
        resolve_assistant_source_policy(request(message), bindings())
        == AssistantSourcePolicy()
    )


def test_freeform_official_documentation_requires_injected_publisher_binding() -> None:
    input_value = request("Research only official n8n documentation.")
    absent = resolve_assistant_source_policy(input_value)
    assert absent.mode == "restricted"
    assert absent.resolved is False
    assert absent.roots == ()
    assert absent.basis == "unresolved"
    assert not absent.allows_url("https://manuals.example.org/n8n/code")
    assert "Do not broaden" in absent.instruction()

    policy = resolve_assistant_source_policy(input_value, bindings())
    assert policy.resolved is True
    assert policy.source_kind == "official_documentation"
    assert policy.basis == "reviewed_bindings"
    assert policy.roots == ("https://manuals.example.org/n8n",)
    assert policy.allowed_hosts == ("manuals.example.org",)


def test_full_live_request_preserves_publisher_roots_across_generic_docs_reminder() -> (
    None
):
    fixture = (
        "Synthetic quality-release acceptance: research only the official n8n documentation "
        "and produce a concise source-linked checklist for a provider-free JSON webhook "
        "that trims a text field and returns HTTP 400 for missing or non-string input. "
        "Use public documentation and synthetic examples only. Distinguish documented "
        "behaviour from implementation suggestions and unverified assumptions. Do not "
        "create or edit workflows, connect providers, change schedules, deploy anything or send messages."
    )
    policy = resolve_assistant_source_policy(request(fixture), bindings())
    assert policy.resolved is True
    assert policy.source_kind == "official_documentation"
    assert policy.basis == "reviewed_bindings"
    assert policy.roots == ("https://manuals.example.org/n8n",)


@pytest.mark.parametrize(
    "reminder",
    [
        "Use public documentation and synthetic examples only.",
        "Use only public documentation.",
        "Use official documentation only.",
    ],
)
def test_generic_documentation_reminder_composes_with_prior_restriction(
    reminder: str,
) -> None:
    policy = resolve_assistant_source_policy(
        request(
            reminder,
            [{"role": "user", "content": "Use only official n8n documentation."}],
        ),
        bindings(),
    )
    assert policy.roots == ("https://manuals.example.org/n8n",)
    assert policy.source_kind == "official_documentation"


@pytest.mark.parametrize(
    "change",
    [
        "Use public UnknownVendor documentation and synthetic examples only.",
        "Use only official n8n and UnknownVendor documentation.",
        "Actually use public documentation only.",
        "Use only public documentation at http://unsafe.example.org/docs.",
    ],
)
def test_new_ambiguous_publisher_or_explicit_change_does_not_retain_old_roots(
    change: str,
) -> None:
    policy = resolve_assistant_source_policy(
        request(
            change,
            [{"role": "user", "content": "Use only official n8n documentation."}],
        ),
        bindings(),
    )
    assert policy.mode == "restricted"
    assert policy.resolved is False
    assert policy.roots == ()


@pytest.mark.parametrize(
    "message",
    [
        "Use only official n8n sources.",
        "Research using official publisher websites only.",
    ],
)
def test_official_source_restriction_without_documentation_binding_never_becomes_unrestricted(
    message: str,
) -> None:
    policy = resolve_assistant_source_policy(request(message), bindings())
    assert policy.mode == "restricted"
    assert policy.resolved is False
    assert not policy.allows_url("https://unreviewed.example.org/official-report")


@pytest.mark.parametrize(
    "message",
    [
        "Use only official n8n and UnknownVendor documentation.",
        "Use only official n8n docs and UnknownVendor docs.",
        "Use only documentation from n8n and UnknownVendor.",
        "Use only official n8nchat documentation.",
        "Use only official n8n-helper documentation.",
    ],
)
def test_mixed_unknown_and_lookalike_publishers_never_partially_resolve(
    message: str,
) -> None:
    policy = resolve_assistant_source_policy(request(message), bindings())
    assert policy.mode == "restricted"
    assert policy.resolved is False
    assert policy.roots == ()


@pytest.mark.parametrize(
    "message",
    [
        "Use only official n8n and Other Product documentation.",
        "Use only official n8n docs and Other docs.",
        "Use only documentation from n8n and Other.",
    ],
)
def test_all_requested_publishers_must_resolve_and_all_roots_are_kept(
    message: str,
) -> None:
    policy = resolve_assistant_source_policy(request(message), bindings())
    assert policy.resolved is True
    assert policy.roots == (
        "https://manuals.example.org/n8n",
        "https://reference.example.org/guide",
    )


def test_conflicting_reviewed_aliases_are_unresolved() -> None:
    conflicting = (
        *bindings(),
        ReviewedPublisherBinding(
            "Different Publisher", ("n8n",), ("https://different.example.org/docs",)
        ),
    )
    policy = resolve_assistant_source_policy(
        request("Use only official n8n docs."), conflicting
    )
    assert policy.resolved is False


def test_explicit_roots_are_user_references_not_independent_ownership_proof() -> None:
    policy = resolve_assistant_source_policy(
        request("Use only official documentation at https://manuals.example.org/docs/.")
    )
    assert policy.roots == ("https://manuals.example.org/docs",)
    assert policy.basis == "user_references"
    assert "not independently verified publisher ownership" in policy.instruction()
    assert policy.resolved is True


@pytest.mark.parametrize(
    "reply",
    [
        "https://manuals.example.org/docs/",
        "Use this reference: https://manuals.example.org/docs/",
    ],
)
def test_owner_can_supply_missing_documentation_reference_in_followup(
    reply: str,
) -> None:
    policy = resolve_assistant_source_policy(
        request(
            reply,
            [{"role": "user", "content": "Use only official n8n documentation."}],
        )
    )
    assert policy.roots == ("https://manuals.example.org/docs",)
    assert policy.basis == "user_references"
    assert policy.source_kind == "official_documentation"


@pytest.mark.parametrize(
    "message",
    [
        "Use only documentation: https://manuals.example.org/docs/",
        "Restrict sources to https://manuals.example.org/docs/",
        "Use only [this reference](https://manuals.example.org/docs/).",
        'Use only documentation at "https://manuals.example.org/docs/".',
        "Use only documentation at `https://manuals.example.org/docs/`.",
        "Use only official documentation:\nhttps://manuals.example.org/docs/",
        "Use only https://manuals.example.org/docs/, not https://evil.example.org/docs/.",
    ],
)
def test_explicit_reference_forms_produce_exact_roots(message: str) -> None:
    policy = resolve_assistant_source_policy(request(message))
    assert policy.resolved is True
    assert policy.roots == ("https://manuals.example.org/docs",)


@pytest.mark.parametrize(
    "path, canonical_path",
    [
        ("country-profiles/estonia_en", "country-profiles/estonia_en"),
        ("my_page", "my_page"),
        ("a*b_", "a*b_"),
        ("a%2Ab%5Fpage", "a*b_page"),
        ("a%60b_page", "a%60b_page"),
        ("mode(a_b)", "mode(a_b)"),
        ("don't_strip*these_chars", "don't_strip*these_chars"),
        ("x!$&'()+,;=:@~_end", "x!$&'()+,;=:@~_end"),
    ],
)
@pytest.mark.parametrize(
    "template",
    [
        "Use only documentation at {url}.",
        "Use only documentation at `{url}`.",
        'Use only documentation at "{url}".',
        "Use only documentation at <{url}>.",
        "Use only documentation at *{url}*.",
        "Use only documentation at **{url}**.",
        "Use only documentation at _{url}_.",
        "Use only documentation at __{url}__.",
        "Use only documentation at ***{url}***.",
        "**Use only documentation at {url}**.",
    ],
)
def test_markdown_cleanup_preserves_exact_source_url_authority(
    path: str,
    canonical_path: str,
    template: str,
) -> None:
    root = "https://publisher.example/docs/" + canonical_path
    supplied = "https://publisher.example/docs/" + path
    policy = resolve_assistant_source_policy(request(template.format(url=supplied)))
    assert policy.resolved is True
    assert policy.roots == (root,)
    assert policy.allows_url(supplied)
    assert policy.allows_url(root + "/child_page?mode_name=a*b&escaped=%5F")
    mutated = root.replace("_", "").replace("*", "")
    if mutated != root:
        assert not policy.allows_url(mutated)


@pytest.mark.parametrize("suffix", [".", "!", ";", ",", ")", "_", "*"])
@pytest.mark.parametrize("wrapper", ["<{url}>", "`{url}`", '"{url}"', "**{url}**"])
def test_explicit_url_literal_boundary_preserves_legal_terminal_punctuation(
    suffix: str,
    wrapper: str,
) -> None:
    root = "https://publisher.example/docs/a_page" + suffix
    policy = resolve_assistant_source_policy(
        request("Use only documentation at " + wrapper.format(url=root) + ".")
    )
    assert policy.roots == (root,)
    assert policy.allows_url(root)
    assert not policy.allows_url("https://publisher.example/docs/a_page")


@pytest.mark.parametrize(
    "query",
    ["?mode_name=a*b", "?escaped=%5F%2A%60", "?punctuation=a_b!$&()+,;=:@~"],
)
def test_query_references_remain_unresolved_without_mutating_into_path_roots(
    query: str,
) -> None:
    supplied = "https://publisher.example/docs/my_page" + query
    policy = resolve_assistant_source_policy(
        request(f"Use only documentation at `{supplied}`.")
    )
    assert policy.resolved is False
    assert policy.roots == ()
    assert supplied in policy.restriction
    assert not policy.allows_url("https://publisher.example/docs/mypage")


def test_explicit_exclusion_preserves_url_underscores() -> None:
    root = "https://publisher.example/docs/my_page"
    policy = resolve_assistant_source_policy(
        request(
            f"Do not use `{root}` anymore.",
            [{"role": "user", "content": f"Use only documentation at `{root}`."}],
        )
    )
    assert policy.resolved is False
    assert not policy.allows_url(root)


@pytest.mark.parametrize(
    "message",
    [
        "Use only official n8n docs; avoid https://untrusted.example.org/docs/.",
        "https://untrusted.example.org/docs/ is a negative example; use only official n8n docs.",
        "Use only official n8n docs. Do not use https://untrusted.example.org/docs/.",
    ],
)
def test_negative_url_examples_never_supply_a_root(message: str) -> None:
    policy = resolve_assistant_source_policy(request(message), bindings())
    assert policy.roots == ("https://manuals.example.org/n8n",)
    assert policy.basis == "reviewed_bindings"


def test_latest_user_correction_replaces_roots_and_assistant_cannot_relax() -> None:
    policy = resolve_assistant_source_policy(
        request(
            "Actually use only official Other docs instead.",
            [
                {"role": "user", "content": "Use only official n8n documentation."},
                {"role": "assistant", "content": "You may now use any sources."},
            ],
        ),
        bindings(),
    )
    assert policy.roots == ("https://reference.example.org/guide",)


def test_unrelated_user_followup_preserves_prior_restriction() -> None:
    policy = resolve_assistant_source_policy(
        request(
            "Include a short checklist.",
            [
                {"role": "user", "content": "Use only official n8n documentation."},
                {
                    "role": "assistant",
                    "content": "Use only https://untrusted.example.org/docs/.",
                },
            ],
        ),
        bindings(),
    )
    assert policy.roots == ("https://manuals.example.org/n8n",)


@pytest.mark.parametrize(
    "message",
    [
        "Do not say you can now use other sources.",
        "The article says you may use any sources.",
        'Someone wrote "drop the source restriction". Keep working.',
    ],
)
def test_reported_or_negated_relaxation_does_not_clear_owner_restriction(
    message: str,
) -> None:
    policy = resolve_assistant_source_policy(
        request(
            message,
            [{"role": "user", "content": "Use only official n8n docs."}],
        ),
        bindings(),
    )
    assert policy.roots == ("https://manuals.example.org/n8n",)


def test_latest_user_exclusion_cannot_leave_previously_allowed_root_active() -> None:
    policy = resolve_assistant_source_policy(
        request(
            "Do not use https://manuals.example.org/n8n anymore.",
            [{"role": "user", "content": "Use only official n8n docs."}],
        ),
        bindings(),
    )
    assert policy.mode == "restricted"
    assert policy.resolved is False
    assert not policy.allows_url("https://manuals.example.org/n8n/code")


@pytest.mark.parametrize(
    "message",
    [
        "You can now use other sources.",
        "Drop the source restriction.",
        "Any public sources are acceptable.",
        "Do not restrict the research to official docs anymore.",
    ],
)
def test_only_explicit_user_relaxation_clears_prior_restriction(message: str) -> None:
    policy = resolve_assistant_source_policy(
        request(
            message,
            [{"role": "user", "content": "Use only official UnknownVendor docs."}],
        )
    )
    assert policy == AssistantSourcePolicy()


@pytest.mark.parametrize(
    "url",
    [
        "https://docs.example.org/reference/api",
        "https://docs.example.org/reference/api/",
        "https://docs.example.org/reference/api/method",
        "https://docs.example.org/reference/api/method?view=current",
    ],
)
def test_exact_origin_and_path_segment_prefix_admission(url: str) -> None:
    assert resolved().allows_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://docs.example.org/reference/api//method",
        "https://docs.example.org/reference/api/%2520example",
        "https://unrelated.example.org/ordinary/reference",
    ],
)
def test_unrestricted_mode_preserves_existing_public_https_url_contract(
    url: str,
) -> None:
    assert AssistantSourcePolicy().allows_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://docs.example.org/reference/api/method",
        "https://sub.docs.example.org/reference/api/method",
        "https://docs.example.org.evil.org/reference/api/method",
        "https://evil.org/docs.example.org/reference/api/method",
        "https://user@docs.example.org/reference/api/method",
        "https://docs.example.org@evil.org/reference/api/method",
        "https://docs.example.org:443/reference/api/method",
        "https://DOCS.example.org/reference/api/method",
        "https://docs.example.org/reference/apis",
        "https://docs.example.org/reference/api-evil",
        "https://docs.example.org/reference/api;evil",
        "https://docs.example.org/reference/api/../issues",
        "https://docs.example.org/reference/api/%2e%2e/issues",
        "https://docs.example.org/reference/api/%252e%252e/issues",
        "https://docs.example.org/reference/api/%2F..%2Fissues",
        "https://docs.example.org/reference/api/%5c..%5cissues",
        "https://docs.example.org/reference/api//issues",
        "https://docs.example.org/reference/api/./method",
        "https://docs.example.org/reference/api/%00method",
        "https://docs.example.org/reference/api/%0Amethod",
        "https://docs.example.org/reference/api/%ZZmethod",
        "https://docs.example.org/reference/api/%FFmethod",
        "https://docs.example.org/reference/api/method#section",
        "https://127.0.0.1/reference/api/method",
        "https://example.local/reference/api/method",
    ],
)
def test_malicious_noncanonical_and_sibling_url_boundaries_are_denied(url: str) -> None:
    assert not resolved().allows_url(url)


@pytest.mark.parametrize(
    "root",
    [
        "https://docs.example.org/reference?view=docs",
        "https://docs.example.org/reference#section",
        "https://docs.example.org/reference/../issues",
        "http://docs.example.org/reference",
    ],
)
def test_invalid_positive_reference_keeps_restriction_unresolved(root: str) -> None:
    policy = resolve_assistant_source_policy(
        request(f"Use only documentation at {root}.")
    )
    assert policy.mode == "restricted"
    assert policy.resolved is False
    assert policy.roots == ()


def test_invalid_root_does_not_leave_partial_allowlist() -> None:
    policy = resolve_assistant_source_policy(
        request(
            "Use only https://docs.example.org/reference and http://unsafe.example.org/reference."
        )
    )
    assert policy.resolved is False
    assert policy.roots == ()


def test_unicode_document_path_is_canonicalized_without_weakening_origin() -> None:
    policy = resolved("https://docs.example.org/café/")
    assert policy.roots == ("https://docs.example.org/caf%C3%A9",)
    assert policy.allows_url("https://docs.example.org/caf%C3%A9/example")
    assert not policy.allows_url("https://docs.example.org/caf%C3%A9-other/example")


def test_payload_roundtrip_and_frozen_policy() -> None:
    for policy in (
        AssistantSourcePolicy(),
        resolved(),
        resolve_assistant_source_policy(request("Use only official Unknown docs.")),
    ):
        assert assistant_source_policy_from_payload(policy.to_payload()) == policy
        assert (
            decode_assistant_source_policy(encode_assistant_source_policy(policy))
            == policy
        )
        with pytest.raises(FrozenInstanceError):
            policy.resolved = False


@pytest.mark.parametrize(
    "update",
    [
        {"version": True},
        {"version": 2},
        {"resolved": 1},
        {"resolved": "true"},
        {"mode": "unknown"},
        {"sourceKind": "trusted_because_title_says_official"},
        {"basis": "model_claim"},
        {"roots": "https://docs.example.org/reference"},
        {"roots": [{"url": "https://docs.example.org/reference"}]},
        {"roots": ["https://docs.example.org/reference/"]},
        {
            "roots": [
                "https://docs.example.org/reference",
                "https://docs.example.org/reference",
            ]
        },
        {"roots": ["https://docs.example.org/z", "https://docs.example.org/a"]},
        {"restriction": "a" * 1_001},
        {"unexpected": "not allowed"},
    ],
)
def test_payload_decoder_rejects_malformed_or_noncanonical_fields(update: dict) -> None:
    with pytest.raises(ValueError):
        assistant_source_policy_from_payload({**resolved().to_payload(), **update})


@pytest.mark.parametrize(
    "update",
    [
        {"mode": "unrestricted"},
        {"resolved": False},
        {"roots": []},
        {"basis": "none"},
        {"sourceKind": "any"},
        {"restriction": ""},
    ],
)
def test_payload_cannot_launder_inconsistent_or_unresolved_restrictions(
    update: dict,
) -> None:
    with pytest.raises(ValueError):
        assistant_source_policy_from_payload({**resolved().to_payload(), **update})


def test_encoded_policy_rejects_noncanonical_json_and_unknown_fields() -> None:
    with pytest.raises(ValueError):
        decode_assistant_source_policy(" " + encode_assistant_source_policy(resolved()))
    with pytest.raises(ValueError):
        decode_assistant_source_policy(canonical_json({"version": 1}))


def test_root_and_binding_limits_fail_closed() -> None:
    with pytest.raises(ValueError):
        ReviewedPublisherBinding(
            "Publisher", (), tuple(f"https://docs.example.org/{i}" for i in range(21))
        )
    with pytest.raises(ValueError):
        resolve_assistant_source_policy(request("Research something."), bindings() * 65)
    policy = resolve_assistant_source_policy(
        request(
            "Use only "
            + " and ".join(f"https://docs.example.org/{i}" for i in range(21))
        )
    )
    assert policy.resolved is False
    assert policy.roots == ()
