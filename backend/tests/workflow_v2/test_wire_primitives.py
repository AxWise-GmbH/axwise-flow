"""Compatibility and dependency boundaries for consumer-neutral primitives."""

from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path

import pytest
from pydantic import Field, ValidationError

from backend.domain.workflow_v2 import contracts, wire

pytestmark = pytest.mark.contract


@pytest.mark.parametrize(
    "name",
    [
        "ContractModel",
        "StrictWireContractModel",
        "canonical_json",
        "canonical_hash",
        "utf16_ordinal_sorted",
        "_camel",
    ],
)
def test_existing_contract_module_reexports_same_primitive(name: str) -> None:
    assert getattr(contracts, name) is getattr(wire, name)


def test_canonical_v1_historical_golden_bytes_are_unchanged() -> None:
    fixture = Path(__file__).parent / "fixtures" / "canonical_v1_golden.json"
    for vector in json.loads(fixture.read_text(encoding="utf-8"))["vectors"]:
        assert wire.canonical_json(vector["value"]) == vector["canonical"]
        assert wire.canonical_hash(vector["value"]) == vector["sha256"]


@pytest.mark.parametrize(
    "value",
    [1.5, float("nan"), float("inf"), 9007199254740992, "\ud800", {1: "x"}, (1,)],
)
def test_noncanonical_values_remain_rejected(value: object) -> None:
    with pytest.raises(TypeError):
        wire.canonical_json(value)


def test_consumer_contract_retains_alias_and_unknown_field_rules() -> None:
    class Input(wire.ContractModel):
        item_count: int = Field(ge=0)

    assert Input(item_count=2).model_dump(by_alias=True) == {"itemCount": 2}
    assert Input.model_validate({"itemCount": 2}).item_count == 2
    with pytest.raises(ValidationError):
        Input.model_validate({"itemCount": 2, "unreviewed": True})


def test_strict_wire_contract_still_rejects_python_field_names() -> None:
    class Input(wire.StrictWireContractModel):
        item_count: int = Field(ge=0)

    assert Input.model_validate({"itemCount": 2}).item_count == 2
    with pytest.raises(ValidationError):
        Input.model_validate({"item_count": 2})


def test_wire_primitives_have_no_consumer_runtime_dependencies() -> None:
    tree = ast.parse(inspect.getsource(wire))
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            assert node.level == 0
            roots.add((node.module or "").split(".")[0])
    assert roots <= {"__future__", "hashlib", "json", "typing", "pydantic"}
