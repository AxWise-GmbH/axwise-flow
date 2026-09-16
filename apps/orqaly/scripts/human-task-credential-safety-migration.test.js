import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/213_human_tasks_manual_checkpoint_safety.sql'),
  'utf8'
);

describe('human task credential checkpoint migration', () => {
  it('removes direct authenticated updates while retaining owner-select policy', () => {
    expect(migration).toMatch(
      /DROP POLICY IF EXISTS\s+"human_tasks_update_own"\s+ON public\.human_tasks/i
    );
    expect(migration).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.human_tasks FROM PUBLIC, anon, authenticated/i
    );
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.human_tasks TO authenticated/i);
    expect(migration).toMatch(/GRANT ALL PRIVILEGES ON TABLE public\.human_tasks TO service_role/i);
    expect(migration).not.toMatch(/DROP POLICY[^;]*human_tasks_select_own/i);
  });

  it('backfills and enforces owner-only state for every active credential task', () => {
    expect(migration).toMatch(/UPDATE public\.human_tasks/i);
    expect(migration).toMatch(/escalation_allowed\s*=\s*false/i);
    expect(migration).toMatch(/escalate_after_seconds\s*=\s*NULL/i);
    expect(migration).toContain('human_tasks_active_credential_owner_only');
    expect(migration).toMatch(
      /type IN \('provide_credential', 'provide_key', 'manual_signup'\)[\s\S]*status IN \('pending', 'claimed'\)/i
    );
    expect(migration).not.toMatch(
      /WHERE type IN \('provide_credential', 'provide_key', 'manual_signup'\)[^;]*reason_code/is
    );
    const ownerOnlyBackfill = migration.match(
      /UPDATE public\.human_tasks[\s\S]*?WHERE type IN \('provide_credential', 'provide_key', 'manual_signup'\)[\s\S]*?;/i
    )?.[0];
    expect(ownerOnlyBackfill).not.toMatch(/escalated_at\s*=\s*NULL/i);
    expect(ownerOnlyBackfill).toMatch(
      /escalation_allowed\s*=\s*true OR escalate_after_seconds IS NOT NULL/i
    );
  });

  it('releases only failed legacy dispatch sentinels for owner retry', () => {
    expect(migration).toMatch(/escalated_at\s*=\s*NULL/i);
    for (const status of [
      'no_rentahuman_key',
      'budget_exceeded',
      'origin_not_allowlisted',
      'submit_failed',
    ]) {
      expect(migration).toContain(`'${status}'`);
    }
    expect(migration).not.toMatch(/escalation_result\s*->>\s*'status'[^;]*'submitted'/is);
    expect(migration).not.toMatch(/escalation_result\s*->>\s*'status'[^;]*'dispatching'/is);
    expect(migration).toMatch(
      /WHERE type IN \('provide_credential', 'provide_key', 'manual_signup'\)[\s\S]*?AND status IN \('pending', 'claimed'\)[\s\S]*?AND escalated_at IS NOT NULL[\s\S]*?AND escalation_result/is
    );
  });

  it('deduplicates active goal/tool checkpoints before adding a partial unique index', () => {
    expect(migration).toMatch(/row_number\(\) OVER/i);
    expect(migration).toContain('idx_human_tasks_active_credential_goal_tool');
    expect(migration).toMatch(/CREATE UNIQUE INDEX/i);
    expect(migration.match(/escalated_at IS NULL/gi)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toMatch(/credential_completion' ->> 'status', ''\) = 'storing' DESC/i);
    expect(migration).toMatch(
      /duplicate_rank > 1[\s\S]*credential_completion' ->> 'status', ''\) <> 'storing'/i
    );
    const uniqueIndex = migration.slice(migration.indexOf('CREATE UNIQUE INDEX'));
    expect(uniqueIndex).not.toMatch(/credential_completion/i);
    expect(migration.indexOf('duplicate_rank > 1')).toBeLessThan(
      migration.indexOf('CREATE UNIQUE INDEX')
    );
  });
});
