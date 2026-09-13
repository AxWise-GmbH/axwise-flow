"""Pure, request-scoped publisher/documentation admission.

Names extracted from a user instruction are lookup keys, never ownership proof.
Roots come only from explicit user references or injected reviewed bindings. A
restriction that cannot be resolved permits no sources; it never becomes the
unrestricted default. This module performs no discovery, I/O, or model calls.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import quote, unquote, urlsplit

from backend.domain.workflow_v2.contracts import (
    AssistantTurnInputV1,
    canonical_json,
    is_canonical_public_https_url,
)


MAX_POLICY_ROOTS = 20
MAX_REVIEWED_BINDINGS = 128
MAX_RESTRICTION_CHARACTERS = 1_000
_SOURCE_KINDS = {"any", "documentation", "official_documentation", "specified_sources"}
_BASES = {"none", "user_references", "reviewed_bindings", "unresolved"}
_PAYLOAD_KEYS = {
    "version",
    "mode",
    "sourceKind",
    "restriction",
    "resolved",
    "roots",
    "basis",
}
_URL = re.compile(r"https?://[^\s<>{}\[\]\"`]+", re.IGNORECASE)
_DOCS = re.compile(r"\b(?:documentation|docs?)\b", re.IGNORECASE)
_SOURCE_WORD = re.compile(r"\b(?:sources?|publishers?|websites?)\b", re.IGNORECASE)
_ONLY = re.compile(
    r"\b(?:only|exclusively|solely|restrict(?:ed)?|limit(?:ed)?)\b", re.IGNORECASE
)
_OFFICIAL = re.compile(r"\bofficial\b", re.IGNORECASE)
_POSITIVE_REFERENCE = re.compile(
    r"\b(?:use|using|consult|read|research|refer\s+to|based\s+on|"
    r"sources?\s*(?:are|:)|(?:documentation|docs?)\s*(?:at|:))\b",
    re.IGNORECASE,
)
_NEGATIVE_REFERENCE = re.compile(
    r"\b(?:do\s+not|don't|never|avoid|exclude|excluding|not|negative\s+example|"
    r"bad\s+example|untrusted\s+example)\b",
    re.IGNORECASE,
)
_PREFERENCE = re.compile(
    r"\b(?:prefer|preferably|ideally|where\s+possible)\b", re.IGNORECASE
)
_RELAX = re.compile(
    r"\b(?:remove|drop|lift)\s+(?:the\s+)?(?:source|publisher|documentation|docs?)\s+restriction\b|"
    r"\b(?:any|all)\s+(?:public\s+)?(?:web\s+)?sources?\s+(?:are\s+)?(?:allowed|acceptable)\b|"
    r"\b(?:you\s+)?(?:can|may)\s+(?:now\s+)?use\s+(?:other|any|all)\s+(?:public\s+)?sources?\b|"
    r"\b(?:do\s+not|don't|no\s+longer)\s+(?:restrict|limit)\s+"
    r"(?:the\s+)?(?:research|sources?|answer)\s+to\b",
    re.IGNORECASE,
)
_CORRECTION = re.compile(
    r"\b(?:actually|instead|change|switch|replace|now)\b", re.IGNORECASE
)
_FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})(.*)$")
_PUBLISHER_NOISE = re.compile(
    r"\b(?:official|documentation|docs?|the|current|latest|and|or|from|by|for|"
    r"only|exclusively)\b|(?:['’]s)\b",
    re.IGNORECASE,
)


def _url_parts(value: str, *, root: bool) -> tuple[str, str]:
    if not isinstance(value, str) or len(value) > 2_048:
        raise ValueError("Source URL exceeds its bound")
    if not is_canonical_public_https_url(value):
        raise ValueError("Source URL must be canonical public HTTPS")
    if root and ("?" in value or "#" in value):
        raise ValueError("Source roots cannot contain a query or fragment")
    parsed = urlsplit(value)
    path = parsed.path or "/"
    if re.search(r"%(?:2f|5c|00|0[ad])", path, re.IGNORECASE):
        raise ValueError("Source paths cannot encode separators or controls")
    if re.search(r"%(?![0-9A-Fa-f]{2})", path):
        raise ValueError("Source path contains an invalid escape")
    try:
        decoded = unquote(path, errors="strict")
    except UnicodeError as error:
        raise ValueError("Source path contains invalid UTF-8") from error
    if (
        "%" in decoded
        or "\\" in decoded
        or "//" in decoded
        or any(ord(character) < 32 or ord(character) == 127 for character in decoded)
        or any(segment in {".", ".."} for segment in decoded.split("/"))
    ):
        raise ValueError("Source path is not canonical")
    canonical_path = quote(decoded, safe="/-._~!$&'()*+,;=:@")
    return f"https://{parsed.netloc}", canonical_path.rstrip("/")


def _canonical_root(value: str) -> str:
    origin, path = _url_parts(value, root=True)
    return origin + path


@dataclass(frozen=True)
class ReviewedPublisherBinding:
    publisher: str
    aliases: tuple[str, ...]
    documentation_roots: tuple[str, ...]

    def __post_init__(self) -> None:
        if (
            not isinstance(self.publisher, str)
            or not 1 <= len(self.publisher.strip()) <= 120
        ):
            raise ValueError("Reviewed publisher name is invalid")
        if not isinstance(self.aliases, tuple) or len(self.aliases) > 16:
            raise ValueError("Reviewed publisher aliases exceed their bound")
        if any(
            not isinstance(alias, str) or not 1 <= len(alias.strip()) <= 120
            for alias in self.aliases
        ):
            raise ValueError("Reviewed publisher alias is invalid")
        if (
            not isinstance(self.documentation_roots, tuple)
            or not 1 <= len(self.documentation_roots) <= MAX_POLICY_ROOTS
        ):
            raise ValueError("Reviewed documentation roots exceed their bound")
        object.__setattr__(self, "publisher", self.publisher.strip())
        object.__setattr__(
            self,
            "aliases",
            tuple(
                sorted(
                    {
                        re.sub(r"\s+", " ", alias.strip()).casefold()
                        for alias in (self.publisher, *self.aliases)
                    }
                )
            ),
        )
        object.__setattr__(
            self,
            "documentation_roots",
            tuple(sorted({_canonical_root(root) for root in self.documentation_roots})),
        )


@dataclass(frozen=True)
class AssistantSourcePolicy:
    mode: str = "unrestricted"
    source_kind: str = "any"
    restriction: str = ""
    resolved: bool = True
    roots: tuple[str, ...] = ()
    basis: str = "none"

    def __post_init__(self) -> None:
        if (
            self.mode not in {"unrestricted", "restricted"}
            or self.source_kind not in _SOURCE_KINDS
        ):
            raise ValueError("Source policy mode or kind is invalid")
        if self.basis not in _BASES or type(self.resolved) is not bool:
            raise ValueError("Source policy resolution is invalid")
        if (
            not isinstance(self.restriction, str)
            or len(self.restriction) > MAX_RESTRICTION_CHARACTERS
        ):
            raise ValueError("Source restriction exceeds its bound")
        if not isinstance(self.roots, tuple) or len(self.roots) > MAX_POLICY_ROOTS:
            raise ValueError("Source policy roots exceed their bound")
        canonical = tuple(sorted({_canonical_root(root) for root in self.roots}))
        if self.roots != canonical:
            raise ValueError("Source policy roots must be sorted unique canonical URLs")
        if self.mode == "unrestricted":
            if (
                not self.resolved
                or self.roots
                or self.basis != "none"
                or self.restriction
                or self.source_kind != "any"
            ):
                raise ValueError("Unrestricted policy has inconsistent restrictions")
        elif not self.restriction or self.source_kind == "any":
            raise ValueError("Restricted policy must state its source restriction")
        elif self.resolved:
            if not self.roots or self.basis not in {
                "user_references",
                "reviewed_bindings",
            }:
                raise ValueError("Resolved policy requires established roots")
        elif self.roots or self.basis != "unresolved":
            raise ValueError("Unresolved restriction cannot admit sources")

    @property
    def allowed_hosts(self) -> tuple[str, ...]:
        """Coarse discovery filter only; callers must still enforce allows_url."""
        return tuple(sorted({urlsplit(root).hostname for root in self.roots}))

    def allows_url(self, url: str) -> bool:
        if self.mode == "unrestricted":
            # Preserve the existing Assistant URL contract when no source
            # restriction was requested. Strict document-path boundaries are
            # necessary only when an allow-root policy must be enforced.
            return isinstance(url, str) and is_canonical_public_https_url(url)
        try:
            origin, path = _url_parts(url, root=False)
        except (TypeError, ValueError):
            return False
        if not self.resolved:
            return False
        for root in self.roots:
            root_origin, root_path = _url_parts(root, root=True)
            if origin == root_origin and (
                path == root_path or path.startswith(root_path + "/")
            ):
                return True
        return False

    def to_payload(self) -> dict:
        return {
            "version": 1,
            "mode": self.mode,
            "sourceKind": self.source_kind,
            "restriction": self.restriction,
            "resolved": self.resolved,
            "roots": list(self.roots),
            "basis": self.basis,
        }

    def instruction(self) -> str:
        if self.mode == "unrestricted":
            return "No additional publisher or documentation-root restriction was requested."
        if not self.resolved:
            return (
                "The user's source restriction has no established permitted root. "
                "Do not broaden it or present outside sources as satisfying it. "
                "Report the unresolved source requirement instead of a researched conclusion."
            )
        kind = (
            "documentation"
            if self.source_kind in {"documentation", "official_documentation"}
            else "sources"
        )
        basis = (
            "These roots are user-selected references, not independently verified publisher ownership."
            if self.basis == "user_references"
            else "These documentation roots come from reviewed publisher bindings."
        )
        return (
            f"Use only {kind} within these exact HTTPS origins and path prefixes: "
            f"{canonical_json(list(self.roots))}. Subdomains and sibling paths are not admitted. "
            "Discovery results outside these roots cannot support the published answer. "
            + basis
        )


def assistant_source_policy_from_payload(payload: object) -> AssistantSourcePolicy:
    if not isinstance(payload, dict) or set(payload) != _PAYLOAD_KEYS:
        raise ValueError("Source policy payload has invalid fields")
    if type(payload["version"]) is not int or payload["version"] != 1:
        raise ValueError("Source policy version is unsupported")
    for field in ("mode", "sourceKind", "restriction", "basis"):
        if not isinstance(payload[field], str):
            raise ValueError("Source policy text field is invalid")
    if not isinstance(payload["roots"], list):
        raise ValueError("Source policy roots must be a list")
    return AssistantSourcePolicy(
        mode=payload["mode"],
        source_kind=payload["sourceKind"],
        restriction=payload["restriction"],
        resolved=payload["resolved"],
        roots=tuple(payload["roots"]),
        basis=payload["basis"],
    )


def encode_assistant_source_policy(policy: AssistantSourcePolicy) -> str:
    return canonical_json(policy.to_payload())


def decode_assistant_source_policy(value: str) -> AssistantSourcePolicy:
    if not isinstance(value, str) or len(value) > 50_000:
        raise ValueError("Encoded source policy exceeds its bound")
    try:
        payload = json.loads(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Encoded source policy is invalid") from error
    policy = assistant_source_policy_from_payload(payload)
    if encode_assistant_source_policy(policy) != value:
        raise ValueError("Encoded source policy must be canonical")
    return policy


def _strip_prose_markdown(value: str) -> str:
    """Strip prose decoration without editing a selected URL's path or query."""
    # A wrapper around the whole instruction is prose, not part of its last URL.
    outer = re.fullmatch(r"(\*{1,3}|_{1,3})(\S[\s\S]*?)\1([.!?]*)", value.strip())
    if outer:
        value = outer[2] + outer[3]
    pieces: list[str] = []
    cursor = 0
    for match in _URL.finditer(value):
        pieces.append(re.sub(r"[`*_]", "", value[cursor : match.start()]))
        url = match[0]
        opener = re.search(r"(?<![\w\\])(\*{1,3}|_{1,3})$", value[: match.start()])
        closer = (
            re.search(re.escape(opener[1]) + r"([).,;!?]*)$", url) if opener else None
        )
        if closer:
            # Matching emphasis supplies an explicit boundary, including when
            # the actual URL ends in legal punctuation before that boundary.
            pieces.append("<" + url[: closer.start()] + ">" + closer[1])
        else:
            pieces.append(url)
        cursor = match.end()
    pieces.append(re.sub(r"[`*_]", "", value[cursor:]))
    return "".join(pieces).strip()


