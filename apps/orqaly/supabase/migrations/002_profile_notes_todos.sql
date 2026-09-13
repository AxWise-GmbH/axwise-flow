-- Profile notes and todos, scoped to the authenticated user.
-- Run in Supabase Dashboard → SQL Editor: paste this file and run.
-- Required for Settings → Profile notes & todo list to persist in the database.
-- If not run, the app falls back to localStorage automatically.

-- Profile notes: one row per note, owned by user
create table if not exists public.profile_notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  created_at timestamptz default now()
);

create index if not exists idx_profile_notes_user_id on public.profile_notes(user_id);
create index if not exists idx_profile_notes_created_at on public.profile_notes(created_at desc);

-- Profile todos: one row per task, owned by user
create table if not exists public.profile_todos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  done boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists idx_profile_todos_user_id on public.profile_todos(user_id);
create index if not exists idx_profile_todos_created_at on public.profile_todos(created_at desc);

-- RLS
alter table public.profile_notes enable row level security;
alter table public.profile_todos enable row level security;

create policy "Users can manage own profile_notes" on public.profile_notes
  for all using (user_id = auth.uid());

create policy "Users can manage own profile_todos" on public.profile_todos
  for all using (user_id = auth.uid());
