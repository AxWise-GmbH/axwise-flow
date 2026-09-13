-- 116_key_imports_bucket.sql
-- Supabase Storage bucket for user-uploaded key-import documents (.env / .json / .csv).
-- Private bucket, path convention: {user_id}/{uuid}.{ext}

insert into storage.buckets (id, name, public)
values ('user-key-imports', 'user-key-imports', false)
on conflict (id) do nothing;

-- RLS on storage.objects — users can only access their own folder
drop policy if exists "Users read own key imports"   on storage.objects;
drop policy if exists "Users insert own key imports" on storage.objects;
drop policy if exists "Users delete own key imports" on storage.objects;

create policy "Users read own key imports"
  on storage.objects for select
  using (
    bucket_id = 'user-key-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users insert own key imports"
  on storage.objects for insert
  with check (
    bucket_id = 'user-key-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own key imports"
  on storage.objects for delete
  using (
    bucket_id = 'user-key-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
