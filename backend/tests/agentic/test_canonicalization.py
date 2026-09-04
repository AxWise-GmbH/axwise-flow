from __future__ import annotations

import math
from enum import Enum

import pytest
import rfc8785
from pydantic import BaseModel

from backend.domain.agentic import (
    RFC8785_V1,
    canonical_json_bytes,
    canonical_json_sha256,
)


pytestmark = [pytest.mark.contract, pytest.mark.unit]


class ExampleState(Enum):
    READY = "ready"


class ExamplePayload(BaseModel):
    state: ExampleState
    optional_note: str | None = None


def test_canonicalization_discriminator_is_shared_rfc8785_version():
    assert RFC8785_V1 == "rfc8785_v1"


def test_nested_keys_and_unicode_have_stable_canonical_bytes_and_hash():
    value = {
        "z": {"\u03b2": 2, "a": 1},
        "a": ["Gr\u00fc\u00dfe \u2603 \U0001f600", {"d": 4, "c": 3}],
    }
    expected = (
        '{"a":["Gr\u00fc\u00dfe \u2603 \U0001f600",{"c":3,"d":4}],'
        '"z":{"a":1,"\u03b2":2}}'
    ).encode("utf-8")

    assert canonical_json_bytes(value) == expected
    assert (
        canonical_json_sha256(value)
        == "158ffae50b6ea78aaab534a9d3c21b70aa143456df507cabb4fb18198de8fc62"
    )


def test_float_exponents_and_negative_zero_match_rfc8785_vector():
    value = {"numbers": [333333333.33333329, 1e30, 4.50, 2e-3, 1e-27, -0.0]}
    expected = b'{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27,0]}'

    assert canonical_json_bytes(value) == expected
    assert (
        canonical_json_sha256(value)
        == "5c34ad2f0b62822dda6a8fbcb5ad901f69fba1c84571ee09063f63266f06fc58"
    )


def test_enum_and_pydantic_normalization_remain_supported():
    value = {"payload": ExamplePayload(state=ExampleState.READY)}

    assert canonical_json_bytes(value) == b'{"payload":{"state":"ready"}}'


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_non_finite_floats_are_rejected(value: float):
    with pytest.raises(rfc8785.FloatDomainError):
        canonical_json_bytes({"value": value})


@pytest.mark.parametrize(
    "value",
    [
        {1: "not-a-string-key"},
        {"nested": {1: "not-a-string-key"}},
    ],
)
def test_non_string_object_keys_are_rejected(value: dict):
    with pytest.raises(rfc8785.CanonicalizationError, match="keys must be strings"):
        canonical_json_bytes(value)
