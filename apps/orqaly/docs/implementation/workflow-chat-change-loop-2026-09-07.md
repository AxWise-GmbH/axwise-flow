# Workflow changes in the original chat

## User experience

The original conversation remains the only chat and composer. The n8n canvas opens beside it on desktop, or in a dismissible panel on a narrow screen. Hiding the canvas does not create a new conversation, discard unsent text, or release a pending edit/execution lock.

```text
Original chat
  ├─ Question → scoped answer and supporting evidence
  └─ Change → clarify if needed → exact draft → review → test candidate → activate
                                    │
                          same n8n side panel
```

Ordinary workflow messages use server-resolved intent. A request to change something no longer silently stays in an Ask mode. Suggested options have complete saved requests and immutable references; choosing an option does not depend on the model reconstructing “Option 2” from shortened prose.

If an editable draft already exists, one explicit confirmation resumes the saved change against its freshly verified version. A conflict preserves the request, permits refreshing and confirming that same draft again, and never switches to a different draft silently. Failed requests have linked retries; lost delivery reuses the original idempotency key.

The candidate has its own next step and recorded results. “Fix this version” copies the selected frozen candidate into an unapproved draft, without inheriting tests or approvals. Live-version results cannot stand in for candidate tests. Live testing is not presented as the primary action while a candidate is selected.

Build clarification and eligible repair controls use the original composer. They do not send answers through ordinary Assistant routing and do not introduce another embedded answer textarea. Initial Build routing remains explicit typed answer/repair handling, not a newly implemented general natural-language Build router.

## Privacy and authority

- Run input/output sharing remains explicit for each message. Sharing controls lock during pending work; delayed draft confirmation rechecks the latest consent before dispatch.
- Chat and proposals cannot activate, execute or grant external-service authority.
- Main and linked-workflow credential selectors are excluded from model context. Only existing exact owner-scoped bindings may be restored to unchanged connector settings.
- Timeline actions use the same runtime/edit locks as the composer.
- Migration020 adds durable intent/design continuation. Migration021 adds owner-constrained, append-only candidate-fork receipts. These are GCP PostgreSQL changes; no Supabase migration or data import is involved.
- During rollout, legacy workers can claim only legacy-shaped requests. New workers use a versioned claim entry point, so a no-traffic staged worker cannot race an older worker for a new intent/design request.

## Linked error workflow: implemented foundation, not enabled

The source includes a bounded owned ErrorTrigger dependency contract, whole-bundle hashes, recursive validation and child-first publication/main-first pause. Exact child provider/version pins are verified before execution. Main failure, handler completion and accepted outbound delivery remain separate evidence.

The deployed preview bindings must remain unchanged: no `ownedErrorHandlers` or CPU-always capability is enabled by this change. Do not claim customer error alerts are ready. Remaining requirements are:

1. Explicit approval and implementation of production-capable secure revision connection setup. No helper or credential table was added after the permission rejection. `resume_setup` fails closed; the UI states setup is unavailable and offers only reviewing requirements.
2. A customer-visible, separately approved failure probe with immutable test/evidence binding. Successful normal cases do not prove an error handler ran.
3. Authorized background CPU configuration for the existing isolated n8n service.
4. Customer selection/viewing of the owned child canvas and complete revision connection resolution.

## Verification evidence

