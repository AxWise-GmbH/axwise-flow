from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    EvidenceAcquisitionPassV1,
    EvidenceClaimV1,
    EvidenceRequirement,
    PlanningResultV2,
    ResearchResultV2,
    ResearchSourceV1,
    SelectedEvidenceArtifactV1,
    SynthesizeArtifactInputV1,
    SourceSpan,
    WorkflowOutputContractV1,
    artifact_content_hash,
    canonical_hash,
    canonical_json,
    utf16_slice,
)
from backend.services.workflow_v2.operation_store import _stored_envelope_payload


pytestmark = pytest.mark.contract
GOLDEN = Path(__file__).with_name("fixtures") / "canonical_v1_golden.json"
COMPILE_SCOPE_ENVELOPE = (
    Path(__file__).with_name("fixtures") / "compile_scope_envelope_v2.json"
)
SYNTHESIZE_ARTIFACT_GOLDEN = (
    Path(__file__).with_name("fixtures") / "synthesize_artifact_v1_golden.json"
)


def test_canonical_v1_shared_golden_vectors_and_utf16_span() -> None:
    fixture = json.loads(GOLDEN.read_text(encoding="utf-8"))
    for vector in fixture["vectors"]:
        assert canonical_json(vector["value"]) == vector["canonical"]
        assert canonical_hash(vector["value"]) == vector["sha256"]

    span = fixture["sourceSpan"]
    exact = utf16_slice(span["source"], span["start"], span["end"])
    assert exact == span["text"]
    assert hashlib.sha256(exact.encode("utf-8")).hexdigest() == span["sha256"]
    assert SourceSpan.model_validate(
        {key: value for key, value in span.items() if key != "source"}
    ).offset_unit == "utf16_code_units"


@pytest.mark.parametrize(
    "value",
    [
        1.5,
        9_007_199_254_740_992,
        "\ud800",
        "\udc00",
        {"\ud800": "bad"},
        ("tuple-is-not-json",),
    ],
)
def test_canonical_v1_rejects_cross_language_ambiguity(value) -> None:
    with pytest.raises(TypeError):
        canonical_json(value)


def test_compile_scope_envelope_matches_shared_javascript_fixture() -> None:
    fixture = json.loads(COMPILE_SCOPE_ENVELOPE.read_text(encoding="utf-8"))
    envelope = AxWiseOperationEnvelope.model_validate(fixture)

    assert envelope.operation_type == "CompileScopeV2"
    assert "mode" not in fixture["input"]
    assert fixture["input"]["safeDefaults"] == {
        "geography": [],
        "acceptedSourceTypes": [],
        "assumptions": [],
        "limits": [],
        "policies": [],
    }
    assert canonical_hash(fixture["input"]) == fixture["canonicalInputHash"]


