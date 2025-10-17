from backend.services.processing.evidence_linking_service import EvidenceLinkingService


def test_evidence_item_defaults_document_id_to_original_text_when_absent():
    svc = EvidenceLinkingService(None)
    quote = "manual processes"
    s, e = 5, 20
    meta = {"speaker": "Interviewee", "speaker_role": "Interviewee"}

    item = svc._evidence_item(quote, s, e, meta)

    assert item["quote"] == quote
    assert item["start_char"] == s
    assert item["end_char"] == e
    # Critical fallback expectation
    assert item["document_id"] == "original_text"


def test_evidence_item_keeps_provided_document_id_without_doc_spans():
    svc = EvidenceLinkingService(None)
    quote = "validation speed"
    s, e = 0, 10
    meta = {
        "speaker": "Interviewee",
        "speaker_role": "Interviewee",
        "document_id": "source_doc_1",
    }

    item = svc._evidence_item(quote, s, e, meta)

    assert item["document_id"] == "source_doc_1"

