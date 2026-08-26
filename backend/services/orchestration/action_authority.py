"""Deterministic same-node semantic action authority projection."""

from __future__ import annotations

from collections.abc import Iterable

from backend.domain.orchestration.models import DecisionCreateRequestV1
from backend.domain.orchestration.scope_models import ToolActionGrantV1
from backend.services.orchestration.capability_registry import CapabilityRegistry


def normalized_action_ids(
    values: Iterable[str],
    registry: CapabilityRegistry,
) -> set[str]:
    return {
        action_id
        for action_id in registry.normalize_many(values)
        if action_id
    }


def sealed_consequential_action_ids(
    request: DecisionCreateRequestV1,
    registry: CapabilityRegistry,
) -> set[str]:
    """Read consequence only from the sealed typed scope admission."""

    packet = request.scope_packet
    if packet is None:
        return set()
    action_ids: set[str] = set()
    for item in packet.admission.requested_actions:
        if not (
            item.mode == "execute"
            or item.side_effect != "none"
            or item.requires_authorization
        ):
            continue
        action_id = registry.normalize(item.action)
        if not action_id:
            raise ValueError(
                "sealed consequential action must have an ASCII semantic action ID"
            )
        action_ids.add(action_id)
    return action_ids


def exact_tool_action_grants(
    request: DecisionCreateRequestV1,
    tool_ids: Iterable[str],
    requested_actions: Iterable[str],
    registry: CapabilityRegistry,
) -> list[ToolActionGrantV1]:
    """Intersect exact node actions with authenticated catalogue authority."""

    action_ids = normalized_action_ids(requested_actions, registry)
    catalogue = {tool.tool_id: tool for tool in request.available_tools}
    grants: list[ToolActionGrantV1] = []
    for tool_id in sorted(set(tool_ids)):
        tool = catalogue.get(tool_id)
        if tool is None:
            continue
        allowed = normalized_action_ids(tool.allowed_actions, registry)
        granted = tuple(sorted(action_ids.intersection(allowed)))
        if granted:
            grants.append(
                ToolActionGrantV1(
                    tool_id=tool_id,
                    allowed_actions=granted,
                )
            )
    return grants


__all__ = [
    "exact_tool_action_grants",
    "normalized_action_ids",
    "sealed_consequential_action_ids",
]
