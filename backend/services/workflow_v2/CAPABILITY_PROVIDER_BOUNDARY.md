# Consent-gated capability provider boundary

Status: implemented for explicit injection and tested offline. The default
`build_cognitive_executor` supplies no Analysis or Simulation generator unless
`AXWISE_CAPABILITY_GENERATORS_ENABLED` is exactly `true`. Missing, empty, or
`false` stays disabled; all other values fail startup. The opt-in supplies both
lazy adapters with the existing explicit Google credential. No runtime flag,
environment configuration, migration, deployment, live provider call, or new
dependency has been applied. Importing or constructing an
adapter does not construct a Google client or send data.

## Authorized data and requests

`GoogleAnalysisGenerator` and `GoogleSimulationGenerator` use the installed
`google-genai==2.17.0`, the existing `models/gemini-3.8-flash` resource, and HIGH
thinking. There is no model migration or fallback provider.

- Analysis sends only the existing reviewed projection: selected corpus document
  IDs, titles, exact text and hashes, provenance labels, source-speaker/turn
  metadata, and the Analysis request/questions.
- Simulation sends only the existing reviewed projection: scenario, stakeholder
  descriptions/questions, sampling/style/profile, deterministic synthetic
  participant plan, and explicitly selected passage text under local passage IDs.
- Neither projection includes account/tenant IDs, owner identity, scope authority,
  operation IDs, source artifact references, unselected passages, or unrelated
  workflow history. Document/synthetic participant IDs are source-local identities,
  not account identities. Free text is not automatically anonymized; the owner
  must review it before consenting.

Every invocation can transmit that reviewed projection to Google **twice**:
once to `countTokens`, then at most once to `generateContent`. The token preflight
also processes selected source data and requires the same explicit consent as
generation. It can reject an oversized prompt after that first transmission.
The complete identical prompt contains static task instructions, the static
candidate schema, and exactly the reviewed projection; there is no separate hidden
system prompt or schema that escapes token preflight. Token counting is not a
generation or a billing receipt.

## Admission and transport guards

The operation handler revalidates the complete owner-bound consent envelope,
resolves exact owned source artifacts and selected entries, and verifies accepted
scope authority before issuing an in-process processing permit. The adapter
revalidates the projection and synthetic plan, then requires the permit's exact
purpose, operation identity, payload hash, limits and unexpired deadline before
constructing a provider. It repeats that check before token counting, generation,
and at the final HTTP transport boundary.

The existing worker first-claim rule is unchanged: a reclaimed paid capability
operation requires a fresh owner-confirmed operation, not copied consent. The
permit is an internal handoff, not a substitute for authentication or a durable
spend ledger. Calling a generator directly is not an authorized worker workflow.

The transport permits only one POST to each exact Google Developer API endpoint,
in order, with an exact allowlisted request body. It pins the API/model/host,
strips caller/SDK context headers, uses explicitly supplied credentials and bundled
TLS roots, and disables proxies, redirects, replay recording, SDK/HTTP retries,
tools, search, file access, explicit cache requests, history, and fallback endpoints. Payload tracing
is suppressed locally to the invocation. The wire credential is necessary for
Google authentication; no account identity is added to the model prompt.
This does not override Google's own retention or implicit-caching policies.

The requested, consented and server limits are intersected. The full prompt is
capped at 1,000,000 UTF-8 bytes; its returned count must be known and within the
effective input-token limit. Request bytes are separately bounded for SDK JSON
escaping. Count replies are capped at 16,384 bytes, generation replies at
1,500,000 bytes, and candidate text at 750,000 bytes. Compressed, malformed,
duplicate-key, incomplete or non-text replies are rejected. One absolute deadline
bounds both requests and parsing; cancellation is checked again before publication.

## Results, failures and accounting

Candidates remain proposals. Existing deterministic validation constructs and
checks exact quotes, participant/slot bindings, provenance, relations and artifact
identities before publication. Invalid or unsupported candidates are not repaired
by another model call. Transient HTTP errors, ambiguous network failures, budget
failures, timeout and invalid output are terminal for this paid invocation; raw
provider errors and source bodies are not public diagnostics.

`modelCalls=1` counts the single generation, not the token-count request. Usage
comes only from the generation response. Output includes thought tokens when the
provider supplies them or a consistent total permits exact subtraction. Missing
counts remain `null`; the token preflight is never substituted as billed input.
Known usage exceeding a limit prevents publication. A configured model name is
not an exact served model version; missing or ambiguous versions remain `null`.
Dollar cost remains unknown. These limits and receipts do not guarantee exactly-once
provider billing, lifetime spend limits, or a refund after failed generation.

Analysis and Simulation propagate the same optional model/provider receipt fields.
Model-free corpus admission is unchanged. The new adapters' terminal failures are
preserved across the Simulation service rather than converted into a retryable
legacy injected-generator failure.

## Verification and remaining activation gates

`test_capability_providers.py` uses the actual pinned SDK with in-memory
`httpx.MockTransport` responses and a process-level socket/DNS block. It covers
pre-construction consent/ownership/authority failures, exact disclosed payloads,
selected-only grounding, polluted environment/headers, strict request shapes,
reply bounds, deadline/cancellation, no retries, partial usage, deterministic
candidate validation, receipt propagation, and the unchanged first-claim gate.
No real source, provider request, credential, database or cloud deployment is used.

Before activation, independently review the opt-in executor wiring and the
authenticated owner-confirmation flow, including the token-preflight disclosure;
complete the separately approved database enforcement/release gates; and authorize
a named live acceptance test and deployment. Offline tests do not prove live model
availability, provider quality, release database readiness, or production behavior.

API behavior was checked against the installed SDK and Google's official
[Python SDK documentation](https://googleapis.github.io/python-genai/),
[token-counting documentation](https://ai.google.dev/gemini-api/docs/tokens), and
[thinking/output-limit documentation](https://ai.google.dev/gemini-api/docs/thinking).
