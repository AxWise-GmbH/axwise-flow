# Verified repair backlog: AxWise and Orqanix

Created and updated: 2026-09-29. Verified corrective changes are implemented locally and tested; they are not deployed. AX-10 remains a separate feature. AX-18 now has a native Goose implementation under the desktop feature flag; see [native integration and benchmark report](/Users/admin/axwise-opensource/axwise-flow-oss/NATIVE_ENGINEERING_REPORT_2026-09-29.md). See [implementation and verification report](/Users/admin/axwise-opensource/axwise-flow-oss/FIX_REPORT_2026-09-29.md).

Source snapshots:

- axwise-flow-oss: `21009d825aa64bf99eab42c7ee465f0597c7e214`
- orqaly-goose: `76ba53c1d23a342d0f3f7a8b1f3b57044977fbbb`

The first review compared these commits with GitHub main. The follow-up rechecked unchanged local HEADs, traced callers, and used offline reproductions. The original observations and code line references below describe those pre-fix snapshots. Current implementation links and verification results are in the fix report.

## Confidence and corrections

**Confirmed** means demonstrated by executing the checked-in source with fake external services, or directly established by the cited source contract. It does not imply a production incident was observed. **Feature gap** means a capability is absent from the traced path; implementing it is a product decision, while inaccurate user-facing claims should be corrected now.

Corrections to the initial review:

1. The deep-review defect is in the Python engine's **LLM review fallback when Jev has not returned passed**. It does not prove that every Jev review fails. Standard mode skips substantive review in this engine.
2. The cohort failure is **deep simulation with more than one planned participant**. It does not establish that standard simulation or deep single-participant simulation fails.
3. Environment-based provider configuration and the explicit `--state-dir` flag work. The ignored configuration and shared default scope concern the **new public FastMCP wheel/npm launcher**. The managed desktop still uses its Node adapter plus Python kernel, with explicit account/conversation arguments.
4. “Native tools” and cloud-sync findings describe the checked-in desktop path. The shipped DMG and deployed services were not inspected.
5. File hashes need not universally equal content hashes. Here, the existing reference schema specifically calls for a saved-file SHA-256, and the previous Node state reader verifies file bytes. The new storage has incompatible returned, embedded, and file hashes and overwrites supplied mismatches.
6. Native-gem helpers are not integrated into production in the searched sources. Their defects are **pre-integration work**, not demonstrated production vulnerabilities.
7. Review/safety service failure does not necessarily need to block ordinary work. It must never be represented as a successful evaluation. An explicit failed safety verdict and an unavailable service are distinct states.
8. The cloud-success toast predates September 27. The latest sync commit wires it to the new local-only manager; this is an exposed unfinished capability, not evidence of a regression from previously working cloud sync.
9. Benchmarks use real HTTP generation calls when run normally, but that alone does not make them product E2E tests. Offline failure injection establishes false success reporting; it does not measure live model performance.

## Runtime boundaries

| Runtime | Current execution path | Relevant backlog |
| --- | --- | --- |
| Public FastMCP | Python launcher → FastMCP wrappers → new Python engine/provider/storage | AX-01–AX-07, AX-19, AX-21 |
| Managed desktop AxWise | Electron → Node MCP adapter → Python deterministic kernel | Preserve existing contracts while fixing the public runtime |
| Desktop engineering | Electron feature flag → Goose native_engineering platform extension → same primary coding loop | AX-08; native replacement AX-18 |
| Desktop lane triage | ACP prompt → Electron decision client → server decision service | AX-14–AX-16 |
| Connector routing/gems | Separate helpers imported by benchmarks/tests | AX-17–AX-18 |
| Desktop sync | Settings → IPC → local SyncManager/EventLedger | AX-09–AX-12 |

Desktop path: [ui/desktop/src/orqaly/workspace.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/workspace.ts:263).

## Priority and implementation order

P1: correct exposed behavior or important functional failures first. P2: fix integrity, reliability, validation, and measurement before relying on the affected capability. P3: reporting improvement. These are review priorities, not claims of an active security incident.

