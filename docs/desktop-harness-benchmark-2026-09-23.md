# Desktop harness revision: implementation and benchmark

## Implemented design

The desktop keeps one conversation and the existing floating workflow panel. The implementation separates three paths:

- Everyday public information: authenticated, stateless `/desktop/v1/information` → `/v2/information`, without a durable operation, worker, or status polling. Weather and currency use structured providers, not a model. News/events use bounded Gemini discovery and independently fetched publisher evidence.
- Substantial PRDs, interviews, simulations and deep evidence work: existing durable AxWise workflow.
- Local engineering: OMP, under existing user approvals. Retrieval failures never automatically start it.

JEV is advisory. It helps distinguish corrections to active work from independent follow-ups, and can rank eligible information or recognize semantic locality after deterministic date/source checks. It cannot authorize tools, invent dates, declare step completion, or bypass a disabled setting.

Incoming follow-ups are saved to account/session-scoped disk storage before clearing the composer. Corrections can steer the same active run at a supported boundary; independent or ambiguous messages queue. Mixed correction-plus-new-task messages queue intact. Recovered/uncertain deliveries remain paused to avoid duplicate execution. Concurrent windows use optimistic revision checks. Explicit Stop does not wait for JEV.

Roadmap identities remain stable across revisions. A model-written checked box is an unverified claim, not a successful tool receipt. This release does not add autonomous roadmap rewriting or split mixed messages automatically.

## Measurements

All percentiles below use nearest rank. Small, hand-selected samples are smoke benchmarks, not general accuracy or latency guarantees. These are adapter/service timings from this development machine, **not full desktop message-to-answer timings**. Initial Gemini tool selection, OAuth, Cloud Run/network overhead and rendering are excluded unless explicitly stated.

| Test | Samples | Median | p95 | Result |
| --- | ---: | ---: | ---: | --- |
| Structured weather, fresh runner/client | 9 | 243 ms | 324 ms | 0 failures; Bremen/Riga/Kaunas ×3 |
| Structured weather, same runner cache | 9 | 0.035 ms | 0.066 ms | All cache hits |
| Structured currency, fresh runner/client | 9 | 118 ms | 165 ms | 0 failures; EUR/USD, USD/EUR, EUR/EUR ×3 |
| Structured currency, same runner cache | 9 | 0.037 ms | 0.059 ms | All cache hits |
| JEV message disposition, local Node + live TypeSafe | 18 | 275 ms | 621 ms | 18/18 expected decisions, zero unsafe steers in this small fixture |
| Gemini discovery, JEV off | 5 | 8.514 s | 11.424 s | Representative pre-final-regression live run |
| Gemini discovery, JEV on | 5 | 7.187 s | 11.125 s | Representative pre-final-regression live run |

Provider-side caching is uncontrolled even when our runner/client is fresh. The discovery sample was taken before final identity/future-date/genre/intent regression tightening; it is not a final-release quality score. Five of ten cold discovery calls produced at least one eligible item; others honestly returned no verified match. Search variance and this sample size do not establish a speed/quality improvement from JEV. The previous user trace's minute-long weather sequence is not an apples-to-apples benchmark baseline.

Final-gate spot-check (Bremen, Riga, Kaunas news; three calls per JEV setting): **only 1/6 cold calls produced verified results**, three Bremen publisher headlines with JEV enabled. The other five returned no verified matches. JEV-off median/p95: 8.452/10.404 seconds; JEV-on: 9.226/14.220 seconds. All six immediate repeats were cache hits. This is a **discovery-coverage failure**, not a passing news-quality benchmark. Do not advertise news retrieval as solved; the release improves isolation, source/date discipline and failure behavior while publisher coverage remains follow-up work.

Two additional diagnostic queries identified the main problem: all six Riga/Kaunas cited pages fetched successfully, but they were homepages, archives or category pages, with no same-page publication metadata. Examples included `eng.lsm.lv/popular/`, `eng.lsm.lv/archive/`, `kaunas.lt/kategorija/naujienos/` and `kauno.diena.lt/`. The next retrieval fix is title-matched resolution to exact article detail URLs before the existing gates, not relaxing date/locality checks. The current bounded first-four-child fallback is insufficient.

Reproduce public weather/FX timings with `scripts/benchmark-structured-information.py`. Use `scripts/benchmark-desktop-information.py --cloud-secrets` for discovery and `apps/orqaly/scripts/benchmark-desktop-decisions.mjs` for disposition. Provider secrets remain in memory; benchmark outputs contain only public test prompts/results and timings.

## Caching and bounded work

- Weather: five minutes, capped at local midnight; stale provider timestamps rejected.
- Geocoding: one hour, bounded local cache.
- Currency: fifteen minutes; daily reference rate with its real source date, not a tradable quote. Cache key currently includes the requested amount.
- Quick information: two minutes for positive results, fifteen seconds for no-match results; JEV mode and discovery intent partition cache entries. Per-process only, not a distributed cache.
- JEV disposition: 900 ms service deadline; unavailable, uncertain or stale advice preserves the queued message. No decision cache.
- Quick discovery: 15 seconds overall, with at most one alternate-publisher repair inside that budget. Native Google Search may issue multiple search queries. This is not a claim of exactly one search query.

## Deliberate limitations / next benchmark

The initial full-context desktop Gemini tool-selection round remains. This is the next target for end-to-end latency measurement; backend sub-second weather must not be advertised as sub-second desktop response.

News/events coverage is still inconsistent. Blocked publisher pages, absent structured dates/coordinates, local-language metadata and conservative identity/genre checks can yield fewer results. Radius means computed straight-line distance from publisher coordinates, not driving distance. No exhaustive event discovery guarantee. Ordinary current-fact answers rely on native search citations; the extra publisher date gate is specifically for temporal discovery.

Open-Meteo's public endpoint is for evaluation; configure its commercial endpoint/key before commercial usage. Weather is model-valid data (the card says “Valid at”), not a station observation. Additional providers and multilingual date interpretation are follow-up work, not hidden fallbacks in this release.

Before calling the whole harness faster, test a clean desktop conversation and a long existing conversation with weather, local news, typed follow-ups, JEV off, OMP off, restart and two-window queue conflicts. Measure message-to-first-useful-result separately from model tokens/second.
