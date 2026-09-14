# Branded desktop and faithful website demo — 14 September 2026

The HTML desktop demo and public download buttons are live at
https://preview.orqanix.com/#download. The branded installer is publicly
downloadable; app sign-in remains required. Both source repositories stay private.
Full anonymous download and website-button download checks passed.

## Initial interactive-demo website release

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

## Public download release

[Installer ZIP](https://storage.googleapis.com/orqaly-preview-downloads-161074549006/releases/2026-09-14-cd7bc74b8/Orqaly-Preview-macOS-arm64.zip)
and [SHA-256 checksum](https://storage.googleapis.com/orqaly-preview-downloads-161074549006/releases/2026-09-14-cd7bc74b8/Orqaly-Preview-macOS-arm64.zip.sha256)
are available without login. This does not grant app/model access: an anonymous
GET to the unchanged desktop `/desktop/v1/session` endpoint returned 401
`UNAUTHENTICATED` after publication. No new model call or app build was made.

- Website source: `c3d66c3ba651e9c14545e97df79322dbe844627d`, pushed to the private monorepo.
- 74 focused tests and scoped ESLint passed. Retained GCP verifier passed with
  32 scripts and 1,306,868 JavaScript bytes under the unchanged ceiling.
- Cloud Build: `4ccaab5d-6cf1-46a8-a60f-b5ebaec26a90`.
- Live web revision: `orqaly-v2-web-preview-download-c3d66c3b-mu1khqyw`, 100% traffic.
- Image digest: `sha256:3062d35b9ae6220995e8b243732be3043e319a0782f7c9e40728a1de5667b530`.
- Previous revision retained for rollback: `orqaly-v2-web-preview-desktopdemo-b86e9e36-mu1hprxm`.
- Real Chrome verified the staged download section and triggered its download.
  The downloaded file in Downloads is 256,916,482 bytes and matches the published
  SHA-256. The same page and download links were verified on the live custom domain.
- Separate anonymous full download returned HTTP 200, matched the source and
  public checksum, and passed ZIP integrity. ZIP content type and attachment
  filename are correct. Anonymous bucket listing remains 403.
- Web settings, original five tags, all four API/worker services, application
  authentication and domain mapping remained unchanged during the web release.

Only the dedicated downloads bucket is publicly readable. The approved sharing
exception is a new policy on preview project `161074549006`, not an edit to the
organization policy. It permits sharing only when the resource has
`tagKeys/281479634974898` / `tagValues/281477159239033`, attached only to the
downloads bucket. Untagged resources retain the exact `C033e6mlq` restriction.
The existing private artifact and Cloud Build buckets retain enforced public
access prevention, uniform access, no exception tag and no anonymous IAM grant.
OrgPolicy and Cloud Resource Manager APIs were enabled in the preview project
as required prerequisites. No signing keys or broad IAM self-grants were created.

Maintenance: never attach the exception tag to another resource or put private
files in the downloads bucket; future objects there are publicly readable.
The project override pins the current domain-policy fallback, so future parent
policy changes must be reviewed and reflected here. Rollback removes the new
public bucket binding first, restores project policy inheritance after verifying
the recorded policy/etag, then removes only the dedicated bucket tag binding.

Receipts and rollback baseline: `artifacts/preview-public-download-sep14/`.
Publication receipt SHA-256:
`b1606faaefb473debc7fa6f061690547c3cf12282248979032f2c87276dede68`.

### Historical upload blockers (resolved by the approved exception above)

The exact ZIP and its checksum are now uploaded to the newly created
`orqaly-preview-downloads-161074549006` bucket, under
`releases/2026-09-14-cd7bc74b8/Orqaly-Preview-macOS-arm64.zip` and `.zip.sha256`.
They have immutable cache metadata, the correct ZIP content type and download
filename. Object generations are `1789406168303829` and `1789406103307967`.
Source checksum and size matched; only these two objects exist in the bucket.

Initially, the anonymous read grant was rejected by the safety review because bucket-level
access also covers future objects. The supported exact-object ACL alternative
was rejected by GCP's existing `constraints/storage.uniformBucketLevelAccess`
policy. IAM Conditions do not support `allUsers`. No organization/project policy
was weakened. Bucket uniform access remains enabled; public-access prevention
is inherited; no anonymous grant exists. Anonymous installer HEAD returns 403.

The user subsequently authorized public get-only access to this dedicated bucket,
including future objects. Safety review accepted the grant, but GCP rejected it
with HTTP 412: policy members do not belong to a permitted customer. Effective
`iam.allowedPolicyMemberDomains` permits only Workspace customer `C033e6mlq`,
inherited from organization `150415609495`; no project override is present.
The separate managed allowlist constraint is not enforcing another restriction.
No organization policy, public IAM grant, or service configuration changed.

The next step required new authority: a tag-scoped domain-restriction exception limited to the
downloads bucket, preserving the existing rule for other resources. Google's
documented alternative is a fixed download route issuing short-lived signed
URLs, which requires additional backend work and scoped signing permissions.
At that checkpoint, neither remedy had been implemented and deployment was held
to avoid exposing a broken link. The approved exception and successful release
are recorded above; the original blocked receipts remain intact.
Local receipt: `artifacts/preview-public-download-sep14/publication-receipt.json`.
Latest diagnosis: `artifacts/preview-public-download-sep14/blocked-after-public-approval.json`.

The prepared website had primary macOS download buttons, a navigation anchor,
platform/sign-in/unsigned-preview details and checksum link. Local tests, build
and 390px browser layout checks passed before the now-completed deployment.
