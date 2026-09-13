# Application access: implementation and preview evidence

Status: application access deployed to the existing GCP preview; live machine and
signed-in UI acceptance passed. Updated 2026-09-05.

## Customer result

The existing native workflow remains the primary Solution view. Under **Test &
use → Connect your application**, the customer creates a named, expiring key,
sees its secret once, and receives a server-side request example. An external
application can invoke the active approved workflow without an Orqaly browser
session. Execution history identifies the calling app. Revoking a key stops its
new calls; pausing the Solution stops all new production calls.

```text
Task → clarifications → native n8n draft → review → deploy → test → activate
                                                                  │
                                 Test & use → application key ─────┤
                                                                  ↓
Customer server → Orqaly authorization/idempotency → isolated n8n → result
                         ↑                              │
                      pause/revoke                execution history
```

This release adds **incoming application access**, not outgoing SMS/GitHub/HTTP
service connections. The approved preview workflow still only transforms JSON.
The first outgoing connector is pending the customer's choice. Automatic cloud
provisioning, schedules and arbitrary software-development execution are not
claimed as implemented.

## Source and verification

- Backend commit: `65e70c51`.
- UI, plan and real n8n acceptance commit: `36816de4a94711be4a24c0cab08735a9f450d254`.
- Selected regression suite: **885 passing tests across 57 files**.
- Real disposable PostgreSQL 16 + pinned n8n 2.37.10 execution: passed. Machine
  calls did not enter Clerk middleware; repeat requests did not redispatch.
  Revocation, pause, key isolation and changed-release rejection passed.
- Restricted PostgreSQL migration/RLS/grant/concurrency checks: passed on 16/17.
  Additional deployment-operator checks are recorded with the live migration below.
- Production UI component browser checks: desktop 1280 and mobile 390, synthetic
  fixture explicitly distinguished from live authentication. No horizontal
  overflow, unlabeled inputs or token persistence in browser storage.
- Cloud web build gate: 30 initial scripts, 1,191,761 bytes; fixed 1,195,000 cap.
  The measured addition is 13,158 bytes over the matched baseline.

## Immutable preview images

Both builds used a clean archive of `36816de4`, not the working directory. Archive
SHA-256: `8225c6a0649212cc2a5251dd01af362c65671c940fd17ba2239ea986ae7ba56c`.
The dedicated existing `workflow-v2-preview-build` service account was used.

| Component | Cloud Build ID                         | Image digest                                                              |
| --------- | -------------------------------------- | ------------------------------------------------------------------------- |
| API       | `1fc21e2f-2544-481f-9e58-721b7a3c2bf2` | `sha256:a9cfdc055737b20193d444f87605882c8764d58a23122f28eaa1ec0e743afb12` |
| Web       | `75933fd9-9370-49fc-8131-7271fbcb1fbc` | `sha256:7cd659a46780fb234580298ad42288d710940b9655f7efb3096502c572779bb7` |

## Scoped rollout and live acceptance

Migration 014 applied and independently re-inspected on Cloud SQL PostgreSQL 160014. Ledger 13 → 14, source `18eebce37e3f23c8d35f00c57a1f4c90c2cbda99`,
migration SHA-256 `0d1dfa9cdc32deb889c86f3ab5481adf7ba58c9c99eb451820f828c77115bc6a`.
Catalog hash changed only for reviewed additions:
`9c51bad774590a5bc48b73dacf251e6fd7ae8d02ce84dc1d3526003c4d3514c7` →
`28c482c6c2dc3bc7d8337f1940d1ce97892125be6d24c4c305305813178bb812`.
Cluster role/database ACL hash remained
`976405a30b9ad3222644de4ba3b6ff6974275d7b0a320a8b8fb8e0dde9a501f2`.
All scoped data hashes/counts were preserved: 2 Solutions, 3 revisions,
28 revision events, 8 receipts (6 old + 2 fresh), 1 Build, 2 attempts,
10 Build events, 2 source runs and 9 artifacts.

The deployment checker was tested on PostgreSQL 160015: inspect, deliberately
unreviewed catalog change rejected with full rollback, exact apply and repeated
apply without writes. 17 PostgreSQL groups and 16 unit guards passed. Its initial
empty-column-ACL parsing error failed read-only, was fixed and retested before any
cloud migration writes.

