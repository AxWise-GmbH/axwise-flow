-- 182_partner_entities.sql
-- Partners ready-business: a DB-backed, config-driven, polymorphic entity
-- platform. A record has an entity_type (partner|supplier|warehouse|crm) and
-- each type carries its own personalized fields/filters/metrics. Also moves
-- ready-business activation out of localStorage into the database.
--
-- Idempotent: safe to re-run (create ... if not exists / drop policy if exists).

-- ── Per-user type config (personalized fields / filters / metrics) ──────────
create table if not exists public.partner_entity_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type_key text not null,                 -- partner | supplier | warehouse | crm | <custom>
  label text,
  icon text,
  color text,
  description text,
  sort_order int not null default 0,
  is_system boolean not null default false,
  fields jsonb not null default '[]'::jsonb,   -- array of field defs
  filters jsonb not null default '[]'::jsonb,  -- array of filter defs
  metrics jsonb not null default '[]'::jsonb,  -- array of metric defs
  metadata jsonb not null default '{}'::jsonb, -- seeding flags etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, type_key)
);
create index if not exists idx_partner_entity_types_user
  on public.partner_entity_types(user_id, sort_order);

alter table public.partner_entity_types enable row level security;
drop policy if exists "partner_entity_types_owner_all" on public.partner_entity_types;
create policy "partner_entity_types_owner_all" on public.partner_entity_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "partner_entity_types_service" on public.partner_entity_types;
create policy "partner_entity_types_service" on public.partner_entity_types
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── Polymorphic entity records ──────────────────────────────────────────────
create table if not exists public.partner_entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  entity_type_key text not null,          -- logical ref to partner_entity_types.type_key
  name text not null,
  status text not null default 'active',
  tags text[] not null default '{}',
  data jsonb not null default '{}'::jsonb, -- personalized field values
  source_entity_id uuid references public.partner_entities(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_partner_entities_user_type
  on public.partner_entities(user_id, entity_type_key);
create index if not exists idx_partner_entities_data_gin
  on public.partner_entities using gin (data);
create index if not exists idx_partner_entities_name
  on public.partner_entities (lower(name));

alter table public.partner_entities enable row level security;
drop policy if exists "partner_entities_owner_all" on public.partner_entities;
create policy "partner_entities_owner_all" on public.partner_entities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "partner_entities_service" on public.partner_entities;
create policy "partner_entities_service" on public.partner_entities
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── DB-backed ready-business activation (replaces localStorage) ─────────────
create table if not exists public.user_business_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  module_id text not null,                -- e.g. 'partners', 'gambling'
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_id)
);
create index if not exists idx_user_business_modules_user
  on public.user_business_modules(user_id);

alter table public.user_business_modules enable row level security;
drop policy if exists "user_business_modules_owner_all" on public.user_business_modules;
create policy "user_business_modules_owner_all" on public.user_business_modules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_business_modules_service" on public.user_business_modules;
create policy "user_business_modules_service" on public.user_business_modules
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