| ID | Priority | Item | Evidence / scope |
| --- | --- | --- | --- |
| AX-01 | P1 | Honor explicit public runtime configuration | Confirmed; public launcher |
| AX-02 | P1 | Isolate artifact resolution by workspace/session | Confirmed; Python storage/wrappers |
| AX-03 | P1 | Bind deep fallback reviews to actual artifacts | Reproduced; conditional LLM fallback |
| AX-04 | P2 | Repair invalid candidates using the correct API | Reproduced; non-simulation tools |
| AX-05 | P1 | Aggregate deep simulation cohorts correctly | Reproduced; >1 planned participant |
| AX-06 | P2 | Restore the saved-file reference contract | Reproduced; storage and resolver |
| AX-07 | P2 | Make artifact safety outcomes enforceable and honest | Reproduced; policy must be explicit |
| AX-08 | P1 | Align engineering prompts/UI with registered tools | Confirmed; desktop source |
| AX-09 | P1 | Remove false cloud-sync success | Reproduced; actual settings action |
| AX-10 | P2 | Complete cloud-sync transport and chat integration | Feature gap; separate delivery project |
| AX-11 | P2 | Propagate ledger persistence failures | Reproduced; local ledger |
| AX-12 | P2 | Reject invalid causal graphs during merge | Reproduced; local ledger |
| AX-13 | P2 | Preserve currency, code, and math in Markdown | Reproduced; renderer |
| AX-14 | P2 | Align desktop/server triage deadlines | Confirmed; cross-repo boundary |
| AX-15 | P2 | Implement adaptive effort or narrow the claim | Feature gap; desktop route |
| AX-16 | P2 | Preserve uncertainty in desktop lane responses | Confirmed; server and renderer |
| AX-17 | P2 | Bound and validate connector router responses | Reproduced; helper, not desktop router |
| AX-18 | P2 | Integrate native AST/LSP and guarded edits into Goose | Implemented and locally verified; release pending |
| AX-19 | P2 | Repair packaging exports and distribution tests | Confirmed; source package contract |
| AX-20 | P2 | Replace misleading benchmarks with product-path evidence | Reproduced + source inspection |
| AX-21 | P3 | Account for every model call and token report | Confirmed; Python engine |

Recommended sequence: AX-01/02/03/05 and the small corrective AX-08/09 changes first; then AX-04/06/07/13/14/16/19; then AX-20 with those corrected runtimes. AX-10/15/18 are explicit feature projects, not prerequisites to correcting misleading claims. AX-11/12 precede enabling AX-10. AX-21 should land before publishing cost comparisons.

## AX-01 — Honor explicit public runtime configuration

**Status:** fixed locally; offline regression tests passed. **Priority:** P1. **Evidence:** confirmed source contract and offline provider probe.

**Code:** [packages/axwise-distribution/launcher.py](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-distribution/launcher.py:25) (`main`); [backend/services/local_axwise/provider.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/provider.py:144) (`ModelProvider.__init__`); [packages/axwise-distribution/example.config.json](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-distribution/example.config.json:1). Port the existing validated configuration semantics from [packages/axwise-local/src/standalone-config.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-local/src/standalone-config.mjs:1).

**Observed:** `--config` only sets `AXWISE_CONFIG`; provider and storage do not read it. A custom OpenAI-compatible configuration was ignored and Gemini defaults were selected in the offline probe. No claim is made that a real request was sent to the wrong provider.

**Change:** load and validate the file once; pass explicit provider/base URL/model/key-environment/state/scope settings to runtime construction. Define precedence: explicit launch/config values before environment defaults before discovery. Do not let credential auto-discovery override an explicit provider. Invalid explicit configuration must produce an actionable error rather than silently switching providers.

**Acceptance:** initialize from the documented JSON using dummy credentials and mocked HTTP; assert provider, URL, model, state root and scope. Cover missing file, malformed JSON, missing named credential, zero-config startup, and legacy config compatibility. Proposed tests: `backend/tests/local_axwise/test_public_config.py` and distribution launcher tests. No live model required.

## AX-02 — Isolate references by workspace and session

**Status:** fixed locally; offline regression tests passed. **Priority:** P1. **Depends on:** AX-01 configuration identity.

**Code:** [backend/services/local_axwise/fastmcp_server.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/fastmcp_server.py:58) (all tool wrappers); [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:30) (`execute_tool(session_id="default")`); [backend/services/local_axwise/storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:267) (`find_latest_artifact`), [backend/services/local_axwise/storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:295) (`find_artifact_by_id`).

**Observed:** all wrappers omit session identity; `find_latest_artifact` explicitly searches any session when the requested one has no match. An empty unrelated session retrieved an existing artifact.

**Change:** pass trusted host/config scope into every operation; scope both implicit latest lookup and explicit ID lookup. Remove automatic cross-session fallback. Distinguish workspace identity from MCP connection identity so a reconnect retains the intended workspace without merging unrelated projects. Explicit sharing, if desired, must be a separate supported operation.

