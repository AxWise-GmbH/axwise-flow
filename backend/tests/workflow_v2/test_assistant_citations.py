"""Canonical citation links must be local, admitted, and provenance-preserving."""

from __future__ import annotations

import copy

import pytest

import backend.services.workflow_v2.assistant.citations as citations_module
from backend.services.workflow_v2.assistant.citations import (
    assistant_citation_display_statement,
    normalize_assistant_citation_claims,
    prose_link_destinations,
    render_assistant_citations,
)
from backend.tests.workflow_v2.test_assistant_claim_spans import grounded_response


pytestmark = pytest.mark.contract
SOURCE = "https://docs.example.org/reference"
OTHER = "https://publisher.example.org/another"
DISCOVERED = "https://discovery.example.org/not-evidence"


def render(raw: dict, *, claims=None, sources=None):
    return render_assistant_citations(
        raw,
        admitted_claims=(
            normalize_assistant_citation_claims(raw) if claims is None else claims
        ),
        admitted_source_urls=[SOURCE, OTHER] if sources is None else sources,
    )


def test_actual_style_markers_use_claim_urls_not_numeric_ids_and_keep_provenance() -> (
    None
):
    first = "The setting is optional."
    second = "The other setting is required."
    raw = grounded_response(
        f"{first} [[5.1.1]]\n\n{second} [[5.1.1]]",
        [first, second],
        urls=[SOURCE, OTHER],
    )
    original = copy.deepcopy(raw)
    claims = normalize_assistant_citation_claims(raw)
    original_claims = copy.deepcopy(claims)

    result = render(raw, claims=claims)

    assert result.issues == ()
    assert result.markdown == f"{first} [1](<{SOURCE}>)\n\n{second} [2](<{OTHER}>)"
    assert result.rendered_citation_count == 2
    assert raw == original
    assert claims == original_claims


@pytest.mark.parametrize(
    "marker", ["[[5.1.1]]", "[[made-up-id]]", "[9]", "[1.2.8]", "[1, 3]", "[^bogus]"]
)
def test_placeholder_syntax_is_not_a_source_mapping(marker: str) -> None:
    statement = "The setting is optional."
    raw = grounded_response(f"{statement} {marker}", [statement])
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"{statement} [1](<{SOURCE}>)"


def test_repeated_placeholders_for_one_assertion_emit_one_link() -> None:
    statement = "The setting is optional."
    raw = grounded_response(f"{statement} [[1.2.8]][[5.1.1]][[5.1.1]]", [statement])
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"{statement} [1](<{SOURCE}>)"
    assert result.rendered_citation_count == 1


@pytest.mark.parametrize(
    "suffix", [" [[5.1.1]]", " [[5.1.1]].", " [[5.1.1]] [[1.2.8]]."]
)
def test_trailing_metadata_does_not_hide_an_exact_supported_complete_core(
    suffix: str,
) -> None:
    statement = "The setting is optional"
    raw = grounded_response(statement + suffix, [statement])
    original = copy.deepcopy(raw)
    claims = normalize_assistant_citation_claims(raw)
    assert [claim["text"] for claim in claims] == [statement]
    assert claims[0]["segment_end"] == len(statement.encode("utf-8"))
    assert claims[0]["provenance_artifact"] == raw["claims"][0]["provenance_artifact"]
    assert render(raw, claims=claims).issues == ()
    assert raw == original


def test_citation_metadata_alone_never_becomes_a_fact() -> None:
    statement = "The setting is optional."
    text = f"{statement} [[5.1.1]]"
    raw = grounded_response(text, [text])
    claims = normalize_assistant_citation_claims(raw)
    assert [claim["text"] for claim in claims] == [statement]


def test_internal_metadata_stays_in_original_claim_statement() -> None:
    statement = "The setting [[5.1.1]] is optional."
    raw = grounded_response(statement, [statement])
    original = copy.deepcopy(raw)
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"The setting [1](<{SOURCE}>) is optional."
    assert raw == original


@pytest.mark.parametrize(
    "text",
    [
        "The setting is optional. Unsupported behavior is guaranteed [[5.1.1]].",
        "The setting is optional but unsupported behavior is guaranteed [[5.1.1]].",
        "The setting is optional.\n\n[[5.1.1]]",
        "[[5.1.1]] The setting is optional.",
    ],
)
def test_unsupported_or_nonadjacent_citation_cannot_borrow_valid_evidence(
    text: str,
) -> None:
    supported = "The setting is optional"
    raw = grounded_response(text, [supported])
    result = render(raw)
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == text
    assert result.rendered_citation_count == 0


