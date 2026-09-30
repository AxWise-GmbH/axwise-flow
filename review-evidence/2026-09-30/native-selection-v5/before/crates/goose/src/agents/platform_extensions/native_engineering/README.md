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

When this host-mounted extension is active, both Goose loops use selection policy v3.
The shared extension-info builder replaces the developer extension's blanket
write/edit preference with task-based native guidance; removing the extension
restores the original guidance on the next turn. AST serves structural search,
LSP semantic navigation, and hashline reads guard edits that need snapshot protection. Simple unique changes may use ordinary edit. Ordinary
text/path search and new-file writes remain available. Instructions list only
host-configured LSP language names, never server commands, and distinguish
configuration from a successful query. Code Mode carries this host-owned native
policy separately because its normal extension-instruction block is omitted;
other extension descriptions remain discovery metadata.

Read relevant context before editing; reuse snapshots while unchanged. A stale digest or anchor is a
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

## Semantic query shortcuts

`ast_search` accepts either a raw `query` or a built-in `preset` (`functions`, `classes`, `calls`). An optional exact `name` filters captured names before result limits. Presets reuse the bundled grammars, return bounded syntax snippets and zero-based UTF-16 positions, and share full file hashes in a `files` map. Call presets match terminal syntactic names, including member calls; they do not resolve bindings or aliases. Raw-query output remains compatible.

For a known declaration, `lsp_query` accepts `symbol` instead of `line`/`character` for references, definitions or hover. Qualified names such as `Client.send` disambiguate nested declarations. Resolution uses the server's exact selection range; ambiguous names and flat outlines without an exact name position return explicit errors, never a guessed binding. No extra model turn is needed for successful lookup. Servers remain lazy and reused.

Named references/definitions return pages of 40 compact locations, bounded saved-line context and per-file hashes. Follow `next_offset`; each page re-queries current state. External, unavailable or symlinked targets are not read. Context and references are not an atomic project snapshot. Explicit-position queries keep their existing raw response format. Regular compiler/tests remain the correctness gate; diagnostics are not a mandatory extra step.

### Project scope and recipe validation

LSP references describe the language server's project graph, not every file under the workspace directory. In particular, a TypeScript inferred project without an appropriate tsconfig/jsconfig may omit unopened consumer files. A completed request is not evidence of complete workspace coverage. Validate changes with project tests/typechecking and use ordinary search when project coverage is uncertain.

The self-test recipe supplies its own extension list, overriding profile defaults. Host-enable this optional extension explicitly when validating it:

```sh
goose run --with-builtin native_engineering --recipe goose-self-test.yaml --params test_phases=native-engineering
```

The host must also supply its pinned language-server configuration. This command is functional validation, not a performance benchmark.


## Native operations v4

The host still mounts exactly four tools under the existing feature flag. Ordinary developer instructions are preserved. No OMP process or extra model performs these operations.

`lsp_query` adds read-only `action=rename` with `path`, `symbol` (or a position), `new_name`, and optional `scope` directory. Every nonignored language file in that bounded directory is synchronized before requesting the language server's WorkspaceEdit. The complete preview and opaque `plan_id` contain all proposed text edits. Up to 32 language files/8 MiB are supported; excessive enumeration, unsupported resource operations/annotations, out-of-scope edits, malformed/overlapping UTF-16 ranges and excessive previews fail explicitly. Scope coverage does not prove project coverage outside that directory. The model must inspect wire keys and request constraints; compiler/tests remain necessary. Server-initiated workspace/applyEdit stays rejected.

`hashline_edit` reads now return compact `L<number>` anchors and a session/workspace-bound `snapshot_id`. Full SHA-256 and legacy anchors remain accepted for compatibility; compact anchors are validated only with an exact full preimage guard. The bounded store retains up to 128 entries/16 MiB for ten minutes, with eviction. Single reads return at most 16 KiB of line data, batched reads 64 KiB; whole oversized lines are omitted with explicit pagination. `edit_many` accepts `files`, each containing its path, snapshot_id (or expected_sha256) and anchored edits.

`safe_edit_and_test` accepts exactly one of the existing single-file fields, a `files` batch, or a reviewed rename `plan_id`, plus explicit literal test_command argv. Plans are consumed once. Scope topology, ancestor configs/ignores and all captured inputs are rechecked. All target guards/ranges/unique paths are validated and locks acquired in stable order before publication. Tests run after the complete batch. Failure, timeout, cancellation or dropped futures roll back only files still equal to owned postimages; intervening changes are preserved with explicit receipts. Scope inputs are checked again after verification.

Multi-file publication is not a filesystem-wide atomic transaction. Advisory locks coordinate cooperating processes and cannot eliminate races with arbitrary external writers. Tests may change unowned files; rollback does not undo those effects. Commands retain normal permission handling and Unix process-tree containment.
