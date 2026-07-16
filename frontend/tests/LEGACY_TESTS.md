# Historical frontend tests

The supported Vitest gate is `tests/stabilization/` and is selected explicitly by `vitest.config.ts`.

The older co-located `__tests__` directories are preserved as historical material, but are not a release gate. A repository-wide audit found that they combine several incompatible generations of the frontend:

- Jest-only globals and mocks mixed into Vitest suites;
- assertions for previous shadcn/Radix component implementations;
- removed Firebase and obsolete interview-result schemas;
- tests that fall through to live backend network calls;
- files that execute custom test runners while registering zero Vitest tests.

Move a historical suite into `tests/stabilization/` only after it is rewritten against the current public behavior, is isolated from the network, and passes deterministically. New supported tests belong in that directory.
