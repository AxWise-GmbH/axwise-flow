-- 132_team_brand_kits_and_edits.sql
-- Persistent brand tokens at the user/team level, plus a structured log of
-- PageBuilder edits that becomes a training signal for the next goal.
--
-- Today brand-seed regenerates the palette/fonts/tone every time a goal
-- starts — every goal restarts brand decisions from scratch, and a user
-- editing a deployed page in PageBuilder teaches the AI nothing. These two
-- tables close that gap so:
--   1. brand-seed.js can reuse a team's prior brand kit instead of
--      regenerating, keeping repeat-user landing pages consistent.
--   2. pm-planning.js can fetch recent design_edits for the team and
--      inject a short summary into the Designer prompt: "users repeatedly
--      changed hero colors and removed stock photos — pre-empt those."

-- ── team_brand_kits ───────────────────────────────────────────────
create table if not exists public.team_brand_kits (
  id              uuid primary key default gen_random_uuid(),
  -- One kit per user today (Orqaly is single-user-per-account in MVP).
  -- When teams are introduced we'll add a team_id column and migrate.
  user_id         uuid not null unique references auth.users(id) on delete cascade,

  -- Palette is 6 hex strings (primary, secondary, accent, background, text, border).
  -- Stored as jsonb so brand-seed.js can read it directly without parsing.
  palette         jsonb not null default '[]'::jsonb,
  -- Two Google Font family names (primary headline + body).
  fonts           jsonb not null default '[]'::jsonb,
  -- Overall vibe string ("warm, earthy"), free-form mood words ["cozy", "premium"],
  -- target audience description, copy tone.
  vibe            text,
  mood_words      jsonb not null default '[]'::jsonb,
  target_audience text,
  tone            text,

  -- Optional logo / wordmark uploaded by the user. Stored as a public URL to
  -- a goal-deliverables file or a brand-kit-specific bucket.
  logo_url        text,

  -- Set when a vision-QA pass flagged palette_mismatch or
  -- typography_mismatch for goals using this kit — brand-seed.js treats
  -- stale kits as "regenerate" rather than reuse.
  stale_at        timestamptz,
  stale_reason    text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_team_brand_kits_user on public.team_brand_kits(user_id);

alter table public.team_brand_kits enable row level security;

drop policy if exists "Users read own brand_kit"   on public.team_brand_kits;
drop policy if exists "Users insert own brand_kit" on public.team_brand_kits;
drop policy if exists "Users update own brand_kit" on public.team_brand_kits;
drop policy if exists "Users delete own brand_kit" on public.team_brand_kits;

create policy "Users read own brand_kit"
  on public.team_brand_kits for select using (auth.uid() = user_id);
create policy "Users insert own brand_kit"
  on public.team_brand_kits for insert with check (auth.uid() = user_id);
create policy "Users update own brand_kit"
  on public.team_brand_kits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own brand_kit"
  on public.team_brand_kits for delete using (auth.uid() = user_id);

create or replace function public.touch_team_brand_kits_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_team_brand_kits_updated_at on public.team_brand_kits;
create trigger trg_team_brand_kits_updated_at
  before update on public.team_brand_kits
  for each row execute function public.touch_team_brand_kits_updated_at();

-- ── design_edits ──────────────────────────────────────────────────
-- Structured log of meaningful user edits in PageBuilder. We do NOT store
-- the raw DOM diff — that would explode in size and is hard for an LLM to
-- reason over. Instead, the API handler that receives the save action runs
-- a small classifier (or accepts client-side tags) and stores a structured
-- record: { kind: 'color_swap', from: '#3B82F6', to: '#EF4444', element: 'hero CTA' }.
-- pm-planning.js then fetches the last ~10 edits for the user and asks the
-- planner to anticipate those patterns.
create table if not exists public.design_edits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  goal_id         uuid references public.goals(id) on delete set null,
  landing_page_id uuid references public.landing_pages(id) on delete set null,

  -- Structured tags so pm-planning.js can ingest without LLM-summarising again.
  -- Examples:
  --   { kind: 'color_swap', from: '#3B82F6', to: '#EF4444', target: 'hero CTA' }
  --   { kind: 'replaced_image', target: 'feature 2' }
  --   { kind: 'rewrote_copy', target: 'hero headline' }
  --   { kind: 'resized', target: 'hero', delta: '+40%' }
  --   { kind: 'removed_section', target: 'testimonials' }
  edits           jsonb not null default '[]'::jsonb,

  -- LLM-generated one-line summary for prompts that prefer prose.
  summary         text,

  -- Only edits on goals the user later marked 'completed' (i.e. they're
  -- happy with the end state) feed into pm-planning. Edits on goals that
  -- were rejected or abandoned are kept for audit but not used as signal.
  signal_eligible boolean not null default false,

  created_at      timestamptz not null default now()
);

create index if not exists idx_design_edits_user_recent on public.design_edits(user_id, created_at desc);
create index if not exists idx_design_edits_signal     on public.design_edits(user_id, created_at desc) where signal_eligible = true;
create index if not exists idx_design_edits_goal      on public.design_edits(goal_id);

alter table public.design_edits enable row level security;

drop policy if exists "Users read own design_edits"   on public.design_edits;
drop policy if exists "Users insert own design_edits" on public.design_edits;
drop policy if exists "Users update own design_edits" on public.design_edits;

create policy "Users read own design_edits"
  on public.design_edits for select using (auth.uid() = user_id);
create policy "Users insert own design_edits"
  on public.design_edits for insert with check (auth.uid() = user_id);
create policy "Users update own design_edits"
  on public.design_edits for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
