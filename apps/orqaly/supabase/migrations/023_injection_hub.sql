-- Injection HUB: materials and translation job metadata
-- Storage bucket "injection-hub" create via Dashboard or at runtime (see injectionHubService.js)

create table if not exists public.injection_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  campaign_id text,
  campaign_name text,
  injection_type_ids jsonb not null default '[]',
  injection_config jsonb default '{}',
  source_path text,
  merged_path text,
  file_names jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_injection_materials_user_id on public.injection_materials(user_id);
create index if not exists idx_injection_materials_created_at on public.injection_materials(created_at desc);

alter table public.injection_materials enable row level security;

create policy "Users can manage own injection materials"
  on public.injection_materials for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional: translation jobs (can store output path and target langs)
create table if not exists public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  source_path text,
  output_path text,
  source_lang text,
  target_langs jsonb not null default '[]',
  file_count int default 0,
  status text default 'completed',
  created_at timestamptz default now()
);

create index if not exists idx_translation_jobs_user_id on public.translation_jobs(user_id);

alter table public.translation_jobs enable row level security;

create policy "Users can manage own translation jobs"
  on public.translation_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
