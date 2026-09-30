# Orqanix benchmark document quality rubric v1

Frozen before reviewing generated outputs. Its only task source is `scripts/lib/orqanix-benchmark-tasks.mjs`: the fixed instructions, supplied interview evidence, document contracts and examples. This rubric evaluates semantic quality separately from speed, tool selection and deterministic code checks.

## Blinded review protocol

Review a bundle identified by an opaque ID and difficulty. It may contain the task contract, final implementation, required JSON document, final assistant response and separately supplied verification evidence. Hide flag settings, model/tool names, latency, run order, other reviewers' scores and machine pass/fail summaries. Tool names appearing in generated prose should be masked without changing the substantive claim. Do not inspect original run directories or infer the configuration.

Assess only delivered content. Do not reward length, style, sophistication, use of any particular tool, extra requirements or additional scenarios. A concise correct explanation can earn full credit. Do not require a short summary to repeat every rule when another delivered section states it clearly. Additional claims and scenarios, if present, must remain faithful to the task.

Use the five dimensions below, each scored 0, 1 or 2. Cite an exact document field or response excerpt for each defect. Reuse a defect ID across dimensions when one issue affects several; count unique defects once. Mark a dimension `null` / `not_assessable` only when the needed artifact or verification evidence was withheld from the reviewer. A required document that the run actually failed to deliver is a delivery defect, not missing review evidence. Do not impute missing scores or compare partial totals with complete totals.

## Dimensions and anchors

| Dimension | 2 — sound | 1 — limited | 0 — deficient |
| --- | --- | --- | --- |
| `semantic_correctness` | Summary, requirements and acceptance prose state the intended behavior without material contradiction. | One or more minor inaccuracies or ambiguities, but no major error. | A major contradiction or missing required deliverable makes the described behavior materially wrong or unusable. |
| `coverage` | Covers the task-specific essentials below across the document and response, with enough detail for the requested handoff. | A noncentral rule is omitted or left ambiguous; the core behavior is still understandable. | Omits an essential behavior or several interacting rules, so a plausible implementation based on the handoff would be materially wrong. |
| `grounding` | Claims follow the supplied evidence or explicit specification. Assumptions are compatible and clearly identified; an empty assumptions list is acceptable. | A minor unsupported detail or imprecise attribution does not alter the required behavior. | Invents evidence, misrepresents an interview's meaning, or introduces an unsupported rule that changes required outcomes. |
| `acceptance_usefulness` | Examples and acceptance statements specify observable outcomes and meaningfully distinguish the correct behavior from the original defect. The mandatory examples can suffice; extra examples are not required. | Some acceptance prose is vague or a minor example detail is unclear, but the core scenario remains checkable. | Core acceptance is circular, materially wrong or cannot distinguish success from failure. |
| `explanation_and_verification_honesty` | Explains the material change consistently with the supplied implementation and scopes any verification claims to available evidence. Explicitly reports unverified behavior when the task asks for it. | Explanation is incomplete, or verification wording is imprecise without evidence of a material false claim. | Materially misdescribes the delivered implementation, or available evidence directly contradicts a claimed test result or verification scope. |

For the last dimension, absence of test receipts is **not** evidence of dishonesty. If a response claims tests passed and no independent evidence was supplied, record that claim as `unverified`; grade the assessable explanation separately in the rationale, and set the dimension to `null` if its overall score would depend on deciding whether that claim is true. A run's later independent oracle result does not prove that the agent ran that oracle. Do not call a claim false merely because a different test found a defect. If no tests are claimed, a truthful acknowledgment that checks were not run can be honest while still representing a verification gap, recorded separately.

## Task-specific essentials and defect anchors

### Simple: invoice total and `report.json`

The short explanation should convey the repaired arithmetic: zero quantity stays zero; discount calculation floors the exact specified result; all three inputs and both intermediate products obey the stated safe-integer/range checks. Named export and default discount must remain consistent with the task. The required examples are zero quantity producing 0 and `[199,3,1250]` producing 522. This task has no interview evidence: grounding means fidelity to the specification, without inventing external requirements.

- **Major examples:** says quantity zero defaults to one; describes rounding to nearest rather than floor; claims all finite numbers are valid; claims overflow is silently accepted; a delivered example contradicts the required result. Omitting both validation and overflow handling from the entire explanation is a coverage defect even if the schema passes.
- **Minor examples:** says invalid inputs are rejected but omits the `RangeError` name; explains safe arithmetic but does not explicitly distinguish the two intermediate products; loosely calls cents “amounts” while the calculation and examples remain unambiguous.
- **Full-credit anchor:** a short statement explaining validated safe-integer inputs/intermediates, preserving zero and using floor, accompanied by the two correct examples. No extra prose or tests are required for document quality credit.

### Medium: triage requirements and `requirements.json`

The three essential interview-derived behaviors are: `latest_open` uses the last normalized ID occurrence before filtering closed tickets (I2); `priority_order` orders urgent, normal, low with ascending ID ties (I1); `customer_summary` counts only retained open tickets by severity and returns unique ascending customer IDs (I3). Acceptance must make those rules checkable rather than merely repeat “works correctly.” The supplied latest-closed scenario must agree with the prose.

