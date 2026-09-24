"""Small model-free benchmark fixtures with no application bootstrap."""

import json

from backend.services.local_axwise.kernel import prepare


def inputs():
    return {
        "create_prd": {
            "brief": "A shared handoff tracker for small operations teams. Draft a provisional PRD.",
            "sources": [
                {
                    "id": "interview-1",
                    "title": "Selected operator interview",
                    "text": "I lose time copying updates between tools.",
                    "origin": "supplied_transcript",
                }
            ],
        },
        "analyze_interviews": {
            "decisionQuestion": "How can handoffs improve?",
            "questions": ["What delays work?"],
            "transcripts": [
                {
                    "id": "interview-1",
                    "title": "Selected operator interview",
                    "origin": "supplied_transcript",
                    "turns": [
                        {
                            "speaker": "p1",
                            "role": "participant",
                            "text": "I lose time copying updates between tools.",
                        }
                    ],
                }
            ],
        },
        "simulate_interviews": {
            "scenario": "A shared team handoff tracker",
            "targetAudience": "Small operations teams",
            "problem": "Manual copying delays work",
            "stakeholders": [
                {
                    "id": "operators",
                    "label": "Operators",
                    "description": "People coordinating daily handoffs",
                    "questions": ["What slows down a handoff?"],
                }
            ],
        },
    }


def candidate(tool, value=None):
    value = value or inputs()[tool]
    payload = json.loads(prepare(tool, value)["userPrompt"])
    if tool == "create_prd":
        sections = [
            {
                "heading": heading,
                "items": [
                    {
                        "text": "Propose a one-week pilot; the product owner reviews whether copying time falls by 20% before expanding scope.",
                        "basis": "proposal",
                        "sourceIds": [],
                    }
                ],
            }
            for heading in payload["requiredSections"]
        ]
        if value.get("sources"):
            source = value["sources"][0]
            sections[0]["items"].append(
                {
                    "text": source["text"],
                    "basis": "simulation_hypothesis"
                    if source.get("origin") == "synthetic_transcript"
                    else "source_statement",
                    "sourceIds": [source["id"]],
                }
            )
        return {"title": "Team handoff tracker PRD", "sections": sections}
    if tool == "analyze_interviews":
        quote = payload["availableWholeTurnQuotes"][0]
        synthetic = (
            payload["corpus"]["documents"][0]["origin"] == "synthetic_transcript"
        )
        return {
            "quotes": [{"key": "quote-1", **quote}],
            "findings": [
                {
                    "key": "finding-1",
                    "category": "pain",
                    "statement": quote["text"],
                    "basis": "simulation_hypothesis"
                    if synthetic
                    else "source_statement",
                    "supportStatus": "supported",
                    "quoteKeys": ["quote-1"],
                    "questionIds": ["q1"],
                    "participantRefs": [
                        {
                            "documentId": quote["documentId"],
                            "participantId": quote["participantId"],
                        }
                    ],
                }
            ],
            "personas": [],
            "gaps": [],
            "limitations": [],
        }
    participants, interviews = [], []
    for slot in payload["plan"]:
        participants.append(
            {
                **slot,
                "displayName": "Fictional Operator",
                "biography": "A hypothetical operator coordinates a fictional small team's manual handoffs.",
                "motivations": ["Reduce repeated copying", "Make ownership explicit"],
                "painPoints": ["Repeated updates", "Unclear next owners"],
                "communicationStyle": "Direct and explicitly hypothetical.",
                "origin": "synthetic",
            }
        )
        group = next(
            row
            for row in payload["stakeholders"]
            if row["stakeholderId"] == slot["stakeholderId"]
        )
        interviews.append(
            {
                "participantId": slot["participantId"],
                "answers": [
                    {
                        "questionId": question["questionId"],
                        "text": "As a fictional operator, I might lose time checking which handoff update is current.",
                    }
                    for question in group["questions"]
                ],
            }
        )
    return {"participants": participants, "interviews": interviews}
