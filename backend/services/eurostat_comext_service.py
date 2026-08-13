"""Deterministic, evidence-grade Eurostat Comext product statistics.

No model or search snippet chooses a commodity code.  The adapter queries the
official Publications Office SPARQL endpoint for the latest Combined
Nomenclature scheme and bounded topic-matching classification items, validates
their visible labels against the immutable product topic, then requires a fully
specified Eurostat JSON-stat response and byte-distinct SDMX-CSV response to
agree on reporter, product, flow, unit, latest completed period, and value.
"""

from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import json
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Mapping, Optional
from urllib.parse import parse_qs, urlencode, urlparse
from xml.etree import ElementTree

import httpx

from backend.services.research_source_authority_service import (
    _structured_statistical_observations,
)
from backend.services.research_topic_contract_service import (
    TopicSeedContract,
    exact_topic_phrase_in_visible_text,
    match_visible_statistical_topic,
    normalize_topic_phrase,
    product_topic_phrases,
)


_EUROSTAT_ORIGIN = "https://ec.europa.eu"
_COMEXT_BASE = f"{_EUROSTAT_ORIGIN}/eurostat/api/comext/dissemination/sdmx/2.1"
_DATASET_ID = "DS-045409"
_DSD_URL = f"{_COMEXT_BASE}/datastructure/ESTAT/{_DATASET_ID}/latest"
_DATA_PATH = f"/eurostat/api/comext/dissemination/sdmx/2.1/data/{_DATASET_ID}"
_CLASSIFICATION_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql"
_PRODUCT_CODELIST_ID = "CXT_NC"

_EU_COUNTRY_CODES = frozenset(
    {
        "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES",
        "FI", "FR", "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT",
        "NL", "PL", "PT", "RO", "SE", "SI", "SK",
    }
)
_METADATA_MAX_BYTES = 100_000
_CLASSIFICATION_MAX_BYTES = 200_000
_DATA_MAX_BYTES = 100_000
_MAX_SCHEMES = 30
_MAX_CLASSIFICATION_MATCHES = 64
_DEFAULT_STAGE_SECONDS = 40.0
_DEFAULT_REQUEST_SECONDS = 20.0
_METADATA_CACHE_SECONDS = 900.0
_MAX_METADATA_CACHE_ENTRIES = 32
_NEGATED_TOPIC_PREFIX = re.compile(
    r"\b(?:excl(?:\.|uded|uding)?|except|other\s+than|not)\b[^.;:]{0,100}$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class BoundedOfficialResponse:
    final_url: str
    content: bytes
    content_type: str
    retrieved_at: str


@dataclass(frozen=True)
class _ClassificationScheme:
    uri: str
    label: str
    year: int


@dataclass(frozen=True)
class _CommodityEntry:
    concept_uri: str
    code: str
    english_label: str


@dataclass(frozen=True)
class EurostatComextAcquisition:
    status: str
    source: Optional[Dict[str, Any]]
    diagnostics: Dict[str, Any]


OfficialFetcher = Callable[
    [str, int, float], Awaitable[BoundedOfficialResponse]
]


@dataclass
class _InflightOfficialResponse:
    fetcher: OfficialFetcher
    task: asyncio.Task[BoundedOfficialResponse]
    waiters: int = 0


@dataclass(frozen=True)
class _CachedOfficialResponse:
    fetcher: OfficialFetcher
    response: BoundedOfficialResponse
    expires_at: float


_metadata_cache: Dict[tuple[int, str, int], _CachedOfficialResponse] = {}
_metadata_inflight: Dict[
    tuple[int, int, str, int],
    _InflightOfficialResponse,
] = {}
_metadata_lock = threading.Lock()


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("eurostat_comext_stage_deadline_exceeded")
    return remaining


async def _fetch_bounded_official(
    url: str,
    maximum_bytes: int,
    deadline_seconds: float,
) -> BoundedOfficialResponse:
    """Fetch one generated official URL with strict host, body, and time caps."""

    parsed = urlparse(str(url or ""))
    is_comext = (
        parsed.hostname == "ec.europa.eu"
        and parsed.path.startswith(
            "/eurostat/api/comext/dissemination/sdmx/2.1/"
        )
    )
    is_classification = (
        parsed.hostname == "publications.europa.eu"
        and parsed.path == "/webapi/rdf/sparql"
    )
    if not (
        parsed.scheme == "https"
        and not parsed.username
        and not parsed.password
        and (is_comext or is_classification)
    ):
        raise ValueError("eurostat_comext_unsafe_url")
    timeout = max(0.25, min(float(deadline_seconds), _DEFAULT_REQUEST_SECONDS))
    content = bytearray()
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout),
        follow_redirects=False,
    ) as client:
        async with client.stream(
            "GET",
            url,
            headers={"User-Agent": "AxWiseResearch/1.0"},
        ) as response:
            if response.is_redirect:
                raise ValueError("eurostat_comext_redirect_rejected")
            response.raise_for_status()
            final = urlparse(str(response.url))
            if not (
                final.scheme == "https"
                and final.hostname == parsed.hostname
                and final.path == parsed.path
                and final.query == parsed.query
            ):
                raise ValueError("eurostat_comext_final_url_mismatch")
            async for chunk in response.aiter_bytes():
                content.extend(chunk)
                if len(content) > maximum_bytes:
                    raise ValueError("eurostat_comext_response_too_large")
            return BoundedOfficialResponse(
                final_url=str(response.url),
                content=bytes(content),
                content_type=str(response.headers.get("content-type") or ""),
                retrieved_at=datetime.now(timezone.utc).isoformat(),
            )


