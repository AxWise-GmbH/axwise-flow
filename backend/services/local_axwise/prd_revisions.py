"""Bounded PRD patches: the model never rewrites unselected commitments.

The desktop resolves/authorizes immutable artifact references. This module only
assembles selected data; it performs no I/O and does not infer permission from
natural-language text. Existing documents without item IDs are supported.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Literal

from pydantic import Field

from backend.domain.workflow_v2.wire import canonical_hash
from backend.services.local_axwise.pipeline_common import Id, StrictInput, Text


class RevisionEdit(StrictInput):
    itemId: Id
    action: Literal["replace", "remove"]
    instruction: Text = Field(description="Exact user-requested change copied from brief. Select only this item's intentional replacement/removal; omit for additive changes.")


class RevisionError(ValueError):
    """Finite diagnostics, never include selected content in error envelopes."""
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def catalogue(artifact):
    """Keep IDs across replacements; derive deterministic IDs for older PRDs."""
    rows = []
    occurrences = {}
    for section in artifact["sections"]:
        for index, item in enumerate(section["items"]):
            digest = canonical_hash({"heading": section["heading"], "item": item})
            occurrence = occurrences.get(digest, 0)
            occurrences[digest] = occurrence + 1
            rows.append({"id": f"prd-{digest[:48]}-{occurrence}", "heading": section["heading"],
                         "index": index, "itemHash": canonical_hash(item)})
    previous = artifact.get("itemCatalogue")
    if previous is not None:
        if not isinstance(previous, list) or len(previous) != len(rows):
            raise RevisionError("INVALID_PRD_REVISION_BASE")
        ids = set()
        for old, row in zip(previous, rows, strict=True):
            if (not isinstance(old, dict) or set(old) != set(row)
                    or any(old.get(key) != row[key] for key in ("heading", "index", "itemHash"))
                    or not isinstance(old.get("id"), str) or old["id"] in ids):
                raise RevisionError("INVALID_PRD_REVISION_BASE")
            # Validate persisted IDs with the same contract exposed to callers.
            RevisionEdit.model_validate({"itemId": old["id"], "action": "remove", "instruction": "validate identity"})
            row["id"] = old["id"]
            ids.add(old["id"])
    return rows


def selected_parent(value, hosts):
    if value.get("revisionOf") is None:
        if value.get("revisionEdits"):
            raise RevisionError("INVALID_PRD_REVISION_EDIT")
        return None
    parents = [row for row in hosts or [] if isinstance(row, dict)
               and row.get("tool") == "create_prd" and row.get("reference") == value["revisionOf"]]
    if len(parents) != 1 or parents[0].get("artifact", {}).get("schemaVersion") != "axwise.local-prd.v1":
        raise RevisionError("INVALID_PRD_REVISION_BASE")
    parent = parents[0]
    catalogue(parent["artifact"])
    return parent


def edit_map(value, parent):
    available = {row["id"] for row in catalogue(parent["artifact"])}
    edits = {}
    for supplied in value.get("revisionEdits", []):
        edit = RevisionEdit.model_validate(supplied).model_dump(mode="json")
        if edit["itemId"] not in available or edit["itemId"] in edits or edit["instruction"] not in value["brief"]:
            raise RevisionError("INVALID_PRD_REVISION_EDIT")
        edits[edit["itemId"]] = edit
    return edits


def patch_schema(item_schema, parent, edits):
    headings = [section["heading"] for section in parent["artifact"]["sections"]]
    item_ref = {"$ref": "#/$defs/PrdItem"}
    replacements = [row["itemId"] for row in edits.values() if row["action"] == "replace"]
    return {
        "type": "object", "additionalProperties": False,
        "$defs": item_schema["$defs"], "required": ["additions", "replacements"],
        "properties": {
            "additions": {"type": "array", "maxItems": 16, "items": {
                "type": "object", "additionalProperties": False, "required": ["heading", "item"],
                "properties": {"heading": {"type": "string", "enum": headings}, "item": item_ref}}},
            "replacements": {"type": "array", "minItems": len(replacements), "maxItems": len(replacements),
                "items": {"type": "object", "additionalProperties": False, "required": ["itemId", "item"],
                    "properties": {"itemId": {"type": "string", **({"enum": replacements} if replacements else {})},
                                   "item": item_ref}}},
        },
    }


PATCH_PROMPT = """
This is a bounded revision, NOT a fresh PRD. Return only additions and replacements
conforming to the PATCH schema, never a full title/sections document. The host
copies all existing items, title, headings, priority order, acceptance checks and
metrics unchanged. Do not echo or paraphrase unchanged items as additions.
Add only the requested new content in its existing section. An added acceptance
criterion must be standalone and identify the requirement it supplements, without
repeating/replacing that requirement. When the user supplies an exact acceptance
sentence, use that exact sentence with basis=owner_decision and sourceIds=[],
findingIds=[]: a new owner instruction is not an invented interview finding.
Only IDs in authorizedEdits may be replaced/removed; return one replacement for
each authorized action=replace and no others. Removals are applied locally. Changes
outside those explicit selections are impossible; do not work around them by
adding a contradictory obligation, weakened threshold or reordered priority.
"""


def apply_patch(value, parent, response, item_model):
    """Assemble a new candidate; never mutate the immutable parent artifact."""
    edits = edit_map(value, parent)
    if not isinstance(response, dict):
        raise RevisionError("INVALID_PRD_REVISION_PATCH")

    # Normalize patch envelope: if additions or replacements are present, ensure both exist
    # and strip any auxiliary fields (e.g. reasoning/metadata from model responses)
    if "additions" in response or "replacements" in response:
        response = {
            "additions": response.get("additions", []),
            "replacements": response.get("replacements", []),
        }
    elif set(response) != {"additions", "replacements"}:
        raise RevisionError("INVALID_PRD_REVISION_PATCH")

    additions, replacements = response["additions"], response["replacements"]
    if not isinstance(additions, list) or len(additions) > 16 or not isinstance(replacements, list):
        raise RevisionError("INVALID_PRD_REVISION_PATCH")
    selected_replacements = {}
    for row in replacements:
        if (not isinstance(row, dict) or set(row) != {"itemId", "item"}
                or row["itemId"] in selected_replacements or edits.get(row["itemId"], {}).get("action") != "replace"):
            raise RevisionError("INVALID_PRD_REVISION_PATCH")
        selected_replacements[row["itemId"]] = item_model.model_validate(row["item"]).model_dump(mode="json")
    if set(selected_replacements) != {key for key, edit in edits.items() if edit["action"] == "replace"}:
        raise RevisionError("INVALID_PRD_REVISION_PATCH")
    if not additions and not edits:
        raise RevisionError("INVALID_PRD_REVISION_PATCH")
    base = parent["artifact"]
    original_catalogue = catalogue(base)
    lookup = {(row["heading"], row["index"]): row["id"] for row in original_catalogue}
    candidate = {"title": base["title"], "sections": []}
    identities = []
    retained, changed, removed, added = [], [], [], []
    for section in base["sections"]:
        items, section_ids = [], []
        for index, item in enumerate(section["items"]):
            identity = lookup[(section["heading"], index)]
            edit = edits.get(identity)
            if edit and edit["action"] == "remove":
                removed.append(identity)
                continue
            items.append(deepcopy(selected_replacements.get(identity, item)))
            section_ids.append(identity)
            (changed if edit else retained).append(identity)
        candidate["sections"].append({"heading": section["heading"], "items": items})
        identities.append(section_ids)
    sections = {section["heading"]: (section, identities[index]) for index, section in enumerate(candidate["sections"])}
    for index, row in enumerate(additions):
        if not isinstance(row, dict) or set(row) != {"heading", "item"} or row["heading"] not in sections:
            raise RevisionError("INVALID_PRD_REVISION_PATCH")
        item = item_model.model_validate(row["item"]).model_dump(mode="json")
        identity = "prd-" + canonical_hash({"parent": value["revisionOf"], "heading": row["heading"], "index": index, "item": item})[:56]
        section, section_ids = sections[row["heading"]]
        section["items"].append(item)
        section_ids.append(identity)
        added.append(identity)
    new_catalogue = [{"id": identity, "heading": section["heading"], "index": index, "itemHash": canonical_hash(item)}
                     for section, ids in zip(candidate["sections"], identities, strict=True)
                     for index, (item, identity) in enumerate(zip(section["items"], ids, strict=True))]
    retained_hashes = {row["itemHash"] for row in original_catalogue if row["id"] in retained}
    return candidate, new_catalogue, retained_hashes, {
        "policy": "bounded_item_patch_v1", "parent": deepcopy(value["revisionOf"]),
        "retainedItemIds": retained, "changedItemIds": changed, "removedItemIds": removed, "addedItemIds": added,
    }
