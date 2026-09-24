# AxWise extension and Orqanix production cutover — 24 September 2026

## Published source and downloads

- Public extension repository: `AxWise-GmbH/axwise-flow`, main `2243984`.
  Its current tree contains exactly 70 allowlisted files matching
  `SOURCE-MANIFEST.json`; no private repository history was imported. Stars,
  forks and public history are preserved. `legacy-web-2026-09-24` preserves the
  previous web-platform tree at `a4442ac`.
- Public release: `axwise-extension-v0.3.0`, with Python wheel, npm archive,
  source archive, `SHA256SUMS` and `release-manifest.json`. These are direct
  GitHub release installs, not npm/PyPI registry publications.
- Private runtime/distribution implementation: `9d536283`.
- AxWise website: `1daad5cb`, Cloud Build
  `f9617000-5e6a-412d-ae4a-e55788f920af`, image
  `sha256:34cbddaeab37e4dbd3648f2870cff35a8b85ba0f25b5a171973d8da758f7f888`,
  revision `axwise-flow-axwise030-1daad5cb`, 100% traffic. Public download hashes,
  install commands, legal pages, auth redirects and retired routes checked.
  Obsolete frontend environment/secret bindings were removed; secrets, prior
  revisions, IAM and stored data were not deleted.
- Orqanix desktop: 2.3.15, build 5682, desktop repository main `3656b0241`.
  The website links to the publicly verified installer. Managed desktop mode
  uses its frozen bundled specialist and auth adapter; the standalone release
  adds explicit BYOK transport without replacing Goose's tool ownership.

## Verification and limitations

The final public extension passed 219 Python, 85 Node and 9 distribution tests
with no skips. Clean source rebuilds and source-distribution-to-wheel builds
produce identical bytes. All eight MCP tools are discoverable without a key.
Fresh public-URL installations reported AxWise 0.3.0 through both uvx (1.734s)
and npx (2.214s), using isolated caches on macOS Apple Silicon. Linux/Windows
and every possible MCP host/provider are not claimed tested.

A packaged MCP PRD generation/review with explicit `gemini-3.8-flash` completed
in 25.121s plus 0.339s initialization. Generation took 18.246s and review 5.938s;
two calls, no repair, 6,782 input and 1,987 output tokens, saved Markdown/JSON.
All eight model-review checks passed. This is one public synthetic compatibility
sample, not semantic-truth verification or a broad speed/quality benchmark.
Cache-token metrics were not reported. The final artifacts preserve the tested
runtime; subsequent changes were package metadata/example-model documentation.

Live checks caught and corrected Gemini's rejection of `store:false`, generic
OpenAI strict-schema incompatibility, and missing source-archive `PKG-INFO`.
The old example model returned HTTP 404; the example explicitly uses the tested
current Flash model. No automatic model or retrieval fallback was added.

## Authentication

The production website and API use the migrated Orqanix Clerk production
instance. Preview redirects to production. Following the user's failed Google
test, the exact callback `https://clerk.orqanix.com/v1/oauth_callback` was added
to the existing Google client with explicit approval. A fresh click now reaches
Google's normal sign-in screen for orqanix.com without redirect mismatch.
No credentials were entered during verification; completed user login and a
desktop model call remain user-verification items.

The desktop installer is not Apple-notarized. Billing, cloud session sync,
legacy account/artifact migration and broad GCP service retirement were not
implemented. Authenticated model/search/JEV transport remains necessary for
managed desktop access; sign-in alone is not a replacement for that gateway.
