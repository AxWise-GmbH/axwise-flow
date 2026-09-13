/**
 * [module: connection-hub]
 * Telegram voice / audio → text via Groq Whisper.
 *
 * Flow:
 *   1. Resolve Telegram file path via getFile (free, instant).
 *   2. Download bytes from https://api.telegram.org/file/bot<TOKEN>/<path>.
 *   3. Stream multipart/form-data to Groq's /audio/transcriptions endpoint.
 *
 * Cost: ~$0.0006 per minute of audio (whisper-large-v3-turbo). Telegram caps
 * voice messages at 1MB so cost per message is effectively pennies.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { fetchWithJobLease } from '../../api/_lib/fetch.js';

const log = createLogger('voice-transcribe');

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';
const MAX_BYTES = 25 * 1024 * 1024; // Groq accepts up to 25MB

/**
 * @param {string} botToken Telegram bot token (shared bot's, or BYO).
 * @param {object} fileObj  Telegram message.voice or message.audio (must have file_id).
 * @returns {Promise<string>} Transcribed text.
 */
export async function transcribeVoice(botToken, fileObj) {
  if (!botToken) throw new Error('Missing Telegram bot token');
  if (!fileObj?.file_id) throw new Error('Missing file_id');

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  // 1. getFile → file_path
  const fileMetaRes = await fetchWithJobLease(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileObj.file_id)}`
  );
  if (!fileMetaRes.ok) throw new Error(`Telegram getFile failed: ${fileMetaRes.status}`);
  const fileMeta = await fileMetaRes.json();
  if (!fileMeta.ok || !fileMeta.result?.file_path) {
    throw new Error('Telegram getFile returned no file_path');
  }
  const filePath = fileMeta.result.file_path;
  const fileSize = fileMeta.result.file_size || 0;
  if (fileSize > MAX_BYTES) throw new Error('Audio file too large');

  // 2. Download audio bytes.
  const audioRes = await fetchWithJobLease(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`
  );
  if (!audioRes.ok) throw new Error(`Telegram file download failed: ${audioRes.status}`);
  const audioBuffer = await audioRes.arrayBuffer();

  // Telegram voice is OGG/Opus; Groq accepts ogg.
  const filename = filePath.split('/').pop() || 'audio.ogg';
  const mime = fileObj.mime_type || 'audio/ogg';

  // 3. Send to Groq.
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mime }), filename);
  form.append('model', MODEL);
  form.append('response_format', 'text');
  form.append('temperature', '0');

  const groqRes = await fetchWithJobLease(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!groqRes.ok) {
    const detail = await groqRes.text().catch(() => '');
    log.warn(null, 'groq.transcribe.failed', {
      status: groqRes.status,
      detail: detail.slice(0, 200),
    });
    throw new Error(`Groq transcribe failed: ${groqRes.status}`);
  }
  const text = await groqRes.text();
  return text.trim();
}
