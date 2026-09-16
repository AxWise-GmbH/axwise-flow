"""Offline evidence-stage instrumentation; never a change to admission policy."""

from __future__ import annotations

import asyncio
import copy
import socket
from collections.abc import Mapping

import pytest

from backend.domain.workflow_v2.contracts import canonical_hash
from backend.services.workflow_v2.exact_span_extractor import (
    ExactSpanExtractionRequest,
)
from backend.services.workflow_v2.resilient_research_runner import (
    ResilientResearchRunner,
)
from backend.tests.workflow_v2.test_resilient_research_runner import (
    EmptyExtractor,
    ExactExtractor,
    FakePrimary,
    FakeSearx,
    discovery,
    document,
    metered_transient,
    server_query,
)


pytestmark = pytest.mark.contract
OFFICIAL = "https://docs.example.org/reference"
SECOND = "https://docs.example.org/second-reference"
OUTSIDE = "https://outside.example.net/reference"
EXACT = "The public rule requires an identified responsible operator."


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("Evidence diagnostics tests must not contact a network")

    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)


async def run_case(case, *, count_overrides=None, state=None):
    """One fixed primary call, one discovery attempt, and controlled local fakes."""
    state = {} if state is None else state
    primary_raw = metered_transient("response_processing_error")
    primary_raw["text"] = "Private primary prose; not source evidence."
    # Existing circuit bookkeeping sets this retry hint on transient results.
    # Preseed that known value so immutable snapshots isolate new mutations.
    primary_raw["runtime_diagnostics"].update(
        elapsed_ms=17,
        retry_count=0,
        retry_after_seconds=450,
    )
    if case == "primary_success":
        primary_raw["search_performed"] = True
    if case == "primary_ineligible":
        primary_raw["runtime_diagnostics"]["status"] = "invalid_query"
    if case == "unknown_primary_queries":
        del primary_raw["provider_queries"]
    if case == "empty_primary_queries":
        primary_raw["provider_queries"] = []
    rows = [{"url": OFFICIAL, "title": "Official fixture"}]
    if case in {"mixed_rejection", "postfetch_no_claims"}:
        rows.append({"url": OUTSIDE, "title": "Outside fixture"})
    if case == "no_admitted":
        rows = [{"url": OUTSIDE, "title": "Outside fixture"}]
    if case in {"empty_complete", "incomplete_query"}:
        rows = []
    if case in {"fetch_timeout", "fetch_cancel", "duplicate_document"}:
        rows.append({"url": SECOND, "title": "Second official fixture"})
    if case == "bounded_candidates":
        rows = [
            {
                "url": f"https://docs.example.org/reference-{index}",
                "title": "Official fixture",
            }
            for index in range(5)
        ]
    if case == "duplicate_discovery":
        rows.append(copy.deepcopy(rows[0]))
    if case == "malformed_mixed":
        rows.append("Malformed discovery source row")
    discovery_raw = discovery(
        sources=rows, status="ok" if rows else "empty", search_performed=bool(rows)
    )
    discovery_raw["runtime_diagnostics"].update(
        result_count=len(rows),
        invalid_result_count=0,
        elapsed_ms=9,
        call_count=1,
        retry_count=0,
    )
    if case == "discovery_unavailable":
        discovery_raw = discovery(status="unavailable", search_performed=False)
    if case == "unknown_discovery_counts":
        del discovery_raw["runtime_diagnostics"]["result_count"]
        del discovery_raw["runtime_diagnostics"]["invalid_result_count"]
    if count_overrides is not None:
        discovery_raw["runtime_diagnostics"].update(count_overrides)

    state.update(
        primary_raw=primary_raw,
        discovery_raw=discovery_raw,
        primary_before=copy.deepcopy(primary_raw),
        discovery_before=copy.deepcopy(discovery_raw),
        fetched=[],
        extraction_requests=[],
        started=asyncio.Event(),
        cancelled=asyncio.Event(),
    )

    async def block():
        state["started"].set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            state["cancelled"].set()
            raise

    class ControlledSearx(FakeSearx):
        async def search_web_general(self, query):
            if case in {"discovery_timeout", "discovery_cancel"}:
                self.queries.append(query)
                await block()
            if case == "discovery_error":
                self.queries.append(query)
                raise ValueError("Private discovery exception text")
            return await super().search_web_general(query)

    async def fetch(url):
        state["fetched"].append(url)
        if case == "fetch_failed":
            raise OSError("Private publisher exception text")
        if case in {"fetch_timeout", "fetch_cancel"} and url == SECOND:
            await block()
        if case == "invalid_fetched_document":
            return document(OUTSIDE, EXACT)
        if case == "duplicate_document":
            url = OFFICIAL
        text = f"Publisher introduction. {EXACT} Publisher appendix."
        if case == "ambiguous_span":
            text = f"{EXACT} {EXACT}"
        return document(url, text)

    class ControlledExtractor:
        async def extract(self, request):
            state["extraction_requests"].append(request)
            if case in {"extraction_timeout", "extraction_cancel"}:
                await block()
            if case == "extraction_error":
                raise ValueError("Private extraction exception text")
            if case in {"postfetch_no_claims", "postfetch_empty_clean"}:
                return await EmptyExtractor(input_tokens=7, output_tokens=2).extract(
                    request
                )
            if case == "document_mismatch":
                altered = request.documents[0].model_copy(
                    update={"document_id": "unrequested-document"}
                )
                request = ExactSpanExtractionRequest(
                    requirement_query=request.requirement_query,
                    documents=[altered],
                )
            return await ExactExtractor(EXACT, input_tokens=7, output_tokens=2).extract(
                request
            )

    primary = FakePrimary(primary_raw)
    searx = ControlledSearx(discovery_raw)
    runner = ResilientResearchRunner(
        primary,
        searxng=searx,
        fetcher=fetch,
        extractor=None if case == "extractor_unavailable" else ControlledExtractor(),
        source_type_classifier=lambda _url, _title: {"government"},
        monotonic_clock=lambda: 100.0,
        fallback_phase_seconds=0.02 if case.endswith("_timeout") else 60.0,
        discovery_seconds=0.02 if case == "discovery_timeout" else 10.0,
    )
    state.update(primary=primary, searx=searx, runner=runner)
    query = server_query(
        allowed_hosts=["docs.example.org"],
        accepted_source_types=["government"],
        description=(
            "x" * 561 if case == "incomplete_query" else "Verify the public rule."
        ),
    )
    if case == "invalid_context":
        query = query.replace('"geography":[', '"geography": [', 1)
    try:
        state["result"] = await runner.search(query)
        return state
    finally:
        await runner.close()
        assert primary_raw == state["primary_before"]
        assert discovery_raw == state["discovery_before"]


