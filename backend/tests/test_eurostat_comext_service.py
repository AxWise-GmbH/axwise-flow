"""Focused production-shaped contracts for Eurostat Comext evidence."""

from __future__ import annotations

import asyncio
import copy
import hashlib
import hmac
import json
import os
import threading
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from backend.api.research.simulation_bridge.services.pipeline import B2BDataPipeline
from backend.services.eurostat_comext_service import (
    BoundedOfficialResponse,
    EurostatComextAcquisition,
    acquire_eurostat_comext_source,
)
from backend.services.research_quality_service import evaluate_critical_claims
from backend.services.orqaly_hybrid_run_service import (
    _strip_private_grounding_artifacts,
)
from backend.services.research_source_authority_service import (
    _structured_statistical_observations,
    build_recognized_root_proof,
    enrich_authority_sources,
    fetch_direct_text,
    validate_authority_proof,
)
from backend.services.research_topic_contract_service import (
    ConfirmedMarketScope,
    ImmutableGoalTopicFields,
    build_topic_seed,
)


pytestmark = pytest.mark.contract
os.environ.setdefault(
    "AXWISE_AUTHORITY_PROOF_SECRET",
    "test-authority-secret-32-bytes-minimum",
)


def _topic_seed(country_code: str = "EE"):
    country_name = {"EE": "Estonia", "LV": "Latvia"}.get(
        country_code,
        country_code,
    )
    return build_topic_seed(
        ImmutableGoalTopicFields(
            goal_id=f"{country_code.casefold()}-cat-food",
            title="Cat food market validation",
            problem_scope="Assess cat food demand using official statistics.",
            exact_topic_anchors=("cat food",),
        ),
        ConfirmedMarketScope(
            scope_label=country_name,
            country_codes=(country_code,),
            confirmed=True,
        ),
    )


def _jsonstat(
    *,
    reporter_code: str = "EE",
    reporter_label: str = "Estonia",
    product_code: str = "230910",
    product_label: str = "Dog or cat food, put up for retail sale",
    flow_code: str = "1",
    flow_label: str = "IMPORT",
    indicator_code: str = "VALUE_IN_EUROS",
    indicator_label: str = "VALUE_IN_EUROS",
    updated: str = "2026-07-16T11:00:00+0200",
    periods: tuple[str, ...] = ("2024", "2025", "2026"),
    values: dict[str, int] | None = None,
) -> dict:
    return {
        "version": "2.0",
        "class": "dataset",
        "label": "EU trade since 1988 by HS2-4-6 and CN8",
        "source": "ESTAT",
        "updated": updated,
        "value": values if values is not None else {"0": 57353738, "1": 54891271},
        "id": [
            "freq",
            "reporter",
            "partner",
            "product",
            "flow",
            "indicators",
            "time",
        ],
        "size": [1, 1, 1, 1, 1, 1, len(periods)],
        "dimension": {
            "freq": {
                "label": "Frequency",
                "category": {"index": {"A": 0}, "label": {"A": "Annual"}},
            },
            "reporter": {
                "label": "REPORTER",
                "category": {
                    "index": {reporter_code: 0},
                    "label": {reporter_code: reporter_label},
                },
            },
            "partner": {
                "label": "PARTNER",
                "category": {
                    "index": {"WORLD": 0},
                    "label": {"WORLD": "All countries of the world"},
                },
            },
            "product": {
                "label": "PRODUCT",
                "category": {
                    "index": {product_code: 0},
                    "label": {product_code: product_label},
                },
            },
            "flow": {
                "label": "FLOW",
                "category": {
                    "index": {flow_code: 0},
                    "label": {flow_code: flow_label},
                },
            },
            "indicators": {
                "label": "INDICATORS",
                "category": {
                    "index": {indicator_code: 0},
                    "label": {indicator_code: indicator_label},
                },
            },
            "time": {
                "label": "TIME_PERIOD",
                "category": {
                    "index": {period: index for index, period in enumerate(periods)},
                    "label": {period: period for period in periods},
                },
            },
        },
        "extension": {
            "lang": "EN",
            "id": "DS-045409",
            "agencyId": "ESTAT",
            "version": "1.0",
            "datastructure": {
                "id": "DS-045409",
                "agencyId": "ESTAT",
                "version": "6.3",
            },
        },
    }


