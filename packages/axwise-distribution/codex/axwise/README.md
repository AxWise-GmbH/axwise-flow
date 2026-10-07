# AxWise for Codex

This local plugin bundles **Rust AxWise 0.5.2** for **Apple Silicon macOS** and
the `axwise` workflow skill. It uses the current Codex model through MCP
sampling or host-chat generation/review. No Python, Node runtime, separate
AxWise account or copied subscription credentials are required.

Ask in a new chat with AxWise enabled:

> Use AxWise for the complete flow: scope, five stakeholder personas, simulated
> interviews, analysis and a launch PRD for a ten-week cat-food pilot in three
> Estonia pet shops. Use only AxWise and pass the saved artifacts between steps.

Or supply real transcripts and ask for analysis → PRD. Only explicitly requested
simulations are generated. The tool sequence is `prepare_discovery` →
`generate_personas` → `simulate_interviews` → `analyze_interviews` → `create_prd`.
All pending model stages are completed through `advance_artifact`; every saved
output includes accepted storage, paths, reference and SHA-256.

The skill also covers selected market-evidence synthesis, saved-persona
follow-ups and engineering delivery briefs. It does not retrieve market data,
launch ordinary coding tools or turn every chat into a product workflow.

Storage defaults to `~/.axwise/native/` and is partitioned by workspace and
server session. Do not set a shared fixed session for all chats. A new process
creates a new session; saved files persist, but automatic cross-chat lookup,
pending-job replay and restart recovery are not provided by this package.
See `NATIVE_README.md` for the engine's exact limits. Reviews are host-model
critiques, not independent managed JEV Gate B audits.

Plugin manifests connect the installed `bin/axwise` executable directly to
Codex. There is no temporary bridge, background Python service, download hook
or shell launcher. The executable is the published release binary, checked
against its pinned SHA-256 and copied unchanged. `RUNTIME.json` records it.

Local installation is supported. This edition is not a public-directory,
web/mobile or cross-platform release. Refresh/reinstall after editing the
marketplace source; do not modify Codex's installed cache directly.
