"""Typed dependency seams for the Assistant turn service."""

from __future__ import annotations

from typing import Any, Callable, Protocol

from backend.domain.workflow_v2.contracts import OperationMetrics


class AssistantRunner(Protocol):
    async def search(self, query: str) -> dict[str, Any]: ...


SourceTypeClassifier = Callable[[str, str], set[str]]
UsageReader = Callable[[dict[str, Any]], tuple[int, int, int, int]]
MetricsFactory = Callable[..., OperationMetrics]


__all__ = [
    "AssistantRunner",
    "MetricsFactory",
    "SourceTypeClassifier",
    "UsageReader",
]
