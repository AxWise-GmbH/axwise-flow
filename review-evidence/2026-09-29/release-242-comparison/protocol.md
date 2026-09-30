# Released 2.4.2 versus actual native tools — frozen protocol

12 trials: four calibrated TypeScript tasks (simple, medium, complex, large) × released 2.4.2 engineering off, released 2.4.2 engineering on, release-mode Rust-native candidate. Actual task order is frozen in the driver. No trial retries or replacement observations. Setup-only preflights do not call a model.

Reference Goose binary, packaged OMP 18.2.1 and bridge are byte-identical to installed Orqanix 2.4.2 (5707). Candidate is compiled offline in release mode from the previously tested native-efficiency source. Neither installed application nor original release binary is changed. The temporary comparison bundle adds a launcher, native candidate, language servers and a scoped-capability auth adapter. Only OMP's generated model base URL is redirected for instrumentation; its code, prompts, model alias, high thinking setting and tools are unchanged.

Backend ACP, using the corresponding version's standing and per-turn desktop prompts. The released native-tools prompt/OMP-registry discrepancy is preserved as released behavior. This is not an Electron UI benchmark, and release engineering-off means the Orqanix release's ordinary Goose configuration, not upstream vanilla Goose.

The outer model is Gemini 3.8 Flash through the same current Orqanix production router code, using default reasoning settings for all three arms. Released OMP requests high reasoning as shipped; nested effort is recorded separately rather than silently changing its behavior. Actual response model identity is verified. Jev and Axwise are off. Natural tool selection; no instructions to force either OMP or native use.

Fresh Git fixtures and profiles; identical filesystem boundaries. 600-second task deadline and 120 aggregate model request limit per trial (outer + nested OMP). Expiring model-only localhost capabilities; normal OAuth retained only by parent. Primary and OMP routes have explicit attribution. Tool results, model usage, completion errors and failed attempts are retained.

Elapsed time: ACP task submission through final response. Setup and independent evaluation excluded. Evaluation includes public tests, independent behavioral checks, TypeScript typechecking, input/file-scope integrity and whether the model's added regression test detects the original bug. Correct files and clean agent completion are reported separately. One observation per task/arm supports exploratory comparisons only.

Pre-inference correction: first launch produced a local 404 because Goose ignores base_url path components. It made zero model requests; receipt is preserved. Set the explicit provider base_path to primary/desktop/v1/chat/completions and start the full 12-row batch in a fresh output directory. No model trial was replaced.
