"""Offline cross-stage integration through the real local kernel boundary.

Provider responses are fixtures; immutable host records model the already
verified state resolver. These tests do not claim model quality or live timings.
"""

from copy import deepcopy
import json
import unittest
from unittest.mock import patch

from backend.services.local_axwise.kernel import finalize, prepare
from backend.tests.local_axwise.test_discovery import discovery_input, discovery_candidate, market_input
from backend.tests.local_axwise.test_personas import generation_candidate
from backend.tests.local_axwise.fixtures import candidate as legacy_candidate, inputs as legacy_inputs


def reference(index):
    return {"operationId": f"00000000-0000-4000-8000-{index:012d}", "sha256": f"{index:064x}"}


def save(tool, value, candidate, hosts=(), *, index):
    prepared = prepare(tool, value, list(hosts) or None)
    result = finalize(tool, value, candidate, context=prepared["context"], host_evidence=list(hosts) or None)
    return {
        "reference": reference(index), "tool": tool,
        "input": deepcopy(prepared.get("resolvedInput", value)),
        "selectedInput": deepcopy(value), "candidate": deepcopy(candidate),
        "artifact": result["artifact"], "markdown": result["markdown"],
    }


def scope_host():
    return save("prepare_discovery", discovery_input(), discovery_candidate(), index=1)


def personas_host(scope=None, *, participants=1):
    scope = scope or scope_host()
    value = {"references": [scope["reference"]]}
    if participants != 1:
        value["stakeholders"] = [{key: row[key] for key in ("id", "label", "description")} | {"participants": participants}
                                 for row in scope["artifact"]["stakeholders"]]
    proposed = generation_candidate(value, [scope])
    return save("generate_personas", value, proposed, [scope], index=2)


def simulation_input(cohort, *, depth="standard"):
    return {
        "references": [cohort["reference"]], "depth": depth,
        "scenario": "Explore a shared handoff tracker for small software teams in Latvia",
        "targetAudience": "Operations leads in small software teams",
        "problem": "Manual copying obscures handoff ownership",
    }


def simulation_candidate(value, hosts):
    payload = json.loads(prepare("simulate_interviews", value, hosts)["userPrompt"])
    participants, interviews = [], []
    for slot in payload["plan"]:
        binding = next(row for row in payload["personaBindings"] if row["participantId"] == slot["participantId"])
        person = next(row for row in payload["selectedPersonas"] if row["id"] == binding["personaId"])
        participants.append({
            **slot, "displayName": person["label"], "biography": person["description"],
            "motivations": [row["text"] for row in person["motivations"]],
            "painPoints": [row["text"] for row in person["painPoints"]],
            "communicationStyle": person["communicationStyle"], "origin": "synthetic",
        })
        group = next(row for row in payload["stakeholders"] if row["stakeholderId"] == slot["stakeholderId"])
        interviews.append({
            "participantId": slot["participantId"],
            "answers": [{"questionId": question["questionId"],
                         "text": "As a simulated operations lead, I might lose time copying handoff details between tools."}
                        for question in group["questions"]],
        })
    return {"participants": participants, "interviews": interviews}


def simulation_host(cohort=None):
    cohort = cohort or personas_host()
    value = simulation_input(cohort)
    return save("simulate_interviews", value, simulation_candidate(value, [cohort]), [cohort], index=3)


def analysis_input(simulation, *, views=True):
    return {
        "decisionQuestion": "Which handoff need should a prototype test?",
        "questions": ["Which handoff need should a prototype test?"],
        "references": [simulation["reference"]],
        "views": ["themes", "patterns", "stakeholders", "sentiment", "insights"] if views else [],
    }


def analysis_candidate(value, hosts):
    payload = json.loads(prepare("analyze_interviews", value, hosts)["userPrompt"])
    quote = payload["availableWholeTurnQuotes"][0]
    core = {
        "quotes": [{"key": "q-quote", **quote}],
        "findings": [{"key": "finding-1", "category": "pain", "statement": quote["text"],
                      "basis": "simulation_hypothesis", "supportStatus": "supported",
                      "quoteKeys": ["q-quote"], "questionIds": [payload["request"]["questions"][0]["id"]],
                      "participantRefs": [{"documentId": quote["documentId"], "participantId": quote["participantId"]}]}],
        "personas": [], "gaps": [], "limitations": ["These are synthetic interview responses, not real customer validation."],
    }
    if not value.get("views"):
        return core
    return {"analysis": core, "views": [{"kind": kind, "title": f"Handoff exploration: {kind}",
            "summary": "This simulated participant suggests that repeated copying may create friction; real interviews are still needed.",
            "findingIndexes": [0], "status": "hypothesis"} for kind in value["views"]]}


