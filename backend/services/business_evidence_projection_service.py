"""Registry-driven projection of authority-owned business evidence.

Projection is deliberately dormant unless an economic model is explicitly
enabled.  The first rollout adapter supports only physical-product offers that
already crossed the strict primary-market quality boundary.  It never selects
an adapter from an industry/category string and never reads claim prose.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional
from urllib.parse import urlparse

from backend.domain.orchestration.models import (
    BusinessEvidenceProfileV1,
    CriticalClaimPolicyV1,
)
from backend.services.business_evidence_contract_service import (
    MoneyV1,
    PhysicalProductOfferPayloadV1,
    canonical_contract_hash,
)
from backend.services.research_quality_service import (
    canonical_observed_pack_tokens,
    signed_offer_identity_surface,
)
from backend.services.research_source_authority_service import (
    validate_authority_claim_artifact,
    validate_physical_product_fact_authorization,
    validated_direct_primary_market_offers,
)


PROJECTION_ALLOWLIST_ENV = "AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS"
PHYSICAL_PRODUCT_MODEL = "physical_product"
_SUPPORTED_PROJECTION_MODELS = frozenset({PHYSICAL_PRODUCT_MODEL})
_VERIFIED_STATUS = "verified_current_authoritative"
_STATUTORY_CURRENT = "statutory_current"
_OFFICIAL_STATISTIC = "official_statistic"
_OBSERVED_PRIMARY_MARKET = "observed_primary_market"
_CRITICAL_CLAIM_CLASS_ORDER = (
    _STATUTORY_CURRENT,
    _OFFICIAL_STATISTIC,
    _OBSERVED_PRIMARY_MARKET,
)
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_COUNTRY = re.compile(r"^[A-Z]{2}$")
_SIGNED_OFFER_SCOPE = re.compile(
    r"^catalog:signed_offer:([a-f0-9]{16}):per_item:([a-z]{3})$"
)
_PACK = re.compile(
    r"^(\d+(?:\.\d+)?)(kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)$"
)
_PACK_UNITS = {
    "kg": "kilogram",
    "g": "gram",
    "l": "liter",
    "ml": "milliliter",
    "pc": "item",
    "pcs": "item",
    "unit": "item",
    "units": "item",
    "pack": "package",
}


def configured_business_evidence_projection_models(
    raw_value: Optional[str] = None,
) -> frozenset[str]:
    """Return the explicit economic-model projection allowlist.

    The default is intentionally empty.  Unknown values fail closed so a typo
    cannot look like a successful rollout.
    """

    configured = (
        os.getenv(PROJECTION_ALLOWLIST_ENV, "")
        if raw_value is None
        else raw_value
    )
    if configured == "":
        return frozenset()
    raw_values = configured.split(",")
    if any(
        not item
        or item != item.strip()
        or re.fullmatch(r"[a-z][a-z0-9_]*", item) is None
        for item in raw_values
    ):
        raise ValueError(
            "business evidence projection allowlist must be a strict "
            "comma-separated model list"
        )
    if len(raw_values) != len(set(raw_values)):
        raise ValueError(
            "business evidence projection allowlist must not contain duplicates"
        )
    values = raw_values
    unknown = sorted(set(values) - _SUPPORTED_PROJECTION_MODELS)
    if unknown:
        raise ValueError(
            "unsupported business evidence projection model(s): "
            + ", ".join(unknown)
        )
    return frozenset(values)


def business_evidence_projection_enabled(
    economic_model: str,
    *,
    enabled_models: Optional[Iterable[str]] = None,
) -> bool:
    models = (
        configured_business_evidence_projection_models()
        if enabled_models is None
        else configured_business_evidence_projection_models(
            ",".join(str(item) for item in enabled_models)
        )
    )
    return economic_model in models


def require_enabled_business_evidence_projection(
    profile: BusinessEvidenceProfileV1,
) -> None:
    """Fail before work starts when a requested runtime adapter is dormant."""

    if profile.economic_model == "none":
        return
    enabled = configured_business_evidence_projection_models()
    if profile.economic_model not in enabled:
        raise ValueError(
            f"business evidence projection model {profile.economic_model} is not enabled"
        )
    validate_business_evidence_projection_profile(profile)


def validate_business_evidence_projection_profile(
    profile: BusinessEvidenceProfileV1,
) -> None:
    """Restrict live rollout to requirement shapes the active adapter can honor."""

    if profile.economic_model == "none":
        return
    if profile.economic_model != PHYSICAL_PRODUCT_MODEL:
        raise ValueError(
            f"business evidence projection model {profile.economic_model} has no live adapter"
        )
    if len(profile.fact_requirements) != 1:
        raise ValueError(
            "physical product projection requires one required physical_product_offer requirement"
        )
    fact_requirement = profile.fact_requirements[0]
    if (
        fact_requirement.kind != "physical_product_offer"
        or fact_requirement.applicability != "required"
        or fact_requirement.minimum_verified < 1
    ):
        raise ValueError(
            "physical product projection requires at least one required verified offer"
        )
    if len(profile.calculation_requirements) > 1:
        raise ValueError(
            "physical product projection supports at most one price-difference calculation"
        )
    if not profile.calculation_requirements:
        return
    calculation_requirement = profile.calculation_requirements[0]
    if (
        calculation_requirement.kind != "physical_offer_price_difference"
        or calculation_requirement.applicability != "required"
        or calculation_requirement.minimum_verified != 1
    ):
        raise ValueError(
            "physical product projection requires a required price-difference calculation"
        )
    if fact_requirement.minimum_verified < 2:
        raise ValueError(
            "physical product price differences require at least two verified offers"
        )


def required_business_evidence_claim_classes(
    profile: BusinessEvidenceProfileV1,
) -> tuple[str, ...]:
    """Return the minimum critical-claim set implied by a reviewed profile.

    Typed commercial offer requirements supplement the established commercial
    research boundary; they never replace statutory or official-statistic
    verification.  Noncommercial physical-product work retains the narrower
    observed-offer requirement.
    """

    if profile.economic_model == "none":
        return ()
    if profile.economic_model != PHYSICAL_PRODUCT_MODEL:
        return ()
    if profile.intent == "commercial_market_launch":
        return _CRITICAL_CLAIM_CLASS_ORDER
    return (_OBSERVED_PRIMARY_MARKET,)


def effective_business_evidence_claim_policy(
    profile: BusinessEvidenceProfileV1,
    current_policy: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Derive adapter-owned acquisition requirements without category inference."""

    require_enabled_business_evidence_projection(profile)
    if profile.economic_model == "none":
        return dict(current_policy or {})
    parsed = CriticalClaimPolicyV1.model_validate(current_policy or {})
    mandatory_set = set(parsed.mandatory_claim_classes)
    mandatory_set.update(required_business_evidence_claim_classes(profile))
    mandatory = [
        evidence_class
        for evidence_class in _CRITICAL_CLAIM_CLASS_ORDER
        if evidence_class in mandatory_set
    ]
    freshness_by_class = dict(parsed.freshness_by_class)
    freshness_by_class[_OBSERVED_PRIMARY_MARKET] = min(
        int(freshness_by_class.get(_OBSERVED_PRIMARY_MARKET, 120)),
        120,
    )
    return parsed.model_copy(
        update={
            "required": True,
            "fail_closed": True,
            "mandatory_claim_classes": mandatory,
            "freshness_by_class": freshness_by_class,
        }
    ).model_dump(mode="json")


