# Orqaly Goose authentication connector

## Current desktop: Goose-controlled workflow (2.3.15)

The packaged desktop mounts `src/utilities-mcp.mjs`, not the legacy Axwise
conversation extension. It exposes `get_weather`, `convert_currency`, and
`search_web`. Weather and currency retrieval use public data APIs directly;
search uses the authenticated Gemini search relay, without an Axwise workflow,
durable-work polling, or a required JEV classification first.

These are ordinary Goose tools. Results return to Goose's model loop, which
chooses the next step; there is no mandatory Axwise route or blanket ban on
using another available retrieval tool. Optional native engineering tools run
directly in the same Goose conversation. JEV provides advisory routing; native
edit receipts report local tests and do not include a remote evidence review.
Authentication and model transport still use the account-scoped gateway.

This local working-tree snapshot overlays the recorded base commit to retire
obsolete delegated-engineering descriptions. Its source receipt records each
overlay SHA-256 and marks the connector `releaseEligible: false`; it is not a
claim that these bytes were committed in the base revision.

The optional local Axwise specialist is packaged separately from this connector
in [`packages/axwise-local`](../axwise-local). Its workflow, validation and
artifacts stay local; model inference still uses the authenticated gateway.
It is an ordinary Goose extension, not a controller for everyday chat. See the
[local extension boundary](../../apps/orqaly/docs/LOCAL_AXWISE_EXTENSION_PLAN_2026-09-23.md).

## Legacy conversation tools (not mounted by the reset)

The earlier desktop started `src/mcp.mjs` as a native Goose stdio extension,
bound to one conversation and the verified account hash. It uses the same
credential store internally; stdout contains only MCP protocol messages, never
an access token. The gateway checks the expected account on every request.
This process is a local **adapter to cloud Axwise**, not a local Axwise engine.
The behavior below describes that legacy integration only, not the current
desktop's routing policy. Legacy server routes are disabled in the reset release.

Available tools: `read_goal_artifact`, `ask_axwise`, `generate_image`,
`lookup_live_data`, `quick_info`, `axwise_work_status`, and `cancel_axwise_work`. AxWise uses
the durable Assistant operation for focused multi-source research, explicit
Gemini image creation, fast source-backed weather or currency cards, and narrow
current-fact checks. These
capabilities do not create a Goal, fabricate scope approvals, execute local code,
or deploy anything. Local skills/tools and their approvals remain with Goose.
Questions and selected reference excerpts go to the Orqaly/AxWise preview and
its configured models; results are saved in the conversation. Full project files
are not automatically uploaded by this helper.

Use `lookup_live_data` for a simple current weather or currency answer and
`quick_info` for one narrow current public fact such as local headlines, opening
hours, a latest score or schedule, or service status. Use `ask_axwise` only when
the request benefits from multi-source comparison, synthesis, investigation, or
recommendations. Use `generate_image` only for explicit image creation. None of
these capability tools executes local engineering work; that remains with
Goose and its enabled native tools. When enabled in desktop
settings, JEV classifies a `quick_info` request at the same time as Gemini performs
the source-backed lookup. Disabling JEV keeps the bounded quick lookup available
for direct benchmarking and does not enable an automatic fallback.
`lookup_live_data` and `quick_info` each start and poll the
same durable request within one bounded tool call. Weather defaults to Celsius,
so only a missing location needs clarification unless the user asks for another
unit. If either fast route fails or JEV selects another lane, report that result
and ask before trying research, a web-search skill, fetch, shell, or native engineering tools; none is
an automatic fallback.

Keep ordinary research questions self-contained. `runId` checks access to a
project; it no longer implicitly appends its whole design. Read the project with
`read_goal_artifact` and pass explicit `artifactIds` only when those documents
are relevant to the question. Local reasoning, coding and skills stay in Goose.

An uncertain submission returns its request ID for status recovery instead of
automatically submitting duplicate work. The 90-second HTTP deadline leaves
room for token refresh and a recoverable result within the desktop extension's
180-second timeout. Supported stdio messages use the documented
[MCP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).

`axwise_work_status` waits up to 75 seconds, polling only the same durable
request and respecting server retry delays. It returns the completed capability
result or the latest actual state, not a fabricated completion. If still running, check
the same request later. Stopping a local status wait does not cancel cloud work;
use the explicit cancellation tool for that.

Launch arguments are `--config PUBLIC_CONFIG --conversation-id SESSION_ID
--account-hash SHA256_VERIFIED_USER_ID --jev-enabled true|false`. The packaged app supplies these values;
neither conversation IDs nor account hashes are credentials or authorization.

