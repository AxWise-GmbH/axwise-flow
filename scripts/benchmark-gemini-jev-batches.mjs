/** Live connector routing plus raw-provider latency samples; no desktop E2E claims. */
import { triageTurnIntentWithJev } from '../packages/orqaly-goose-connector/src/jev-loop-router.mjs';
import { callGeminiSample, isMain, runCli } from './benchmark-provider-client.mjs';

const BATCHES = {
  small: ['Acknowledge this proposed plan.', 'Explain how weather forecasts work.', 'Explain EUR/USD conversion without assuming a current rate.'],
  medium: ['Explain TypeScript type aliases and interfaces.', 'Propose a Vitest test for array deduplication.', 'Explain how to inspect symbol references.'],
  high: ['Outline a hypothetical DCF with WACC and sensitivity analysis.', 'Outline provisional discovery for a harbor cleaning boat.', 'Identify questions for a privacy review of a hypothetical drone fleet.'],
};

export async function runBenchmark({ generate = callGeminiSample, triage = triageTurnIntentWithJev,
  apiKey = process.env.TYPESAFE_API_KEY } = {}) {
  const results = [];
  for (const [tier, prompts] of Object.entries(BATCHES)) {
    for (const prompt of prompts) {
      const started = performance.now();
      const decision = await triage({ message: prompt, apiKey, timeoutMs: 2000 });
      if (decision.evaluated !== true) throw new Error('Jev batch sample was not evaluated.');
      const sample = await generate(prompt, { effort: decision.thinkingEffort || 'high', maxOutputTokens: 2048 });
      if (!sample.text?.trim() || sample.finishReason !== 'STOP') throw new Error('Batch generation sample is incomplete.');
      results.push({ tier, decision, sample, wallTimeMs: Math.round(performance.now() - started), sampleCount: 1 });
    }
  }
  return { kind: 'live-helper-provider-batch', productE2E: false, qualityReview: 'not_evaluated', baseline: null, results };
}

if (isMain(import.meta.url)) runCli(runBenchmark);
