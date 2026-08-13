import hashlib
import os
from datetime import datetime, timezone

import pytest

from backend.services.research_quality_service import (
    COMMERCIAL_MARKET_LAUNCH,
    _has_exact_span_provenance,
    clean_semantic_text,
    determine_claim_class_applicability,
    evaluate_critical_claims,
    validate_research_prd,
)
from backend.services.research_source_authority_service import (
    build_authority_claim_artifact,
    build_attested_authority_proof,
    is_trusted_public_root,
)


def test_attestation_host_match_rejects_suffix_spoof():
    with pytest.raises(ValueError, match="does not reference"):
        build_attested_authority_proof(
            direct_url="https://stat.ee/data",
            direct_text="Statistics Estonia published retail turnover data for Estonia.",
            attestation_url="https://directory.gov/authorities",
            attestation_text=(
                "Government agency directory: evilstat.ee is the official statistics office."
            ),
            country_codes=["EE"],
            retrieved_at="2026-08-12T12:00:00+00:00",
        )

    proof = build_attested_authority_proof(
        direct_url="https://stat.ee/data",
        direct_text="Statistics Estonia published retail turnover data for Estonia.",
        attestation_url="https://directory.gov/authorities",
        attestation_text=(
            "Government agency directory: https://stat.ee/data is the official statistics office."
        ),
        country_codes=["EE"],
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    assert proof["proof_type"] == "independent_public_root_attestation"

    for spoof in (
        "Government directory: https://evil.gov/path/stat.ee is official.",
        "Government directory: https://evil.gov/stat.ee is official.",
    ):
        with pytest.raises(ValueError, match="does not reference"):
            build_attested_authority_proof(
                direct_url="https://stat.ee/data",
                direct_text="Statistics Estonia published data for Estonia.",
                attestation_url="https://directory.gov/authorities",
                attestation_text=spoof,
                country_codes=["EE"],
            )

    bare = build_attested_authority_proof(
        direct_url="https://stat.ee/data",
        direct_text="Statistics Estonia published data for Estonia.",
        attestation_url="https://directory.gov/authorities",
        attestation_text="Government statistics office directory (stat.ee).",
        country_codes=["EE"],
    )
    assert bare["proof_type"] == "independent_public_root_attestation"


pytestmark = pytest.mark.contract
os.environ.setdefault(
    "AXWISE_AUTHORITY_PROOF_SECRET", "test-authority-secret-32-bytes-minimum"
)


def _estonia_vat_grounding(*, value: str = "24%", direct: bool = True):
    claim_text = f"Estonia's standard VAT rate is {value} from July 2025."
    source_url = "https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax"
    direct_text = (
        "The Estonian Tax and Customs Board is the national government tax authority. "
        f"Value-added tax guidance for business clients. {claim_text}"
    )
    authority_proof = build_attested_authority_proof(
        direct_url=source_url,
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/estonia-authorities",
        attestation_text=(
            "Official national authority directory: Estonian Tax and Customs Board, "
            "https://www.emta.ee"
        ),
        country_codes=["EE"],
        retrieved_at="2026-08-12T12:00:00+00:00",
    )
    source = {
        "source_id": "emta-vat",
        "url": source_url,
        "publisher": "www.emta.ee",
        "provider": "searxng",
        "country_codes": ["EE"],
        "source_authority": "official_public",
        "authority_verification_status": (
            "official_domain_verified" if direct else "provider_redirect_unverified"
        ),
        "retrieved_at": "2026-08-12T12:00:00+00:00",
        "authority_proof": authority_proof if direct else None,
    }
    authority_document = {
        "artifact_type": "direct_authority_document",
        "source_id": "emta-vat",
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": "2026-08-12T12:00:00+00:00",
        "authority_proof_signature": authority_proof["proof_signature"],
    }
    claim_artifact = build_authority_claim_artifact(
        source_id="emta-vat",
        source_url=source_url,
        authority_proof=authority_proof,
        authority_document=authority_document,
        claim_text=claim_text,
    )
    binding = claim_artifact["claim_binding"]
    return {
        "market_sources": [
            source
        ],
        "market_claims": [
            {
                "claim_id": "vat-current",
                "subject": "Estonia",
                "predicate": "standard VAT rate",
                "object": claim_text,
                "source_ids": ["emta-vat"],
                "country_codes": ["EE"],
                "critical": True,
                "effective_at": "2026-01-01T00:00:00+00:00",
                "current": True,
                "citation_metadata": {
                    "segment_start": binding["claim_start"],
                    "segment_end": binding["claim_end"],
                    "span_target": "direct_authority_document",
                    "offset_unit": "unicode_codepoints",
                    "source_id": "emta-vat",
                },
                "provenance_artifact": claim_artifact,
            }
        ],
    }


def _commercial_prd(regulatory_text: str):
    return {
        "prd_type": COMMERCIAL_MARKET_LAUNCH,
        "commercial_prd": {
            "market_scope": {"countries": ["EE"]},
            "market_and_demand_assessment": ["Grounded demand assessment"],
            "customer_segments": ["Retail category buyer"],
            "buying_roles": ["Economic buyer"],
            "regulatory_checklist": [regulatory_text],
            "competitors": ["Evidence-backed competitor set"],
            "suppliers_and_channels": ["Specialist retail"],
            "pricing_and_unit_economics": {
                "statement": "Net price derives from gross price and verified VAT.",
                "formula": "net_price = gross_price / (1 + vat_rate)",
                "input_claim_ids": ["vat-current"],
            },
            "go_to_market_plan_90_days": ["Validate", "Pilot", "Scale"],
            "risks_assumptions_and_validation": ["Interview buyers"],
        },
    }


def _replace_direct_claim(
    grounding: dict,
    *,
    claim_text: str,
    evidence_class: str,
    temporal_fields: dict,
) -> dict:
    source = grounding["market_sources"][0]
    direct_text = (
        "The Estonian Tax and Customs Board is the national government tax authority. "
        + claim_text
    )
    proof = build_attested_authority_proof(
        direct_url=source["url"],
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/estonia-authorities",
        attestation_text="Official authority directory: https://www.emta.ee",
        country_codes=["EE"],
        retrieved_at=source["retrieved_at"],
    )
    source["authority_proof"] = proof
    authority_document = {
        "artifact_type": "direct_authority_document",
        "source_id": source["source_id"],
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": source["retrieved_at"],
        "authority_proof_signature": proof["proof_signature"],
    }
    artifact = build_authority_claim_artifact(
        source_id=source["source_id"],
        source_url=source["url"],
        authority_proof=proof,
        authority_document=authority_document,
        claim_text=claim_text,
    )
    binding = artifact["claim_binding"]
    claim = grounding["market_claims"][0]
    claim.update(
        {
            "object": claim_text,
            "evidence_class": evidence_class,
            "citation_metadata": {
                "segment_start": binding["claim_start"],
                "segment_end": binding["claim_end"],
                "span_target": "direct_authority_document",
                "offset_unit": "unicode_codepoints",
                "source_id": source["source_id"],
            },
            "provenance_artifact": artifact,
            **temporal_fields,
        }
    )
    return grounding


def test_estonia_vat_is_verified_from_dynamic_official_evidence_not_catalogue():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "passed"
    assert quality["verified_count"] == 1
    assert quality["verified_facts"][0]["display_value"] == "24%"


def test_commercial_goal_determines_applicability_before_model_output():
    applicability = determine_claim_class_applicability(
        {
            "research_prd_type": "commercial_market_launch",
            "title": "Estonia cat-food launch",
            "description": "Price packages with regulatory VAT compliance",
        },
        [
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        ],
    )
    assert applicability["applicable_claim_classes"] == [
        "observed_primary_market",
        "official_statistic",
        "statutory_current",
    ]
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
        mandatory_claim_classes=applicability["requested_claim_classes"],
        claim_class_applicability=applicability,
    )
    assert quality["status"] == "blocked"
    assert {
        item["reason"] for item in quality["blocked_claims"]
    } >= {
        "mandatory_claim_class_missing:official_statistic",
        "mandatory_claim_class_missing:observed_primary_market",
    }


