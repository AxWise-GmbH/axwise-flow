import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  astSearch,
  computeLineHash,
  applyHashlineEdit
} from '../packages/orqaly-goose-connector/src/native-engineering-gems.mjs';
import { triageTurnIntentWithJev } from '../packages/orqaly-goose-connector/src/jev-loop-router.mjs';

const envLocal = readFileSync('.env.local', 'utf8');
const typesafeKey = envLocal.match(/TYPESAFE_API_KEY=(.*)/)[1].trim();
const geminiKey = execSync('gcloud secrets versions access latest --secret=axwise-v2-preview-001-gemini-api-key', { encoding: 'utf8' }).trim();

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;

const TASKS = {
  simple: {
    id: 'T1_SIMPLE',
    title: 'Current Weather & Currency Conversion',
    prompt: 'What is the current weather in Riga and convert 500 EUR to USD at central bank rate.',
  },
  middle: {
    id: 'T2_MIDDLE',
    title: 'Code Refactoring & Unit Test Verification',
    prompt: 'Inspect createUtilityTools in utilities-mcp.mjs, extract its parameters, and generate a Vitest unit test for error handling.',
  },
  complicated: {
    id: 'T3_COMPLICATED',
    title: '5-Year DCF Valuation & Risk Architecture',
    prompt: 'Construct a 5-year DCF valuation model with WACC calculation, terminal growth, sensitivity grid, and EU AI Act risk classification for an autonomous logistics fleet.',
  }
};

async function callGeminiRaw(prompt, thinkingLevel = 'high') {
  const t0 = performance.now();
  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 2048,
  };

  if (thinkingLevel && thinkingLevel !== 'off') {
    generationConfig.thinkingConfig = {
      thinkingLevel: thinkingLevel === 'high' ? 'high' : 'low'
    };
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    })
  });

  const dur = Math.round(performance.now() - t0);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokens = text.split(/\s+/).length;
  return { durationMs: dur, text, tokens, status: res.status };
}

function evaluateQuality(text, tier) {
  let score = 0;
  const metrics = [];

  if (tier === 'simple') {
    if (text.toLowerCase().includes('riga') || text.includes('temperature') || text.includes('°')) { score += 40; metrics.push('Location/Weather'); }
    if (text.includes('EUR') || text.includes('USD') || text.includes('rate') || /\d+/.test(text)) { score += 40; metrics.push('Currency conversion'); }
    if (text.length > 50) { score += 20; metrics.push('Cohesive structure'); }
  } else if (tier === 'middle') {
    if (text.includes('createUtilitiesServer') || text.includes('utilities-mcp')) { score += 30; metrics.push('Target symbol referenced'); }
    if (text.includes('test(') || text.includes('it(') || text.includes('describe(') || text.includes('expect(')) { score += 40; metrics.push('Valid Vitest structure'); }
    if (text.includes('error') || text.includes('catch') || text.includes('throw')) { score += 30; metrics.push('Error handling coverage'); }
  } else if (tier === 'complicated') {
    if (text.includes('DCF') || text.includes('WACC') || text.includes('Discount') || text.includes('Cash Flow')) { score += 30; metrics.push('DCF/WACC mechanics'); }
    if (text.includes('Sensitivity') || text.includes('Terminal') || text.includes('growth')) { score += 30; metrics.push('Financial tables'); }
    if (text.includes('AI Act') || text.includes('compliance') || text.includes('risk') || text.includes('high-risk')) { score += 40; metrics.push('Regulatory framework'); }
  }

  return { score, metrics: metrics.join(', ') };
}

