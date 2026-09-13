import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public experiences migration bootstrap safety', () => {
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
  const historicalSchedulingSql = readFileSync(
    resolve(migrationsDir, '022_public_scheduling_link.sql'),
    'utf8'
  );
  const repairSql = readFileSync(
    resolve(migrationsDir, '189_public_experiences_schema_repair.sql'),
    'utf8'
  );

  it('keeps every active SQL migration on the Supabase filename contract', () => {
    const invalidNames = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .filter((name) => !/^\d+_[a-z0-9_]+\.sql$/.test(name));

    expect(invalidNames).toEqual([]);
  });

  it('defers historical scheduling changes when the base table is absent', () => {
    expect(historicalSchedulingSql).toContain(
      "if to_regclass('public.booking_profiles') is null then"
    );
    expect(historicalSchedulingSql).toContain(
      'deferring public scheduling columns to migration 189'
    );
    expect(historicalSchedulingSql).toMatch(/return;\s*end if;/i);
  });

  it('repairs the complete booking and public-page schema idempotently', () => {
    for (const table of [
      'booking_profiles',
      'availability_rules',
      'availability_overrides',
      'meeting_bookings',
      'public_pages',
    ]) {
      expect(repairSql).toContain(`create table if not exists public.${table}`);
    }

    for (const column of [
      'public_token',
      'buffer_before_minutes',
      'buffer_after_minutes',
      'role',
      'avatar_url',
      'max_bookings_per_day',
    ]) {
      expect(repairSql).toContain(`add column if not exists ${column}`);
    }

    expect(repairSql).toContain('drop policy if exists "Public insert meeting_bookings"');
    expect(repairSql).toContain('drop policy if exists "Public can read published public_pages"');
  });

  it('retains the invalid historical sources outside the active migration set', () => {
    const legacyDir = resolve(migrationsDir, 'legacy');
    expect(readdirSync(legacyDir).sort()).toEqual([
      '012a_public_booking.sql.legacy',
      '012b_public_pages.sql.legacy',
      '02195000000000_public_booking.sql.legacy',
    ]);
  });
});

describe('historical migration dependency ordering', () => {
  it('creates report_snapshots.user_id before migration 038 scopes its policy', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/038_fix_rls_policies.sql'),
      'utf8'
    );
    const columnOffset = sql.indexOf('ADD COLUMN IF NOT EXISTS user_id');
    const policyOffset = sql.indexOf('CREATE POLICY "Users manage own report_snapshots"');

    expect(columnOffset).toBeGreaterThan(-1);
    expect(policyOffset).toBeGreaterThan(columnOffset);
  });

  it('drops both feature-flag policy names before recreating them in migration 038', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/038_fix_rls_policies.sql'),
      'utf8'
    );

    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated users read feature_flags"');
    expect(sql).toContain('DROP POLICY IF EXISTS "Service role manages feature_flags"');
  });

  it('uses schema-unique index names for concilium agents', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/047_concilium_agents.sql'),
      'utf8'
    );

    expect(sql).not.toMatch(/CREATE INDEX(?: IF NOT EXISTS)? idx_agents_/);
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_concilium_agents_user_id');
  });

  it('defines the dashboard-era team_tasks table before migration 053 alters it', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/053_team_tasks_job_link.sql'),
      'utf8'
    );
    const createOffset = sql.indexOf('create table if not exists public.team_tasks');
    const alterOffset = sql.indexOf('alter table public.team_tasks');

    expect(createOffset).toBeGreaterThan(-1);
    expect(alterOffset).toBeGreaterThan(createOffset);
    expect(sql).toContain('prompt_version_id uuid');
  });

  it('converges the legacy notifications table before loop indexes use new columns', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/135_loop_switch.sql'),
      'utf8'
    );
    const alterOffset = sql.indexOf('alter table public.notifications');
    const indexOffset = sql.indexOf('idx_notifications_user_unread');

    expect(alterOffset).toBeGreaterThan(-1);
    expect(indexOffset).toBeGreaterThan(alterOffset);
    expect(sql).toContain('add column if not exists event_type');
    expect(sql).toContain('add column if not exists read_at');
    expect(sql).toContain('add column if not exists created_at');
  });

  it('defines and auth-syncs public.users before communicator security extends it', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/144_communicator_security.sql'),
      'utf8'
    );
    const createOffset = sql.indexOf('create table if not exists public.users');
    const roleOffset = sql.indexOf(
      'alter table if exists public.users\n  add column if not exists role'
    );

    expect(createOffset).toBeGreaterThan(-1);
    expect(roleOffset).toBeGreaterThan(createOffset);
    expect(sql).toContain('create or replace function public.sync_auth_user_profile()');
    expect(sql).toContain('create trigger trg_auth_users_sync_profile');
    expect(sql).toContain('create policy "users_owner_select"');
    expect(sql).toContain('add column if not exists updated_at');
  });

  it('seeds payouts through the canonical generated-share schema', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/seed.sql'), 'utf8');
    const payoutSection = sql.slice(sql.indexOf('SECTION 5: PAYOUTS'));

    expect(payoutSection).toContain(
      'id, gross_amount, currency, status, paid_at, created_at, updated_at'
    );
    expect(payoutSection).not.toContain('total_amount');
    expect(payoutSection).not.toMatch(/INSERT INTO public\.payouts \([\s\S]*agent_share/);
  });
});
