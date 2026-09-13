# Lean cognitive engine: structural refactor receipt

Date: 8 September 2026. Source base: `8910b537` on the deployed research-recovery lineage (`65f6a574`). Local branch: `codex/lean-cognitive-engine-sep8`.

## Scope

Preserve the current Orqaly/AxWise operation contract and all cognition behavior while separating the 11,006-line cognitive executor into cohesive modules. Keep the website, legacy algorithms and existing functionality. This release does not add a planner, remove public endpoints, expose simulation through v2, change a model, or deploy a service.

## Implemented

- Executor reduced from 11,006 to 3,664 lines.
- Eight internal modules now own draft models, policy, scope, sources, evidence, Markdown structure, validation and publication projections.
- All 334 original top-level declarations occur exactly once with AST-identical code after formatting. This includes prompts, thresholds and guard logic.
- Original imported declaration names remain explicitly available through the executor. Internal Pydantic schemas were independently compared: all 14 unchanged.
- Boundary tests prevent cyclic/reverse imports, provider/client construction in quality modules and re-aggregation into an oversized executor.
- Existing Docker and source-upload rules already include the new package.

This is a reduction in module complexity, not a reduction in total code, model calls, runtime cost, or a measured improvement in answer quality. Removing duplicated or unnecessary logic requires subsequent behavior/quality evidence. No capability was deleted.

## Verification

| Check | Result / limit |
| --- | --- |
| Existing cognitive executor baseline | 483 passed before extraction |
| Existing cognitive executor after extraction | 483 passed |
| Existing private-v2 contract suite after extraction | 879 passed; one PostgreSQL module skipped because its dedicated test database was not configured |
| New module-boundary suite | 18 passed; marked `contract` so it is included in the normal CI selection |
| Orqaly consumer contract/client/activity/planner suites | 53 passed across four files; unchanged Orqaly source |
| Mechanical declaration comparison | 334 original / 334 relocated, no AST drift or duplicates |
| Independent review | No blocking issue; no unresolved globals, cycles or schema drift found |
| Docker-allowlist-shaped isolated import probe | Private API, worker API and executor imported from an isolated copied package without the rest of the legacy application |
| Whitespace checks | `git diff --check` passed |

The 879-suite run initially deselected the 18 new tests under the repository's `-m contract` default. The missing marker was added; those 18 then passed in their dedicated run. Counts above are non-overlapping except the explicitly labelled 483-test before/after subsets.

No new live provider call, signed-in browser test, PostgreSQL integration test or GCP deployment was performed for this structural refactor. The old preview remains unchanged. These checks establish code/contract compatibility, not complete live acceptance or a universal semantic-quality guarantee.

## Independent review caveat

Compatibility re-exports preserve imports, not arbitrary monkeypatch behavior. For example, patching `cognitive_executor._validate_synthesis` does not replace the defining module's reference inside `validation._validate_task_draft`. Existing production callers and tested provider/clock/usage seams remain working; new focused tests should patch the defining module.

## Next work

1. Validate this exact revision in the existing staging environment before calling it deployed/accepted.
2. Continue separating provider adapters and operation handlers while retaining one operation lifecycle.
3. Expose retained transcript analysis and synthetic simulation through explicit typed capability handlers, after fixing provenance/degraded-grounding/cache-identity gaps.
4. Retire old routes and infrastructure after those capabilities and the website have an intentional supported home. Broad public backward compatibility is not a product goal.
