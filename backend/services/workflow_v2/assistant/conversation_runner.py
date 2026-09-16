"""Unsearched conversational model adapter for Assistant turns."""

from __future__ import annotations

import asyncio
from typing import Any

from pydantic_ai import Agent

from backend.services.llm.gemini_runtime import exact_uniform_model_version_from_result

WORKFLOW_V2_ASSISTANT_CHAT_DEADLINE_SECONDS = 45


CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT = """
You are AxWise assisting inside Orqaly Assistant. The user is having a normal,
multi-turn conversation, not running a durable Goal and not requesting grounded web
research. The input is canonical JSON with a system-owned instruction, prior
conversation, and the latest message. Follow the instruction and the latest user
message, respect corrections, and return only the reader-facing response in useful
Markdown. Keep simple questions simple. Never claim to create, start, open, or continue
a Goal. Do not invent sources or claim that current external facts were verified. Treat
prior assistant claims and user-provided examples as context, not verified facts. Never
present an Orqaly, AxWise, or third-party integration, permission, credential, scheduler,
or execution capability as currently available unless the canonical input explicitly
establishes it. Frame unestablished capabilities as proposed or planned, clearly separate
the current product from the target architecture, and qualify version-dependent technical
behavior or recommend grounded Research instead of inventing exact semantics.
""".strip()


def _usage_from_result(result: Any) -> tuple[int, int]:
    usage_member = getattr(result, "usage", None)
    usage_value = usage_member() if callable(usage_member) else usage_member
    return (
        int(getattr(usage_value, "input_tokens", 0) or 0),
        int(getattr(usage_value, "output_tokens", 0) or 0),
    )


class PydanticAIConversationalAssistantRunner:
    """Generate ordinary chat turns without forcing a Google Search operation."""

    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            output_type=str,
            system_prompt=CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT,
        )

    async def search(self, query: str) -> dict[str, Any]:
        try:
            result = await asyncio.wait_for(
                self.agent.run(query),
                timeout=WORKFLOW_V2_ASSISTANT_CHAT_DEADLINE_SECONDS,
            )
        except asyncio.TimeoutError:
            return {
                "text": "",
                "sources": [],
                "claims": [],
                "provider": "gemini_conversation",
                "provider_queries": [],
                "search_performed": False,
                "runtime_diagnostics": {
                    "status": "deadline_exceeded",
                    "call_count": 1,
                },
            }
        markdown = str(result.output or "").strip()
        input_tokens, output_tokens = _usage_from_result(result)
        response = {
            "text": markdown,
            "sources": [],
            "claims": [],
            "provider": "gemini_conversation",
            "provider_queries": [],
            "search_performed": False,
            "usage_metadata": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
            },
            "runtime_diagnostics": {
                "status": "ok" if markdown else "response_processing_error",
                "call_count": 1,
            },
        }
        model_version = exact_uniform_model_version_from_result(result)
        if model_version is not None:
            response["model_version"] = model_version
        return response


__all__ = [
    "CONVERSATIONAL_ASSISTANT_SYSTEM_PROMPT",
    "PydanticAIConversationalAssistantRunner",
    "WORKFLOW_V2_ASSISTANT_CHAT_DEADLINE_SECONDS",
]