**Acceptance:** two workspaces/sessions in the same database never resolve each other's evidence, including by ID/prefix. Reconnect retains the correct configured scope. Missing or ambiguous references return structured errors. Existing data migration must not silently reassign default-session artifacts to a new customer project. Proposed tests: `backend/tests/local_axwise/test_storage_scope.py`.

## AX-03 — Bind fallback quality review to the actual artifact

**Status:** fixed locally; offline regression tests passed. **Priority:** P1. **Scope:** deep non-simulation calls whose Jev review did not pass.

**Code:** [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:224); [backend/services/local_axwise/quality.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/quality.py:147) (`prepare_review`), [backend/services/local_axwise/quality.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/quality.py:192) (`validate_review`). Correct existing host pattern: [packages/axwise-local/src/runtime.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-local/src/runtime.mjs:378).

**Observed:** `finalized.get("candidate", {})` supplies an empty object; the kernel returns `artifact`. Validator arguments are also wrong, and the exception handler at engine line 283 stamps `passed: True`. A deliberately failed model review was saved as passed.

**Change sketch** (adapt inside the bounded review/repair flow, not a complete patch):

```python
artifact = finalized["artifact"]
review_prep = quality.prepare_review(
    tool_name, resolved_input, artifact, host_evidence
)
review_content, usage = await llm.complete(
    review_prep["systemPrompt"], review_prep["userPrompt"],
    review_prep.get("responseSchema"),
    review_prep.get("maxOutputTokens", 4096),
)
quality_review = quality.validate_review(
    tool_name, artifact, review_content, review_prep["context"]
)
```

Rebuild the review prompt/context after repair; update the persisted candidate to the repaired candidate. Never translate an exception into a passed review. Keep a failed/unavailable review distinct from a completed artifact; apply the chosen deep-mode publication policy consistently.

**Acceptance:** failing review criteria stay failed; malformed review cannot approve; review receives the nonempty finalized artifact; repaired artifacts get a newly bound review; persisted candidate/artifact/Markdown agree. Test Jev-passed, Jev-unavailable, standard, and deep paths separately with fake providers. Proposed tests: `backend/tests/local_axwise/test_engine_review.py`.

## AX-04 — Use the repair API correctly

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Depends on:** AX-03 for substantive-review repair.

**Code:** [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:157) and [backend/services/local_axwise/quality.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/quality.py:221) (`prepare_repair`).

**Observed:** the engine passes a fabricated failed review together with a validation diagnostic. `INVALID_CANDIDATE_SCHEMA` is a recognized diagnostic; the defect is combining it with a non-null invalid review. The repair API expects either a valid failed review bound to the candidate, or validation diagnostics without a review. An invalid discovery candidate failed after the first provider call, without a repair call.

**Change:** preserve the distinction between schema repair and substantive-review repair. For a recognized schema diagnostic, pass `review=None` and a bounded diagnostic from `kernel.VALIDATION_DIAGNOSTICS`. For review repair, pass the exact validated failed review and `diagnostics=[]`. Use the candidate response, not the missing `finalized["candidate"]` field. Preserve the one-repair limit; do not weaken validators or invent a diagnostic for unsupported errors.

**Acceptance:** a repairable validation error causes exactly one repair call; unrepairable errors fail clearly; second failure stops; deep review repair uses the bound review. Simulation must not be routed into the synthesis repair API. Proposed tests: `backend/tests/local_axwise/test_engine_repair.py`.

## AX-05 — Aggregate deep simulation responses into a cohort object

**Status:** fixed locally; offline regression tests passed. **Priority:** P1. **Scope:** deep simulation with >1 planned participant.

**Code:** [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:90); [backend/services/local_axwise/kernel.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/kernel.py:802) (`prepare`), [backend/services/local_axwise/kernel.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/kernel.py:1219) (`finalize`). Working aggregation contract: [packages/axwise-local/src/runtime.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-local/src/runtime.mjs:342).

**Observed:** the engine serializes a list of per-participant responses. The kernel expects one object containing interviews and, where appropriate, participants. Two valid responses reproduce a finalization failure.

**Change sketch:**

```python
candidate = {
    "interviews": [
        interview
        for part in task_candidates
        for interview in part["interviews"]
    ]
}
if prepared.get("fixedParticipants") is None:
    candidate["participants"] = [
        participant
        for part in task_candidates
        for participant in part["participants"]
    ]
candidate_response = json.dumps(candidate)
```

Before aggregation validate every task's bounded response and planned identity; preserve the kernel's fixed saved personas. Apply the declared concurrency bound and cancellation semantics if implementing parallel generation.

