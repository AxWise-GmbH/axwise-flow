"""Regression for the additive desktop PRD edit, without model review trust."""
from copy import deepcopy
import json
import unittest

from backend.domain.workflow_v2.wire import canonical_hash
from backend.services.local_axwise.kernel import LocalValidationError, finalize, prepare
from backend.services.local_axwise.prd_revisions import catalogue
from backend.tests.local_axwise.fixtures import candidate, inputs
from backend.tests.local_axwise.test_pipeline_integration import analysis_host, market_host, prd_candidate, prd_input, reference, save


WARNING = "When a dispatcher tries to create a second ticket from the same email message, show a duplicate warning and do not create another ticket unless the dispatcher explicitly confirms."


def source_prd():
    value = {"brief": "One building, five total staff, shared queue, retained email intake and manual dispatcher assignment. No payments, predictive maintenance or automatic assignment.",
             "artifactType": "software_prd"}
    proposed = candidate("create_prd", value)
    sections = {section["heading"]: section for section in proposed["sections"]}
    requirements = [
        "P0: Email linking must take under 3 clicks; render the thread chronologically without copy-pasting.",
        "P0: Ticket creation requires mandatory access instructions, fixture details and the tenant contact window.",
        "P1: Dispatcher status updates appear within 5 seconds; assignment remains manual.",
    ]
    sections["Prioritized requirements"]["items"] = [
        {"text": text, "basis": "proposal", "sourceIds": [], "findingIds": []} for text in requirements]
    sections["Technical boundaries"]["items"] = [
        {"text": "New email updates appear within 30 seconds. Only assigned technicians may access a work order.",
         "basis": "proposal", "sourceIds": [], "findingIds": []}]
    sections["Metrics and validation"]["items"] = [
        {"text": "After one week, triage time must improve by at least 30% from a measured baseline.",
         "basis": "proposal", "sourceIds": [], "findingIds": []}]
    # Owner decisions must survive without being copied into each revision brief.
    sections["Product thesis, scope, and non-goals"]["items"] = [
        {"text": value["brief"], "basis": "owner_decision", "sourceIds": [], "findingIds": []}]
    result = finalize("create_prd", value, proposed)
    return {"tool": "create_prd", "reference": reference(701), "input": value,
            "candidate": proposed, "artifact": result["artifact"], "markdown": result["markdown"]}


def revision_input(parent):
    return {"brief": "Preserve all existing requirements and scope; add this owner-requested acceptance criterion: " + WARNING,
            "revisionOf": parent["reference"]}


def addition():
    return {"additions": [{"heading": "Prioritized requirements", "item": {
        "text": WARNING, "basis": "owner_decision", "sourceIds": [], "findingIds": []}}], "replacements": []}


