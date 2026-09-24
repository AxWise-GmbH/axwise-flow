# AxWise public extension site

Dependency-free static site for `axwise.de`. It presents AxWise as a scoped local MCP specialist, with Orqanix as the ready-to-use desktop host. No Clerk SDK, private backend code, tracking scripts or model credentials are included. System fonts and a small inline-derived SVG keep the site self-contained.

```sh
cd apps/axwise-site
npm test
npm run build
npm run preview
```

Build/test requires Node 22+. The preview binds only to `127.0.0.1:4319` (override with `PORT`). The production Docker image runs unprivileged nginx on port 8080. `cloudbuild.yaml` is build-only; deployment and domain cutover remain explicit operator actions. Override `_IMAGE` with the intended existing Artifact Registry repository. This site does not provision services, delete the legacy application, migrate accounts or move saved user data.

## Release gate

`release.json` defaults to `published: false`. In that state the site explicitly says the standalone release is in preparation and contains no executable install command or release download link. It still links to the existing public source repository and Orqanix.

After publishing the approved versioned GitHub release, fill both artifacts' exact public URLs, byte counts and SHA-256 values and set `published: true`. The build **downloads both public artifacts and verifies their size and hash** before rendering install commands. It fails closed on a missing artifact, redirected non-GitHub destination or mismatch. There is no production bypass flag. Build-time verification is recorded in the public `release.json`; it is not a guarantee of future link availability.

Both command examples launch the same hybrid extension: `npx` consumes the release `.tgz`; `uvx` consumes the release `.whl`. They do not claim registry publication. Both require Node 22+, Python 3.11+ and uv. The host and user supply provider credentials/configuration. Apache 2.0 licenses the code, not free model inference.

## Existing URLs and legal text

- `/sign-in`, `/sign-up`, `/login`, `/signup` and nested auth routes redirect to `https://orqanix.com/login` without forwarding old auth parameters.
- Known legacy application/dashboard routes return a useful retirement page with HTTP 410; no old auth SDK is loaded.
- `/docs` points to public installation docs; old marketing routes point to examples.
- `/privacy-policy`, `/terms-of-service` and `/impressum` preserve the existing published main-content wording from `frontend/app/<route>/page.tsx`. Only the shared shell and layout are new. Tests compare normalized text against those source files when run in this repository. These are retained documents, not newly approved or updated policies; their legacy service descriptions have deliberately not been rewritten in this task.

## Source and license

Site source follows the repository's Apache-2.0 license. The AxWise hexagon icon is adapted from the existing site's own header mark, and existing legal text is retained. There are no new third-party fonts, artwork or client libraries. The website links to the existing `AxWise-GmbH/axwise-flow` repository; it does not replace its history or stars.
