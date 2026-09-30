# Native AST/LSP desktop comparison — protocol frozen before inference

Compare the actual installed Orqanix 2.4.2 Goose executable with native tools off against the new release-mode native semantic v3 candidate with native tools on. Use the same current temporary Electron UI, system prompt, Gemini 3.8 Flash routing and default effort. Jev and AxWise are off. This is not a complete comparison of two independently packaged application releases.

Exactly 12 live trials: control, AST-suitable route-handler repair, and LSP-suitable ambiguous cross-file rename; each arm twice, counterbalanced. Fresh Git fixture and desktop profile each time. Natural task prompts do not require particular tools. Local fixture names are descriptive, not sent as tool-use instructions.

Time from the real renderer Send click to a terminal response visible in the UI, including model calls, native server cold starts, tool execution, and any parent OAuth refresh. Exclude application setup, compilation and independent grading; record setup separately. Do not prewarm semantic servers. Limit each task to 600 seconds and 120 model requests. Preserve every trial outcome and do not replace or silently retry failures. A zero-inference setup failure may be diagnosed separately.

Quality gates: clean terminal response, expected tool inventory, independent behavioral checks, type check, public tests, meaningful added regression test, regression detects original bug, immutable inputs and unrelated identifiers unchanged. Record provider model identity, usage, tool selection, errors and recovered failures.

Provisional acceptance requires all quality gates on all candidate trials, actual AST/LSP selection on their relevant tasks, candidate aggregate and median time no worse than baseline, and no control-task median slowdown. Two repetitions can screen regressions but cannot prove universal speed or reliability. Report per-task results and outliers; do not turn this small sample into a general performance guarantee.

Protection: synthetic workspaces only; Goose and descendants have a verified filesystem boundary. Parent desktop/relay uses ordinary account authentication. Goose receives a temporary model-only localhost capability, never the user's OAuth credential or password. Electron, network and IPC are not completely isolated.

Calibration passed for all three fixtures, including original-code failure and known-correct solution success, before live inference. The initial calibration attempt was blocked by the outer execution sandbox before evaluation; the authorized macOS-confined calibration completed in a fresh directory. Desktop preflight reached Settings with zero model requests.
