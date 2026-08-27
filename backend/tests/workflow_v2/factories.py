from __future__ import annotations

import hashlib

from backend.domain.workflow_v2.contracts import artifact_content_hash


SCOPE_REQUEST = "Create an Estonia cat-food launch PRD."


def scope_payload() -> dict:
    topic = "cat-food"
    topic_start = SCOPE_REQUEST.index(topic)
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
        "assumptions": [],
        "materialClarification": None,
        "researchInputHash": "a" * 64,
        "authority": {
            "canonicalInputHash": "b" * 64,
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
