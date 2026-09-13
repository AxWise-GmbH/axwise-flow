# Goose integration: first local slice

Status: the authenticated Goose → Orqaly → Gemini connection is live on Cloud
Run preview and has passed the bounded real context/tool/session acceptance.
The separate private desktop repository now also contains a packaged unsigned
macOS preview; its acceptance report tracks that later work and remaining
distribution/large-context limits.

## Design

Use stable Goose **v1.50.0**, upstream `aaif-goose/goose`, commit
`4cc49a8485f7960efeceba37ac5f572459c52c7c`. The installed desktop binary is
also 1.50.0. Source inspection found that this release already retains Gemini's
opaque tool-call metadata through streaming and saved conversations. No Goose
core patch has been made.

Goose owns the local conversation, files, commands and tool approvals. Orqaly
authenticates the user, resolves the existing tenant, adds explicitly selected
Goal context and forwards model requests to Gemini. The sponsored Gemini key
belongs to the gateway, not to the desktop auth helper or Goose configuration.

The connector and gateway live in the Orqaly/AxWise monorepo. The separate private
desktop derivative is now `vitalyvishnevsky/orqaly-goose`, based on stable Goose
1.50.0 with upstream history retained. Its `ORQALY.md` and
`DESKTOP-ACCEPTANCE-2026-09-13.md` track the packaged desktop work. This document's
cloud acceptance below remains historical evidence for the gateway rollout.

## Implemented

- `packages/orqaly-goose-connector`: public-client Clerk OAuth with PKCE,
  browser consent, loopback callback, OS credential storage, refresh and logout.
  Goose invokes its `token` command; tokens are not copied into configuration.
- `apps/orqaly/server/workflow-v2/goose-provider-http.js`: authenticated
  `/desktop/v1/session`, `/models` and `/chat/completions` endpoints. The public
  model alias is `orqaly-gemini`; the server selects `gemini-3.8-flash`.
- `goose-provider-config.js`: a disabled-by-default API integration. Only the
  configured OAuth client is accepted; existing browser routes retain their
  current session-token authentication.
- An optional `X-Orqaly-Run-Id` selects an owned Goal's approved scope. The server
  loads that scope using the existing tenant-aware repository and checks the
  stored approval/hash. This is reference context, not permission to execute
  local actions or a claim that arbitrary project memory is already implemented.

This first transport supports text and function tools, including raw streamed
responses and Gemini tool signatures. Images, audio and file uploads are not
supported yet. It does not route desktop turns through the background Goal queue,
add a model-review loop or execute tools on the server.

Enablement requires explicit `ORQALY_GOOSE_ENABLED=true`,
`ORQALY_GOOSE_OAUTH_CLIENT_ID`, `ORQALY_GOOSE_GEMINI_API_KEY`, and the existing
Clerk configuration. With the user's explicit approval, the preview API now
reads version 2 of the existing Gemini secret; the key is not supplied to Goose.
The existing AxWise worker access was preserved. No project-wide secret grant,
new Gemini key, production change or worker rollout was made.

## Preview login registration

The existing Clerk **development** instance has one new public OAuth client:

- Name: Orqaly Goose Preview
- Client ID: `UNciLDGl5PPmF9M8`
- Issuer: `https://distinct-rattler-76.clerk.accounts.dev`
- Redirect: `http://127.0.0.1/callback` (random local port at login)
- Scopes: `offline_access profile`
- PKCE required; user consent enabled; no client secret.

Only this preview client was registered. Production Clerk settings and existing
browser sessions were not changed. The first browser login timed out; a fresh
login then completed with the user's consent and stored the desktop grant in
macOS Keychain. A real refresh subsequently returned a token that the gateway
accepted with HTTP 200 and `tenantBound: true`.
The first cloud-address login exceeded the original two-minute callback window.
The connector now allows five minutes; the subsequent real cloud login completed
and the existing 11 auth checks still passed. Local and cloud connection records
remain separately bound to their API origins.

## Verification to date

Passed: 11 connector tests, 26 provider transport tests, and 40 combined
configuration/existing HTTP-app tests. These use synthetic OAuth/provider
transports where appropriate. They establish the local implementation checks,
separately from the real acceptance below.

The real local gateway subsequently started successfully using the existing
preview role-bound database and Clerk configuration. `/readyz` returned 200;
unsigned `/desktop/v1/session` and `/chat/completions` both returned 401.
That initial connectivity-only gateway recorded **zero** Gemini calls and shut
down cleanly, including its own Cloud SQL proxy. Later signed-in runs made real
Gemini calls; the initial zero-call count is not the total for this integration.

Integration review also removed inherited browser-origin restrictions from the
desktop OAuth verifier: browser origins and native OAuth client identities are
different checks. The explicit desktop client restriction remains in place;
the existing browser verifier was not changed.

The real context check found a second integration issue: the gateway had added
Orqaly context as a separate system message before Goose's system message. With
the complete Goose prompt and a 2,048-token response budget, Gemini returned null
Goal identifiers. A control with no client system message returned the selected
Goal correctly. The minimal fix places the reference into Goose's existing
leading system message, preserving every other message and tool signature.
The corrected readback returned the exact identifiers in 4.844 seconds:

