import pytest

from backend.services.validation.persona_evidence_validator import PersonaEvidenceValidator


def test_timestamp_and_interviewee_prefix_matching_transcript():
    validator = PersonaEvidenceValidator()
    transcript = [
        {
            "speaker": "Interviewee",
            "dialogue": (
                "Beyond the sheer time commitment, which is substantial, the biggest "
                "strategic challenge we face is truly validating the scalability and "
                "long-term viability of deeply niche, often nascent, market segments."
            ),
        }
    ]
    quote = (
        "[12:40] Interviewee: Beyond the sheer time commitment, which is substantial, "
        "the biggest strategic challenge we face is truly validating the scalability "
        "and long-term viability of deeply niche, often nascent, market segments."
    )

    mtype, s, e, sp = validator._find_in_transcript(transcript, quote)
    assert mtype in ("verbatim", "normalized")
    assert sp == "Interviewee"


def test_match_evidence_with_prefixes_counts_as_match():
    validator = PersonaEvidenceValidator()
    transcript = [
        {
            "speaker": "Interviewee",
            "dialogue": (
                "For me, personally, it would free up my time and the team's time from "
                "the laborious data gathering and synthesis, allowing us to focus on "
                "the higher-value strategic work – interpreting the insights, refining "
                "the venture concept, building out the business model, and engaging "
                "with potential founders or partners."
            ),
        }
    ]
    quote = (
        "[15:01] Interviewee: For me, personally, it would free up my time and the "
        "team's time from the laborious data gathering and synthesis, allowing us to "
        "focus on the higher-value strategic work – interpreting the insights, "
        "refining the venture concept, building out the business model, and engaging "
        "with potential founders or partners."
    )

    persona = {
        "name": "Sample",
        "goals_and_motivations": {
            "value": "",
            "evidence": [
                {"quote": quote, "speaker": "Interviewee", "document_id": "original_text"}
            ],
        },
    }

    matches = validator.match_evidence(persona_ssot=persona, source_text=None, transcript=transcript)
    assert any(m.match_type != "no_match" for m in matches), "Expected at least one match"

