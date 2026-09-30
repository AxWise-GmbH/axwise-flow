"""Offline regression coverage for scoped references, immutable bytes and safety policy."""
from contextlib import closing
from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.services.local_axwise import storage


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        env = patch.dict(os.environ, {"AXWISE_REMOTE_ARTIFACT_SAFETY": "false", "TYPESAFE_API_KEY": "dummy-not-a-credential"})
        env.start()
        self.addCleanup(env.stop)
        network = patch("urllib.request.urlopen", side_effect=AssertionError("Unexpected network request"))
        self.network = network.start()
        self.addCleanup(network.stop)

    def record(self, operation_id="artifact-one", **overrides):
        return {"operationId": operation_id, "artifact": {"title": "Safe discovery"},
                "markdown": "# Discovery\nOrdinary local content.", "input": {"description": "Original request"},
                "candidate": {"summary": "Generated response"}, **overrides}

    def save(self, operation_id="artifact-one", session="project-a", root=None, **overrides):
        return storage.save_operation("prepare_discovery", self.record(operation_id, **overrides), session, root or self.root)

    def resolve(self, raw_input, session="project-a"):
        return storage.resolve_references_with_fallback("generate_personas", raw_input, session, self.root)

    def assert_code(self, code, callback):
        with self.assertRaises(storage.StorageError) as caught:
            callback()
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_saved_bytes_have_one_external_digest_and_do_not_mutate_input(self):
        original = self.record()
        untouched = deepcopy(original)
        saved = storage.save_operation("prepare_discovery", original, "project-a", self.root)
        payload = Path(saved["jsonPath"]).read_bytes()
        self.assertEqual(saved["sha256"], hashlib.sha256(payload).hexdigest())
        data = json.loads(payload)
        self.assertNotIn("sha256", data)
        self.assertNotIn("reference", data)
        self.assertEqual(original, untouched)
        loaded = storage.find_artifact_by_id(saved["operationId"], self.root, session_id="project-a")
        self.assertEqual(loaded["reference"]["sha256"], saved["sha256"])
        with closing(storage.get_db_connection(self.root)) as conn:
            self.assertEqual(conn.execute("SELECT sha256 FROM operations").fetchone()[0], saved["sha256"])
        self.assertEqual(Path(saved["jsonPath"]).stat().st_mode & 0o777, 0o600)

    def test_regular_files_on_platforms_without_optional_open_flags(self):
        saved = self.save()
        with patch.object(storage.os, "O_NOFOLLOW", 0), patch.object(storage.os, "O_NONBLOCK", 0):
            loaded = storage.find_artifact_by_id(saved["operationId"], self.root, session_id="project-a")
            self.assertEqual(loaded["reference"]["sha256"], saved["sha256"])

    def test_implicit_latest_never_crosses_sessions(self):
        self.save()
        self.assertIsNone(storage.find_latest_artifact(["prepare_discovery"], "project-b", self.root))
        self.assertEqual(self.resolve({}, "project-b"), ({}, []))
        self.assertEqual(self.resolve({})[1][0]["operationId"], "artifact-one")

    def test_explicit_id_prefix_and_legacy_fields_never_cross_sessions(self):
        self.save()
        for operation_id in ("artifact-one", "artifact"):
            self.assertIsNone(storage.find_artifact_by_id(operation_id, self.root, session_id="project-b"))
            for key in ("references", "analysisArtifact", "revisionOf", "documentReference"):
                reference = {"operationId": operation_id}
                value = [reference] if key == "references" else reference
                with self.subTest(operation_id=operation_id, key=key):
                    self.assert_code("ARTIFACT_REFERENCE_NOT_FOUND", lambda: self.resolve({key: value}, "project-b"))

    def test_state_roots_are_independent(self):
        first = self.save()
        other_root = self.root / "separate-state"
        self.assertIsNone(storage.find_artifact_by_id(first["operationId"], other_root, session_id="project-a"))
        second = self.save(root=other_root, markdown="Separate workspace")
        self.assertNotEqual(first["sha256"], second["sha256"])

    def test_ambiguous_prefix_rejected_and_exact_id_preferred(self):
        self.save("shared-one")
        self.save("shared-two")
        self.assert_code("ARTIFACT_REFERENCE_AMBIGUOUS", lambda: self.resolve({"references": [{"operationId": "shared"}]}))
        self.save("shared")
        self.assertEqual(self.resolve({"references": [{"operationId": "shared"}]})[1][0]["operationId"], "shared")

    def test_prefix_is_literal_not_sql_wildcard(self):
        self.save("item_x")
        self.save("item-y")
        self.assertEqual(storage.find_artifact_by_id("item_", self.root, session_id="project-a")["operationId"], "item_x")

    def test_omitted_hash_filled_prefix_canonicalized_without_mutating_caller(self):
        saved = self.save()
        value = {"references": [{"operationId": "artifact"}]}
        resolved, evidence = self.resolve(value)
        self.assertEqual(value, {"references": [{"operationId": "artifact"}]})
        self.assertEqual(resolved["references"], [{"operationId": "artifact-one", "sha256": saved["sha256"]}])
        self.assertEqual(evidence[0]["reference"], resolved["references"][0])

    def test_supplied_wrong_digest_is_never_replaced(self):
        self.save()
        for key in ("references", "analysisArtifact", "revisionOf", "documentReference"):
            ref = {"operationId": "artifact-one", "sha256": "0" * 64}
            value = {key: [ref] if key == "references" else ref}
            original = deepcopy(value)
            self.assert_code("ARTIFACT_HASH_MISMATCH", lambda: self.resolve(value))
            self.assertEqual(value, original)

    def test_unknown_explicit_reference_does_not_fall_back(self):
        self.save()
        self.assert_code("ARTIFACT_REFERENCE_NOT_FOUND", lambda: self.resolve({"references": [{"operationId": "unknown"}]}))
        self.assert_code("INVALID_ARTIFACT_REFERENCE", lambda: self.resolve({"references": [{}]}))
        self.assert_code("INVALID_ARTIFACT_REFERENCE", lambda: self.resolve({"references": {}}))

    def test_same_second_latest_uses_insertion_order(self):
        self.save("first")
        self.save("second")
        self.assertEqual(storage.find_latest_artifact(["prepare_discovery"], "project-a", self.root)["operationId"], "second")

    def test_missing_or_tampered_files_never_fall_back_to_sqlite(self):
        for target in ("jsonPath", "mdPath"):
            for action in ("delete", "tamper"):
                with self.subTest(target=target, action=action):
                    saved = self.save(f"{target}-{action}")
                    path = Path(saved[target])
                    path.unlink() if action == "delete" else path.write_text("changed")
                    code = "ARTIFACT_FILE_UNAVAILABLE" if action == "delete" else "ARTIFACT_HASH_MISMATCH"
                    self.assert_code(code, lambda: storage.find_artifact_by_id(saved["operationId"], self.root, session_id="project-a"))

    def test_nonregular_artifact_cannot_block_reader(self):
        saved = self.save()
        path = Path(saved["jsonPath"])
        path.unlink()
        os.mkfifo(path)
        self.assert_code("ARTIFACT_FILE_UNAVAILABLE", lambda: storage.find_artifact_by_id("artifact-one", self.root, session_id="project-a"))

    def test_legacy_self_hash_record_requires_explicit_migration(self):
        saved = self.save()
        path = Path(saved["jsonPath"])
        data = json.loads(path.read_bytes())
        data["sha256"] = "old-content-digest"
        content = json.dumps(data).encode()
        path.write_bytes(content)
        with closing(storage.get_db_connection(self.root)) as conn, conn:
            conn.execute("UPDATE operations SET sha256=?", (hashlib.sha256(content).hexdigest(),))
        self.assert_code("ARTIFACT_LEGACY_FORMAT", lambda: storage.find_artifact_by_id("artifact-one", self.root, session_id="project-a"))

    def test_duplicate_save_cannot_overwrite_artifact_or_scope(self):
        saved = self.save()
        original = Path(saved["jsonPath"]).read_bytes()
        self.assert_code("ARTIFACT_ALREADY_EXISTS", lambda: self.save(markdown="replacement"))
        self.assert_code("ARTIFACT_ALREADY_EXISTS", lambda: self.save(session="project-b"))
        self.assertEqual(Path(saved["jsonPath"]).read_bytes(), original)

    def test_database_failure_cleans_up_published_files(self):
        with closing(storage.get_db_connection(self.root)) as conn, conn:
            conn.execute("CREATE TRIGGER reject_insert BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'test'); END")
        self.assert_code("ARTIFACT_SAVE_FAILED", self.save)
        self.assertEqual(list((self.root / "project-a").iterdir()), [])
        with closing(storage.get_db_connection(self.root)) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0], 0)

    def test_file_failure_does_not_create_completed_row(self):
        real_write = storage._write_immutable
        def fail_markdown(path, content):
            if path.suffix == ".md":
                raise OSError("Test disk failure")
            real_write(path, content)
        with patch.object(storage, "_write_immutable", side_effect=fail_markdown):
            self.assert_code("ARTIFACT_SAVE_FAILED", self.save)
        self.assertEqual(list((self.root / "project-a").iterdir()), [])
        with closing(storage.get_db_connection(self.root)) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0], 0)

    def test_path_escape_and_symlink_scope_are_rejected(self):
        for scope in ("../other", "/tmp", ".", "..", "", None):
            self.assert_code("INVALID_STORAGE_SCOPE", lambda: self.save(session=scope))
        (self.root / "linked").symlink_to(self.root / "elsewhere")
        self.assert_code("INVALID_STORAGE_SCOPE", lambda: self.save(session="linked"))

    def test_artifact_identity_mismatch_is_rejected(self):
        self.assert_code("ARTIFACT_SCOPE_MISMATCH", lambda: self.save(sessionId="different"))
        self.assert_code("ARTIFACT_SCOPE_MISMATCH", lambda: self.save(tool="create_prd"))

    def test_stage_logs_keep_no_raw_input_or_candidate(self):
        dummy = "dummy-sensitive-stage-text"
        storage.record_stage("operation", "prepared", {"input": dummy}, self.root)
        storage.record_stage("operation", "candidate_generated", {"response": dummy}, self.root)
        with closing(storage.get_db_connection(self.root)) as conn:
            rows = conn.execute("SELECT stage_data FROM stages").fetchall()
        self.assertEqual(len(rows), 2)
        for row in rows:
            self.assertNotIn(dummy, row[0])
            audit = json.loads(row[0])
            self.assertEqual(audit["persistence"], "metadata_only")
            self.assertEqual(len(audit["payloadSha256"]), 64)
        self.assertNotIn(dummy.encode(), (self.root / "axwise.db").read_bytes())

    def test_explicit_failed_safety_prevents_files_and_completed_row(self):
        with patch.object(storage, "check_artifact_safety_with_jev", return_value={"evaluated": True, "passed": False, "contains_secrets": True}):
            error = self.assert_code("ARTIFACT_SAFETY_FAILED", self.save)
        self.assertEqual(error.safety["status"], "failed")
        self.assertEqual(list(self.root.glob("**/*.json")), [])
        with closing(storage.get_db_connection(self.root)) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0], 0)

    def test_complete_record_is_checked_including_raw_input_and_candidate(self):
        def inspect(content):
            data = json.loads(content)
            self.assertEqual(data["input"]["description"], "Original request")
            self.assertEqual(data["candidate"]["summary"], "Generated response")
            self.assertIn("markdown", data)
            return {"evaluated": True, "passed": True}
        with patch.object(storage, "check_artifact_safety_with_jev", side_effect=inspect):
            self.assertEqual(self.save()["artifactSafety"]["status"], "passed")

    def test_api_key_does_not_enable_remote_content_transmission(self):
        saved = self.save()
        self.network.assert_not_called()
        self.assertEqual(saved["artifactSafety"]["status"], "not_evaluated")
        self.assertIsNone(saved["artifactSafety"]["passed"])
        self.assertEqual(saved["artifactSafety"]["reason"], "remote_check_not_enabled")

    def test_known_secret_beyond_remote_size_bound_blocks_locally(self):
        dummy_key = "sk-" + "a" * 30
        error = self.assert_code("ARTIFACT_SAFETY_FAILED", lambda: self.save(input={"text": "x" * 20_000 + " " + dummy_key}))
        self.assertEqual(error.safety["reason"], "known_secret_pattern")
        self.network.assert_not_called()

    def test_opt_in_oversized_text_is_unevaluated_instead_of_truncated(self):
        with patch.dict(os.environ, {"AXWISE_REMOTE_ARTIFACT_SAFETY": "true"}):
            safety = storage.check_artifact_safety_with_jev("x" * 20_000)
        self.assertEqual(safety["status"], "not_evaluated")
        self.assertEqual(safety["reason"], "content_exceeds_remote_limit")
        self.assertEqual(safety["localCheckedCharacters"], 20_000)
        self.network.assert_not_called()

    def test_opt_in_remote_response_validation_and_failures(self):
        for result in ({}, {"answers": {}}, {"answers": {"contains_hardcoded_secrets": {"noul": True}}},
                       {"answers": {"contains_hardcoded_secrets": {"noul": -1}}},
                       {"answers": {"contains_hardcoded_secrets": {"noul": float("nan")}}}):
            with self.subTest(result=result), patch.dict(os.environ, {"AXWISE_REMOTE_ARTIFACT_SAFETY": "true"}), patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(result).encode())):
                verdict = storage.check_artifact_safety_with_jev("safe bounded text")
                self.assertEqual(verdict["status"], "not_evaluated")
                self.assertIsNone(verdict["passed"])
        with patch.dict(os.environ, {"AXWISE_REMOTE_ARTIFACT_SAFETY": "true"}), patch("urllib.request.urlopen", side_effect=TimeoutError("private transport details")):
            verdict = storage.check_artifact_safety_with_jev("safe bounded text")
            self.assertEqual(verdict["reason"], "service_unavailable")
            self.assertNotIn("private", json.dumps(verdict))

    def test_opt_in_valid_remote_pass_and_fail_cover_all_content(self):
        for score, status in ((0.2, "passed"), (0.9, "failed")):
            with self.subTest(score=score), patch.dict(os.environ, {"AXWISE_REMOTE_ARTIFACT_SAFETY": "true"}), patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps({"answers": {"contains_hardcoded_secrets": {"noul": score}}}).encode())) as network:
                verdict = storage.check_artifact_safety_with_jev("complete text")
                self.assertEqual(verdict["status"], status)
                self.assertEqual(verdict["checkedCharacters"], len("complete text"))
                self.assertEqual(json.loads(network.call_args.args[0].data)["state"]["snippet"], "complete text")


if __name__ == "__main__":
    unittest.main()
