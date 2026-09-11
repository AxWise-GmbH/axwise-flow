from __future__ import annotations

import hashlib

from backend.domain.workflow_v2.contracts import artifact_content_hash


SCOPE_REQUEST = "Create an Estonia cat-food launch PRD."


def scope_payload() -> dict:
    topic = "cat-food"
    topic_start = SCOPE_REQUEST.index(topic)
    requirement = {
        "category": "deliverable",
        "description": "Product requirements document",
        "priority": "P0",
        "authority": "owner",
    }
    requirement_id = "req-8406b408a1efe030"
    acceptance_criterion = {
        "given": "The accepted scope and immutable research are available.",
        "when": "The product requirements document is evaluated.",
        "then": (
            "Every accepted requirement is visibly satisfied or explicitly marked "
            "as a gap."
        ),
        "supports": [requirement_id],
    }
    return {
        "schemaVersion": "axwise.scope.v2",
        "objective": SCOPE_REQUEST,
        "objectiveSourceSpans": [
            {
                "start": 0,
                "end": len(SCOPE_REQUEST),
                "text": SCOPE_REQUEST,
                "sha256": hashlib.sha256(SCOPE_REQUEST.encode("utf-8")).hexdigest(),
                "offsetUnit": "utf16_code_units",
            }
        ],
        "topicAnchors": [
            {
                "value": topic,
                "sourceSpans": [
                    {
                        "start": topic_start,
                        "end": topic_start + len(topic),
                        "text": topic,
                        "sha256": hashlib.sha256(topic.encode("utf-8")).hexdigest(),
                        "offsetUnit": "utf16_code_units",
                    }
                ],
            }
        ],
        "geography": ["Estonia"],
        "evidenceRequirements": [],
        "deliverables": ["Product requirements document"],
        "personas": [],
        "interviewRequirements": [],
        "prdRequirements": [],
        "limits": [],
        "policies": [],
        "deliverableProfile": {
            "schemaVersion": "axwise.deliverable-profile.v1",
            "artifactType": "product_prd",
            "domain": "Commercial cat-food launch in Estonia",
            "problem": "Define a useful, evidence-bounded cat-food product for Estonia.",
            "desiredOutcome": (
                "A decision-ready product requirements document with traceable "
                "evidence boundaries."
            ),
            "audiences": ["Product decision-makers"],
            "nonGoals": ["Do not claim launch authority without verified evidence."],
            "requiredSections": [
                "Acceptance criteria",
                "Evidence, assumptions, and gaps",
                "Metrics and validation",
                "Next steps",
                "Prioritized requirements",
                "Problem and desired outcome",
                "Product thesis, scope, and non-goals",
                "Risks",
                "User journeys",
                "Users, jobs, and pains",
            ],
        },
        "requirements": [{"id": requirement_id, **requirement}],
        "acceptanceCriteria": [
            {"id": "acc-54ff9697aaa48c75", **acceptance_criterion}
        ],
        "assumptions": [],
        "materialClarification": None,
        "researchInputHash": (
            "1460da0887fd9ed029a3bb0441e5250d1fa0055be3c3d5bdff3ff4d6d48edd2d"
        ),
        "authority": {
            "canonicalInputHash": (
                "93d549ffa3576a503d39ae090e2b177a8dceb36ef77c40d8e56b09fd35babdaf"
            ),
            "seal": "c" * 64,
        },
    }


def scope_completion_result(
    *, artifact_id: str = "00000000-0000-4000-8000-000000000201"
) -> dict:
    payload = scope_payload()
    return {
        "resultType": "scope_compiled",
        "artifact": {
            "artifactId": artifact_id,
            "artifactHash": artifact_content_hash(
                content_type="application/json", payload=payload, markdown=None
            ),
            "kind": "scope",
            "contentType": "application/json",
            "payload": payload,
            "markdown": None,
            "sourceArtifactIds": [],
        },
    }
