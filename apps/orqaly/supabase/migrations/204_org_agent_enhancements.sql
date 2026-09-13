-- Org-scoped agent conditioning ("company conditioning" layer).
--
-- One agent row is reused across organizations. What differs per organization
-- is HOW the work should be done: brand rules, tone, templates, market and
-- compliance constraints. That lives here, derived once from the org briefing
-- and cached on briefing_hash so it is not re-derived on every goal.
--
-- Deliberately unstructured: `briefing` and `summary` are open text with no
-- fixed columns. Palette/fonts columns would fit a marketing org and fail a
-- fintech (disclosure duties), a manufacturer (safety tolerances) or a law firm
-- (citation rules). Structure lives inside the markdown, not in the schema.
--
-- Idempotent: tables/indexes/policies/triggers may be re-applied.

-- ── Organization briefing ────────────────────────────────────────────────────

create table if not exists public.organization_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Open free-text company information written by the user.
  briefing text not null default '',
  -- Open markdown summary. Generated from `briefing`, editable by the user.
  summary text not null default '',
  -- sha256 of the briefing the summary was generated from. The cache key.
  briefing_hash text check (briefing_hash is null or briefing_hash ~ '^[0-9a-f]{64}$'),
  summary_source text not null default 'axwise'
    check (summary_source in ('axwise', 'user', 'merged', 'local_llm')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_profiles_owner
  on public.organization_profiles(user_id, org_id);

-- ── Per-role / per-agent conditioning ────────────────────────────────────────

create table if not exists public.org_agent_enhancements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Normalized role identity (roleIdentityKey in team-assigner.js).
  -- Empty string = the organization-wide default applied to every agent.
  role_key text not null default '',
  -- Optional pin to one specific agent. Empty string = applies to the whole
  -- role. NOT NULL with a '' sentinel rather than a nullable column, because
  -- Postgres treats NULLs as distinct in unique constraints: a nullable column
  -- would permit unlimited duplicate role-wide rows, and ON CONFLICT cannot
  -- target an expression index over coalesce(agent_id, '').
  agent_id text not null default '',
  content text not null default '',
  source text not null default 'axwise'
    check (source in ('axwise', 'user', 'merged', 'local_llm')),
  -- Which briefing this was generated from. NULL for hand-written rows, which
  -- are never invalidated by a briefing edit.
  briefing_hash text check (briefing_hash is null or briefing_hash ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Repair path for databases that received the first cut of this migration,
-- where agent_id was nullable and uniqueness sat on an expression index.
-- ON CONFLICT cannot target an expression index, so upserts failed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'org_agent_enhancements'
      and column_name = 'agent_id'
      and is_nullable = 'YES'
  ) then
    execute 'drop index if exists public.idx_org_agent_enhancements_scope';
    execute 'update public.org_agent_enhancements set agent_id = '''' where agent_id is null';
    execute 'alter table public.org_agent_enhancements alter column agent_id set default ''''';
    execute 'alter table public.org_agent_enhancements alter column agent_id set not null';
  end if;
end $$;

-- One enhancement per scope. A real constraint (not an expression index) so
-- upserts can target it with ON CONFLICT.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'org_agent_enhancements_scope_key'
      and conrelid = 'public.org_agent_enhancements'::regclass
  ) then
    execute 'alter table public.org_agent_enhancements
             add constraint org_agent_enhancements_scope_key
             unique (org_id, role_key, agent_id)';
  end if;
end $$;

create index if not exists idx_org_agent_enhancements_owner
  on public.org_agent_enhancements(user_id, org_id)
  where is_active = true;

create index if not exists idx_org_agent_enhancements_role
  on public.org_agent_enhancements(org_id, role_key)
  where is_active = true;

-- ── updated_at maintenance ───────────────────────────────────────────────────

create or replace function public.touch_org_enhancement_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_organization_profiles_touch on public.organization_profiles;
create trigger trg_organization_profiles_touch
  before update on public.organization_profiles
  for each row execute function public.touch_org_enhancement_updated_at();

drop trigger if exists trg_org_agent_enhancements_touch on public.org_agent_enhancements;
create trigger trg_org_agent_enhancements_touch
  before update on public.org_agent_enhancements
  for each row execute function public.touch_org_enhancement_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Owner may read and write their own rows; the durable worker reaches these
-- through the service role. Same shape as migration 202.

do $$
declare
  table_name text;
begin
  foreach table_name in array array['organization_profiles', 'org_agent_enhancements']
  loop
    execute format('alter table public.%I enable row level security', table_name);

    execute format('drop policy if exists %I on public.%I', table_name || '_owner_select', table_name);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      table_name || '_owner_select', table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_owner_write', table_name);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name || '_owner_write', table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_service', table_name);
    execute format(
      'create policy %I on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
      table_name || '_service', table_name
    );
  end loop;
end $$;
