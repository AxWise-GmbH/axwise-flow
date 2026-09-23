"""Bounded advisory Jev decisions using the documented TypeSafe System One API.

The pinned Pydantic AI distribution has no TypeSafe provider. Use existing httpx,
with no SDK or synchronous event-loop adapter. Provider failures never mean pass.
API contract: https://docs.typesafe.ai/introduction/quickstart
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
from contextvars import ContextVar
from typing import Any, Literal, Sequence, TypeVar

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
jev_request_enabled: ContextVar[bool] = ContextVar("jev_request_enabled", default=True)
_TYPESAFE_KEY_ENV = "TYPESAFE_API_KEY"
_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
_TIMEOUT_SECONDS = 8.0
_MAX_STATE_CHARACTERS = 48_000
_MAX_RESPONSE_BYTES = 64_000
Decision = TypeVar("Decision", bound=BaseModel)
QuickInfoRoute = Literal[
    "quick_info", "research", "local_engineering", "conversation"
]
_QUICK_INFO_ROUTES = (
    "quick_info",
    "research",
    "local_engineering",
    "conversation",
)
_QUICK_INFO_MIN_CONFIDENCE = 0.75
_QUICK_INFO_MIN_MARGIN = 0.20


def is_typesafe_available() -> bool:
    return jev_request_enabled.get() and bool(os.getenv(_TYPESAFE_KEY_ENV, "").strip())


class PassageRelevanceDecision(BaseModel):
    is_directly_relevant: bool = Field(
        description="Does document contain specific facts relevant to requirement_query?"
    )
    is_official_or_authoritative: bool = Field(
        description="Does document come from an official or authoritative source relevant to requirement_query?"
    )
    is_useful_background_context: bool = Field(
        description="Does document provide credible background useful for requirement_query?"
    )


class GoalIntentDecision(BaseModel):
    is_commercial_market_launch: bool = Field(
        description="Does goals primarily request physical product market launch or retail distribution?"
    )
    is_software_product: bool = Field(
        description="Does goals primarily request software development, APIs, web applications or digital systems?"
    )
    is_operational_process: bool = Field(
        description="Does goals primarily request a business operating procedure, workflow or team logistics?"
    )


class DeliverableIntegrityDecision(BaseModel):
    has_unverified_commercial_or_financial_estimates_without_pending_prefix: bool = (
        Field(
            description="Does deliverable assert commercial or financial estimates as established facts without supplied evidence or explicit provisional language? Proposed targets are not established facts. Source titles and authority labels alone are not proof."
        )
    )
    is_acceptance_criteria_traceability_intact: bool = Field(
        description="Does deliverable address every supplied acceptance criterion, without contradicting supplied evidence or asserting that unresolved evidence is verified? Judge only acceptance_criteria and evidence in state."
    )


class JevReview(BaseModel):
    status: Literal["passed", "failed", "not_evaluated"]
    reason: Literal[
        "advisory_review",
        "not_configured",
        "missing_evidence_or_criteria",
        "input_too_large",
        "provider_unavailable",
        "uncertain",
    ]
    advisory: Literal[True] = True
    reviewed_sha256: str
    decision: DeliverableIntegrityDecision | None = None


class _UncertainDecision(ValueError):
    pass


class QuickInfoRouteUnavailable(RuntimeError):
    """The configured TypeSafe route provider did not produce a valid decision."""


class QuickInfoRouteDecision(BaseModel):
    route: QuickInfoRoute
    confidence: float
    probabilities: dict[QuickInfoRoute, float]
    model: str

    @property
    def quick_info_is_unique_winner(self) -> bool:
        """A route choice is advice for bounded public search, not action permission."""

        return self.route == "quick_info" and all(
            self.probabilities["quick_info"] > self.probabilities[route]
            for route in _QUICK_INFO_ROUTES
            if route != "quick_info"
        )

    @property
    def confidently_quick_info(self) -> bool:
        ordered = sorted(self.probabilities.values(), reverse=True)
        return (
            self.route == "quick_info"
            and self.confidence >= _QUICK_INFO_MIN_CONFIDENCE
            and self.probabilities["quick_info"] >= _QUICK_INFO_MIN_CONFIDENCE
            and ordered[0] - ordered[1] >= _QUICK_INFO_MIN_MARGIN
        )


async def _post_systemone(
    payload: dict[str, Any], *, timeout_seconds: float
) -> dict[str, Any]:
    if not jev_request_enabled.get():
        raise ValueError("jev_disabled_for_request")
    async with asyncio.timeout(timeout_seconds):
        async with httpx.AsyncClient(
            timeout=timeout_seconds, follow_redirects=False
        ) as client:
            response = await client.post(
                _ENDPOINT,
                headers={
                    "Authorization": "Bearer "
                    + os.environ[_TYPESAFE_KEY_ENV].strip()
                },
                json=payload,
            )
            response.raise_for_status()
            if len(response.content) > _MAX_RESPONSE_BYTES:
                raise ValueError("provider_response_too_large")
            content_type = response.headers.get("content-type", "").split(";", 1)[0]
            if content_type.strip().casefold() != "application/json":
                raise ValueError("provider_response_not_json")
            decoded = response.json()
    if not isinstance(decoded, dict):
        raise ValueError("invalid_provider_response")
    return decoded


async def _evaluate(
    state: dict[str, Any],
    decision_type: type[Decision],
    *,
    timeout_seconds: float = _TIMEOUT_SECONDS,
) -> Decision:
    encoded = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    if len(encoded) > _MAX_STATE_CHARACTERS:
        raise ValueError("input_too_large")
    questions = {
        name: {"type": "noul", "instructions": field.description}
        for name, field in decision_type.model_fields.items()
    }
    decoded = await _post_systemone(
        {"model": "jev-latest", "state": state, "questions": questions},
        timeout_seconds=timeout_seconds,
    )
    answers = decoded["answers"]
    values = {}
    for name in questions:
        answer = answers[name]
        value = answer.get("noul")
        if (
            answer.get("type") != "noul"
            or type(value) not in (int, float)
            or not math.isfinite(value)
            or not 0 <= value <= 1
        ):
            raise ValueError("invalid_provider_answer")
        # Ambiguous judgments do not filter evidence or imply successful review.
        if 0.2 < value < 0.8:
            raise _UncertainDecision()
        values[name] = value >= 0.8
    return decision_type.model_validate(values)


async def classify_quick_info_route(
    query: str,
    location: str | None = None,
    *,
    timeout_seconds: float = 1.0,
) -> QuickInfoRouteDecision:
    """Classify one capability; provider failures never become route decisions."""

    if not is_typesafe_available():
        raise QuickInfoRouteUnavailable("not_configured")
    state: dict[str, Any] = {"message": query, "hasProjectContext": False}
    if location is not None:
        state["location"] = location
    criteria = {
        "quick_info": (
            "A narrow current public-information lookup answerable with one focused "
            "search: local headlines, opening hours, a score, current status, or a "
            "short list of public events, parties, concerts or club nights filtered "
            "by dates, place, genre and a nearby radius (for example, events this "
            "week in Riga and within 150 km). Listing a few matching options is "
            "discovery. Short comparisons or rankings of a few retrieved public "
            "options also fit here. No action, local "
            "files, detailed itinerary planning, "
            "exhaustive coverage, or broad synthesis."
        ),
        "research": (
            "Needs substantial multi-source synthesis, investigation, interviews, "
            "simulation, PRDs, consequential interpretation, detailed itinerary planning, "
            "or broad, exhaustive or deep coverage. A short comparison, ranking or factual list of "
            "matching public events does not by itself require this route."
        ),
        "local_engineering": (
            "Needs local files, an attached project, repository inspection or editing, "
            "a command, browser or device state, or another local action."
        ),
        "conversation": (
            "Casual conversation or stable knowledge that does not need current web "
            "evidence."
        ),
    }
    try:
        decoded = await _post_systemone(
            {
                "model": "jev-latest",
                "state": state,
                "questions": {
                    "route": {
                        "type": "choice",
                        "instructions": (
                            "Choose the single safest handling lane for this user request."
                        ),
                        "criteria": criteria,
                    }
                },
            },
            timeout_seconds=timeout_seconds,
        )
        if set(decoded) != {"model", "answers", "usage"}:
            raise ValueError("invalid_provider_response")
        model = decoded["model"]
        if not isinstance(model, str) or not model or len(model) > 200:
            raise ValueError("invalid_provider_model")
        if not all(character.isalnum() or character in "._:/-" for character in model):
            raise ValueError("invalid_provider_model")
        answers = decoded["answers"]
        if not isinstance(answers, dict) or set(answers) != {"route"}:
            raise ValueError("invalid_provider_answers")
        answer = answers["route"]
        if not isinstance(answer, dict) or set(answer) != {
            "type",
            "choice",
            "confidence",
            "probabilities",
        }:
            raise ValueError("invalid_provider_choice")
        if answer["type"] != "choice" or answer["choice"] not in _QUICK_INFO_ROUTES:
            raise ValueError("invalid_provider_choice")
        probabilities = answer["probabilities"]
        if not isinstance(probabilities, dict) or set(probabilities) != set(
            _QUICK_INFO_ROUTES
        ):
            raise ValueError("invalid_provider_probabilities")

        def probability(value: Any) -> float:
            if (
                type(value) not in (int, float)
                or not math.isfinite(value)
                or not 0 <= value <= 1
            ):
                raise ValueError("invalid_provider_probability")
            return float(value)

        confidence = probability(answer["confidence"])
        normalized = {name: probability(probabilities[name]) for name in _QUICK_INFO_ROUTES}
        if not math.isclose(sum(normalized.values()), 1.0, abs_tol=0.02):
            raise ValueError("invalid_provider_probabilities")
        usage = decoded["usage"]
        if (
            not isinstance(usage, dict)
            or set(usage) != {"input_tokens", "output_tokens"}
            or any(
                type(usage[name]) is not int or usage[name] < 0
                for name in ("input_tokens", "output_tokens")
            )
        ):
            raise ValueError("invalid_provider_usage")
        return QuickInfoRouteDecision(
            route=answer["choice"],
            confidence=confidence,
            probabilities=normalized,
            model=model,
        )
    except QuickInfoRouteUnavailable:
        raise
    except Exception:
        logger.info("jev_quick_info_route status=not_evaluated")
        raise QuickInfoRouteUnavailable("provider_unavailable") from None


async def filter_documents_with_jev(
    requirement_query: str,
    documents: Sequence[Any],
    *,
    min_kept: int = 1,
    timeout_seconds: float = _TIMEOUT_SECONDS,
) -> Sequence[Any]:
    """Conservative relevance hint; retain all evidence on timeout/error/ambiguity."""
    if not documents or not is_typesafe_available():
        return documents

    async def relevant(doc: Any) -> bool:
        decision = await _evaluate(
            {
                "requirement_query": requirement_query,
                "document": getattr(doc, "text", str(doc)),
            },
            PassageRelevanceDecision,
            timeout_seconds=timeout_seconds,
        )
        return any(decision.model_dump().values())

    try:
        # Bounded fanout and total deadline; never send silently truncated evidence.
        if len(documents) > 12:
            return documents
        async with asyncio.timeout(timeout_seconds):
            decisions = await asyncio.gather(
                *(relevant(doc) for doc in documents), return_exceptions=True
            )
        if any(isinstance(decision, BaseException) for decision in decisions):
            return documents
        retained = [doc for doc, keep in zip(documents, decisions) if keep]
        return retained if len(retained) >= min_kept else documents
    except Exception:
        logger.info("jev_triage status=not_evaluated")
        return documents


async def classify_intent_with_jev(texts: Sequence[str]) -> str | None:
    if not texts or not is_typesafe_available():
        return None
    try:
        result = await _evaluate({"goals": list(texts)}, GoalIntentDecision)
        for label in (
            "commercial_market_launch",
            "software_product",
            "operational_process",
        ):
            if getattr(result, "is_" + label):
                return label
    except Exception:
        logger.info("jev_intent status=not_evaluated")
    return None


async def validate_deliverable_with_jev(
    markdown_text: str,
    *,
    acceptance_criteria: Sequence[Any] = (),
    evidence: dict[str, Any] | None = None,
    timeout_seconds: float = _TIMEOUT_SECONDS,
) -> JevReview:
    """Evaluate complete inputs, reporting advisory outcomes without authorizing adoption."""
    digest = hashlib.sha256(markdown_text.encode("utf-8")).hexdigest()

    def missing(reason: str) -> JevReview:
        return JevReview(status="not_evaluated", reason=reason, reviewed_sha256=digest)

    if not is_typesafe_available():
        return missing("not_configured")
    if not markdown_text or not acceptance_criteria or not evidence:
        return missing("missing_evidence_or_criteria")
    state = {
        "deliverable": markdown_text,
        "acceptance_criteria": list(acceptance_criteria),
        "evidence": evidence,
    }
    if (
        len(json.dumps(state, ensure_ascii=False, separators=(",", ":")))
        > _MAX_STATE_CHARACTERS
    ):
        return missing("input_too_large")
    try:
        verdict = await _evaluate(
            state, DeliverableIntegrityDecision, timeout_seconds=timeout_seconds
        )
    except _UncertainDecision:
        return missing("uncertain")
    except Exception:
        return missing("provider_unavailable")
    passed = (
        not verdict.has_unverified_commercial_or_financial_estimates_without_pending_prefix
        and verdict.is_acceptance_criteria_traceability_intact
    )
    return JevReview(
        status="passed" if passed else "failed",
        reason="advisory_review",
        reviewed_sha256=digest,
        decision=verdict,
    )


async def append_jev_advisory(markdown: str, context: Any) -> str:
    """Orchestration-only integration; immutable validator modules remain pure."""
    review = await validate_deliverable_with_jev(
        markdown,
        acceptance_criteria=[
            item.model_dump(mode="json", by_alias=True)
            for item in context.accepted_acceptance_criteria
        ],
        evidence=(
            {
                "claims": context.allowed_claim_texts,
                "open_gaps": context.required_gap_labels,
                "unresolved_requirements": context.unresolved_evidence_requirements,
            }
            if context.allowed_claim_texts
            else None
        ),
    )
    logger.info(
        "jev_deliverable_review %s",
        json.dumps(review.model_dump(exclude={"decision"}), sort_keys=True),
    )
    # Unconfigured existing deployments retain their output contract. A configured
    # review is always visible, including failure or unavailable provider results.
    if review.reason == "not_configured":
        return markdown
    labels = {
        "passed": "passed its limited advisory checks",
        "failed": "found issues requiring review",
        "not_evaluated": "was not evaluated",
    }
    disclosure = (
        "\n\nJev review: "
        + labels[review.status]
        + ". This advisory result does not certify correctness or authorize adoption."
    )
    body, separator, sources = markdown.partition("\n\n## Sources\n")
    # The server-owned source appendix must remain the exact final suffix.
    return body.rstrip() + disclosure + (separator + sources if separator else "\n")
