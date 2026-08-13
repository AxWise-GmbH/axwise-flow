"""Focused contracts for structured regional grounding and portable bundles."""

import asyncio
import hashlib
import os

import pytest

from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    CompanyDiscoveryItem,
    QuestionsData,
    SimulationConfig,
    SimulationRequest,
    SimulationResponse,
)
from backend.api.routes.orqaly_integration import OrqalyHybridAsyncRequest
from backend.domain.orchestration.models import ResearchPolicyV1
from backend.domain.market_scope import resolve_market_expression
from backend.services.orqaly_hybrid_run_service import HybridOutputs
from backend.services.orqaly_research_bundle_service import (
    HybridGroundingPolicy,
    _merge_market_evidence,
    _persona_rows,
    canonical_hash,
    canonical_json_string,
    complete_deferred_grounding_enrichment,
    collect_regional_grounding,
    derive_executor_role_specs,
    normalize_market_grounding,
    request_with_grounding,
)
from backend.services.research_source_authority_service import (
    build_recognized_root_proof,
)


pytestmark = pytest.mark.contract


def test_bundle_hash_normalizes_integral_floats_for_javascript_interop():
    assert canonical_hash({"score": 1.0, "values": [2.0, 2.5]}) == canonical_hash(
        {"score": 1, "values": [2, 2.5]}
    )


def test_bundle_customer_personas_exclude_explicit_executor_participants():
    result = SimulationResponse(
        success=True,
        message="complete",
        simulation_id="sim-bremen",
        empirical_personas=[
            {
                "name": "Jens Völkers, Managing Director",
                "stakeholder_intelligence": {
                    "stakeholder_type": "Problem experiencer"
                },
            },
            {
                "name": "Torsten Kröger, Compliance Specialist",
                "stakeholder_intelligence": {"stakeholder_type": "Executor"},
            },
        ],
    )

    rows = _persona_rows(result)

    assert [row["persona"]["name"] for row in rows] == [
        "Jens Völkers, Managing Director"
    ]


@pytest.mark.parametrize(
    ("value", "expected_json", "expected_hash"),
    [
        (
            {"small": 1e-7, "large": 1e21, "tiny": 1e-8},
            '{"large":1e+21,"small":1e-7,"tiny":1e-8}',
            "db9fd729ac62ed805253756c786953cbdf1288c6533f17e35416e78e5c9b7c3c",
        ),
        (
            {"x": 1e-6},
            '{"x":0.000001}',
            "2d6412ab0155bb89d63b73dbf83334b26b39d03e8c832cc253c6a6caceba9733",
        ),
        (
            {"x": 1e20},
            '{"x":100000000000000000000}',
            "356acd219b8c369fc389513fb5c3f9fc2977fff3c432bab9df5b1e3a2800b072",
        ),
        (
            {"x": 1.2345678901234567e20},
            '{"x":123456789012345670000}',
            "6b5c2916f5c67bcc553d09e90c13d71a945afa026d008ae1250e3bab48c17e2e",
        ),
        (
            {"\U0001f600": 1, "\ue000": 2},
            '{"\U0001f600":1,"\ue000":2}',
            "04208f6cdb854e2ab1b07dd3633a39dec854344fe72824cf7f2fdb4e2e33129e",
        ),
        (
            {"10": "ten", "2": "two", "01": "leading"},
            '{"2":"two","10":"ten","01":"leading"}',
            "ad4027e5ffdcdac0d2a1f9b9d6221a8cd1617dcbbc2bb36378d808974a0d6e60",
        ),
    ],
)
def test_bundle_hash_matches_key_sorted_javascript_json_stringify(
    value, expected_json, expected_hash
):
    assert canonical_json_string(value) == expected_json
    assert canonical_hash(value) == expected_hash


@pytest.mark.parametrize("value", [float("nan"), float("inf"), 2**53])
def test_bundle_hash_rejects_values_javascript_cannot_preserve_exactly(value):
    with pytest.raises(ValueError):
        canonical_hash({"value": value})


def _request(location="Bremen"):
    return SimulationRequest(
        business_context=BusinessContext(
            business_idea="Regional service research",
            target_customer="Bremen commercial buyers",
            problem="Commercial buyers lack verified local options",
            industry="professional services",
            location=location,
        ),
        questions_data=QuestionsData(stakeholders={}),
        config=SimulationConfig(people_per_stakeholder=1),
    )


