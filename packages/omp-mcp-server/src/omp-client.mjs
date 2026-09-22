import { execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';
import {
  captureWorkspace,
  compareWorkspaceCaptures,
  containsSensitiveContent,
  runVerification,
} from './evidence.mjs';

const MAX_RPC_FRAME_BYTES = 1_048_576;
const SAFE_TOOLS = Object.freeze({
  inspect: 'read,grep,glob,lsp,todo',
  edit: 'read,grep,glob,lsp,edit,write,todo',
  exec: 'read,grep,glob,lsp,bash,todo',
});

export const BOUNDED_SYSTEM_PROMPT = [
  'This is a bounded Orqanix engineering delegation.',
  'Work inside the supplied current workspace on the requested task.',
  'Execute necessary terminal commands, tests, builds, and tools as required.',
  'Do not use network access, install dependencies, commit or push Git changes, deploy, or cause other external side effects unless the approved task explicitly requests that exact action.',
  'Use discovered skills when they directly help, but do not broaden the task.',
  'End with a concise summary of work performed and verification actually observed.',
].join(' ');

export const SUBDIRECTORY_PROMPTS = Object.freeze({
  'apps/orqaly': [
    'Subdirectory context (apps/orqaly):',
    'Frontend stack uses Vite, React 18, Material UI, and Tailwind.',
    'Follow the SimpleDesign system and verify component tests in LandingPageSimple.test.jsx.',
    'Do not hardcode secrets or remove Clerk authentication guards.',
  ].join(' '),
  'packages/omp-mcp-server': [
    'Subdirectory context (packages/omp-mcp-server):',
    'Bridge is a zero-runtime-dependency Node.js stdio MCP server.',
    'Maintain strict JSON-RPC protocol compliance, 1MB buffer bounds, and TypeSafe Jev evaluation gates.',
  ].join(' '),
  'vendor/orqanix-omp-mcp-server': [
    'Subdirectory context (vendor/orqanix-omp-mcp-server):',
    'Desktop vendored bridge. Must match packages/omp-mcp-server exactly.',
    'Always update SOURCE_PROVENANCE.json when modifying source files.',
  ].join(' '),
  backend: [
    'Subdirectory context (backend):',
    'Backend stack uses Python 3.11, FastAPI, and Pydantic AI with TypeSafe Jev acceleration.',
    'Enforce typed schemas and test against tests/workflow_v2/.',
  ].join(' '),
  'ui/desktop': [
    'Subdirectory context (ui/desktop):',
    'Electron desktop app powered by Goose ACP and Electron Forge.',
    'Maintain codesign integrity, atomic state writes in workspace.ts, and IPC sandboxing in preload.ts.',
  ].join(' '),
});

export function contextualSubdirectoryPrompt(task) {
  if (typeof task !== 'string') return '';
  const matching = [];
  for (const [subpath, prompt] of Object.entries(SUBDIRECTORY_PROMPTS)) {
    if (task.includes(subpath)) {
      matching.push(prompt);
    }
  }
  return matching.length ? `\n\n${matching.join('\n\n')}` : '';
}

function appendBounded(state, value, maximum) {
  if (!value || state.truncated) return;
  const remaining = maximum - Buffer.byteLength(state.text, 'utf8');
  if (remaining <= 0) {
    state.truncated = true;
    return;
  }
  const bytes = Buffer.from(String(value), 'utf8');
  if (bytes.length <= remaining) state.text += value;
  else {
    state.text += new TextDecoder().decode(bytes.subarray(0, remaining));
    state.truncated = true;
  }
}

function messageText(message) {
  if (!message || message.role !== 'assistant') return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

function sanitizedState(frame) {
  const data = frame?.data || {};
  return {
    status: 'available',
    protocolVersion: 1,
    model:
      data.model && typeof data.model === 'object'
        ? { provider: data.model.provider, id: data.model.id }
        : null,
    thinkingLevel: typeof data.thinkingLevel === 'string' ? data.thinkingLevel : null,
    tools: Array.isArray(data.dumpTools)
      ? data.dumpTools
          .map((tool) => tool?.name)
          .filter((name) => typeof name === 'string')
          .slice(0, 128)
      : [],
    skillsEnabled: true,
  };
}

function argsFor(config, mode) {
  return [
    '--mode',
    'rpc',
    '--cwd',
    config.workspace,
    '--no-session',
    '--no-title',
    '--no-extensions',
    '--model',
    config.model,
    '--thinking',
    config.thinking,
    '--tools',
    SAFE_TOOLS[mode] || SAFE_TOOLS.inspect,
    '--approval-mode',
    'yolo',
  ];
}

function childEnvironment(config, token) {
  const names = [
    'PATH',
    'HOME',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'SHELL',
    'TMPDIR',
    'TMP',
    'TEMP',
    'USER',
    'LOGNAME',
    'SystemRoot',
    'ComSpec',
    'PATHEXT',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
  ];
  const env = {};
  for (const name of names) if (process.env[name] !== undefined) env[name] = process.env[name];
  env.ORQANIX_OMP_TOKEN = token;
  env.PI_CODING_AGENT_DIR = config.stateDir;
  return env;
}

export function getAccessToken(config, signal, execFileImpl = nodeExecFile) {
  return new Promise((resolve, reject) => {
    execFileImpl(
      config.node,
      [config.connector, 'token', '--config', config.connectorConfig],
      {
        cwd: config.connectorCwd,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 16_384,
        timeout: 60_000,
        signal,
      },
      (error, stdout) => {
        if (error) {
          reject(new Error('Orqanix sign-in is unavailable.'));
          return;
        }
        const token = stdout.trim();
        if (token.length < 20 || token.length > 8192 || /\s/.test(token)) {
          reject(new Error('Orqanix returned an invalid access token.'));
          return;
        }
        resolve(token);
      }
    );
  });
}

async function runRpc({
  config,
  request,
  mode = 'inspect',
  signal,
  timeoutMs,
  spawnImpl = nodeSpawn,
  tokenProvider = getAccessToken,
}) {
  if (signal?.aborted) {
    return { kind: 'cancelled', toolsUsed: [], text: '', truncated: false, durationMs: 0 };
  }
  const startedAt = Date.now();
  let token;
  try {
    token = await tokenProvider(config, signal);
  } catch {
    return {
      kind: signal?.aborted ? 'cancelled' : 'failed',
      code: signal?.aborted ? 'CANCELLED' : 'AUTH_UNAVAILABLE',
      toolsUsed: [],
      text: '',
      truncated: false,
      durationMs: Date.now() - startedAt,
    };
  }
  const child = spawnImpl(config.binary, argsFor(config, mode), {
    cwd: config.workspace,
    env: childEnvironment(config, token),
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  token = undefined;
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const text = { text: '', truncated: false };
  const toolsUsed = new Set();
  let ready = false;
  let requestSent = false;
  let promptAccepted = false;
  let agentError = false;
  let outcome;
  let settled = false;

  return new Promise((resolve) => {
    const finish = (value, { abort = false } = {}) => {
      if (outcome) return;
      outcome = { ...value, toolsUsed: [...toolsUsed], text: text.text, truncated: text.truncated };
      if (abort && ready && child.stdin.writable) {
        try {
          child.stdin.write(`${JSON.stringify({ id: 'orqanix-abort', type: 'abort' })}\n`);
        } catch {}
      }
      try {
        child.stdin.end();
      } catch {}
      setTimeout(() => {
        if (!settled && child.exitCode === null) child.kill('SIGTERM');
      }, 350).unref();
      setTimeout(() => {
        if (!settled && child.exitCode === null) child.kill('SIGKILL');
      }, 1_350).unref();
    };
    const complete = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(startupTimeout);
      signal?.removeEventListener('abort', cancel);
      lines.close();
      resolve({
        ...(outcome || {
          kind: 'failed',
          code: 'OMP_EXITED',
          toolsUsed: [...toolsUsed],
          text: text.text,
          truncated: text.truncated,
        }),
        durationMs: Date.now() - startedAt,
      });
    };
    const cancel = () => finish({ kind: 'cancelled', code: 'CANCELLED' }, { abort: true });
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(
      () => finish({ kind: 'timed_out', code: 'TIMEOUT' }, { abort: true }),
      timeoutMs
    );
    const startupTimeout = setTimeout(() => {
      if (!ready) finish({ kind: 'failed', code: 'STARTUP_TIMEOUT' }, { abort: true });
    }, Math.min(timeoutMs, config.startupTimeoutMs));

    const sendRequest = () => {
      if (requestSent || outcome) return;
      requestSent = true;
      try {
        child.stdin.write(`${JSON.stringify(request)}\n`);
      } catch {
        finish({ kind: 'failed', code: 'OMP_STDIN_FAILED' });
      }
    };

    child.stderr.resume();
    child.on('error', () => finish({ kind: 'failed', code: 'OMP_NOT_AVAILABLE' }));
    child.on('close', () => complete());
    lines.on('line', (line) => {
      if (Buffer.byteLength(line, 'utf8') > MAX_RPC_FRAME_BYTES) {
        finish({ kind: 'failed', code: 'RPC_FRAME_TOO_LARGE' }, { abort: true });
        return;
      }
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        finish({ kind: 'failed', code: 'INVALID_RPC_FRAME' }, { abort: true });
        return;
      }
      if (frame?.type === 'ready') {
        ready = true;
        clearTimeout(startupTimeout);
        sendRequest();
        return;
      }
      if (frame?.type === 'extension_ui_request' && frame.id) {
        child.stdin.write(
          `${JSON.stringify({ type: 'extension_ui_response', id: frame.id, cancelled: true })}\n`
        );
        return;
      }
      if (frame?.type === 'host_tool_call' && frame.id) {
        child.stdin.write(
          `${JSON.stringify({
            type: 'host_tool_result',
            id: frame.id,
            isError: true,
            result: {
              content: [
                { type: 'text', text: 'Host tools are unavailable in this bounded task.' },
              ],
            },
          })}\n`
        );
        return;
      }
      if (request.type === 'get_state' && frame?.type === 'response' && frame.id === request.id) {
        if (frame.success) finish({ kind: 'completed', state: sanitizedState(frame) });
        else finish({ kind: 'failed', code: 'OMP_STATE_FAILED' });
        return;
      }
      if (frame?.type === 'response' && frame.id === request.id && frame.command === 'prompt') {
        if (!frame.success) {
          finish({ kind: 'failed', code: 'OMP_PROMPT_REJECTED' });
          return;
        }
        promptAccepted = true;
        if (frame.data?.agentInvoked === false) finish({ kind: 'completed' });
        return;
      }
      if (frame?.type === 'prompt_result' && frame.id === request.id && frame.agentInvoked === false) {
        finish({ kind: 'completed' });
        return;
      }
      if (frame?.type === 'message_update' && frame.assistantMessageEvent?.type === 'text_delta') {
        appendBounded(text, frame.assistantMessageEvent.delta, config.maxOutputBytes);
      } else if (frame?.type === 'message_end') {
        if (
          frame.message?.role === 'assistant' &&
          (frame.message.stopReason === 'error' || typeof frame.message.errorMessage === 'string')
        ) {
          agentError = true;
        }
        if (!text.text) appendBounded(text, messageText(frame.message), config.maxOutputBytes);
      }
      if (frame?.type === 'tool_execution_start' || frame?.type === 'tool_execution_end') {
        const name = frame.toolName || frame.toolCall?.name;
        if (typeof name === 'string' && toolsUsed.size < 64) toolsUsed.add(name);
      }
      if (frame?.type === 'agent_end' && frame.isTerminal !== false && promptAccepted) {
        const assistant = Array.isArray(frame.messages)
          ? [...frame.messages].reverse().find((message) => message?.role === 'assistant')
          : undefined;
        if (
          agentError ||
          assistant?.stopReason === 'error' ||
          typeof assistant?.errorMessage === 'string'
        ) {
          finish({ kind: 'failed', code: 'MODEL_REQUEST_FAILED' });
          return;
        }
        if (!text.text && assistant) {
          appendBounded(text, messageText(assistant), config.maxOutputBytes);
        }
        finish({ kind: 'completed' });
      }
    });
  });
}

export async function inspectOmp({ config, signal, spawnImpl, tokenProvider }) {
  const exchange = await runRpc({
    config,
    signal,
    spawnImpl,
    tokenProvider,
    timeoutMs: Math.min(config.timeoutMs, config.startupTimeoutMs + 5_000),
    request: { id: 'orqanix-state', type: 'get_state' },
  });
  return exchange.kind === 'completed' && exchange.state
    ? { ...exchange.state, durationMs: exchange.durationMs }
    : {
        status: 'unavailable',
        code: exchange.code || 'OMP_UNAVAILABLE',
        durationMs: exchange.durationMs,
      };
}

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const notEvaluated = (reason) => ({ status: 'not_evaluated', advisory: true, reason });

export async function evaluateWithJev({ config, request, signal, tokenProvider = getAccessToken, fetchImpl = fetch }) {
  if (containsSensitiveContent(request)) {
    return { review: notEvaluated('sensitive_evidence') };
  }
  if (!config.conversationId || !config.apiBaseUrl) return { review: notEvaluated('conversation_not_bound') };
  const deadline = AbortSignal.timeout(12_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const token = await tokenProvider(config, combined);
    const response = await fetchImpl(`${config.apiBaseUrl}/engineering/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Orqaly-Account-Hash': config.accountHash },
      body: JSON.stringify(request), signal: combined,
    });
    if (!response.ok) return { review: notEvaluated(`gateway_http_${response.status}`) };
    const receipt = await response.json();
    if (receipt.taskId !== request.taskId || receipt.inputHash !== request.inputHash ||
        receipt.evidenceHash !== hash(request.evidence) ||
        !Array.isArray(receipt.researchReferences) || receipt.researchReferences.length !== request.researchReferences.length ||
        receipt.researchReferences.some((reference, index) => ['conversationId', 'requestId', 'artifactHash'].some(key => reference[key] !== request.researchReferences[index][key])) ||
        !['passed', 'failed', 'not_evaluated'].includes(receipt.review?.status)) {
      return { review: notEvaluated('invalid_review_receipt') };
    }
    if (containsSensitiveContent(receipt)) {
      return { review: notEvaluated('sensitive_review_receipt') };
    }
    return receipt;
  } catch {
    return { review: notEvaluated(signal?.aborted ? 'cancelled' : 'review_unavailable') };
  }
}

export async function runEngineeringTask({
  config, task, mode, timeoutMs, signal, spawnImpl, tokenProvider,
  jevEvaluator = evaluateWithJev, acceptanceCriteria = [], researchReferences = [], testCommand,
}) {
  const effectiveTimeout = Math.min(timeoutMs || config.timeoutMs, config.timeoutMs);
  const taskId = randomUUID();
  const inputHash = hash({ task, acceptanceCriteria, researchReferences });
  const before = mode === 'edit' ? await captureWorkspace(config.workspace, signal) : { status: 'unavailable', text: '', fingerprints: [], repositoryIdentity: null };
  const exchange = await runRpc({
    config, mode, signal, spawnImpl, tokenProvider, timeoutMs: effectiveTimeout,
    request: {
      id: taskId, type: 'prompt',
      message: `${BOUNDED_SYSTEM_PROMPT}${contextualSubdirectoryPrompt(task)}\n\nRequested task:\n${task}\n\nAcceptance criteria:\n${JSON.stringify(acceptanceCriteria)}\nResearch provenance (identifiers only):\n${JSON.stringify(researchReferences)}`,
    },
  });
  const testEnv = childEnvironment(config, '');
  delete testEnv.ORQANIX_OMP_TOKEN;
  const tests = await runVerification({
    config, command: mode === 'edit' && exchange.kind === 'completed' ? testCommand : undefined,
    signal, timeoutMs: effectiveTimeout, env: testEnv,
  });
  const after = mode === 'edit'
    ? await captureWorkspace(
        config.workspace,
        signal,
        before.fingerprints,
        before.repositoryIdentity
      )
    : before;
  const changed = compareWorkspaceCaptures(before, after);
  const evidence = {
    diff: { status: before.status === 'captured' && after.status === 'captured' ? 'captured' : 'unavailable', before: before.text, after: after.text, changed: before.text !== after.text },
    tests, toolsUsed: exchange.toolsUsed,
    changedFilesStatus: changed.changedFilesStatus,
    changedFiles: changed.changedFiles,
    relevantIgnoredFilesChanged: changed.relevantIgnoredFilesChanged,
  };
  let receipt = { review: notEvaluated(exchange.kind === 'completed' ? 'inspection_only' : 'engineering_incomplete') };
  if (exchange.kind === 'completed' && mode === 'edit' && config.jevEnabled === false) {
    receipt = { review: notEvaluated('disabled_by_user') };
  } else if (exchange.kind === 'completed' && mode === 'edit' && changed.relevantIgnoredFilesChanged) {
    receipt = { review: notEvaluated('ignored_files_changed') };
  } else if (exchange.kind === 'completed' && mode === 'edit') {
    try {
      receipt = await jevEvaluator({ config, signal, tokenProvider, request: {
        taskId, conversationId: config.conversationId, task, inputHash, acceptanceCriteria, researchReferences, evidence,
      } });
    } catch { receipt = { review: notEvaluated('review_unavailable') }; }
  }
  if (!receipt?.review) receipt = { review: notEvaluated('invalid_review_receipt') };
  if (
    tests.status === 'failed' &&
    !['disabled_by_user', 'ignored_files_changed'].includes(receipt.review.reason)
  ) {
    receipt.review = {
      ...receipt.review,
      status: 'failed',
      reason: tests.reason?.startsWith('sensitive_') ? 'sensitive_test_output' : 'tests_failed',
    };
  }
  const verified = mode === 'edit' && acceptanceCriteria.length > 0 && evidence.diff.status === 'captured' && evidence.diff.changed && tests.status === 'passed' && !tests.truncated && !changed.relevantIgnoredFilesChanged && receipt.review.status === 'passed';
  return {
    status: exchange.kind === 'completed' && mode === 'edit' && !verified ? 'review_required' : exchange.kind,
    ...(exchange.code ? { code: exchange.code } : {}),
    taskId, conversationId: config.conversationId ?? null, inputHash, evidenceHash: hash(evidence), researchReferences,
    mode,
    assistantText: containsSensitiveContent(exchange.text)
      ? '[REDACTED: sensitive assistant output]'
      : exchange.text,
    assistantOutputRedacted: containsSensitiveContent(exchange.text),
    outputTruncated: exchange.truncated,
    toolsUsed: exchange.toolsUsed, evidence, review: receipt.review, verified,
    changedFilesStatus: changed.changedFilesStatus,
    changedFiles: changed.changedFiles,
    relevantIgnoredFilesChanged: changed.relevantIgnoredFilesChanged,
    durationMs: exchange.durationMs,
  };
}