class PrdRevisionTests(unittest.TestCase):
    def test_exact_additive_regression_preserves_all_items_metrics_order_and_source(self):
        parent = source_prd()
        original = deepcopy(parent)
        value = revision_input(parent)
        prepared = prepare("create_prd", value, [parent])
        payload = json.loads(prepared["userPrompt"])
        self.assertEqual(payload["previousPrd"], parent["artifact"])
        self.assertEqual(set(prepared["responseSchema"]["properties"]), {"additions", "replacements"})
        self.assertEqual(prepared["responseSchema"]["properties"]["replacements"]["maxItems"], 0)
        result = finalize("create_prd", value, addition(), context=prepared["context"], host_evidence=[parent])
        artifact = result["artifact"]
        self.assertEqual(artifact["artifactType"], "software_prd")
        self.assertEqual(artifact["title"], parent["artifact"]["title"])
        for old, new in zip(parent["artifact"]["sections"], artifact["sections"], strict=True):
            self.assertEqual(old["heading"], new["heading"])
            self.assertEqual(old["items"], new["items"][:len(old["items"])])
            self.assertEqual(len(new["items"]) - len(old["items"]), int(old["heading"] == "Prioritized requirements"))
        for exact_commitment in ("under 3 clicks", "chronologically", "mandatory access instructions", "within 5 seconds", "within 30 seconds", "at least 30%"):
            self.assertIn(exact_commitment, result["markdown"])
        self.assertEqual(parent, original)
        self.assertEqual(artifact["revisionPreservation"]["changedItemIds"], [])
        self.assertEqual(artifact["revisionPreservation"]["removedItemIds"], [])
        self.assertEqual(len(artifact["revisionPreservation"]["addedItemIds"]), 1)
        self.assertEqual(artifact["itemCatalogue"][:1], original["artifact"]["itemCatalogue"][:1])

    def test_full_document_rewrite_is_rejected_even_if_model_review_would_pass(self):
        parent = source_prd()
        rewritten = deepcopy(parent["candidate"])
        for section in rewritten["sections"]:
            if section["heading"] == "Prioritized requirements":
                section["items"] = [addition()["additions"][0]["item"]]
            if section["heading"] == "Metrics and validation":
                section["items"][0]["text"] = "Triage should be faster than baseline."
        with self.assertRaises(LocalValidationError) as caught:
            finalize("create_prd", revision_input(parent), rewritten, host_evidence=[parent])
        self.assertEqual(caught.exception.code, "INVALID_PRD_REVISION_PATCH")

    def test_repair_keeps_bounded_revision_patch_schema_and_preservation_instructions(self):
        from backend.services.local_axwise.quality import prepare_repair
        parent = source_prd()
        prepared = prepare_repair("create_prd", revision_input(parent), parent["candidate"],
                                  diagnostics=["INVALID_PRD_REVISION_PATCH"], host_evidence=[parent])
        self.assertEqual(set(prepared["responseSchema"]["properties"]), {"additions", "replacements"})
        self.assertIn("complete bounded additions/replacements patch object", prepared["systemPrompt"])
        self.assertIn("never a full PRD document", prepared["systemPrompt"])
        self.assertNotIn("replacement JSON, not a patch", prepared["systemPrompt"])
        repaired = finalize("create_prd", revision_input(parent), addition(), host_evidence=[parent])
        self.assertEqual(repaired["artifact"]["revisionPreservation"]["changedItemIds"], [])

    def test_unauthorized_replacement_removal_and_missing_parent_are_rejected(self):
        parent = source_prd()
        first = catalogue(parent["artifact"])[0]
        bad_patch = {"additions": [], "replacements": [{"itemId": first["id"], "item": addition()["additions"][0]["item"]}]}
        with self.assertRaisesRegex(LocalValidationError, "local validation"):
            finalize("create_prd", revision_input(parent), bad_patch, host_evidence=[parent])
        with self.assertRaises(LocalValidationError) as caught:
            prepare("create_prd", revision_input(parent))
        self.assertEqual(caught.exception.code, "INVALID_PRD_REVISION_BASE")
        value = revision_input(parent) | {"revisionEdits": [{"itemId": first["id"], "action": "remove", "instruction": "Delete an item."}]}
        with self.assertRaises(LocalValidationError) as caught:
            prepare("create_prd", value, [parent])
        self.assertEqual(caught.exception.code, "INVALID_PRD_REVISION_EDIT")

    def test_explicit_targeted_replacement_retains_identity_and_every_other_item(self):
        parent = source_prd()
        metric = next(row for row in catalogue(parent["artifact"]) if row["heading"] == "Metrics and validation")
        instruction = "Change the triage improvement target to at least 40%."
        value = revision_input(parent) | {"brief": instruction,
            "revisionEdits": [{"itemId": metric["id"], "action": "replace", "instruction": instruction}]}
        patch = {"additions": [], "replacements": [{"itemId": metric["id"], "item": {
            "text": "After one week, triage time must improve by at least 40% from a measured baseline.",
            "basis": "proposal", "sourceIds": [], "findingIds": []}}]}
        result = finalize("create_prd", value, patch, host_evidence=[parent])
        for old, new in zip(parent["artifact"]["sections"], result["artifact"]["sections"], strict=True):
            if old["heading"] != "Metrics and validation":
                self.assertEqual(new, old)
        updated = next(row for row in result["artifact"]["itemCatalogue"] if row["id"] == metric["id"])
        self.assertNotEqual(updated["itemHash"], metric["itemHash"])
        self.assertEqual(result["artifact"]["revisionPreservation"]["changedItemIds"], [metric["id"]])

    def test_explicit_removal_requires_exact_selection_and_preserves_other_priority(self):
        parent = source_prd()
        item = next(row for row in catalogue(parent["artifact"]) if row["heading"] == "Prioritized requirements" and row["index"] == 1)
        instruction = "Remove the mandatory structured-field requirement."
        value = revision_input(parent) | {"brief": instruction,
            "revisionEdits": [{"itemId": item["id"], "action": "remove", "instruction": instruction}]}
        result = finalize("create_prd", value, {"additions": [], "replacements": []}, host_evidence=[parent])
        requirements = next(row["items"] for row in result["artifact"]["sections"] if row["heading"] == item["heading"])
        original = next(row["items"] for row in parent["artifact"]["sections"] if row["heading"] == item["heading"])
        self.assertEqual(requirements, [original[0], original[2]])
        self.assertEqual(result["artifact"]["revisionPreservation"]["removedItemIds"], [item["id"]])

    def test_second_revision_keeps_ids_and_first_added_condition(self):
        parent = source_prd()
        first = finalize("create_prd", revision_input(parent), addition(), host_evidence=[parent])
        saved = {**parent, "reference": reference(702), "artifact": first["artifact"]}
        second = finalize("create_prd", {"brief": "Require the dispatcher to see who confirmed a duplicate.", "revisionOf": saved["reference"]},
            {"additions": [{"heading": "Prioritized requirements", "item": {"text": "Require the dispatcher to see who confirmed a duplicate.",
                "basis": "owner_decision", "sourceIds": [], "findingIds": []}}], "replacements": []}, host_evidence=[saved])
        self.assertIn(WARNING, second["markdown"])
        self.assertEqual({row["id"] for row in first["artifact"]["itemCatalogue"]}, set(second["artifact"]["revisionPreservation"]["retainedItemIds"]))

    def test_legacy_parent_gets_stable_ids_and_keeps_source_provenance(self):
        value = inputs()["create_prd"]
        value["sources"][0]["origin"] = "synthetic_transcript"
        original = finalize("create_prd", value, candidate("create_prd", value))
        original["artifact"].pop("itemCatalogue")
        parent = {"tool": "create_prd", "reference": reference(703), "input": value, "artifact": original["artifact"]}
        before_hash = canonical_hash(parent)
        result = finalize("create_prd", revision_input(parent), addition(), host_evidence=[parent])
        self.assertEqual(result["artifact"]["sources"], original["artifact"]["sources"])
        for old, new in zip(original["artifact"]["sections"], result["artifact"]["sections"], strict=True):
            self.assertEqual(old["items"], new["items"][:len(old["items"])])
        self.assertEqual(canonical_hash(parent), before_hash)

    def test_analysis_backed_revision_keeps_exact_findings_and_accepts_new_owner_decision(self):
        analysis, market = analysis_host(), market_host()
        value = prd_input(analysis, market)
        parent = save("create_prd", value, prd_candidate(value, [analysis, market]), [analysis, market], index=704)
        result = finalize("create_prd", revision_input(parent), addition(), host_evidence=[parent, analysis])
        self.assertEqual(result["artifact"]["analysisFindings"], parent["artifact"]["analysisFindings"])
        self.assertEqual(result["artifact"]["analysisArtifact"], parent["artifact"]["analysisArtifact"])
        self.assertEqual(result["artifact"]["sources"], parent["artifact"]["sources"])
        self.assertIn(WARNING, result["markdown"])

    def test_legacy_full_document_revision_can_be_selected_for_new_revision_and_delivery(self):
        parent = source_prd()
        parent["artifact"].pop("itemCatalogue")
        parent["input"]["revisionOf"] = reference(699)
        # The immutable parent was a pre-fix full-document revision; do not
        # reinterpret its saved candidate under today's patch generation schema.
        self.assertIn("sections", parent["candidate"])
        result = finalize("create_prd", revision_input(parent), addition(), host_evidence=[parent])
        self.assertIn(WARNING, result["markdown"])
        delivery = prepare("create_delivery_brief", {"references": [parent["reference"]]}, [parent])
        self.assertEqual(delivery["context"]["prdReference"], parent["reference"])

    def test_addition_cannot_fabricate_owner_quote_or_synthetic_finding(self):
        parent = source_prd()
        patch = addition()
        patch["additions"][0]["item"]["text"] = "User supposedly agreed to automatic assignment."
        with self.assertRaises(LocalValidationError) as caught:
            finalize("create_prd", revision_input(parent), patch, host_evidence=[parent])
        self.assertIn("INVALID_OWNER_DECISION", caught.exception.diagnostics)

    def test_usage_omits_unknown_cache_and_preserves_explicit_zero(self):
        value = inputs()["create_prd"]
        base = candidate("create_prd", value)
        self.assertNotIn("cacheReadTokens", finalize("create_prd", value, base)["usage"])
        self.assertEqual(finalize("create_prd", value, base, usage={"cacheReadTokens": 0, "cacheWriteTokens": 512})["usage"]["cacheWriteTokens"], 512)
        with self.assertRaises(ValueError):
            finalize("create_prd", value, base, usage={"cacheReadTokens": -1})


if __name__ == "__main__":
    unittest.main()
