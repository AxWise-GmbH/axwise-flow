import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve('supabase/migrations/203_goal_research_evidence_v2.sql'), 'utf8');

describe('203 goal research evidence v2 migration', () => {
  it('adds pinned v2 identity and typed-record counts to research runs', () => {
    for (const column of [
      'evidence_profile_version',
      'evidence_profile_hash',
      'fact_manifest_hash',
      'calculation_manifest_hash',
      'fact_count',
      'calculation_count',
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
  });

  it('defines tenant-scoped fact and calculation children with backend-only writes', () => {
    for (const table of ['goal_research_facts', 'goal_research_calculations']) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`'${table}'`);
      expect(sql).toContain(`grant select on table public.${table} to authenticated`);
      expect(sql).toContain(`grant all on table public.${table} to service_role`);
    }
    expect(sql).toContain('trg_goal_research_facts_validate_scope');
    expect(sql).toContain('trg_goal_research_calculations_validate_scope');
    expect(sql).toContain('execute function public.goal_research_validate_child_scope()');
    expect(sql).toContain('for select using (auth.uid() = user_id)');
    const calculationTable = sql
      .split('create table if not exists public.goal_research_calculations (')[1]
      .split(');')[0];
    expect(calculationTable).not.toContain('claim_id text');
    const factTable = sql
      .split('create table if not exists public.goal_research_facts (')[1]
      .split(');')[0];
    expect(factTable).toContain('observed_at text not null');
    expect(factTable).not.toContain('observed_at timestamptz');
  });

  it('prevents an incomplete typed import from becoming current', () => {
    expect(sql).toContain("target.bundle_version = 'axwise_research_bundle_v2'");
    expect(sql).toContain('stored_fact_count <> target.fact_count');
    expect(sql).toContain('stored_calculation_count <> target.calculation_count');
    expect(sql).toContain('Goal research v2 typed evidence is incomplete');
    expect(sql.indexOf('Goal research v2 typed evidence is incomplete')).toBeLessThan(
      sql.indexOf("set version_status = 'superseded'")
    );
    expect(sql).toContain('pg_advisory_xact_lock');
  });
});