def test_synthesize_artifact_inputs_and_results_match_shared_javascript_golden() -> None:
    fixture = json.loads(SYNTHESIZE_ARTIFACT_GOLDEN.read_text(encoding="utf-8"))
    result_adapter = TypeAdapter(CompletionResult)
    assert [case["name"] for case in fixture["cases"]] == [
        "execute_task",
        "evaluate_output_repair",
        "evaluate_output_direct_promotion",
        "final_synthesis",
        "blocked_report",
    ]
    for case in fixture["cases"]:
        parsed_input = SynthesizeArtifactInputV1.model_validate(case["input"])
        assert canonical_hash(case["input"]) == case["canonicalInputHash"]
        assert parsed_input.model_dump(
            mode="json", by_alias=True, exclude_unset=True
        ) == case["input"]
        envelope = AxWiseOperationEnvelope.model_validate(
            {
                "operationId": "00000000-0000-4000-8000-000000000901",
                "operationType": "SynthesizeArtifactV1",
                "owner": {
                    "tenantId": "00000000-0000-4000-8000-000000000902",
                    "organizationId": None,
                    "userId": "user_goldencontract123",
                },
                "workflow": {
                    "runId": "00000000-0000-4000-8000-000000000903",
                    "stageId": "00000000-0000-4000-8000-000000000904",
                    "stageAttemptId": "00000000-0000-4000-8000-000000000905",
                },
                "contractVersion": "axwise.operation.v2",
                "canonicalInputHash": case["canonicalInputHash"],
                "input": case["input"],
            }
        )
        assert envelope.model_dump(
            mode="json", by_alias=True, exclude_unset=True
        )["input"] == case["input"]
        assert all(
            key not in case["input"]
            for key in {
                "acceptedPlan",
                "task",
                "taskArtifacts",
                "evaluation",
            }
            - {
                "execute_task": {"acceptedPlan", "task"},
                "evaluate_output": {"acceptedPlan", "taskArtifacts"},
                "final_synthesis": {
                    "acceptedPlan",
                    "taskArtifacts",
                    "evaluation",
                },
                "blocked_report": set(),
            }[case["purpose"]]
        )
        parsed_result = result_adapter.validate_python(case["result"])
        assert parsed_result.model_dump(
            mode="json", by_alias=True, exclude_unset=True
        ) == case["result"]


def _synthesis_case(name: str) -> dict:
    fixture = json.loads(SYNTHESIZE_ARTIFACT_GOLDEN.read_text(encoding="utf-8"))
    return deepcopy(next(case for case in fixture["cases"] if case["name"] == name))


def _change_top_level_reference_kind(
    value: dict, field: str, kind: str, *, index: int | None = None
) -> None:
    reference = value[field] if index is None else value[field][index]
    artifact_id = reference["artifactId"]
    reference["kind"] = kind
    for source in value["sourceArtifacts"]:
        if source["artifactId"] == artifact_id:
            source["kind"] = kind
    for content in value["artifactContents"]:
        if content["artifact"]["artifactId"] == artifact_id:
            content["artifact"]["kind"] = kind


@pytest.mark.parametrize(
    ("case_name", "field", "index", "wrong_kind"),
    [
        ("execute_task", "acceptedScope", None, "task_result"),
        ("execute_task", "research", None, "scope"),
        ("execute_task", "acceptedPlan", None, "research"),
        ("evaluate_output_repair", "taskArtifacts", 0, "evaluation"),
        ("final_synthesis", "evaluation", None, "task_result"),
    ],
)
def test_synthesize_purpose_boundary_rejects_wrong_artifact_kinds(
    case_name: str, field: str, index: int | None, wrong_kind: str
) -> None:
    input_payload = _synthesis_case(case_name)["input"]
    _change_top_level_reference_kind(
        input_payload, field, wrong_kind, index=index
    )

    with pytest.raises(ValidationError):
        SynthesizeArtifactInputV1.model_validate(input_payload)


def test_synthesize_source_appendix_authority_equals_research_catalogue() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    assert input_payload["outputContract"]["sourceAppendixRequired"] is False
    input_payload["outputContract"]["sourceAppendixRequired"] = True

    with pytest.raises(ValidationError, match="source appendix authority"):
        SynthesizeArtifactInputV1.model_validate(input_payload)


def test_execute_task_requires_exact_core_references_not_matching_ids_only() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    input_payload["acceptedScope"]["artifactHash"] = "f" * 64

    with pytest.raises(ValidationError, match="scope, research, plan"):
        SynthesizeArtifactInputV1.model_validate(input_payload)


