# Invoice arithmetic bug

Fix lineTotal in src/pricing.ts: priceCents and quantity must be nonnegative safe integers, discountBps a safe integer from 0 through 10000. Invalid inputs and unsafe integer intermediates priceCents*quantity or product*(10000-discountBps) throw RangeError. Return Math.floor(product*(10000-discountBps)/10000). Zero quantity and full discount return positive zero. Preserve the export and default discount. Add useful regression tests in tests/regression.test.mjs and run the tests and type check.
Read README.md for the workspace contract. Use any available tools that help. Work only in this synthetic workspace; do not search parent directories, other projects, or the benchmark harness. Do not install dependencies, access the network, alter settings, commit, push or run background processes. Report actual test results.

Permitted changes: src/pricing.ts and tests/regression.test.mjs (create it). All other files are immutable inputs. Keep the implementation in its current modules.

Tests: node --experimental-strip-types --test tests/*.test.mjs
Type check: node "/private/tmp/orqanix-release242-app-20260929/Orqanix Comparison.app/Contents/Resources/orqaly-runtime/language-servers/node_modules/typescript/lib/tsc.js" --noEmit -p tsconfig.json
Dependencies and language servers are already supplied by the app. This workspace is an initialized Git repository; do not change Git metadata.
