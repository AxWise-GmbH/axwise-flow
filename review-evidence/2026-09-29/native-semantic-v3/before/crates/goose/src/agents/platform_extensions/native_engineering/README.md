# Native engineering in Goose

The host mounts the hidden `native_engineering` platform extension when the
desktop's **Native engineering tools** setting (`nativeGemsEnabled`) is enabled.
It is off by default. Saved post-reset `ompEnabled` choices migrate to the new
setting. The extension runs in the current Goose conversation and uses its
working directory, permission checks, cancellation and primary model. There is
no nested agent or OMP process. Model-side extension management cannot enable it.

| Tool | Behavior |
| --- | --- |
| `ast_search` | Runs a real Tree-sitter query against saved workspace files; returns captures, ranges, snippets and file hashes. Directory searches require a language and respect ignore rules. |
| `lsp_query` | Uses an installed stdio language server for symbols, definitions, references, hover or diagnostics. Positions are zero-based UTF-16, as specified by LSP. |
| `hashline_edit` | `action: "read"` returns the whole-file SHA-256 and per-line anchors. `action: "read_many"` gathers up to 16 independent snapshots, with a 256 KiB combined line-data limit and per-file errors/pagination. `action: "edit"` requires that digest and exact boundary anchors before applying ranges to one file. |
| `safe_edit_and_test` | Applies the same guarded edit, runs literal `test_command` argv in the workspace, and returns the exit status and captured output. A failed, timed out or cancelled test rolls back only if the edited file still matches the tool's postimage. |

When this host-mounted extension is active, both Goose loops use selection policy v2.
The shared extension-info builder replaces the developer extension's blanket
write/edit preference with task-based native guidance; removing the extension
restores the original guidance on the next turn. AST serves structural search,
LSP semantic navigation, and hashline reads guard existing-file edits. Ordinary
text/path search and new-file writes remain available. Instructions list only
host-configured LSP language names, never server commands, and distinguish
configuration from a successful query. Code Mode carries this host-owned native
policy separately because its normal extension-instruction block is omitted;
other extension descriptions remain discovery metadata.

Read the current file before every edit attempt. A stale digest or anchor is a
failure, not permission to guess a replacement. After a failed test, the same
Goose agent can inspect the result and choose another edit. A successful receipt
only establishes that the supplied command succeeded; it is not an independent
review of test quality or a remote JEV engineering review. JEV routing decisions
remain separate.

## Language servers

Desktop packaging includes pinned TypeScript/JavaScript and Python servers and
passes verified absolute commands through `GOOSE_NATIVE_LSP_SERVERS`. A CLI host
can set this variable to a JSON object mapping language names to argv arrays:

```json
{"python":["/trusted/node","/trusted/pyright/langserver.index.js","--stdio"]}
```

Without an override, the CLI searches the trusted host PATH for the known server
name. Missing servers produce an explicit error; queries never install servers.
The model cannot supply executables. TypeScript uses the trusted TypeScript
installation beside its language server. Workspace plugins, automatic type
downloads, Rust build scripts and procedural macros are disabled. LSP requests
to apply edits or execute commands are rejected.

Sessions are cached by canonical workspace and language. Open documents are
resynchronized from disk before queries. Unversioned diagnostics explicitly
report `versionVerified: false`; absent diagnostics are not proof of a clean
workspace. Syntax grammars cover more languages than the bundled language
servers; other LSP languages need host-provided servers.

## Boundaries

Paths must resolve to existing regular workspace paths without symlink
traversal. Hash edits accept UTF-8 files up to 1 MiB and preserve file modes.
AST scans and LSP frames, file reads, output, time and result counts are bounded.
The test timeout is 1–600 seconds (60 by default). Tests use Unix process groups
for cancellation; compound edit/test currently fails before editing on Windows.

Locks coordinate native edit calls and rollback preserves detected external
changes. These checks are not an operating-system sandbox or an absolute atomic
compare-and-swap against unrelated external writers. Explicit test commands
have the same practical local authority as other approved Goose commands.

The offline integration test covers extension mounting/removal and both Goose
agent loops, including denied and cancelled edits. The ignored
`real_bundled_language_servers_smoke` test additionally uses the runtime named
by `GOOSE_REAL_LSP_RUNTIME` for genuine TypeScript/Python protocol checks.

Successful edits return `post_edit`: up to 64 lines / 16 KiB of changed-region context,
with a full postimage digest and fresh anchors. Check `changed_context_truncated` and
`has_more`; use single-file pagination for missing ranges. Failed safe edits return no
post-edit snapshot. Batch reads do not create a shared filesystem transaction, and
all subsequent writes still check each complete preimage. Reuse snapshots and checks
when applicable; no tool skips validation or automatically caches test success.
