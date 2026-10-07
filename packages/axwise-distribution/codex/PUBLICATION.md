# AxWise public distribution

Plugin 0.1.1 bundles the released Rust engine 0.5.2 for Apple Silicon macOS.
Public download/Git distribution and the built-in OpenAI directory are separate
release paths. Publishing a repository does not create a directory listing.

## Public Codex release

`prepare-public.mjs` exports only the allowlisted plugin files, a standalone
marketplace catalog and installation instructions. It verifies the binary
against the public Rust release hash. No private repository, saved artifacts,
test logs, environment files or credentials are included. Node is a packaging
dependency only; the installed package starts Rust directly.

```sh
node prepare-public.mjs
```

The output is `dist/axwise-codex-plugin/axwise-codex-marketplace-v0.1.1-darwin-arm64.zip`
with an adjacent SHA-256 file and an inventory report. This ZIP is a download
for local installation; it is not a directory-submission ZIP.

Before publishing, inspect the archive, extract it into a fresh directory,
install it through the Codex marketplace commands, and test actual startup,
tool discovery and accepted storage. Keep the same executable hash in the Git
marketplace, download and runtime provenance file. Include `bin/axwise` in the
public release tree: a Git marketplace cannot run the source's build helper
automatically, and its download must be usable without Node or Rust tooling.

This release requires a Codex client supporting plugin marketplaces. Version
0.159.3 was tested. Other operating systems and Intel Macs require verified
executables and acceptance runs before being claimed as supported. The current
macOS binary is ad-hoc signed, not Apple notarized.

## OpenAI directory preparation

The [official package guide](https://developers.openai.com/plugins/build/plugins)
requires a public HTTPS MCP endpoint for public submission, or an arrangement
with OpenAI for local MCP support. The current server uses stdio on the user's
computer. Uploading or repacking it does not host a server. Do not replace its
current-model access or local storage silently to make it appear eligible.

Directory submission remains incomplete. It needs a supported connection path,
the intended verified publisher, country targeting, payment declaration, four
verified listing URLs, square PNG icons, five positive/three negative review
cases and a reviewer-accessible recording. The current website source's legal pages
use “AxWise UG (in formation)” while the package author is “AxWise GmbH”; the
authorized publisher must resolve that identity before submission. Existing
portal/API policies also need explicit review for this local host-model plugin.

After preparation, upload creates a draft. Required scans, authorized developer
attestations and review come before publishing an approved directory release.
No draft, submission or approval is claimed by these build scripts.

## Verified package checks

On 7 October 2026, the extracted public ZIP passed the five runtime contract
checks, installed successfully through Codex, and completed a saved discovery
scope through its ordinary tools. The binary digest matched the released Rust
0.5.2 executable. This check does not establish directory eligibility, support
for another platform, or a new full-chain acceptance run; see ENGINEERING.md.
