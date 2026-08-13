from types import SimpleNamespace

import pytest

from backend.services.results.query import AnalysisResultQuery


class _FakeRepo:
    def __init__(self):
        self.args = []
        self._row = None

    def set_row(self, row):
        self._row = row

    def get_by_id(self, result_id: int, user_id: str):
        self.args.append((result_id, user_id))
        return self._row


class _FakeSession:
    pass


def test_query_returns_none_when_repo_none(monkeypatch):
    fake_repo = _FakeRepo()

    # Patch the repository used by the query layer
    import backend.services.results.query as qmod

    monkeypatch.setattr(qmod, "AnalysisResultRepository", lambda db: fake_repo, raising=True)

    q = AnalysisResultQuery(_FakeSession())
    out = q.get_owned_result_dto(result_id=999, user_id="u1")

    assert out is None
    assert fake_repo.args == [(999, "u1")]


def test_query_maps_row_to_dto(monkeypatch):
    fake_repo = _FakeRepo()
    row = SimpleNamespace(
        result_id=123,
        data_id=7,
        analysis_date="2025-09-21T15:47:20.101122",
        status="completed",
        llm_provider="gemini",
        llm_model="models/gemini-3.7-flash",
        results={"k": "v"},
    )
    fake_repo.set_row(row)

    import backend.services.results.query as qmod

    monkeypatch.setattr(qmod, "AnalysisResultRepository", lambda db: fake_repo, raising=True)

    q = AnalysisResultQuery(_FakeSession())
    dto = q.get_owned_result_dto(result_id=123, user_id="u1")

    assert dto is not None
    assert dto.result_id == 123
    assert dto.data_id == 7
    assert dto.status == "completed"
    assert dto.llm_provider == "gemini"
    assert dto.llm_model == "models/gemini-3.7-flash"
    assert dto.results == {"k": "v"}
