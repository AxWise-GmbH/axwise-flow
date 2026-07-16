# Quarantined frontend modules

The application type-check intentionally excludes these unreferenced legacy helpers:

- `lib/auth-sync.ts` depends on a removed Firebase integration.
- `lib/utils/transform.ts` targets an obsolete interview-result schema.
- `lib/utils/validation.ts` targets the same obsolete upload schema.

They have no imports from active application code. Restore a module to `tsconfig.json` only after adding an active caller, replacing its removed dependency/types, and covering that caller with a test. This quarantine keeps historical code available without presenting it as supported production behavior.
