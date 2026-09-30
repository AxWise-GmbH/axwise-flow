import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {taskLabel} from '../src/labels.ts';

describe('taskLabel regression tests', () => {
  test('completed task formatting', () => {
    assert.equal(taskLabel('draft', true), '[x] draft');
    assert.equal(taskLabel('ship release', true), '[x] ship release');
  });

  test('incomplete task formatting', () => {
    assert.equal(taskLabel('draft', false), '[ ] draft');
    assert.equal(taskLabel('review PR', false), '[ ] review PR');
  });

  test('preserves supplied name exactly', () => {
    assert.equal(taskLabel('', true), '[x] ');
    assert.equal(taskLabel('', false), '[ ] ');
    assert.equal(taskLabel('  leading and trailing  ', true), '[x]   leading and trailing  ');
    assert.equal(taskLabel('special: [x] [ ] #123', true), '[x] special: [x] [ ] #123');
    assert.equal(taskLabel('multi\nline', false), '[ ] multi\nline');
  });
});
