"""Deterministic topic-relevance contracts for official statistical evidence.

This module deliberately contains no network, model, fuzzy-search, embedding, or
cache integration.  A caller may obtain alias candidates elsewhere, but those
candidates have to pass the bounded, country-scoped contract below before they
can participate in exact visible-field evidence matching.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from enum import Enum
from typing import Any, Iterable, Literal, Mapping, Sequence

import pycountry
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


TOPIC_CONTRACT_SCHEMA_VERSION = "research_topic_contract_v1"
MAX_COUNTRIES = 32
MAX_GOAL_ANCHORS = 8
MAX_ALIASES = 48
MAX_ALIASES_PER_COUNTRY = 12
MAX_TOPIC_PHRASE_CHARS = 120
MAX_VISIBLE_FIELD_CHARS = 1_000
MAX_VISIBLE_SERIES_OR_DIMENSIONS = 32

_SHA256_PATTERN = r"^[0-9a-f]{64}$"
_LANGUAGE_PATTERN = r"^[a-z]{2,3}(?:-[A-Z]{2})?$"
_SPACE = re.compile(r"\s+")
_WORD = re.compile(r"[^\W_]+", re.UNICODE)
_OPERATIONAL_COUNTRY_NAMES = {
    # Mirrors backend.domain.market_scope's versioned Balkans membership. XK is
    # widely used operationally for Kosovo but is not assigned by ISO 3166.
    "XK": "Kosovo",
}

# These terms may help state the task, but alone they never identify its topic.
# The list is deliberately closed and deterministic.  It is not a semantic
# classifier and must not be expanded at evaluation time by a model.
_GENERIC_TOPIC_TOKENS = frozenset(
    {
        "analysis",
        "actionable",
        "assess",
        "assessing",
        "assessment",
        "based",
        "business",
        "commercial",
        "complete",
        "compliant",
        "consumer",
        "consumers",
        "customer",
        "customers",
        "current",
        "data",
        "demand",
        "decision",
        "decisions",
        "evidence",
        "fixed",
        "full",
        "general",
        "growth",
        "grounded",
        "gtm",
        "industry",
        "insight",
        "insights",
        "launch",
        "latest",
        "market",
        "markets",
        "official",
        "opportunity",
        "overview",
        "plan",
        "price",
        "prices",
        "pricing",
        "ready",
        "report",
        "research",
        "retail",
        "risk",
        "risks",
        "sales",
        "sector",
        "sell",
        "selling",
        "service",
        "services",
        "smb",
        "smbs",
        "statistics",
        "strategy",
        "study",
        "supply",
        "tailored",
        "turnover",
        "trend",
        "trends",
        "validate",
        "validated",
        "validation",
        "wholesale",
    }
)

_FUNCTION_TOPIC_TOKENS = frozenset(
    {
        "a",
        "an",
        "and",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "in",
        "into",
        "is",
        "it",
        "of",
        "on",
        "or",
        "s",
        "that",
        "the",
        "their",
        "this",
        "to",
        "with",
        "without",
    }
)

_STATIC_GEOGRAPHY_TOKENS = frozenset(
    {
        "africa",
        "america",
        "asia",
        "balkan",
        "balkans",
        "baltic",
        "baltics",
        "benelux",
        "dach",
        "europe",
        "european",
        "global",
        "latam",
        "mena",
        "nordic",
        "nordics",
        "oceania",
        "scandinavia",
        "sea",
        "worldwide",
    }
)


def normalize_topic_phrase(value: str) -> str:
    """Return the sole phrase normalization used by seed, alias, and matcher.

    NFKC handles compatibility forms (including full-width text), casefold is
    Unicode-aware, and whitespace is collapsed.  Punctuation is intentionally
    preserved: accepting a punctuation variant requires an explicit validated
    surface-form alias rather than an evaluator-side fuzzy transform.
    """

    if not isinstance(value, str):
        raise TypeError("topic phrase must be a string")
    return _SPACE.sub(" ", unicodedata.normalize("NFKC", value).casefold()).strip()


def _unicode_word_character(value: str) -> bool:
    return (
        value == "_"
        or value.isalnum()
        or unicodedata.category(value).startswith("M")
    )


def _exact_topic_phrase_span(text: str, phrase: str) -> tuple[int, int] | None:
    normalized_text = normalize_topic_phrase(text)
    normalized_phrase = _normalized_bounded_phrase(phrase, label="match phrase")
    start = 0
    while True:
        index = normalized_text.find(normalized_phrase, start)
        if index < 0:
            return None
        end = index + len(normalized_phrase)
        left_ok = index == 0 or not _unicode_word_character(normalized_text[index - 1])
        right_ok = end == len(normalized_text) or not _unicode_word_character(
            normalized_text[end]
        )
        if left_ok and right_ok:
            return index, end
        start = index + 1


def _normalized_bounded_phrase(value: str, *, label: str) -> str:
    normalized = normalize_topic_phrase(value)
    if not normalized:
        raise ValueError(f"{label} must not be empty")
    if len(normalized) > MAX_TOPIC_PHRASE_CHARS:
        raise ValueError(
            f"{label} exceeds {MAX_TOPIC_PHRASE_CHARS} normalized characters"
        )
    return normalized


def _canonical_value(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return _canonical_value(value.model_dump(mode="json"))
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Mapping):
        return {
            str(key): _canonical_value(child)
            for key, child in sorted(value.items(), key=lambda item: str(item[0]))
        }
    if isinstance(value, (list, tuple)):
        return [_canonical_value(child) for child in value]
    return value


def canonical_topic_sha256(value: Any) -> str:
    """Hash strict, recursively key-sorted UTF-8 JSON for contract binding."""

    encoded = json.dumps(
        _canonical_value(value),
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _clean_immutable_text(value: str, *, label: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{label} must be a string")
    cleaned = _SPACE.sub(" ", unicodedata.normalize("NFKC", value)).strip()
    if not cleaned:
        raise ValueError(f"{label} must not be empty")
    if len(cleaned) > maximum:
        raise ValueError(f"{label} exceeds {maximum} characters")
    return cleaned


def _canonical_country_codes(values: Iterable[str]) -> tuple[str, ...]:
    if isinstance(values, str):
        raise TypeError("country_codes must be a sequence, not a string")
    result: set[str] = set()
    for raw in values:
        if not isinstance(raw, str):
            raise TypeError("country code must be a string")
        code = raw.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", code):
            raise ValueError(f"invalid ISO 3166-1 alpha-2 country code: {raw!r}")
        if (
            pycountry.countries.get(alpha_2=code) is None
            and code not in _OPERATIONAL_COUNTRY_NAMES
        ):
            raise ValueError(f"unknown ISO 3166-1 alpha-2 country code: {code}")
        result.add(code)
    if not result:
        raise ValueError("at least one confirmed country code is required")
    if len(result) > MAX_COUNTRIES:
        raise ValueError(f"at most {MAX_COUNTRIES} confirmed countries are allowed")
    return tuple(sorted(result))


class ImmutableGoalTopicFields(BaseModel):
    """Immutable goal fields allowed to influence a topic seed.

    ``exact_topic_anchors`` must come from the immutable goal record (for
    example, a confirmed structured goal field), not from retrieved documents.
    This keeps retrieval output from redefining what would count as relevant.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    goal_id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=300)
    problem_scope: str = Field(default="", max_length=4_000)
    desired_outcome: str = Field(default="", max_length=4_000)
    mission: str = Field(default="", max_length=4_000)
    industry: str = Field(default="", max_length=500)
    target_user: str = Field(default="", max_length=1_000)
    exact_topic_anchors: tuple[str, ...] = Field(
        default=(), max_length=MAX_GOAL_ANCHORS
    )

    @field_validator("goal_id", "title")
    @classmethod
    def clean_required_text(cls, value: str, info: Any) -> str:
        maximum = 128 if info.field_name == "goal_id" else 300
        return _clean_immutable_text(value, label=info.field_name, maximum=maximum)

    @field_validator(
        "problem_scope",
        "desired_outcome",
        "mission",
        "industry",
        "target_user",
    )
    @classmethod
    def clean_optional_text(cls, value: str, info: Any) -> str:
        if value == "":
            return value
        maximum = {
            "industry": 500,
            "target_user": 1_000,
        }.get(info.field_name, 4_000)
        return _clean_immutable_text(
            value, label=info.field_name, maximum=maximum
        )

    @field_validator("exact_topic_anchors", mode="before")
    @classmethod
    def require_anchor_sequence(cls, value: Any) -> Any:
        if value is None:
            return ()
        if isinstance(value, str):
            raise TypeError("exact_topic_anchors must be a sequence, not a string")
        normalized = {
            _normalized_bounded_phrase(item, label="exact goal anchor")
            for item in value
        }
        if len(normalized) > MAX_GOAL_ANCHORS:
            raise ValueError(f"at most {MAX_GOAL_ANCHORS} goal anchors are allowed")
        return tuple(sorted(normalized))


