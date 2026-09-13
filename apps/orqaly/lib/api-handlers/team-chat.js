/**
 * Team Chat handler — LLM-powered team lead responses.
 * POST /api/app?path=team-chat
 *
 * Uses the configured platform LLM to generate conversational
 * responses as the team lead, answering about agents, history, goals.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { guardUserContent, blockedResponse } from '../security/content-guard.js';
import { auditSecurityEvent } from '../security/audit-security-event.js';
import { randomUUID } from 'node:crypto';
import { withAxwiseTracked, buildCopilotContext } from '../integrations/axwise/index.js';
import { defaultProvider, defaultCheapModel } from '../_shared/llm-defaults.js';

const log = createLogger('team-chat');

function buildSystemPrompt(team) {
  const agentList = (team.agents || [])
    .map((a) => {
      const name = a.role || a.name || a.agent_id || 'Agent';
      const cat = a.category ? ` (${a.category})` : '';
      const status = a.availability_status || a.status || 'unknown';
      const caps = (a.capabilities || []).join(', ');
      return `- ${name}${cat}: status=${status}${caps ? `, skills: ${caps}` : ''}`;
    })
    .join('\n');

  const recentJobs = (team.jobIds || []).slice(-5).join(', ');

  return `You are the Team Lead of "${team.name || 'Unnamed Team'}".
Team description: ${team.description || 'No description set.'}
Team status: ${team.status || 'active'}
Created by: ${team.createdByName || 'Unknown'}

TEAM MEMBERS:
${agentList || 'No agents assigned yet.'}

${recentJobs ? `Recent job IDs: ${recentJobs}` : ''}

RULES:
- Speak in first person as the team lead — casual, professional, human-like.
- Answer questions about the team: who the agents are, what they can do, team status.
- If asked about tasks/goals/history, use what you know from context. If you don't have specific data, say so honestly.
- Keep responses concise (2-4 sentences). Be direct and helpful.
- Never invent data you don't have. Say "I'd need to check that" for unknown specifics.
- You can suggest actions: assigning agents, creating tasks, pausing agents, etc.`;
}

export default async function handler(req, res) {
  if (cors(res, req)) return;

  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed');
  }

  try {
    const token = getBearerToken(req);
    if (!token) return jsonError(res, 401, 'Unauthorized');
    const { user } = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Invalid token');

    const { message: rawMessage, team, history } = req.body || {};
    if (!rawMessage?.trim()) return jsonError(res, 400, 'Message is required');
    if (!team) return jsonError(res, 400, 'Team data is required');

    const guard = guardUserContent(rawMessage, { context: 'team-chat' });
    await auditSecurityEvent({
      userId: user?.id,
      context: 'team-chat',
      guardResult: guard,
      sample: rawMessage,
    });
    if (guard.action === 'block') {
      return blockedResponse(res, guard, 'Your message was blocked by security review');
    }
    const message = guard.cleaned;

    // AxWise copilot.chat cognition (advisory). Shadow-safe: records telemetry;
    // only blocks/injects under AXWISE_ENFORCE=authoritative.
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
      return res.status(200).json({
        reply: ax.processedOutputs.security.blockReason || 'This request is not permitted.',
        blocked: true,
      });
    }
    const axFragment = axActive ? ax.processedOutputs?.systemPromptFragment || '' : '';

    // Build conversation messages
    const messages = [
      {
        role: 'system',
        content: axFragment ? `${buildSystemPrompt(team)}\n${axFragment}` : buildSystemPrompt(team),
      },
    ];

    // Add recent history (last 10 messages for context)
    const recentHistory = (history || []).slice(-10);
    for (const msg of recentHistory) {
      const isUser = msg.sender !== 'Team Lead';
      messages.push({
        role: isUser ? 'user' : 'assistant',
        content: msg.text,
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message.trim() });

    log.info('team-chat.generate', {
      teamId: team.id,
      teamName: team.name,
      messageLength: message.length,
      historyCount: recentHistory.length,
    });

    const result = await executeLlmV2Tracked({
      userId: user?.id,
      messages,
      provider: defaultProvider(),
      model: defaultCheapModel(),
      temperature: 0.5,
      maxTokens: 500,
      timeoutMs: 15000,
      usage: {
        admin: buildSupabaseAdminClient(),
        userId: user?.id,
        source: 'team-chat',
        operation: 'chat',
        teamId: team?.id,
      },
    });

    return res.status(200).json({
      reply: result.content,
      usage: result.usage,
      durationMs: result.durationMs,
    });
  } catch (err) {
    log.error('team-chat.error', { error: err.message });
    return handleApiError(res, err);
  }
}
