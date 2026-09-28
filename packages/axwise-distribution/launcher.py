"""Launch the bundled FastMCP runtime; supports zero-config discovery or legacy config files."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

VERSION = "0.4.0"


def main(argv=None):
    parser = argparse.ArgumentParser(description="AxWise: scoped local discovery FastMCP extension.")
    parser.add_argument("--version", action="version", version=f"AxWise {VERSION}")
    parser.add_argument("--config", required=False, default=None, help="Optional path to a BYOK configuration JSON file.")
    parser.add_argument("--transport", default="stdio", choices=["stdio", "sse"], help="MCP transport mode.")
    parser.add_argument("--state-dir", default=None, help="Directory to store SQLite database and artifacts.")
    options = parser.parse_args(argv)

    bundle = Path(__file__).resolve().parent
    kernel_root = bundle / "kernel"
    if str(kernel_root) not in sys.path:
        sys.path.insert(0, str(kernel_root))

    if options.config:
        os.environ["AXWISE_CONFIG"] = options.config
    if options.state_dir:
        os.environ["AXWISE_STATE_DIR"] = options.state_dir

    from backend.services.local_axwise.fastmcp_server import mcp
    mcp.run(transport=options.transport)


if __name__ == "__main__":
    main()
