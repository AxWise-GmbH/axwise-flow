// Automated Multi-Turn Cloud Run Preview Benchmark Suite
import { performance } from 'node:perf_hooks';

const project = 'axwise-v2-preview-001';
const region = 'europe-west4';
const webOrigin = 'https://orqaly-v2-web-preview-6b2bpwa4kq-ez.a.run.app';
const apiOrigin = 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app';
const axwiseOrigin = 'https://axwise-v2-preview-6b2bpwa4kq-ez.a.run.app';
const searchOrigin = 'https://axwise-v2-search-preview-6b2bpwa4kq-ez.a.run.app';

export async function runPreviewBenchmark(token) {
  const scorecard = {
    timestamp: new Date().toISOString(),
    services: {},
    turns: [],
  };

  // 1. Probes
  const probes = [
    { name: 'orqaly-v2-web-preview', url: webOrigin },
    { name: 'orqaly-v2-api-preview', url: `${apiOrigin}/readyz` },
    { name: 'axwise-v2-preview', url: `${axwiseOrigin}/healthz` },
    { name: 'axwise-v2-search-preview', url: searchOrigin },
  ];

  for (const probe of probes) {
    const t0 = performance.now();
    try {
      const res = await fetch(probe.url);
      scorecard.services[probe.name] = { status: res.status, latencyMs: Math.round(performance.now() - t0) };
    } catch (e) {
      scorecard.services[probe.name] = { status: 'ERR', message: e.message };
    }
  }

  // 2. Session Auth
  const tAuth = performance.now();
  const sessionRes = await fetch(`${apiOrigin}/desktop/v1/session`, { headers: { Authorization: `Bearer ${token}` } });
  const sessionData = await sessionRes.json();
  scorecard.services['desktop-session-gateway'] = {
    status: sessionRes.status,
    latencyMs: Math.round(performance.now() - tAuth),
    userId: sessionData.userId,
    tenantBound: sessionData.tenantBound,
  };

  // 3. Conversational Reasoning Turn
  const tChat = performance.now();
  const chatRes = await fetch(`${apiOrigin}/desktop/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'orqaly-gemini',
      messages: [{ role: 'user', content: 'What is the standard VAT rate in Estonia in 2026? State the percentage in one sentence.' }],
      max_tokens: 800,
    }),
  });
  const chatData = await chatRes.json();
  scorecard.turns.push({
    kind: 'conversational_reasoning',
    status: chatRes.status,
    latencyMs: Math.round(performance.now() - tChat),
    model: chatData.model,
    tokens: chatData.usage,
    reply: chatData.choices?.[0]?.message?.content?.trim(),
  });

  return scorecard;
}

if (process.argv[1] && process.argv[1].endsWith('workflow-v2-preview-benchmark.mjs')) {
  const token = process.env.BENCHMARK_TOKEN;
  if (!token) {
    console.error('Usage: BENCHMARK_TOKEN=<token> node workflow-v2-preview-benchmark.mjs');
    process.exit(1);
  }
  runPreviewBenchmark(token)
    .then((sc) => console.log(JSON.stringify(sc, null, 2)))
    .catch((err) => { console.error(err); process.exit(1); });
}
