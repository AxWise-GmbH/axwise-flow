// No cloud calls. Real PostgreSQL16 operator rollback/apply/replay is exercised
// separately by solution-app-keys-postgres.mjs against an owned local container.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseMigrationMode,
  validateMigrationSources,
  validateMigrationLedger,
  assertMigrationCatalogState,
  migration014Hash,
} from './solution-app-keys-preview-migrate.mjs';

const source = readFileSync(
  'database/workflow-v2/migrations/014_solution_application_keys.sql',
  'utf8'
);
const baseline = readFileSync(
  'database/workflow-v2/migrations/013_solution_build_requests.sql',
  'utf8'
);
const sources = () => ({
  source,
  committedSource: source,
  baseline,
  committedBaseline: baseline,
  commit: 'a'.repeat(40),
});
const ledger = () =>
  Array.from({ length: 12 }, (_, index) => ({
    component: 'orqaly',
    migration_number: index + 2,
    sha256:
      index === 11
        ? 'dd5cbf3e54937670cdcd835176a06cdea2577639cf324a72cc640e6a39be8d44'
        : 'b'.repeat(64),
  }));

describe('bounded additive014 migration operator guards', () => {
  it.each(['inspect', 'apply'])('accepts only explicit %s mode', (mode) =>
    expect(parseMigrationMode([mode])).toBe(mode)
  );
  it.each([[], ['migrate'], ['apply', '--database=production'], ['inspect', 'apply']])(
    'rejects unsupported arguments %j',
    (...args) => expect(() => parseMigrationMode(args)).toThrow()
  );
  it('requires exact reviewed and committed migration bytes', () => {
    const body = validateMigrationSources(sources());
    expect(body).not.toMatch(/^BEGIN;/);
    expect(body).not.toMatch(/COMMIT;\s*$/);
    expect(body).toContain('CREATE TABLE orqaly.solution_application_keys');
  });
  it.each(['source', 'committedSource', 'baseline', 'committedBaseline', 'commit'])(
    'rejects changed %s',
    (key) => expect(() => validateMigrationSources({ ...sources(), [key]: 'changed' })).toThrow()
  );
  it('requires contiguous exact013 ledger', () => {
    expect(validateMigrationLedger(ledger())).toBe(false);
    expect(() => validateMigrationLedger(ledger().slice(1))).toThrow();
    expect(() => validateMigrationLedger(ledger().slice(0, -1))).toThrow();
  });
  it('accepts only the exact014 already-applied record', () => {
    const row = {
      component: 'orqaly',
      migration_number: 14,
      sha256: migration014Hash,
      migration_path: 'database/workflow-v2/migrations/014_solution_application_keys.sql',
    };
    expect(validateMigrationLedger([...ledger(), row])).toBe(true);
    expect(() =>
      validateMigrationLedger([...ledger(), { ...row, sha256: '0'.repeat(64) }])
    ).toThrow();
    expect(() =>
      validateMigrationLedger([...ledger(), { ...row, migration_path: 'unreviewed.sql' }])
    ).toThrow();
    expect(() =>
      validateMigrationLedger([...ledger(), row, { ...row, migration_number: 15 }])
    ).toThrow();
  });
  it('rejects wrong baseline hash and foreign component', () => {
    expect(() =>
      validateMigrationLedger(ledger().map((row) => ({ ...row, sha256: '0'.repeat(64) })))
    ).toThrow();
    expect(() =>
      validateMigrationLedger(ledger().map((row) => ({ ...row, component: 'other' })))
    ).toThrow();
  });
  it('refuses a partial/unrecorded migration before DDL', () => {
    expect(() =>
      assertMigrationCatalogState(
        [
          {
            schema: 'orqaly',
            kind: 'table',
            object: 'solution_application_keys',
            part: '',
            data: {},
          },
        ],
        false
      )
    ).toThrow('unexpected_partial_migration014_catalog');
  });
});