def _semantic_instant(value: Any, *, field: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field} must be an RFC3339 instant")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be an RFC3339 instant") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include an RFC3339 offset")
    return parsed.astimezone(timezone.utc)


def _exact_string_list(
    value: Any,
    *,
    field: str,
    pattern: Optional[re.Pattern[str]] = None,
    singleton: bool = False,
) -> List[str]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{field} must be a non-empty list")
    result = [item for item in value if isinstance(item, str) and item]
    if len(result) != len(value) or len(result) != len(set(result)):
        raise ValueError(f"{field} must contain unique non-empty strings")
    if singleton and len(result) != 1:
        raise ValueError(f"{field} must contain exactly one value")
    if pattern is not None and any(pattern.fullmatch(item) is None for item in result):
        raise ValueError(f"{field} contains an invalid value")
    return result


def _canonical_physical_pack(fact: Mapping[str, Any]) -> Dict[str, str]:
    tokens = canonical_observed_pack_tokens(fact)
    if len(tokens) != 1:
        raise ValueError("physical product evidence requires exactly one canonical pack")
    match = _PACK.fullmatch(tokens[0])
    if match is None or match.group(2) not in _PACK_UNITS:
        raise ValueError("physical product pack unit has no exact v1 projection")
    quantity = MoneyV1(
        amount=match.group(1),
        currency="XXX",
        tax_basis="unknown",
    ).amount
    if quantity == "0":
        raise ValueError("physical product pack quantity must be positive")
    return {"quantity": quantity, "unit": _PACK_UNITS[match.group(2)]}


