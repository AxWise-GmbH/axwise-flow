# Forward asynchronous route failures

The API registers async handlers that currently reject without forwarding failures to next. Find every directly registered async handler on the Router in src/routes and wrap it with the existing withErrors adapter from src/framework/errors.ts. Cover GET, POST and DELETE registrations, including the named async function. Preserve response values, request handling, registration order and the synchronous route. Do not wrap unrelated async callbacks, the unrelated audit.get API, or ordinary helper functions. Add regression tests in tests/regression.test.mjs covering successful handling and error forwarding, and run the tests and type check.
Read README.md for the workspace contract. Use any available tools that help. Work only in this synthetic workspace; do not search parent directories, other projects, or the benchmark harness. Do not install dependencies, access the network, alter settings, commit, push or run background processes. Report actual test results.

Permitted changes: src/routes/accounts.ts, src/routes/orders.ts and tests/regression.test.mjs (create it). All other files are immutable inputs. Keep the implementation in its current modules.

Tests: node --experimental-strip-types --test tests/*.test.mjs
Type check: node "/private/tmp/orqanix-efficiency-app-20260929/Orqanix Benchmark.app/Contents/Resources/orqaly-runtime/language-servers/node_modules/typescript/lib/tsc.js" --noEmit -p tsconfig.json
Dependencies and language servers are already supplied by the app. This workspace is an initialized Git repository; do not change Git metadata.
