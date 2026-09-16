/**
 * Agent Chat handler — SSE endpoint for chatting with an AI agent in their personality.
 * POST /api/app?path=agent-chat
 *
 * Loads the agent's system_prompt + profile personality, calls Groq, streams response.
 * Logs all messages to communication_logs for tracking in Communicator.
 *
 * Body: { agent_id, message, history[], thread_id? }
 *
 * SSE events: state, token, done, error
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
import { resolveAgentKbScope } from '../_shared/kb-scope.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';
import crypto from 'crypto';
import {
  searchAgentMemory,
  formatMemoryForPrompt,
  UNTRUSTED_REFERENCE_SYSTEM_RULE,
} from '../workflow-engine/memory-manager.js';
import { agentMemoryOwnerId, isAgentMemoryEnabled } from '../_shared/agent-memory.js';
import { queryAgentGraph } from '../_shared/graphify-agent.js';
import { loadActiveSkills } from '../agent-handlers/load-active-skills.js';
import { loadConnectedLibraries } from '../agent-handlers/load-connected-libraries.js';
import { guardUserContent, blockedResponse } from '../security/content-guard.js';
import { auditSecurityEvent } from '../security/audit-security-event.js';
import { withAxwiseTracked, buildCopilotContext } from '../integrations/axwise/index.js';

const log = createLogger('agent-chat');

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/* ── Build system prompt from agent data + profile ───────────────────────── */
function buildAgentSystemPrompt(agent, profile) {
  const parts = [];

  // Identity
  const name = profile?.display_name || agent.metadata?.friendly_name || agent.name;
  const title = profile?.job_title || agent.name;
  const org = profile?.organization || 'Orqaly Inc.';
  parts.push(`You are ${name}, ${title} at ${org}.`);

  // Original system prompt (the detailed role definition)
  const sysPrompt = agent.metadata?.system_prompt || agent.system_prompt || '';
  if (sysPrompt) parts.push(sysPrompt);

  // Profile personality overlay
  if (profile) {
    const tone = profile.communication_tone || {};
    const rules = profile.behavior_rules || {};
    const personality = [];
    if (profile.bio) personality.push(profile.bio);
    if (tone.style) personality.push(`Communication style: ${tone.style}.`);
    if (tone.verbosity) personality.push(`Be ${tone.verbosity} in your responses.`);
    if (tone.formality === 'formal') personality.push('Maintain a formal tone.');
    else if (tone.formality === 'casual') personality.push('Keep it casual and approachable.');
    if (tone.emoji_usage === 'never') personality.push('Never use emojis.');
    else if (tone.emoji_usage === 'sparingly') personality.push('Use emojis sparingly.');
    if (Array.isArray(rules.topics_to_avoid) && rules.topics_to_avoid.length > 0) {
      personality.push(`Never discuss: ${rules.topics_to_avoid.join(', ')}.`);
    }
    if (personality.length > 0) {
      parts.push('\nPERSONALITY:\n' + personality.join('\n'));
    }
    if (profile.backstory) {
      parts.push('\nBACKGROUND:\n' + profile.backstory);
    }
  }

  // Conversation rules
  parts.push(`
CONVERSATION RULES:
- You are now in a direct one-on-one conversation with a team member.
- Respond naturally as this character. Stay in character at all times.
- Be helpful, specific, and actionable.
- Reference your expertise and role when relevant.
- Keep responses concise (2-4 sentences) unless the user asks for detail.
- Never mention that you are an AI, language model, or chatbot.
- Vary your sentence openings — never start with "I" repeatedly.
- ${UNTRUSTED_REFERENCE_SYSTEM_RULE}`);

  return parts.join('\n\n');
}

/* ── Log message to communication_logs ───────────────────────────────────── */
async function logMessage(
  admin,
  { threadId, userId, senderType, senderId, senderName, content, agentId }
) {
  if (!userId) return;
  try {
    await admin.from('communication_logs').insert({
      thread_id: threadId,
      user_id: userId,
      sender_type: senderType,
      sender_id: senderId,
      sender_name: senderName,
      content: (content || '').slice(0, 5000),
      context_type: 'agent-chat',
      context_id: agentId,
      platform: 'internal',
      metadata: { user_id: userId },
    });
  } catch {
    /* non-blocking */
  }
}

