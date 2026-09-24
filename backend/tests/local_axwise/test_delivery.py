"""Offline exact-PRD delivery handoff and revision tests."""

from copy import deepcopy
import json
import unittest

from backend.domain.workflow_v2.wire import canonical_hash
from backend.services.local_axwise.delivery import DESCRIPTIONS, INPUT_MODELS, finalize, prepare
from backend.services.local_axwise.kernel import finalize as finalize_prd
from backend.tests.local_axwise.fixtures import candidate as prd_candidate, inputs


def prd_host():
    value = inputs()["create_prd"]
    proposed = prd_candidate("create_prd", value)
    result = finalize_prd("create_prd", value, proposed)
    return {
        "reference": {"operationId": "11111111-1111-4111-8111-111111111111", "sha256": "a" * 64},
        "tool": "create_prd", "input": value, "candidate": proposed,
        "artifact": result["artifact"], "markdown": result["markdown"],
    }


def requirement_item(host):
    return next(section for section in host["artifact"]["sections"] if section["heading"] == "Prioritized requirements")["items"][0]


def delivery_input(host=None, **updates):
    host = host or prd_host()
    return {"references": [host["reference"]], **updates}


def acceptance():
    return {
        "given": "A saved handoff with two distinct team owners",
        "when": "The next owner accepts the handoff in the proposed tracker",
        "then": "The handoff shows the new owner and preserves the prior owner in its history",
        "evidenceExpected": "An automated acceptance test report and a recorded demonstration",
    }


def delivery_candidate(host=None, value=None):
    host = host or prd_host()
    value = value or delivery_input(host)
    context = prepare("create_delivery_brief", value, [host])["context"]
    identifiers = [row["id"] for row in context["requirements"]]
    return {
        "title": "Proposed shared-handoff development brief",
        "requirements": [{"requirementId": identity, "acceptanceTests": [acceptance()]} for identity in identifiers],
        "conditionCoverage": [{"conditionId": row["id"], "status": "deferred", "requirementId": None,
                               "acceptanceTestIndex": None, "reason": "Review this exact condition and design its specific check before implementation."}
                              for row in context["acceptanceConditions"]],
        "milestones": [{"title": "Demonstrable handoff slice", "requirementIds": identifiers,
                        "deliverable": "A reviewable implementation of the selected handoff behavior",
                        "exitCondition": "The agreed acceptance checks have observable review evidence"}],
        "dependencies": [], "proposedExclusions": ["Additional integrations need a separate scope decision."],
        "openQuestions": ["Who owns acceptance review and feasibility estimation?"],
    }