def evidence(state):
    return state["result"]["runtime_diagnostics"]["evidence"]


def fallback_status(state):
    diagnostics = state["result"]["runtime_diagnostics"]
    return diagnostics.get("fallback", diagnostics)["status"]


def without_evidence(value):
    result = copy.deepcopy(value)
    result.get("runtime_diagnostics", {}).pop("evidence", None)
    return result


# Full raw-result hashes captured from exact baseline 241e3f61 before adding
# instrumentation. Fixed clocks/documents make status, output, provenance,
# usage, retry and existing diagnostics comparisons deterministic.
BASELINE_HASHES = {
    "official_only": "e40a9d2134a1af9c74cb9bb176d7945f56429c6b5360298ffbb46198b3b5c223",
    "mixed_rejection": "ae5febabaead6306c9d63682b7d75a43d36f5ce22416886de9f43b4fc329faa4",
    "empty_complete": "ded851cac50606e54a9faf1bec443b1b6ba502b47bfeaa822f2d29fd1b044b86",
    "no_admitted": "126386ae460bcd8f9e444760a6aa3483e884c1591d8085ce043eb80953044807",
    "postfetch_no_claims": "b84c633d5bee91650add088c636c48ed7aab7dbb9a13d6af07460835258c3e49",
    "postfetch_empty_clean": "39f4889bdab5b27cfd0eedd4850134b152e9bcf104795705f2c828228a118e5a",
    "fetch_failed": "7bdc7b48756c7bbd89d7f04499ed251b4c9e4ccb33794fd0a523f4b4978a9b1d",
    "invalid_fetched_document": "4447ff2dc6decc390a2f14b9b7d1082c8b8b54cc7f3eab5aa409488c98ef8f2e",
    "extraction_timeout": "fc3921dc762f32c05868f5ef40670968e4055ce7a7fa6eb11694ebc5007e0cdc",
    "fetch_timeout": "041ba896bf82bc07c516df80643ce0b3a4fbec1764876f0c5336994ab6af9bd3",
    "discovery_timeout": "69d28d2c7e636afb3b0f232dffaf5df61d0bc55a62c370da887a31272f8044d2",
    "discovery_error": "7f97fa7dd0ef72df648516d15c8952b48fbfdeec2fc93340c9a35cc3eb2f6066",
    "discovery_unavailable": "47a59b66d9b4025d817155772df2974dff918e17d2f5b93b66a862bd6afd8de0",
    "invalid_context": "0a6d294c077e069c7b332b4236e95ea90d4a459f148c7968faddabfe5fdf4d93",
    "incomplete_query": "d402cfdaf2decc939d9b6dad4ec499015f5ee0d19cc6e98c06c9c03c16e7ef0e",
    "extractor_unavailable": "5ed8ec23749f28c089f6f28c4844e09bd90337506b3984e16a06c84c8ba121ce",
    "extraction_error": "3d257071340cf0c590df8b05935d467ba0e7600512db60869e093197df5211dc",
    "document_mismatch": "d58c0510da703378b61b79357898157ef4d60f53ad1d325d7a2e942891d20e83",
    "ambiguous_span": "d103f198664226ad6ccd1e63aeec68fa2f262b9db2346174ca6de0a69490cb3a",
    "unknown_primary_queries": "d6d01da42fe7005f6d1ce0bf7cb98b6afe670d7b4ad313d33a70af0fdeee2e4f",
    "unknown_discovery_counts": "e40a9d2134a1af9c74cb9bb176d7945f56429c6b5360298ffbb46198b3b5c223",
}