def test_noncontiguous_support_does_not_repair_an_unsupported_gap() -> None:
    statement = "The setting is optional and remains safe."
    text = f"{statement} [[5.1.1]]"
    split = statement.index("optional")
    raw = grounded_response(text, [(0, split), (split + 1, len(statement))])
    assert render(raw).issues == ("unresolved_citation_claim",)


def test_discovered_source_cannot_retroactively_supply_missing_claim_mapping() -> None:
    statement = "The setting is optional."
    raw = grounded_response(f"{statement} [[1]]", [statement])
    raw["sources"].append({"title": "Not evidence", "url": DISCOVERED})
    claims = normalize_assistant_citation_claims(raw)
    claims[0]["source_urls"] = [DISCOVERED]
    result = render(raw, claims=claims, sources=[DISCOVERED])
    assert result.issues == ("unresolved_citation_claim",)
    assert DISCOVERED not in result.markdown


def test_unadmitted_url_is_not_rendered_even_when_provider_claim_names_it() -> None:
    statement = "The setting is optional."
    raw = grounded_response(f"{statement} [[1]]", [statement])
    assert render(raw, sources=[OTHER]).issues == ("unresolved_citation_claim",)


def test_multiple_admitted_sources_are_stable_sorted_and_deduplicated() -> None:
    statement = "The setting is optional."
    raw = grounded_response(f"{statement} [[97]]", [statement])
    raw["claims"][0]["source_urls"] = [OTHER, SOURCE, OTHER]
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"{statement} [1](<{SOURCE}>) [2](<{OTHER}>)"


@pytest.mark.parametrize(
    "mutation", ["text", "hash", "span", "part_text", "part_manifest"]
)
def test_original_raw_provenance_is_checked_before_any_replacement(
    mutation: str,
) -> None:
    statement = "The café setting is optional."
    raw = grounded_response(f"{statement} [[5.1.1]]", [statement])
    admitted = normalize_assistant_citation_claims(raw)
    if mutation == "text":
        raw["text"] += " Altered."
    elif mutation == "hash":
        raw["provider_response_hash"] = "0" * 64
    elif mutation == "span":
        raw["claims"][0]["segment_start"] += 1
    elif mutation == "part_text":
        raw["claims"][0]["provenance_artifact"]["text"] += " Altered."
    else:
        raw["claims"][0]["provenance_artifact"]["response_parts_sha256"] = "0" * 64
    result = render(raw, claims=admitted)
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == raw["text"]


def test_unicode_multipart_offsets_select_only_the_bound_occurrence() -> None:
    first = "The café setting is optional. [[5.1.1]]\n\n"
    statement = "The café setting is optional."
    last = statement + " [[5.1.1]]"
    raw = grounded_response(
        first + last, [statement], parts=[first, last], part_index=1
    )
    result = render(raw)
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == first + last


@pytest.mark.parametrize(
    "literal",
    [
        "`[[5.1.1]]`",
        "``literal ` [[5.1.1]]``",
        "\\[[5.1.1]]",
        '"[[5.1.1]]"',
        "'[[5.1.1]]'",
        "{{ list[[5.1.1]] }}",
        "```python\nvalue = [[5.1.1]]\n```",
        "~~~text\n[[5.1.1]]\n~~~",
        "    value = [[5.1.1]]",
        "> ```text\n> [[5.1.1]]\n> ```",
        "- ~~~text\n  [[5.1.1]]\n  ~~~",
        "<pre>[[5.1.1]]</pre>",
        "https://docs.example.org/[[5.1.1]]",
    ],
)
def test_code_and_explicit_marker_literals_are_preserved(literal: str) -> None:
    text = "Example:\n\n" + literal
    raw = {"text": text, "sources": [], "claims": []}
    result = render(raw)
    assert result.markdown == text
    assert result.issues == ()
    assert result.rendered_citation_count == 0


