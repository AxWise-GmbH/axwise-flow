#!/usr/bin/env python3
"""Build an Augment MCP import JSON using secrets already stored locally.

This script does not print secret values. By default it writes the generated
import file outside the repository at ~/augment-mcp-import.local.json.
"""

import argparse
import json
from pathlib import Path

STATE_PATH = Path.home() / "Library/Application Support/Code/User/globalStorage/augment.vscode-augment/augment-global-state/mcpServers.json"
DEFAULT_OUTPUT = Path.home() / "augment-mcp-import.local.json"
PATH_VALUE = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"


def load_state(path: Path) -> dict:
    data = json.loads(path.read_text())
    if not isinstance(data, list):
        raise ValueError(f"Expected a list in {path}")
    return {item.get("name") or item.get("id"): item for item in data if isinstance(item, dict)}


def env_value(state: dict, server: str, key: str, fallback: str = "") -> str:
    env = state.get(server, {}).get("env")
    return env.get(key, fallback) if isinstance(env, dict) else fallback


def header_value(state: dict, server: str, key: str, fallback: str = "") -> str:
    headers = state.get(server, {}).get("headers")
    return headers.get(key, fallback) if isinstance(headers, dict) else fallback


def server(command: str, args: list[str], env: dict | None = None) -> dict:
    result = {"command": command, "args": args}
    if env:
        result["env"] = env
    return result


def build_import(state: dict) -> dict:
    perplexity_key = env_value(state, "perplexity-ask", "PERPLEXITY_API_KEY", "REPLACE_WITH_YOUR_PERPLEXITY_API_KEY")
    auggie_auth = header_value(state, "auggie", "Authorization", "Bearer REPLACE_WITH_YOUR_AUGGIE_TOKEN")

    return {
        "mcpServers": {
            "cloudrun": server(
                "/opt/homebrew/bin/npx",
                ["-y", "@google-cloud/cloud-run-mcp"],
                {"PATH": PATH_VALUE},
            ),
            "perplexity-ask": server(
                "/opt/homebrew/bin/npx",
                ["-y", "server-perplexity-ask"],
                {"PATH": PATH_VALUE, "PERPLEXITY_API_KEY": perplexity_key},
            ),
            "sequential-thinking": server(
                "/opt/homebrew/bin/npx",
                ["-y", "@modelcontextprotocol/server-sequential-thinking"],
                {"PATH": PATH_VALUE},
            ),
            "gmail-axwise": server(
                "/opt/homebrew/bin/npx",
                ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
                {"PATH": PATH_VALUE, "GMAIL_CREDENTIALS_PATH": "/Users/admin/.gmail-mcp/credentials-axwise.json"},
            ),
            "gmail-personal": server(
                "/opt/homebrew/bin/npx",
                ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
                {"PATH": PATH_VALUE, "GMAIL_CREDENTIALS_PATH": "/Users/admin/.gmail-mcp/credentials-personal.json"},
            ),
            "gmail-iforgez": server(
                "/opt/homebrew/bin/npx",
                ["-y", "@gongrzhe/server-gmail-autoauth-mcp"],
                {"PATH": PATH_VALUE, "GMAIL_CREDENTIALS_PATH": "/Users/admin/.gmail-mcp/credentials-iforgez.json"},
            ),
            "auggie": {
                "type": "http",
                "url": "https://api.augmentcode.com/mcp",
                "headers": {"Authorization": auggie_auth},
            },
            "atlassian-mcp-server": server(
                "/opt/homebrew/bin/npx",
                ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"],
                {"PATH": PATH_VALUE},
            ),
        }
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an Augment MCP import JSON using local secrets without printing them.")
    parser.add_argument("--state", type=Path, default=STATE_PATH, help="Path to Augment local MCP state JSON")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output JSON path")
    args = parser.parse_args()

    state = load_state(args.state)
    output = build_import(state)
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    args.output.chmod(0o600)

    missing = []
    if env_value(state, "perplexity-ask", "PERPLEXITY_API_KEY") == "":
        missing.append("PERPLEXITY_API_KEY")
    if header_value(state, "auggie", "Authorization") == "":
        missing.append("auggie Authorization")

    print(f"Wrote import file: {args.output}")
    print("Secret values were not printed.")
    if missing:
        print("Still needs manual replacement: " + ", ".join(missing))


if __name__ == "__main__":
    main()
