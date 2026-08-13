"""Behavioral contracts for Gemini completion and streaming deadlines."""

from __future__ import annotations

import asyncio
import importlib.util
import sys
import types
from pathlib import Path
from types import SimpleNamespace

import pytest
from google.genai.types import FinishReason


ROOT = Path(__file__).resolve().parents[3]
pytestmark = pytest.mark.contract


def _load_client_module(monkeypatch: pytest.MonkeyPatch) -> types.ModuleType:
    """Load the real client without importing unrelated report dependencies."""

    utils = types.ModuleType("backend.utils")
    utils.__path__ = []  # type: ignore[attr-defined]
    json_package = types.ModuleType("backend.utils.json")
    json_package.__path__ = []  # type: ignore[attr-defined]
    repair_module = types.ModuleType("backend.utils.json.json_repair")

    def repair_must_not_run(value: str) -> str:
        raise AssertionError(f"truncated output reached JSON repair: {value!r}")

    repair_module.repair_json = repair_must_not_run  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "backend.utils", utils)
    monkeypatch.setitem(sys.modules, "backend.utils.json", json_package)
    monkeypatch.setitem(
        sys.modules, "backend.utils.json.json_repair", repair_module
    )

    module_name = "_axwise_async_genai_client_contract"
    path = ROOT / "backend" / "services" / "llm" / "async_genai_client.py"
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, module_name, module)
    spec.loader.exec_module(module)
    return module


def test_max_tokens_is_rejected_before_parsed_or_json_repair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_client_module(monkeypatch)
    client = object.__new__(module.AsyncGenAIClient)
    response = SimpleNamespace(
        parsed={"apparently": "valid"},
        text='{"apparently":',
        candidates=[SimpleNamespace(finish_reason=FinishReason.MAX_TOKENS)],
    )

    with pytest.raises(module.LLMResponseParseError) as caught:
        asyncio.run(client._parse_response(response, module.TaskType.PRD_GENERATION))

    assert "MAX_TOKENS" in str(caught.value)
    assert caught.value.response_text == '{"apparently":'


def test_stop_is_accepted_and_stream_sentinel_is_not_a_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_client_module(monkeypatch)
    client = object.__new__(module.AsyncGenAIClient)
    response = SimpleNamespace(
        parsed={"complete": True},
        candidates=[SimpleNamespace(finish_reason=FinishReason.STOP)],
    )

    assert asyncio.run(
        client._parse_response(response, module.TaskType.PRD_GENERATION)
    ) == {"complete": True}
    assert client._finish_reason_name(FinishReason.FINISH_REASON_UNSPECIFIED) is None


def test_mid_stream_stall_honors_total_deadline_and_closes_iterator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_client_module(monkeypatch)
    client = object.__new__(module.AsyncGenAIClient)
    client.default_model = "models/gemini-3.7-flash"

    class HangingStream:
        closed = False

        def __aiter__(self):
            return self

        async def __anext__(self):
            await asyncio.Event().wait()

        async def aclose(self) -> None:
            self.closed = True

    stream = HangingStream()

    async def open_stream(*args, **kwargs):
        del args, kwargs
        return stream, asyncio.get_running_loop().time() + 0.01

    client._generate_stream_with_retry = open_stream
    monkeypatch.setattr(
        module.GenAIConfigFactory,
        "create_config",
        lambda *args, **kwargs: object(),
    )

    async def consume() -> None:
        async for _chunk in client.generate_content_stream(
            module.TaskType.TEXT_GENERATION, "prompt", max_retries=1
        ):
            pass

    with pytest.raises(module.LLMAPIError) as caught:
        asyncio.run(consume())

    assert caught.value.status_code == 408
    assert stream.closed is True


def test_stream_cancellation_propagates_and_closes_iterator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_client_module(monkeypatch)
    client = object.__new__(module.AsyncGenAIClient)
    client.default_model = "models/gemini-3.7-flash"

    class HangingStream:
        closed = False
        started = asyncio.Event()

        def __aiter__(self):
            return self

        async def __anext__(self):
            self.started.set()
            await asyncio.Event().wait()

        async def aclose(self) -> None:
            self.closed = True

    stream = HangingStream()

    async def open_stream(*args, **kwargs):
        del args, kwargs
        return stream, asyncio.get_running_loop().time() + 60.0

    client._generate_stream_with_retry = open_stream
    monkeypatch.setattr(
        module.GenAIConfigFactory,
        "create_config",
        lambda *args, **kwargs: object(),
    )

    async def exercise() -> None:
        generator = client.generate_content_stream(
            module.TaskType.TEXT_GENERATION, "prompt", max_retries=1
        )
        consumer = asyncio.create_task(generator.__anext__())
        await stream.started.wait()
        consumer.cancel()
        with pytest.raises(asyncio.CancelledError):
            await consumer

    asyncio.run(exercise())
    assert stream.closed is True
