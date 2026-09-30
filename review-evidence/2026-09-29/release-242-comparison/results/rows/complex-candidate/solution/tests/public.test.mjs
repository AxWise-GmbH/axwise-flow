import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handle} from '../src/app.ts';
test('wire identifier',()=>assert.equal(handle('t','u',{requestId:'j',name:'test'}).body.requestId,'t'));