**Acceptance:** standard two-person, deep one-person, deep two-person, and saved-persona deep cohorts all succeed with valid fake outputs; missing/duplicate/mismatched participant responses fail without publishing a partial artifact. Proposed tests: `backend/tests/local_axwise/test_engine_simulation.py`.

## AX-06 — Restore immutable saved-file references

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Depends on:** AX-02 for scoped reads.

**Code:** [backend/services/local_axwise/storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:152) (`save_operation`), [backend/services/local_axwise/storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:319) (`_row_to_artifact`), [backend/services/local_axwise/storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:369) (`resolve_references_with_fallback`). Existing file-hash contract: [backend/services/local_axwise/kernel.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/kernel.py:152) and [packages/axwise-local/src/state.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-local/src/state.mjs:117).

**Observed:** returned/database, embedded, and actual file hashes differ. A caller's explicitly wrong hash is replaced rather than rejected.

**Change:** serialize an immutable payload once, write those exact bytes atomically, hash those bytes, and keep the file reference outside the self-hashed payload (for example, in SQLite and returned metadata). If an embedded canonical-content digest is needed, give it a separate clearly defined field/version. Verify file bytes when resolving. Fill an omitted hash only where allowed; reject a supplied mismatch. Do not silently bless existing inconsistent records; define migration/reindex behavior.

**Acceptance:** save → read → reference produces one verified file digest; tampering, wrong explicit digest, stale reference, and missing file are rejected. Database/file write failure does not return completed metadata. Proposed tests: `backend/tests/local_axwise/test_storage_integrity.py`.

## AX-07 — Make safety outcomes explicit and enforce the selected policy

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Evidence:** explicit failed verdict still persisted in an offline probe.

**Code:** [backend/services/local_axwise/storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:74) (`check_artifact_safety_with_jev`), [backend/services/local_axwise/storage.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/storage.py:144) (`save_operation`), [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:84) and [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:137) (earlier stage persistence).

**Change:** define separate `passed`, `failed`, and `not_evaluated` results. An unavailable optional service must not be labeled passed. If advertised as a blocking secret gate, refuse/quarantine an explicit failed artifact before writing the affected bytes; include candidate/input/stage records in the persistence policy. If intended to remain advisory, rename it and surface that limitation instead of claiming it prevents persistence. Keep ordinary local work possible under the documented unconfigured policy.

**Acceptance:** explicit failed verdict cannot produce a clean/completed gated publication; malformed/timeout results remain unevaluated; content beyond the current snippet limit is either covered or explicitly marked unchecked. Tests use dummy strings and mocked responses, never real credentials. Proposed tests: `backend/tests/local_axwise/test_storage_safety.py`.

## AX-08 — Align desktop engineering claims with real tool registration

**Status:** fixed locally; offline regression tests passed. **Priority:** P1. **Evidence:** actual source registry import and extension construction.

**Code:** [ui/desktop/src/orqaly/replyQuestionPrompt.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/replyQuestionPrompt.ts:41) (`engineeringInstruction`); [ui/desktop/src/components/settings/chat/EngineeringCapabilitiesSection.tsx](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/components/settings/chat/EngineeringCapabilitiesSection.tsx:112); [ui/desktop/src/orqaly/workspace.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/workspace.ts:296); [vendor/orqanix-omp-mcp-server/src/mcp.mjs](/Users/admin/axwise-opensource/orqaly-goose/vendor/orqanix-omp-mcp-server/src/mcp.mjs:36); [ui/desktop/scripts/prepare-orqaly-runtime.mjs](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/scripts/prepare-orqaly-runtime.mjs:463).

**Observed:** prompts advertise `ast_search/hashline_edit/lsp_query/safe_edit_and_test`; the bundled extension registers `orqanix_engineering_status/inspect/edit/exec` and still launches OMP.

**Superseded by the native implementation:** the initial corrective description below was accurate for the old runtime; AX-18 now registers the four native tools and removes OMP.

**Initial small correction:** describe the available OMP-backed engineering tools accurately and remove unregistered tool names from instructions. Generate or validate capability descriptions against the real registry. Preserve users' existing `ompEnabled` preference until a deliberate migration exists.

**Feature option later:** replace the extension only after AX-18, wiring actual names, packaging, permissions, toggles and both applicable agent-loop paths.

**Acceptance:** with each toggle state, advertised tools equal callable registered tools; turning engineering off removes the extension and instructions; prompt tests no longer assert stale names. No native-replacement claim until packaging and execution prove it. A third-party user extension could independently provide similarly named tools; these checks concern the managed registry. Update [ui/desktop/src/orqaly/replyQuestionPrompt.test.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/replyQuestionPrompt.test.ts:54) and the engineering settings tests.

