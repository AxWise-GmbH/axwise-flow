# AxWise Cognition and Goal Orchestration - Integration Runbook

AxWise is Orqaly's external cognition and smarter-orchestration engine. Orqaly
ships a bounded, tenant-scoped snapshot and consumes either ready-to-merge
conditions outputs (tone/OCEAN, injection/scope gating, compliance, grounding,
governance) or an immutable goal-planning decision. The whole integration is
gated behind `AXWISE_ENABLE` (default off). `AXWISE_ENFORCE=shadow` prevents
AxWise from replacing final agent assignments. Customer context is populated
whenever AxWise is enabled, but new A+B research runs only when AxWise's
bounded value-of-information router selects `research_assisted`. Orqaly applies
two mandatory human confirmations in both simple and advanced mode: the
customer/problem/executor context before planning, and the exact execution
proposal before execution.

There are four server-only boundary groups, all authenticated with `x-axwise-key`:

| Boundary                                                          | Purpose                                                                                                            | Orqaly integration points                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `POST <AXWISE_API_URL>/conditions/evaluate`                       | Request-level cognition and governance                                                                             | `consilium.create`, `agent.generate`, `copilot.chat`, `copilot.ground`                  |
| `POST <AXWISE_API_URL>/orchestration/decisions`                   | Conditional context/research routing, final plan feasibility, team/tool assignment, and immutable linked decisions | `customer-intelligence` before planning and `goal.orchestrate` during team formation    |
| `GET <AXWISE_API_URL>/runs/{job_id}/status` + `/runs/{job_id}`    | Poll and consume durable A+B research created only by an owner-accepted orchestration decision                     | Polled only for the exact job returned by the accepted `research_assisted` decision     |
| `POST/GET <AXWISE_API_URL>/orchestration/decisions/{id}/outcomes` | Phase 4 decision outcome, per-node receipts, and versioned evaluation                                              | Idempotent delivery after local completion, with an independent durable retry lifecycle |

Decision reads, research refreshes and replans are also implemented in
`orchestration-client.js`. Orqaly currently creates a new decision when its own
iteration produces a structurally new plan; this preserves an exact immutable
snapshot for each `goals.iteration`.

---

## 0. Two independent off switches

AxWise only runs when BOTH are on. If either one is off, no outbound AxWise call
is made; the customer-intelligence stage records why it was skipped and asks
the user to confirm the locally derived fallback context before planning.

| Switch                 | Scope       | Where                                  | Off means                          |
| ---------------------- | ----------- | -------------------------------------- | ---------------------------------- |
| `AXWISE_ENABLE`        | global, ops | Vercel env                             | hard gate; must be exactly `true`  |
| `users.axwise_enabled` | per user    | Settings -> AxWise -> "AxWise overlay" | that user opts out; default `true` |

The per-user switch is resolved by `lib/integrations/axwise/user-flag.js`
(`isAxwiseUserDisabled`) inside `withAxwiseTracked`, cached ~10s per serverless
instance. The user-prefs write path evicts the toggling user's entry, so their
own instance honours the flip immediately; other instances age out on the TTL.

**Off is not the same as broken.** `withAxwise` returns `degraded: true` for
both, and additionally `disabled: true` when it is off. Fail-closed callers must
branch on `degraded && !disabled` - treating "off" as a failure to rule routes
every agent to manual approval the moment a user opts out. See
`lib/concilium-handlers/agent-factory.test.js`.

---

## 1. Database migrations (Supabase SQL Editor)

The current release requires the repository's complete, ordered migration
sequence through `203_goal_research_evidence_v2.sql`. Do not cherry-pick only
the files whose names contain `axwise`: tenant isolation, goal creation, BYOK,
retry deduplication, and team isolation are part of the same execution boundary.
Run `node scripts/verify-migrations.mjs`, take a timestamped database backup and
verify its restore procedure, then run the read-only
`node scripts/preflight-release-migrations.mjs` against staging and production.
Apply every unapplied migration in numeric order to staging before production.
Do not run files under `supabase/migrations/legacy/`. Apply the migrations
before the new code receives traffic, or in the same coordinated release
window; the goal workspace flow calls the RPC installed by migration 190.