def test_numeric_markdown_link_cannot_keep_a_fabricated_destination() -> None:
    statement = "The setting is optional."
    raw = grounded_response(f"{statement} [1]({DISCOVERED})", [statement])
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"{statement} [1](<{SOURCE}>)"


def test_plain_no_marker_answer_is_not_silently_rewritten() -> None:
    text = "  The setting is optional.\n"
    raw = grounded_response(text, ["The setting is optional."])
    assert render(raw).markdown == text


def test_unversioned_adapter_requires_unique_exact_complete_statement() -> None:
    statement = "The setting is optional"
    raw = {
        "text": statement + " [[5.1.1]].",
        "claims": [{"text": statement, "source_urls": [SOURCE]}],
        "sources": [{"url": SOURCE}],
    }
    original = copy.deepcopy(raw)
    claims = normalize_assistant_citation_claims(raw)
    result = render(raw, claims=claims)
    assert result.issues == ()
    assert result.markdown == f"{statement} [1](<{SOURCE}>)."
    assert claims == raw["claims"]
    assert raw == original


def test_unversioned_adapter_cannot_bind_an_ambiguous_repeated_statement() -> None:
    statement = "The setting is optional."
    raw = {
        "text": f"{statement} [[1]]\n\n{statement} [[2]]",
        "claims": [{"text": statement, "source_urls": [SOURCE]}],
    }
    assert render(raw).issues == ("unresolved_citation_claim",)


def test_invalid_admitted_url_shape_fails_closed_without_exception() -> None:
    statement = "The setting is optional."
    raw = grounded_response(f"{statement} [[1]]", [statement])
    claims = normalize_assistant_citation_claims(raw)
    claims[0]["source_urls"] = [{"url": SOURCE}]
    assert render(raw, claims=claims).issues == ("unresolved_citation_claim",)


def test_contiguous_original_supports_keep_exact_core_with_terminal_metadata() -> None:
    statement = "The café setting is optional"
    split = statement.index("setting")
    raw = grounded_response(
        statement + " [[5.1.1]].", [(0, split), (split, len(statement))]
    )
    claims = normalize_assistant_citation_claims(raw)
    assert len(claims) == 1
    assert claims[0]["text"] == statement
    assert claims[0]["supporting_segments"] == [
        {"start": 0, "end": len(statement[:split].encode("utf-8"))},
        {
            "start": len(statement[:split].encode("utf-8")),
            "end": len(statement.encode("utf-8")),
        },
    ]
    assert render(raw, claims=claims).issues == ()


def test_unicode_multipart_rendering_uses_manifest_position() -> None:
    prefix = "An introductory café example.\n\n"
    statement = "The setting is optional."
    part = statement + " [[5.1.1]]"
    raw = grounded_response(
        prefix + part, [statement], parts=[prefix, part], part_index=1
    )
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"{prefix}{statement} [1](<{SOURCE}>)"


def test_valid_hashes_do_not_allow_a_different_response_part_order() -> None:
    statement = "The setting is optional."
    text = statement + " [[1]]"
    raw = grounded_response(text, [statement], parts=[text, "extra part"])
    assert render(raw).issues == ("unresolved_citation_claim",)


@pytest.mark.parametrize(
    "url",
    [
        "https://docs.example.org/path>injection",
        "https://docs.example.org/path\\injection",
        "http://docs.example.org/reference",
    ],
)
def test_unsafe_markdown_destinations_fail_closed(url: str) -> None:
    statement = "The setting is optional."
    raw = grounded_response(f"{statement} [[1]]", [statement], urls=[url])
    assert render(raw, sources=[url]).issues == ("unresolved_citation_claim",)


@pytest.mark.parametrize(
    ("statement", "expected"),
    [
        ("The setting [[5.1.1]] is optional.", "The setting is optional."),
        ("The setting is optional [[5.1.1]].", "The setting is optional."),
        ("The setting is optional. [[5.1.1]]", "The setting is optional."),
        ("The setting [[1]] [[2]] is optional.", "The setting is optional."),
        ("The setting is optional [[1]] [[2]].", "The setting is optional."),
        ("Use `[[5.1.1]]` as the literal. [[1]]", "Use `[[5.1.1]]` as the literal."),
        ("Use \\[[5.1.1]] as the literal. [[1]]", "Use \\[[5.1.1]] as the literal."),
        ('Use "[[5.1.1]]" as the literal. [[1]]', 'Use "[[5.1.1]]" as the literal.'),
        (
            "The setting is optional. [1](https://docs.example.org/reference)",
            "The setting is optional.",
        ),
        ("No citation.  Existing spaces stay.", "No citation.  Existing spaces stay."),
    ],
)
def test_display_statement_removes_only_citation_syntax(
    statement: str, expected: str
) -> None:
    assert assistant_citation_display_statement(statement) == expected


