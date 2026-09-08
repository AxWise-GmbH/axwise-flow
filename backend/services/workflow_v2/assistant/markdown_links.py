"""Read semantic Markdown destinations before evidence-policy publication.

Use the maintained CommonMark parser, not citation syntax or a second URL regex.
The Assistant reader enables tables, does not linkify plain URLs, and never mounts
raw HTML nodes. Image destinations are checked too; image-alt Markdown is plain
text in the reader, so its parsed children cannot supply active destinations.

This is a conservative publication boundary, not the reader's final allowlist:
semantic destinations that its scheme filter or raw-content wrappers suppress
may still be returned. Such differences may reject an answer but cannot admit an
unchecked active link. No destination is evidence merely because it is returned.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

from markdown_it import MarkdownIt
from markdown_it.token import Token


# AssistantTurnV1.markdown's existing maximum; do not reduce accepted responses
# merely to avoid the parser's default (silently truncating) nesting threshold.
MAX_READER_MARKDOWN_CHARACTERS = 120_000


def _validate_markdown(markdown: str) -> None:
    if not isinstance(markdown, str) or len(markdown) > MAX_READER_MARKDOWN_CHARACTERS:
        raise ValueError("Reader Markdown exceeds its input bound")


def _reader_parser() -> MarkdownIt:
    return MarkdownIt(
        "commonmark",
        {
            "html": True,
            "linkify": False,
            "maxNesting": MAX_READER_MARKDOWN_CHARACTERS + 1,
        },
    ).enable("table")


def _token_destinations(tokens: Sequence[Token]) -> tuple[str, ...]:
    pending = list(reversed(tokens))
    destinations: list[str] = []
    while pending:
        token = pending.pop()
        if token.type in {"link_open", "image"}:
            destination = token.attrGet("src" if token.type == "image" else "href")
            if not isinstance(destination, str):
                raise ValueError("Reader Markdown link has no destination")
            destinations.append(destination)
        if token.type not in {"image", "html_inline", "html_block"} and token.children:
            pending.extend(reversed(token.children))
    return tuple(destinations)


def normalize_reader_link_destination(destination: str) -> str:
    """Apply the same normalization as semantic link/image token destinations.

    ``destination`` must already be Markdown-unescaped, as a token attribute or
    the citation renderer's parsed destination is. This function deliberately
    does not unescape a second time or infer a source's authority.
    """
    if (
        not isinstance(destination, str)
        or len(destination) > MAX_READER_MARKDOWN_CHARACTERS
    ):
        raise ValueError("Reader Markdown destination exceeds its input bound")
    try:
        return MarkdownIt("commonmark").normalizeLink(destination)
    except Exception:
        raise ValueError("Reader Markdown destination normalization failed") from None


def reader_link_destinations(markdown: str) -> tuple[str, ...]:
    """Return semantic href/src destinations in document order, with duplicates.

    Input overflow, parser failure, or interpreter recursion exhaustion raises
    ``ValueError``. Callers must reject publication on that error, never replace
    it with an empty destination list. The parser's nesting limit is greater than
    the entire input length, so its internal limit cannot silently hide links.
    """
    _validate_markdown(markdown)
    try:
        return _token_destinations(_reader_parser().parse(markdown))
    except Exception:
        # Includes RecursionError from deeply nested valid/adversarial Markdown.
        # Avoid including the source, a URL, or third-party exception text.
        raise ValueError("Reader Markdown parsing failed") from None


def reader_inline_link_checker(
    reference_markdown: str,
) -> Callable[[str], tuple[str, ...]]:
    """Parse global references once and return a request-scoped fragment checker.

    This closure has no shared/global cache. Each inline parse receives a fresh
    environment dictionary containing the same parser-established definitions;
    nested/long reference definitions never need a second handcrafted grammar.
    """
    _validate_markdown(reference_markdown)
    try:
        parser = _reader_parser()
        environment: dict = {}
        parser.parse(reference_markdown, environment)
    except Exception:
        raise ValueError("Reader Markdown parsing failed") from None

    def destinations(fragment: str) -> tuple[str, ...]:
        _validate_markdown(fragment)
        try:
            return _token_destinations(parser.parseInline(fragment, dict(environment)))
        except Exception:
            raise ValueError("Reader Markdown parsing failed") from None

    return destinations


def reader_inline_link_destinations(
    fragment: str,
    *,
    reference_markdown: str | None = None,
) -> tuple[str, ...]:
    """Read an inline fragment, optionally using a full document's references.

    For multiple fragments of one response, create ``reader_inline_link_checker``
    once instead, so the full response is parsed only once for reference context.
    """
    _validate_markdown(fragment)
    return reader_inline_link_checker(
        "" if reference_markdown is None else reference_markdown,
    )(fragment)


__all__ = [
    "MAX_READER_MARKDOWN_CHARACTERS",
    "normalize_reader_link_destination",
    "reader_inline_link_checker",
    "reader_inline_link_destinations",
    "reader_link_destinations",
]