def _json_bytes(**kwargs) -> bytes:
    return json.dumps(
        _jsonstat(**kwargs),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")


_DSD = b"""<?xml version="1.0" encoding="UTF-8"?>
<m:Structure xmlns:m="urn:m" xmlns:s="urn:s">
  <s:DataStructure agencyID="ESTAT" id="DS-045409" version="6.3">
    <s:Dimension id="product" position="4">
      <s:Enumeration><Ref agencyID="ESTAT" class="Codelist"
        id="CXT_NC" version="11.0"/></s:Enumeration>
    </s:Dimension>
  </s:DataStructure>
</m:Structure>"""


def _sparql_payload(variables: list[str], rows: list[dict]) -> bytes:
    return json.dumps(
        {
            "head": {"link": [], "vars": variables},
            "results": {
                "distinct": False,
                "ordered": True,
                "bindings": rows,
            },
        },
        separators=(",", ":"),
    ).encode("utf-8")


_SCHEMES = _sparql_payload(
    ["scheme", "label"],
    [
        {
            "scheme": {
                "type": "uri",
                "value": "http://data.europa.eu/xsp/cn2025/cn2025",
            },
            "label": {
                "type": "literal",
                "xml:lang": "en",
                "value": "Combined Nomenclature, 2025 (CN 2025)",
            },
        },
        {
            "scheme": {
                "type": "uri",
                "value": "http://data.europa.eu/xsp/cn2026/cn2026",
            },
            "label": {
                "type": "literal",
                "xml:lang": "en",
                "value": "Combined Nomenclature, 2026 (CN 2026)",
            },
        },
    ],
)


_CLASSIFIER = _sparql_payload(
    ["concept", "code", "label"],
    [
        {
            "concept": {
                "type": "uri",
                "value": "http://data.europa.eu/xsp/cn2026/230910000080",
            },
            "code": {"type": "literal", "value": "2309 10"},
            "label": {
                "type": "literal",
                "xml:lang": "en",
                "value": "2309 10 - Dog or cat food, put up for retail sale",
            },
        }
    ],
)


def _csv_bytes(*, reporter: str = "EE", product: str = "230910", value: str = "54891271") -> bytes:
    return (
        "DATAFLOW,LAST UPDATE,freq,reporter,partner,product,flow,indicators,"
        "TIME_PERIOD,OBS_VALUE\r\n"
        f"ESTAT:DS-045409(1.0),16/07/26 11:00:00,A,{reporter},WORLD,"
        f"{product},1,VALUE_IN_EUROS,2024,57353738\r\n"
        f"ESTAT:DS-045409(1.0),16/07/26 11:00:00,A,{reporter},WORLD,"
        f"{product},1,VALUE_IN_EUROS,2025,{value}\r\n"
    ).encode("utf-8")


def _response(url: str, content: bytes, content_type: str) -> BoundedOfficialResponse:
    return BoundedOfficialResponse(
        final_url=url,
        content=content,
        content_type=content_type,
        retrieved_at="2026-08-13T09:00:00+00:00",
    )


def _resign_authority_proof(source: dict) -> None:
    proof = source["authority_proof"]
    payload = {
        key: value
        for key, value in proof.items()
        if key not in {"proof_signature", "signature_alg"}
    }
    proof["proof_signature"] = hmac.new(
        os.environ["AXWISE_AUTHORITY_PROOF_SECRET"].encode("utf-8"),
        json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _rehash_observation(observation: dict) -> None:
    unsigned = {
        key: value
        for key, value in observation.items()
        if key != "observation_sha256"
    }
    observation["observation_sha256"] = hashlib.sha256(
        json.dumps(
            unsigned,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()


def _fixture_fetcher(
    *,
    json_content: bytes | None = None,
    csv_content: bytes | None = None,
    classifier_content: bytes = _CLASSIFIER,
):
    requested: list[tuple[str, int, float]] = []

    async def fetcher(url: str, maximum_bytes: int, deadline: float):
        requested.append((url, maximum_bytes, deadline))
        parsed = urlparse(url)
        if "datastructure" in parsed.path:
            return _response(url, _DSD, "application/vnd.sdmx.structure+xml")
        if parsed.hostname == "publications.europa.eu":
            query = parse_qs(parsed.query)["query"][0]
            body = _SCHEMES if "ConceptScheme" in query else classifier_content
            return _response(url, body, "application/sparql-results+json")
        output_format = parse_qs(parsed.query)["format"][0]
        if output_format == "JSON":
            return _response(
                url,
                json_content or _json_bytes(),
                "application/json",
            )
        return _response(
            url,
            csv_content or _csv_bytes(),
            "application/vnd.sdmx.data+csv;version=1.0.0",
        )

    return fetcher, requested


def test_exact_live_shaped_jsonstat_derives_latest_completed_observation():
    raw = _json_bytes().decode("utf-8")
    observations = _structured_statistical_observations(raw)

    assert len(raw.encode("utf-8")) < 2_000
    assert len(observations) == 1
    observation = observations[0]
    assert observation["dataset_id"] == "DS-045409"
    assert observation["reporter_code"] == "EE"
    assert observation["reporter_label"] == "Estonia"
    assert observation["product_code"] == "230910"
    assert observation["product_label"] == "Dog or cat food, put up for retail sale"
    assert observation["period"] == "2025"
    assert observation["value"] == "54891271"
    assert observation["unit"] == "EUR"
    assert "cat food" in observation["series"].casefold()
    assert observation["row_text"] == observation["canonical_claim_text"]
    assert observation["row_text"].startswith("Eurostat DS-045409 reports")
    assert '"version"' not in observation["row_text"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload["dimension"]["time"]["category"].update(
            {"index": {"2024": 0, "2025": 0, "2026": 2}}
        ),
        lambda payload: payload.update({"value": {"4": 54891271}}),
        lambda payload: payload["dimension"]["flow"].update(
            {"category": {"index": {"2": 0}, "label": {"2": "EXPORT"}}}
        ),
        lambda payload: payload["dimension"]["indicators"].update(
            {
                "category": {
                    "index": {"QUANTITY_IN_KG": 0},
                    "label": {"QUANTITY_IN_KG": "QUANTITY_IN_KG"},
                }
            }
        ),
        lambda payload: payload.update(
            {
                "updated": "2026-12-31T01:00:00+0100",
                "value": {"2": 999},
            }
        ),
    ],
    ids=[
        "duplicate-time-position",
        "value-outside-time-index",
        "wrong-flow",
        "wrong-indicator-unit",
        "current-year-not-complete-on-december-31",
    ],
)
def test_malformed_or_wrong_jsonstat_fails_closed(mutate):
    payload = _jsonstat()
    if "current-year" in getattr(mutate, "__name__", ""):
        pass
    mutate(payload)
    if payload.get("updated", "").startswith("2026-12-31"):
        payload["dimension"]["time"]["category"] = {
            "index": {"2026": 0},
            "label": {"2026": "2026"},
        }
        payload["size"][-1] = 1
        payload["value"] = {"0": 999}
    raw = json.dumps(payload, separators=(",", ":"))
    assert _structured_statistical_observations(raw) == []


def test_duplicate_json_key_and_oversized_or_four_period_payload_fail_closed():
    normal = _json_bytes().decode("utf-8")
    duplicate = normal.replace('"version":"2.0"', '"version":"2.0","version":"2.0"', 1)
    assert _structured_statistical_observations(duplicate) == []

    oversized = _jsonstat()
    oversized["incidental"] = "x" * 2_100
    assert _structured_statistical_observations(
        json.dumps(oversized, separators=(",", ":"))
    ) == []

    four_periods = _jsonstat(
        periods=("2023", "2024", "2025", "2026"),
        values={"0": 1, "1": 2, "2": 3},
    )
    assert _structured_statistical_observations(
        json.dumps(four_periods, separators=(",", ":"))
    ) == []

    boolean_time = _jsonstat()
    boolean_time["dimension"]["time"]["category"]["index"]["2025"] = True
    assert _structured_statistical_observations(
        json.dumps(boolean_time, separators=(",", ":"))
    ) == []

    boolean_sizes = _jsonstat()
    boolean_sizes["size"] = [True, True, True, True, True, True, 3]
    assert _structured_statistical_observations(
        json.dumps(boolean_sizes, separators=(",", ":"))
    ) == []

    float_singleton_position = _jsonstat()
    float_singleton_position["dimension"]["reporter"]["category"]["index"] = {
        "EE": 0.0
    }
    assert _structured_statistical_observations(
        json.dumps(float_singleton_position, separators=(",", ":"))
    ) == []


@pytest.mark.asyncio
async def test_fetch_direct_text_accepts_application_json_and_retains_exact_raw(monkeypatch):
    raw = _json_bytes()

    class Response:
        is_redirect = False
        headers = {"content-type": "application/json; charset=utf-8"}
        content = raw
        text = raw.decode("utf-8")
        url = httpx.URL("https://ec.europa.eu/eurostat/api/comext/test")

        def raise_for_status(self):
            return None

    class StreamContext:
        async def __aenter__(self):
            return Response()

        async def __aexit__(self, *_args):
            return None

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def get(self, *_args, **_kwargs):
            async def result():
                return Response()

            return result()

    async def public(_host: str) -> bool:
        return True

    monkeypatch.setattr(
        "backend.services.research_source_authority_service.httpx.AsyncClient",
        Client,
    )
    monkeypatch.setattr(
        "backend.services.research_source_authority_service._public_hostname",
        public,
    )
    document = await fetch_direct_text(
        "https://ec.europa.eu/eurostat/api/comext/test"
    )
    assert document["_structured_evidence_html"] == raw.decode("utf-8")
    assert document["structured_statistical_observations"][0]["period"] == "2025"


@pytest.mark.asyncio
async def test_reporter_mismatch_with_incidental_country_is_rejected_without_batch_abort():
    bad_raw = _json_bytes(reporter_code="LV", reporter_label="Latvia").decode("utf-8")
    bad_payload = json.loads(bad_raw)
    bad_payload["incidental"] = "Estonia"
    bad_raw = json.dumps(bad_payload, separators=(",", ":"))
    good_raw = _json_bytes().decode("utf-8")

    async def fetcher(url: str):
        raw = bad_raw if url.endswith("/bad") else good_raw
        return {
            "final_url": (
                "https://ec.europa.eu/eurostat/api/comext/bad"
                if url.endswith("/bad")
                else "https://ec.europa.eu/eurostat/api/comext/good"
            ),
            "text": " ".join(raw.split()),
            "retrieved_at": "2026-08-13T09:00:00+00:00",
            "commercial_offer_evidence": [],
            "structured_statistical_observations": _structured_statistical_observations(raw),
            "_structured_evidence_html": raw,
        }

    rows = [
        {"url": "https://ec.europa.eu/eurostat/api/comext/bad", "country_codes": ["EE"]},
        {"url": "https://ec.europa.eu/eurostat/api/comext/good", "country_codes": ["EE"]},
    ]
    enriched = await enrich_authority_sources(rows, fetcher=fetcher)

    assert enriched[0]["jurisdiction_binding_status"] == (
        "rejected_structured_reporter_jurisdiction"
    )
    assert enriched[0].get("authority_proof") is None
    assert enriched[1]["source_authority"] == "official_public"
    assert validate_authority_proof(enriched[1], requested_country_codes=["EE"])


def test_recognized_root_builder_rejects_wrong_reporter_even_with_estonia_text():
    raw = _json_bytes(reporter_code="LV", reporter_label="Latvia").decode("utf-8")
    payload = json.loads(raw)
    payload["incidental"] = "Estonia"
    raw = json.dumps(payload, separators=(",", ":"))
    with pytest.raises(ValueError, match="reporter"):
        build_recognized_root_proof(
            direct_url="https://ec.europa.eu/eurostat/api/comext/data",
            direct_text=" ".join(raw.split()),
            country_codes=["EE"],
            structured_statistical_observations=_structured_statistical_observations(raw),
            direct_raw_html=raw,
            retrieved_at="2026-08-13T09:00:00+00:00",
        )


@pytest.mark.asyncio
async def test_acquisition_uses_bounded_official_classifier_and_json_csv_agreement():
    fetcher, requested = _fixture_fetcher()
    result = await acquire_eurostat_comext_source(
        _topic_seed(),
        country_code="EE",
        fetcher=fetcher,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )

    assert result.status == "completed", result.diagnostics
    assert result.source is not None
    provenance = result.source["citation_metadata"]["eurostat_comext"]
    assert provenance["product_code"] == "230910"
    assert provenance["product_label"] == "Dog or cat food, put up for retail sale"
    assert provenance["reporter_code"] == "EE"
    assert provenance["selected_period"] == "2025"
    assert len(provenance["json_sha256"]) == 64
    assert len(provenance["csv_sha256"]) == 64
    assert provenance["json_sha256"] != provenance["csv_sha256"]
    assert len(provenance["data_structure_sha256"]) == 64
    assert len(provenance["classification_scheme_response_sha256"]) == 64
    assert provenance["data_structure_retrieved_at"].startswith("2026-08-13")
    assert provenance["classification_scheme_retrieved_at"].startswith(
        "2026-08-13"
    )
    assert all(maximum <= 200_000 for _url, maximum, _deadline in requested)
    assert not any("codelist/ESTAT/CXT_NC" in url for url, _maximum, _deadline in requested)
    data_urls = [url for url, _maximum, _deadline in requested if "/data/DS-045409/" in url]
    assert len(data_urls) == 2
    assert all("startPeriod=2024&endPeriod=2026" in url for url in data_urls)


@pytest.mark.asyncio
async def test_acquisition_fails_closed_on_json_csv_or_classifier_disagreement():
    wrong_csv, _ = _fixture_fetcher(csv_content=_csv_bytes(value="1"))
    result = await acquire_eurostat_comext_source(
        _topic_seed(),
        country_code="EE",
        fetcher=wrong_csv,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )
    assert result.status == "failed_closed"
    assert result.diagnostics["reason"] == (
        "eurostat_comext_json_csv_observation_mismatch"
    )

    base_fetcher, _ = _fixture_fetcher()

    async def mismatched_classifier_url(
        url: str,
        maximum_bytes: int,
        deadline: float,
    ) -> BoundedOfficialResponse:
        response = await base_fetcher(url, maximum_bytes, deadline)
        if urlparse(url).hostname == "publications.europa.eu" and (
            "ConceptScheme" not in parse_qs(urlparse(url).query)["query"][0]
        ):
            return BoundedOfficialResponse(
                final_url="https://publications.europa.eu/webapi/rdf/sparql?query=changed",
                content=response.content,
                content_type=response.content_type,
                retrieved_at=response.retrieved_at,
            )
        return response

    result = await acquire_eurostat_comext_source(
        _topic_seed(),
        country_code="EE",
        fetcher=mismatched_classifier_url,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )
    assert result.status == "failed_closed"
    assert result.diagnostics["reason"] == (
        "eurostat_comext_classifier_url_mismatch"
    )

    for duplicate_value in (b"1", b"54891271"):
        duplicate_latest_csv = _csv_bytes() + (
            b"ESTAT:DS-045409(1.0),16/07/26 11:00:00,A,EE,WORLD,"
            b"230910,1,VALUE_IN_EUROS,2025," + duplicate_value + b"\r\n"
        )
        duplicate_csv, _ = _fixture_fetcher(csv_content=duplicate_latest_csv)
        result = await acquire_eurostat_comext_source(
            _topic_seed(),
            country_code="EE",
            fetcher=duplicate_csv,
            now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        )
        assert result.status == "failed_closed"
        assert result.diagnostics["reason"] == (
            "eurostat_comext_csv_duplicate_period"
        )

    missing_period_csv, _ = _fixture_fetcher(
        csv_content=(
            b"DATAFLOW,LAST UPDATE,freq,reporter,partner,product,flow,"
            b"indicators,TIME_PERIOD,OBS_VALUE\r\n"
            b"ESTAT:DS-045409(1.0),16/07/26 11:00:00,A,EE,WORLD,"
            b"230910,1,VALUE_IN_EUROS,2025,54891271\r\n"
        )
    )
    result = await acquire_eurostat_comext_source(
        _topic_seed(),
        country_code="EE",
        fetcher=missing_period_csv,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )
    assert result.status == "failed_closed"
    assert result.diagnostics["reason"] == (
        "eurostat_comext_json_csv_period_mismatch"
    )
    wrong_product = copy.deepcopy(json.loads(_CLASSIFIER))
    wrong_product["results"]["bindings"][0]["code"]["value"] = "2309 90"
    wrong_product["results"]["bindings"][0]["concept"]["value"] = (
        "http://data.europa.eu/xsp/cn2026/230990000080"
    )
    wrong_product["results"]["bindings"][0]["label"]["value"] = (
        "2309 90 - Preparations excluding cat food"
    )
    wrong_classifier, _ = _fixture_fetcher(
        classifier_content=json.dumps(
            wrong_product,
            separators=(",", ":"),
        ).encode("utf-8")
    )
    result = await acquire_eurostat_comext_source(
        _topic_seed(),
        country_code="EE",
        fetcher=wrong_classifier,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )
    assert result.status == "failed_closed"


@pytest.mark.asyncio
async def test_metadata_fetches_are_process_bounded_and_singleflight():
    requested: list[tuple[str, int, float]] = []

    async def fetcher(url: str, maximum_bytes: int, deadline: float):
        requested.append((url, maximum_bytes, deadline))
        parsed = urlparse(url)
        if "datastructure" in parsed.path:
            return _response(url, _DSD, "application/vnd.sdmx.structure+xml")
        if parsed.hostname == "publications.europa.eu":
            query = parse_qs(parsed.query)["query"][0]
            body = _SCHEMES if "ConceptScheme" in query else _CLASSIFIER
            return _response(url, body, "application/sparql-results+json")
        reporter = parsed.path.rsplit("/", 1)[-1].split(".")[1]
        output_format = parse_qs(parsed.query)["format"][0]
        if output_format == "JSON":
            return _response(
                url,
                _json_bytes(
                    reporter_code=reporter,
                    reporter_label={"EE": "Estonia", "LV": "Latvia"}[reporter],
                ),
                "application/json",
            )
        return _response(
            url,
            _csv_bytes(reporter=reporter),
            "application/vnd.sdmx.data+csv;version=1.0.0",
        )

    first, second = await asyncio.gather(
        acquire_eurostat_comext_source(
            _topic_seed(),
            country_code="EE",
            fetcher=fetcher,
            now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        ),
        acquire_eurostat_comext_source(
            _topic_seed("LV"),
            country_code="LV",
            fetcher=fetcher,
            now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        ),
    )

    assert first.status == second.status == "completed"
    assert first.source["country_codes"] == ["EE"]
    assert second.source["country_codes"] == ["LV"]
    metadata_urls = [
        url
        for url, _maximum, _deadline in requested
        if "/data/DS-045409/" not in url
    ]
    data_urls = [
        url
        for url, _maximum, _deadline in requested
        if "/data/DS-045409/" in url
    ]
    assert len(metadata_urls) == 3
    assert len(set(metadata_urls)) == 3
    assert len(data_urls) == 4


@pytest.mark.asyncio
async def test_classifier_fetch_obeys_whole_stage_deadline():
    fetcher, _requested = _fixture_fetcher()

    async def slow_classifier(url: str, maximum_bytes: int, deadline: float):
        if urlparse(url).hostname == "publications.europa.eu":
            query = parse_qs(urlparse(url).query)["query"][0]
            if "ConceptScheme" not in query:
                await asyncio.sleep(0.09)
        return await fetcher(url, maximum_bytes, deadline)

    result = await acquire_eurostat_comext_source(
        _topic_seed(),
        country_code="EE",
        fetcher=slow_classifier,
        stage_seconds=0.05,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )
    assert result.status == "timeout"
    assert result.diagnostics["elapsed_ms"] < 150
    assert result.diagnostics["deadline_ms"] == 50
    # The shared metadata task is shielded from one caller's cancellation;
    # let this bounded fixture finish before the test event loop closes.
    await asyncio.sleep(0.1)


@pytest.mark.asyncio
async def test_acquisition_cancellation_stops_unshared_metadata_io():
    started = 0
    cancelled = 0
    both_started = asyncio.Event()

    async def blocking_fetcher(
        _url: str,
        _maximum_bytes: int,
        _deadline: float,
    ) -> BoundedOfficialResponse:
        nonlocal started, cancelled
        started += 1
        if started == 2:
            both_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled += 1
            raise
        raise AssertionError("unreachable")

    acquisition = asyncio.create_task(
        acquire_eurostat_comext_source(
            _topic_seed(),
            country_code="EE",
            fetcher=blocking_fetcher,
            stage_seconds=40,
            now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        )
    )
    await asyncio.wait_for(both_started.wait(), timeout=0.2)
    acquisition.cancel()
    with pytest.raises(asyncio.CancelledError):
        await acquisition
    await asyncio.sleep(0)

    assert started == 2
    assert cancelled == 2


@pytest.mark.asyncio
async def test_country_reporter_is_generated_and_bound_per_market():
    fetcher, requested = _fixture_fetcher(
        json_content=_json_bytes(reporter_code="LV", reporter_label="Latvia"),
        csv_content=_csv_bytes(reporter="LV"),
    )
    result = await acquire_eurostat_comext_source(
        _topic_seed("LV"),
        country_code="LV",
        fetcher=fetcher,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )

    assert result.status == "completed", result.diagnostics
    assert result.source["country_codes"] == ["LV"]
    provenance = result.source["citation_metadata"]["eurostat_comext"]
    assert provenance["reporter_code"] == "LV"
    data_urls = [url for url, _maximum, _deadline in requested if "/data/" in url]
    assert data_urls
    assert all("/A.LV.WORLD.230910.1.VALUE_IN_EUROS?" in url for url in data_urls)


@pytest.mark.asyncio
async def test_acquired_source_is_signed_rederived_verified_and_raw_mutation_blocks():
    fetcher, _requested = _fixture_fetcher()
    acquisition = await acquire_eurostat_comext_source(
        _topic_seed(),
        country_code="EE",
        fetcher=fetcher,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )
    assert acquisition.source is not None
    [source] = await enrich_authority_sources([acquisition.source])
    assert source["source_authority"] == "official_public"
    assert validate_authority_proof(source, requested_country_codes=["EE"])

    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Category buyers",
        topic_seed_contract=_topic_seed().model_dump(mode="json"),
    )
    canonical = source["authority_proof"]["structured_statistical_observations"][0][
        "canonical_claim_text"
    ]
    pipeline._store_direct_web_evidence(
        [source],
        [
            {
                "text": canonical,
                "source_urls": [source["url"]],
                "provider": "generic_search_provider",
            }
        ],
    )
    grounding = {
        "market_sources": pipeline.market_sources,
        "market_claims": pipeline.market_claims,
        "topic_seed_contract": _topic_seed().model_dump(mode="json"),
    }
    official_claim = next(
        claim
        for claim in grounding["market_claims"]
        if claim.get("evidence_class") == "official_statistic"
        and claim.get("critical") is True
    )
    assert official_claim["object"].startswith("Eurostat DS-045409 reports")
    assert len(official_claim["object"]) <= 500
    assert "Dog or cat food, put up for retail sale" in official_claim["object"]
    assert "Estonia" in official_claim["object"]
    assert "54891271 EUR" in official_claim["object"]
    assert "2025" in official_claim["object"]
    assert official_claim["provenance_artifact"]["artifact_type"] == (
        "derived_structured_statistical_observation"
    )
    assert sum(claim.get("object") == canonical for claim in pipeline.market_claims) == 1
    serialized_claims = json.dumps(grounding["market_claims"])
    assert '"version":"2.0"' not in serialized_claims
    assert '"dimension"' not in serialized_claims
    public_grounding = _strip_private_grounding_artifacts(copy.deepcopy(grounding))
    serialized_public = json.dumps(public_grounding)
    assert '"version":"2.0"' not in serialized_public
    assert "_structured_evidence_html" not in serialized_public
    assert "_authority_document_artifact" not in serialized_public
    quality = evaluate_critical_claims(
        grounding,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )
    assert quality["status"] == "passed", quality["blocked_claims"]

    mutated = copy.deepcopy(grounding)
    mutated["market_sources"][0]["_structured_evidence_html"] = (
        mutated["market_sources"][0]["_structured_evidence_html"].replace(
            "54891271",
            "1",
            1,
        )
    )
    quality = evaluate_critical_claims(
        mutated,
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )
    assert quality["status"] == "blocked"
    assert "official_statistic" in quality["missing_claim_classes"]

    tampered = copy.deepcopy(source)
    tampered["authority_proof"]["structured_statistical_observations"][0][
        "reporter_code"
    ] = "LV"
    assert not validate_authority_proof(tampered, requested_country_codes=["EE"])

    for field, replacement in (
        ("value", "1"),
        ("product_label", "Unrelated goods"),
        ("series", "Unrelated goods; annual import value into Estonia from All countries of the world"),
    ):
        resigned = copy.deepcopy(source)
        observation = resigned["authority_proof"][
            "structured_statistical_observations"
        ][0]
        observation[field] = replacement
        if field == "value":
            observation["cell_text"] = replacement
            observation["row_cells"] = [replacement]
        if field in {"value", "product_label"}:
            observation["canonical_claim_text"] = (
                f"Eurostat DS-045409 reports the annual import value of "
                f"{observation['product_label']} (product "
                f"{observation['product_code']}) into "
                f"{observation['reporter_label']} from "
                f"{observation['partner_label']} as {observation['value']} "
                f"{observation['unit']} in {observation['period']}."
            )
            observation["row_text"] = observation["canonical_claim_text"]
        if field == "product_label":
            observation["series_labels"][0] = replacement
            observation["series"] = (
                f"{replacement}; annual import value into "
                f"{observation['reporter_label']} from "
                f"{observation['partner_label']}"
            )
        _rehash_observation(observation)
        _resign_authority_proof(resigned)
        assert not validate_authority_proof(
            resigned,
            requested_country_codes=["EE"],
        )
        resigned["authority_document_artifact"][
            "authority_proof_signature"
        ] = resigned["authority_proof"]["proof_signature"]
        assert not validate_authority_proof(
            resigned,
            requested_country_codes=["EE"],
        )

    bad_type = copy.deepcopy(source)
    bad_type["authority_proof"]["structured_statistical_observations"] = {
        "0": bad_type["authority_proof"]["structured_statistical_observations"][0]
    }
    _resign_authority_proof(bad_type)
    bad_type["authority_document_artifact"]["authority_proof_signature"] = (
        bad_type["authority_proof"]["proof_signature"]
    )
    assert not validate_authority_proof(
        bad_type,
        requested_country_codes=["EE"],
    )

    scrubbed = copy.deepcopy(source)
    scrubbed.pop("_structured_evidence_html", None)
    scrubbed.pop("_direct_document_candidate", None)
    assert validate_authority_proof(scrubbed, requested_country_codes=["EE"])


@pytest.mark.asyncio
async def test_runtime_adapter_fills_signed_official_class_without_search_provider():
    fetcher, _requested = _fixture_fetcher()
    acquisition = await acquire_eurostat_comext_source(
        _topic_seed(),
        country_code="EE",
        fetcher=fetcher,
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
    )
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Category buyers",
        model=MagicMock(),
        data_source="web",
        required_evidence_classes=["official_statistic"],
        topic_seed_contract=_topic_seed().model_dump(mode="json"),
    )

    with patch(
        "backend.api.research.simulation_bridge.services.pipeline."
        "acquire_eurostat_comext_source",
        new=AsyncMock(return_value=acquisition),
    ), patch(
        "backend.services.generative.gemini_search_service."
        "GeminiSearchService.is_available",
        return_value=False,
    ), patch(
        "backend.services.generative.searxng_search_service."
        "SearxngSearchService.is_available",
        return_value=False,
    ):
        companies = await pipeline._discover_via_web_search()

    assert companies == []
    quality = evaluate_critical_claims(
        {
            "market_sources": pipeline.market_sources,
            "market_claims": pipeline.market_claims,
            "topic_seed_contract": _topic_seed().model_dump(mode="json"),
        },
        ["EE"],
        now=datetime(2026, 8, 13, tzinfo=timezone.utc),
        freshness_by_class={"official_statistic": 730},
        mandatory_claim_classes=["official_statistic"],
    )
    assert quality["status"] == "passed", quality["blocked_claims"]
    assert pipeline.routing_diagnostics["eurostat_comext"] == {
        key: acquisition.diagnostics[key]
        for key in (
            "status",
            "call_count",
            "metadata_call_count",
            "data_call_count",
            "elapsed_ms",
            "deadline_ms",
            "reporter_code",
            "product_code",
            "selected_period",
        )
    }
    diagnostic_text = json.dumps(pipeline.routing_diagnostics)
    assert "sparql" not in diagnostic_text.casefold()
    assert '"dimension"' not in diagnostic_text
    public = _strip_private_grounding_artifacts(
        {
            "market_sources": copy.deepcopy(pipeline.market_sources),
            "market_claims": copy.deepcopy(pipeline.market_claims),
        }
    )
    serialized = json.dumps(public)
    assert '"version":"2.0"' not in serialized
    assert "_structured_evidence_html" not in serialized


@pytest.mark.asyncio
async def test_runtime_adapter_failure_preserves_generic_search_and_runs_concurrently():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Category buyers",
        model=MagicMock(),
        data_source="web",
        required_evidence_classes=["official_statistic"],
        topic_seed_contract=_topic_seed().model_dump(mode="json"),
    )
    adapter_started = threading.Event()
    provider_started = threading.Event()

    async def failed_adapter(*_args, **_kwargs):
        adapter_started.set()
        deadline = time.monotonic() + 0.5
        while not provider_started.is_set() and time.monotonic() < deadline:
            await asyncio.sleep(0.001)
        await asyncio.sleep(0.07)
        return EurostatComextAcquisition(
            status="failed_closed",
            source=None,
            diagnostics={
                "status": "failed_closed",
                "reason": "eurostat_comext_no_unique_product_match",
                "call_count": 3,
                "elapsed_ms": 70,
                "deadline_ms": 40_000,
            },
        )

    class Search:
        def is_available(self):
            return True

        def search_web_general(self, _query):
            assert adapter_started.wait(0.5)
            provider_started.set()
            time.sleep(0.07)
            return {
                "search_performed": True,
                "text": "Estonia retail market evidence.",
                "sources": [
                    {
                        "title": "Estonia market source",
                        "url": "https://example.com/estonia-market",
                    }
                ],
                "claims": [
                    {
                        "text": "Estonia retail market evidence.",
                        "source_urls": ["https://example.com/estonia-market"],
                    }
                ],
            }

    async def passthrough(rows):
        return rows

    parser = MagicMock()
    parser.run = AsyncMock(
        return_value=SimpleNamespace(output=SimpleNamespace(companies=[]))
    )
    started = time.monotonic()
    with patch(
        "backend.api.research.simulation_bridge.services.pipeline."
        "acquire_eurostat_comext_source",
        side_effect=failed_adapter,
    ), patch(
        "backend.services.generative.gemini_search_service.GeminiSearchService",
        return_value=Search(),
    ), patch(
        "backend.services.generative.searxng_search_service."
        "SearxngSearchService.is_available",
        return_value=False,
    ), patch(
        "backend.api.research.simulation_bridge.services.pipeline."
        "enrich_authority_sources",
        side_effect=passthrough,
    ), patch(
        "backend.api.research.simulation_bridge.services.pipeline.Agent",
        return_value=parser,
    ):
        companies = await pipeline._discover_via_web_search()
    elapsed = time.monotonic() - started

    assert companies == []
    assert adapter_started.is_set() and provider_started.is_set()
    assert elapsed < 0.13
    assert pipeline.market_sources
    assert any(
        claim.get("object") == "Estonia retail market evidence."
        for claim in pipeline.market_claims
    )
    assert pipeline.routing_diagnostics["eurostat_comext"]["status"] == (
        "failed_closed"
    )


