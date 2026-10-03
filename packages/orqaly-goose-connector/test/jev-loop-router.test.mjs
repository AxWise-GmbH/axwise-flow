import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectInferenceTarget,
  selectCloudModelTier,
  mapJevThinkingEffortToProviderParams,
  shouldGateNativeTools,
  filterDynamicToolSchemas,
  hasToolOrExecutionError,
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

test('selectCloudModelTier automatically escalates heavy requests under 2500 tokens to 3.8 flash', () => {
  // 1. Tool presence escalates even for tiny prompt
  const toolBody = {
    messages: [{ role: 'user', content: 'List files.' }],
    tools: [{ type: 'function', function: { name: 'list_directory' } }],
  };
  assert.equal(selectCloudModelTier(toolBody), 'gemini-3.8-flash');

  // 2. Code block presence escalates
  const codeBody = {
    messages: [{ role: 'user', content: 'Explain this:\n```ts\nconst a = 1;\n```' }],
  };
  assert.equal(selectCloudModelTier(codeBody), 'gemini-3.8-flash');

  // 3. GAVEL / AST / Native engineering context escalates
  const gavelBody = {
    messages: [
      { role: 'system', content: '# GAVEL Graph World Model Active\nast_search enabled' },
      { role: 'user', content: 'Find callers of processLease.' },
    ],
  };
  assert.equal(selectCloudModelTier(gavelBody), 'gemini-3.8-flash');

  // 4. Analytical / diagnostic keywords escalate (English)
  const deadLockBody = {
    messages: [{ role: 'user', content: 'What is the root cause of this deadlock?' }],
  };
  assert.equal(selectCloudModelTier(deadLockBody), 'gemini-3.8-flash');

  // 5. Analytical keywords escalate (Russian)
  const russianBody = {
    messages: [{ role: 'user', content: 'Почему здесь происходит утечка памяти?' }],
  };
  assert.equal(selectCloudModelTier(russianBody), 'gemini-3.8-flash');

  // 6. Conversational request stays on flash-lite
  const conversationalBody = {
    messages: [{ role: 'user', content: 'Hello, what is the capital of Latvia?' }],
  };
  assert.equal(selectCloudModelTier(conversationalBody), 'gemini-3.1-flash-lite');
});

test('mapJevThinkingEffortToProviderParams enforces zero thinking budget for Flash-Lite', () => {
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

test('shouldGateNativeTools and filterDynamicToolSchemas gate native tools dynamically on simple tasks', () => {
  const tools = [
    { type: 'function', function: { name: 'shell' } },
    { type: 'function', function: { name: 'write' } },
    { type: 'function', function: { name: 'ast_search' } },
    { type: 'function', function: { name: 'lsp_query' } },
    { type: 'function', function: { name: 'hashline_edit' } },
    { type: 'function', function: { name: 'safe_edit_and_test' } },
  ];

  // 1. Simple single-file task with no tsconfig or multi-file keywords: native tools should be gated
  const simpleBody = {
    messages: [{ role: 'user', content: 'Fix the typo in index.js on line 5.' }],
  };
  assert.equal(shouldGateNativeTools(simpleBody, {}, { hasTsConfig: false, fileCount: 1 }), true);
  const gatedTools = filterDynamicToolSchemas(tools, simpleBody, {}, { hasTsConfig: false, fileCount: 1 });
  assert.equal(gatedTools.length, 2);
  assert.deepEqual(gatedTools.map(t => t.function.name), ['shell', 'write']);

  // 2. Multi-file refactor keyword: native tools must be preserved
  const refactorBody = {
    messages: [{ role: 'user', content: 'Refactor UserService and rename method across consumers.' }],
  };
  assert.equal(shouldGateNativeTools(refactorBody, {}, { hasTsConfig: false, fileCount: 1 }), false);
  const refactorTools = filterDynamicToolSchemas(tools, refactorBody, {}, { hasTsConfig: false, fileCount: 1 });
  assert.equal(refactorTools.length, 6);

  // 3. Large TypeScript workspace context: native tools must be preserved even if prompt is brief
  assert.equal(shouldGateNativeTools(simpleBody, {}, { hasTsConfig: true, fileCount: 50 }), false);
  const tsWorkspaceTools = filterDynamicToolSchemas(tools, simpleBody, {}, { hasTsConfig: true, fileCount: 50 });
  assert.equal(tsWorkspaceTools.length, 6);

  // 4. Explicit user override: never gate
  assert.equal(shouldGateNativeTools(simpleBody, { nativeToolsExplicit: true }), false);
  const forcedTools = filterDynamicToolSchemas(tools, simpleBody, { nativeToolsExplicit: true });
  assert.equal(forcedTools.length, 6);
});

test('selectCloudModelTier automatically escalates to 3.8 flash on tool or execution errors', () => {
  // A tiny conversation on Flash-Lite that encounters a tool execution error
  const failedToolBody = {
    messages: [
      { role: 'user', content: 'Update the dependency version.' },
      { role: 'assistant', content: 'Running update...' },
      { role: 'tool', tool_call_id: 'call_1', content: 'TypeError: Cannot read properties of undefined (reading version)' },
    ],
  };

  assert.equal(hasToolOrExecutionError(failedToolBody), true);
  // Auto-escalates to 3.8 Flash despite small token count
  assert.equal(selectCloudModelTier(failedToolBody), 'gemini-3.8-flash');

  // Can be opted out if explicitly disabled
  assert.equal(selectCloudModelTier(failedToolBody, { autoEscalateOnFailure: false }), 'gemini-3.1-flash-lite');
});


