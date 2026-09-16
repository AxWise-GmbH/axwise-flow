from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import OperationalError

from backend.api.routes.perpetual_personas import _assert_ownership
from backend.models import AnalysisResult, InterviewData

pytestmark = pytest.mark.contract


class _Query:
    def __init__(self, value=None, error=None):
        self._value = value
        self._error = error

    def filter(self, *_args):
        return self

    def first(self):
        if self._error:
            raise self._error
        return self._value


class _Database:
    def __init__(self, *, result, interview=None, interview_error=None):
        self.result = result
        self.interview = interview
        self.interview_error = interview_error

    def query(self, model):
        if model is AnalysisResult:
            return _Query(self.result)
        if model is InterviewData:
            return _Query(self.interview, self.interview_error)
        raise AssertionError(f"unexpected model: {model}")


def test_perpetual_persona_ownership_accepts_only_the_owner():
    result = SimpleNamespace(result_id=7, data_id=11)
    database = _Database(
        result=result,
        interview=SimpleNamespace(id=11, user_id="owner-1"),
    )

    assert _assert_ownership(database, 7, SimpleNamespace(user_id="owner-1")) is result


def test_perpetual_persona_ownership_does_not_swallow_forbidden():
    database = _Database(
        result=SimpleNamespace(result_id=7, data_id=11),
        interview=SimpleNamespace(id=11, user_id="owner-1"),
    )

    with pytest.raises(HTTPException) as raised:
        _assert_ownership(database, 7, SimpleNamespace(user_id="attacker"))

    assert raised.value.status_code == 403


@pytest.mark.parametrize(
    ("interview", "user", "expected_status"),
    [
        (None, SimpleNamespace(user_id="owner-1"), 404),
        (SimpleNamespace(id=11, user_id=None), SimpleNamespace(user_id="owner-1"), 403),
        (SimpleNamespace(id=11, user_id="owner-1"), None, 403),
    ],
)
def test_perpetual_persona_ownership_fails_closed_without_identity(
    interview, user, expected_status
):
    database = _Database(
        result=SimpleNamespace(result_id=7, data_id=11),
        interview=interview,
    )

    with pytest.raises(HTTPException) as raised:
        _assert_ownership(database, 7, user)

    assert raised.value.status_code == expected_status


def test_perpetual_persona_ownership_fails_closed_when_lookup_breaks():
    database = _Database(
        result=SimpleNamespace(result_id=7, data_id=11),
        interview_error=OperationalError(
            "select", {}, Exception("database unavailable")
        ),
    )

    with pytest.raises(HTTPException) as raised:
        _assert_ownership(database, 7, SimpleNamespace(user_id="owner-1"))

    assert raised.value.status_code == 503