@pytest.mark.parametrize(
    ("markdown", "expected"),
    [
        (f"Read [official docs]({SOURCE}).", (SOURCE,)),
        (f"Read [official\ndocs]({SOURCE}).", (SOURCE,)),
        (f"Read [official docs](\n{SOURCE}\n).", (SOURCE,)),
        (f'Read [official docs](<{SOURCE}> "Reference").', (SOURCE,)),
        (f"Read <{SOURCE}>.", (SOURCE,)),
        (f"[nested [label]]({SOURCE})", (SOURCE,)),
        (
            "[docs](https://docs.example.org/node(foo)/)",
            ("https://docs.example.org/node(foo)/",),
        ),
        (
            r"[docs](https://docs.example.org/node\(foo\)/)",
            ("https://docs.example.org/node(foo)/",),
        ),
        (
            "[docs](https://docs.example.org/?a=1&amp;b=2)",
            ("https://docs.example.org/?a=1&b=2",),
        ),
        (f"[Docs][ref]\n\n[ref]: {SOURCE}", (SOURCE,)),
        (f"[Docs][]\n\n[docs]: {SOURCE}", (SOURCE,)),
        (f"[Docs]\n\n[docs]: {SOURCE}", (SOURCE,)),
        (f"[Docs][ref]\n\n[ref]: {SOURCE}\n[ref]: {OTHER}", (SOURCE,)),
        (f"No link.\n\n[unused]: {OTHER}", ()),
        (f"No link.\n\n[unused]: <{OTHER}>", ()),
        (f"`[docs]({OTHER})`", ()),
        (f"```md\n[docs]({OTHER})\n```", ()),
        (f"    [docs]({OTHER})", ()),
        (f"\\[docs]({OTHER})", ()),
        (f"\\<{OTHER}>", ()),
        (f"[docs]({SOURCE}) and <{SOURCE}> then [more]({OTHER})", (SOURCE, OTHER)),
        (f"[broken]({OTHER}", ()),
        (f"[broken\n\nlabel]({OTHER})", ()),
    ],
)
def test_prose_link_destinations_follow_markdown_without_code_or_discovery(
    markdown: str, expected: tuple[str, ...]
) -> None:
    assert prose_link_destinations(markdown) == expected


@pytest.mark.parametrize(
    "label", ["Code node", "`Code` node", "nested [node] label", "download file"]
)
def test_meaningful_inline_labels_keep_the_same_locally_admitted_destination(
    label: str,
) -> None:
    statement = f"The [{label}]({SOURCE}) transforms items."
    raw = grounded_response(statement, [statement])
    original = copy.deepcopy(raw)
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"The [{label}](<{SOURCE}>) transforms items."
    assert (
        assistant_citation_display_statement(statement, source_markdown=raw["text"])
        == f"The {label} transforms items."
    )
    assert raw == original


@pytest.mark.parametrize(
    "label", ["Code node", "official documentation", "download file", "endpoint"]
)
def test_good_label_does_not_repoint_an_unadmitted_model_resource(label: str) -> None:
    wrong = SOURCE + "/not-the-admitted-document"
    statement = f"The [{label}]({wrong}) transforms items."
    raw = grounded_response(statement, [statement])
    raw["sources"].append({"title": label, "url": wrong})
    result = render(raw, sources=[SOURCE, wrong])
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == statement


def test_descriptive_link_uses_its_own_local_claim_mapping_not_another_valid_fact() -> (
    None
):
    first = f"The [first option]({OTHER}) is supported."
    second = f"The [second option]({OTHER}) is also supported."
    raw = grounded_response(
        first + "\n\n" + second, [first, second], urls=[SOURCE, OTHER]
    )
    assert render(raw).issues == ("unresolved_citation_claim",)


