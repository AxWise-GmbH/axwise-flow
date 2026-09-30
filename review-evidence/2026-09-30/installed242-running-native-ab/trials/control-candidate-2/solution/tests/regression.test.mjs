import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskLabel } from '../src/labels.ts';

test('completed task has [x] prefix', () => {
  assert.equal(taskLabel('draft', true), '[x] draft');
});

test('incomplete task keeps [ ] prefix', () => {
  assert.equal(taskLabel('draft', false), '[ ] draft');
});

test('completed task with special characters and spaces preserves name exactly', () => {
  assert.equal(taskLabel('  write tests & type-check!  ', true), '[x]   write tests & type-check!  ');
  assert.equal(taskLabel('123 #todo [item]', true), '[x] 123 #todo [item]');
});

test('incomplete task with special characters and spaces preserves name exactly', () => {
  assert.equal(taskLabel('  write tests & type-check!  ', false), '[ ]   write tests & type-check!  ');
  assert.equal(taskLabel('123 #todo [item]', false), '[ ] 123 #todo [item]');
});

test('empty task name', () => {
  assert.equal(taskLabel('', true), '[x] ');
  assert.equal(taskLabel('', false), '[ ] ');
});