- Final Orqaly regression gate: 114 test files passed, 1,710 tests passed, 14 explicitly skipped. Changed JavaScript/React files passed ESLint.
- The first authentication-enabled cloud web build correctly failed the unchanged 1,300,000-byte JavaScript limit at 1,310,306 bytes; it was not deployed. Removing unreachable standalone-chat UI and replacing the panel's sole heavy tab dependency with an accessible fixed tab strip reduced the matched local authenticated build to 1,291,599 bytes (32 scripts). No dependency, minifier or size-limit changes were made. Keyboard navigation, RTL and panel ownership have focused tests.
- Additional targeted regressions cover runtime-locked timeline actions, delayed consent changes, refreshed same-draft confirmation and different-draft denial.
- Python native contract/design tests: 109 passed. Local AxWise commit `3b48287c` includes the bounded owned-dependency contract and rejects an explicitly empty dependency list, matching Orqaly. This AxWise change is not deployed with the Orqaly-only release.
- Actual AxWise/Gemini acceptance was repeated against the final local AxWise commit and versioned worker queue using three bounded model operations and disposable PostgreSQL: auto question answered; auto change resolved then generated a valid five-node draft changing a threshold from100 to150 and its acceptance case. Live solution rows stayed byte-identical; no workflow invocation occurred.
- Actual local n8n2.37.10 acceptance: failed main execution invoked its genuinely published native ErrorTrigger child; separate execution IDs and parent linkage were verified. Exact disposable artifacts were removed. No real provider calls or cloud changes were part of that test.
- PostgreSQL16 tests verified migrations001–021, owner isolation, durable fork replay, immutable frozen candidates and API/worker permissions.
- Final queue compatibility acceptance passed 27 checks against PostgreSQL16, including restart between intent and design without duplicate operations. The migration operator also passed six unit guards and seven disposable-database checks for preservation, rollback and repeat application.
- Browser fixture used real product components with explicitly synthetic API/native surfaces: one input, one log, exact draft continuation, preserved unsent text, zero captured browser errors and no narrow-screen horizontal overflow. This is UI evidence, not live n8n canvas proof.
- GCP web build and retained-build verification passed.

## Release state

Orqaly release `cc3755396e2fd802c8ca1386a7dda4cd088779f8` is deployed to the existing GCP preview. Migrations020 and021 were applied atomically first; the actual restricted API and worker logins passed the new readiness checks. Rollout then proceeded worker → API → web, with each service at100% on its `conversation-cc375539` revision.

- API/worker image: `sha256:9195432a26cc3223a94e47fce366ad2ab16cfc29438b015eb90f9932329cd1d3`.
- Web image: `sha256:db1c436255c583744fccbdc779c0edc00d44c51c2907c5fdcc686abf8c8cdc93`. The actual cloud build passed at1,291,631 bytes /32 scripts. Canonical delivered JavaScript matched the staged asset hash.
- Existing IAM, runtime configuration, capacity and prior revision tags were preserved. No n8n instance, CPU allocation, provider credential, AxWise service, or customer workflow was changed by this rollout.
- Live browser acceptance: the original chat showed one Send button and an unchecked per-message payload-sharing option; its new question completed through Gemini3.8Flash, with saved request `77bd6b35-a32a-4303-9ced-7c2470f1bc78`. No draft was created or edited by that test.
- The genuine native n8n canvas loaded beside that chat at the desktop breakpoint without the reported502 message. Arrow/Enter tab switching worked, and returning to Workflow retained the same native session. Browser error log was empty. The temporary viewport override was reset afterward.
- Post-test database audit verified all16 protected non-conversation record groups unchanged, including versions, invocation receipts, schedules, connections, coding jobs and artifacts. Only the one verification chat turn was added (5 →6).

Machine-readable receipts are in `/private/tmp/orqaly-conversation-cc375539.zK6JGn/` (`worker-promote.json`, `api-promote.json`, `web-promote.json`, and the runtime-role receipt); migration and post-live preservation receipts are `/private/tmp/orqaly-change-migration-final-sep7.json` and `/private/tmp/orqaly-change-post-live-sep7.json`. The earlier larger web build was never deployed.

The linked error-workflow feature remains incomplete and gated as listed above. Local native/model tests establish its foundation, not deployed email delivery or end-to-end customer credential setup.

## Subsequent customer direction (2026-09-07)

After this release, the customer explicitly approved adding customer-controlled
credential save/revoke and background CPU on the existing n8n preview, with
synthetic testing and no real provider calls. The authorization prerequisite in
items1 and3 above is now resolved; implementation, guarded configuration changes
and verification are not established by that approval. The historical release
and runtime-capability statements above remain unchanged.

The customer also clarified that n8n is one execution layer, not the whole
product. The follow-on [one-conversation, multi-result plan](../workflow-v2/unified-work-results-plan-2026-09-07.md)
covers task lists, research, wireframes/designs, websites and code alongside n8n,
with one chat, appropriate result views and type-specific evidence. It records
future work separately from the current deployed automation capability.