@pytest.mark.asyncio
async def test_runtime_cancellation_during_provider_fanout_cancels_adapter():
    pipeline = B2BDataPipeline(
        location="Estonia",
        business_problem="Launch cat food",
        target_user="Category buyers",
        model=MagicMock(),
        data_source="web",
        required_evidence_classes=["official_statistic"],
        topic_seed_contract=_topic_seed().model_dump(mode="json"),
    )
    adapter_started = asyncio.Event()
    adapter_cancelled = asyncio.Event()
    provider_started = threading.Event()
    provider_release = threading.Event()

    async def pending_adapter(*_args, **_kwargs):
        adapter_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            adapter_cancelled.set()
            raise

    class SlowSearch:
        def is_available(self):
            return True

        def search_web_general(self, _query):
            provider_started.set()
            provider_release.wait(0.5)
            return {"search_performed": False, "sources": [], "claims": []}

    try:
        with patch(
            "backend.api.research.simulation_bridge.services.pipeline."
            "acquire_eurostat_comext_source",
            side_effect=pending_adapter,
        ), patch(
            "backend.services.generative.gemini_search_service."
            "GeminiSearchService",
            return_value=SlowSearch(),
        ), patch(
            "backend.services.generative.searxng_search_service."
            "SearxngSearchService.is_available",
            return_value=False,
        ):
            discovery = asyncio.create_task(pipeline._discover_via_web_search())
            await asyncio.wait_for(adapter_started.wait(), timeout=0.2)
            assert await asyncio.to_thread(provider_started.wait, 0.2)
            discovery.cancel()
            with pytest.raises(asyncio.CancelledError):
                await discovery
    finally:
        provider_release.set()

    assert adapter_cancelled.is_set()
