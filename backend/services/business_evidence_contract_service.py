"""Pure, fail-closed contracts for AxWise business-evidence bundle v2.

This module performs no retrieval and does not infer an economic model from an
industry/category string.  It accepts typed facts that have already crossed an
authority boundary, seals them, derives only reviewed price-difference
calculations, and validates the resulting portable contract.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime
from functools import cmp_to_key
from typing import Any, Dict, Iterable, List, Literal, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.domain.orchestration.models import BusinessEvidenceProfileV1


FACT_SCHEMA_VERSION = "evidence_fact_v1"
CALCULATION_SCHEMA_VERSION = "evidence_calculation_v1"
BUNDLE_VERSION = "axwise_research_bundle_v2"
QUALITY_VERSION = "evidence_contract_quality_v1"
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_DECIMAL = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?$")
_COUNTRY = re.compile(r"^[A-Z]{2}$")
_DOMAIN = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)

FactKind = Literal[
    "physical_product_offer",
    "subscription_plan",
    "usage_tariff",
    "project_service_quote",
]
CalculationKind = Literal[
    "physical_offer_price_difference",
    "subscription_rate_difference",
    "usage_tariff_rate_difference",
    "project_quote_rate_difference",
]
BasisUnit = Literal[
    "item",
    "package",
    "kilogram",
    "gram",
    "liter",
    "milliliter",
    "plan_month",
    "plan_year",
    "seat_month",
    "seat_year",
    "cycle",
    "load",
    "machine_hour",
    "kilowatt_hour",
    "request",
    "thousand_requests",
    "gigabyte_month",
    "project",
    "job",
    "square_meter",
    "hour",
    "day",
    "sprint",
    "milestone",
]

_FACT_FOR_MODEL = {
    "physical_product": "physical_product_offer",
    "subscription": "subscription_plan",
    "usage_based": "usage_tariff",
    "project_service": "project_service_quote",
    "none": None,
}
_CALCULATION_FOR_MODEL = {
    "physical_product": "physical_offer_price_difference",
    "subscription": "subscription_rate_difference",
    "usage_based": "usage_tariff_rate_difference",
    "project_service": "project_quote_rate_difference",
    "none": None,
}
_FACT_FOR_CALCULATION = {
    "physical_offer_price_difference": "physical_product_offer",
    "subscription_rate_difference": "subscription_plan",
    "usage_tariff_rate_difference": "usage_tariff",
    "project_quote_rate_difference": "project_service_quote",
}
_FORMULA_VERSION = {
    "physical_offer_price_difference": "physical_offer_price_difference_v1",
    "subscription_rate_difference": "subscription_rate_difference_v1",
    "usage_tariff_rate_difference": "usage_tariff_rate_difference_v1",
    "project_quote_rate_difference": "project_quote_rate_difference_v1",
}
_UNITS_BY_FACT = {
    "physical_product_offer": {
        "item", "package", "kilogram", "gram", "liter", "milliliter",
    },
    "subscription_plan": {
        "plan_month", "plan_year", "seat_month", "seat_year",
    },
    "usage_tariff": {
        "cycle", "load", "machine_hour", "kilowatt_hour", "request",
        "thousand_requests", "gigabyte_month",
    },
    "project_service_quote": {
        "project", "job", "square_meter", "hour", "day", "sprint",
        "milestone",
    },
}


class EvidenceContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _canonical_decimal(value: Any, *, positive: bool) -> str:
    if not isinstance(value, str) or _DECIMAL.fullmatch(value) is None:
        raise ValueError("amounts and quantities must be plain decimal strings")
    rendered = value
    if "." in rendered:
        rendered = rendered.rstrip("0").rstrip(".")
    rendered = rendered or "0"
    if positive and rendered == "0":
        raise ValueError("decimal value is outside the allowed range")
    return rendered


def _decimal_integer_and_scale(value: str) -> tuple[int, int]:
    """Represent one bounded canonical decimal as an exact scaled integer."""

    whole, separator, fraction = value.partition(".")
    scale = len(fraction) if separator else 0
    return int(whole + fraction), scale


def _aligned_decimal_integers(left: str, right: str) -> tuple[int, int, int]:
    left_integer, left_scale = _decimal_integer_and_scale(left)
    right_integer, right_scale = _decimal_integer_and_scale(right)
    scale = max(left_scale, right_scale)
    return (
        left_integer * (10 ** (scale - left_scale)),
        right_integer * (10 ** (scale - right_scale)),
        scale,
    )


def _compare_decimal_strings(left: str, right: str) -> int:
    left_integer, right_integer, _scale = _aligned_decimal_integers(left, right)
    return (left_integer > right_integer) - (left_integer < right_integer)


def _subtract_decimal_strings(higher: str, lower: str) -> str:
    higher_integer, lower_integer, scale = _aligned_decimal_integers(
        higher, lower
    )
    difference = higher_integer - lower_integer
    if difference < 0:
        raise ValueError("decimal subtraction requires higher >= lower")
    if scale == 0:
        return str(difference)
    digits = str(difference).zfill(scale + 1)
    return _canonical_decimal(
        f"{digits[:-scale]}.{digits[-scale:]}",
        positive=False,
    )


def _unique(values: Iterable[str], label: str) -> List[str]:
    result = list(values)
    if len(result) != len(set(result)):
        raise ValueError(f"{label} must be unique")
    return result


class MoneyV1(EvidenceContractModel):
    amount: str = Field(..., max_length=128)
    currency: str = Field(..., pattern=r"^[A-Z]{3}$")
    tax_basis: Literal["gross", "net", "unknown"]

    @field_validator("amount")
    @classmethod
    def canonicalize_amount(cls, value: str) -> str:
        return _canonical_decimal(value, positive=False)


class EvidenceBasisV1(EvidenceContractModel):
    quantity: str = Field(..., max_length=128)
    unit: BasisUnit

    @field_validator("quantity")
    @classmethod
    def canonicalize_quantity(cls, value: str) -> str:
        return _canonical_decimal(value, positive=True)


class PhysicalProductOfferPayloadV1(EvidenceContractModel):
    merchant: str = Field(..., min_length=1, max_length=255)
    merchant_domain: str
    offer_id: Optional[str] = Field(default=None, min_length=1, max_length=500)
    product_name: str = Field(..., min_length=1, max_length=500)
    brand: Optional[str] = Field(default=None, min_length=1, max_length=255)
    sku: Optional[str] = Field(default=None, min_length=1, max_length=255)
    pack: EvidenceBasisV1
    price: MoneyV1
    basis: EvidenceBasisV1

    @field_validator("merchant_domain")
    @classmethod
    def validate_domain(cls, value: str) -> str:
        if value != value.casefold() or _DOMAIN.fullmatch(value) is None:
            raise ValueError("merchant_domain must be a lowercase DNS name")
        return value

    @model_validator(mode="after")
    def validate_units(self) -> "PhysicalProductOfferPayloadV1":
        if self.pack.unit not in _UNITS_BY_FACT["physical_product_offer"]:
            raise ValueError("physical pack unit is invalid")
        if self.basis.unit not in _UNITS_BY_FACT["physical_product_offer"]:
            raise ValueError("physical price basis is invalid")
        return self


class SubscriptionPlanPayloadV1(EvidenceContractModel):
    provider: str = Field(..., min_length=1, max_length=255)
    provider_domain: str
    plan_id: Optional[str] = Field(default=None, min_length=1, max_length=500)
    plan_name: str = Field(..., min_length=1, max_length=500)
    price: MoneyV1
    basis: EvidenceBasisV1
    included_seats: Optional[int] = Field(default=None, ge=1, le=1_000_000)
    minimum_seats: Optional[int] = Field(default=None, ge=1, le=1_000_000)

    @field_validator("provider_domain")
    @classmethod
    def validate_domain(cls, value: str) -> str:
        if value != value.casefold() or _DOMAIN.fullmatch(value) is None:
            raise ValueError("provider_domain must be a lowercase DNS name")
        return value

    @model_validator(mode="after")
    def validate_units(self) -> "SubscriptionPlanPayloadV1":
        if self.basis.unit not in _UNITS_BY_FACT["subscription_plan"]:
            raise ValueError("subscription price basis is invalid")
        return self


class UsageTariffPayloadV1(EvidenceContractModel):
    provider: str = Field(..., min_length=1, max_length=255)
    provider_domain: str
    tariff_id: Optional[str] = Field(default=None, min_length=1, max_length=500)
    tariff_name: str = Field(..., min_length=1, max_length=500)
    service_name: str = Field(..., min_length=1, max_length=500)
    price: MoneyV1
    basis: EvidenceBasisV1
    fixed_fee: Optional[MoneyV1] = None

    @field_validator("provider_domain")
    @classmethod
    def validate_domain(cls, value: str) -> str:
        if value != value.casefold() or _DOMAIN.fullmatch(value) is None:
            raise ValueError("provider_domain must be a lowercase DNS name")
        return value

    @model_validator(mode="after")
    def validate_contract(self) -> "UsageTariffPayloadV1":
        if self.basis.unit not in _UNITS_BY_FACT["usage_tariff"]:
            raise ValueError("usage tariff basis is invalid")
        if self.fixed_fee and (
            self.fixed_fee.currency != self.price.currency
            or self.fixed_fee.tax_basis != self.price.tax_basis
        ):
            raise ValueError("fixed_fee must match price currency and tax basis")
        return self


class ProjectServiceQuotePayloadV1(EvidenceContractModel):
    provider: str = Field(..., min_length=1, max_length=255)
    provider_domain: Optional[str] = None
    quote_id: str = Field(..., min_length=1, max_length=500)
    service_name: str = Field(..., min_length=1, max_length=500)
    scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    price: MoneyV1
    basis: EvidenceBasisV1
    labour_included: bool
    materials_included: bool
    valid_until: Optional[datetime] = None

    @field_validator("provider_domain")
    @classmethod
    def validate_domain(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and (
            value != value.casefold() or _DOMAIN.fullmatch(value) is None
        ):
            raise ValueError("provider_domain must be a lowercase DNS name")
        return value

    @model_validator(mode="after")
    def validate_units(self) -> "ProjectServiceQuotePayloadV1":
        if self.basis.unit not in _UNITS_BY_FACT["project_service_quote"]:
            raise ValueError("project quote basis is invalid")
        if self.valid_until is not None and self.valid_until.tzinfo is None:
            raise ValueError("valid_until must include an RFC3339 timezone")
        return self


_PAYLOAD_MODEL = {
    "physical_product_offer": PhysicalProductOfferPayloadV1,
    "subscription_plan": SubscriptionPlanPayloadV1,
    "usage_tariff": UsageTariffPayloadV1,
    "project_service_quote": ProjectServiceQuotePayloadV1,
}


class EvidenceFactV1(EvidenceContractModel):
    schema_version: Literal["evidence_fact_v1"] = FACT_SCHEMA_VERSION
    kind: FactKind
    fact_id: str = Field(..., min_length=1, max_length=512)
    claim_id: str = Field(..., min_length=1, max_length=512)
    source_ids: List[str] = Field(..., min_length=1, max_length=100)
    country_codes: List[str] = Field(..., min_length=1, max_length=50)
    observed_at: datetime
    market_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    topic_seed_sha256: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    comparison_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    verification_status: Literal["verified_current_authoritative"]
    payload: Dict[str, Any]
    fact_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @field_validator("source_ids")
    @classmethod
    def validate_source_ids(cls, value: List[str]) -> List[str]:
        if any(not item or len(item) > 512 for item in value):
            raise ValueError("source_ids contain an invalid identifier")
        return _unique(value, "source_ids")

    @field_validator("country_codes")
    @classmethod
    def validate_countries(cls, value: List[str]) -> List[str]:
        if any(_COUNTRY.fullmatch(item) is None for item in value):
            raise ValueError("country_codes must be uppercase two-letter codes")
        return _unique(value, "country_codes")

    @model_validator(mode="after")
    def validate_typed_payload(self) -> "EvidenceFactV1":
        if self.observed_at.tzinfo is None:
            raise ValueError("observed_at must include an RFC3339 timezone")
        parsed = _PAYLOAD_MODEL[self.kind].model_validate(self.payload)
        self.payload = parsed.model_dump(mode="json")
        return self


class CalculationBindingV1(EvidenceContractModel):
    fact_id: str = Field(..., min_length=1, max_length=512)
    claim_id: str = Field(..., min_length=1, max_length=512)


class CalculationInputBindingsV1(EvidenceContractModel):
    higher: CalculationBindingV1
    lower: CalculationBindingV1


class CalculationMoneyInputsV1(EvidenceContractModel):
    higher: MoneyV1
    lower: MoneyV1


class EvidenceCalculationV1(EvidenceContractModel):
    schema_version: Literal["evidence_calculation_v1"] = (
        CALCULATION_SCHEMA_VERSION
    )
    kind: CalculationKind
    calculation_id: str = Field(..., min_length=1, max_length=512)
    formula_version: Literal[
        "physical_offer_price_difference_v1",
        "subscription_rate_difference_v1",
        "usage_tariff_rate_difference_v1",
        "project_quote_rate_difference_v1",
    ]
    input_bindings: CalculationInputBindingsV1
    target_basis: EvidenceBasisV1
    normalized_inputs: CalculationMoneyInputsV1
    result: MoneyV1
    country_codes: List[str] = Field(..., min_length=1, max_length=50)
    comparison_scope_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")
    verification_status: Literal["verified_traceable_calculation"]
    calculation_hash: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    @field_validator("country_codes")
    @classmethod
    def validate_countries(cls, value: List[str]) -> List[str]:
        if any(_COUNTRY.fullmatch(item) is None for item in value):
            raise ValueError("country_codes must be uppercase two-letter codes")
        return _unique(value, "country_codes")

    @model_validator(mode="after")
    def validate_formula_version(self) -> "EvidenceCalculationV1":
        if self.formula_version != _FORMULA_VERSION[self.kind]:
            raise ValueError("formula_version does not match calculation kind")
        return self


def _strict_contract_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > 2**53 - 1:
            raise ValueError("contract integer exceeds exact JSON range")
        return value
    if isinstance(value, float):
        raise ValueError("contract hashes do not accept binary floating point")
    if isinstance(value, Mapping):
        if any(not isinstance(key, str) for key in value):
            raise ValueError("contract objects require string keys")
        return {
            key: _strict_contract_value(child)
            for key, child in sorted(value.items())
        }
    if isinstance(value, (list, tuple)):
        return [_strict_contract_value(child) for child in value]
    raise ValueError(f"unsupported contract value: {type(value).__name__}")


def canonical_contract_hash(value: Any) -> str:
    """Hash strict string/int/bool JSON while preserving array order."""

    canonical = json.dumps(
        _strict_contract_value(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _seal(model, candidate: Mapping[str, Any], hash_key: str):
    raw = dict(candidate)
    supplied_hash = raw.pop(hash_key, None)
    raw[hash_key] = "0" * 64
    parsed = model.model_validate(raw)
    values = parsed.model_dump(mode="json")
    values.pop(hash_key)
    calculated = canonical_contract_hash(values)
    if supplied_hash is not None and supplied_hash != calculated:
        raise ValueError(f"{hash_key} does not match canonical content")
    values[hash_key] = calculated
    return model.model_validate(values)


def seal_evidence_fact_v1(candidate: Mapping[str, Any]) -> EvidenceFactV1:
    return _seal(EvidenceFactV1, candidate, "fact_hash")


def validate_evidence_fact_v1(candidate: Mapping[str, Any]) -> EvidenceFactV1:
    return seal_evidence_fact_v1(candidate)


def seal_evidence_calculation_v1(
    candidate: Mapping[str, Any],
) -> EvidenceCalculationV1:
    return _seal(EvidenceCalculationV1, candidate, "calculation_hash")


def fact_manifest(
    facts: Iterable[Mapping[str, Any] | EvidenceFactV1],
) -> List[Dict[str, str]]:
    rows = []
    for fact in facts:
        parsed = fact if isinstance(fact, EvidenceFactV1) else validate_evidence_fact_v1(fact)
        rows.append({"fact_id": parsed.fact_id, "fact_hash": parsed.fact_hash})
    if len({row["fact_id"] for row in rows}) != len(rows):
        raise ValueError("fact_id values must be globally unique")
    return sorted(rows, key=lambda row: row["fact_id"])


def calculation_manifest(
    calculations: Iterable[Mapping[str, Any] | EvidenceCalculationV1],
) -> List[Dict[str, str]]:
    rows = []
    for calculation in calculations:
        parsed = (
            calculation
            if isinstance(calculation, EvidenceCalculationV1)
            else seal_evidence_calculation_v1(calculation)
        )
        rows.append(
            {
                "calculation_id": parsed.calculation_id,
                "calculation_hash": parsed.calculation_hash,
            }
        )
    if len({row["calculation_id"] for row in rows}) != len(rows):
        raise ValueError("calculation_id values must be globally unique")
    return sorted(rows, key=lambda row: row["calculation_id"])


def _fact_money(fact: EvidenceFactV1) -> MoneyV1:
    return MoneyV1.model_validate(fact.payload["price"])


def _fact_basis(fact: EvidenceFactV1) -> EvidenceBasisV1:
    return EvidenceBasisV1.model_validate(fact.payload["basis"])


def _calculation_identity_hash(
    kind: str,
    input_bindings: CalculationInputBindingsV1,
    comparison_scope_hash: str,
) -> str:
    return canonical_contract_hash(
        {
            "kind": kind,
            "higher": input_bindings.higher.model_dump(mode="json"),
            "lower": input_bindings.lower.model_dump(mode="json"),
            "comparison_scope_hash": comparison_scope_hash,
        }
    )


def _comparison_group_key(fact: EvidenceFactV1) -> tuple[Any, ...]:
    money = _fact_money(fact)
    basis = _fact_basis(fact)
    key: tuple[Any, ...] = (
        fact.comparison_scope_hash,
        money.currency,
        money.tax_basis,
        tuple(fact.country_codes),
        basis.quantity,
        basis.unit,
    )
    if fact.kind == "project_service_quote":
        key += (
            fact.payload["scope_hash"],
            fact.payload["labour_included"],
            fact.payload["materials_included"],
        )
    return key


def _calculation_semantics(
    calculation: EvidenceCalculationV1,
    facts_by_id: Mapping[str, EvidenceFactV1],
) -> None:
    identity_hash = _calculation_identity_hash(
        calculation.kind,
        calculation.input_bindings,
        calculation.comparison_scope_hash,
    )
    if (
        calculation.calculation_id
        != f"evidence-calculation-{identity_hash[:32]}"
    ):
        raise ValueError("calculation_id does not match deterministic identity")
    higher = facts_by_id.get(calculation.input_bindings.higher.fact_id)
    lower = facts_by_id.get(calculation.input_bindings.lower.fact_id)
    expected_fact_kind = _FACT_FOR_CALCULATION[calculation.kind]
    if not higher or not lower or higher.fact_id == lower.fact_id:
        raise ValueError("calculation inputs must bind two distinct known facts")
    if higher.kind != expected_fact_kind or lower.kind != expected_fact_kind:
        raise ValueError("calculation input fact kind is invalid")
    if (
        calculation.input_bindings.higher.claim_id != higher.claim_id
        or calculation.input_bindings.lower.claim_id != lower.claim_id
    ):
        raise ValueError("calculation binding does not own the referenced fact")
    higher_money, lower_money = _fact_money(higher), _fact_money(lower)
    basis = _fact_basis(higher)
    if (
        _fact_basis(lower) != basis
        or calculation.target_basis != basis
        or higher.comparison_scope_hash != lower.comparison_scope_hash
        or calculation.comparison_scope_hash != higher.comparison_scope_hash
        or higher.country_codes != lower.country_codes
        or calculation.country_codes != higher.country_codes
        or higher_money.currency != lower_money.currency
        or higher_money.tax_basis != lower_money.tax_basis
        or calculation.normalized_inputs.higher != higher_money
        or calculation.normalized_inputs.lower != lower_money
        or _compare_decimal_strings(
            higher_money.amount, lower_money.amount
        )
        <= 0
    ):
        raise ValueError("calculation inputs are not exactly comparable")
    if higher.kind == "project_service_quote" and any(
        higher.payload[field] != lower.payload[field]
        for field in ("scope_hash", "labour_included", "materials_included")
    ):
        raise ValueError("project quote inputs do not have identical scope")
    expected = MoneyV1(
        amount=_subtract_decimal_strings(
            higher_money.amount, lower_money.amount
        ),
        currency=higher_money.currency,
        tax_basis=higher_money.tax_basis,
    )
    if calculation.result != expected:
        raise ValueError("calculation result does not recompute from inputs")


def _build_calculations(
    profile: BusinessEvidenceProfileV1,
    facts: List[EvidenceFactV1],
) -> List[EvidenceCalculationV1]:
    calculations: List[EvidenceCalculationV1] = []
    for requirement in profile.calculation_requirements:
        fact_kind = _FACT_FOR_CALCULATION[requirement.kind]
        groups: Dict[tuple[Any, ...], List[EvidenceFactV1]] = defaultdict(list)
        for fact in facts:
            if fact.kind != fact_kind:
                continue
            groups[_comparison_group_key(fact)].append(fact)
        candidates = []
        for group in groups.values():
            def compare_facts(left: EvidenceFactV1, right: EvidenceFactV1) -> int:
                compared = _compare_decimal_strings(
                    _fact_money(left).amount,
                    _fact_money(right).amount,
                )
                if compared:
                    return compared
                return (left.fact_id > right.fact_id) - (
                    left.fact_id < right.fact_id
                )

            ordered = sorted(
                group,
                key=cmp_to_key(compare_facts),
            )
            for lower_index, lower in enumerate(ordered):
                for higher in ordered[lower_index + 1 :]:
                    higher_amount = _fact_money(higher).amount
                    lower_amount = _fact_money(lower).amount
                    if _compare_decimal_strings(higher_amount, lower_amount) > 0:
                        candidates.append(
                            (
                                _subtract_decimal_strings(
                                    higher_amount, lower_amount
                                ),
                                higher.fact_id,
                                lower.fact_id,
                                higher,
                                lower,
                            )
                        )

        def compare_candidates(left, right) -> int:
            compared = _compare_decimal_strings(left[0], right[0])
            if compared:
                return -compared
            return (left[1:3] > right[1:3]) - (left[1:3] < right[1:3])

        candidates.sort(key=cmp_to_key(compare_candidates))
        wanted = requirement.minimum_verified
        for _spread, _higher_id, _lower_id, higher, lower in candidates[:wanted]:
            higher_money, lower_money = _fact_money(higher), _fact_money(lower)
            bindings = CalculationInputBindingsV1(
                higher={"fact_id": higher.fact_id, "claim_id": higher.claim_id},
                lower={"fact_id": lower.fact_id, "claim_id": lower.claim_id},
            )
            identity_hash = _calculation_identity_hash(
                requirement.kind,
                bindings,
                higher.comparison_scope_hash,
            )
            calculation = seal_evidence_calculation_v1(
                {
                    "schema_version": CALCULATION_SCHEMA_VERSION,
                    "kind": requirement.kind,
                    "calculation_id": f"evidence-calculation-{identity_hash[:32]}",
                    "formula_version": _FORMULA_VERSION[requirement.kind],
                    "input_bindings": bindings.model_dump(mode="json"),
                    "target_basis": _fact_basis(higher).model_dump(mode="json"),
                    "normalized_inputs": {
                        "higher": higher_money.model_dump(mode="json"),
                        "lower": lower_money.model_dump(mode="json"),
                    },
                    "result": {
                        "amount": _subtract_decimal_strings(
                            higher_money.amount,
                            lower_money.amount,
                        ),
                        "currency": higher_money.currency,
                        "tax_basis": higher_money.tax_basis,
                    },
                    "country_codes": higher.country_codes,
                    "comparison_scope_hash": higher.comparison_scope_hash,
                    "verification_status": "verified_traceable_calculation",
                }
            )
            _calculation_semantics(calculation, {row.fact_id: row for row in facts})
            calculations.append(calculation)
    return calculations


def _requirement_quality(
    profile: BusinessEvidenceProfileV1,
    facts: List[EvidenceFactV1],
    calculations: List[EvidenceCalculationV1],
    not_applicable_reasons: Optional[Mapping[str, str]] = None,
) -> Dict[str, Any]:
    reviewed_not_applicable = dict(not_applicable_reasons or {})
    allowed_not_applicable_reasons = {
        "pricing_decision_not_in_scope",
        "business_model_not_in_scope",
    }
    requirement_kinds = {
        requirement.kind
        for requirement in (
            *profile.fact_requirements,
            *profile.calculation_requirements,
        )
    }
    if set(reviewed_not_applicable) - requirement_kinds:
        raise ValueError("not-applicable review references an unknown requirement")
    if any(
        reason not in allowed_not_applicable_reasons
        for reason in reviewed_not_applicable.values()
    ):
        raise ValueError("not-applicable review has an invalid reason_code")

    def quality_row(requirement, ids: List[str], id_key: str) -> Dict[str, Any]:
        reason = reviewed_not_applicable.get(requirement.kind)
        if reason is not None:
            if requirement.applicability == "required":
                raise ValueError("required evidence cannot be marked not applicable")
            if ids:
                raise ValueError(
                    "evidence-backed requirements cannot be marked not applicable"
                )
            status = "not_applicable"
            validation_plan = None
        elif ids and len(ids) >= requirement.minimum_verified:
            status = "satisfied"
            validation_plan = None
        else:
            status = "insufficient_evidence"
            validation_plan = "Collect and verify additional comparable evidence."
        return {
            "kind": requirement.kind,
            "status": status,
            "satisfied_count": len(ids),
            id_key: sorted(ids),
            "reason_code": reason,
            "validation_plan": validation_plan,
        }

    fact_rows = []
    blocked = False
    for requirement in profile.fact_requirements:
        ids = [fact.fact_id for fact in facts if fact.kind == requirement.kind]
        row = quality_row(requirement, ids, "fact_ids")
        blocked = blocked or (
            row["status"] == "insufficient_evidence"
            and requirement.applicability
            in {"required", "required_when_applicable"}
        )
        fact_rows.append(row)
    calculation_rows = []
    for requirement in profile.calculation_requirements:
        ids = [
            calculation.calculation_id
            for calculation in calculations
            if calculation.kind == requirement.kind
        ]
        row = quality_row(requirement, ids, "calculation_ids")
        blocked = blocked or (
            row["status"] == "insufficient_evidence"
            and requirement.applicability
            in {"required", "required_when_applicable"}
        )
        calculation_rows.append(row)
    return {
        "version": QUALITY_VERSION,
        "status": "blocked" if blocked else "passed",
        "fact_requirements": fact_rows,
        "calculation_requirements": calculation_rows,
    }


def build_business_evidence_contract_v1(
    profile: Mapping[str, Any] | BusinessEvidenceProfileV1,
    facts: Iterable[Mapping[str, Any] | EvidenceFactV1],
    *,
    not_applicable_reasons: Optional[Mapping[str, str]] = None,
) -> Dict[str, Any]:
    """Seal direct typed facts and deterministically derive reviewed calculations."""

    parsed_profile = (
        profile
        if isinstance(profile, BusinessEvidenceProfileV1)
        else BusinessEvidenceProfileV1.model_validate(profile)
    )
    parsed_facts = [
        fact if isinstance(fact, EvidenceFactV1) else seal_evidence_fact_v1(fact)
        for fact in facts
    ]
    fact_manifest_rows = fact_manifest(parsed_facts)
    expected_fact_kind = _FACT_FOR_MODEL[parsed_profile.economic_model]
    for fact in parsed_facts:
        if fact.kind != expected_fact_kind:
            raise ValueError("fact kind is incompatible with evidence profile")
        if fact.market_scope_hash != parsed_profile.market_scope_hash:
            raise ValueError("fact market_scope_hash does not match evidence profile")
    calculations = _build_calculations(parsed_profile, parsed_facts)
    calculation_manifest_rows = calculation_manifest(calculations)
    quality = _requirement_quality(
        parsed_profile,
        parsed_facts,
        calculations,
        not_applicable_reasons,
    )
    if quality["status"] != "passed":
        raise ValueError("business evidence requirements are not satisfied")
    profile_value = parsed_profile.model_dump(mode="json")
    profile_hash = canonical_contract_hash(profile_value)
    fact_manifest_hash = canonical_contract_hash(fact_manifest_rows)
    calculation_manifest_hash = canonical_contract_hash(calculation_manifest_rows)
    quality.update(
        {
            "profile_hash": profile_hash,
            "fact_manifest_hash": fact_manifest_hash,
            "calculation_manifest_hash": calculation_manifest_hash,
        }
    )
    return {
        "version": BUNDLE_VERSION,
        "evidence_profile": profile_value,
        "evidence_profile_hash": profile_hash,
        "facts": [fact.model_dump(mode="json") for fact in parsed_facts],
        "calculations": [
            calculation.model_dump(mode="json") for calculation in calculations
        ],
        "fact_manifest_hash": fact_manifest_hash,
        "calculation_manifest_hash": calculation_manifest_hash,
        "quality": {"evidence_contract": quality},
    }


def validate_business_evidence_contract_v1(value: Mapping[str, Any]) -> Dict[str, Any]:
    """Revalidate hashes, bindings, arithmetic, manifests, and requirement coverage."""

    required = {
        "version", "evidence_profile", "evidence_profile_hash", "facts",
        "calculations", "fact_manifest_hash", "calculation_manifest_hash", "quality",
    }
    if set(value) != required or value.get("version") != BUNDLE_VERSION:
        raise ValueError("business evidence contract has an invalid top-level shape")
    profile = BusinessEvidenceProfileV1.model_validate(value["evidence_profile"])
    if canonical_contract_hash(profile.model_dump(mode="json")) != value["evidence_profile_hash"]:
        raise ValueError("evidence_profile_hash mismatch")
    facts = [validate_evidence_fact_v1(row) for row in value.get("facts") or []]
    if any(fact.market_scope_hash != profile.market_scope_hash for fact in facts):
        raise ValueError("fact market scope does not match profile")
    facts_by_id = {fact.fact_id: fact for fact in facts}
    if len(facts_by_id) != len(facts):
        raise ValueError("fact_id values must be globally unique")
    calculations = [
        seal_evidence_calculation_v1(row) for row in value.get("calculations") or []
    ]
    for calculation in calculations:
        _calculation_semantics(calculation, facts_by_id)
    fact_rows = fact_manifest(facts)
    calculation_rows = calculation_manifest(calculations)
    if canonical_contract_hash(fact_rows) != value["fact_manifest_hash"]:
        raise ValueError("fact_manifest_hash mismatch")
    if canonical_contract_hash(calculation_rows) != value["calculation_manifest_hash"]:
        raise ValueError("calculation_manifest_hash mismatch")
    serialized_quality = value.get("quality")
    if (
        not isinstance(serialized_quality, Mapping)
        or set(serialized_quality) != {"evidence_contract"}
        or not isinstance(serialized_quality["evidence_contract"], Mapping)
    ):
        raise ValueError("quality.evidence_contract is required")
    serialized_rows = [
        *(serialized_quality["evidence_contract"].get("fact_requirements") or []),
        *(
            serialized_quality["evidence_contract"].get(
                "calculation_requirements"
            )
            or []
        ),
    ]
    not_applicable_reasons = {
        row["kind"]: row.get("reason_code")
        for row in serialized_rows
        if isinstance(row, Mapping) and row.get("status") == "not_applicable"
    }
    expected_quality = _requirement_quality(
        profile,
        facts,
        calculations,
        not_applicable_reasons,
    )
    expected_quality.update(
        {
            "profile_hash": value["evidence_profile_hash"],
            "fact_manifest_hash": value["fact_manifest_hash"],
            "calculation_manifest_hash": value["calculation_manifest_hash"],
        }
    )
    if (
        serialized_quality["evidence_contract"] != expected_quality
        or expected_quality["status"] != "passed"
    ):
        raise ValueError("quality.evidence_contract does not match verified coverage")
    expected_fact_kind = _FACT_FOR_MODEL[profile.economic_model]
    if any(fact.kind != expected_fact_kind for fact in facts):
        raise ValueError("fact kind is incompatible with evidence profile")
    return {
        "version": BUNDLE_VERSION,
        "evidence_profile": profile.model_dump(mode="json"),
        "evidence_profile_hash": value["evidence_profile_hash"],
        "facts": [fact.model_dump(mode="json") for fact in facts],
        "calculations": [
            calculation.model_dump(mode="json") for calculation in calculations
        ],
        "fact_manifest_hash": value["fact_manifest_hash"],
        "calculation_manifest_hash": value["calculation_manifest_hash"],
        "quality": {"evidence_contract": expected_quality},
    }


__all__ = [
    "BusinessEvidenceProfileV1",
    "EvidenceFactV1",
    "EvidenceCalculationV1",
    "MoneyV1",
    "EvidenceBasisV1",
    "canonical_contract_hash",
    "seal_evidence_fact_v1",
    "validate_evidence_fact_v1",
    "seal_evidence_calculation_v1",
    "fact_manifest",
    "calculation_manifest",
    "build_business_evidence_contract_v1",
    "validate_business_evidence_contract_v1",
]