| File                                               | Release responsibility                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `178_axwise_cognition.sql`                         | AxWise metadata on Consilium records and request indexes                         |
| `179_llm_usage_status_degraded.sql`                | Degraded AxWise/LLM usage status                                                 |
| `180_axwise_calls.sql`                             | Tenant-readable AxWise decision and delivery audit rows                          |
| `181_user_axwise_enabled.sql`                      | Per-user AxWise kill switch                                                      |
| `182_partner_entities.sql`                         | Tenant-owned operational entity schema used by the surrounding product           |
| `183_data_isolation_backfill.sql`                  | Owner columns and backfill for tasks, jobs, partners, and related execution data |
| `184_data_isolation_rls.sql`                       | Strict owner/service-role policies; apply immediately after 183                  |
| `185_axwise_customer_intelligence_status.sql`      | Durable `researching_customer` goal status                                       |
| `186_goal_double_confirmation.sql`                 | `awaiting_context_approval` and versioned approval snapshots                     |
| `187_vault_rpc_wrappers.sql`                       | Server-side Vault access used by encrypted BYOK execution                        |
| `188_platform_credit_usage.sql`                    | Platform-credit ledger for model execution                                       |
| `189_public_experiences_schema_repair.sql`         | Contiguous public-experience schema repair required by the release               |
| `190_goal_organization_catalogue.sql`              | Atomic goal workspace and authorized Agent Hub catalogue creation                |
| `191_axwise_outcome_retry_dedup.sql`               | One active durable Phase 4 outcome retry chain per goal                          |
| `192_agent_team_goal_isolation.sql`                | One active execution team per goal                                               |
| `193_gemini_default_cleanup.sql`                   | Exact `gemini` / `gemini-3.6-flash` persisted defaults                           |
| `219_gemini_3_7_default.sql`                       | Exact `gemini` / `gemini-3.7-flash` defaults for new persisted rows              |
| `230_gemini_3_8_default.sql`                       | Exact `gemini` / `gemini-3.8-flash` defaults for new persisted rows              |
| `194_credential_persistence_hardening.sql`         | Vault pointers and fail-closed plaintext-credential boundaries                   |
| `195_goal_execution_authorization_reservation.sql` | Atomic second-approval reservation and crash-safe recovery status                |
| `196_agent_jobs_worker_scope.sql`                  | Explicit durable-worker scope on queued jobs                                     |
| `197_predefined_agent_identity.sql`                | Stable predefined Agent Hub identity                                             |
| `198_agent_jobs_scope_claim_guard.sql`             | Scope-aware job claim guard                                                      |
| `199_agent_jobs_require_worker_scope_header.sql`   | Required worker-scope header at the claim boundary                               |
| `200_job_pool_persistence_repair.sql`              | Job Pool persistence repair                                                      |
| `201_osja_review_retry_dedup.sql`                  | Review retry de-duplication                                                      |
| `202_goal_research_persistence.sql`                | Versioned AxWise research-run/source/persona/artifact persistence                |
| `203_goal_research_evidence_v2.sql`                | Typed fact/calculation tables and atomic manifest-count activation               |

The preflight exits non-zero when operator review is required. Duplicate
queued/running AxWise outcome jobs for one goal must be resolved before
migration 191 or its unique index will fail. Migration 192 intentionally
deactivates all but one duplicate active team for a goal (preserving historical
membership rows); review or resolve every reported group before applying it.

After applying the sequence, verify at minimum that the AxWise audit table and
the two concurrency guards exist:

```sql
select
  to_regclass('public.axwise_calls') is not null as has_calls_table,
  to_regclass('public.idx_agent_jobs_active_axwise_outcome_goal') is not null
    as has_outcome_retry_guard,
  to_regclass('public.idx_agent_teams_one_active_per_goal') is not null
    as has_goal_team_guard,
  position(
    'authorizing_execution' in pg_get_constraintdef(
      (select oid from pg_constraint where conname = 'goals_status_check')
    )
  ) > 0 as has_execution_authorization_reservation,
  to_regclass('public.goal_research_facts') is not null as has_typed_facts,
  to_regclass('public.goal_research_calculations') is not null as has_typed_calculations;
-- expect true, true, true, true, true, true
```

---

## 2. Environment variables

