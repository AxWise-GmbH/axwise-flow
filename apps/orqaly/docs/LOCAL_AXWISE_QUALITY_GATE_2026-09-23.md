# Local Axwise quality iteration — release gate

This gate is declared before the new live comparison. User authorization is to
improve the interview → evidence → PRD path, compare it, and publish only if good.
Publication remains conditional. Existing default-off behavior and normal Goose
tool selection must remain unchanged. No IAM, billing, RBAC or service retirement
is in scope.

## Intended improvement

- Preserve the existing exact-quote, identity and synthetic-lineage checks.
- Synthesize findings across selected interviews, distinguish genuine tensions
  from compatible preferences, and address unanswered research questions.
- Review the generated analysis/PRD; permit at most one bounded repair and judge
  the actual final artifact, not a promise that a repair was made.
- Accept a saved analysis by immutable, account/conversation-scoped identifier
  and hash when generating a PRD. Do not ask Goose to retype the evidence.
- Save private intermediate state and report model calls, stage time and usage.
  Do not add an unbounded agent, invisible fallback, or general message router.

## Acceptance

1. Relevant deterministic tests pass, including malformed/cross-scope artifact
   references, cancellation, repair limits, final-review failure and privacy-safe
   errors. Record any skipped external integrations explicitly.
2. Repeated live analysis → PRD chains on the predeclared synthetic fixtures
   produce valid linked artifacts. Retain failed runs; do not use successful-only
   latency or silently regenerate until a desired sample appears.
3. Review outputs against the predeclared rubric, blind to the arm where
   practical: key needs covered; genuine tensions distinguished from invented
   contradictions; missing evidence explicit; proposed requirements testable;
   synthetic evidence never upgraded into human testimony or proven demand.
4. Demonstrate a concrete specialist benefit: stronger evidence accounting and
   reusable requirement-to-finding links, without materially worse substantive
   answers. Merely more headings or longer text does not qualify. Report semantic
   ties and losses honestly; model-generated review is not independent proof.
5. Actual Goose on/off trials cover ordinary chat, arithmetic, weather, news and
   repository reading. No ordinary task should propose or invoke Axwise. Keep
   benchmark permission denials separate from product failures and do not claim
   statistical latency equivalence from a small sample.
6. Report extension inference separately from whole Goose turnaround and compare
   equivalent requested deliverables where possible. No universal speed claim.
7. A published candidate must be built from recorded committed source, have
   correct incremented product/build versions, verified nested signatures and
   archive checksum, and matching website metadata. The current Apple Silicon
   preview signing policy is ad-hoc, not Apple notarization.

If the quality or reliability gates fail, retain the candidate locally and leave
the website download unchanged. Diagnose the specific failure before deciding on
another iteration; do not weaken evidence validators to obtain a pass.
