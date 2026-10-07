# AxWise Codex plugin architecture

Plugin **0.1.1** bundles the unchanged Rust standalone engine **0.5.2**.
Source and private services remain separate; this package contains only the
allowlisted plugin files and the verified public executable.

```text
Codex enables AxWise
  → loads the axwise workflow skill and MCP tool descriptions
  → starts the bundled Rust process in the host workspace
  → chooses a specialist tool for the requested deliverable
  → supplies selected evidence and saved artifact references
  → generates/reviews through the current host model
  → Rust checks schema, domain rules and review
  → Rust renders and verifies accepted storage
  → Codex shows the saved result and passes its reference to the next step
```

| Module | Implementation and boundary |
| --- | --- |
| Plugin discovery | Portable `axwise/plugin.json`; synchronized `.codex-plugin/plugin.json`; registered local marketplace `.agents/plugins/marketplace.json`. Enabling the plugin advertises it; the model still chooses when to use it. |
| Runtime connection | The internal server is `axwise-rust`, avoiding an old disabled `axwise` entry masking plugin tools. Portable `mcp.json` uses contained `./bin/axwise`; legacy `.mcp.json` uses `${PLUGIN_ROOT}/bin/axwise`. Both select `--model-access host`. No hardcoded workspace or fixed conversation session. |
| Invocation workflow | `skills/axwise/SKILL.md` selects the minimal deliverable chain and handles all pending/repair/review states. `references/workflow.md` defines exact cohort, question and finding lineage. |
| Specialist tools | Existing eight Rust deliverable tools plus `advance_artifact`. The plugin adds no aliases, domain reimplementation or local wrapper server. |
| Model/auth | Codex retains login, API keys, model selection and billing. MCP sampling or staged host-chat JSON uses that model. Credentials are not read or embedded by the plugin. |
| Evidence/quality | Existing Rust schema and domain gates validate exact quotes, participant identity, question coverage and PRD finding links; host model reviews each required criterion with a reason. One repair plus fresh review. No independent managed JEV claim. |
| Storage/results | Existing scoped native store, accepted JSON/Markdown files, completed reference and SHA-256. Pending/rejected jobs are not artifacts. No legacy desktop-store migration or deletion. |
| Packaging/install | `build.mjs` verifies the public binary hash, copies it unchanged, synchronizes compatibility files and archives one allowlisted plugin. `codex plugin marketplace add` and `codex plugin add` install it through supported host commands. |
| Acceptance | `plugin.test.mjs` checks actual runtime startup/catalog, pending versus saved results, missing-reference rejection and invalid-candidate repair. `verify-installed.mjs` runs all five stages through the installed Codex plugin and verifies saved JSON hashes. |

The full flow passes accepted scope → saved personas → saved simulations →
saved analysis → PRD. The PRD uses `analysisArtifact`, and every prioritized
requirement links to admitted findings. Generated findings/requirements retain
their structured provenance; no real research is silently replaced.

The portable path restriction is verified by the Codex loader: executable
commands must be bare executable names or contained `./` paths. Compatibility
manifests retain a root placeholder for older hosts; do not put that placeholder
into portable `mcp.json`. CLI `--config` dotted plugin keys are passed without
literal quotes around `axwise@axwise` in the acceptance helper.

This edition targets Apple Silicon macOS and local Codex. Hosting an HTTP MCP
service, public-directory submission, other-platform binaries, cross-chat
artifact lookup, session restoration and managed JEV auditing are separate
work. Automatic restart reconciliation is not added by a plugin manifest.
Existing host approvals remain in control; the live acceptance helper grants
approval only to its isolated AxWise test server for the requested example.

## Public distribution acceptance, 7 October 2026

The public marketplace exporter retains the plugin unchanged. Its ZIP has
14 files: the 12 allowlisted plugin files, root marketplace catalog and download
instructions. The hidden compatibility manifests and executable permission are
included; symlinks, unrelated files and private state are excluded.

The extracted ZIP passed all five actual runtime contract checks, including
boolean annotations on every tool. Installation through `codex plugin add`
succeeded. An ephemeral Codex check using this extracted marketplace completed
a discovery scope through three ordinary AxWise tool calls; accepted storage,
the saved hash and review receipt were verified. This public-package check is
scope-only. The earlier full-chain run below supplies the end-to-end evidence;
it was not repeated as a new full-chain run for this export.

`prepare-public.mjs` emits the public download, checksum and inventory.
`verify-installed.mjs --marketplace-root PATH` selects an extracted marketplace
for a transient acceptance run. Neither helper changes model credentials or
the specialist's domain implementation.

## Local acceptance, 7 October 2026

- Five package/runtime contract tests passed, including the actual nine-tool
  catalog, pending-work admission, reference rejection and candidate repair.
- The installed plugin completed scope → five personas → simulated interviews
  → analysis → PRD through 16 ordinary AxWise tool calls. Every completed JSON
  hash, review receipt and saved reference edge was verified; requirements were
  linked to analysis findings. This full-flow run used isolated plugin settings
  and the existing Codex login.
- After resolving the legacy server-name collision, plugin 0.1.1 also completed
  and saved a discovery scope under the existing user configuration. The check
  retained model/login and AxWise settings, with unrelated services disabled
  transiently. No custom bridge or replacement domain files were used. Helper
  file reads loaded the installed skill; all domain work used AxWise.
- The obsolete separate `axwise-local` server is disabled with a private config
  backup. Its old data and tool-policy configuration are preserved. The old
  cloud `axwise` entry remains disabled. AxWise plugin `axwise@axwise` is enabled.

Reports are in `dist/axwise-codex-plugin/installed-check/verification.json` and
the normal-configuration probe output. These verify local behavior, not public
listing, website deployment, other operating systems or independent model
accuracy. The current chat's tool catalog is fixed; use a fresh chat to load
the newly installed plugin.