def physical_product_comparison_scope_hash(
    profile: BusinessEvidenceProfileV1,
    *,
    topic_seed_sha256: str,
    country_codes: List[str],
    currency: str,
) -> str:
    """Seal the exact model-neutral comparability dimensions for one offer."""

    if profile.economic_model != PHYSICAL_PRODUCT_MODEL:
        raise ValueError("physical comparison scope requires a physical profile")
    if profile.market_scope_hash is None:
        raise ValueError("physical comparison scope requires market_scope_hash")
    if _SHA256.fullmatch(topic_seed_sha256) is None:
        raise ValueError("physical comparison scope requires topic_seed_sha256")
    _exact_string_list(
        country_codes,
        field="physical comparison country_codes",
        pattern=_COUNTRY,
        singleton=True,
    )
    if re.fullmatch(r"[A-Z]{3}", currency) is None:
        raise ValueError("physical comparison scope requires uppercase currency")
    return canonical_contract_hash(
        {
            "version": "physical_product_comparison_scope_v1",
            "market_scope_hash": profile.market_scope_hash,
            "topic_seed_sha256": topic_seed_sha256,
            "country_codes": country_codes,
            "currency": currency,
            "tax_basis": "unknown",
            "basis": {"quantity": "1", "unit": "package"},
        }
    )


def _offer_identity_hash(offer: Mapping[str, Any]) -> str:
    return canonical_contract_hash(
        {
            "product_id": offer.get("product_id") or "",
            "product_name": offer.get("product_name") or "",
        }
    )[:16]


def _source_index(grounding: Mapping[str, Any]) -> Dict[str, Mapping[str, Any]]:
    rows = grounding.get("market_sources") or []
    if not isinstance(rows, list):
        raise ValueError("market_sources must be a list")
    result: Dict[str, Mapping[str, Any]] = {}
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        source_id = str(row.get("source_id") or "")
        if not source_id:
            continue
        if source_id in result:
            raise ValueError("market source ownership must be unique")
        result[source_id] = row
    return result


def _market_claim_index(
    grounding: Mapping[str, Any],
) -> Dict[str, Mapping[str, Any]]:
    rows = grounding.get("market_claims") or []
    if not isinstance(rows, list):
        raise ValueError("market_claims must be a list")
    result: Dict[str, Mapping[str, Any]] = {}
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        claim_id = str(row.get("claim_id") or "")
        if not claim_id:
            continue
        if claim_id in result:
            raise ValueError("market claim ownership must be unique")
        result[claim_id] = row
    return result