def analysis_host(simulation=None):
    simulation = simulation or simulation_host()
    value = analysis_input(simulation)
    return save("analyze_interviews", value, analysis_candidate(value, [simulation]), [simulation], index=4)


def market_host():
    value = market_input()
    context = prepare("research_market", value)["context"]
    proposed = {"findings": [{"questionId": context["questions"][0]["id"],
                              "sourceId": value["sources"][0]["id"], "quote": value["sources"][0]["text"],
                              "basis": "source_statement"}], "interpretations": [], "gaps": [], "limitations": []}
    return save("research_market", value, proposed, index=5)


def prd_input(analysis, market):
    return {"brief": "Create a provisional software PRD for a shared handoff tracker; preserve evidence gaps.",
            "artifactType": "software_prd", "references": [analysis["reference"], market["reference"]]}


def prd_candidate(value, hosts):
    payload = json.loads(prepare("create_prd", value, hosts)["userPrompt"])
    finding = payload["analysisFindings"][0]
    sections = []
    for heading in payload["requiredSections"]:
        item = {"text": "Propose an auditable handoff prototype and review observed copying time with the product owner before expansion.",
                "basis": "proposal", "sourceIds": [], "findingIds": []}
        if heading == "Prioritized requirements":
            item.update(text="P1: Propose a handoff ownership history; verify a test preserves prior owners when responsibility changes.",
                        basis="simulation_hypothesis", sourceIds=finding["sourceIds"], findingIds=[finding["findingId"]])
        if heading == "Evidence, assumptions, and gaps":
            source = next(row for row in payload["input"]["sources"] if row["origin"] == "web_source")
            item.update(text=source["text"], basis="source_statement", sourceIds=[source["id"]])
        sections.append({"heading": heading, "items": [item]})
    return {"title": "Provisional software handoff PRD", "sections": sections}


def prd_host(analysis=None, market=None):
    analysis = analysis or analysis_host()
    market = market or market_host()
    value = prd_input(analysis, market)
    return save("create_prd", value, prd_candidate(value, [analysis, market]), [analysis, market], index=6)


def delivery_candidate(value, hosts):
    context = prepare("create_delivery_brief", value, hosts)["context"]
    identifiers = [row["id"] for row in context["requirements"]]
    return {
        "title": "Proposed development handoff",
        "requirements": [{"requirementId": identity, "acceptanceTests": [{
            "given": "A saved handoff with an existing owner",
            "when": "Another owner accepts the handoff in the test environment",
            "then": "The new owner is displayed and the previous owner remains in the history",
            "evidenceExpected": "An automated integration test report and a recorded demo",
        }]} for identity in identifiers],
        "conditionCoverage": [{"conditionId": row["id"], "status": "deferred", "requirementId": None,
                               "acceptanceTestIndex": None, "reason": "Design the specific check for this retained condition before implementation."}
                              for row in context["acceptanceConditions"]],
        "milestones": [{"title": "Reviewable handoff prototype", "requirementIds": identifiers,
                        "deliverable": "A reviewable prototype of the selected handoff flow",
                        "exitCondition": "A reviewer can inspect the requested acceptance test evidence"}],
        "dependencies": [], "proposedExclusions": [], "openQuestions": ["Which real users can validate the simulated need?"],
    }


class PipelineIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.guard = patch("socket.socket.connect", side_effect=AssertionError("local pipeline attempted network"))
        self.guard.start()
        self.addCleanup(self.guard.stop)

    def test_scope_persona_simulation_keeps_exact_roles_questions_and_bindings(self):
        scope = scope_host()
        cohort = personas_host(scope)
        simulation = simulation_host(cohort)
        expected_questions = scope["artifact"]["stakeholders"][0]["questions"]
        self.assertEqual(cohort["artifact"]["questionPlan"][0]["questions"], expected_questions)
        self.assertEqual(cohort["artifact"]["scopeReference"], scope["reference"])
        self.assertEqual(simulation["artifact"]["selectedPersonas"], cohort["artifact"]["personas"])
        binding = simulation["artifact"]["personaBindings"][0]
        self.assertEqual(binding["personaId"], cohort["artifact"]["personas"][0]["id"])
        actual_questions = {turn["questionId"] for doc in simulation["artifact"]["corpus"]["documents"] for turn in doc["turns"]}
        self.assertEqual(actual_questions, {row["id"] for row in expected_questions})
        self.assertTrue(all(doc["origin"] == "synthetic_transcript" for doc in simulation["artifact"]["corpus"]["documents"]))

    def test_deep_simulation_has_independent_per_person_tasks_and_bounded_concurrency(self):
        cohort = personas_host(participants=2)
        prepared = prepare("simulate_interviews", simulation_input(cohort, depth="deep"), [cohort])
        self.assertEqual(prepared["concurrency"], 2)
        self.assertEqual(prepared["aggregation"], "simulation_cohort")
        self.assertEqual(len(prepared["generationTasks"]), 2)
        people = []
        for task in prepared["generationTasks"]:
            payload = json.loads(task["userPrompt"])
            self.assertEqual(len(payload["plan"]), 1)
            self.assertEqual(len(payload["personaBindings"]), 1)
            self.assertEqual(len(payload["selectedPersonas"]), 1)
            self.assertEqual(len(payload["fixedParticipants"]), 1)
            self.assertEqual(payload["selectedPersonas"][0]["id"], payload["personaBindings"][0]["personaId"])
            self.assertEqual(task["responseSchema"]["required"], ["interviews"])
            self.assertNotIn("participants", task["responseSchema"]["properties"])
            people.append(payload["selectedPersonas"][0]["id"])
        self.assertEqual(set(people), {person["id"] for person in cohort["artifact"]["personas"]})

    def test_saved_persona_generation_schema_accepts_answers_only_and_host_fixes_profiles(self):
        cohort = personas_host()
        original_cohort = deepcopy(cohort)
        value = simulation_input(cohort)
        prepared = prepare("simulate_interviews", value, [cohort])
        payload = json.loads(prepared["userPrompt"])
        self.assertEqual(prepared["responseSchema"]["required"], ["interviews"])
        self.assertNotIn("participants", prepared["responseSchema"]["properties"])
        self.assertEqual(prepared["fixedParticipants"], payload["fixedParticipants"])
        candidate = simulation_candidate(value, [cohort])
        candidate.pop("participants")
        result = finalize("simulate_interviews", value, candidate, host_evidence=[cohort])
        self.assertEqual(result["artifact"]["participants"], prepared["fixedParticipants"])
        self.assertEqual(cohort, original_cohort)
        self.assertEqual(result["artifact"]["selectedPersonas"], cohort["artifact"]["personas"])

    def test_saved_participant_profile_drift_rejected_even_when_slot_ids_match(self):
        cohort = personas_host()
        value = simulation_input(cohort)
        changes = {
            "displayName": "Synthetic unrelated replacement",
            "biography": "An unrelated fictional finance director with different workflows and requirements.",
            "motivations": ["Run acquisitions", "Replace finance systems"],
            "painPoints": ["Quarterly reporting", "International procurement"],
            "communicationStyle": "Formal, impatient and focused on international acquisitions.",
        }
        for field, replacement in changes.items():
            candidate = simulation_candidate(value, [cohort])
            candidate["participants"][0][field] = replacement
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "must not replace saved persona"):
                finalize("simulate_interviews", value, candidate, host_evidence=[cohort])

    def test_legacy_exact_participant_payload_remains_accepted_for_saved_personas(self):
        cohort = personas_host()
        value = simulation_input(cohort)
        candidate = simulation_candidate(value, [cohort])
        result = finalize("simulate_interviews", value, candidate, host_evidence=[cohort])
        self.assertEqual(result["artifact"]["participants"], prepare("simulate_interviews", value, [cohort])["fixedParticipants"])

    def test_deep_answer_only_results_rejoin_fixed_personas_in_plan_order(self):
        cohort = personas_host(participants=2)
        value = simulation_input(cohort, depth="deep")
        prepared = prepare("simulate_interviews", value, [cohort])
        candidate = simulation_candidate(value, [cohort])
        result = finalize("simulate_interviews", value, {"interviews": candidate["interviews"]}, host_evidence=[cohort])
        self.assertEqual(result["artifact"]["participants"], prepared["fixedParticipants"])
        self.assertEqual([row["participantId"] for row in result["artifact"]["participants"]],
                         [row["participantId"] for row in candidate["interviews"]])

    def test_incompatible_legacy_saved_profile_fails_before_generation_not_truncated(self):
        cohort = personas_host()
        cohort["artifact"]["personas"][0]["label"] = "Synthetic " + "x" * 120
        with self.assertRaises(ValueError):
            prepare("simulate_interviews", simulation_input(cohort), [cohort])

    def test_reference_only_cohort_invocation_uses_exact_saved_discovery_context(self):
        cohort = personas_host()
        value = {"references": [cohort["reference"]]}
        prepared = prepare("simulate_interviews", value, [cohort])
        resolved = prepared["resolvedInput"]
        self.assertEqual(resolved["scenario"], cohort["artifact"]["brief"])
        self.assertEqual(resolved["problem"], cohort["artifact"]["decision"])
        self.assertEqual(resolved["targetAudience"], cohort["artifact"]["stakeholders"][0]["label"])
        candidate = simulation_candidate(value, [cohort])
        candidate.pop("participants")
        self.assertTrue(finalize("simulate_interviews", value, candidate, host_evidence=[cohort])["validation"]["valid"])

    def test_reference_only_simulation_revision_preserves_profiles_roles_questions_seed_style(self):
        cohort = personas_host(participants=2)
        original_value = {**simulation_input(cohort), "seed": 17, "responseStyle": "critical"}
        previous = save("simulate_interviews", original_value, simulation_candidate(original_value, [cohort]), [cohort], index=20)
        frozen_previous = deepcopy(previous)
        value = {"revisionOf": previous["reference"], "depth": "deep"}
        prepared = prepare("simulate_interviews", value, [previous])
        self.assertEqual(prepared["resolvedInput"]["stakeholders"], previous["input"]["stakeholders"])
        self.assertEqual(prepared["resolvedInput"]["seed"], 17)
        self.assertEqual(prepared["resolvedInput"]["responseStyle"], "critical")
        self.assertEqual(len(prepared["generationTasks"]), 2)
        for field in ("scenario", "targetAudience", "problem"):
            self.assertEqual(prepared["resolvedInput"][field], previous["input"][field])
        candidate = simulation_candidate(value, [previous])
        candidate.pop("participants")
        result = finalize("simulate_interviews", value, candidate, host_evidence=[previous])
        self.assertEqual(result["artifact"]["selectedPersonas"], previous["artifact"]["selectedPersonas"])
        self.assertEqual([row["personaId"] for row in result["artifact"]["personaBindings"]],
                         [row["personaId"] for row in previous["artifact"]["personaBindings"]])
        self.assertEqual([row["oceanMicros"] for row in result["artifact"]["participants"]],
                         [row["oceanMicros"] for row in previous["artifact"]["participants"]])
        self.assertEqual(previous, frozen_previous)

    def test_simulation_revision_can_change_scenario_without_replacing_saved_people(self):
        previous = simulation_host()
        value = {"revisionOf": previous["reference"], "scenario": "Explore the same team's proposed export workflow", "seed": 23, "responseStyle": "optimistic"}
        prepared = prepare("simulate_interviews", value, [previous])
        self.assertEqual(prepared["resolvedInput"]["scenario"], value["scenario"])
        self.assertEqual(prepared["resolvedInput"]["seed"], 23)
        self.assertEqual(prepared["resolvedInput"]["responseStyle"], "optimistic")
        payload = json.loads(prepared["userPrompt"])
        self.assertEqual(payload["selectedPersonas"], previous["artifact"]["selectedPersonas"])
        for old, new in zip(previous["artifact"]["participants"], prepared["fixedParticipants"], strict=True):
            for field in ("displayName", "biography", "motivations", "painPoints", "communicationStyle"):
                self.assertEqual(old[field], new[field])

    def test_simulation_revision_rejects_replacement_roles_and_personas(self):
        cohort = personas_host()
        previous = simulation_host(cohort)
        groups = deepcopy(previous["input"]["stakeholders"])
        groups[0]["description"] = "An unrelated finance buyer role"
        with self.assertRaisesRegex(ValueError, "cannot replace its saved cohort"):
            prepare("simulate_interviews", {"revisionOf": previous["reference"], "stakeholders": groups}, [previous])
        replacement = deepcopy(cohort)
        replacement["reference"] = reference(21)
        replacement["artifact"]["personas"][0]["description"] = "A different hypothetical buyer with unrelated needs and completely changed preferences."
        with self.assertRaisesRegex(ValueError, "cannot replace its saved persona profiles"):
            prepare("simulate_interviews", {"revisionOf": previous["reference"], "references": [replacement["reference"]]}, [previous, replacement])

    def test_legacy_scenario_revision_freezes_original_generated_profiles(self):
        value = {**legacy_inputs()["simulate_interviews"], "seed": 11, "responseStyle": "critical"}
        previous = save("simulate_interviews", value, legacy_candidate("simulate_interviews", value), index=22)
        self.assertNotIn("selectedPersonas", previous["artifact"])
        revision = {"revisionOf": previous["reference"], "depth": "deep"}
        prepared = prepare("simulate_interviews", revision, [previous])
        self.assertEqual(prepared["responseSchema"]["required"], ["interviews"])
        old_profile = previous["artifact"]["participants"][0]
        fixed = prepared["fixedParticipants"][0]
        for field in ("displayName", "biography", "motivations", "painPoints", "communicationStyle", "oceanMicros", "countryCode", "locality"):
            self.assertEqual(fixed[field], old_profile[field])
        projected = json.loads(prepared["userPrompt"])["selectedPersonas"][0]
        self.assertEqual(projected["sourceSimulationReference"], previous["reference"])
        self.assertEqual(projected["id"], old_profile["participantId"])
        candidate = simulation_candidate(revision, [previous])
        candidate.pop("participants")
        revised = save("simulate_interviews", revision, candidate, [previous], index=23)
        next_revision = prepare("simulate_interviews", {"revisionOf": revised["reference"]}, [revised])
        self.assertEqual(json.loads(next_revision["userPrompt"])["selectedPersonas"], revised["artifact"]["selectedPersonas"])

    def test_new_scenario_only_request_still_requires_explicit_context(self):
        for value in ({}, {"scenario": "A scenario with no audience or problem"}, {"scenario": " ", "targetAudience": "Operators", "problem": "Manual copying"}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                prepare("simulate_interviews", value)

    def test_saved_explicit_geography_survives_persona_to_simulation(self):
        # Model the host's exact saved explicit geographic assignment. The pure
        # adapters must preserve it, not infer/replace it from the city string.
        scope = scope_host()
        scope["artifact"]["stakeholders"][0].update(countryCode="LV", locality="Riga")
        cohort = personas_host(scope)
        value = simulation_input(cohort)
        payload = json.loads(prepare("simulate_interviews", value, [cohort])["userPrompt"])
        self.assertEqual(payload["stakeholders"][0]["countryCode"], "LV")
        self.assertEqual(payload["stakeholders"][0]["locality"], "Riga")
        result = finalize("simulate_interviews", value, simulation_candidate(value, [cohort]), host_evidence=[cohort])
        self.assertEqual(result["artifact"]["selectedPersonas"][0]["countryCode"], "LV")
        self.assertEqual(result["artifact"]["selectedPersonas"][0]["locality"], "Riga")

    def test_unspecified_persona_geography_is_not_inferred(self):
        cohort = personas_host()
        payload = json.loads(prepare("simulate_interviews", simulation_input(cohort), [cohort])["userPrompt"])
        self.assertIsNone(payload["stakeholders"][0]["countryCode"])
        self.assertIsNone(payload["stakeholders"][0]["locality"])

    def test_simulation_to_analysis_preserves_synthetic_origin_and_views(self):
        simulation = simulation_host()
        analysis = analysis_host(simulation)
        self.assertTrue(analysis["input"]["transcripts"])
        self.assertTrue(all(row["origin"] == "synthetic_transcript" for row in analysis["input"]["transcripts"]))
        finding = analysis["artifact"]["findings"][0]
        self.assertEqual(finding["basis"], "simulation_hypothesis")
        self.assertEqual({row["kind"] for row in analysis["artifact"]["views"]}, {"themes", "patterns", "stakeholders", "sentiment", "insights"})
        self.assertTrue(all(row["status"] == "hypothesis" and row["findingIds"] == [finding["findingId"]] for row in analysis["artifact"]["views"]))

    def test_analysis_and_market_feed_prd_without_retyping_sources(self):
        analysis, market = analysis_host(), market_host()
        prd = prd_host(analysis, market)
        self.assertEqual(prd["artifact"]["analysisArtifact"], analysis["reference"])
        requirement = next(row for row in prd["artifact"]["sections"] if row["heading"] == "Prioritized requirements")["items"][0]
        self.assertEqual(requirement["findingIds"], [analysis["artifact"]["findings"][0]["findingId"]])
        self.assertEqual(requirement["basis"], "simulation_hypothesis")
        catalogue = {row["id"]: row for row in prd["artifact"]["sources"]}
        self.assertEqual(catalogue["publisher-1"]["origin"], "web_source")
        self.assertTrue(any(row["origin"] == "synthetic_transcript" for row in catalogue.values()))

    def test_complete_chain_produces_delivery_not_execution_authority(self):
        scope = scope_host()
        analysis = analysis_host(simulation_host(personas_host(scope)))
        prd = prd_host(analysis, market_host())
        value = {"references": [prd["reference"], scope["reference"]]}
        delivery = save("create_delivery_brief", value, delivery_candidate(value, [prd, scope]), [prd, scope], index=7)
        artifact = delivery["artifact"]
        self.assertEqual(artifact["prdReference"], prd["reference"])
        self.assertEqual(artifact["scopeReference"], scope["reference"])
        self.assertFalse(artifact["executionAuthorized"])
        self.assertEqual(artifact["requirements"][0]["basis"], "simulation_hypothesis")
        self.assertTrue(any("real users" in row for row in artifact["openQuestions"]))

    def test_mismatched_simulation_question_cannot_reach_analysis(self):
        cohort = personas_host()
        value = simulation_input(cohort)
        proposed = simulation_candidate(value, [cohort])
        proposed["interviews"][0]["answers"][0]["questionId"] = "invented-question"
        with self.assertRaises(ValueError):
            finalize("simulate_interviews", value, proposed, host_evidence=[cohort])

    def test_analysis_views_cannot_upgrade_synthetic_evidence_to_supported(self):
        simulation = simulation_host()
        value = analysis_input(simulation)
        proposed = analysis_candidate(value, [simulation])
        proposed["views"][0]["status"] = "supported"
        with self.assertRaises(ValueError):
            finalize("analyze_interviews", value, proposed, host_evidence=[simulation])

    def test_analysis_revision_reuses_resolved_transcripts_and_preserves_prior_artifact(self):
        previous = analysis_host()
        original = deepcopy(previous)
        value = {"decisionQuestion": previous["input"]["decisionQuestion"],
                 "revisionOf": previous["reference"], "views": ["themes", "insights"]}
        proposed = analysis_candidate(value, [previous])
        revised = save("analyze_interviews", value, proposed, [previous], index=8)
        self.assertEqual(revised["input"]["transcripts"], previous["input"]["transcripts"])
        self.assertEqual(previous, original)
        self.assertEqual({row["kind"] for row in revised["artifact"]["views"]}, {"themes", "insights"})

    def test_delivery_revision_requires_current_prd_ids(self):
        prd = prd_host()
        value = {"references": [prd["reference"]]}
        first = save("create_delivery_brief", value, delivery_candidate(value, [prd]), [prd], index=9)
        changed = deepcopy(prd)
        changed["reference"] = reference(10)
        item = next(section for section in changed["artifact"]["sections"] if section["heading"] == "Prioritized requirements")["items"][0]
        item["text"] += " Preserve an exportable audit history."
        revised = {"references": [changed["reference"]], "revisionOf": first["reference"]}
        with self.assertRaises(ValueError):
            finalize("create_delivery_brief", revised, first["candidate"], host_evidence=[changed, first])
        self.assertTrue(finalize("create_delivery_brief", revised, delivery_candidate(revised, [changed, first]), host_evidence=[changed, first])["validation"]["valid"])

    def test_prepared_context_is_bound_to_current_turn(self):
        scope = scope_host()
        value = {"references": [scope["reference"]]}
        prepared = prepare("generate_personas", value, [scope])
        changed_context = deepcopy(prepared["context"])
        changed_context["brief"] = "An unrelated proposed product"
        with self.assertRaises(ValueError):
            finalize("generate_personas", value, generation_candidate(value, [scope]), context=changed_context, host_evidence=[scope])


if __name__ == "__main__":
    unittest.main()
