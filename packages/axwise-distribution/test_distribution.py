import base64
import csv
from email.parser import BytesParser
import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from build import build_release, SOURCE_FILES, WHEEL_NAME, NPM_FILENAME, SDIST_FILENAME, DEPENDENCIES
from launcher import node_binary


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
            records = csv.reader(io.StringIO(archive.read("axwise_extension-0.3.0.dist-info/RECORD").decode()))
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
            prefix = "axwise_extension-0.3.0/"
            metadata = BytesParser().parsebytes(archive.extractfile(prefix + "PKG-INFO").read())
            self.assertEqual(metadata["Metadata-Version"], "2.4")
            self.assertEqual(metadata["Name"], "axwise-extension")
            self.assertEqual(metadata["Version"], "0.3.0")
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

    def test_node_version_and_absolute_override(self):
        with self.assertRaisesRegex(ValueError, "absolute"):
            node_binary({"AXWISE_NODE": "node"})
        with patch("launcher.subprocess.run") as run:
            run.return_value.stdout = "v22.15.0\n"
            self.assertEqual(node_binary({"AXWISE_NODE": "/trusted/node"}), "/trusted/node")
            run.return_value.stdout = "v20.0.0\n"
            with self.assertRaisesRegex(ValueError, "22"):
                node_binary({"AXWISE_NODE": "/trusted/node"})


if __name__ == "__main__":
    unittest.main()
