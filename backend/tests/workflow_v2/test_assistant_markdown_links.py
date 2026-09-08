"""Reader-semantic URL admission cannot depend on handcrafted citation syntax."""

from __future__ import annotations

import pytest

from backend.services.workflow_v2.assistant import markdown_links
from backend.services.workflow_v2.assistant.markdown_links import (
    MAX_READER_MARKDOWN_CHARACTERS,
    normalize_reader_link_destination,
    reader_inline_link_checker,
    reader_inline_link_destinations,
    reader_link_destinations,
)


pytestmark = pytest.mark.contract
GOOD = "https://docs.example.org/reference"
OUTSIDE = "https://outside.example.org/article"
IMAGE = "https://images.example.org/diagram.png"


@pytest.mark.parametrize(
    "markdown, expected",
    [
        (f"[first]({GOOD}) [second]({OUTSIDE}) [again]({GOOD})", (GOOD, OUTSIDE, GOOD)),
        (f"<{GOOD}> followed by {OUTSIDE}", (GOOD,)),
        (f"A **[bold source]({GOOD})**.", (GOOD,)),
        (f"[outer [inner]({OUTSIDE})]({GOOD})", (OUTSIDE,)),
        (f"[label [plain brackets]]({GOOD})", (GOOD,)),
        (f"[outer <{OUTSIDE}>]({GOOD})", (GOOD, OUTSIDE)),
        (f"[outer ![diagram]({IMAGE})]({GOOD})", (GOOD, IMAGE)),
        (f"![plain alt [not an active link]({OUTSIDE})]({IMAGE})", (IMAGE,)),
        (f'<a href="{OUTSIDE}">raw anchor</a>', ()),
        (f"<code>[source]({OUTSIDE})</code>", (OUTSIDE,)),
        (f"<div>\n[source]({OUTSIDE})\n</div>", ()),
        (f"<pre>\n[source]({OUTSIDE})\n</pre>", ()),
        (f"{{{{[source]({OUTSIDE})}}}}", (OUTSIDE,)),
        (f"`unclosed [source]({OUTSIDE})", (OUTSIDE,)),
        (f"`[source]({OUTSIDE})`", ()),
        (f"``[source]({OUTSIDE})``", ()),
        (f"``a `[source]({OUTSIDE})` z``", ()),
        (f"```text\n[source]({OUTSIDE})\n```", ()),
        (f"~~~text\n[source]({OUTSIDE})\n~~~", ()),
        (f"```unclosed\n[source]({OUTSIDE})", ()),
        (f"    [source]({OUTSIDE})", ()),
        (f"Paragraph\n    [source]({OUTSIDE})", (OUTSIDE,)),
        (f"\\[source]({OUTSIDE})", ()),
        (f"[a]({GOOD})\n\n[unknown][missing]", (GOOD,)),
        (f"[outside][REF]\n\n> [ref]: {OUTSIDE}", (OUTSIDE,)),
        (f"[outside][ref]\n\n- [ref]: {OUTSIDE}", (OUTSIDE,)),
        (f"[r][] [r]\n\n[r]: {GOOD}", (GOOD, GOOD)),
        (f"[r]\n\n[r]: {GOOD}\n[r]: {OUTSIDE}", (GOOD,)),
        (f"![r]\n\n[r]: {IMAGE}", (IMAGE,)),
        (f"| Source |\n| --- |\n| [source]({GOOD}) |", (GOOD,)),
        (f"- [ ] [source]({GOOD})", (GOOD,)),
    ],
)
def test_reader_semantic_destinations(markdown: str, expected: tuple[str, ...]) -> None:
    assert reader_link_destinations(markdown) == expected


@pytest.mark.parametrize("length", [201, 500, 999])
def test_long_reference_labels_use_commonmark_semantics(length: int) -> None:
    label = "r" * length
    assert reader_link_destinations(f"[source][{label}]\n\n[{label}]: {OUTSIDE}") == (
        OUTSIDE,
    )


@pytest.mark.parametrize(
    "markdown, semantic, normalized",
    [
        (
            "[source](https://docs.example.org/a?x=1&amp;y=2)",
            "https://docs.example.org/a?x=1&y=2",
            "https://docs.example.org/a?x=1&y=2",
        ),
        (
            r"[source](https://docs.example.org/a\(b\))",
            "https://docs.example.org/a(b)",
            "https://docs.example.org/a(b)",
        ),
        (
            "[source](<https://docs.example.org/a b>)",
            "https://docs.example.org/a b",
            "https://docs.example.org/a%20b",
        ),
        (
            "[source](https://münich.example.org/café)",
            "https://münich.example.org/café",
            "https://xn--mnich-kva.example.org/caf%C3%A9",
        ),
        (
            "[source](https://docs.example.org/a%2Fb_*)",
            "https://docs.example.org/a%2Fb_*",
            "https://docs.example.org/a%2Fb_*",
        ),
    ],
)
def test_destination_normalizer_matches_parser_attributes(
    markdown: str,
    semantic: str,
    normalized: str,
) -> None:
    assert reader_link_destinations(markdown) == (normalized,)
    assert normalize_reader_link_destination(semantic) == normalized
    assert normalize_reader_link_destination(normalized) == normalized


def test_destination_normalizer_does_not_decode_entities_twice() -> None:
    source = "[source](https://docs.example.org/a?x=&amp;amp;)"
    semantic = "https://docs.example.org/a?x=&amp;"
    assert reader_link_destinations(source) == (semantic,)
    assert normalize_reader_link_destination(semantic) == semantic


