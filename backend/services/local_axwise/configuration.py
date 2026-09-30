"""Validated launch configuration and stable local artifact scope for FastMCP.

Configuration contains names of credential environment variables, never secrets.
Explicit config does not participate in automatic credential discovery.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from typing import Mapping
from urllib.parse import urlsplit


class ConfigurationError(ValueError):
    """Invalid local launch configuration (messages must not contain values)."""


_ID = re.compile(r"[A-Za-z0-9_-]{1,128}\Z")
_MODEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}\Z")
_ENV = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,127}\Z")
_FIELDS = {"version", "provider", "model", "baseUrl", "apiKeyEnv", "allowLoopback",
           "stateDir", "profileId", "workspaceId", "sessionId", "providerTimeoutMs"}


def validate_base_url(value: object, *, allow_loopback: bool = False) -> str:
    if (not isinstance(value, str) or len(value) > 2048 or not value
            or re.search(r"[\\\s?#%]", value)):
        raise ConfigurationError("Invalid baseUrl: use HTTPS without credentials, query, or fragment.")
    try:
        url = urlsplit(value)
        port = url.port  # Also validate malformed ports.
        del port
        if (url.username or url.password or not url.hostname
                or url.scheme not in ("http", "https")
                or (url.scheme == "http" and not (allow_loopback and url.hostname in ("127.0.0.1", "::1")))
                or any(part in (".", "..") for part in url.path.split("/"))
                or (url.path and not re.fullmatch(r"/(?:[A-Za-z0-9._~-]+/?)*", url.path))):
            raise ValueError
    except ValueError:
        raise ConfigurationError("Invalid baseUrl: HTTP requires allowLoopback and a loopback IP.") from None
    return value.rstrip("/")


def validate_standalone_config(value: object) -> dict:
    if not isinstance(value, dict) or set(value) - _FIELDS:
        raise ConfigurationError("Configuration must be a JSON object with supported configuration fields.")
    if type(value.get("version")) is not int or value["version"] != 1:
        raise ConfigurationError("Configuration version must be 1.")
    if value.get("provider") not in ("gemini", "openai-compatible", "openai", "anthropic", "claude"):
        raise ConfigurationError("Unsupported provider; use gemini, openai-compatible, openai, or anthropic.")
    for field, pattern in (("model", _MODEL), ("apiKeyEnv", _ENV),
                           ("profileId", _ID), ("workspaceId", _ID), ("sessionId", _ID)):
        if not isinstance(value.get(field), str) or not pattern.fullmatch(value[field]):
            raise ConfigurationError(f"Invalid or missing {field} in configuration.")
    state_dir = value.get("stateDir")
    if not isinstance(state_dir, str) or "\0" in state_dir or not Path(state_dir).is_absolute():
        raise ConfigurationError("Configuration stateDir must be an absolute path.")
    allow_loopback = value.get("allowLoopback", False)
    timeout = value.get("providerTimeoutMs", 90_000)
    if type(allow_loopback) is not bool:
        raise ConfigurationError("allowLoopback must be a boolean.")
    if type(timeout) is not int or not 1 <= timeout <= 180_000:
        raise ConfigurationError("providerTimeoutMs must be an integer from 1 to 180000.")
    return {**value, "baseUrl": validate_base_url(value.get("baseUrl"), allow_loopback=allow_loopback),
            "allowLoopback": allow_loopback, "providerTimeoutMs": timeout}


def read_standalone_config(path: str | Path) -> dict:
    """Read one bounded regular file without following a final-component symlink."""
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        with os.fdopen(os.open(path, flags), "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= 16_384:
                raise ConfigurationError("Configuration must be a regular JSON file of at most 16 KiB.")
            raw = stream.read(16_385)
        if len(raw) > 16_384:
            raise ConfigurationError("Configuration exceeds 16 KiB.")
        value = json.loads(raw)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        if isinstance(error, ConfigurationError):
            raise
        raise ConfigurationError("Cannot read configuration: provide an existing regular UTF-8 JSON file.") from None
    return validate_standalone_config(value)


@dataclass(frozen=True)
class RuntimeConfiguration:
    state_dir: Path
    profile_id: str
    workspace_id: str
    session_id: str
    provider_type: str | None = None
    base_url: str | None = None
    model: str | None = None
    api_key_env: str | None = None
    timeout_seconds: float = 90.0
    explicit_config: bool = False

    @property
    def scope_id(self) -> str:
        # Separate from the MCP connection, so reconnects retain the scope.
        identity = ["axwise.fastmcp-scope.v1", self.profile_id, self.workspace_id, self.session_id]
        return "scope-" + hashlib.sha256(json.dumps(identity, separators=(",", ":")).encode()).hexdigest()

    def create_provider(self):
        from backend.services.local_axwise.provider import ModelProvider
        # Called lazily by the first tool operation, before the engine's generic
        # provider-error sanitization, so a missing named key stays actionable.
        if self.api_key_env and not os.environ.get(self.api_key_env, "").strip():
            raise ConfigurationError(f"Configured credential environment variable {self.api_key_env} is missing or empty.")
        return ModelProvider(provider_type=self.provider_type, base_url=self.base_url,
                             model=self.model, api_key_env=self.api_key_env,
                             timeout_seconds=self.timeout_seconds, state_dir=self.state_dir,
                             discover_credentials=not self.explicit_config)


def load_runtime_configuration(config_path: str | Path | None = None, *,
                               state_dir: str | Path | None = None,
                               environ: Mapping[str, str] | None = None,
                               cwd: Path | None = None) -> RuntimeConfiguration:
    """Precedence: CLI state override, explicit JSON, environment, discovery.

    The launch directory supplies the default workspace identity. Hosts launched
    from a shared directory must provide AXWISE_WORKSPACE_ID or an explicit file.
    Historical default-session artifacts are never reassigned implicitly.
    """
    env = os.environ if environ is None else environ
    selected_path = config_path or env.get("AXWISE_CONFIG")
    if selected_path:
        config = read_standalone_config(selected_path)
        return RuntimeConfiguration(
            state_dir=Path(state_dir or config["stateDir"]).expanduser().resolve(),
            profile_id=config["profileId"], workspace_id=config["workspaceId"], session_id=config["sessionId"],
            provider_type=config["provider"], base_url=config["baseUrl"], model=config["model"],
            api_key_env=config["apiKeyEnv"], timeout_seconds=config["providerTimeoutMs"] / 1000,
            explicit_config=True,
        )
    launch_dir = (cwd or Path.cwd()).resolve()
    profile = env.get("AXWISE_PROFILE_ID", "personal")
    workspace = env.get("AXWISE_WORKSPACE_ID", "cwd-" + hashlib.sha256(str(launch_dir).encode()).hexdigest())
    session = env.get("AXWISE_SESSION_ID", "main")
    for field, value in (("AXWISE_PROFILE_ID", profile), ("AXWISE_WORKSPACE_ID", workspace), ("AXWISE_SESSION_ID", session)):
        if not _ID.fullmatch(value):
            raise ConfigurationError(f"{field} must contain 1–128 letters, digits, underscores or hyphens.")
    return RuntimeConfiguration(
        state_dir=Path(state_dir or env.get("AXWISE_STATE_DIR") or Path.home() / ".axwise" / "state").expanduser().resolve(),
        profile_id=profile, workspace_id=workspace, session_id=session,
    )
