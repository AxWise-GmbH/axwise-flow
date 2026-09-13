# Cognitive quality primitives

These modules contain the existing scope, evidence and publication logic extracted from `cognitive_executor.py`. This is an internal module boundary, not a new API or agent framework.

| Module | Responsibility |
| --- | --- |
| `models.py` | Internal draft/context types, ports and execution-profile prompt projection |
| `policy.py` | Existing prompts, runtime bounds and deterministic text rules; unchanged values |
| `scope.py` | Accepted intent, literal owner spans, deliverable projection and evidence requirements |
| `sources.py` | Source classification/catalogues, exact claim binding and measured-usage provenance |
| `evidence.py` | Precision, support, unresolved claims and authority-language checks |
| `markdown.py` | Document structure, acceptance topology and source appendix formatting |
| `validation.py` | Draft validation and safe failure classification |
| `publication.py` | Task/final/blocked output projections preserving evidence gaps |

`cognitive_executor.py` retains provider construction, operation dispatch and the existing orchestration handlers. Old imports are explicitly re-exported for compatibility. New code should import a helper from its defining module; re-exports do not preserve arbitrary monkeypatches of another module's internal global references.

## Invariants

- Quality modules do not import the dispatcher or API routers, and their dependency graph is acyclic.
- They do not construct provider, database or execution clients.
- Scope/evidence/requirement IDs, source offsets, canonical hashes, prompts, thresholds and retry budgets are unchanged by the extraction.
- Facts, owner decisions, hypotheses and unresolved evidence remain distinct. A valid citation link is not an independent guarantee that every generated claim is correct.
- Synthetic interview material must retain synthetic provenance if later exposed through a typed capability. It is not real customer testimony.
- Runtime actions, credentials, user management, approvals and n8n activation remain outside these primitives.

## Remaining decomposition

The dispatcher still contains provider adapters and research/synthesis handlers. Extract these incrementally behind the existing ports after characterization tests, rather than adding a second operation lifecycle. Public API retirement and typed access to existing simulation/transcript-analysis algorithms are separate follow-up work, not accomplished by moving these files.

## Synthesis consistency boundary

- Writer and executor use the same `_context` builder. Accepted scope and reader requirements are authoritative; incidental draft heading/list counts are not new requirements.
- Specialist `conclusions` contain advice; core `conclusions` record selected decisions, with unresolved choices in `unknowns`. These existing fields are passed into repair without a new artifact schema or workflow stage.
- Repair receives the exact reviewed core, original accepted scope and exact critic findings. It does not receive a server-rewritten substitute or silently return the old core if generation fails.
- Prompt serialization includes each dependency's Markdown once. The immutable stored artifact and its hash are unchanged.
- Final validation still precedes publication. Rejections log a candidate hash and closed reason/count fields, never document or exception prose; persisted SQL diagnostics stay unchanged.

These boundaries make delivery consistent and failures diagnosable. Prompt tests and mocked provider tests do not prove that a generated design is semantically correct; a live artifact still needs content acceptance.
