/**
 * Apply selected keys from a prior import preview.
 *
 * POST /api/app?path=import-keys-apply
 * Body: { importId, selections: [{ idx, provider, slot? }] }
 *
 * For each selection, look up the pending plaintext by idx, save via the
 * shared saveUserApiKey helper (probe → encrypt → vault → insert).
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
import { isKnownProvider } from '../security/provider-catalog.js';
import { saveUserApiKey } from './_shared/save-user-api-key.js';
import {
  loadToolCredentialSnapshot,
  reserveToolCredentialWrite,
  toolIdFromCredentialProvider,
} from './_shared/tool-credential-write-reservation.js';
import { readPending, dropPending } from './import-keys-preview.js';

const log = createLogger('import-keys-apply');

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const done = log.startTimer(req, 'request');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rl = checkRateLimit({
    key: `import-keys-apply:${getRateLimitIdentifier(req, user.id)}`,
    limit: 10,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return jsonError(res, 400, 'Invalid JSON');
    }
  }

  const { importId, selections } = body || {};
  if (!importId || typeof importId !== 'string') return jsonError(res, 400, 'importId required');
  if (!Array.isArray(selections) || selections.length === 0)
    return jsonError(res, 400, 'selections[] required');
  if (selections.length > 200) return jsonError(res, 400, 'Too many selections');

  const entries = readPending(importId, user.id);
  if (!entries) {
    done({ status: 410 });
    return jsonError(res, 410, 'Import session expired or not found — re-upload the file');
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    done({ status: 500 });
    return jsonError(res, 500, 'Admin client unavailable');
  }

  // Verify the import row belongs to this user and is ready to apply
  const { data: importRow } = await admin
    .from('key_imports')
    .select('id, status')
    .eq('id', importId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!importRow) {
    done({ status: 404 });
    return jsonError(res, 404, 'Import not found');
  }
  if (importRow.status !== 'ready') {
    done({ status: 409 });
    return jsonError(res, 409, `Import status is ${importRow.status}, cannot apply`);
  }

  const results = [];
  let applied = 0;
  let failed = 0;

  for (const sel of selections) {
    const { idx, provider, slot = 'default' } = sel || {};
    if (typeof idx !== 'number' || !provider || !isKnownProvider(provider)) {
      results.push({ idx, success: false, code: 'BAD_SELECTION' });
      failed++;
      continue;
    }
    const entry = entries.find((e) => e.idx === idx);
    if (!entry) {
      results.push({ idx, success: false, code: 'ENTRY_NOT_IN_SESSION' });
      failed++;
      continue;
    }
    let toolCredentialReservation = null;
    const toolId = toolIdFromCredentialProvider(provider);
    if (toolId) {
      const loaded = await loadToolCredentialSnapshot({
        admin,
        userId: user.id,
        toolId,
      });
      if (!loaded.ok) {
        results.push({ idx, success: false, code: loaded.code, message: loaded.message });
        failed++;
        continue;
      }
      const reserved = await reserveToolCredentialWrite({
        admin,
        userId: user.id,
        toolSnapshot: loaded.snapshot,
        source: 'import-keys-apply',
      });
      if (!reserved.ok) {
        results.push({ idx, success: false, code: reserved.code, message: reserved.message });
        failed++;
        continue;
      }
      toolCredentialReservation = reserved.reservation;
    }
    const saveResult = await saveUserApiKey({
      userId: user.id,
      provider,
      slot,
      label: entry.name, // preserve the original KEY name as the label
      apiKey: entry.value,
      skipProbe: false, // always probe
      adminClient: admin,
      toolCredentialReservation,
    });
    if (saveResult.success) {
      applied++;
      results.push({
        idx,
        success: true,
        provider,
        maskedPreview: saveResult.row.maskedPreview,
        id: saveResult.row.id,
      });
    } else {
      failed++;
      results.push({
        idx,
        success: false,
        code: saveResult.code,
        message: saveResult.message,
      });
    }
  }

  // Update import row totals
  await admin
    .from('key_imports')
    .update({
      applied_keys: applied,
      failed_keys: failed,
      status: applied > 0 ? 'applied' : 'error',
    })
    .eq('id', importId)
    .eq('user_id', user.id);

  dropPending(importId);

  done({ status: 200, applied, failed });
  return res.status(200).json({ success: true, applied, failed, results });
}