def test_noncommercial_goal_reports_reasoned_not_applicable_partition():
    applicability = determine_claim_class_applicability(
        {
            "research_prd_type": "operational_process",
            "description": "Document an internal handoff workflow",
        },
        ["statutory_current", "official_statistic", "observed_primary_market"],
    )
    assert applicability["applicable_claim_classes"] == []
    assert {
        item["evidence_class"]
        for item in applicability["not_applicable_claim_classes"]
    } == {
        "statutory_current",
        "official_statistic",
        "observed_primary_market",
    }


def test_provider_redirect_cannot_self_assert_official_authority():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(direct=False),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"] == [
        {
            "claim_id": "vat-current",
            "reason": "current_direct_authoritative_source_missing",
        }
    ]


def test_unattested_spoof_cannot_reuse_official_labels():
    grounding = _estonia_vat_grounding()
    source = grounding["market_sources"][0]
    source["url"] = "https://evil.example/fake"
    source["publisher"] = "evil.example"

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"] == [
        {
            "claim_id": "vat-current",
            "reason": "current_direct_authoritative_source_missing",
        }
    ]


def test_gov_label_inside_attacker_domain_is_not_a_public_root():
    assert is_trusted_public_root("https://tax.gov.evil.example/vat") is False


def test_internally_consistent_forged_authority_proof_fails_signature():
    grounding = _estonia_vat_grounding()
    source = grounding["market_sources"][0]
    source["authority_proof"]["direct"]["final_host"] = "evil.example"
    source["authority_proof"]["direct"]["final_url"] = "https://evil.example/fake"
    source["url"] = "https://evil.example/fake"

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"][0]["reason"] == (
        "current_direct_authoritative_source_missing"
    )