def _published_authority_document_matches(
    source: Mapping[str, Any], proof: Mapping[str, Any]
) -> bool:
    document = source.get("authority_document")
    direct = proof.get("direct")
    if not isinstance(document, Mapping) or not isinstance(direct, Mapping):
        return False
    return bool(
        document.get("artifact_type") == "direct_authority_document"
        and document.get("source_id") == source.get("source_id")
        and document.get("authority_proof_signature")
        == proof.get("proof_signature")
        and document.get("sha256") == direct.get("content_sha256")
        and document.get("retrieved_at") == proof.get("retrieved_at")
        and "text" not in document
    )


def _owned_primary_market_source(
    row: Mapping[str, Any],
    *,
    source_index: Mapping[str, Mapping[str, Any]],
    source_ids: List[str],
    country_codes: List[str],
    observed_instant: datetime,
) -> tuple[Mapping[str, Any], List[Dict[str, Any]], str]:
    summaries = row.get("sources")
    if not isinstance(summaries, list) or len(summaries) != 1:
        raise ValueError("physical offer requires one verified ledger source summary")
    summary = summaries[0]
    if not isinstance(summary, Mapping) or summary.get("source_id") != source_ids[0]:
        raise ValueError("physical offer source summary conflicts with ledger ownership")
    source = source_index.get(source_ids[0])
    if not isinstance(source, Mapping):
        raise ValueError("physical offer source is missing from market_sources")
    if source.get("source_id") != source_ids[0]:
        raise ValueError("physical offer source_id conflicts with ledger ownership")
    if source.get("source_authority") != "first_party_catalog":
        raise ValueError("physical offer source must be first_party_catalog")
    if source.get("country_codes") != country_codes:
        raise ValueError("physical offer source country ownership does not match ledger")
    source_url = source.get("url")
    if not isinstance(source_url, str) or summary.get("url") != source_url:
        raise ValueError("physical offer source URL does not match ledger summary")
    if summary.get("publisher") != source.get("publisher"):
        raise ValueError("physical offer publisher does not match ledger summary")
    if summary.get("source_authority") != source.get("source_authority"):
        raise ValueError("physical offer authority does not match ledger summary")
    source_retrieved = _semantic_instant(
        source.get("retrieved_at"), field="physical offer source retrieved_at"
    )
    summary_retrieved = _semantic_instant(
        summary.get("retrieved_at"), field="physical offer summary retrieved_at"
    )
    if source_retrieved != observed_instant or summary_retrieved != observed_instant:
        raise ValueError("physical offer source time does not match ledger observation")

    proof = source.get("authority_proof")
    if not isinstance(proof, Mapping):
        raise ValueError("physical offer source requires an authority proof")
    if (
        proof.get("proof_type") != "direct_primary_market_observation"
        or proof.get("source_authority") != "first_party_catalog"
        or proof.get("country_codes") != country_codes
        or _semantic_instant(
            proof.get("retrieved_at"), field="physical offer proof retrieved_at"
        )
        != observed_instant
    ):
        raise ValueError("physical offer proof conflicts with ledger ownership")
    direct = proof.get("direct")
    parsed = urlparse(source_url)
    host = str(parsed.hostname or "").casefold()
    if (
        not isinstance(direct, Mapping)
        or direct.get("final_url") != source_url
        or direct.get("final_host") != host
        or not host
    ):
        raise ValueError("physical offer proof does not own the market source URL")
    proof_signature = proof.get("proof_signature")
    if (
        not isinstance(proof_signature, str)
        or _SHA256.fullmatch(proof_signature) is None
        or summary.get("authority_proof_signature") != proof_signature
    ):
        raise ValueError("physical offer proof signature does not match ledger summary")
    private_document = source.get("_authority_document_artifact")
    if not isinstance(private_document, Mapping):
        private_document = source.get("authority_document_artifact")
    private_raw_html = source.get("_structured_evidence_html")
    has_private_document = isinstance(private_document, Mapping)
    has_private_raw = isinstance(private_raw_html, str)
    if has_private_document != has_private_raw:
        raise ValueError("physical offer source has an incomplete private raw binding")
    if not has_private_document and not _published_authority_document_matches(
        source, proof
    ):
        raise ValueError(
            "scrubbed physical offer requires published authority document metadata"
        )
    if source.get("authority_document") is not None and not (
        _published_authority_document_matches(source, proof)
    ):
        raise ValueError("physical offer authority document metadata is invalid")
    offers = validated_direct_primary_market_offers(
        source,
        requested_country_codes=country_codes,
        allow_scrubbed_primary_market=True,
    )
    if not offers:
        raise ValueError("physical offer source proof failed authority validation")
    return source, offers, host


