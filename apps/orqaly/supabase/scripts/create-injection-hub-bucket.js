/**
 * One-time setup: create the "injection-hub" storage bucket using the service role.
 * Run from project root: node supabase/scripts/create-injection-hub-bucket.js
 * Requires .env with SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL (or SUPABASE_URL).
 */
import { createClient } from '@supabase/supabase-js';
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
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const BUCKET = 'injection-hub';

async function main() {
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) {
    console.log(`Bucket "${BUCKET}" already exists.`);
    return;
  }
  const { data, error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error) {
    console.error('Create bucket failed:', error.message);
    process.exit(1);
  }
  console.log(`Bucket "${BUCKET}" created successfully.`);
  console.log('If you still get "Bucket not found" or upload errors, run the storage policies SQL in Supabase Dashboard → SQL Editor:');
  console.log('  File: supabase/migrations/024_injection_hub_storage_policies.sql');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
