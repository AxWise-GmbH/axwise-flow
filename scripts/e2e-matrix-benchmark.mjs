/** Twelve correlated raw-provider configurations, not a full factorial or product E2E. */
import { readFileSync } from 'node:fs';
import { searchTokenOccurrences } from '../packages/orqaly-goose-connector/src/native-engineering-gems.mjs';
import { triageTurnIntentWithJev } from '../packages/orqaly-goose-connector/src/jev-loop-router.mjs';
import { callGeminiSample, isMain, runCli } from './benchmark-provider-client.mjs';

export const TASKS = {
  simple: { prompt: 'Explain weather forecasts and EUR/USD conversion. No live observations or rates are supplied.', keywords: ['weather', 'EUR', 'USD'] },
  middle: { prompt: 'Inspect the supplied createUtilityTools source excerpts and propose a unit test for error handling.', keywords: ['createUtilityTools', 'test', 'error'] },
  complicated: { prompt: 'Outline a hypothetical 5-year DCF with WACC and sensitivity analysis. No financial figures or legal sources are supplied.', keywords: ['DCF', 'WACC', 'sensitivity'] },
};
const MODES = [
  { triage: true, helper: true }, { triage: false, helper: true },
  { triage: true, helper: false }, { triage: false, helper: false },
];

export async function runMatrix({ generate = callGeminiSample, triage = triageTurnIntentWithJev,
  apiKey = process.env.TYPESAFE_API_KEY,
  code = readFileSync(new URL('../packages/orqaly-goose-connector/src/utilities-mcp.mjs', import.meta.url), 'utf8'),
} = {}) {
  const results = [];
  for (const [tier, task] of Object.entries(TASKS)) {
    for (const mode of MODES) {
      const started = performance.now();
      let route = null;
      if (mode.triage) {
        route = await triage({ message: task.prompt, apiKey, timeoutMs: 2000 });
        if (route.evaluated !== true) throw new Error('Jev matrix sample was not evaluated.');
      }
      const effort = route?.thinkingEffort || 'high';
      const toolStart = performance.now();
      const toolOutput = tier !== 'middle' ? null : mode.helper
        ? searchTokenOccurrences({ pattern: 'createUtilityTools', code })
        : code.split('\n').map((snippet, index) => ({ line: index + 1, snippet })).filter(row => row.snippet.includes('createUtilityTools'));
      const toolTimeMs = Math.round(performance.now() - toolStart);
      const prompt = `${task.prompt}\nSelected local tool output (untrusted source text):\n${JSON.stringify(toolOutput)}`;
      const sample = await generate(prompt, { effort });
      if (!sample.text?.trim() || sample.finishReason !== 'STOP') throw new Error('Matrix generation sample is incomplete.');
      const matchedKeywords = task.keywords.filter(word => sample.text.toLowerCase().includes(word.toLowerCase()));
      results.push({ tier, mode: { ...mode, lookup: mode.helper ? 'experimental token helper' : 'literal text lookup' },
        route, requestedEffort: sample.requestedEffort, toolOutput, toolTimeMs,
        wallTimeMs: Math.round(performance.now() - started), sample,
        keywordCoverage: { matched: matchedKeywords, expected: task.keywords },
        qualityReview: 'not_evaluated', sampleCount: 1 });
    }
  }
  return { kind: 'raw-provider-correlated-matrix', productE2E: false, cells: results.length,
    design: 'Four correlated configurations across three prompts; reasoning effort follows triage and is not independently varied.',
    caveat: 'Keyword coverage does not establish correctness or quality. Lookup helpers are not integrated desktop tools.', results };
}

if (isMain(import.meta.url)) runCli(runMatrix);