@pytest.mark.parametrize("depth", [21, 64, 128])
def test_deep_link_labels_are_not_silently_lost_to_default_nesting(depth: int) -> None:
    source = "[" * depth + "label" + "]" * depth + f"({OUTSIDE})"
    assert reader_link_destinations(source) == (OUTSIDE,)


def test_extreme_nesting_either_reads_destination_or_rejects_never_silently_drops() -> (
    None
):
    source = "> " * 2_000 + f"[source]({OUTSIDE})"
    try:
        result = reader_link_destinations(source)
    except ValueError as error:
        assert str(error) == "Reader Markdown parsing failed"
    else:
        assert result == (OUTSIDE,)


def test_maximum_sized_ordinary_markdown_retains_final_link() -> None:
    suffix = f"\n\n[source]({GOOD})"
    source = "ordinary text " * ((MAX_READER_MARKDOWN_CHARACTERS - len(suffix)) // 14)
    source += (
        "x" * (MAX_READER_MARKDOWN_CHARACTERS - len(suffix) - len(source)) + suffix
    )
    assert len(source) == MAX_READER_MARKDOWN_CHARACTERS
    assert reader_link_destinations(source) == (GOOD,)


@pytest.mark.parametrize(
    "value", [None, 1, [], "x" * (MAX_READER_MARKDOWN_CHARACTERS + 1)]
)
def test_invalid_or_oversized_input_fails_closed(value) -> None:
    with pytest.raises(ValueError):
        reader_link_destinations(value)
    with pytest.raises(ValueError):
        normalize_reader_link_destination(value)


def test_empty_markdown_has_no_active_destinations() -> None:
    assert reader_link_destinations("") == ()


@pytest.mark.parametrize(
    "fragment, expected",
    [
        (f"[outer [inner]({OUTSIDE})]({GOOD})", (OUTSIDE,)),
        (f"[outer <{OUTSIDE}>]({GOOD})", (GOOD, OUTSIDE)),
        (f"[outer ![image]({IMAGE})]({GOOD})", (GOOD, IMAGE)),
        (f"`[literal]({OUTSIDE})`", ()),
        (f"`unclosed [active]({OUTSIDE})", (OUTSIDE,)),
        (f"<code>[active]({OUTSIDE})</code>", (OUTSIDE,)),
        (f"<{OUTSIDE}>", (OUTSIDE,)),
    ],
)
def test_inline_fragment_uses_semantic_active_destinations(fragment, expected) -> None:
    assert reader_inline_link_destinations(fragment) == expected


@pytest.mark.parametrize("nested_prefix", ["> ", "- ", ""])
def test_inline_fragments_resolve_full_document_long_nested_references(
    nested_prefix,
) -> None:
    label = "r" * 500
    context = f"{nested_prefix}[{label}]: {OUTSIDE}\n\n[source][{label}]"
    fragment = f"[outer [inner][{label}]]({GOOD})"
    assert reader_inline_link_destinations(fragment, reference_markdown=context) == (
        OUTSIDE,
    )
    checker = reader_inline_link_checker(context)
    assert checker(fragment) == (OUTSIDE,)
    assert checker(f"[label][{label}]") == (OUTSIDE,)


def test_request_scoped_reference_environments_do_not_leak_between_checkers() -> None:
    first = reader_inline_link_checker(f"[source]: {GOOD}")
    second = reader_inline_link_checker(f"[source]: {OUTSIDE}")
    assert first("[source]") == (GOOD,)
    assert second("[source]") == (OUTSIDE,)
    assert first("[source]") == (GOOD,)
    assert reader_inline_link_destinations("[source]") == ()


def test_repeated_fragment_checks_parse_full_context_once(monkeypatch) -> None:
    original = markdown_links.MarkdownIt
    full_parses = []

    class CountingParser(original):
        def parse(self, source, env=None):
            full_parses.append(source)
            return super().parse(source, env)

    monkeypatch.setattr(markdown_links, "MarkdownIt", CountingParser)
    context = f"[source]: {GOOD}"
    checker = reader_inline_link_checker(context)
    for _ in range(20):
        assert checker("[source]") == (GOOD,)
    assert full_parses == [context]


def test_inline_fragment_and_reference_context_limits_fail_closed() -> None:
    overflow = "x" * (MAX_READER_MARKDOWN_CHARACTERS + 1)
    with pytest.raises(ValueError):
        reader_inline_link_destinations(overflow)
    with pytest.raises(ValueError):
        reader_inline_link_destinations("[source]", reference_markdown=overflow)
    checker = reader_inline_link_checker("")
    with pytest.raises(ValueError):
        checker(overflow)


@pytest.mark.parametrize("failure", [RecursionError, RuntimeError])
def test_parser_failures_become_safe_explicit_rejection(monkeypatch, failure) -> None:
    class FailingParser:
        def __init__(self, *args, **kwargs):
            pass

        def enable(self, _rule):
            return self

        def parse(self, _markdown):
            raise failure("PRIVATE response and destination")

    monkeypatch.setattr(markdown_links, "MarkdownIt", FailingParser)
    with pytest.raises(ValueError, match="^Reader Markdown parsing failed$") as error:
        reader_link_destinations(f"[private]({OUTSIDE})")
    assert "PRIVATE" not in str(error.value)
    assert error.value.__suppress_context__ is True
