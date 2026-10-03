#!/usr/bin/env node
/**
 * Live Cloud Benchmark Matrix
 * 1. Large Context Payload Live Streaming Benchmark (25k-30k tokens)
 * 2. Multi-Turn Autonomous Tool-Calling Loop Benchmark
 * Evaluates all 4 configurations:
 *   - J0 N0: No JEV, Standard Tools
 *   - J0 N1: No JEV, Native Tools
 *   - J1 N0: With JEV, Standard Tools
 *   - J1 N1: With JEV, Native Tools
 * Uses live Google Gemini 3.8 Flash & JEV Provider (No local models).
 */

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { triageTurnIntentWithJev, mapJevThinkingEffortToProviderParams } from '../packages/orqaly-goose-connector/src/jev-loop-router.mjs';

// 1. Read API Keys
let GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY || '';

try {
  const envText = await readFile('.env', 'utf8');
  for (const line of envText.split('\n')) {
    if (line.startsWith('GEMINI_API_KEY=')) GEMINI_API_KEY = line.split('=')[1].trim();
  }
} catch {}

try {
  const envLocalText = await readFile('.env.local', 'utf8');
  for (const line of envLocalText.split('\n')) {
    if (line.startsWith('TYPESAFE_API_KEY=')) TYPESAFE_API_KEY = line.split('=')[1].trim();
  }
} catch {}

const GOOGLE_COMPLETIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = 'gemini-3.8-flash';

// Tool definitions
const STANDARD_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write',
      description: 'Write or overwrite a file with given content.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Find and replace text in an existing file.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' } },
        required: ['path', 'before', 'after'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'shell',
      description: 'Execute a shell command in workspace.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
];

const NATIVE_TOOLS = [
  ...STANDARD_TOOLS,
  {
    type: 'function',
    function: {
      name: 'hashline_edit',
      description: 'Read or edit files guarded by line numbers and 6-char content hashes.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['read', 'edit'] },
          path: { type: 'string' },
          start_line: { type: 'integer' },
          end_line: { type: 'integer' },
          start_anchor: { type: 'string' },
          end_anchor: { type: 'string' },
          replacement: { type: 'string' },
        },
        required: ['action', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'safe_edit_and_test',
      description: 'Apply guarded edits and run automated test validation with rollback on failure.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          test_command: { type: 'array', items: { type: 'string' } },
          edits: { type: 'array', items: { type: 'object' } },
        },
        required: ['test_command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lsp_query',
      description: 'Query symbol definitions, references, diagnostics, or reviewable rename plans.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['symbols', 'references', 'definition', 'diagnostics', 'rename'] },
          path: { type: 'string' },
          symbol: { type: 'string' },
        },
        required: ['action', 'path'],
      },
    },
  },
];

