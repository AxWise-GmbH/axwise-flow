-- Add category column to projects (Gambling, E-Commerce, Travel)
-- Run in Supabase SQL Editor or: supabase db push

alter table public.projects
  add column if not exists category text;

comment on column public.projects.category is 'Project category: Gambling, E-Commerce, or Travel';

create index if not exists idx_projects_category on public.projects(category);
