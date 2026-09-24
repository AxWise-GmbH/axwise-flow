"""Offline discovery/market contract regressions, without search or server startup."""

from __future__ import annotations

from copy import deepcopy
import json
import unittest

from backend.domain.workflow_v2.wire import canonical_hash
from backend.services.local_axwise.discovery import DESCRIPTIONS, INPUT_MODELS, finalize, prepare


def source(**updates):
    value = {
        "id": "operator-interview", "title": "Selected operator interview",
        "text": "We spend two hours copying handoff updates each Friday.",
        "origin": "supplied_transcript",
    }
    return {**value, **updates}


def discovery_input(**updates):
    return {
        "brief": "Should we build a handoff tracker for small software teams in Latvia?",
        "region": "Latvia", "exclusions": ["Do not include payroll or financial advice"],
        "sources": [source()], **updates,
    }


def discovery_candidate():
    return {
        "decision": "Whether to test a shared handoff tracker with small software teams",
        "scope": ["Understand current handoffs and test demand before implementation"],
        "uncertainties": [{"id": "u1", "text": "Which handoffs create avoidable work?"}],
        "stakeholders": [{
            "id": "operators", "label": "Operations leads", "description": "People coordinating software delivery handoffs",
            "questions": [{"id": "q1", "text": "Walk through the last delayed handoff.", "uncertaintyId": "u1"}],
        }],
        "knownFacts": [{"sourceId": "operator-interview", "quote": source()["text"], "basis": "source_statement"}],
        "assumptions": ["A shared tracker may reduce repeated copying; this needs a pilot."],
        "gaps": ["No evidence yet on willingness to pay."],
    }


def market_input(**updates):
    return {
        "brief": "Assess existing handoff software for Latvian small teams.",
        "region": "Latvia", "questions": ["Which suppliers offer handoff software?"],
        "sources": [source(
            id="publisher-1", title="Supplier product page", origin="web_source",
            text="Acme supplies team handoff tracking software in Latvia.",
            url="https://example.com/product", retrievedAt="2026-09-23T13:00:00Z",
            publishedAt="2026-09-22",
        )], **updates,
    }


def market_candidate(value=None):
    value = value or market_input()
    context = prepare("research_market", value, [])["context"]
    return {
        "findings": [{"questionId": context["questions"][0]["id"], "sourceId": value["sources"][0]["id"],
                      "quote": value["sources"][0]["text"], "basis": "source_statement"}],
        "interpretations": [], "gaps": [],
        "limitations": ["One supplier page does not establish complete market coverage."],
    }


def saved_discovery():
    result = finalize("prepare_discovery", discovery_input(), discovery_candidate(), [])
    return {
        "reference": {"operationId": "11111111-1111-4111-8111-111111111111", "sha256": "a" * 64},
        "tool": "prepare_discovery", "input": discovery_input(), "candidate": discovery_candidate(),
        "artifact": result["artifact"], "markdown": result["markdown"],
    }


