/**
 * Assistant Chat API Service
 *
 * Frontend client for the assistant-chat and assistant-stream backend endpoints.
 * Handles all LLM-powered assistant interactions:
 *  - Function calling (intent parsing)
 *  - Natural replies (personality-aware)
 *  - Consilium board discussions
 *  - Predictive analysis
 *  - Smart reports
 *  - Memory management
 *  - SSE streaming
 */

const API_BASE = '/api';

async function fetchJson(path, body, token) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

async function getJson(path, token) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Fetch compact live counts for the assistant home tiles.
 * Returns { activeGoals, tasksDueThisWeek, workflows, boards, recentReports, partners, ok }.
 */
export async function fetchAssistantHomeSummary({ token } = {}) {
  return getJson('assistant-home-summary', token);
}

/**
 * Fetch dynamic banners + greeting + counts for the assistant home.
 * Returns { ok, banners: [...], greeting: { firstName, timeOfDay }, ...legacy counts }.
 * Throws on network / auth / rate-limit errors so callers can render the error state.
 */
export async function fetchAssistantHome({ token } = {}) {
  return getJson('assistant-home-summary', token);
}

/**
 * Fetch the full tool catalog with risk levels — feeds the View Actions browser.
 * Returns { ok, tools: [{ name, description, params, category, risk }, ...], risk: {safe,medium,high,critical} }.
 */
export async function fetchToolCatalog({ token } = {}) {
  return getJson('assistant-tools', token);
}

/**
 * Main assistant chat endpoint — function calling, natural replies, etc.
 * @param {{ action: string, message: string, token: string, ...rest }} opts
 */
export async function assistantChatApi({ token, ...body }) {
  return fetchJson('assistant-chat', body, token);
}

/**
 * Consilium board discussion.
 * @param {{ topic: string, boardId?: string, token: string }} opts
 */
export async function consiliumDiscuss({ topic, boardId, token }) {
  return fetchJson(
    'assistant-chat',
    {
      action: 'consilium-discuss',
      topic,
      boardId,
    },
    token
  );
}

/**
 * Predictive analysis.
 * @param {{ scope: string, context?: string, token: string }} opts
 */
export async function predictAnalysis({ scope, context, token }) {
  return fetchJson(
    'assistant-chat',
    {
      action: 'predict',
      scope,
      context,
    },
    token
  );
}

/**
 * Generate a focused, role-scoped report.
 * @param {{ subject: string, focus?: string, period?: string, userRole?: string, token: string }} opts
 */
export async function generateSmartReport({ subject, focus, period, userRole, token }) {
  return fetchJson(
    'assistant-chat',
    {
      action: 'smart-report',
      subject,
      focus,
      period,
      userRole,
    },
    token
  );
}

/**
 * Save a memory fact.
 * @param {{ fact: string, category?: string, token: string }} opts
 */
export async function memorySave({ fact, category, token }) {
  return fetchJson(
    'assistant-chat',
    {
      action: 'memory-save',
      fact,
      category,
    },
    token
  );
}

/**
 * List stored memories.
 * @param {{ token: string }} opts
 */
export async function memoryList({ token }) {
  return fetchJson('assistant-chat', { action: 'memory-list' }, token);
}

/**
 * SSE streaming connection for real-time token-by-token responses.
 *
 * @param {{ message: string, personality?: string, history?: Array, token: string }} opts
 * @param {{ onState?: Function, onToken?: Function, onToolCall?: Function, onDone?: Function, onError?: Function }} callbacks
 * @returns {{ abort: Function }} Controller to abort the stream
 */
const SSE_EVENT_MAP = {
  state: 'onState',
  token: 'onToken',
  tool_call: 'onToolCall',
  done: 'onDone',
  error: 'onError',
};

function dispatchSSEEvent(eventName, jsonStr, callbacks) {
  const cbName = SSE_EVENT_MAP[eventName];
  if (!cbName) return;
  try {
    callbacks[cbName]?.(JSON.parse(jsonStr));
  } catch {
    // Skip malformed JSON lines
  }
}

function parseSSELines(lines, callbacks) {
  let currentEvent = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ') && currentEvent) {
      dispatchSSEEvent(currentEvent, line.slice(6), callbacks);
      currentEvent = '';
    }
  }
}

export function streamAssistantReply(
  { message, personality, history, token, mode, boardId },
  callbacks = {}
) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/assistant-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, personality, history, mode, boardId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text().catch(() => 'Stream failed');
        callbacks.onError?.({ error: err });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        parseSSELines(lines, callbacks);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        callbacks.onError?.({ error: err.message || 'Stream failed' });
      }
    }
  })();

  return { abort: () => controller.abort() };
}