@pytest.mark.asyncio
async def test_multi_market_grounding_runs_country_cells_concurrently_and_preserves_coverage(
    monkeypatch,
):
    scope = resolve_market_expression("BENELUX")
    request = _request("BENELUX").model_copy(
        update={
            "business_context": _request("BENELUX").business_context.model_copy(
                update={"market_scope": scope}
            )
        }
    )
    active = 0
    maximum_active = 0

    async def collect_cell(cell_request, _policy):
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.01)
        active -= 1
        location = cell_request.business_context.location
        code = {
            "Belgium": "BE",
            "Netherlands": "NL",
            "Luxembourg": "LU",
        }[location]
        sources = [
            {
                "source_id": f"source-{code}-{index}",
                "source_type": "google_search_result",
                "url": f"https://example.{code.casefold()}/{index}",
                "title": f"{location} source {index}",
                "source_authority": "official_public" if index == 0 else "independent_web",
            }
            for index in range(3)
        ]
        return {
            "market_sources": sources,
            "market_claims": [
                {
                    "claim_id": f"claim-{code}",
                    "claim_type": "market_fact",
                    "subject": location,
                    "predicate": "has_evidence",
                    "object": f"Evidence for {location}",
                    "source_ids": [sources[0]["source_id"]],
                }
            ],
            "company_count": 1,
            "routing_diagnostics": {
                "providers": [{"provider": "test"}],
                "required_evidence_classes": [
                    "statutory_current",
                    "official_statistic",
                ],
                "evidence_class_acquisition": {
                    "official_statistic": {
                        "attempted": 1,
                        "retrieved": 1,
                        "verified": 1,
                        "claim_extracted": 1,
                    }
                },
                "targeted_authority_attestation": {
                    "status": "timeout" if code == "LU" else "completed",
                    "host_count": 2,
                    "route_count": 4,
                    "candidate_count": 1,
                    "elapsed_ms": 25,
                    "deadline_ms": 90_000,
                },
                "statutory_recovery": {
                    "status": "timeout" if code == "LU" else "completed",
                    "route_count": 1,
                    "candidate_count": 2,
                    "retrieved_count": 1,
                    "verified_count": 1,
                    "accepted_verified_claims": 1 if code != "LU" else 0,
                    "elapsed_ms": 20 if code != "LU" else 40,
                    "deadline_ms": 90_000,
                },
            },
        }

    monkeypatch.setattr(
        "backend.services.orqaly_research_bundle_service._collect_single_market_grounding",
        collect_cell,
    )

    result = await collect_regional_grounding(
        request,
        HybridGroundingPolicy(required=True, minimum_structured_sources=3),
    )

    assert maximum_active == 3
    assert result["structured_source_count"] == 9
    assert [row["status"] for row in result["cell_coverage"]] == [
        "complete",
        "complete",
        "complete",
    ]
    assert {tuple(row["country_codes"]) for row in result["market_sources"]} == {
        ("BE",),
        ("NL",),
        ("LU",),
    }
    assert result["routing_diagnostics"]["required_evidence_classes"] == [
        "statutory_current",
        "official_statistic",
    ]
    assert result["routing_diagnostics"]["evidence_class_acquisition"][
        "official_statistic"
    ] == {
        "attempted": 3,
        "retrieved": 3,
        "verified": 3,
        "claim_extracted": 3,
    }
    assert result["routing_diagnostics"]["targeted_authority_attestation"] == {
        "status": "mixed",
        "cell_count": 3,
        "host_count": 6,
        "route_count": 12,
        "candidate_count": 3,
        "retrieved_count": 0,
        "verified_count": 0,
        "accepted_verified_claims": 0,
        "source_count": 0,
        "company_count": 0,
        "elapsed_ms": 25,
        "deadline_ms": 90_000,
    }
    assert result["routing_diagnostics"]["statutory_recovery"] == {
        "status": "mixed",
        "cell_count": 3,
        "host_count": 0,
        "route_count": 3,
        "candidate_count": 6,
        "retrieved_count": 3,
        "verified_count": 3,
        "accepted_verified_claims": 2,
        "source_count": 0,
        "company_count": 0,
        "elapsed_ms": 40,
        "deadline_ms": 90_000,
    }


