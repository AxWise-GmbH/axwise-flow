import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskLabel } from '../src/labels.ts';

test('completed task gets [x] prefix', () => {
  assert.equal(taskLabel('review PR', true), '[x] review PR');
});

test('incomplete task keeps [ ] prefix', () => {
  assert.equal(taskLabel('write documentation', false), '[ ] write documentation');
});

test('preserves empty task name', () => {
  assert.equal(taskLabel('', true), '[x] ');
  assert.equal(taskLabel('', false), '[ ] ');
});

test('preserves leading and trailing whitespace in task name', () => {
  assert.equal(taskLabel('   padded task   ', true), '[x]    padded task   ');
  assert.equal(taskLabel('   padded task   ', false), '[ ]    padded task   ');
});