## AX-09 — Stop reporting local snapshots as cloud sync

**Status:** fixed locally; offline regression tests passed. **Priority:** P1. **Evidence:** actual settings → preload → IPC → manager path.

**Code:** [ui/desktop/src/components/settings/auth/AuthSettingsSection.tsx](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/components/settings/auth/AuthSettingsSection.tsx:179) (`handleSyncNow`); [ui/desktop/src/main.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/main.ts:2343) (`sync:trigger`); [ui/desktop/src/orqaly/sync/syncManager.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/sync/syncManager.ts:116) (`syncAll`).

**Observed:** remote URL/token are unused. The method only persists loaded local ledgers and returns success; the settings action calls that method and displays cloud success. Invalid-token/unreachable-endpoint probes make zero network calls. The toast already existed before the latest sync commit; its previous implementation used a timer. This is a current misleading state, not proof that working cloud synchronization regressed.

**Small correction now:** return a discriminated unavailable/local-only outcome, remove the missing-bridge timer fallback and unverified backup copy, and disable the cloud action or label the actual local action. Update the last cloud-sync timestamp only following a confirmed remote acknowledgement. Do not use a boolean success for both local persistence and cloud replication.

**Acceptance:** a fresh install, offline state, invalid token, empty manager, or local-only snapshot never produces “synced with Orqanix Cloud.” A mocked confirmed transport acknowledgement is the only cloud-success path.

## AX-10 — Implement cloud sync as a separate feature

**Status:** deferred feature; cloud controls now report unavailable (AX-09). **Priority:** P2 if cloud sync remains in scope. **Depends on:** AX-09/11/12.

**Code:** [ui/desktop/src/orqaly/sync/syncManager.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/sync/syncManager.ts:76) (`appendEvent/mergeEvents/syncAll`); [docs/mobile-desktop-sync-protocol.md](/Users/admin/axwise-opensource/orqaly-goose/docs/mobile-desktop-sync-protocol.md:1); [docs/mobile-desktop-sync-protocol.md](/Users/admin/axwise-opensource/axwise-flow-oss/docs/mobile-desktop-sync-protocol.md:1).

**Missing from the traced path:** live chat event capture/replay, authenticated remote upload/download, acknowledgements/cursors, retry/offline behavior, startup discovery of saved ledgers, account boundaries, divergence presentation and mobile integration. Existing Nostr share/import and the cloud assistant-to-knowledge-base exporter are separate features, not implementations of this button.

**Change:** deliver a vertical slice: one authenticated account, two clients, captured chat event, durable upload acknowledgement, pull, deduplication and UI replay. Then add offline queues, restart/resume, logout/account switching and explicit branch handling. Preserve idempotency and existing tool-approval boundaries; syncing a tool request must not authorize it on another device.

**Acceptance:** two actual client processes exchange a session across restarts; duplicate/reordered requests converge; unauthorized accounts cannot read or mutate it; offline work survives; divergence does not silently discard either branch.

## AX-11 — Acknowledge ledger changes only after durable persistence

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Code:** [ui/desktop/src/orqaly/sync/syncManager.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/sync/syncManager.ts:148) (`persistLedger`).

**Observed:** deleting the temporary storage directory caused writes to fail, while append and sync still returned success.

**Change:** propagate a typed persistence error; write a temporary file and atomically replace the snapshot, with appropriate durability handling. Explicitly track unsaved/dirty in-memory state if append happens before persistence, so a retry cannot silently lose it. This is a ledger primitive failure; live chat capture is not wired, so loss of real user chat was not established. Do not advance acknowledged sync state on a failed local write.

**Acceptance:** unwritable directory, disk/write failure and interrupted replacement leave the previous valid snapshot intact and never acknowledge durable success; retry writes the pending event once. Extend [ui/desktop/src/orqaly/sync/__tests__/syncManager.test.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/sync/__tests__/syncManager.test.ts:1).

## AX-12 — Validate accepted parents and reject causal cycles

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Code:** [ui/desktop/src/orqaly/sync/eventLedger.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/sync/eventLedger.ts:166) (`merge`).

**Observed:** a child whose parent had an invalid hash was accepted because the parent ID appeared in the incoming batch. A correctly hashed self-parent event was stored but disappeared from linearization.

**Change:** validate and stage incoming events, establish an acyclic dependency order against existing plus accepted events, and reject/quarantine descendants of rejected or unavailable parents. Do not accept a parent merely because its ID appears in the raw input list. Treat hashes as integrity checks, not authentication.

