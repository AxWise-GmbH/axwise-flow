"""Offline checks for optional views over exact-span qualitative analysis."""

import copy
import unittest
from unittest.mock import patch

from backend.services.local_axwise.analysis_views import (
    VIEW_INSTRUCTIONS,
    finalize_views,
    prepare_schema,
    split_response,
)
from backend.services.local_axwise.kernel import finalize
from backend.services.workflow_v2.analysis_candidates import AnalysisCandidateV1
from backend.tests.local_axwise.fixtures import candidate, inputs


def view(kind="themes", *, status="supported", indexes=None, title="Repeated copying"):
    return {"kind": kind, "title": title,
            "summary": "The selected participant describes time lost copying updates.",
            "findingIndexes": [0] if indexes is None else indexes, "status": status}


def admitted(*, synthetic=False, two_findings=False):
    value = inputs()["analyze_interviews"]
    if synthetic:
        value["transcripts"][0]["origin"] = "synthetic_transcript"
        value["transcripts"][0]["turns"][0]["questionId"] = "original-q1"
    proposed = candidate("analyze_interviews", value)
    if two_findings:
        proposed["findings"].append({
            **copy.deepcopy(proposed["findings"][0]), "key": "finding-2",
            "statement": "Copying between tools creates handoff friction.",
            "basis": "simulation_hypothesis" if synthetic else "interpretation",
        })
    artifact = finalize("analyze_interviews", value, proposed)["artifact"]
    return proposed, artifact