def _source_reference_url(clause: str, match: re.Match[str]) -> str:
    candidate = match[0]
    if match.start() and clause[match.start() - 1] == "<":
        if clause[match.end() : match.end() + 1] != ">":
            raise ValueError("Source URL literal has an incomplete boundary")
        return candidate
    candidate = candidate.rstrip(".,;!")
    # Markdown destinations and parenthesized prose may add an unmatched ')';
    # balanced parentheses are legal URL bytes and must remain in the root.
    while candidate.endswith(")") and candidate.count(")") > candidate.count("("):
        candidate = candidate[:-1]
    return candidate


def _owner_clauses(text: str):
    fence: str | None = None
    for line in text.splitlines():
        marker = _FENCE.match(line)
        if fence:
            if (
                marker
                and marker[1][0] == fence[0]
                and len(marker[1]) >= len(fence)
                and not marker[2].strip()
            ):
                fence = None
            continue
        if marker:
            fence = marker[1]
            continue
        if line.lstrip().startswith(">") or line.startswith(("    ", "\t")):
            continue

        # Quoted instructions/examples are not new owner source directives.
        url_spans = [match.span() for match in _URL.finditer(line)]

        def quoted_reference(match: re.Match[str]) -> str:
            if any(start <= match.start() < end for start, end in url_spans):
                return match[0]  # A legal apostrophe inside a URL is not prose.
            content = match.group(0)[1:-1].strip()
            return "<" + content + ">" if _URL.fullmatch(content) else " "

        line = re.sub(r'["“][^"”\n]*["”]|(?<!\w)\'[^\'\n]+\'', quoted_reference, line)
        line = re.sub(
            r"`([^`\n]+)`",
            lambda match: (
                "<" + match[1] + ">"
                if _URL.fullmatch(match[1])
                else (
                    " "
                    if _ONLY.search(match[1])
                    and (_DOCS.search(match[1]) or _SOURCE_WORD.search(match[1]))
                    else match[1]
                )
            ),
            line,
        )
        for clause in re.split(r"(?<=[.!?;])\s+", line):
            clause = _strip_prose_markdown(clause)
            clause = re.sub(r"^(?:#{1,6}\s+|[-+]\s+|\d+[.)]\s+)", "", clause)
            if clause and not clause.endswith("?"):
                yield clause


