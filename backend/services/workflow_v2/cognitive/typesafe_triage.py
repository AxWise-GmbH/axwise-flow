"""TypeSafe AI (Jev) accelerated triage and classification service.

Provides high-speed (sub-second) typed boolean and categorical classification
for evidence filtering (Gate A) and Phase 1 goal intent classification, with
deterministic fallback when TYPESAFE_API_KEY is unconfigured.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Sequence
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_TYPESAFE_KEY_ENV = "TYPESAFE_API_KEY"


def is_typesafe_available() -> bool:
    """Return True if TypeSafe Jev API key is present in environment."""
    key = os.getenv(_TYPESAFE_KEY_ENV)
    return bool(key and key.strip())


class PassageRelevanceDecision(BaseModel):
    """Jev typed decision model for Gate A evidence triage."""
    is_directly_relevant: bool = Field(
        description="Does this document or passage contain specific facts, data, rules, or answers relevant to the requirement query?"
    )
    is_official_or_authoritative: bool = Field(
        description="Does this passage represent statutory law, official government guidance, regulatory agency, standards body, or industry authority?"
    )
    is_useful_background_context: bool = Field(
        description="Does this passage provide credible commercial, technical, legal, or market context helpful for answering the requirement?"
    )


class GoalIntentDecision(BaseModel):
    """Jev typed decision model for Phase 1 goal classification."""
    is_commercial_market_launch: bool = Field(
        description="Is this goal focused on commercial market launch, retail distribution, FMCG, or physical product entry?"
    )
    is_software_product: bool = Field(
        description="Is this goal focused on software development, APIs, web apps, databases, or digital cloud systems?"
    )
    is_operational_process: bool = Field(
        description="Is this goal focused on business operations, standard operating procedures (SOP), workflow execution, or team logistics?"
    )


def filter_documents_with_jev(
    requirement_query: str,
    documents: Sequence[Any],
    *,
    min_kept: int = 1,
) -> Sequence[Any]:
    """Gate A: Filter fetched documents using TypeSafe Jev sub-second triage.

    If Jev is unavailable or fails, returns the original sequence safely.
    Guarantees at least min_kept documents are retained so extraction never stalls.
    """
    if not documents or not is_typesafe_available():
        return documents

    try:
        from pydantic_ai import Agent
        from pydantic_ai.models.typesafe import TypeSafeModel

        model = TypeSafeModel("jev-latest")
        agent = Agent(model, output_type=PassageRelevanceDecision)

        retained = []
        for doc in documents:
            text_snippet = getattr(doc, "text", str(doc))[:2500]
            prompt = f"Requirement: {requirement_query}\n\nDocument Excerpt:\n{text_snippet}"
            try:
                result = agent.run_sync(prompt)
                if (
                    result.output.is_directly_relevant
                    or result.output.is_official_or_authoritative
                    or result.output.is_useful_background_context
                ):
                    retained.append(doc)
            except Exception as e:
                logger.debug("TypeSafe Jev document evaluation deferred: %s", e)
                retained.append(doc)

        if len(retained) >= min_kept:
            logger.info("TypeSafe Jev Gate A: retained %d of %d documents", len(retained), len(documents))
            return retained
        return documents

    except Exception as e:
        logger.debug("TypeSafe Jev triage unavailable, falling back: %s", e)
        return documents


def classify_intent_with_jev(texts: Sequence[str]) -> str | None:
    """Phase 1: Classify goal document intent using TypeSafe Jev."""
    if not texts or not is_typesafe_available():
        return None

    try:
        from pydantic_ai import Agent
        from pydantic_ai.models.typesafe import TypeSafeModel

        combined_text = " ".join(texts)[:3000]
        model = TypeSafeModel("jev-latest")
        agent = Agent(model, output_type=GoalIntentDecision)

        result = agent.run_sync(combined_text)
        if result.output.is_commercial_market_launch:
            return "commercial_market_launch"
        if result.output.is_software_product:
            return "software_product"
        if result.output.is_operational_process:
            return "operational_process"
        return None

    except Exception as e:
        logger.debug("TypeSafe Jev intent classification deferred: %s", e)
        return None


class DeliverableIntegrityDecision(BaseModel):
    """Jev typed decision model for Gate B pre-adoption deliverable validation."""
    has_unverified_commercial_or_financial_estimates_without_pending_prefix: bool = Field(
        description="Does this draft text assert speculative commercial estimates, unverified retail slotting fees, margins, or projected unit costs without prefixing them with '**Pending verification:** ' or equivalent provisional language? (Note: Established statutory laws, official regulations, and accredited laboratory standards cited from authoritative sources are verified facts and do NOT require a pending prefix)."
    )
    is_acceptance_criteria_traceability_intact: bool = Field(
        description="Does this document satisfy the core acceptance criteria matrix without skipping requirements?"
    )


def validate_deliverable_with_jev(markdown_text: str) -> DeliverableIntegrityDecision | None:
    """Gate B: Validate deliverable integrity using TypeSafe Jev."""
    if not markdown_text or not is_typesafe_available():
        return None

    try:
        from pydantic_ai import Agent
        from pydantic_ai.models.typesafe import TypeSafeModel

        # Extract executive summary and financial/projections section for focused Jev evaluation
        snippet = markdown_text[:3500]
        prompt = (
            "Review this deliverable excerpt for compliance with the Gate B integrity rules:\n"
            "1. Authoritative statutory regulations, laws, and official lab standards are verified evidence and should NOT be penalized.\n"
            "2. Speculative business forecasts, retail pricing/margin assumptions, and unconfirmed commercial slotting costs MUST carry a '**Pending verification:** ' prefix.\n\n"
            f"Deliverable:\n{snippet}"
        )
        model = TypeSafeModel("jev-latest")
        agent = Agent(model, output_type=DeliverableIntegrityDecision)

        result = agent.run_sync(prompt)
        return result.output
    except Exception as e:
        logger.debug("TypeSafe Jev Gate B validation deferred: %s", e)
        return None
