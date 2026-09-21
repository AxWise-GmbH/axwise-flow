import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEvaluationCatalog } from './catalog.mjs';
import { normalizeAgentEvaluationRecord, RECORD_SCHEMA_VERSION } from './records.mjs';
import { createEvaluationStorage, createWorkloadIdentity } from './storage.mjs';
import { evaluateOutput } from './evaluate.mjs';
import { runCodingPair } from './coding.mjs';

const API_ORIGIN = 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app';
const MODEL = 'gemini-3.8-flash';
const hash = value => createHash('sha256').update(value).digest('hex');
export function cycleId(slot) {
  const bytes = hash(`orqanix.agent-evaluation.v1:${slot}`);
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-a${bytes.slice(17, 20)}-${bytes.slice(20, 32)}`;
}

export function createEvaluationTransport({ apiOrigin = API_ORIGIN, tokenProvider, fetchImpl = fetch } = {}) {
  const url = new URL(apiOrigin);
  const allowed = url.origin === API_ORIGIN || /^https:\/\/(?:evaluations-[a-f0-9]{8}---)?orqaly-v2-api-preview-6b2bpwa4kq-ez\.a\.run\.app$/.test(url.origin);
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('invalid_preview_evaluation_origin');
  const base = `${url.origin}/internal/evaluations/v1`;
  async function post(path, body, signal) {
    const timeout = AbortSignal.timeout(path === '/execute' ? 330000 : 45000);
    const response = await fetchImpl(`${base}${path}`, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Orqaly-Evaluation-Authorization': `Bearer ${await tokenProvider()}` },
      body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`evaluation_http_${response.status}`); }
    return response.json();
  }
  return { base, execute: (body, signal) => post('/execute', body, signal),
    judge: (body, signal) => post('/judge', body, signal),
    review: (body, signal) => post('/engineering/review', body, signal) };
}

function reportedUsage(value) {
  if (value && Number.isSafeInteger(value.promptTokens) && Number.isSafeInteger(value.completionTokens) && Number.isSafeInteger(value.totalTokens)) {
    value = { inputTokens: value.promptTokens, outputTokens: value.completionTokens, totalTokens: value.totalTokens };
  }
  if (value && Number.isSafeInteger(value.prompt_tokens) && Number.isSafeInteger(value.completion_tokens) && Number.isSafeInteger(value.total_tokens)) {
    value = { inputTokens: value.prompt_tokens, outputTokens: value.completion_tokens, totalTokens: value.total_tokens };
  }
  if (!value || !['inputTokens', 'outputTokens', 'totalTokens'].every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)) return undefined;
  return Object.fromEntries(['inputTokens', 'outputTokens', 'totalTokens'].map(key => [key, value[key]]));
}
function normalizedModel(value) {
  return typeof value === 'string' && value ? value.replace(/^models\//, '') : MODEL;
}
function safeError(error) {
  const code = typeof error === 'string' ? error : error?.code || error?.message;
  return typeof code === 'string' && /^[A-Za-z0-9_:-]{1,100}$/.test(code) ? code : 'evaluation_execution_failed';
}
function requestBody(runId, slot, item, arm) {
  return { runId, slot, category: item.category, templateId: item.templateId, templateVersion: item.templateVersion,
    prompt: item.prompt, criteria: item.criteria, arm };
}

export async function runEvaluationCycle({ slot = new Date(), runnerRevision, transport,
  tokenProvider, codingRunner = runCodingPair, evaluator = evaluateOutput, signal,
  now = () => new Date(), clock = () => performance.now() } = {}) {
  if (!/^[a-f0-9]{40}$/.test(runnerRevision || '')) throw new Error('runner_revision_required');
  const catalog = buildEvaluationCatalog({ slot });
  const runId = cycleId(catalog.slot);
  const startedAt = now().toISOString();
  const evidenceCases = [];
  const cases = [];
  const evidenceRef = (category, arm) => `/heartbeat/evidence/${runId}.json#${category}-${arm}`;
  async function executeChecked(body) {
    const raw = await transport.execute(body, signal);
    if (!raw || ['runId', 'slot', 'category', 'templateId', 'templateVersion', 'arm'].some(key => raw[key] !== body[key])) {
      throw new Error('execution_receipt_identity_mismatch');
    }
    if (raw.evidence?.outputHash && (typeof raw.output !== 'string' || raw.evidence.outputHash !== hash(raw.output))) {
      throw new Error('execution_receipt_hash_mismatch');
    }
    return raw;
  }
  async function runArm(item, arm) {
    const start = now().toISOString();
    const ticks = clock();
    let raw;
    try { raw = await executeChecked(requestBody(runId, catalog.slot, item, arm)); }
    catch (error) { raw = { status: 'failed', error: safeError(error), output: '' }; }
    const elapsedMs = Math.round(clock() - ticks);
    const finishedAt = now().toISOString();
    const output = typeof raw.output === 'string' ? raw.output : '';
    const completed = raw.status === 'completed' && output.trim().length > 0;
    let assessment = { evaluation: { verdict: 'not_evaluated', reason: safeError(raw.error || 'execution_incomplete') }, evidence: {} };
    if (completed) {
      try {
        assessment = await evaluator({ runId, caseData: item, output, sources: raw.sources || [], signal,
          judge: body => transport.judge({ ...body, runId, category: item.category }, signal) });
      } catch { assessment = { evaluation: { verdict: 'not_evaluated', reason: 'evaluator_unavailable' }, evidence: {} }; }
    }
    const usage = reportedUsage(raw.usage);
    return {
      record: { status: completed ? 'completed' : 'failed', startedAt: start, finishedAt, elapsedMs,
        model: normalizedModel(raw.model), ...(raw.resolvedModel ? { resolvedModel: normalizedModel(raw.resolvedModel) } : {}),
        endpoint: arm === 'vanilla' ? 'gemini-direct' : typeof raw.path === 'string' ? raw.path
          : raw.path?.kind ? `${raw.path.kind}/${raw.path.route || item.category}` : `orqanix-assistant/${item.category}`,
        outputHash: hash(output), outputRef: evidenceRef(item.category, arm), ...(usage ? { usage } : {}),
        evaluation: assessment.evaluation, ...(!completed ? { error: safeError(raw.error || 'execution_incomplete') } : {}) },
      evidence: { output, outputHash: hash(output), executionPath: raw.path || null,
        operationId: raw.operationId || null, sources: raw.sources || [], providerEvidence: raw.evidence || null,
        assessment: assessment.evidence },
    };
  }
  // Two category workers bound load while keeping paired requests close in time.
  const pending = [...catalog.cases];
  async function worker() {
    while (pending.length) {
      const item = pending.shift();
      let pair;
      if (item.category === 'coding') {
        const start = now().toISOString();
        try {
          pair = await codingRunner({ caseData: item, apiBaseUrl: transport.base, tokenProvider, signal,
            accountHash: hash('orqanix-preview-agent-evaluations'), conversationId: `evaluation_${runId}`,
            vanillaCall: async () => executeChecked(requestBody(runId, catalog.slot, item, 'vanilla')),
            jevEvaluator: ({ request, signal: reviewSignal }) => transport.review(request, reviewSignal || signal),
          });
        } catch (error) {
          pair = Object.fromEntries(['orqanix', 'vanilla'].map(arm => [arm, { status: 'failed', error: safeError(error), output: '',
            startedAt: start, finishedAt: now().toISOString(), elapsedMs: Date.parse(now().toISOString()) - Date.parse(start) }]));
        }
        const arms = {};
        const armEvidence = {};
        for (const arm of ['orqanix', 'vanilla']) {
          const raw = pair[arm];
          const output = typeof raw.output === 'string' ? raw.output : JSON.stringify(raw.output || '');
          const status = raw.status === 'completed' ? 'completed' : 'failed';
          arms[arm] = { status, startedAt: raw.startedAt || start, finishedAt: raw.finishedAt || now().toISOString(),
            elapsedMs: raw.elapsedMs, model: normalizedModel(raw.model),
            ...(raw.resolvedModel ? { resolvedModel: normalizedModel(raw.resolvedModel) } : {}),
            endpoint: arm === 'orqanix' ? 'headless-omp/engineering-edit-tests-jev' : 'gemini-direct/fixture-tests',
            outputHash: hash(output), outputRef: evidenceRef(item.category, arm),
            evaluation: raw.evaluation || { verdict: 'not_evaluated', reason: 'engineering_incomplete' },
            ...(status === 'failed' ? { error: safeError(raw.error || 'engineering_incomplete') } : {}) };
          if (reportedUsage(raw.usage)) arms[arm].usage = reportedUsage(raw.usage);
          armEvidence[arm] = { output, outputHash: hash(output), evidence: raw.evidence || null, checks: raw.checks || null };
        }
        cases.push({ ...item, arms });
        evidenceCases.push({ ...item, arms: armEvidence });
      } else {
        const [orqanix, vanilla] = await Promise.all([runArm(item, 'orqanix'), runArm(item, 'vanilla')]);
        cases.push({ ...item, arms: { orqanix: orqanix.record, vanilla: vanilla.record } });
        evidenceCases.push({ ...item, arms: { orqanix: orqanix.evidence, vanilla: vanilla.evidence } });
      }
    }
  }
  await Promise.all([worker(), worker()]);
  const order = catalog.cases.map(item => item.category);
  cases.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  evidenceCases.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  const record = normalizeAgentEvaluationRecord({ schemaVersion: RECORD_SCHEMA_VERSION, executionMode: 'live',
    runId, slot: catalog.slot, startedAt, finishedAt: now().toISOString(), runnerRevision, cases });
  return { record, evidence: { ...record, schemaVersion: 'orqanix.agent-evaluation-evidence.v1',
    methodology: { cadenceSeconds: 900, comparison: 'same prompt; concurrent pairs; two categories at a time',
      latency: 'noncoding request-to-terminal response, excluding external judge; coding includes fixture tests and Jev review for both arms',
      codingScope: 'headless OMP bridge and disposable fixture; does not exercise packaged desktop UI',
      planScope: 'generated implementation plan; does not approve or execute a Goal',
      quality: 'deterministic checks plus advisory Jev review; no guarantee of factual correctness' },
    cases: evidenceCases.map(item => ({ ...item, arms: Object.fromEntries(['orqanix', 'vanilla'].map(arm => [arm,
      { ...record.cases.find(value => value.category === item.category).arms[arm], ...item.arms[arm] }])) })) } };
}

