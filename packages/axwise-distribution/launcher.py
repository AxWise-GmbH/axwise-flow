"""Launch the bundled MCP runtime; no credential discovery or installation here."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

VERSION = "0.3.0"


def node_binary(environ=None):
    environ = os.environ if environ is None else environ
    configured = environ.get("AXWISE_NODE")
    if configured and not Path(configured).is_absolute():
        raise ValueError("AXWISE_NODE must be an absolute trusted Node executable path.")
    node = configured or shutil.which("node")
    if not node:
        raise ValueError("Node.js 22 or newer is required. Install Node or set AXWISE_NODE.")
    try:
        version = subprocess.run([node, "--version"], capture_output=True, text=True,
                                 timeout=10, check=True).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        raise ValueError("Could not run the configured Node executable.") from None
    match = re.fullmatch(r"v(\d+)\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?", version)
    if not match or int(match[1]) < 22:
        raise ValueError("Node.js 22 or newer is required.")
    return node


def main(argv=None):
    parser = argparse.ArgumentParser(description="AxWise: scoped local discovery MCP extension.")
    parser.add_argument("--version", action="version", version=f"AxWise {VERSION}")
    parser.add_argument("--config", required=True, help="Absolute path to a public BYOK configuration JSON file.")
    options = parser.parse_args(argv)
    if not Path(options.config).is_absolute():
        parser.error("--config must be an absolute path")
    try:
        node = node_binary()
    except ValueError as error:
        parser.exit(1, f"{error}\n")
    bundle = Path(__file__).resolve().parent
    command = [node, str(bundle / "runtime" / "standalone.mjs"), "--config", options.config,
               "--python", sys.executable, "--kernel-root", str(bundle / "kernel")]
    # exec preserves stdio, cancellation, exit status and the host's explicit key env.
    os.execv(node, command)


if __name__ == "__main__":
    main()