def test_operation_store_normalizes_defaults_but_preserves_strict_synthesis_omission() -> None:
    explicit_payload = json.loads(COMPILE_SCOPE_ENVELOPE.read_text(encoding="utf-8"))
    omitted_payload = deepcopy(explicit_payload)
    omitted_payload["input"].pop("objectiveOnlyContext")
    omitted_payload["input"].pop("safeDefaults")
    explicit = AxWiseOperationEnvelope.model_validate(explicit_payload)
    omitted = AxWiseOperationEnvelope.model_validate(omitted_payload)

    assert _stored_envelope_payload(explicit) == _stored_envelope_payload(omitted)

    synthesis_case = _synthesis_case("evaluate_output_repair")
    synthesis = AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000911",
            "operationType": "SynthesizeArtifactV1",
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000912",
                "organizationId": None,
                "userId": "user_storecontract123",
            },
            "workflow": {
                "runId": "00000000-0000-4000-8000-000000000913",
                "stageId": "00000000-0000-4000-8000-000000000914",
                "stageAttemptId": "00000000-0000-4000-8000-000000000915",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": synthesis_case["canonicalInputHash"],
            "input": synthesis_case["input"],
        }
    )
    stored = _stored_envelope_payload(synthesis)
    assert stored["input"] == synthesis_case["input"]
    scope_payload = next(
        content["payload"]
        for content in stored["input"]["artifactContents"]
        if content["artifact"]["kind"] == "scope"
    )
    assert "materialClarification" in scope_payload
    assert scope_payload["materialClarification"] is None


def test_planning_result_rejects_dependency_cycles() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    plan = deepcopy(
        next(
            content["payload"]
            for content in input_payload["artifactContents"]
            if content["artifact"]["kind"] == "plan"
        )
    )
    core = next(task for task in plan["tasks"] if task["taskKind"] == "core_draft")
    specialist = next(
        task for task in plan["tasks"] if task["taskKind"] == "specialist_analysis"
    )
    specialist["dependsOnStageKeys"] = [core["stageKey"]]
    for task in plan["tasks"]:
        task["inputHash"] = canonical_hash(
            {key: value for key, value in task.items() if key != "inputHash"}
        )
    plan["planHash"] = canonical_hash(
        {key: value for key, value in plan.items() if key != "planHash"}
    )

    with pytest.raises(ValidationError, match="acyclic DAG"):
        PlanningResultV2.model_validate(plan)


def _claim(text: str, response: str) -> dict:
    source_types = ["grounded_web"]
    source_urls = ["https://example.test/source"]
    response_bytes = response.encode("utf-8")
    claim_bytes = text.encode("utf-8")
    start = response_bytes.index(claim_bytes)
    return {
        "claimId": canonical_hash(
            {"text": text, "sourceTypes": source_types, "sourceUrls": source_urls}
        ),
        "text": text,
        "textSha256": hashlib.sha256(claim_bytes).hexdigest(),
        "sourceUrls": source_urls,
        "sourceTypes": source_types,
        "providerResponseHash": hashlib.sha256(response_bytes).hexdigest(),
        "segmentStart": start,
        "segmentEnd": start + len(claim_bytes),
        "offsetUnit": "utf8_bytes",
    }


def test_acquisition_claim_proves_exact_utf8_provider_response_slice() -> None:
    response = "Prefix — exact 😀 claim — suffix"
    claim = _claim("exact 😀 claim", response)
    parsed = EvidenceAcquisitionPassV1.model_validate(
        {
            "requirementId": "market-fact",
            "passNumber": 0,
            "queryHash": "a" * 64,
            "providerResponseHash": hashlib.sha256(response.encode("utf-8")).hexdigest(),
            "providerResponseText": response,
            "claims": [claim],
            "sourceTypesSeen": ["grounded_web"],
        }
    )
    assert parsed.claims == [EvidenceClaimV1.model_validate(claim)]

    changed = parsed.model_dump(mode="json", by_alias=True)
    changed["providerResponseText"] = response.replace("claim", "claimX")
    with pytest.raises(ValidationError, match="provider response hash"):
        EvidenceAcquisitionPassV1.model_validate(changed)


