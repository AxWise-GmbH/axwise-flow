/**
 * [module: connection-hub]
 * Telegram photo / document → Supabase Storage + extracted text.
 *
 * Flow:
 *   1. Resolve Telegram file path via getFile.
 *   2. Download bytes (cap 10 MB).
 *   3. Upload to communicator-uploads bucket at "<user_uuid>/<file_uuid>.<ext>".
 *   4. Optional text extraction:
 *        - text/plain, markdown, json → read as UTF-8
 *        - image/*                    → OpenAI gpt-4o-mini vision (if key set)
 *        - application/pdf            → server-side pdf-parse if available,
 *                                       otherwise stored without extraction
 *   5. Insert metadata row in communicator_files (RLS-scoped).
 *   6. Return { fileId, storagePath, extractedText, extractionMethod }.
 *
 * The caller (worker) wraps `extractedText` in <external> blocks before
 * passing to the assistant LLM — per Phase 1 prompt-injection defense.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { fetchWithJobLease } from '../../api/_lib/fetch.js';

const log = createLogger('file-ingest');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB hard cap
const MAX_EXTRACT_CHARS = 20_000; // safety cap on text returned to LLM
const BUCKET = 'communicator-uploads';

/**
 * @param {object} admin              Supabase admin client (service role)
 * @param {string} botToken           Telegram bot token (shared or per-channel)
 * @param {object} opts
 * @param {string} opts.userId        Channel owner uuid
 * @param {string} opts.channelId     Source channel uuid
 * @param {object} opts.fileObj       Telegram document/photo object (must have file_id)
 * @param {string} [opts.suggestedFilename]  Falls back to telegram-provided name
 * @returns {Promise<{
 *   fileId: string, storagePath: string,
 *   extractedText: string|null, extractionMethod: string|null,
 *   bytes: number, mimeType: string
 * }>}
 */
export async function ingestTelegramFile(admin, botToken, opts) {
  const { userId, channelId, fileObj, suggestedFilename } = opts;
  if (!botToken) throw new Error('Missing bot token');
  if (!userId) throw new Error('Missing userId');
  if (!fileObj?.file_id) throw new Error('Missing file_id');

  // 1. getFile
  const metaRes = await fetchWithJobLease(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileObj.file_id)}`
  );
  if (!metaRes.ok) throw new Error(`Telegram getFile failed: ${metaRes.status}`);
  const meta = await metaRes.json();
  if (!meta.ok || !meta.result?.file_path)
    throw new Error('Telegram getFile returned no file_path');

  const filePath = meta.result.file_path;
  const size = Number(meta.result.file_size || 0);
  if (size > MAX_BYTES) throw new Error(`File too large (${size} > ${MAX_BYTES})`);

  // 2. Download
  const dlRes = await fetchWithJobLease(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!dlRes.ok) throw new Error(`Telegram file download failed: ${dlRes.status}`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());

  // 3. Resolve filename + extension + mime
  const tgFilename = fileObj.file_name || filePath.split('/').pop() || 'file';
  const filename = suggestedFilename || tgFilename;
  const ext = (
    filename.match(/\.([a-zA-Z0-9]+)$/)?.[1] ||
    guessExtFromPath(filePath) ||
    'bin'
  ).toLowerCase();
  const mime = fileObj.mime_type || guessMimeFromExt(ext);

  // 4. Storage upload
  const fileId = crypto.randomUUID();
  const storagePath = `${userId}/${fileId}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    log.warn(null, 'storage.upload.failed', { error: upErr.message, storagePath });
    throw new Error(`Storage upload failed: ${upErr.message}`);
  }

  // 5. Extract text by mime category
  let extractedText = null;
  let extractionMethod = null;
  try {
    if (
      /^text\/|^application\/(json|xml|x-yaml)/i.test(mime) ||
      /\.(txt|md|csv|json|yaml|yml|xml)$/i.test(filename)
    ) {
      extractedText = buffer.toString('utf8').slice(0, MAX_EXTRACT_CHARS);
      extractionMethod = 'plain';
    } else if (/^image\//i.test(mime)) {
      const ocr = await extractFromImage(buffer, mime);
      if (ocr) {
        extractedText = ocr.slice(0, MAX_EXTRACT_CHARS);
        extractionMethod = 'vision-llm';
      }
    } else if (/^application\/pdf$/i.test(mime) || /\.pdf$/i.test(filename)) {
      const pdfText = await extractFromPdf(buffer);
      if (pdfText) {
        extractedText = pdfText.slice(0, MAX_EXTRACT_CHARS);
        extractionMethod = 'pdf-parse';
      }
    }
  } catch (err) {
    log.warn(null, 'extract.failed', { error: err.message, mime, filename });
    // Non-fatal: file is still stored, just without extracted text.
  }

  // 6. Persist metadata
  const { data: row, error: insErr } = await admin
    .from('communicator_files')
    .insert({
      id: fileId,
      user_id: userId,
      channel_id: channelId || null,
      filename,
      mime_type: mime,
      size_bytes: size || buffer.length,
      telegram_file_id: fileObj.file_id,
      storage_path: storagePath,
      extracted_text: extractedText,
      extraction_method: extractionMethod,
      metadata: {
        tg_file_path: filePath,
        ext,
      },
    })
    .select('id, storage_path, expires_at')
    .maybeSingle();

  if (insErr) {
    // Best-effort cleanup of the uploaded object so we don't orphan storage.
    await admin.storage
      .from(BUCKET)
      .remove([storagePath])
      .catch(() => {});
    throw new Error(`File metadata insert failed: ${insErr.message}`);
  }

  return {
    fileId: row?.id || fileId,
    storagePath: row?.storage_path || storagePath,
    extractedText,
    extractionMethod,
    bytes: size || buffer.length,
    mimeType: mime,
    filename,
    expiresAt: row?.expires_at || null,
  };
}

// ── Vision OCR (OpenAI gpt-4o-mini) ─────────────────────────────────────────

async function extractFromImage(buffer, mime) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null; // graceful degradation

  const dataUrl = `data:${mime || 'image/jpeg'};base64,${buffer.toString('base64')}`;
  const res = await fetchWithJobLease('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content:
            'Extract all visible text from the image. If there is no text, briefly describe what the image shows. Output the raw text/description only — no preamble, no JSON.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'OCR + brief description:' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    log.warn(null, 'vision.ocr.failed', { status: res.status, detail: detail.slice(0, 200) });
    return null;
  }
  const json = await res.json().catch(() => null);
  return json?.choices?.[0]?.message?.content?.trim() || null;
}

// ── PDF parsing (optional — only if pdf-parse is installed) ─────────────────

async function extractFromPdf(buffer) {
  try {
    const pdfParseName = 'pdf-parse';
    const mod = await import(pdfParseName).catch(() => null);
    if (!mod) return null;
    const parse = mod.default || mod;
    const result = await parse(buffer);
    return (result?.text || '').trim() || null;
  } catch (err) {
    log.warn(null, 'pdf.parse.failed', { error: err.message });
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function guessExtFromPath(p) {
  if (!p) return null;
  const m = p.match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1].toLowerCase() : null;
}

function guessMimeFromExt(ext) {
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

/** Wrap extracted text in the <external> sandbox the assistant prompt expects. */
export function wrapExternal(extractedText, opts = {}) {
  if (!extractedText) return '';
  const src = opts.src || 'telegram-file';
  const file_id = opts.fileId || '';
  return `<external src="${src}"${file_id ? ` file_id="${file_id}"` : ''}>\n${extractedText}\n</external>`;
}
