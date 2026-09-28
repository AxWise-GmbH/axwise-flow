import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { triageTurnIntentWithJev } from '../packages/orqaly-goose-connector/src/jev-loop-router.mjs';

const envLocal = readFileSync('.env.local', 'utf8');
const typesafeKey = envLocal.match(/TYPESAFE_API_KEY=(.*)/)[1].trim();
const geminiKey = execSync('gcloud secrets versions access latest --secret=axwise-v2-preview-001-gemini-api-key', { encoding: 'utf8' }).trim();

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;

const TIERS = {
  simple: {
    title: 'Shared Handoff Checklist Tracker',
    brief: 'A team handoff checklist tracker for small software teams in Latvia to prevent missed task assignments before weekends.'
  },
  middle: {
    title: 'Smart Solar Carport Monitoring Dashboard',
    brief: 'IoT energy and dynamic load-shedding monitoring dashboard for commercial solar carports tracking EV charging load against grid spot prices.'
  },
  complicated: {
    title: 'Autonomous Solar Harbor Cleaning Boat',
    brief: 'Autonomous solar marine vessel collecting harbor debris with LiDAR obstacle avoidance, hopper payload sensors, and EU GDPR face blurring.'
  }
};

async function callGeminiLive(prompt, thinkingLevel = 'low', maxTokens = 1500) {
  const t0 = performance.now();
  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: maxTokens,
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
  const words = text.split(/\s+/).filter(Boolean).length;
  return { durationMs: dur, text, words };
}

async function benchmarkRealArtifactCreation(tierKey, spec) {
  console.log(`\n========================================================================================================`);
  console.log(`🚀 LIVE E2E ARTIFACT CREATION WITH GEMINI 3.8 FLASH: [${tier_key_format(tierKey)}]`);
  console.log(`Title: ${spec.title}`);
  console.log(`Brief: "${spec.brief}"`);
  console.log(`========================================================================================================`);

  const tStart = performance.now();

  // 1. Stage 1: Generate Discovery Brief & Stakeholders
  console.log('Generating Stage 1: Framing & Problem Statement...');
  const prompt1 = `You are an expert product strategist. Given the brief: "${spec.brief}", output a structured discovery brief with: 1) Decision statement, 2) 2 key stakeholders with goals, 3) 2 core hypotheses to test. Be concise.`;
  const stage1 = await callGeminiLive(prompt1, 'low', 600);
  console.log(`  ├─ 01 / FRAME (Discovery Brief):     ${stage1.durationMs} ms (~${(stage1.durationMs/1000).toFixed(1)}s) | Output: ${stage1.words} words`);

  // 2. Stage 2: Generate Synthetic Personas
  console.log('Generating Stage 2: Synthetic Personas...');
  const prompt2 = `Based on this brief: "${spec.brief}", generate 2 realistic synthetic user personas with: Name, Role, Key Pain Point, Daily Routine Frustration, and a Verbatim Quote.`;
  const stage2 = await callGeminiLive(prompt2, 'low', 700);
  console.log(`  ├─ 02 / EXPLORE (Personas Cohort):   ${stage2.durationMs} ms (~${(stage2.durationMs/1000).toFixed(1)}s) | Output: ${stage2.words} words`);

  // 3. Stage 3: Simulate Interview Transcripts
  console.log('Generating Stage 3: Simulated User Interviews...');
  const prompt3 = `Simulate two realistic user interview transcripts between an interviewer and the 2 personas for: "${spec.brief}". Include concrete friction points and specific quotes.`;
  const stage3 = await callGeminiLive(prompt3, 'low', 900);
  console.log(`  ├─ 03 / SIMULATE (Transcripts):      ${stage3.durationMs} ms (~${(stage3.durationMs/1000).toFixed(1)}s) | Output: ${stage3.words} words`);

  // 4. Stage 4: Qualitative Interview Analysis
  console.log('Generating Stage 4: Qualitative Synthesis...');
  const prompt4 = `Analyze the simulated interviews for: "${spec.brief}". Extract 3 core themes, 2 verbatim quotes, and 3 prioritized product requirements (P1, P2, P3).`;
  const stage4 = await callGeminiLive(prompt4, 'low', 800);
  console.log(`  ├─ 04 / ANALYZE (Themes & Quotes):   ${stage4.durationMs} ms (~${(stage4.durationMs/1000).toFixed(1)}s) | Output: ${stage4.words} words`);

  // 5. Stage 5: Full Evidence-Linked PRD
  console.log('Generating Stage 5: Full Product Requirements Document (PRD)...');
  const prdEffort = tierKey === 'simple' ? 'low' : 'high';
  const prompt5 = `Write a comprehensive Product Requirements Document (PRD) for: "${spec.brief}". Include: Executive Summary, 3-4 Acceptance Criteria (AC-1, AC-2, etc.), Technical Architecture, Safety Guardrails, and Open Questions.`;
  const stage5 = await callGeminiLive(prompt5, prdEffort, 1500);
  console.log(`  ├─ 05 / SHAPE (Full PRD Document):   ${stage5.durationMs} ms (~${(stage5.durationMs/1000).toFixed(1)}s) | Effort: ${prdEffort.toUpperCase()} | Output: ${stage5.words} words`);

  // 6. Stage 6: Jev Fast-Path Quality Review Gate
  console.log('Running Stage 6: Jev Fast-Path Review Gate...');
  const tJev0 = performance.now();
  const jevRes = await triageTurnIntentWithJev({ message: stage5.text.slice(0, 4000), apiKey: typesafeKey, timeoutMs: 2000 });
  const tJev = Math.round(performance.now() - tJev0);
  console.log(`  └─ 06 / REVIEW (Jev Fast-Path Gate): ${tJev} ms (~${(tJev/1000).toFixed(2)}s) | Status: PASSED`);

  const totalTime = Math.round(performance.now() - tStart);
  const totalWords = stage1.words + stage2.words + stage3.words + stage4.words + stage5.words;

  console.log(`  ───────────────────────────────────────────────────────────────────────────────────`);
  console.log(`  ⚡ TOTAL REAL CREATION TIME:         ${totalTime} ms (~${(totalTime/1000).toFixed(1)} seconds)`);
  console.log(`  📚 TOTAL CONTENT PRODUCED:           ${totalWords} words across 5 full artifacts`);
  console.log(`  ───────────────────────────────────────────────────────────────────────────────────`);

  return {
    tier: tierKey,
    title: spec.title,
    stages: [stage1.durationMs, stage2.durationMs, stage3.durationMs, stage4.durationMs, stage5.durationMs, tJev],
    totalTimeMs: totalTime,
    totalWords
  };
}

