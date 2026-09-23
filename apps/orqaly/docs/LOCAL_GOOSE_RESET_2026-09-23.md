# Local Goose reset — 23 September 2026

Scope: compare installed vanilla Goose with the reset fork locally. No release,
push, upload, deployment, website update, billing or RBAC change is included.

## What changed

- Goose/Gemini owns the normal tool-and-answer loop again, in both Rust loop
  implementations. Tool metadata cannot bypass the model and terminate a turn.
- The desktop unmounts the legacy `orqaly` extension from resumed sessions and
  mounts `desktop-utilities` instead. Mandatory Axwise routing, exclusive
  retrieval and compulsory OMP delegation instructions are removed.
- Weather and currency use bounded direct public APIs with short-lived caches.
  They retain typed desktop cards and return ordinary tool results to Gemini.
- Search is an independent grounded Gemini tool through a thin relay, without
  Axwise work queues, project-context injection or publisher-page acceptance
  gates. It preserves native citations and includes a warning in the tool result
  that publication dates are not independently verified. The benchmark found
  that Gemini omitted this warning from its final answer; this is a remaining
  quality gap. Goose can choose another permitted tool/query.
- JEV remains optional for incoming-message steer/queue decisions. It is not a
  required classifier before weather, search or ordinary replies.
- The existing browser sign-in flow is retained; the desktop accepts the thin
  relay's account-scoped session contract. Model and TypeSafe keys stay in relay
  memory, not the desktop, benchmark child environment or report files.

The chat-rendering review kept card presentation separate from agent completion:
an attractive weather card is a tool result, not a command to stop reasoning.

## Local-only boundary

The reset preview is version **2.3.10, build 5677**, built from the local working tree. It is
not a published release. The launcher creates a separate desktop profile with
OMP off and optional JEV on; installed apps and conversation history are untouched.

Launch from the repository root:

```sh
node scripts/run-local-reset-preview.mjs --preview
```

This reads the existing preview secrets into a loopback-only relay, then starts
the local packaged application. It requires the existing gcloud login. Do not
launch the `.app` directly for this comparison: without `ORQANIX_LOCAL_API_URL`
the desktop still defaults to the deployed preview API. Do not enable OMP in
this isolated preview: its optional transport has not been moved to the local
relay. Those are explicit comparison boundaries, not deployment changes.

Axwise specialist work and its old image-generation tool are not mounted in the
reset. Reintroducing Axwise as an optional specialist extension and extracting
image generation are separate follow-up work.

## Comparison method

```sh
node scripts/run-local-reset-preview.mjs --benchmark --cases 2 --repeats 2 --timeout-seconds 90 --interactive-review
```

- Exactly two arms: installed vanilla Goose 1.50.0 and the freshly built reset.
- Same Gemini 3.8 Flash transport, approval mode, three explicitly configured
  extensions (`developer`, `todo`, `code_execution`), and Code Mode catalogue
  disclosure. Goose also loads its default extensions; the report records actual
  session inventories. Only reset adds desktop utilities.
- Fresh isolated Goose profiles, a public-information conversation and a tiny
  read-only local code fixture. No personal chats are benchmark inputs.
- The reported run covers Kaunas weather and a local-news follow-up, with two
  planned repetitions and arm order reversed. The script also supports techno
  events within 150 km and local fixture inspection, but this report does not
  establish results for those cases.
- Measures first text, tool calls, post-tool answer text, complete-turn time,
  usage receipts, failures and source links. First text is not automatically
  counted as the first useful answer. Local warm/cold profile labels do not
  establish provider cache hits.
- Prewarmed offline DDGS dependencies are available to vanilla. A bounded AST
  approval policy validates Code Mode's nested tool calls. Unexpected commands
  pause for review, not blanket permission. This is a controlled ACP comparison,
  not a measurement of all 16 installed extensions or full Electron rendering.
- The live comparison uses explicit allow-once review for read-only scripts
  outside that narrow grammar. Reports retain wall time and review wait, with
  active completion time excluding the operator's wait. No review delay is
  presented as model latency.

## Verification

- 118 targeted desktop tests passed, followed by three additional sign-in
  contract regressions; the final connection suite passes 38 tests. TypeScript
  check passed.
- Both Rust agent loops passed the continuation regression: legacy/new tool
  identity × completed/incomplete/failed result, 12 scenarios.
- 15 utility tests and 8 runtime/build-provenance tests passed.
- 84 thin relay/provider/search tests passed, including nested citation spans
  and Unicode offsets.
- 19 benchmark transport, redaction, inventory and approval-policy tests passed.
- Packaged application signature, fork binary digest, version/build number and
  absence of an automatic updater were verified locally. Browser sign-in and
  the chat home screen were verified. The initial sign-in incompatibility was
  fixed: the desktop now accepts the thin relay's `accountScoped: true` contract
  while retaining legacy `tenantBound` compatibility, without relaxing auth.

