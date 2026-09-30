import base64
import csv
from email.parser import BytesParser
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from build import build_release, SOURCE_FILES, WHEEL_NAME, NPM_FILENAME, SDIST_FILENAME, DEPENDENCIES
from manifest import VERSION


class DistributionTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="axwise-dist-test-")
        self.base = Path(self.temporary.name)
        self.root = self.base / "checkout"
        for name in SOURCE_FILES:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((name + "\n").encode())
        (self.root / "backend/services/local_axwise/requirements.txt").write_text("\n".join(DEPENDENCIES))
        (self.root / ".env").write_text("DO_NOT_EXPORT_PRIVATE_KEY")
        (self.root / "private-server.py").write_text("DO_NOT_EXPORT_BACKEND")
        (self.root / ".git").mkdir()
        (self.root / ".git/config").write_text("DO_NOT_EXPORT_GIT")

    def tearDown(self):
        self.temporary.cleanup()

    def test_reproducible_and_identical_bundled_wheel(self):
        first = self.base / "first"
        second = self.base / "second"
        self.assertEqual(build_release(self.root, first), build_release(self.root, second))
        rebuilt = self.base / "from-export"
        self.assertEqual(build_release(first / "source", rebuilt), build_release(self.root, self.base / "third"))
        for artifact in (first / "artifacts").iterdir():
            self.assertEqual(artifact.read_bytes(), (second / "artifacts" / artifact.name).read_bytes())
            self.assertEqual(artifact.read_bytes(), (rebuilt / "artifacts" / artifact.name).read_bytes())
        with tarfile.open(first / "artifacts" / NPM_FILENAME) as archive:
            self.assertEqual(archive.extractfile("package/vendor/" + WHEEL_NAME).read(),
                             (first / "artifacts" / WHEEL_NAME).read_bytes())
            manifest = json.load(archive.extractfile("package/package.json"))
            self.assertNotIn("scripts", manifest)

    def test_export_boundary_and_record_hashes(self):
        output = self.base / "release"
        build_release(self.root, output)
        self.assertFalse((output / "source/.git").exists())
        self.assertFalse((output / "source/.env").exists())
        self.assertFalse((output / "source/private-server.py").exists())
        with zipfile.ZipFile(output / "artifacts" / WHEEL_NAME) as archive:
            self.assertFalse(any("test" in name or "connector" in name for name in archive.namelist()))
            records = csv.reader(io.StringIO(archive.read(f"axwise_extension-{VERSION}.dist-info/RECORD").decode()))
            for name, checksum, size in records:
                if not checksum:
                    self.assertTrue(name.endswith("/RECORD"))
                    continue
                data = archive.read(name)
                expected = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
                self.assertEqual(checksum, "sha256=" + expected)
                self.assertEqual(int(size), len(data))

    def test_source_distribution_contains_standard_metadata(self):
        output = self.base / "sdist"
        build_release(self.root, output)
        with tarfile.open(output / "artifacts" / SDIST_FILENAME, "r:gz") as archive:
            prefix = f"axwise_extension-{VERSION}/"
            metadata = BytesParser().parsebytes(archive.extractfile(prefix + "PKG-INFO").read())
            self.assertEqual(metadata["Metadata-Version"], "2.4")
            self.assertEqual(metadata["Name"], "axwise-extension")
            self.assertEqual(metadata["Version"], VERSION)
            self.assertEqual(metadata["License-File"], "LICENSE")
            self.assertIn(prefix + "LICENSE", archive.getnames())
            self.assertIn(prefix + "pyproject.toml", archive.getnames())

    def test_symlink_file_and_parent_rejected(self):
        selected = self.root / SOURCE_FILES[0]
        selected.unlink()
        selected.symlink_to(self.root / ".env")
        with self.assertRaisesRegex(ValueError, "symlink"):
            build_release(self.root, self.base / "bad")
        self.assertFalse((self.base / "bad").exists())

    def test_nonempty_output_and_inside_source_rejected(self):
        with self.assertRaises(ValueError):
            build_release(self.root, self.root / "output")
        with self.assertRaises(ValueError):
            build_release(self.root, self.root)
        with self.assertRaises(ValueError):
            build_release("relative", self.base / "release")

    def test_changed_pins_rejected(self):
        (self.root / "backend/services/local_axwise/requirements.txt").write_text("pydantic==0.0.0")
        with self.assertRaisesRegex(ValueError, "pins"):
            build_release(self.root, self.base / "release")

    def test_missing_file_rejected_before_output_creation(self):
        (self.root / SOURCE_FILES[0]).unlink()
        with self.assertRaisesRegex(ValueError, "Missing"):
            build_release(self.root, self.base / "release")
        self.assertFalse((self.base / "release").exists())

    def test_suspicious_literals_fail_without_printing_values(self):
        suspicious = ("sk_" + "live_" + "x" * 24, "https://private-example" + ".run.app/")
        for index, value in enumerate(suspicious):
            (self.root / SOURCE_FILES[0]).write_text(value)
            with self.assertRaisesRegex(ValueError, "requires review") as caught:
                build_release(self.root, self.base / f"suspect-{index}")
            self.assertNotIn(value, str(caught.exception))
            self.assertFalse((self.base / f"suspect-{index}").exists())

    def test_version_does_not_import_runtime_or_require_node(self):
        from launcher import main
        with patch("builtins.print") as output, self.assertRaises(SystemExit) as exited:
            main(["--version"])
        self.assertEqual(exited.exception.code, 0)


