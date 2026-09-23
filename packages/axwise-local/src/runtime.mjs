import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { providerSchema } from './schema.mjs';
import { StateError, atomicPrivateFile, scopedDirectory, createJournal, resolveAnalysisReference } from './state.mjs';

export const TOOL_NAMES = ['create_prd', 'analyze_interviews', 'simulate_interviews'];
export const MAX_FRAME_BYTES = 1_048_576;
export const MAX_INPUT_BYTES = 160_000;
const MAX_PROVIDER_BYTES = 1_048_576;
const ACCOUNT_HASH = /^[a-f0-9]{64}$/;
const CONVERSATION = /^[A-Za-z0-9_-]{1,128}$/;
const DIAGNOSTICS = new Set(['INVALID_CANDIDATE_SCHEMA', 'INVALID_PRD_SECTIONS', 'UNKNOWN_SOURCE_REFERENCE',
  'INVALID_SOURCE_QUOTE', 'SYNTHETIC_PROVENANCE_MISMATCH', 'INVALID_OWNER_DECISION', 'INVALID_ANALYSIS_LINEAGE',
  'UNKNOWN_FINDING_REFERENCE', 'MISSING_REQUIREMENT_FINDING_LINK', 'INVALID_MODEL_JSON',
  'MISSING_CONFLICT_GAP', 'MISSING_INSUFFICIENT_GAP', 'UNREQUESTED_ANALYSIS_OUTPUT']);
const INPUT_GUIDANCE = Object.freeze({
  AXWISE_LOCAL_MISSING_SYNTHETIC_QUESTION_ID: 'Synthetic transcript turns require their original questionId. Keep the original synthetic origin and exact turns; do not invent IDs, add interviewer turns or relabel the source. Ask the user for original question IDs; if unavailable, do not run this analysis.',
  AXWISE_LOCAL_MISSING_SOURCE_ORIGIN: 'Every selected source or transcript requires its original origin. Preserve the supplied provenance and exact text; do not infer human authenticity, invent turns, or relabel synthetic content. If the original origin is unknown, ask the user before running this analysis.',
});
export const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export class LocalAxwiseError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new LocalAxwiseError(code, message); };
export const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export async function abortable(operation, signal) {
  signal.throwIfAborted();
  let stop;
  const cancelled = new Promise((_, reject) => {
    stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(operation), cancelled]); }
  finally { signal.removeEventListener('abort', stop); }
}

export function validateOrigin(value, { allowLoopback = false } = {}) {
  let url;
  try { url = new URL(value); } catch { fail('CONFIG_INVALID', 'An explicit API origin is required.'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && url.hostname === '127.0.0.1')))
    fail('CONFIG_INVALID', 'Use an HTTPS API origin or an explicit HTTP 127.0.0.1 test relay.');
  return url.origin;
}