def _owned_market_claim_signature(
    *,
    claim: Mapping[str, Any],
    row_claim_id: str,
    source: Mapping[str, Any],
    source_ids: List[str],
    country_codes: List[str],
    observed_instant: datetime,
) -> str:
    if (
        claim.get("claim_id") != row_claim_id
        or claim.get("critical") is not True
        or claim.get("evidence_class") != _OBSERVED_PRIMARY_MARKET
        or claim.get("source_ids") != source_ids
        or claim.get("country_codes") != country_codes
        or _semantic_instant(
            claim.get("observed_at"), field="physical offer market claim observed_at"
        )
        != observed_instant
    ):
        raise ValueError("physical offer market claim conflicts with ledger ownership")
    citation = claim.get("citation_metadata")
    artifact = claim.get("provenance_artifact")
    if not isinstance(citation, Mapping) or not isinstance(artifact, Mapping):
        raise ValueError("physical offer market claim requires signed provenance")
    start = citation.get("segment_start")
    end = citation.get("segment_end")
    artifact_text = artifact.get("text")
    if (
        not isinstance(start, int)
        or isinstance(start, bool)
        or not isinstance(end, int)
        or isinstance(end, bool)
        or not isinstance(artifact_text, str)
        or not 0 <= start < end <= len(artifact_text)
    ):
        raise ValueError("physical offer market claim span is invalid")
    # Cryptographically validate the exact published span. Its prose is never
    # consulted to select an adapter, product, amount, currency, or pack.
    signed_span = artifact_text[start:end]
    if not validate_authority_claim_artifact(
        source,
        artifact,
        citation,
        signed_span,
    ):
        raise ValueError("physical offer market claim provenance is invalid")
    binding = artifact.get("claim_binding")
    signature = (
        binding.get("claim_proof_signature")
        if isinstance(binding, Mapping)
        else None
    )
    if not isinstance(signature, str) or _SHA256.fullmatch(signature) is None:
        raise ValueError("physical offer market claim signature is invalid")
    return signature


def _matching_signed_offer(
    fact: Mapping[str, Any], offers: List[Dict[str, Any]]
) -> tuple[Dict[str, Any], str, str]:
    unit = fact.get("unit")
    if not isinstance(unit, str) or re.fullmatch(r"[a-z]{3}", unit) is None:
        raise ValueError("physical offer fact requires a lowercase currency unit")
    normalized = fact.get("normalized_value")
    if not isinstance(normalized, str):
        raise ValueError("physical offer fact requires a canonical normalized_value")
    amount, separator, normalized_unit = normalized.partition(":")
    if separator != ":" or ":" in normalized_unit or normalized_unit != unit:
        raise ValueError("physical offer normalized_value currency is inconsistent")
    canonical_amount = MoneyV1(
        amount=amount,
        currency=unit.upper(),
        tax_basis="unknown",
    ).amount
    if canonical_amount == "0":
        raise ValueError("physical offer price must be positive")
    if normalized != f"{canonical_amount}:{unit}":
        raise ValueError("physical offer normalized_value is not canonical")
    if fact.get("metric_key") != f"price:{unit}":
        raise ValueError("physical offer metric_key is not a signed price")
    scope = fact.get("semantic_scope")
    scope_match = (
        _SIGNED_OFFER_SCOPE.fullmatch(scope) if isinstance(scope, str) else None
    )
    if scope_match is None or scope_match.group(2) != unit:
        raise ValueError("physical offer price must use the exact per_item scope")
    signed_name = fact.get("signed_offer_product_name")
    if not isinstance(signed_name, str) or signed_name != " ".join(signed_name.split()):
        raise ValueError("physical offer fact requires an exact signed offer name")

    matches: List[Dict[str, Any]] = []
    for offer in offers:
        offer_name = " ".join(str(offer.get("product_name") or "").split())
        offer_price = str(offer.get("price") or "")
        offer_currency = str(offer.get("price_currency") or "")
        try:
            canonical_offer_price = MoneyV1(
                amount=offer_price,
                currency=offer_currency,
                tax_basis="unknown",
            ).amount
        except ValueError:
            continue
        if (
            offer_name == signed_name
            and canonical_offer_price == canonical_amount
            and offer_currency == unit.upper()
            and _offer_identity_hash(offer) == scope_match.group(1)
        ):
            matches.append(offer)
    if len(matches) != 1:
        raise ValueError("physical offer fact must bind exactly one signed Product/Offer")
    return matches[0], canonical_amount, unit.upper()


