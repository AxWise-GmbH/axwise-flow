# Orqaly Goose authentication connector

Node 22+ CLI for Clerk public OAuth with PKCE. The shipped example contains only
public preview connection metadata. It does not contain a password, Clerk secret,
Gemini key, access token or refresh token.

```sh
npm ci --ignore-scripts
node src/cli.mjs login --config preview.config.example.json
node src/cli.mjs token --config preview.config.example.json
node src/cli.mjs logout --config preview.config.example.json
```

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
