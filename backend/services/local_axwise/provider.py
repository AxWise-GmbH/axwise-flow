"""Zero-config LLM provider adapter with local chat key discovery, dynamic /v1/models resolution, and 24h SQLite caching."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
from typing import Any, Optional
import httpx
from dotenv import load_dotenv

from backend.services.local_axwise.schema_cleaner import inline_local_refs, provider_schema
from backend.services.local_axwise.storage import get_cached_model, set_cached_model

class ProviderError(Exception):
    pass


def discover_local_credentials() -> dict[str, str]:
    """
    Auto-discover LLM API keys from environment, .env files,
    macOS Keychain (Goose secrets), and local Codex auth.
    """
    # Only zero-config discovery reads dotenv files. Importing the provider or
    # using an explicit configuration must not load unrelated credentials.
    load_dotenv(".env")
    load_dotenv(Path.home() / ".env")
    load_dotenv(Path.home() / ".axwise" / ".env")
    found: dict[str, str] = {}

    # 1. Environment variables
    for k in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AXWISE_API_KEY"):
        val = os.environ.get(k)
        if val and val.strip():
            found[k] = val.strip()

    # 2. macOS Keychain (Goose secrets)
    if not (found.get("GEMINI_API_KEY") or found.get("GOOGLE_API_KEY")) or not found.get("OPENAI_API_KEY"):
        try:
            res = subprocess.run(
                ["security", "find-generic-password", "-s", "goose", "-a", "secrets", "-w"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if res.returncode == 0 and res.stdout.strip():
                try:
                    data = json.loads(res.stdout.strip())
                    for k in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
                        if k in data and k not in found:
                            found[k] = str(data[k]).strip()
                except Exception:
                    pass
        except Exception:
            pass

    # 3. Local Codex configuration & auth
    codex_auth = Path.home() / ".codex" / "auth.json"
    if codex_auth.exists() and "OPENAI_API_KEY" not in found:
        try:
            data = json.loads(codex_auth.read_text(encoding="utf-8"))
            if data.get("OPENAI_API_KEY"):
                found["OPENAI_API_KEY"] = str(data["OPENAI_API_KEY"]).strip()
        except Exception:
            pass

    return found


def select_best_model_from_list(provider_type: str, model_ids: list[str]) -> Optional[str]:
    """
    Pick the highest-performing compliant model from a live /v1/models listing:
    - Gemini: Always Flash (flash-latest or highest 3.x-flash, ignoring tts/image/audio)
    - OpenAI: luna / sol (gpt-6-sol > gpt-6-luna > gpt-5.6 > chatgpt-4o-latest)
    - Anthropic: sonnet / opus (no haiku!)
    """
    cleaned = [m.replace("models/", "") for m in model_ids]

    if provider_type == "gemini":
        # Gemini Flash only, exclude media/audio/tts
        flash_candidates = [
            m for m in cleaned
            if "flash" in m.lower() and not any(x in m.lower() for x in ["tts", "image", "audio", "live", "preview-tts"])
        ]
        if "gemini-flash-latest" in flash_candidates:
            return "gemini-flash-latest"
        # Find highest version number (e.g. gemini-3.8-flash)
        numbered = sorted(
            [m for m in flash_candidates if re.search(r"gemini-\d+", m)],
            reverse=True,
        )
        if numbered:
            return numbered[0]
        if flash_candidates:
            return flash_candidates[0]
        return "gemini-flash-latest"

    elif provider_type in ("openai", "openai-compatible"):
        # Prioritize Sol and Luna as requested
        for target in ("gpt-6-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.6"):
            for m in cleaned:
                if target in m.lower():
                    return m
        # Fallback to chatgpt-4o-latest or gpt-4o
        for target in ("chatgpt-4o-latest", "gpt-4o"):
            for m in cleaned:
                if target in m.lower():
                    return m
        return "gpt-6-sol"

    elif provider_type == "anthropic":
        # Strictly NO haiku. Either sonnet or opus.
        non_haiku = [m for m in cleaned if "haiku" not in m.lower()]
        for target in ("claude-opus-5-5", "claude-sonnet-5", "claude-3-7-sonnet-latest", "claude-3-5-sonnet-latest"):
            for m in non_haiku:
                if target in m.lower():
                    return m
        if non_haiku:
            return non_haiku[0]
        return "claude-sonnet-5"

    return None


def fetch_models_sync(base_url: str, api_key: str, provider_type: str) -> list[str]:
    """Fetch model IDs from /v1/models with standard timeout."""
    endpoint = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    if provider_type == "anthropic":
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}

    with httpx.Client(timeout=4.0) as client:
        resp = client.get(endpoint, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            models_data = data.get("data") or data.get("models") or []
            if isinstance(models_data, list):
                return [m.get("id") or m.get("name") for m in models_data if isinstance(m, dict) and (m.get("id") or m.get("name"))]
    return []


class ModelProvider:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        provider_type: Optional[str] = None,
        timeout_seconds: float = 90.0,
        api_key_env: Optional[str] = None,
        discover_credentials: bool = True,
        state_dir: Optional[Path] = None,
    ):
        self.timeout_seconds = timeout_seconds
        self.state_dir = state_dir
        self.api_key_env = api_key_env

        # 1. Discover local credentials
        discovered_creds = discover_local_credentials() if discover_credentials and not api_key_env else {}

        env_provider = os.environ.get("AXWISE_PROVIDER")
        gemini_key = discovered_creds.get("GEMINI_API_KEY") or discovered_creds.get("GOOGLE_API_KEY")
        openai_key = discovered_creds.get("OPENAI_API_KEY")
        anthropic_key = discovered_creds.get("ANTHROPIC_API_KEY")

        # A named key is authoritative, including when missing. Never borrow a
        # credential from a different configured/discovered provider.
        explicit_key = api_key or (os.environ.get(api_key_env) if api_key_env else os.environ.get("AXWISE_API_KEY"))
        explicit_key = explicit_key.strip() if explicit_key else None

        if provider_type or env_provider:
            self.provider_type = (provider_type or env_provider).lower()
        elif gemini_key or (explicit_key and explicit_key.startswith("AIza")):
            self.provider_type = "gemini"
        elif openai_key or (explicit_key and (explicit_key.startswith("sk-proj-") or (explicit_key.startswith("sk-") and not explicit_key.startswith("sk-ant-")))):
            self.provider_type = "openai"
        elif anthropic_key or (explicit_key and explicit_key.startswith("sk-ant-")):
            self.provider_type = "anthropic"
        else:
            self.provider_type = "gemini" if gemini_key else ("openai" if openai_key else ("anthropic" if anthropic_key else "gemini"))

        # 2. Configure endpoint & API key
        if self.provider_type == "gemini":
            self.api_key = explicit_key or gemini_key
            self.base_url = base_url or os.environ.get("AXWISE_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta/openai"
            fallback_default = "gemini-flash-latest"
            env_override = os.environ.get("AXWISE_MODEL") or os.environ.get("GEMINI_MODEL")

        elif self.provider_type in ("openai", "openai-compatible"):
            self.provider_type = "openai"
            self.api_key = explicit_key or openai_key
            self.base_url = base_url or os.environ.get("AXWISE_BASE_URL") or "https://api.openai.com/v1"
            fallback_default = "gpt-6-sol"
            env_override = os.environ.get("AXWISE_MODEL") or os.environ.get("OPENAI_MODEL")

        elif self.provider_type in ("anthropic", "claude"):
            self.provider_type = "anthropic"
            self.api_key = explicit_key or anthropic_key
            self.base_url = base_url or os.environ.get("AXWISE_BASE_URL") or "https://api.anthropic.com/v1"
            fallback_default = "claude-sonnet-5"
            env_override = os.environ.get("AXWISE_MODEL") or os.environ.get("ANTHROPIC_MODEL")

        else:
            raise ProviderError("Unsupported AXWISE_PROVIDER; use gemini, openai, openai-compatible, or anthropic.")

        # 3. Model Resolution: Explicit override -> 24h SQLite Cache -> /models auto-discovery -> Fallback
        if model or env_override:
            self.model = model or env_override
        else:
            self.model = self._resolve_dynamic_model(fallback_default)

    def _resolve_dynamic_model(self, fallback: str) -> str:
        # Check SQLite 24h cache first
        # Endpoint-local listings must not poison another compatible provider's
        # model selection; credentials themselves are never part of this key.
        cache_key = f"{self.provider_type}:{self.base_url.rstrip('/')}"
        cached = get_cached_model(cache_key, max_age_hours=24.0, state_dir=self.state_dir)
        if cached:
            return cached

        # Fetch live /v1/models if key is available
        if self.api_key:
            try:
                available = fetch_models_sync(self.base_url, self.api_key, self.provider_type)
                if available:
                    chosen = select_best_model_from_list(self.provider_type, available)
                    if chosen:
                        set_cached_model(cache_key, chosen, available, state_dir=self.state_dir)
                        return chosen
            except Exception:
                pass

        return fallback

    async def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        response_schema: Optional[dict[str, Any]] = None,
        max_output_tokens: int = 4096,
    ) -> tuple[str, dict[str, Any]]:
        if not self.api_key:
            if self.api_key_env:
                raise ProviderError(f"Configured credential environment variable {self.api_key_env} is missing or empty.")
            raise ProviderError(
                f"No API key configured for {self.provider_type}. Please set GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
            )

        if self.provider_type == "anthropic":
            return await self._complete_anthropic(system_prompt, user_prompt, response_schema, max_output_tokens)
        else:
            return await self._complete_openai_compatible(system_prompt, user_prompt, response_schema, max_output_tokens)

    async def _complete_openai_compatible(
        self,
        system_prompt: str,
        user_prompt: str,
        response_schema: Optional[dict[str, Any]],
        max_output_tokens: int,
    ) -> tuple[str, dict[str, Any]]:
        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_completion_tokens": max_output_tokens,
            "stream": False,
        }

        if response_schema:
            clean_schema = provider_schema(response_schema, self.provider_type)
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "axwise_specialist_artifact",
                    "strict": self.provider_type == "gemini",
                    "schema": clean_schema,
                },
            }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            try:
                response = await client.post(endpoint, headers=headers, json=payload)
            except httpx.TimeoutException:
                raise ProviderError(f"Model provider request timed out after {self.timeout_seconds}s.")
            except Exception as e:
                raise ProviderError(f"Failed to connect to model provider: {e}")

            if response.status_code != 200:
                raise ProviderError(f"Provider returned error HTTP {response.status_code}: {response.text}")

            data = response.json()
            choices = data.get("choices") or []
            if not choices:
                raise ProviderError("Provider returned no choices in response.")

            choice = choices[0]
            content = choice.get("message", {}).get("content", "")
            usage = data.get("usage", {})
            return content, usage

    async def _complete_anthropic(
        self,
        system_prompt: str,
        user_prompt: str,
        response_schema: Optional[dict[str, Any]],
        max_output_tokens: int,
    ) -> tuple[str, dict[str, Any]]:
        endpoint = f"{self.base_url.rstrip('/')}/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        payload: dict[str, Any] = {
            "model": self.model,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "max_tokens": max_output_tokens,
        }

        if response_schema:
            inlined_schema = inline_local_refs(response_schema)
            tool_def = {
                "name": "axwise_specialist_artifact",
                "description": "Output schema for the requested Axwise specialist artifact.",
                "input_schema": inlined_schema,
            }
            payload["tools"] = [tool_def]
            payload["tool_choice"] = {"type": "tool", "name": "axwise_specialist_artifact"}

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            try:
                response = await client.post(endpoint, headers=headers, json=payload)
            except httpx.TimeoutException:
                raise ProviderError(f"Anthropic provider request timed out after {self.timeout_seconds}s.")
            except Exception as e:
                raise ProviderError(f"Failed to connect to Anthropic provider: {e}")

            if response.status_code != 200:
                raise ProviderError(f"Anthropic returned error HTTP {response.status_code}: {response.text}")

            data = response.json()
            content_blocks = data.get("content") or []
            tool_use_block = next((b for b in content_blocks if b.get("type") == "tool_use"), None)

            if tool_use_block and "input" in tool_use_block:
                content = json.dumps(tool_use_block["input"])
            else:
                text_block = next((b for b in content_blocks if b.get("type") == "text"), None)
                content = text_block.get("text", "") if text_block else ""

            anthropic_usage = data.get("usage", {})
            usage = {
                "prompt_tokens": anthropic_usage.get("input_tokens"),
                "completion_tokens": anthropic_usage.get("output_tokens"),
            }
            return content, usage
