// Local source guards only; no cloud, database or provider calls.
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import {
  applyControlsMigrations,
  assertControlsCatalogState,
  parseControlsArguments,
  validateControlsLedger,
  validateControlsManifest,
  validateControlsSources,
} from './solution-controls-preview-migrate.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const records = readdirSync('database/workflow-v2/migrations')
  .filter(
    (name) =>
      /^\d{3}_/.test(name) && Number(name.slice(0, 3)) >= 2 && Number(name.slice(0, 3)) <= 23
  )
  .sort()
  .map((name) => {
    const path = `database/workflow-v2/migrations/${name}`,
      source = readFileSync(path, 'utf8');
    return { number: Number(name.slice(0, 3)), path, source, committedSource: source };
  });
const manifest = {
  commit: 'a'.repeat(40),
  hashes: Object.fromEntries(
    records
      .filter((record) => record.number >= 22)
      .map((record) => [record.number, sha(record.source)])
  ),
};
const sources = validateControlsSources(records, manifest);
const args = [
  'inspect',
  `--source-commit=${manifest.commit}`,
  `--migration022-sha256=${manifest.hashes[22]}`,
  `--migration023-sha256=${manifest.hashes[23]}`,
];
const ledger = (through = 21) =>
  sources
    .filter((entry) => entry.number <= through)
    .map((entry) => ({
      component: 'orqaly',
      migration_number: entry.number,
      migration_path: entry.path,
      sha256: entry.digest,
    }));
describe('fixed preview022023 operator guards', () => {
  it('requires explicit mode and a complete reviewed manifest', () => {
    expect(parseControlsArguments(args)).toEqual({ mode: 'inspect', manifest });
    expect(parseControlsArguments(['apply', ...args.slice(1)]).mode).toBe('apply');
    for (const invalid of [
      [],
      ['apply'],
      ['provision', ...args.slice(1)],
      args.slice(0, -1),
      [...args, '--force'],
      [args[0], args[1], args[2], args[2]],
    ])
      expect(() => parseControlsArguments(invalid)).toThrow();
  });
  it('rejects symbolic commits, malformed hashes and extra scope parameters', () => {
    for (const bad of [
      { ...manifest, commit: 'HEAD' },
      { ...manifest, project: 'other' },
      { ...manifest, hashes: { ...manifest.hashes, 24: 'a'.repeat(64) } },
      { ...manifest, hashes: { ...manifest.hashes, 22: 'missing' } },
    ])
      expect(() => validateControlsManifest(bad)).toThrow();
  });
  it('requires every ordered source002 through023 and unchanged committed bytes', () => {
    expect(sources).toHaveLength(22);
    for (const invalid of [
      records.slice(1),
      [...records].reverse(),
      [...records, records[0]],
      [...records.slice(0, -1), { ...records.at(-1), source: `${records.at(-1).source}\n` }],
    ])
      expect(() => validateControlsSources(invalid, manifest)).toThrow();
  });
  it('rejects replaced target SQL even when a different byte sequence is committed', () => {
    const source = records.at(-1).source.replace('CREATE TABLE', 'DROP TABLE');
    expect(() =>
      validateControlsSources(
        [...records.slice(0, -1), { ...records.at(-1), source, committedSource: source }],
        manifest
      )
    ).toThrow();
  });
  it('rejects traversal and number/path mismatches', () => {
    for (const path of [
      'database/workflow-v2/migrations/../../023.sql',
      'database/workflow-v2/migrations/022_wrong.sql',
    ])
      expect(() =>
        validateControlsSources([...records.slice(0, -1), { ...records.at(-1), path }], manifest)
      ).toThrow();
  });
  it('accepts only complete021 or023 ledger, never partially applied022', () => {
    expect(validateControlsLedger(ledger(), sources)).toBe(21);
    expect(validateControlsLedger(ledger(23), sources)).toBe(23);
    for (const rows of [ledger(22), ledger(20), ledger().slice(1), [...ledger(), ledger()[0]]])
      expect(() => validateControlsLedger(rows, sources)).toThrow();
  });
  it('checks all historical path/hash/component bindings', () => {
    for (const mutation of [
      { sha256: 'f'.repeat(64) },
      { migration_path: 'other.sql' },
      { component: 'axwise' },
    ])
      expect(() =>
        validateControlsLedger([{ ...ledger()[0], ...mutation }, ...ledger().slice(1)], sources)
      ).toThrow();
  });
  it('rejects executable SQL or digest tampering before any database call', async () => {
    const db = { query: vi.fn() };
    for (const mutation of [
      { sql: `${sources.at(-1).sql}\nDROP TABLE orqaly.tenants;` },
      { digest: 'f'.repeat(64) },
    ])
      await expect(
        applyControlsMigrations(db, {
          mode: 'apply',
          manifest,
          sources: [...sources.slice(0, -1), { ...sources.at(-1), ...mutation }],
        })
      ).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
  it('refuses any partial new catalog at a021 ledger', () => {
    const baseline = [
      {
        kind: 'constraint',
        schema: 'workflow_v2_release',
        object: 'applied_additive_migrations',
        part: 'applied_additive_migrations_migration_number_check',
        data: { definition: 'CHECK (((migration_number >= 2) AND (migration_number <= 21)))' },
      },
    ];
    expect(() => assertControlsCatalogState(baseline, false)).not.toThrow();
    for (const addition of [
      { kind: 'table', object: 'solution_failure_probes' },
      { kind: 'function', object: 'guard_revision_connection_pending' },
      { kind: 'trigger', object: 'solution_revisions', part: 'revision_connection_pending_guard' },
    ])
      expect(() =>
        assertControlsCatalogState([...baseline, { schema: 'orqaly', ...addition }], false)
      ).toThrow();
  });
});