@pytest.mark.asyncio
@pytest.mark.parametrize("case,expected_hash", list(BASELINE_HASHES.items()))
async def test_existing_raw_result_is_identical_except_new_evidence(
    case, expected_hash
):
    state = await run_case(case)
    assert canonical_hash(without_evidence(state["result"])) == expected_hash


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case,rejected,discovered",
    [
        ("official_only", 0, 1),
        ("mixed_rejection", 1, 2),
    ],
)
async def test_validated_success_records_resolved_claims_and_discovery_counts(
    case, rejected, discovered
):
    state = await run_case(case)
    assert state["result"]["search_performed"] is True
    assert [claim["text"] for claim in state["result"]["claims"]] == [EXACT]
    assert evidence(state) == {
        "stage": "extraction",
        "query_complete": True,
        "discovery_result_count": discovered,
        "discovery_invalid_result_count": 0,
        "candidate_count": 1,
        "fetched_count": 1,
        "fetch_error_count": 0,
        "validation_incomplete_count": 0,
        "rejected_candidate_count": rejected,
        "malformed_candidate_count": 0,
        "omitted_candidate_count": 0,
        "claim_count": 1,
        "primary_provider_query_count": 2,
        "discovery_canonical_url_rejected_count": 0,
        "discovery_allowed_host_rejected_count": rejected,
        "discovery_owner_root_rejected_count": 0,
        "discovery_source_type_rejected_count": 0,
        "primary_locator_rejected_count": 0,
    }
    assert len(state["primary"].queries) == len(state["searx"].queries) == 1
    assert state["fetched"] == [OFFICIAL]
    assert len(state["extraction_requests"]) == 1


@pytest.mark.asyncio
async def test_same_rows_incomplete_status_distinguishes_admission_from_extraction():
    before_fetch = await run_case("no_admitted")
    after_fetch = await run_case("postfetch_no_claims")
    assert (
        fallback_status(before_fetch)
        == fallback_status(after_fetch)
        == "discovery_rows_incomplete"
    )
    assert evidence(before_fetch)["stage"] == "admission"
    assert evidence(before_fetch)["candidate_count"] == 0
    assert evidence(before_fetch)["fetched_count"] == 0
    assert evidence(after_fetch)["stage"] == "extraction"
    assert evidence(after_fetch)["candidate_count"] == 1
    assert evidence(after_fetch)["fetched_count"] == 1
    for state in (before_fetch, after_fetch):
        assert state["result"]["search_performed"] is False
        assert (
            state["result"]["runtime_diagnostics"]["status"]
            == "response_processing_error"
        )
        assert evidence(state)["rejected_candidate_count"] == 1
        assert evidence(state)["claim_count"] == 0
        assert evidence(state)["query_complete"] is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case,status,stage",
    [
        ("empty_complete", "empty", "admission"),
        ("incomplete_query", "discovery_query_incomplete", "admission"),
        ("postfetch_empty_clean", "empty", "extraction"),
    ],
)
async def test_completed_empty_branch_has_actual_zero_claim_count(case, status, stage):
    state = await run_case(case)
    assert fallback_status(state) == status
    assert evidence(state)["stage"] == stage
    assert evidence(state)["claim_count"] == 0
    assert evidence(state)["query_complete"] is (case != "incomplete_query")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case,status,validation,rejected",
    [
        ("fetch_failed", "direct_fetch_error", 0, 0),
        ("invalid_fetched_document", "direct_fetch_incomplete", 1, 1),
    ],
)
async def test_completed_fetch_failures_record_observed_counts_without_false_claim_zero(
    case, status, validation, rejected
):
    state = await run_case(case)
    result = evidence(state)
    assert fallback_status(state) == status
    assert result["stage"] == "fetch"
    assert result["candidate_count"] == 1
    assert result["fetched_count"] == 0
    assert result["fetch_error_count"] == (1 if case == "fetch_failed" else 0)
    assert result["validation_incomplete_count"] == validation
    assert result["rejected_candidate_count"] == rejected
    assert "claim_count" not in result
    assert not state["extraction_requests"]