def test_old_official_statistic_fetched_today_is_not_current():
    grounding = _estonia_vat_grounding()
    claim = grounding["market_claims"][0]
    claim.update(
        {
            "evidence_class": "official_statistic",
            "object": "Estonia's market population was 1.33 million in 2021.",
            "observation_end": "2021-12-31T00:00:00+00:00",
            "current": None,
        }
    )
    source = grounding["market_sources"][0]
    direct_text = (
        "The Estonian Tax and Customs Board is the national government tax authority. "
        + claim["object"]
    )
    proof = build_attested_authority_proof(
        direct_url=source["url"],
        direct_text=direct_text,
        attestation_url="https://european-union.europa.eu/estonia-authorities",
        attestation_text="Official authority directory: https://www.emta.ee",
        country_codes=["EE"],
        retrieved_at=source["retrieved_at"],
    )
    source["authority_proof"] = proof
    authority_document = {
        "artifact_type": "direct_authority_document",
        "source_id": source["source_id"],
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": source["retrieved_at"],
        "authority_proof_signature": proof["proof_signature"],
    }
    artifact = build_authority_claim_artifact(
        source_id=source["source_id"],
        source_url=source["url"],
        authority_proof=proof,
        authority_document=authority_document,
        claim_text=claim["object"],
    )
    binding = artifact["claim_binding"]
    claim["citation_metadata"] = {
        "segment_start": binding["claim_start"],
        "segment_end": binding["claim_end"],
        "span_target": "direct_authority_document",
        "offset_unit": "unicode_codepoints",
        "source_id": source["source_id"],
    }
    claim["provenance_artifact"] = artifact

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
        freshness_days=365,
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"] == [
        {
            "claim_id": "vat-current",
            "reason": "fact_effective_or_observation_date_stale",
        }
    ]


def test_latest_annual_official_statistic_uses_class_specific_freshness():
    grounding = _replace_direct_claim(
        _estonia_vat_grounding(),
        claim_text="Estonia's latest population was 1.37 million in 2025.",
        evidence_class="official_statistic",
        temporal_fields={
            "observation_end": "2025-12-31T00:00:00+00:00",
            "latest_release": True,
            "latest_release_basis": "explicit latest release on direct authority page",
            "current": None,
        },
    )

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_days=120,
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=[
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        ],
    )

    assert quality["status"] == "passed", quality["blocked_claims"]
    assert quality["requested_claim_classes"] == [
        "observed_primary_market",
        "official_statistic",
        "statutory_current",
    ]
    assert quality["applicable_claim_classes"] == ["official_statistic"]
    assert quality["mandatory_claim_classes"] == ["official_statistic"]
    assert {row["evidence_class"] for row in quality["not_applicable_claim_classes"]} == {
        "statutory_current",
        "observed_primary_market",
    }


@pytest.mark.parametrize(
    "mutation",
    [
        lambda claim: claim["citation_metadata"].update(
            segment_start=9999, segment_end=10000
        ),
        lambda claim: claim["provenance_artifact"].update(sha256="not-a-hash"),
        lambda claim: claim["provenance_artifact"].update(
            authority_proof_signature="0" * 64
        ),
    ],
)
def test_critical_claim_rejects_unverifiable_span_artifacts(mutation):
    grounding = _estonia_vat_grounding()
    mutation(grounding["market_claims"][0])

    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )

    assert quality["status"] == "blocked"
    assert quality["blocked_claims"] == [
        {"claim_id": "vat-current", "reason": "exact_claim_span_provenance_missing"}
    ]


def test_multipart_utf8_byte_span_is_bound_to_exact_provider_response():
    grounding = _estonia_vat_grounding()
    claim = grounding["market_claims"][0]
    part_zero = "Sissejuhatus: hinnad eurodes. "
    part_one = "Hinnale lisandub käibemaks 24%."
    response_text = part_zero + part_one
    response_parts = [part_zero, part_one]
    part_hashes = [
        hashlib.sha256(value.encode("utf-8")).hexdigest()
        for value in response_parts
    ]
    claim.update(
        {
            "object": part_one,
            "provider_response_hash": hashlib.sha256(
                response_text.encode("utf-8")
            ).hexdigest(),
            "citation_metadata": {
                "segment_start": 0,
                "segment_end": len(part_one.encode("utf-8")),
                "span_target": "provider_response_part",
                "part_index": 1,
                "offset_unit": "utf8_bytes",
            },
            "provenance_artifact": {
                "artifact_type": "provider_response_part",
                "part_index": 1,
                "text": part_one,
                "sha256": part_hashes[1],
                "response_part_hashes": part_hashes,
                "response_parts_sha256": hashlib.sha256(
                    "\n".join(part_hashes).encode("ascii")
                ).hexdigest(),
                "response_parts": response_parts,
                "provider_response_text": response_text,
                "provider_response_sha256": hashlib.sha256(
                    response_text.encode("utf-8")
                ).hexdigest(),
            },
        }
    )

    assert _has_exact_span_provenance(claim, part_one)


