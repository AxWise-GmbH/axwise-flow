# Orqanix preview hostname — 14 September 2026

Status: domain ownership verified, DNS and API origin support configured;
Google's managed HTTPS certificate is pending. New-domain E2E is not yet passed.
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

## Live configuration and remaining check

The user explicitly approved Google DNS verification. Hostinger received the
exact Google-provided apex TXT record (TTL 300), public Google DNS returned it,
and Search Console reported **Ownership verified** for `orqanix.com` under
`vitalijs@axwise.de`. The verification TXT remains in place.

Cloud Run now maps `preview.orqanix.com` to `orqaly-v2-web-preview`. Its actual
returned record, **CNAME `preview` → `ghs.googlehosted.com.`**, was independently
read from Cloud Run and then saved in Hostinger with TTL 300. Google DNS confirms
that target. Existing apex `A 2.57.91.91` (TTL 50), `www CNAME orqanix.com` (TTL
300), and both Hostinger nameservers remain unchanged.

API revision `orqaly-v2-api-preview-domain-sep14` was staged, verified and promoted
to 100% traffic. The only runtime setting change is `ORQALY_BROWSER_ORIGINS`, now
containing the canonical preview origin and `https://preview.orqanix.com`.
Container image `sha256:41ebdaf2cb088912f9e8468640a9417a3c59873b2375425799b337aa7020ed18`,
other configuration, IAM and all eight original tags were preserved; the temporary
test tag was removed. Six checks passed: readiness 200, both allowed origins 204
with exact CORS headers, an untrusted origin 403 without an allow-origin header,
and unsigned web/desktop sessions 401. No worker, web image, API address,
desktop OAuth issuer or production setting changed.

Sanitized receipt: `artifacts/preview-domain-sep14/api-origin-final.json`.
Receipt SHA256: `bed32ef4c398ec00fd198290295669f38234c6738e0d05c09ac2a3bb818ce169`.

At **15:12:16 UTC**, Cloud Run reported `DomainRoutable=True` but
`CertificateProvisioned=Unknown` / `CertificatePending`. Normal HTTPS still
failed its TLS handshake; certificate validation was not bypassed. DNS is correct
and no restrictive apex CAA record was found. Leave DNS and mapping intact while
Google provisions the certificate; do not recreate them to force a retry.

Remaining: verify real HTTPS sign-in and desktop Goal attachment once TLS is
ready. The existing `workspace-final-sep14` app remains open. Its attempted
restart was blocked by the safety reviewer to protect possible unsaved state;
no workaround was used and the domain-enabled package has not been launched.
The earlier canonical-URL E2E acceptance remains valid historical evidence,
not proof that the new hostname is ready.

The local Clerk CLI is authenticated to a different account and this repository
is not linked there. Its account, linkage, keys and configuration were left
untouched; no production Clerk migration is part of this preview change.

## Repository collaborator request

The requested spelling `misters.builder` returned GitHub 404. The user confirmed
the existing account `mistersbuilder`. Its monorepo write access was already
present and unchanged. A **write** invitation was sent for private repository
`vitalyvishnevsky/orqaly-goose` and verified as pending: invitation `333016764`.
The recipient must accept before desktop repository access becomes active.
Neither repository was made public and no administrative role was granted.