/** Each subprocess is local, bounded and receives only the selected tool input. */
export function createKernel({ python, kernelRoot, spawnImpl = spawn, timeoutMs = 10_000 } = {}) {
  if (!isAbsolute(python || '') || !isAbsolute(kernelRoot || '')) throw new Error('Absolute kernel paths are required.');
  return async function kernel(request, signal = new AbortController().signal) {
    const id = randomUUID();
    const input = JSON.stringify({ ...request, id });
    if (Buffer.byteLength(input) > MAX_FRAME_BYTES) fail('INVALID_INPUT', 'The specialist request is too large.');
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    deadline.throwIfAborted();
    return new Promise((resolve, reject) => {
      const child = spawnImpl(python, ['-s', '-m', 'backend.services.local_axwise.worker'], {
        cwd: kernelRoot, stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'en_US.UTF-8',
          PYTHONPATH: kernelRoot, PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1' },
      });
      const parts = []; let size = 0, settled = false, killTimer;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        deadline.removeEventListener('abort', cancel);
        if (error) {
          child.kill('SIGTERM');
          killTimer = setTimeout(() => child.kill('SIGKILL'), 250);
          killTimer.unref?.();
          reject(error);
        } else resolve(result);
      };
      const cancel = () => finish(new LocalAxwiseError(signal.aborted ? 'CANCELLED' : 'KERNEL_TIMEOUT',
        signal.aborted ? 'The specialist request was cancelled.' : 'The local specialist timed out.'));
      deadline.addEventListener('abort', cancel, { once: true });
      child.on('error', () => finish(new LocalAxwiseError('KERNEL_UNAVAILABLE', 'The local Axwise runtime could not start.')));
      child.stdin.on('error', () => {});
      child.stdout.on('data', (bytes) => {
        size += bytes.length;
        if (size > MAX_FRAME_BYTES) finish(new LocalAxwiseError('KERNEL_INVALID', 'The local specialist returned too much data.'));
        else parts.push(bytes);
      });
      // Never forward Python errors, prompts or provider content to application logs.
      child.stderr.resume();
      child.on('close', (code) => {
        clearTimeout(killTimer);
        if (settled) return;
        let reply;
        try { reply = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch {}
        if (code !== 0 || !object(reply) || reply.id !== id || typeof reply.ok !== 'boolean')
          return finish(new LocalAxwiseError('KERNEL_INVALID', 'The local specialist returned an invalid result.'));
        if (!reply.ok && request.operation === 'prepare' && Object.hasOwn(INPUT_GUIDANCE, reply.error?.code || ''))
          return finish(new LocalAxwiseError('INVALID_INPUT', INPUT_GUIDANCE[reply.error.code]));
        if (!reply.ok) {
          const output = ['finalize', 'validate_review'].includes(request.operation);
          const error = new LocalAxwiseError(output ? 'VALIDATION_FAILED' : 'INVALID_INPUT',
            output ? 'The generated artifact did not pass local validation. No artifact was saved.'
              : 'The selected specialist input is invalid. Check the tool schema and supplied evidence.');
          error.diagnostics = safeDiagnostics(reply.error?.diagnostics);
          return finish(error);
        }
        finish(null, reply.result);
      });
      child.stdin.end(`${input}\n`);
      if (deadline.aborted) cancel();
    });
  };
}

export function validateTools(description) {
  if (!object(description) || description.protocolVersion !== 1 || !Array.isArray(description.tools)
    || description.tools.length !== TOOL_NAMES.length || new Set(description.tools.map((t) => t?.name)).size !== TOOL_NAMES.length
    || description.tools.some((tool) => !object(tool) || !TOOL_NAMES.includes(tool.name)
      || typeof tool.description !== 'string' || !tool.description.trim() || tool.description.length > 4_000
      || !object(tool.inputSchema) || tool.inputSchema.type !== 'object'))
    fail('KERNEL_INVALID', 'The local specialist tool definitions are invalid.');
  return description.tools.map(({ name, description: text, inputSchema }) => ({
    name, description: `${text} Use only for an explicitly requested specialist artifact, not ordinary chat, weather, news, search, general questions or repository work. Inputs are selected inline, or a prior local analysis is reused by its exact operationId and sha256 reference in this conversation. No arbitrary files or URLs are opened.`,
    inputSchema: providerSchema(inputSchema), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }));
}

