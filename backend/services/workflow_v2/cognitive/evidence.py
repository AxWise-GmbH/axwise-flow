"""Deterministic claim, precision, unresolved-evidence and authority-language checks."""

from __future__ import annotations
import re
import unicodedata
from backend.domain.workflow_v2.contracts import utf16_ordinal_sorted
from typing import Any, Sequence
from backend.services.workflow_v2.cognitive.markdown import (
    _immutable_gap_bullet,
    _task_fragment_parts,
)
from backend.services.workflow_v2.cognitive.policy import (
    _ACTION_ASSERTED_TAIL,
    _ASSERTIVE_HEADING_PREDICATE,
    _AUTHORITY_PROCESS_EXECUTION,
    _AUTHORITY_PROCESS_OBJECT,
    _BARE_NUMBER,
    _CLAUSE_BREAK,
    _COMPACT_NAMED_STATUTE_LOCATOR,
    _COMPACT_NUMBERED_INSTRUMENT_LOCATOR,
    _CONDITIONAL_AUTHORITY_ASSERTION,
    _CONDITIONAL_THEN_CANDIDATE,
    _CONDITIONAL_UI_BEHAVIOR,
    _COORDINATED_EXECUTION_CLAUSE,
    _COUNT_VALUE,
    _CURRENCY_VALUE,
    _DEFINITE_NEGATED_LEGAL_ASSERTION,
    _EVIDENCE_SENSITIVE_ASSERTION,
    _EXPLICIT_AUTHORITY_NEGATION,
    _EXPLICIT_CLAIM_NEGATION,
    _EXPLICIT_NONFACTUAL_QUALIFIER,
    _EXPLICIT_PLANNING_TABLE_COLUMN,
    _EXPLICIT_PLANNING_TARGET_PREFIX,
    _EXPLICIT_UNRESOLVED_LABEL,
    _EXPLICIT_VALIDATION_ACTION_PREFIX,
    _FORMULA_MARKER,
    _GIVEN_WHEN_THEN_INLINE_ROLE,
    _IMMUTABLE_GAP_SECTION_HEADINGS,
    _INDEPENDENT_SENSITIVE_FACT,
    _INLINE_GWT_ROLE_BREAK,
    _INTERNAL_PLANNING_TARGET,
    _ISO_DATE_VALUE,
    _LAUNCH_CLAUSE_BREAK,
    _NONPROVISIONAL_AUTHORITY_ASSERTION,
    _NON_DISTINCTIVE_REQUIREMENT_ACRONYMS,
    _PLANNING_ARTIFACT_TYPES,
    _PLANNING_TARGET_EXTERNAL_STATUS_ASSERTION,
    _PLANNING_TARGET_EXTERNAL_SUBJECT,
    _PLANNING_TARGET_OBLIGATION_ASSERTION,
    _PLANNING_TARGET_PRODUCT_STATUS_ASSERTION,
    _POSITIVE_AUTHORITY_PREDICATE,
    _POSITIVE_LAUNCH_CLAIM_PATTERNS,
    _PRECISE_VALUE,
    _PROJECTED_STATUTORY_LOCATOR_HEADER,
    _PUBLICATION_UNKNOWN_PENDING_ITEM,
    _PUBLICATION_UNKNOWN_PENDING_PREFIX,
    _PUBLICATION_VERIFICATION_ACTION,
    _PURE_ARTIFACT_NONAUTHORIZATION,
    _PURE_NEGATED_ARTIFACT_ACTION,
    _PURE_NOT_LAUNCH_READY_STATUS,
    _PURE_REMEDIATION_CONTROL_BOUNDARY,
    _PURE_TRAILING_EVIDENCE_STATUS,
    _PURE_VERIFICATION_DIRECTIVE,
    _PURE_WITHHOLDING_DIRECTIVE,
    _PURE_WITHHOLDING_REQUIREMENT,
    _RAW_EVIDENCE_MARKER,
    _SAFE_BOUNDED_PLANNING_SAMPLE_TAIL,
    _SAFE_NONAUTHORITY_PLANNING_DIRECTIVE,
    _SAFE_VERIFICATION_QUESTION_END,
    _SERVER_SPECIFIC_VERIFICATION_ACTION,
    _SERVER_UNVERIFIED_VALIDATION_TARGET,
    _SERVER_VALIDATION_ACTION,
    _SUPPORT_STOPWORDS,
    _SUPPORT_TOKEN,
    _TASK_GWT_ROLE_START,
    _UNICODE_DASHES,
    _UNRESOLVED_AUTHORITY_MATCH_TOKENS,
    _UNRESOLVED_AUTHORITY_QUALIFIER,
    _UNRESOLVED_AUTHORITY_SIGNAL,
    _UNRESOLVED_BOUNDARY,
    _UNRESOLVED_CONDITIONAL_RECORDED_OUTCOME,
    _UNRESOLVED_CONDITIONAL_UNRESOLVED_OUTCOME,
    _UNRESOLVED_CONDITIONAL_WITHHOLDING_OUTCOME,
    _UNRESOLVED_LABELED_ACTION,
    _UNRESOLVED_POSITIVE_AUTHORITY_ASSERTION,
    _UNRESOLVED_REQUIREMENT_ACTION,
    _UNRESOLVED_REQUIREMENT_CONTEXT,
    _UNRESOLVED_UNSUPPORTED_FACT_PREFIX,
    _VALIDATION_INFORMATION_ACTION,
    _VERIFICATION_QUESTION_PREDICATE,
)
from backend.services.workflow_v2.cognitive.scope import (
    _normalized_semantic_text,
)


def _normalized_launch_claim_text(markdown: str) -> str:
    value = unicodedata.normalize("NFKC", str(markdown or ""))
    value = (
        _UNICODE_DASHES.sub("-", value).replace("\u2018", "'").replace("\u2019", "'")
    )
    value = re.sub(r"[*_~`]+", " ", value)
    return re.sub(r"[\t\r ]+", " ", value)


def _local_prefix_for_negation(prefix: str) -> str:
    local = prefix[max(prefix.rfind(","), prefix.rfind(":")) + 1 :]
    coordinator = re.search(
        r"\b(?:and|or)\s+(?:(?:this|that|it|we)\s+|the\s+\S+\s+)?(?:is|are|was|were|can|may|has|have)\b[\s\S]*$",
        local,
        re.IGNORECASE,
    )
    return coordinator.group(0) if coordinator else local