class ExportedRuntimeTest(unittest.TestCase):
    def test_real_export_runs_without_checkout_or_network(self):
        """Use real shipped files, with fake inference through the public wrapper."""
        root = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory(prefix="axwise-export-runtime-") as temporary:
            work = Path(temporary)
            release = work / "release"
            build_release(root, release)
            wheel_root = work / "installed"
            with zipfile.ZipFile(release / "artifacts" / WHEEL_NAME) as archive:
                archive.extractall(wheel_root)
            config = {
                "version": 1, "provider": "openai-compatible", "model": "test-model",
                "baseUrl": "http://127.0.0.1:9876/v1", "allowLoopback": True,
                "apiKeyEnv": "AXWISE_EXPORT_TEST_KEY", "stateDir": str(work / "state"),
                "profileId": "test-profile", "workspaceId": "test-project", "sessionId": "test-session",
            }
            config_path = work / "config.json"
            config_path.write_text(json.dumps(config))
            script = r'''
import asyncio, json, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
from axwise_extension import cli

async def verify():
    from backend.services.local_axwise import fastmcp_server as server
    from backend.services.local_axwise.provider import ModelProvider
    from backend.services.local_axwise.storage import find_latest_artifact
    from backend.services.workflow_v2.cognitive.typesafe_triage import validate_deliverable_with_jev
    assert callable(validate_deliverable_with_jev)
    assert Path(server.__file__).resolve().is_relative_to(Path(sys.argv[1]).resolve())
    settings = server.runtime_configuration()
    names = {tool.name for tool in await server.mcp.list_tools()}
    assert len(names) == 9 and 'run_full_discovery' in names
    async def fake_complete(self, system_prompt, user_prompt, response_schema=None, max_output_tokens=4096):
        assert self.provider_type == 'openai' and self.model == 'test-model'
        assert self.base_url == 'http://127.0.0.1:9876/v1' and self.api_key == 'dummy-export-key'
        request = json.loads(user_prompt)
        candidate = {'title': 'Exported PRD', 'sections': [
            {'heading': heading, 'items': [{'text': 'Propose a one-week pilot; the product owner reviews copying time before expanding scope.', 'basis': 'proposal', 'sourceIds': []}]}
            for heading in request['requiredSections']]}
        return json.dumps(candidate), {'inputTokens': 10, 'outputTokens': 20}
    with patch.object(ModelProvider, 'complete', fake_complete), patch('backend.services.local_axwise.provider.discover_local_credentials', side_effect=AssertionError('unexpected discovery')):
        rendered = await server.create_prd(brief='A shared handoff tracker. Draft a provisional PRD.')
    assert 'Exported PRD' in rendered
    artifact = find_latest_artifact(['create_prd'], session_id=settings.scope_id, state_dir=settings.state_dir)
    assert artifact and (settings.state_dir / 'axwise.db').is_file()
    assert list(settings.state_dir.rglob('*.md'))
    print(json.dumps({'tools': len(names), 'scopedArtifact': True, 'jevImport': True}))

def fake_run(self, **kwargs):
    assert kwargs == {'transport': 'stdio'}
    asyncio.run(verify())

# cli imports its bundled kernel before FastMCP; intercept the transport only.
sys.path.insert(0, str(Path(sys.argv[1]) / 'axwise_extension' / 'kernel'))
with patch('mcp.server.fastmcp.FastMCP.run', fake_run), patch('socket.socket.connect', side_effect=AssertionError('network is forbidden')):
    cli.main(['--config', sys.argv[2]])
'''
            # No checkout path, real secrets, or local dotenv/keychain discovery.
            env = {"PATH": os.environ.get("PATH", ""), "HOME": str(work),
                   "AXWISE_EXPORT_TEST_KEY": "dummy-export-key"}
            result = subprocess.run([sys.executable, "-I", "-c", script, str(wheel_root), str(config_path)],
                                    cwd=work, env=env, text=True, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), {"tools": 9, "scopedArtifact": True, "jevImport": True})
            # Exercise the real FastMCP stdio initialize/list protocol too.
            # Tool discovery requires neither a configured key nor a provider.
            from smoke import mcp_check
            env.pop("AXWISE_EXPORT_TEST_KEY")
            launch = "import sys; sys.path.insert(0, sys.argv[1]); from axwise_extension.cli import main; main(['--config', sys.argv[2]])"
            protocol = mcp_check([sys.executable, "-I", "-c", launch, str(wheel_root), str(config_path)], env, work)
            self.assertEqual(protocol["toolCount"], 9)


if __name__ == "__main__":
    unittest.main()
