# Installed 2.4.2 engineering tool check

The already-running Orqanix 2.4.2 (5707) successfully called status, inspect, edit and exec in synthetic session `20260930_15`. No installation, rebuild or app/backend restart occurred. This tests the installed OMP bridge; it does not test the newer Rust tools.

- Status: available; model alias `orqaly-gemini`, nested thinking high. Main Goose thinking low. The resolved upstream model was not verified.
- Inspect: completed. `toolsUsed` confirms an LSP call, but its assistant receipt reports “No language server found for this action” and “No language servers configured for this project.” Handler identification used reads. There is no successful LSP result. No standalone AST tool is exposed by this bridge.
- Edit: completed, captured exactly two source edits and one new regression test; actual bridge test command exited 0 (13 tests passed); JEV advisory review passed; bridge marked verified true.
- Exec: completed and used bash. Nested assistant output reports compiler/test exit codes 0. The bridge does not preserve structured nested command or LSP results; independent verification supplies the external check here.
- Independent grader: behavior, typecheck, public tests, regression tests and immutable-file/scope checks passed. Reintroducing original source made the regression tests fail, proving they detect the defect. No unexpected file changes.

This establishes functionality for one forced-use synthetic task, not a speed or reliability advantage over ordinary Goose. The four-call protocol and manual Smart approval waits are not a comparable performance benchmark. Normal on/off tests previously made zero engineering calls.

Native tools was temporarily enabled, Axwise disabled, JEV preserved enabled, and Smart mode preserved throughout. Original flags (Native off, Axwise on, JEV on) and original chat were restored. App PID 75179, backend PID 75213, launch times and both installed binary/archive SHA-256 hashes are unchanged.

Next implementation gaps: configure and package the LSP servers for the intended execution path; avoid the extra high-thinking agent when replacing OMP with direct Goose tools; retain structured nested tool errors and command exit codes. No production code was changed by this check.
