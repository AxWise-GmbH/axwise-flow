# Post-fix verification

See `FIX_REPORT_2026-09-29.md` at the Axwise repository root for scope, test counts and limits. These logs correspond to the repaired code. Parent-directory probe results are historical observations from before the fixes.

Commands used:

- `python -B -m unittest discover -s backend/tests/local_axwise`
- `python -B -m unittest discover -s packages/axwise-distribution -p 'test_*.py'`
- `python -B -m unittest discover -s scripts -p 'test_benchmark_regressions.py'`
- `node --test scripts/benchmark-regressions.test.mjs`
- `node --test packages/orqaly-goose-connector/test/jev-loop-router.test.mjs packages/orqaly-goose-connector/test/native-engineering-gems.test.mjs`
- In `apps/orqaly`: `vitest run server/workflow-v2/desktop-decision-service.test.js`
- In Goose `ui/desktop`: `pnpm exec vitest run src/orqaly/replyQuestionPrompt.test.ts src/orqaly/connection.test.ts src/acp/__tests__/orqaly-prompt.test.ts src/components/settings/chat/EngineeringCapabilitiesSection.test.tsx src/orqaly/sync/__tests__ src/components/settings/auth/AuthSettingsSection.test.tsx src/utils/markdownNormalize.test.ts src/components/MarkdownContent.test.tsx src/orqaly/followupQueue.test.ts src/orqaly/workspace.test.ts`
- In Goose `ui/desktop`: `pnpm exec tsc --noEmit`, focused `eslint`, `pnpm run i18n:check`, `pnpm run i18n:compile`.

The empty TypeScript log means no diagnostics; that command exited successfully. Python used the pinned public dependencies from the offline-created test environment. No provider requests were made to real services.
