# Orqanix preview hostname — 14 September 2026

Status: domain ownership verified, managed HTTPS active, and the bounded
new-domain web-to-desktop handoff passed. The user confirmed `orqanix.com`;
the live preview web hostname is
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

Size: 255,377,806 bytes. This package was launched and accepted against the new
live hostname. It remains local, unsigned and not published as a GitHub release.
Prior packages remain intact.

## Live configuration and accepted handoff

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

Google's managed certificate finished provisioning without further DNS changes.
Cloud Run records `Ready=True` and `CertificateProvisioned=True` from
**15:21:56.343 UTC**. An independent check at **15:35:04 UTC** returned HTTP 200
from the new Goals URL with normal TLS validation (`ssl_verify_result=0`).
All six API readiness/CORS/auth checks still passed. The earlier certificate
delay is resolved; certificate validation was never bypassed.

The real browser-to-desktop handoff then passed:

- Chrome completed the normal Google/Clerk sign-in using the same existing
  preview account and returned to the requested saved Goal on the new domain.
  Google's first consent submission hit an XHR transport error; one normal page
  reload and retry succeeded. No authentication configuration was changed.
- The existing canonical preview also loaded the same saved Goal and final
  artifact, confirming the old origin remained usable.
- After the user explicitly approved the restart, the old app was inspected as
  idle with an empty composer, closed normally, and the prepared
  `workspace-domain-sep14` app was launched. Login, profile and chats were retained.
- The actual **Copy Goal link for desktop** button produced
  `https://preview.orqanix.com/goals?section=goals&run=c5399f08-d34a-5a00-8afe-022bb2d6705b`.
  That clipboard value was pasted into Project context in synthetic conversation
  `20260914_2` (Node.js runtime check) and accepted by **Use in this chat**.
- All nine saved Goal artifacts appeared. Opening the final document rendered
  the expected webhook design in the right-hand desktop panel, with matching
  SHA-256 `9358908c05b0b0489eb232640e96386c329cfedadeeb04abf0039e461d1744e7`.
- Returning to original conversation `20260914_1` preserved its selected Goal,
  completed research, native `webhook-prototype` skill evidence and historical
  29-test result. It was left idle with an empty composer. The certificate/handoff
  follow-up was paused after successful verification.

This is a bounded domain/authentication/context/artifact acceptance, not a new
generation or content-quality benchmark. No model call, research operation,
implementation test run or production deployment was started. The earlier
canonical-URL implementation/research/29-test acceptance remains historical
evidence. Distribution remains an unsigned macOS Apple Silicon preview.

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
