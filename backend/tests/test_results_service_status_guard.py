from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.results_service import ResultsService


def _service_for(row):
    query = MagicMock()
    query.join.return_value = query
    query.filter.return_value = query
    query.first.return_value = row
    db = MagicMock()
    db.query.return_value = query
    return ResultsService(db, SimpleNamespace(user_id="user-1"))


def test_processing_row_is_not_formatted_as_completed():
    row = SimpleNamespace(
        result_id=42,
        status="processing",
        results={
            "status": "processing",
            "progress": 0.4,
            "current_stage": "THEME_EXTRACTION",
            "message": "Extracting themes",
        },
        error_message=None,
    )

    response = _service_for(row).get_analysis_result(42)

    assert response == {
        "status": "processing",
        "result_id": 42,
        "message": "Extracting themes",
        "progress": 0.4,
        "current_stage": "THEME_EXTRACTION",
    }


def test_failed_row_returns_error_instead_of_completed():
    row = SimpleNamespace(
        result_id=43,
        status="failed",
        results={"themes": ["partial output"]},
        error_message="Provider failed",
    )

    response = _service_for(row).get_analysis_result(43)

    assert response == {
        "status": "error",
        "result_id": 43,
        "error": "Provider failed",
    }