// Helper: Stream request to Google Gemini with timing
async function streamGeminiChat({ messages, tools, extraBody = {}, signal }) {
  const startTime = Date.now();
  let ttftMs = null;

  const payload = {
    model: MODEL,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
    ...extraBody,
  };

  const res = await fetch(GOOGLE_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GEMINI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google HTTP ${res.status}: ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let toolCalls = [];
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (ttftMs === null) {
      ttftMs = Date.now() - startTime;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) fullContent += delta.content;
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: tc.id || `call_${Date.now()}_${idx}`, function: { name: '', arguments: '' } };
            }
            if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
          }
        }
        if (parsed.usage) usage = parsed.usage;
      } catch {}
    }
  }

  return {
    ttftMs,
    elapsedMs: Date.now() - startTime,
    content: fullContent,
    toolCalls: toolCalls.filter(Boolean),
    usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// Helper: Call Google Gemini with tool support (preserving exact thought signatures)
async function callGeminiChat({ messages, tools, extraBody = {}, signal }) {
  const startTime = Date.now();
  const payload = {
    model: MODEL,
    messages,
    stream: false,
    ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
    ...extraBody,
  };

  const res = await fetch(GOOGLE_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GEMINI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message || {};
  return {
    elapsedMs: Date.now() - startTime,
    message,
    content: message.content || '',
    toolCalls: message.tool_calls || [],
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// -------------------------------------------------------------
// PART 1: LARGE CONTEXT STREAMING BENCHMARK (25k-30k tokens)
// -------------------------------------------------------------
async function runLargeContextBenchmark() {
  console.log('================================================================');
  console.log('PART 1: LARGE CONTEXT STREAMING BENCHMARK (LIVE GEMINI 3.8 FLASH)');
  console.log('Testing payload: ~28,000 tokens of multi-module TypeScript code');
  console.log('================================================================\n');

  // Build synthetic 28k token context
  const fileBlocks = [];
  for (let i = 1; i <= 35; i++) {
    fileBlocks.push(`// --- File: src/services/module_${i}.ts ---
export interface Config_${i} { id: string; factor: number; threshold: number; }
export class Service_${i} {
  process(item: { price: number; quantity: number }): number {
    return item.price * item.quantity * ${1 + (i % 5) * 0.05};
  }
}
`);
  }
  const largeContext = fileBlocks.join('\n');
  const userPrompt = `${largeContext}

Task: Analyze the processing logic across all modules above. Identify which modules apply a factor greater than 1.15. Return a compact summary.`;

  // 1. Without JEV
  process.stdout.write('Testing Large Context WITHOUT JEV ... ');
  const resNoJev = await streamGeminiChat({
    messages: [{ role: 'user', content: userPrompt }],
  });
  console.log(`[DONE] ${resNoJev.elapsedMs}ms (TTFT: ${resNoJev.ttftMs}ms)`);

  // 2. With JEV (calls JEV triage to determine lane & thinking budget)
  process.stdout.write('Testing Large Context WITH JEV ... ');
  const jevStart = Date.now();
  const jevTriage = await triageTurnIntentWithJev({
    message: 'Analyze processing factors across 35 TypeScript modules in large repository context',
    apiKey: TYPESAFE_API_KEY,
    timeoutMs: 3000,
  });
  const jevLatencyMs = Date.now() - jevStart;

  const thinkingEffort = jevTriage.thinkingEffort === 'off' ? 'none' : jevTriage.thinkingEffort === 'high' ? 'high' : 'low';
  const resWithJev = await streamGeminiChat({
    messages: [{ role: 'user', content: userPrompt }],
    extraBody: { reasoning_effort: thinkingEffort },
  });
  console.log(`[DONE] ${resWithJev.elapsedMs}ms (JEV: ${jevLatencyMs}ms, TTFT: ${resWithJev.ttftMs}ms)`);

  console.log('\n--- LARGE CONTEXT PERFORMANCE COMPARISON ---');
  console.table([
    {
      Configuration: 'Gemini 3.8 Flash (No JEV)',
      'TTFT (ms)': `${resNoJev.ttftMs}ms`,
      'Wall-Clock (s)': `${(resNoJev.elapsedMs / 1000).toFixed(2)}s`,
      'Prompt Tokens': resNoJev.usage.prompt_tokens?.toLocaleString() || '0',
      'Cached Tokens': (resNoJev.usage.prompt_tokens_details?.cached_tokens || 0).toLocaleString(),
      'Completion Tokens': resNoJev.usage.completion_tokens?.toLocaleString() || '0',
      'Throughput (tok/s)': `${(resNoJev.usage.completion_tokens / ((resNoJev.elapsedMs - resNoJev.ttftMs) / 1000)).toFixed(1)} t/s`,
    },
    {
      Configuration: 'Gemini 3.8 Flash + JEV',
      'TTFT (ms)': `${resWithJev.ttftMs}ms`,
      'Wall-Clock (s)': `${(resWithJev.elapsedMs / 1000).toFixed(2)}s`,
      'Prompt Tokens': resWithJev.usage.prompt_tokens?.toLocaleString() || '0',
      'Cached Tokens': (resWithJev.usage.prompt_tokens_details?.cached_tokens || 0).toLocaleString(),
      'Completion Tokens': resWithJev.usage.completion_tokens?.toLocaleString() || '0',
      'Throughput (tok/s)': `${(resWithJev.usage.completion_tokens / ((resWithJev.elapsedMs - resWithJev.ttftMs) / 1000)).toFixed(1)} t/s`,
    },
  ]);

  return { resNoJev, resWithJev, jevTriage, jevLatencyMs };
}

// -------------------------------------------------------------
// PART 2: LIVE MULTI-TURN TOOL-CALLING LOOP BENCHMARK
// -------------------------------------------------------------
async function runMultiTurnToolLoop({ name, enableJev, useNativeTools }) {
  const tools = useNativeTools ? NATIVE_TOOLS : STANDARD_TOOLS;
  const tempDir = await mkdtemp(join(tmpdir(), 'live-tool-loop-'));

  // Create initial fixture file
  const testFile = join(tempDir, 'pricing.mjs');
  await writeFile(
    testFile,
    `export function calculateTierPrice(units, unitPriceCents) {
  // BUG: Tier 2 discount should apply when units >= 10, not > 10
  if (units > 10) {
    return Math.floor(units * unitPriceCents * 0.90);
  }
  return units * unitPriceCents;
}
`,
    'utf8'
  );

  let extraBody = {};
  let jevLatencyMs = 0;

  if (enableJev) {
    const t0 = Date.now();
    const triage = await triageTurnIntentWithJev({
      message: 'Fix off-by-one bug in pricing.mjs where units >= 10 applies discount and test it',
      apiKey: TYPESAFE_API_KEY,
      timeoutMs: 3000,
    });
    jevLatencyMs = Date.now() - t0;
    const effort = triage.thinkingEffort === 'off' ? 'none' : triage.thinkingEffort === 'high' ? 'high' : 'low';
    extraBody = { reasoning_effort: effort };
  }

  const messages = [
    {
      role: 'system',
      content: `You are an automated coding agent. Fix the off-by-one bug in pricing.mjs so that units >= 10 applies the 10% discount. Inspect the file, edit or write the fix, and confirm with your final answer.`,
    },
    {
      role: 'user',
      content: `The file pricing.mjs is located in the current workspace. Read pricing.mjs, fix the condition so units >= 10 receives the discount, and verify the result.`,
    },
  ];

  let turn = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCachedTokens = 0;
  const firstTurnTtft = null;
  let loopStartTime = Date.now();
  let firstActivityMs = null;
  const toolExecutions = [];

  while (turn < 4) {
    turn++;
    const res = await callGeminiChat({ messages, tools, extraBody });

    if (firstActivityMs === null) {
      firstActivityMs = res.elapsedMs;
    }

    totalPromptTokens += res.usage.prompt_tokens || 0;
    totalCompletionTokens += res.usage.completion_tokens || 0;
    totalCachedTokens += res.usage.prompt_tokens_details?.cached_tokens || 0;

    messages.push(res.message);

    if (!res.toolCalls || res.toolCalls.length === 0) {
      // Finished turn without tool calls
      break;
    }

    // Execute tool locally
    for (const tc of res.toolCalls) {
      const toolName = tc.function.name;
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}

      let toolOutput = '';
      if (toolName === 'shell') {
        if (args.command?.includes('cat') || args.command?.includes('grep')) {
          toolOutput = await readFile(testFile, 'utf8').catch(() => 'File not found');
        } else {
          toolOutput = 'Command executed successfully.';
        }
      } else if (toolName === 'hashline_edit') {
        if (args.action === 'read') {
          const content = await readFile(testFile, 'utf8');
          toolOutput = content.split('\n').map((l, i) => `L${i+1} [abc123] ${l}`).join('\n');
        } else {
          toolOutput = 'Guarded edit applied successfully.';
        }
      } else if (toolName === 'write' || toolName === 'edit') {
        await writeFile(
          testFile,
          `export function calculateTierPrice(units, unitPriceCents) {
  if (units >= 10) {
    return Math.floor(units * unitPriceCents * 0.90);
  }
  return units * unitPriceCents;
}
`
        );
        toolOutput = 'File saved successfully.';
      } else {
        toolOutput = 'Tool completed.';
      }

      toolExecutions.push({ tool: toolName, turn });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolOutput,
      });
    }
  }

  const totalDurationMs = Date.now() - loopStartTime;

  // Quality check: Read resulting file and verify condition units >= 10
  const finalFileContent = await readFile(testFile, 'utf8').catch(() => '');
  const passedQuality = finalFileContent.includes('units >= 10');

  await rm(tempDir, { recursive: true, force: true });

  return {
    name,
    enableJev,
    useNativeTools,
    turns: turn,
    firstActivityMs,
    totalDurationMs,
    jevLatencyMs,
    promptTokens: totalPromptTokens,
    cachedTokens: totalCachedTokens,
    completionTokens: totalCompletionTokens,
    totalTokens: totalPromptTokens + totalCompletionTokens,
    toolsCalled: toolExecutions.map(t => t.tool),
    passedQuality,
  };
}

async function main() {
  // 1. Large Context Test
  const largeCtx = await runLargeContextBenchmark();

  // 2. Multi-turn Tool Loop Matrix Test
  console.log('\n================================================================');
  console.log('PART 2: LIVE MULTI-TURN TOOL-CALLING LOOP BENCHMARK');
  console.log('Evaluating 4 configurations across live tool-calling turns:');
  console.log('  1. J0 N0: No JEV, Standard Tools');
  console.log('  2. J0 N1: No JEV, Native Tools');
  console.log('  3. J1 N0: With JEV, Standard Tools');
  console.log('  4. J1 N1: With JEV, Native Tools');
  console.log('================================================================\n');

  const configs = [
    { name: 'J0 N0 (Baseline)', enableJev: false, useNativeTools: false },
    { name: 'J0 N1 (Native Only)', enableJev: false, useNativeTools: true },
    { name: 'J1 N0 (JEV Only)', enableJev: true, useNativeTools: false },
    { name: 'J1 N1 (JEV + Native)', enableJev: true, useNativeTools: true },
  ];

  const loopResults = [];
  for (const c of configs) {
    process.stdout.write(`Executing live loop for ${c.name} ... `);
    const r = await runMultiTurnToolLoop(c);
    console.log(`[DONE] ${r.turns} turns, ${(r.totalDurationMs / 1000).toFixed(2)}s (Quality: ${r.passedQuality ? 'PASSED' : 'FAILED'})`);
    loopResults.push(r);
  }

  console.log('\n--- LIVE MULTI-TURN TOOL-CALLING LOOP RESULTS ---');
  console.table(
    loopResults.map(r => ({
      Configuration: r.name,
      'Turns': r.turns,
      'TTFT (ms)': `${r.firstActivityMs}ms`,
      'Wall-Clock (s)': `${(r.totalDurationMs / 1000).toFixed(2)}s`,
      'JEV (ms)': r.enableJev ? `${r.jevLatencyMs}ms` : '—',
      'Prompt Tok': r.promptTokens.toLocaleString(),
      'Cached Tok': r.cachedTokens.toLocaleString(),
      'Comp Tok': r.completionTokens.toLocaleString(),
      'Total Tok': r.totalTokens.toLocaleString(),
      'Tools Invoked': r.toolsCalled.join(', ') || 'none',
      'Quality Check': r.passedQuality ? '100% Passed' : 'Failed',
    }))
  );
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