def _business_evidence_attempt(fact: Mapping[str, Any]) -> bool:
    if fact.get("business_evidence") is not None:
        return True
    semantic_scope = fact.get("semantic_scope")
    metric_key = fact.get("metric_key")
    return bool(
        isinstance(semantic_scope, str)
        and semantic_scope.startswith("catalog:signed_offer:")
        or isinstance(metric_key, str)
        and metric_key.startswith("price:")
        and fact.get("signed_offer_product_name") is not None
    )


def _validate_supplied_projection(
    supplied: Any, derived: Mapping[str, Any]
) -> None:
    if supplied is None:
        return
    if not isinstance(supplied, Mapping):
        raise ValueError("hand-authored business_evidence must be a typed object")
    required = {"kind", "comparison_scope_hash", "payload"}
    if not required.issubset(supplied):
        raise ValueError("hand-authored physical evidence is incomplete")
    normalized = dict(supplied)
    normalized["payload"] = PhysicalProductOfferPayloadV1.model_validate(
        supplied.get("payload")
    ).model_dump(mode="json")
    for key, value in normalized.items():
        if key not in derived:
            raise ValueError("hand-authored physical evidence contains unknown fields")
        if key == "observed_at":
            matches = _semantic_instant(
                value, field="hand-authored physical observed_at"
            ) == _semantic_instant(
                derived[key], field="derived physical observed_at"
            )
        else:
            matches = value == derived[key]
        if not matches:
            raise ValueError(
                "hand-authored physical evidence conflicts with authority projection"
            )