Direct-service smoke measurements are not desktop timings: weather lookups were
77–476 ms; two search requests were 4.6 and 5.2 seconds. Search returned sources
instead of the old forced no-results terminal answer. These numbers alone do
not establish news accuracy or a faster end-user experience.

## Comparison results

Seven of eight planned turns completed. These are **active completion times**,
excluding human approval wait, not full desktop wall-clock timings:

| Task | Vanilla | Reset | Interpretation |
| --- | --- | --- | --- |
| Weather, repetition 1 | 36.45 s; 7 calls | 4.51 s; 1 call | Direct utility avoids discovery and retrieval retries. |
| Weather, repetition 2 | 15.12 s; 5 calls | 4.89 s; 1 call | Consistent improvement in this small sample. |
| Local news, repetition 1 | 46.70 s; 9 calls | 38.17 s; 4 calls | Reset is somewhat faster but selects worse stories. |
| Local news, repetition 2 | Incomplete: operator-review timeout | 23.97 s; 4 calls | No paired speed conclusion for this repetition. |

The second vanilla news turn stopped because the harness's 60-second manual
review window expired before approval arrived. This is a test-operator limitation,
not evidence of a Goose retrieval failure. The raw report retains that stopped
row; do not use its failure-inclusive aggregate percentiles as successful-answer
latency. Earlier pilot runs also hit approval limits, including the events case;
they are excluded from these timings. Event ranking and fixture inspection remain
unmeasured.

Both repetitions passed common extension/tool inventory comparison. Actual
vanilla inventory was `analyze`, `apps`, `code_execution`, `developer`,
`extensionmanager`, `skills`, `summon`, `todo`, and `tom` (21 tools); reset added
only `desktop-utilities` (24 tools total). This is not the installed user's entire
extension configuration. Provider cache hits were not established.

### News quality: not replacement-ready

Vanilla's completed selection contained local-publisher stories dated September
23, September 23 and September 22. Reset's first selection was dated September
23, September 21 and September 17; its second was September 17, September 15 and
August 25. Therefore faster completion did **not** mean a better answer.

The six reset citation redirects resolved to five real publisher pages. The
problem is primarily selection and freshness, with some unsupported detail:

- [September 23 remembrance coverage](https://ua.news/en/world/23-veresnia-u-litvi-vshanovuiut-zhertv-genotsidu-ievreyiv)
  is national; the Kaunas ceremony described is scheduled for September 24.
- [September 21 Kaunas festival announcement](https://kaunas.kasvyksta.lt/renginiai/kaune-atgis-baltu-tradicijos-festivalis-kvies-i-nemokamus-renginius)
  is genuinely local and supported.
- [September 17 military exercises](https://news.by/eng/news/v_mire/thunder-of-perkunas-2026-drills-launched-in-lithuania)
  are nationwide, six days old, and appeared in both repetitions.
- [September 15 drone report](https://en.belsat.eu/95396781/lithuania-on-high-alert-drone-shot-down-near-kaunas-after-crossing-from-belarusian-airspace)
  supports the headline/date, but the accessible article did not verify the
  added NATO-fighter, reservoir and district details.
- [August 25 commemoration report](https://visiisvien.lt/en/ukraine-independence-day-kaunas-2026-commemoration/)
  describes an August 24 event: not a latest-local headline on September 23.

The main model broadened one search to include August and omitted the tool's
freshness warning in both final answers. Native grounding citations alone are
not a relevance, recency or claim-verification guarantee. The experimental
search tool remains available in this local comparison build; it is **not**
approved as a wholesale replacement for Goose's other retrieval tools.

Recommended next change: preserve Goose's open tool loop, keep direct weather,
and improve search evidence (local publisher coverage, explicit publication and
event dates, and uncertainty carried into the final answer) before claiming
faster correct news. Do not restore an Axwise gate that forbids alternatives or
silently substitutes older results. No such additional search fix is claimed in
this build.

### Desktop smoke verification

Browser sign-in now reaches the chat screen. A real desktop weather turn then
rendered the Kaunas Open-Meteo card, current conditions, seven-day forecast and
source link, followed by a normal Gemini summary. It used `desktop-utilities:
get weather`, without Axwise or OMP. This verifies presentation, not the ACP
timing numbers above. The desktop also reported an unrelated Exa Search extension
load failure; weather succeeded despite that warning. The user's extension
configuration was not changed to suppress it.

Raw run, profiles and receipts are local only:
`/var/folders/18/9fzqvw3s11l5_4bfkfj20f740000gn/T/goose-reset-benchmark-4dv9bE/report.json`.
The preview app remains open in its separate profile. No source changes have
been committed or pushed, and nothing was deployed or uploaded.
