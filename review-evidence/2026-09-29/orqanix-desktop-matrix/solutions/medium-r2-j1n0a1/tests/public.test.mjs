import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTicket } from '../src/triage.mjs';
test('trims ticket title', () => assert.equal(normalizeTicket({id:'a',title:' Fix ',customerId:'c',severity:'normal',state:'open'}).title, 'Fix'));
