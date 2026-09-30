#!/usr/bin/env python3
"""Offline review probes, including positive controls, for Axwise Python runtime.

Run with the repository's backend/venv/bin/python and pass the repository root.
This deliberately checks observed bugs at HEAD 21009d825aa64bf99eab42c7ee465f0597c7e214.
It is NOT a regression suite expecting production fixes to preserve these bugs.
All model/Jev responses are in-memory fixtures. Credential discovery, dotenv reads,
and network connection attempts are blocked. Only temporary files are written.
"""
from __future__ import annotations

import asyncio
from contextlib import ExitStack
from copy import deepcopy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else Path.cwd()).resolve()
sys.path.insert(0, str(ROOT))

# Patch before importing provider.py, which otherwise reads dotenv files at import.
with patch("dotenv.load_dotenv", return_value=False):
    from backend.services.local_axwise import engine, kernel, provider, quality, storage
    from backend.tests.local_axwise.fixtures import inputs, candidate
    from backend.tests.local_axwise.test_discovery import discovery_input, discovery_candidate
    from backend.domain.workflow_v2.wire import canonical_hash


class FakeProvider:
    model = "offline-fixture-model"
    provider_type = "offline"

    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = 0
        self.prompts = []

    async def complete(self, system_prompt, user_prompt, *_args):
        self.calls += 1
        self.prompts.append(json.loads(user_prompt))
        return json.dumps(next(self.responses)), {"prompt_tokens": 12, "completion_tokens": 34}


def run_tool(tool, value, responses, *, jev_status=None):
    fake = FakeProvider(responses)

    async def fake_jev(*_args, **_kwargs):
        return SimpleNamespace(status=jev_status)

    with tempfile.TemporaryDirectory(prefix="axwise-probe-state-") as temporary:
        with ExitStack() as stack:
            stack.enter_context(patch.dict(os.environ, {"AXWISE_STATE_DIR": temporary}))
            stack.enter_context(patch.object(engine, "is_typesafe_available", return_value=jev_status is not None))
            stack.enter_context(patch.object(engine, "validate_deliverable_with_jev", side_effect=fake_jev))
            try:
                result = asyncio.run(engine.execute_tool(tool, deepcopy(value), provider=fake))
            except Exception as error:
                return {"ok": False, "error": str(error).splitlines()[0], "calls": fake.calls}, fake
            saved = json.loads(Path(result["jsonPath"]).read_text())
            return {"ok": True, "qualityReview": saved["qualityReview"], "calls": fake.calls}, fake


def simulation(depth, count):
    value = inputs()["simulate_interviews"]
    value["depth"] = depth
    value["stakeholders"][0]["participants"] = count
    prepared = kernel.prepare("simulate_interviews", value)
    whole = candidate("simulate_interviews", value)
    if not prepared.get("generationTasks"):
        return value, [whole], whole
    parts = []
    for task in prepared["generationTasks"]:
        pid = json.loads(task["userPrompt"])["plan"][0]["participantId"]
        parts.append({key: [row for row in whole[key] if row["participantId"] == pid]
                      for key in ("participants", "interviews")})
    return value, parts, whole


