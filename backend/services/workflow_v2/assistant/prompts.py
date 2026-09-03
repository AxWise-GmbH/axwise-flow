"""Canonical prompts for workflow-v2 Assistant turns."""

from __future__ import annotations

import re

from backend.domain.workflow_v2.contracts import AssistantTurnInputV1, canonical_json


WORKFLOW_V2_ASSISTANT_FALLBACK_REQUIREMENT_CHARACTERS = 1_000


MODE_INSTRUCTIONS = {
    "direct_answer": (
        "Answer the user's request directly and conversationally. Keep simple "
        "information simple; do not turn it into a project or questionnaire."
    ),
    "discover": (
        "Help the user clarify the outcome. Ask at most one material question in "
        "this response. Accept informal or partial context, acknowledge corrections, "
        "and never present a questionnaire."
    ),
    "one_shot": (
        "Complete the bounded research, comparison, investigation, memo, analysis, "
        "PRD, or other artifact inline as useful Markdown. Include concrete findings "
        "and source-aware caveats; do not suggest that a Goal was created."
    ),
}


def assistant_turn_query(input_value: AssistantTurnInputV1) -> str:
    """Build the model prompt and, for one-shot work, bounded fallback authority.

    ResilientResearchRunner accepts fallback discovery semantics only from a
    server-owned canonical payload on the final prompt line. Ordinary Assistant
    chat must never carry that payload because it must not acquire web evidence.
    An overlong one-shot requirement remains usable by the primary model, but is
    intentionally ineligible for fallback rather than being materially truncated.
    """

    mode_instruction = MODE_INSTRUCTIONS[input_value.response_mode]
    conversation = [
        item.model_dump(mode="json", by_alias=True) for item in input_value.conversation
    ]
    assistant_request = canonical_json(
        {
            "instruction": (
                "You are AxWise assisting inside Orqaly Assistant. Return only the "
                "reader-facing response in Markdown. Orqaly alone decides whether durable "
                "Goals exist, so never claim to create, start, open, or continue one. "
                "Respect the user's latest correction or elaboration. Treat prior assistant "
                "claims and user-provided examples as context, not verified facts. Never claim "
                "that an Orqaly, AxWise, or third-party integration, permission, credential, "
                "scheduler, or execution capability is live unless the current canonical input "
                "explicitly establishes it. Describe unestablished capabilities as a proposal or "
                "target architecture, and distinguish what is available now from what would need "
                "to be implemented or connected. For version-dependent technical behavior, state "
                "the uncertainty or recommend grounded Research instead of inventing exact "
                "semantics. "
                + mode_instruction
            ),
            "conversation": conversation,
            "message": input_value.message,
        }
    )
    if input_value.response_mode != "one_shot":
        return assistant_request

    latest_request = re.sub(r"\s+", " ", input_value.message).strip()
    prior_user_requests = [
        normalized
        for item in input_value.conversation
        if item.role == "user"
        and (normalized := re.sub(r"\s+", " ", item.content).strip())
    ]
    requirement_parts = (
        [
            f"Latest user request: {latest_request}",
            *(
                f"Prior user request {index}: {request}"
                for index, request in enumerate(prior_user_requests, 1)
            ),
        ]
        if prior_user_requests
        else [latest_request]
    )
    requirement = " ".join(requirement_parts)
    if (
        not latest_request
        or len(requirement) > WORKFLOW_V2_ASSISTANT_FALLBACK_REQUIREMENT_CHARACTERS
    ):
        return assistant_request

    fallback_authority = canonical_json(
        {
            "acceptedScopeSemantics": {
                "geography": [],
                "topicAnchors": [{"value": latest_request[:300]}],
            },
            "requirement": {
                "acceptedSourceTypes": ["grounded_web"],
                "allowedSourceHosts": [],
                "appliesWhen": (
                    "Answering the current bounded one-shot Assistant request."
                ),
                "claimType": "assistant_one_shot",
                "criticality": "nonblocking",
                "description": requirement,
                "evidenceRole": "grounded_claim",
                "id": "assistant-one-shot",
                "verificationBasis": "grounded_claims",
            },
        }
    )
    return f"{assistant_request}\n{fallback_authority}"


__all__ = [
    "MODE_INSTRUCTIONS",
    "WORKFLOW_V2_ASSISTANT_FALLBACK_REQUIREMENT_CHARACTERS",
    "assistant_turn_query",
]