@pytest.mark.asyncio
async def test_partial_fetch_timeout_does_not_turn_completed_subtask_into_batch_counts():
    state = await run_case("fetch_timeout")
    result = evidence(state)
    assert state["fetched"] == [OFFICIAL, SECOND]
    assert state["cancelled"].is_set()
    assert fallback_status(state) == "fallback_deadline_exceeded"
    assert result["stage"] == "fetch"
    assert result["candidate_count"] == 2
    for field in (
        "fetched_count",
        "fetch_error_count",
        "validation_incomplete_count",
        "claim_count",
    ):
        assert field not in result
    # Existing fallback diagnostics are intentionally untouched, even though
    # their old synthetic timeout counts must not be reused as evidence facts.
    assert state["result"]["runtime_diagnostics"]["fallback"]["fetch_error_count"] == 2
    assert not state["extraction_requests"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case,status",
    [
        ("extraction_timeout", "fallback_deadline_exceeded"),
        ("extraction_error", "extraction_error"),
        ("document_mismatch", "extraction_document_mismatch"),
    ],
)
async def test_unresolved_extraction_keeps_known_fetch_counts_but_no_claim_count(
    case, status
):
    state = await run_case(case)
    result = evidence(state)
    assert result["stage"] == "extraction"
    assert result["fetched_count"] == 1
    assert result["fetch_error_count"] == result["validation_incomplete_count"] == 0
    assert "claim_count" not in result
    assert fallback_status(state) == status
    assert len(state["extraction_requests"]) == 1
    if case == "extraction_timeout":
        assert state["cancelled"].is_set()
        assert state["result"]["usage_metadata"]["usage_complete"] is False


@pytest.mark.asyncio
async def test_completed_exact_span_rejection_records_zero_validated_claims():
    state = await run_case("ambiguous_span")
    assert fallback_status(state) == "extraction_span_not_unique"
    assert evidence(state)["stage"] == "extraction"
    assert evidence(state)["claim_count"] == 0


@pytest.mark.asyncio
async def test_missing_extractor_did_not_enter_extraction():
    state = await run_case("extractor_unavailable")
    assert fallback_status(state) == "exact_span_extractor_unavailable"
    assert evidence(state)["stage"] == "fetch"
    assert evidence(state)["fetched_count"] == 1
    assert "claim_count" not in evidence(state)
    assert not state["extraction_requests"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case", ["discovery_timeout", "discovery_error", "discovery_unavailable"]
)
async def test_failed_discovery_omits_all_unknown_later_phase_counts(case):
    state = await run_case(case)
    assert evidence(state) == {
        "stage": "discovery",
        "query_complete": True,
        "primary_provider_query_count": 2,
    }
    assert len(state["primary"].queries) == len(state["searx"].queries) == 1
    assert not state["fetched"] and not state["extraction_requests"]


@pytest.mark.asyncio
async def test_invalid_context_has_no_invented_query_or_discovery_facts():
    state = await run_case("invalid_context")
    assert evidence(state) == {"stage": "context", "primary_provider_query_count": 2}
    assert fallback_status(state) == "invalid_canonical_input"
    assert not state["searx"].queries and not state["fetched"]


@pytest.mark.asyncio
async def test_missing_provider_query_and_discovery_receipts_remain_absent():
    primary_unknown = await run_case("unknown_primary_queries")
    discovery_unknown = await run_case("unknown_discovery_counts")
    assert "primary_provider_query_count" not in evidence(primary_unknown)
    assert "discovery_result_count" not in evidence(discovery_unknown)
    assert "discovery_invalid_result_count" not in evidence(discovery_unknown)
    assert evidence(discovery_unknown)["candidate_count"] == 1