class DiscoveryTests(unittest.TestCase):
    def test_fictional_owner_document_quote_basis_is_explicit_before_inference(self):
        owner = source(id="owner-spec", origin="supplied_document",
            text="This owner specification and cohort are synthetic benchmark material, not customer testimony.")
        value = discovery_input(sources=[owner])
        prepared = prepare("prepare_discovery", value, [])
        self.assertEqual(prepared["context"]["quotationBasisBySourceId"], {"owner-spec": "source_statement"})
        schema = prepared["responseSchema"]["properties"]["knownFacts"]["items"]["properties"]
        self.assertEqual(schema["sourceId"]["enum"], ["owner-spec"])
        self.assertEqual(schema["basis"]["enum"], ["source_statement"])
        self.assertIn("does NOT claim real customer testimony", prepared["systemPrompt"])
        proposed = discovery_candidate()
        proposed["knownFacts"] = [{"sourceId": owner["id"], "quote": owner["text"], "basis": "source_statement"}]
        result = finalize("prepare_discovery", value, proposed, [])
        self.assertEqual(result["artifact"]["knownFacts"][0]["quote"], owner["text"])
        self.assertEqual(result["artifact"]["knownFacts"][0]["origin"], "supplied_document")
        self.assertFalse(result["validation"]["externalFactsVerified"])

    def test_mixed_origins_keep_distinct_quote_basis_and_synthetic_lineage(self):
        value = discovery_input(sources=[
            source(id="owner", origin="supplied_document", text="The fictional pilot keeps manual assignment."),
            source(id="synthetic", origin="synthetic_transcript", text="As a synthetic dispatcher I would need a shared queue."),
            source(id="transcript", origin="supplied_transcript"),
        ])
        prepared = prepare("prepare_discovery", value, [])
        self.assertEqual(prepared["context"]["quotationBasisBySourceId"], {
            "owner": "source_statement", "synthetic": "simulation_hypothesis", "transcript": "source_statement"})
        branches = prepared["responseSchema"]["properties"]["knownFacts"]["items"]["anyOf"]
        self.assertEqual({row["properties"]["basis"]["enum"][0]: row["properties"]["sourceId"]["enum"] for row in branches},
            {"source_statement": ["owner", "transcript"], "simulation_hypothesis": ["synthetic"]})
        proposed = discovery_candidate()
        proposed["knownFacts"] = [{"sourceId": row["id"], "quote": row["text"],
            "basis": prepared["context"]["quotationBasisBySourceId"][row["id"]]} for row in value["sources"]]
        result = finalize("prepare_discovery", value, proposed, [])
        self.assertEqual([row["sourceId"] for row in result["artifact"]["knownFacts"]], ["owner", "transcript"])
        self.assertEqual(result["artifact"]["simulationHypotheses"][0]["sourceId"], "synthetic")
        self.assertEqual(result["artifact"]["simulationHypotheses"][0]["origin"], "synthetic_transcript")

    def test_quote_basis_worker_diagnostic_and_repair_guidance_are_finite_and_actionable(self):
        from backend.services.local_axwise.worker import dispatch
        marker = "PRIVATE_BENCHMARK_DOCUMENT_TEXT_unchanged"
        for origin, wrong, right in (("supplied_document", "simulation_hypothesis", "source_statement"),
                                     ("synthetic_transcript", "source_statement", "simulation_hypothesis")):
            value = discovery_input(sources=[source(text=marker, origin=origin)])
            proposed = discovery_candidate()
            proposed["knownFacts"][0].update(quote=marker, basis=wrong)
            with self.subTest(origin=origin):
                rejected = dispatch({"operation": "finalize", "tool": "prepare_discovery", "input": value, "response": proposed})
                self.assertFalse(rejected["ok"])
                self.assertEqual(rejected["error"]["diagnostics"], ["SOURCE_QUOTATION_BASIS_MISMATCH"])
                self.assertNotIn(marker, json.dumps(rejected))
                repair = dispatch({"operation": "prepare_repair", "tool": "prepare_discovery", "input": value,
                    "candidate": proposed, "diagnostics": rejected["error"]["diagnostics"]})
                self.assertTrue(repair["ok"])
                payload = json.loads(repair["result"]["userPrompt"])
                self.assertEqual(payload["quotationBasisBySourceId"]["operator-interview"], right)
                self.assertIn("Correct only the quotation basis", payload["repair"]["validationRepairGuidance"][0])
                self.assertEqual(payload["sources"][0]["origin"], origin)
                self.assertEqual(payload["sources"][0]["text"], marker)
                proposed["knownFacts"][0]["basis"] = right
                accepted = dispatch({"operation": "finalize", "tool": "prepare_discovery", "input": value, "response": proposed})
                self.assertTrue(accepted["ok"])

    def test_market_schema_uses_same_origin_map_including_real_selected_web_source(self):
        value = market_input()
        prepared = prepare("research_market", value, [])
        self.assertEqual(prepared["context"]["quotationBasisBySourceId"], {"publisher-1": "source_statement"})
        schema = prepared["responseSchema"]["properties"]["findings"]["items"]["properties"]
        self.assertEqual(schema["basis"]["enum"], ["source_statement"])
        self.assertIn("questionId", schema)
        without_sources = prepare("research_market", market_input(sources=[]), [])
        self.assertEqual(without_sources["responseSchema"]["properties"]["findings"]["maxItems"], 0)

    def test_pure_catalog_has_only_two_tools_and_strict_inputs(self):
        self.assertEqual(set(INPUT_MODELS), {"prepare_discovery", "research_market"})
        self.assertIn("does not search", DESCRIPTIONS["research_market"])
        for model in INPUT_MODELS.values():
            self.assertFalse(model.model_json_schema()["additionalProperties"])

    def test_plan_has_canonical_identity_and_exact_question_role_uncertainty_links(self):
        result = finalize("prepare_discovery", discovery_input(), discovery_candidate(), [])
        artifact = result["artifact"]
        role = artifact["stakeholders"][0]
        question = role["questions"][0]
        self.assertTrue(artifact["id"].startswith("discovery-"))
        self.assertTrue(role["id"].startswith("stakeholder-"))
        self.assertEqual(question["stakeholderId"], role["id"])
        self.assertEqual(question["uncertaintyId"], artifact["uncertainties"][0]["id"])
        self.assertEqual(result["provenance"]["artifactHash"], canonical_hash(artifact))
        self.assertFalse(result["validation"]["externalFactsVerified"])
        self.assertFalse(result["provenance"]["networkExecuted"])

    def test_model_alias_changes_do_not_change_persistent_semantic_ids(self):
        one = discovery_candidate()
        two = deepcopy(one)
        two["uncertainties"][0]["id"] = "renamed-u"
        two["stakeholders"][0]["id"] = "renamed-role"
        two["stakeholders"][0]["questions"][0].update(id="renamed-q", uncertaintyId="renamed-u")
        self.assertEqual(
            finalize("prepare_discovery", discovery_input(), one, [])["artifact"],
            finalize("prepare_discovery", discovery_input(), two, [])["artifact"],
        )

    def test_scope_remains_proposed_and_preserves_explicit_constraints(self):
        result = finalize("prepare_discovery", discovery_input(), discovery_candidate(), [])
        self.assertEqual(result["artifact"]["scope"]["status"], "proposed")
        self.assertEqual(result["artifact"]["scope"]["explicitUserConstraints"]["region"], "Latvia")
        self.assertEqual(result["artifact"]["scope"]["explicitUserConstraints"]["exclusions"], discovery_input()["exclusions"])
        self.assertIn("not a claim of user approval", result["markdown"])

    def test_discovery_empty_sources_makes_gap_not_fabricated_fact(self):
        proposed = discovery_candidate()
        proposed["knownFacts"] = []
        result = finalize("prepare_discovery", discovery_input(sources=[]), proposed, [])
        self.assertEqual(result["artifact"]["knownFacts"], [])
        self.assertTrue(any("not customer validation" in text for text in result["artifact"]["gaps"]))

    def test_discovery_rejects_unknown_uncertainty_or_orphan_uncertainty(self):
        for kind in ("unknown", "orphan"):
            proposed = discovery_candidate()
            if kind == "unknown":
                proposed["stakeholders"][0]["questions"][0]["uncertaintyId"] = "unknown"
            else:
                proposed["uncertainties"].append({"id": "orphan", "text": "An unmapped uncertainty"})
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                finalize("prepare_discovery", discovery_input(), proposed, [])

    def test_discovery_rejects_duplicate_question_ids_across_roles(self):
        proposed = discovery_candidate()
        second = deepcopy(proposed["stakeholders"][0])
        second.update(id="buyers", label="Buyers")
        proposed["stakeholders"].append(second)
        with self.assertRaises(ValueError):
            finalize("prepare_discovery", discovery_input(), proposed, [])

    def test_synthetic_quotes_are_not_published_as_known_facts(self):
        value = discovery_input(sources=[source(origin="synthetic_transcript")])
        proposed = discovery_candidate()
        proposed["knownFacts"][0]["basis"] = "simulation_hypothesis"
        result = finalize("prepare_discovery", value, proposed, [])
        self.assertEqual(result["artifact"]["knownFacts"], [])
        self.assertEqual(len(result["artifact"]["simulationHypotheses"]), 1)
        proposed["knownFacts"][0]["basis"] = "source_statement"
        with self.assertRaises(ValueError):
            finalize("prepare_discovery", value, proposed, [])

    def test_deep_really_increases_generation_and_source_question_budgets(self):
        standard = prepare("prepare_discovery", discovery_input(), [])
        deep = prepare("prepare_discovery", discovery_input(depth="deep"), [])
        self.assertGreater(deep["maxOutputTokens"], standard["maxOutputTokens"])
        for key in ("sources", "stakeholders", "discoveryQuestions", "marketQuestions", "findings"):
            self.assertGreater(deep["context"]["limits"][key], standard["context"]["limits"][key])

    def test_standard_role_bound_rejected_deep_accepts(self):
        proposed = discovery_candidate()
        template = proposed["stakeholders"][0]
        proposed["stakeholders"] = []
        for index in range(5):
            role = deepcopy(template)
            role.update(id=f"role-{index}", label=f"Role {index}")
            role["questions"][0]["id"] = f"question-{index}"
            proposed["stakeholders"].append(role)
        with self.assertRaises(ValueError):
            finalize("prepare_discovery", discovery_input(), proposed, [])
        self.assertTrue(finalize("prepare_discovery", discovery_input(depth="deep"), proposed, [])["validation"]["valid"])

    def test_deterministic_prepare_and_json_response(self):
        self.assertEqual(prepare("prepare_discovery", discovery_input(), []), prepare("prepare_discovery", deepcopy(discovery_input()), []))
        self.assertTrue(finalize("prepare_discovery", discovery_input(), json.dumps(discovery_candidate()), [])["validation"]["valid"])


