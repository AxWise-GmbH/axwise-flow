# Orqanix Clerk environments and production readiness

This code adds explicit configuration and failure checks. It does **not** create
or switch live Clerk instances, DNS records, API services, secrets, accounts or
desktop OAuth clients. The released desktop remains on its existing development
issuer and preview API until a separately tested desktop cutover.

The agreed direction is to make Orqanix the existing Clerk application's primary
production domain, not to add a paid satellite or introduce a second login hop
through AxWise. `/login` and `/signup` retain their existing local Clerk forms.

## Identity boundaries

- Preview currently uses the existing AxWise Development instance
  `ins_2vHl8PVNUNRJVv23OVqAcYOkVRK` and `pk_test_` / `sk_test_` keys. Renaming
  application branding must not silently change the released desktop's issuer.
- Production uses `pk_live_` / `sk_live_` keys from the existing Production
  instance, after its primary domain has been migrated to Orqanix. Obtain the
  current publishable key after changing the domain; do not keep a key that
  encodes the former `clerk.axwise.de` Frontend API.
- One API service verifies one instance. Never mount both key sets or select keys
  from the request hostname or an unverified token. Clerk user IDs and local
  application identity/data remain environment-specific.
- For a preview/development and production split, use separate web and API
  services with their own secrets, browser-origin allowlists and application data.
  Do not replace the preview API's key with a live key while released desktops
  still use its development OAuth client.

## Browser build inputs

| Variable | Preview | Production |
| --- | --- | --- |
| `VITE_CLERK_ENVIRONMENT` | `preview` | `production` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Development publishable key | Migrated Production publishable key |
| `VITE_ORQALY_API_ENVIRONMENT` | `preview` | `production` |
| `VITE_ORQALY_API_URL` | Existing preview API HTTPS origin | Separately configured production API HTTPS origin |

The two environment declarations must match. Prefix checks reject test keys in a
production build and live keys in a preview build. The existing preview API URL is
explicitly rejected in production. These checks cannot discover the actual issuer
behind an arbitrary API URL: verify that the selected live API uses the intended
Clerk instance before changing traffic.

The Docker build runs the same browser-safe validation before Vite compilation.
Direct local Vite entrypoints validate when the application starts. Legacy local
builds without an explicit environment remain compatible; new releases should
declare it. No key is chosen automatically from the browser hostname.

Cloud Build keeps the existing preview defaults. To build production, override
`_CLERK_ENVIRONMENT`, `_ORQALY_API_ENVIRONMENT`, `_CLERK_PUBLISHABLE_KEY_SECRET`,
`_CLERK_PUBLISHABLE_KEY_VERSION` and `_ORQALY_API_URL` together. The secret value
remains in Secret Manager; only the public key is included in browser assets. A
matching prefix does not establish that two keys belong to the same Clerk
application; verify their instance in Clerk and test real authentication.

## API inputs

Set `ORQALY_ENVIRONMENT=production`, both production Clerk keys and explicit
`ORQALY_BROWSER_ORIGINS=https://orqanix.com` on the production API. This existing
allowlist controls both CORS and Clerk browser `authorizedParties`. Add only other
actual intended production browser origins. Preview retains its configured
origins during the transition; the code does not silently modify its deployed
allowlist.

Declared preview/production services fail startup on mismatched/missing key
prefixes. Browser auth requires explicit HTTPS origins. Desktop OAuth still
validates the single configured Clerk instance, its exact OAuth client and scope;
browser `authorizedParties` are not applied to native OAuth tokens.

## Required primary-domain migration before production activation

1. Inspect the existing Production application and record its current domain,
   key references, OAuth callbacks and branding before changing them. Other apps
   using that Production instance are affected by a primary-domain change.
2. Change the primary domain to `orqanix.com` through Clerk's supported domain
   migration. Add exactly the DNS records Clerk supplies, including the required
   Frontend API/Account Portal/email records. Do not guess CNAME targets. Confirm
   DNS and certificates are ready in Clerk before switching website traffic.
3. Update the public/secret key references for the production API and web build
   as appropriate, including OAuth provider callback configuration. Confirm the
   publishable key points to the new primary Frontend API.
4. Test fresh-browser sign-up/sign-in, existing accounts, return to an Orqanix
   deep link, sign-out, denied external return URLs, authenticated API access and
   browser CORS. Verify preview desktop sign-in still works before publishing.
5. Only a separately rebuilt desktop with matching Production OAuth issuer,
   OAuth client and API URL should move to Production. Website authentication
   alone does not migrate an already-installed desktop.

The CSP permits exact `clerk.orqanix.com` and `accounts.orqanix.com` sources,
without wildcarding the Orqanix domain. Adding these sources alone does not
provision DNS or authorize API access. No satellite feature or subscription
change is required by this code.

Reference: [Clerk React setup](https://clerk.com/docs/react/getting-started/quickstart).

## Operator progress — 24 September 2026

At the owner's explicit request, the existing Clerk application
`app_2vHl8Ims5SawQHOW5khhcKSxmpW` was renamed to Orqanix and its Production
instance `ins_2wVQ9PHCQaHJWny0hOGReocAGV9` primary domain changed from
`axwise.de` to `orqanix.com`. Development remains a separate instance; no
accounts were deleted and no subscription was changed. The five Clerk-provided
CNAME records were added through Hostinger without changing the website's
existing apex, www or preview records. Domain/certificate verification and
production web/API activation must be checked separately; these provider changes
alone do not switch the currently deployed website or desktop.

Do not clone the whole preview API configuration into production. In particular,
preview agent evaluations explicitly reject production, and the existing shared
database's outbox claimant is not environment-filtered. Production workflow
execution therefore needs separate storage/workers, or a deliberately restricted
account-only API before using shared storage. Hiding workflow links is not an API
security boundary. The current preview service and desktop issuer stay unchanged
until this production deployment boundary is implemented and verified.