async def _fetch_cached_official(
    url: str,
    maximum_bytes: int,
    deadline_seconds: float,
    *,
    fetcher: OfficialFetcher,
) -> BoundedOfficialResponse:
    """Bounded TTL cache and per-event-loop singleflight for public metadata."""

    now = time.monotonic()
    cache_key = (id(fetcher), url, maximum_bytes)
    loop = asyncio.get_running_loop()
    inflight_key = (id(loop), id(fetcher), url, maximum_bytes)
    with _metadata_lock:
        cached = _metadata_cache.get(cache_key)
        if (
            cached is not None
            and cached.fetcher is fetcher
            and cached.expires_at > now
        ):
            return cached.response
        if cached is not None:
            _metadata_cache.pop(cache_key, None)
        existing = _metadata_inflight.get(inflight_key)
        entry = (
            existing
            if existing is not None and existing.fetcher is fetcher
            else None
        )
        if entry is None:
            task = loop.create_task(
                fetcher(url, maximum_bytes, deadline_seconds)
            )
            entry = _InflightOfficialResponse(fetcher=fetcher, task=task)
            _metadata_inflight[inflight_key] = entry

            def finalize(completed: asyncio.Task[BoundedOfficialResponse]) -> None:
                try:
                    response = completed.result()
                except BaseException:
                    response = None
                with _metadata_lock:
                    current = _metadata_inflight.get(inflight_key)
                    owns_entry = current is entry
                    if owns_entry:
                        _metadata_inflight.pop(inflight_key, None)
                    if owns_entry and response is not None:
                        _metadata_cache[cache_key] = _CachedOfficialResponse(
                            fetcher=fetcher,
                            response=response,
                            expires_at=time.monotonic()
                            + _METADATA_CACHE_SECONDS,
                        )
                        while len(_metadata_cache) > _MAX_METADATA_CACHE_ENTRIES:
                            _metadata_cache.pop(next(iter(_metadata_cache)))

            task.add_done_callback(finalize)
        entry.waiters += 1
        task = entry.task
    try:
        return await asyncio.wait_for(
            asyncio.shield(task),
            timeout=max(0.01, deadline_seconds),
        )
    finally:
        cancel_orphan = False
        with _metadata_lock:
            current = _metadata_inflight.get(inflight_key)
            if current is entry:
                current.waiters = max(0, current.waiters - 1)
                if current.waiters == 0 and not current.task.done():
                    _metadata_inflight.pop(inflight_key, None)
                    cancel_orphan = True
        if cancel_orphan:
            task.cancel()


def _utf8(response: BoundedOfficialResponse, *, expected: str) -> str:
    content_type = response.content_type.casefold()
    allowed = {
        "xml": ("xml",),
        "json": ("application/json", "+json"),
        "csv": ("csv", "text/plain"),
    }[expected]
    if not any(token in content_type for token in allowed):
        raise ValueError(f"eurostat_comext_unexpected_{expected}_content_type")
    try:
        return response.content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("eurostat_comext_non_utf8_response") from exc


