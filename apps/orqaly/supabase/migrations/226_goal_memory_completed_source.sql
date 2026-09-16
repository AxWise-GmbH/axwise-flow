-- Goal memory may steer planning only while its exact source goal remains
-- completed and owned by the same explicitly requested user. Keep the live
-- source join in the RPC so completed -> cancelled takes effect immediately;
-- stored memory rows remain an audit/index artifact and need no cleanup race.

begin;

-- The application re-reads the source before indexing, but embeddings are
-- generated asynchronously. Enforce the same invariant at write time so a
-- cancellation racing that work cannot leave a newly forged/stale row.
create or replace function public.guard_goal_memory_completed_source()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1
    from public.goals as source_goal
    where source_goal.id = new.goal_id
      and source_goal.user_id = new.user_id
      and source_goal.status = 'completed'
  ) then
    raise check_violation using
      message = 'goal_memory source must be a currently completed goal owned by the same user';
  end if;

  return new;
end;
$$;

drop trigger if exists goal_memory_completed_source_guard on public.goal_memory;
create trigger goal_memory_completed_source_guard
before insert or update of user_id, goal_id on public.goal_memory
for each row execute function public.guard_goal_memory_completed_source();

drop policy if exists "goal_memory_owner_insert" on public.goal_memory;
create policy "goal_memory_owner_insert" on public.goal_memory
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.goals as source_goal
      where source_goal.id = goal_memory.goal_id
        and source_goal.user_id = goal_memory.user_id
        and source_goal.status = 'completed'
    )
  );

create or replace function public.match_goal_memory(
  query_embedding extensions.vector(384),
  match_user_id uuid,
  match_business_type text default null,
  match_count int default 8
)
returns table (
  id uuid,
  goal_id uuid,
  kind text,
  content text,
  metadata jsonb,
  created_at timestamptz,
  business_type text,
  similarity float
)
language sql
stable
set search_path = pg_catalog, extensions
as $$
  select
    gm.id,
    gm.goal_id,
    gm.kind,
    gm.content,
    gm.metadata,
    gm.created_at,
    gm.business_type,
    1 - (gm.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.goal_memory as gm
  inner join public.goals as source_goal
    on source_goal.id = gm.goal_id
   and source_goal.user_id = gm.user_id
  where gm.user_id = match_user_id
    and source_goal.user_id = match_user_id
    and source_goal.status = 'completed'
    and (match_business_type is null or gm.business_type = match_business_type)
    and gm.embedding is not null
  order by gm.embedding operator(extensions.<=>) query_embedding
  limit match_count;
$$;

commit;
