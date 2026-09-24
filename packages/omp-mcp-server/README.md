# Orqanix Oh My Pi MCP bridge

This package is the narrow adapter between Orqanix Desktop and the bundled Oh My Pi
(OMP) engineering runtime. It exposes four local MCP tools:

- `orqanix_engineering_status` checks the runtime without making a model request.
- `orqanix_engineering_inspect` performs a read-only repository inspection.
- `orqanix_engineering_edit` performs an explicitly approved file edit.
- `orqanix_engineering_exec` delegates an approved terminal-oriented workflow.

Each call starts an ephemeral `omp --mode rpc` child using OMP's native newline-delimited
JSON protocol. The bridge does not add a daemon, distribute a Gemini key, store an access
token, commit, push, deploy, or install dependencies by itself. Edit delegation exposes only
bounded read/edit/write tools and cannot invoke OMP's shell. Exec delegation exposes bounded
local `bash`, but not OMP's direct edit/write tools; OMP extensions and host tools remain disabled.
The approved edit call can execute one explicit test argv without a shell after OMP exits.
That argv is still an arbitrary local process: unless the desktop separately sandboxes or
allowlists it, the edit tool is correctly advertised as open-world even though OMP itself has
no shell in edit mode.
The shared delegation prompt forbids network use, dependency installation, Git commit/push,
deployment, and other external side effects unless the approved task explicitly requests the
exact action. Exec is also open-world because its shell can perform those actions when approved.
The conversation workspace is fixed when the MCP server starts, rather than supplied by
the model in a tool call.

Goose remains the primary desktop agent. Its native skills extension stays enabled by
default. OMP also keeps skill discovery enabled—the bridge never passes `--no-skills`—but
it disables unrelated OMP extensions and restricts the actual tool set for the delegated
task.

## Packaged launch contract

The desktop supplies only fixed local paths and a non-secret account hash:

```sh
orqanix-omp-mcp \
  --workspace /absolute/project/root \
  --omp /bundled/orqaly-runtime/omp/bin/omp \
  --node /bundled/orqaly-runtime/node/bin/node \
  --connector /bundled/orqaly-runtime/connector/src/cli.mjs \
  --connector-config /bundled/orqaly-runtime/connector/preview.config.example.json \
  --account-hash SHA256_VERIFIED_USER_ID \
  --conversation-id DESKTOP_CONVERSATION_ID \
  --jev-enabled true \
  --state-dir /private/account/profile/omp
```

At startup the bridge writes a secret-free OMP `models.yml` in the isolated account
state directory. For each invocation it asks the existing Orqanix connector for a current
OAuth access token and passes that token only in the OMP child environment. The selected
model is `orqanix/orqaly-gemini`, using the authenticated `/desktop/v1` gateway with a
1,048,576-token context window and 65,536-token output declaration.

Optional local policy limits are:

- `ORQANIX_OMP_TIMEOUT_MS` — maximum task time; default 10 minutes.
- `ORQANIX_OMP_STARTUP_TIMEOUT_MS` — startup deadline; default 30 seconds.
- `ORQANIX_OMP_MAX_OUTPUT_BYTES` — returned assistant text; default 128 KiB.
- `ORQANIX_JEV_ENABLED` — strict `true`/`false` or `1`/`0`; default enabled. The
  `--jev-enabled` launch option overrides it.

## Verification

```sh
npm test
```

Tests use a local fake connector and fake OMP JSONL process. They make no model or network
calls and assert that the access token is neither written to `models.yml` nor returned by
the MCP surface.

## Evidence and Jev review

Approved edit calls accept `acceptance_criteria`, `research_references` and
`test_command` (for example `["node", "--test", "feature.test.mjs"]`). The bridge
captures the initial Git state, runs OMP, executes that test command in the fixed workspace,
and only then captures the final Git diff, including bounded untracked text files. This means
files, commits, or index changes produced by tests are part of the final evidence. Oversize, binary, unsafe
or unavailable evidence cannot receive a passing review. Existing dirty changes
are included as the baseline, not attributed to the task.

The edit receipt also includes `changedFilesStatus` and a sorted `changedFiles`
list whose entries are `{ path, change }`, where `change` is `new`, `edited`, or
`deleted`. The list is derived from NUL-delimited Git name-status data and bounded
before/after file fingerprints, so unchanged pre-existing dirt is excluded. Bounded relevant
ignored files are fingerprinted too. Known dependency and generated roots named
`node_modules`, `.venv`, `target`, `dist`, `build`, `.next`, `.turbo`, `.cache`, `coverage`,
or `out` are intentionally outside changed-file attribution. If any other ignored set cannot be enumerated within the limits, the
receipt is unavailable instead of falsely empty. Unsafe, secret-like, symlinked, binary,
oversized, unstable, or over-count paths fail closed as
`changedFilesStatus: "unavailable"` with an empty list; that empty list is not treated
as authoritative.

The initial Git HEAD and logical index are pinned for the duration of an edit. A commit,
first commit in an unborn repository, or staging change invalidates both diff and changed-file
evidence. High-confidence credential filenames and content patterns also fail closed. Before
Jev authentication or upload, the complete review request is scanned again. Sensitive test
output is replaced with a local redaction marker, fails verification, and is never included raw
in either the JEV request or MCP receipt. Sensitive test argv is rejected before execution, and
sensitive OMP assistant or server-review text is likewise replaced by a safe local result.
Sensitive task or evidence content returns
`not_evaluated` with reason `sensitive_evidence` locally. Credential paths include common npm,
Python, Git, Docker, Kubernetes, AWS, GCP, Azure, GitHub, and GitLab stores.

Any changed relevant ignored file is listed in `changedFiles`, sets
`relevantIgnoredFilesChanged: true`, skips JEV, and returns `not_evaluated` with reason
`ignored_files_changed`. It cannot yield `verified: true` because its content is intentionally
absent from the Git diff reviewed by JEV.

The bridge sends this evidence with a task ID and content hashes to the existing
OAuth gateway `/desktop/v1/engineering/review`. The server validates ownership and
hashes for referenced AxWise artifacts and calls TypeSafe with its Secret Manager
credential. No TypeSafe key is stored in the desktop bundle or model environment.

`review.status` is `passed`, `failed` or `not_evaluated`; it remains advisory.
Only observed passing tests plus a passing review yield `verified: true` and a
completed edit. Missing evidence, failed tests or unavailable review yield
`review_required`; inspection alone never claims verification. A passing review
is scoped to the captured evidence and is not proof of production readiness.
When the desktop disables the Jev capability, OMP still edits, captures Git evidence,
and runs the approved test argv, but no review request is made. The receipt reports
`not_evaluated` with reason `disabled_by_user` and can never be `verified`.
