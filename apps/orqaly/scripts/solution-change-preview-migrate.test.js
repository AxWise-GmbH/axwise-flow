// Source/ledger guards are local and never contact a database or GCP.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  applyChangeMigrations,
  CHANGE_MIGRATION_HASHES,
  parseChangeMigrationMode,
  validateChangeLedger,
  validateChangeSources,
} from './solution-change-preview-migrate.mjs';

const commit = 'a'.repeat(40);
const records = readdirSync('database/workflow-v2/migrations')
  .filter(
    (name) =>
      /^\d{3}_/.test(name) && Number(name.slice(0, 3)) >= 2 && Number(name.slice(0, 3)) <= 21
  )
  .sort()
  .map((name) => {
    const path = `database/workflow-v2/migrations/${name}`;
    const source = readFileSync(path, 'utf8');
    return { number: Number(name.slice(0, 3)), path, source, committedSource: source };
  });
const sources = validateChangeSources(records, commit);
const ledger = (through = 19) =>
  sources
    .filter((source) => source.number <= through)
    .map((source) => ({
      component: 'orqaly',
      migration_number: source.number,
      migration_path: source.path,
      sha256: source.digest,
    }));
describe('fixed preview020021 guards', () => {
  it('requires exactly one explicit mode', () => {
    expect(parseChangeMigrationMode(['inspect'])).toBe('inspect');
    expect(parseChangeMigrationMode(['apply'])).toBe('apply');
    for (const args of [[], ['apply', 'other'], ['provision']])
      expect(() => parseChangeMigrationMode(args)).toThrow();
  });
  it('pins exact reviewed targets and ordered historical source bytes', () => {
    expect(sources.slice(-2).map((entry) => entry.digest)).toEqual(
      Object.values(CHANGE_MIGRATION_HASHES)
    );
    expect(sources.at(-1).sql.startsWith('BEGIN;')).toBe(false);
    expect(() => validateChangeSources(records.slice(1), commit)).toThrow();
    expect(() => validateChangeSources([...records].reverse(), commit)).toThrow();
    expect(() => validateChangeSources(records, 'HEAD')).toThrow();
  });
  it('rejects dirty, replaced or injected reviewed source', () => {
    for (const mutation of [
      { source: `${records.at(-1).source}\n` },
      { source: `${records.at(-1).source}\n`, committedSource: `${records.at(-1).source}\n` },
      { path: 'database/workflow-v2/migrations/../../021_other.sql' },
    ])
      expect(() =>
        validateChangeSources([...records.slice(0, -1), { ...records.at(-1), ...mutation }], commit)
      ).toThrow();
  });
  it('accepts only contiguous019 or021 ledger', () => {
    expect(validateChangeLedger(ledger(), sources)).toBe(19);
    expect(validateChangeLedger(ledger(21), sources)).toBe(21);
    for (const rows of [
      ledger(20),
      ledger().slice(1),
      ledger().slice(0, -1),
      [...ledger(), ledger()[0]],
    ])
      expect(() => validateChangeLedger(rows, sources)).toThrow();
  });
  it('rejects historical migration hash, path or component tampering', () => {
    for (const mutation of [
      { sha256: 'f'.repeat(64) },
      { migration_path: 'wrong.sql' },
      { component: 'axwise' },
    ])
      expect(() =>
        validateChangeLedger([{ ...ledger()[0], ...mutation }, ...ledger().slice(1)], sources)
      ).toThrow();
  });
  it('revalidates executable SQL before any database operation', async () => {
    const db = {
      query() {
        throw new Error('database_must_not_be_reached');
      },
    };
    for (const mutation of [
      { sql: `${sources.at(-1).sql}\nDROP TABLE orqaly.tenants;` },
      { digest: 'f'.repeat(64) },
    ])
      await expect(
        applyChangeMigrations(db, {
          mode: 'apply',
          commit,
          sources: [...sources.slice(0, -1), { ...sources.at(-1), ...mutation }],
        })
      ).rejects.toThrow('validated_source_digest_and_sql_required');
  });
});
