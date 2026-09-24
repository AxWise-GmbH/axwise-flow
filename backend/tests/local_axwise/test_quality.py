"""Review gates and immutable prior-artifact handoffs; no inference required."""

import copy
import json
import unittest

from backend.services.local_axwise.kernel import finalize, prepare
from backend.services.local_axwise.quality import (
    CRITERIA,
    prepare_repair,
    prepare_review,
    validate_review,
)
from backend.services.local_axwise.worker import dispatch
from backend.tests.local_axwise.fixtures import candidate, inputs
from backend.tests.local_axwise.test_pipeline_integration import (
    scope_host, personas_host, market_host, prd_host, delivery_candidate,
)
from backend.tests.local_axwise.test_personas import chat_input, chat_candidate


def review_candidate(tool, fail=None):
    return {"checks": [
        {"criterion": key, "passed": key != fail,
         "reason": "The selected evidence and scope are respected." if key != fail
         else "The candidate echoes excerpts without extracting their shared implication."}
        for key in CRITERIA[tool]
    ]}


def review_fixtures():
    """Real finalized artifacts for every reviewed tool, without provider calls."""
    for tool in ("analyze_interviews", "create_prd"):
        value = inputs()[tool]
        proposed = candidate(tool, value)
        yield tool, value, proposed, finalize(tool, value, proposed)["artifact"], None
    scope = scope_host()
    yield "prepare_discovery", scope["selectedInput"], scope["candidate"], scope["artifact"], None
    market = market_host()
    yield "research_market", market["selectedInput"], market["candidate"], market["artifact"], None
    cohort = personas_host(scope)
    yield "generate_personas", cohort["selectedInput"], cohort["candidate"], cohort["artifact"], [scope]
    value = chat_input(cohort)
    proposed = chat_candidate(value)
    artifact = finalize("chat_with_persona", value, proposed, host_evidence=[cohort])["artifact"]
    yield "chat_with_persona", value, proposed, artifact, [cohort]
    prd = prd_host()
    value = {"references": [prd["reference"]]}
    proposed = delivery_candidate(value, [prd])
    artifact = finalize("create_delivery_brief", value, proposed, host_evidence=[prd])["artifact"]
    yield "create_delivery_brief", value, proposed, artifact, [prd]


def frozen_analysis(synthetic=False):
    value = inputs()["analyze_interviews"]
    if synthetic:
        value["transcripts"][0]["origin"] = "synthetic_transcript"
        value["transcripts"][0]["turns"][0]["questionId"] = "original-q1"
    proposed = candidate("analyze_interviews", value)
    result = finalize("analyze_interviews", value, proposed)
    reference = {"operationId": "00000000-0000-4000-8000-000000000001", "sha256": "a" * 64}
    evidence = {"input": value, "candidate": proposed, "artifact": result["artifact"],
                "reference": reference}
    prd_input = {"brief": "Propose a small handoff pilot with testable acceptance.",
                 "analysisArtifact": reference}
    payload = json.loads(prepare("create_prd", prd_input, evidence)["userPrompt"])
    finding = payload["analysisFindings"][0]
    proposed_prd = {
        "title": "Handoff pilot",
        "sections": [{"heading": heading, "items": [{
            "text": "P1: the operator can transfer an update without retyping; accept when a one-week pilot reduces duplicate updates by 20%, baseline to be measured first.",
            "basis": "simulation_hypothesis" if synthetic else "proposal",
            "sourceIds": finding["sourceIds"], "findingIds": [finding["findingId"]],
        }]} for heading in payload["requiredSections"]],
    }
    return prd_input, evidence, proposed_prd


