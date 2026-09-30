"""Public launch configuration, credential precedence and scope regression tests."""
import asyncio
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from backend.services.local_axwise.configuration import (
    ConfigurationError, load_runtime_configuration, read_standalone_config,
    validate_standalone_config,
)
from backend.services.local_axwise.provider import ModelProvider, ProviderError


class PublicConfigTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="axwise-config-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.config = {
            "version": 1, "provider": "openai-compatible", "model": "local-test-model",
            "baseUrl": "http://127.0.0.1:9876/v1", "allowLoopback": True,
            "apiKeyEnv": "AXWISE_TEST_CONFIG_KEY", "stateDir": str(self.root / "state"),
            "profileId": "personal", "workspaceId": "project-a", "sessionId": "research-1",
            "providerTimeoutMs": 12_000,
        }
        self.path = self.root / "config.json"
        self.path.write_text(json.dumps(self.config))

    def test_legacy_configuration_is_validated_and_key_is_deferred(self):
        with patch.dict(os.environ, {"AXWISE_PROVIDER": "gemini", "AXWISE_MODEL": "wrong-model",
                                    "AXWISE_BASE_URL": "https://wrong.example", "AXWISE_API_KEY": "wrong-key"}, clear=True), \
                patch("backend.services.local_axwise.provider.discover_local_credentials", side_effect=AssertionError("discovery")):
            loaded = load_runtime_configuration(self.path)
            with self.assertRaisesRegex(ConfigurationError, "AXWISE_TEST_CONFIG_KEY"):
                loaded.create_provider()
            os.environ["AXWISE_TEST_CONFIG_KEY"] = "dummy-configured-key"
            provider = loaded.create_provider()
            self.assertEqual((provider.provider_type, provider.model, provider.base_url),
                             ("openai", "local-test-model", "http://127.0.0.1:9876/v1"))
            self.assertEqual(provider.timeout_seconds, 12)
            self.assertEqual(provider.api_key, "dummy-configured-key")
        self.assertEqual(loaded.state_dir, self.root / "state")

    def test_configured_provider_sends_named_key_and_model_to_mock_http(self):
        requests = []
        def handle(request):
            requests.append(request)
            return httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}], "usage": {"prompt_tokens": 2}})
        actual_async_client = httpx.AsyncClient
        def client(**kwargs):
            return actual_async_client(transport=httpx.MockTransport(handle), **kwargs)
        with patch.dict(os.environ, {"AXWISE_TEST_CONFIG_KEY": "dummy-selected-key", "GEMINI_API_KEY": "dummy-other-key"}, clear=True), \
                patch("backend.services.local_axwise.provider.httpx.AsyncClient", side_effect=client), \
                patch("backend.services.local_axwise.provider.discover_local_credentials", side_effect=AssertionError("discovery")):
            provider = load_runtime_configuration(self.path).create_provider()
            self.assertEqual(asyncio.run(provider.complete("system", "user"))[0], "{}")
        self.assertEqual(len(requests), 1)
        self.assertEqual(str(requests[0].url), "http://127.0.0.1:9876/v1/chat/completions")
        self.assertEqual(requests[0].headers["authorization"], "Bearer dummy-selected-key")
        self.assertEqual(json.loads(requests[0].content)["model"], "local-test-model")

    def test_state_override_then_json_then_environment(self):
        env = {"AXWISE_CONFIG": str(self.path), "AXWISE_STATE_DIR": str(self.root / "environment")}
        loaded = load_runtime_configuration(environ=env)
        self.assertEqual(loaded.state_dir, self.root / "state")
        overridden = load_runtime_configuration(state_dir=self.root / "cli", environ=env)
        self.assertEqual(overridden.state_dir, self.root / "cli")
        self.assertEqual(overridden.scope_id, loaded.scope_id)
        self.assertEqual(load_runtime_configuration(environ={"AXWISE_STATE_DIR": str(self.root / "environment")}).state_dir,
                         self.root / "environment")

    def test_scope_survives_reconnect_and_changes_for_every_identity_dimension(self):
        original = load_runtime_configuration(self.path)
        self.assertEqual(original.scope_id, load_runtime_configuration(self.path).scope_id)
        for field in ("profileId", "workspaceId", "sessionId"):
            self.path.write_text(json.dumps({**self.config, field: "different"}))
            self.assertNotEqual(original.scope_id, load_runtime_configuration(self.path).scope_id)
        self.path.write_text(json.dumps({**self.config, "model": "different-model"}))
        self.assertEqual(original.scope_id, load_runtime_configuration(self.path).scope_id)

    def test_zero_config_workspace_comes_from_stable_launch_directory(self):
        a = load_runtime_configuration(environ={}, cwd=self.root / "project-a")
        same = load_runtime_configuration(environ={}, cwd=self.root / "project-a")
        b = load_runtime_configuration(environ={}, cwd=self.root / "project-b")
        self.assertEqual(a.scope_id, same.scope_id)
        self.assertNotEqual(a.scope_id, b.scope_id)
        self.assertNotEqual(a.scope_id, "default")
        configured = load_runtime_configuration(environ={"AXWISE_WORKSPACE_ID": "shared"}, cwd=self.root / "project-a")
        self.assertEqual(configured.scope_id, load_runtime_configuration(environ={"AXWISE_WORKSPACE_ID": "shared"}, cwd=self.root / "project-b").scope_id)

    def test_missing_malformed_unknown_fields_and_bad_values_fail_without_echoing_secrets(self):
        with self.assertRaises(ConfigurationError):
            read_standalone_config(self.root / "missing.json")
        self.path.write_text('{"dummy-secret":')
        with self.assertRaises(ConfigurationError) as caught:
            read_standalone_config(self.path)
        self.assertNotIn("dummy-secret", str(caught.exception))
        invalid = [{**self.config, "apiKey": "dummy-secret"}, {**self.config, "provider": "typo"},
                   {**self.config, "sessionId": "../project"}, {**self.config, "stateDir": "relative"},
                   {**self.config, "providerTimeoutMs": True}, {**self.config, "allowLoopback": False},
                   {**self.config, "baseUrl": "https://user:dummy-secret@example.com/v1"},
                   {**self.config, "baseUrl": "https://example.com/v1?key=dummy-secret"}]
        for config in invalid:
            with self.subTest(config=config), self.assertRaises(ConfigurationError) as caught:
                validate_standalone_config(config)
            self.assertNotIn("dummy-secret", str(caught.exception))

    def test_environment_provider_wins_over_discovery_and_axwise_model_wins(self):
        with patch.dict(os.environ, {"AXWISE_PROVIDER": "openai", "AXWISE_MODEL": "explicit-env-model", "OPENAI_MODEL": "other-model"}, clear=True), \
                patch("backend.services.local_axwise.provider.discover_local_credentials", return_value={"GEMINI_API_KEY": "dummy-gemini", "OPENAI_API_KEY": "dummy-openai"}):
            provider = ModelProvider()
        self.assertEqual((provider.provider_type, provider.model, provider.api_key),
                         ("openai", "explicit-env-model", "dummy-openai"))