def _company():
    return CompanyDiscoveryItem(
        id="grounded-gmbh",
        name="Grounded GmbH",
        industry="Professional services",
        size="10-50 employees",
        location="Bremen",
        latitude=53.0793,
        longitude=8.8017,
        decision_makers=[],
        estimated_pain_points=[],
        website="https://grounded.example/about",
        register_number="HRB 12345 HB",
        register_court="Amtsgericht Bremen",
        legal_form="GmbH",
        pain_point_sources=[
            "Regional market report: https://research.example/bremen-services",
            "No specific public evidence found",
        ],
    )


@pytest.mark.asyncio
async def test_deferred_company_enrichment_runs_once_after_gate_and_is_stripped():
    company = _company()

    class DeferredPipeline:
        def __init__(self):
            self.calls = 0
            self.market_sources = []
            self.market_claims = []

        async def complete_deferred_company_enrichment(self):
            self.calls += 1
            return [company]

    pipeline = DeferredPipeline()
    grounding = {
        "market_sources": [],
        "market_claims": [],
        "company_count": 0,
        "_deferred_company_enrichment": [
            {"pipeline": pipeline, "policy": HybridGroundingPolicy(required=True)}
        ],
    }
    completed = await complete_deferred_grounding_enrichment(
        grounding,
        HybridGroundingPolicy(required=True),
    )

    assert pipeline.calls == 1
    assert "_deferred_company_enrichment" not in completed
    assert completed["company_count"] == 1
    assert any(
        row["source_type"] == "official_company_website"
        for row in completed["market_sources"]
    )
    assert any(
        row["source_type"] == "google_search_result"
        for row in completed["market_sources"]
    )


def test_normalizes_only_structured_registry_and_real_url_sources_with_claim_links():
    result = normalize_market_grounding(
        [_company()], HybridGroundingPolicy(required=True)
    )

    assert result["structured_source_count"] == 3
    assert {source["source_type"] for source in result["market_sources"]} == {
        "company_registry",
        "official_company_website",
        "google_search_result",
    }
    assert all(claim["source_ids"] for claim in result["market_claims"])
    assert {claim["predicate"] for claim in result["market_claims"]} >= {
        "operates_in",
        "has_industry",
        "has_register_number",
        "has_website",
    }
    assert not any(
        "No specific public evidence" in str(source)
        for source in result["market_sources"]
    )


def test_allowed_source_types_are_enforced_before_required_grounding_count():
    result = normalize_market_grounding(
        [_company()],
        HybridGroundingPolicy(
            required=True,
            allowed_source_types=["company_registry"],
        ),
    )

    assert result["structured_source_count"] == 1
    assert result["market_sources"][0]["source_type"] == "company_registry"
    assert all(
        claim["source_ids"] == [result["market_sources"][0]["source_id"]]
        for claim in result["market_claims"]
    )


def test_combined_providers_cannot_inflate_source_count_with_duplicate_urls():
    policy = HybridGroundingPolicy(required=True, minimum_structured_sources=3)
    sources, claims = _merge_market_evidence(
        [
            {
                "source_id": "gemini-source",
                "source_type": "google_search_result",
                "url": "https://pta.agri.ee/en/?utm_source=google",
                "title": "Agriculture and Food Board",
            },
            {
                "source_id": "searx-source",
                "source_type": "google_search_result",
                "url": "https://pta.agri.ee/en",
                "title": "Same authority via a second route",
            },
        ],
        [
            {
                "claim_id": "claim-1",
                "claim_type": "market_rule",
                "subject": "Estonia",
                "predicate": "has_rule",
                "object": "Feed operators follow the applicable rules.",
                "source_ids": ["searx-source"],
            }
        ],
        policy,
    )

    assert len(sources) == 1
    assert sources[0]["source_id"] == "gemini-source"
    assert claims[0]["source_ids"] == ["gemini-source"]


