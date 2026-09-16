# Orqanix preview rebrand — 15 September 2026

Public brand: **Orqanix**, pronounced **or-KAN-iks** (`/ɔːrˈkæn.ɪks/`). The website includes one small pronunciation tip. Orqaly and AxWise remain internal service and repository identifiers. Goose retains its attribution and licenses.

## Implemented

- A light homepage with an HTML local/cloud diagram: request and optional files → desktop/workspace → authenticated gateway → Gemini and research on demand → useful outputs beside the conversation.
- A casual operations example in the existing interactive desktop-style demo. All five examples and document controls remain. Example content is labelled; it is not represented as a new live integration run.
- Customer-facing website navigation, account headings and desktop product messages use Orqanix. The desktop writing indicator uses “Orqanix is writing…”.
- Selected context and tool results can reach the cloud; the page does not claim automatic synchronization of all local files or history.
- Connector callback, research-tool display titles and errors use the new name. Transport IDs, authentication scopes, endpoints, schema identifiers and local profile paths remain compatible.

## Source and verification

- Private monorepo branch: `codex/universal-agentic-foundation`.
- Connector commit: `133167ce320dd5712208d2b50ff4cce7b9067db2` (23 tests passed).
- Website and API product guidance: `dbacf32cfa36ebaee9ddaf627b764e77eef14499`.
- Retained web/workflow checks: 714 passing tests; homepage/demo checks: 19 passing tests. API/context/auth checks: 26 passing tests. Scoped lint passed.
- Local production web build passed the existing budget: 32 scripts, 1,309,294 bytes. Budget was not increased.
- Browser checks: light homepage and embedded sign-in render; desktop/mobile diagram works; mobile document opens with viewport/scroll width both 390 pixels. An unrelated browser-extension console error was distinguished from application errors.
- Existing AxWise technical website/blog changes were left untouched.

## Sign-in branding

The dedicated development OAuth application `oa_3JHK4xBTEeLxNaUEkyYsp6ntLDO` was renamed from “Orqaly Goose Preview” to “Orqanix Preview”. Client ID, callback, scopes and public-client status were confirmed unchanged. Embedded preview login headings use local Clerk localization; no login method or access rule was changed.

The shared Clerk application name also affects AxWise production hosted sign-in pages. Its rename requires the user's separate choice; no shared application rename had been performed when this record was created.

## Publication status

The API product-guidance change is live at 100% on `orqaly-v2-api-preview-brand-dbacf32c-mu2d5orj`, built from `dbacf32c` by Cloud Build `c8d6a7c3-b95d-4704-ae73-0955c5653256`. Image digest: `33eb3bdb489db9167b3142f2631338e6c5233c98df362e0c5c3313baa78a9fec`. Readiness, existing-origin CORS, untrusted-origin rejection and unauthenticated session rejection passed. Eight original API traffic tags, service settings/IAM, other services and DNS were preserved. Receipt `api-live.json` SHA-256: `2bed339bf3c00baa11af9eeebec2cff6693156d2b61477b027a93b40dcdf6e6e`.

Native acceptance of the final `out/orqanix-workspace-release-sep15` package confirmed the Orqanix window/menu identity, existing connected account, Gemini model label, 1M context display and preserved conversation `20260914_1`, including the user's September 15 messages. The earlier remaining research heading was corrected: the final workspace shows “Research on demand”, “Research”, and “Documents & results”. A saved cloud brief opened successfully through the authenticated, newly deployed API. Historical conversation text was not rewritten. No new model generation was required for this display-only release.

Desktop source commit: `80fc747917c75072ac5cf889479d14be04eae57d`, private `orqaly-goose` repository, branch `codex/desktop-foundation`. Final ZIP: 256,903,025 bytes; SHA-256 `2eed72bce8b7c30442f5f8691c4585c13140264ffe16aad361ec14ba89c7e7d9`. It remains an unsigned, non-notarized macOS Apple Silicon preview, based on Goose 1.50.0. The packaged runtime and 84-source-file provenance were verified against that exact commit and recorded separately in the desktop repository; upstream Goose binary, bundle ID, protocol and existing profile location remain compatible. Earlier local candidates were not published.

The final installer is published at [Download Orqanix Preview](https://storage.googleapis.com/orqaly-preview-downloads-161074549006/releases/2026-09-15-80fc74791/Orqanix-Preview-macOS-arm64.zip). The `.sha256` URL publishes its checksum. A full anonymous download returned 200, the exact expected bytes/hash and a valid ZIP; attachment metadata names the file Orqanix. Old release object generations and bucket IAM remain unchanged; anonymous listing is still denied.

The website is live at [preview.orqanix.com](https://preview.orqanix.com), 100% on `orqaly-v2-web-preview-brand-77a8a4bb-mu2dky13`, built from source `77a8a4bb600586cf63cd6d81f5594ee3bed3456d` by Cloud Build `cce59706-900d-4001-96d0-d6486239db84`. Image digest: `33b285144a71e5ce6b1f3b2c403fc8b5a183b2d865dca3d5a5068f6b6bec3583`. Staged browser review passed the light design, operations example, document interaction, pronunciation tip and correct installer URL. The public domain returned the same HTML hash with CSP present. Five original web traffic tags, settings/IAM, other services and DNS were preserved; temporary staging tags were removed.

Final Chrome button check: the live link correctly targets the published ZIP, but the automated click displayed `ERR_BLOCKED_BY_CLIENT` (“This page has been blocked by Chrome”) and did not produce a local download. No browser protection was bypassed or disabled. This is not recorded as a successful browser-download test. A manual click was requested from the user; its result is pending. The separately completed full anonymous download/integrity check remains valid evidence that the published object is available.

Receipt hashes: `web-live.json` = `987de1357e8d191ee71cb2542483d2f1f86adeadd1e94626b6410535d0275484`; `download/published.json` = `969abe2d40ee08d39cd2e270c406586ca8ae45c8fe2798d8190dcf41e5c9ead9`. The previously published September 14 installer remains immutable and available. Cloud release and download receipts are retained locally under `artifacts/orqanix-brand-sep15/`.

Remaining user choices/checks: confirm the manual Chrome download and decide whether to rename the shared Clerk hosted-sign-in application name (which also affects AxWise production headings). No authentication-policy, DNS, worker or repository-visibility change is needed for this release.
