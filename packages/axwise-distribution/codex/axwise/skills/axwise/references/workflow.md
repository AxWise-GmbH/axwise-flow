# Scope → personas → simulations → analysis → PRD

Call actual advertised tools. There is no `run_full_discovery` or
`generate_artifact` alias. At every step, complete pending generation, review
and any repair through `advance_artifact`, then use the returned saved reference
`{ operationId, sha256 }` without modifying it.

1. **Scope — `prepare_discovery`:** provide the user brief, region, exclusions
   and requested depth. Preserve its decision, stakeholder IDs, uncertainty IDs
   and question IDs/text. A scope is a proposal, not researched facts.
2. **Cohort — `generate_personas`:** select the saved scope in `references`;
   supply the explicit role descriptions and participant counts, country and
   locality. Generate contrasting relevant profiles rather than prevalence
   estimates. Each profile needs exact `origin: "synthetic"` (not `"generated"`),
   description of at least 40 characters, a realistic label and communication
   style, and at least two motivations and two pain points so the frozen cohort
   can also satisfy simulation. Copy role country/locality exactly, including
   null when no locality was selected. Retain the completed cohort reference
   and returned persona IDs.
3. **Simulations — `simulate_interviews`:** select both saved scope and cohort
   references. Copy the scope's question texts and `questionIds` into each
   role. Preserve cohort counts, country and locality. Use a recorded fixed
   seed and the requested response style. The prepared context supplies exact
   `plan` slots and `savedParticipants`; copy IDs, order, slot fields,
   `oceanMicros`, biography, motivations, pain points and communication style.
   Produce one interview per slot, with that role's exact question IDs in order.
   Mark generated origin correctly; write substantive natural answers.
4. **Analysis — `analyze_interviews`:** select the saved simulation and scope
   references. The Rust engine constructs transcript turns from the saved
   simulation; do not paste invented transcript counts or reconstruct answers.
   Choose a decision question and requested outputs/views. When saved turns
   already carry question IDs, omit a second unaligned `questions` array and
   use prepared questions plus the selected scope's question text. Copy actual
   document/turn/participant IDs. Verify exact quote spans, synthesize several
   voices, explain real tensions within the scenario, and cover each question
   with a finding or targeted gap. `simulation_hypothesis` is required for
   findings drawn from generated turns. Empty persona output is valid when
   only `jobs_pains` was requested.
5. **PRD — `create_prd`:** put the exact accepted analysis reference into
   `analysisArtifact`; select additional scope/cohort/interview references only
   when useful. Use the requested artifact type and depth. Produce the returned
   baseline sections. Every item in **Prioritized requirements** must link to
   admitted analysis finding keys unless it is an exact owner decision. Linking
   a generated finding requires `simulation_hypothesis` basis, including for
   a proposed requirement. Use supporting source IDs that actually belong to
   those findings. Preserve concrete priorities, owners, acceptance checks,
   metric denominators, time windows, thresholds, unknown outcomes and cutoff
   behavior. Proposed numbers are not measured market facts.
6. **Optional delivery — `create_delivery_brief`:** use exactly one saved
   native `create_prd` reference. Preserve assigned requirement/condition IDs
   and cover the full implementation and acceptance scope.

The supplied brief determines which steps are necessary. Direct PRD creation
does not require invented interviews. With real evidence, select and analyze
the actual material, retain its provenance, and use `source_statement` or
interpretation according to the schema.

Limits: at most 16 selected references, 12 participants, 12 questions per
simulation role and 72 total answers; selected inputs/candidates 512 KiB;
frames/artifacts 1 MiB. Large requests need a bounded owner-approved scope,
not hidden evidence truncation. Pending requests expire after 30 minutes and
are lost on process restart. Model critique is not a managed JEV audit.
