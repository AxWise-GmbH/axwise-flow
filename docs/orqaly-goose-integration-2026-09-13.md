# Goose integration: first local slice

Status: the local authenticated context/model/session flow has passed real
acceptance. The user approved an API-only Cloud Run preview rollout; that rollout
is the next step and is not yet claimed complete here.

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

The connector and gateway live in the Orqaly/AxWise monorepo. A separate private
Goose derivative will keep an upstream remote for stable-release updates; its
GitHub owner is still awaiting the user's choice. No new Goose repository has
been published.

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
Clerk configuration. The current Cloud Run API does **not** have the Gemini key:
the existing key is bound only to the AxWise worker. Cloud enablement therefore
needs a reviewed API secret binding and an image rollout after the local pass.

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

## Preview rollout and remaining product work

1. Commit the reviewed source to the approved private monorepo branch and build
   the Orqaly service image from that exact clean source.
2. Grant only the Orqaly preview API service account access to the existing
   Gemini secret, as explicitly approved by the user; enable the desktop route
   and roll only the API image. Preserve the four other services and production.
3. Verify real desktop login/model/context access against Cloud Run and retain
   existing browser access. Record the exact revision and image digest.

Later work remains explicit: packaged/branded desktop onboarding, the selected
private Goose repository, and backend Goal/progress/result operations from
Goose. Local Goose session persistence is not backend result synchronization.
The current prototype requires Node 22 and the connector; it is not yet a
signed, self-contained installer verified on arbitrary computers. The branded
client should offer sign-in, while enforcement remains on the backend. An
unmodified upstream Goose can still use a user's own model provider; that does
not grant access to Orqaly's context or sponsored model endpoint.
