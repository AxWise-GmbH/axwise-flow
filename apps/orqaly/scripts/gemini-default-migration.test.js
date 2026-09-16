import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/193_gemini_default_cleanup.sql');
const sql = readFileSync(migrationPath, 'utf8');

describe('Gemini default cleanup migration', () => {
  it('sets persisted configuration and telemetry defaults to the exact release pair', () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.concilium_members[\s\S]*DEFAULT 'gemini'[\s\S]*DEFAULT 'gemini-3\.6-flash'/
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.agent_blueprints[\s\S]*DEFAULT 'gemini'[\s\S]*DEFAULT 'gemini-3\.6-flash'/
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.concilium_evaluations[\s\S]*DEFAULT 'gemini'[\s\S]*DEFAULT 'gemini-3\.6-flash'/
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.llm_usage[\s\S]*DEFAULT 'gemini'[\s\S]*DEFAULT 'gemini-3\.6-flash'/
    );
  });

  it('backfills only complete historical configuration pairs', () => {
    expect(sql).toMatch(
      /UPDATE public\.concilium_members[\s\S]*WHERE provider = 'groq'\s+AND model = 'llama-3\.3-70b-versatile'/
    );
    expect(sql).toMatch(
      /UPDATE public\.agent_blueprints[\s\S]*WHERE provider = 'glm'\s+AND model = 'glm-5\.1'/
    );
    expect(sql).not.toMatch(/UPDATE public\.(?:concilium_evaluations|llm_usage)/);
  });
});