async function readJson(response, signal) {
  if (response.redirected || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !response.body)
    fail('PROVIDER_INVALID', 'The model returned an invalid response.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(() => reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROVIDER_BYTES) fail('PROVIDER_INVALID', 'The model response exceeded the local limit.');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('PROVIDER_INVALID', 'The model returned invalid JSON.'); }
}

export function createProvider({ apiUrl, accountHash, token, fetchImpl = fetch } = {}) {
  const apiOrigin = validateOrigin(apiUrl, { allowLoopback: true });
  if (!ACCOUNT_HASH.test(accountHash || '') || typeof token !== 'function') throw new Error('Invalid account binding.');
  return async (prepared, signal) => {
    const authStarted = performance.now();
    let accessToken;
    try { accessToken = await abortable(token, signal); }
    catch { if (signal.aborted) throw signal.reason; fail('LOGIN_REQUIRED', 'Sign in to use Axwise model inference.'); }
    if (typeof accessToken !== 'string' || !accessToken || /\s/.test(accessToken))
      fail('LOGIN_REQUIRED', 'Sign in to use Axwise model inference.');
    const authMs = Math.round(performance.now() - authStarted);
    if (!object(prepared) || typeof prepared.systemPrompt !== 'string' || typeof prepared.userPrompt !== 'string'
      || !object(prepared.responseSchema) || !Number.isInteger(prepared.maxOutputTokens)
      || prepared.maxOutputTokens < 1 || prepared.maxOutputTokens > 16_384)
      fail('KERNEL_INVALID', 'The local specialist prompt is invalid.');
    const body = {
      model: 'orqaly-gemini', stream: false, store: false, reasoning_effort: 'low',
      max_completion_tokens: prepared.maxOutputTokens,
      messages: [{ role: 'system', content: prepared.systemPrompt }, { role: 'user', content: prepared.userPrompt }],
      response_format: { type: 'json_schema', json_schema: { name: 'axwise_specialist_artifact', strict: true, schema: providerSchema(prepared.responseSchema) } },
    };
    const providerStarted = performance.now();
    let response;
    try { response = await fetchImpl(`${apiOrigin}/desktop/v1/chat/completions`, {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'X-Orqaly-Account-Hash': accountHash },
      body: JSON.stringify(body),
    }); } catch { if (signal.aborted) throw signal.reason; fail('PROVIDER_UNAVAILABLE', 'Axwise model inference is unavailable.'); }
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403].includes(response.status)) fail('LOGIN_REQUIRED', 'Sign in with the expected account to use Axwise.');
      fail(response.status === 429 ? 'PROVIDER_BUSY' : 'PROVIDER_UNAVAILABLE', 'Axwise model inference is unavailable. No automatic retry was performed.');
    }
    const data = await readJson(response, signal), choice = data?.choices?.[0];
    if (data?.choices?.length !== 1 || choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string'
      || !choice.message.content.trim() || choice.message.tool_calls?.length)
      fail('PROVIDER_INVALID', 'The model did not return a complete specialist artifact.');
    const usage = { modelCalls: 1, model: 'orqaly-gemini', provider: 'authenticated-desktop-gateway' };
    if (Number.isSafeInteger(data.usage?.prompt_tokens) && data.usage.prompt_tokens >= 0) usage.inputTokens = data.usage.prompt_tokens;
    if (Number.isSafeInteger(data.usage?.completion_tokens) && data.usage.completion_tokens >= 0) usage.outputTokens = data.usage.completion_tokens;
    return { response: choice.message.content, usage, timings: { authMs, providerMs: Math.round(performance.now() - providerStarted) } };
  };
}

/** The launcher selects this directory; model arguments never select paths. */
export async function saveArtifact({ stateDir, accountHash, conversationId, operationId, record,
  writeArtifact = async (file, bytes) => { await file.writeFile(bytes); await file.sync(); } }, signal) {
  const directory = await scopedDirectory({ stateDir, accountHash, conversationId, operationId });
  return atomicPrivateFile(directory, `${operationId}.json`, record, signal, writeArtifact);
}

function safeDiagnostics(value) {
  const codes = Array.isArray(value) ? [...new Set(value.filter((code) => DIAGNOSTICS.has(code)))].slice(0, 10) : [];
  return codes.length ? codes : ['INVALID_CANDIDATE_SCHEMA'];
}

function assertFinalized(value) {
  if (!object(value) || typeof value.markdown !== 'string' || !value.markdown.trim()
    || !object(value.artifact) || value.validation?.valid !== true || !object(value.provenance))
    fail('VALIDATION_FAILED', 'The generated artifact did not pass local validation. No artifact was saved.');
  return value;
}