| Var                                            | Purpose                                               | Example                                      |
| ---------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| `AXWISE_API_URL`                               | AxWise base URL (ends at `/v1`)                       | `https://api.axwise.de/api/orqaly-axwise/v1` |
| `AXWISE_API_KEY`                               | shared M2M secret (same on both sides)                | `<secret>`                                   |
| `AXWISE_ENABLE`                                | `true` to call out; anything else = fully off         | `true`                                       |
| `AXWISE_ENFORCE`                               | `shadow` (log-only) or `authoritative` (act)          | `shadow`                                     |
| `AXWISE_EVIDENCE_PROFILE_V2_ENABLED`           | Global typed-evidence v2 gate                         | `false`                                      |
| `AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS`    | Models admitted for new v2 goals                      | `physical_product`                           |
| `AXWISE_EVIDENCE_PROFILE_V2_EXECUTION_MODELS`  | Models dispatchable for pinned v2 goals               | `physical_product`                           |
| `AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS` | Resolved organization UUIDs admitted for new v2 goals | `<canonical-org-uuid>`                       |
| `AXWISE_RESEARCH_MAX_COST_USD`                 | Maximum pre-planning research spend                   | `5`                                          |
| `AXWISE_RESEARCH_ESTIMATED_COST_USD`           | Estimated cost used by the AxWise router              | `1`                                          |
| `AXWISE_RESEARCH_MAX_LATENCY_MS`               | Maximum research latency                              | `1200000`                                    |
| `AXWISE_RESEARCH_ESTIMATED_LATENCY_MS`         | Estimated latency used by the router                  | `300000`                                     |

- Secrets go in Vercel env (Settings -> Environment Variables) or, for local
  dev, in `.env.local` (gitignored). NEVER commit the key.
- `AXWISE_ENABLE` not `true` -> integration is a no-op (local fallbacks).
- Always start with `AXWISE_ENFORCE=shadow`.
- Backend only. The browser never sees `AXWISE_API_KEY`; do not put it in a
  `VITE_`-prefixed var, which Vite inlines into the client bundle.

Both gates are compared by exact string, so a typo (`authoritive`,
`AXWISE_ENABLE=1`) fails silently into the safe-but-wrong state and looks
identical to a working rollout. `npm run validate-env` rejects bad values and
catches `AXWISE_ENABLE=true` with no URL/key - run it before every promotion.

`AXWISE_ENFORCE` controls whether the final AxWise orchestration decision may
replace Orqaly's local per-task assignment. Direct and evidence-only context is
still available in both assignment modes, but it is labelled as declared or
existing-evidence context rather than researched persona evidence. Keep
`AXWISE_ENABLE=false` if all AxWise context enrichment must remain a no-op.

Typed business-evidence v2 has a separate, backend-only canary boundary. Its
global flag defaults off, and both model lists plus the organization cohort
default empty. Each model list must be
a unique comma-separated subset of `physical_product`, `subscription`,
`usage_based`, `project_service`, and `none`; an unknown, empty, or duplicate
token fails the entire list closed. Every admission model must also appear in
`EXECUTION_MODELS`, preventing creation of immediately stranded goals.
`ADMISSION_ORG_IDS` is a unique list of canonical lowercase UUIDs and is checked
against the server-resolved, ownership-verified organization—not a request-body
identifier. `ENABLED_MODELS` and the org cohort apply only to new goal admission.
`EXECUTION_MODELS` applies only when creating or retrying a new provider job for
a profile already pinned on a goal. Polling, importing, and reviewing a durable
existing job remain available after rollout closure. To stop a model without
stranding in-flight work, remove it
from `ENABLED_MODELS`, redeploy, drain pinned goals, then remove it from
`EXECUTION_MODELS` (and, once all v2 work is drained, disable the global flag)
and redeploy again. Vercel environment changes do not affect existing runtime
instances until a redeploy. Run `npm run validate-env:strict` before each step.

AxWise has an independent producer allowlist,
`AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS`. It is configured on the AxWise
API and worker, not in Vercel. Keep it empty until the Orqaly migration and
dual-read consumer are deployed and verified. The first live adapter accepts
only `physical_product`; subscription, usage, and project-service contracts
remain schema-only and fail before a research job is persisted.

---

## 3. Local testing (no Vercel needed)