def frozen_analysis_with_uncertainty():
    value, evidence, proposed = frozen_analysis(synthetic=True)
    evidence["input"]["questions"].append("What adoption constraints remain unknown?")
    evidence["candidate"]["findings"].append({
        "key": "unknown-adoption", "category": "need",
        "statement": "Mechanic adoption and email integration constraints remain untested.",
        "basis": "simulation_hypothesis", "supportStatus": "insufficient",
        "quoteKeys": [], "questionIds": ["q2"],
        "participantRefs": copy.deepcopy(evidence["candidate"]["findings"][0]["participantRefs"]),
    })
    evidence["candidate"]["gaps"].append({
        "code": "insufficient_evidence", "questionId": "q2", "participantRef": None,
        "output": None, "message": "Test adoption and integration before committing scope.",
    })
    evidence["artifact"] = finalize("analyze_interviews", evidence["input"], evidence["candidate"])["artifact"]
    finding = json.loads(prepare("create_prd", value, evidence)["userPrompt"])["analysisFindings"][0]
    for section in proposed["sections"]:
        for item in section["items"]:
            item["findingIds"], item["sourceIds"] = [finding["findingId"]], finding["sourceIds"]
    return value, evidence, proposed


class QualityTests(unittest.TestCase):
    def test_review_distinguishes_structural_links_from_semantic_support(self):
        value = inputs()["create_prd"]
        artifact = finalize("create_prd", value, candidate("create_prd", value))["artifact"]
        prompt = prepare_review("create_prd", value, artifact)["systemPrompt"]
        self.assertIn("circular, not independent corroboration", prompt)
        self.assertIn("does not establish user pain", prompt)
        self.assertIn("Unconfirmed implementation choices remain optional", prompt)
        self.assertIn("a covered mapping must really test its exact constraint", prompt)
        self.assertIn("Generated personas cannot stand in for real people", prompt)
        self.assertIn("Scenario rehearsal can refine questions", prompt)
        self.assertIn("flag a PRD's simulated-persona validation plan as needing correction", prompt)
        self.assertIn("Separate simulated scenario rehearsal from empirical validation", prepare("create_prd", value)["systemPrompt"])

    def test_conflict_requires_its_own_matching_gap_not_an_unrelated_gap(self):
        tool = "analyze_interviews"
        value = inputs()[tool]
        value["questions"] = ["What delays work?", "Which workflow choices conflict?", "What remains unknown?"]
        proposed = candidate(tool, value)
        supported = copy.deepcopy(proposed["findings"][0])
        supported["key"] = "supported-source"
        proposed["findings"][0].update(supportStatus="conflicting", questionIds=["q2"])
        proposed["findings"].append(supported)
        proposed["gaps"] = [{
            "code": "insufficient_evidence", "questionId": "q3", "participantRef": None,
            "output": None, "message": "No measured copying baseline; measure it during the pilot.",
        }]
        failure = dispatch({"id": 1, "operation": "finalize", "tool": tool, "input": value, "response": proposed})
        self.assertEqual(failure["error"]["diagnostics"], ["MISSING_CONFLICT_GAP"])
        repair = prepare_repair(tool, value, proposed, diagnostics=failure["error"]["diagnostics"])
        guidance = json.loads(repair["userPrompt"])["repair"]["validationRepairGuidance"]
        self.assertIn("Keep genuine conflicting findings", guidance[0])
        proposed["gaps"].append({
            "code": "conflicting_evidence", "questionId": "q2", "participantRef": None,
            "output": None, "message": "Assignment preferences remain unresolved; test explicit choice with each role.",
        })
        accepted = finalize(tool, value, proposed)
        self.assertEqual(accepted["artifact"]["findings"][0]["supportStatus"], "conflicting")

    def test_conflict_gap_wrong_code_or_target_stays_rejected(self):
        tool = "analyze_interviews"
        value = inputs()[tool]
        value["questions"].append("What remains unknown?")
        proposed = candidate(tool, value)
        supported = copy.deepcopy(proposed["findings"][0])
        supported["key"] = "supported-source"
        proposed["findings"][0]["supportStatus"] = "conflicting"
        proposed["findings"].append(supported)
        for code, question in [("insufficient_evidence", "q1"), ("conflicting_evidence", "q2")]:
            proposed["gaps"] = [{"code": code, "questionId": question, "participantRef": None,
                                "output": None, "message": "An unresolved workflow choice requires a role-specific test."}]
            failure = dispatch({"id": 1, "operation": "finalize", "tool": tool, "input": value, "response": proposed})
            self.assertEqual(failure["error"]["diagnostics"], ["MISSING_CONFLICT_GAP"])
        proposed["gaps"][0]["participantRef"] = proposed["findings"][0]["participantRefs"][0]
        self.assertTrue(finalize(tool, value, proposed)["validation"]["valid"])

    def test_insufficient_finding_has_separate_finite_diagnostic(self):
        tool = "analyze_interviews"
        value = inputs()[tool]
        proposed = candidate(tool, value)
        proposed["findings"][0]["supportStatus"] = "insufficient"
        failure = dispatch({"id": 1, "operation": "finalize", "tool": tool, "input": value, "response": proposed})
        self.assertEqual(failure["error"]["diagnostics"], ["MISSING_INSUFFICIENT_GAP"])
        proposed["gaps"] = [{"code": "insufficient_evidence", "questionId": "q1", "participantRef": None,
                            "output": None, "message": "One example is not enough to establish the proposed workflow need."}]
        proposed["gaps"][0]["participantRef"] = proposed["findings"][0]["participantRefs"][0]
        proposed["gaps"][0]["output"] = "jobs_pains"
        self.assertTrue(finalize(tool, value, proposed)["validation"]["valid"])

    def test_unrequested_gap_output_has_bounded_schema_and_diagnostic(self):
        tool = "analyze_interviews"
        value = inputs()[tool]
        prepared = prepare(tool, value)
        schema = prepared["responseSchema"]["$defs"]["AnalysisGapV1"]["properties"]["output"]
        self.assertEqual(schema["anyOf"][0]["enum"], ["jobs_pains"])
        proposed = candidate(tool, value)
        proposed["gaps"] = [{"code": "insufficient_evidence", "questionId": "q1", "participantRef": None,
                            "output": "personas", "message": "PRIVATE evidence uncertainty must remain a selected question gap."}]
        failure = dispatch({"id": 1, "operation": "finalize", "tool": tool, "input": value, "response": proposed})
        self.assertEqual(failure["error"]["diagnostics"], ["UNREQUESTED_ANALYSIS_OUTPUT"])
        self.assertNotIn("PRIVATE", json.dumps(failure))
        proposed["gaps"][0]["output"] = None
        self.assertTrue(finalize(tool, value, proposed)["validation"]["valid"])

    def test_all_independent_contract_defects_are_reported_for_single_repair(self):
        tool = "analyze_interviews"
        value = inputs()[tool]
        proposed = candidate(tool, value)
        proposed["findings"][0]["supportStatus"] = "conflicting"
        proposed["gaps"] = [{"code": "no_supported_output", "questionId": None, "participantRef": None,
                            "output": "personas", "message": "Personas were not requested."}]
        failure = dispatch({"id": 1, "operation": "finalize", "tool": tool, "input": value, "response": proposed})
        self.assertEqual(failure["error"]["diagnostics"], ["UNREQUESTED_ANALYSIS_OUTPUT", "MISSING_CONFLICT_GAP"])
        repair = prepare_repair(tool, value, proposed, diagnostics=failure["error"]["diagnostics"])
        guidance = json.loads(repair["userPrompt"])["repair"]["validationRepairGuidance"]
        self.assertEqual(len(guidance), 2)
        self.assertIn("Omit gaps", guidance[0])

    def test_review_requires_complete_rubric_and_bound_candidate(self):
        covered = set()
        for tool, value, _proposed, artifact, hosts in review_fixtures():
            with self.subTest(tool=tool):
                covered.add(tool)
                prepared = prepare_review(tool, value, artifact, hosts)
                payload = json.loads(prepared["userPrompt"])
                self.assertEqual(payload["requiredCriteria"], list(CRITERIA[tool]))
                self.assertEqual(payload["candidateArtifact"], artifact)
                checked = validate_review(tool, artifact, review_candidate(tool), prepared["context"])
                self.assertTrue(checked["passed"])
                self.assertFalse(checked["semanticTruthVerified"])
                incomplete = review_candidate(tool)
                incomplete["checks"].pop()
                with self.assertRaises(ValueError):
                    validate_review(tool, artifact, incomplete, prepared["context"])
                with self.assertRaises(ValueError):
                    validate_review(tool, {**artifact, "changed": True}, review_candidate(tool), prepared["context"])
        self.assertEqual(covered, set(CRITERIA), "Every reviewed tool needs a real finalized fixture")

    def test_new_tool_failed_reviews_repair_same_bound_artifact_without_extra_search(self):
        covered = set()
        for tool, value, proposed, artifact, hosts in review_fixtures():
            if tool in {"analyze_interviews", "create_prd"}:
                continue
            with self.subTest(tool=tool):
                covered.add(tool)
                prepared = prepare_review(tool, value, artifact, hosts)
                review = validate_review(tool, artifact, review_candidate(tool, "actionability"), prepared["context"])
                self.assertFalse(review["passed"])
                repair = prepare_repair(tool, value, proposed, review, host_evidence=hosts)
                self.assertEqual(repair["context"], prepare(tool, value, hosts)["context"])
                payload = json.loads(repair["userPrompt"])
                self.assertEqual(payload["repair"]["maximumAttempts"], 1)
                self.assertEqual(payload["repair"]["candidate"], proposed)
                self.assertEqual(payload["repair"]["qualityReview"]["artifactHash"], review["artifactHash"])
        self.assertEqual(covered, set(CRITERIA) - {"analyze_interviews", "create_prd"})

    def test_failed_substantive_review_requires_repair_then_fresh_review(self):
        tool = "analyze_interviews"
        value = inputs()[tool]
        proposed = candidate(tool, value)
        artifact = finalize(tool, value, proposed)["artifact"]
        prepared = prepare_review(tool, value, artifact)
        review = validate_review(tool, artifact, review_candidate(tool, "cross_source_synthesis"), prepared["context"])
        self.assertFalse(review["passed"])
        self.assertEqual(review["issues"], ["cross_source_synthesis"])
        repair = prepare_repair(tool, value, proposed, review)
        self.assertEqual(repair["repairAttempt"], 1)
        self.assertEqual(repair["context"], prepare(tool, value)["context"])
        self.assertEqual(json.loads(repair["userPrompt"])["repair"]["maximumAttempts"], 1)
        changed = copy.deepcopy(proposed)
        changed["findings"][0]["statement"] = "Repeated manual transfer is a bottleneck; test a shared handoff view before expanding automation."
        changed["findings"][0]["basis"] = "interpretation"
        new_artifact = finalize(tool, value, changed)["artifact"]
        with self.assertRaises(ValueError):
            validate_review(tool, new_artifact, review_candidate(tool), prepared["context"])
        final_prepared = prepare_review(tool, value, new_artifact)
        final_gate = validate_review(tool, new_artifact, review_candidate(tool, "actionability"), final_prepared["context"])
        self.assertFalse(final_gate["passed"])

    def test_review_cannot_be_relabelled_as_passed_or_reused_for_other_candidate(self):
        tool = "create_prd"
        value = inputs()[tool]
        proposed = candidate(tool, value)
        artifact = finalize(tool, value, proposed)["artifact"]
        context = prepare_review(tool, value, artifact)["context"]
        failed = validate_review(tool, artifact, review_candidate(tool, "requirements_and_acceptance"), context)
        for modified in ({**failed, "passed": True}, {**failed, "artifactHash": "0" * 64}, {**failed, "issues": []}):
            with self.assertRaises(ValueError):
                prepare_repair(tool, value, proposed, modified)
        passed = validate_review(tool, artifact, review_candidate(tool), context)
        with self.assertRaises(ValueError):
            prepare_repair(tool, value, proposed, passed)

    def test_exact_excerpt_echo_cannot_receive_model_courtesy_pass(self):
        tool = "analyze_interviews"
        value = inputs()[tool]
        value["transcripts"].append({
            "id": "interview-2", "title": "Second operator",
            "origin": "supplied_transcript", "turns": [{
                "speaker": "p2", "role": "participant", "text": "I copy the same update into email twice."
            }],
        })
        proposed = candidate(tool, value)
        quote = json.loads(prepare(tool, value)["userPrompt"])["availableWholeTurnQuotes"][1]
        proposed["quotes"].append({"key": "quote-2", **quote})
        proposed["findings"].append({
            **proposed["findings"][0], "key": "finding-2", "statement": quote["text"],
            "quoteKeys": ["quote-2"], "participantRefs": [{
                "documentId": quote["documentId"], "participantId": quote["participantId"]
            }],
        })
        artifact = finalize(tool, value, proposed)["artifact"]
        prepared = prepare_review(tool, value, artifact)
        checked = validate_review(tool, artifact, review_candidate(tool), prepared["context"])
        self.assertFalse(checked["passed"])
        self.assertEqual(checked["issues"], ["EXCERPT_ECHO_ONLY"])

    def test_frozen_analysis_reference_derives_prd_sources_and_finding_links(self):
        value, evidence, proposed = frozen_analysis()
        result = finalize("create_prd", value, proposed, host_evidence=evidence)
        self.assertEqual(result["artifact"]["analysisArtifact"], value["analysisArtifact"])
        self.assertEqual(result["artifact"]["analysisFindings"][0]["findingId"], evidence["artifact"]["findings"][0]["findingId"])
        self.assertEqual(result["artifact"]["sources"][0]["origin"], "supplied_transcript")
        self.assertIn("[finding:", result["markdown"])
        self.assertEqual(value.keys(), {"brief", "analysisArtifact"})

    def test_reference_preserves_synthetic_identity_without_retyping(self):
        value, evidence, proposed = frozen_analysis(synthetic=True)
        result = finalize("create_prd", value, proposed, host_evidence=evidence)
        self.assertEqual(result["artifact"]["sources"][0]["origin"], "synthetic_transcript")
        self.assertTrue(all(item["basis"] == "simulation_hypothesis"
                            for section in result["artifact"]["sections"] for item in section["items"]))
        proposed["sections"][0]["items"][0]["basis"] = "proposal"
        with self.assertRaises(ValueError):
            finalize("create_prd", value, proposed, host_evidence=evidence)

    def test_tampered_frozen_source_candidate_artifact_or_reference_rejected(self):
        value, evidence, _ = frozen_analysis()
        variants = []
        changed = copy.deepcopy(evidence)
        changed["reference"]["sha256"] = "b" * 64
        variants.append(changed)
        changed = copy.deepcopy(evidence)
        changed["input"]["transcripts"][0]["turns"][0]["text"] = "PRIVATE altered original text"
        variants.append(changed)
        changed = copy.deepcopy(evidence)
        changed["artifact"]["findings"][0]["statement"] = "PRIVATE fabricated finding"
        variants.append(changed)
        changed = copy.deepcopy(evidence)
        changed["candidate"]["quotes"][0]["text"] = "PRIVATE fabricated quote"
        variants.append(changed)
        for variant in variants:
            result = dispatch({"id": 1, "operation": "prepare", "tool": "create_prd", "input": value, "hostEvidence": variant})
            self.assertFalse(result["ok"])
            self.assertNotIn("PRIVATE", json.dumps(result))

    def test_reference_requires_host_resolution_and_forbids_public_evidence(self):
        value, evidence, _ = frozen_analysis()
        with self.assertRaises(ValueError):
            prepare("create_prd", value)
        with self.assertRaises(ValueError):
            prepare("create_prd", {**value, "hostEvidence": evidence}, evidence)
        with self.assertRaises(ValueError):
            prepare("analyze_interviews", inputs()["analyze_interviews"], evidence)

    def test_unknown_or_missing_requirement_finding_ids_rejected(self):
        value, evidence, proposed = frozen_analysis()
        requirements = next(section for section in proposed["sections"] if section["heading"] == "Prioritized requirements")
        requirements["items"][0]["findingIds"] = []
        response = dispatch({"id": 1, "operation": "finalize", "tool": "create_prd", "input": value, "response": proposed, "hostEvidence": evidence})
        self.assertEqual(response["error"]["diagnostics"], ["MISSING_REQUIREMENT_FINDING_LINK"])
        requirements["items"][0]["findingIds"] = ["b" * 64]
        response = dispatch({"id": 1, "operation": "finalize", "tool": "create_prd", "input": value, "response": proposed, "hostEvidence": evidence})
        self.assertEqual(response["error"]["diagnostics"], ["UNKNOWN_FINDING_REFERENCE"])

    def test_prd_reports_owner_and_requirement_defects_in_the_same_repair(self):
        value, evidence, proposed = frozen_analysis(synthetic=True)
        scope = next(section for section in proposed["sections"]
                     if section["heading"] == "Product thesis, scope, and non-goals")
        scope["items"] = [{"text": "PRIVATE supposed owner approval absent from the brief.",
                           "basis": "owner_decision", "sourceIds": [], "findingIds": []}]
        requirements = next(section for section in proposed["sections"]
                            if section["heading"] == "Prioritized requirements")
        unsupported = {"text": "P2: introduce a new optional integration; validate feasibility before prioritizing.",
                       "basis": "proposal", "sourceIds": [], "findingIds": []}
        requirements["items"].append(unsupported)
        proposed["sections"].remove(scope)
        proposed["sections"].insert(0, scope)
        failure = dispatch({"id": 1, "operation": "finalize", "tool": "create_prd",
                            "input": value, "response": proposed, "hostEvidence": evidence})
        self.assertEqual(failure["error"]["diagnostics"],
                         ["INVALID_OWNER_DECISION", "MISSING_REQUIREMENT_FINDING_LINK"])
        self.assertNotIn("PRIVATE", json.dumps(failure))
        repair = prepare_repair("create_prd", value, proposed,
                                diagnostics=failure["error"]["diagnostics"], host_evidence=evidence)
        guidance = json.loads(repair["userPrompt"])["repair"]["validationRepairGuidance"]
        self.assertEqual(len(guidance), 2)
        self.assertIn("exact substring", guidance[0])
        self.assertIn("Never attach an arbitrary finding", guidance[1])
        self.assertIn("Next steps", guidance[1])

        # Correct both defects without granting scope or fabricating evidence.
        scope["items"][0]["text"] = value["brief"]
        requirements["items"].remove(unsupported)
        next(section for section in proposed["sections"]
             if section["heading"] == "Next steps")["items"].append(unsupported)
        accepted = finalize("create_prd", value, proposed, host_evidence=evidence)
        self.assertTrue(accepted["validation"]["valid"])
        self.assertEqual(requirements["items"][0]["basis"], "simulation_hypothesis")
        self.assertEqual(unsupported["findingIds"], [])

    def test_analysis_backed_prd_schema_requires_admitted_requirement_finding_ids(self):
        for artifact_type in ("product_prd", "software_prd"):
            with self.subTest(artifact_type=artifact_type):
                value, evidence, _ = frozen_analysis()
                value["artifactType"] = artifact_type
                prepared = prepare("create_prd", value, evidence)
                schema = prepared["responseSchema"]
                alternatives = schema["properties"]["sections"]["items"]["anyOf"]
                requirement_section, other_section = alternatives
                self.assertEqual(requirement_section["properties"]["heading"]["enum"],
                                 ["Prioritized requirements"])
                self.assertNotIn("Prioritized requirements", other_section["properties"]["heading"]["enum"])
                self.assertEqual(requirement_section["properties"]["items"]["items"],
                                 {"$ref": "#/$defs/GroundedPrdRequirement"})
                requirement = schema["$defs"]["GroundedPrdRequirement"]
                self.assertIn("findingIds", requirement["required"])
                self.assertEqual(requirement["properties"]["findingIds"]["minItems"], 1)
                self.assertEqual(requirement["properties"]["findingIds"]["items"]["enum"],
                                 [row["findingId"] for row in evidence["artifact"]["findings"]])
                self.assertNotIn("findingIds", schema["$defs"]["PrdItem"]["required"])
                self.assertIn("unconfirmed optional proposals", prepared["systemPrompt"])
                self.assertIn("Never attach an arbitrary finding", prepared["systemPrompt"])

    def test_brief_only_prd_does_not_require_nonexistent_findings(self):
        value = inputs()["create_prd"]
        prepared = prepare("create_prd", value)
        self.assertEqual(prepared["responseSchema"]["properties"]["sections"]["items"],
                         {"$ref": "#/$defs/PrdSection"})
        self.assertTrue(finalize("create_prd", value, candidate("create_prd", value))["validation"]["valid"])

    def test_prd_aggregates_unknown_references_without_indexing_untrusted_ids(self):
        value, evidence, proposed = frozen_analysis()
        item = proposed["sections"][0]["items"][0]
        item.update(sourceIds=["unadmitted-source"], findingIds=["b" * 64])
        scope = next(section for section in proposed["sections"]
                     if section["heading"] == "Product thesis, scope, and non-goals")
        scope["items"] = [{"text": "Unconfirmed scope agreement.", "basis": "owner_decision",
                           "sourceIds": [], "findingIds": []}]
        failure = dispatch({"id": 1, "operation": "finalize", "tool": "create_prd",
                            "input": value, "response": proposed, "hostEvidence": evidence})
        self.assertEqual(failure["error"]["diagnostics"],
                         ["UNKNOWN_SOURCE_REFERENCE", "UNKNOWN_FINDING_REFERENCE", "INVALID_OWNER_DECISION"])

    def test_prd_separates_unsupported_uncertainties_without_losing_parent_lineage(self):
        value, evidence, proposed = frozen_analysis_with_uncertainty()
        original = copy.deepcopy(evidence)
        prepared = prepare("create_prd", value, evidence)
        payload = json.loads(prepared["userPrompt"])
        self.assertEqual(len(payload["analysisFindings"]), 1)
        uncertainty = payload["analysisUncertainties"][0]
        original_finding = evidence["artifact"]["findings"][1]
        for field in ("findingId", "statement", "basis", "supportStatus", "questionIds", "quoteIds"):
            self.assertEqual(uncertainty[field], original_finding[field])
        self.assertEqual(uncertainty["sourceIds"], [])
        definitions = prepared["responseSchema"]["$defs"]
        for name in ("PrdItem", "GroundedPrdRequirement"):
            allowed = definitions[name]["properties"]["findingIds"]["items"]["enum"]
            self.assertEqual(allowed, [payload["analysisFindings"][0]["findingId"]])
            self.assertNotIn(uncertainty["findingId"], allowed)
        self.assertIn("sourceIds=[], findingIds=[]", prepared["systemPrompt"])
        artifact = finalize("create_prd", value, proposed, host_evidence=evidence)["artifact"]
        self.assertEqual(artifact["analysisArtifact"], value["analysisArtifact"])
        self.assertIn(uncertainty, artifact["analysisFindings"])
        self.assertEqual(evidence, original)

    def test_synthetic_quote_and_quote_free_gap_repair_keeps_strict_validation(self):
        value, evidence, proposed = frozen_analysis_with_uncertainty()
        payload = json.loads(prepare("create_prd", value, evidence)["userPrompt"])
        uncertainty = payload["analysisUncertainties"][0]
        source_item = proposed["sections"][0]["items"][0]
        source_item["basis"] = "source_statement"
        gap = {"text": uncertainty["statement"], "basis": "gap", "sourceIds": [],
               "findingIds": [uncertainty["findingId"]]}
        next(section for section in proposed["sections"]
             if section["heading"] == "Evidence, assumptions, and gaps")["items"].append(gap)
        failure = dispatch({"id": 1, "operation": "finalize", "tool": "create_prd",
                            "input": value, "response": proposed, "hostEvidence": evidence})
        self.assertEqual(failure["error"]["diagnostics"],
                         ["SYNTHETIC_PROVENANCE_MISMATCH", "INVALID_SOURCE_QUOTE"])
        repair = prepare_repair("create_prd", value, proposed,
                                diagnostics=failure["error"]["diagnostics"], host_evidence=evidence)
        guidance = json.loads(repair["userPrompt"])["repair"]["validationRepairGuidance"]
        self.assertEqual(len(guidance), 2)
        self.assertIn("Never manufacture evidence", guidance[0])
        self.assertIn("finding summary or paraphrase is not an original quote", guidance[1])
        # Simulate a complete guided replacement; neither preparation nor
        # validation silently rewrites model output or adds supporting evidence.
        self.assertEqual(gap["findingIds"], [uncertainty["findingId"]])
        source_item["basis"] = "simulation_hypothesis"
        still_failed = dispatch({"id": 1, "operation": "finalize", "tool": "create_prd",
                                 "input": value, "response": proposed, "hostEvidence": evidence})
        self.assertEqual(still_failed["error"]["diagnostics"], ["SYNTHETIC_PROVENANCE_MISMATCH"])
        gap["findingIds"] = []
        accepted = finalize("create_prd", value, proposed, host_evidence=evidence)
        self.assertTrue(accepted["validation"]["valid"])
        self.assertEqual(gap, {"text": uncertainty["statement"], "basis": "gap", "sourceIds": [], "findingIds": []})
        self.assertIn(uncertainty, accepted["artifact"]["analysisFindings"])

    def test_quote_free_analysis_cannot_prepare_an_impossible_evidence_backed_prd(self):
        value, evidence, _ = frozen_analysis(synthetic=True)
        finding = evidence["candidate"]["findings"][0]
        finding.update(supportStatus="insufficient", quoteKeys=[],
                       statement="No handoff problem is established by this material.")
        evidence["candidate"]["quotes"] = []
        evidence["candidate"]["gaps"] = [{
            "code": "insufficient_evidence", "questionId": "q1",
            "participantRef": finding["participantRefs"][0], "output": "jobs_pains",
            "message": "Investigate the workflow before proposing requirements.",
        }]
        evidence["artifact"] = finalize("analyze_interviews", evidence["input"], evidence["candidate"])["artifact"]
        original = copy.deepcopy(evidence)
        failure = dispatch({"id": 1, "operation": "prepare", "tool": "create_prd",
                            "input": value, "hostEvidence": evidence})
        self.assertEqual(failure["error"]["diagnostics"], ["MISSING_REQUIREMENT_FINDING_LINK"])
        self.assertNotIn("result", failure)  # No unusable schema reaches inference.
        self.assertEqual(evidence, original)
        self.assertEqual(evidence["artifact"]["findings"][0]["statement"], finding["statement"])

    def test_linked_finding_cannot_omit_original_source(self):
        value, evidence, proposed = frozen_analysis()
        proposed["sections"][0]["items"][0]["sourceIds"] = []
        with self.assertRaises(ValueError):
            finalize("create_prd", value, proposed, host_evidence=evidence)

    def test_validation_diagnostics_are_finite_and_do_not_echo_inputs(self):
        tool = "create_prd"
        value = inputs()[tool]
        proposed = candidate(tool, value)
        proposed["sections"][0]["heading"] = "PRIVATE invalid heading"
        error = dispatch({"id": 1, "operation": "finalize", "tool": tool, "input": value, "response": proposed})
        self.assertEqual(error["error"]["diagnostics"], ["INVALID_PRD_SECTIONS"])
        self.assertNotIn("PRIVATE", json.dumps(error))
        repaired = prepare_repair(tool, value, proposed, diagnostics=error["error"]["diagnostics"])
        self.assertEqual(repaired["repairAttempt"], 1)
        with self.assertRaises(ValueError):
            prepare_repair(tool, value, proposed, diagnostics=["PRIVATE provider exception"])

    def test_simulation_stays_single_bounded_generation(self):
        value = inputs()["simulate_interviews"]
        result = finalize("simulate_interviews", value, candidate("simulate_interviews", value))
        with self.assertRaises(ValueError):
            prepare_review("simulate_interviews", value, result["artifact"])
        with self.assertRaises(ValueError):
            prepare_repair("simulate_interviews", value, {}, diagnostics=["INVALID_CANDIDATE_SCHEMA"])

    def test_worker_review_and_repair_envelope(self):
        tool = "create_prd"
        value = inputs()[tool]
        proposed = candidate(tool, value)
        artifact = finalize(tool, value, proposed)["artifact"]
        result = dispatch({"id": 1, "operation": "prepare_review", "tool": tool, "input": value, "artifact": artifact})
        self.assertTrue(result["ok"])
        result = dispatch({"id": 2, "operation": "validate_review", "tool": tool, "artifact": artifact, "response": review_candidate(tool, "metrics_and_validation"), "context": result["result"]["context"]})
        self.assertTrue(result["ok"])
        self.assertFalse(result["result"]["passed"])
        result = dispatch({"id": 3, "operation": "prepare_repair", "tool": tool, "input": value, "candidate": proposed, "review": result["result"]})
        self.assertTrue(result["ok"])


if __name__ == "__main__":
    unittest.main()
