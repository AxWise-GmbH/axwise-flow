# AxWise for Codex

Plugin **0.1.1** packages Rust AxWise **0.5.2** for **Apple Silicon macOS**.
It uses your existing Codex model access. The installed plugin requires no
Python, Node.js, Rust build tools or separate AxWise login.

## Public release installation

With a Codex client supporting plugin marketplaces (0.159.3 was tested):

```sh
codex plugin marketplace add AxWise-GmbH/axwise-flow --ref axwise-codex-v0.1.1
codex plugin add axwise@axwise
```

Start a new chat with AxWise enabled and ask for the complete discovery-to-PRD
flow. The pinned release includes the executable and skill; no build or download
hook runs on installation. GitHub marketplace distribution is separate from
OpenAI's built-in directory. This release supports local Codex on Apple Silicon
Macs; other platforms still need verified builds. The executable is ad-hoc
signed and is not Apple notarized.

The [release download](https://github.com/AxWise-GmbH/axwise-flow/releases/tag/axwise-codex-v0.1.1)
also includes a ZIP marketplace and SHA-256 checksum. Extract it, run
`codex plugin marketplace add .` from that folder, then install `axwise@axwise`.
For help, use [the public issue tracker](https://github.com/AxWise-GmbH/axwise-flow/issues).

## Build and test the source

The plugin source is `axwise/`. The custom local marketplace is rooted in this
directory, with `.agents/plugins/marketplace.json` selecting `./axwise`.

Build using the verified Apple Silicon macOS executable from AxWise Rust 0.5.2:

```sh
node build.mjs /absolute/path/axwise-native-darwin-arm64-v0.5.2/bin/axwise
node --test plugin.test.mjs
codex plugin marketplace add /absolute/path/to/packages/axwise-distribution/codex
codex plugin add axwise@axwise
```

Node is needed only for these build/test helpers, not for the installed plugin.
The build generates synchronized portable/compatibility MCP configurations and
manifests, copies the exact hash-verified binary and license, reuses the website
icon, and exports one self-contained archive under `dist/axwise-codex-plugin/`.
It never exports the private repository or saved demo artifacts.

After installation, run the live acceptance check with the existing Codex login:

```sh
node verify-installed.mjs /absolute/path/to/check-output
```

This starts an ephemeral Codex session with only the registered AxWise plugin,
executes scope → personas → simulations → analysis → PRD using ordinary MCP
calls, and verifies the completed native files. It does not create a temporary
bridge. Its example uses generated interview inputs and is not market research.
The report distinguishes actual completed receipts from successful-looking
tool-call statuses. See [the engineering map](ENGINEERING.md) for boundaries.

To check the existing user configuration after activation without repeating
the entire flow:

```sh
node verify-installed.mjs /absolute/path/to/default-check --default-config --scope-only
```

The internal MCP server is named `axwise-rust` so an obsolete disabled
`mcp_servers.axwise` entry cannot shadow its tools. The visible plugin remains
**AxWise**. Use the actual advertised tool namespace; it publishes tools rather
than resource lists.

Enable **AxWise** in Codex and start a new chat. The plugin exposes eight
specialist tools plus `advance_artifact`, and loads the `axwise` workflow skill.
An earlier separately registered `axwise-local`/`axwise` MCP server is not this
plugin. Disable obsolete duplicates after verifying the new route. Never
remove saved legacy state as part of plugin installation.

`node activate.mjs --dry-run` previews retirement of the obsolete separate
`axwise-local` server. `node activate.mjs` disables just that server with an
atomic config update and a private backup. It preserves all unrelated settings,
credentials, per-tool policies and saved legacy files.

For updates, edit this source, rebuild, and reinstall from the marketplace.
Do not edit `~/.codex/plugins/cache/` directly. Engine and plugin versions are
separate: plugin 0.1.1 bundles unchanged engine 0.5.2. Other operating systems
need their own verified binary edition. Account upload and public-directory
submission are separate from this local installation.

The package uses the [official plugin structure and local marketplace format](https://developers.openai.com/plugins/build/plugins).

See [public distribution requirements](PUBLICATION.md) for the allowlisted
marketplace exporter and the separate built-in-directory prerequisites.
