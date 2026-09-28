import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { triageTurnIntentWithJev } from '../packages/orqaly-goose-connector/src/jev-loop-router.mjs';

const envLocal = readFileSync('.env.local', 'utf8');
const typesafeKey = envLocal.match(/TYPESAFE_API_KEY=(.*)/)[1].trim();
const geminiKey = execSync('gcloud secrets versions access latest --secret=axwise-v2-preview-001-gemini-api-key', { encoding: 'utf8' }).trim();

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiKey}`;

const BATCHES = {
  small: [
    { id: 'S1', text: 'yes proceed with the plan' },
    { id: 'S2', text: 'what is the current temperature in Riga?' },
    { id: 'S3', text: 'convert 2500 EUR to USD at central bank rate' }
  ],
  medium: [
    { id: 'M1', text: 'find all references to createDesktopDecisionService using astSearch' },
    { id: 'M2', text: 'explain the difference between type alias and interface in TypeScript' },
    { id: 'M3', text: 'write a unit test in Vitest verifying array deduplication' }
  ],
  high: [
    { id: 'H1', text: 'Build a 5-year DCF valuation model with WACC, terminal growth, and sensitivity table for an enterprise SaaS startup' },
    { id: 'H2', text: 'Prepare full discovery scope, synthetic persona interviews, and PRD for an autonomous solar harbor cleaning boat' },
    { id: 'H3', text: 'Draft EU AI Act high-risk risk assessment and GDPR Article 17 erasure framework for an autonomous drone fleet' }
  ]
};

async function callGemini(prompt, thinkingLevel) {
  const t0 = Date.now();
  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 1024,
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

  const dur = Date.now() - t0;
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { durationMs: dur, text, status: res.status };
}

async function runBenchmark() {
  console.log('========================================================================================');
  console.log('⚡ END-TO-END BENCHMARK: JEV SYSTEM-1 DYNAMIC ROUTING + GEMINI 3.8 FLASH');
  console.log('========================================================================================\n');

  for (const [tier, queries] of Object.entries(BATCHES)) {
    console.log(`>>> BATCH TIER: [${tier.toUpperCase()}] (${queries.length} queries) <<<`);
    console.log('----------------------------------------------------------------------------------------');

    for (const q of queries) {
      // 1. Jev System-1 Triage
      const jevResult = await triageTurnIntentWithJev({
        message: q.text,
        apiKey: typesafeKey,
        timeoutMs: 2000
      });

      const lane = jevResult.route;
      const effort = jevResult.thinkingEffort || 'high';
      const jevLatency = jevResult.latencyMs || 0;

      // 2. Gemini 3.8 Flash Generation
      const geminiResult = await callGemini(q.text, effort);
      const totalTurnTime = jevLatency + geminiResult.durationMs;

      console.log(`[${q.id}] "${q.text.slice(0, 42)}..."`);
      console.log(`  ├─ Jev Triage (2.0s deadline): ${jevLatency} ms | Lane: ${lane} | Effort: ${effort.toUpperCase()} (${(jevResult.confidence * 100).toFixed(0)}% conf)`);
      console.log(`  ├─ Gemini 3.8 Flash Latency:  ${geminiResult.durationMs} ms (Thinking: ${effort})`);
      console.log(`  └─ Total Turn Time:          ${totalTurnTime} ms | Output: "${geminiResult.text.trim().slice(0, 60).replace(/\n/g, ' ')}..."\n`);
    }
  }

  console.log('========================================================================================');
  console.log('✅ End-to-end multi-batch routing & latency benchmark completed successfully.');
  console.log('========================================================================================');
}

runBenchmark();
