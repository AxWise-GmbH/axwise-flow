#!/usr/bin/env python3
"""Export only reviewed files; build deterministic wheel/npm/source artifacts."""
from __future__ import annotations

import argparse
import base64
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import stat
import tarfile
import zipfile

from manifest import (VERSION, DEPENDENCIES, JS_FILES, KERNEL_FILES, DEPENDENCY_FILES,
                      INIT_FILES, SOURCE_FILES, NPM_NAME)

DIST = "packages/axwise-distribution/"
WHEEL_NAME = f"axwise_extension-{VERSION}-py3-none-any.whl"
NPM_FILENAME = f"axwise-extension-{VERSION}.tgz"
SDIST_FILENAME = f"axwise_extension-{VERSION}.tar.gz"
FIXED_DATE = (2020, 1, 1, 0, 0, 0)
SECRET_SHAPES = re.compile(
    rb"AIza[0-9A-Za-z_-]{25,}|\b(?:sk|pk)_(?:live|test)_[0-9A-Za-z]{20,}"
    rb"|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----"
    rb"|github_pat_[0-9A-Za-z_]{20,}|ghp_[0-9A-Za-z]{20,}"
)
DEPLOYMENT_URL = re.compile(rb"https?://[^\s\"'<>]+\.run\.app(?:[/\s\"'<>]|$)")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_selected(root, relative):
    """Reject a symlink at any segment; never follow a file outside the chosen root."""
    path = root
    for part in Path(relative).parts:
        if part in (".", ".."):
            raise ValueError("Invalid allowlist entry")
        path = path / part
        if path.is_symlink():
            raise ValueError(f"Refusing symlink in allowlist: {relative}")
    if not path.is_file():
        raise ValueError(f"Missing allowlisted source: {relative}")
    data = path.read_bytes()
    # Heuristic safety checks supplement (not replace) human review of the
    # allowlist. Report only the filename, never the matched credential value.
    if SECRET_SHAPES.search(data) or DEPLOYMENT_URL.search(data):
        raise ValueError(f"Credential-shaped literal or deployment URL requires review: {relative}")
    return data


def validate_pins(root):
    pins = tuple(line.strip() for line in read_selected(root, "backend/services/local_axwise/requirements.txt").decode().splitlines()
                 if line.strip() and not line.startswith("#"))
    if pins != DEPENDENCIES:
        raise ValueError("Kernel dependency pins changed; review distribution metadata first")