def _relaxes_restriction(clause: str) -> bool:
    directive = re.sub(
        r"^(?:(?:actually|now|please|okay)[,:]?\s+)+", "", clause, flags=re.IGNORECASE
    )
    return bool(_RELAX.match(directive))


def _negative_root_overlaps(clause: str, policy: AssistantSourcePolicy) -> bool:
    if not _NEGATIVE_REFERENCE.match(clause) or policy.mode != "restricted":
        return False
    for match in _URL.finditer(clause):
        try:
            root = _canonical_root(_source_reference_url(clause, match))
        except ValueError:
            continue
        origin, path = _url_parts(root, root=True)
        for accepted in policy.roots:
            accepted_origin, accepted_path = _url_parts(accepted, root=True)
            if origin == accepted_origin and (
                path == accepted_path
                or path.startswith(accepted_path + "/")
                or accepted_path.startswith(path + "/")
            ):
                return True
    return False


def _positive_roots(clause: str) -> tuple[tuple[str, ...], bool]:
    roots: set[str] = set()
    malformed = False
    for match in _URL.finditer(clause):
        prefix = clause[: match.start()].rsplit(",", 1)[-1]
        suffix = clause[match.end() :]
        if _NEGATIVE_REFERENCE.search(prefix) or re.search(
            r"\b(?:negative|bad|untrusted)\s+example\b", suffix, re.IGNORECASE
        ):
            continue
        if not (
            _POSITIVE_REFERENCE.search(clause[: match.start()])
            or _ONLY.search(clause[: match.start()])
        ):
            continue
        try:
            candidate = _source_reference_url(clause, match)
            roots.add(_canonical_root(candidate))
        except ValueError:
            malformed = True
    return tuple(sorted(roots)), malformed


