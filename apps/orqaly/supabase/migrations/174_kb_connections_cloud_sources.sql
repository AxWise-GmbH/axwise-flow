-- 174: widen kb_connections.source_type to add cloud sources.
--
-- Adds Dropbox, OneDrive and Mega to the allowed KB source types. 173 defined
-- the inline CHECK (Postgres named it kb_connections_source_type_check); here we
-- drop + recreate it with the wider allow-list. Idempotent + additive.
--
-- Run in the Supabase SQL Editor (see supabase/README.md).

alter table public.kb_connections
  drop constraint if exists kb_connections_source_type_check;

alter table public.kb_connections
  add constraint kb_connections_source_type_check
  check (source_type in ('notion','obsidian','google-drive','dropbox','onedrive','mega'));
