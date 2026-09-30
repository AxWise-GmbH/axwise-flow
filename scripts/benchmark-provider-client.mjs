/** Bounded raw-provider sample. These measurements are not AxWise product E2E. */
import { pathToFileURL } from 'node:url';

export function isMain(url) {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === url;
}

export async function callGeminiSample(prompt, {
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.AXWISE_BENCHMARK_MODEL || 'gemini-3-flash-preview',
  effort = 'low', maxOutputTokens = 2048, timeoutMs = 90_000, fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error('Set GEMINI_API_KEY to run this live provider experiment.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test(model)) throw new Error('Invalid AXWISE_BENCHMARK_MODEL.');
  // This endpoint only requests low/high; never claim an unsupported "off" mode.
  const requestedEffort = effort === 'high' ? 'high' : 'low';
  const generationConfig = { temperature: 0.2, maxOutputTokens, thinkingConfig: { thinkingLevel: requestedEffort } };
  const started = performance.now();
  const controller = new AbortController();
  let timer;
  const request = (async () => {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new Error('Provider sample is incomplete or blocked (finishReason is not STOP).');
    const text = (candidate.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
    if (!text.trim()) throw new Error('Provider returned empty sample content.');
    return { requestedModel: model, returnedModel: data.modelVersion || null,
      requestedEffort, generationConfig, prompt, text,
      durationMs: Math.round(performance.now() - started), words: text.trim().split(/\s+/).length,
      usage: data.usageMetadata || null, finishReason: candidate.finishReason };
  })();
  try {
    return await Promise.race([request, new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Provider sample timed out.')); }, timeoutMs);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export function runCli(run) {
  run().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(`Benchmark failed: ${error.message}`);
    process.exitCode = 1;
  });
}
