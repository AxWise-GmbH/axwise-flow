import { z } from 'zod';
import { sha256Hex } from '../../lib/workflow-v2/canonical.js';
import { deterministicUuid } from './ids.js';

const GOOGLE_CHAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'gemini-3.8-flash';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_WAIT_MS = 240_000;
const PROVIDER_WAIT_MS = 180_000;
const JUDGE_WAIT_MS = 8_000;
const slug = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
const criterion = z.string().trim().min(1).max(2000);
const evaluationPrompt = z.string().trim().min(1).max(24_000);

export const AgentEvaluationExecuteSchema = z.object({
  runId: z.uuid(),
  slot: z.string().datetime({ offset: true }),
  category: z.enum(['message', 'search', 'research', 'plan', 'coding']),
  templateId: slug,
  templateVersion: z.number().int().min(1).max(1_000_000),
  prompt: evaluationPrompt,
  criteria: z.array(criterion).min(1).max(16),
  arm: z.enum(['orqanix', 'vanilla']),
}).strict().superRefine((command, context) => {
  if (command.category === 'coding' && command.arm !== 'vanilla')
    context.addIssue({ code: 'custom', path: ['arm'], message: 'coding Orqanix runs use the OMP fixture' });
});

export const AgentEvaluationJudgeSchema = z.object({
  runId: z.uuid(),
  category: z.enum(['message', 'search', 'research', 'plan', 'coding']),
  prompt: evaluationPrompt,
  criteria: z.array(criterion).min(1).max(16),
  output: z.string().min(1).max(120_000),
  sources: z.array(z.object({
    title: z.string().max(500).optional(),
    url: z.string().url().max(4000),
    excerpt: z.string().min(1).max(4000).optional(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  }).strict().superRefine((source, context) => {
    if ((source.excerpt === undefined) !== (source.contentHash === undefined))
      context.addIssue({ code: 'custom', message: 'source excerpt and contentHash must be supplied together' });
    if (source.excerpt !== undefined && sha256Hex(source.excerpt) !== source.contentHash)
      context.addIssue({ code: 'custom', path: ['contentHash'], message: 'source excerpt hash does not match' });
  })).max(40).default([]),
}).strict();

export class AgentEvaluationError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

async function boundedJson(response) {
  const type = response.headers.get('content-type')?.toLowerCase() || '';
  if (!response.ok || !type.startsWith('application/json') || !response.body)
    throw new AgentEvaluationError('PROVIDER_UNAVAILABLE', response.status === 429 ? 429 : 502);
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new AgentEvaluationError('INVALID_PROVIDER_RESPONSE', 502);
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof AgentEvaluationError) throw error;
    throw new AgentEvaluationError('INVALID_PROVIDER_RESPONSE', 502);
  } finally { void reader.cancel().catch(() => {}); }
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => typeof part?.text === 'string' ? part.text : '').join('');
}

function assistantResult(command, result, identifiers, elapsedMs) {
  const message = result.message;
  const operation = message?.parts?.find((part) => part.type === 'operation_status');
  const pending = result.persisted === false || ['accepted', 'running', 'cancel_requested'].includes(operation?.status);
  const failed = ['failed', 'cancelled'].includes(operation?.status);
  const output = (message?.parts || []).filter((part) => part.type === 'text' || part.type === 'artifact')
    .map((part) => part.markdown).join('\n\n');
  const sources = (message?.parts || []).filter((part) => part.type === 'source')
    .map((part) => ({ title: part.title, url: part.url, sourceTypes: part.sourceTypes }));
  const facts = (message?.parts || []).filter((part) => part.type === 'fact');
  return {
    status: pending ? 'running' : failed ? 'failed' : 'completed',
    runId: command.runId, slot: command.slot, category: command.category,
    templateId: command.templateId, templateVersion: command.templateVersion, arm: command.arm,
    output, model: message?.model || MODEL, resolvedModel: message?.modelVersion || null,
    usage: null, sources, operationId: message?.axwiseOperationId || operation?.operationId || null,
    path: { kind: 'orqanix_assistant', route: result.route, threadId: identifiers.threadId, turnId: identifiers.turnId },
    evidence: { persisted: result.persisted === true, outputHash: output ? sha256Hex(output) : null,
      sourceCount: sources.length, sourceLinkedFactCount: facts.filter((fact) => fact.sourceUrls?.length).length,
      latencyMs: elapsedMs },
    ...(failed ? { error: { code: operation?.errorClass || operation?.status?.toUpperCase() || 'ASSISTANT_FAILED' } } : {}),
  };
}

