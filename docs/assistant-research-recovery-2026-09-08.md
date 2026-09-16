# Assistant research recovery — 8 September 2026

## Incident and verified cause

Orqaly conversation `4b9e4fc4-1ce6-40f5-8e6a-1c515206e24f` asked for birch-chair competitors, prices and offerings across the Baltics, with a manufacturing-business context in Latvia.

- Original research operation: `0db2154c-93c3-54df-88ea-a774cc5bb3f5`.
- Subsequent research operation: `c6d30821-aa7c-58f5-8081-4610daa89bd9`.
- Both stored `AXWISE_ASSISTANT_EMPTY_RESPONSE`, not an authentication or database failure.
- The original primary search returned HTTP 504 twice, followed by HTTP 400. Its configured attempt deadline was 20 seconds, with 45 seconds for the complete primary operation. The final 400's detailed provider cause was not retained and must not be inferred from the status alone.
- The first fallback had a 10-second discovery deadline. Cloud Run recorded its SearXNG request completing successfully with HTTP 200 in 10.533592385 seconds, after the caller had already cancelled.
- The primary failure opened the existing 450-second circuit cooldown. The second research attempt skipped the primary, discovered results successfully, and failed with `direct_fetch_incomplete`. Historical sanitized diagnostics do not distinguish rejected fetched documents from incomplete retrieval plus no relevant extracted passage.
- A user-authorized replay of the original input and conversation through the same Gemini model, using a 60-second attempt budget, succeeded on its first call in 32.794 seconds and returned 10 source records. This proves the original 20-second attempt deadline was too short for this request; it does not guarantee every future provider call succeeds.

## Recovery scope

Give one-shot Assistant research a larger, still bounded primary-search budget and enough time for fallback discovery. Preserve the durable Goal research budget, evidence validation, tenant isolation, capped retries, cancellation and existing provider/model policy. Never replace failed research with an ungrounded answer labelled as researched.

The source base is `2e4df7f90657c3a2686016eb8b6ce0744794cb83`: deployed runtime `3629a2a8dcf42dece76ca8632565d8f354809c65` plus the source-upload allowlist only. The unrelated, undeployed owned-error-workflow change is deliberately excluded.

## Acceptance

Required before calling recovery complete:

1. Regression tests cover retry budgets, cancellation, content-free diagnostics, Assistant-only configuration and unchanged durable Goal bounds.
2. Roll out only the reviewed AxWise image to the existing preview API/worker; preserve configuration, IAM, secrets and unrelated services. Fence and drain the old polling worker before starting its replacement.
3. Use the existing Retry action on the original failed turn, retaining immutable failure history and retry lineage.
4. Confirm the new attempt completes in the same Orqaly conversation with a useful research answer and visible source links. Health checks or local provider success alone do not satisfy this requirement.

## Completed rollout and live acceptance

- Runtime fix commit: `65f6a5741b9e520f2b2941982347d165b26102ea`, on `codex/research-recovery-sep8`.
- Application regression coverage: 798 non-overlapping tests passed. The incident-local release operator additionally passed 132 tests.
- Cloud Build: `fe71c69b-ea8b-44dd-9531-4d70d966eb61`, successful, built from the exact committed allowlisted source export.
- Deployed image digest: `sha256:15b4740b4048a52054f610f04f5934b547caaeceb7729bb008dedac28392a730`.
- Existing API and worker now use revisions `axwise-v2-preview-research-65f6a574` and `axwise-v2-worker-preview-research-65f6a574`. Both are ready and receive 100% of their respective traffic. The worker is back on automatic scaling with its original service minimum and maximum of one instance.
- The old polling worker was fenced at manual zero and explicitly observed at zero active and idle instances before its replacement was started. All old worker revisions are retired; none were deleted. The staged no-traffic revision and manual-zero cap representation required corrections to the incident-local deployment verifier, delaying the rollout. No application security checks were relaxed.
- The final read-only audit preserved runtime configuration, IAM, secrets references and all eleven other Orqaly, n8n, search, agentic and sandbox services. Receipt: `/private/tmp/axwise-research-65f6a574.1IfBXr/final-audit.json`, SHA-256 `6a0ca91613efa28624a920c2755ab1aef174fd4b24515f7d3c9ddab603eb403a`.
- Used the original failed turn's actual Retry button once, with the user's explicit permission to replay the original conversation context.
- Retry operation `10a2231b-ce91-517f-8879-101bd4e53d57`, attempt `ca1b492a-eb03-50aa-a610-83d3b890b1d1`, completed successfully. Execution ran from `2026-09-08T13:06:50.574460Z` to `2026-09-08T13:08:21.915330Z` (about 91 seconds), with one worker execution.
- Tenant-scoped, read-only database verification confirmed identical canonical input hash and exact input, owner and original workflow scope; both historical failures remain unchanged. The saved typed result contains 7,483 Markdown characters, 10 source records and 10 source-linked facts, from `gemini-3.8-flash`.
- Browser verification confirmed “Research · Attempt 2”, “Research completed”, the full report, expandable source links, and persistence after reloading the original conversation. The report covers Baltic competitors, indicative pricing segments, manufacturing capabilities and positioning. This is a research artifact, not an n8n workflow.
- Evidence-quality limitation: the displayed ten supported claims do not individually substantiate the pricing table or every narrative statement. Price ranges still need direct product-level verification; successful execution is not a claim that every report statement is independently fact-checked.
- The temporary localhost-only database proxy used for diagnosis was stopped. The user's existing n8n editor tab was left untouched. No new infrastructure, Supabase access, GitHub push or real provider integration was involved.

## Known separate issue

Typing the word `retry` currently routes as an ordinary Assistant message. This recovery uses the actual Retry control. Contextual natural-language retry routing is a separate Orqaly change and is not included in this AxWise-only fix.