def _load_json_no_duplicates(text: str, *, reason: str) -> Mapping[str, Any]:
    def object_pairs(pairs: list[tuple[str, Any]]) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(reason)
            result[key] = value
        return result

    try:
        value = json.loads(text, object_pairs_hook=object_pairs)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError(reason) from exc
    if not isinstance(value, Mapping):
        raise ValueError(reason)
    return value


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _data_structure_versions(dsd_xml: str) -> tuple[str, str]:
    try:
        root = ElementTree.fromstring(dsd_xml)
    except ElementTree.ParseError as exc:
        raise ValueError("eurostat_comext_invalid_dsd_xml") from exc
    structures = [
        element
        for element in root.iter()
        if _local_name(element.tag) == "DataStructure"
        and element.attrib.get("agencyID") == "ESTAT"
        and element.attrib.get("id") == _DATASET_ID
    ]
    if len(structures) != 1:
        raise ValueError("eurostat_comext_dsd_identity_mismatch")
    dsd_version = str(structures[0].attrib.get("version") or "")
    product_dimensions = [
        element
        for element in structures[0].iter()
        if _local_name(element.tag) == "Dimension"
        and element.attrib.get("id") == "product"
        and element.attrib.get("position") == "4"
    ]
    references = [
        element
        for dimension in product_dimensions
        for element in dimension.iter()
        if _local_name(element.tag) == "Ref"
        and element.attrib.get("agencyID") == "ESTAT"
        and element.attrib.get("class") == "Codelist"
        and element.attrib.get("id") == _PRODUCT_CODELIST_ID
    ]
    codelist_version = (
        str(references[0].attrib.get("version") or "")
        if len(references) == 1
        else ""
    )
    if not (
        len(product_dimensions) == 1
        and re.fullmatch(r"\d+(?:\.\d+)+", dsd_version)
        and re.fullmatch(r"\d+(?:\.\d+)+", codelist_version)
    ):
        raise ValueError("eurostat_comext_product_dimension_mismatch")
    return dsd_version, codelist_version


def _sparql_url(query: str) -> str:
    return f"{_CLASSIFICATION_ENDPOINT}?{urlencode({'query': query, 'format': 'application/sparql-results+json'})}"


def _sparql_literal(value: str) -> str:
    # JSON string escaping is a safe subset for a SPARQL 1.1 quoted literal.
    if any(ord(character) < 0x20 for character in value):
        raise ValueError("eurostat_comext_unsafe_topic_literal")
    return json.dumps(value, ensure_ascii=False)


def _binding_value(
    row: Mapping[str, Any],
    name: str,
    *,
    value_type: str,
    language: Optional[str] = None,
) -> str:
    binding = row.get(name)
    if not isinstance(binding, Mapping) or binding.get("type") != value_type:
        raise ValueError("eurostat_comext_sparql_binding_mismatch")
    if language is not None and binding.get("xml:lang") != language:
        raise ValueError("eurostat_comext_sparql_language_mismatch")
    value = binding.get("value")
    if not isinstance(value, str) or not value:
        raise ValueError("eurostat_comext_sparql_value_mismatch")
    return value


def _sparql_rows(
    response_text: str,
    *,
    variables: list[str],
    maximum: int,
) -> list[Mapping[str, Any]]:
    payload = _load_json_no_duplicates(
        response_text,
        reason="eurostat_comext_invalid_sparql_json",
    )
    head = payload.get("head")
    results = payload.get("results")
    rows = results.get("bindings") if isinstance(results, Mapping) else None
    if not (
        isinstance(head, Mapping)
        and head.get("vars") == variables
        and isinstance(rows, list)
        and 1 <= len(rows) <= maximum
        and all(isinstance(row, Mapping) for row in rows)
    ):
        raise ValueError("eurostat_comext_sparql_shape_mismatch")
    return rows


def _scheme_query() -> str:
    return """PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?scheme ?label WHERE {
  ?scheme a skos:ConceptScheme ; skos:prefLabel ?label .
  FILTER(lang(?label) = "en")
  FILTER(CONTAINS(LCASE(STR(?label)), "combined nomenclature"))
}
ORDER BY STR(?scheme)
LIMIT 30"""