/* ── Load previous conversation ──────────────────────────────────────────── */
async function loadConversationHistory(admin, userId, agentId, limit = 20) {
  if (!admin || !userId || !agentId) return [];

  try {
    const { data, error } = await admin
      .from('communication_logs')
      .select('sender_type, sender_name, content, created_at')
      .eq('user_id', userId)
      .eq('context_type', 'agent-chat')
      .eq('context_id', agentId)
      .in('sender_id', [userId, agentId])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data || []).reverse();
  } catch {
    return [];
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reuse a client-provided thread only when it already belongs to this exact
 * user and owned agent context. First messages always receive a server UUID.
 */
async function resolveOwnedThreadId(admin, requestedThreadId, userId, agentId) {
  const requested = typeof requestedThreadId === 'string' ? requestedThreadId.trim() : '';
  if (!UUID_RE.test(requested)) return crypto.randomUUID();

  try {
    const { data: owned, error: ownedError } = await admin
      .from('communication_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('thread_id', requested)
      .eq('context_type', 'agent-chat')
      .eq('context_id', agentId)
      .limit(1)
      .maybeSingle();

    return !ownedError && owned ? requested : crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}

/* ── Main handler ────────────────────────────────────────────────────────── */
export default async function agentChat(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: load conversation history
  if (req.method === 'GET') {
    const token = getBearerToken(req);
    if (!token) return jsonError(res, 401, 'Missing token');
    const user = await verifySupabaseToken(token);
    if (!user?.id) return jsonError(res, 401, 'Invalid token');

    const agentId = req.query?.agent_id;
    if (!agentId) return jsonError(res, 400, 'agent_id required');

    const admin = buildSupabaseAdminClient();
    const { data: agent, error: agentError } = await admin
      .from('agents')
      .select('id')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (agentError || !agent) return jsonError(res, 404, 'Agent not found');

    const history = await loadConversationHistory(admin, user.id, agent.id);
    return res.status(200).json(history);
  }

  if (req.method !== 'POST') return jsonError(res, 405, 'POST or GET only');

  const token = getBearerToken(req);
  if (!token) return jsonError(res, 401, 'Missing token');
  const user = await verifySupabaseToken(token);
  if (!user?.id) return jsonError(res, 401, 'Invalid token');

  const rlKey = `agent-chat:${getRateLimitIdentifier(req)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const { agent_id, message: rawMessage, history: clientHistory, thread_id } = req.body;
  if (!agent_id) return jsonError(res, 400, 'agent_id is required');
  if (!rawMessage || typeof rawMessage !== 'string')
    return jsonError(res, 400, 'message is required');

  const guard = guardUserContent(rawMessage, { context: 'agent-chat' });
  await auditSecurityEvent({
    userId: user?.id,
    context: 'agent-chat',
    guardResult: guard,
    sample: rawMessage,
  });
  if (guard.action === 'block') {
    return blockedResponse(res, guard, 'Your message was blocked by security review');
  }
  const message = guard.cleaned;

  const admin = buildSupabaseAdminClient();

  // Bind every service-role read to the authenticated caller before invoking
  // advisory services or accepting a client-provided conversation thread.
  const { data: agent, error: agentError } = await admin
    .from('agents')
    .select('id, name, description, metadata')
    .eq('id', agent_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (agentError || !agent) return jsonError(res, 404, 'Agent not found');

  const threadId = await resolveOwnedThreadId(admin, thread_id, user.id, agent.id);
  // Predefined catalogue agents retain their stable seeded identity. Custom
  // metadata is user-controlled and can collide, so custom memory is always
  // isolated by the immutable agents row UUID.
  const memoryOwnerId = agentMemoryOwnerId(agent);

  // AxWise copilot.chat cognition (advisory). Shadow-safe: records telemetry;
  // only blocks/injects under AXWISE_ENFORCE=authoritative. Runs before SSE opens.
  const ax = await withAxwiseTracked(
    buildCopilotContext({
      requestId: crypto.randomUUID(),
      tenant: { userId: user.id, orgId: null },
      message,
      history: clientHistory,
    }),
    () => ({ processedOutputs: {} }),
    { posture: 'open', admin, localDecision: guard.action }
  );
  const axActive = process.env.AXWISE_ENFORCE === 'authoritative' && !ax.degraded && !ax.skipped;
  if (axActive && ax.processedOutputs?.security?.scopeDecision === 'denied') {
    return blockedResponse(
      res,
      guard,
      ax.processedOutputs.security.blockReason || 'This request is not permitted.'
    );
  }
  const axFragment = axActive ? ax.processedOutputs?.systemPromptFragment || '' : '';

  // Load profile
  const { data: profile } = await admin
    .from('agent_profiles')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('user_id', user.id)
    .maybeSingle();

  // Build the trusted system prompt separately from retrieved knowledge.
  // Knowledge documents and graph text are user-controlled reference data and
  // must never be promoted to system policy.
  let systemPrompt = buildAgentSystemPrompt(agent, profile);
  let memoryContext = '';
  const agentName = profile?.display_name || agent.metadata?.friendly_name || agent.name;

  // Long-term memory is active by default; only inject when not deactivated.
  if (isAgentMemoryEnabled(agent.metadata)) {
    try {
      const memResults = await searchAgentMemory(message, user.id, 'agent', memoryOwnerId, {
        limit: 3,
        threshold: 0.3,
      });
      let graphCtx = '';
      try {
        graphCtx = await queryAgentGraph(memoryOwnerId, message, admin, { userId: user.id });
      } catch {
        /* graph optional */
      }
      const memBlock = formatMemoryForPrompt(memResults, graphCtx);
      if (memBlock) memoryContext = memBlock;
    } catch (e) {
      log.warn(req, 'agent.memory.inject.failed', { agent_id, error: e.message });
    }
  }

  try {
    systemPrompt += await loadActiveSkills(admin, agent.id, user.id);
  } catch (e) {
    log.warn(req, 'agent.skills.inject.failed', { agent_id, error: e.message });
  }

  try {
    systemPrompt += await loadConnectedLibraries(admin, agent.id, user.id);
  } catch (e) {
    log.warn(req, 'agent.libraries.inject.failed', { agent_id, error: e.message });
  }

  if (axFragment) systemPrompt += `\n${axFragment}`;

  // Log user message
  await logMessage(admin, {
    threadId,
    userId: user.id,
    senderType: 'user',
    senderId: user.id,
    senderName: user.email || 'User',
    content: message,
    agentId: agent.id,
  });

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    sendSSE(res, 'state', { state: 'thinking', detail: `${agentName} is thinking...` });

    // Build messages array
    const messages = [{ role: 'system', content: systemPrompt }];

    // Add conversation history from DB or client
    if (Array.isArray(clientHistory) && clientHistory.length > 0) {
      for (const m of clientHistory.slice(-20)) {
        messages.push({
          role: m.sender_type === 'user' ? 'user' : 'assistant',
          content: (m.content || '').slice(0, 1000),
        });
      }
    }

    messages.push({
      role: 'user',
      content: memoryContext ? `${message}\n\n${memoryContext}` : message,
    });

    // Call the agent's explicit model or the configured platform default.
    sendSSE(res, 'state', { state: 'generating', detail: `${agentName} is typing...` });

    const result = await executeLlmV2Tracked({
      userId: user?.id,
      messages,
      provider: agent.metadata?.provider || defaultProvider(),
      model: agent.metadata?.model || (agent.metadata?.provider ? undefined : defaultModel()),
      temperature: 0.7,
      maxTokens: 1000,
      timeoutMs: 15000,
      usage: {
        admin,
        userId: user?.id,
        source: 'agent-chat',
        operation: 'chat',
        agentId: agent.id,
        agentName,
      },
    });

    const fullMessage = result.content || '';

    // Stream tokens word-by-word
    const words = fullMessage.split(/(\s+)/);
    for (const word of words) {
      if (word) sendSSE(res, 'token', { token: word });
    }

    // Log agent response
    await logMessage(admin, {
      threadId,
      userId: user.id,
      senderType: 'agent',
      senderId: agent.id,
      senderName: agentName,
      content: fullMessage,
      agentId: agent.id,
    });

    sendSSE(res, 'done', {
      message: fullMessage,
      thread_id: threadId,
      agent_name: agentName,
      cost: result.estimatedCostUsd,
      model: result.model,
      provider: result.provider,
    });

    // Auto-save conversation to agent memory if enabled
    if (agent.metadata?.memory_config?.auto_save) {
      try {
        const convoContent = `User: ${message}\n${agentName}: ${fullMessage}`;
        const { generateEmbedding: genEmb } = await import('../_shared/embeddings.js');
        const embedding = await genEmb(convoContent.slice(0, 512));
        const kbScope = await resolveAgentKbScope(admin, agent.id, user.id);
        await admin.from('knowledge_documents').insert({
          user_id: user.id,
          title: `Chat with ${agentName} — ${new Date().toLocaleDateString()}`,
          content: convoContent.slice(0, 5000),
          source: 'auto-save',
          category: 'conversation',
          owner_type: 'agent',
          owner_id: memoryOwnerId,
          content_type: 'conversation',
          tags: ['auto-memory', 'chat'],
          embedding: `[${embedding.join(',')}]`,
          token_count: Math.ceil(convoContent.length / 4),
          ...kbScope,
        });
      } catch (e) {
        log.warn(req, 'agent.memory.autosave.failed', { agent_id, error: e.message });
      }
    }
  } catch (err) {
    log.error(req, 'agent-chat.failed', err);
    sendSSE(res, 'error', { error: err.message || 'Chat failed' });
  }

  res.end();
}
