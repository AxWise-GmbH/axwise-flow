-- 130_design_qa_results.sql
-- Audit + learning storage for the vision-QA tool.
--
-- Why: today the iterate.js re-planner receives prose feedback like "page
-- feels plain" and over-corrects on the wrong axis. After this migration
-- the QA agent's tool_vision_qa__compare call persists a structured row
-- here per iteration, so:
--   - iterate.js can read structured failure categories instead of prose
--   - the PageBuilder UI / RequestProgressCard can show side-by-side
--     screenshots for the team
--   - Phase 3's "edit-as-signal" learning loop can correlate user
--     PageBuilder edits with the QA failures that preceded them

create table if not exists public.design_qa_results (
  id                uuid primary key default gen_random_uuid(),

  goal_id           uuid references public.goals(id) on delete cascade,
  -- Iteration counter at the time of the run (matches goals.iteration).
  iteration         integer,

  -- Live URL the QA agent screenshot-compared. Used by the UI to render a
  -- "go to live page" link next to the score.
  deployment_url    text not null,

  -- 0–100 score from the vision LLM. Brief-adherence + general design
  -- quality (contrast, typography, spacing, hierarchy, image fit).
  score             integer not null check (score >= 0 and score <= 100),

  -- Short overall assessment the vision LLM wrote. 1–2 sentences max.
  summary           text,

  -- Structured failure list. Each element:
  --   { category, severity (low|medium|high), viewport, location, details,
  --     suggestion }
  -- Categories are documented in lib/agent-handlers/html-critic.js
  -- (FAILURE_CATEGORIES). Stored as jsonb so iterate.js can filter on
  -- severity/category without joining a child table.
  failures          jsonb not null default '[]'::jsonb,

  -- Public URLs of the screenshots taken at each viewport.
  -- Each element: { viewport, width, url }.
  screenshot_urls   jsonb not null default '[]'::jsonb,

  -- Which vision LLM produced the score — useful for audits when model
  -- versions roll over.
  model             text,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,

  created_at        timestamptz not null default now()
);

create index if not exists idx_design_qa_results_goal      on public.design_qa_results(goal_id);
create index if not exists idx_design_qa_results_goal_iter on public.design_qa_results(goal_id, iteration);
create index if not exists idx_design_qa_results_created   on public.design_qa_results(created_at desc);

alter table public.design_qa_results enable row level security;

-- A user can read QA results for goals they own. The QA result rows are
-- written by the tool runner via the service-role admin client, so we don't
-- expose insert/update/delete to authenticated users — that would let a
-- client forge scores. Service role bypasses RLS for inserts.
drop policy if exists "Users read own design_qa_results" on public.design_qa_results;
create policy "Users read own design_qa_results"
  on public.design_qa_results for select
  using (
    goal_id is null
    or exists (
      select 1 from public.goals g
      where g.id = design_qa_results.goal_id
        and g.user_id = auth.uid()
    )
  );