@pytest.mark.asyncio
async def test_explicit_empty_provider_query_receipt_is_observed_zero_not_missing():
    state = await run_case("empty_primary_queries")
    assert evidence(state)["primary_provider_query_count"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case,discovered,candidates,fetched,omitted",
    [
        ("bounded_candidates", 5, 3, 3, 2),
        ("duplicate_discovery", 2, 1, 1, 0),
        ("duplicate_document", 2, 2, 1, 0),
    ],
)
async def test_counts_reflect_bounded_deduplicated_admission_and_validated_documents(
    case, discovered, candidates, fetched, omitted
):
    state = await run_case(case)
    result = evidence(state)
    assert result["discovery_result_count"] == discovered
    assert result["candidate_count"] == candidates
    assert result["fetched_count"] == fetched
    assert result["omitted_candidate_count"] == omitted
    assert result["fetch_error_count"] == result["validation_incomplete_count"] == 0
    assert result["claim_count"] == 1
    assert len(state["fetched"]) == candidates


@pytest.mark.asyncio
async def test_malformed_count_combines_observed_rows_with_only_valid_adapter_receipt():
    state = await run_case(
        "malformed_mixed", count_overrides={"invalid_result_count": 2}
    )
    assert evidence(state)["malformed_candidate_count"] == 3
    assert evidence(state)["discovery_invalid_result_count"] == 2
    overflow = await run_case(
        "malformed_mixed", count_overrides={"invalid_result_count": 10_000}
    )
    assert evidence(overflow)["discovery_invalid_result_count"] == 10_000
    assert "malformed_candidate_count" not in evidence(overflow)
    assert (
        overflow["result"]["runtime_diagnostics"]["malformed_candidate_count"] == 10_001
    )


class IntSubclass(int):
    pass


class HostileOptionalDiagnostics(dict):
    """Existing status/timing reads work; new receipt getters must not run."""

    def get(self, key, default=None):
        if key in {"result_count", "invalid_result_count"}:
            raise RuntimeError("Optional diagnostics must not change behavior")
        return super().get(key, default)

    def __bool__(self):
        raise RuntimeError("Optional diagnostic truth testing is not safe")


