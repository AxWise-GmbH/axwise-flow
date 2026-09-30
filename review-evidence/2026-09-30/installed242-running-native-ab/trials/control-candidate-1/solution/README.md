# Completed task label

Fix taskLabel in src/labels.ts so completed tasks get the prefix [x] and incomplete tasks keep [ ]. Preserve the supplied name exactly and keep the exported signature. Add regression tests in tests/regression.test.mjs, then run tests and type check.
Read README.md for the workspace contract. Use any available tools that help. Work only in this synthetic workspace; do not search parent directories, other projects, or the benchmark harness. Do not install dependencies, access the network, alter settings, commit, push or run background processes. Report actual test results.

Permitted changes: src/labels.ts and tests/regression.test.mjs (create it). All other files are immutable inputs. Keep the implementation in its current modules.

Tests: node --experimental-strip-types --test tests/*.test.mjs
Type check: node "/private/tmp/orqanix-native-v8-app-20260930/Orqanix Native v8 Test.app/Contents/Resources/orqaly-runtime/language-servers/node_modules/typescript/lib/tsc.js" --noEmit -p tsconfig.json
Dependencies and language servers are already supplied by the app. This workspace is an initialized Git repository; do not change Git metadata.
