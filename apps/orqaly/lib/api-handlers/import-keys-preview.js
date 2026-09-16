/**
 * Bulk import preview:
 *   1. Receive file (base64) or pasted text.
 *   2. If file: store in `user-key-imports` bucket, SHA-256, VT scan.
 *   3. Parse → map to providers.
 *   4. Return preview rows (masked values) + importId.
 *
 * Raw values are cached server-side keyed by importId for 10 minutes so the
 * apply step can save them. The client never sees plaintext.
 *
 * POST /api/app?path=import-keys-preview
 * Body: { sourceType: 'file'|'paste', content: string(base64 for file), filename?, format? }
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
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { scanFileBuffer } from '../security/virustotal.js';
import { parseAndMap, detectFormatFromFilename } from '../security/key-import-parsers.js';
import { putImportFile, buildImportPath } from '../security/upload-storage.js';
import { guardUserContent, blockedResponse } from '../security/content-guard.js';
import { auditSecurityEvent } from '../security/audit-security-event.js';

const log = createLogger('import-keys-preview');

const MAX_FILE_SIZE = 256 * 1024; // 256 KB
const ALLOWED_EXTS = new Set(['env', 'json', 'csv', 'txt', 'yaml', 'yml']);

/** In-process cache of plaintext values pending apply. TTL 10 minutes. */
const PENDING_CACHE = new Map(); // importId -> { userId, entries, expiry }
const PENDING_TTL_MS = 10 * 60 * 1000;

function cachePending(importId, userId, entries) {
  PENDING_CACHE.set(importId, { userId, entries, expiry: Date.now() + PENDING_TTL_MS });
  // Opportunistic cleanup
  if (PENDING_CACHE.size > 100) {
    const now = Date.now();
    for (const [k, v] of PENDING_CACHE.entries()) {
      if (v.expiry < now) PENDING_CACHE.delete(k);
    }
  }
}

export function readPending(importId, userId) {
  const hit = PENDING_CACHE.get(importId);
  if (!hit) return null;
  if (hit.expiry < Date.now()) { PENDING_CACHE.delete(importId); return null; }
  if (hit.userId !== userId) return null;
  return hit.entries;
}