## Authentication

Node 22+ CLI for Clerk public OAuth with PKCE. The desktop ships with
`production.config.example.json`, which contains only public production
connection metadata. It does not contain a password, Clerk secret, Gemini key,
access token or refresh token. The API service name still includes `preview`
because the existing infrastructure is reused; authentication is production
Clerk at `clerk.orqanix.com` with its dedicated public PKCE client.

```sh
npm ci --ignore-scripts
node src/cli.mjs login --config production.config.example.json
node src/cli.mjs token --config production.config.example.json
node src/cli.mjs logout --config production.config.example.json
```

`preview.config.example.json` is retained as historical development metadata;
it is not selected by the production desktop and its old development tokens
are not accepted by the production API. There is no development-auth fallback.
The production issuer/client binding has a distinct credential identity, so an
existing preview user signs in again. This does not migrate or delete preview
credentials, local account profiles, conversations, or Axwise artifacts.

`login` prints the authorization URL and opens the system browser. `--no-open`
prints the URL without opening it. The loopback listener accepts one valid
callback at `http://127.0.0.1:{random-port}/callback` and expires after five minutes.
Register `http://127.0.0.1/callback` on the public Clerk OAuth client, require PKCE,
and keep the consent screen enabled.

`token` writes **only the access token and a newline to stdout**, suitable for a
Goose executable authentication configuration. Do not paste its output into a
chat. All errors go to stderr without provider response bodies or credentials.
It refreshes within 60 seconds of expiry. `token --refresh` forces a refresh after
a rejected API token; the caller should retry at most once using the same request
identity. Returned refresh tokens replace the old token atomically under a lock.
No model/provider key is sent to the laptop.

Configuration accepts `issuer`, `clientId`, `apiUrl`, and `scopes`. Equivalent
overrides are `--issuer`, `--client-id`, `--api-url`, and `--scopes "offline_access
profile"`. Issuer and API must be explicit HTTPS origins. Discovery must advertise
the same issuer and its `/oauth/authorize` and `/oauth/token` endpoints, S256 PKCE,
authorization-code/refresh grants, and public-client authentication. HTTP
loopback is accepted only with `--allow-localhost`, useful for a local API.

Credentials use `@napi-rs/keyring` 2.0.0 (OS Keychain, Credential Manager or Secret
Service), under service `com.orqaly.goose.oauth`, with an account hash binding the
issuer, client ID, API origin and requested scopes. Different preview/production
origins cannot share stored grants accidentally. There is **no plaintext
fallback**. If the OS store is unavailable, the command fails explicitly.

`logout` revokes the refresh grant if discovery advertises the same issuer's
`/oauth/token/revoke` endpoint, then clears local credentials. If no endpoint is
advertised, it reports local-only logout. If remote revocation fails, local
credentials are still cleared and the command returns an error explaining that
remote revocation was not confirmed. Clearing local storage does not by itself
invalidate an issued remote token.

Commands serialize credential changes using an owned lock directory in
`$HOME/.config/orqaly-goose-connector/locks/`. Waits are bounded to 30 seconds;
network and keyring requests each have a 10-second deadline. An interrupted
process may leave a lock containing only its PID and timestamp. After confirming
that the recorded process has exited and no authorization command is running,
remove that specific `owner.json` and its now-empty `.lock` directory. Locks are
not automatically stolen from a potentially live process.

For **synthetic local tests only**, `--auth-file /absolute/private-dir/auth.json`
selects an atomic 0600 file store. This requires `--allow-localhost` and both the
issuer and API to be loopback origins; the existing parent directory must be
owned by the user with mode 0700. Existing symlinks, hard links and broader file
permissions are rejected. This option cannot store the real Clerk preview grant.

Run `npm test` for local OAuth, callback, storage and refresh tests. Tests use
synthetic loopback data and never open a browser or access the OS credential store.

The implementation follows the documented protocol patterns in Clerk's
[CLI authentication guide](https://clerk.com/blog/adding-clerk-auth-to-your-cli)
and [reference example](https://github.com/clerk/cli-auth-example). It uses its own
strict storage and discovery boundary; it does not copy the example's file
fallback. Login/token exchange/refresh alone do not establish that the configured
Orqaly API has enabled the desktop OAuth client.

Cancellation of a token or logout command waits for an in-flight refresh to persist
its rotated grant before releasing the store lock. The desktop allows 45 seconds
before forcing termination. Cancelled lock waiters do not remove another process's
lock, and a cancelled token command never prints an access token.