def _project_physical_product_offers(
    grounding: Mapping[str, Any], profile: BusinessEvidenceProfileV1
) -> List[Dict[str, Any]]:
    if grounding.get("business_evidence") is not None:
        raise ValueError("physical evidence must be owned by the verified ledger")
    critical = grounding.get("critical_claim_quality")
    if not isinstance(critical, Mapping) or critical.get("status") != "passed":
        raise ValueError("physical projection requires a passed critical quality gate")
    topic_seed_sha256 = critical.get("topic_seed_sha256")
    if not isinstance(topic_seed_sha256, str) or _SHA256.fullmatch(
        topic_seed_sha256
    ) is None:
        raise ValueError("physical projection requires an exact topic seed hash")
    ledger = critical.get("evidence_ledger")
    if not isinstance(ledger, list):
        raise ValueError("physical projection requires an evidence ledger")
    sources = _source_index(grounding)
    claims = _market_claim_index(grounding)
    projected: List[Dict[str, Any]] = []
    by_owner: Dict[tuple[str, str], Dict[str, Any]] = {}

    for row in ledger:
        if not isinstance(row, Mapping):
            continue
        row_facts = row.get("facts") or []
        if not isinstance(row_facts, list):
            raise ValueError("physical projection ledger facts must be a list")
        attempts = [
            fact
            for fact in row_facts
            if isinstance(fact, Mapping) and _business_evidence_attempt(fact)
        ]
        if not attempts:
            continue
        if (
            row.get("status") != _VERIFIED_STATUS
            or row.get("evidence_class") != _OBSERVED_PRIMARY_MARKET
        ):
            raise ValueError(
                "physical projection accepts only verified observed-primary-market rows"
            )
        row_claim_id = row.get("claim_id")
        if not isinstance(row_claim_id, str) or not row_claim_id:
            raise ValueError("physical projection row requires claim_id ownership")
        source_ids = _exact_string_list(
            row.get("source_ids"),
            field="physical projection source_ids",
            singleton=True,
        )
        country_codes = _exact_string_list(
            row.get("country_codes"),
            field="physical projection country_codes",
            pattern=_COUNTRY,
            singleton=True,
        )
        observed_at = row.get("effective_or_observation_at")
        observed_instant = _semantic_instant(
            observed_at, field="physical projection observed_at"
        )
        source, offers, merchant_domain = _owned_primary_market_source(
            row,
            source_index=sources,
            source_ids=source_ids,
            country_codes=country_codes,
            observed_instant=observed_instant,
        )
        claim = claims.get(row_claim_id)
        if not isinstance(claim, Mapping):
            raise ValueError("physical projection row is absent from market_claims")
        authority_claim_signature = _owned_market_claim_signature(
            claim=claim,
            row_claim_id=row_claim_id,
            source=source,
            source_ids=source_ids,
            country_codes=country_codes,
            observed_instant=observed_instant,
        )

        for fact in attempts:
            if (
                fact.get("identity_complete") is not True
                or fact.get("evidence_class") != _OBSERVED_PRIMARY_MARKET
            ):
                raise ValueError(
                    "physical projection requires an identity-complete observed fact"
                )
            fact_id = fact.get("fact_id")
            if not isinstance(fact_id, str) or not fact_id:
                raise ValueError("physical projection fact requires fact_id")
            if fact.get("claim_id") != row_claim_id:
                raise ValueError("physical projection claim ownership is inconsistent")
            owner = (row_claim_id, fact_id)
            if owner in by_owner:
                raise ValueError("physical projection fact ownership must be unique")
            if fact.get("source_scope") != source_ids:
                raise ValueError("physical projection source ownership is inconsistent")
            if fact.get("country_codes") != country_codes:
                raise ValueError("physical projection country ownership is inconsistent")
            if _semantic_instant(
                fact.get("temporal_scope"),
                field="physical projection fact temporal_scope",
            ) != observed_instant:
                raise ValueError("physical projection time ownership is inconsistent")
            if fact.get("topic_seed_sha256") != topic_seed_sha256:
                raise ValueError("physical projection topic ownership is inconsistent")

            pack = _canonical_physical_pack(fact)
            canonical_pack = canonical_observed_pack_tokens(fact)[0]
            if signed_offer_identity_surface(
                fact, canonical_pack=canonical_pack
            ) is None:
                raise ValueError("physical projection signed product identity is invalid")
            offer, amount, currency = _matching_signed_offer(fact, offers)
            signed_offer_sha256 = str(offer.get("sha256") or "")
            if fact.get("signed_offer_sha256") != signed_offer_sha256:
                raise ValueError("physical projection fact does not own its signed offer")
            authorization = fact.get(
                "_physical_product_projection_authorization"
            )
            if not isinstance(
                authorization, Mapping
            ) or not validate_physical_product_fact_authorization(authorization):
                raise ValueError("physical projection fact authorization is invalid")
            expected_authorization = {
                "claim_id": row_claim_id,
                "fact_id": fact_id,
                "source_id": source_ids[0],
                "country_codes": country_codes,
                "topic_seed_sha256": topic_seed_sha256,
                "signed_offer_sha256": signed_offer_sha256,
                "authority_proof_signature": (
                    source["authority_proof"]["proof_signature"]
                ),
                "authority_claim_proof_signature": authority_claim_signature,
                "normalized_value": fact.get("normalized_value"),
                "semantic_scope": fact.get("semantic_scope"),
                "canonical_pack": canonical_pack,
            }
            for field, expected in expected_authorization.items():
                if authorization.get(field) != expected:
                    raise ValueError(
                        "physical projection fact authorization ownership is invalid"
                    )
            if _semantic_instant(
                authorization.get("observed_at"),
                field="physical projection authorization observed_at",
            ) != observed_instant:
                raise ValueError(
                    "physical projection fact authorization time is invalid"
                )
            payload = PhysicalProductOfferPayloadV1.model_validate(
                {
                    "merchant": merchant_domain,
                    "merchant_domain": merchant_domain,
                    "offer_id": offer.get("sha256"),
                    "product_name": " ".join(
                        str(offer.get("product_name") or "").split()
                    ),
                    "brand": None,
                    "sku": offer.get("product_id") or None,
                    "pack": pack,
                    "price": {
                        "amount": amount,
                        "currency": currency,
                        "tax_basis": "unknown",
                    },
                    "basis": {"quantity": "1", "unit": "package"},
                }
            ).model_dump(mode="json")
            derived = {
                "schema_version": "evidence_fact_v1",
                "kind": "physical_product_offer",
                "fact_id": fact_id,
                "claim_id": row_claim_id,
                "source_ids": source_ids,
                "country_codes": country_codes,
                "observed_at": observed_at,
                "market_scope_hash": profile.market_scope_hash,
                "topic_seed_sha256": topic_seed_sha256,
                "comparison_scope_hash": physical_product_comparison_scope_hash(
                    profile,
                    topic_seed_sha256=topic_seed_sha256,
                    country_codes=country_codes,
                    currency=currency,
                ),
                "verification_status": _VERIFIED_STATUS,
                "payload": payload,
            }
            _validate_supplied_projection(fact.get("business_evidence"), derived)
            projected.append(derived)
            by_owner[owner] = derived

    verified_facts = critical.get("verified_facts") or []
    if isinstance(verified_facts, list):
        for fact in verified_facts:
            if not isinstance(fact, Mapping) or fact.get("business_evidence") is None:
                continue
            owner = (str(fact.get("claim_id") or ""), str(fact.get("fact_id") or ""))
            derived = by_owner.get(owner)
            if derived is None:
                raise ValueError(
                    "hand-authored physical evidence is absent from the verified ledger"
                )
            _validate_supplied_projection(fact.get("business_evidence"), derived)
    return projected


