/**
 * Apply storage policies for injection-hub bucket via Supabase Management API.
 * Run from project root: node supabase/scripts/apply-injection-hub-storage-policies.js
 * Requires .env: SUPABASE_ACCESS_TOKEN (or SUPABASE_ACCESS_TOKEN), VITE_SUPABASE_URL (for project ref).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function loadEnv() {
  const path = resolve(root, '.env');
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf8');
  const out = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const token = env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN || '';

const match = url.match(/https?:\/\/([^.]+)/);
const projectRef = match ? match[1].replace('.supabase.co', '') : null;
if (!projectRef || !token) {
  console.error('Missing VITE_SUPABASE_URL (for project ref) and SUPABASE_ACCESS_TOKEN in .env');
  process.exit(1);
}

const sql = `
drop policy if exists "injection_hub_insert" on storage.objects;
create policy "injection_hub_insert" on storage.objects for insert to authenticated with check (bucket_id = 'injection-hub');
drop policy if exists "injection_hub_select" on storage.objects;
create policy "injection_hub_select" on storage.objects for select to authenticated using (bucket_id = 'injection-hub');
drop policy if exists "injection_hub_update" on storage.objects;
create policy "injection_hub_update" on storage.objects for update to authenticated using (bucket_id = 'injection-hub');
drop policy if exists "injection_hub_delete" on storage.objects;
create policy "injection_hub_delete" on storage.objects for delete to authenticated using (bucket_id = 'injection-hub');
`.trim();

async function main() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error('Management API error:', res.status, t);
    process.exit(1);
  }
  console.log('Storage policies for injection-hub applied successfully.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
