"""Consumer-neutral wire primitives; existing contracts re-export these names.

No operation dispatch, provider, persistence or legacy application dependencies.
Canonical serialization deliberately preserves the existing canonical-v1 bytes.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator


def _camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=_camel,
        populate_by_name=True,
        extra="forbid",
    )


class StrictWireContractModel(ContractModel):
    @model_validator(mode="before")
    @classmethod
    def camel_case_wire_keys_only(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        for field_name, field in cls.model_fields.items():
            alias = field.alias
            if alias and alias != field_name and field_name in value:
                raise ValueError(f"wire field {field_name!r} must use alias {alias!r}")
        return value


def canonical_json(value: Any) -> str:
    """Return the AxWise/Orqaly ``canonical-v1`` JSON representation.

    ``canonical-v1`` deliberately supports the JSON subset used by workflow
    contracts: null, booleans, strings, safe integers, arrays and objects.
    Object keys are ordered by UTF-16 code units, matching JavaScript's stable
    ordinal string ordering. Floats are rejected so Python and JavaScript can
    never disagree about exponent, trailing-zero, negative-zero or precision
    rendering.
    """

    if value is None or isinstance(value, bool):
        return "null" if value is None else ("true" if value else "false")
    if isinstance(value, int) and not isinstance(value, bool):
        if abs(value) > 9_007_199_254_740_991:
            raise TypeError("canonical JSON integers must be JavaScript-safe")
        return str(value)
    if isinstance(value, float):
        raise TypeError("canonical JSON rejects floating-point numbers")
    if isinstance(value, str):
        try:
            value.encode("utf-8")
        except UnicodeEncodeError as error:
            raise TypeError(
                "canonical JSON rejects unpaired UTF-16 surrogates"
            ) from error
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if type(value) is list:
        return "[" + ",".join(canonical_json(item) for item in value) + "]"
    if type(value) is dict:
        if any(not isinstance(key, str) for key in value):
            raise TypeError("canonical JSON object keys must be strings")
        keys = utf16_ordinal_sorted(value)
        return (
            "{"
            + ",".join(
                f"{canonical_json(key)}:{canonical_json(value[key])}" for key in keys
            )
            + "}"
        )
    raise TypeError(f"canonical JSON does not support {type(value).__name__}")


def utf16_ordinal_sorted(values: Any) -> list[str]:
    normalized = list(values)
    for value in normalized:
        if not isinstance(value, str):
            raise TypeError("UTF-16 ordinal sorting requires strings")
        try:
            value.encode("utf-8")
        except UnicodeEncodeError as error:
            raise TypeError(
                "UTF-16 ordinal sorting rejects unpaired surrogates"
            ) from error
    return sorted(normalized, key=lambda value: value.encode("utf-16-be"))


def canonical_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


__all__ = [
    "ContractModel",
    "StrictWireContractModel",
    "canonical_hash",
    "canonical_json",
    "utf16_ordinal_sorted",
]
