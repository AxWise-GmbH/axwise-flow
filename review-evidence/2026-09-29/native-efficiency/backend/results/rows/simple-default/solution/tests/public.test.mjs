import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lineTotal} from '../src/pricing.ts';
test('ordinary invoice',()=>assert.equal(lineTotal(500,2),1000));