API revision `orqaly-v2-api-preview-appkeys-36816de4` and web revision
`orqaly-v2-web-preview-app-access-36816de4` are at 100% traffic. Staged and canonical
readiness checks returned HTTP 200. Existing configuration and IAM hashes were
preserved, with all seven API/four web prior tags unchanged and one release tag
added to each service. API configuration hash:
`d3fa22b6c2672fe7a60d6e1d3c12abea13fddf31eb96bf895b2f0be9001050a2`;
web configuration hash:
`ecd0e16f387adb6efbafed9a5b60dcdd64fd320df2d937d766acd1235d1b707a`.

### Actual application invocation

`scripts/solution-app-access-preview-e2e.mjs` passed against the canonical deployed
API and existing Solution `8b606adc-91ba-46e5-86da-ece609df9c7d`:

- Input: `{"name":" Alice ","email":"ALICE@EXAMPLE.COM"}`.
- Output: `{"customer_name":"Alice","email":"alice@example.com"}`.
- n8n execution ID: `3`.
- Orqaly receipt: `f2d679b6-f2da-458b-b928-4882904786ab`.
- Calling key: `201468d7-f791-46a7-bfcd-6f2e7fe65ba3`, **revoked after the test**.
- No Clerk token, cookie or browser Origin was supplied to the machine route.
- Same-key/request replay returned the same receipt/execution without redispatch.
- Receipt read worked; after revocation, replay and receipt access returned 401.
- Exactly one new receipt was added. Both existing Solution releases and all
  eight earlier receipts remained byte-equivalent in the scoped database snapshot.

An independent read-only audit matched published n8n workflow `3eAscwRxWyn2dxYl`,
version `3ab89c04-9163-4adb-821f-562a43ff3841`, and approved hash
`b115e3ae3bca9084d3ef2115764ecbeeaa2d7757a68df571e8aa526275f7ab78`.
Retention remains save-none. Provider records 1/2 were already pruned; record 3
was transient soft-deleted in-flight metadata, **not independent final-success
evidence**. The successful output above is the real n8n HTTP response captured
as Orqaly's canonical receipt, not reconstructed n8n payload history. No retention
setting was relaxed or extra execution triggered by the read-only audit.

### Actual signed-in UI

The normal preview page loaded the native n8n three-node canvas. In Test & use,
actual Clerk-authenticated creation of `Preview UI acceptance` showed a correctly
shaped read-only one-time key field. Only boolean DOM checks were returned; the
secret was not copied, logged, screenshotted or used as a browser session.
Explicit hiding removed the secret field. The revocation confirmation succeeded;
after page reload both temporary test keys remained **Revoked**, with no secret
dialog or field restored. No horizontal page overflow was observed on desktop.
Execution history displayed **Calling app: Preview app acceptance**, n8n execution
3 and the exact saved input/output. Mobile verification is the separate synthetic
production-component test described above, not a live mobile-authentication claim.

### Existing runtime preservation

Post-rollout read-only metadata confirmed n8n001 remains `native-db1cb806` and
n8n002 remains `00001-ng6`, both at the pinned image digest
`sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2`,
with dedicated service identities, min0/max1, concurrency1, 1 CPU/1 GiB and only
the Orqaly API service account as invoker. The worker remains `build-140804d0`.
No n8n/worker revision was created. Anonymous health probes returned 404 in this
check, not 403; private IAM configuration is separate metadata evidence, not an
invented IAM-403 test result.

The machine acceptance uses an operator-issued key through the production key
service with the existing restricted API DB role. It is **not** browser issuance
evidence; actual Clerk UI issuance is checked separately without copying any
browser session or secret into tools. The application token remains in process
memory and is revoked after the test. Existing releases and prior receipts must
remain unchanged; one new synthetic receipt in Solution 002 is expected.

No Supabase access/import, GitHub push, additional runtime, paid provider action
or n8n node/credential-policy expansion is included.

See the [implementation plan](./customer-application-access-and-connections-plan.md)
for the remaining phases and the [pinned n8n security review](./service-connection-security-review.md)
for the outgoing-connection boundary.