def test_evidence_claim_rejects_noncanonical_or_private_source_url() -> None:
    claim = _claim("Exact claim", "Exact claim")
    claim["sourceUrls"] = ["https://127.0.0.1/private"]
    claim["claimId"] = canonical_hash(
        {
            "text": claim["text"],
            "sourceTypes": claim["sourceTypes"],
            "sourceUrls": claim["sourceUrls"],
        }
    )

    with pytest.raises(ValidationError, match="canonical public HTTPS"):
        EvidenceClaimV1.model_validate(claim)


def test_blocking_requirement_needs_an_authoritative_source_class() -> None:
    with pytest.raises(ValidationError, match="authoritative accepted source"):
        EvidenceRequirement.model_validate(
            {
                "id": "unsafe-block",
                "claimType": "commercial_offer",
                "description": "A commercial detail cannot globally block delivery.",
                "criticality": "blocking",
                "evidenceRole": "grounded_claim",
                "verificationBasis": "grounded_claims",
                "appliesWhen": "always",
                "acceptedSourceTypes": ["grounded_web", "industry"],
            }
        )


def test_evidence_requirement_requires_typed_verification_basis() -> None:
    base = {
        "id": "exact-product-proof",
        "claimType": "product_certificate",
        "description": "An exact product certificate.",
        "criticality": "blocking",
        "evidenceRole": "selected_artifact_proof",
        "appliesWhen": "before launch",
        "acceptedSourceTypes": ["government", "standard"],
    }
    with pytest.raises(ValidationError, match="Field required"):
        EvidenceRequirement.model_validate(base)

    parsed = EvidenceRequirement.model_validate(
        {**base, "verificationBasis": "selected_evidence"}
    )
    assert parsed.verification_basis == "selected_evidence"


@pytest.mark.parametrize(
    ("evidence_role", "verification_basis"),
    [
        ("grounded_claim", "selected_evidence"),
        ("selected_artifact_proof", "grounded_claims"),
        ("future_authorization_proof", "grounded_claims"),
    ],
)
def test_evidence_role_fail_closed_to_its_typed_verification_basis(
    evidence_role: str,
    verification_basis: str,
) -> None:
    with pytest.raises(ValidationError, match="exact typed verificationBasis"):
        EvidenceRequirement.model_validate(
            {
                "id": "typed-evidence-role",
                "claimType": "product_safety_record",
                "description": "Verify the exact evidence using its typed authority.",
                "criticality": "blocking",
                "evidenceRole": evidence_role,
                "verificationBasis": verification_basis,
                "appliesWhen": "The accepted scope requires the fact.",
                "acceptedSourceTypes": ["government", "standard"],
            }
        )


def test_only_ready_launch_authorization_contract_can_allow_launch_readiness() -> None:
    requirement_id = "req-0123456789abcdef"
    criterion_core = {
        "given": "The exact accepted evidence is available.",
        "when": "The launch authorization is evaluated.",
        "then": "The decision binds the exact evidence without overclaiming.",
        "supports": [requirement_id],
    }
    base = {
        "format": "text/markdown",
        "requiredSections": ["Decision"],
        "requirementIds": [requirement_id],
        "rubric": ["Bind the exact evidence and decision."],
        "acceptanceCriteria": [
            {
                "id": f"acc-{canonical_hash(criterion_core)[:16]}",
                **criterion_core,
            }
        ],
        "evidenceReadiness": "ready",
        "sourceAppendixRequired": False,
    }

    WorkflowOutputContractV1.model_validate(
        {
            **base,
            "artifactType": "product_prd",
            "launchReadyAllowed": False,
        }
    )
    WorkflowOutputContractV1.model_validate(
        {
            **base,
            "artifactType": "launch_authorization",
            "launchReadyAllowed": True,
        }
    )
    with pytest.raises(ValidationError, match="ready launch_authorization"):
        WorkflowOutputContractV1.model_validate(
            {
                **base,
                "artifactType": "product_prd",
                "launchReadyAllowed": True,
            }
        )
    with pytest.raises(ValidationError, match="ready launch_authorization"):
        WorkflowOutputContractV1.model_validate(
            {
                **base,
                "artifactType": "launch_authorization",
                "launchReadyAllowed": False,
            }
        )


