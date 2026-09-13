import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/200_job_pool_persistence_repair.sql'),
  'utf8'
);

describe('Job Pool persistence repair migration', () => {
  it('recreates both client persistence tables idempotently', () => {
    expect(sql).toMatch(/create table if not exists public\.job_requests/i);
    expect(sql).toMatch(/create table if not exists public\.teams/i);
    expect(sql).toMatch(/agents\s+jsonb not null default '\[\]'::jsonb/i);
    expect(sql).toMatch(/data\s+jsonb not null default '\{\}'::jsonb/i);
  });

  it('uses user ownership instead of a role-wide authenticated policy', () => {
    expect(sql).toMatch(/create policy job_requests_owner_all[\s\S]*auth\.uid\(\) = user_id/i);
    expect(sql).toMatch(/create policy teams_owner_all[\s\S]*auth\.uid\(\) = user_id/i);
    expect(sql).not.toMatch(/using \(auth\.role\(\) = 'authenticated'\)/i);
  });

  it('keeps the legacy catalogue separate from execution agent_teams', () => {
    expect(sql).not.toMatch(/create table if not exists public\.agent_teams/i);
    expect(sql).not.toMatch(/alter table public\.agent_teams/i);
  });
});
