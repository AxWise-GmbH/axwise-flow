/**
 * Shared Supabase admin client for CLI scripts.
 * Loads env from .env.local (preferred) or .env and builds a service-role client.
 *
 * Usage:
 *   import { admin } from './_lib/admin-client.mjs';
 *   const { data } = await admin.from('goals').select('*').limit(1);
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Prefer .env.local, fall back to .env. Do not override existing process.env.
const envLocal = resolve(process.cwd(), '.env.local');
if (existsSync(envLocal)) config({ path: envLocal });
config(); // .env (if present)

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Checked .env.local and .env in', process.cwd());
  process.exit(1);
}

export const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const SUPABASE_URL = url;
