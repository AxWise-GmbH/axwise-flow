"""Offline validation for local persona generation and saved-persona dialogue."""

import copy
import json
import unittest

from backend.services.local_axwise.personas import PersonaDocumentContextError, finalize, prepare


def reference(index=1):
    return {"operationId": f"00000000-0000-4000-8000-{index:012d}", "sha256": f"{index:064x}"}


def generation_input():
    return {
        "brief": "Explore shared handoff software for small restaurant teams.",
        "stakeholders": [{"id": "buyer", "label": "Restaurant buyer", "description": "Owner who approves the restaurant software budget.", "participants": 1}],
        "sources": [{"id": "interview-1", "title": "Selected interview", "text": "I lose time copying requests between tools.", "origin": "supplied_transcript"}],
    }


def generation_candidate(value=None, hosts=None):
    value = generation_input() if value is None else value
    context = prepare("generate_personas", value, hosts)["context"]
    personas = []
    for slot in context["slots"]:
        claim = {"text": "May prefer simple onboarding and clear ownership.", "basis": "simulation_hypothesis", "evidence": []}
        personas.append({
            "id": slot["personaId"], "stakeholderId": slot["stakeholderId"],
            "label": f"Synthetic buyer {slot['personaId'][-8:]}",
            "description": "A hypothetical restaurant buyer who balances team adoption, budget and operating simplicity.",
            "origin": "synthetic", "basis": "scenario_hypothesis",
            "motivations": [copy.deepcopy(claim), {**claim, "text": "May seek predictable ongoing costs."}],
            "painPoints": [copy.deepcopy(claim), {**claim, "text": "May struggle with unclear task ownership."}],
            "traits": [copy.deepcopy(claim)],
            "communicationStyle": "Direct, concise and interested in practical examples.",
            "countryCode": slot["countryCode"], "locality": slot["locality"],
            "assumptions": ["This profile has not been validated through a real interview."],
        })
    return {"personas": personas, "limitations": ["A bounded synthetic cohort is not a market sample."]}


def cohort_host(value=None):
    value = generation_input() if value is None else value
    result = finalize("generate_personas", value, generation_candidate(value))
    return {"reference": reference(), "tool": "generate_personas", "input": value, "artifact": result["artifact"], "markdown": result["markdown"]}


def chat_input(host):
    persona = host["artifact"].get("persona", host["artifact"].get("personas", [None])[0])
    return {"references": [host["reference"]], "personaId": persona["id"], "message": "What would stop you adopting this tool?"}


def chat_candidate(value):
    return {"personaId": value["personaId"], "origin": "synthetic", "basis": "simulation_hypothesis", "response": "As this simulated buyer, I would want to see simple onboarding and clear costs.", "evidence": []}


def document_host(index=4, content=None):
    return {"reference": reference(index), "tool": "create_prd", "input": {}, "artifact": content or {
        "title": "Manual shared repair queue", "sections": [
            {"heading": "Requirements", "body": "Keep manual assignment and email intake; include integrated email reconciliation."},
            {"heading": "Acceptance", "body": "Email updates appear within 30 seconds; status updates within five seconds."},
        ], "sources": [],
    }}


