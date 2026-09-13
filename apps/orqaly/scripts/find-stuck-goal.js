#!/usr/bin/env node
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env.local') });

const { buildSupabaseAdminClient } = await import('../api/_lib/supabase-server.js');
const admin = buildSupabaseAdminClient();
if (!admin) {
  console.error('no admin client');
  process.exit(1);
}

const { data, error } = await admin
  .from('goals')
  .select('id, title, status, user_id, updated_at, created_at')
  .ilike('title', '%Casino%')
  .order('updated_at', { ascending: false })
  .limit(10);

if (error) {
  console.error('query error:', error.message);
  process.exit(1);
}

console.log(`Found ${data?.length || 0} goals matching '%Casino%':`);
for (const g of data || []) {
  console.log(`  ${g.id}  status=${g.status.padEnd(14)} updated=${g.updated_at}  title=${g.title}`);
}