_PROJECTION_REGISTRY: Mapping[
    str,
    Callable[[Mapping[str, Any], BusinessEvidenceProfileV1], List[Dict[str, Any]]],
] = {PHYSICAL_PRODUCT_MODEL: _project_physical_product_offers}


def project_business_evidence_facts(
    grounding: Mapping[str, Any],
    profile: BusinessEvidenceProfileV1,
    *,
    enabled_models: Optional[Iterable[str]] = None,
) -> List[Dict[str, Any]]:
    """Project typed facts for one explicitly enabled economic model."""

    if not business_evidence_projection_enabled(
        profile.economic_model, enabled_models=enabled_models
    ):
        return []
    validate_business_evidence_projection_profile(profile)
    projector = _PROJECTION_REGISTRY.get(profile.economic_model)
    if projector is None:
        raise ValueError("enabled business evidence model has no projection adapter")
    return projector(grounding, profile)


__all__ = [
    "PHYSICAL_PRODUCT_MODEL",
    "PROJECTION_ALLOWLIST_ENV",
    "business_evidence_projection_enabled",
    "configured_business_evidence_projection_models",
    "effective_business_evidence_claim_policy",
    "physical_product_comparison_scope_hash",
    "project_business_evidence_facts",
    "require_enabled_business_evidence_projection",
    "validate_business_evidence_projection_profile",
]
