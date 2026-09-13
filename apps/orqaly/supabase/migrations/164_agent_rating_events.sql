-- Agent rating activity log: an append-only record of every agent rating,
-- from BOTH sources:
--   * 'consilium' — the AI board's overall_score (0-10) on an evaluation
--   * 'user'      — a platform user's 1-5 star rating
--
-- Each rating write appends a row here via DB triggers, so the log captures
-- every write path (the ratings API handler AND direct service inserts) with
-- no application-code duplication. The log is history: a user changing their
-- star rating produces a NEW row (the current value still lives in
-- agent_ratings). Aligns with the project's immutable source-of-truth goal.

create table if not exists public.agent_rating_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  agent_id      text not null,
  source        text not null check (source in ('consilium', 'user')),
  rating_value  numeric(5, 2) not null,
  rating_scale  smallint not null,            -- 10 for consilium, 5 for user
  comment       text,
  evaluation_id uuid,                          -- set when source = 'consilium'
  board_id      text,                          -- set when source = 'consilium'
  approved      boolean,                       -- board outcome (optional)
  created_at    timestamptz not null default now()
);

create index if not exists idx_are_agent on public.agent_rating_events(agent_id, created_at desc);
create index if not exists idx_are_user  on public.agent_rating_events(user_id, created_at desc);

alter table public.agent_rating_events enable row level security;

-- Append-only: only SELECT + INSERT policies (no UPDATE/DELETE) so the log
-- cannot be rewritten from the client.
drop policy if exists "are_user_select" on public.agent_rating_events;
create policy "are_user_select" on public.agent_rating_events
  for select using (auth.uid() = user_id);

drop policy if exists "are_user_insert" on public.agent_rating_events;
create policy "are_user_insert" on public.agent_rating_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "are_service_all" on public.agent_rating_events;
create policy "are_service_all" on public.agent_rating_events
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── Trigger: user star ratings → rating events ───────────────────────────
-- Fires on insert AND update of agent_ratings so every rating change is logged.
-- SECURITY DEFINER so the function can append under RLS regardless of caller.
create or replace function public.log_user_rating_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_rating_events
    (user_id, agent_id, source, rating_value, rating_scale, comment)
  values
    (new.user_id, new.agent_id, 'user', new.rating, 5, new.comment);
  return new;
end;
$$;

drop trigger if exists trg_agent_ratings_to_events on public.agent_ratings;
create trigger trg_agent_ratings_to_events
  after insert or update of rating, comment on public.agent_ratings
  for each row execute function public.log_user_rating_event();

-- ── Trigger: Consilium evaluations → rating events ───────────────────────
-- Logs the board's overall_score (0-10) against the evaluated agent. Only when
-- agent_id is present (some evaluations are not agent-scoped).
create or replace function public.log_consilium_rating_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.agent_id is null then
    return new;
  end if;
  insert into public.agent_rating_events
    (user_id, agent_id, source, rating_value, rating_scale, evaluation_id, board_id, approved)
  values
    (new.user_id, new.agent_id, 'consilium', coalesce(new.overall_score, 0), 10,
     new.id, coalesce(new.board_id, new.concilium_id), new.approved);
  return new;
end;
$$;

drop trigger if exists trg_concilium_eval_to_rating_events on public.concilium_evaluations;
create trigger trg_concilium_eval_to_rating_events
  after insert on public.concilium_evaluations
  for each row execute function public.log_consilium_rating_event();