export function dropPending(importId) {
  PENDING_CACHE.delete(importId);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const done = log.startTimer(req, 'request');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) { done({ status: 401 }); return jsonError(res, 401, 'Unauthorized'); }

  const rl = checkRateLimit({
    key: `import-keys-preview:${getRateLimitIdentifier(req, user.id)}`,
    limit: 3,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) { done({ status: 429 }); return jsonError(res, 429, 'Rate limit exceeded'); }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return jsonError(res, 400, 'Invalid JSON'); }
  }

  const { sourceType, content, filename, format: explicitFormat } = body || {};
  if (!sourceType || !['file', 'paste'].includes(sourceType)) return jsonError(res, 400, 'sourceType must be file or paste');
  if (typeof content !== 'string' || content.length === 0) return jsonError(res, 400, 'content required');

  const admin = buildSupabaseAdminClient();
  if (!admin) { done({ status: 500 }); return jsonError(res, 500, 'Admin client unavailable'); }

  // Decode + sanity-check file path
  let fileBuffer = null;
  let textContent = null;
  let format;
  let storagePath = null;
  let sha256 = null;
  let vtStatus = 'skipped';
  let vtStats = null;
  let vtScanId = null;

  if (sourceType === 'file') {
    const safeFilename = sanitizeFilename(filename || 'upload');
    const ext = (safeFilename.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] || '').toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) return jsonError(res, 400, `Extension .${ext || '?'} is not allowed`);

    try { fileBuffer = Buffer.from(content, 'base64'); }
    catch { return jsonError(res, 400, 'content must be base64'); }

    if (fileBuffer.length === 0) return jsonError(res, 400, 'Empty file');
    if (fileBuffer.length > MAX_FILE_SIZE) {
      done({ status: 413 });
      return jsonError(res, 413, `File exceeds ${MAX_FILE_SIZE} bytes`);
    }

    // Must be decodable UTF-8 text; reject if the buffer contains a NUL early on
    if (fileBuffer.includes(0)) return jsonError(res, 400, 'Binary file rejected');

    textContent = fileBuffer.toString('utf8');
    format = explicitFormat || detectFormatFromFilename(safeFilename) || 'paste';

    storagePath = buildImportPath(user.id, safeFilename);
    try {
      await putImportFile(storagePath, fileBuffer);
    } catch (err) {
      log.warn(req, 'storage.put_failed', { err: err.message });
      done({ status: 500 });
      return jsonError(res, 500, 'Failed to store file');
    }

    // VirusTotal scan
    const scan = await scanFileBuffer(fileBuffer, safeFilename);
    sha256 = scan.sha256;
    vtStatus = scan.status;
    vtStats = scan.stats || null;
    vtScanId = scan.scanId || null;

    if (vtStatus === 'malicious') {
      await insertImportRow({
        admin, user, storagePath, sourceType, sourceFilename: safeFilename,
        format, sha256, fileSize: fileBuffer.length, vtStatus, vtStats, vtScanId,
        parsedKeys: 0, matchedKeys: 0, status: 'blocked',
        error: 'VirusTotal flagged the file as malicious',
      });
      done({ status: 400, vt: 'malicious' });
      return res.status(400).json({
        success: false,
        blocked: true,
        error: 'File was flagged as malicious by VirusTotal — import cancelled.',
        vtStats,
      });
    }

    if (vtStatus === 'unknown') {
      await insertImportRow({
        admin, user, storagePath, sourceType, sourceFilename: safeFilename,
        format, sha256, fileSize: fileBuffer.length, vtStatus, vtStats, vtScanId,
        parsedKeys: 0, matchedKeys: 0, status: 'blocked',
        error: 'VirusTotal scan did not complete (unknown) — import cancelled per fail-closed policy',
      });
      done({ status: 400, vt: 'unknown' });
      return res.status(400).json({
        success: false,
        blocked: true,
        error: 'VirusTotal scan did not complete — please try again later.',
      });
    }
  } else {
    // paste
    textContent = String(content);
    if (textContent.length > MAX_FILE_SIZE) {
      done({ status: 413 });
      return jsonError(res, 413, `Pasted content exceeds ${MAX_FILE_SIZE} bytes`);
    }
    format = explicitFormat || 'paste';
    vtStatus = 'skipped';

    // Content guard: malware patterns + prompt injection + unicode hygiene.
    // VT doesn't scan text; this fills that gap.
    const guard = guardUserContent(textContent, { context: 'import-keys-preview:paste' });
    await auditSecurityEvent({
      userId: user.id,
      context: 'import-keys-preview:paste',
      guardResult: guard,
      sample: textContent,
    });
    if (guard.action === 'block') {
      done({ status: 400, security: 'blocked', severity: guard.severity });
      return blockedResponse(res, guard, 'Pasted content blocked by security review');
    }
    if (guard.action === 'warn') {
      // Keep cleaned text, attach warning to response at the end
      textContent = guard.cleaned;
    }
    // stash guard result for the response
    req._guardResult = guard;
  }

  // Parse + map
  const mapped = parseAndMap(textContent, format);
  const matched = mapped.filter((m) => m.matched);

  // Record import
  const importRow = await insertImportRow({
    admin, user, storagePath, sourceType, sourceFilename: filename || null,
    format, sha256, fileSize: fileBuffer ? fileBuffer.length : textContent.length,
    vtStatus, vtStats, vtScanId,
    parsedKeys: mapped.length, matchedKeys: matched.length,
    status: 'ready',
  });

  if (!importRow) { done({ status: 500 }); return jsonError(res, 500, 'Failed to record import'); }

  // Cache plaintext keyed by importId (pending for apply step)
  cachePending(
    importRow.id,
    user.id,
    mapped.map((m, idx) => ({ idx, name: m.name, value: m.value, provider: m.provider })),
  );

  // Response: masked only, never plaintext
  const preview = mapped.map((m, idx) => ({
    idx,
    name: m.name,
    provider: m.provider,
    matched: m.matched,
    maskedPreview: m.maskedPreview,
  }));

  done({ status: 200, parsed: mapped.length, matched: matched.length });
  const response = {
    success: true,
    importId: importRow.id,
    format,
    vtStatus,
    preview,
    counts: {
      parsed: mapped.length,
      matched: matched.length,
      unknown: mapped.length - matched.length,
    },
  };
  if (req._guardResult?.action === 'warn') {
    response.securityWarning = {
      severity: req._guardResult.severity,
      flags: req._guardResult.flags,
    };
  }
  return res.status(200).json(response);
}

function sanitizeFilename(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}

async function insertImportRow({
  admin, user, storagePath, sourceType, sourceFilename, format,
  sha256, fileSize, vtStatus, vtStats, vtScanId,
  parsedKeys, matchedKeys, status, error = null,
}) {
  const { data, error: insertErr } = await admin
    .from('key_imports')
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      source_type: sourceType,
      source_filename: sourceFilename,
      source_format: format,
      sha256,
      file_size: fileSize,
      vt_scan_id: vtScanId,
      vt_status: vtStatus,
      vt_stats: vtStats,
      parsed_keys: parsedKeys,
      matched_keys: matchedKeys,
      status,
      error,
    })
    .select('id')
    .single();

  if (insertErr) {
    log.warn(null, 'key_imports.insert_failed', { err: insertErr.message });
    return null;
  }
  return data;
}
