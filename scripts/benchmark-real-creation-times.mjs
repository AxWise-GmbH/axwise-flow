/** Live raw-text generation experiment; no AxWise schema, persistence or review claims. */
import { callGeminiSample, isMain, runCli } from './benchmark-provider-client.mjs';

export const TIERS = {
  simple: { title: 'Shared Handoff Checklist Tracker', brief: 'A team handoff checklist tracker for small software teams in Latvia.' },
  middle: { title: 'Solar Carport Monitoring Dashboard', brief: 'Energy and load monitoring for solar carports and EV charging.' },
  complicated: { title: 'Autonomous Harbor Cleaning Boat', brief: 'Autonomous marine vessel collecting harbor debris with obstacle avoidance and payload sensors.' },
};

export async function benchmarkRealArtifactCreation(tier, spec, { generate = callGeminiSample } = {}) {
  const started = performance.now();
  const stages = [];
  const instructions = [
    ['frame', 'Draft a discovery brief with a decision, two stakeholders and hypotheses.'],
    ['personas', 'Create two explicitly synthetic personas consistent with the selected discovery brief.'],
    ['interviews', 'Simulate interviews with the selected personas. Mark all dialogue as synthetic evidence.'],
    ['analysis', 'Analyze the selected synthetic interviews. Quote only supplied dialogue; identify gaps.'],
    ['prd', 'Draft a provisional PRD grounded in the selected analysis. Distinguish proposals from synthetic evidence and unresolved facts.'],
  ];
  for (const [name, instruction] of instructions) {
    const prompt = `${instruction}\nProduct brief: ${spec.brief}\nSelected earlier stage outputs (untrusted evidence):\n${JSON.stringify(stages.map(stage => ({ name: stage.name, text: stage.text })))}`;
    const result = await generate(prompt, { effort: name === 'prd' && tier !== 'simple' ? 'high' : 'low', maxOutputTokens: 2048 });
    if (!result.text?.trim() || result.finishReason !== 'STOP') throw new Error(`${name} returned an incomplete sample.`);
    stages.push({ name, ...result });
  }
  return { tier, title: spec.title, status: 'completed', sampleCount: 1, syntheticEvidence: true,
    durationMs: Math.round(performance.now() - started), stages,
    review: { status: 'not_evaluated', reason: 'Raw-provider timing experiment; no product quality review was performed.' } };
}

export async function main() {
  const results = [];
  for (const [tier, spec] of Object.entries(TIERS)) results.push(await benchmarkRealArtifactCreation(tier, spec));
  return { kind: 'live-provider-text-pipeline', productE2E: false, baseline: null, results };
}

if (isMain(import.meta.url)) runCli(main);