The handoff should also recognize the explicit implementation contract: trim all five string fields; lowercase severity/state; nonempty IDs, titles and customer IDs; allowed values and `TypeError` validation; exactly the requested normalized fields; non-array rejection; no input mutation. These rules come from the task specification, not necessarily the interviews. Do not penalize an honest distinction between those sources or demand fabricated interview support for specification-only details.

- **Major examples:** “first update wins”; filtering closed tickets before deduplication and resurrecting an earlier open ticket; including closed tickets in counts; sorting severity alphabetically; acceptance that permits duplicate customers; claiming interviews requested a new SLA or sentiment score and treating it as required.
- **Minor examples:** correct priority order but missing the tie rule in one place when it is clear elsewhere; an acceptance condition does not explicitly mention the empty result; a summary of normalization omits extra-field removal while the delivered handoff otherwise covers validation and immutability.
- **Full-credit anchor:** each interview maps to its actual need; given/when/then makes latest-state, queue and unique-customer outcomes observable; specification-only constraints are accurately summarized elsewhere; assumptions introduce no contradictory behavior.

### Complex: warehouse allocation and `acceptance-plan.json`

The four essential behaviors are: `atomic_reservation` aggregates repeated SKUs and reserves all lines or none (E1); `expedited_first` preserves arrival order within expedited and normal groups (E2); `idempotent_ids` claims the first ID before priority processing and ignores later occurrences (E3); `invalid_immutable` rejects invalid lines without changing stock and preserves caller inputs (E4).

The handoff should also capture the interacting explicit rules: safe-integer stock and positive safe-integer quantities; invalid stock/non-array orders throw `TypeError`; unsafe aggregate quantities yield `invalid_lines`; unknown/insufficient stock yields `insufficient_stock`; invalid orders yield `invalid_order`; an identifiable invalid-priority first occurrence still claims its ID; missing/invalid ID is reported as null; invalid-order rejections precede reservation failures, with each group in its specified order; failures leave stock unchanged; inventory and orchestration remain separate. The required expedited/atomicity example must agree with the plan.

- **Major examples:** reserves earlier lines before a later line fails; checks repeated SKU lines separately; claims the expedited duplicate overrides the first normal order; reuses an ID after its invalid-priority first occurrence; treats invalid lines as an exception contrary to the contract; mutates caller stock; an acceptance plan omits atomicity, priority, idempotency or immutability entirely.
- **Minor examples:** a clear failure rule omits its exact reason string; the plan covers ordering and validation but omits the presentation order of rejection groups; the summary omits a numeric boundary that is correctly captured in an acceptance clause.
- **Full-credit anchor:** acceptance conditions distinguish atomic failure, combined SKU demand, stable priority, first-ID ownership and unchanged inputs; the remaining validation/output rules are accurately covered without inventing warehouse policies.

## Severity, evidence and reporting

A **major defect** changes a required outcome, misrepresents a core requirement or evidence, makes a core acceptance condition nonfunctional, or makes a material implementation/test claim contradicted by supplied evidence. A **minor defect** is a bounded omission or ambiguity that does not change the core required outcome. Judge an omission in context; the examples above are anchors, not a requirement to repeat information in every field. An uncertain issue is a `review_note`, not a confirmed defect.

Return one JSON object per opaque bundle:

```json
{
  "rubric_version": "orqanix-document-quality-v1",
  "bundle_id": "opaque-id",
  "difficulty": "simple|medium|complex",
  "review_status": "complete|partial|missing_deliverable",
  "dimensions": {
    "semantic_correctness": {"score": 2, "rationale": "...", "defect_ids": []},
    "coverage": {"score": 2, "rationale": "...", "defect_ids": []},
    "grounding": {"score": 2, "rationale": "...", "defect_ids": []},
    "acceptance_usefulness": {"score": 2, "rationale": "...", "defect_ids": []},
    "explanation_and_verification_honesty": {"score": null, "rationale": "not_assessable: ...", "defect_ids": []}
  },
  "defects": [{"id": "D1", "severity": "major|minor", "location": "requirements[0].acceptance.then", "claim_excerpt": "...", "task_basis": "...", "explanation": "..."}],
  "verification_claims": [{"claim_excerpt": "...", "status": "supported|contradicted|unverified", "evidence": "supplied evidence reference or null"}],
  "review_notes": [],
  "limitations": []
}
```

Use `defects: []` for no confirmed defects; the example defect is not a required finding. A missing required document receives 0 for the four document dimensions; assess the response dimension only if provided. Record unavailable response/evidence explicitly. Report each dimension and major/minor counts, not just a summed score. A 10-point total is permissible only when all five dimensions are assessed; retain the dimensions and state this is qualitative judgment.

Machine checks remain a separate record: code oracle outcomes, input integrity, JSON/schema checks, exact evidence bindings, known example outputs, completion, failures/retries and repeated-run success counts. They are reproducible under the frozen fixtures and are not replaced by these scores. This review does not establish production reliability, exhaustive correctness, causal benefit of a feature flag or statistical significance. Compare blinded quality distributions only after reviews are frozen and configurations are revealed; disclose reviewer disagreements and the small number of repeats.
