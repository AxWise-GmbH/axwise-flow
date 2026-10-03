import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectInferenceTarget,
  selectCloudModelTier,
  mapJevThinkingEffortToProviderParams,
} from '../src/jev-loop-router.mjs';

test('selectCloudModelTier selects flash-lite for small prompts and flash-3.8 for large prompts', () => {
  const smallBody = {
    messages: [
      { role: 'user', content: 'Fix a one-line bug in calculateTax.' },
    ],
  };
  assert.equal(selectCloudModelTier(smallBody), 'gemini-3.1-flash-lite');

  // Large prompt (> 2500 estimated tokens ~ 9500 chars)
  const largeContent = 'const x = 1;\n'.repeat(1000);
  const largeBody = {
    messages: [
      { role: 'user', content: largeContent },
    ],
  };
  assert.equal(selectCloudModelTier(largeBody), 'gemini-3.8-flash');
});

test('selectInferenceTarget routes correctly across cloud_only, hybrid, and local_only modes', () => {
  const smallBody = {
    messages: [{ role: 'user', content: 'Small micro task.' }],
  };
  const largeBody = {
    messages: [{ role: 'user', content: 'A'.repeat(12000) }],
  };

  // Cloud Only Mode
  assert.equal(selectInferenceTarget(smallBody, { mode: 'cloud_only' }), 'gemini-3.1-flash-lite');
  assert.equal(selectInferenceTarget(largeBody, { mode: 'cloud_only' }), 'gemini-3.8-flash');

  // Local Only Mode
  assert.equal(selectInferenceTarget(smallBody, { mode: 'local_only' }), 'local_vibeforged');
  assert.equal(selectInferenceTarget(largeBody, { mode: 'local_only' }), 'local_vibeforged');

  // Hybrid Mode (2,500 token boundary)
  assert.equal(selectInferenceTarget(smallBody, { mode: 'hybrid' }), 'local_vibeforged');
  assert.equal(selectInferenceTarget(largeBody, { mode: 'hybrid' }), 'google');
});

test('mapJevThinkingEffortToProviderParams enforces zero thinking budget for Flash-Lite', () => {
  // Flash-Lite forces 0 budget to preserve sub-100ms TTFT
  const liteParams = mapJevThinkingEffortToProviderParams('high', 'google', 'gemini-3.1-flash-lite');
  assert.deepEqual(liteParams, {
    thinking_config: { thinking_budget: 0 },
  });

  // Standard Flash 3.8 scales budget according to effort
  const standardLow = mapJevThinkingEffortToProviderParams('low', 'google', 'gemini-3.8-flash');
  assert.deepEqual(standardLow, {
    thinking_config: { thinking_budget: 150 },
  });

  const standardHigh = mapJevThinkingEffortToProviderParams('high', 'google', 'gemini-3.8-flash');
  assert.deepEqual(standardHigh, {
    thinking_config: { thinking_budget: 1024 },
  });

  const standardOff = mapJevThinkingEffortToProviderParams('off', 'google', 'gemini-3.8-flash');
  assert.deepEqual(standardOff, {
    thinking_config: { thinking_budget: 0 },
  });

  // Local / OpenAI mapping
  const localHigh = mapJevThinkingEffortToProviderParams('high', 'local_vibeforged');
  assert.deepEqual(localHigh, { reasoning_effort: 'high' });

  const localOff = mapJevThinkingEffortToProviderParams('off', 'local_vibeforged');
  assert.deepEqual(localOff, { reasoning_effort: 'none' });
});