def test_multiple_claim_sources_do_not_change_a_descriptive_resources_destination() -> (
    None
):
    statement = f"The [Code node]({OTHER}) transforms items."
    raw = grounded_response(statement, [statement])
    raw["claims"][0]["source_urls"] = [SOURCE, OTHER]
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"The [Code node](<{OTHER}>) transforms items."


@pytest.mark.parametrize(
    "link",
    [f"[Reference]({SOURCE})", f"<{SOURCE}>", f"[Reference][ref]\n\n[ref]: {SOURCE}"],
)
def test_reference_only_link_cannot_become_an_evidence_assertion(link: str) -> None:
    raw = grounded_response(link, [link])
    assert normalize_assistant_citation_claims(raw) == []
    result = render(raw)
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == link


def test_uncited_reference_footer_cannot_borrow_an_unrelated_valid_claim() -> None:
    statement = "The setting is optional."
    text = f"{statement}\n\n## References\n\n- [Documentation]({SOURCE})"
    raw = grounded_response(text, [statement])
    assert render(raw).issues == ("unresolved_citation_claim",)


@pytest.mark.parametrize("versioned", [False, True])
def test_extra_opaque_markers_do_not_turn_a_locator_into_a_fact(
    versioned: bool,
) -> None:
    link = f"[Documentation]({SOURCE})"
    text = link + " [[5.1.1]]"
    raw = (
        grounded_response(text, [text])
        if versioned
        else {"text": text, "claims": [{"text": link, "source_urls": [SOURCE]}]}
    )
    assert normalize_assistant_citation_claims(raw) == []
    assert render(raw).issues == ("unresolved_citation_claim",)


def test_citation_labels_may_adjoin_the_same_locally_supported_assertion() -> None:
    statement = "The setting is optional."
    raw = grounded_response(
        f"{statement} [Docs]({SOURCE}) [More]({OTHER})", [statement]
    )
    raw["claims"][0]["source_urls"] = [SOURCE, OTHER]
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"{statement} [Docs](<{SOURCE}>) [More](<{OTHER}>)"


@pytest.mark.parametrize("label", ["Code node", "1"])
def test_reference_links_render_from_local_definitions_and_preserve_fact_labels(
    label: str,
) -> None:
    statement = f"The [{label}][node] transforms items."
    text = f"{statement}\n\n[node]: {SOURCE}"
    raw = grounded_response(text, [statement])
    result = render(raw)
    assert result.issues == ()
    expected = (
        f"The [1](<{SOURCE}>) transforms items."
        if label == "1"
        else f"The [Code node](<{SOURCE}>) transforms items."
    )
    assert result.markdown.strip() == expected
    assert "[node]:" not in result.markdown
    if label == "Code node":
        assert (
            assistant_citation_display_statement(statement, source_markdown=text)
            == "The Code node transforms items."
        )


def test_unadmitted_reference_destination_is_not_repaired_to_a_different_source() -> (
    None
):
    statement = "The [Code node][node] transforms items."
    text = f"{statement}\n\n[node]: {OTHER}"
    raw = grounded_response(text, [statement])
    assert render(raw).issues == ("unresolved_citation_claim",)


def test_autolink_resource_cannot_be_changed_to_a_documentation_source() -> None:
    statement = f"The endpoint is <{OTHER}>."
    raw = grounded_response(statement, [statement])
    result = render(raw)
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == statement


def test_admitted_autolink_preserves_the_endpoint_value_in_markdown_and_fact_display() -> (
    None
):
    statement = f"The endpoint is <{SOURCE}>."
    raw = grounded_response(statement, [statement])
    assert render(raw).markdown == statement
    assert render(raw).issues == ()
    assert (
        assistant_citation_display_statement(statement)
        == f"The endpoint is `{SOURCE}`."
    )


def test_marker_looking_url_path_is_a_literal_destination_but_link_still_needs_admission() -> (
    None
):
    url = SOURCE + "/[[5.1.1]]"
    statement = f"The [reference]({url}) describes the setting."
    raw = grounded_response(statement, [statement], urls=[url])
    result = render(raw, sources=[url])
    assert result.issues == ()
    assert result.markdown == f"The [reference](<{url}>) describes the setting."
    assert render({"text": f"[Reference]({url})", "claims": []}).issues == (
        "unresolved_citation_claim",
    )


