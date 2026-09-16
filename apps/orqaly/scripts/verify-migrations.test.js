import { describe, expect, it } from 'vitest';
import { validateMigrationFiles, verifyMigrationDirectory } from './verify-migrations.mjs';

describe('migration inventory verification', () => {
  it('accepts the repository migration inventory', () => {
    expect(verifyMigrationDirectory()).toBe(0);
  });

  it('rejects gaps, duplicates, invalid names, empty SQL and conflict markers', () => {
    const errors = validateMigrationFiles([
      { name: '001_first.sql', content: 'select 1;' },
      { name: '001_duplicate.sql', content: 'select 1;' },
      { name: '003_empty.sql', content: '' },
      { name: '004_conflict.sql', content: '<<<<<<< ours\nselect 1;' },
      { name: 'bad-name.sql', content: 'select 1;' },
    ]);

    expect(errors.join('\n')).toMatch(/duplicate version/);
    expect(errors.join('\n')).toMatch(/Missing migration version/);
    expect(errors.join('\n')).toMatch(/empty migration/);
    expect(errors.join('\n')).toMatch(/merge conflict/);
    expect(errors.join('\n')).toMatch(/invalid active migration filename/);
  });
});