function noul(answer) {
  return answer?.type === 'noul' && Number.isFinite(answer.noul) && answer.noul >= 0 && answer.noul <= 1
    ? answer.noul : null;
}

export function createAgentEvaluationService({
  assistantService,
  userId,
  geminiApiKey,
  typesafeApiKey,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxWaitMs = MAX_WAIT_MS,
} = {}) {
  if (typeof assistantService?.send !== 'function' || typeof assistantService?.resume !== 'function')
    throw new Error('evaluation assistant service is required');
  if (typeof userId !== 'string' || !userId) throw new Error('evaluation user is required');
  if (typeof geminiApiKey !== 'string' || !geminiApiKey.trim() || /[\r\n]/.test(geminiApiKey))
    throw new Error('evaluation Gemini API key is required');
  if (!Number.isInteger(maxWaitMs) || maxWaitMs < 1 || maxWaitMs > MAX_WAIT_MS)
    throw new Error('evaluation wait is invalid');
  const auth = Object.freeze({ userId });

  async function runOrqanix(command, signal) {
    const threadId = deterministicUuid('agent-evaluation', command.runId, command.category, command.templateId);
    const turnId = deterministicUuid(threadId, command.templateVersion, sha256Hex(command.prompt));
    const started = Date.now();
    const intent = command.category === 'message' ? 'assistant' : 'research';
    let result = await assistantService.send(auth, threadId, { turnId, issuedAt: command.slot,
      message: command.prompt, intent });
    while (result.persisted === false && Date.now() - started < maxWaitMs) {
      signal?.throwIfAborted();
      const wait = result.message?.parts?.find((part) => part.type === 'operation_status')?.retryAfterSeconds;
      await sleep(Math.min(10_000, Math.max(250, (wait || 1) * 1000)));
      signal?.throwIfAborted();
      result = await assistantService.resume(auth, threadId, turnId);
    }
    return assistantResult(command, result, { threadId, turnId }, Date.now() - started);
  }

  async function runVanilla(command, signal) {
    const started = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, PROVIDER_WAIT_MS);
    timer.unref?.();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let body;
    try {
      body = await boundedJson(await fetchImpl(GOOGLE_CHAT_URL, {
        method: 'POST', redirect: 'error', signal: controller.signal, headers: {
          Authorization: `Bearer ${geminiApiKey.trim()}`, 'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: command.prompt }],
          reasoning_effort: 'high', max_completion_tokens: 8192 }),
      }));
    } catch (error) {
      if (error instanceof AgentEvaluationError) throw error;
      throw new AgentEvaluationError(timedOut ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', timedOut ? 504 : 502);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
    const output = textFromContent(body?.choices?.[0]?.message?.content);
    if (!output.trim()) throw new AgentEvaluationError('INVALID_PROVIDER_RESPONSE', 502);
    const finishReason = body?.choices?.[0]?.finish_reason;
    const truncated = ['length', 'max_tokens'].includes(String(finishReason || '').toLowerCase());
    const rawUsage = body.usage;
    const usage = rawUsage && ['prompt_tokens', 'completion_tokens', 'total_tokens'].every((key) =>
      Number.isSafeInteger(rawUsage[key]) && rawUsage[key] >= 0)
      ? { promptTokens: rawUsage.prompt_tokens, completionTokens: rawUsage.completion_tokens,
          totalTokens: rawUsage.total_tokens } : null;
    return {
      status: truncated ? 'failed' : 'completed', runId: command.runId, slot: command.slot, category: command.category,
      templateId: command.templateId, templateVersion: command.templateVersion, arm: command.arm,
      output, model: MODEL, resolvedModel: typeof body.model === 'string' ? body.model : null,
      usage, sources: [], operationId: body.id || null,
      path: { kind: 'vanilla_gemini', endpoint: 'google_openai_compatible', productContext: false },
      evidence: { outputHash: sha256Hex(output), sourceCount: 0, finishReason: finishReason || null,
        truncated, latencyMs: Date.now() - started },
      ...(truncated ? { error: { code: 'OUTPUT_TRUNCATED' } } : {}),
    };
  }

  async function execute(raw, { signal } = {}) {
    const command = AgentEvaluationExecuteSchema.parse(raw);
    signal?.throwIfAborted();
    return command.arm === 'orqanix' ? runOrqanix(command, signal) : runVanilla(command, signal);
  }

  async function judge(raw, { signal } = {}) {
    const command = AgentEvaluationJudgeSchema.parse(raw);
    if (typeof typesafeApiKey !== 'string' || !typesafeApiKey.trim() || /[\r\n]/.test(typesafeApiKey))
      throw new AgentEvaluationError('JUDGE_NOT_CONFIGURED', 503);
    const questions = Object.fromEntries(command.criteria.map((item, index) => [`criterion_${index + 1}`, {
      type: 'noul', instructions: `Grade the supplied output against this criterion relative to the supplied task. Facts explicitly provided in the task are usable evidence for transformations and summaries. When the task requests sourcing, external factual claims must be supported by the supplied fetched source evidence. Do not impose unstated requirements. Criterion: ${item}`,
    }]));
    questions.overall_quality = { type: 'noul', instructions: 'Grade overall quality relative to the supplied task and requested criteria. Facts explicitly provided in the task are usable evidence for transformations and summaries. When the task requests sourcing, external factual claims must be supported by the supplied fetched source evidence. Do not impose unstated requirements.' };
    const state = { category: command.category, prompt: command.prompt,
      criteria: command.criteria, output: command.output,
      sources: command.sources, evidenceOrigin: 'Machine evaluation output plus evaluator-fetched source excerpts when excerpt and contentHash are present. URL-only entries are unverified metadata.' };
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, JUDGE_WAIT_MS);
    timer.unref?.();
    const cancel = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let body;
    try {
      body = await boundedJson(await fetchImpl(TYPESAFE_URL, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${typesafeApiKey.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'jev-latest', state, questions }),
      }));
    } catch (error) {
      if (error instanceof AgentEvaluationError) throw error;
      throw new AgentEvaluationError(timedOut ? 'JUDGE_TIMEOUT' : 'JUDGE_UNAVAILABLE', timedOut ? 504 : 502);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
    if (typeof body?.model !== 'string' || !/^jev-[A-Za-z0-9.-]{1,80}$/.test(body.model))
      throw new AgentEvaluationError('INVALID_PROVIDER_RESPONSE', 502);
    const perCriterion = command.criteria.map((item, index) => ({ criterion: item,
      probability: noul(body.answers?.[`criterion_${index + 1}`]) }));
    const overall = noul(body.answers?.overall_quality);
    if (overall === null || perCriterion.some((item) => item.probability === null))
      throw new AgentEvaluationError('INVALID_PROVIDER_RESPONSE', 502);
    const evidenceHash = sha256Hex(JSON.stringify(state));
    const passed = overall >= 0.6 && perCriterion.every((item) => item.probability >= 0.6);
    return { verdict: passed ? 'passed' : 'failed',
      criteriaResults: perCriterion.map((item) => ({ criterion: item.criterion,
        passed: item.probability >= 0.6, reason: `Jev probability ${item.probability.toFixed(3)}` })),
      reason: 'advisory_review', receiptId: deterministicUuid('agent-evaluation-judge', command.runId, evidenceHash),
      status: 'evaluated', advisory: true, provider: 'typesafe', model: body.model,
      runId: command.runId, category: command.category, overallProbability: overall, perCriterion,
      evidenceHash, evaluatedAt: new Date().toISOString() };
  }

  return { execute, judge };
}
