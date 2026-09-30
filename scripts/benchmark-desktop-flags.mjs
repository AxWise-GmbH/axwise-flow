/** Live paired decision-service benchmark. Excludes Electron/auth and downstream generation. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createDesktopDecisionService } from '../apps/orqaly/server/workflow-v2/desktop-decision-service.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(new URL('../apps/orqaly/package.json', import.meta.url));
const { parse } = require('dotenv');
const CASES = [
  { lane: 'conversation', message: 'Explain why Earth has seasons.' },
  { lane: 'quick_info', message: 'What is the weather forecast for Riga today?' },
  { lane: 'research', message: 'Create a product requirements document from the supplied customer interview findings.' },
  { lane: 'local_engineering', message: 'Inspect the repository and fix the failing checkout unit test.' },
  { lane: 'mixed', message: 'Explain how sorting algorithms work, then edit the local sort helper and add regression tests.' },
];
const percentile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1] : null;

export async function run({ repetitions = 3, baseline = '21009d825aa64bf99eab42c7ee465f0597c7e214', destination = resolve(root, 'review-evidence/2026-09-29/performance/desktop-flags-results.json') } = {}) {
  let key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    try { key = parse(readFileSync(resolve(root, '.env.local'))).TYPESAFE_API_KEY; } catch { /* normal optional runtime config */ }
  }
  if (!key) throw new Error('TYPESAFE_API_KEY is not configured.');
  const baseCommit = execFileSync('git', ['rev-parse', '--verify', `${baseline}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  const oldSource = execFileSync('git', ['show', `${baseCommit}:apps/orqaly/server/workflow-v2/desktop-decision-service.js`], { cwd: root, encoding: 'utf8' });
  const baselineCode = oldSource.replace("from 'zod'", `from ${JSON.stringify(pathToFileURL(require.resolve('zod')).href)}`);
  const { createDesktopDecisionService: baselineFactory } = await import('data:text/javascript;base64,' + Buffer.from(baselineCode).toString('base64'));
  const factories = { before: baselineFactory, after: createDesktopDecisionService };
  const rows = [];
  const metadata = {
    kind: 'live-paired-desktop-decision-component', baseCommit, startedAt: new Date().toISOString(),
    repetitions, prompts: CASES, timeoutMs: 2000,
    scope: 'Real production decision service and TypeSafe HTTP; excludes Electron/auth, downstream generation, and OMP execution.',
    disabledPolicy: 'Desktop bypasses guidance entirely when jevReviewEnabled=false; service disabled output is diagnostic only.',
    modelEffort: 'Unchanged by this production feature flag.',
    modelRequest: 'jev-latest', baselineSourceSha256: createHash('sha256').update(oldSource).digest('hex'),
    currentSourceSha256: createHash('sha256').update(readFileSync(resolve(root, 'apps/orqaly/server/workflow-v2/desktop-decision-service.js'))).digest('hex'),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
  };
  mkdirSync(dirname(destination), { recursive: true });
  function save() {
    const summary = [];
    for (const arm of ['before', 'after']) for (const enabled of [false, true]) {
      const group = rows.filter(row => row.arm === arm && row.enabled === enabled);
      const accepted = group.filter(row => row.desktopWouldAcceptAdvice);
      summary.push({ arm, enabled, n: group.length,
        httpCalls: group.reduce((n, row) => n + row.providerCalls, 0),
        p50Ms: percentile(group.map(row => row.wallTimeMs), 0.5),
        p95ObservedMs: percentile(group.map(row => row.wallTimeMs), 0.95),
        exactRoutes: enabled ? group.filter(row => row.decision.decision === row.expectedLane).length : null,
        acceptedAdvice: accepted.length,
        acceptedCorrectAdvice: accepted.filter(row => row.decision.decision === row.expectedLane).length,
        timeouts: group.filter(row => row.decision.reason === 'timeout').length,
        providerUnavailable: group.filter(row => row.decision.reason === 'provider_unavailable').length,
        desktopDeadlineMisses: enabled ? group.filter(row => !row.withinDesktopDeadline).length : 0,
        disabledBypass: !enabled,
      });
    }
    const paired = new Map();
    for (const row of rows.filter(row => row.enabled)) {
      const id = `${row.repetition}:${row.expectedLane}`;
      const pair = paired.get(id) || {};
      pair[row.arm] = row.wallTimeMs;
      paired.set(id, pair);
    }
    const differences = [...paired.values()].filter(pair => pair.before !== undefined && pair.after !== undefined).map(pair => pair.after - pair.before);
    const pairedComparison = { n: differences.length,
      afterMinusBeforeMedianMs: percentile(differences, 0.5),
      afterMinusBeforeMeanMs: differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null,
      scope: 'Within-prompt paired component latency; insufficient to establish downstream speedup.' };
    writeFileSync(destination, JSON.stringify({ ...metadata, endedAt: new Date().toISOString(), rows, summary, pairedComparison,
      caveat: 'Exploratory repeated component samples; observed p95 is descriptive, not a stable tail estimate. Disabled routing has no classifier and cannot demonstrate downstream speed or quality.' }, null, 2) + '\n');
  }
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const [index, task] of CASES.entries()) {
      const arms = (repetition + index) % 2 ? ['after', 'before'] : ['before', 'after'];
      for (const enabled of [false, true]) for (const arm of arms) {
        let providerCalls = 0;
        const receipts = [];
        const captures = [];
        const fetchImpl = async (...args) => {
          providerCalls++;
          const start = performance.now();
          const response = await fetch(...args);
          captures.push(response.clone().text().then(text => {
            let parsed; try { parsed = JSON.parse(text); } catch { parsed = null; }
            receipts.push({ status: response.status, durationMs: Math.round(performance.now() - start),
              model: parsed?.model ?? null, answers: parsed?.answers ?? null });
          }).catch(() => {}));
          return response;
        };
        const service = factories[arm]({ apiKey: key, fetchImpl, timeoutMs: 2000 });
        const sessionId = `bench-${repetition}-${index}`;
        const start = performance.now();
        const decision = await service.decide({}, { kind: 'lane_triage', sessionId, message: task.message, enabled });
        const wallTimeMs = Number((performance.now() - start).toFixed(3));
        await Promise.allSettled(captures);
        const deadlineMs = arm === 'before' ? 1200 : 2500;
        const withinDesktopDeadline = wallTimeMs < deadlineMs;
        const compatible = arm === 'before'
          ? Boolean(decision.decision && decision.decision !== 'uncertain')
          : decision.reason === 'classified' && decision.kind === 'lane_triage' && decision.sessionId === sessionId &&
            decision.advisory === true && Number.isFinite(decision.confidence) && decision.confidence >= 0.8 && decision.confidence <= 1 &&
            CASES.some(c => c.lane === decision.decision);
        const row = { repetition, arm, enabled, expectedLane: task.lane, promptSha256: createHash('sha256').update(task.message).digest('hex'),
          wallTimeMs, providerCalls, deadlineMs, withinDesktopDeadline,
          desktopWouldAcceptAdvice: enabled && compatible && withinDesktopDeadline,
          decision, receipts };
        rows.push(row); save();
        console.log(JSON.stringify({ repetition, arm, enabled, expected: task.lane, actual: decision.decision,
          reason: decision.reason, wallTimeMs, desktopWouldAcceptAdvice: row.desktopWouldAcceptAdvice }));
      }
    }
  }
  save();
  return JSON.parse(readFileSync(destination, 'utf8'));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run().then(result => console.log(JSON.stringify({ summary: result.summary }, null, 2))).catch(error => {
    console.error(`Decision benchmark failed: ${error.message}`); process.exitCode = 1;
  });
}
