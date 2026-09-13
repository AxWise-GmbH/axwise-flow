-- 131_design_comments.sql
-- Per-element user comments on a goal's deployed landing page.
--
-- Today users have no way to course-correct mid-flight: they either submit
-- a whole new goal or open PageBuilder after deploy and edit by hand (those
-- edits never propagate back to the Designer agent). This table records
-- pinned comments on the rendered page so a single "Apply Feedback" action
-- can bundle them as an addendum to the Designer's brief and trigger a
-- targeted re-run of Designer → Developer for THIS goal — without burning
-- a full iterate cycle.

create table if not exists public.design_comments (
  id                 uuid primary key default gen_random_uuid(),
  goal_id            uuid not null references public.goals(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,

  -- DOM selector path the comment is anchored to (e.g.
  -- "body > section.hero > h1"). Generated client-side via the click handler.
  -- Brittle for arbitrary apps, fine for landing pages where the structure
  -- the LLM emits is fairly predictable.
  element_selector   text not null,

  -- Optional element snippet captured at comment time so the Designer agent
  -- can read what the user was looking at even if the next iteration changes
  -- the selector. Trimmed to 500 chars before insert (enforced in handler).
  element_text       text,

  -- The user's comment.
  comment_text       text not null,

  -- 'open'      → unaddressed, will be included in next apply-feedback
  -- 'applied'   → bundled into a Designer re-run; do not re-include
  -- 'dismissed' → user closed without applying
  -- 'stale'     → element no longer exists on a newer iteration
  status             text not null default 'open'
                     check (status in ('open', 'applied', 'dismissed', 'stale')),

  -- Which deployment URL the comment was placed on. Used to filter out
  -- comments from prior deployments after a fresh re-run replaces the URL.
  deployment_url     text,

  created_at         timestamptz not null default now(),
  applied_at         timestamptz,
  updated_at         timestamptz not null default now()
);

create index if not exists idx_design_comments_goal       on public.design_comments(goal_id);
create index if not exists idx_design_comments_goal_open  on public.design_comments(goal_id) where status = 'open';
create index if not exists idx_design_comments_user       on public.design_comments(user_id);

alter table public.design_comments enable row level security;

-- The user that owns the goal can read + write their own comments.
drop policy if exists "Users read own design_comments"   on public.design_comments;
drop policy if exists "Users insert own design_comments" on public.design_comments;
drop policy if exists "Users update own design_comments" on public.design_comments;
drop policy if exists "Users delete own design_comments" on public.design_comments;

create policy "Users read own design_comments"
  on public.design_comments for select
  using (auth.uid() = user_id);

create policy "Users insert own design_comments"
  on public.design_comments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.goals g
      where g.id = design_comments.goal_id
        and g.user_id = auth.uid()
    )
  );

create policy "Users update own design_comments"
  on public.design_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own design_comments"
  on public.design_comments for delete
  using (auth.uid() = user_id);

create or replace function public.touch_design_comments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_design_comments_updated_at on public.design_comments;
create trigger trg_design_comments_updated_at
  before update on public.design_comments
  for each row execute function public.touch_design_comments_updated_at();
