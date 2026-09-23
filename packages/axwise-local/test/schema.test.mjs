import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inlineLocalRefs, providerSchema } from '../src/schema.mjs';

const example = () => ({ type: 'object', properties: { title: { $ref: '#/$defs/Text' }, items: { type: 'array', minItems: 1, maxItems: 3, items: { $ref: '#/$defs/Text' } } }, required: ['title', 'items'], additionalProperties: false,
  $defs: { Text: { type: 'string', minLength: 1, maxLength: 500, pattern: '^[a-z]+$', enum: ['a', 'b'] } } });

test('reference expansion preserves constraints and does not mutate originals', () => {
  const original = example(), snapshot = structuredClone(original);
  const result = inlineLocalRefs(original);
  assert.deepEqual(result.properties.title, snapshot.$defs.Text);
  assert.deepEqual(result.properties.items.items, snapshot.$defs.Text);
  assert.equal(result.properties.items.maxItems, 3);
  assert.equal(result.additionalProperties, false);
  assert.equal(result.$defs, undefined);
  assert.deepEqual(original, snapshot);
});

test('reference siblings preserve conjunctive constraints rather than overwrite them', () => {
  const result = inlineLocalRefs({ $defs: { Text: { type: 'string', minLength: 5 } }, type: 'object', properties: { value: { $ref: '#/$defs/Text', minLength: 1 } } });
  assert.deepEqual(result.properties.value, { allOf: [{ type: 'string', minLength: 5 }, { minLength: 1 }] });
  assert.throws(() => providerSchema({ ...example(), properties: { value: { $ref: '#/$defs/Text', minLength: 1 } } }));
});

test('external, missing, cyclic and excessive-depth references fail closed', () => {
  for (const schema of [
    { $ref: 'https://untrusted.example/schema' }, { $ref: '#/missing' },
    { $defs: { Loop: { $ref: '#/$defs/Loop' } }, $ref: '#/$defs/Loop' },
    { $ref: '#' }, { $ref: '#/bad~3pointer' },
  ]) assert.throws(() => inlineLocalRefs(schema));
  let schema = { type: 'string' };
  for (let i = 0; i < 50; i++) schema = { type: 'array', items: schema };
  assert.throws(() => inlineLocalRefs(schema));
});

test('compact schema keeps shape, enums and title/items field names and describes local constraints', () => {
  const original = example(), result = providerSchema(original);
  assert.deepEqual(result.required, ['title', 'items']);
  assert.deepEqual(result.properties.title.enum, ['a', 'b']);
  assert.equal(result.properties.title.type, 'string');
  assert.equal(result.properties.items.type, 'array');
  assert.match(result.properties.title.description, /maxLength=500/);
  assert.match(result.properties.items.description, /maxItems=3/);
  assert.match(result.description, /no additional properties/);
  assert.equal(result.properties.title.maxLength, undefined);
  assert.equal(original.$defs.Text.maxLength, 500);
});

test('nullable types and constants are preserved; unknown validation keywords fail closed', () => {
  assert.deepEqual(providerSchema({ anyOf: [{ type: 'null' }, { type: 'string', const: 'synthetic' }] }),
    { anyOf: [{ type: 'null' }, { type: 'string', enum: ['synthetic'] }] });
  assert.throws(() => providerSchema({ type: 'string', arbitraryUnknownConstraint: true }));
});
