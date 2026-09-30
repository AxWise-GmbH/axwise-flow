import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeRouter} from '../src/app.ts';
test('five routes registered',()=>assert.equal(makeRouter().routes.length,5));