@pytest.mark.parametrize(
    "host",
    [
        "127.0.0.1",
        "localhost",
        "service.local",
        "metadata.google.internal",
        "EXAMPLE.COM",
        "https://example.com",
        "*.example.com",
    ],
)
def test_evidence_requirement_rejects_nonpublic_or_noncanonical_allowed_hosts(
    host: str,
) -> None:
    with pytest.raises(ValidationError, match="allowed source host"):
        EvidenceRequirement.model_validate(
            {
                "id": "publisher-policy",
                "claimType": "publisher_restricted_fact",
                "description": "Use only the exact accepted publisher.",
                "criticality": "nonblocking",
                "evidenceRole": "grounded_claim",
                "verificationBasis": "grounded_claims",
                "appliesWhen": "the fact is included",
                "acceptedSourceTypes": ["grounded_web"],
                "allowedSourceHosts": [host],
            }
        )


def test_evidence_requirement_accepts_sorted_public_publisher_hosts() -> None:
    parsed = EvidenceRequirement.model_validate(
        {
            "id": "publisher-policy",
            "claimType": "publisher_restricted_fact",
            "description": "Use only the exact accepted publishers.",
            "criticality": "nonblocking",
            "evidenceRole": "grounded_claim",
            "verificationBasis": "grounded_claims",
            "appliesWhen": "the fact is included",
            "acceptedSourceTypes": ["grounded_web"],
            "allowedSourceHosts": ["eur-lex.europa.eu", "postgresql.org"],
        }
    )
    assert parsed.allowed_source_hosts == ["eur-lex.europa.eu", "postgresql.org"]


@pytest.mark.parametrize(
    "retrieval_date",
    [
        "2026-08-28T12:00:00+00:00",
        "2026-08-28T12:00Z",
        "2026-08-28 12:00:00Z",
        "2026-02-30T12:00:00Z",
        "2026-08-28T12:00:00.1234567Z",
    ],
)
def test_research_source_requires_exact_real_rfc3339_utc_timestamp(
    retrieval_date: str,
) -> None:
    core = {
        "sourceTitle": "Exact publisher snapshot",
        "canonicalUrl": "https://example.com/source",
        "sourceClasses": ["grounded_web"],
        "retrievalDate": retrieval_date,
    }
    with pytest.raises(ValidationError):
        ResearchSourceV1.model_validate(
            {
                "sourceId": canonical_hash(core),
                **core,
                "supportedClaimIds": ["a" * 64],
            }
        )


def test_source_catalogue_allows_distinct_snapshots_of_the_same_url() -> None:
    claim = _claim("Exact claim", "Exact claim")
    sources = []
    for title, retrieval_date in (
        ("Snapshot one", "2026-08-28T12:00:00Z"),
        ("Snapshot two", "2026-08-28T13:00:00.123456Z"),
    ):
        core = {
            "sourceTitle": title,
            "canonicalUrl": claim["sourceUrls"][0],
            "sourceClasses": ["grounded_web"],
            "retrievalDate": retrieval_date,
        }
        sources.append(
            {
                "sourceId": canonical_hash(core),
                **core,
                "supportedClaimIds": [claim["claimId"]],
            }
        )
    sources.sort(key=lambda source: source["sourceId"])
    parsed = SelectedEvidenceArtifactV1.model_validate(
        {
            "schemaVersion": "axwise.evidence.v1",
            "requirementId": "same-url-snapshots",
            "applicability": "applicable",
            "claims": [claim],
            "conflicts": [],
            "sourceCatalogue": sources,
        }
    )
    assert len(parsed.source_catalogue) == 2
    assert len({source.canonical_url for source in parsed.source_catalogue}) == 1