def _select_scheme(text: str, *, maximum_year: int) -> _ClassificationScheme:
    schemes: list[_ClassificationScheme] = []
    for row in _sparql_rows(
        text,
        variables=["scheme", "label"],
        maximum=_MAX_SCHEMES,
    ):
        uri = _binding_value(row, "scheme", value_type="uri")
        label = _binding_value(row, "label", value_type="literal", language="en")
        uri_match = re.fullmatch(
            r"http://data\.europa\.eu/xsp/cn(20\d{2})/cn\1",
            uri,
        )
        label_match = re.fullmatch(
            r"Combined Nomenclature, (20\d{2}) \(CN \1\)",
            label,
        )
        if not uri_match or not label_match or uri_match.group(1) != label_match.group(1):
            raise ValueError("eurostat_comext_classification_scheme_mismatch")
        year = int(uri_match.group(1))
        if year <= maximum_year:
            schemes.append(_ClassificationScheme(uri=uri, label=label, year=year))
    if not schemes:
        raise ValueError("eurostat_comext_no_current_classification_scheme")
    latest_year = max(row.year for row in schemes)
    latest = [row for row in schemes if row.year == latest_year]
    if len(latest) != 1:
        raise ValueError("eurostat_comext_ambiguous_classification_scheme")
    return latest[0]


def _classification_query(
    scheme: _ClassificationScheme,
    phrases: tuple[str, ...],
) -> str:
    values = " ".join(
        _sparql_literal(normalize_topic_phrase(phrase)) for phrase in phrases
    )
    return f"""PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?code ?label WHERE {{
  ?concept skos:inScheme <{scheme.uri}> ;
           skos:notation ?code ;
           skos:prefLabel ?label .
  VALUES ?needle {{ {values} }}
  FILTER(lang(?label) = "en")
  FILTER(CONTAINS(LCASE(STR(?label)), ?needle))
}}
ORDER BY STR(?code)
LIMIT 64"""


def _topic_is_negated(label: str, phrase: str) -> bool:
    normalized_label = normalize_topic_phrase(label)
    normalized_phrase = normalize_topic_phrase(phrase)
    start = normalized_label.find(normalized_phrase)
    if start < 0:
        return True
    return _NEGATED_TOPIC_PREFIX.search(
        normalized_label[max(0, start - 120) : start]
    ) is not None


def _parse_commodities(
    response_text: str,
    *,
    scheme: _ClassificationScheme,
    phrases: tuple[str, ...],
) -> tuple[_CommodityEntry, str]:
    candidates: list[tuple[_CommodityEntry, str]] = []
    for row in _sparql_rows(
        response_text,
        variables=["concept", "code", "label"],
        maximum=_MAX_CLASSIFICATION_MATCHES,
    ):
        concept = _binding_value(row, "concept", value_type="uri")
        raw_code = _binding_value(row, "code", value_type="literal")
        raw_label = _binding_value(
            row,
            "label",
            value_type="literal",
            language="en",
        )
        code = re.sub(r"\s+", "", raw_code)
        if not (
            re.fullmatch(r"\d{6}|\d{8}", code)
            and concept.startswith(scheme.uri.rsplit("/", 1)[0] + "/")
        ):
            raise ValueError("eurostat_comext_classifier_code_mismatch")
        prefix = re.match(r"^([\d ]+)\s+-\s+(.+)$", raw_label)
        if not prefix or re.sub(r"\s+", "", prefix.group(1)) != code:
            raise ValueError("eurostat_comext_classifier_label_mismatch")
        label = " ".join(prefix.group(2).split())
        entry = _CommodityEntry(
            concept_uri=concept,
            code=code,
            english_label=label,
        )
        for phrase in phrases:
            if (
                exact_topic_phrase_in_visible_text(label, phrase)
                and not _topic_is_negated(label, phrase)
            ):
                candidates.append((entry, phrase))
                break
    if not candidates:
        raise ValueError("eurostat_comext_no_classifier_topic_match")
    best_code_length = min(len(entry.code) for entry, _phrase in candidates)
    best = [row for row in candidates if len(row[0].code) == best_code_length]
    unique = {
        (entry.concept_uri, entry.code, entry.english_label, phrase)
        for entry, phrase in best
    }
    if len(unique) != 1:
        raise ValueError("eurostat_comext_ambiguous_classifier_topic_match")
    return best[0]