def load_file_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    observations = {}
    with ExitStack() as guards:
        guards.enter_context(patch.object(socket.socket, "connect", side_effect=AssertionError("Network forbidden")))
        guards.enter_context(patch.object(provider, "discover_local_credentials", return_value={}))
        guards.enter_context(patch.object(storage, "check_artifact_safety_with_jev", return_value={"evaluated": False}))

        failed_review = {"checks": [{"criterion": code, "passed": False, "reason": "Deliberate fixture failure"}
                                    for code in quality.CRITERIA["prepare_discovery"]]}
        deep_value = discovery_input(depth="deep")
        failed, fake = run_tool("prepare_discovery", deep_value, [discovery_candidate(), failed_review])
        assert failed["ok"] and failed["qualityReview"]["passed"] is True
        assert fake.prompts[1]["candidateArtifact"] == {}
        observations["deep_review_jev_unavailable"] = {**failed, "review_candidate": fake.prompts[1]["candidateArtifact"]}

        jev_passed, _ = run_tool("prepare_discovery", deep_value, [discovery_candidate()], jev_status="passed")
        assert jev_passed["ok"] and jev_passed["calls"] == 1
        assert jev_passed["qualityReview"]["fastPath"] == "jev"
        observations["positive_control_jev_passed"] = jev_passed

        jev_failed, _ = run_tool("prepare_discovery", deep_value, [discovery_candidate(), failed_review], jev_status="failed")
        assert jev_failed["ok"] and "does not bind" in jev_failed["qualityReview"]["note"]
        observations["deep_review_jev_failed_fallback"] = jev_failed

        standard, _ = run_tool("prepare_discovery", discovery_input(), [discovery_candidate()])
        assert standard["ok"] and standard["calls"] == 1
        observations["positive_control_standard_skips_review"] = standard

        invalid = discovery_candidate()
        invalid.pop("decision")
        repair_failure, _ = run_tool("prepare_discovery", discovery_input(), [invalid, discovery_candidate()])
        assert not repair_failure["ok"] and repair_failure["calls"] == 1
        observations["schema_repair_not_invoked"] = repair_failure

        # Demonstrate the existing quality API is usable when supplied its real contract.
        artifact = kernel.finalize("prepare_discovery", deep_value, discovery_candidate())["artifact"]
        review_prep = quality.prepare_review("prepare_discovery", deep_value, artifact)
        bound_review = quality.validate_review("prepare_discovery", artifact, failed_review, review_prep["context"])
        assert bound_review["passed"] is False
        repair = quality.prepare_repair("prepare_discovery", deep_value, discovery_candidate(),
                                       review=bound_review, diagnostics=[])
        assert repair["repairAttempt"] == 1
        schema_repair = quality.prepare_repair("prepare_discovery", discovery_input(), invalid,
                                              review=None, diagnostics=["INVALID_CANDIDATE_SCHEMA"])
        assert schema_repair["repairAttempt"] == 1
        observations["positive_control_quality_api"] = {
            "correctly_bound_failed_review_passed": bound_review["passed"],
            "quality_repair_prepares": True, "schema_repair_prepares": True,
        }

        for depth, count in (("standard", 2), ("deep", 1), ("deep", 2)):
            value, parts, whole = simulation(depth, count)
            outcome, _ = run_tool("simulate_interviews", value, parts)
            assert outcome["ok"] == (depth != "deep" or count == 1)
            observations[f"simulation_{depth}_{count}_participants"] = outcome
            if depth == "deep" and count == 2:
                merged = {key: [row for part in parts for row in part[key]]
                          for key in ("participants", "interviews")}
                assert merged == whole
                assert kernel.finalize("simulate_interviews", value, merged)["validation"]["valid"]
                observations["positive_control_cohort_flattening"] = {"matches_whole_candidate": True, "passes_kernel": True}

        with tempfile.TemporaryDirectory(prefix="axwise-probe-storage-") as temporary:
            directory = Path(temporary)
            record = {"tool": "prepare_discovery", "sessionId": "alpha", "markdown": "Fixture markdown",
                      "artifact": {"title": "Fixture artifact"}, "input": {}, "candidate": {}}
            metadata = storage.save_operation("prepare_discovery", record, session_id="alpha", state_dir=directory)
            raw = Path(metadata["jsonPath"]).read_bytes()
            saved = json.loads(raw)
            db_sha = storage.get_db_connection(directory).execute("SELECT sha256 FROM operations").fetchone()[0]
            actual_sha = hashlib.sha256(raw).hexdigest()
            clean_record = {k: v for k, v in saved.items() if k not in ("sha256", "reference")}
            assert metadata["sha256"] != actual_sha
            assert saved["sha256"] != actual_sha
            assert saved["sha256"] != metadata["sha256"]
            assert metadata["sha256"] == db_sha
            assert canonical_hash(saved["artifact"]) != metadata["sha256"]
            assert hashlib.sha256(json.dumps(clean_record, indent=2).encode()).hexdigest() == metadata["sha256"]
            observations["hash_contract"] = {
                "returned_equals_db": True, "returned_equals_file": False,
                "embedded_equals_file": False, "returned_equals_embedded": False,
                "returned_equals_initial_record_json_without_reference": True,
                "returned_equals_domain_artifact_canonical_hash": False,
            }
            wrong_ref = {"operationId": metadata["operationId"], "sha256": "0" * 64}
            resolved, _ = storage.resolve_references_with_fallback("generate_personas", {"references": [wrong_ref]},
                                                                  session_id="alpha", state_dir=directory)
            assert resolved["references"][0]["sha256"] != "0" * 64
            assert storage.find_latest_artifact(["prepare_discovery"], "beta", directory)["sessionId"] == "alpha"
            observations["reference_resolution"] = {"wrong_explicit_sha_overwritten": True, "empty_beta_scope_returns_alpha": True}
            with patch.object(storage, "check_artifact_safety_with_jev",
                              return_value={"evaluated": True, "passed": False, "contains_secrets": True}):
                unsafe = storage.save_operation("prepare_discovery", deepcopy(clean_record), state_dir=directory)
            persisted = json.loads(Path(unsafe["jsonPath"]).read_text())
            assert persisted["artifactSafety"]["passed"] is False
            observations["negative_safety_verdict"] = {"json_still_saved": True, "markdown_still_saved": Path(unsafe["mdPath"]).exists()}

        with tempfile.TemporaryDirectory(prefix="axwise-probe-config-") as temporary:
            config = Path(temporary) / "config.json"
            config.write_text(json.dumps({"version": 1, "provider": "openai-compatible",
                "baseUrl": "http://127.0.0.1:12345/v1", "allowLoopback": True,
                "model": "configured-fixture-model", "apiKeyEnv": "PROBE_CUSTOM_KEY",
                "stateDir": str(Path(temporary) / "configured-state"), "profileId": "fixture-profile",
                "workspaceId": "fixture-workspace", "sessionId": "fixture-session"}))
            with patch.dict(os.environ, {"AXWISE_CONFIG": str(config), "PROBE_CUSTOM_KEY": "fixture-not-a-credential"}, clear=True), \
                 patch.object(provider, "get_cached_model", return_value=None):
                chosen = provider.ModelProvider()
                assert chosen.provider_type == "gemini" and chosen.model == "gemini-flash-latest" and not chosen.api_key
                observations["config_provider_ignored"] = {"provider": chosen.provider_type, "model": chosen.model, "configured_key_used": False}
            with patch.dict(os.environ, {"AXWISE_PROVIDER": "openai", "AXWISE_MODEL": "environment-fixture-model",
                                        "AXWISE_API_KEY": "fixture-not-a-credential",
                                        "AXWISE_BASE_URL": "http://127.0.0.1:12345/v1"}, clear=True):
                chosen = provider.ModelProvider()
                assert chosen.model == "environment-fixture-model" and chosen.provider_type == "openai"
                assert chosen.base_url == "http://127.0.0.1:12345/v1"
                observations["positive_control_provider_environment"] = {"explicit_environment_config_honored": True}
            launcher = load_file_module("axwise_probe_launcher", ROOT / "packages/axwise-distribution/launcher.py")
            fake_mcp = SimpleNamespace(mcp=SimpleNamespace(run=lambda **kwargs: None))
            with patch.dict(sys.modules, {"backend.services.local_axwise.fastmcp_server": fake_mcp}), \
                 patch.dict(os.environ, {}, clear=True):
                launcher.main(["--config", str(config)])
                assert os.environ["AXWISE_CONFIG"] == str(config)
                assert "AXWISE_STATE_DIR" not in os.environ
                observations["launcher_config"] = {"config_path_forwarded_as_unused_env": True, "configured_state_dir_applied": False}
                launcher.main(["--state-dir", str(Path(temporary) / "cli-state")])
                assert os.environ["AXWISE_STATE_DIR"] == str(Path(temporary) / "cli-state")
                observations["positive_control_launcher_state_flag"] = {"explicit_state_dir_flag_honored": True}

        sys.path.insert(0, str(ROOT / "packages/axwise-distribution"))
        import build as distribution_build
        entries = distribution_build.wheel_payload(ROOT)
        assert any(name.endswith("/storage.py") for name in entries)
        assert not any(name.endswith("/typesafe_triage.py") for name in entries)
        observations["wheel_allowlist"] = {"storage_secret_checker_included": True, "typesafe_triage_module_included": False}
        # Import the exported engine outside the repository. This is an export-boundary
        # check using installed dependencies, not a fresh dependency/install smoke test.
        with tempfile.TemporaryDirectory(prefix="axwise-probe-wheel-") as temporary:
            exported = Path(temporary) / "kernel"
            prefix = "axwise_extension/kernel/"
            for name, content in entries.items():
                if name.startswith(prefix):
                    destination = exported / name.removeprefix(prefix)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(content)
            child_code = '''
import json,socket
from unittest.mock import patch
with patch("dotenv.load_dotenv",return_value=False), patch.object(socket.socket,"connect",side_effect=AssertionError("Network forbidden")):
 from backend.services.local_axwise import engine
 print(json.dumps({"engine_file":engine.__file__,"jev_available":engine.is_typesafe_available(),"jev_function_missing":engine.validate_deliverable_with_jev is None}))
'''
            child = subprocess.run([sys.executable, "-c", child_code], cwd=temporary,
                                   env={"PYTHONPATH": str(exported), "TYPESAFE_API_KEY": "offline-fixture-not-a-key"},
                                   capture_output=True, text=True, check=True)
            imported = json.loads(child.stdout)
            assert imported["engine_file"].startswith(str(exported))
            assert imported["jev_available"] is False and imported["jev_function_missing"] is True
            observations["exported_engine_import"] = {"isolated_export_imports": True, "jev_available_with_dummy_configured_key": False,
                                                      "jev_review_function_is_none": True}
    print(json.dumps(observations, indent=2))


if __name__ == "__main__":
    main()