def test_not_applicable_selected_evidence_cannot_carry_claims_or_sources() -> None:
    claim = _claim("Exact claim", "Exact claim")
    core = {
        "sourceTitle": "Exact source",
        "canonicalUrl": claim["sourceUrls"][0],
        "sourceClasses": ["grounded_web"],
        "retrievalDate": "2026-08-28T12:00:00Z",
    }
    with pytest.raises(ValidationError, match="not-applicable evidence"):
        SelectedEvidenceArtifactV1.model_validate(
            {
                "schemaVersion": "axwise.evidence.v1",
                "requirementId": "not-applicable-fact",
                "applicability": "not_applicable",
                "claims": [claim],
                "conflicts": [],
                "sourceCatalogue": [
                    {
                        "sourceId": canonical_hash(core),
                        **core,
                        "supportedClaimIds": [claim["claimId"]],
                    }
                ],
            }
        )


def test_research_gap_and_conflict_summaries_are_exact_finding_derivations() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    research = deepcopy(
        next(
            content["payload"]
            for content in input_payload["artifactContents"]
            if content["artifact"]["kind"] == "research"
        )
    )
    finding = research["findings"][0]
    finding.update(
        {
            "status": "missing",
            "blocking": False,
            "note": "Optional market evidence remains missing.",
        }
    )
    research.update(
        {
            "readiness": "ready_with_gaps",
            "gaps": [finding["note"]],
            "conflicts": [],
        }
    )
    ResearchResultV2.model_validate(research)

    missing_summary = deepcopy(research)
    missing_summary["gaps"] = []
    with pytest.raises(ValidationError, match="gaps must exactly summarize"):
        ResearchResultV2.model_validate(missing_summary)

    finding.update(
        {
            "status": "conflicting",
            "blocking": True,
            "note": "Verified legal evidence conflicts.",
        }
    )
    research.update(
        {
            "readiness": "blocked",
            "gaps": [],
            "conflicts": [finding["note"]],
        }
    )
    ResearchResultV2.model_validate(research)

    missing_conflict_summary = deepcopy(research)
    missing_conflict_summary["conflicts"] = []
    with pytest.raises(ValidationError, match="conflicts must exactly summarize"):
        ResearchResultV2.model_validate(missing_conflict_summary)


def test_duplicate_claim_id_requires_identical_immutable_claim_content() -> None:
    acquired = _claim("Exact claim", "Exact claim")
    selected = {
        **acquired,
        "providerResponseHash": None,
        "segmentStart": None,
        "segmentEnd": None,
        "offsetUnit": None,
    }
    core = {
        "sourceTitle": "Exact source",
        "canonicalUrl": acquired["sourceUrls"][0],
        "sourceClasses": ["grounded_web"],
        "retrievalDate": "2026-08-28T12:00:00Z",
    }
    with pytest.raises(ValidationError, match="identical immutable content"):
        SelectedEvidenceArtifactV1.model_validate(
            {
                "schemaVersion": "axwise.evidence.v1",
                "requirementId": "claim-conflict",
                "applicability": "applicable",
                "claims": [selected, acquired],
                "conflicts": [],
                "sourceCatalogue": [
                    {
                        "sourceId": canonical_hash(core),
                        **core,
                        "supportedClaimIds": [acquired["claimId"]],
                    }
                ],
            }
        )


def test_artifact_hash_is_exact_content_envelope_not_payload_only() -> None:
    payload = {"markdown": "# Hé😀"}
    assert artifact_content_hash(
        content_type="text/markdown", payload=payload, markdown="# Hé😀"
    ) == "6d43ff830cee40ccaee305ce2b5c8b227385f05823db241a0071f52accff9cf8"
    assert canonical_hash(payload) != artifact_content_hash(
        content_type="text/markdown", payload=payload, markdown="# Hé😀"
    )