def source_payload(root):
    files = {name: read_selected(root, name) for name in SOURCE_FILES}
    validate_pins(root)
    files["README.md"] = files[DIST + "PUBLIC_README.md"]
    files["pyproject.toml"] = files[DIST + "pyproject.toml"]
    files["axwise.example.json"] = files[DIST + "example.config.json"]
    files[".gitignore"] = b".venv/\nnode_modules/\n__pycache__/\n*.pyc\ndist/\n.env*\n!*.example.json\n"
    # Namespace package in the original source; explicit harmless initializers
    # make the public source and bundled kernel independent of any outer project.
    files["backend/domain/__init__.py"] = b'"""Pure typed AxWise contracts."""\n'
    files["backend/tests/__init__.py"] = b'"""Focused AxWise kernel tests."""\n'
    files["packages/axwise-local/package.json"] = (json.dumps({
        "name": "@axwise/extension-source", "version": VERSION, "private": True,
        "type": "module", "engines": {"node": ">=22"},
        "scripts": {"test": "node --test test/*.test.mjs"},
    }, indent=2) + "\n").encode()
    manifest = {"format": "axwise.source-allowlist.v1", "version": VERSION,
                "files": [{"path": name, "sha256": digest(data), "bytes": len(data)}
                          for name, data in sorted(files.items())]}
    files["SOURCE-MANIFEST.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    return files


def package_metadata(root):
    metadata = ("Metadata-Version: 2.4\nName: axwise-extension\n" + f"Version: {VERSION}\n"
                "Summary: Scoped local product discovery and evidence-to-PRD MCP extension\n"
                "Requires-Python: >=3.11\nLicense-Expression: Apache-2.0\nLicense-File: LICENSE\n"
                "Project-URL: Repository, https://github.com/AxWise-GmbH/axwise-flow\n"
                + "".join(f"Requires-Dist: {pin}\n" for pin in DEPENDENCIES)
                + "Description-Content-Type: text/markdown\n\n")
    return metadata.encode() + read_selected(root, DIST + "PUBLIC_README.md")


def wheel_payload(root):
    validate_pins(root)
    entries = {"axwise_extension/__init__.py": f'__version__ = "{VERSION}"\n'.encode(),
               "axwise_extension/cli.py": read_selected(root, DIST + "launcher.py")}
    for name in JS_FILES:
        entries["axwise_extension/runtime/" + Path(name).name] = read_selected(root, name)
    for name in KERNEL_FILES + DEPENDENCY_FILES + INIT_FILES:
        entries["axwise_extension/kernel/" + name] = read_selected(root, name)
    entries["axwise_extension/kernel/backend/domain/__init__.py"] = b'"""Pure typed AxWise contracts."""\n'
    info = f"axwise_extension-{VERSION}.dist-info"
    entries[f"{info}/METADATA"] = package_metadata(root)
    entries[f"{info}/WHEEL"] = b"Wheel-Version: 1.0\nGenerator: axwise-allowlist-builder\nRoot-Is-Purelib: true\nTag: py3-none-any\n"
    entries[f"{info}/entry_points.txt"] = b"[console_scripts]\naxwise = axwise_extension.cli:main\n"
    entries[f"{info}/licenses/LICENSE"] = read_selected(root, "LICENSE")
    record = io.StringIO(newline="")
    writer = csv.writer(record, lineterminator="\n")
    for name, data in sorted(entries.items()):
        checksum = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=").decode()
        writer.writerow((name, f"sha256={checksum}", len(data)))
    writer.writerow((f"{info}/RECORD", "", ""))
    entries[f"{info}/RECORD"] = record.getvalue().encode()
    return entries


def write_new(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(data)
    path.chmod(mode)


def build_wheel_file(root, output):
    path = output / WHEEL_NAME
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(wheel_payload(root).items()):
            info = zipfile.ZipInfo(name, FIXED_DATE)
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)
    return path


def deterministic_tar(path, entries):
    with path.open("xb") as destination:
        with gzip.GzipFile(filename="", mode="wb", fileobj=destination, mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
                for name, data in sorted(entries.items()):
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = 0o755 if name.endswith("/bin/axwise.mjs") else 0o644
                    info.uid = info.gid = info.mtime = 0
                    info.uname = info.gname = ""
                    archive.addfile(info, io.BytesIO(data))


def build_source_archive(root, output):
    output.mkdir(parents=True, exist_ok=True)
    path = output / SDIST_FILENAME
    files = {**source_payload(root), "PKG-INFO": package_metadata(root)}
    deterministic_tar(path, {f"axwise_extension-{VERSION}/{name}": data
                             for name, data in files.items()})
    return path


def build_npm(root, output, wheel):
    manifest = {"name": NPM_NAME, "version": VERSION, "description": "Scoped local product discovery MCP extension",
                "type": "module", "license": "Apache-2.0", "engines": {"node": ">=22"},
                "bin": {"axwise": "bin/axwise.mjs"}, "files": ["bin", "vendor", "README.md", "LICENSE"],
                "repository": {"type": "git", "url": "https://github.com/AxWise-GmbH/axwise-flow.git"}}
    entries = {"package/package.json": (json.dumps(manifest, indent=2) + "\n").encode(),
               "package/bin/axwise.mjs": read_selected(root, DIST + "npm-cli.mjs"),
               "package/vendor/" + WHEEL_NAME: wheel.read_bytes(),
               "package/README.md": read_selected(root, DIST + "PUBLIC_README.md"),
               "package/LICENSE": read_selected(root, "LICENSE")}
    path = output / NPM_FILENAME
    deterministic_tar(path, entries)
    return path


def build_release(root, output):
    root = Path(root)
    output = Path(output)
    if not root.is_absolute() or not output.is_absolute():
        raise ValueError("Explicit absolute --source-root and --output paths are required")
    root = root.resolve(strict=True)
    if not root.is_dir() or output.is_symlink() or output.exists():
        raise ValueError("Source must be a directory and output must be a new, nonexistent directory")
    if output.resolve().is_relative_to(root):
        raise ValueError("Output must be outside the source checkout")
    files = source_payload(root)  # Validate all inputs before creating any output.
    output.mkdir(mode=0o700, parents=False)
    exported = output / "source"
    for name, data in sorted(files.items()):
        write_new(exported / name, data)
    artifacts = output / "artifacts"
    artifacts.mkdir()
    wheel = build_wheel_file(exported, artifacts)
    npm = build_npm(exported, artifacts, wheel)
    source_archive = build_source_archive(exported, artifacts)
    items = [{"file": path.name, "sha256": digest(path.read_bytes()), "bytes": path.stat().st_size}
             for path in (wheel, npm, source_archive)]
    provenance = {"format": "axwise.release.v1", "version": VERSION,
                  "sourceManifestSha256": digest(files["SOURCE-MANIFEST.json"]),
                  "dependencies": list(DEPENDENCIES), "artifacts": items,
                  "prerequisites": {"python": ">=3.11", "npmLauncher": "Node >=22 and uv (uvx) on PATH"}}
    write_new(artifacts / "release-manifest.json", (json.dumps(provenance, indent=2) + "\n").encode())
    write_new(artifacts / "SHA256SUMS", "".join(f"{item['sha256']}  {item['file']}\n" for item in items).encode())
    return provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--output", required=True, help="New absolute directory outside source; its parent must exist")
    args = parser.parse_args()
    try:
        result = build_release(args.source_root, args.output)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Build failed: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