def test_canonical_destinations_preserve_literal_entity_looking_url_characters() -> (
    None
):
    url = SOURCE + "?q=&copy;"
    statement = "The setting is optional."
    raw = grounded_response(statement + " [[5.1.1]]", [statement], urls=[url])
    result = render(raw, sources=[url])
    assert result.issues == ()
    assert prose_link_destinations(result.markdown) == (url,)


def test_descriptive_and_opaque_citations_are_not_double_replaced() -> None:
    statement = f"The [Code node]({SOURCE}) transforms items."
    raw = grounded_response(
        statement + " [[5.1.1]] [1](https://fake.example.org/discovered)", [statement]
    )
    result = render(raw)
    assert result.issues == ()
    assert (
        result.markdown.rstrip()
        == f"The [Code node](<{SOURCE}>) transforms items. [1](<{SOURCE}>)"
    )


@pytest.mark.parametrize(
    "suffix",
    [
        " `[resource](https://outside.example.org/guide)",
        " {{ [resource](https://outside.example.org/guide) }}",
        "\n    [resource](https://outside.example.org/guide)",
        "\n\t[resource](https://outside.example.org/guide)",
        "\n\n```bad`info\n[resource](https://outside.example.org/guide)\n```",
        " `[resource](https://outside.example.org/guide)\n\nA later paragraph has a lone `.",
        " <code>[resource](https://outside.example.org/guide)</code>",
        " <pre>[resource](https://outside.example.org/guide)</pre>",
        " {{ $json.items[0] [resource](https://outside.example.org/guide) }}",
        "\n\n> ```text\n[resource](https://outside.example.org/guide)",
        "\n\n- ```text\n[resource](https://outside.example.org/guide)",
    ],
)
def test_code_looking_prose_cannot_hide_a_visible_markdown_destination(
    suffix: str,
) -> None:
    statement = "The setting is optional."
    text = statement + suffix
    raw = grounded_response(text, [statement])
    assert prose_link_destinations(text) == ("https://outside.example.org/guide",)
    result = render(raw)
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == text


@pytest.mark.parametrize(
    "code",
    [
        "`[resource](https://outside.example.org/guide)`",
        "``a literal ` and [resource](https://outside.example.org/guide)``",
        "`a multiline\n[resource](https://outside.example.org/guide)`",
        "```text\n[resource](https://outside.example.org/guide)\n```",
        "~~~text\n[resource](https://outside.example.org/guide)\n~~~",
        "    [resource](https://outside.example.org/guide)",
        "> ```text\n> [resource](https://outside.example.org/guide)\n> ```",
        "- ```text\n  [resource](https://outside.example.org/guide)\n  ```",
    ],
)
def test_genuine_markdown_code_does_not_become_a_prose_citation(code: str) -> None:
    statement = "The setting is optional."
    text = statement + "\n\n" + code
    raw = grounded_response(text, [statement])
    assert prose_link_destinations(text) == ()
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == text


@pytest.mark.parametrize("expression", ["{{ $json.items[0] }}", "{{ items[1, 2] }}"])
def test_expression_array_literals_are_not_opaque_citations(expression: str) -> None:
    text = "The expression is " + expression + "."
    assert render({"text": text, "claims": []}).issues == ()


@pytest.mark.parametrize(
    "definition",
    [
        "> [ref]: https://outside.example.org/guide",
        "- [ref]: https://outside.example.org/guide",
    ],
)
def test_reader_visible_nested_reference_definitions_fail_closed(
    definition: str,
) -> None:
    statement = "The setting is optional."
    text = statement + " [resource][ref]\n\n" + definition
    raw = grounded_response(text, [statement])
    assert prose_link_destinations(text) == ("https://outside.example.org/guide",)
    assert render(raw).issues == ("unresolved_citation_claim",)


def test_reader_visible_long_reference_label_fails_closed() -> None:
    statement = "The setting is optional."
    label = "a" * 201
    text = (
        statement
        + f" [resource][{label}]\n\n[{label}]: https://outside.example.org/guide"
    )
    raw = grounded_response(text, [statement])
    assert prose_link_destinations(text) == ("https://outside.example.org/guide",)
    assert render(raw).issues == ("unresolved_citation_claim",)