def test_signed_direct_source_wins_duplicate_url_and_remaps_weak_claims():
    policy = HybridGroundingPolicy(required=True)
    os.environ.setdefault(
        "AXWISE_AUTHORITY_PROOF_SECRET", "test-authority-secret-32-bytes-minimum"
    )
    direct_text = "The current standard rate is 24 percent."
    signed_url = "https://tax.gov.ee/current-rate"
    proof = build_recognized_root_proof(
        direct_url=signed_url,
        direct_text=direct_text,
        country_codes=["EE"],
        retrieved_at="2026-08-13T00:00:00+00:00",
    )
    signature = proof["proof_signature"]
    sources, claims = _merge_market_evidence(
        [
            {
                "source_id": "company-parser-source",
                "source_type": "google_search_result",
                "url": signed_url,
                "source_authority": "independent_web",
                "research_cell_ids": ["country:EE"],
            },
            {
                "source_id": "signed-direct-source",
                "source_type": "google_search_result",
                "url": signed_url,
                "source_authority": "official_public",
                "authority_verification_status": "recognized_public_root_direct",
                "country_codes": ["EE"],
                "retrieved_at": "2026-08-13T00:00:00+00:00",
                "authority_proof": proof,
                # Exact production shape emitted by
                # B2BDataPipeline._store_direct_web_evidence.
                "authority_document": {
                    "artifact_type": "direct_authority_document",
                    "source_id": "signed-direct-source",
                    "sha256": hashlib.sha256(direct_text.encode()).hexdigest(),
                    "authority_proof_signature": signature,
                    "retrieved_at": "2026-08-13T00:00:00+00:00",
                },
            },
        ],
        [
            {
                "claim_id": "weak-claim",
                "claim_type": "market_rule",
                "subject": "Estonia",
                "predicate": "has_rule",
                "object": "The current standard rate is 24 percent.",
                "source_ids": ["company-parser-source"],
                "citation_metadata": {"source_id": "company-parser-source"},
            },
            {
                "claim_id": "signed-claim",
                "claim_type": "market_rule",
                "subject": "Estonia",
                "predicate": "has_rule",
                "object": "The current standard rate is 24 percent.",
                "source_ids": ["signed-direct-source"],
                "citation_metadata": {"source_id": "signed-direct-source"},
                "provenance_artifact": {
                    "artifact_type": "direct_authority_document",
                    "source_id": "signed-direct-source",
                    "sha256": "b" * 64,
                    "authority_proof_signature": signature,
                    "claim_binding": {
                        "source_id": "signed-direct-source",
                        "claim_proof_signature": "c" * 64,
                    },
                },
            },
        ],
        policy,
    )

    assert len(sources) == 1
    assert sources[0]["source_id"] == "signed-direct-source"
    assert sources[0]["authority_proof"]["proof_signature"] == signature
    assert sources[0]["research_cell_ids"] == ["country:EE"]
    assert sources[0]["country_codes"] == ["EE"]
    assert len(claims) == 1
    assert claims[0]["source_ids"] == ["signed-direct-source"]
    assert claims[0]["citation_metadata"]["source_id"] == "signed-direct-source"
    assert claims[0]["provenance_artifact"]["source_id"] == "signed-direct-source"
    assert claims[0]["provenance_artifact"]["claim_binding"]["source_id"] == (
        "signed-direct-source"
    )


def test_malformed_document_metadata_cannot_displace_valid_signed_duplicate():
    policy = HybridGroundingPolicy(required=True)
    direct_text = "The current standard rate is 24 percent."
    url = "https://tax.gov.ee/current-rate"
    retrieved_at = "2026-08-13T00:00:00+00:00"
    proof = build_recognized_root_proof(
        direct_url=url,
        direct_text=direct_text,
        country_codes=["EE"],
        retrieved_at=retrieved_at,
    )
    signature = proof["proof_signature"]
    malformed = {
        "source_id": "malformed-first",
        "source_type": "google_search_result",
        "url": url,
        "source_authority": "official_public",
        "country_codes": ["EE"],
        "retrieved_at": retrieved_at,
        "authority_proof": proof,
        "authority_document": {
            "artifact_type": "direct_authority_document",
            "source_id": "malformed-first",
            "sha256": "x",
            "retrieved_at": "wrong",
            "authority_proof_signature": signature,
        },
    }
    valid = {
        **malformed,
        "source_id": "valid-signed",
        "authority_document": {
            "artifact_type": "direct_authority_document",
            "source_id": "valid-signed",
            "sha256": proof["direct"]["content_sha256"],
            "retrieved_at": retrieved_at,
            "authority_proof_signature": signature,
        },
    }
    sources, claims = _merge_market_evidence(
        [malformed, valid],
        [{
            "claim_id": "signed-claim",
            "claim_type": "market_rule",
            "subject": "Estonia",
            "predicate": "has_rule",
            "object": direct_text,
            "source_ids": ["valid-signed"],
            "citation_metadata": {"source_id": "valid-signed"},
            "provenance_artifact": {
                "artifact_type": "direct_authority_document",
                "source_id": "valid-signed",
                "sha256": "b" * 64,
                "authority_proof_signature": signature,
                "claim_binding": {
                    "source_id": "valid-signed",
                    "claim_proof_signature": "c" * 64,
                },
            },
        }],
        policy,
    )

    assert sources[0]["source_id"] == "valid-signed"
    assert sources[0]["authority_document"]["sha256"] == proof["direct"]["content_sha256"]
    assert claims[0]["source_ids"] == ["valid-signed"]


