# Orqanix single-production Clerk cutover

The owner selected one production login environment, not parallel preview and
production deployments. `orqanix.com` is the canonical website and the existing
Clerk application's primary production domain. `/login` and `/signup` keep their
local Clerk forms; no AxWise login hop or paid satellite domain is needed.

The existing Cloud Run services, project and secret names may retain `preview`
in their names when promoted in place. A resource's historical name does not
select its identity environment. Configuration, credentials and the tested
desktop OAuth contract do. This document is a cutover checklist, not proof that
a particular image or configuration has already been deployed.

## Identity and data boundaries

- Production uses `pk_live_` / `sk_live_` keys from the existing Production
  instance `ins_2wVQ9PHCQaHJWny0hOGReocAGV9`, with
  `https://clerk.orqanix.com` as the Frontend API. Obtain the current publishable
  key after changing the primary domain; do not reuse a key encoding
  `clerk.axwise.de`.
- One API verifies one Clerk instance. Never mount both key sets or choose keys
  from a request hostname or an unverified token.
- Development remains a separate Clerk instance,
  `ins_2vHl8PVNUNRJVv23OVqAcYOkVRK`. Retiring its public website is not permission
  to delete its accounts, application records, secrets or infrastructure.
- Changing `ORQALY_ENVIRONMENT` does not migrate application identities or
  history. Clerk user IDs and application identity bindings are
  environment-specific. Preserve existing data; any desired account/history
  mapping needs a separate explicit migration and verification.
- Old desktop releases pin the development issuer and OAuth client. They do not
  automatically switch when the website or API is promoted. Publish a matching
  production desktop and expect a fresh sign-in; do not claim old sessions will
  survive the cutover.

## Browser build inputs

| Variable | Production value |
| --- | --- |
| `VITE_CLERK_ENVIRONMENT` | `production` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Migrated Production publishable key (`pk_live_`) |
| `VITE_ORQALY_API_ENVIRONMENT` | `production` |
| `VITE_ORQALY_API_URL` | Exact HTTPS origin of the promoted API |

Both environment declarations must match. Prefix checks still reject test keys
in production and live keys in a declared preview build. A production build can
use the existing `https://orqaly-v2-api-preview-161074549006.europe-west4.run.app`
origin after that service is deliberately promoted. Hostname text cannot prove
the actual issuer behind an API: verify the selected service's runtime identity
configuration and real authentication before switching traffic.

The Docker build runs the same browser-safe validation before Vite compilation.
Direct local Vite entrypoints validate at startup. Legacy local builds without
an explicit environment remain compatible; all new releases should declare it.
No key is selected automatically from the browser hostname.

Cloud Build retains historical preview defaults for compatibility. Production
builds must override `_CLERK_ENVIRONMENT`, `_ORQALY_API_ENVIRONMENT`,
`_CLERK_PUBLISHABLE_KEY_SECRET`, `_CLERK_PUBLISHABLE_KEY_VERSION` and
`_ORQALY_API_URL` together. Secret keys stay server-side; only the public key
belongs in browser assets. Matching key prefixes do not prove the keys belong
to the same instance, so verify the instance in Clerk.

## API, worker and desktop cutover

1. Record the current service revisions, non-secret configuration, secret
   version references and desktop OAuth contract for rollback. Preserve the
   database and prior secret versions; promotion is not a cleanup operation.
2. Confirm the primary domain's DNS and certificates are ready in Clerk. The
   publishable key must refer to the new Frontend API. Confirm production OAuth
   provider callbacks and a production native OAuth application with the
   desktop's exact redirect URI, public-client/PKCE behavior and scopes.
   For Google social sign-in, the Google Cloud OAuth client's authorized
   redirect list must include `https://clerk.orqanix.com/v1/oauth_callback`.
   Renaming the Clerk primary domain does not update Google's allowlist.
   Click the Google button and verify that Google's account-entry/selection
   screen loads without `redirect_uri_mismatch`; rendering the Clerk form
   successfully is not this test. Complete an actual user login separately.
3. Set `ORQALY_ENVIRONMENT=production`, both production Clerk keys and
   `ORQALY_BROWSER_ORIGINS=https://orqanix.com` on the promoted API. Add only other
   intentional production browser origins. This allowlist controls both CORS
   and Clerk browser `authorizedParties`; native OAuth tokens use the exact
   configured client and scopes instead.
