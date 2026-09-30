"""Offline engine contracts: real kernel/review validation, fake providers/storage."""

import asyncio
from copy import deepcopy
import json
from pathlib import Path
import hashlib
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from backend.domain.workflow_v2.wire import canonical_hash
from backend.services.local_axwise import engine, kernel, quality, storage
from backend.tests.local_axwise.fixtures import candidate, inputs
from backend.tests.local_axwise.test_discovery import discovery_input, discovery_candidate
from backend.tests.local_axwise.test_pipeline_integration import personas_host, simulation_input, simulation_candidate
from backend.tests.local_axwise.test_quality import review_candidate


class FakeProvider:
    model = "offline-fixture"
    provider_type = "offline-test"

    def __init__(self, responses, usages=None):
        self.responses = list(responses)
        self.usages = usages
        self.calls = []

    async def complete(self, system, user, schema=None, maximum=8192):
        index = len(self.calls)
        self.calls.append({"system": system, "user": json.loads(user), "schema": schema})
        response = self.responses[index]
        await asyncio.sleep(0)
        if isinstance(response, Exception):
            raise response
        reported = {"prompt_tokens": (index + 1) * 10, "completion_tokens": index + 1}
        if self.usages is not None:
            reported = self.usages[index]
        return json.dumps(response), reported


class EngineRegressionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.saved = []
        self.hosts = []
        self.value = discovery_input()
        self.good = discovery_candidate()
        self.tool = "prepare_discovery"
        self.stage_records = []

        def resolve(tool, value, **kwargs):
            return deepcopy(value), deepcopy(self.hosts)

        def save(tool, record, **kwargs):
            self.saved.append(deepcopy(record))
            return {"operationId": record["operationId"], "sha256": "a" * 64,
                    "mdPath": "/tmp/offline.md", "jsonPath": "/tmp/offline.json",
                    "artifactSafety": {"status": "not_evaluated", "passed": None}}

        self.resolve = self.enterContext(patch.object(engine, "resolve_references_with_fallback", side_effect=resolve))
        self.save = self.enterContext(patch.object(engine, "save_operation", side_effect=save))
        self.record_stage = self.enterContext(patch.object(engine, "record_stage", side_effect=lambda *a, **kw: self.stage_records.append((a, kw))))
        self.enterContext(patch.object(engine, "is_typesafe_available", return_value=False))

    async def run_tool(self, provider, *, deep=False, value=None, tool=None):
        selected = deepcopy(value if value is not None else self.value)
        if deep:
            selected["depth"] = "deep"
        return await engine.execute_tool(tool or self.tool, selected, session_id="test-scope", provider=provider, state_dir=Path("/tmp/test-engine-scope"))

    async def test_standard_does_not_claim_substantive_review(self):
        provider = FakeProvider([self.good])
        result = await self.run_tool(provider)
        self.assertEqual(len(provider.calls), 1)
        self.assertEqual(result["qualityReview"]["status"], "not_evaluated")
        self.assertIsNone(result["qualityReview"]["passed"])
        self.assertTrue(self.saved[0]["validation"]["valid"])
        self.assertEqual(result["artifactSafety"]["status"], "not_evaluated")

    async def test_state_scope_reaches_every_storage_call(self):
        await self.run_tool(FakeProvider([self.good]))
        for mocked in (self.resolve, self.save):
            self.assertEqual(mocked.call_args.kwargs["session_id"], "test-scope")
            self.assertEqual(mocked.call_args.kwargs["state_dir"], Path("/tmp/test-engine-scope"))
        for _args, kwargs in self.stage_records:
            self.assertEqual(kwargs["state_dir"], Path("/tmp/test-engine-scope"))

    async def test_llm_review_is_bound_to_the_actual_artifact(self):
        provider = FakeProvider([self.good, review_candidate(self.tool)])
        result = await self.run_tool(provider, deep=True)
        artifact = self.saved[0]["artifact"]
        self.assertEqual(provider.calls[1]["user"]["candidateArtifact"], artifact)
        self.assertTrue(result["qualityReview"]["passed"])
        self.assertEqual(result["qualityReview"]["artifactHash"], canonical_hash(artifact))
        self.assertEqual(result["usage"]["modelCalls"], 2)
        self.assertEqual(result["usage"]["inputTokens"], 30)
        self.assertEqual(result["usage"]["outputTokens"], 3)
        self.assertEqual(self.saved[0]["candidateUsage"]["modelCalls"], 1)

    async def test_failed_review_repairs_and_rebinds_the_new_candidate(self):
        replacement = deepcopy(self.good)
        replacement["decision"] = "Decide whether a limited prototype merits a real operations pilot."
        failed = review_candidate(self.tool, quality.CRITERIA[self.tool][0])
        provider = FakeProvider([self.good, failed, replacement, review_candidate(self.tool)])
        result = await self.run_tool(provider, deep=True)
        record = self.saved[0]
        self.assertEqual(record["candidate"], replacement)
        self.assertEqual(record["artifact"]["decision"], replacement["decision"])
        self.assertIn(replacement["decision"], record["markdown"])
        self.assertNotEqual(provider.calls[1]["user"]["candidateArtifact"], provider.calls[3]["user"]["candidateArtifact"])
        self.assertEqual(provider.calls[3]["user"]["candidateArtifact"], record["artifact"])
        repair = provider.calls[2]["user"]["repair"]
        self.assertEqual(repair["candidate"], json.dumps(self.good))
        self.assertFalse(repair["qualityReview"]["passed"])
        self.assertEqual(repair["validationDiagnosticCodes"], [])
        self.assertEqual(result["usage"]["modelCalls"], 4)
        self.assertEqual(result["usage"]["inputTokens"], 100)
        self.assertEqual(result["usage"]["outputTokens"], 10)
        self.assertEqual(record["candidateUsage"]["inputTokens"], 30)
        self.assertEqual([call["stage"] for call in result["usage"]["calls"]], ["generation", "review", "repair", "final_review"])

    async def test_failed_final_review_never_publishes(self):
        failed = review_candidate(self.tool, quality.CRITERIA[self.tool][0])
        provider = FakeProvider([self.good, failed, self.good, failed])
        with self.assertRaisesRegex(engine.EngineError, "final quality review") as raised:
            await self.run_tool(provider, deep=True)
        self.assertFalse(self.saved)
        self.assertEqual(raised.exception.usage["modelCalls"], 4)

    async def test_malformed_or_failed_provider_review_never_approves(self):
        for response in ({}, RuntimeError("private provider payload")):
            with self.subTest(response=type(response).__name__):
                provider = FakeProvider([self.good, response])
                with self.assertRaises(engine.EngineError) as raised:
                    await self.run_tool(provider, deep=True)
                self.assertFalse(self.saved)
                self.assertNotIn("private provider payload", str(raised.exception))
                self.assertEqual(len(provider.calls), 2)

    async def test_jev_passed_fast_path_preserves_artifact_binding(self):
        validate = AsyncMock(return_value=SimpleNamespace(status="passed"))
        with patch.object(engine, "is_typesafe_available", return_value=True), patch.object(engine, "validate_deliverable_with_jev", validate):
            result = await self.run_tool(FakeProvider([self.good]), deep=True)
        self.assertEqual(result["qualityReview"]["fastPath"], "jev")
        self.assertEqual(result["qualityReview"]["artifactHash"], canonical_hash(result["artifact"]))
        self.assertEqual(result["usage"]["modelCalls"], 1)
        self.assertEqual(result["usage"]["decisionCalls"][0]["status"], "passed")

    async def test_unavailable_jev_uses_real_llm_review(self):
        with patch.object(engine, "is_typesafe_available", return_value=True), patch.object(engine, "validate_deliverable_with_jev", AsyncMock(side_effect=RuntimeError("offline"))):
            result = await self.run_tool(FakeProvider([self.good, review_candidate(self.tool)]), deep=True)
        self.assertTrue(result["qualityReview"]["passed"])
        self.assertNotIn("fastPath", result["qualityReview"])
        self.assertEqual(result["usage"]["decisionCalls"][0]["status"], "not_evaluated")

    async def test_schema_repair_uses_diagnostics_without_a_fake_review(self):
        provider = FakeProvider([{}, self.good])
        result = await self.run_tool(provider)
        repair = provider.calls[1]["user"]["repair"]
        self.assertIsNone(repair["qualityReview"])
        self.assertEqual(repair["validationDiagnosticCodes"], ["INVALID_CANDIDATE_SCHEMA"])
        self.assertEqual(len(provider.calls), 2)
        self.assertEqual(self.saved[0]["candidate"], self.good)
        self.assertEqual(result["usage"]["inputTokens"], 30)

    async def test_second_schema_failure_stops(self):
        provider = FakeProvider([{}, {}])
        with self.assertRaisesRegex(engine.EngineError, "repaired artifact failed"):
            await self.run_tool(provider)
        self.assertFalse(self.saved)
        self.assertEqual(len(provider.calls), 2)

    async def test_only_one_repair_across_schema_and_quality(self):
        failed = review_candidate(self.tool, quality.CRITERIA[self.tool][0])
        provider = FakeProvider([{}, self.good, failed])
        with self.assertRaisesRegex(engine.EngineError, "single repair"):
            await self.run_tool(provider, deep=True)
        self.assertFalse(self.saved)
        self.assertEqual(len(provider.calls), 3)

    async def test_unknown_validation_failures_do_not_invent_diagnostics(self):
        provider = FakeProvider([self.good])
        with patch.object(kernel, "finalize", side_effect=RuntimeError("internal failure")):
            with self.assertRaisesRegex(engine.EngineError, "Validation failed"):
                await self.run_tool(provider)
        self.assertFalse(self.saved)
        self.assertEqual(len(provider.calls), 1)

    async def test_recognized_validation_diagnostic_is_preserved(self):
        provider = FakeProvider([self.good, self.good])
        finalize = kernel.finalize
        count = 0

        def once(*args, **kwargs):
            nonlocal count
            count += 1
            if count == 1:
                raise kernel.LocalValidationError("SOURCE_QUOTATION_BASIS_MISMATCH")
            return finalize(*args, **kwargs)

        with patch.object(kernel, "finalize", side_effect=once):
            await self.run_tool(provider)
        self.assertEqual(provider.calls[1]["user"]["repair"]["validationDiagnosticCodes"], ["SOURCE_QUOTATION_BASIS_MISMATCH"])

    async def test_unknown_usage_stays_unknown_and_zero_is_preserved(self):
        provider = FakeProvider([self.good, review_candidate(self.tool)], usages=[{"prompt_tokens": 0, "completion_tokens": 0}, {}])
        result = await self.run_tool(provider, deep=True)
        usage = result["usage"]
        self.assertEqual(usage["modelCalls"], 2)
        self.assertIsNone(usage["inputTokens"])
        self.assertIsNone(usage["outputTokens"])
        self.assertEqual(usage["inputTokensReportedCalls"], 1)
        self.assertEqual(usage["reportedTokens"]["inputTokens"], 0)
        self.assertEqual(self.saved[0]["candidateUsage"]["inputTokens"], 0)

    async def test_failed_provider_call_is_counted_with_unknown_usage(self):
        provider = FakeProvider([RuntimeError("request failed")])
        with self.assertRaises(engine.EngineError) as raised:
            await self.run_tool(provider)
        self.assertEqual(raised.exception.usage["modelCalls"], 1)
        self.assertEqual(raised.exception.usage["calls"][0]["status"], "failed")
        self.assertIsNone(raised.exception.usage["inputTokens"])
        self.assertFalse(self.saved)

    def simulation(self, count, depth):
        value = inputs()["simulate_interviews"]
        value["depth"] = depth
        value["stakeholders"][0]["participants"] = count
        proposed = candidate("simulate_interviews", value)
        parts = [{"participants": [person], "interviews": [interview]}
                 for person, interview in zip(proposed["participants"], proposed["interviews"])]
        return value, proposed, parts

    async def test_simulation_standard_and_single_deep_controls(self):
        for count, depth in ((2, "standard"), (1, "deep")):
            with self.subTest(count=count, depth=depth):
                value, proposed, _parts = self.simulation(count, depth)
                provider = FakeProvider([proposed])
                result = await self.run_tool(provider, tool="simulate_interviews", value=value)
                self.assertEqual(len(result["artifact"]["participants"]), count)
                self.assertEqual(len(provider.calls), 1)

    async def test_deep_cohort_aggregates_planned_parts_and_usage(self):
        value, _proposed, parts = self.simulation(2, "deep")
        provider = FakeProvider(parts)
        result = await self.run_tool(provider, tool="simulate_interviews", value=value)
        self.assertEqual(len(result["artifact"]["participants"]), 2)
        self.assertEqual(result["usage"]["modelCalls"], 2)
        self.assertEqual(result["usage"]["inputTokens"], 30)
        self.assertEqual(self.saved[0]["candidateUsage"]["modelCalls"], 2)
        self.assertEqual(self.saved[0]["candidateUsage"]["inputTokens"], 30)
        self.assertEqual([row["stage"] for row in result["usage"]["calls"]], ["interview_1", "interview_2"])

    async def test_saved_personas_are_preserved_in_deep_cohort(self):
        cohort = personas_host(participants=2)
        self.hosts = [cohort]
        value = simulation_input(cohort, depth="deep")
        proposed = simulation_candidate(value, self.hosts)
        provider = FakeProvider([{"interviews": [interview]} for interview in proposed["interviews"]])
        result = await self.run_tool(provider, tool="simulate_interviews", value=value)
        prepared = kernel.prepare("simulate_interviews", value, self.hosts)
        self.assertEqual(result["artifact"]["participants"], prepared["fixedParticipants"])
        self.assertNotIn("participants", self.saved[0]["candidate"])

    async def test_missing_duplicate_or_mismatched_cohort_parts_do_not_publish(self):
        for corruption in ("missing", "duplicate", "swapped"):
            with self.subTest(corruption=corruption):
                value, _proposed, parts = self.simulation(2, "deep")
                if corruption == "missing":
                    parts[1]["interviews"] = []
                elif corruption == "duplicate":
                    parts[1] = deepcopy(parts[0])
                else:
                    parts.reverse()
                provider = FakeProvider(parts)
                with self.assertRaisesRegex(engine.EngineError, "complete planned simulation"):
                    await self.run_tool(provider, tool="simulate_interviews", value=value)
                self.assertFalse(self.saved)
                self.assertLessEqual(len(provider.calls), 2)

    async def test_invalid_single_simulation_does_not_use_synthesis_repair(self):
        value, _proposed, _parts = self.simulation(1, "deep")
        provider = FakeProvider([{}])
        with self.assertRaisesRegex(engine.EngineError, "Validation failed"):
            await self.run_tool(provider, tool="simulate_interviews", value=value)
        self.assertEqual(len(provider.calls), 1)
        self.assertFalse(self.saved)

    async def test_cohort_failure_cancels_inflight_work_and_stops_new_calls(self):
        value, _proposed, _parts = self.simulation(3, "deep")
        cancelled = asyncio.Event()
        started = []

        async def complete(*args):
            index = len(started)
            started.append(index)
            if index == 0:
                await asyncio.sleep(0)
                return "{}", {}
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()

        provider = FakeProvider([])
        provider.complete = complete
        with self.assertRaises(engine.EngineError) as raised:
            await self.run_tool(provider, tool="simulate_interviews", value=value)
        self.assertEqual(started, [0, 1])
        self.assertTrue(cancelled.is_set())
        self.assertFalse(self.saved)
        self.assertEqual(raised.exception.usage["modelCalls"], 2)
        self.assertEqual(raised.exception.usage["calls"][1]["status"], "cancelled")


