import assert from 'node:assert/strict';
import test from 'node:test';
import { withTenantTransaction } from '../src/db/pool.js';
import { principal } from './fixtures.js';

function fakePool({ failOperation = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push({ sql: 'RELEASE' });
    },
  };
  return {
    calls,
    client,
    pool: {
      async connect() {
        return client;
      },
    },
    operation: async () => {
      if (failOperation) throw new Error('operation_failed');
      return 'done';
    },
  };
}

test('tenant transaction applies transaction-local identity and commits', async () => {
  const fixture = fakePool();
  assert.equal(await withTenantTransaction(fixture.pool, principal(), fixture.operation), 'done');
  assert.equal(fixture.calls[0].sql, 'BEGIN');
  assert.match(fixture.calls[1].sql, /set_config\('app\.organization_id'/);
  assert.match(fixture.calls[1].sql, /set_config\('search_path', 'agentic,pg_catalog', true\)/);
  assert.deepEqual(fixture.calls[1].params, [
    'org-1',
    'workspace-1',
    'user-1',
    'user',
    'request-1',
  ]);
  assert.equal(fixture.calls.at(-2).sql, 'COMMIT');
  assert.equal(fixture.calls.at(-1).sql, 'RELEASE');
});

test('tenant transaction rolls back and releases on failure', async () => {
  const fixture = fakePool({ failOperation: true });
  await assert.rejects(() => withTenantTransaction(fixture.pool, principal(), fixture.operation));
  assert.equal(fixture.calls.at(-2).sql, 'ROLLBACK');
  assert.equal(fixture.calls.at(-1).sql, 'RELEASE');
});