def _assert_data_url(
    final_url: str,
    *,
    reporter_code: str,
    product_code: str,
    output_format: str,
    start_period: int,
    end_period: int,
) -> None:
    parsed = urlparse(final_url)
    expected_path = (
        f"{_DATA_PATH}/A.{reporter_code}.WORLD.{product_code}.1.VALUE_IN_EUROS"
    )
    if not (
        parsed.scheme == "https"
        and parsed.hostname == "ec.europa.eu"
        and parsed.path == expected_path
        and parse_qs(parsed.query, keep_blank_values=True)
        == {
            "format": [output_format],
            "startPeriod": [str(start_period)],
            "endPeriod": [str(end_period)],
        }
    ):
        raise ValueError("eurostat_comext_data_url_mismatch")


def _crosscheck_csv(
    csv_text: str,
    *,
    reporter_code: str,
    product_code: str,
    observation: Mapping[str, Any],
) -> None:
    reader = csv.DictReader(io.StringIO(csv_text, newline=""))
    expected_fields = [
        "DATAFLOW", "LAST UPDATE", "freq", "reporter", "partner", "product",
        "flow", "indicators", "TIME_PERIOD", "OBS_VALUE",
    ]
    rows = list(reader)
    if reader.fieldnames != expected_fields or not 1 <= len(rows) <= 3:
        raise ValueError("eurostat_comext_csv_shape_mismatch")
    periods = [str(row.get("TIME_PERIOD") or "") for row in rows]
    if len(set(periods)) != len(periods):
        raise ValueError("eurostat_comext_csv_duplicate_period")
    expected_periods = {
        str(value)
        for value in observation.get("period_labels") or []
        if value
    }
    if not expected_periods or set(periods) != expected_periods:
        raise ValueError("eurostat_comext_json_csv_period_mismatch")
    for row in rows:
        if None in row or not all(value is not None for value in row.values()):
            raise ValueError("eurostat_comext_csv_shape_mismatch")
        if not (
            row["DATAFLOW"] == "ESTAT:DS-045409(1.0)"
            and re.fullmatch(
                r"\d{2}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}",
                row["LAST UPDATE"],
            )
            and row["freq"] == "A"
            and row["reporter"] == reporter_code
            and row["partner"] == "WORLD"
            and row["product"] == product_code
            and row["flow"] == "1"
            and row["indicators"] == "VALUE_IN_EUROS"
            and re.fullmatch(r"20\d{2}", row["TIME_PERIOD"])
            and re.fullmatch(r"\d+", row["OBS_VALUE"])
        ):
            raise ValueError("eurostat_comext_csv_series_mismatch")
    latest = max(rows, key=lambda row: int(row["TIME_PERIOD"]))
    if not (
        latest["TIME_PERIOD"] == observation.get("period")
        and latest["OBS_VALUE"] == observation.get("value")
    ):
        raise ValueError("eurostat_comext_json_csv_observation_mismatch")
    try:
        csv_update = datetime.strptime(
            latest["LAST UPDATE"],
            "%d/%m/%y %H:%M:%S",
        )
        json_update_utc = datetime.fromisoformat(
            str(observation.get("published_at") or "")
        ).replace(tzinfo=None)
    except ValueError as exc:
        raise ValueError("eurostat_comext_release_time_mismatch") from exc
    # CSV omits the publisher timezone. JSON is canonical UTC after parsing;
    # Eurostat's wall-clock release may therefore be one or two hours ahead.
    if abs((csv_update - json_update_utc).total_seconds()) not in {3_600, 7_200}:
        raise ValueError("eurostat_comext_release_time_mismatch")