class EngineStorageIntegrationTests(unittest.IsolatedAsyncioTestCase):
    """Exercise the actual prepare→review→publication boundary in temporary state."""

    def setUp(self):
        temporary = self.enterContext(tempfile.TemporaryDirectory())
        self.state = Path(temporary)
        self.enterContext(patch.object(engine, "is_typesafe_available", return_value=False))
        self.safety = self.enterContext(patch.object(storage, "check_artifact_safety_with_jev", return_value={
            "status": "not_evaluated", "evaluated": False, "passed": None, "reason": "offline_test",
        }))

    async def test_reviewed_artifact_round_trip_preserves_usage_and_file_reference(self):
        value = {**discovery_input(), "depth": "deep"}
        result = await engine.execute_tool("prepare_discovery", value, session_id="workspace-a",
            state_dir=self.state, provider=FakeProvider([discovery_candidate(), review_candidate("prepare_discovery")]))
        contents = Path(result["jsonPath"]).read_bytes()
        self.assertEqual(result["sha256"], hashlib.sha256(contents).hexdigest())
        persisted = json.loads(contents)
        self.assertEqual(persisted["qualityReview"]["artifactHash"], canonical_hash(persisted["artifact"]))
        self.assertEqual(persisted["usage"]["modelCalls"], 2)
        self.assertEqual(persisted["usage"]["inputTokens"], 30)
        found = storage.find_artifact_by_id(result["operationId"], session_id="workspace-a", state_dir=self.state)
        self.assertEqual(found["artifact"], result["artifact"])
        self.assertIsNone(storage.find_artifact_by_id(result["operationId"], session_id="workspace-b", state_dir=self.state))

    async def test_explicit_safety_failure_blocks_publication_through_engine(self):
        self.safety.return_value = {"status": "failed", "evaluated": True, "passed": False, "contains_secrets": True}
        with self.assertRaisesRegex(engine.EngineError, "ARTIFACT_SAFETY_FAILED") as raised:
            await engine.execute_tool("prepare_discovery", discovery_input(), session_id="workspace-a",
                state_dir=self.state, provider=FakeProvider([discovery_candidate()]))
        self.assertEqual(raised.exception.usage["modelCalls"], 1)
        self.assertEqual(list(self.state.rglob("*.json")), [])
        self.assertEqual(list(self.state.rglob("*.md")), [])
        self.assertIsNone(storage.find_latest_artifact(["prepare_discovery"], session_id="workspace-a", state_dir=self.state))


if __name__ == "__main__":
    unittest.main()
