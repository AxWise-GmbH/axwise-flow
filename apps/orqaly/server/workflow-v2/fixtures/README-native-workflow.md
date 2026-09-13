# Pinned native workflow knowledge

This directory is **offline product knowledge**, not an installed agent plugin or
a connection to an n8n owner account. No production download, plugin hook,
telemetry, MCP credential listing or workflow execution occurs during lookup.

## Reproducible provenance

- Runtime: n8n **2.37.10**, registry image digest
  `sha256:848166b4051fd4251869f48c18455bddff922f04cb2f2676929463ba973dbde2`.
- `extract-native-node-catalog.mjs` reads the already-installed verified image in
  an ephemeral `--read-only --network=none --pull=never` container. It instantiates
  native node descriptions, not a server or workflow, and extracts 30 node types /
  96 versions. NodeDescription parameters, defaults, display conditions, credential
  types and native ports come from the distribution. No parameter shape is guessed
  from an old example. Dynamic port strings are retained as **data**, never eval'd.
- Node metadata source: [pinned n8n nodes-base](https://github.com/n8n-io/n8n/tree/n8n%402.37.10/packages/nodes-base).
  These extracted/reformatted metadata fixtures are modified from upstream native
  definitions; n8n's runtime license is not Apache-2.0. See `N8N-NODE-METADATA-LICENSE.md`.
- Official skills commit:
  `180b8415e3b73f78828cfa01e908e67f89f2a139` in
  [n8n-io/skills](https://github.com/n8n-io/skills/tree/180b8415e3b73f78828cfa01e908e67f89f2a139).
  Copyright 2026 n8n GmbH. Apache-2.0; full notice is preserved in
  `N8N-SKILLS-LICENSE.txt`.
- Six selected original SKILL.md files are retained in the JSON fixture with
  their source hashes. Selected headings and explicit Orqaly adaptations form
  separately hashed knowledge excerpts. `vendor-native-skills.mjs` reproduces
  them from an existing pinned clone. Hooks and mutable remote instructions are
  not installed or invoked.

## Review and intentional adaptations

Lifecycle, node configuration, expressions, credentials/security, loops and
debugging were read at the pinned revision. The validation checklist was also
reviewed. The generic skills' tool/account recommendations are not product
authority: Orqaly resolves scoped targets, asks for secure connections, and owns
approval, publishing and test admission. JSON is canonical; SDK examples are not
the model's output format. We explicitly override any claim that `test_workflow`
auto-pins every dangerous node: the pinned implementation executes the runner and
unmocked nodes may act. Generic retry advice cannot authorize duplicate writes.
No credential auto-selection, registration, MCP visibility or workflow-wide owner
search is inherited from those examples.

## What validation establishes—and does not

`native-workflow-review.js` interprets the extracted version-specific metadata:
operation discriminators, required/default fields, primitive parameter types,
options, native collections, assignments, filter structure, locator shapes and
connection ports. Reviewed dynamic ports are translated explicitly. This is **not**
the SDK `validate_workflow` implementation and not a business-success proof.
Unknown custom parameter types/ports remain an execution prerequisite. Runtime
expressions are never evaluated by the control plane.

`pure-data-v1` parses a bounded expression grammar with data references, JSON
literals, safe scalar methods, comparisons and conditionals. Arrow functions,
IIFEs, globals, constructor/prototype access and computed dynamic property names
do not receive execution permission. Native Split Out/Filter/Aggregate provide
array processing without enabling arbitrary JavaScript. Custom sort code, SQL
merge mode, regex filters, stateful loops, sub-workflows, credentials and external
nodes remain visible drafts but need separate runtime policy/evidence.

The first, still-unreleased `pure-data-v1` also permits **zero-argument native
`Array.sum()`**, for example `$json.subtotals.sum()` after an Aggregate node.
The installed 2.37.10 `n8n-workflow/dist/cjs/extensions/array-extensions.js`
implementation checks that every element is a number, then performs a linear
sum starting at zero. Empty arrays return `0`; strings (including numeric
strings), nulls and mixed arrays throw. This is ordinary JavaScript number
arithmetic, not decimal-money arithmetic; existing bounded JSON input/output and
runtime limits still apply. The control plane does not implement/evaluate the
sum. Parser regressions and opt-in real pinned-runtime tests cover numeric,
empty, invalid and mixed arrays. Arguments, `map`, `reduce`, supplied callbacks
and arbitrary function calls remain denied. No deployed policy version or
customer environment is changed by adding this helper to the initial profile.

The exported request policy is a reference profile, **not an environment
assignment or deployment**. Existing customer runtimes are not changed. Execution
must also pass server-owned scope, runtime image/installed-node checks, exact
candidate review, real acceptance tests and user approval. No provider effect,
schedule, code worker or automatic multitenant provisioning is claimed here.

Static acceptance helpers compare real supplied output/status with immutable
agreed cases. Arbitrary input matching only its schema is not labeled a passed
test. Actual n8n execution is performed elsewhere; this module never generates a
fallback output or a synthetic execution ID.
