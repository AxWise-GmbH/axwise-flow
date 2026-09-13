import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/192_agent_team_goal_isolation.sql'),
  'utf8'
);

describe('agent-team goal isolation migration', () => {
  it('backfills only unambiguous, same-owner goal links', () => {
    expect(sql).toMatch(/with unambiguous_goal_links as/i);
    expect(sql).toMatch(/not exists \([\s\S]*other\.agent_team_id = g\.agent_team_id/i);
    expect(sql).toMatch(/team\.user_id = link\.user_id/i);
    expect(sql).toMatch(/team\.goal_id is null/i);
  });

  it('keeps the team selected by goals.agent_team_id when deactivating duplicates', () => {
    expect(sql).toMatch(
      /partition by team\.goal_id[\s\S]*case when goal\.agent_team_id = team\.id then 0 else 1 end[\s\S]*team\.created_at asc/i
    );
    expect(sql).toMatch(/where active_rank > 1/i);
    expect(sql).toMatch(/set[\s\S]*is_active = false/i);
  });

  it('retains inactive teams and their historical membership rows', () => {
    expect(sql).not.toMatch(/delete\s+from\s+public\.agent_teams/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.agent_team_members/i);
  });

  it('adds the partial uniqueness boundary after duplicate cleanup', () => {
    const cleanupPosition = sql.indexOf('where active_rank > 1');
    const indexPosition = sql.indexOf('create unique index');
    expect(cleanupPosition).toBeGreaterThan(-1);
    expect(indexPosition).toBeGreaterThan(cleanupPosition);
    expect(sql).toMatch(
      /create unique index if not exists idx_agent_teams_one_active_per_goal\s+on public\.agent_teams \(goal_id\)\s+where goal_id is not null\s+and is_active = true/i
    );
  });
});
