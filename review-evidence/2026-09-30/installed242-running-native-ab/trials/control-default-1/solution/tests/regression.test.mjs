import assert from 'node:assert/strict';
import {test} from 'node:test';
import {taskLabel} from '../src/labels.ts';

test('completed task has [x] prefix', () => {
  assert.equal(taskLabel('ship release', true), '[x] ship release');
});

test('incomplete task keeps [ ] prefix', () => {
  assert.equal(taskLabel('review PR', false), '[ ] review PR');
});

test('preserves empty name exactly', () => {
  assert.equal(taskLabel('', true), '[x] ');
  assert.equal(taskLabel('', false), '[ ] ');
});

test('preserves whitespace and special characters in name exactly', () => {
  assert.equal(taskLabel('  trimmed? no!  ', true), '[x]   trimmed? no!  ');
  assert.equal(taskLabel('  trimmed? no!  ', false), '[ ]   trimmed? no!  ');
  assert.equal(taskLabel('task with [brackets] & $symbols', true), '[x] task with [brackets] & $symbols');
});
