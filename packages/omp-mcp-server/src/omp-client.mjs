import { execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const MAX_RPC_FRAME_BYTES = 1_048_576;
const SAFE_TOOLS = Object.freeze({
  inspect: 'read,grep,glob,lsp,todo',
  edit: 'read,grep,glob,lsp,edit,write,todo',
});

const BOUNDED_SYSTEM_PROMPT = [
  'This is a bounded Orqanix engineering delegation.',
  'Work only inside the supplied current workspace and only on the requested task.',
  'Do not commit, push, deploy, install dependencies, open external applications, or access the network.',
  'Use discovered skills when they directly help, but do not broaden the task.',
  'End with a concise summary of work performed and verification actually observed.',
].join(' ');

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

export async function evaluateWithJev({ task, text, mode, signal, apiKey }) {
  const key = apiKey || process.env.TYPESAFE_API_KEY;
  if (!key || !text || text.length < 10) return null;
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state: `Task:\n${task.slice(0, 1500)}\n\nResult (${mode}):\n${text.slice(0, 2500)}`,
        questions: {
          task_completed: {
            type: 'noul',
            instructions:
              'Does this response or code modification completely satisfy the requested task?',
          },
          quality_verified: {
            type: 'noul',
            instructions:
              'Is the outcome free from unresolved syntax errors, unhandled exceptions, and regressions?',
          },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const body = await response.json();
    const taskCompleted = body?.answers?.task_completed?.noul ?? null;
    const qualityVerified = body?.answers?.quality_verified?.noul ?? null;
    if (typeof taskCompleted !== 'number') return null;
    return {
      verified: taskCompleted >= 0.6 && (qualityVerified === null || qualityVerified >= 0.5),
      confidence: taskCompleted,
      qualityScore: qualityVerified,
      model: body.model || 'jev-latest',
      latencyMs: Date.now() - started,
    };
  } catch {
    return null;
  }
}

export async function runEngineeringTask({
  config,
  task,
  mode,
  timeoutMs,
  signal,
  spawnImpl,
  tokenProvider,
  jevEvaluator,
}) {
  const effectiveTimeout = Math.min(timeoutMs || config.timeoutMs, config.timeoutMs);
  const exchange = await runRpc({
    config,
    mode,
    signal,
    spawnImpl,
    tokenProvider,
    timeoutMs: effectiveTimeout,
    request: {
      id: 'orqanix-task',
      type: 'prompt',
      message: `${BOUNDED_SYSTEM_PROMPT}\n\nRequested task:\n${task}`,
    },
  });
  let jevGate = null;
  if (exchange.kind === 'completed' && exchange.text) {
    try {
      jevGate = await (jevEvaluator || evaluateWithJev)({
        task,
        text: exchange.text,
        mode,
        signal,
        apiKey: config.typesafeApiKey,
      });
    } catch {}
  }
  return {
    status: exchange.kind,
    ...(exchange.code ? { code: exchange.code } : {}),
    mode,
    assistantText: exchange.text,
    outputTruncated: exchange.truncated,
    toolsUsed: exchange.toolsUsed,
    ...(jevGate ? { jevGate } : {}),
    durationMs: exchange.durationMs,
  };
}