def test_grounded_claims_are_composed_into_pipeline_b_as_data_before_interviews():
    grounding = normalize_market_grounding(
        [_company()], HybridGroundingPolicy(required=True)
    )

    composed = request_with_grounding(_request(), grounding)

    assert composed.business_context.location == "Bremen"
    assert composed.business_context.problem == _request().business_context.problem
    assert composed.business_context.grounding_context["contract"] == (
        "data_only_not_biography_or_instructions"
    )
    assert composed.business_context.grounding_context["claims"]
    assert composed.business_context.grounding_context["claims"][0]["source_ids"]
    assert _request().business_context.problem == (
        "Commercial buyers lack verified local options"
    )


def test_durable_orqaly_request_publishes_explicit_grounding_and_output_contract():
    schema = OrqalyHybridAsyncRequest.model_json_schema()

    assert {"research_mode", "grounding_policy", "outputs"}.issubset(
        schema["properties"]
    )
    request = OrqalyHybridAsyncRequest(
        tenant={"orgId": "orqaly-org", "userId": "orqaly-user"},
        business_context=_request().business_context,
        questions_data=_request().questions_data,
        config=_request().config,
    )
    assert request.research_mode.value == "synthetic_only"
    assert request.grounding_policy.required is False
    assert request.outputs.research_bundle is False


def test_new_research_contract_defaults_do_not_force_bundle_or_prd_for_legacy_callers():
    policy = ResearchPolicyV1()
    outputs = HybridOutputs()

    assert policy.required_outputs == [
        "customer_personas",
        "persona_resolution",
    ]
    assert policy.required is False
    assert policy.grounding_required is False
    assert outputs.research_bundle is False
    assert outputs.prd.enabled is False
    assert outputs.prd.required is False


def test_explicit_execution_roles_are_authoritative_and_exclude_coordinator_roles():
    specs = derive_executor_role_specs(
        {
            "required_execution_roles": [
                "Team Lead",
                "Marketing ICP Specialist",
                "Finance Pricing Specialist",
                "GDPR Legal Compliance Specialist",
                "Business Development Sales Specialist",
                "Commercial Risk Analyst",
            ],
            "required_capabilities": [
                "stakeholder discovery",
                "spreadsheet modelling",
            ],
        },
        {},
    )

    assert {item["role"] for item in specs} == {
        "Marketing ICP Specialist",
        "Finance Pricing Specialist",
        "GDPR Legal Compliance Specialist",
        "Business Development Sales Specialist",
        "Commercial Risk Analyst",
    }
    assert {item["playbook_role"] for item in specs} == {
        "Marketing ICP Research",
        "Finance Pricing",
        "GDPR Legal Compliance",
        "Business Development Sales",
        "Commercial Risk",
    }
    assert all(
        item["derivation"] == "research_brief.required_execution_roles"
        for item in specs
    )


def test_legacy_bremen_capabilities_map_only_through_bounded_role_aliases():
    specs = derive_executor_role_specs(
        {
            "required_capabilities": [
                "German Market Localization Specialist",
                "Commercial Pricing Analyst",
                "EU Regulatory & GDPR Compliance Lead",
                "B2B Go-To-Market Strategist",
                "Commercial Risk Analysis",
            ]
        },
        {},
    )

    assert [item["role"] for item in specs] == [
        "Marketing ICP Research",
        "Finance Pricing",
        "GDPR Legal Compliance",
        "Business Development Sales",
        "Commercial Risk",
    ]
    assert all(
        item["derivation"] == "bounded_required_capability_alias"
        for item in specs
    )


def test_arbitrary_capabilities_remain_on_one_ideal_profile():
    capabilities = [
        "Python",
        "structured interviews",
        "spreadsheet modelling",
        "stakeholder facilitation",
    ]

    specs = derive_executor_role_specs(
        {"required_capabilities": capabilities},
        {"ideal_agent_persona": {"role": "Research Analyst"}},
    )

    assert specs == [
        {
            "role": "Research Analyst",
            "playbook_role": "Research Analyst",
            "derivation": "single_ideal_profile_fallback",
            "source_capabilities": capabilities,
        }
    ]