4. Disable `ORQALY_AGENT_EVALUATION_ENABLED` before promoting the API: the
   evaluation feature explicitly rejects production. Do not blindly clone the
   whole old environment or remove required service configuration merely
   because the desktop no longer uses remote workflow routing.
5. Coordinate any workflow worker configuration with the API. The current
   shared database outbox claimant is not environment-filtered, so do not run
   competing preview and production workers as if they were isolated. Inspect
   pending work and preserve historical rows; neither changing worker settings
   nor retiring a hostname is a migration of existing jobs.
6. Rebuild the desktop with the production issuer, production OAuth client and
   promoted API origin as one matching contract. Increment the app version and
   verify fresh native sign-in and an authenticated model call. Existing local
   chats/artifacts are not deliberately deleted by this configuration change.
7. Build and deploy the website using the matching production inputs. Test
   fresh-browser sign-up/sign-in, an existing production account, sign-out,
   authenticated API access, deep-link returns, CORS and denied external return
   URLs. Website sign-in alone does not validate desktop sign-in.

Declared preview/production API services fail startup on missing or mismatched
key prefixes. Browser origins must be explicit HTTPS origins. These guards are
retained during promotion.

## Canonical website and retained infrastructure

The web image redirects only `preview.orqanix.com` to
`https://orqanix.com$request_uri` with HTTP 308, preserving the escaped path and
query string. The default Cloud Run host and its health probes still reach the
normal SPA server. Keeping the old domain mapping for this redirect does not
create a second authentication environment.

The CSP permits exact `clerk.orqanix.com` and `accounts.orqanix.com` sources,
without wildcarding the Orqanix domain. No billing plan, paid satellite feature,
cloud session sync or API-key provisioning product is introduced by this
cutover. Resource deletion and any later reduction of legacy cloud services
remain separate, explicitly scoped work.

## Provider progress — 24 September 2026

At the owner's request, Clerk application
`app_2vHl8Ims5SawQHOW5khhcKSxmpW` was renamed to Orqanix and its Production
primary domain changed from `axwise.de` to `orqanix.com`. The five
Clerk-provided CNAME records were added through Hostinger without changing
existing apex, www or preview website records. No accounts were deleted and no
subscription was changed. Clerk subsequently reported domain, DNS, SSL and mail
status complete. Web/API deployment and desktop release verification must still
be recorded independently; provider readiness does not establish that they are
live.

Reference: [Clerk React setup](https://clerk.com/docs/react/getting-started/quickstart).

## Deployment and social-login correction — 24 September 2026

- API production revision: `orqaly-v2-api-preview-prod-99174e77`, serving 100%.
  `/readyz` reports production and the desktop session endpoint rejects
  unauthenticated requests with HTTP 401.
- Account website: source `bd51a8c7`, revision
  `orqaly-v2-web-preview-prod-bd51a8c7`, serving 100%. Production Clerk forms,
  signed-out gating, return links, public download links and preview-to-production
  HTTP 308 redirects were checked on the live domain.
- Matching desktop: Orqanix 2.3.15, build 5682, source `3656b0241`. The full public
  DMG SHA-256 matches the verified local installer:
  `bb80eb00df4954bd0b85e5ec32ca506ba9d4f11708e858ea6be4e0164cbc58e9`.
- The user's subsequent Google login exposed `redirect_uri_mismatch`. The actual
  Google client in project `axwise-73425` still listed only Firebase and
  `https://clerk.axwise.de/v1/oauth_callback`. With explicit owner approval,
  `https://clerk.orqanix.com/v1/oauth_callback` was added. Google confirmed
  "OAuth client saved". Existing redirects, client secrets and scopes were
  preserved. A saved configuration alone does not prove completed user login.
  A fresh post-save Google attempt reached its normal account-entry screen for
  `orqanix.com`, with no redirect mismatch. No credentials were entered.

Authenticated post-login browser and desktop model access require an actual
user sign-in verification. No account/history migration or data deletion was
performed. The installer remains ad-hoc signed, not Apple-notarized.
