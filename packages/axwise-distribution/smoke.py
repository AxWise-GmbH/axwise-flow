#!/usr/bin/env python3
"""Fresh-directory launcher checks. Network is only for dependency installation."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

from build import WHEEL_NAME, NPM_FILENAME

EXPECTED = {"create_prd", "analyze_interviews", "simulate_interviews", "prepare_discovery",
            "generate_personas", "chat_with_persona", "research_market", "create_delivery_brief"}


def run(command, *, env, cwd, input=None, timeout=180):
    started = time.monotonic()
    completed = subprocess.run(command, env=env, cwd=cwd, input=input, capture_output=True,
                               text=True, timeout=timeout)
    if completed.returncode:
        # No configured real provider key or input exists in this smoke process.
        raise RuntimeError(f"Command failed ({completed.returncode}): {command[0]}\n{completed.stderr[-4000:]}")
    return completed, round((time.monotonic() - started) * 1000)


def mcp_check(command, env, work):
    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "axwise-install-smoke", "version": "1"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ]
    result, elapsed = run(command, env=env, cwd=work,
                          input="".join(json.dumps(request) + "\n" for request in requests))
    replies = {reply.get("id"): reply for reply in map(json.loads, result.stdout.splitlines())}
    assert "result" in replies[1], replies
    assert replies[1]["result"]["serverInfo"] == {"name": "axwise-extension", "version": "0.3.0"}
    tools = replies[2]["result"]["tools"]
    assert {tool["name"] for tool in tools} == EXPECTED
    assert len(tools) == 8
    assert not any("orqaly" in tool["description"].lower() for tool in tools)
    return {"elapsedMs": elapsed, "toolCount": len(tools), "server": replies[1]["result"]["serverInfo"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--work", type=Path, required=True)
    args = parser.parse_args()
    if not args.artifacts.is_absolute() or not args.work.is_absolute() or args.work.exists():
        parser.error("artifacts must be absolute and work must be an absolute new directory")
    wheel, npm = args.artifacts / WHEEL_NAME, args.artifacts / NPM_FILENAME
    if not wheel.is_file() or not npm.is_file():
        parser.error("wheel and npm archive must exist")
    for executable in ("uvx", "node", "npm", "npx"):
        if not shutil.which(executable):
            parser.error(f"{executable} is required on PATH")
    args.work.mkdir(mode=0o700)
    config = args.work / "config.json"
    config.write_text(json.dumps({"version": 1, "provider": "gemini",
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model": "gemini-3.8-flash", "apiKeyEnv": "AXWISE_INSTALL_SMOKE_UNUSED_KEY",
        "profileId": "install-smoke", "workspaceId": "fresh-install", "sessionId": "stdio-list",
        "stateDir": str(args.work / "state")}, indent=2) + "\n")
    config.chmod(0o600)
    env = dict(os.environ)
    env.pop("AXWISE_INSTALL_SMOKE_UNUSED_KEY", None)
    env["AXWISE_NODE"] = str(Path(shutil.which("node")).resolve())
    env["UV_CACHE_DIR"] = str(args.work / "uv-cache")
    env["UV_TOOL_DIR"] = str(args.work / "uv-tools")
    env["UV_TOOL_BIN_DIR"] = str(args.work / "uv-bin")
    env["UV_PYTHON_INSTALL_DIR"] = str(args.work / "uv-python")
    env["npm_config_cache"] = str(args.work / "npm-cache")
    command = ["uvx", "--from", str(wheel), "axwise", "--config", str(config)]
    cold_uv = mcp_check(command, env, args.work)
    warm_uv = mcp_check(command, env, args.work)
    npm_prefix = args.work / "npm-install"
    _, npm_install_ms = run(["npm", "install", "--prefix", str(npm_prefix), "--ignore-scripts",
        "--no-audit", "--no-fund", str(npm)], env=env, cwd=args.work)
    # Separate fresh uv cache ensures the npm launcher independently installs
    # its bundled wheel instead of accidentally reusing the direct-wheel env.
    env["UV_CACHE_DIR"] = str(args.work / "npm-uv-cache")
    npm_command = [str(npm_prefix / "node_modules/.bin/axwise"), "--config", str(config)]
    cold_npm = mcp_check(npm_command, env, args.work)
    warm_npm = mcp_check(npm_command, env, args.work)
    env["UV_CACHE_DIR"] = str(args.work / "npx-uv-cache")
    npx_command = ["npx", "--yes", f"--package={npm}", "axwise", "--config", str(config)]
    cold_npx = mcp_check(npx_command, env, args.work)
    warm_npx = mcp_check(npx_command, env, args.work)
    result = {"kind": "initialize-and-list-only-no-inference", "uvCold": cold_uv, "uvWarm": warm_uv,
        "npmInstallMs": npm_install_ms, "npmCold": cold_npm, "npmWarm": warm_npm,
        "npxCold": cold_npx, "npxWarm": warm_npx,
        "artifacts": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (wheel, npm)}}
    (args.work / "smoke-result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