def _launch_claim_is_negated_or_conditional(clause: str, match: re.Match[str]) -> bool:
    prefix = clause[: match.start()]
    suffix = clause[match.end() :]
    local_prefix = _local_prefix_for_negation(prefix)
    directly_negated = any(
        re.search(pattern, local_prefix, re.IGNORECASE)
        for pattern in (
            r"\bno\s*$",
            r"\b(?:not|never|cannot|can't|isn't|aren't|wasn't|weren't|doesn't|don't|didn't|shouldn't|mustn't|won't|hasn't|haven't)\b(?:[\s\"'()[\]-]+\w+){0,6}[\s\"'()[\]-]*$",
            r"\bwithout\s+(?:claiming|asserting|establishing|demonstrating|confirming|being|having)(?:[\s\"'()[\]-]+\w+){0,5}[\s\"'()[\]-]*$",
            r"\bno\s+(?:basis|evidence|finding|determination|claim|conclusion|approval|clearance|authorization|authorisation|green\s+light)(?:[\s\"'()[\]-]+\w+){0,6}[\s\"'()[\]-]*$",
        )
    )
    if directly_negated:
        return True

    if re.search(r"\bnon[- ]*$", local_prefix, re.IGNORECASE):
        return True

    # Compact planning artifacts often render a readiness field before its value,
    # for example ``Launch-ready: No`` or ``Market ready - blocked``. The matched
    # label is not a positive claim when the immediately following status is
    # unambiguously negative. Keep ``launch-ready: no blockers remain`` positive:
    # bare ``no`` is accepted only when it terminates the value or introduces a
    # parenthetical/slash/dash-separated negative status.
    negative_status_after = bool(
        re.search(
            r"^\s*(?:(?::|=|-)\s*)?(?:"
            r"no(?=\s*(?:$|[-/(]|[.,;!?)]))|"
            r"false\b|blocked\b|prohibited\b|"
            r"not\s+(?:ready|approved|authorized|authorised|cleared|verified|"
            r"established|allowed|permitted)\b|"
            r"unapproved\b|unauthorized\b|unauthorised\b|"
            r"unverified\b|pending\b"
            r")",
            suffix,
            re.IGNORECASE,
        )
    )
    if negative_status_after:
        return True

    meta_noun = (
        r"(?:status|claims?|assertions?|language|wording|statements?|"
        r"representations?|conclusions?|determinations?|descriptions?)"
    )
    negative_predicate = (
        r"(?:(?:is|are|was|were|remains?)\s+(?:unsupported|unverified|"
        r"unestablished|forbidden|prohibited|excluded|rejected|disallowed|denied)|"
        r"(?:is|are|was|were|remains?|has|have|had)\s+(?:not|never)"
        r"(?:\s+been)?\s+(?:asserted|established|supported|verified|validated|"
        r"approved|authorized|authorised|confirmed|made|granted|allowed|"
        r"permitted|used))"
    )
    closing_punctuation = r"[\s\"'“”‘’`)\]]*"
    suffix_meta_negative = re.search(
        rf"^{closing_punctuation}{meta_noun}\s+{negative_predicate}\b",
        suffix,
        re.IGNORECASE,
    )
    prefix_meta_subject = bool(
        re.search(
            rf"\b(?:phrase|term|label|{meta_noun})\s+[\"'“”‘’`]*$",
            local_prefix,
            re.IGNORECASE,
        )
        or re.search(
            rf"\b{meta_noun}\s+that\b[\s\S]*$",
            local_prefix,
            re.IGNORECASE,
        )
    )
    prefix_meta_negative = bool(
        prefix_meta_subject
        and re.search(
            rf"^{closing_punctuation}{negative_predicate}\b",
            suffix,
            re.IGNORECASE,
        )
    )
    rejection_before = re.search(
        r"\b(?:avoids?|excludes?|forbids?|prohibits?|rejects?|removes?|omits?|"
        r"disallows?)\s+(?:(?:any|all|the)\s+)?$",
        local_prefix,
        re.IGNORECASE,
    )
    meta_after_rejection = re.search(
        rf"^{closing_punctuation}{meta_noun}\b",
        suffix,
        re.IGNORECASE,
    )
    if (
        suffix_meta_negative
        or prefix_meta_negative
        or (rejection_before and meta_after_rejection)
    ):
        return True

    conditional_before = bool(
        re.search(
            r"\b(?:if|unless|until|once|when|whenever|provided(?:\s+that)?|assuming)\b",
            prefix,
            re.IGNORECASE,
        )
        or re.search(
            r"^\s*(?:pending|subject\s+to|contingent\s+on)\b",
            prefix,
            re.IGNORECASE,
        )
        or re.search(
            r"\b(?:pending|subject\s+to|contingent\s+on)\b",
            local_prefix,
            re.IGNORECASE,
        )
        or re.search(
            r"\b(?:could|might|would)\b(?:[\s\"'()[\]-]+\w+){0,8}[\s\"'()[\]-]*$",
            local_prefix,
            re.IGNORECASE,
        )
        or re.search(
            r"\b(?:whether|before|become|becoming|achieve|achieving|reach|reaching)\b(?:[\s\"'()[\]-]+\w+){0,5}[\s\"'()[\]-]*$",
            local_prefix,
            re.IGNORECASE,
        )
    )
    conditional_after = bool(
        re.search(
            r"^\s*(?:only\s+)?(?:if|unless|until|once|when|whenever|after|provided(?:\s+that)?|assuming|pending|subject\s+to|contingent\s+on)\b",
            suffix,
            re.IGNORECASE,
        )
        or re.search(
            r"\b(?:only\s+if|unless|until|once|when|after|provided(?:\s+that)?|subject\s+to|contingent\s+on)\b",
            suffix,
            re.IGNORECASE,
        )
    )
    return conditional_before or conditional_after


def has_positive_launch_readiness_claim(markdown: str) -> bool:
    normalized = _normalized_launch_claim_text(markdown)
    for clause in _LAUNCH_CLAUSE_BREAK.split(normalized):
        for pattern in _POSITIVE_LAUNCH_CLAIM_PATTERNS:
            for match in pattern.finditer(clause):
                if not _launch_claim_is_negated_or_conditional(clause, match):
                    return True
    return False


def _is_pure_evidence_status_or_withholding(value: str) -> bool:
    """Accept a bounded evidence status, never a status-prefixed factual tail."""

    cleaned = re.sub(r"[*_`]", "", value).strip()
    if not cleaned or len(cleaned) > 500:
        return False
    if _PURE_REMEDIATION_CONTROL_BOUNDARY.fullmatch(cleaned) is not None:
        return True
    for pattern in (
        _PURE_NEGATED_ARTIFACT_ACTION,
        _PURE_ARTIFACT_NONAUTHORIZATION,
        _PURE_WITHHOLDING_REQUIREMENT,
    ):
        if (match := pattern.fullmatch(cleaned)) is not None:
            return _INDEPENDENT_SENSITIVE_FACT.search(match.group("tail")) is None
    if (match := _PURE_NOT_LAUNCH_READY_STATUS.fullmatch(cleaned)) is not None:
        return _INDEPENDENT_SENSITIVE_FACT.search(match.group("reason")) is None
    if (match := _PURE_TRAILING_EVIDENCE_STATUS.fullmatch(cleaned)) is not None:
        return _INDEPENDENT_SENSITIVE_FACT.search(match.group("subject")) is None
    if _PURE_WITHHOLDING_DIRECTIVE.fullmatch(cleaned) is not None:
        return True
    if (match := _PURE_VERIFICATION_DIRECTIVE.fullmatch(cleaned)) is not None:
        return _INDEPENDENT_SENSITIVE_FACT.search(match.group("prefix")) is None
    return False


