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


def review_candidate(tool, fail=None):
    return {"checks": [
        {"criterion": key, "passed": key != fail,
         "reason": "The selected evidence and scope are respected." if key != fail
         else "The candidate echoes excerpts without extracting their shared implication."}
        for key in CRITERIA[tool]
    ]}


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


class QualityTests(unittest.TestCase):
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
        for tool in CRITERIA:
            value = inputs()[tool]
            artifact = finalize(tool, value, candidate(tool, value))["artifact"]
            prepared = prepare_review(tool, value, artifact)
            checked = validate_review(tool, artifact, review_candidate(tool), prepared["context"])
            self.assertTrue(checked["passed"])
            self.assertFalse(checked["semanticTruthVerified"])
            incomplete = review_candidate(tool)
            incomplete["checks"].pop()
            with self.assertRaises(ValueError):
                validate_review(tool, artifact, incomplete, prepared["context"])
            with self.assertRaises(ValueError):
                validate_review(tool, {**artifact, "changed": True}, review_candidate(tool), prepared["context"])

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