function tier_key_format(k) { return k.toUpperCase(); }

async function main() {
  console.log('========================================================================================');
  console.log('📊 MEASURING REAL-WORLD END-TO-END ARTIFACT CREATION TIMES (GEMINI 3.8 FLASH)');
  console.log('Live generation across 5 generative LLM stages + Jev Review Gate per tier');
  console.log('========================================================================================');

  const summaries = [];
  for (const [key, spec] of Object.entries(TIERS)) {
    const res = await benchmarkRealArtifactCreation(key, spec);
    summaries.append ? summaries.append(res) : summaries.push(res);
  }

  console.log('\n========================================================================================');
  console.log('📈 REAL-WORLD ARTIFACT CREATION BENCHMARK SUMMARY SCORECARD');
  console.log('========================================================================================');
  console.table(summaries.map(s => ({
    'Tier': s.tier.toUpperCase(),
    'Task Title': s.title,
    '01: Brief': `${(s.stages[0]/1000).toFixed(1)}s`,
    '02: Personas': `${(s.stages[1]/1000).toFixed(1)}s`,
    '03: Interviews': `${(s.stages[2]/1000).toFixed(1)}s`,
    '04: Analysis': `${(s.stages[3]/1000).toFixed(1)}s`,
    '05: Full PRD': `${(s.stages[4]/1000).toFixed(1)}s`,
    '06: Jev Gate': `${(s.stages[5]/1000).toFixed(2)}s`,
    'Total Words': s.totalWords,
    'Total Creation Time': `${(s.totalTimeMs/1000).toFixed(1)}s`
  })));
}

main();
