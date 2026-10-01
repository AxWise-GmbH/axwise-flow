import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBatchActions } from './batch-actions.mjs';

test('executeBatchActions executes wait and sequencing within expected bounds', async () => {
  const actions = [
    { type: 'wait', ms: 30 },
    { type: 'wait', ms: 40 },
  ];

  const res = await executeBatchActions(actions, { defaultDelayMs: 0 });

  assert.equal(res.ok, true);
  assert.equal(res.totalActions, 2);
  assert.equal(res.executedCount, 2);
  assert.equal(res.successCount, 2);
  assert.ok(res.durationMs >= 60, `Duration should be >= 60ms, got ${res.durationMs}`);
  assert.equal(res.results.length, 2);
  assert.equal(res.results[0].status, 'ok');
  assert.equal(res.results[1].status, 'ok');
});

test('executeBatchActions halts on unknown action type when stopOnError is true', async () => {
  const actions = [
    { type: 'wait', ms: 10 },
    { type: 'non_existent_action' },
    { type: 'wait', ms: 50 },
  ];

  const res = await executeBatchActions(actions, { stopOnError: true, defaultDelayMs: 0 });

  assert.equal(res.ok, false);
  assert.equal(res.totalActions, 3);
  assert.equal(res.executedCount, 2);
  assert.equal(res.successCount, 1);
  assert.equal(res.results[0].status, 'ok');
  assert.equal(res.results[1].status, 'error');
  assert.match(res.results[1].error, /Unsupported batch action type/);
});

test('executeBatchActions continues when stopOnError is false', async () => {
  const actions = [
    { type: 'invalid_one' },
    { type: 'wait', ms: 20 },
  ];

  const res = await executeBatchActions(actions, { stopOnError: false, defaultDelayMs: 0 });

  assert.equal(res.ok, false);
  assert.equal(res.totalActions, 2);
  assert.equal(res.executedCount, 2);
  assert.equal(res.successCount, 1);
  assert.equal(res.results[0].status, 'error');
  assert.equal(res.results[1].status, 'ok');
});
