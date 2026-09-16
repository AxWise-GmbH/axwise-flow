# Simplified preview homepage — 14 September 2026

Deployment status: deployed and verified on `https://preview.orqanix.com/`.
The new web revision serves 100% of default preview traffic. Cloud checks passed
at 16:21:52 UTC, followed by real custom-domain browser acceptance.

Source: `d956a930691d2d4544400db1a7e867939dcf6ac9`, pushed to the private
monorepo branch `codex/universal-agentic-foundation`.

## Scope

The GCP public homepage reuses the simplified landing page: a short local/cloud
explanation, a five-case interactive carousel, and the existing preview entry
point. Examples cover local development, n8n workflows, business operations,
role-based copilots, and chat. The illustrations use native interface elements,
not screenshots or live customer records. Cloud context is distinguished from
automatic local-file/chat synchronization. The longer landing components remain
in source; authenticated product routes and backend behavior are unchanged.

## Pre-deployment checks

- 65 focused page, carousel and route tests passed.
- Scoped ESLint and Git whitespace checks passed.
- Local GCP build and the retained release verifier passed: 32 scripts,
  1,296,984 JavaScript bytes, within the unchanged 1,360,000-byte ceiling.
- Real Chrome checks covered all five scenes, previous/next and keyboard
  navigation, the primary action reaching sign-in, and the 390px mobile layout
  without horizontal overflow. No new model calls were made.

The requested deployment targets only `orqaly-v2-web-preview` in
`axwise-v2-preview-001`, `europe-west4`. API, workers, DNS, IAM, authentication
configuration, production, and the desktop package are outside this change.

## Cloud release

- Cloud Build `490567e8-254d-414d-bbcb-adcd99f7da9e` completed successfully from
  the clean committed `apps/orqaly` source archive, retaining the original Docker
  ignore file, canonical preview API address, and pinned Clerk publishable-key
  version 1. No private key was read locally or added to the browser.
- Image: `europe-west4-docker.pkg.dev/axwise-v2-preview-001/workflow-v2-preview/orqaly-web@sha256:19a6dcf9bd47a020961beda1257c42bf96becb5debd39191a94ca4d59a2a1d16`.
- Candidate revision: `orqaly-v2-web-preview-simplepage-d956a930-mu1fztt9`.
- The staged page rendered the intended homepage and switched all five scenes.
  Its primary action reached the existing sign-in page. No application error
  was observed; the existing Clerk development-mode notice remained.
- Staging preserved the original five traffic tags, web configuration, scaling
  and IAM. All four backend/worker service snapshots and the domain mapping
  matched the pre-release baseline.
- Previous web revision retained for rollback:
  `orqaly-v2-web-preview-workspace-5eebb3c8`.

Sanitized local receipts: `artifacts/preview-simple-site-sep14/baseline.json`,
`build.json`, `staged.json`, and `live.json`.

## Live acceptance

The custom domain and canonical Cloud Run address returned HTTPS 200 with the
new page and matching HTML content. The existing security headers remained.
Chrome showed the new hero, local/cloud explanation and use-case carousel;
changing the selected use case updated the displayed workflow illustration.
The primary action opened the existing authenticated Goals workspace.

Saved Goal `c5399f08-d34a-5a00-8afe-022bb2d6705b` still loaded all nine artifact
metadata entries, the desktop-copy action, and the final webhook design with
SHA-256 `9358908c05b0b0489eb232640e96386c329cfedadeeb04abf0039e461d1744e7`.
No new Goal, generation, research request, or desktop rebuild was started.

Only the web image and its traffic target changed. Web configuration, scaling,
IAM, the original five tags, all four backend/worker service snapshots, and the
domain/TLS mapping were preserved. Production and the apex/www records were
not changed. This is a homepage deployment, not new integration acceptance.

The temporary staging tag was removed at 16:23:14 UTC; the five original tags
and the new revision's 100% traffic remained intact. Final local `live.json`
receipt SHA-256: `0504c230609f4a8cdf57d5ca99e88d9ae7ffeefd4781444116ea036351f5096b`.
