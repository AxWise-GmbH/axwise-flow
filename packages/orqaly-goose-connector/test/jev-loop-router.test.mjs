import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOOSE_LANES,
  triageTurnIntentWithJev,
  evaluateArtifactSafetyWithJev,
} from '../src/jev-loop-router.mjs';

test('GOOSE_LANES defines all primary handling lanes', () => {
  assert.equal(GOOSE_LANES.QUICK_INFO, 'quick_info');
  assert.equal(GOOSE_LANES.RESEARCH, 'research');
  assert.equal(GOOSE_LANES.LOCAL_ENGINEERING, 'local_engineering');
  assert.equal(GOOSE_LANES.CONVERSATION, 'conversation');
});

test('triageTurnIntentWithJev handles unconfigured API key gracefully without throwing', async () => {
  const result = await triageTurnIntentWithJev({
    message: 'What is the weather in Berlin today?',
    apiKey: '',
  });

  assert.equal(result.evaluated, false);
  assert.equal(result.reason, 'MISSING_API_KEY');
  assert.equal(result.route, GOOSE_LANES.CONVERSATION);
});

test('triageTurnIntentWithJev parses valid Jev choice response correctly', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        route: {
          type: 'choice',
          choice: 'quick_info',
          confidence: 0.96,
          probabilities: {
            quick_info: 0.96,
            research: 0.02,
            local_engineering: 0.01,
            conversation: 0.01,
          },
        },
      },
    }),
  });

  const result = await triageTurnIntentWithJev({
    message: 'Check EUR to USD exchange rate',
    apiKey: 'mock-key',
    fetchImpl: mockFetch,
  });

  assert.equal(result.evaluated, true);
  assert.equal(result.route, 'quick_info');
  assert.equal(result.confidence, 0.96);
  assert.equal(result.model, 'jev-1.13.0');
});

test('evaluateArtifactSafetyWithJev detects secrets and passes clean documents', async () => {
  // Test clean document
  const mockCleanFetch = async () => ({
    ok: true,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        contains_hardcoded_secrets: { type: 'noul', noul: 0.03 },
        is_production_ready: { type: 'noul', noul: 0.95 },
      },
    }),
  });

  const cleanResult = await evaluateArtifactSafetyWithJev({
    content: '# Project Discovery Plan\n\nObjective: Explore market size for solar harvesters.',
    apiKey: 'mock-key',
    fetchImpl: mockCleanFetch,
  });

  assert.equal(cleanResult.evaluated, true);
  assert.equal(cleanResult.passed, true);
  assert.equal(cleanResult.violations.length, 0);

  // Test secret leakage
  const mockSecretFetch = async () => ({
    ok: true,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        contains_hardcoded_secrets: { type: 'noul', noul: 0.98 },
        is_production_ready: { type: 'noul', noul: 0.10 },
      },
    }),
  });

  const leakResult = await evaluateArtifactSafetyWithJev({
    content: 'const PRIVATE_KEY = "sk-live-009988776655443322";',
    apiKey: 'mock-key',
    fetchImpl: mockSecretFetch,
  });

  assert.equal(leakResult.evaluated, true);
  assert.equal(leakResult.passed, false);
  assert.equal(leakResult.violations.length, 1);
  assert.equal(leakResult.violations[0].rule, 'contains_hardcoded_secrets');
});
