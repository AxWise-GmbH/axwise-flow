# Branded desktop and faithful website demo — 14 September 2026

The updated HTML desktop demo is live at https://preview.orqanix.com/.
The newly branded desktop package is built, launched and checked locally, but
its installer has not been published. The public-versus-signed-in download
choice is awaiting the user; neither private repository's visibility changed.

## Website

The five-case carousel now reproduces the light desktop interface in HTML/CSS:
sidebar, chat composer, tool activity, floating Workspace and clickable artifacts.
A user-controlled cursor walkthrough supports pause/resume/replay and reduced
motion. Example content is labelled once. The demo makes no model or tool calls.
Mobile uses chat-first layout with a floating document panel. Browser QA found
and fixed an inherited grid position that collapsed the mobile panel's width.

- Source commit: `b86e9e3609ccd9e8118f78308ad189bc7e2dccf6`, pushed to the private
  `vitalyvishnevsky/axwise-flow-oss` branch `codex/universal-agentic-foundation`.
- 73 page, carousel, interaction and route tests passed; scoped ESLint passed.
- GCP build verifier passed: 32 scripts, 1,305,448 JavaScript bytes, below the
  unchanged 1,360,000-byte ceiling. No new dependency or UI framework added.
- Real Chrome acceptance covered all five examples, artifact navigation,
  walkthrough completion, mobile layout at 390px without horizontal overflow,
  and the staged primary action reaching existing sign-in.
- Cloud Build: `08a3eec1-a837-43ec-964b-36229e57674a`.
- Live revision: `orqaly-v2-web-preview-desktopdemo-b86e9e36-mu1hprxm`, 100% traffic.
- Image digest: `sha256:e5ca5edf4495125b0bbf584a39d26a3189ee5b5570aed4b18edbc1cd73598261`.
- Custom-domain and canonical-address HTTPS checks returned 200 with matching
  HTML and retained security headers. The live HTML demo also rendered in Chrome.
- Existing web settings, five original traffic tags, API, both AxWise services,
  Orqaly worker, authentication, IAM and domain mapping remained unchanged.
- Previous web revision retained for rollback:
  `orqaly-v2-web-preview-simplepage-d956a930-mu1fztt9`.

Sanitized local release receipts are under `artifacts/preview-desktop-demo-sep14/`.

## Desktop

Private repository: `vitalyvishnevsky/orqaly-goose`, branch
`codex/desktop-foundation`. Branding source commit `cd7bc74b8`; native verification
record `6e7ee9b64`. Both are pushed. The Orqaly line-orb replaces the primary app
icon; sidebar/sign-in and secondary attribution retain "Built on Goose".
Goose and bundled runtime license notices are included. Original Goose assets,
agent behavior, profile isolation, access controls and disabled updater remain.

- New candidate: `ui/desktop/out/workspace-branded-final-sep14/make/zip/darwin/arm64/Orqaly Preview-darwin-arm64-1.50.0.zip`
  in the desktop repository.
- Size: 256,916,482 bytes; SHA256:
  `02fc15a31ad2703e446c71792c8bf9467222117830a4d7e66843f867626011a6`.
- 31 focused checks, TypeScript, scoped ESLint, archive integrity and runtime
  inventory checks passed. Root independently matched all 20 retained source
  hashes and the final ZIP checksum. One generated SVG has a harmless trailing
  blank line; no package rebuild was performed solely for whitespace.
- Native launch showed the new branding, preserved the existing account/chat
  list, and reopened the saved webhook conversation and Workspace. No new model
  request was submitted. The previous package and ZIP remain unchanged.
- No credentials, profile or chat history were copied into the package.
- This is an unsigned, non-notarized macOS Apple Silicon preview, not a signed
  public release or Intel/Windows acceptance.

## Remaining distribution step

Confirm whether the installer should be publicly downloadable or restricted to
signed-in preview users. Public download would still require app sign-in for
cloud/model access. Then publish the immutable ZIP and checksum to an appropriate
downloads-only location, verify a full download, and add the real website link.
Do not open the existing private workflow-artifact or Cloud Build buckets, bundle
the installer into the web image, or expose either source repository.