def _is_bounded_unresolved_requirement_action(fragment: str) -> bool:
    """Accept an imperative only when it has no independent factual tail."""

    cleaned = re.sub(r"[*_`]", "", fragment).strip()
    validation_prefix = _EXPLICIT_VALIDATION_ACTION_PREFIX.match(cleaned)
    if re.search(
        r"\bverify\s+this\s+item\s+before\s+relying\s+on\s+it\b",
        cleaned,
        re.IGNORECASE,
    ):
        return _SERVER_VALIDATION_ACTION.fullmatch(cleaned) is not None
    if (
        _SERVER_VALIDATION_ACTION.fullmatch(cleaned) is not None
        or _PUBLICATION_VERIFICATION_ACTION.fullmatch(cleaned) is not None
    ):
        # The exact form must contain one complete proposition ending in an
        # applicability/satisfaction predicate. An appended imperative therefore
        # fails by construction, regardless of which execution verb it uses.
        parts = re.split(
            r"\bbefore\s+treating\s+(?:it|them|[a-z][a-z -]{0,60})\s+"
            r"as\s+settled\b",
            cleaned,
            maxsplit=1,
            flags=re.IGNORECASE,
        )
        question = re.split(
            r"\bverify\s+whether\b", parts[0], maxsplit=1, flags=re.IGNORECASE
        )[-1].strip()
        return (
            len(parts) == 2
            and re.fullmatch(r"[.;]?\s*", parts[1]) is not None
            and bool(question)
            and ";" not in question
            and re.search(r"\bbecause\b", cleaned, re.IGNORECASE) is None
            and _SAFE_VERIFICATION_QUESTION_END.search(question) is not None
        )
    if validation_prefix is not None:
        action = cleaned[validation_prefix.end() :].strip()
        verify_whether = re.match(r"verify\s+whether\s+", action, re.IGNORECASE)
        if verify_whether is not None:
            proposition = action[verify_whether.end() :].strip()
            return (
                bool(proposition)
                and ";" not in proposition
                and re.search(r"\bbecause\b", proposition, re.IGNORECASE) is None
                and _SAFE_VERIFICATION_QUESTION_END.search(proposition) is not None
            )
        action_match = _VALIDATION_INFORMATION_ACTION.match(action)
        if action_match is None:
            return False
        # Non-question validation actions are limited to one information-gathering
        # action. Coordinated execution must be expressed separately and validated.
        action_tail = action[action_match.end() :]
        if ";" in action_tail or _COORDINATED_EXECUTION_CLAUSE.search(action_tail):
            return False
        return _ACTION_ASSERTED_TAIL.search(action_tail) is None
    match = _UNRESOLVED_REQUIREMENT_ACTION.match(fragment)
    if match is None:
        return False
    return _ACTION_ASSERTED_TAIL.search(fragment[match.end() :]) is None


def _is_bounded_specific_verification_action(fragment: str) -> bool:
    """Accept one scoped question and reject any coordinated execution tail."""

    cleaned = re.sub(r"[*_`]", "", fragment).strip()
    if _SERVER_SPECIFIC_VERIFICATION_ACTION.fullmatch(cleaned) is None:
        return False
    parts = re.split(
        r"\bbefore\s+relying\s+on\s+the\s+outcome\b",
        cleaned,
        maxsplit=1,
        flags=re.IGNORECASE,
    )
    if len(parts) != 2 or re.fullmatch(r"[.;]?\s*", parts[1]) is None:
        return False
    proposition = re.split(
        r"\bconfirm\s+whether\b", parts[0], maxsplit=1, flags=re.IGNORECASE
    )[-1].strip()
    return (
        bool(proposition)
        and _VERIFICATION_QUESTION_PREDICATE.search(proposition) is not None
        and _COORDINATED_EXECUTION_CLAUSE.search(proposition) is None
    )


def _evidence_clause_fragments(fragment: str) -> list[str]:
    """Split compact acceptance roles without treating subordinate prose as roles."""

    result: list[str] = []
    for clause in _CLAUSE_BREAK.split(fragment):
        if _TASK_GWT_ROLE_START.match(clause) is not None:
            result.extend(_INLINE_GWT_ROLE_BREAK.split(clause))
        else:
            result.append(clause)
    return result


