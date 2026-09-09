"""Synthetic, offline fixtures for the simulation operation adapter."""

from __future__ import annotations

import hashlib

from backend.domain.workflow_v2.contracts import (
    ResearchArtifactFact,
    SimulateInputV1,
    artifact_content_hash,
    canonical_hash,
)
from backend.domain.workflow_v2.simulation import SimulationCandidateV1
from backend.services.workflow_v2.simulation_service import SimulationGenerationResult
from backend.tests.workflow_v2.analysis_test_support import limits, ref, scope_fact, uid
from backend.tests.workflow_v2.test_simulation_contracts import candidate, request


def research_fact(*, text="A fictional selected source observation."):
    scope = scope_fact()
    claims = []
    for value in (
        text,
        "Another fictional observation that must not be selected implicitly.",
    ):
        semantic = {
            "text": value,
            "sourceTypes": ["grounded_web"],
            "sourceUrls": ["https://source.example.test/fixture"],
        }
        claims.append(
            {
                "claimId": canonical_hash(semantic),
                **semantic,
                "textSha256": hashlib.sha256(value.encode()).hexdigest(),
            }
        )
    claims.sort(key=lambda row: row["claimId"])
    metadata = {
        "canonicalUrl": "https://source.example.test/fixture",
        "retrievalDate": "2026-09-09T00:00:00Z",
        "sourceClasses": ["grounded_web"],
        "sourceTitle": "Fictional source fixture",
    }
    payload = {
        "schemaVersion": "axwise.research.v2",
        "acceptedScopeArtifactId": str(scope.artifact_id),
        "acceptedScopeHash": scope.artifact_hash,
        "researchInputHash": scope.payload["researchInputHash"],
        "readiness": "ready",
        "findings": [],
        "boundedRepairPasses": 0,
        "assumptions": [],
        "gaps": [],
        "conflicts": [],
        "claimLedgerArtifactId": uid(799),
        "claimLedger": [],
        "selectedClaims": claims,
        "sourceCatalogue": [
            {
                "sourceId": canonical_hash(metadata),
                **metadata,
                "supportedClaimIds": [row["claimId"] for row in claims],
            }
        ],
    }
    return ResearchArtifactFact.model_validate(
        {
            "artifactId": uid(103),
            "artifactHash": artifact_content_hash(
                content_type="application/json", payload=payload, markdown=None
            ),
            "kind": "research",
            "contentType": "application/json",
            "payload": payload,
            "markdown": None,
            "sourceArtifactIds": [str(scope.artifact_id)],
        }
    )


def simulation_input(
    *,
    scope=None,
    source=None,
    entries=None,
    simulation_request=None,
    request_limits=None,
):
    scope = scope or scope_fact()
    raw_request = simulation_request or request()
    selections = []
    if source is not None:
        raw_request["grounding"] = {
            "mode": "source_grounded",
            "sourceArtifacts": [ref(source)],
        }
        kind, field, key = (
            ("claim", "selectedClaims", "claimId")
            if source.kind == "research"
            else ("quote", "quotes", "quoteId")
        )
        selections = [
            {"artifact": ref(source), "entryKind": kind, "entryId": entry[key]}
            for entry in (entries if entries is not None else source.payload[field][:1])
        ]
    return SimulateInputV1.model_validate(
        {
            "type": "SimulateV1",
            "acceptedScope": ref(scope),
            "scope": scope.payload,
            "request": raw_request,
            "selectedGrounding": selections,
            "limits": request_limits or limits(),
        }
    ).model_dump(mode="json", by_alias=True)


class SimulationGenerator:
    def __init__(self, *, usage=None):
        self.calls = []
        self.usage = usage or {}

    async def generate(self, context, plan, *, limits, deadline):
        self.calls.append((context, plan, limits, deadline))
        return SimulationGenerationResult(
            SimulationCandidateV1.model_validate(
                candidate(context.request, operation=context.operation_id)
            ),
            model_calls=1,
            **self.usage,
        )