def _publisher_expression(clause: str) -> str | None:
    patterns = (
        r"\bofficial\s+(.{1,240})\s+(?:documentation|docs?)\b",
        r"\b(?:documentation|docs?)\s+(?:only\s+)?(?:for|from|by|of)\s+(.{1,240}?)(?:\s+(?:only|exclusively))?[.!;]?$",
        r"\b(?:only|exclusively|solely)\s+(.{1,240})\s+(?:documentation|docs?)\b",
        r"\b(?:use|consult|research|read)\s+(.{1,240})\s+(?:documentation|docs?)\s+(?:only|exclusively)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, clause, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def _reviewed_roots(
    expression: str | None, bindings: tuple[ReviewedPublisherBinding, ...]
) -> tuple[str, ...]:
    if not expression:
        return ()
    remaining = expression.casefold()
    roots: set[str] = set()
    aliases: dict[str, set[tuple[str, ...]]] = {}
    for binding in bindings:
        for alias in binding.aliases:
            aliases.setdefault(alias, set()).add(binding.documentation_roots)
    for alias in sorted(aliases, key=lambda item: (-len(item), item)):
        pattern = re.compile(r"(?<![\w.-])" + re.escape(alias) + r"(?![\w.-])")
        if not pattern.search(remaining):
            continue
        if len(aliases[alias]) != 1:
            return ()
        roots.update(next(iter(aliases[alias])))
        remaining = pattern.sub(" ", remaining)
    remaining = _PUBLISHER_NOISE.sub(" ", remaining)
    remaining = re.sub(r"\b(?:version\s+|v)?\d+(?:\.\d+){1,3}\b", " ", remaining)
    if re.sub(r"[\s,;&/+'’\"():-]", "", remaining) or len(roots) > MAX_POLICY_ROOTS:
        return ()
    return tuple(sorted(roots))


