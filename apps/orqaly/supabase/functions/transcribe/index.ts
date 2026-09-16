/**
 * Supabase Edge Function: transcribe audio and structure for meetings.
 * Replaces the former Vercel serverless function (needed 60s timeout).
 *
 * POST /transcribe
 * Body (JSON): { audioBase64: string, mimeType?: string }
 *
 * Providers:
 *   1) GROQ_API_KEY → Groq Whisper (fast) + Groq LLM
 *   2) ASSEMBLYAI_API_KEY → AssemblyAI (polling fallback) + LLM Gateway
 */
import { corsResponse, corsHeaders, jsonResponse, jsonError } from '../_shared/cors.ts';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB

const STRUCTURING_PROMPT = `You are an expert meeting analyst. Analyze the following meeting transcript and extract structured metadata.

Return a JSON object with these fields only (no markdown, no code fence):
{
  "meeting_topic": "single sentence describing the main meeting subject",
  "participants": ["list of mentioned participants"],
  "organizer": "person who organized or led the meeting",
  "datetime": "ISO date/time if mentioned",
  "duration_minutes": estimated_duration_number,
  "channel": "communication channel if mentioned",
  "geographic_focus": ["countries or regions discussed as targets"],
  "campaigns": ["campaign types, initiatives, or channels discussed"],
  "materials_requested": ["landing pages, links, creatives, assets, docs requested"],
  "traffic_discussion": ["traffic sources, volumes, FTDs, conversion rates discussed"],
  "topics": ["key topics discussed"],
  "key_discussion_points": ["main discussion points"],
  "decisions": ["decisions made during the meeting"],
  "agreements": ["agreements reached"],
  "risks_or_concerns": ["any risks or concerns raised"],
  "next_steps": ["concrete next steps mentioned"],
  "action_items": [
    { "task": "description", "assignee": "person", "deadline": "date if mentioned" }
  ],
  "dialogue_structured": [
    { "speaker": "speaker name if known", "message": "cleaned sentence", "intent": "short intent label", "request_detected": true }
  ],
  "extracted_requests": [
    { "title": "clear request title", "description": "what is being asked", "request_type": "task|workflow|project|permission|partner_update|communication|content", "required_resources": [], "context": "why this request matters", "owner": "who should handle it", "priority": "high|medium|low" }
  ],
  "recommended_actions": [
    { "action_type": "create_task|create_workflow|update_workflow|launch_project|grant_permission|update_partner|contact_telegram|contact_email|provide_content", "title": "action title", "description": "what this action will do", "one_click": true, "context": "meeting context", "payload": {} }
  ],
  "workflow_actions": [
    { "mode": "create|edit", "workflow_name": "name", "description": "what to automate or change", "project_context": "project or partner context" }
  ],
  "permission_actions": [
    { "permission": "permission requested", "scope": "what this allows", "reason": "why requested", "duration": "one-time|temporary|permanent" }
  ],
  "communication_mentions": { "telegram": [], "email": [] },
  "partner_community_updates": [],
  "tags": ["relevant category tags"],
  "summary": "2-3 sentence executive summary."
}

Be precise. Extract only what is explicitly stated or strongly implied.
For action_items: include every concrete task mentioned.
For extracted_requests: capture each explicit or strongly implied ask.
For recommended_actions: produce practical one-click actions.

TRANSCRIPT:
---
{TRANSCRIPT}
---`;

function parseStructuredJson(text: string) {
  if (!text || typeof text !== 'string') return null;
  const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch { return null; }
  }
  return null;
}

const emptyStructured = () => ({
  meeting_topic: null, participants: [], organizer: null,
  geographic_focus: [], campaigns: [], materials_requested: [],
  traffic_discussion: [], topics: [], key_discussion_points: [],
  decisions: [], agreements: [], risks_or_concerns: [], next_steps: [],
  action_items: [], dialogue_structured: [], extracted_requests: [],
  recommended_actions: [], workflow_actions: [], permission_actions: [],
  communication_mentions: { telegram: [], email: [] },
  partner_community_updates: [], tags: [],
  summary: 'No speech detected in the recording.',
});

async function verifySupabaseToken(token: string): Promise<Record<string, unknown> | null> {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!url || !token || !anonKey) return null;
  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? user : null;
}

// In-memory rate limiter
const rateBuckets = new Map<string, { hits: number[]; windowMs: number }>();
function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { hits: [], windowMs };
  bucket.hits = bucket.hits.filter((ts) => ts > now - windowMs);
  const allowed = bucket.hits.length < limit;
  if (allowed) bucket.hits.push(now);
  rateBuckets.set(key, bucket);
  return { allowed, remaining: Math.max(0, limit - bucket.hits.length) };
}

