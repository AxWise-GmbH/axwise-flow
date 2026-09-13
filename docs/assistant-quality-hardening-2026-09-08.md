# Assistant quality hardening — 8 September 2026

Scope: close the concrete semantic, claim-projection and observability gaps in the
fresh Orqaly Research acceptance run on `1ec3fa47`. This is a bounded quality patch,
not a new planner, operation type, execution permission or broad factual guarantee.

## Publication behavior

- The canonical prompt separates current workspace inventory from instructions not
  to execute. Technical examples must use compatible execution modes and cite the
  relevant component; inbound authentication is not downstream provider freedom.
- A narrow consistency policy detects the observed n8n collection-input/per-item
  contradiction, explicit authentication/provider conflation and unsupported
  credential/execution absence statements. It considers local Markdown context,
  user-supplied facts and corrections. It is not a multilingual or exhaustive
  semantic verifier and does not execute generated snippets.
- The existing asynchronous Gemini retry owner allows at most one content repair,
  within the same absolute deadline and three-attempt cap. Static defect
  instructions augment the original canonical request; rejected prose and source
  URLs are not replayed into the correction or mixed into final provenance.
- A remaining quality rejection can use the existing exact-fetch evidence
  fallback, but does not open the provider-outage circuit for other requests.
  The service publication gate does not start another search lifecycle.
- Supported facts must be complete Markdown assertions already covered by exact
  UTF-8 provider spans. Contiguous/overlapping supports can combine only with the
  same source set and verified response-part hashes. Code fragments, separators
  and isolated table cells are excluded. Unattributed final sentence punctuation
  can be omitted; missing words cannot be invented. The raw ledger is unchanged.
- Explicit node/source mismatches are removed from fact links, using exact-span
  heading context without changing the published statement. General/ambiguous
  sources remain inconclusive; a remaining link is not proof of entailment.
  If an assertion has only explicitly mismatched sources, the whole one-shot
  answer fails publication rather than leaving it in Markdown beside other facts.

## Metering and observability

Returned provider responses from both original and repair attempts are counted.
Final provenance still belongs only to the accepted response. Missing or malformed
usage receipts make aggregate tokens/cost unknown; an unobserved timed-out call is
not treated as free. Model version is exposed only when observed attempts agree.
Observable primary-only counters remain separately scoped when extraction fails.

This release includes parent `d24ecd71`: the ASGI lifespan and CLI configure only
the metadata-only operation lifecycle logger. Root/provider logging is not enabled.
Live completion-event and customer-flow evidence must still be collected after
release; local tests alone do not satisfy that gate.

## Deployment boundary

Only the existing AxWise preview API and worker images may change. Preserve resource
caps, IAM, secrets, the website, Orqaly, n8n, search and database schema. Export only
allowlisted bytes from the final commit. Fence and verify the old worker has zero
instances before staging its successor; prove the successor is running before API
promotion. Keep separate release receipts and a fresh research-only acceptance run.

No fresh PostgreSQL test is claimed for this pure quality patch: the unchanged
store/schema were exercised against a disposable real PostgreSQL database for the
deployed parent refactor, and the database has already been removed.

Local gates: full private-v2 suite passed (PostgreSQL module skipped), 81
search/build tests passed, 117 Orqaly shared-contract/activity tests passed, and the
locked Python environment reported no broken requirements. Exact final suite and
release-guard counts belong in the release acceptance receipt.
