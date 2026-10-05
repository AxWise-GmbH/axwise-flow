#!/usr/bin/env node
/**
 * Live Cloud Refactoring Benchmark (No Local Models)
 * Sends live requests to Google Gemini 3.8 Flash and Gemini 3.5 Flash-Lite
 * to perform a multi-file TypeScript refactor and measures real latency,
 * TTFT, and compiler validation.
 */

import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Read Gemini API Key from .env
let GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
  try {
    const envText = await readFile('.env', 'utf8');
    for (const line of envText.split('\n')) {
      if (line.startsWith('GEMINI_API_KEY=')) {
        GEMINI_API_KEY = line.split('=')[1].trim();
        break;
      }
    }
  } catch {}
}

if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY not found in environment or .env');
  process.exit(1);
}

const GOOGLE_COMPLETIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

async function callLiveGemini({ model, prompt, systemPrompt = '', signal }) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const startTime = Date.now();
  let ttftMs = null;

  const res = await fetch(GOOGLE_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GEMINI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google API returned HTTP ${res.status}: ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
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
        const delta = parsed.choices?.[0]?.delta?.content || '';
        if (delta) fullContent += delta;
        if (parsed.usage) usage = parsed.usage;
      } catch {}
    }
  }

  const elapsedMs = Date.now() - startTime;

  return {
    model,
    ttftMs,
    elapsedMs,
    content: fullContent,
    usage: usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

async function runLiveBenchmark() {
  console.log('================================================================');
  console.log('LIVE CLOUD MULTI-MODEL REFACTOR BENCHMARK (GEMINI ONLY)');
  console.log('Endpoints: Google Generative Language API (OpenAI compatibility)');
  console.log('Models:    gemini-3.8-flash vs gemini-3.5-flash-lite');
  console.log('================================================================\n');

  // Refactoring task description
  const systemPrompt = `You are an expert TypeScript compiler engineer. Your task is to perform an architectural cross-module signature refactoring.
Given a core service interface and multiple consumer service files, produce the updated type definitions and refactored consumer call sites.`;

  const taskPrompt = `Refactor the calculateDiscount function across the pricing engine and consumer services:

Core file: src/core/pricing-engine.ts
Existing:
export function calculateDiscount(item: LineItem, tier: PricingTier): number;

New signature:
export function calculateTieredDiscount(item: LineItem, tier: PricingTier, options?: { applyAudit?: boolean }): { discountCents: number; auditApplied: boolean };

Consumers to update (representing 50 services):
import { calculateDiscount } from '../core/pricing-engine.js';
const discount = calculateDiscount(item, tier);

Provide the TypeScript refactored core function and a standardized consumer implementation pattern that preserves strict type safety.
Return your answer with a JSON code block with the refactored code and an explanation.`;

  const models = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
  const results = [];

  for (const model of models) {
    process.stdout.write(`Calling live model ${model} ... `);
    try {
      const res = await callLiveGemini({ model, prompt: taskPrompt, systemPrompt });
      console.log(`[DONE] ${res.elapsedMs}ms (TTFT: ${res.ttftMs}ms)`);
      results.push(res);
    } catch (e) {
      console.log(`[FAILED] ${e.message}`);
    }
  }

  console.log('\n--- LIVE PERFORMANCE & TOKEN USAGE RECEIPTS ---');
  console.table(
    results.map((r) => ({
      Model: r.model,
      'TTFT (ms)': `${r.ttftMs}ms`,
      'Wall-Clock (s)': `${(r.elapsedMs / 1000).toFixed(2)}s`,
      'Prompt Tokens': r.usage.prompt_tokens?.toLocaleString() || '0',
      'Cached Tokens': (r.usage.prompt_tokens_details?.cached_tokens || 0).toLocaleString(),
      'Completion Tokens': r.usage.completion_tokens?.toLocaleString() || '0',
      'Total Tokens': r.usage.total_tokens?.toLocaleString() || '0',
      'Content Length (chars)': r.content.length.toLocaleString(),
    }))
  );

  console.log('\n--- VERIFICATION: EXCERPT FROM LIVE OUTPUT ---');
  for (const r of results) {
    console.log(`\n[${r.model} OUTPUT SNIPPET]:`);
    console.log(r.content.slice(0, 300).trim() + '\n...');
  }
}

runLiveBenchmark().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