class WrapperScopeTests(unittest.IsolatedAsyncioTestCase):
    async def test_every_tool_and_pipeline_lookup_use_one_host_owned_scope(self):
        from backend.services.local_axwise import fastmcp_server as server
        config = load_runtime_configuration(environ={"AXWISE_WORKSPACE_ID": "wrapper-test"})
        fake_provider = object()
        execute = AsyncMock(return_value={"content": "Generated artifact"})
        calls = [
            (server.prepare_discovery, {"brief": "test"}), (server.research_market, {"brief": "test"}),
            (server.generate_personas, {}), (server.simulate_interviews, {}),
            (server.chat_with_persona, {"personaId": "p1", "message": "test"}),
            (server.analyze_interviews, {"decisionQuestion": "test"}),
            (server.create_prd, {"brief": "test"}), (server.create_delivery_brief, {}),
            (server.run_full_discovery, {"brief": "test", "include_delivery_brief": True}),
        ]
        with patch.object(server, "_runtime_configuration", config), patch.object(server, "_provider", fake_provider), \
                patch.object(server, "execute_tool", execute), \
                patch("backend.services.local_axwise.storage.find_latest_artifact", return_value=None) as latest:
            for function, arguments in calls:
                await function(**arguments)
        self.assertEqual(execute.await_count, 14)
        for call in execute.await_args_list:
            self.assertEqual(call.kwargs, {"session_id": config.scope_id, "provider": fake_provider, "state_dir": config.state_dir})
        latest.assert_called_once_with(["prepare_discovery"], session_id=config.scope_id, state_dir=config.state_dir)


if __name__ == "__main__":
    unittest.main()
