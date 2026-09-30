# Native tool selection — implemented and Rust rebuilt

The changes are in `/Users/admin/axwise-opensource/orqaly-goose`. A separate debug Rust candidate has been compiled from the matching staging source. The installed Orqanix app and the original benchmark binary remain unchanged. This is implementation and offline verification, not a new live model-selection benchmark.

## Code changes

| Files | Behavior |
|---|---|
| [extension_manager.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/extension_manager.rs:1692), [developer/mod.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/developer/mod.rs:42) | When the host mounts the native platform extension, replace the blanket ordinary-write preference with native-aware guidance. Removing it restores original instructions. The shared path serves both agent loops. Code Mode separately receives host-owned native guidance because its normal extension-instruction block is omitted; remote lookalike extensions do not activate it. |
| [selection.md](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/selection.md), [native mod.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/mod.rs:31) | Define selection policy v1: AST for structural queries, LSP for semantic navigation, hashline reads and guarded edits for existing files, ordinary writes for new files. Include examples, stale-edit recovery, truthful test reporting and a coherent multi-file workflow without claiming transactional multi-file support. |
| [ast.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/ast.rs:56), [lsp.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/lsp.rs:75), [edits.rs](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/edits.rs:96) | Give task-oriented descriptions. Report sorted host-configured LSP languages and limits without exposing commands or claiming startup success. A real query still determines availability. Existing tool arguments, permissions and workspace restrictions remain in force. |
| [EditLock drop](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/edits.rs:325) | Explicitly unlock when the owning transaction ends. Closing only the original descriptor can leave the lock held through an open duplicate. The new regression reproduces that condition, verifies the next owner can acquire the lock, and checks that closing the old duplicate cannot release the new owner's lock. |
| [integration tests](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/tests/native_engineering_integration.rs:115), native unit tests, [self-test recipe](/Users/admin/axwise-opensource/orqaly-goose/goose-self-test.yaml:192), [native README](/Users/admin/axwise-opensource/orqaly-goose/crates/goose/src/agents/platform_extensions/native_engineering/README.md) | Cover flag off/on/off, persisted session resume, both loops, configuration disclosure and the lock regression. Existing denial, cancellation, rollback, protocol and security checks remain exercised. |
| [benchmark relay](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/lib/orqanix-benchmark-relay.mjs:23), its tests and [benchmark documentation](/Users/admin/axwise-opensource/axwise-flow-oss/scripts/BENCHMARKS.md) | Record upstream instruction and tool-definition hashes, policy version, and presence of the old write preference. No instruction/schema contents are retained. User-message mentions do not count as system guidance. Existing ACP records provide actual calls and outcomes. |

Ten Goose source/documentation files were synced with saved preimage checks; three benchmark files were updated in Axwise. The [sync receipt](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection/sync-receipt.json) identifies exact files and before/after hashes. The [patch](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection/goose-changes-from-prior-working-state.patch) is relative to the prior working state, preserving earlier uncommitted work.

## Build

```sh
cargo build -p goose-cli --bin goose --offline --no-default-features --features rustls-tls
```

Compiler: Rust 1.96.1. Build profile: dev, matching the existing desktop benchmark's Rust feature/profile choice. Build completed in 51.88 seconds using the existing cache.

Candidate: [goose](/private/tmp/orqanix-native-selection-build-20260929/goose), version 1.50.0, macOS local binary. SHA-256: `5f004856e9ac5e86c10fb6d6e98184e4f8e25dbbccc5da59194a472e2d78b681`. `codesign --verify --strict` passed. Code Mode was compiled and tested separately using its feature; it is not enabled in this comparison candidate. This is not a production release or installed desktop replacement.

## Verification

- 40 native unit tests passed; the opt-in real-language-server smoke was not rerun.
- Four integration tests passed, including both loops, flag changes, persisted resume, approvals and cancellation.
- 52 security tests passed.
- Six Code Mode tests passed.
- 14 benchmark recorder tests passed.
- Strict Clippy with the Code Mode feature and Rust formatting checks passed.
- The compiled binary passed all four ACP inventory preflights: native on/off in both loops. No model requests were made.

The initial parallel unit runs exposed the edit-lock issue. The isolated original test passed, but a new deterministic duplicate-descriptor test failed before the explicit-unlock fix; the final native suite passes with that regression included. Initial recorder tests and one Code Mode test could not bind localhost under the command sandbox. They passed with local mock-server binding allowed. Original failures are preserved alongside the final results rather than discarded.

The improved instructions are now tested as reaching the provider interface. The subsequent [12-trial live comparison](/Users/admin/axwise-opensource/axwise-flow-oss/ORQANIX_NATIVE_SELECTION_BENCHMARK_2026-09-29.md) shows more consistent guarded editing and LSP diagnostics, but slower completed pairs and no demonstrated final-code reliability improvement. Its capped and normal-budget sets are reported separately. The earlier desktop results describe the previous policy and have not been rewritten.

[Build proof and evidence hashes](/Users/admin/axwise-opensource/axwise-flow-oss/review-evidence/2026-09-29/native-selection/build-proof.json).
