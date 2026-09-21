import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEvaluationCatalog,
  canonicalCaseInput,
  caseInputHash,
  EVALUATION_CATEGORIES,
  evaluationSlot,
} from './catalog.mjs';

test('catalog emits one deterministic case per required category', () => {
  const first = buildEvaluationCatalog({ slot: '2026-09-21T12:07:59.999Z', templateVersion: 1 });
  const second = buildEvaluationCatalog({ slot: '2026-09-21T12:14:00.000Z', templateVersion: 1 });

  assert.deepEqual(first, second);
  assert.equal(first.slot, '2026-09-21T12:00:00.000Z');
  assert.deepEqual(first.cases.map(({ category }) => category), EVALUATION_CATEGORIES.map(({ id }) => id));
  assert.equal(first.cases.length, 5);
  for (const evaluationCase of first.cases) {
    assert.ok(evaluationCase.prompt.length > 20);
    assert.ok(evaluationCase.criteria.length >= 3);
    assert.match(evaluationCase.inputHash, /^[a-f0-9]{64}$/);
    assert.equal(caseInputHash(evaluationCase), evaluationCase.inputHash);
    assert.doesNotThrow(() => JSON.parse(canonicalCaseInput(evaluationCase)));
  }
});

test('catalog rotates through at least three templates for every category', () => {
  const seen = Object.fromEntries(EVALUATION_CATEGORIES.map(({ id }) => [id, new Set()]));
  const start = Date.parse('2026-09-21T00:00:00.000Z');
  for (let index = 0; index < 96; index += 1) {
    const catalog = buildEvaluationCatalog({ slot: new Date(start + (index * 15 * 60 * 1000)) });
    for (const evaluationCase of catalog.cases) seen[evaluationCase.category].add(evaluationCase.templateId);
  }
  for (const category of EVALUATION_CATEGORIES) {
    assert.ok(seen[category.id].size >= 3, `${category.id} did not rotate through three templates`);
  }
});

test('template version contributes to the deterministic seed and case hash', () => {
  const first = buildEvaluationCatalog({ slot: '2026-09-21T12:00:00.000Z', templateVersion: 1 });
  const second = buildEvaluationCatalog({ slot: '2026-09-21T12:00:00.000Z', templateVersion: 2 });

  assert.notEqual(first.seed, second.seed);
  for (let index = 0; index < first.cases.length; index += 1) {
    assert.notEqual(first.cases[index].inputHash, second.cases[index].inputHash);
  }
});

test('coding fixtures are inert data with explicit target, starter, and test vectors', () => {
  const start = Date.parse('2026-09-21T00:00:00.000Z');
  const codingCases = [];
  for (let index = 0; index < 96; index += 1) {
    const catalog = buildEvaluationCatalog({ slot: new Date(start + (index * 15 * 60 * 1000)) });
    codingCases.push(catalog.cases.find(({ category }) => category === 'coding'));
  }
  const unique = new Map(codingCases.map((evaluationCase) => [evaluationCase.templateId, evaluationCase]));
  assert.ok(unique.size >= 3);
  for (const evaluationCase of unique.values()) {
    assert.match(evaluationCase.fixture.targetFilename, /^src\/[a-z-]+\.js$/);
    assert.equal(typeof evaluationCase.fixture.starter, 'string');
    assert.ok(Array.isArray(evaluationCase.fixture.tests));
    assert.ok(evaluationCase.fixture.tests.every((vector) => Array.isArray(vector.args)));
  }
});

test('slot parsing floors to UTC quarter-hour and rejects invalid input', () => {
  assert.equal(evaluationSlot('2026-09-21T12:29:59.999Z'), '2026-09-21T12:15:00.000Z');
  assert.throws(() => evaluationSlot('not-a-time'), /slot must be a valid date/);
  assert.throws(() => buildEvaluationCatalog({ templateVersion: 0 }), /positive integer/);
});
