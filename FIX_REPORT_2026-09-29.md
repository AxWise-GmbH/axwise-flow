# Fix report — 2026-09-29

The verified corrective changes are implemented in both local repositories. Validation used isolated copies of Axwise `21009d825aa64bf99eab42c7ee465f0597c7e214` and Goose `76ba53c1d23a342d0f3f7a8b1f3b57044977fbbb`, then the matching patches were applied to the original working copies. The implementation validation below used no live-model requests. No commit, push, deployment, or production data migration was performed.

The subsequently requested live before/after and feature-flag tests are documented separately in [PERFORMANCE_REPORT_2026-09-29.md](/Users/admin/axwise-opensource/axwise-flow-oss/PERFORMANCE_REPORT_2026-09-29.md). They support improved reliability on the tested public-runtime contracts, but do not establish an overall speed improvement.

## Changes and current code

| Backlog | Result | Implementation |
| --- | --- | --- |
| AX-01/02 | Explicit config wins over discovery; each public wrapper uses stable profile/workspace/session scope. Latest and ID lookups cannot cross scope. | [configuration.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/configuration.py:123), [FastMCP dispatch](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/fastmcp_server.py:45), [scoped storage](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:316) |
| AX-03/04/05/21 | Deep reviews bind to actual artifacts and block failed publication. One bounded repair uses the correct contract. Cohorts aggregate and validate planned identities. All provider attempts and available token reports are counted; missing usage stays unknown. | [engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:97), [regression tests](/Users/admin/axwise-opensource/axwise-flow-oss/backend/tests/local_axwise/test_engine_regressions.py) |
| AX-06/07 | References hash exact immutable file bytes. Explicit mismatches, tampering, ambiguity, and legacy self-hashes fail. Failed safety checks block publication; early stages store only fingerprints. Remote checks require explicit opt-in and never turn unavailability into success. | [storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:203), [storage tests](/Users/admin/axwise-opensource/axwise-flow-oss/backend/tests/local_axwise/test_storage_integrity_scope_safety.py) |
| AX-08 | Prompts and settings name the registered OMP tools. Existing capability preferences remain effective; a registry assertion checks advertised names. | [prompt](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/replyQuestionPrompt.ts), [settings](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/components/settings/chat/EngineeringCapabilitiesSection.tsx) |
| AX-09/11/12 | Cloud controls report unavailable. Local ledger snapshots propagate errors, use fsynced atomic replacement, preserve dirty events for retry, and reject invalid parent graphs and cycles. | [sync manager](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/sync/syncManager.ts:35), [merge](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/sync/eventLedger.ts:135), [settings](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/components/settings/auth/AuthSettingsSection.tsx) |
| AX-13 | Currency, code spans/fences, and real math remain intact. TSV and narrowly recognized prose conversions still work. | [Markdown normalization](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/utils/markdownNormalize.ts:261), [renderer tests](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/components/MarkdownContent.test.tsx) |
| AX-14/15/16 | Lane requests allow 2500 ms around the 2000 ms service budget; follow-up disposition keeps 1200 ms. The server validates model, choices, probabilities, and confidence; the desktop ignores uncertain/unavailable or wrongly scoped advice. Advice grants no tool authority and does not change thinking effort. | [decision service](/Users/admin/axwise-opensource/axwise-flow-oss/apps/orqaly/server/workflow-v2/desktop-decision-service.js:60), [desktop contract](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/decisionTypes.ts:22), [prompt consumption](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/acp/prompt.ts:140) |
| AX-17 | Connector helper deadlines include body reads, even with ignored abort signals. Response bytes, enums, probabilities, safety scores and readiness are checked. Missing or partial evaluation cannot pass. | [connector helper](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/src/jev-loop-router.mjs:152), [tests](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/test/jev-loop-router.test.mjs) |
| AX-18 | Experimental helpers default off. Heuristic search APIs are named accurately, edits require valid anchors and a fresh source check, failed tests conditionally restore unchanged candidates, and dry runs/no-test edits are never verified. Production integration remains deferred. | [experimental helpers](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/src/native-engineering-gems.mjs), [tests](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/test/native-engineering-gems.test.mjs) |
| AX-19 | Export includes Jev dependencies and current tests/docs. A built wheel is extracted outside the checkout and exercised through real stdio FastMCP with a fake provider and network disabled. | [distribution tests](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-distribution/test_distribution.py:128), [public README](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-distribution/PUBLIC_README.md) |
| AX-20 | Offline fixtures use the actual wrapper/engine/storage path and saved lineage. Live-provider scripts are labeled experiments, retain prior output, reject unusable/error responses, record actual model identity, and make no invented review or baseline claims. | [benchmark scope](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/BENCHMARKS.md), [offline pipeline](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/benchmark-axwise-e2e.py), [failure tests](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/benchmark-regressions.test.mjs) |

## Verification

**640 passing tests**, without live inference:

| Suite | Passed |
| --- | ---: |
| Complete Python local-runtime suite | 277 |
| Distribution build/export/installed-runtime suite | 10 |
| Python benchmark lineage/failure suite | 2 |
| JavaScript benchmark failure/reporting suite | 8 |
| Connector router and experimental edit helpers | 29 |
| Server desktop decision service | 15 |
| Desktop routing, capabilities, sync, Markdown, workspace and follow-up suites | 299 |

Desktop TypeScript compilation, focused ESLint, English-message extraction, locale catalog validation/compilation, and both repositories' `git diff --check` pass. Generated ACP client was built locally for type checking. Missing locale messages now have explicit English fallback entries; this is catalog repair, not a claim of completed translations.

Saved test output and the changed-file manifest are in [verification evidence](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/fixes). The earlier review probe JSON files remain historical pre-fix observations.

## Remaining work and limits

- **AX-10:** authenticated cloud upload/download, acknowledgements, offline queues, live chat capture/replay and account/mobile integration remain a separate feature. The current UI cannot claim a cloud backup.
- **AX-15:** automatic model-effort changes are not implemented; the verified correction is honest advisory routing with the user's chosen effort preserved.
- **AX-18:** a real AST/LSP implementation, packaged native tool registration, permissions and agent integration remain separate work. Cross-process file concurrency in the experimental helper is optimistic, not a filesystem transaction.
- Existing public-runtime artifacts with inconsistent/self-embedded saved-file hashes require recreation or a deliberate migration. Existing default-scope records are not reassigned to a project; historical raw stage rows are left untouched. The managed desktop's separate Node artifact format is not migrated by these changes.
- Local secret scanning recognizes only known patterns. Remote artifact inspection requires `AXWISE_REMOTE_ARTIFACT_SAFETY=true` and `TYPESAFE_API_KEY`; absence/failure/oversize is reported as unevaluated. Deep review remains an automated quality check, not independent proof.
- The 640-test implementation verification above does not establish live-model quality/latency, a signed desktop build, or Windows/Linux release readiness. The separate performance report records the subsequent live measurements and their narrower scope.
