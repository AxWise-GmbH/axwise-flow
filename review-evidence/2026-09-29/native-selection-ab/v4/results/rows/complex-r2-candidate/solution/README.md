# Rename a shared context field across a typed request pipeline

Rename the RequestContext field requestId to traceId throughout its definition and all consumers under src. This is a source-level API rename: do not keep a requestId compatibility member on RequestContext. Update context construction, aliases, destructuring and propagation so a trace identifier reaches every stage. Keep all public function names and signatures apart from that context field, existing wire/output keys named requestId, and the unrelated Job.requestId and audit requestId variables unchanged. Keep the current output values and non-mutation behavior, including forkContext suffixes. Add regression tests in tests/regression.test.mjs for end-to-end propagation and the unrelated Job identifier; run the tests and type check. Start from the app entry point and trace the relevant references as needed.
Read README.md for the workspace contract. Use any available tools that help. Work only in this synthetic workspace; do not search parent directories, other projects, or the benchmark harness. Do not install dependencies, access the network, alter settings, commit, push or run background processes. Report actual test results.

Permitted changes: src/context.ts, src/context-factory.ts, src/logging.ts, src/middleware.ts, src/jobs.ts, src/response.ts, src/worker.ts, src/app.ts and tests/regression.test.mjs (create it). All other files are immutable inputs. Keep the implementation in its current modules.

Tests: node --experimental-strip-types --test tests/*.test.mjs
Type check: node "/private/tmp/orqanix-selection-ab-app-v4-20260929/Orqanix Benchmark.app/Contents/Resources/orqaly-runtime/language-servers/node_modules/typescript/lib/tsc.js" --noEmit -p tsconfig.json
Dependencies and language servers are already supplied by the app.
