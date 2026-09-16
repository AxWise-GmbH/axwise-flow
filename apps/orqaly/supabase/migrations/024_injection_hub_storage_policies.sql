-- Storage policies for injection-hub bucket (used by Injection page).
-- Create the bucket "injection-hub" in Supabase Dashboard → Storage if it does not exist yet.
-- These policies allow authenticated users to upload, read, and delete objects in the bucket.

drop policy if exists "injection_hub_insert" on storage.objects;
create policy "injection_hub_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'injection-hub');

drop policy if exists "injection_hub_select" on storage.objects;
create policy "injection_hub_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'injection-hub');

drop policy if exists "injection_hub_update" on storage.objects;
create policy "injection_hub_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'injection-hub');

drop policy if exists "injection_hub_delete" on storage.objects;
create policy "injection_hub_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'injection-hub');
