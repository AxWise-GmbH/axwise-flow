"""Shared opaque identifier contracts for orchestration boundaries."""

from typing import Annotated

from pydantic import Field


DURABLE_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,254}$"
DurableId = Annotated[
    str,
    Field(
        min_length=1,
        max_length=255,
        pattern=DURABLE_ID_PATTERN,
    ),
]


__all__ = ["DURABLE_ID_PATTERN", "DurableId"]