class HostileDiscoveryMapping(Mapping):
    def __init__(self, status):
        self.data = {"route": "searxng", "status": status}

    def __getitem__(self, key):
        return self.data[key]

    def __iter__(self):
        return iter(self.data)

    def __len__(self):
        return len(self.data)

    def get(self, key, default=None):
        if key in {"result_count", "invalid_result_count"}:
            raise RuntimeError("Optional diagnostics must not change behavior")
        return self.data.get(key, default)

    def __bool__(self):
        raise RuntimeError("Optional diagnostic truth testing is not safe")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,collision_field",
    [
        ("unavailable", "result_count"),
        ("unavailable", "invalid_result_count"),
        ("empty", "result_count"),
    ],
)
async def test_optional_receipts_do_not_compare_colliding_nonstring_dictionary_keys(
    status, collision_field
):
    comparisons = []

    class CollisionKey:
        def __hash__(self):
            return hash(collision_field)

        def __eq__(self, other):
            comparisons.append(other)
            raise RuntimeError("New optional receipt read invoked a hostile key")

    response = discovery(status=status, search_performed=False)
    response["runtime_diagnostics"][CollisionKey()] = "Private provider metadata"
    runner = ResilientResearchRunner(
        FakePrimary(metered_transient("response_processing_error")),
        searxng=FakeSearx(response),
        fetcher=None,
        monotonic_clock=lambda: 100.0,
    )
    try:
        result = await runner.search(server_query())
    finally:
        await runner.close()
    observed = result["runtime_diagnostics"]["evidence"]
    phase = result["runtime_diagnostics"].get("fallback", result["runtime_diagnostics"])
    assert phase["status"] == status
    assert observed["stage"] == ("admission" if status == "empty" else "discovery")
    assert "discovery_result_count" not in observed
    assert "discovery_invalid_result_count" not in observed
    assert "malformed_candidate_count" not in observed
    assert not comparisons


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["empty", "unavailable"])
@pytest.mark.parametrize(
    "diagnostics_type", [HostileOptionalDiagnostics, HostileDiscoveryMapping]
)
async def test_optional_instrumentation_does_not_invoke_custom_mapping_receipt_getters(
    status, diagnostics_type
):
    raw_diagnostics = (
        diagnostics_type(route="searxng", status=status)
        if diagnostics_type is HostileOptionalDiagnostics
        else diagnostics_type(status)
    )
    response = discovery(status=status, search_performed=False)
    response["runtime_diagnostics"] = raw_diagnostics
    runner = ResilientResearchRunner(
        FakePrimary(metered_transient("response_processing_error")),
        searxng=FakeSearx(response),
        fetcher=None,
        monotonic_clock=lambda: 100.0,
    )
    try:
        result = await runner.search(server_query())
    finally:
        await runner.close()
    observed = result["runtime_diagnostics"]["evidence"]
    assert observed["stage"] == ("admission" if status == "empty" else "discovery")
    assert "discovery_result_count" not in observed
    assert "discovery_invalid_result_count" not in observed
    assert "malformed_candidate_count" not in observed
    phase = result["runtime_diagnostics"].get("fallback", result["runtime_diagnostics"])
    assert phase["status"] == status


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "bad", [True, False, "1", 1.0, -1, 10_001, None, [], {}, IntSubclass(1)]
)
async def test_untrusted_discovery_counts_are_not_coerced_or_blessed_in_aggregate(bad):
    state = await run_case(
        "mixed_rejection",
        count_overrides={
            "result_count": bad,
            "invalid_result_count": bad,
            "query": "Private query text",
            "url": OUTSIDE,
            "stage": "context",
            "query_complete": False,
            "candidate_count": 999,
            "evidence": {
                "stage": "extraction",
                "claim_count": 999,
                "secret": "private",
            },
        },
    )
    result = evidence(state)
    assert "discovery_result_count" not in result
    assert "discovery_invalid_result_count" not in result
    assert "malformed_candidate_count" not in result
    assert result["rejected_candidate_count"] == 1
    assert result["claim_count"] == 1
    assert result["candidate_count"] == 1
    assert result["query_complete"] is True
    assert not ({"query", "url", "evidence", "secret"} & result.keys())
    assert all(type(value) in {str, int, bool} for value in result.values())
    assert all(
        type(value) is not str or value == "extraction" for value in result.values()
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [0, 10_000])
async def test_strict_bounded_adapter_receipts_are_retained_before_phase_projection(
    count,
):
    state = await run_case(
        "official_only",
        count_overrides={
            "result_count": count,
            "invalid_result_count": count,
        },
    )
    assert evidence(state)["discovery_result_count"] == count
    assert evidence(state)["discovery_invalid_result_count"] == count
    assert evidence(state)["malformed_candidate_count"] == count
    assert "result_count" not in state["result"]["runtime_diagnostics"]["discovery"]


@pytest.mark.asyncio
@pytest.mark.parametrize("phase", ["discovery", "fetch", "extraction"])
async def test_parent_cancellation_propagates_without_fabricating_final_evidence(phase):
    state = {}
    task = asyncio.create_task(run_case(f"{phase}_cancel", state=state))

    async def await_started():
        while "started" not in state:
            await asyncio.sleep(0)
        await state["started"].wait()

    await asyncio.wait_for(await_started(), timeout=1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert "result" not in state
    assert state["cancelled"].is_set()
    assert len(state["primary"].queries) == len(state["searx"].queries) == 1
    assert state["primary_raw"] == state["primary_before"]
    assert state["discovery_raw"] == state["discovery_before"]


@pytest.mark.asyncio
@pytest.mark.parametrize("case", ["primary_success", "primary_ineligible"])
async def test_no_fallback_still_returns_primary_by_identity_and_adds_nothing(case):
    state = await run_case(case)
    assert state["result"] is state["primary_raw"]
    assert "evidence" not in state["result"]["runtime_diagnostics"]
    assert not state["searx"].queries and not state["fetched"]


@pytest.mark.asyncio
async def test_evidence_snapshot_does_not_alias_input_diagnostics_or_another_result():
    first = await run_case("official_only")
    second = await run_case("no_admitted")
    snapshot = copy.deepcopy(evidence(first))
    first["discovery_raw"]["runtime_diagnostics"]["result_count"] = 999
    second["result"]["runtime_diagnostics"]["evidence"]["candidate_count"] = 999
    assert evidence(first) == snapshot
    assert "evidence" not in first["primary_raw"]["runtime_diagnostics"]
