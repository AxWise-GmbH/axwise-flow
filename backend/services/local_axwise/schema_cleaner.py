"""Schema inlining and constraint adaptation for LLM JSON-schema providers."""
from __future__ import annotations

import copy
import json
from typing import Any

MAX_BYTES = 256_000

CONSTRAINTS = {
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minLength", "maxLength", "pattern", "format", "minItems", "maxItems",
    "uniqueItems", "minProperties", "maxProperties",
}

KNOWN = {
    "type", "properties", "required", "items", "enum", "const", "anyOf", "oneOf",
    "title", "description", "default", "examples", "additionalProperties", *CONSTRAINTS
}


def inline_local_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Expand bounded local JSON pointers ($defs) without mutating or weakening the schema."""
    if not isinstance(schema, dict) or len(json.dumps(schema)) > MAX_BYTES:
        raise ValueError("AXWISE_SCHEMA_INVALID")

    schema = copy.deepcopy(schema)
    defs = schema.get("$defs", schema.get("definitions", {}))

    def walk(node: Any, refs: tuple[str, ...] = (), depth: int = 0) -> Any:
        if depth > 40:
            raise ValueError("AXWISE_SCHEMA_TOO_DEEP")
        if isinstance(node, list):
            return [walk(item, refs, depth + 1) for item in node]
        if not isinstance(node, dict):
            return node

        if "$ref" in node:
            ref = node["$ref"]
            if not isinstance(ref, str) or not ref.startswith("#/") or ref in refs:
                raise ValueError(f"Invalid or cyclic ref: {ref}")

            parts = ref[2:].split("/")
            target = schema
            for part in parts:
                part = part.replace("~1", "/").replace("~0", "~")
                if not isinstance(target, dict) or part not in target:
                    raise ValueError(f"Ref not found: {ref}")
                target = target[part]

            expanded = walk(target, (*refs, ref), depth + 1)
            siblings = {k: v for k, v in node.items() if k != "$ref"}
            if not siblings:
                return expanded

            annotations = {"title", "description", "default"}
            if all(k in annotations for k in siblings):
                merged = copy.deepcopy(expanded)
                merged.update(walk(siblings, refs, depth + 1))
                return merged
            return {"allOf": [expanded, walk(siblings, refs, depth + 1)]}

        return {k: walk(v, refs, depth + 1) for k, v in node.items() if k not in ("$defs", "definitions")}

    return walk(schema)


def provider_schema(schema: dict[str, Any], provider: str = "gemini") -> dict[str, Any]:
    """
    Format schema for Gemini or OpenAI-compatible JSON schema mode.
    Gemini rejects numeric/length/pattern constraints at schema parse time, so
    we shift them into the description as hints while keeping structural fields.
    """
    expanded = inline_local_refs(schema)

    def walk(value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        result: dict[str, Any] = {}
        hints: list[str] = []

        if "type" in value:
            result["type"] = copy.deepcopy(value["type"])
        if "properties" in value and isinstance(value["properties"], dict):
            result["properties"] = {k: walk(v) for k, v in value["properties"].items()}
        if "required" in value and isinstance(value["required"], list):
            result["required"] = copy.deepcopy(value["required"])
        if "items" in value:
            result["items"] = walk(value["items"])
        if "enum" in value:
            result["enum"] = copy.deepcopy(value["enum"])
        if "const" in value:
            result["enum"] = [copy.deepcopy(value["const"])]
        for key in ("anyOf", "oneOf"):
            if key in value and isinstance(value[key], list):
                result[key] = [walk(x) for x in value[key]]

        # Move strict constraints to description hints for Gemini/OpenAI non-strict
        for key in CONSTRAINTS:
            if key in value:
                hints.append(f"{key}={json.dumps(value[key])}")

        if value.get("additionalProperties") is False:
            hints.append("no additional properties")
            # OpenAI / Gemini structured output usually requires additionalProperties: False
            result["additionalProperties"] = False

        if "default" in value:
            hints.append(f"default={json.dumps(value['default'])}")

        desc_parts = [value.get("description")]
        if hints:
            desc_parts.append(f"Constraints: {'; '.join(hints)}.")
        full_desc = " ".join([p for p in desc_parts if p])
        if full_desc:
            result["description"] = full_desc

        return result

    return walk(expanded)
