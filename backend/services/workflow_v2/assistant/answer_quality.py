"""Small, deterministic publication checks for one-shot Assistant answers.

These checks identify explicit contradictions, not general factual correctness.
They operate on local Markdown examples and canonical user context. Defect codes
and repair instructions contain no generated answer text or workspace information.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from urllib.parse import unquote, urlsplit

from backend.domain.workflow_v2.contracts import canonical_json


_REPAIRS = {
    "n8n_code_mode_mismatch": (
        "Give each n8n Code example one compatible execution mode and return shape. "
        "Do not recommend $input.first(), last(), all(), or itemMatching() in Run "
        "Once for Each Item mode. Use the current item for that mode, or explicitly "
        "select Run Once for All Items for an example using collection methods."
    ),
    "authentication_provider_conflation": (
        "Separate inbound authentication from downstream provider dependencies. "
        "Authentication=None means no authentication at that node; it does not "
        "establish that the workflow is provider-free or needs no external credentials. "
        "State any synthetic-demo assumption and provider requirements separately."
    ),
    "unsupported_workspace_inventory": (
        "Do not infer missing credentials or execution history from a research-only "
        "request. Unless the user explicitly supplied an inventory fact, say the "
        "workspace inventory was not inspected or remains unknown. Separate proposed "
        "configuration and actions not performed from claims about existing state."
    ),
    "source_component_mismatch": (
        "Ground component-specific configuration claims in documentation for that "
        "component. Do not transfer a different node's authentication or execution "
        "semantics. If matching evidence is unavailable, state the uncertainty."
    ),
    "source_policy_violation": (
        "Use only evidence and citation links inside the sourcePolicy's permitted "
        "documentation roots. Do not use a forum, issue, skills directory, blog or "
        "other discovered page outside those roots to support this answer. Preserve "
        "the user's restriction; do not broaden it to obtain a result."
    ),
    "source_policy_unresolved": (
        "The required publisher authority has not been established. Do not invent "
        "an official origin or substitute unrestricted web sources."
    ),
    "unresolved_citation_claim": (
        "Write a complete source-supported answer using ordinary Markdown links "
        "to supporting source URLs. Do not output invented bracket-number IDs or "
        "unresolved footnotes. Removing markers alone does not establish support: "
        "each factual assertion still needs relevant grounded evidence."
    ),
    "invalid_citation_response": (
        "Return a complete Markdown answer with resolvable source links and "
        "grounded evidence for the same request."
    ),
    "assistant_evidence_missing": (
        "The response has no complete source-backed assertion. Obtain relevant "
        "grounded support and write complete factual statements, not isolated "
        "code fragments or citation tokens. If evidence is unavailable, state "
        "that limitation instead of inventing support."
    ),
}
_EACH_ITEM = re.compile(
    r"\brun\s+once\s+for\s+each\s+item\b|\brunOnceForEachItem\b|"
    r"\b(?:per|each)[ -]item\s+mode\b",
    re.IGNORECASE,
)
_ALL_ITEMS = re.compile(
    r"\brun\s+once\s+for\s+all\s+items\b|\brunOnceForAllItems\b",
    re.IGNORECASE,
)
_COLLECTION_INPUT = re.compile(r"\$input\s*\.\s*(?:first|last|all|itemMatching)\s*\(")
_CODE_COMMENT_OR_LITERAL = re.compile(
    r"//[^\n]*|/\*[\s\S]*?\*/|'(?:\\.|[^'\\])*'|" r'"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`'
)
_INVALID_EXAMPLE = re.compile(
    r"\b(?:invalid|incorrect|disallowed|unsupported)\s+(?:example|code|snippet|usage)\b|"
    r"\b(?:do\s+not|don't|never)\s+use\b|\b(?:cannot|can't)\s+(?:use|run|work)\b|"
    r"\b(?:is|are)\s+(?:invalid|disallowed|unsupported|not\s+compatible)\b|"
    r"\b(?:rejects?|throws?\s+an?\s+error)\b",
    re.IGNORECASE,
)
_AUTH_NONE = re.compile(
    r"\bauthentication\s*(?:[:=|]\s*)?(?:(?:is\s+)?set\s+to\s+|is\s+)?none\b",
    re.IGNORECASE,
)
_PROVIDER_FREE = re.compile(r"\bprovider[ -]free\b", re.IGNORECASE)
_AUTH_DISTINCTION = re.compile(
    r"\b(?:does\s+not|doesn't|cannot|can't)\s+(?:make|mean|imply|establish|ensure)\b|"
    r"\bnot\s+(?:provider[ -]free|equivalent|the\s+same)\b|"
    r"\b(?:independent(?:ly)?|separately|unrelated)\b",
    re.IGNORECASE,
)
_RESOURCE = re.compile(
    r"\b(credentials?|executions?|execution\s+history)\b", re.IGNORECASE
)
_INVENTORY_SCOPE = re.compile(
    r"\b(?:workspace|tenant|instance|orqaly|n8n|existing|saved|stored|configured|"
    r"prior|previous)\b",
    re.IGNORECASE,
)
_ABSENCE = re.compile(
    r"\b(?:no|zero)\s+(?:(?:existing|workspace|tenant|configured|saved|stored|"
    r"prior|previous|production|workflow|live|active|real|n8n|orqaly)\s+){0,4}"
    r"(?:credentials?|executions?|execution\s+history)\b|"
    r"\b(?:credentials?|executions?|execution\s+history)\s+"
    r"(?:do\s+not|don't)\s+exist\b",
    re.IGNORECASE,
)
_UNOBSERVED_OR_UNUSED = re.compile(
    r"\b(?:inspected|checked|verified|used|accessed|requested|supplied|provided|"
    r"shared|created|modified|started|executed|run|required|needed)\b",
    re.IGNORECASE,
)
_PROVISIONAL = re.compile(
    r"\b(?:if|assuming|assume|suppose|hypothetical|proposed|would|will|should|could)\b",
    re.IGNORECASE,
)
_HEADING_COMPONENT = re.compile(
    r"\b(?:Respond\s+to\s+Webhook|Chat\s+Trigger|HTTP\s+Request|Webhook|Code)\b",
    re.IGNORECASE,
)
# These component display names have the same normalized identifier as their
# documentation slugs. Other nodes can have different display names/slugs, so
# a title may establish an alias only outside a known component contradiction.
_UNAMBIGUOUS_COMPONENT_IDS = frozenset(
    {"webhook", "chattrigger", "code", "httprequest", "respondtowebhook"}
)


def _request(query: str) -> dict | None:
    try:
        value = json.loads(query.partition("\n")[0])
    except (ValueError, TypeError):
        return None
    if not isinstance(value, dict) or not isinstance(value.get("message"), str):
        return None
    return value if isinstance(value.get("instruction"), str) else None


def _plain(text: str) -> str:
    # Inline formatting should not alter the meaning of a configuration label.
    return re.sub(r"[`*_]", "", text)


def _blocks(markdown: str) -> Iterator[tuple[str, str, bool]]:
    """Yield paragraphs/fences with heading and immediately preceding context."""
    headings: list[tuple[int, str]] = []
    paragraph: list[str] = []
    previous = ""
    fence: str | None = None
    code: list[str] = []
    for line in markdown.splitlines():
        fence_match = re.match(r"^\s{0,3}(`{3,}|~{3,})(.*)$", line)
        if fence is not None:
            if (
                fence_match
                and fence_match.group(1)[0] == fence[0]
                and len(fence_match.group(1)) >= len(fence)
                and not fence_match.group(2).strip()
            ):
                yield (
                    "\n".join([*(text for _, text in headings), previous]),
                    "\n".join(code),
                    True,
                )
                fence, code, previous = None, [], ""
            else:
                code.append(line)
            continue
        heading = re.match(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if not line.strip() or fence_match or heading:
            if paragraph:
                previous = "\n".join(paragraph)
                yield "\n".join(text for _, text in headings), previous, False
                paragraph = []
            if heading:
                level = len(heading.group(1))
                headings = [(depth, text) for depth, text in headings if depth < level]
                headings.append((level, heading.group(2)))
                previous = ""
            elif fence_match:
                fence = fence_match.group(1)
            continue
        paragraph.append(line)
    if paragraph:
        yield "\n".join(text for _, text in headings), "\n".join(paragraph), False
    if fence is not None:
        yield "\n".join([*(text for _, text in headings), previous]), "\n".join(
            code
        ), True


def _inventory_absences(text: str, context: str = "") -> set[str]:
    resources: set[str] = set()
    for clause in re.split(r"[.!;,\n]+", _plain(text)):
        absence = _ABSENCE.search(clause)
        if clause.lstrip().startswith(">") or "?" in clause or absence is None:
            continue
        if not _INVENTORY_SCOPE.search(f"{context} {clause}"):
            continue
        if _PROVISIONAL.search(clause) or _UNOBSERVED_OR_UNUSED.search(
            clause[absence.end() :]
        ):
            continue
        resources.update(
            (
                "credentials"
                if match.group(0).lower().startswith("credential")
                else "executions"
            )
            for match in _RESOURCE.finditer(clause)
        )
    return resources


def _user_inventory_basis(request: dict) -> set[str]:
    turns = request.get("conversation")
    texts: list[str] = []
    if isinstance(turns, list):
        texts.extend(
            item["content"]
            for item in turns
            if isinstance(item, dict)
            and item.get("role") == "user"
            and isinstance(item.get("content"), str)
        )
    texts.append(request["message"])
    basis: set[str] = set()
    for text in texts:
        for context, body, is_code in _blocks(text):
            if is_code:
                continue
            absence = _inventory_absences(body, f"workspace {context}")
            # A later explicit positive statement supersedes an earlier absence.
            # User questions and conditional/proposed configurations are not facts.
            for clause in re.split(r"[.!;\n]+", _plain(body)):
                if "?" in clause or _PROVISIONAL.search(clause):
                    continue
                positive = re.search(
                    r"\b(?:we|I|workspace|tenant|instance|n8n|orqaly)\s+"
                    r"(?:now\s+)?(?:has|have|contains)\s+(?!no\b|zero\b)"
                    r"(?:\w+\s+){0,3}(credentials?|executions?|execution\s+history)\b",
                    clause,
                    re.IGNORECASE,
                )
                if positive:
                    basis.discard(
                        "credentials"
                        if positive.group(1).casefold().startswith("credential")
                        else "executions"
                    )
            basis.update(absence)
    return basis


def _conflates_auth_and_provider(clause: str) -> bool:
    auth = _AUTH_NONE.search(clause)
    provider = _PROVIDER_FREE.search(clause)
    if not auth or not provider or _AUTH_DISTINCTION.search(clause):
        return False
    if auth.start() < provider.start():
        between = clause[auth.end() : provider.start()]
        return len(between) <= 100 and bool(
            re.fullmatch(r"\s*\(\s*", between)
            or re.search(
                r"\b(?:means?|makes?|ensures?|therefore|thus|so|keeps?|is)\b",
                between,
                re.IGNORECASE,
            )
        )
    between = clause[provider.end() : auth.start()]
    return len(between) <= 100 and bool(
        re.search(
            r"\b(?:because|since|thanks\s+to|requires?|by\s+setting)\b",
            between,
            re.IGNORECASE,
        )
    )


def assistant_answer_defects(query: str, markdown: str) -> tuple[str, ...]:
    """Return stable symptom codes for a canonical Assistant request and answer."""
    request = _request(query)
    if request is None:
        return ()
    defects: set[str] = set()
    basis = _user_inventory_basis(request)
    n8n_context = bool(re.search(r"\bn8n\b", f"{query} {markdown}", re.IGNORECASE))
    for context, body, is_code in _blocks(markdown):
        local = _plain(f"{context}\n{body}" if not is_code else context)
        active_body = _CODE_COMMENT_OR_LITERAL.sub(" ", body) if is_code else body
        if (
            n8n_context
            and _COLLECTION_INPUT.search(active_body)
            and _EACH_ITEM.search(local)
        ):
            # A paragraph/table may explain both modes with separate examples.
            # Check their sentences/rows independently instead of transferring a
            # per-item label onto an all-items example elsewhere in that block.
            candidates = (
                re.split(r"[\n]+|(?<=[.!?])\s+", body)
                if not is_code and _ALL_ITEMS.search(local)
                else [active_body]
            )
            for candidate in candidates:
                candidate_context = (
                    _plain(f"{context}\n{candidate}") if not is_code else local
                )
                if (
                    _COLLECTION_INPUT.search(candidate)
                    and _EACH_ITEM.search(candidate_context)
                    and not _INVALID_EXAMPLE.search(candidate_context)
                ):
                    defects.add("n8n_code_mode_mismatch")
        if is_code:
            continue
        for clause in re.split(r"[\n]+|(?<=[.!?])\s+", _plain(body)):
            if _conflates_auth_and_provider(clause):
                defects.add("authentication_provider_conflation")
        if _inventory_absences(body, context) - basis:
            defects.add("unsupported_workspace_inventory")
    return tuple(code for code in _REPAIRS if code in defects)


def assistant_repair_query(query: str, codes: tuple[str, ...]) -> str:
    """Add static corrections without replaying a rejected answer or changing scope."""
    request = _request(query)
    repairs = [_REPAIRS[code] for code in _REPAIRS if code in codes]
    if request is None or not repairs:
        return query
    request["instruction"] += (
        "\nBefore publishing this response, resolve these specific consistency issues: "
        + " ".join(repairs)
        + " Return a complete corrected answer to the same request with relevant sources."
    )
    _, separator, remainder = query.partition("\n")
    return canonical_json(request) + separator + remainder


def _component_id(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def _named_nodes(text: str) -> set[str]:
    names: set[str] = set()
    leading_words = {
        "a",
        "an",
        "the",
        "this",
        "that",
        "your",
        "n8n",
        "use",
        "using",
        "configure",
        "configured",
        "with",
        "in",
        "on",
        "for",
        "and",
        "or",
        "of",
        "from",
        "to",
        "generic",
        "each",
        "every",
        "any",
        "current",
        "next",
        "previous",
        "first",
        "last",
        "following",
        "preceding",
    }
    for match in re.finditer(
        r"\b((?:[\w-]+\s+){0,3}[\w-]+)\s+node\b", _plain(text), re.IGNORECASE
    ):
        words = match.group(1).split()
        while words and words[0].casefold() in leading_words:
            words.pop(0)
        # Properly named components can follow ordinary prose ("requests reach
        # the Webhook node"). Do not mistake that prose for a component name.
        proper_tail = re.search(
            r"([A-Z][A-Za-z0-9-]*(?:\s+(?:(?:to|of|and)\s+)?[A-Z][A-Za-z0-9-]*)*)$",
            " ".join(words),
        )
        if proper_tail is not None:
            words = proper_tail.group(1).split()
        elif len(words) > 2:
            continue
        if words:
            names.add(_component_id(" ".join(words)))
    return names


def assistant_claim_statement_context(statement: str, raw_claim: dict) -> str:
    """Identify a component from the exact claim's active Markdown headings.

    The result is only for source correspondence checks, never a replacement for
    the attributed fact. Unknown or ambiguous headings and unbound spans do not
    supply a component. No string search can attach a repeated claim to the wrong
    section: the claim's UTF-8 offsets must identify the exact provider part.
    """
    if _named_nodes(statement):
        return statement
    provenance = raw_claim.get("provenance_artifact")
    part = provenance.get("text") if isinstance(provenance, dict) else None
    start, end = raw_claim.get("segment_start"), raw_claim.get("segment_end")
    if (
        not isinstance(part, str)
        or type(start) is not int
        or type(end) is not int
        or raw_claim.get("offset_unit") != "utf8_bytes"
        or raw_claim.get("span_target") != "provider_response_part"
    ):
        return statement
    data = part.encode("utf-8")
    if not 0 <= start < end <= len(data):
        return statement
    try:
        if data[start:end].decode("utf-8") != statement:
            return statement
        prefix = data[:start].decode("utf-8")
    except UnicodeDecodeError:
        return statement
    active_context = ""
    for context, _body, is_code in _blocks(prefix + "\n\n__claim_position__"):
        active_context = "" if is_code else context
    for heading in reversed(active_context.splitlines()):
        components = {
            re.sub(r"\s+", " ", match.group(0)).casefold()
            for match in _HEADING_COMPONENT.finditer(_plain(heading))
        }
        if len(components) > 1:
            return statement
        if components:
            return f"{next(iter(components))} node: {statement}"
    return statement


def assistant_claim_source_matches(statement: str, url: str, context: str = "") -> bool:
    """Reject an explicitly different node; unknown/general docs remain inconclusive.

    ``context`` is the source title, never surrounding answer prose. No publisher
    allowlist is used: the recognizable documentation component path supplies the
    identity, and ambiguous source titles do not establish a mismatch.
    """
    try:
        path = unquote(urlsplit(url).path)
    except ValueError:
        return True
    slug = re.search(r"(?:^|/)n8n-nodes-[a-z0-9_-]+\.([a-zA-Z0-9_-]+)(?:[/.]|$)", path)
    source_nodes = {_component_id(slug.group(1))} if slug else _named_nodes(context)
    claim_nodes = _named_nodes(statement)
    known_source = source_nodes & _UNAMBIGUOUS_COMPONENT_IDS
    known_claim = claim_nodes & _UNAMBIGUOUS_COMPONENT_IDS
    if slug and known_source and known_claim and not known_source & known_claim:
        # Provider-supplied display metadata must not relabel an explicitly
        # different known component in the source URL.
        return False
    # Display names need not equal internal slugs (for example a provider's
    # model node). A matching source title can establish correspondence, but an
    # arbitrary non-matching title cannot by itself establish a mismatch.
    title = re.split(r"\s+[|–—]\s+", context, maxsplit=1)[0]
    title = re.sub(
        r"\s+(?:node\s+)?(?:documentation|docs)$", "", title, flags=re.IGNORECASE
    )
    if _component_id(title) in claim_nodes:
        return True
    return not source_nodes or not claim_nodes or bool(source_nodes & claim_nodes)


__all__ = [
    "assistant_answer_defects",
    "assistant_claim_source_matches",
    "assistant_claim_statement_context",
    "assistant_repair_query",
]
