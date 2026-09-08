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

## Known separate issue

Typing the word `retry` currently routes as an ordinary Assistant message. This recovery uses the actual Retry control. Contextual natural-language retry routing is a separate Orqaly change and is not included in this AxWise-only fix.
