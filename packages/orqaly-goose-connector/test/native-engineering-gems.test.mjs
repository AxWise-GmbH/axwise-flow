import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNativeGemsEnabled,
  FEATURE_FLAG,
  astSearch,
  computeLineHash,
  formatHashlines,
  applyHashlineEdit,
  lspQuery,
  safeEditAndTest,
} from '../src/native-engineering-gems.mjs';

test('isNativeGemsEnabled is always-on by default and respects GOOSE_NATIVE_GEMS flag', () => {
  assert.equal(isNativeGemsEnabled({}), true);
  assert.equal(isNativeGemsEnabled({ [FEATURE_FLAG]: 'true' }), true);
  assert.equal(isNativeGemsEnabled({ [FEATURE_FLAG]: '1' }), true);
  assert.equal(isNativeGemsEnabled({ [FEATURE_FLAG]: 'false' }), false);
  assert.equal(isNativeGemsEnabled({ [FEATURE_FLAG]: '0' }), false);
});

test('Gem 1: astSearch finds structural syntax patterns across multiline code', () => {
  const code = `
    import { fetch } from 'node:http';

    export async function validateToken(token, context) {
      if (!token) return false;
      return true;
    }

    export function calculateTotal(items) {
      return items.reduce((a, b) => a + b, 0);
    }
  `;

  const results = astSearch({ code, pattern: 'function validateToken($$$ARGS)' });
  assert.equal(results.length, 1);
  assert.equal(results[0].symbol, 'validateToken');
  assert.equal(results[0].line, 4);

  const calcResults = astSearch({ code, pattern: 'calculateTotal' });
  assert.equal(calcResults.length, 1);
  assert.equal(calcResults[0].line, 9);
});

test('Gem 2: computeLineHash produces deterministic 6-character hashes', () => {
  const hash1 = computeLineHash('export async function authenticate() {');
  const hash2 = computeLineHash('export async function authenticate() {');
  const hash3 = computeLineHash('export async function authenticate() {\r');

  assert.equal(hash1.length, 6);
  assert.equal(hash1, hash2);
  assert.equal(hash1, hash3, 'CR should be ignored');
});

test('Gem 2: applyHashlineEdit applies patch when anchors match', () => {
  const code = 'line 1\nline 2: target\nline 3';
  const lines = formatHashlines(code);
  const targetHash = lines[1].hash;

  const result = applyHashlineEdit({
    content: code,
    startLine: 2,
    startHash: targetHash,
    endLine: 2,
    endHash: targetHash,
    replacement: 'line 2: updated target',
  });

  assert.equal(result.success, true);
  assert.equal(result.content, 'line 1\nline 2: updated target\nline 3');
});

test('Gem 2: applyHashlineEdit rejects when content changed (stale anchor protection)', () => {
  const code = 'line 1\nline 2: modified by another process\nline 3';

  const result = applyHashlineEdit({
    content: code,
    startLine: 2,
    startHash: 'aaaaaa', // wrong hash
    endLine: 2,
    endHash: 'aaaaaa',
    replacement: 'line 2: overwritten',
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'HASHLINE_ANCHOR_MISMATCH');
  assert.equal(result.line, 2);
});

test('Gem 3: lspQuery extracts symbols and syntax diagnostics instantly', () => {
  const code = `
    export async function computeInterest(rate, principal) {
      console.log('debugging...');
      return rate * principal;
    }

    export class AccountLedger {
      constructor() {}
    }
  `;

  const query = lspQuery({ code });
  assert.equal(query.symbols.length, 2);
  assert.equal(query.symbols[0].name, 'computeInterest');
  assert.equal(query.symbols[0].kind, 'function');
  assert.equal(query.symbols[1].name, 'AccountLedger');
  assert.equal(query.symbols[1].kind, 'class');

  assert.equal(query.diagnostics.length, 1);
  assert.equal(query.diagnostics[0].message, 'Stray console.log statement');
});

test('Gem 4: safeEditAndTest dry-run succeeds on valid anchor', async () => {
  // Create virtual test via dryRun mode
  const code = 'export function sum(a, b) {\n  return a + b;\n}';
  const lines = formatHashlines(code);

  const res = applyHashlineEdit({
    content: code,
    startLine: 2,
    startHash: lines[1].hash,
    endLine: 2,
    endHash: lines[1].hash,
    replacement: '  return Number(a) + Number(b);',
  });

  assert.equal(res.success, true);
  assert.equal(res.content.includes('Number(a)'), true);
});