async function transcribeWithGroq(buffer: Uint8Array, mimeType: string, groqKey: string): Promise<string> {
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob([buffer], { type: mimeType || 'audio/webm' });
  const form = new FormData();
  form.append('file', blob, `audio.${ext}`);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'text');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper ${res.status}: ${errText}`);
  }
  return (await res.text()).trim();
}

async function transcribeWithAssemblyAI(buffer: Uint8Array, assemblyAiKey: string): Promise<string> {
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { Authorization: assemblyAiKey, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });
  if (!uploadRes.ok) throw new Error(await uploadRes.text() || `Upload ${uploadRes.status}`);
  const { upload_url } = await uploadRes.json();
  if (!upload_url) throw new Error('No upload_url from AssemblyAI');

  const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { Authorization: assemblyAiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url }),
  });
  if (!submitRes.ok) throw new Error(await submitRes.text());
  const { id } = await submitRes.json();
  if (!id) throw new Error('No transcript id');

  // Poll up to 120s (Supabase Edge Functions allow up to 150s)
  const maxPollMs = 120000;
  const pollMs = 2000;
  for (let elapsed = 0; elapsed < maxPollMs; elapsed += pollMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const getRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { Authorization: assemblyAiKey },
    });
    if (!getRes.ok) throw new Error(await getRes.text());
    const data = await getRes.json();
    if (data.status === 'completed') return data.text || '';
    if (data.status === 'error') throw new Error(data.error || 'AssemblyAI failed');
  }
  throw new Error('AssemblyAI transcription timed out');
}

async function structureWithGroq(prompt: string, groqKey: string): Promise<string> {
  const groqModel = Deno.env.get('GROQ_MODEL') || 'llama-3.1-8b-instant';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: groqModel,
      messages: [
        { role: 'system', content: 'You output only valid JSON. No markdown, no explanation.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  // GET → status check
  if (req.method === 'GET') {
    const groqKey = !!Deno.env.get('GROQ_API_KEY');
    const assemblyAiKey = !!Deno.env.get('ASSEMBLYAI_API_KEY');
    const configured = groqKey || assemblyAiKey;
    const provider = groqKey ? 'groq-whisper' : assemblyAiKey ? 'assemblyai' : 'none';
    return jsonResponse({ configured, provider, host: 'supabase-edge' });
  }

  if (req.method !== 'POST') return jsonError('Method not allowed', 405);

  // Auth
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return jsonError('Unauthorized. Sign in and retry.', 401);
  const authUser = await verifySupabaseToken(token);
  if (!authUser) return jsonError('Unauthorized. Invalid token.', 401);

  // Rate limit
  const rl = checkRateLimit(
    `transcribe:${authUser.id || 'anon'}`,
    Number(Deno.env.get('TRANSCRIBE_RATE_LIMIT_PER_MIN') || '6'),
    60_000,
  );
  if (!rl.allowed) return jsonError('Rate limit exceeded for transcription. Please retry shortly.', 429);

  const groqKey = Deno.env.get('GROQ_API_KEY') || '';
  const assemblyAiKey = Deno.env.get('ASSEMBLYAI_API_KEY') || '';
  if (!groqKey && !assemblyAiKey) {
    return jsonError('Transcription not configured', 503, 'Add GROQ_API_KEY (free) in Supabase Edge Function secrets.');
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const audioBase64 = body.audioBase64 as string;
  const mimeType = (body.mimeType as string) || 'audio/webm';

  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return jsonError('Missing audioBase64 field', 400);
  }

  // Decode and check size
  let buffer: Uint8Array;
  try {
    const binaryStr = atob(audioBase64);
    buffer = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) buffer[i] = binaryStr.charCodeAt(i);
  } catch {
    return jsonError('Invalid base64 audio data', 400);
  }

  if (buffer.length > MAX_AUDIO_BYTES) {
    return jsonError('Audio file too large. Max ~3-4 minutes per request.', 413);
  }

  let transcriptRaw = '';
  try {
    const transcribeErrors: string[] = [];

    if (groqKey) {
      try { transcriptRaw = await transcribeWithGroq(buffer, mimeType, groqKey); }
      catch (e) { transcribeErrors.push(`Groq: ${(e as Error).message}`); }
    }

    if (assemblyAiKey && !transcriptRaw) {
      try { transcriptRaw = await transcribeWithAssemblyAI(buffer, assemblyAiKey); }
      catch (e) { transcribeErrors.push(`AssemblyAI: ${(e as Error).message}`); }
    }

    if (!transcriptRaw?.trim()) {
      if (transcribeErrors.length > 0) {
        return jsonError(`All transcription providers failed: ${transcribeErrors.join('; ')}`, 500);
      }
      return jsonResponse({ transcriptRaw: '', transcriptStructured: emptyStructured() });
    }

    const prompt = STRUCTURING_PROMPT.replace('{TRANSCRIPT}', transcriptRaw);
    let content = '';

    if (groqKey) {
      content = await structureWithGroq(prompt, groqKey);
    } else if (assemblyAiKey) {
      const gwRes = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: assemblyAiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          messages: [
            { role: 'system', content: 'You output only valid JSON. No markdown, no explanation.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2000,
        }),
      });
      if (!gwRes.ok) throw new Error(await gwRes.text());
      const gwJson = await gwRes.json();
      content = gwJson?.choices?.[0]?.message?.content ?? '';
    }

    const transcriptStructured = parseStructuredJson(content) || {
      ...emptyStructured(),
      summary: transcriptRaw.slice(0, 500),
    };

    return jsonResponse({ transcriptRaw, transcriptStructured });
  } catch (err) {
    console.error('[transcribe] Error:', err);
    return jsonError((err as Error).message || 'Internal server error', 500);
  }
});
