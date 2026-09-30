import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineTotal } from '../src/pricing.mjs';
test('ordinary invoice line', () => assert.equal(lineTotal(500, 2), 1000));
