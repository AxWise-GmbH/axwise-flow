"""Provider-independent contracts shared by local discovery capabilities."""
from __future__ import annotations

import html
import json
import re
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator
from backend.domain.workflow_v2.wire import canonical_hash

Text = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=4000)]
Id = Annotated[str, StringConstraints(strict=True, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    @field_validator("*", mode="before")
    @classmethod
    def nonblank(cls, value: Any) -> Any:
        if isinstance(value, str):
            value.encode("utf-8")
            if not value.strip():
                raise ValueError("blank value")
        return value


class ArtifactReference(StrictInput):
    operationId: Annotated[str, StringConstraints(strict=True, pattern=r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")]
    sha256: Annotated[str, StringConstraints(strict=True, pattern=r"^[a-f0-9]{64}$")]


class OperationInput(StrictInput):
    references: list[ArtifactReference] = Field(default_factory=list, max_length=8,
        description="Exact saved local artifact references returned by earlier tools in this conversation; never invent or retype artifact content.")
    revisionOf: ArtifactReference | None = Field(default=None,
        description="Exact prior artifact of this same kind to revise; omit for a new result. Preserves previous versions.")
    depth: Literal["standard", "deep"] = "standard"

    @model_validator(mode="after")
    def unique_references(self):
        ids = [row.operationId for row in self.references]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate references")
        return self


class EvidenceSource(StrictInput):
    id: Id
    title: Text
    text: Annotated[str, StringConstraints(strict=True, min_length=1, max_length=64000)]
    origin: Literal["supplied_document", "supplied_transcript", "synthetic_transcript", "web_source"]
    url: Annotated[str, StringConstraints(strict=True, max_length=2000)] | None = None
    publishedAt: Annotated[str, StringConstraints(strict=True, max_length=100)] | None = None
    retrievedAt: Annotated[str, StringConstraints(strict=True, max_length=100)] | None = None

    @field_validator("url")
    @classmethod
    def source_url(cls, value):
        if value is not None:
            parsed = urlsplit(value)
            if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password or any(c.isspace() for c in value):
                raise ValueError("invalid source URL")
        return value

    @model_validator(mode="after")
    def web_identity(self):
        if self.origin == "web_source" and (not self.url or not self.retrievedAt):
            raise ValueError("web evidence needs its source URL and retrieval time")
        return self


def dump(value: Any) -> Any:
    return value.model_dump(mode="json", by_alias=True) if isinstance(value, BaseModel) else value


def parse_response(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        if len(value.encode()) > 512000:
            raise ValueError("response too large")
        value = json.loads(value)
    if type(value) is not dict or len(json.dumps(value, ensure_ascii=False).encode()) > 512000:
        raise ValueError("invalid response")
    return value


def stable_id(prefix: str, payload: Any) -> str:
    if not re.fullmatch(r"[a-z][a-z0-9_-]{0,24}", prefix):
        raise ValueError("invalid ID prefix")
    return prefix + "-" + canonical_hash(payload)[:24]


def render_text(value: str) -> str:
    return html.escape(value).replace("\r", " ").replace("\n", " ").replace("![", "!\\[")