class PersonaTests(unittest.TestCase):
    def test_generation_warns_against_circular_solution_validation(self):
        prompt = prepare("generate_personas", generation_input())["systemPrompt"]
        self.assertIn("not observed pain or", prompt)
        self.assertIn("later simulated agreement cannot validate them", prompt)
        self.assertIn("disconfirming questions", prompt)

    def test_generation_is_deterministic_and_publishes_synthetic_cohort(self):
        value = generation_input()
        self.assertEqual(prepare("generate_personas", value), prepare("generate_personas", copy.deepcopy(value)))
        result = finalize("generate_personas", value, generation_candidate(value))
        self.assertTrue(result["validation"]["valid"])
        self.assertFalse(result["validation"]["externalFactsVerified"])
        self.assertEqual(result["artifact"]["origin"], "synthetic")
        self.assertEqual(result["artifact"]["cohort"], {"expected": 1, "completed": 1, "complete": True})
        self.assertEqual(result["provenance"]["sourceCatalogue"][0]["origin"], "supplied_transcript")
        self.assertNotIn("SessionLocal", prepare("generate_personas", value)["systemPrompt"])

    def test_source_statement_exact_utf8_quote(self):
        value = generation_input()
        text = "Čas 😀 zaberá prepisovanie."
        value["sources"][0]["text"] = text
        candidate = generation_candidate(value)
        persona = candidate["personas"][0]
        persona["basis"] = "evidence_informed_hypothesis"
        passage = prepare("generate_personas", value)["context"]["evidencePassages"][0]
        persona["painPoints"][0] = {"text": text, "basis": "source_statement", "evidence": [{"passageId": passage["id"]}]}
        result = finalize("generate_personas", value, candidate)
        self.assertTrue(result["validation"]["valid"])
        quote = result["artifact"]["personas"][0]["painPoints"][0]["evidence"][0]
        self.assertEqual(quote, {"sourceId": "interview-1", "start": 0, "end": len(text.encode()), "text": text})
        for mutation in ({"end": len(text)}, {"text": "invented"}, {"passageId": "unknown"}):
            broken = copy.deepcopy(candidate)
            broken["personas"][0]["painPoints"][0]["evidence"][0].update(mutation)
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                finalize("generate_personas", value, broken)

    def test_synthetic_evidence_cannot_become_real_interview_claim(self):
        value = generation_input()
        value["sources"][0]["origin"] = "synthetic_transcript"
        candidate = generation_candidate(value)
        text = value["sources"][0]["text"]
        candidate["personas"][0]["basis"] = "evidence_informed_hypothesis"
        passage = prepare("generate_personas", value)["context"]["evidencePassages"][0]
        claim = {"text": text, "basis": "simulation_hypothesis", "evidence": [{"passageId": passage["id"]}]}
        candidate["personas"][0]["traits"][0] = claim
        self.assertTrue(finalize("generate_personas", value, candidate)["validation"]["valid"])
        for basis in ("source_statement", "interpretation"):
            claim["basis"] = basis
            with self.subTest(basis=basis), self.assertRaises(ValueError):
                finalize("generate_personas", value, candidate)

    def test_model_selects_host_passages_instead_of_guessing_byte_offsets(self):
        value = generation_input()
        value["sources"][0]["text"] = "This is a fictional test-owner specification, not market evidence. The proposed pilot uses one shared queue and manual task assignment. The pilot must retain existing email communication. No real customer interviews, willingness-to-pay evidence or market statistics have been supplied."
        prepared = prepare("generate_personas", value)
        selection_schema = prepared["responseSchema"]["$defs"]["EvidenceSelection"]
        self.assertEqual(set(selection_schema["properties"]), {"passageId"})
        self.assertFalse(selection_schema["additionalProperties"])
        candidate = generation_candidate(value)
        persona = candidate["personas"][0]
        persona["basis"] = "evidence_informed_hypothesis"
        passage = prepared["context"]["evidencePassages"][0]
        persona["motivations"][0] = {"text": "May seek continuity with the proposed pilot constraints.", "basis": "interpretation", "evidence": [{"passageId": passage["id"]}]}
        result = finalize("generate_personas", value, candidate)
        quote = result["artifact"]["personas"][0]["motivations"][0]["evidence"][0]
        self.assertEqual(quote["text"], value["sources"][0]["text"])
        self.assertEqual((quote["start"], quote["end"]), (0, len(quote["text"].encode())))
        candidate["personas"][0]["motivations"][0]["evidence"][0] = {"sourceId": "interview-1", "text": "The proposed pilot uses one shared queue and manual task assignment.", "start": 67, "end": 136}
        with self.assertRaises(ValueError):
            finalize("generate_personas", value, candidate)

    def test_passages_cover_large_unicode_and_repeated_source_text_without_truncation(self):
        value = generation_input()
        value["sources"][0]["text"] = "😀" * 2400 + "Z" * 500 + " final evidence "
        context = prepare("generate_personas", value)["context"]
        passages = context["evidencePassages"]
        self.assertEqual(len(passages), 8)
        self.assertEqual(len({row["id"] for row in passages}), len(passages))
        raw = value["sources"][0]["text"].encode()
        for passage in passages:
            self.assertEqual(raw[passage["start"]:passage["end"]].decode(), passage["text"])
        self.assertEqual("".join(row["text"] for row in passages), value["sources"][0]["text"].strip())
        self.assertIn("final evidence", passages[-1]["text"])

    def test_published_persona_profile_matches_simulation_label_and_claim_bounds(self):
        value = generation_input()
        for field, limit in (("label", 120), ("motivations", 500), ("painPoints", 500)):
            candidate = generation_candidate(value)
            if field == "label":
                candidate["personas"][0][field] = "Synthetic " + "x" * (limit - len("Synthetic "))
            else:
                candidate["personas"][0][field][0]["text"] = "x" * limit
            self.assertTrue(finalize("generate_personas", value, candidate)["validation"]["valid"])
            if field == "label":
                candidate["personas"][0][field] += "x"
            else:
                candidate["personas"][0][field][0]["text"] += "x"
            with self.subTest(field=field), self.assertRaises(ValueError):
                finalize("generate_personas", value, candidate)
        host = cohort_host()
        host["artifact"]["personas"][0]["motivations"][0]["text"] = "x" * 501
        with self.assertRaises(ValueError):
            prepare("chat_with_persona", chat_input(host), [host])

    def test_source_passages_fit_profile_source_statement_limit(self):
        value = generation_input()
        value["sources"][0]["text"] = "x" * 1000
        prepared = prepare("generate_personas", value)
        self.assertEqual([len(row["text"]) for row in prepared["context"]["evidencePassages"]], [400, 400, 200])
        passage = prepared["context"]["evidencePassages"][1]
        candidate = generation_candidate(value)
        candidate["personas"][0]["basis"] = "evidence_informed_hypothesis"
        candidate["personas"][0]["motivations"][0] = {"text": passage["text"], "basis": "source_statement", "evidence": [{"passageId": passage["id"]}]}
        result = finalize("generate_personas", value, candidate)
        quote = result["artifact"]["personas"][0]["motivations"][0]["evidence"][0]
        self.assertEqual((quote["start"], quote["end"]), (400, 800))

    def test_chat_materializes_passages_and_still_rejects_corrupt_saved_quote_spans(self):
        host = cohort_host()
        value = chat_input(host)
        context = prepare("chat_with_persona", value, [host])["context"]
        candidate = chat_candidate(value)
        candidate["evidence"] = [{"passageId": context["evidencePassages"][0]["id"]}]
        result = finalize("chat_with_persona", value, candidate, [host])
        evidence = result["artifact"]["turns"][-1]["evidence"][0]
        self.assertEqual(evidence["text"], host["artifact"]["sources"][0]["text"])
        self.assertEqual(evidence["end"], len(evidence["text"].encode()))
        evidence["end"] -= 1
        saved = {"reference": reference(3), "tool": "chat_with_persona", "input": value, "artifact": result["artifact"]}
        with self.assertRaisesRegex(ValueError, "exact selected UTF-8"):
            prepare("chat_with_persona", chat_input(saved), [saved])

    def test_generation_rejects_incomplete_duplicate_or_moved_cohort(self):
        value = generation_input()
        value["stakeholders"][0]["participants"] = 2
        for mutation in ("missing", "duplicate", "role", "geography", "real_origin"):
            candidate = generation_candidate(value)
            if mutation == "missing":
                candidate["personas"].pop()
            elif mutation == "duplicate":
                candidate["personas"][1] = copy.deepcopy(candidate["personas"][0])
            elif mutation == "role":
                candidate["personas"][0]["stakeholderId"] = "invented"
            elif mutation == "geography":
                candidate["personas"][0]["countryCode"] = "DE"
            else:
                candidate["personas"][0]["origin"] = "real"
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                finalize("generate_personas", value, candidate)

    def test_depth_budget_rejects_instead_of_truncating(self):
        value = generation_input()
        value["stakeholders"][0]["participants"] = 3
        with self.assertRaises(ValueError):
            prepare("generate_personas", value)
        value["depth"] = "deep"
        self.assertEqual(len(prepare("generate_personas", value)["context"]["slots"]), 3)
        self.assertEqual(prepare("generate_personas", value)["maxOutputTokens"], 8192)
        value["stakeholders"][0]["participants"] = True
        with self.assertRaises(ValueError):
            prepare("generate_personas", value)

    def test_existing_slot_identity_stable_when_adding_a_persona(self):
        value = generation_input()
        first = prepare("generate_personas", value)["context"]["slots"][0]["personaId"]
        value["stakeholders"][0]["participants"] = 2
        self.assertEqual(prepare("generate_personas", value)["context"]["slots"][0]["personaId"], first)

    def test_revision_reuses_saved_roles_and_brief_without_retyping(self):
        host = cohort_host()
        value = {"revisionOf": host["reference"]}
        result = finalize("generate_personas", value, generation_candidate(value, [host]), [host])
        self.assertEqual(result["artifact"]["brief"], host["artifact"]["brief"])
        self.assertEqual(result["artifact"]["personas"][0]["id"], host["artifact"]["personas"][0]["id"])

    def test_synthetic_label_and_same_tool_revision_required(self):
        value = generation_input()
        candidate = generation_candidate(value)
        candidate["personas"][0]["label"] = "A real customer"
        with self.assertRaises(ValueError):
            finalize("generate_personas", value, candidate)
        host = cohort_host()
        chat = chat_input(host)
        chat["revisionOf"] = host["reference"]
        with self.assertRaises(ValueError):
            prepare("chat_with_persona", chat, [host])

    def test_missing_unknown_and_duplicate_host_references_fail(self):
        host = cohort_host()
        value = generation_input()
        value["references"] = [host["reference"]]
        for hosts in ([], [host, host], [{**host, "reference": reference(9)}]):
            with self.subTest(hosts=hosts), self.assertRaises(ValueError):
                prepare("generate_personas", value, hosts)
        with self.assertRaises(ValueError):
            prepare("generate_personas", {**generation_input(), "hostArtifacts": [host]})

    def test_saved_scope_roles_and_question_ids_preserved(self):
        scope = {
            "reference": reference(2), "tool": "prepare_discovery", "input": {},
            "artifact": {"id": "discovery-1", "decision": "Determine restaurant adoption blockers.",
                "scope": {"status": "proposed", "explicitUserConstraints": {"brief": "Discover the needs of restaurant buyers.", "region": "Riga", "exclusions": []}},
                "stakeholders": [{"id": "buyer", "label": "Buyer", "description": "Restaurant buyer with budget authority.",
                    "questions": [{"id": "q-1", "text": "What stops adoption?", "uncertaintyId": "u-1", "stakeholderId": "buyer"}]}], "sources": []},
        }
        value = {"references": [scope["reference"]]}
        result = finalize("generate_personas", value, generation_candidate(value, [scope]), [scope])
        self.assertEqual(result["artifact"]["scopeId"], "discovery-1")
        self.assertEqual(result["artifact"]["scopeReference"], scope["reference"])
        self.assertEqual(result["artifact"]["questionPlan"][0]["questions"], scope["artifact"]["stakeholders"][0]["questions"])
        self.assertEqual(result["artifact"]["decision"], scope["artifact"]["decision"])
        cohort = {"reference": reference(8), "tool": "generate_personas", "input": value, "artifact": result["artifact"]}
        revision = {"revisionOf": cohort["reference"]}
        revised = finalize("generate_personas", revision, generation_candidate(revision, [cohort]), [cohort])
        self.assertEqual(revised["artifact"]["scopeReference"], scope["reference"])
        self.assertEqual(revised["artifact"]["questionPlan"], result["artifact"]["questionPlan"])
        with self.assertRaises(ValueError):
            prepare("generate_personas", {**value, "brief": "A different business entirely."}, [scope])
        value["stakeholders"] = [{"id": "buyer", "label": "Changed buyer", "description": "Different role entirely."}]
        with self.assertRaises(ValueError):
            prepare("generate_personas", value, [scope])

    def test_large_scope_requires_explicit_role_subset_without_changing_region(self):
        scope = {"reference": reference(2), "tool": "prepare_discovery", "input": {}, "artifact": {
            "id": "scope-large", "decision": "Explore adoption", "scope": {"explicitUserConstraints": {"brief": "Explore Riga businesses.", "region": "Riga", "exclusions": ["Do not infer national statistics."]}},
            "stakeholders": [{"id": f"role-{index}", "label": f"Role {index}", "description": f"A bounded stakeholder role number {index}.", "questions": [{"id": f"q-{index}", "text": "What matters?", "uncertaintyId": "u-1"}]} for index in range(4)], "sources": [],
        }}
        value = {"references": [scope["reference"]], "depth": "standard"}
        with self.assertRaisesRegex(ValueError, "explicitly select a subset"):
            prepare("generate_personas", value, [scope])
        role = scope["artifact"]["stakeholders"][2]
        value["stakeholders"] = [{key: role[key] for key in ("id", "label", "description")}]
        result = finalize("generate_personas", value, generation_candidate(value, [scope]), [scope])
        self.assertEqual(result["artifact"]["personas"][0]["stakeholderId"], role["id"])
        self.assertEqual(result["artifact"]["questionPlan"], [{"stakeholderId": role["id"], "questions": role["questions"]}])
        self.assertEqual(result["artifact"]["scope"]["explicitUserConstraints"]["region"], "Riga")
        self.assertIsNone(result["artifact"]["personas"][0]["countryCode"])

    def test_exact_saved_persona_chat_and_history_continuation(self):
        host = cohort_host()
        value = chat_input(host)
        result = finalize("chat_with_persona", value, chat_candidate(value), [host])
        self.assertEqual(result["artifact"]["personaReference"], host["reference"])
        self.assertEqual([turn["role"] for turn in result["artifact"]["turns"]], ["user", "persona"])
        chat_host = {"reference": reference(3), "tool": "chat_with_persona", "input": value, "artifact": result["artifact"]}
        next_value = chat_input(chat_host)
        next_value["message"] = "Tell me more about onboarding."
        prepared = prepare("chat_with_persona", next_value, [chat_host])
        self.assertEqual(prepared["context"]["history"], result["artifact"]["turns"])
        continued = finalize("chat_with_persona", next_value, chat_candidate(next_value), [chat_host])
        self.assertEqual(len(continued["artifact"]["turns"]), 4)
        self.assertEqual(continued["artifact"]["personaReference"], host["reference"])
        self.assertEqual(continued["artifact"]["previousConversationReference"], chat_host["reference"])
        self.assertIn("synthetic roleplay", continued["markdown"])

    def test_exact_selected_prd_enters_prompt_and_saved_chat_without_retyping(self):
        cohort, document = cohort_host(), document_host()
        value = {**chat_input(cohort), "references": [cohort["reference"], document["reference"]],
                 "message": "If we implement this PRD, what practical problem remains?"}
        prepared = prepare("chat_with_persona", value, [cohort, document])
        selected = prepared["context"]["selectedDocument"]
        self.assertEqual(selected["reference"], document["reference"])
        self.assertEqual(selected["tool"], "create_prd")
        self.assertEqual(selected["content"], document["artifact"])
        self.assertEqual(json.loads(prepared["userPrompt"])["selectedDocument"], selected)
        self.assertIn("integrated email reconciliation", prepared["userPrompt"])
        self.assertIn("not\nrecommend as missing a feature", prepared["systemPrompt"])
        result = finalize("chat_with_persona", value, chat_candidate(value), [cohort, document])
        self.assertEqual(result["artifact"]["selectedDocument"], selected)
        self.assertTrue(all(turn["documentReference"] == document["reference"] for turn in result["artifact"]["turns"]))

    def test_selected_document_is_context_not_fabricated_participant_evidence(self):
        cohort, document = cohort_host(), document_host()
        value = {**chat_input(cohort), "references": [cohort["reference"], document["reference"]]}
        prepared = prepare("chat_with_persona", value, [cohort, document])
        self.assertFalse(any("30 seconds" in row["text"] for row in prepared["context"]["evidencePassages"]))
        candidate = {**chat_candidate(value), "evidence": [{"passageId": document["reference"]["operationId"]}]}
        with self.assertRaisesRegex(ValueError, "unknown selected persona evidence passage"):
            finalize("chat_with_persona", value, candidate, [cohort, document])

    def test_selected_prd_metadata_catalogue_is_not_mistaken_for_full_evidence(self):
        cohort, document = cohort_host(), document_host()
        catalogue = [{"id": "selected-owner", "title": "Owner specification", "origin": "supplied_document",
                      "textSha256": "a" * 64, "used": True, "url": None, "publishedAt": None, "retrievedAt": None},
                     {"id": "selected-publisher", "title": "Publisher excerpt", "origin": "web_source",
                      "textSha256": "b" * 64, "used": False, "url": "https://example.org/docs", "publishedAt": None,
                      "retrievedAt": "2026-09-24T07:00:00Z"}]
        document["artifact"]["sources"] = copy.deepcopy(catalogue)
        value = {**chat_input(cohort), "references": [cohort["reference"], document["reference"]],
                 "documentReference": document["reference"]}
        context = prepare("chat_with_persona", value, [cohort, document])["context"]
        self.assertEqual(context["selectedDocument"]["content"]["sources"], catalogue)
        self.assertFalse(any(row["sourceId"] in {"selected-owner", "selected-publisher"} for row in context["evidencePassages"]))
        self.assertEqual(context["sources"], cohort["artifact"]["sources"])
        result = finalize("chat_with_persona", value, chat_candidate(value), [cohort, document])
        chat = {"reference": reference(6), "tool": "chat_with_persona", "artifact": result["artifact"]}
        continued = prepare("chat_with_persona", chat_input(chat), [chat])["context"]
        self.assertEqual(continued["selectedDocument"]["content"]["sources"], catalogue)

    def test_document_catalogue_filter_never_skips_bad_full_sources_or_cohort_sources(self):
        for where in ("document", "cohort"):
            cohort, document = cohort_host(), document_host()
            if where == "document":
                document["artifact"]["sources"] = [{"id": "bad-full-source", "text": None}]
            else:
                cohort["artifact"]["sources"][0].pop("text")
                cohort["input"]["sources"][0].pop("text")
            value = {**chat_input(cohort), "references": [cohort["reference"], document["reference"]]}
            with self.subTest(where=where), self.assertRaises(ValueError):
                prepare("chat_with_persona", value, [cohort, document])

    def test_multiple_documents_or_versions_require_explicit_exact_selection(self):
        cohort, old, new = cohort_host(), document_host(4), document_host(5)
        new["artifact"]["sections"][1]["body"] = "New revision: warn before duplicate creation."
        old["artifact"]["sources"] = [{"id": "old-source", "title": "Old source", "text": "Only in old document.", "origin": "supplied_document"}]
        value = {**chat_input(cohort), "references": [cohort["reference"], old["reference"], new["reference"]]}
        with self.assertRaisesRegex(ValueError, "one exact discussion document/version"):
            prepare("chat_with_persona", value, [cohort, old, new])
        for chosen in (old, new):
            with self.subTest(version=chosen["reference"]):
                prepared = prepare("chat_with_persona", {**value, "documentReference": chosen["reference"]}, [cohort, old, new])
                self.assertEqual(prepared["context"]["selectedDocument"]["content"], chosen["artifact"])
                self.assertEqual(prepared["context"]["selectedDocument"]["reference"], chosen["reference"])
                if chosen is new:
                    self.assertNotIn("Only in old document", prepared["userPrompt"])

    def test_unselected_wrong_hash_and_persona_document_references_fail(self):
        cohort, document = cohort_host(), document_host()
        value = {**chat_input(cohort), "references": [cohort["reference"], document["reference"]]}
        for wrong in (reference(8), {**document["reference"], "sha256": reference(9)["sha256"]}):
            with self.subTest(reference=wrong), self.assertRaisesRegex(ValueError, "documentReference must name"):
                prepare("chat_with_persona", {**value, "documentReference": wrong}, [cohort, document])
        with self.assertRaisesRegex(ValueError, "not a persona cohort"):
            prepare("chat_with_persona", {**value, "documentReference": cohort["reference"]}, [cohort, document])
        # The pure layer cannot replace the host's missing/failed hash resolution.
        with self.assertRaisesRegex(ValueError, "missing exact saved artifact reference"):
            prepare("chat_with_persona", value, [cohort])

    def test_document_snapshot_continues_exact_version_and_new_selection_replaces_it(self):
        cohort, old, new = cohort_host(), document_host(4), document_host(5)
        new["artifact"]["sections"][0]["body"] = "Explicitly selected revised requirements."
        value = {**chat_input(cohort), "references": [cohort["reference"], old["reference"]]}
        result = finalize("chat_with_persona", value, chat_candidate(value), [cohort, old])
        chat = {"reference": reference(6), "tool": "chat_with_persona", "artifact": result["artifact"]}
        continuation = {**chat_input(chat), "message": "What problem remains in this PRD?"}
        continued = prepare("chat_with_persona", continuation, [chat])["context"]
        self.assertEqual(continued["selectedDocument"], result["artifact"]["selectedDocument"])
        self.assertEqual(continued["documentContextStatus"], "continued")
        switched = {**continuation, "references": [chat["reference"], new["reference"]], "documentReference": new["reference"]}
        output = finalize("chat_with_persona", switched, chat_candidate(switched), [chat, new])["artifact"]
        self.assertEqual(output["selectedDocument"]["content"], new["artifact"])
        self.assertEqual([row["documentReference"] for row in output["turns"]], [old["reference"], old["reference"], new["reference"], new["reference"]])
        self.assertEqual(result["artifact"]["selectedDocument"]["content"], old["artifact"])

    def test_missing_document_stays_explicit_without_blocking_generic_questions(self):
        cohort = cohort_host()
        for message in ("What would stop you adopting it?", "Tell me more about onboarding.",
                        "What makes a good PRD?", "What is a PRD?", "How do you approach the PRD process?",
                        "What do you think of the document format as a concept?"):
            value = {**chat_input(cohort), "message": message}
            prepared = prepare("chat_with_persona", value, [cohort])
            self.assertIsNone(prepared["context"]["selectedDocument"])
            self.assertEqual(prepared["context"]["documentContextStatus"], "not_selected")
            self.assertIn("do not pretend to have seen", prepared["systemPrompt"])
            self.assertTrue(finalize("chat_with_persona", value, chat_candidate(value), [cohort])["validation"]["valid"])

    def test_document_specific_question_requires_selected_or_continued_document(self):
        cohort = cohort_host()
        for message in (
            "If we implement this PRD, what one practical problem would still make your morning difficult, and what small change would help?",
            "What problem remains in the specification?", "Critique this document.",
            "What is missing in the selected PRD?", "Does the revised product requirements document address your concerns?",
            "What does this delivery brief miss?",
        ):
            value = {**chat_input(cohort), "message": message}
            with self.subTest(message=message), self.assertRaises(PersonaDocumentContextError) as caught:
                prepare("chat_with_persona", value, [cohort])
            self.assertEqual(caught.exception.code, "DOCUMENT_CONTEXT_REQUIRED")
            self.assertEqual(str(caught.exception), "DOCUMENT_CONTEXT_REQUIRED")

    def test_cohort_evidence_and_old_chat_text_cannot_replace_the_selected_document(self):
        cohort = cohort_host()
        # Even a supplied source which mentions the document is not the selected
        # saved document/version. Generic dialogue must not scan source text.
        cohort["artifact"]["sources"][0]["text"] = "The PRD proposes integrated email reconciliation."
        cohort["input"]["sources"][0]["text"] = cohort["artifact"]["sources"][0]["text"]
        generic = chat_input(cohort)
        result = finalize("chat_with_persona", generic, chat_candidate(generic), [cohort])
        result["artifact"]["turns"][1]["text"] = "Earlier host text mentioned this PRD."
        result["artifact"].pop("selectedDocument")
        result["artifact"].pop("documentContextStatus")
        chat = {"reference": reference(6), "tool": "chat_with_persona", "artifact": result["artifact"]}
        for host in (cohort, chat):
            with self.subTest(tool=host["tool"]):
                context = prepare("chat_with_persona", chat_input(host), [host])["context"]
                self.assertEqual(context["documentContextStatus"], "not_selected")
                self.assertTrue(context["evidencePassages"])
                with self.assertRaises(PersonaDocumentContextError):
                    prepare("chat_with_persona", {**chat_input(host), "message": "What is missing in this PRD?"}, [host])

    def test_missing_document_worker_diagnostic_is_finite_and_content_free(self):
        from backend.services.local_axwise.worker import dispatch

        cohort = cohort_host()
        reply = dispatch({"id": "missing-document", "operation": "prepare", "tool": "chat_with_persona",
                          "input": {**chat_input(cohort), "message": "Critique this PRD: PRIVATE_SELECTED_TEXT"},
                          "hostEvidence": [cohort]})
        self.assertFalse(reply["ok"])
        self.assertEqual(reply["error"]["code"], "DOCUMENT_CONTEXT_REQUIRED")
        self.assertIn("operationId and sha256 to references", reply["error"]["message"])
        self.assertIn("documentReference", reply["error"]["message"])
        self.assertIn("do not retype", reply["error"]["message"])
        self.assertNotIn("PRIVATE_SELECTED_TEXT", json.dumps(reply))
        self.assertNotIn("result", reply)

    def test_old_saved_chat_without_document_fields_remains_compatible(self):
        cohort = cohort_host()
        value = chat_input(cohort)
        result = finalize("chat_with_persona", value, chat_candidate(value), [cohort])
        artifact = result["artifact"]
        artifact.pop("selectedDocument")
        artifact.pop("documentContextStatus")
        for row in artifact["turns"]:
            row.pop("documentReference")
        chat = {"reference": reference(6), "tool": "chat_with_persona", "artifact": artifact}
        context = prepare("chat_with_persona", chat_input(chat), [chat])["context"]
        self.assertIsNone(context["selectedDocument"])
        self.assertEqual(len(context["history"]), 2)

    def test_full_document_utf8_budget_rejects_without_truncating_or_reading_paths(self):
        cohort, document = cohort_host(), document_host(content={"body": "😀" * 17_000})
        value = {**chat_input(cohort), "references": [cohort["reference"], document["reference"]]}
        with self.assertRaisesRegex(ValueError, "context budget"):
            prepare("chat_with_persona", value, [cohort, document])
        prepared = prepare("chat_with_persona", {**value, "depth": "deep"}, [cohort, document])
        self.assertEqual(prepared["context"]["selectedDocument"]["content"], document["artifact"])
        for field in ("documentPath", "document", "selectedDocument"):
            with self.subTest(field=field), self.assertRaises(ValueError):
                prepare("chat_with_persona", {**chat_input(cohort), field: "/etc/passwd"}, [cohort])

    def test_corrupt_saved_document_snapshot_fails_closed(self):
        cohort, document = cohort_host(), document_host()
        value = {**chat_input(cohort), "references": [cohort["reference"], document["reference"]]}
        result = finalize("chat_with_persona", value, chat_candidate(value), [cohort, document])
        result["artifact"]["selectedDocument"]["content"]["title"] = "Mutated after it was saved"
        chat = {"reference": reference(6), "tool": "chat_with_persona", "artifact": result["artifact"]}
        with self.assertRaisesRegex(ValueError, "snapshot hash"):
            prepare("chat_with_persona", chat_input(chat), [chat])

    def test_prompt_history_is_bounded_without_deleting_saved_turns(self):
        host = cohort_host()
        value = chat_input(host)
        result = finalize("chat_with_persona", value, chat_candidate(value), [host])
        artifact = result["artifact"]
        artifact["turns"] = artifact["turns"] * 8
        saved = {"reference": reference(3), "tool": "chat_with_persona", "input": value, "artifact": artifact}
        next_value = chat_input(saved)
        prepared = prepare("chat_with_persona", next_value, [saved])
        self.assertEqual(len(prepared["context"]["history"]), 12)
        self.assertEqual(prepared["context"]["omittedHistoryTurns"], 4)
        output = finalize("chat_with_persona", next_value, chat_candidate(next_value), [saved])
        self.assertEqual(len(output["artifact"]["turns"]), 18)

    def test_same_source_id_with_changed_text_is_rejected(self):
        host = cohort_host()
        value = generation_input()
        value["references"] = [host["reference"]]
        value["sources"][0]["text"] = "Changed original evidence."
        with self.assertRaises(ValueError):
            prepare("generate_personas", value, [host])

    def test_missing_persona_fails_without_fabricated_fallback(self):
        host = cohort_host()
        value = chat_input(host)
        value["personaId"] = "unknown-persona"
        with self.assertRaisesRegex(ValueError, "not found"):
            prepare("chat_with_persona", value, [host])
        with self.assertRaises(ValueError):
            prepare("chat_with_persona", {"personaId": "unknown", "message": "Hello"})

    def test_chat_retyped_history_identity_and_source_mutations_fail(self):
        host = cohort_host()
        value = chat_input(host)
        with self.assertRaises(ValueError):
            prepare("chat_with_persona", {**value, "history": [{"role": "user", "text": "retyped"}]}, [host])
        for mutation in ({"personaId": "wrong"}, {"origin": "real"}, {"basis": "source_statement"}, {"evidence": [{"sourceId": "unknown", "start": 0, "end": 1, "text": "x"}]}):
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                finalize("chat_with_persona", value, {**chat_candidate(value), **mutation}, [host])

    def test_unexpected_response_fields_and_oversize_response_fail(self):
        value = generation_input()
        candidate = generation_candidate(value)
        candidate["privateReasoning"] = "not part of contract"
        with self.assertRaises(ValueError):
            finalize("generate_personas", value, candidate)
        with self.assertRaises(ValueError):
            finalize("generate_personas", value, " " * 512001)
        self.assertTrue(finalize("generate_personas", value, json.dumps(generation_candidate(value)))["validation"]["valid"])


if __name__ == "__main__":
    unittest.main()