async function runMatrix() {
  console.log('========================================================================================================');
  console.log('📊 END-TO-END MATRIX BENCHMARK: JEV + NATIVE GEMS + GEMINI 3.8 FLASH');
  console.log('Testing: [+/- JEV] × [+/- Native Gems] × [Dynamic vs Always-High Thinking] × [3 Task Tiers]');
  console.log('========================================================================================================\n');

  const results = [];

  for (const [tier, task] of Object.entries(TASKS)) {
    console.log(`\n========================================================================================================`);
    console.log(`📍 TASK TIER: [${tier.toUpperCase()}] - ${task.title}`);
    console.log(`Prompt: "${task.prompt}"`);
    console.log(`========================================================================================================`);

    // MODE 1: +Jev, +NativeGems, Variable Thinking (Optimized)
    {
      const t0 = performance.now();
      const jev = await triageTurnIntentWithJev({ message: task.prompt, apiKey: typesafeKey, timeoutMs: 2000 });
      const effort = jev.thinkingEffort || 'high';
      
      let toolTime = 0;
      if (tier === 'middle') {
        const tTools = performance.now();
        const code = readFileSync('packages/orqaly-goose-connector/src/utilities-mcp.mjs', 'utf8');
        astSearch({ pattern: 'export function createUtilityTools($$$ARGS)', code, lang: 'javascript' });
        computeLineHash(code.slice(0, 100));
        toolTime = Math.round(performance.now() - tTools);
      }

      const gemini = await callGeminiRaw(task.prompt, effort);
      const totalTime = Math.round(performance.now() - t0);
      const quality = evaluateQuality(gemini.text, tier);

      results.push({
        mode: '+JEV | +Gems | Variable Thinking',
        tier,
        triageLatency: jev.latencyMs,
        effort,
        geminiLatency: gemini.durationMs,
        totalTime,
        tokens: gemini.tokens,
        qualityScore: quality.score,
        qualityMetrics: quality.metrics
      });

      console.log(`[Mode 1: +JEV, +Gems, Variable] Total: ${totalTime}ms (Jev: ${jev.latencyMs}ms, Effort: ${effort.toUpperCase()}, Gemini: ${gemini.durationMs}ms) | Score: ${quality.score}% | Metrics: ${quality.metrics}`);
    }

    // MODE 2: -Jev, +NativeGems, Always High Thinking
    {
      const t0 = performance.now();
      const effort = 'high';

      let toolTime = 0;
      if (tier === 'middle') {
        const tTools = performance.now();
        const code = readFileSync('packages/orqaly-goose-connector/src/utilities-mcp.mjs', 'utf8');
        astSearch({ pattern: 'export function createUtilityTools($$$ARGS)', code, lang: 'javascript' });
        toolTime = Math.round(performance.now() - tTools);
      }

      const gemini = await callGeminiRaw(task.prompt, effort);
      const totalTime = Math.round(performance.now() - t0);
      const quality = evaluateQuality(gemini.text, tier);

      results.push({
        mode: '-JEV | +Gems | Always High',
        tier,
        triageLatency: 0,
        effort: 'high',
        geminiLatency: gemini.durationMs,
        totalTime,
        tokens: gemini.tokens,
        qualityScore: quality.score,
        qualityMetrics: quality.metrics
      });

      console.log(`[Mode 2: -JEV, +Gems, High]     Total: ${totalTime}ms (Jev: 0ms, Effort: HIGH, Gemini: ${gemini.durationMs}ms) | Score: ${quality.score}% | Metrics: ${quality.metrics}`);
    }

    // MODE 3: +Jev, -NativeGems, Variable Thinking (Text regex fallback)
    {
      const t0 = performance.now();
      const jev = await triageTurnIntentWithJev({ message: task.prompt, apiKey: typesafeKey, timeoutMs: 2000 });
      const effort = jev.thinkingEffort || 'high';

      let toolTime = 0;
      if (tier === 'middle') {
        const tTools = performance.now();
        try {
          execSync('grep -n "createUtilityTools" packages/orqaly-goose-connector/src/utilities-mcp.mjs', { encoding: 'utf8' });
        } catch {
          // ignore
        }
        toolTime = Math.round(performance.now() - tTools);
      }

      const gemini = await callGeminiRaw(task.prompt, effort);
      const totalTime = Math.round(performance.now() - t0);
      const quality = evaluateQuality(gemini.text, tier);

      results.push({
        mode: '+JEV | -Gems | Variable Thinking',
        tier,
        triageLatency: jev.latencyMs,
        effort,
        geminiLatency: gemini.durationMs,
        totalTime,
        tokens: gemini.tokens,
        qualityScore: quality.score,
        qualityMetrics: quality.metrics
      });

      console.log(`[Mode 3: +JEV, -Gems, Variable] Total: ${totalTime}ms (Jev: ${jev.latencyMs}ms, Effort: ${effort.toUpperCase()}, Gemini: ${gemini.durationMs}ms) | Score: ${quality.score}% | Metrics: ${quality.metrics}`);
    }

    // MODE 4: -JEV, -NativeGems, Always High Thinking (Legacy Baseline)
    {
      const t0 = performance.now();
      const effort = 'high';

      let toolTime = 0;
      if (tier === 'middle') {
        const tTools = performance.now();
        try {
          execSync('grep -n "createUtilityTools" packages/orqaly-goose-connector/src/utilities-mcp.mjs', { encoding: 'utf8' });
        } catch {
          // ignore
        }
        toolTime = Math.round(performance.now() - tTools);
      }

      const gemini = await callGeminiRaw(task.prompt, effort);
      const totalTime = Math.round(performance.now() - t0);
      const quality = evaluateQuality(gemini.text, tier);

      results.push({
        mode: '-JEV | -Gems | Always High (Legacy)',
        tier,
        triageLatency: 0,
        effort: 'high',
        geminiLatency: gemini.durationMs,
        totalTime,
        tokens: gemini.tokens,
        qualityScore: quality.score,
        qualityMetrics: quality.metrics
      });

      console.log(`[Mode 4: -JEV, -Gems, High]     Total: ${totalTime}ms (Jev: 0ms, Effort: HIGH, Gemini: ${gemini.durationMs}ms) | Score: ${quality.score}% | Metrics: ${quality.metrics}`);
    }
  }

  console.log('\n========================================================================================================');
  console.log('📈 COMPLETE COMPARATIVE MATRIX SCORECARD');
  console.log('========================================================================================================');
  console.table(results.map(r => ({
    'Tier': r.tier.toUpperCase(),
    'Configuration Mode': r.mode,
    'Effort': r.effort.toUpperCase(),
    'Jev (ms)': r.triageLatency,
    'Gemini (ms)': r.geminiLatency,
    'Total (ms)': r.totalTime,
    'Words': r.tokens,
    'Quality Score': `${r.qualityScore}%`
  })));
}

runMatrix();
