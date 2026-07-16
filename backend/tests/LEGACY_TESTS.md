# Retired test scripts

## Supported default gate

The default `pytest` invocation selects tests marked `contract`. This is the deterministic release gate for the currently supported Orqaly Conditions and durable A+B paths. Run the historical audit explicitly with `pytest -m ""`; it is expected to expose additional modernization work and may include suites that previously attempted live LLM or localhost calls.

Do not add a test to the default gate merely to improve the count. Mark it `contract` only after it is isolated from external services, exercises a current public contract, and passes deterministically.

The files listed in `collect_ignore` in `backend/tests/conftest.py` are preserved historical verification scripts, not active automated tests.

They were retired from collection because they import customer-research routes, model packages, or processing services that are not part of the current OSS runtime. Several also require live LLM credentials, sample files, or print-based manual inspection instead of assertions suitable for CI.

Retirement rules:

- Do not count these scripts as test coverage.
- Do not re-enable them by adding compatibility shims for deleted production modules.
- When a behavior remains relevant, rewrite it against the current public service or API contract with isolated fixtures.
- Delete a retired script only in a dedicated removal change after its relevant behavior is mapped to replacement coverage or declared obsolete.

Current replacement coverage includes transcript structuring, persona formation, evidence linking, stakeholder analysis, durable A+B jobs, and Orqaly persona resolution tests elsewhere under `backend/tests/`.