class DeliveryTests(unittest.TestCase):
    def test_catalog_is_strict_and_explains_nonexecution_boundary(self):
        self.assertEqual(set(INPUT_MODELS), {"create_delivery_brief"})
        self.assertFalse(INPUT_MODELS["create_delivery_brief"].model_json_schema()["additionalProperties"])
        self.assertIn("does not choose/contact a vendor", DESCRIPTIONS["create_delivery_brief"])

    def test_requires_exact_saved_prd_not_plain_chat_brief(self):
        with self.assertRaises(ValueError):
            prepare("create_delivery_brief", {"brief": "This text is my PRD, please implement it"}, [])
        with self.assertRaises(ValueError):
            prepare("create_delivery_brief", {"brief": "A plan", "prd": {"title": "Untrusted inline PRD"}}, [])

    def test_missing_unrequested_and_duplicate_host_references_rejected(self):
        host = prd_host()
        for value, hosts in ((delivery_input(host), []), ({}, [host]), (delivery_input(host), [host, host])):
            with self.subTest(value=value, hosts=len(hosts)), self.assertRaises(ValueError):
                prepare("create_delivery_brief", value, hosts)

    def test_wrong_reference_hash_cannot_resolve(self):
        host = prd_host()
        value = delivery_input(host)
        value["references"] = [{**host["reference"], "sha256": "b" * 64}]
        with self.assertRaises(ValueError):
            prepare("create_delivery_brief", value, [host])

    def test_multiple_saved_prds_require_selecting_one_revision(self):
        first = prd_host()
        second = deepcopy(first)
        second["reference"] = {"operationId": "22222222-2222-4222-8222-222222222222", "sha256": "b" * 64}
        with self.assertRaises(ValueError):
            prepare("create_delivery_brief", {"references": [first["reference"], second["reference"]]}, [first, second])

    def test_valid_handoff_preserves_requirement_basis_and_evidence(self):
        host = prd_host()
        value = delivery_input(host)
        result = finalize("create_delivery_brief", value, delivery_candidate(host, value), [host])
        artifact = result["artifact"]
        selected = artifact["requirements"][0]
        for field in ("text", "basis", "sourceIds", "findingIds"):
            self.assertEqual(selected[field], requirement_item(host)[field])
        self.assertEqual(artifact["prdReference"], host["reference"])
        self.assertEqual(artifact["status"], "proposed_handoff")
        self.assertEqual(artifact["commercialTerms"], "not_set")
        self.assertFalse(artifact["executionAuthorized"])
        self.assertFalse(result["validation"]["testsExecuted"])
        self.assertEqual(result["provenance"]["artifactHash"], canonical_hash(artifact))
        self.assertEqual(selected["acceptanceTests"][0]["status"], "proposed_not_run")

    def test_all_exact_acceptance_and_metric_sections_survive_handoff(self):
        host = prd_host()
        expected = [section for section in host["artifact"]["sections"]
                    if section["heading"] in {"Acceptance criteria", "Metrics and validation"}]
        # No trimming or replacement of exact immutable source strings.
        expected[0]["items"][0]["text"] = "  Deny unauthorized queue access with HTTP 403.  "
        expected[0]["items"][0]["sourceIds"] = ["owner-1"]
        expected[0]["items"][0]["findingIds"] = ["f" * 64]
        result = finalize("create_delivery_brief", delivery_input(host), delivery_candidate(host), [host])
        artifact = result["artifact"]
        actual = [section for section in artifact["prdConstraints"] if section["heading"] in {"Acceptance criteria", "Metrics and validation"}]
        self.assertEqual(actual, expected)
        originals = [row for section in expected for row in section["items"]]
        self.assertEqual([{key: row[key] for key in ("text", "basis", "sourceIds", "findingIds")}
                          for row in artifact["acceptanceConditions"]], originals)
        self.assertIn("HTTP 403", result["markdown"])
        self.assertIn("Metrics and validation", result["markdown"])
        self.assertIn("Deferred —", result["markdown"])
        self.assertTrue(result["validation"]["conditionAccountingComplete"])
        self.assertFalse(result["validation"]["semanticCoverageVerified"])

    def test_covered_condition_maps_exact_saved_test_identity(self):
        host = prd_host()
        proposed = delivery_candidate(host)
        first = proposed["conditionCoverage"][0]
        first.update(status="covered", requirementId=proposed["requirements"][0]["requirementId"],
                     acceptanceTestIndex=0, reason=None)
        # Candidate order does not control the saved source-condition order.
        proposed["conditionCoverage"].reverse()
        result = finalize("create_delivery_brief", delivery_input(host), proposed, [host])
        artifact = result["artifact"]
        disposition = artifact["conditionCoverage"][0]
        self.assertEqual(disposition["conditionId"], artifact["acceptanceConditions"][0]["id"])
        self.assertEqual(disposition["acceptanceTestId"], artifact["requirements"][0]["acceptanceTests"][0]["id"])
        self.assertEqual(result["validation"]["conditionsDeferred"], len(proposed["conditionCoverage"]) - 1)
        self.assertIn("Covered by proposed check", result["markdown"])
        self.assertIn("semantic mapping requires review", result["markdown"])

    def test_missing_duplicate_unknown_and_omitted_condition_coverage_rejected(self):
        host = prd_host()
        for mode in ("missing", "duplicate", "unknown", "omitted"):
            proposed = delivery_candidate(host)
            if mode == "missing":
                proposed["conditionCoverage"].pop()
            elif mode == "duplicate":
                proposed["conditionCoverage"].append(deepcopy(proposed["conditionCoverage"][0]))
            elif mode == "unknown":
                proposed["conditionCoverage"][0]["conditionId"] = "condition-unknown"
            else:
                del proposed["conditionCoverage"]
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_condition_coverage_rejects_nonexistent_and_non_integer_test_indexes(self):
        host = prd_host()
        for index in (-1, 1, 4, True, 0.0):
            proposed = delivery_candidate(host)
            proposed["conditionCoverage"][0].update(status="covered", reason=None,
                requirementId=proposed["requirements"][0]["requirementId"], acceptanceTestIndex=index)
            with self.subTest(index=index), self.assertRaises(ValueError):
                finalize("create_delivery_brief", delivery_input(host), proposed, [host])
        proposed = delivery_candidate(host)
        proposed["conditionCoverage"][0].update(status="covered", reason=None,
            requirementId="requirement-unknown", acceptanceTestIndex=0)
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_covered_and_deferred_fields_are_mutually_exclusive(self):
        host = prd_host()
        for patch in ({"reason": " "}, {"reason": None}, {"acceptanceTestIndex": 0},
                      {"status": "covered"}, {"status": "ignored"}, {"text": "Rewritten source condition"}):
            proposed = delivery_candidate(host)
            proposed["conditionCoverage"][0].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                finalize("create_delivery_brief", delivery_input(host), proposed, [host])
        proposed = delivery_candidate(host)
        proposed["conditionCoverage"][0].update(status="covered", acceptanceTestIndex=0,
            requirementId=proposed["requirements"][0]["requirementId"])
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_all_32_conditions_preserved_when_test_budget_is_full(self):
        host = prd_host()
        for section in host["artifact"]["sections"]:
            if section["heading"] in {"Acceptance criteria", "Metrics and validation"}:
                original = section["items"][0]
                section["items"] = [{**deepcopy(original), "text": f"{section['heading']} source condition {index}: do not omit this exact condition."}
                                    for index in range(16)]
        proposed = delivery_candidate(host)
        proposed["requirements"][0]["acceptanceTests"].append({**acceptance(), "then": "The prior owner is still observable after a second handoff transition"})
        proposed["conditionCoverage"][-1]["reason"] = "The selected two-test budget is full; design a distinct authorization check before acceptance."
        result = finalize("create_delivery_brief", delivery_input(host), proposed, [host])
        self.assertEqual(len(result["artifact"]["acceptanceConditions"]), 32)
        self.assertEqual(len(result["artifact"]["conditionCoverage"]), 32)
        self.assertEqual(result["validation"]["conditionsDeferred"], 32)
        self.assertIn("two-test budget is full", result["markdown"])

    def test_condition_identity_tracks_content_basis_evidence_not_list_position(self):
        host = prd_host()
        section = next(section for section in host["artifact"]["sections"] if section["heading"] == "Acceptance criteria")
        section["items"].append({**deepcopy(section["items"][0]), "text": "Verify updates appear for all concurrent queue viewers."})
        context = prepare("create_delivery_brief", delivery_input(host), [host])["context"]
        original = {row["text"]: row["id"] for row in context["acceptanceConditions"]}
        section["items"].reverse()
        reordered = prepare("create_delivery_brief", delivery_input(host), [host])["context"]
        self.assertEqual({row["text"]: row["id"] for row in reordered["acceptanceConditions"]}, original)
        for field, value in (("text", "This exact condition is revised."), ("basis", "gap"),
                             ("sourceIds", ["changed-source"]), ("findingIds", ["e" * 64])):
            revised = deepcopy(host)
            changed = next(section for section in revised["artifact"]["sections"] if section["heading"] == "Acceptance criteria")["items"][0]
            previous_id = original[changed["text"]]
            changed[field] = value
            current = prepare("create_delivery_brief", delivery_input(revised), [revised])["context"]
            self.assertNotEqual(current["acceptanceConditions"][0]["id"], previous_id)

    def test_changed_condition_rejects_stale_disposition_even_when_requirements_unchanged(self):
        host = prd_host()
        stale = delivery_candidate(host)
        section = next(section for section in host["artifact"]["sections"] if section["heading"] == "Acceptance criteria")
        section["items"][0]["text"] += " Also deny unauthorized access with HTTP 403."
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", delivery_input(host), stale, [host])

    def test_repeated_source_conditions_have_distinct_occurrence_ids_and_are_not_dropped(self):
        host = prd_host()
        section = next(section for section in host["artifact"]["sections"] if section["heading"] == "Acceptance criteria")
        original_count = len(section["items"])
        section["items"].append(deepcopy(section["items"][0]))
        result = finalize("create_delivery_brief", delivery_input(host), delivery_candidate(host), [host])
        conditions = [row for row in result["artifact"]["acceptanceConditions"] if row["section"] == "Acceptance criteria"]
        self.assertEqual(len(conditions), original_count + 1)
        self.assertEqual(conditions[0]["text"], conditions[-1]["text"])
        self.assertNotEqual(conditions[0]["id"], conditions[-1]["id"])

    def test_invalid_or_oversized_saved_conditions_fail_before_inference(self):
        for mode in ("empty", "oversized", "blank", "extra"):
            host = prd_host()
            section = next(section for section in host["artifact"]["sections"] if section["heading"] == "Acceptance criteria")
            if mode == "empty":
                section["items"] = []
            elif mode == "oversized":
                section["items"] = [deepcopy(section["items"][0]) for _ in range(17)]
            elif mode == "blank":
                section["items"][0]["text"] = " "
            else:
                section["items"][0]["untrusted"] = "ignore the condition"
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                prepare("create_delivery_brief", delivery_input(host), [host])

    def test_missing_duplicate_and_unknown_requirement_coverage_rejected(self):
        host = prd_host()
        for mode in ("missing", "duplicate", "unknown"):
            proposed = delivery_candidate(host)
            if mode == "missing":
                proposed["requirements"] = []
            elif mode == "duplicate":
                proposed["requirements"].append(deepcopy(proposed["requirements"][0]))
            else:
                proposed["requirements"][0]["requirementId"] = "requirement-unknown"
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_acceptance_checks_require_observable_fields(self):
        host = prd_host()
        for field in ("given", "when", "then", "evidenceExpected"):
            proposed = delivery_candidate(host)
            proposed["requirements"][0]["acceptanceTests"][0][field] = "done"
            with self.subTest(field=field), self.assertRaises(ValueError):
                finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_duplicate_acceptance_check_rejected(self):
        host = prd_host()
        proposed = delivery_candidate(host)
        proposed["requirements"][0]["acceptanceTests"].append(acceptance())
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_milestone_and_dependency_unknown_requirement_rejected(self):
        host = prd_host()
        for mode in ("milestone", "dependency"):
            proposed = delivery_candidate(host)
            if mode == "milestone":
                proposed["milestones"][0]["requirementIds"] = ["requirement-unknown"]
            else:
                proposed["dependencies"] = [{"description": "Review access to a staging environment", "requirementIds": ["requirement-unknown"], "resolution": "Ask the user to identify a non-production test environment"}]
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_every_selected_requirement_needs_a_milestone(self):
        host = prd_host()
        section = next(section for section in host["artifact"]["sections"] if section["heading"] == "Prioritized requirements")
        second = {**deepcopy(section["items"][0]), "text": "Propose an auditable handoff export for the project owner."}
        section["items"].append(second)
        proposed = delivery_candidate(host)
        proposed["milestones"][0]["requirementIds"].pop()
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_selected_subset_reports_explicit_unselected_requirements(self):
        host = prd_host()
        section = next(section for section in host["artifact"]["sections"] if section["heading"] == "Prioritized requirements")
        section["items"].append({**deepcopy(section["items"][0]), "text": "Propose a structured handoff export."})
        all_rows = prepare("create_delivery_brief", delivery_input(host), [host])["context"]["requirements"]
        value = delivery_input(host, requirementIds=[all_rows[0]["id"]])
        result = finalize("create_delivery_brief", value, delivery_candidate(host, value), [host])
        self.assertEqual(len(result["artifact"]["requirements"]), 1)
        self.assertEqual(result["artifact"]["unselectedRequirementIds"], [all_rows[1]["id"]])
        self.assertEqual(result["artifact"]["acceptanceConditions"],
                         prepare("create_delivery_brief", delivery_input(host), [host])["context"]["acceptanceConditions"])

    def test_changed_prd_requirement_produces_new_id_and_rejects_stale_candidate(self):
        original = prd_host()
        stale = delivery_candidate(original)
        revised = deepcopy(original)
        revised["reference"] = {**original["reference"], "sha256": "b" * 64}
        requirement_item(revised)["text"] += " The export must preserve original owner history."
        old = stale["requirements"][0]["requirementId"]
        new = delivery_candidate(revised)["requirements"][0]["requirementId"]
        self.assertNotEqual(old, new)
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", delivery_input(revised), stale, [revised])
        with self.assertRaises(ValueError):
            prepare("create_delivery_brief", delivery_input(revised, requirementIds=[old]), [revised])

    def test_evidence_basis_change_also_changes_requirement_identity(self):
        original = prd_host()
        revised = deepcopy(original)
        requirement_item(revised)["basis"] = "simulation_hypothesis"
        requirement_item(revised)["sourceIds"] = ["synthetic-1"]
        self.assertNotEqual(delivery_candidate(original)["requirements"][0]["requirementId"], delivery_candidate(revised)["requirements"][0]["requirementId"])

    def test_synthetic_and_gap_requirements_remain_open_decisions(self):
        for basis in ("simulation_hypothesis", "gap"):
            host = prd_host()
            requirement_item(host)["basis"] = basis
            result = finalize("create_delivery_brief", delivery_input(host), delivery_candidate(host), [host])
            self.assertEqual(result["artifact"]["requirements"][0]["basis"], basis)
            expected = "real users" if basis == "simulation_hypothesis" else "Resolve PRD gap"
            self.assertTrue(any(expected in row for row in result["artifact"]["openQuestions"]))

    def test_deep_increases_milestone_and_test_budgets_not_missing_requirements(self):
        host = prd_host()
        standard = prepare("create_delivery_brief", delivery_input(host), [host])
        deep = prepare("create_delivery_brief", delivery_input(host, depth="deep"), [host])
        self.assertEqual(standard["context"]["requirements"], deep["context"]["requirements"])
        self.assertGreater(deep["maxOutputTokens"], standard["maxOutputTokens"])
        for field in ("milestones", "testsPerRequirement", "dependencies"):
            self.assertGreater(deep["context"]["budget"][field], standard["context"]["budget"][field])

    def test_five_milestones_need_deep(self):
        host = prd_host()
        proposed = delivery_candidate(host)
        proposed["milestones"] = [{**deepcopy(proposed["milestones"][0]), "title": f"Proposed stage {index}"} for index in range(5)]
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", delivery_input(host), proposed, [host])
        result = finalize("create_delivery_brief", delivery_input(host, depth="deep"), proposed, [host])
        self.assertEqual(len(result["artifact"]["milestones"]), 5)

    def test_invented_dates_prices_and_execution_fields_rejected(self):
        host = prd_host()
        for extra in ("Budget is €5000", "Launch on 2026-10-01", "Deliver on October 4, 2026"):
            proposed = delivery_candidate(host)
            proposed["milestones"][0]["deliverable"] += " " + extra
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                finalize("create_delivery_brief", delivery_input(host), proposed, [host])
        proposed = delivery_candidate(host)
        proposed["vendorSelected"] = "A fictional outsourcing vendor"
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", delivery_input(host), proposed, [host])

    def test_supplied_target_date_is_not_treated_as_execution_commitment(self):
        host = prd_host()
        value = delivery_input(host, brief="Prepare a handoff; 2026-10-01 is an unconfirmed requested target, not a commitment.")
        proposed = delivery_candidate(host, value)
        proposed["openQuestions"].append("Is the requested target 2026-10-01 feasible after estimation?")
        result = finalize("create_delivery_brief", value, proposed, [host])
        self.assertFalse(result["artifact"]["executionAuthorized"])

    def test_exact_discovery_scope_is_preserved_including_exclusions(self):
        host = prd_host()
        scope = {
            "reference": {"operationId": "22222222-2222-4222-8222-222222222222", "sha256": "b" * 64},
            "tool": "prepare_discovery", "artifact": {
                "schemaVersion": "axwise.local-discovery.v1",
                "scope": {"status": "proposed", "items": ["Handoffs only"], "explicitUserConstraints": {"region": "Latvia", "exclusions": ["Payroll is excluded"]}},
            },
        }
        value = {"references": [host["reference"], scope["reference"]]}
        proposed = delivery_candidate(host)
        result = finalize("create_delivery_brief", value, proposed, [host, scope])
        self.assertEqual(result["artifact"]["scope"], scope["artifact"]["scope"])
        self.assertEqual(result["artifact"]["scopeReference"], scope["reference"])
        self.assertIn("Payroll is excluded", result["markdown"])

    def test_revision_must_target_same_tool_and_never_replaces_required_prd(self):
        host = prd_host()
        with self.assertRaises(ValueError):
            prepare("create_delivery_brief", {"revisionOf": host["reference"]}, [host])
        current = finalize("create_delivery_brief", delivery_input(host), delivery_candidate(host), [host])
        prior = {"reference": {"operationId": "22222222-2222-4222-8222-222222222222", "sha256": "b" * 64}, "tool": "create_delivery_brief", "artifact": current["artifact"]}
        value = delivery_input(host, revisionOf=prior["reference"])
        prepared = prepare("create_delivery_brief", value, [host, prior])
        self.assertEqual(prepared["context"]["previousBriefs"][0]["artifact"], current["artifact"])

    def test_missing_prioritized_section_and_duplicate_requirements_rejected(self):
        for mode in ("missing", "duplicate"):
            host = prd_host()
            section = next(section for section in host["artifact"]["sections"] if section["heading"] == "Prioritized requirements")
            if mode == "missing":
                section["heading"] = "Not a PRD requirement section"
            else:
                section["items"].append(deepcopy(section["items"][0]))
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                prepare("create_delivery_brief", delivery_input(host), [host])

    def test_json_response_and_deterministic_preparation(self):
        host = prd_host()
        value = delivery_input(host)
        self.assertEqual(prepare("create_delivery_brief", value, [host]), prepare("create_delivery_brief", deepcopy(value), [deepcopy(host)]))
        self.assertTrue(finalize("create_delivery_brief", value, json.dumps(delivery_candidate(host)), [host])["validation"]["valid"])


if __name__ == "__main__":
    unittest.main()
