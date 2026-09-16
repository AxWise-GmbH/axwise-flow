import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICALIZATION_ALGORITHM,
  canonicalJson,
  canonicalJsonSha256,
} from '../src/domain/canonical.js';

test('uses the shared RFC 8785 discriminator and canonical bytes', () => {
  const value = { z: -0, nested: { '€': 1, a: 2 }, text: 'München' };
  assert.equal(CANONICALIZATION_ALGORITHM, 'rfc8785_v1');
  assert.equal(canonicalJson(value), '{"nested":{"a":2,"€":1},"text":"München","z":0}');
  assert.equal(canonicalJsonSha256(value).length, 64);
});

test('rejects values RFC 8785 cannot represent', () => {
  assert.throws(() => canonicalJson({ value: Number.NaN }));
  assert.throws(() => canonicalJson({ value: Number.POSITIVE_INFINITY }));
});
