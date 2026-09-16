/**
 * Supabase Edge Function: AI partner analysis.
 * Replaces the former Vercel serverless cron function.
 *
 * Trigger via pg_cron (daily 05:00 UTC) or manual HTTP call.
 * Fetches all partners, sends each to Groq LLM for analysis,
 * and stores recommendations in partner_ai_recommendations.
 */
import { corsResponse, jsonResponse, jsonError } from '../_shared/cors.ts';
import { getSupabaseUrl, getServiceRoleKey, supabaseHeaders } from '../_shared/supabase.ts';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const BATCH_DELAY_MS = 600;

async function fetchPartners(baseUrl: string, headers: Record<string, string>) {
  const url = `${baseUrl}/rest/v1/partners?select=id,data,created_at&order=created_at.desc&limit=200`;
  const res = await fetch(url, { headers: { ...headers, Prefer: '' } });
  if (!res.ok) throw new Error(`Failed to fetch partners: ${res.status}`);
  const rows = await res.json();
  return rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    createdAt: r.created_at,
    ...(r.data && typeof r.data === 'object' ? r.data as Record<string, unknown> : {}),
  }));
}

async function fetchPartnerHistory(baseUrl: string, headers: Record<string, string>, partnerId: string) {
  const url = `${baseUrl}/rest/v1/partner_history?partner_id=eq.${partnerId}&select=type,title,detail,created_at&order=created_at.desc&limit=20`;
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

function buildPrompt(partner: Record<string, unknown>, history: Array<Record<string, string>>) {
  const info = (partner.information as Record<string, unknown>) || partner;
  const name = (info.name || partner.name || 'Unknown') as string;
  const funnelStatus = (info.funnelStatus || partner.funnelStatus || 'Unknown') as string;
  const agreement = (info.agreement || '') as string;
  const geo = (info.geo || '') as string;
  const vertical = (info.vertical || '') as string;
  const source = (info.source || '') as string;

  const recentHistory = history
    .slice(0, 10)
    .map((h) => `- [${h.type}] ${h.title}${h.detail ? ': ' + h.detail : ''} (${h.created_at})`)
    .join('\n');

  return `You are an AI assistant for a partner/affiliate management platform called Orchestrator.
Analyze this partner and provide actionable recommendations.

Partner: ${name}
Funnel Status: ${funnelStatus}
Agreement Type: ${agreement || 'Not set'}
GEO: ${geo || 'Not set'}
Vertical: ${vertical || 'Not set'}
Source: ${source || 'Not set'}

Recent Activity (last 10 entries):
${recentHistory || 'No recent activity recorded.'}

Based on this data, provide 2-4 specific, actionable recommendations.
Consider: engagement level, funnel progression, potential risks, growth opportunities.

Respond ONLY with valid JSON array. Each object must have:
- "title": short action title (max 60 chars)
- "description": explanation (1-2 sentences)
- "steps": array of 2-3 specific action steps (strings)
- "priority": "high", "medium", or "low"
- "category": one of "engagement", "growth", "risk", "optimization"

Example format:
[{"title":"Schedule follow-up call","description":"Partner has been inactive for 2 weeks.","steps":["Check last meeting date","Prepare agenda","Schedule via calendar"],"priority":"high","category":"engagement"}]`;
}

async function callGroq(prompt: string, groqApiKey: string) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '[]';

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.recommendations)) return parsed.recommendations;
    return [];
  } catch {
    console.warn('[ai-analyze] Failed to parse Groq response:', content.slice(0, 200));
    return [];
  }
}

async function clearOldRecommendations(baseUrl: string, headers: Record<string, string>, partnerId: string) {
  const url = `${baseUrl}/rest/v1/partner_ai_recommendations?partner_id=eq.${partnerId}`;
  await fetch(url, { method: 'DELETE', headers });
}

async function insertRecommendations(
  baseUrl: string,
  headers: Record<string, string>,
  partnerId: string,
  recs: Array<Record<string, unknown>>,
  analyzedAt: string,
) {
  if (!recs.length) return;

  const rows = recs.map((rec) => ({
    partner_id: partnerId,
    title: (String(rec.title || 'Recommendation')).slice(0, 200),
    description: (String(rec.description || '')).slice(0, 1000),
    steps: Array.isArray(rec.steps) ? rec.steps : [],
    priority: ['high', 'medium', 'low'].includes(rec.priority as string) ? rec.priority : 'medium',
    category: rec.category || 'general',
    analyzed_at: analyzedAt,
  }));

  const url = `${baseUrl}/rest/v1/partner_ai_recommendations`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`[ai-analyze] Insert failed for ${partnerId}: ${text}`);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  // Auth: check BACKUP_SECRET (reused) or pg_cron header
  const isPgCron = req.headers.get('x-pg-cron') === 'true';
  if (!isPgCron) {
    const backupSecret = Deno.env.get('BACKUP_SECRET');
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!backupSecret || token !== backupSecret) {
      return jsonError('Unauthorized', 401);
    }
  }

  const supabaseUrl = (getSupabaseUrl() || '').replace(/\/$/, '');
  const serviceRoleKey = getServiceRoleKey();
  const groqApiKey = Deno.env.get('GROQ_API_KEY') || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', 500);
  }
  if (!groqApiKey) {
    return jsonError('Missing GROQ_API_KEY', 500);
  }

  const headers = supabaseHeaders(serviceRoleKey);
  const startTime = Date.now();
  const analyzedAt = new Date().toISOString();

  try {
    const partners = await fetchPartners(supabaseUrl, headers);
    const activePartners = partners.filter((p: Record<string, unknown>) => !p.isArchived);

    let analyzed = 0;
    let errors = 0;

    for (const partner of activePartners) {
      try {
        const history = await fetchPartnerHistory(supabaseUrl, headers, partner.id as string);
        const prompt = buildPrompt(partner, history);
        const recs = await callGroq(prompt, groqApiKey);

        await clearOldRecommendations(supabaseUrl, headers, partner.id as string);
        await insertRecommendations(supabaseUrl, headers, partner.id as string, recs, analyzedAt);
        analyzed++;

        if (analyzed < activePartners.length) {
          await sleep(BATCH_DELAY_MS);
        }
      } catch (err) {
        console.warn(`[ai-analyze] Error for partner ${partner.id}: ${(err as Error).message}`);
        errors++;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return jsonResponse({
      success: true,
      totalPartners: partners.length,
      activePartners: activePartners.length,
      analyzed,
      errors,
      durationSeconds: elapsed,
      analyzedAt,
    });
  } catch (err) {
    console.error('[ai-analyze] Fatal error:', err);
    return jsonError('AI analysis failed', 500, (err as Error).message);
  }
});
