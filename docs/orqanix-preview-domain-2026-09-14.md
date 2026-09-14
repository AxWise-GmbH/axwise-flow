# Orqanix preview hostname — 14 September 2026

Status: source and desktop package prepared; live domain setup is pending.
The user confirmed `orqanix.com`; the planned web hostname is
`https://preview.orqanix.com`. Existing apex and `www` routing stay unchanged.

## Prepared and checked

- Desktop accepts the exact new HTTPS `/goals?run=…` origin alongside the
  existing canonical Cloud Run URL and raw run IDs. Other origins, credentials,
  fragments, wrong paths and ambiguous run IDs remain rejected.
- Twenty desktop parsing/panel checks, TypeScript, scoped lint and ZIP integrity
  passed. The existing Node PATH correction and runtime inventory are unchanged.
- API already supports multiple exact CORS/Clerk authorized-party origins.
  Fifty existing HTTP/auth and native-gateway configuration checks passed.
- The broader deployment and runtime-verification scripts retain the custom
  origin alongside the canonical origin. Both pass shell syntax checks; the
  installed Google SDK parser confirmed the alternate environment delimiter
  preserves both origins as one value.
- Do not run the broader provisioning script for this hostname-only update.
  The intended live API change is only `ORQALY_BROWSER_ORIGINS`, using
  `--update-env-vars`, same image, staged traffic and unchanged other settings.

Prepared desktop package:
`orqaly-goose/ui/desktop/out/workspace-domain-sep14/make/zip/darwin/arm64/Orqaly Preview-darwin-arm64-1.50.0.zip`

SHA256: `7400fef6c71a091aaaa18603f0c0fe3555e941c6a0d62f4d15656fbc242c72ab`

Size: 255,377,806 bytes. This package has not been launched, published as a
GitHub release, or accepted against the new live hostname. Prior packages remain.

## Pending authority and live work

The current GCP account is `vitalijs@axwise.de`. Its verified-domain list and the
preview project's regional domain-mapping list were empty. A Google Search
Console DNS challenge was obtained in that exact account; the property is not
verified. Action-time approval was requested before adding its apex TXT proof
and verifying ownership. No DNS records or Cloud Run settings were changed.

After approval: verify the exact Google TXT proof through Hostinger; create only
`preview.orqanix.com` mapped to `orqaly-v2-web-preview`; add the actual returned
DNS records; stage the API origin allowlist update; verify readiness, both allowed
origins, rejected untrusted origins and authentication; promote the exact API
revision; then verify real HTTPS sign-in and desktop Goal attachment. Keep the
API address and desktop OAuth issuer unchanged. Certificate issuance/propagation
must finish before declaring the hostname ready.

The local Clerk CLI is authenticated to a different account and this repository
is not linked there. Its account, linkage, keys and configuration were left
untouched; no production Clerk migration is part of this preview change.

## Repository collaborator request

The requested spelling `misters.builder` returned GitHub 404. Existing account
`mistersbuilder` already has write access to `vitalyvishnevsky/axwise-flow-oss`,
but not `vitalyvishnevsky/orqaly-goose`; neither has a pending invitation.
Confirmation of that exact recipient was requested before sharing the desktop
repository. No collaborator access was changed.
