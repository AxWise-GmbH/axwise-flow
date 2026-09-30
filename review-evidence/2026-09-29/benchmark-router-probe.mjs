// Offline reproduction of reviewed behavior, not a production regression suite.
// Run: node review-evidence/2026-09-29/benchmark-router-probe.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const router = await import(path.join(root, 'packages/orqaly-goose-connector/src/jev-loop-router.mjs'));
const log = [];
let generations = 0;
let gates = 0;
const benchmark = fs.readFileSync(path.join(root, 'scripts/benchmark-real-creation-times.mjs'), 'utf8')
  .replace(/^import[^\n]*\n/gm, '');

// Run the original script body. Replace every external dependency; no credentials
// are read, no child process runs, and no network request is sent.
await vm.runInNewContext(benchmark, {
  readFileSync: () => 'TYPESAFE_API_KEY=offline-dummy',
  execSync: () => 'offline-dummy',
  performance,
  triageTurnIntentWithJev: async () => {
    gates++;
    return { evaluated: false, reason: 'NETWORK_ERROR', route: 'research', thinkingEffort: 'high' };
  },
  fetch: async () => {
    generations++;
    return { ok: false, status: 500, json: async () => ({ error: { message: 'offline simulated failure' } }) };
  },
  console: { log: (...args) => log.push(args.join(' ')), table: rows => log.push(JSON.stringify(rows)) },
});
const summaries = JSON.parse(log.at(-1));
const reportedPasses = log.filter(line => line.includes('Status: PASSED')).length;
assert.equal(generations, 15);
assert.equal(reportedPasses, 3);
assert.ok(summaries.every(row => row['Total Words'] === 0));

const start = performance.now();
// Use a real Response/ReadableStream and honor abort during body download.
const delayed = await router.triageTurnIntentWithJev({
  message: 'Explain a compiler', apiKey: 'offline-dummy', timeoutMs: 20,
  fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) {
      const timer = setTimeout(() => {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({
          model: 'offline', answers: { route: { type: 'choice', choice: 'conversation', confidence: 0.9 } },
        })));
        controller.close();
      }, 100);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        controller.error(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    },
  })),
});
const elapsedMs = Math.round(performance.now() - start);
assert.equal(delayed.evaluated, true);
assert.ok(elapsedMs >= 80);

const malformedSafety = await router.evaluateArtifactSafetyWithJev({
  content: 'offline example', apiKey: 'offline-dummy',
  fetchImpl: async () => ({ ok: true, json: async () => ({ error: 'invalid response' }) }),
});
assert.equal(malformedSafety.evaluated, true);
assert.equal(malformedSafety.passed, true);

console.log(JSON.stringify({
  purpose: 'Demonstrates current defects; assertions should change when fixes land.',
  benchmark: { failedGenerations: generations, unevaluatedGates: gates, reportedPasses, allOutputsEmpty: true },
  routerBodyDeadline: { requestedTimeoutMs: 20, elapsedMs, evaluated: delayed.evaluated },
  malformedSafety,
}, null, 2));
