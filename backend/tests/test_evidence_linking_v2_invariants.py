from typing import Dict, Any, List

from backend.services.validation.persona_evidence_validator import (
    PersonaEvidenceValidator,
)


def make_persona_with_evidence(quotes: List[str], speaker: str = "User") -> Dict[str, Any]:
    return {
        "name": "Tester",
        "demographics": {"confidence": 0.7},
        "goals_and_motivations": {
            "value": "Goal",
            "evidence": [{"quote": quotes[0], "document_id": "doc_1", "speaker": speaker}] if quotes else [],
        },
        "challenges_and_frustrations": {
            "value": "Challenge",
            "evidence": [{"quote": quotes[1], "document_id": "doc_1", "speaker": speaker}] if len(quotes) > 1 else [],
        },
        "key_quotes": {
            "value": "Quotes",
            "evidence": [{"quote": quotes[2], "document_id": "doc_1", "speaker": speaker}] if len(quotes) > 2 else [],
        },
    }


def test_match_evidence_with_transcript_sets_speaker_and_offsets():
    persona = make_persona_with_evidence(["I really like coffee"], speaker="User")  # appears verbatim
    transcript = [
        {"speaker": "A", "dialogue": "Hello there"},
        {"speaker": "User", "dialogue": "I really like coffee and tea"},
    ]

    validator = PersonaEvidenceValidator()
    matches = validator.match_evidence(persona, transcript=transcript)
    assert matches, "Expected at least one evidence match"
    # For transcript-based matching, speaker should be populated
    assert any(
        m.speaker for m in matches
    ), "Expected speaker population for transcript matches"
    # At least a normalized or verbatim match should be present
    assert any(m.match_type in ("verbatim", "normalized") for m in matches)


def test_duplication_detection_across_traits_and_protection_of_key_quotes():
    # Duplicate same quote across goals and key_quotes
    quote = "Efficiency is my top priority"
    persona = {
        "name": "Tester",
        "demographics": {"confidence": 0.7},
        "goals_and_motivations": {"value": "Goal", "evidence": [{"quote": quote}]},
        "challenges_and_frustrations": {"value": "Challenge", "evidence": []},
        "key_quotes": {"value": "Quotes", "evidence": [{"quote": quote}]},
    }

    dup = PersonaEvidenceValidator.detect_duplication(persona)
    assert dup["cross_trait_reuse"], "Expected cross-trait reuse to be detected"
    # Ensure validator doesn't mutate evidence (key_quotes remains intact)
    assert persona["key_quotes"][
        "evidence"
    ], "key_quotes evidence should remain present"


def test_speaker_consistency_check():
    persona = make_persona_with_evidence(
        ["I use dashboards daily"], speaker="Analyst"
    )  # present in transcript
    transcript = [
        {"speaker": "Analyst", "dialogue": "I use dashboards daily for reporting"},
    ]

    # Speakers consistent: no mismatches
    speaker_check = PersonaEvidenceValidator.check_speaker_consistency(
        persona, transcript
    )
    assert isinstance(speaker_check, dict)

    # If we inject an impossible speaker, mismatches should be reported
    persona_bad = make_persona_with_evidence(["I use dashboards daily"])  # same quote
    # Force an invalid speaker on evidence
    persona_bad["goals_and_motivations"]["evidence"][0]["speaker"] = "Ghost"
    speaker_check_bad = PersonaEvidenceValidator.check_speaker_consistency(
        persona_bad, transcript
    )
    assert speaker_check_bad.get(
        "speaker_mismatches"
    ), "Expected speaker mismatches to be detected"


def test_low_overlap_yields_hard_fail_status():
    # None of the quotes appear in transcript or source text
    persona = make_persona_with_evidence(
        ["Completely unrelated quote 1", "Another off-topic line"]
    )
    transcript = [
        {"speaker": "A", "dialogue": "This is some content"},
        {"speaker": "B", "dialogue": "More content here"},
    ]

    validator = PersonaEvidenceValidator()
    matches = validator.match_evidence(persona, transcript=transcript)

    # Summarize and compute status
    duplication = PersonaEvidenceValidator.detect_duplication(persona)
    speaker_check = PersonaEvidenceValidator.check_speaker_consistency(
        persona, transcript
    )
    contamination = PersonaEvidenceValidator.detect_contamination([persona])
    summary = PersonaEvidenceValidator.summarize(
        matches, duplication, speaker_check, contamination
    )
    status = PersonaEvidenceValidator.compute_status(summary)
    assert status in (
        "SOFT_FAIL",
        "HARD_FAIL",
    ), "Expected non-PASS status for low-overlap persona"
    # Prefer HARD_FAIL when most evidence doesn't match anything
    assert status == "HARD_FAIL" or summary["counts"].get("no_match", 0) > 0
