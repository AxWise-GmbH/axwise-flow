import pytest

from backend.services.processing.persona_formation_v2.extractors import DemographicsExtractor


def test_age_extraction_from_numeric_age():
    ex = DemographicsExtractor()
    attributes = {
        "demographics": {
            "value": "Data analyst in fintech",
            "evidence": [
                "I'm 29 and I work in fintech.",
                "Switched to data three years ago.",
            ],
            "confidence": 0.7,
        }
    }
    out = ex.from_attributes(attributes)
    assert isinstance(out.get("value"), str)
    assert "Age: 25-34" in out["value"]


def test_age_extraction_from_decade_phrase_early_thirties():
    ex = DemographicsExtractor()
    attributes = {
        "demographics": {
            "value": "Product manager",
            "evidence": [
                "In my early thirties I transitioned into PM from QA.",
            ],
            "confidence": 0.7,
        }
    }
    out = ex.from_attributes(attributes)
    assert "Age: 25-34" in out["value"]


def test_age_extraction_from_late_fifties_question_sentence():
    ex = DemographicsExtractor()
    attributes = {
        "demographics": {
            "value": "Senior manager",
            "evidence": [
                "Are you in your late 50s?",  # ensure we don't drop lines with question marks
            ],
            "confidence": 0.7,
        }
    }
    out = ex.from_attributes(attributes)
    # late 50s should map into 55-64
    assert "Age: 55-64" in out["value"]


def test_age_extraction_handles_65_plus():
    ex = DemographicsExtractor()
    attributes = {
        "demographics": {
            "value": "Retired consultant",
            "evidence": [
                "I'm 65+ and advise startups occasionally.",
            ],
            "confidence": 0.7,
        }
    }
    out = ex.from_attributes(attributes)
    assert "Age: 65+" in out["value"]

