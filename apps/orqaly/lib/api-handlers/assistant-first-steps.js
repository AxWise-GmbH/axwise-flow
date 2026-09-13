/**
 * First-steps advisor — the assistant "acts like a real person": it reads the
 * company brief + the knowledge the user has uploaded/connected and writes a
 * concrete "first 30 days" plan plus what to add next. The result is persisted
 * to the Knowledge Base (category='company-analysis') so it becomes durable
 * organisational memory.
 *
 * POST /api/app?path=assistant-first-steps  -> { narrative, docId }
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import {
  buildSupabaseUserClient,
  buildSupabaseAdminClient,
} from '../../api/_lib/supabase-server.js';
import { executeLlmV2Tracked } from '../usage-handlers/tracked-llm.js';
import { generateEmbedding, estimateTokens } from '../_shared/embeddings.js';
import { defaultProvider, defaultModel } from '../_shared/llm-defaults.js';

const log = createLogger('assistant-first-steps');

const SYSTEM_PROMPT =
  'You are a friendly, sharp operations partner onboarding into a company. Using ONLY the ' +
  'company brief and the list of knowledge the user has provided, write a warm, concrete ' +
  '"first 30 days" plan. Plain text, under 180 words. Structure: a 1-2 sentence read on the ' +
  'company, then "First steps:" with 3-4 single-line "- " bullets, then "To go deeper, share:" ' +
  'with 2-3 "- " bullets naming specific documents/data you still need. Never invent facts.';

const FALLBACK =
  "Here's where I'd start. First steps:\n" +
  '- Connect a channel and confirm I can reach you.\n' +
  '- Point me at your top priority so I can focus there.\n' +
  '- Upload a few core documents so I understand the business.\n' +
  'To go deeper, share:\n' +
  '- Your current goals or OKRs.\n' +
  '- A list of key contacts and tools you use.';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const done = log.startTimer(req, 'request', { method: req.method });
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rl = checkRateLimit({
    key: `assistant-first-steps:${getRateLimitIdentifier(req, user.id)}`,
    limit: 8,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const userClient = buildSupabaseUserClient(token);
  const admin = buildSupabaseAdminClient();
  if (!userClient || !admin) {
    done({ status: 500 });
    return jsonError(res, 500, 'Server not configured');
  }

  try {
    // Gather context: the brief summary + a sample of the user's KB titles.
    const { data: brief } = await userClient
      .from('company_brief')
      .select('summary')
      .eq('user_id', user.id)
      .maybeSingle();
    const { data: docs } = await userClient
      .from('knowledge_documents')
      .select('title, category')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15);

    const ctxLines = [];
    if (brief?.summary) ctxLines.push('Company brief:', brief.summary);
    if (Array.isArray(docs) && docs.length) {
      ctxLines.push('', 'Knowledge available:');
      docs.forEach((d) => ctxLines.push(`- ${d.title}${d.category ? ` (${d.category})` : ''}`));
    }
    if (ctxLines.length === 0) ctxLines.push('No company brief or documents provided yet.');

    let narrative = '';
    try {
      const result = await executeLlmV2Tracked({
        systemPrompt: SYSTEM_PROMPT,
        prompt: ctxLines.join('\n') + '\n\nWrite the plan now.',
        provider: defaultProvider(),
        model: defaultModel(),
        temperature: 0.5,
        maxTokens: 360,
        timeoutMs: 20000,
        usage: {
          admin,
          userId: user.id,
          source: 'assistant-first-steps',
          operation: 'first-steps',
        },
      });
      narrative = String(result?.content || '').trim();
    } catch (err) {
      log.warn(req, 'llm_failed', { err: err.message });
    }
    if (!narrative) narrative = FALLBACK;

    // Persist as organisational memory.
    let docId = null;
    try {
      const embedding = await generateEmbedding(narrative);
      const { data } = await admin
        .from('knowledge_documents')
        .insert({
          user_id: user.id,
          title: 'AI first-steps plan',
          content: narrative,
          source: 'assistant-first-steps',
          category: 'company-analysis',
          metadata: { generatedAt: new Date().toISOString() },
          embedding: `[${embedding.join(',')}]`,
          token_count: estimateTokens(narrative),
          owner_type: 'user',
          content_type: 'note',
          tags: ['company-analysis', 'first-steps'],
        })
        .select('id')
        .single();
      docId = data?.id || null;
    } catch (err) {
      log.warn(req, 'persist_failed', { err: err.message });
    }

    done({ status: 200 });
    return res.status(200).json({ narrative, docId });
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'assistant-first-steps');
  }
}
