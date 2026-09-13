import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const path = 'scripts/native-preview-schema-operator.mjs';
const source = readFileSync(resolve(root, path), 'utf8');
describe('fixed preview additive schema operator guards', () => {
  it.each([[], ['delete'], ['apply', '--production'], ['inspect', '--axwise-only', 'extra']])('rejects invalid command %j before any cloud access', (...args) => {
    expect(() => execFileSync(process.execPath, [path, ...args], { cwd: root, stdio: 'pipe' })).toThrow();
  });
  it('pins project, PostgreSQL identity, baseline and committed migration hashes', () => {
    expect(source).toContain("project = 'axwise-v2-preview-001'");
    expect(source).toContain('exact_preview_identity_required');
    expect(source).toContain('baseline014_mismatch');
    expect(source).toContain('committed_migration_required');
    expect(source).toContain('committed_axwise_migration_required');
    expect(source).toContain('existing_customer_data_changed');
    expect(source).toContain('native_forced_rls_required');
    expect(source).toContain('conversation_least_privilege_required');
    expect(source).toContain('019_solution_conversations.sql');
    expect(source).toContain("'637fcfaf-3864-468b-ad36-47337b80c484'");
    expect(source).toContain("const onlyOrqaly = process.argv[3] === '--orqaly-only'");
    expect(source).toContain('if (!onlyOrqaly) {');
    expect(source).not.toMatch(/DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE\s+/i);
  });
  it('makes inspection read-only and retains credentials only in process memory', () => {
    expect(source).toContain("mode === 'inspect' ? ' READ ONLY' : ''");
    expect(source).toContain("mode === 'apply' ? 'COMMIT' : 'ROLLBACK'");
    expect(source).toContain("proxy.kill('SIGTERM')");
    expect(source).not.toMatch(/writeFile|console\.(log|error)\([^\n]*password/);
  });
});