class AnalysisViewsTests(unittest.TestCase):
    def setUp(self):
        # The helper cannot use a provider or accidentally bootstrap networking.
        self.network = patch("socket.socket.connect", side_effect=AssertionError("no network"))
        self.network.start()
        self.addCleanup(self.network.stop)

    def test_unrequested_path_preserves_original_candidate_and_schema(self):
        base = AnalysisCandidateV1.model_json_schema(by_alias=True)
        original = copy.deepcopy(base)
        self.assertEqual(prepare_schema(base, [], "standard"), original)
        response = {"arbitrary": "caller retains existing validation"}
        core, views = split_response(response, [])
        self.assertIs(core, response)
        self.assertEqual(views, [])
        self.assertEqual(finalize_views([], None, None, []), ({}, ""))
        self.assertEqual(base, original)

    def test_wrapped_schema_preserves_strict_analysis_and_definitions(self):
        base = AnalysisCandidateV1.model_json_schema(by_alias=True)
        original = copy.deepcopy(base)
        wrapped = prepare_schema(base, ["themes", "sentiment"], "standard")
        inner = copy.deepcopy(wrapped["properties"]["analysis"])
        inner["$defs"] = wrapped["$defs"]
        self.assertEqual(inner, original)
        self.assertFalse(wrapped["additionalProperties"])
        self.assertEqual(wrapped["properties"]["views"]["maxItems"], 20)
        self.assertEqual(wrapped["properties"]["views"]["items"]["properties"]["kind"]["enum"], ["themes", "sentiment"])
        self.assertEqual(prepare_schema(base, ["themes"], "deep")["properties"]["views"]["maxItems"], 40)
        self.assertIn("not just finding counts", VIEW_INSTRUCTIONS)
        self.assertIn("Do not diagnose mental state", VIEW_INSTRUCTIONS)
        self.assertEqual(base, original)

    def test_exact_requested_coverage_and_strict_wrapper(self):
        invalid = [
            {"analysis": {}, "views": []},
            {"analysis": {}, "views": [view("insights")]},
            {"analysis": {}, "views": [view()], "extra": True},
            {"views": [view()]},
            {"analysis": {}, "views": [{**view(), "inventedEvidence": "yes"}]},
        ]
        for response in invalid:
            with self.subTest(response=response), self.assertRaises(ValueError):
                split_response(response, ["themes"])
        for requested in (["themes", "themes"], ["personality"], "themes"):
            with self.subTest(requested=requested), self.assertRaises(ValueError):
                prepare_schema({}, requested, "standard")

    def test_strict_finding_indices_and_nonblank_text(self):
        for updates in ({"findingIndexes": [True]}, {"findingIndexes": [-1]},
                        {"findingIndexes": [256]}, {"findingIndexes": [0, 0]},
                        {"findingIndexes": ["0"]}, {"summary": " "}, {"title": ""}):
            with self.subTest(updates=updates), self.assertRaises(ValueError):
                split_response({"analysis": {}, "views": [{**view(), **updates}]}, ["themes"])

    def test_depth_limits_and_duplicate_titles(self):
        rows = [view(title=f"Theme {index}") for index in range(5)]
        with self.assertRaises(ValueError):
            split_response({"analysis": {}, "views": rows}, ["themes"], depth="standard")
        self.assertEqual(len(split_response({"analysis": {}, "views": rows}, ["themes"], depth="deep")[1]), 5)
        with self.assertRaises(ValueError):
            split_response({"analysis": {}, "views": [view(), view(title=" repeated COPYING ")]}, ["themes"])
        with self.assertRaises(ValueError):
            prepare_schema({}, ["themes"], "unbounded")

    def test_published_hash_mapping_is_independent_of_final_finding_order(self):
        proposed, artifact = admitted(two_findings=True)
        # Deliberately reverse the candidate ordering relative to the artifact.
        by_statement = {row["statement"]: row["findingId"] for row in artifact["findings"]}
        proposed["findings"].reverse()
        final, markdown = finalize_views([view(indexes=[0])], artifact, proposed, ["themes"])
        identity = by_statement[proposed["findings"][0]["statement"]]
        self.assertEqual(final["views"][0]["findingIds"], [identity])
        self.assertNotIn("findingIndexes", final["views"][0])
        self.assertIn(identity, markdown)

    def test_candidate_or_quote_changes_cannot_rebind_views(self):
        proposed, artifact = admitted()
        for mutate in (lambda row: row["findings"][0].update(statement="Invented finding"),
                       lambda row: row["quotes"][0].update(text="Invented quote"),
                       lambda row: row["findings"][0].update(quoteKeys=["missing"])):
            changed = copy.deepcopy(proposed)
            mutate(changed)
            with self.assertRaises(ValueError):
                finalize_views([view()], artifact, changed, ["themes"])
        with self.assertRaises(ValueError):
            finalize_views([view(indexes=[1])], artifact, proposed, ["themes"])

    def test_supported_requires_evidence_and_synthetic_stays_hypothesis(self):
        proposed, artifact = admitted(synthetic=True)
        with self.assertRaises(ValueError):
            finalize_views([view()], artifact, proposed, ["themes"])
        final, _ = finalize_views([view(status="hypothesis")], artifact, proposed, ["themes"])
        self.assertEqual(final["views"][0]["status"], "hypothesis")
        for status in ("supported", "hypothesis"):
            with self.subTest(status=status), self.assertRaises(ValueError):
                finalize_views([view(status=status, indexes=[])], artifact, proposed, ["themes"])

    def test_all_requested_views_are_derived_in_one_candidate(self):
        proposed, artifact = admitted()
        kinds = ["themes", "patterns", "stakeholders", "sentiment", "insights"]
        response = {"analysis": proposed, "views": [view(kind) for kind in kinds]}
        core, views = split_response(response, kinds)
        self.assertIs(core, proposed)
        result, _ = finalize_views(views, artifact, core, kinds)
        self.assertEqual([row["kind"] for row in result["views"]], kinds)
        self.assertTrue(all(row["findingIds"] == [artifact["findings"][0]["findingId"]]
                            for row in result["views"]))

    def test_real_unanswered_question_gap_is_not_supported_finding_evidence(self):
        value = inputs()["analyze_interviews"]
        value["questions"].append("What emotional effects occur?")
        proposed = candidate("analyze_interviews", value)
        proposed["gaps"] = [{"code": "unanswered_question", "questionId": "q2",
                             "participantRef": None, "output": None,
                             "message": "The selected turn does not describe emotional effects."}]
        artifact = finalize("analyze_interviews", value, proposed)["artifact"]
        with self.assertRaises(ValueError):
            finalize_views([view("sentiment", status="gap")], artifact, proposed, ["sentiment"])
        row = view("sentiment", status="gap", indexes=[])
        row["summary"] = proposed["gaps"][0]["message"]
        result, _ = finalize_views([row], artifact, proposed, ["sentiment"])
        self.assertEqual(result["views"][0]["findingIds"], [])
        self.assertEqual(len(result["views"][0]["gapIds"]), 1)

    def test_gap_cannot_claim_supported_findings_or_invent_absent_gaps(self):
        proposed, artifact = admitted()
        with self.assertRaises(ValueError):
            finalize_views([view(status="gap", indexes=[])], artifact, proposed, ["themes"])
        value = inputs()["analyze_interviews"]
        proposed["findings"][0]["supportStatus"] = "insufficient"
        proposed["gaps"] = [
            {"code": "insufficient_evidence", "questionId": "q1",
             "participantRef": proposed["findings"][0]["participantRefs"][0],
             "output": None, "message": "The selected turn alone cannot settle the decision."},
            {"code": "no_supported_output", "questionId": None, "participantRef": None,
             "output": "jobs_pains", "message": "No supported jobs or pains output is available."},
        ]
        artifact = finalize("analyze_interviews", value, proposed)["artifact"]
        result, _ = finalize_views([view(status="gap")], artifact, proposed, ["themes"])
        gap_ids = result["views"][0]["gapIds"]
        self.assertTrue(gap_ids)
        self.assertTrue(all(identity in result["viewGaps"] for identity in gap_ids))
        with self.assertRaises(ValueError):
            finalize_views([view(status="supported")], artifact, proposed, ["themes"])

    def test_markdown_escapes_model_text(self):
        proposed, artifact = admitted()
        row = view(title="[unsafe](javascript:bad)")
        row["summary"] = "<script>alert(1)</script>"
        _, markdown = finalize_views([row], artifact, proposed, ["themes"])
        self.assertNotIn("<script>", markdown)
        self.assertIn("\\[unsafe\\]", markdown)


if __name__ == "__main__":
    unittest.main()