class ConfirmedMarketScope(BaseModel):
    """Country-resolved scope that has already passed user confirmation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    scope_label: str = Field(min_length=1, max_length=300)
    country_codes: tuple[str, ...] = Field(
        min_length=1, max_length=MAX_COUNTRIES
    )
    confirmed: Literal[True] = True
    resolution_hash: str | None = Field(default=None, pattern=_SHA256_PATTERN)
    geography_terms: tuple[str, ...] = Field(default=(), max_length=64)

    @field_validator("scope_label")
    @classmethod
    def clean_scope_label(cls, value: str) -> str:
        return _clean_immutable_text(value, label="scope_label", maximum=300)

    @field_validator("country_codes", mode="before")
    @classmethod
    def normalize_countries(cls, value: Any) -> tuple[str, ...]:
        return _canonical_country_codes(value)

    @field_validator("geography_terms", mode="before")
    @classmethod
    def normalize_geography_terms(cls, value: Any) -> tuple[str, ...]:
        if value is None:
            return ()
        if isinstance(value, str):
            raise TypeError("geography_terms must be a sequence, not a string")
        terms = {
            _normalized_bounded_phrase(term, label="geography term")
            for term in value
        }
        if len(terms) > 64:
            raise ValueError("at most 64 confirmed geography terms are allowed")
        return tuple(sorted(terms))


TopicAnchorSourceField = Literal[
    "title",
    "problem_scope",
    "desired_outcome",
    "mission",
    "industry",
    "target_user",
]


class TopicAnchorBinding(BaseModel):
    """Exact immutable-source provenance for one accepted seed anchor."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    phrase: str = Field(min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS)
    source_field: TopicAnchorSourceField
    normalized_start: int = Field(ge=0, le=4_000)
    normalized_end: int = Field(gt=0, le=4_000)
    source_text_sha256: str = Field(pattern=_SHA256_PATTERN)
    source_span_sha256: str = Field(pattern=_SHA256_PATTERN)
    derivation: Literal[
        "explicit_exact_span",
        "deterministic_contiguous_run",
    ]

    @model_validator(mode="after")
    def validate_binding(self) -> "TopicAnchorBinding":
        if self.phrase != _normalized_bounded_phrase(
            self.phrase, label="anchor binding phrase"
        ):
            raise ValueError("anchor binding phrase must be normalized")
        if self.normalized_end <= self.normalized_start:
            raise ValueError("anchor binding span must be non-empty")
        return self


