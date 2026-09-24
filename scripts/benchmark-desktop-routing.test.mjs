import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, parseOptions, readMount, CASES } from './benchmark-desktop-routing.mjs';

test('randomized plan is reproducible and balanced for every prompt and repetition', () => {
  const first = schedule('seed-a');
  assert.equal(first.length, 12);
  assert.deepEqual(first, schedule('seed-a'));
  assert.notDeepEqual(first, schedule('seed-b'));
  assert.equal(new Set(first.map(row => row.key)).size, first.length);
  for (const test of CASES) for (const repetition of [0, 1])
    assert.deepEqual(first.filter(row => row.id === test.id && row.repetition === repetition).map(row => row.arm).sort(), ['off', 'on']);
});

test('live mode is explicit, bounded and loopback only', () => {
  assert.equal(parseOptions([]).live, false);
  assert.throws(() => parseOptions(['--live']));
  assert.throws(() => parseOptions(['--repetitions', '50']));
  assert.throws(() => parseOptions(['--live', '--desktop', '/tmp/test', '--cdp', 'https://remote.example']));
  assert.throws(() => parseOptions(['--live', '--desktop', '/tmp/test', '--cdp', 'http://127.0.0.1:9339']));
  assert.equal(parseOptions(['--live', '--desktop', '/tmp/test', '--db', '/tmp/test.db', '--cdp', 'http://127.0.0.1:9339']).live, true);
});

test('effective mount is checked from scoped read-only session metadata, not the requested toggle', () => {
  const url = 'http://localhost:5173/#/pair?resumeSessionId=20260924_21';
  const run = (cmd, args) => {
    assert.equal(cmd, 'sqlite3'); assert.equal(args[0], '-readonly');
    assert.ok(args.at(-1).includes("s.id='20260924_21'"));
    assert.ok(!args.at(-1).includes('messages'));
    return { status: 0, stdout: '[{"name":"axwise-local"},{"name":"desktop-utilities"}]' };
  };
  assert.equal(readMount('/tmp/test.db', url, run).axwiseMounted, true);
  assert.equal(readMount('/tmp/test.db', url, () => ({ status: 0, stdout: '[{"name":"desktop-utilities"}]' })).axwiseMounted, false);
  assert.throws(() => readMount('/tmp/test.db', 'http://localhost/#/?resumeSessionId=bad%27', run));
  assert.throws(() => readMount('/tmp/test.db', url, () => ({ status: 0, stdout: '[]' })));
});
