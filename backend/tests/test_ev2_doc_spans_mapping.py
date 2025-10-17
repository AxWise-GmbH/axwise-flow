import pytest

from backend.services.processing.evidence_linking_service import EvidenceLinkingService


def test_v2_doc_spans_mapping():
    svc = EvidenceLinkingService(None)
    svc.enable_v2 = True

    attributes = {
        "goals_and_motivations": {"value": "quick brown fox", "confidence": 0.7, "evidence": []},
        "key_quotes": {"value": "", "confidence": 0.7, "evidence": []},
    }

    doc1 = "lorem ipsum dolor sit amet"
    doc2 = "the quick brown fox jumps over the lazy dog"
    sep = "\n\n"
    scoped_text = doc1 + sep + doc2

    doc_spans = [
        {"document_id": "doc1", "start": 0, "end": len(doc1)},
        {"document_id": "doc2", "start": len(doc1) + len(sep), "end": len(doc1) + len(sep) + len(doc2)},
    ]

    enhanced, evidence_map = svc.link_evidence_to_attributes_v2(
        attributes,
        scoped_text=scoped_text,
        scope_meta={"speaker": "Alice", "doc_spans": doc_spans},
        protect_key_quotes=True,
    )

    items = evidence_map.get("goals_and_motivations", [])
    assert items, "Expected evidence items to be linked from second document"
    it = items[0]
    assert it.get("document_id") == "doc2"
    assert isinstance(it.get("start_char"), int) and isinstance(it.get("end_char"), int)
    # Local offsets must be within doc2 length
    assert 0 <= it["start_char"] < len(doc2)
    assert 0 < it["end_char"] <= len(doc2)

