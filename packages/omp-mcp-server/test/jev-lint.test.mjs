import assert from 'node:assert/strict';
import test from 'node:test';
import { JEV_LINT_RULESETS, evaluateLintWithJev } from '../src/jev-lint-models.mjs';

test('Jev lint rulesets define typed noul questions with explicit instructions', () => {
  assert.ok(JEV_LINT_RULESETS.SYNTAX_INTEGRITY);
  assert.ok(JEV_LINT_RULESETS.SECRET_SAFETY);
  assert.ok(JEV_LINT_RULESETS.ARCHITECTURAL_BOUNDARY);
  assert.ok(JEV_LINT_RULESETS.CODE_STYLE_HYGIENE);

  for (const [name, ruleset] of Object.entries(JEV_LINT_RULESETS)) {
    assert.ok(ruleset.name, `Ruleset ${name} missing name`);
    assert.ok(Object.keys(ruleset.questions).length >= 2, `Ruleset ${name} has too few questions`);
    for (const [qKey, q] of Object.entries(ruleset.questions)) {
      assert.equal(q.type, 'noul', `Question ${qKey} in ${name} must be noul`);
      assert.ok(q.instructions.length > 10, `Question ${qKey} in ${name} instructions too short`);
    }
  }
});

test('evaluateLintWithJev handles unconfigured API key gracefully', async () => {
  const result = await evaluateLintWithJev({
    codeSnippet: 'export const hello = "world";',
    apiKey: '',
  });
  assert.equal(result.evaluated, false);
  assert.equal(result.reason, 'MISSING_API_KEY');
  assert.equal(result.passed, true);
});

test('evaluateLintWithJev passes clean code when Jev returns zero risk', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        has_syntax_errors: { type: 'noul', noul: 0.05 },
        has_broken_imports: { type: 'noul', noul: 0.08 },
        exports_properly_bound: { type: 'noul', noul: 0.95 },
        contains_hardcoded_secrets: { type: 'noul', noul: 0.02 },
        leaks_private_endpoints: { type: 'noul', noul: 0.03 },
        violates_workspace_boundary: { type: 'noul', noul: 0.01 },
        modifies_pinned_dependencies: { type: 'noul', noul: 0.04 },
        has_stray_debug_logging: { type: 'noul', noul: 0.12 },
        is_production_ready: { type: 'noul', noul: 0.91 },
      },
    }),
  });

  const result = await evaluateLintWithJev({
    codeSnippet: 'export function add(a, b) { return a + b; }',
    apiKey: 'mock-key',
    fetchImpl: mockFetch,
  });

  assert.equal(result.evaluated, true);
  assert.equal(result.passed, true);
  assert.equal(result.violations.length, 0);
  assert.equal(result.model, 'jev-1.13.0');
});

test('evaluateLintWithJev catches hardcoded secrets and syntax errors', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        has_syntax_errors: { type: 'noul', noul: 0.85 },
        contains_hardcoded_secrets: { type: 'noul', noul: 0.92 },
        is_production_ready: { type: 'noul', noul: 0.15 },
      },
    }),
  });

  const result = await evaluateLintWithJev({
    codeSnippet: 'const API_KEY = "sk-live-1234567890abcdef"; function broken( {',
    rulesetKey: 'SECRET_SAFETY',
    apiKey: 'mock-key',
    fetchImpl: mockFetch,
  });

  assert.equal(result.evaluated, true);
  assert.equal(result.passed, false);
  assert.ok(result.violations.some((v) => v.rule === 'contains_hardcoded_secrets' && v.severity === 'error'));
});