**Acceptance:** reject self-cycle, multi-event cycle and rejected-parent child; accept a valid out-of-order batch; duplicates remain idempotent; convergence is independent of batch order. Extend [ui/desktop/src/orqaly/sync/__tests__/eventLedger.test.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/sync/__tests__/eventLedger.test.ts:1).

## AX-13 — Make Markdown normalization syntax-aware

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Code:** [ui/desktop/src/utils/markdownNormalize.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/utils/markdownNormalize.ts:84), [ui/desktop/src/utils/markdownNormalize.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/utils/markdownNormalize.ts:130), [ui/desktop/src/utils/markdownNormalize.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/utils/markdownNormalize.ts:262) (`normalizeMarkdownContent` and helpers); [ui/desktop/src/components/MarkdownContent.tsx](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/components/MarkdownContent.tsx:263).

**Reproductions:** `The price is $10 to $20 for entry.` loses the dollar signs and spacing; inline LaTeX code is rewritten; multiline display math and tilde-fenced code are modified.

**Change:** tokenize/protect Markdown code and math regions before textual cleanup, or perform transformations on eligible Markdown AST text nodes. Avoid assuming any paired dollar signs represent pseudo-math. Keep the supported TSV/flowchart improvements without altering literal source code or genuine equations.

**Acceptance:** preserve currency ranges, escaped dollars, inline code, variable-length backtick/tilde fences and multiline math byte-for-byte where appropriate. Existing flowchart/TSV examples still render correctly. Extend [ui/desktop/src/utils/markdownNormalize.test.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/utils/markdownNormalize.test.ts:1) and renderer tests.

## AX-14 — Align desktop and server decision deadlines

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Code:** [ui/desktop/src/orqaly/connection.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/orqaly/connection.ts:628) (`decision`); [ui/desktop/src/acp/prompt.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/acp/prompt.ts:205); [apps/orqaly/server/workflow-v2/desktop-decision-service.js](/Users/admin/axwise-opensource/axwise-flow-oss/apps/orqaly/server/workflow-v2/desktop-decision-service.js:60).

**Observed:** the desktop client aborts after 1,200ms; the backend decision service waits up to 2,000ms. The prompt awaits the client before generation. This only adds the wait when the enabled decision path is actually used.

**Change:** define a shared end-to-end budget including network overhead. Either lower the server deadline below the client budget or let the client await the documented server fallback. Preserve the separate message-disposition latency requirement instead of increasing every decision timeout. Preserve prompt cancellation and do not hold ordinary turns beyond the chosen budget. Treat timeout as advisory unavailability.

**Acceptance:** fake-time tests around both thresholds demonstrate successful slow classification, server timeout fallback, client cancellation and no unbounded wait. Greeting bypass remains a zero-triage-call path.

## AX-15 — Implement adaptive thinking effort, or narrow the release claim

**Status:** resolved by narrowing claims; desktop triage remains advisory and does not change model effort. **Priority:** P2. **Code:** [ui/desktop/src/acp/prompt.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/acp/prompt.ts:158); [ui/desktop/src/acp/providers.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/acp/providers.ts:424); [apps/orqaly/server/workflow-v2/desktop-decision-service.js](/Users/admin/axwise-opensource/axwise-flow-oss/apps/orqaly/server/workflow-v2/desktop-decision-service.js:93).

**Observed:** successful server lane decisions request only a route. The desktop resource includes lane/target/guidance, not an effort setting; no ACP effort setter is called here. The separate benchmark helper is not this path.

**Small correction now:** describe this as advisory lane triage. If adaptive effort is required, add a typed server response, provider-supported effort mapping, explicit user-setting precedence, cancellation behavior and per-turn application/restoration. Do not override a user's explicit effort setting silently.

**Acceptance:** instrument the actual ACP/model request and show the intended supported effort for each route and fallback; unsupported models retain valid settings; no effort leaks into a subsequent turn or other session. Benchmark the actual desktop path after integration.

## AX-16 — Preserve uncertainty and provenance in lane triage

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Code:** [apps/orqaly/server/workflow-v2/desktop-decision-service.js](/Users/admin/axwise-opensource/axwise-flow-oss/apps/orqaly/server/workflow-v2/desktop-decision-service.js:113); [ui/desktop/src/acp/prompt.ts](/Users/admin/axwise-opensource/orqaly-goose/ui/desktop/src/acp/prompt.ts:160).

**Observed:** missing confidence is replaced with 0.8; low confidence/probability disagreement is not rejected. The desktop describes a fallback research lane as classified because it ignores the reason.

