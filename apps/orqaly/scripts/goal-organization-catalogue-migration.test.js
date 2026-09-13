import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/190_goal_organization_catalogue.sql'),
  'utf8'
);

describe('goal organization catalogue migration', () => {
  it('creates organization and org-agent assignments inside one database function', () => {
    expect(sql).toMatch(/create or replace function public\.create_goal_organization/i);
    expect(sql).toMatch(/insert into public\.organizations/i);
    expect(sql).toMatch(/insert into public\.org_agents/i);
    expect(sql).toMatch(/agent_catalogue_assignment_failed/i);
  });

  it('validates explicit agents as active and owned and seeds fresh Agent Hub accounts', () => {
    expect(sql).toMatch(/a\.user_id = p_user_id/i);
    expect(sql).toMatch(/a\.status = 'active'/i);
    expect(sql).toMatch(/agent_catalogue_contains_unauthorized_agent/i);
    expect(sql).toMatch(/goal-org-bootstrap-v1/i);
  });

  it('keeps the privileged transaction private to the service role', () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public, pg_temp/i);
    expect(sql).toMatch(/revoke execute[\s\S]*from anon, authenticated/i);
    expect(sql).toMatch(/grant execute[\s\S]*to service_role/i);
  });

  it('adds the non-executing draft status used before evidence persistence', () => {
    expect(sql).toMatch(/check \(status in \([\s\S]*'draft'/i);
  });
});