async def acquire_eurostat_comext_source(
    topic_seed_contract: TopicSeedContract | Mapping[str, Any],
    *,
    country_code: str,
    fetcher: OfficialFetcher = _fetch_bounded_official,
    stage_seconds: float = _DEFAULT_STAGE_SECONDS,
    now: Optional[datetime] = None,
) -> EurostatComextAcquisition:
    """Return one evidence-ready source candidate or fail-closed diagnostics."""

    started = time.monotonic()
    effective_stage_seconds = max(0.05, float(stage_seconds))
    deadline = started + effective_stage_seconds
    logical_call_count = 0
    try:
        seed = (
            topic_seed_contract
            if isinstance(topic_seed_contract, TopicSeedContract)
            else TopicSeedContract.model_validate(topic_seed_contract)
        )
        code = str(country_code or "").strip().upper()
        if code not in _EU_COUNTRY_CODES or code not in seed.confirmed_country_codes:
            raise ValueError("eurostat_comext_unsupported_reporter")
        phrases = product_topic_phrases(seed)
        if not phrases:
            raise ValueError("eurostat_comext_missing_product_topic")
        reference_time = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)

        dsd_url = _DSD_URL
        scheme_url = _sparql_url(_scheme_query())
        logical_call_count += 2
        dsd, scheme_response = await asyncio.wait_for(
            asyncio.gather(
                _fetch_cached_official(
                    dsd_url,
                    _METADATA_MAX_BYTES,
                    _remaining(deadline),
                    fetcher=fetcher,
                ),
                _fetch_cached_official(
                    scheme_url,
                    _CLASSIFICATION_MAX_BYTES,
                    _remaining(deadline),
                    fetcher=fetcher,
                ),
            ),
            timeout=_remaining(deadline),
        )
        if dsd.final_url.rstrip("/") != dsd_url.rstrip("/"):
            raise ValueError("eurostat_comext_dsd_url_mismatch")
        if scheme_response.final_url != scheme_url:
            raise ValueError("eurostat_comext_scheme_url_mismatch")
        dsd_version, codelist_version = _data_structure_versions(
            _utf8(dsd, expected="xml")
        )
        scheme = _select_scheme(
            _utf8(scheme_response, expected="json"),
            maximum_year=reference_time.year,
        )

        classifier_url = _sparql_url(_classification_query(scheme, phrases))
        logical_call_count += 1
        classifier_response = await asyncio.wait_for(
            _fetch_cached_official(
                classifier_url,
                _CLASSIFICATION_MAX_BYTES,
                _remaining(deadline),
                fetcher=fetcher,
            ),
            timeout=_remaining(deadline),
        )
        if classifier_response.final_url != classifier_url:
            raise ValueError("eurostat_comext_classifier_url_mismatch")
        commodity, matched_phrase = _parse_commodities(
            _utf8(classifier_response, expected="json"),
            scheme=scheme,
            phrases=phrases,
        )

        end_period = reference_time.year
        # Two completed annual periods plus the possibly empty current year
        # stay within the parser's hard three-position cap.
        start_period = end_period - 2
        series_key = f"A.{code}.WORLD.{commodity.code}.1.VALUE_IN_EUROS"
        suffix = f"startPeriod={start_period}&endPeriod={end_period}"
        json_url = (
            f"{_COMEXT_BASE}/data/{_DATASET_ID}/{series_key}?format=JSON&{suffix}"
        )
        csv_url = (
            f"{_COMEXT_BASE}/data/{_DATASET_ID}/{series_key}?format=SDMX-CSV&{suffix}"
        )
        logical_call_count += 2
        json_response, csv_response = await asyncio.wait_for(
            asyncio.gather(
                fetcher(json_url, _DATA_MAX_BYTES, _remaining(deadline)),
                fetcher(csv_url, _DATA_MAX_BYTES, _remaining(deadline)),
            ),
            timeout=_remaining(deadline),
        )
        _assert_data_url(
            json_response.final_url,
            reporter_code=code,
            product_code=commodity.code,
            output_format="JSON",
            start_period=start_period,
            end_period=end_period,
        )
        _assert_data_url(
            csv_response.final_url,
            reporter_code=code,
            product_code=commodity.code,
            output_format="SDMX-CSV",
            start_period=start_period,
            end_period=end_period,
        )
        json_text = _utf8(json_response, expected="json")
        csv_text = _utf8(csv_response, expected="csv")
        observations = _structured_statistical_observations(json_text)
        if len(observations) != 1:
            raise ValueError("eurostat_comext_invalid_jsonstat_observation")
        observation = observations[0]
        if not (
            observation.get("reporter_code") == code
            and observation.get("product_code") == commodity.code
            and normalize_topic_phrase(str(observation.get("product_label") or ""))
            == normalize_topic_phrase(commodity.english_label)
        ):
            raise ValueError("eurostat_comext_classifier_data_mismatch")
        topic_match = match_visible_statistical_topic(
            seed,
            {
                "title": observation.get("product_label") or "",
                "series": [observation.get("series") or ""],
            },
            country_code=code,
            source_anchors=phrases,
        )
        if not topic_match.matched:
            raise ValueError("eurostat_comext_data_topic_mismatch")
        _crosscheck_csv(
            csv_text,
            reporter_code=code,
            product_code=commodity.code,
            observation=observation,
        )

        normalized_json = " ".join(json_text.split())
        if not normalized_json or len(normalized_json) > 2_000:
            raise ValueError("eurostat_comext_json_claim_too_large")
        json_hash = _sha256(json_response.content)
        csv_hash = _sha256(csv_response.content)
        classifier_hash = _sha256(classifier_response.content)
        query_urls = [
            dsd_url,
            scheme_url,
            classifier_url,
            json_url,
            csv_url,
        ]
        query_ids = [
            f"query-{hashlib.sha256(url.encode('utf-8')).hexdigest()[:20]}"
            for url in query_urls
        ]
        provenance = {
            "adapter_version": "eurostat_comext_product_import_v1",
            "dataset_id": _DATASET_ID,
            "data_structure_version": dsd_version,
            "data_structure_url": dsd.final_url,
            "data_structure_sha256": _sha256(dsd.content),
            "data_structure_retrieved_at": dsd.retrieved_at,
            "product_codelist_id": _PRODUCT_CODELIST_ID,
            "product_codelist_version": codelist_version,
            "classification_scheme_uri": scheme.uri,
            "classification_scheme_label": scheme.label,
            "classification_scheme_query_url": scheme_response.final_url,
            "classification_scheme_response_sha256": _sha256(
                scheme_response.content
            ),
            "classification_scheme_retrieved_at": (
                scheme_response.retrieved_at
            ),
            "classification_query_url": classifier_response.final_url,
            "classification_response_sha256": classifier_hash,
            "classification_retrieved_at": classifier_response.retrieved_at,
            "classification_concept_uri": commodity.concept_uri,
            "product_code": commodity.code,
            "product_label": commodity.english_label,
            "matched_topic_phrase": matched_phrase,
            "reporter_code": code,
            "json_url": json_response.final_url,
            "json_sha256": json_hash,
            "json_retrieved_at": json_response.retrieved_at,
            "csv_url": csv_response.final_url,
            "csv_sha256": csv_hash,
            "csv_retrieved_at": csv_response.retrieved_at,
            "selected_period": observation["period"],
            "selected_observation_sha256": observation["observation_sha256"],
        }
        source = {
            "title": (
                f"Eurostat Comext: {commodity.english_label} — annual import value"
            )[:500],
            "url": json_response.final_url,
            "retrieval_url": json_response.final_url,
            "provider": "eurostat_comext_official",
            "provider_source_id": f"eurostat-{code}-{commodity.code}",
            "retrieved_at": json_response.retrieved_at,
            "provider_response_hash": json_hash,
            "provider_query_ids": query_ids,
            "provider_queries": query_urls,
            "citation_metadata": {"eurostat_comext": provenance},
            "provider_redirect": False,
            "country_codes": [code],
            "market_terms": [str(observation.get("reporter_label") or "")],
            "acquisition_evidence_classes": ["official_statistic"],
            "_direct_document_candidate": {
                "final_url": json_response.final_url,
                "text": normalized_json,
                "retrieved_at": json_response.retrieved_at,
                "commercial_offer_evidence": [],
                "structured_statistical_observations": observations,
                "_structured_evidence_html": json_text,
            },
        }
        return EurostatComextAcquisition(
            status="completed",
            source=source,
            diagnostics={
                "status": "completed",
                "reporter_code": code,
                "product_code": commodity.code,
                "product_label": commodity.english_label,
                "matched_topic_phrase": matched_phrase,
                "selected_period": observation["period"],
                "classification_scheme": scheme.label,
                "call_count": logical_call_count,
                "metadata_call_count": 3,
                "data_call_count": 2,
                "elapsed_ms": int((time.monotonic() - started) * 1_000),
                "deadline_ms": int(effective_stage_seconds * 1_000),
            },
        )
    except asyncio.CancelledError:
        raise
    except (asyncio.TimeoutError, TimeoutError):
        return EurostatComextAcquisition(
            status="timeout",
            source=None,
            diagnostics={
                "status": "timeout",
                "call_count": logical_call_count,
                "elapsed_ms": int((time.monotonic() - started) * 1_000),
                "deadline_ms": int(effective_stage_seconds * 1_000),
            },
        )
    except (ValueError, httpx.HTTPError) as exc:
        return EurostatComextAcquisition(
            status="failed_closed",
            source=None,
            diagnostics={
                "status": "failed_closed",
                "reason": str(exc)[:160],
                "call_count": logical_call_count,
                "elapsed_ms": int((time.monotonic() - started) * 1_000),
                "deadline_ms": int(effective_stage_seconds * 1_000),
            },
        )