class MarketTests(unittest.TestCase):
    def test_factual_findings_have_exact_quote_dates_hash_and_span(self):
        result = finalize("research_market", market_input(), market_candidate(), [])
        finding = result["artifact"]["findings"][0]
        self.assertEqual(finding["url"], "https://example.com/product")
        self.assertEqual(finding["publishedAt"], "2026-09-22")
        self.assertEqual(finding["retrievedAt"], "2026-09-23T13:00:00Z")
        self.assertEqual(finding["end"] - finding["start"], len(finding["quote"].encode()))
        self.assertEqual(len(finding["sourceSha256"]), 64)
        self.assertEqual(result["artifact"]["searchRequests"], [])

    def test_empty_sources_return_actionable_nonexecuted_search_requests(self):
        value = market_input(sources=[], exclusions=["Do not investigate payroll"])
        result = finalize("research_market", value, {"findings": [], "interpretations": [], "gaps": [], "limitations": []}, [])
        artifact = result["artifact"]
        self.assertEqual(artifact["evidenceStatus"], "missing")
        self.assertEqual(artifact["findings"], [])
        self.assertEqual(len(artifact["gaps"]), 1)
        search = artifact["searchRequests"][0]
        self.assertEqual(search["status"], "not_executed")
        self.assertEqual(search["executionOwner"], "goose")
        self.assertEqual(search["region"], "Latvia")
        self.assertEqual(search["exclusions"], value["exclusions"])
        self.assertNotIn("command", search)

    def test_unknown_source_invented_quote_and_question_are_rejected(self):
        for change in ({"sourceId": "invented"}, {"quote": "Globex has 500 staff."}, {"questionId": "unknown"}):
            proposed = market_candidate()
            proposed["findings"][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                finalize("research_market", market_input(), proposed, [])

    def test_unknown_source_date_is_not_invented(self):
        value = market_input()
        value["sources"][0]["publishedAt"] = None
        result = finalize("research_market", value, market_candidate(value), [])
        self.assertIsNone(result["artifact"]["findings"][0]["publishedAt"])

    def test_web_sources_need_url_and_valid_retrieval_date(self):
        for change in ({"url": None}, {"retrievedAt": None}, {"retrievedAt": "yesterday"}, {"publishedAt": "2026-02-31"}):
            value = market_input()
            value["sources"][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                prepare("research_market", value, [])

    def test_synthetic_market_evidence_never_satisfies_real_question(self):
        value = market_input(sources=[source(origin="synthetic_transcript")])
        proposed = market_candidate(value)
        proposed["findings"][0]["basis"] = "simulation_hypothesis"
        result = finalize("research_market", value, proposed, [])
        self.assertEqual(len(result["artifact"]["searchRequests"]), 1)
        self.assertIn("Simulation hypothesis", result["markdown"])
        proposed["findings"][0]["basis"] = "source_statement"
        with self.assertRaises(ValueError):
            finalize("research_market", value, proposed, [])

    def test_interpretation_is_hypothesis_and_requires_quoted_sources_for_same_question(self):
        proposed = market_candidate()
        proposed["interpretations"] = [{
            "questionId": proposed["findings"][0]["questionId"],
            "text": "Acme might be a useful product-comparison candidate.", "sourceIds": ["publisher-1"],
        }]
        result = finalize("research_market", market_input(), proposed, [])
        self.assertEqual(result["artifact"]["interpretations"][0]["basis"], "model_hypothesis")
        self.assertFalse(result["artifact"]["interpretations"][0]["verified"])
        proposed["interpretations"][0]["sourceIds"] = ["invented"]
        with self.assertRaises(ValueError):
            finalize("research_market", market_input(), proposed, [])

    def test_referenced_discovery_reuses_exact_question_ids_sources_and_scope(self):
        host = saved_discovery()
        value = {"brief": "Research this discovery plan", "references": [host["reference"]]}
        context = prepare("research_market", value, [host])["context"]
        self.assertEqual(context["questions"][0]["id"], host["artifact"]["stakeholders"][0]["questions"][0]["id"])
        self.assertEqual(context["sources"][0]["text"], source()["text"])
        self.assertEqual(context["region"], "Latvia")
        result = finalize("research_market", value, {}, [host])
        self.assertEqual(result["artifact"]["searchRequests"][0]["region"], "Latvia")
        self.assertEqual(result["artifact"]["exclusions"], discovery_input()["exclusions"])

    def test_explicit_new_region_is_not_overwritten_by_old_saved_scope(self):
        host = saved_discovery()
        context = prepare("research_market", {"brief": "Now compare Lithuania", "region": "Lithuania"}, [host])["context"]
        self.assertEqual(context["region"], "Lithuania")

    def test_conflicting_source_ids_and_scopes_rejected(self):
        host = saved_discovery()
        with self.assertRaises(ValueError):
            prepare("research_market", {"brief": "Research this", "sources": [source(text="Contradictory identity")]}, [host])
        other = deepcopy(host)
        other["artifact"]["scope"]["explicitUserConstraints"]["region"] = "Germany"
        with self.assertRaises(ValueError):
            prepare("research_market", {"brief": "Research these"}, [host, other])

    def test_depth_question_bounds_do_not_silently_truncate(self):
        questions = [f"Research market question {index}?" for index in range(7)]
        with self.assertRaises(ValueError):
            prepare("research_market", market_input(questions=questions), [])
        context = prepare("research_market", market_input(questions=questions, depth="deep"), [])["context"]
        self.assertEqual(len(context["questions"]), 7)

    def test_markup_is_not_executable_html_or_image(self):
        value = market_input()
        value["sources"][0]["text"] = '<script>alert(1)</script> ![remote](https://example.com/image.png)'
        result = finalize("research_market", value, market_candidate(value), [])
        self.assertNotIn("<script>", result["markdown"])
        self.assertNotIn("![remote]", result["markdown"])

    def test_generated_metadata_cannot_claim_search_execution_or_approval(self):
        proposed = market_candidate()
        proposed["searchPerformed"] = True
        with self.assertRaises(ValueError):
            finalize("research_market", market_input(), proposed, [])
        proposed = discovery_candidate()
        proposed["approved"] = True
        with self.assertRaises(ValueError):
            finalize("prepare_discovery", discovery_input(), proposed, [])


if __name__ == "__main__":
    unittest.main()