@pytest.mark.parametrize(
    "inner",
    [
        "[resource](https://outside.example.org/guide)",
        "<https://outside.example.org/guide>",
        "![resource](https://outside.example.org/guide)",
    ],
)
def test_reader_visible_nested_active_destinations_cannot_hide_in_allowed_outer_link(
    inner: str,
) -> None:
    statement = "The setting is optional."
    text = statement + f" [outer {inner}]({SOURCE})"
    raw = grounded_response(text, [statement])
    assert "https://outside.example.org/guide" in prose_link_destinations(text)
    result = render(raw)
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == text


def test_authoritative_reader_failure_is_not_a_no_citation_success(monkeypatch) -> None:
    def rejected(_text: str):
        raise ValueError("bounded parser rejected input")

    monkeypatch.setattr(citations_module, "reader_link_destinations", rejected)
    raw = {"text": "No apparent citation.", "claims": []}
    assert render(raw).issues == ("invalid_citation_response",)
    with pytest.raises(ValueError):
        prose_link_destinations(raw["text"])


def test_authoritative_reader_duplicate_counts_cannot_be_satisfied_by_one_link(
    monkeypatch,
) -> None:
    statement = "The setting is optional."
    raw = grounded_response(statement + f" [Docs]({SOURCE})", [statement])
    monkeypatch.setattr(
        citations_module, "reader_link_destinations", lambda _text: (SOURCE, SOURCE)
    )
    assert render(raw).issues == ("unresolved_citation_claim",)


def test_ordered_reader_destinations_cannot_swap_admission_between_claims() -> None:
    first = f"The first option [outer [actual]({OTHER})]({SOURCE}) is supported."
    second = f"The second option [outer [actual]({SOURCE})]({OTHER}) is supported."
    raw = grounded_response(
        first + "\n\n" + second, [first, second], urls=[SOURCE, OTHER]
    )
    assert prose_link_destinations(raw["text"]) == (OTHER, SOURCE)
    assert render(raw).issues == ("unresolved_citation_claim",)


def test_ambiguous_adjacent_bracket_forms_are_not_assumed_to_be_independent_markers() -> (
    None
):
    statement = "The setting is optional."
    raw = grounded_response(
        statement + " [[5.1.1]][1](https://outside.example.org/guide)", [statement]
    )
    assert render(raw).issues == ("unresolved_citation_claim",)


@pytest.mark.parametrize("reference_label", [None, "ref", "a" * 201])
def test_nested_active_label_is_rejected_even_with_identical_ordered_destinations(
    reference_label: str | None,
) -> None:
    inner = (
        f"[actual]({SOURCE})"
        if reference_label is None
        else f"[actual][{reference_label}]"
    )
    statement = f"The [outer {inner}]({SOURCE}) option is supported."
    text = (
        statement
        if reference_label is None
        else statement + f"\n\n[{reference_label}]: {SOURCE}"
    )
    raw = grounded_response(text, [statement])
    assert prose_link_destinations(text) == (SOURCE,)
    result = render(raw)
    assert result.issues == ("unresolved_citation_claim",)
    assert result.markdown == text


def test_real_code_inside_a_descriptive_label_remains_literal() -> None:
    label = "`[example](https://outside.example.org/guide)`"
    statement = f"The [{label}]({SOURCE}) option is supported."
    raw = grounded_response(statement, [statement])
    result = render(raw)
    assert result.issues == ()
    assert result.markdown == f"The [{label}](<{SOURCE}>) option is supported."


def test_image_alt_link_text_is_not_an_active_destination() -> None:
    label = "diagram [literal](https://outside.example.org/guide)"
    statement = f"This image ![{label}]({SOURCE}) illustrates the option."
    raw = grounded_response(statement, [statement])
    assert prose_link_destinations(statement) == (SOURCE,)
    result = render(raw)
    assert result.issues == ()
    assert (
        result.markdown == f"This image ![{label}](<{SOURCE}>) illustrates the option."
    )


def test_reference_environment_checker_failure_is_a_typed_rejection(
    monkeypatch,
) -> None:
    statement = "The setting is optional."
    raw = grounded_response(statement + f" [Docs]({SOURCE})", [statement])

    def fail(_text: str):
        raise ValueError("bounded reference environment failed")

    monkeypatch.setattr(citations_module, "reader_inline_link_checker", fail)
    assert render(raw).issues == ("invalid_citation_response",)