> **Use `npm run dev:local`, NOT `npm run dev`.** Plain `npm run dev` is just
> `vite`, and `vite.config.js` proxies `/api` to **production**
> (`https://orchestratori.vercel.app`). Your browser is then talking to the
> deployed backend, not your machine: AxWise reads whatever env production has,
> and any AxWise change you have not deployed simply is not there. Settings will
> report "Backend off" and the toggle will be disabled - correctly, because
> production said so. `dev:local` sets `VITE_API_URL=http://localhost:3001` and
> runs `scripts/local-api-server.js`, which loads `.env.local`.

A zero-dependency stub is included so you can drive the whole chain locally.

```bash
# terminal 1 - the fake AxWise
AXWISE_STUB_KEY=local-dev-secret AXWISE_STUB_PORT=8791 python3 scripts/axwise-stub.py

# terminal 2 - Orqaly full local stack (reads .env.local)
npm run dev:local
```

Create a gitignored `.env.local` with the matching block (URL -> stub, key
`local-dev-secret`, `ENABLE=true`, `ENFORCE=shadow`). The local API server loads
`.env.local` automatically (`scripts/local-api-server.js`). Never commit it.

Then open `http://localhost:5176/settings` -> AxWise. The pill tells you which
gate is closed:

| Pill                 | Meaning                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Connecting…`        | prefs not fetched yet                                                                                           |
| `Backend off`        | `AXWISE_ENABLE` is not `true` on the API you are hitting (very often: you ran `npm run dev` and hit production) |
| `Disconnected`       | the server gate is on, but this user turned the overlay off                                                     |
| `Connected (shadow)` | AxWise is called and logged; decisions are not applied                                                          |
| `Connected`          | AxWise is called and `authoritative`                                                                            |

Note: the local stack talks to the SAME Supabase in your `.env.local`, so the
migration in step 1 must be applied to that database too (there is no separate
local DB) - and toggling the kill switch in local Settings writes the same
`users.axwise_enabled` row production reads.

### Live AxWise workflow harness

The local-to-live proof runner is authoritative by default. Before it seeds a
fixture or sends any request, it requires both sides of an already active AxWise
tenant mapping in `.env.local`:

```bash
ORQALY_E2E_EXPECTED_USER_ID=<mapped-user-uuid>
ORQALY_E2E_ORG_ID=<mapped-organization-uuid>
ORQALY_E2E_REQUIRE_AXWISE_APPLIED=true
```

These are harness-only variables, not Vercel production runtime variables. The
runner checks that the local user and organization exactly match them and sends
the same IDs in the AxWise tenant headers. It never creates or weakens an AxWise
mapping. A missing or mismatched identity stops the run before fixture seeding
or network calls, so a newly generated local organization cannot be mistaken
for the mapped tenant.

Use shadow mode (`--allow-shadow`, or the equivalent
`ORQALY_E2E_REQUIRE_AXWISE_APPLIED=false`) only when the purpose of the run is
explicitly to observe shadow behavior. That is the only supported mode in which
the mapped IDs may be omitted. Do not work around an AxWise `403` by
auto-provisioning a mapping or by substituting a random organization; correct
the local fixture or active AxWise mapping instead.

```bash
node scripts/axwise-live-e2e.mjs --seed
```

Quick wire check without the app (real client -> stub):

```bash
AXWISE_STUB_KEY=local-dev-secret AXWISE_STUB_PORT=8791 python3 scripts/axwise-stub.py &
node -e "process.env.AXWISE_API_URL='http://127.0.0.1:8791/api/orqaly-axwise/v1';process.env.AXWISE_API_KEY='local-dev-secret';process.env.AXWISE_ENABLE='true';import('./lib/integrations/axwise/index.js').then(async m=>{const r=await m.withAxwise(m.buildConsiliumCreateContext({requestId:'t',tenant:{userId:'u'},board:{name:'B',security_level:'high'}}),()=>({}),{posture:'open'});console.log(JSON.stringify(r.processedOutputs.governance));})"
```

---

## 4. Production rollout (shadow -> authoritative)

0. Set `AXWISE_ENABLE=false` in the release configuration. This prevents
   outbound AxWise calls; it does not make the overall release behavior-neutral
   or remove the two mandatory goal approval gates.
1. Take and verify a production backup, run the read-only preflight from step 1,
   and apply the migrations to production before the code receives traffic, or
   in the same coordinated release window.
2. Deploy the code with `AXWISE_ENABLE=false` and verify the local-only path.
3. Create and verify the active AxWise tenant mappings described below.
4. Keep every Orqaly v2 flag off and deploy migration 203 plus the dual-read
   consumer first. Verify existing v1 import, Gate 1, approval, and planning.
5. Deploy the matching AxWise code with
   `AXWISE_BUSINESS_EVIDENCE_PROJECTION_MODELS=` (empty), then verify the v1
   bundle hash and the single-worker release contract. Enable only
   `physical_product` on the same immutable API/worker artifact after those
   checks pass; this still emits no v2 requests by itself.
6. Set the 4 env vars in Vercel with `AXWISE_ENFORCE=shadow`, redeploy.
   For a typed-evidence v2 canary, set
   `AXWISE_EVIDENCE_PROFILE_V2_ENABLED=true` and put only the first approved
   economic model in both v2 model lists, with only the authorized resolved org
   UUIDs in `AXWISE_EVIDENCE_PROFILE_V2_ADMISSION_ORG_IDS`. Never remove a model
   from the execution list until new admission is closed and its pinned queue is
   empty.
7. Let it run: AxWise calls and recommendations are logged (`axwise_calls` rows,
   `llm_usage` rows with `source='axwise'`, plus the `axwise` JSONB column on new
   rows). Final agent assignments remain local in shadow mode, but context
   routing can still pause for clarification or start bounded research, adding
   latency, cost, and goal-state transitions. Check real traffic and latency:

   ```sql
   select integration_point, applied_outcome, count(*),
          round(avg(duration_ms)) as avg_ms, sum(degraded::int) as degraded
   from axwise_calls
   where created_at > now() - interval '24 hours'
   group by 1, 2 order by 3 desc;
   ```

   Everything should read `shadow-logged`. A high `degraded` count means AxWise
   is unreachable - fix that BEFORE promoting, or `agent.generate` will route
   every new agent to approval the moment you do.

8. Compare AxWise vs local decisions (`ax_decision` vs `local_decision`) and
   latency. Investigate any deny AxWise would have issued that local did not.
9. Flip `AXWISE_ENFORCE=authoritative`, redeploy. Now:
   - `agent.generate`: an AxWise `denied` blocks creation (fail-closed); if
     AxWise is unreachable, generation is routed to approval, not silently
     allowed.
   - `copilot.chat`: an AxWise `denied` returns a blocked reply; tone fragment
     is merged into the system prompt.
   - `consilium.create`: governance suggestions fill gaps (user-provided values
     always win).
   - `goal.orchestrate`: a complete, feasible AxWise plan may replace local
     per-job agent assignments. Orqaly still owns execution, credentials,
     approval gates and all side effects.

Kill switch: set `AXWISE_ENABLE=false` (or unset) and redeploy - instant revert
to local-only AxWise routing, without removing this release's approval gates or
other application changes. Individual users can opt out at any time in Settings
without a deploy.

---

## 5. What was changed (Orqaly side)

- New module `lib/integrations/axwise/` - `client`, `context`, `pre-classifier`,
  `degrade` (`withAxwise`), `tracked` (`withAxwiseTracked`), `user-flag`
  (per-user kill switch), `config`, `types`, `index` (+ colocated tests).
- Wiring: `lib/concilium-handlers/boards.js` (+ `concilium_consensus_rules`
  seed), `lib/concilium-handlers/agent-factory.js` (fail-closed),
  `lib/agent-handlers/copilot.js` (+ async `copilot.ground`), and the chat
  handlers (`assistant-chat`, `assistant-stream`, `agent-chat`, `team-chat`,
  `goal-lead-chat`, `assistant-bridge`).
- Goal orchestration: `orchestration-client.js` and `goal-orchestration.js`,
  wired into `lib/goal-handlers/stages/team-formation.js`. Every request carries
  the real goal tenant, plan nodes, agent catalogue, tools, evidence and
  remaining budget. Every decision and assignment is persisted in
  `goals.data.axwise_orchestration`, `goal_log`, `team_tasks.data` and
  `axwise_calls`.
- Customer intelligence: `customer-intelligence.js` and the durable
  `customer-intelligence` goal stage first request an orchestration decision.
  Direct and existing-evidence routes proceed without research; only
  `research_assisted` is polled through A+B; `human_clarification` reuses the
  existing `awaiting_po_input` UI. Results are stored under
  `goals.data.axwise_customer_intelligence` with provenance and routing mode.
- Human authorization: `context-approval.js` requires the authenticated goal
  owner to confirm the customer, problem, desired outcome, evidence limits and
  ideal executor before `pm-planning`. `client-approval.js` then requires a
  second confirmation of the final plan, team, tools, assignments, budget and
  proposal in both simple and advanced mode. Actor, timestamp, version and a
  deterministic snapshot hash are stored under `goals.data.goal_approvals`.
  Changed context, plan, team, tools, assignments or budget invalidates the
  affected approval. `execute-phase.js` rechecks both hashes server-side, so a
  queued job or retry cannot bypass either gate.
- Goal persona delivery: planning consumes the customer and ideal-executor
  persona; team scoring uses the persona and bounded AxWise agent-ranking
  signal; each task receives
  `team_tasks.data.axwise_execution_context`; execution injects that context
  into the agent system prompt; the existing Orqaly Agent Hub derives its
  goal-scoped persona cards from those tasks. Permanent `agents` and
  `agent_profiles` identity rows are never rewritten.
- Kill switch: `lib/api-handlers/user-prefs.js` (reads/writes `axwise_enabled`,
  evicts the flag cache), `src/hooks/useAxwise.js` (client store),
  `src/pages/Settings/AxwiseOverlayControls.jsx` (the toggle).
- UI surfaces: `src/pages/AxwiseAnalytics/`, `src/components/Layout/Axwise*.jsx`.
- The complete `supabase/migrations/178..203` release sequence,
  `scripts/axwise-stub.py`, and `scripts/validate-env.js` (registers and
  value-checks the AxWise gates).

Invariants worth keeping:

- Authoritative authz (JWT + Supabase RLS + the live Orqaly agent/tool
  catalogue) stays in Orqaly. AxWise `security.scopeDecision` is advisory.
- `degraded` -> ignore `scopeDecision`, apply the local posture.
- `disabled` -> AxWise is off, not broken. Never penalise the request for it.
- Conditions, planning, and usage telemetry (`axwise_calls`, `llm_usage`) is
  best-effort and must never fail the user request; nothing is written at all
  when disabled. The `goal.outcome` success proof is the deliberate exception:
  after AxWise accepts the idempotent outcome, Orqaly must persist that bounded
  audit row before marking delivery reported. An audit failure leaves delivery
  pending and is retried without changing the locally completed goal.
- Goal decisions use a deterministic snapshot-based idempotency key. A retry of
  the same plan reuses the decision; a changed agent/tool/plan snapshot creates
  a new immutable decision.
- AxWise's routing decision is binding for the cognition workflow: Orqaly runs
  new research only for `research_assisted`, pauses for `human_clarification`,
  and does not silently upgrade or downgrade that route. This does not make an
  AxWise persona, declaration, or recommendation an operational fact or grant
  execution authority.
- Goal-owner declarations and generated personas are contextual hypotheses, not
  customer transactions, CRM records, interviews, telemetry, or other
  operational evidence. Only tenant-supplied records/connectors with provenance
  may be described as operational evidence.
- Authoritative goal assignment is all-or-nothing. Orqaly rejects missing or
  duplicate plan nodes, unknown agents, unavailable tools, omitted required
  tools, non-feasible responses, and responses for another task.

### Goal flow end to end

1. Orqaly accepts the goal as written, including a short or vague prompt, and
   produces a domain-neutral problem/outcome brief. It does not assume that the
   work is software development or that the planner must be a PO/PM.
2. Orqaly calls `POST /orchestration/decisions` with `planning: null`, the
   tenant, vague goal context, research budgets, user-supplied evidence, and the
   authenticated active Agent Hub candidates. Clarification-answer content is
   hashed into the evidence snapshot, so changed answers produce a new durable
   request instead of incorrectly reusing an older context decision.
3. AxWise selects `direct`, `evidence_assisted`, `research_assisted`, or
   `human_clarification`. That route is binding for this decision snapshot:
   Orqaly does not run A+B for a direct/evidence route and does not bypass a
   research or clarification route locally. New evidence or clarification must
   produce a new AxWise decision before the route can change. Direct/evidence
   routes populate a provenance-labelled contextual persona without new
   research. Clarification pauses in the existing user-question flow. Only
   research-assisted returns an A+B job.
4. For research-assisted work, the goal reconciler polls AxWise without holding a serverless request open.
   Orqaly submits seven domain-neutral research questions in the bounded
   orchestration research brief. The AxWise routed-research adapter converts
   that brief into typed `questions_data` for problem experiencer, decision
   authority, beneficiary, executor, and outcome definer roles, while retaining
   the rendered questionnaire for audit/backward compatibility. The adapter
   sets `config.performance_profile=quality_fast`; AxWise retains two people per
   stakeholder, the full dual-persona output, and exact quote/speaker/document
   evidence gates while parallelizing independent work and avoiding duplicate
   model calls. The profile is used only after AxWise selects research; direct,
   existing-evidence, and clarification routes do not start A+B.
   When tenant operational records or live connectors are unavailable, selected
   research may use AxWise's disclosed methodology/synthetic fallback. Its
   output remains a methodology-derived working hypothesis with explicit
   limitations; it must never be labelled as observed customer behaviour or a
   connected operational record. A transient poll or post-research refresh
   error keeps the same job pending. Terminally failed, invalid, unlinked, or
   incomplete research requests human clarification rather than inventing
   evidence.
5. On completion, Orqaly refreshes the parent decision, reads
   `result.data.persona_resolution`, requires
   `orqaly_dual_persona_v1`, checks the customer and executor fields, and removes
   every recommendation or ranking outside the current authenticated Agent Hub
   catalogue. AxWise cannot auto-assign: `auto_assign_allowed=false` and
   `requires_orqaly_authorization=true` remain enforced.
   Persona fields describe the stakeholder and execution context; they are not
   operational records and are never written back as CRM, transaction, support,
   or analytics facts. If the linked refresh still returns
   `human_clarification`, Orqaly may retain
   the sanitized synthetic dual-persona result only under
   `working_hypothesis`. It is labelled `authoritative=false`,
   `assignable=false`, `executable=false`, and `awaiting_verification`; it is
   never copied into `persona_resolution`.
6. Orqaly stores the customer persona/context, evidence, ideal executor, authorized
   recommendation and rankings under
   `goals.data.axwise_customer_intelligence.persona_resolution`.
7. Orqaly pauses at `awaiting_context_approval`. The context-review UI shows
   the affected stakeholder, problem, desired outcome, trust/evidence status,
   limitations, ideal executor and any authorized Agent Hub match. The user can
   confirm, request a correction, or ask AxWise to evaluate whether more
   evidence/research is warranted. No planning or assignment starts before an
   exact context snapshot is approved.
8. Operational planning receives that same object and chooses phases, roles,
   tools and outcomes for the actual domain. Team formation uses the ideal
   capabilities and the AxWise scores as bounded signals while retaining
   Orqaly's ownership, organisation and availability checks.
9. `goal-orchestration.js` converts phases/jobs into stable nodes such as
   `phase-1-job-1`, including cross-phase dependencies.
10. It snapshots active members, tool availability, expected actions, remaining
    budget and Orqaly-asserted plan/feasibility evidence.
11. The request includes the context decision as `upstream_decision_id`; AxWise
    returns a linked immutable decision and executable plan with
    `requires_orqaly_authorization=true`.
12. Orqaly revalidates the complete response against its live team/tool state.
13. In `shadow`, the decision is logged and local assignment is unchanged. In
    `authoritative`, only a complete revalidated plan can change job assignment.
14. Every assigned task stores an `orqaly_goal_execution_persona_v1` overlay
    containing the customer persona, ideal execution persona, assignment reason,
    AxWise decision ID and research job ID. The executor receives this overlay in
    its system prompt, and Agent Hub shows it on that agent's existing profile as
    a goal-specific view.
    A review-only working hypothesis can also appear on the suggested Agent Hub
    candidate with an explicit `not executable` warning. It never changes the
    permanent agent profile and is ignored by planning and execution-context
    builders until a later authorized resolution replaces it.
15. Orqaly builds a proposal containing customer intelligence, context approval,
    AxWise decision IDs, feasibility, task-level assignments and rationale,
    execution personas, tools, cost, time, guardrails and any deterministic
    landing-page preparations (Gemini brand context, declared-reference fetch,
    and Pexels lookup). It pauses at
    `awaiting_approval` for the second human confirmation in every mode. A
    changed proposal snapshot requires a new approval. Starting a replan
    immediately invalidates the current execution approval before any revised
    work can be queued; the returned plan/team/tool/budget snapshot must be
    approved again.
16. Only then may Orqaly run the signed preparatory actions and execute jobs.
    Every preparatory stage rechecks the same approval hash before making a
    network call or persistent write; a legacy/pre-approval queued job is
    deferred, and a stale grant returns to gate 2. Orqaly then evaluates outputs
    and retains final authority over external actions. A revised plan on a later
    goal iteration receives its own AxWise snapshot and decision and repeats
    both gates.
17. Completion submits an idempotent Phase 4 outcome with terminal node receipts,
    authorization status, quality, acceptance, cost/currency, latency, rework,
    escalation, failures, and explicit overrides. Local completion remains
    final, but outcome delivery is durable: failures stay pending, one retry
    chain resubmits the same idempotent outcome, and Orqaly records a successful
    `goal.outcome` audit proof before delivery becomes `reported`. Exhausted
    delivery retries are visible as a separate final failure and never rewrite
    the completed goal. Shadow-only decisions are not treated as safe learned
    evidence of an applied AxWise assignment.

The Agent Hub display is therefore populated by AxWise data but owned and
rendered by Orqaly. The permanent profile answers "who this agent is"; the
goal overlay answers "how this agent should work for this customer now".

### AxWise tenant mapping is a hard prerequisite

The AxWise database must contain one active `orqaly_tenant_mappings` row for
each `(external_org_id, external_user_id)` pair Orqaly will send. A valid M2M key
without that row correctly returns HTTP 403; enabling Orqaly before mappings
exist therefore produces only fail-open local goal assignments.

Verify before shadow rollout:

```sql
select external_org_id, external_user_id, active
from orqaly_tenant_mappings
where partner_id = 'orqaly' and active = true;
```

Do not invent or hand-copy IDs. Read `goals.org_id` and `goals.user_id` from the
production Orqaly database, map them to the intended AxWise workspace owner,
then run an authenticated schema probe and one disposable shadow goal.

---

## 6. AxWise side (separate Python repo)

AxWise must expose all four boundary groups under `/api/orqaly-axwise/v1`:

- `POST /conditions/evaluate` returns
  `{ applicableConditions, processedOutputs, meta }`. `copilot.ground` reads
  `payload.draft_response`, not the user message.
- `POST /orchestration/decisions` accepts the strict `DecisionCreateRequestV1`
  contract. It requires `Idempotency-Key`, returns an immutable
  `OrchestrationDecisionV1`, and always sets
  `requires_orqaly_authorization=true`.
- `GET /orchestration/decisions/{id}`, `/research/refresh` and `/replan` require
  both `X-Orqaly-Org-ID` and `X-Orqaly-User-ID`; AxWise verifies those headers
  against the stored decision tenant.
- `POST/GET /orchestration/decisions/{id}/outcomes` use the same exact tenant
  headers. POST also requires `Idempotency-Key` and validates every receipt
  against the immutable plan node and assigned agent. AxWise preserves raw
  observations separately from its versioned evaluation, rejects currency from
  learned scoring when it does not match the immutable decision budget, and
  never promotes a scorer without tenant-bound human-reviewed evidence.
- AxWise creates a durable research job only from `POST /orchestration/decisions`
  after Orqaly sends the exact owner acceptance for the proposed typed scope.
  Orqaly has no direct simulation starter. `GET /runs/{job_id}/status` and
  `GET /runs/{job_id}` return the durable state and completed dual-persona
  result for that accepted decision; both reads require the same
  `X-Orqaly-Org-ID` and `X-Orqaly-User-ID` tenant headers.

The conditions stub remains useful for local UI work. Goal orchestration and
dual-persona research should be tested with the focused Vitest bridge tests or
an AxWise contract environment because the lightweight stub does not synthesize
Phase 1-3 decisions or durable A+B persona results.