- Run: `c5399f08-d34a-5a00-8afe-022bb2d6705b`
- Approved scope hash:
  `f91e6718037704de1d885199ef18f75c2ea6506d219c7763e9fbd586fa256f5c`
- Topic: resilient high-volume billing webhook delivery, idempotency, retries,
  dead-letter routing, signatures and operational visibility.

The actual Goose CLI then gave a context-informed explanation of this Goal in
3.82 seconds. Session `20260913_1` was closed and reopened through Goose's native
history view: all 28 messages and the final explanation were restored. Exported
conversation SHA-256 before and after reopening was identical:
`720caf90a86de0a83daef9451a27703062b15966efeb7b3def60f349907610d7`.
Reopening did not add a model turn. Earlier real shell-read/tool-result round
trips also completed; requests retained the original task, tool results and
opaque Gemini signatures.

The optional coding exercise was stopped after exploration loops and repeated
malformed patch proposals. No fixture implementation files were created and no
fixture tests ran. It is not recorded as a successful coding benchmark. The
user clarified that the product acceptance should focus on authenticated model
access, added context and existing Goose session/tool handling, rather than
revalidating every kind of generated implementation. No new model-review or
sync engine was added to address that exercise.

The isolated acceptance setup is under
`/private/tmp/orqaly-goose-source.ZvEXXC/`. It has its own Goose state and a small
webhook receiver exercise, outside the main repository. Native Goose approvals
remain enabled. Goose's state root is not a filesystem sandbox; each proposed
command must still be reviewed for the exercise's exact directory.

Stable Goose saves conversation/request content locally. Source inspection found
that its custom-provider request logger does not serialize HTTP Authorization
headers; successful auth-command stdout is not logged. Error text may be logged,
so the connector sanitizes failures. No claim is made that local project content
stays offline: selected context and model conversation content go to Gemini via
Orqaly, as intended by this integration.

## Completed preview rollout

- API source commit: `04606f0b2cb425e33cf2679a14f834921902f242`, pushed to the
  approved private repository's `codex/universal-agentic-foundation` branch.
- Cloud Build: `e702c083-e28d-4350-aeb3-c8ebd9411b52`. Its exact app-relative Git
  archive, uploaded source generation, recipe, build identity and registry digest
  were independently compared using the existing build verifier.
- Active API revision: `orqaly-v2-api-preview-goose-04606f0b`, at 100% traffic.
- Image:
  `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqaly-service@sha256:38724efc0e5151f377a6811810bf4fea0eca0e644dcd59d7c0ffa2490206c0e4`.
- Only the API image and the three Goose enablement/client/secret environment
  entries changed. Its eight existing tags, other configuration and service IAM
  were preserved. All four other services match the pre-rollout snapshot.
- The Gemini secret's final accessor binding contains exactly the existing
  AxWise worker and the approved Orqaly preview API service accounts.

Unsigned cloud `/desktop/v1/session` returned 401; the real desktop OAuth token
returned 200, `tenantBound: true`, and model alias `orqaly-gemini`.

With the local gateway stopped and provider keys removed from the Goose process
environment, cloud-backed Goose session `20260913_2` performed one approved
`cat README.md` tool call and then returned the correct Goal ID and approved-scope
hash, explaining the relationship between the reference and the synthetic local
exercise. The user explicitly approved sending those two test inputs to Gemini.
The two model requests on the exact new Cloud Run revision both returned 200,
with observed request latencies of **1.548 seconds** and **3.033 seconds**.
These are observed request timings, not a general latency guarantee.

Closing and reopening this cloud-backed session restored all four messages.
The exported conversation hash before/after was identical:
`1b5ec3b20bd9a65b02763607e85b5b80be2e8c01d9ce073a189bafbd3b827ce4`.
The existing authenticated Goals browser tab was also reloaded: it retained the
same 11/11 settled workflow and immutable final artifact hash
`9358908c05b0b0489eb232640e96386c329cfedadeeb04abf0039e461d1744e7`.

Sanitized local receipts are in `artifacts/goose-integration-sep13/`, including
`api-build-verification.json`, `api-staged-verification.json`,
`api-active-verification.json` and `cloud-acceptance.json`. Temporary Goose CLI
sessions and the local gateway/proxy were closed. Normal Goose settings were
not changed, and no new Goal run was launched for this acceptance.

## Remaining product work

The private desktop repository now bundles the connector/runtime and implements
sign-in, sign-out and explicit Goal selection for an unsigned macOS preview.
See its acceptance document for current verification, model/transport limits and
distribution status. Signing, additional native platforms and backend
Goal/progress/result operations remain explicit work. Local Goose session
persistence is not backend result synchronization. The standalone connector
prototype described above requires Node 22; the packaged preview supplies its
own runtime. Access enforcement remains on the backend. An
unmodified upstream Goose can still use a user's own model provider; that does
not grant access to Orqaly's context or sponsored model endpoint.
