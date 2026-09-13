/**
 * Assistant Stream handler — SSE endpoint for streaming AI responses.
 * POST /api/app?path=assistant-stream
 *
 * Sends Server-Sent Events:
 *  event: state   → { state: "thinking|executing|done", detail: "..." }
 *  event: token   → { token: "..." }
 *  event: tool_call → { tool: "...", args: {...}, status: "pending|success|error" }
 *  event: done    → { message: "full response", calls: [...] }
 *  event: error   → { error: "..." }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { guardUserContent, blockedResponse } from '../security/content-guard.js';
import { auditSecurityEvent } from '../security/audit-security-event.js';
import { randomUUID } from 'node:crypto';
import { withAxwiseTracked, buildCopilotContext } from '../integrations/axwise/index.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';

const log = createLogger('assistant-stream');

const PERSONALITIES = {
  professional: {
    trait: 'Concise, data-driven, to the point',
    systemInstruction:
      'You are a sharp, no-nonsense ops manager named Orqa. Use crisp sentences, cite concrete numbers. No filler words.',
  },
  friendly: {
    trait: 'Warm, encouraging, helpful',
    systemInstruction:
      'You are a trusted colleague named Orqa who genuinely cares. Be warm, encouraging, use light humor. Celebrate wins.',
  },
  technical: {
    trait: 'Detailed, precise, developer-oriented',
    systemInstruction:
      'You are a senior engineer named Orqa. Use precise terminology, structured output, bullet points when helpful.',
  },
  creative: {
    trait: 'Novel, metaphorical, colorful',
    systemInstruction:
      'You are a creative director named Orqa. Use vivid metaphors, bring energy, suggest unconventional approaches.',
  },
  minimal: {
    trait: 'Ultra-brief, 1-2 words if possible',
    systemInstruction:
      'You are Orqa. Headlines only. Max 10 words per reply unless user asks for detail.',
  },
};

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rlKey = `assistant-stream:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const { message: rawMessage, personality, history } = req.body;
  if (!rawMessage || typeof rawMessage !== 'string') {
    done({ status: 400 });
    return jsonError(res, 400, 'message is required');
  }

  const guard = guardUserContent(rawMessage, { context: 'assistant-stream' });
  await auditSecurityEvent({
    userId: user?.id,
    context: 'assistant-stream',
    guardResult: guard,
    sample: rawMessage,
  });
  if (guard.action === 'block') {
    done({ status: 400, security: 'blocked' });
    return blockedResponse(res, guard, 'Your message was blocked by security review');
  }
  const message = guard.cleaned;

  // AxWise copilot.chat cognition (advisory). Shadow-safe. Runs before SSE opens
  // so an authoritative deny can still return a normal blocked response.
  const ax = await withAxwiseTracked(
    buildCopilotContext({
      requestId: randomUUID(),
      tenant: { userId: user.id, orgId: null },
      message,
      history,
    }),
    () => ({ processedOutputs: {} }),
    { posture: 'open', admin: buildSupabaseAdminClient(), localDecision: guard.action }
  );
  const axActive = process.env.AXWISE_ENFORCE === 'authoritative' && !ax.degraded && !ax.skipped;
  if (axActive && ax.processedOutputs?.security?.scopeDecision === 'denied') {
    done({ status: 200, security: 'axwise-blocked' });
    return blockedResponse(
      res,
      guard,
      ax.processedOutputs.security.blockReason || 'This request is not permitted.'
    );
  }
  const axFragment = axActive ? ax.processedOutputs?.systemPromptFragment || '' : '';

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    // Phase 1: Thinking
    sendSSE(res, 'state', { state: 'thinking', detail: 'Analyzing your request...' });

    const personalityConfig = PERSONALITIES[personality] || PERSONALITIES.professional;

    const sysContent = `${personalityConfig.systemInstruction}

You are the AI voice assistant for Orqaly, a partner management platform.
Rules:
- Keep replies to 2-3 sentences unless the user asks for detail.
- Sound natural and conversational — you will be read aloud as voice.
- Reference what the user said and build on the conversation naturally.
- Never start with "I" — vary your sentence openings.
- Avoid generic phrases like "Sure!", "Of course!", "Absolutely!" — be specific.
- If the user asks you to do something that requires a function call, describe what you would do.`;

    const messages = [
      { role: 'system', content: axFragment ? `${sysContent}\n${axFragment}` : sysContent },
    ];
    if (history?.length) {
      for (const m of history.slice(-6)) {
        messages.push({ role: m.role || 'user', content: (m.content || '').slice(0, 300) });
      }
    }
    messages.push({ role: 'user', content: message });

    // Phase 2: Generate response
    sendSSE(res, 'state', { state: 'generating', detail: 'Generating response...' });

    const result = await executeLlmV2Tracked({
      userId: user?.id,
      messages,
      provider: defaultProvider(),
      model: defaultModel(),
      temperature: 0.6,
      maxTokens: 1000,
      timeoutMs: 15000,
      usage: {
        admin: buildSupabaseAdminClient(),
        userId: user?.id,
        source: 'assistant-stream',
        operation: 'chat',
      },
    });

    const fullMessage = result.content || '';

    // Phase 3: Stream tokens (simulate word-by-word for non-streaming providers)
    const words = fullMessage.split(/(\s+)/);
    for (const word of words) {
      if (word) {
        sendSSE(res, 'token', { token: word });
      }
    }

    // Phase 4: Done
    sendSSE(res, 'done', {
      message: fullMessage,
      cost: result.estimatedCostUsd,
      model: result.model,
      provider: result.provider,
    });

    done({ status: 200 });
  } catch (err) {
    log.error(req, 'stream.failed', err);
    sendSSE(res, 'error', { error: err.message || 'Stream failed' });
    done({ status: 500 });
  }

  res.end();
}
