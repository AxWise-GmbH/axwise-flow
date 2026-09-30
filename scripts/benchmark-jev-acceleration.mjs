#!/usr/bin/env node
/** Live connector-helper samples; not desktop E2E or deliverable quality review. */
import { triageTurnIntentWithJev, evaluateArtifactSafetyWithJev } from '../packages/orqaly-goose-connector/src/jev-loop-router.mjs';
import { isMain, runCli } from './benchmark-provider-client.mjs';

export async function runBenchmarks({ apiKey = process.env.TYPESAFE_API_KEY,
  triage = triageTurnIntentWithJev, safety = evaluateArtifactSafetyWithJev } = {}) {
  if (!apiKey) throw new Error('Set TYPESAFE_API_KEY to run live connector samples.');
  const routes = [];
  for (const message of ['What is the forecast in Riga today?', 'Create a PRD from selected interview findings.', 'Explain aerobic threshold.']) {
    const result = await triage({ message, apiKey });
    if (result.evaluated !== true) throw new Error('Jev route was not evaluated.');
    routes.push({ message, result });
  }
  const samples = [
    { content: '# Fictional draft\nPropose a one-week prototype.', expectPassed: true },
    { content: '# Synthetic secret fixture\nSTRIPE_KEY="' + 'sk_live_' + '123456789012345678901234' + '"', expectPassed: false },
  ];
  const safetySamples = [];
  for (const sample of samples) {
    const result = await safety({ content: sample.content, apiKey });
    if (result.evaluated !== true || result.passed !== sample.expectPassed) throw new Error('Safety sample was unevaluated or did not match its fixture expectation.');
    safetySamples.push({ fixture: sample.expectPassed ? 'clean' : 'synthetic-secret', result });
  }
  return { kind: 'live-connector-helper-samples', productE2E: false, sampleCount: routes.length + safetySamples.length,
    baseline: null, deliverableReview: 'not_evaluated', routes, safetySamples };
}

if (isMain(import.meta.url)) runCli(runBenchmarks);