export async function main() {
  const identity = createWorkloadIdentity();
  const apiOrigin = process.env.EVALUATION_API_ORIGIN || API_ORIGIN;
  const tokenProvider = () => identity.idToken(API_ORIGIN);
  const transport = createEvaluationTransport({ apiOrigin, tokenProvider });
  const storage = createEvaluationStorage({ bucket: process.env.EVALUATION_BUCKET, tokenProvider: () => identity.accessToken() });
  const catalog = buildEvaluationCatalog();
  const runId = cycleId(catalog.slot);
  if (!await storage.claim(catalog.slot, runId)) {
    console.log(JSON.stringify({ event: 'evaluation-duplicate-skipped', runId, slot: catalog.slot }));
    return;
  }
  const result = await runEvaluationCycle({ slot: catalog.slot, runnerRevision: process.env.RUNNER_REVISION,
    transport, tokenProvider, signal: AbortSignal.timeout(12 * 60000) });
  await storage.publish(result.record, result.evidence);
  const outcomes = result.record.cases.map(item => ({ category: item.category,
    orqanix: { execution: item.arms.orqanix.status, evaluation: item.arms.orqanix.evaluation.verdict },
    vanilla: { execution: item.arms.vanilla.status, evaluation: item.arms.vanilla.evaluation.verdict } }));
  console.log(JSON.stringify({ event: 'agent-evaluation-published', runId, slot: catalog.slot, outcomes }));
  if (result.record.cases.some(item => Object.values(item.arms).some(arm => arm.status !== 'completed'))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error(JSON.stringify({ event: 'agent-evaluation-runner-failed' })); process.exitCode = 1; });
}