def test_multipart_span_rejects_tampered_part_manifest_and_byte_boundary():
    grounding = _estonia_vat_grounding()
    claim = grounding["market_claims"][0]
    text = "Hinnale lisandub käibemaks 24%."
    response_parts = ["Eesti hinnainfo. ", text]
    response_text = "".join(response_parts)
    hashes = [hashlib.sha256(value.encode("utf-8")).hexdigest() for value in response_parts]
    claim.update(
        {
            "object": text,
            "provider_response_hash": hashlib.sha256(response_text.encode("utf-8")).hexdigest(),
            "citation_metadata": {
                "segment_start": 1,  # starts inside the first multibyte H
                "segment_end": len(text.encode("utf-8")),
                "span_target": "provider_response_part",
                "part_index": 1,
                "offset_unit": "utf8_bytes",
            },
            "provenance_artifact": {
                "artifact_type": "provider_response_part",
                "part_index": 1,
                "text": text,
                "sha256": hashes[1],
                "response_part_hashes": hashes,
                "response_parts_sha256": hashlib.sha256("\n".join(hashes).encode("ascii")).hexdigest(),
                "response_parts": response_parts,
                "provider_response_text": response_text,
                "provider_response_sha256": hashlib.sha256(response_text.encode("utf-8")).hexdigest(),
            },
        }
    )

    assert not _has_exact_span_provenance(claim, text)


def test_generic_conflict_validator_rejects_stale_document_value():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    validation = validate_research_prd(
        _commercial_prd("The standard VAT rate in Estonia is 22%."),
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "blocked"
    assert {"critical_fact_conflict", "material_fact_unlinked"} & {
        row["code"] for row in validation["issues"]
    }


def test_semantic_cleaner_removes_presentation_markup_and_null_members():
    assert clean_semantic_text(
        {"role": "**Finance\\_Pricing**", "items": ["* Evidence", None], "missing": None}
    ) == {"role": "Finance_Pricing", "items": ["Evidence"]}


def test_commercial_prd_rejects_empty_required_sections():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    content = _commercial_prd("Regulation validated against claim vat-current")
    content["commercial_prd"] = {
        key: ([] if isinstance(value, list) else {})
        for key, value in content["commercial_prd"].items()
    }

    validation = validate_research_prd(
        content,
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "blocked"
    assert "commercial_section_empty" in {
        row["code"] for row in validation["issues"]
    }


def test_commercial_prd_rejects_boolean_section_placeholders():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    content = _commercial_prd("Regulation validated against claim vat-current")
    content["commercial_prd"] = {
        key: False for key in content["commercial_prd"]
    }

    validation = validate_research_prd(
        content,
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "blocked"
    assert sum(
        row["code"] == "commercial_section_empty"
        for row in validation["issues"]
    ) == 10


def test_commercial_prd_requires_per_fact_traceability():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    content = _commercial_prd(
        {
            "statement": "The standard VAT rate is 24%.",
            "claim_ids": ["vat-current"],
        }
    )
    content["commercial_prd"]["pricing_and_unit_economics"] = {
        "statement": "Target retail price is €29.90.",
    }

    validation = validate_research_prd(
        content,
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "blocked"
    assert "material_fact_unlinked" in {row["code"] for row in validation["issues"]}


def test_commercial_prd_accepts_labeled_hypothesis_with_validation_plan():
    quality = evaluate_critical_claims(
        _estonia_vat_grounding(),
        ["EE"],
        now=datetime(2026, 8, 12, tzinfo=timezone.utc),
    )
    content = _commercial_prd(
        {
            "statement": "The standard VAT rate is 24%.",
            "claim_ids": ["vat-current"],
        }
    )
    content["commercial_prd"]["pricing_and_unit_economics"] = {
        "statement": "Hypothesized retail price is €29.90.",
        "evidence_class": "synthetic_hypothesis",
        "validation_plan": "Test with 12 Estonian category buyers before launch.",
        "formula": "net_price = gross_price / (1 + vat_rate)",
        "input_claim_ids": ["vat-current"],
    }

    validation = validate_research_prd(
        content,
        prd_type=COMMERCIAL_MARKET_LAUNCH,
        critical_claim_quality=quality,
    )

    assert validation["status"] == "passed", validation["issues"]
