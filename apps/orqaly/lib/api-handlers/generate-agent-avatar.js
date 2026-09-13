/**
 * Generate Agent Avatar handler — AI-powered realistic headshot photos.
 * Uses Stability AI API for image generation and Supabase Storage for hosting.
 * Routes: generate, get-url, delete
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('generate-agent-avatar');

const BUCKET = 'agent-avatars';

/* ── Build prompt based on variant ──────────────────────────────────────── */
function buildPrompt({ gender, age, job_title, variant }) {
  if (variant === 'casual') {
    return `Casual portrait photo of a ${age}-year-old ${gender}, outdoors in a city park, friendly natural smile, natural daylight, photorealistic, high quality, 4k`;
  }
  // Default: headshot
  return `Professional headshot portrait photo of a ${age}-year-old ${gender} ${job_title}, wearing smart business attire, neutral office background, soft studio lighting, photorealistic, high quality, 4k`;
}

/* ── Generate avatar via Stability AI ───────────────────────────────────── */
async function handleGenerate(admin, user, body) {
  const { agent_id, display_name, gender, age, job_title, variant: rawVariant } = body;

  // Validate required fields
  if (!agent_id) return { status: 400, error: 'agent_id is required' };
  if (!display_name) return { status: 400, error: 'display_name is required' };
  if (!gender) return { status: 400, error: 'gender is required' };
  if (!age) return { status: 400, error: 'age is required' };
  if (!job_title) return { status: 400, error: 'job_title is required' };

  const variant = rawVariant === 'casual' ? 'casual' : 'headshot';

  // Check API key
  if (!process.env.STABILITY_API_KEY) {
    return { status: 503, error: 'Image generation not configured' };
  }

  // Build prompt
  const prompt = buildPrompt({ gender, age, job_title, variant });
  log.info('generate', { agent_id, variant, prompt });

  // Call Stability AI text-to-image API
  const formData = new FormData();
  formData.append('prompt', prompt);
  formData.append('output_format', 'webp');
  formData.append('aspect_ratio', '1:1');

  let imageResponse;
  try {
    imageResponse = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        Accept: 'image/*',
      },
      body: formData,
    });
  } catch (fetchErr) {
    log.error('stability-fetch-error', { error: fetchErr.message });
    throw new Error(`Stability AI request failed: ${fetchErr.message}`);
  }

  if (!imageResponse.ok) {
    let errMsg = `Stability AI error: ${imageResponse.status}`;
    try {
      const errBody = await imageResponse.text();
      errMsg += ` — ${errBody}`;
    } catch (_) { /* ignore parse error */ }
    log.error('stability-api-error', { status: imageResponse.status, error: errMsg });
    return { status: 502, error: errMsg };
  }

  // Read image bytes
  const arrayBuffer = await imageResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to Supabase Storage
  const storagePath = `${user.id}/${agent_id}/${variant}_${Date.now()}.webp`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'image/webp', upsert: true });

  if (uploadError) {
    log.error('storage-upload-error', { error: uploadError.message });
    return { status: 500, error: `Storage upload failed: ${uploadError.message}` };
  }

  // Update agent_profiles row
  const columnName = variant === 'casual' ? 'casual_photo_path' : 'headshot_path';
  const { error: updateError } = await admin
    .from('agent_profiles')
    .update({ [columnName]: storagePath })
    .eq('id', agent_id)
    .eq('user_id', user.id);

  if (updateError) {
    log.warn('profile-update-error', { error: updateError.message });
    // Non-fatal — image is still uploaded
  }

  // Get public URL
  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

  return { status: 200, data: { path: storagePath, publicUrl: urlData.publicUrl } };
}

/* ── Get public/signed URL for an avatar path ───────────────────────────── */
async function handleGetUrl(admin, _user, body) {
  const { path } = body;
  if (!path) return { status: 400, error: 'path is required' };

  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);

  return { status: 200, data: { publicUrl: urlData.publicUrl } };
}

/* ── Delete avatar from storage and clear profile column ────────────────── */
async function handleDelete(admin, user, body) {
  const { agent_id, variant: rawVariant } = body;
  if (!agent_id) return { status: 400, error: 'agent_id is required' };

  const variant = rawVariant === 'casual' ? 'casual' : 'headshot';
  const columnName = variant === 'casual' ? 'casual_photo_path' : 'headshot_path';

  // Read current path from profile
  const { data: profile, error: fetchError } = await admin
    .from('agent_profiles')
    .select(columnName)
    .eq('id', agent_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const storagePath = profile?.[columnName];
  if (storagePath) {
    // Delete from storage
    const { error: removeError } = await admin.storage
      .from(BUCKET)
      .remove([storagePath]);

    if (removeError) {
      log.warn('storage-remove-error', { error: removeError.message });
    }
  }

  // Clear path on profile
  const { error: updateError } = await admin
    .from('agent_profiles')
    .update({ [columnName]: null })
    .eq('id', agent_id)
    .eq('user_id', user.id);

  if (updateError) throw updateError;

  return { status: 200, data: { deleted: true } };
}

/* ── Main handler ───────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, user), limit: 5, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const admin = buildSupabaseAdminClient();
  const op = req.query?.op;
  const body = req.body || {};

  try {
    let result;
    switch (op) {
      case 'generate':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleGenerate(admin, user, body);
        break;
      case 'get-url':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleGetUrl(admin, user, body);
        break;
      case 'delete':
        if (req.method !== 'DELETE' && req.method !== 'POST') return jsonError(res, 405, 'DELETE or POST only');
        result = await handleDelete(admin, user, body);
        break;
      default:
        return jsonError(res, 400, 'Invalid op');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'generate-agent-avatar');
  }
}