export function createSpecialistTools({ kernel, provider, stateDir, accountHash, conversationId,
  timeoutMs = 180_000, save = saveArtifact, journal = createJournal, resolveReference = resolveAnalysisReference,
  now = () => performance.now(), newId = randomUUID } = {}) {
  if (typeof kernel !== 'function' || typeof provider !== 'function' || !isAbsolute(stateDir || '')
    || !ACCOUNT_HASH.test(accountHash || '') || !CONVERSATION.test(conversationId || '')
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 180_000) throw new Error('Invalid specialist configuration.');
  let busy = false;
  return async function call(tool, input, signal = new AbortController().signal) {
    const operationId = newId(), started = now();
    const timings = { prepareMs: 0, validateMs: 0, authMs: 0, inferenceMs: 0, authAndInferenceMs: 0 };
    const stages = [], usage = { modelCalls: 0, model: 'orqaly-gemini', provider: 'authenticated-desktop-gateway' };
    const resultError = (code, message) => ({ content: [{ type: 'text', text: message }], isError: true,
      structuredContent: { operationId, conversationId, tool, status: 'failed', error: { code, message }, usage,
        execution: { orchestration: 'local', pipelineVersion: 'axwise.local-staged.v1', calls: usage.modelCalls, stages }, timings: { ...timings, totalMs: Math.round(now() - started) } } });
    if (!TOOL_NAMES.includes(tool) || !object(input) || Buffer.byteLength(JSON.stringify(input)) > MAX_INPUT_BYTES
      || Object.hasOwn(input, 'hostEvidence'))
      return resultError('INVALID_INPUT', 'Use a named Axwise specialist with bounded inline inputs.');
    if (busy) return resultError('BUSY', 'Another local Axwise operation is running. Wait or cancel it first.');
    busy = true;
    // Callers cannot mutate the original selected corpus during awaited stages.
    const selectedInput = JSON.parse(JSON.stringify(input));
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    const scope = { stateDir, accountHash, conversationId, operationId };
    let snapshot;
    try {
      let hostEvidence;
      if (selectedInput.analysisArtifact !== undefined) {
        if (tool !== 'create_prd') fail('INVALID_INPUT', 'Analysis references can only be supplied to create_prd.');
        hostEvidence = await resolveReference(scope, selectedInput.analysisArtifact, deadline);
      }
      const local = async (operation, extra = {}) => {
        deadline.throwIfAborted();
        const at = now();
        try { return await abortable(() => kernel({ operation, tool, input: selectedInput,
          ...(hostEvidence ? { hostEvidence } : {}), ...extra }, deadline), deadline); }
        finally { timings[operation.startsWith('prepare') ? 'prepareMs' : 'validateMs'] += Math.round(now() - at); }
      };
      const prepared = await local('prepare');
      snapshot = await journal(scope, deadline);
      await snapshot('selected_input', { tool, selectedInput, inputSha256: hash(selectedInput),
        ...(hostEvidence ? { analysisReference: hostEvidence.reference } : {}) });
      let candidateUsage;
      const infer = async (stage, payload) => {
        if (usage.modelCalls >= (tool === 'simulate_interviews' ? 1 : 4)) fail('STAGE_LIMIT', 'The bounded specialist stage limit was reached.');
        deadline.throwIfAborted();
        const at = now(), metric = { stage, status: 'running' };
        usage.modelCalls += 1; stages.push(metric);
        try {
          const generated = await abortable(() => provider(payload, deadline), deadline);
          if (stage === 'generation' || stage === 'repair') candidateUsage = { ...generated.usage, modelCalls: 1 };
          metric.status = 'completed';
          metric.authAndInferenceMs = Math.round(now() - at);
          metric.inferenceMs = generated.timings?.providerMs ?? metric.authAndInferenceMs;
          metric.authMs = generated.timings?.authMs ?? 0;
          for (const key of ['inputTokens', 'outputTokens']) if (Number.isSafeInteger(generated.usage?.[key]) && generated.usage[key] >= 0) {
            metric[key] = generated.usage[key]; usage[key] = (usage[key] || 0) + generated.usage[key];
          }
          for (const key of ['authMs', 'inferenceMs', 'authAndInferenceMs']) timings[key] += metric[key];
          await snapshot(stage, { response: generated.response, metrics: metric });
          return generated.response;
        } catch (error) {
          if (metric.status === 'running') {
            metric.status = 'failed'; metric.authAndInferenceMs = Math.round(now() - at);
            timings.authAndInferenceMs += metric.authAndInferenceMs;
          }
          throw error;
        }
      };
      let candidate = await infer('generation', prepared), finalized, qualityReview, diagnostics;
      const validate = async () => {
        try { return assertFinalized(await local('finalize', { context: prepared.context, response: candidate, usage: candidateUsage })); }
        catch (error) {
          if (!(error instanceof LocalAxwiseError) || error.code !== 'VALIDATION_FAILED') throw error;
          diagnostics = safeDiagnostics(error.diagnostics);
          await snapshot('validation_failed', { diagnostics });
          return null;
        }
      };
      const review = async (stage) => {
        const reviewPrompt = await local('prepare_review', { artifact: finalized.artifact });
        const response = await infer(stage, reviewPrompt);
        const result = await local('validate_review', { artifact: finalized.artifact, response, context: reviewPrompt.context });
        if (!object(result) || typeof result.passed !== 'boolean' || !Array.isArray(result.issues))
          fail('VALIDATION_FAILED', 'The specialist quality review was invalid. No artifact was saved.');
        await snapshot('validated_review', { review: result });
        return result;
      };
      finalized = await validate();
      if (tool !== 'simulate_interviews') {
        if (finalized) qualityReview = await review('review');
        if (!finalized || !qualityReview.passed) {
          const repair = await local('prepare_repair', { candidate, review: qualityReview ?? null,
            diagnostics: diagnostics ?? [] });
          candidate = await infer('repair', repair);
          finalized = await validate();
          if (!finalized) fail('VALIDATION_FAILED', 'The repaired artifact did not pass local validation. No artifact was saved.');
          qualityReview = await review('final_review');
          if (!qualityReview.passed) fail('QUALITY_REVIEW_FAILED', 'The artifact did not pass its final quality review. No artifact was saved.');
        }
      } else if (!finalized) fail('VALIDATION_FAILED', 'The generated simulation did not pass local validation. No artifact was saved.');
      const record = { version: 'axwise.local-artifact.v2', operationId, accountHash, conversationId, tool,
        createdAt: new Date().toISOString(), selectedInput, inputSha256: hash(selectedInput), candidate,
        ...finalized, artifactSha256: hash(finalized.artifact), usage: { ...usage },
        ...(qualityReview ? { qualityReview } : {}),
        ...(hostEvidence ? { analysisReference: hostEvidence.reference } : {}),
        execution: { orchestration: 'local', pipelineVersion: 'axwise.local-staged.v1', inference: 'authenticated-desktop-gateway', calls: usage.modelCalls, stages }, timings: { ...timings } };
      await snapshot('publication_ready', { artifactSha256: record.artifactSha256, usage, timings });
      const at = now();
      const artifact = await save({ ...scope, record }, deadline);
      timings.persistMs = Math.round(now() - at); timings.totalMs = Math.round(now() - started);
      const reference = { operationId, sha256: artifact.sha256 };
      const text = `${finalized.markdown}\n\nSaved local Axwise JSON artifact: ${JSON.stringify(artifact.path)}.\n`
        + (tool === 'analyze_interviews' ? `To create a PRD from this exact frozen analysis, pass analysisArtifact: ${JSON.stringify(reference)}. Do not retype or relabel its interview sources.\n` : '');
      return { content: [{ type: 'text', text }], isError: false,
        structuredContent: { ...record, status: 'completed', artifactFile: artifact, timings } };
    } catch (error) {
      const safe = error instanceof LocalAxwiseError || error instanceof StateError;
      // Retain only a fixed diagnostic code outside private stage snapshots.
      // Cancellation never starts more model work or tries to resume the run.
      if (snapshot && !deadline.aborted) await snapshot('failed', { code: safe ? error.code : 'SPECIALIST_UNAVAILABLE' }).catch(() => {});
      if (deadline.aborted) return resultError(signal.aborted ? 'CANCELLED' : 'TIMEOUT',
        signal.aborted ? 'The Axwise specialist request was cancelled.' : 'The Axwise specialist timed out. No automatic retry was performed.');
      return resultError(safe ? error.code : 'SPECIALIST_UNAVAILABLE',
        safe ? error.message : 'The local Axwise specialist could not complete this request.');
    } finally { busy = false; }
  };
}