class TopicSeedContract(BaseModel):
    """Canonical deterministic seed consumed by expansion and evaluation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[TOPIC_CONTRACT_SCHEMA_VERSION]
    goal_id: str = Field(min_length=1, max_length=128)
    immutable_goal_sha256: str = Field(pattern=_SHA256_PATTERN)
    confirmed_market_scope_sha256: str = Field(pattern=_SHA256_PATTERN)
    exact_goal_anchors: tuple[str, ...] = Field(
        min_length=1, max_length=MAX_GOAL_ANCHORS
    )
    confirmed_country_codes: tuple[str, ...] = Field(
        min_length=1, max_length=MAX_COUNTRIES
    )
    anchor_bindings: tuple[TopicAnchorBinding, ...] = Field(
        min_length=1, max_length=MAX_GOAL_ANCHORS
    )
    seed_sha256: str = Field(pattern=_SHA256_PATTERN)

    @model_validator(mode="after")
    def verify_seed_hash(self) -> "TopicSeedContract":
        canonical_anchors = tuple(
            sorted(
                {
                    _normalized_bounded_phrase(anchor, label="exact goal anchor")
                    for anchor in self.exact_goal_anchors
                }
            )
        )
        if self.exact_goal_anchors != canonical_anchors:
            raise ValueError(
                "exact_goal_anchors must be normalized, unique, and sorted"
            )
        if self.confirmed_country_codes != _canonical_country_codes(
            self.confirmed_country_codes
        ):
            raise ValueError(
                "confirmed_country_codes must be unique uppercase ISO codes in order"
            )
        binding_phrases = tuple(binding.phrase for binding in self.anchor_bindings)
        if binding_phrases != self.exact_goal_anchors:
            raise ValueError(
                "anchor_bindings must be sorted one-to-one with exact_goal_anchors"
            )
        expected = canonical_topic_sha256(_seed_hash_payload(self))
        if self.seed_sha256 != expected:
            raise ValueError("seed_sha256 does not match the canonical seed payload")
        return self


def _seed_hash_payload(seed: TopicSeedContract | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(seed, BaseModel):
        values = seed.model_dump(mode="json")
    else:
        values = dict(seed)
    return {
        "schema_version": values["schema_version"],
        "goal_id": values["goal_id"],
        "immutable_goal_sha256": values["immutable_goal_sha256"],
        "confirmed_market_scope_sha256": values[
            "confirmed_market_scope_sha256"
        ],
        "exact_goal_anchors": values["exact_goal_anchors"],
        "confirmed_country_codes": values["confirmed_country_codes"],
        "anchor_bindings": values["anchor_bindings"],
    }


def _geography_tokens(scope: ConfirmedMarketScope) -> set[str]:
    terms = set(_STATIC_GEOGRAPHY_TOKENS)
    terms.update(_WORD.findall(normalize_topic_phrase(scope.scope_label)))
    for confirmed_term in scope.geography_terms:
        terms.update(_WORD.findall(confirmed_term))
    for code in scope.country_codes:
        country = pycountry.countries.get(alpha_2=code)
        terms.add(code.casefold())
        if country is None:
            operational_name = _OPERATIONAL_COUNTRY_NAMES.get(code)
            if operational_name:
                terms.update(_WORD.findall(normalize_topic_phrase(operational_name)))
            continue
        terms.add(str(country.alpha_3).casefold())
        for attribute in ("name", "official_name", "common_name"):
            raw = getattr(country, attribute, "")
            terms.update(_WORD.findall(normalize_topic_phrase(str(raw))))
    return terms


def _assert_topic_specific(
    phrase: str,
    *,
    geography_tokens: set[str],
    label: str,
) -> None:
    tokens = {token for token in _WORD.findall(phrase) if not token.isdigit()}
    if not tokens:
        raise ValueError(f"{label} contains no Unicode word characters")
    non_topic = _GENERIC_TOPIC_TOKENS | _FUNCTION_TOPIC_TOKENS | geography_tokens
    if tokens <= non_topic:
        raise ValueError(f"{label} is geography-only or generic-only: {phrase!r}")


_SOURCE_FIELD_PRIORITY: dict[str, int] = {
    "title": 0,
    "industry": 1,
    "problem_scope": 2,
    "target_user": 3,
    "desired_outcome": 4,
    "mission": 5,
}


@dataclass(frozen=True)
class _AnchorOccurrence:
    phrase: str
    source_field: TopicAnchorSourceField
    normalized_start: int
    normalized_end: int


def _immutable_topic_sources(
    goal: ImmutableGoalTopicFields,
) -> tuple[tuple[TopicAnchorSourceField, str], ...]:
    rows: list[tuple[TopicAnchorSourceField, str]] = []
    for field_name in (
        "title",
        "industry",
        "problem_scope",
        "target_user",
        "desired_outcome",
        "mission",
    ):
        text = normalize_topic_phrase(str(getattr(goal, field_name) or ""))
        if text:
            rows.append((field_name, text))  # type: ignore[arg-type]
    return tuple(rows)


def _derived_anchor_occurrences(
    goal: ImmutableGoalTopicFields,
    *,
    geography_tokens: set[str],
) -> dict[str, list[_AnchorOccurrence]]:
    """Extract bounded contiguous 2-4 token phrases without semantic guessing."""

    excluded = _GENERIC_TOPIC_TOKENS | _FUNCTION_TOPIC_TOKENS | geography_tokens
    candidates: dict[str, list[_AnchorOccurrence]] = {}

    def retain_run(
        run: list[tuple[str, int, int]],
        source_field: TopicAnchorSourceField,
        source_text: str,
    ) -> None:
        if len(run) >= 2:
            for size in range(min(4, len(run)), 1, -1):
                for index in range(0, len(run) - size + 1):
                    part = run[index : index + size]
                    # Preserve the exact normalized immutable-field slice,
                    # including punctuation.  Rejoining lexical tokens would
                    # turn e.g. ``pet-food`` into the unbound ``pet food``.
                    phrase = source_text[part[0][1] : part[-1][2]]
                    if len(phrase) > MAX_TOPIC_PHRASE_CHARS:
                        continue
                    candidates.setdefault(phrase, []).append(
                        _AnchorOccurrence(
                            phrase=phrase,
                            source_field=source_field,
                            normalized_start=part[0][1],
                            normalized_end=part[-1][2],
                        )
                    )
        elif len(run) == 1 and source_field == "industry":
            token, start, end = run[0]
            candidates.setdefault(token, []).append(
                _AnchorOccurrence(
                    phrase=token,
                    source_field=source_field,
                    normalized_start=start,
                    normalized_end=end,
                )
            )

    for source_field, text in _immutable_topic_sources(goal):
        run: list[tuple[str, int, int]] = []
        prior_end: int | None = None
        for match in _WORD.finditer(text):
            token = match.group(0)
            hard_break = (
                prior_end is not None
                and re.search(r"[.!?;:\n]", text[prior_end : match.start()])
                is not None
            )
            is_excluded = (
                token in excluded
                or len(token) < 2
                or any(character.isdigit() for character in token)
            )
            if hard_break or is_excluded:
                retain_run(run, source_field, text)
                run = []
            if not is_excluded:
                run.append((token, match.start(), match.end()))
            prior_end = match.end()
        retain_run(run, source_field, text)
    return candidates


def _explicit_anchor_occurrences(
    phrase: str,
    goal: ImmutableGoalTopicFields,
) -> list[_AnchorOccurrence]:
    rows: list[_AnchorOccurrence] = []
    for source_field, text in _immutable_topic_sources(goal):
        span = _exact_topic_phrase_span(text, phrase)
        if span is not None:
            rows.append(
                _AnchorOccurrence(
                    phrase=phrase,
                    source_field=source_field,
                    normalized_start=span[0],
                    normalized_end=span[1],
                )
            )
    return rows


def _candidate_priority(
    phrase: str,
    occurrences: Sequence[_AnchorOccurrence],
) -> tuple[int, int, int, int, int, str]:
    source_fields = {row.source_field for row in occurrences}
    return (
        len(source_fields),
        int("title" in source_fields),
        int("industry" in source_fields),
        len(phrase.split()),
        len(phrase),
        phrase,
    )


def _binding_from_occurrence(
    occurrence: _AnchorOccurrence,
    goal: ImmutableGoalTopicFields,
    *,
    derivation: Literal[
        "explicit_exact_span",
        "deterministic_contiguous_run",
    ],
) -> TopicAnchorBinding:
    normalized_text = normalize_topic_phrase(
        str(getattr(goal, occurrence.source_field) or "")
    )
    span_text = normalized_text[
        occurrence.normalized_start : occurrence.normalized_end
    ]
    return TopicAnchorBinding(
        phrase=occurrence.phrase,
        source_field=occurrence.source_field,
        normalized_start=occurrence.normalized_start,
        normalized_end=occurrence.normalized_end,
        source_text_sha256=canonical_topic_sha256(
            {
                "source_field": occurrence.source_field,
                "normalized_text": normalized_text,
            }
        ),
        source_span_sha256=canonical_topic_sha256(
            {
                "source_field": occurrence.source_field,
                "normalized_start": occurrence.normalized_start,
                "normalized_end": occurrence.normalized_end,
                "span_text": span_text,
            }
        ),
        derivation=derivation,
    )


def build_topic_seed(
    goal: ImmutableGoalTopicFields,
    market_scope: ConfirmedMarketScope,
) -> TopicSeedContract:
    """Build a canonical seed solely from immutable goal and confirmed scope."""

    if not isinstance(goal, ImmutableGoalTopicFields):
        goal = ImmutableGoalTopicFields.model_validate(goal)
    if not isinstance(market_scope, ConfirmedMarketScope):
        market_scope = ConfirmedMarketScope.model_validate(market_scope)

    geography = _geography_tokens(market_scope)
    explicit_occurrences: dict[str, list[_AnchorOccurrence]] = {}
    for raw in goal.exact_topic_anchors:
        phrase = _normalized_bounded_phrase(raw, label="exact goal anchor")
        _assert_topic_specific(
            phrase,
            geography_tokens=geography,
            label="exact goal anchor",
        )
        occurrences = _explicit_anchor_occurrences(phrase, goal)
        if not occurrences:
            raise ValueError(
                "explicit exact goal anchor must occur on a Unicode boundary in "
                f"an immutable goal field: {phrase!r}"
            )
        explicit_occurrences[phrase] = occurrences

    derived_occurrences = _derived_anchor_occurrences(
        goal,
        geography_tokens=geography,
    )
    selected = list(sorted(explicit_occurrences))
    remaining = [
        phrase for phrase in derived_occurrences if phrase not in explicit_occurrences
    ]
    remaining.sort(
        key=lambda phrase: _candidate_priority(
            phrase, derived_occurrences[phrase]
        ),
        reverse=True,
    )
    selected.extend(remaining[: MAX_GOAL_ANCHORS - len(selected)])
    anchors = tuple(sorted(selected))
    if not anchors:
        raise ValueError(
            "immutable goal fields contain no bounded topic-specific phrase; "
            "topic relevance must fail closed"
        )

    bindings: list[TopicAnchorBinding] = []
    for phrase in anchors:
        is_explicit = phrase in explicit_occurrences
        occurrences = (
            explicit_occurrences[phrase]
            if is_explicit
            else derived_occurrences[phrase]
        )
        occurrence = min(
            occurrences,
            key=lambda row: (
                _SOURCE_FIELD_PRIORITY[row.source_field],
                row.normalized_start,
                row.normalized_end,
            ),
        )
        bindings.append(
            _binding_from_occurrence(
                occurrence,
                goal,
                derivation=(
                    "explicit_exact_span"
                    if is_explicit
                    else "deterministic_contiguous_run"
                ),
            )
        )

    goal_payload = goal.model_dump(mode="json")
    scope_payload = market_scope.model_dump(mode="json")
    payload = {
        "schema_version": TOPIC_CONTRACT_SCHEMA_VERSION,
        "goal_id": goal.goal_id,
        "immutable_goal_sha256": canonical_topic_sha256(goal_payload),
        "confirmed_market_scope_sha256": canonical_topic_sha256(scope_payload),
        "exact_goal_anchors": anchors,
        "confirmed_country_codes": market_scope.country_codes,
        "anchor_bindings": [binding.model_dump(mode="json") for binding in bindings],
    }
    return TopicSeedContract(
        **payload,
        seed_sha256=canonical_topic_sha256(payload),
    )


class TopicAliasRelation(str, Enum):
    SURFACE_FORM = "surface_form"
    DIRECT_TRANSLATION = "direct_translation"
    BROADER_SYNONYM = "broader_synonym"


class TopicAliasUsage(str, Enum):
    EVIDENCE_AND_RETRIEVAL = "evidence_and_retrieval"
    RETRIEVAL_ONLY = "retrieval_only"


class TopicAliasAcceptanceBasis(str, Enum):
    MODEL_PROPOSED = "model_proposed"
    TRUSTED_LEXICON = "trusted_lexicon"
    HUMAN_CONFIRMED = "human_confirmed"


class TopicAliasCandidate(BaseModel):
    """Strict bounded row accepted from an external alias-expansion stage."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    phrase: str = Field(min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS)
    country_code: str = Field(min_length=2, max_length=2)
    language_code: str = Field(pattern=_LANGUAGE_PATTERN)
    source_anchor: str = Field(min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS)
    relation: TopicAliasRelation
    usage: TopicAliasUsage
    acceptance_basis: TopicAliasAcceptanceBasis = (
        TopicAliasAcceptanceBasis.MODEL_PROPOSED
    )
    back_translation: str = Field(
        min_length=1,
        max_length=MAX_TOPIC_PHRASE_CHARS,
        description=(
            "Canonical exact seed anchor selected after back-translation; this "
            "is not a free-form translation explanation"
        ),
    )

    @field_validator("country_code")
    @classmethod
    def uppercase_country(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("language_code")
    @classmethod
    def canonical_language(cls, value: str) -> str:
        value = value.strip().replace("_", "-")
        parts = value.split("-", 1)
        return parts[0].lower() + (f"-{parts[1].upper()}" if len(parts) == 2 else "")

    @model_validator(mode="after")
    def enforce_relation_usage(self) -> "TopicAliasCandidate":
        if self.relation == TopicAliasRelation.BROADER_SYNONYM:
            if self.usage != TopicAliasUsage.RETRIEVAL_ONLY:
                raise ValueError("broader synonyms must be retrieval_only")
        elif (
            self.acceptance_basis == TopicAliasAcceptanceBasis.MODEL_PROPOSED
            and self.usage != TopicAliasUsage.RETRIEVAL_ONLY
        ):
            raise ValueError("model-proposed aliases must be retrieval_only")
        elif (
            self.acceptance_basis != TopicAliasAcceptanceBasis.MODEL_PROPOSED
            and self.usage != TopicAliasUsage.EVIDENCE_AND_RETRIEVAL
        ):
            raise ValueError(
                "trusted surface forms and direct translations must be "
                "evidence_and_retrieval"
            )
        return self


class TrustedTopicAliasEntry(BaseModel):
    """One externally trusted exact locale mapping."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    phrase: str = Field(min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS)
    country_code: str = Field(min_length=2, max_length=2)
    language_code: str = Field(pattern=_LANGUAGE_PATTERN)
    source_anchor: str = Field(min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS)
    relation: Literal[
        TopicAliasRelation.SURFACE_FORM,
        TopicAliasRelation.DIRECT_TRANSLATION,
    ]
    back_translation: str = Field(
        min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS
    )
    acceptance_basis: Literal[
        TopicAliasAcceptanceBasis.TRUSTED_LEXICON,
        TopicAliasAcceptanceBasis.HUMAN_CONFIRMED,
    ]

    @field_validator("phrase", "source_anchor", "back_translation")
    @classmethod
    def normalize_registry_phrase(cls, value: str, info: Any) -> str:
        return _normalized_bounded_phrase(value, label=info.field_name)

    @field_validator("country_code")
    @classmethod
    def normalize_registry_country(cls, value: str) -> str:
        return _canonical_country_codes((value,))[0]

    @field_validator("language_code")
    @classmethod
    def normalize_registry_language(cls, value: str) -> str:
        value = value.strip().replace("_", "-")
        parts = value.split("-", 1)
        return parts[0].lower() + (
            f"-{parts[1].upper()}" if len(parts) == 2 else ""
        )

    @model_validator(mode="after")
    def bind_registry_back_translation(self) -> "TrustedTopicAliasEntry":
        if self.back_translation != self.source_anchor:
            raise ValueError(
                "trusted alias back_translation must equal its canonical source_anchor"
            )
        return self


class TrustedTopicAliasRegistry(BaseModel):
    """Versioned, hash-bound registry supplied outside an untrusted model payload."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    registry_id: str = Field(min_length=1, max_length=128)
    registry_version: str = Field(min_length=1, max_length=64)
    entries: tuple[TrustedTopicAliasEntry, ...] = Field(
        min_length=1, max_length=MAX_ALIASES
    )
    registry_sha256: str = Field(pattern=_SHA256_PATTERN)

    @model_validator(mode="after")
    def verify_registry(self) -> "TrustedTopicAliasRegistry":
        keys = [
            (
                row.country_code,
                row.phrase,
                row.source_anchor,
                row.relation.value,
                row.acceptance_basis.value,
            )
            for row in self.entries
        ]
        if keys != sorted(set(keys)):
            raise ValueError(
                "trusted registry entries must be unique and canonically sorted"
            )
        expected = canonical_topic_sha256(
            {
                "registry_id": self.registry_id,
                "registry_version": self.registry_version,
                "entries": [entry.model_dump(mode="json") for entry in self.entries],
            }
        )
        if self.registry_sha256 != expected:
            raise ValueError(
                "registry_sha256 does not match canonical trusted registry"
            )
        return self


def build_trusted_topic_alias_registry(
    *,
    registry_id: str,
    registry_version: str,
    entries: Sequence[TrustedTopicAliasEntry | Mapping[str, Any]],
) -> TrustedTopicAliasRegistry:
    normalized = tuple(
        sorted(
            (
                entry
                if isinstance(entry, TrustedTopicAliasEntry)
                else TrustedTopicAliasEntry.model_validate(entry)
                for entry in entries
            ),
            key=lambda row: (
                row.country_code,
                row.phrase,
                row.source_anchor,
                row.relation.value,
                row.acceptance_basis.value,
            ),
        )
    )
    payload = {
        "registry_id": registry_id,
        "registry_version": registry_version,
        "entries": [entry.model_dump(mode="json") for entry in normalized],
    }
    return TrustedTopicAliasRegistry(
        **payload,
        registry_sha256=canonical_topic_sha256(payload),
    )


class TopicAliasExpansionPayload(BaseModel):
    """Untrusted but typed expansion payload to validate against one seed."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[TOPIC_CONTRACT_SCHEMA_VERSION]
    seed_sha256: str = Field(pattern=_SHA256_PATTERN)
    aliases: tuple[TopicAliasCandidate, ...] = Field(
        default=(), max_length=MAX_ALIASES
    )

    @field_validator("aliases", mode="before")
    @classmethod
    def require_alias_sequence(cls, value: Any) -> Any:
        if isinstance(value, str):
            raise TypeError("aliases must be a sequence, not a string")
        return value


class ValidatedTopicAlias(BaseModel):
    """Normalized country-scoped alias that has passed seed binding."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    phrase: str = Field(min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS)
    country_code: str = Field(min_length=2, max_length=2)
    language_code: str = Field(pattern=_LANGUAGE_PATTERN)
    source_anchor: str = Field(min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS)
    relation: TopicAliasRelation
    usage: TopicAliasUsage
    acceptance_basis: TopicAliasAcceptanceBasis
    back_translation: str = Field(
        min_length=1, max_length=MAX_TOPIC_PHRASE_CHARS
    )

    @model_validator(mode="after")
    def require_canonical_validated_alias(self) -> "ValidatedTopicAlias":
        for label, phrase in (
            ("phrase", self.phrase),
            ("source_anchor", self.source_anchor),
            ("back_translation", self.back_translation),
        ):
            if phrase != _normalized_bounded_phrase(phrase, label=label):
                raise ValueError(f"validated alias {label} must be normalized")
        if _canonical_country_codes((self.country_code,)) != (self.country_code,):
            raise ValueError("validated alias country_code must be canonical")
        if self.back_translation != self.source_anchor:
            raise ValueError(
                "validated alias back_translation must equal source_anchor"
            )
        if self.relation == TopicAliasRelation.BROADER_SYNONYM:
            if self.usage != TopicAliasUsage.RETRIEVAL_ONLY:
                raise ValueError("broader synonyms must be retrieval_only")
        elif (
            self.acceptance_basis == TopicAliasAcceptanceBasis.MODEL_PROPOSED
            and self.usage != TopicAliasUsage.RETRIEVAL_ONLY
        ):
            raise ValueError("model-proposed validated aliases must be retrieval_only")
        elif (
            self.acceptance_basis != TopicAliasAcceptanceBasis.MODEL_PROPOSED
            and self.usage != TopicAliasUsage.EVIDENCE_AND_RETRIEVAL
        ):
            raise ValueError(
                "trusted surface forms and direct translations must be "
                "evidence_and_retrieval"
            )
        return self

    @property
    def evidence_eligible(self) -> bool:
        return self.usage == TopicAliasUsage.EVIDENCE_AND_RETRIEVAL


class ValidatedTopicAliasExpansion(BaseModel):
    """Canonical expansion bound to exactly one topic seed."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal[TOPIC_CONTRACT_SCHEMA_VERSION]
    seed_sha256: str = Field(pattern=_SHA256_PATTERN)
    aliases: tuple[ValidatedTopicAlias, ...] = Field(
        default=(), max_length=MAX_ALIASES
    )
    trusted_registry_id: str | None = Field(default=None, max_length=128)
    trusted_registry_version: str | None = Field(default=None, max_length=64)
    trusted_registry_sha256: str | None = Field(default=None, pattern=_SHA256_PATTERN)
    expansion_sha256: str = Field(pattern=_SHA256_PATTERN)

    @model_validator(mode="after")
    def verify_expansion_hash(self) -> "ValidatedTopicAliasExpansion":
        registry_binding = (
            self.trusted_registry_id,
            self.trusted_registry_version,
            self.trusted_registry_sha256,
        )
        if any(value is None for value in registry_binding) and any(
            value is not None for value in registry_binding
        ):
            raise ValueError("trusted registry binding must be complete or absent")
        if any(
            row.acceptance_basis != TopicAliasAcceptanceBasis.MODEL_PROPOSED
            for row in self.aliases
        ) and self.trusted_registry_sha256 is None:
            raise ValueError("trusted aliases require a hash-bound registry")
        keys = [
            (
                row.country_code,
                row.phrase,
                row.source_anchor,
                row.relation.value,
            )
            for row in self.aliases
        ]
        if keys != sorted(set(keys)):
            raise ValueError("validated aliases must be unique and canonically sorted")
        country_counts: dict[str, int] = {}
        for row in self.aliases:
            country_counts[row.country_code] = (
                country_counts.get(row.country_code, 0) + 1
            )
            if country_counts[row.country_code] > MAX_ALIASES_PER_COUNTRY:
                raise ValueError(
                    f"validated aliases exceed per-country cap for {row.country_code}"
                )
        expected = canonical_topic_sha256(_expansion_hash_payload(self))
        if self.expansion_sha256 != expected:
            raise ValueError(
                "expansion_sha256 does not match the canonical expansion payload"
            )
        return self


def _expansion_hash_payload(
    expansion: ValidatedTopicAliasExpansion | Mapping[str, Any],
) -> dict[str, Any]:
    if isinstance(expansion, BaseModel):
        values = expansion.model_dump(mode="json")
    else:
        values = dict(expansion)
    return {
        "schema_version": values["schema_version"],
        "seed_sha256": values["seed_sha256"],
        "aliases": values["aliases"],
        "trusted_registry_id": values.get("trusted_registry_id"),
        "trusted_registry_version": values.get("trusted_registry_version"),
        "trusted_registry_sha256": values.get("trusted_registry_sha256"),
    }


def validate_alias_expansion(
    seed: TopicSeedContract,
    payload: TopicAliasExpansionPayload | Mapping[str, Any],
    *,
    market_scope: ConfirmedMarketScope,
    trusted_registry: TrustedTopicAliasRegistry | None = None,
) -> ValidatedTopicAliasExpansion:
    """Validate, normalize, country-scope, deduplicate, and hash aliases.

    Back-translation must normalize to the exact immutable source anchor.  This
    is a structural acceptance contract for an upstream translation stage; it
    never attempts to infer semantic equivalence itself.
    """

    if not isinstance(seed, TopicSeedContract):
        seed = TopicSeedContract.model_validate(seed)
    if not isinstance(payload, TopicAliasExpansionPayload):
        payload = TopicAliasExpansionPayload.model_validate(payload)
    if not isinstance(market_scope, ConfirmedMarketScope):
        market_scope = ConfirmedMarketScope.model_validate(market_scope)
    if payload.seed_sha256 != seed.seed_sha256:
        raise ValueError("alias expansion seed_sha256 does not match topic seed")
    if tuple(market_scope.country_codes) != tuple(seed.confirmed_country_codes):
        raise ValueError("market_scope countries do not match topic seed")
    if canonical_topic_sha256(market_scope.model_dump(mode="json")) != (
        seed.confirmed_market_scope_sha256
    ):
        raise ValueError("market_scope fingerprint does not match topic seed")

    allowed_anchors = set(seed.exact_goal_anchors)
    allowed_countries = set(seed.confirmed_country_codes)
    geography = _geography_tokens(market_scope)
    trusted_rows: set[tuple[str, ...]] = set()
    if trusted_registry is not None:
        if not isinstance(trusted_registry, TrustedTopicAliasRegistry):
            trusted_registry = TrustedTopicAliasRegistry.model_validate(
                trusted_registry
            )
        trusted_rows = {
            (
                normalize_topic_phrase(entry.phrase),
                entry.country_code,
                entry.language_code,
                normalize_topic_phrase(entry.source_anchor),
                entry.relation.value,
                normalize_topic_phrase(entry.back_translation),
                entry.acceptance_basis.value,
            )
            for entry in trusted_registry.entries
        }
    rows: dict[tuple[str, str, str, str], ValidatedTopicAlias] = {}
    country_counts: dict[str, int] = {}
    for candidate in payload.aliases:
        phrase = _normalized_bounded_phrase(candidate.phrase, label="alias phrase")
        source_anchor = _normalized_bounded_phrase(
            candidate.source_anchor, label="alias source_anchor"
        )
        back_translation = _normalized_bounded_phrase(
            candidate.back_translation, label="alias back_translation"
        )
        if candidate.country_code not in allowed_countries:
            raise ValueError(
                f"alias country {candidate.country_code} is outside confirmed scope"
            )
        if source_anchor not in allowed_anchors:
            raise ValueError(
                "alias source_anchor is not an exact immutable goal anchor"
            )
        if back_translation != source_anchor:
            raise ValueError(
                "alias back_translation must normalize to its exact source_anchor"
            )
        if candidate.acceptance_basis != TopicAliasAcceptanceBasis.MODEL_PROPOSED:
            trusted_key = (
                phrase,
                candidate.country_code,
                candidate.language_code,
                source_anchor,
                candidate.relation.value,
                back_translation,
                candidate.acceptance_basis.value,
            )
            if trusted_key not in trusted_rows:
                raise ValueError(
                    "evidence-eligible alias is absent from the separately supplied "
                    "trusted registry"
                )
        _assert_topic_specific(
            phrase,
            geography_tokens=geography,
            label="alias phrase",
        )
        row = ValidatedTopicAlias(
            phrase=phrase,
            country_code=candidate.country_code,
            language_code=candidate.language_code,
            source_anchor=source_anchor,
            relation=candidate.relation,
            usage=candidate.usage,
            acceptance_basis=candidate.acceptance_basis,
            back_translation=back_translation,
        )
        key = (
            row.country_code,
            row.phrase,
            row.source_anchor,
            row.relation.value,
        )
        rows[key] = row

    ordered = tuple(rows[key] for key in sorted(rows))
    for row in ordered:
        country_counts[row.country_code] = country_counts.get(row.country_code, 0) + 1
        if country_counts[row.country_code] > MAX_ALIASES_PER_COUNTRY:
            raise ValueError(
                f"alias expansion exceeds {MAX_ALIASES_PER_COUNTRY} aliases for "
                f"{row.country_code}"
            )
    expansion_payload = {
        "schema_version": TOPIC_CONTRACT_SCHEMA_VERSION,
        "seed_sha256": seed.seed_sha256,
        "aliases": [row.model_dump(mode="json") for row in ordered],
        "trusted_registry_id": (
            trusted_registry.registry_id if trusted_registry is not None else None
        ),
        "trusted_registry_version": (
            trusted_registry.registry_version if trusted_registry is not None else None
        ),
        "trusted_registry_sha256": (
            trusted_registry.registry_sha256 if trusted_registry is not None else None
        ),
    }
    return ValidatedTopicAliasExpansion(
        **expansion_payload,
        expansion_sha256=canonical_topic_sha256(expansion_payload),
    )


def _bounded_visible_text(value: str, *, label: str) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{label} must be a string")
    value = unicodedata.normalize("NFKC", value).strip()
    if len(value) > MAX_VISIBLE_FIELD_CHARS:
        raise ValueError(f"{label} exceeds {MAX_VISIBLE_FIELD_CHARS} characters")
    return value


class VisibleStatisticalTableFields(BaseModel):
    """Only fields visibly attached to the statistical table may be matched.

    Extra keys are ignored on purpose: callers can pass a parsed table object,
    while hidden metadata, footers, scripts, URLs, and surrounding prose remain
    categorically unavailable to the matcher.
    """

    model_config = ConfigDict(extra="ignore", frozen=True)

    title: str = Field(default="", max_length=MAX_VISIBLE_FIELD_CHARS)
    caption: str = Field(default="", max_length=MAX_VISIBLE_FIELD_CHARS)
    series: tuple[str, ...] = Field(
        default=(), max_length=MAX_VISIBLE_SERIES_OR_DIMENSIONS
    )
    dimensions: tuple[str, ...] = Field(
        default=(), max_length=MAX_VISIBLE_SERIES_OR_DIMENSIONS
    )

    @field_validator("title", "caption")
    @classmethod
    def validate_scalar_visible_text(cls, value: str, info: Any) -> str:
        return _bounded_visible_text(value, label=info.field_name)

    @field_validator("series", "dimensions", mode="before")
    @classmethod
    def coerce_visible_sequence(cls, value: Any) -> Any:
        if value is None:
            return ()
        if isinstance(value, str):
            return (value,)
        if isinstance(value, Mapping):
            flattened: list[str] = []
            for key, child in value.items():
                flattened.extend((str(key), str(child)))
            return tuple(flattened)
        return tuple(value)

    @field_validator("series", "dimensions")
    @classmethod
    def validate_visible_sequence(
        cls, value: tuple[str, ...], info: Any
    ) -> tuple[str, ...]:
        return tuple(
            _bounded_visible_text(child, label=f"{info.field_name} item")
            for child in value
        )


def visible_statistical_table_fields(
    value: VisibleStatisticalTableFields | Mapping[str, Any],
) -> VisibleStatisticalTableFields:
    """Project an arbitrary parsed row onto the explicit visible-field allowlist."""

    if isinstance(value, VisibleStatisticalTableFields):
        return value
    if not isinstance(value, Mapping):
        raise TypeError("visible statistical table fields must be a mapping")
    # Do not merge or inspect arbitrary keys.  The aliases below are explicit
    # representations of title/caption/series/dimension visible in table UIs.
    title = value.get("title", value.get("table_title", ""))
    caption = value.get("caption", value.get("table_caption", ""))
    series = value.get(
        "series",
        value.get("series_label", value.get("series_name", ())),
    )
    dimensions = value.get("dimensions", value.get("dimension", ()))
    return VisibleStatisticalTableFields(
        title=title or "",
        caption=caption or "",
        series=series or (),
        dimensions=dimensions or (),
    )


def exact_topic_phrase_in_visible_text(text: str, phrase: str) -> bool:
    """Match a normalized phrase with exact Unicode word boundaries only."""

    normalized_text = normalize_topic_phrase(text)
    normalized_phrase = _normalized_bounded_phrase(phrase, label="match phrase")
    start = 0
    while True:
        index = normalized_text.find(normalized_phrase, start)
        if index < 0:
            return False
        end = index + len(normalized_phrase)
        left_ok = index == 0 or not _unicode_word_character(normalized_text[index - 1])
        right_ok = end == len(normalized_text) or not _unicode_word_character(
            normalized_text[end]
        )
        if left_ok and right_ok:
            return True
        start = index + 1


class TopicMatchRelation(str, Enum):
    EXACT_GOAL_ANCHOR = "exact_goal_anchor"
    SURFACE_FORM = TopicAliasRelation.SURFACE_FORM.value
    DIRECT_TRANSLATION = TopicAliasRelation.DIRECT_TRANSLATION.value


class TopicMatchResult(BaseModel):
    """Auditable deterministic result; a negative result carries no guessed topic."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    matched: bool
    country_code: str = Field(min_length=2, max_length=2)
    seed_sha256: str = Field(pattern=_SHA256_PATTERN)
    expansion_sha256: str | None = Field(default=None, pattern=_SHA256_PATTERN)
    diagnostic_code: Literal[
        "matched_visible_exact_topic",
        "no_visible_exact_topic_match",
    ]
    visible_field: Literal["title", "caption", "series", "dimension"] | None = None
    matched_phrase: str | None = Field(
        default=None, max_length=MAX_TOPIC_PHRASE_CHARS
    )
    source_anchor: str | None = Field(
        default=None, max_length=MAX_TOPIC_PHRASE_CHARS
    )
    relation: TopicMatchRelation | None = None

    @model_validator(mode="after")
    def keep_negative_results_empty(self) -> "TopicMatchResult":
        details = (
            self.visible_field,
            self.matched_phrase,
            self.source_anchor,
            self.relation,
        )
        if self.matched and any(value is None for value in details):
            raise ValueError("matched result requires complete visible match details")
        if not self.matched and any(value is not None for value in details):
            raise ValueError("unmatched result must not contain inferred match details")
        expected_diagnostic = (
            "matched_visible_exact_topic"
            if self.matched
            else "no_visible_exact_topic_match"
        )
        if self.diagnostic_code != expected_diagnostic:
            raise ValueError("diagnostic_code must agree with matched")
        return self


def _validated_country_for_seed(seed: TopicSeedContract, country_code: str) -> str:
    if not isinstance(country_code, str):
        raise TypeError("country_code must be a string")
    code = country_code.strip().upper()
    if code not in seed.confirmed_country_codes:
        raise ValueError(f"country {code!r} is outside the confirmed topic scope")
    return code


def match_visible_statistical_topic(
    seed: TopicSeedContract,
    fields: VisibleStatisticalTableFields | Mapping[str, Any],
    *,
    country_code: str,
    expansion: ValidatedTopicAliasExpansion | None = None,
) -> TopicMatchResult:
    """Evaluate official-stat topic relevance without probabilistic decisions."""

    if not isinstance(seed, TopicSeedContract):
        seed = TopicSeedContract.model_validate(seed)
    code = _validated_country_for_seed(seed, country_code)
    visible = visible_statistical_table_fields(fields)
    if expansion is not None:
        if not isinstance(expansion, ValidatedTopicAliasExpansion):
            expansion = ValidatedTopicAliasExpansion.model_validate(expansion)
        if expansion.seed_sha256 != seed.seed_sha256:
            raise ValueError("alias expansion is bound to a different topic seed")

    candidates: list[tuple[str, str, TopicMatchRelation]] = [
        (anchor, anchor, TopicMatchRelation.EXACT_GOAL_ANCHOR)
        for anchor in seed.exact_goal_anchors
    ]
    if expansion is not None:
        for alias in expansion.aliases:
            if alias.country_code != code or not alias.evidence_eligible:
                continue
            relation = (
                TopicMatchRelation.SURFACE_FORM
                if alias.relation == TopicAliasRelation.SURFACE_FORM
                else TopicMatchRelation.DIRECT_TRANSLATION
            )
            candidates.append((alias.phrase, alias.source_anchor, relation))
    # Longest first avoids a shorter valid anchor obscuring a more precise one.
    candidates.sort(key=lambda row: (-len(row[0]), row[0], row[1], row[2].value))

    visible_rows: list[tuple[str, str]] = [
        ("title", visible.title),
        ("caption", visible.caption),
        *(("series", value) for value in visible.series),
        *(("dimension", value) for value in visible.dimensions),
    ]
    for field_name, text in visible_rows:
        if not text:
            continue
        for phrase, source_anchor, relation in candidates:
            if exact_topic_phrase_in_visible_text(text, phrase):
                return TopicMatchResult(
                    matched=True,
                    country_code=code,
                    seed_sha256=seed.seed_sha256,
                    expansion_sha256=(
                        expansion.expansion_sha256 if expansion is not None else None
                    ),
                    diagnostic_code="matched_visible_exact_topic",
                    visible_field=field_name,
                    matched_phrase=phrase,
                    source_anchor=source_anchor,
                    relation=relation,
                )
    return TopicMatchResult(
        matched=False,
        country_code=code,
        seed_sha256=seed.seed_sha256,
        expansion_sha256=(
            expansion.expansion_sha256 if expansion is not None else None
        ),
        diagnostic_code="no_visible_exact_topic_match",
    )


def retrieval_phrases_for_country(
    seed: TopicSeedContract,
    *,
    country_code: str,
    expansion: ValidatedTopicAliasExpansion | None = None,
) -> tuple[str, ...]:
    """Return deterministic retrieval phrases, including broader synonyms."""

    if not isinstance(seed, TopicSeedContract):
        seed = TopicSeedContract.model_validate(seed)
    code = _validated_country_for_seed(seed, country_code)
    phrases = set(seed.exact_goal_anchors)
    if expansion is not None:
        if not isinstance(expansion, ValidatedTopicAliasExpansion):
            expansion = ValidatedTopicAliasExpansion.model_validate(expansion)
        if expansion.seed_sha256 != seed.seed_sha256:
            raise ValueError("alias expansion is bound to a different topic seed")
        phrases.update(
            alias.phrase for alias in expansion.aliases if alias.country_code == code
        )
    return tuple(sorted(phrases))


__all__ = [
    "ConfirmedMarketScope",
    "ImmutableGoalTopicFields",
    "MAX_ALIASES",
    "MAX_ALIASES_PER_COUNTRY",
    "MAX_GOAL_ANCHORS",
    "MAX_TOPIC_PHRASE_CHARS",
    "TOPIC_CONTRACT_SCHEMA_VERSION",
    "TopicAliasAcceptanceBasis",
    "TopicAliasCandidate",
    "TopicAliasExpansionPayload",
    "TopicAliasRelation",
    "TopicAliasUsage",
    "TopicMatchRelation",
    "TopicMatchResult",
    "TopicSeedContract",
    "TopicAnchorBinding",
    "TrustedTopicAliasEntry",
    "TrustedTopicAliasRegistry",
    "ValidatedTopicAlias",
    "ValidatedTopicAliasExpansion",
    "VisibleStatisticalTableFields",
    "build_topic_seed",
    "build_trusted_topic_alias_registry",
    "canonical_topic_sha256",
    "exact_topic_phrase_in_visible_text",
    "match_visible_statistical_topic",
    "normalize_topic_phrase",
    "retrieval_phrases_for_country",
    "validate_alias_expansion",
    "visible_statistical_table_fields",
]
