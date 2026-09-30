import assert from 'node:assert/strict';
import {test} from 'node:test';
import {taskLabel} from '../src/labels.ts';
test('incomplete task',()=>assert.equal(taskLabel('draft',false),'[ ] draft'));
