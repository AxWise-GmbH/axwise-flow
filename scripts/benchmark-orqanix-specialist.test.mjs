import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plan, parseOptions } from './benchmark-orqanix-specialist.mjs';

test('controlled specialist probe schedules exactly three isolated feature pairs', () => {
  const rows = plan();
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map(row => row.key)).size, 6);
  for (const difficulty of ['simple', 'medium', 'complex']) {
    const pair = rows.filter(row => row.difficulty === difficulty);
    assert.deepEqual(new Set(pair.map(row => row.flags.axwiseLocalEnabled)), new Set([false, true]));
    assert.ok(pair.every(row => row.repeat === 1 && !row.flags.jevReviewEnabled && !row.flags.nativeGemsEnabled));
  }
  assert.notEqual(rows[0].flags.axwiseLocalEnabled, rows[2].flags.axwiseLocalEnabled);
  assert.throws(() => plan(2), /ONE_PAIR/);
});

test('live execution is opt-in, bounded, and rejects accidental expansion', () => {
  const defaults = parseOptions([]);
  assert.equal(defaults.live, false);
  assert.equal(defaults.repetitions, 1);
  assert.equal(defaults.timeoutSeconds, 600);
  assert.throws(() => parseOptions(['--repetitions', '2']), /ONE_PAIR/);
  assert.throws(() => parseOptions(['--timeout-seconds', '601']), /INVALID_TIMEOUT/);
  assert.throws(() => parseOptions(['--live']), /ABSOLUTE_EXECUTABLE_REQUIRED/);
});
