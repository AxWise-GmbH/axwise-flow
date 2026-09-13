# Assistant source admission and citation rendering — 9 September 2026

Scope: the existing one-shot Research path from Orqaly through the AxWise
Assistant operation, bounded grounded search or exact-fetch fallback, and the
persisted reader-facing result. No new operation, planner, provider, database
schema, execution permission or Orqaly setting is introduced.

## Source authority

The server resolves explicit source constraints from current and prior **user**
messages into one operation-local policy. Assistant prose, source titles and
provider guesses do not establish publisher identity. Roots are canonical HTTPS
origins plus path-segment boundaries, not substring matches or wildcard hosts.
Explicit user references establish the requested scope, not independent proof
that the named organization owns that site.

For a named publisher without a URL, a small reviewed data registry can bind its
documentation roots. The initial n8n entry records the publisher-to-repository-to-
documentation link chain and distinguishes documentation from the community
forum. It is identity data used only for explicit requests, not a universal
source allowlist. Unknown publishers and unresolved restrictions fail before
paid search with `AXWISE_ASSISTANT_SOURCE_REFERENCE_REQUIRED`, zero calls and
zero tokens. The existing UI may show a generic failure; automatic friendly
clarification is **not** implemented in this patch. A user follow-up can supply
the missing URL. The bounded English constraint parser is not a comprehensive
natural-language or multilingual policy interpreter.

The same resolved policy is carried in the internal canonical Assistant query,
included in provider instructions, and supplied to final publication. The
external shared wire contract and request hash do not change. Fallback discovery
receives coarse allowed hosts, while exact origin/path admission applies before
candidate limits, before every direct-fetch redirect's DNS/request, and to the
final URL before extraction. Legacy Research paths without this optional policy
retain their existing behavior.

## Publication and provenance

Discovered but unlinked outside-policy sources can be omitted. An outside-policy
claim source or visible prose-link destination rejects the generated answer;
an allowed discovered URL cannot be substituted as its evidence. Admission
retains the existing complete-assertion and exact UTF-8 response-span checks.
The raw provider response, its claims, span offsets, hashes and source ledger
are never rewritten.

Reader-facing Markdown is a separate view. Opaque and numeric citation markers
are resolved only through the locally admitted assertion/source mapping, never
through the marker's identifier. Ordinary Markdown, reference and autolinks must
already name an exact locally admitted URL. Their meaningful labels and targets
are preserved; a mismatched download or endpoint link is not silently repointed.
Unresolved markers fail publication. Literal code and template examples remain
literal, and a link-only reference is not promoted into a fact. Fact-card display
removes citation syntax only after successful admission. Exact-fetch fallback
quotes remain owned by the existing literal-excerpt formatter.

Visible destinations are independently parsed with pinned `markdown-it-py==4.0.0`
and `mdurl==0.1.2`, using CommonMark plus tables, consistent with the current
Orqaly reader's relevant syntax. Bare-URL linkification is disabled and raw HTML
is not mounted by that reader. The exact-span renderer must account for the same
destination occurrences; disagreement, unsupported link syntax or parser limits
reject publication. This catches nested references, ambiguous nested labels and
invalid code delimiters without relying on a growing set of URL-scanning rules.
These two pure-Python dependencies add no service, network fetch or model call.
Parser/token API: [maintainer documentation](https://markdown-it-py.readthedocs.io/en/latest/using.html).

This is provenance and source-scope enforcement, **not** a full factual-entailment
or all-assertions-covered guarantee. The existing minimum remains at least one
admitted complete assertion; a surviving source link is not proof that the source
supports every word. Live quality review must inspect coverage and distinguish
documented claims, proposed implementations and assumptions.

## Bounded repair and metering

Parsed publication defects participate in the existing single repair opportunity
and original three-provider-attempt/time budget. Rejected prose, URLs and evidence
are not replayed into the repair prompt. Normalization and redirect resolution
occur once per response, with an operation-local cache, cancellation and the same
deadline. Returned response usage is retained even when publication fails.
Configuration errors are not provider outages. Remaining quality or availability
failures may use the existing bounded fallback; the final projection never starts
another search lifecycle.

## Release and acceptance gates

Run the complete private-v2 suite, search/runtime/build tests, unchanged Orqaly
shared-contract/activity checks where the local runtime is available, dependency
validation and the existing release guards. There is no fresh PostgreSQL claim
for this source-only patch; storage/schema are unchanged. Include the reviewed
publisher JSON in the allowlisted source export and image.

Only the existing AxWise preview API and worker images may change. Preserve IAM,
secrets, resources and all thirteen observed service states except the two target
images/revisions. Fence the old worker, record a zero-instance metric, select and
start the replacement, prove it running, then promote the API. Collect a fresh
research-only synthetic acceptance using the same official-n8n-docs fixture;
report its actual outcome without retrying for a favorable sample. Release
receipts and live results are recorded separately from these implementation notes.

Local verification at this milestone: **1,490 private-v2 tests passed**; one
PostgreSQL module was intentionally skipped. **100 search/runtime/build tests
passed**, and the isolated environment reported no broken requirements. The
semantic link helper matched the actual Orqaly reader on a 22-case Markdown
matrix. Independent reviews also exercised source-policy publication and exact
raw-ledger preservation.

No fresh Orqaly test pass is claimed: its prior local Vitest runtime is no longer
available. The earlier 117-pass receipt remains historical; surviving contracts
and selected tests match the intact source snapshot byte-for-byte. No Orqaly code
or dependencies were modified. Live release/acceptance is on hold because the Mac
is locked and the authenticated browser cannot be inspected. At this milestone,
no cloud read, image build, deployment or fresh model request has been made for
this candidate. The last verified deployed release remains `308c6a65`.