def _unresolved(kind: str, clause: str) -> AssistantSourcePolicy:
    restriction = (
        clause
        if len(clause) <= MAX_RESTRICTION_CHARACTERS
        else (
            "The user's explicit source restriction exceeds the bounded policy representation."
        )
    )
    return AssistantSourcePolicy(
        mode="restricted",
        source_kind=kind,
        restriction=restriction,
        resolved=False,
        basis="unresolved",
    )


def _generic_documentation_reinforcement(clause: str) -> bool:
    """Recognize a narrow restatement that supplies no new publisher identity.

    Unknown words deliberately prevent preservation. A publisher expression or
    correction must not be mistaken for a generic docs-only reminder merely
    because the bounded publisher grammar could not parse it.
    """
    words = set(re.findall(r"[\w'-]+", clause.casefold()))
    return bool(words) and words.issubset(
        {
            "use",
            "using",
            "restrict",
            "limit",
            "sources",
            "to",
            "only",
            "public",
            "official",
            "documentation",
            "docs",
            "doc",
            "and",
            "synthetic",
            "examples",
            "example",
            "the",
            "relevant",
            "current",
            "latest",
        }
    )


def resolve_assistant_source_policy(
    input_value: AssistantTurnInputV1,
    reviewed_bindings: tuple[ReviewedPublisherBinding, ...] = (),
) -> AssistantSourcePolicy:
    if (
        not isinstance(reviewed_bindings, tuple)
        or len(reviewed_bindings) > MAX_REVIEWED_BINDINGS
    ):
        raise ValueError("Reviewed source bindings exceed their bound")
    if any(
        not isinstance(binding, ReviewedPublisherBinding)
        for binding in reviewed_bindings
    ):
        raise ValueError("Reviewed source binding is invalid")
    policy = AssistantSourcePolicy()
    owner_texts = [
        turn.content for turn in input_value.conversation if turn.role == "user"
    ]
    owner_texts.append(input_value.message)
    for text in owner_texts:
        pending_label = ""
        for clause in _owner_clauses(text):
            if _relaxes_restriction(clause) and not _PREFERENCE.search(clause):
                policy = AssistantSourcePolicy()
                pending_label = ""
                continue
            if (
                policy.mode == "restricted"
                and not policy.resolved
                and not pending_label
                and _URL.search(clause)
                and (
                    _URL.fullmatch(clause.rstrip("."))
                    or _POSITIVE_REFERENCE.search(clause)
                    or _DOCS.search(clause)
                )
                and not _NEGATIVE_REFERENCE.search(clause)
            ):
                # A direct owner reply can supply the missing reference for an
                # existing restriction without repeating the entire instruction.
                clause = policy.restriction + " Use this reference: " + clause
            if pending_label and _URL.search(clause):
                clause = pending_label + " " + clause
            pending_label = ""
            if _negative_root_overlaps(clause, policy):
                # The allow-root representation cannot express a newly excluded
                # child subtree. Preserve an unresolved restriction instead of
                # silently continuing to allow the excluded reference.
                policy = _unresolved(policy.source_kind, clause)
                continue
            if _NEGATIVE_REFERENCE.match(clause) or _PREFERENCE.search(clause):
                continue
            is_docs = bool(_DOCS.search(clause))
            official_sources = bool(
                _OFFICIAL.search(clause) and _SOURCE_WORD.search(clause)
            )
            restricted = bool(_ONLY.search(clause)) or bool(
                (is_docs or official_sources)
                and _OFFICIAL.search(clause)
                and _POSITIVE_REFERENCE.search(clause)
            )
            correction = policy.mode == "restricted" and bool(
                _CORRECTION.search(clause)
            )
            if not (restricted or correction) or not (
                is_docs or official_sources or _URL.search(clause)
            ):
                continue
            kind = (
                "official_documentation"
                if is_docs and _OFFICIAL.search(clause)
                else "documentation" if is_docs else "specified_sources"
            )
            if len(clause) > MAX_RESTRICTION_CHARACTERS:
                policy = _unresolved(kind, clause)
                continue
            if (
                policy.mode == "restricted"
                and policy.resolved
                and policy.source_kind in {"documentation", "official_documentation"}
                and kind in {"documentation", "official_documentation"}
                and not correction
                and not _URL.search(clause)
                and _generic_documentation_reinforcement(clause)
            ):
                # Constraints compose: a generic reminder cannot erase an
                # already established publisher/root restriction or weaken its
                # official-documentation requirement.
                continue
            roots, malformed = _positive_roots(clause)
            basis = "user_references"
            if not roots and not malformed and is_docs:
                roots = _reviewed_roots(
                    _publisher_expression(clause), reviewed_bindings
                )
                basis = "reviewed_bindings"
            if malformed or not roots or len(roots) > MAX_POLICY_ROOTS:
                policy = _unresolved(kind, clause)
            else:
                policy = AssistantSourcePolicy(
                    mode="restricted",
                    source_kind=kind,
                    restriction=clause,
                    resolved=True,
                    roots=roots,
                    basis=basis,
                )
            if clause.endswith(":"):
                pending_label = clause
    return policy


__all__ = [
    "AssistantSourcePolicy",
    "ReviewedPublisherBinding",
    "resolve_assistant_source_policy",
    "assistant_source_policy_from_payload",
    "encode_assistant_source_policy",
    "decode_assistant_source_policy",
]