**Change:** validate finite probability/confidence shape and route consistency using a documented policy; do not invent confidence. Return classified versus fallback/unevaluated explicitly, preserve that status in the resource, and avoid presenting fallback as model evidence. Reuse the stronger existing message-disposition parsing where appropriate.

**Acceptance:** missing/NaN/out-of-range confidence, contradictory probabilities, malformed routes, disabled provider and timeout cannot become confident classifications. Valid mixed guidance still preserves all requested actions. Extend decision-service and ACP prompt tests.

## AX-17 — Bound and validate connector router helper responses

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Scope:** benchmark/helper API, not the active desktop decision implementation.

**Code:** [packages/orqaly-goose-connector/src/jev-loop-router.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/src/jev-loop-router.mjs:101) (`triageTurnIntentWithJev`), [packages/orqaly-goose-connector/src/jev-loop-router.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/src/jev-loop-router.mjs:207) (`evaluateArtifactSafetyWithJev`).

**Observed:** abort timer is cleared before body download. An abort-aware real Response with a 100ms body completed despite a 20ms deadline. A malformed safety body returned `evaluated:true, passed:true`.

**Change:** keep the deadline active until bounded body parsing and validation complete; clear it in `finally`. Validate route/effort enums and complete safety answer schemas. Do not default missing safety answers to clean. If readiness is claimed as a criterion, enforce it; otherwise remove the claim. Preserve cancellation and distinguish unavailable from pass.

**Acceptance:** slow headers and slow bodies both respect the deadline; malformed responses stay unevaluated; unknown lanes/efforts are rejected; explicit failure is never marked pass. Extend existing router tests. Repeatable current-defect probe: [review-evidence/2026-09-29/benchmark-router-probe.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/benchmark-router-probe.mjs:1).

## AX-18 — Native engineering replacement for OMP

**Status:** implemented in Goose Rust, default-disabled under `nativeGemsEnabled`; legacy choices migrate and OMP is removed from active runtime/packaging. Both loops, approvals, real language servers and guarded edits are verified locally. [Current report](/Users/admin/axwise-opensource/axwise-flow-oss/NATIVE_ENGINEERING_REPORT_2026-09-29.md) includes the controlled benchmark and remaining limits. Not deployed. **Priority:** P2. **Depends on:** AX-17; deployment follows AX-08 registry tests.

**Code:** [packages/orqaly-goose-connector/src/native-engineering-gems.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/src/native-engineering-gems.mjs:33) (`astSearch`), [packages/orqaly-goose-connector/src/native-engineering-gems.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/src/native-engineering-gems.mjs:183) (`lspQuery`), [packages/orqaly-goose-connector/src/native-engineering-gems.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/packages/orqaly-goose-connector/src/native-engineering-gems.mjs:246) (`safeEditAndTest`).

**Observed:** search is substring-based; LSP behavior is regex-based; no production caller was found. Hash verification occurs before awaiting safety, so a concurrent edit during that wait can be overwritten. Dry runs can return `verified:true` without running tests.

**Change:** either label limited helpers accurately or integrate actual syntax/LSP services. Recheck a file's content/version immediately before a guarded write; ensure failed tests and dry runs report their true state. Define rollback/repair policy without overwriting another actor's changes. Wire the feature flag into the real registry if this becomes a feature.

**Acceptance:** strings/comments are not AST declarations; actual syntax diagnostics match the chosen engine; concurrent modification aborts without data loss; dry run never claims tests ran; failing tests never produce verified success. Add tests that actually call `safeEditAndTest`; the existing dry-run-named test only exercises `applyHashlineEdit`.

## AX-19 — Repair distribution exports and package-level checks

**Status:** fixed locally; offline regression tests passed. **Priority:** P2. **Depends on:** AX-01/03/04/05 contracts.

**Code:** [packages/axwise-distribution/manifest.py](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-distribution/manifest.py:25); [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:16); [packages/axwise-distribution/test_distribution.py](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-distribution/test_distribution.py:15); [packages/axwise-distribution/smoke.py](/Users/admin/axwise-opensource/axwise-flow-oss/packages/axwise-distribution/smoke.py:1).

**Observed:** source export omits `cognitive/typesafe_triage.py`; an isolated import of the exported engine confirmed that Jev deep-review acceleration is unavailable even with a dummy configured key. The independent storage safety checker is included. Distribution tests fail to import deleted `launcher.node_binary`; other checks retain old version/tool-count expectations. This establishes source-export behavior, not the contents of an inspected release wheel or a fresh installation.