def _precision_values(value: str) -> set[str]:
    """Return normalized decision-relevant numeric assertions, excluding IDs."""

    normalized = unicodedata.normalize("NFKC", value)
    normalized = re.sub(r"\\text\{([^}]*)\}", r"\1", normalized)
    normalized = re.sub(
        r"\b(?:at\s+least|no\s+less\s+than)\s+(?=\d)",
        ">=",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"\b(?:at\s+most|no\s+more\s+than)\s+(?=\d)",
        "<=",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"\b(?:above|exceeds?|greater\s+than|more\s+than|over)\s+(?=\d)",
        ">",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"\b(?:below|fewer\s+than|less\s+than|under)\s+(?=\d)",
        "<",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"(\d[\d.,]*)\s*%\s*(?:[-–—]|\bto\b)\s*(\d[\d.,]*)\s*%",
        r"\1-\2%",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"(\d[\d.,]*)\s+to\s+(\d[\d.,]*)\s*%",
        r"\1-\2%",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"\bdegrees?\s+(celsius|fahrenheit)\b",
        lambda match: "°C" if match.group(1).casefold() == "celsius" else "°F",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = (
        normalized.replace("−", "-")
        .replace("≥", ">=")
        .replace("≤", "<=")
        .replace(r"\ge", ">=")
        .replace(r"\le", "<=")
        .replace(r"\circ", "°")
        .replace(r"\%", "%")
        .replace(r"\,", "")
    )
    normalized = re.sub(r"°\s+([cf])\b", r"°\1", normalized, flags=re.IGNORECASE)
    matches = [
        *[match.group(0) for match in _PRECISE_VALUE.finditer(normalized)],
        *[match.group(0) for match in _CURRENCY_VALUE.finditer(normalized)],
        *[match.group(0) for match in _ISO_DATE_VALUE.finditer(normalized)],
        *[match.group(0) for match in _COUNT_VALUE.finditer(normalized)],
    ]
    if _FORMULA_MARKER.search(normalized):
        matches.extend(match.group(0) for match in _BARE_NUMBER.finditer(normalized))

    def canonical(value: str) -> str:
        compact = (
            re.sub(r"\s+", "", value)
            .casefold()
            .replace("–", "-")
            .replace("—", "-")
            .rstrip(".,")
        )

        def number(match: re.Match[str]) -> str:
            raw = match.group(0)
            if re.fullmatch(r"\d{1,3}(?:,\d{3})+", raw):
                return raw.replace(",", "")
            decimal = raw.replace(",", ".")
            if "." not in decimal:
                return decimal
            return decimal.rstrip("0").rstrip(".")

        return re.sub(r"\d[\d.,]*", number, compact)

    return {canonical(match) for match in matches}


def _support_tokens(value: str) -> set[str]:
    without_urls = re.sub(r"https?://\S+", " ", value)
    without_markers = _RAW_EVIDENCE_MARKER.sub(" ", without_urls)
    return {
        token
        for token in (
            match.group(0).casefold().strip("-")
            for match in _SUPPORT_TOKEN.finditer(without_markers)
        )
        if token not in _SUPPORT_STOPWORDS and not token.startswith(("req-", "gap-"))
    }


def _claims_align_with_assertion(
    assertion: str,
    claim_texts: list[str],
    *,
    minimum_matches: int = 1,
) -> bool:
    assertion_tokens = _support_tokens(assertion)
    claim_tokens = set().union(*(_support_tokens(text) for text in claim_texts))
    if not assertion_tokens or not claim_tokens:
        return False
    matched = {
        left
        for left in assertion_tokens
        if any(
            left == right
            or (len(left) >= 6 and len(right) >= 6 and left[:6] == right[:6])
            for right in claim_tokens
        )
    }
    return len(matched) >= minimum_matches


def _materially_matches_unresolved_requirement(
    assertion: str, unresolved_requirements: Sequence[str]
) -> bool:
    """Match a final assertion to an unresolved typed requirement conservatively."""

    assertion_tokens = _support_tokens(assertion)
    assertion_acronyms = {
        acronym
        for acronym in re.findall(r"\b[A-Z][A-Z0-9]{2,}\b", assertion)
        if acronym not in _NON_DISTINCTIVE_REQUIREMENT_ACRONYMS
    }

    def materially_same_token(left: str, right: str) -> bool:
        return left == right or (
            len(left) >= 6 and len(right) >= 6 and left[:6] == right[:6]
        )

    def authority_token(value: str) -> bool:
        return any(
            materially_same_token(value, authority)
            for authority in _UNRESOLVED_AUTHORITY_MATCH_TOKENS
        )

    if _UNRESOLVED_POSITIVE_AUTHORITY_ASSERTION.search(assertion) is None:
        return False

    for requirement in unresolved_requirements:
        requirement_tokens = _support_tokens(requirement)
        matched = {
            left
            for left in assertion_tokens
            if any(materially_same_token(left, right) for right in requirement_tokens)
        }
        requirement_acronyms = {
            acronym
            for acronym in re.findall(r"\b[A-Z][A-Z0-9]{2,}\b", requirement)
            if acronym not in _NON_DISTINCTIVE_REQUIREMENT_ACRONYMS
        }
        if assertion_acronyms.intersection(requirement_acronyms):
            return True
        # A generic overlap such as "Estonia packaging" is normal product-planning
        # language. It becomes an unresolved authority assertion only when the same
        # clause also claims a mandate, filing, approval, official rule, or equivalent.
        if (
            len(matched) >= 2
            and any(not authority_token(token) for token in matched)
            and _UNRESOLVED_AUTHORITY_SIGNAL.search(assertion) is not None
        ):
            return True
    return False


def _unresolved_evidence_requirement_descriptions(
    research_payload: dict[str, Any], scope_payload: dict[str, Any]
) -> list[str]:
    """Project missing/conflicting findings onto accepted requirement descriptions."""

    requirements = {
        item.get("id"): item.get("description")
        for item in scope_payload.get("evidenceRequirements", [])
        if isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and isinstance(item.get("description"), str)
    }
    unresolved_ids = {
        item.get("requirementId")
        for item in research_payload.get("findings", [])
        if isinstance(item, dict)
        and item.get("status") in {"missing", "conflicting"}
        and isinstance(item.get("requirementId"), str)
    }
    return utf16_ordinal_sorted(
        {
            description
            for requirement_id in unresolved_ids
            if (description := requirements.get(requirement_id))
        }
    )


def _split_unresolved_assertions(fragment: str) -> list[str]:
    """Separate an unresolved status clause from an unrelated positive assertion."""

    if (
        _PUBLICATION_UNKNOWN_PENDING_ITEM.fullmatch(
            re.sub(r"[`]", "", fragment).strip()
        )
        is not None
    ):
        return [fragment.strip()]
    controlled_prefix = _PUBLICATION_UNKNOWN_PENDING_PREFIX.search(fragment)
    if controlled_prefix is not None:
        controlled_suffix = fragment[controlled_prefix.start() :].strip()
        if _PUBLICATION_UNKNOWN_PENDING_ITEM.fullmatch(controlled_suffix) is not None:
            leading = fragment[: controlled_prefix.start()].strip()
            return [item for item in (leading, controlled_suffix) if item]

    queue = [fragment]
    if (
        re.match(
            r"^\s*(?:although|despite|pending|though|with)\b",
            fragment,
            re.IGNORECASE,
        )
        and "," in fragment
    ):
        left, right = fragment.split(",", 1)
        if bool(_UNRESOLVED_AUTHORITY_QUALIFIER.search(left)) != bool(
            _UNRESOLVED_AUTHORITY_QUALIFIER.search(right)
        ):
            queue = [left, right]

    result: list[str] = []
    while queue:
        candidate = queue.pop(0).strip()
        if not candidate:
            continue
        for boundary in _UNRESOLVED_BOUNDARY.finditer(candidate):
            if (
                boundary.group(0).lstrip().startswith(":")
                and _EXPLICIT_UNRESOLVED_LABEL.search(candidate) is not None
            ):
                continue
            left = candidate[: boundary.start()].strip()
            right = candidate[boundary.end() :].strip()
            left_unresolved = bool(_UNRESOLVED_AUTHORITY_QUALIFIER.search(left))
            right_unresolved = bool(_UNRESOLVED_AUTHORITY_QUALIFIER.search(right))
            if re.match(
                r"^(?:is|are|was|were|has|have|must|shall|will|can|could|may)\b",
                right,
                re.IGNORECASE,
            ):
                continue
            if left and right and left_unresolved != right_unresolved:
                queue = [left, right, *queue]
                break
        else:
            result.append(candidate)
    return result


def _is_safe_nonauthority_planning_directive(value: str) -> bool:
    """Accept a product/UX directive only when its complete tail stays non-authorizing."""

    cleaned = re.sub(r"[*_`]", "", value).strip()
    match = _SAFE_NONAUTHORITY_PLANNING_DIRECTIVE.match(cleaned)
    if match is None:
        return False
    tail = cleaned[match.end() :].strip()
    if not tail:
        return True
    precise_tail_is_bounded_sample = (
        _SAFE_BOUNDED_PLANNING_SAMPLE_TAIL.fullmatch(tail) is not None
    )
    return not (
        _EVIDENCE_SENSITIVE_ASSERTION.search(tail)
        or _NONPROVISIONAL_AUTHORITY_ASSERTION.search(tail)
        or _DEFINITE_NEGATED_LEGAL_ASSERTION.search(tail)
        or _INDEPENDENT_SENSITIVE_FACT.search(tail)
        or _AUTHORITY_PROCESS_EXECUTION.search(tail)
        or (_precision_values(tail) and not precise_tail_is_bounded_sample)
    )


def _planning_statement_body(value: str) -> tuple[str, str]:
    """Retain an explicit requirement/criterion label, not its heading's scope."""

    body = re.sub(r"[*_`]", "", value).strip()
    body = re.sub(r"^(?:[-+*]|\d+[.)])\s+", "", body)
    label, separator, remainder = body.partition(":")
    if separator and re.fullmatch(r"(?:req|acc)-[a-f0-9]{16}", label.strip()):
        return label[:3], remainder.strip()
    return "", body


def _internal_specification_language(value: str) -> bool:
    """Disambiguate overloaded planning verbs only inside structural plan units.

    ``prevent`` and ``treat`` may describe requested behavior. Other existing
    sensitive matches (disease, certification, legal mandates, approval, etc.)
    remain evidence claims, even inside a requirement or acceptance criterion.
    """

    return not (
        _RAW_EVIDENCE_MARKER.search(value)
        or _DEFINITE_NEGATED_LEGAL_ASSERTION.search(value)
        or _CONDITIONAL_AUTHORITY_ASSERTION.search(value)
        or _AUTHORITY_PROCESS_EXECUTION.search(value)
        or _UNRESOLVED_AUTHORITY_SIGNAL.search(value)
        or re.search(
            r"\b(?:always|unconditionally|guarantees?|guaranteed|measured|observed|"
            r"confirmed|verified|proven)\b",
            value,
            re.IGNORECASE,
        )
        or any(
            re.fullmatch(r"(?:prevent|treat)(?:ing)?", match.group(), re.IGNORECASE)
            is None
            for match in _EVIDENCE_SENSITIVE_ASSERTION.finditer(value)
        )
    )


def _complete_internal_acceptance_fixture(value: str) -> bool:
    """Recognize one complete G/W/T unit, never an arbitrary conditional section."""

    _label, body = _planning_statement_body(value)
    body = re.sub(
        r"\s*\(Supports:\s*req-[a-f0-9]{16}(?:,\s*req-[a-f0-9]{16})*\)\s*$",
        "",
        body,
    )
    boundaries = list(_GIVEN_WHEN_THEN_INLINE_ROLE.finditer(body))
    first = body[: boundaries[0].start()] if boundaries else body
    _list, _prefix, first_role, first_body = _task_fragment_parts(first)
    roles = [(first_role, first_body)]
    for index, boundary in enumerate(boundaries):
        end = (
            boundaries[index + 1].start() if index + 1 < len(boundaries) else len(body)
        )
        roles.append(
            (boundary.group("role").casefold(), body[boundary.end() : end].strip())
        )
    return (
        [role for role, _part in roles] == ["given", "when", "then"]
        and all(
            part.strip()
            and len([clause for clause in _CLAUSE_BREAK.split(part) if clause.strip()])
            == 1
            for _role, part in roles
        )
        and _internal_specification_language(body)
    )


def _normative_requirement_unit(value: str) -> bool:
    """Require normative syntax in an explicitly identified requirement unit."""

    _label, body = _planning_statement_body(value)
    return (
        bool(
            _INTERNAL_PLANNING_TARGET.match(body)
            or re.search(r"\b(?:must|shall)\b", body, re.I)
        )
        and len([part for part in _CLAUSE_BREAK.split(body) if part.strip()]) == 1
        and _ACTION_ASSERTED_TAIL.search(body) is None
        and re.search(r"\b(?:is|are|was|were|has|have|had|does|did)\b", body, re.I)
        is None
        and _internal_specification_language(body)
    )


def _permission_context_asserts_authority(value: str) -> bool:
    """Keep permission labels from laundering external approvals or results.

    Reuse the existing sensitive/authority classifiers and the same conservative
    token-stem comparison used for unresolved requirements (e.g. regulation /
    regulator). A role-matrix heading alone does not establish internal meaning.
    """

    return bool(
        _ASSERTIVE_HEADING_PREDICATE.search(value)
        or _EVIDENCE_SENSITIVE_ASSERTION.search(value)
        or _PLANNING_TARGET_EXTERNAL_SUBJECT.search(value)
        or any(
            token == authority
            or (len(token) >= 6 and len(authority) >= 6 and token[:6] == authority[:6])
            for token in _support_tokens(value)
            for authority in _UNRESOLVED_AUTHORITY_MATCH_TOKENS
        )
    )


def _deterministic_evidence_integrity_defects(
    markdown: str,
    allowed_claim_texts: dict[str, str],
    *,
    artifact_type: str | None = None,
    immutable_gap_labels: Sequence[str] = (),
    unresolved_evidence_requirements: Sequence[str] = (),
    defect_limit: int | None = 40,
    excerpt_limit: int | None = 180,
    preserve_duplicate_occurrences: bool = False,
) -> list[str]:
    """Reject only high-risk factual precision that lacks exact immutable support.

    Planning artifacts may and should contain concrete product, operational, budget, date and
    metric choices. Health/safety/legal/certification/authority assertions must cite an exact
    immutable claim in the same sentence or table cell. Any assertion carrying an evidence
    marker is checked for exact numeric and semantic support.
    """

    base = markdown.split("\n\n## Sources\n", 1)[0]
    defects: list[str] = []

    def add_defect(value: str) -> None:
        if preserve_duplicate_occurrences or value not in defects:
            defects.append(value)

    current_heading = ""
    immutable_gap_bullets = {
        _immutable_gap_bullet(label) for label in immutable_gap_labels
    }
    normalized_exact_gap_labels = {
        _normalized_semantic_text(label)
        for label in [*immutable_gap_labels, *unresolved_evidence_requirements]
    }
    pending_table_headers: list[str] | None = None
    active_table_headers: list[str] | None = None

    def server_scoped_unverified_target(value: str) -> bool:
        return (
            _RAW_EVIDENCE_MARKER.search(value) is None
            and _SERVER_UNVERIFIED_VALIDATION_TARGET.fullmatch(
                re.sub(r"[*_`]", "", value).strip()
            )
            is not None
        )

    def publication_scoped_unknown_item(value: str) -> bool:
        return (
            _RAW_EVIDENCE_MARKER.search(value) is None
            and _PUBLICATION_UNKNOWN_PENDING_ITEM.fullmatch(
                re.sub(r"[`]", "", value).strip()
            )
            is not None
        )

    def exact_explicit_gap_fragment(value: str) -> bool:
        cleaned = re.sub(r"^\s*(?:(?:[-+*]|\d+[.)])\s+|[•·]\s*)", "", value).strip()
        # Normalize emphasis only around the label; the immutable payload remains
        # byte-for-byte represented after semantic normalization below.
        cleaned = re.sub(
            r"^(\*\*?|__?)((?:evidence\s+)?(?:gap|assumption)):\1",
            r"\2:",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(
            r"^(\*\*?|__?)((?:evidence\s+)?(?:gap|assumption))\1\s*:",
            r"\2:",
            cleaned,
            flags=re.IGNORECASE,
        )
        match = _EXPLICIT_UNRESOLVED_LABEL.match(cleaned)
        return (
            match is not None
            and _normalized_semantic_text(cleaned[match.end() :])
            in normalized_exact_gap_labels
        )

    base_lines = base.splitlines()
    fixture_lines: set[int] = set()
    if artifact_type in _PLANNING_ARTIFACT_TYPES:
        for index in range(len(base_lines) - 2):
            parts = [
                _task_fragment_parts(line.strip())
                for line in base_lines[index : index + 3]
            ]
            if [part[2] for part in parts] == ["given", "when", "then"] and (
                _complete_internal_acceptance_fixture(
                    ", ".join(f"{part[2].title()} {part[3]}" for part in parts)
                )
            ):
                fixture_lines.update(range(index, index + 3))
    for line_index, line in enumerate(base_lines):
        stripped = line.strip()
        if stripped.startswith("```"):
            continue
        if not stripped:
            pending_table_headers = None
            active_table_headers = None
            continue
        if artifact_type in _PLANNING_ARTIFACT_TYPES and (
            line_index in fixture_lines
            or _complete_internal_acceptance_fixture(stripped)
            or (
                _planning_statement_body(stripped)[0] == "req"
                and _normative_requirement_unit(stripped)
            )
        ):
            # A complete internal test is a specified expected outcome, not proof
            # that it was executed. Semantic consistency still belongs to review.
            continue
        table_cells = (
            [
                cell.replace(r"\|", "|").strip()
                for cell in re.split(r"(?<!\\)\|", stripped.strip("|"))
            ]
            if "|" in stripped
            else None
        )
        if table_cells is not None and all(
            re.fullmatch(r":?-{3,}:?", cell) is not None for cell in table_cells
        ):
            active_table_headers = pending_table_headers
            continue
        if table_cells is None:
            pending_table_headers = None
            active_table_headers = None
        if re.fullmatch(r"[:|+\-=\s]+", stripped):
            continue
        heading = re.match(r"^#{1,6}\s+(.+?)\s*#*$", stripped)
        if heading:
            current_heading = heading.group(1).strip()
            stripped = current_heading
            if (
                _RAW_EVIDENCE_MARKER.search(stripped) is None
                and _ASSERTIVE_HEADING_PREDICATE.search(stripped) is None
            ):
                # A structural noun-phrase label is not itself a factual assertion.
                # Required sections can legitimately name a standard, authority, or
                # regulation. Headings that carry a citation or make an assertive
                # authority claim still pass through the exact same checks below.
                continue
        elif (
            current_heading in _IMMUTABLE_GAP_SECTION_HEADINGS
            and stripped in immutable_gap_bullets
        ):
            # This exact line is appended by AxWise to preserve an immutable unresolved
            # item. Skip only this occurrence: raw, modified, extended, or relocated
            # copies remain subject to the normal evidence-integrity checks below.
            continue
        if table_cells is not None:
            if active_table_headers is None:
                next_stripped = (
                    base_lines[line_index + 1].strip()
                    if line_index + 1 < len(base_lines)
                    else ""
                )
                next_cells = (
                    [
                        cell.strip()
                        for cell in re.split(r"(?<!\\)\|", next_stripped.strip("|"))
                    ]
                    if "|" in next_stripped
                    else []
                )
                if next_cells and all(
                    re.fullmatch(r":?-{3,}:?", cell) is not None for cell in next_cells
                ):
                    pending_table_headers = [
                        re.sub(r"[*_`]", "", cell).strip() for cell in table_cells
                    ]
                    # A Markdown header labels columns; it is not an evidence
                    # assertion. The following separator activates these labels.
                    continue
            fragments = []
            fragment_contexts = []
            table_contexts = active_table_headers or [""] * len(table_cells)
            for cell_index, cell in enumerate(table_cells):
                cell_context = (
                    table_contexts[cell_index]
                    if cell_index < len(table_contexts)
                    else ""
                )
                if artifact_type in _PLANNING_ARTIFACT_TYPES:
                    requirement_row = (
                        active_table_headers is not None
                        and re.fullmatch(
                            r"req-[a-f0-9]{16}",
                            re.sub(r"[*_`]", "", table_cells[0]),
                        )
                        is not None
                        and cell_context.casefold()
                        in {"requirement", "description", "statement"}
                    )
                    permission_cell = (
                        active_table_headers is not None
                        and len(active_table_headers) >= 3
                        and cell_index > 0
                        and table_contexts[0].casefold().endswith("action")
                        and any(
                            other_index != cell_index
                            and re.sub(r"[*_`]", "", other).casefold()
                            in {"denied", "read-only"}
                            for other_index, other in enumerate(table_cells[1:], 1)
                        )
                        and re.search(
                            r"\b(?:RBAC|role-based access control|permission matrix)\b",
                            current_heading,
                            re.I,
                        )
                        and re.fullmatch(
                            r"Approved(?:\s*\([A-Za-z][A-Za-z /-]{0,40}\))?",
                            re.sub(r"[*_`]", "", cell),
                            re.I,
                        )
                        is not None
                        and not _permission_context_asserts_authority(
                            " ".join(
                                [
                                    *table_contexts[1:],
                                    table_cells[0],
                                    cell.partition("(")[2],
                                ]
                            )
                        )
                    )
                    if permission_cell or (
                        requirement_row and _normative_requirement_unit(cell)
                    ):
                        continue
                for cell_item in re.split(r"<br\s*/?>", cell, flags=re.IGNORECASE):
                    fragments.append(re.sub(r"^\s*[•·]\s*", "", cell_item).strip())
                    fragment_contexts.append(cell_context)
        else:
            rendered_items = [
                item.strip()
                for item in re.split(r"<br\s*/?>", stripped, flags=re.IGNORECASE)
                if item.strip()
            ]
            if len(rendered_items) == 1 and (
                server_scoped_unverified_target(rendered_items[0])
                or publication_scoped_unknown_item(rendered_items[0])
            ):
                continue
            fragments = []
            for rendered_item in rendered_items:
                if _task_fragment_parts(rendered_item)[2] == "then":
                    # Preserve the controlled `; otherwise ...` outcome as one unit.
                    # Other roles keep the normal clause splitting used by projection.
                    fragments.extend(_INLINE_GWT_ROLE_BREAK.split(rendered_item))
                else:
                    fragments.extend(_evidence_clause_fragments(rendered_item))
            fragment_contexts = [""] * len(fragments)
        table_gap_context = (
            "|" in stripped
            and re.search(r"\bgaps?\b", current_heading, re.IGNORECASE) is not None
            and _UNRESOLVED_AUTHORITY_QUALIFIER.search(stripped) is not None
        )
        expanded_fragments: list[tuple[str, str]] = []
        for fragment, fragment_context in zip(fragments, fragment_contexts):
            if server_scoped_unverified_target(fragment):
                # The complete server-owned fragment labels every following token as
                # unverified. Recognize it before unresolved-clause splitting so
                # punctuation inside that payload cannot turn a provisional target
                # into an asserted factual tail.
                continue
            if publication_scoped_unknown_item(fragment):
                # The complete rendering unit is explicitly unknown and withheld from
                # execution. Recognize the whole unit before clause splitting; its
                # preserved payload is context, not an accepted factual claim.
                continue
            if exact_explicit_gap_fragment(fragment):
                expanded_fragments.append((fragment, fragment_context))
            elif _SERVER_VALIDATION_ACTION.fullmatch(
                re.sub(r"[*_`]", "", fragment).strip()
            ) is not None and _is_bounded_unresolved_requirement_action(fragment):
                # The complete proposition is inside one bounded verification
                # question. Keep it intact so conjunctions in the question cannot be
                # misread as independently asserted factual tails.
                expanded_fragments.append((fragment, fragment_context))
            elif _UNRESOLVED_CONDITIONAL_RECORDED_OUTCOME.fullmatch(
                re.sub(r"[*_`]", "", fragment)
            ):
                # Keep the complete controlled `pass only if independently
                # verified; otherwise unresolved` outcome intact. Its punctuation
                # and numeric targets are conditional criteria, not asserted facts.
                expanded_fragments.append((fragment, fragment_context))
            elif _UNRESOLVED_AUTHORITY_QUALIFIER.search(fragment):
                expanded_fragments.extend(
                    (item, fragment_context)
                    for item in _split_unresolved_assertions(fragment)
                )
            else:
                expanded_fragments.append((fragment, fragment_context))
        for fragment, fragment_context in expanded_fragments:
            if not fragment:
                continue
            if publication_scoped_unknown_item(fragment):
                continue
            markers = {
                match.group(1) for match in _RAW_EVIDENCE_MARKER.finditer(fragment)
            }
            without_markers = _RAW_EVIDENCE_MARKER.sub("", fragment)
            cleaned_without_markers = re.sub(r"[*_`]", "", without_markers)
            precise_values = _precision_values(without_markers)
            raw_conditional_then_candidate = (
                _CONDITIONAL_THEN_CANDIDATE.fullmatch(cleaned_without_markers)
                is not None
            )
            unresolved_alignment = _materially_matches_unresolved_requirement(
                without_markers, unresolved_evidence_requirements
            )
            gwt_role = _task_fragment_parts(cleaned_without_markers)[2]
            gwt_authority_execution = (
                gwt_role == "when"
                and _AUTHORITY_PROCESS_OBJECT.search(without_markers) is not None
                and (
                    _PLANNING_TARGET_OBLIGATION_ASSERTION.search(without_markers)
                    is not None
                    or _COORDINATED_EXECUTION_CLAUSE.search(without_markers) is not None
                )
            )
            conditional_ui_behavior = (
                _CONDITIONAL_UI_BEHAVIOR.fullmatch(cleaned_without_markers) is not None
            )
            safe_non_authority_planning_directive = (
                _is_safe_nonauthority_planning_directive(cleaned_without_markers)
            )
            evidence_sensitive = (
                not conditional_ui_behavior
                and not safe_non_authority_planning_directive
                and (
                    _EVIDENCE_SENSITIVE_ASSERTION.search(without_markers) is not None
                    or _DEFINITE_NEGATED_LEGAL_ASSERTION.search(without_markers)
                    is not None
                    or gwt_authority_execution
                    or (
                        raw_conditional_then_candidate
                        and _CONDITIONAL_AUTHORITY_ASSERTION.search(without_markers)
                        is not None
                    )
                )
            )
            conditional_then_candidate = (
                raw_conditional_then_candidate
                and (evidence_sensitive or unresolved_alignment)
                and not conditional_ui_behavior
            )
            planning_prefix = _EXPLICIT_PLANNING_TARGET_PREFIX.search(
                cleaned_without_markers
            )
            planning_payload = (
                re.split(
                    r"proposed\s+target\s*:\s*",
                    cleaned_without_markers,
                    maxsplit=1,
                    flags=re.IGNORECASE,
                )[-1].strip()
                if planning_prefix is not None
                else ""
            )
            planning_process_object = (
                _AUTHORITY_PROCESS_OBJECT.search(planning_payload) is not None
            )
            planning_target_authority_assertion = planning_prefix is not None and (
                _PLANNING_TARGET_PRODUCT_STATUS_ASSERTION.search(planning_payload)
                is not None
                or _PLANNING_TARGET_EXTERNAL_STATUS_ASSERTION.search(planning_payload)
                is not None
                or (
                    planning_process_object
                    and (
                        _PLANNING_TARGET_OBLIGATION_ASSERTION.search(planning_payload)
                        is not None
                        or _INTERNAL_PLANNING_TARGET.search(planning_payload) is None
                    )
                )
                or _AUTHORITY_PROCESS_EXECUTION.search(without_markers) is not None
            )
            validation_action_authority_execution = (
                _EXPLICIT_VALIDATION_ACTION_PREFIX.search(
                    re.sub(r"[*_`]", "", without_markers)
                )
                is not None
                and (
                    _AUTHORITY_PROCESS_EXECUTION.search(without_markers) is not None
                    or not _is_bounded_unresolved_requirement_action(without_markers)
                )
            )
            sensitive = (
                evidence_sensitive
                or planning_target_authority_assertion
                or validation_action_authority_execution
                or conditional_then_candidate
            )
            normalized_unresolved_label = _normalized_semantic_text(
                re.sub(r"^\s*(?:(?:[-+*]|\d+[.)])\s+)?", "", without_markers)
            )
            exact_gap_section_label = re.search(
                r"\b(?:assumptions?|gaps?|unresolved)\b", current_heading, re.I
            ) is not None and any(
                normalized_unresolved_label == _normalized_semantic_text(requirement)
                for requirement in unresolved_evidence_requirements
            )
            exact_explicit_gap_label = exact_explicit_gap_fragment(without_markers)
            hard_authority = not safe_non_authority_planning_directive and (
                _NONPROVISIONAL_AUTHORITY_ASSERTION.search(without_markers) is not None
                or _DEFINITE_NEGATED_LEGAL_ASSERTION.search(without_markers) is not None
                or planning_target_authority_assertion
                or validation_action_authority_execution
                or conditional_then_candidate
            )
            if not precise_values and not sensitive and not unresolved_alignment:
                continue
            if (
                table_gap_context
                and sensitive
                and not precise_values
                and not markers
                and not _POSITIVE_AUTHORITY_PREDICATE.search(without_markers)
            ):
                continue
            if (
                not markers
                and _UNRESOLVED_AUTHORITY_QUALIFIER.search(without_markers)
                and not unresolved_alignment
                and _is_pure_evidence_status_or_withholding(without_markers)
                and _DEFINITE_NEGATED_LEGAL_ASSERTION.search(without_markers) is None
            ):
                continue
            if not markers and (exact_gap_section_label or exact_explicit_gap_label):
                continue
            cleaned_action = re.sub(r"[*_`]", "", without_markers)
            if (
                not markers
                and artifact_type in _PLANNING_ARTIFACT_TYPES
                and _EXPLICIT_PLANNING_TARGET_PREFIX.search(cleaned_action)
                and _PLANNING_TARGET_PRODUCT_STATUS_ASSERTION.search(cleaned_action)
                is None
                and not planning_target_authority_assertion
                and _AUTHORITY_PROCESS_EXECUTION.search(cleaned_action) is None
            ):
                continue
            if not markers and (
                _UNRESOLVED_CONDITIONAL_RECORDED_OUTCOME.fullmatch(cleaned_action)
                or _UNRESOLVED_CONDITIONAL_UNRESOLVED_OUTCOME.fullmatch(cleaned_action)
                or _UNRESOLVED_CONDITIONAL_WITHHOLDING_OUTCOME.fullmatch(cleaned_action)
            ):
                continue
            if (
                not markers
                and _EXPLICIT_VALIDATION_ACTION_PREFIX.search(cleaned_action)
                and _is_bounded_unresolved_requirement_action(cleaned_action)
                and _AUTHORITY_PROCESS_EXECUTION.search(cleaned_action) is None
            ):
                continue
            if (
                not markers
                and (
                    _SERVER_VALIDATION_ACTION.fullmatch(cleaned_action)
                    or _is_bounded_specific_verification_action(cleaned_action)
                )
                and _is_bounded_unresolved_requirement_action(cleaned_action)
            ):
                # Only exact server-owned verification forms are universally exempt.
                # Arbitrary imperatives remain eligible only when they align with an
                # explicit unresolved requirement below, so legal or safety assertions
                # cannot be laundered as action language.
                continue
            if (
                unresolved_alignment
                and not markers
                and (
                    _UNRESOLVED_LABELED_ACTION.search(
                        re.sub(r"[*_`]", "", without_markers)
                    )
                    or _is_bounded_unresolved_requirement_action(
                        re.sub(r"[*_`]", "", without_markers)
                    )
                    or _UNRESOLVED_REQUIREMENT_CONTEXT.search(
                        re.sub(r"[*_`]", "", without_markers)
                    )
                    or _EXPLICIT_PLANNING_TABLE_COLUMN.search(fragment_context)
                )
            ):
                continue
            if (
                not markers
                and not hard_authority
                and not unresolved_alignment
                and _EXPLICIT_NONFACTUAL_QUALIFIER.search(
                    (
                        f"{current_heading} {fragment} {fragment_context}"
                        if (
                            fragment_context == _PROJECTED_STATUTORY_LOCATOR_HEADER
                            and _is_pure_statutory_locator(fragment)
                        )
                        else f"{current_heading} {fragment}"
                    )
                )
            ):
                continue
            excerpt = re.sub(r"\s+", " ", without_markers).strip()
            if excerpt_limit is not None:
                excerpt = excerpt[:excerpt_limit]
            if not markers:
                if unresolved_alignment:
                    add_defect(
                        "An unresolved evidence requirement is asserted as fact without "
                        f"exact immutable support or provisional/verification language: {excerpt}"
                    )
                    continue
                if not sensitive and artifact_type in _PLANNING_ARTIFACT_TYPES:
                    continue
                add_defect(
                    "Unsupported factual precision requires an exact evidence marker or an "
                    f"explicit proposal/assumption/validation label: {excerpt}"
                )
                continue
            cited_texts = [
                allowed_claim_texts[claim_id]
                for claim_id in markers
                if claim_id in allowed_claim_texts
            ]
            if not cited_texts:
                # Marker membership is reported by the existing citation validator.
                continue
            if unresolved_alignment:
                assertion_negated = (
                    _EXPLICIT_AUTHORITY_NEGATION.search(without_markers) is not None
                )
                cited_polarities = {
                    _EXPLICIT_AUTHORITY_NEGATION.search(text) is not None
                    for text in cited_texts
                }
                if any(polarity != assertion_negated for polarity in cited_polarities):
                    add_defect(
                        "Cited immutable claims have opposite polarity for this unresolved "
                        f"evidence assertion: {excerpt}"
                    )
                    continue
            supported_values = set().union(
                *(_precision_values(text) for text in cited_texts)
            )
            unsupported_values = precise_values - supported_values
            if unsupported_values:
                if unresolved_alignment:
                    add_defect(
                        "Cited immutable claims do not support every exact value in this "
                        "unresolved evidence assertion "
                        f"({', '.join(utf16_ordinal_sorted(unsupported_values))}): {excerpt}"
                    )
                else:
                    add_defect(
                        "Cited immutable claims do not support every exact value in this "
                        f"assertion ({', '.join(utf16_ordinal_sorted(unsupported_values))}): "
                        f"{excerpt}"
                    )
                continue
            if not _claims_align_with_assertion(
                without_markers,
                cited_texts,
                minimum_matches=(
                    min(3, max(1, len(_support_tokens(without_markers))))
                    if _FORMULA_MARKER.search(without_markers)
                    else (
                        min(2, max(1, len(_support_tokens(without_markers))))
                        if sensitive or unresolved_alignment
                        else 1
                    )
                ),
            ):
                if unresolved_alignment:
                    add_defect(
                        "Cited immutable claims do not support this unresolved evidence "
                        f"assertion: {excerpt}"
                    )
                else:
                    add_defect(
                        "Cited immutable claims do not semantically support this exact "
                        f"assertion: {excerpt}"
                    )
    ordered = utf16_ordinal_sorted(defects)
    return ordered if defect_limit is None else ordered[:defect_limit]


def _handled_task_evidence_defect(
    defect: str, *, include_generic: bool = False
) -> tuple[str, bool, bool] | None:
    """Return only unresolved-authority defects safe to reclassify as actions.

    Full-contract drafts are immutable inputs to evaluation and final repair. Generic
    precision or citation defects must remain visible to those stages; rewriting them
    here turns substantive prose into repetitive verification boilerplate and can make
    an otherwise useful deliverable harder to repair.
    """

    unresolved = defect.startswith(_UNRESOLVED_UNSUPPORTED_FACT_PREFIX) or (
        "unresolved evidence assertion" in defect
    )
    if unresolved:
        _prefix, separator, excerpt = defect.partition(": ")
        return (
            (excerpt, True, defect.startswith("Cited immutable claims"))
            if separator and excerpt
            else None
        )
    if not include_generic or not defect.startswith(
        (
            "Unsupported factual precision requires an exact evidence marker",
            "Cited immutable claims do not support every exact value in this assertion",
            "Cited immutable claims do not semantically support this exact assertion",
        )
    ):
        return None
    _prefix, separator, excerpt = defect.partition(": ")
    return (
        (excerpt, False, defect.startswith("Cited immutable claims"))
        if separator and excerpt
        else None
    )


def _is_hard_task_evidence_defect(defect: str) -> bool:
    """Select only unresolved or authority assertions for task-stage projection."""

    if _handled_task_evidence_defect(defect, include_generic=False) is not None:
        return True
    _prefix, separator, excerpt = defect.partition(": ")
    if not separator or not excerpt:
        return False
    cleaned = re.sub(r"[*_`]", "", excerpt).strip()
    if _is_safe_nonauthority_planning_directive(cleaned):
        return False
    return (
        _NONPROVISIONAL_AUTHORITY_ASSERTION.search(cleaned) is not None
        or _DEFINITE_NEGATED_LEGAL_ASSERTION.search(cleaned) is not None
        or _AUTHORITY_PROCESS_EXECUTION.search(cleaned) is not None
    )


def _is_pure_statutory_locator(value: str) -> bool:
    """Recognize a compact provision address, never substantive legal prose."""

    cleaned = re.sub(r"[*_`]", "", _RAW_EVIDENCE_MARKER.sub("", value)).strip()
    return (
        0 < len(cleaned) <= 240
        and "|" not in cleaned
        and "\n" not in cleaned
        and (
            _COMPACT_NUMBERED_INSTRUMENT_LOCATOR.fullmatch(cleaned) is not None
            or _COMPACT_NAMED_STATUTE_LOCATOR.fullmatch(cleaned) is not None
        )
    )


def _expanded_support_tokens(value: str) -> set[str]:
    expanded: set[str] = set()
    for token in _support_tokens(value):
        parts = {part for part in re.split(r"[-–—]", token) if part}
        expanded.update(parts or {token})
    return expanded


def _assertions_share_explicit_polarity(left: str, right: str) -> bool:
    """Fail closed when a citation would invert an explicit negation."""

    return bool(_EXPLICIT_CLAIM_NEGATION.search(left)) == bool(
        _EXPLICIT_CLAIM_NEGATION.search(right)
    )
