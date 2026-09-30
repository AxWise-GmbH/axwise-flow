/**
 * Benchmark: TypeSafe AI Jev (jev-use) vs Generative LLM for Computer Use Decision Routing.
 */
import { callGeminiSample, isMain, runCli } from './benchmark-provider-client.mjs';
import fs from 'node:fs';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k.trim()]) {
        process.env[k.trim()] = val;
      }
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY;

const SCENARIOS = [
  {
    name: 'Orqanix Sidebar Navigation',
    goal: 'Select the Training Week Analysis chat under personalproject',
    target: 'act_6',
    candidates: {
      act_1: 'Button: New Chat',
      act_2: 'Button: Pinned Projects - in-contri',
      act_3: 'Button: Project Folder - axwise-flow-oss',
      act_4: 'Chat Item: Orqanix CUA.ai integration',
      act_5: 'Chat Item: Today weather',
      act_6: 'Chat Item: Training Week Analysis (under personalproject)',
      act_7: 'Chat Item: Hermes and DHL Tracking',
      act_8: 'Button: Settings',
      act_9: 'Button: Workspace',
      act_10: 'Button: Collapse Sidebar',
    },
  },
  {
    name: 'Web Authentication Form',
    goal: 'Click the primary button to submit credentials and sign in',
    target: 'act_4',
    candidates: {
      act_1: 'Input: Username / Email textfield',
      act_2: 'Input: Password textfield',
      act_3: 'Link: Forgot your password?',
      act_4: 'Button: Sign In (Primary action)',
      act_5: 'Checkbox: Remember this device for 30 days',
      act_6: 'Link: Create a new account',
      act_7: 'Button: Cancel and return to home',
      act_8: 'Link: Privacy policy',
    },
  },
  {
    name: 'Intervals.icu Calendar Activity Selection',
    goal: 'Open the Tuesday track workout details',
    target: 'act_2',
    candidates: {
      act_1: 'Event: Mon Sep 28 - Rest & Active Mobility',
      act_2: 'Event: Tue Sep 29 - Stadium cruise (8.1km Run, 46 TSS)',
      act_3: 'Event: Wed Sep 30 - Lunch Ride (39km Bike, 59 TSS)',
      act_4: 'Event: Thu Oct 01 - Easy Run (Planned 35m)',
      act_5: 'Event: Fri Oct 02 - Sweetspot Bike 3x10m (Planned 61 TSS)',
      act_6: 'Button: Add entry to calendar',
      act_7: 'Button: Show workout library',
      act_8: 'Button: Search activities',
    },
  },
];

async function callJevDecision(scenario) {
  const started = performance.now();
  const payload = {
    model: 'jev-latest',
    state: {
      goal: scenario.goal,
      visible_ui_elements: scenario.candidates,
    },
    questions: {
      target_action: {
        type: 'choice',
        instructions: 'Select the exact action identifier that accomplishes the user goal.',
        criteria: scenario.candidates,
      },
    },
  };

  const response = await fetch(TYPESAFE_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TYPESAFE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`JEV returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const latencyMs = Math.round(performance.now() - started);
  const answer = data.answers?.target_action;

  return {
    choice: answer?.choice,
    confidence: answer?.confidence,
    latencyMs,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
    model: data.model,
  };
}

async function callGenerativeDecision(scenario) {
  const prompt = `You are a computer use action selector.
Goal: ${scenario.goal}

Available interactive elements:
${Object.entries(scenario.candidates).map(([id, desc]) => `- ${id}: ${desc}`).join('\n')}

Select the single best action ID to execute next.
Respond ONLY with a JSON object in this exact format: {"action": "act_X"}`;

  const started = performance.now();
  const result = await callGeminiSample(prompt, {
    effort: 'low',
    maxOutputTokens: 256,
  });
  const latencyMs = Math.round(performance.now() - started);

  let choice = null;
  try {
    const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
    choice = parsed.action;
  } catch {
    const match = result.text.match(/act_\d+/);
    choice = match ? match[0] : null;
  }

  return {
    choice,
    latencyMs,
    inputTokens: result.usage?.promptTokenCount || 0,
    outputTokens: result.usage?.candidatesTokenCount || 0,
    model: result.requestedModel,
  };
}

export async function runBenchmark() {
  if (!TYPESAFE_API_KEY) throw new Error('Missing TYPESAFE_API_KEY in .env.local');

  const benchmarkResults = [];

  for (const scenario of SCENARIOS) {
    console.error(`Running scenario: ${scenario.name}...`);

    // 1. JEV Decision
    const jevRes = await callJevDecision(scenario);

    // 2. Generative Decision
    const genRes = await callGenerativeDecision(scenario);

    benchmarkResults.push({
      scenario: scenario.name,
      expected: scenario.target,
      jev: {
        choice: jevRes.choice,
        correct: jevRes.choice === scenario.target,
        confidence: jevRes.confidence,
        latencyMs: jevRes.latencyMs,
        tokens: jevRes.inputTokens + jevRes.outputTokens,
      },
      generative: {
        choice: genRes.choice,
        correct: genRes.choice === scenario.target,
        latencyMs: genRes.latencyMs,
        tokens: genRes.inputTokens + genRes.outputTokens,
      },
      speedup: Number((genRes.latencyMs / jevRes.latencyMs).toFixed(2)),
    });
  }

  const avgJevLatency = Math.round(benchmarkResults.reduce((acc, r) => acc + r.jev.latencyMs, 0) / benchmarkResults.length);
  const avgGenLatency = Math.round(benchmarkResults.reduce((acc, r) => acc + r.generative.latencyMs, 0) / benchmarkResults.length);
  const avgSpeedup = Number((avgGenLatency / avgJevLatency).toFixed(2));

  return {
    kind: 'jev-use-vs-generative-benchmark',
    date: new Date().toISOString(),
    summary: {
      avgJevLatencyMs: avgJevLatency,
      avgGenerativeLatencyMs: avgGenLatency,
      overallSpeedupMultiplier: avgSpeedup,
      jevAccuracy: `${benchmarkResults.filter(r => r.jev.correct).length}/${benchmarkResults.length}`,
      generativeAccuracy: `${benchmarkResults.filter(r => r.generative.correct).length}/${benchmarkResults.length}`,
    },
    scenarios: benchmarkResults,
  };
}

if (isMain(import.meta.url)) runCli(runBenchmark);