**Change:** explicitly export the required dependency closure or remove unsupported acceleration claims. Add an isolated wheel test that cannot accidentally import the monorepo. Update launcher tests for Python startup, manifest/version checks and the actual tool registry; retain deterministic builds and the explicit export allowlist.

**Acceptance:** build and install a fresh wheel outside the checkout; initialize MCP and list tools; fake-provider tool call reaches the intended Python engine; configured Jev availability is tested from installed contents. npm bundles the same tested wheel. No paid inference required for these checks.

## AX-20 — Rebuild benchmark evidence around real product operations

**Status:** corrected reporting and offline product-path evidence, followed by live experiments documented in [the performance report](/Users/admin/axwise-opensource/axwise-flow-oss/PERFORMANCE_REPORT_2026-09-29.md) and [the native report](/Users/admin/axwise-opensource/axwise-flow-oss/NATIVE_ENGINEERING_REPORT_2026-09-29.md). Conclusions remain limited to the measured workloads. **Priority:** P2. **Depends on:** corrected runtime and packaging for valid positive measurements.

**Code:** [scripts/benchmark-real-creation-times.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/benchmark-real-creation-times.mjs:27) and line 95; [scripts/benchmark-axwise-e2e.py](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/benchmark-axwise-e2e.py:146) and line 203; [scripts/demo-full-discovery-tiers.py](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/demo-full-discovery-tiers.py:28); [scripts/e2e-matrix-benchmark.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/e2e-matrix-benchmark.mjs:99); [scripts/benchmark-gemini-jev-batches.mjs](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/benchmark-gemini-jev-batches.mjs:10).

**Observed:** all 15 mocked generation failures still yield three PASSED gates. Python baseline is a constant; a discovery result is saved as a PRD. The demo imports deterministic test fixtures. Live prompts do not carry previous stage artifacts into later stages. Matrix tool outputs are discarded before model calls, so the “gems” condition cannot measure the effect of giving the model those results. Displayed model name differs from the requested endpoint string.

**Immediate correction:** label fixture timings as kernel/fixture timings; remove unconditional PASSED, fake PRD substitution and unsupported speedup conclusions.

**Change:** drive the installed FastMCP tool boundary (and separately desktop if claimed), persist and consume actual prior artifact references, check HTTP/result/schema/finish status, and use the genuine review API. Record requested and returned model identity, exact prompts/configuration, operation IDs, tool outputs, sample counts, failures, token usage and wall time. Measure baselines in comparable runs. A full independent 2×2×2×3 design has 24 cells; either run it or clearly label the existing 12 correlated configurations. Treat keyword checks as keyword coverage, not quality validation.

**Acceptance:** all-error/empty/truncated runs fail and exit nonzero; an unavailable review cannot pass; a deterministic fake-provider full pipeline validates lineage without external calls; a live benchmark reports only observed measurements and identifies synthetic evidence. Current failure probe and results are saved under `review-evidence/2026-09-29/`.

## AX-21 — Count all provider calls and token usage

**Status:** fixed locally; offline regression tests passed. **Priority:** P3. **Code:** [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:88), [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:135), [backend/services/local_axwise/engine.py](/Users/admin/axwise-opensource/axwise-flow-oss/backend/services/local_axwise/engine.py:140).

**Observed:** `total_usage.update(usage)` is inside the create_prd-with-evidence branch; normal generations omit their usage, and cohort/review/repair calls are not summed. Candidate metadata hardcodes one model call.

**Change:** centralize provider invocation and record per-stage usage and aggregate calls. Preserve unknown usage as unknown, not zero; distinguish final candidate generation metadata from total operation cost.

**Acceptance:** fake provider with known counts yields exact generation/cohort/review/repair totals; failed calls are counted according to the documented metric; missing usage is not invented. Include aggregate metrics in benchmark records.

## Evidence and release boundary

- [Replay instructions and evidence map](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/README.md) link the four probes to the backlog. All four completed successfully against the snapshots above, reproducing their assertions about current behavior. Positive controls demonstrate working standard discovery, Jev-passed review, standard two-person simulation, deep one-person simulation, environment configuration, greeting bypass, and continued chat after advisory failure.
- Earlier focused JS suites: connector 11/11, decision service 6/6, provider HTTP 67/67 passed. Those suites did not cover the reproduced failures.
- No paid inference, live cloud sync, production deployment, full Rust build or shipped DMG inspection was performed.
- Offline probes replace external dependencies and use temporary state. They demonstrate current defects and include positive controls where possible; they are not permanent regression suites and may intentionally fail after a fix lands.
- Deliverables in this task are the backlog and offline evidence. Production fixes and optional feature projects remain open.
