/**
 * Envelope encryption for user-provided API keys.
 *
 * Scheme:
 *  - KEK (Key Encryption Key): 32 bytes, base64 in process.env.ORQ_KEK_V1.
 *  - DEK (Data Encryption Key): 32 bytes per row, generated with crypto.randomBytes.
 *  - AES-256-GCM authenticated encryption for both DEK-wrap and payload.
 *  - AAD (`user_id:provider:slot`) binds ciphertext to the owner row.
 *
 * Envelope JSON:
 *   { v:1, kek_id:'ORQ_KEK_V1', alg:'AES-256-GCM',
 *     dek_wrap:{iv,tag,ct}, payload:{iv,tag,ct}, aad:<string> }
 *
 * A dump of the Supabase database alone CANNOT be decrypted — the KEK lives
 * outside the DB trust boundary (Vercel env). Conversely, the KEK alone is
 * useless without the vault ciphertext.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';

const ALG = 'aes-256-gcm';
const KEK_BYTES = 32;
const IV_BYTES = 12;
const DEK_BYTES = 32;

const kekCache = new Map(); // kek_id -> Buffer(32)

function loadKek(kekId) {
  if (kekCache.has(kekId)) return kekCache.get(kekId);
  const raw = process.env[kekId];
  if (!raw) {
    throw new Error(`KEK_MISSING: environment variable ${kekId} is not set`);
  }
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    throw new Error(`KEK_INVALID: ${kekId} is not valid base64`);
  }
  if (buf.length !== KEK_BYTES) {
    throw new Error(`KEK_INVALID: ${kekId} must decode to ${KEK_BYTES} bytes (got ${buf.length})`);
  }
  kekCache.set(kekId, buf);
  return buf;
}

function getActiveKekId() {
  return process.env.ORQ_KEK_ACTIVE || 'ORQ_KEK_V1';
}

function b64(buf) {
  return Buffer.from(buf).toString('base64');
}
function fromB64(s) {
  return Buffer.from(s, 'base64');
}

function encryptPart(key, plaintextBuf, aad) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: b64(iv), tag: b64(tag), ct: b64(ct) };
}

function decryptPart(key, part, aad) {
  const decipher = createDecipheriv(ALG, key, fromB64(part.iv));
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(fromB64(part.tag));
  return Buffer.concat([decipher.update(fromB64(part.ct)), decipher.final()]);
}

/**
 * Encrypt plaintext into an envelope JSON string.
 * @param {{plaintext: string, aad: string, kekId?: string}} opts
 * @returns {{envelope: string, maskedPreview: string, fingerprint: string, keyLength: number, kekId: string}}
 */
export function encryptEnvelope({ plaintext, aad, kekId }) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('ENCRYPT_INVALID_INPUT: plaintext must be a non-empty string');
  }
  if (typeof aad !== 'string' || aad.length === 0) {
    throw new Error('ENCRYPT_INVALID_AAD: aad must be a non-empty string');
  }
  const activeKekId = kekId || getActiveKekId();
  const kek = loadKek(activeKekId);

  const dek = randomBytes(DEK_BYTES);
  const dekWrap = encryptPart(kek, dek, aad);
  const payload = encryptPart(dek, Buffer.from(plaintext, 'utf8'), aad);

  const envelope = JSON.stringify({
    v: 1,
    kek_id: activeKekId,
    alg: 'AES-256-GCM',
    dek_wrap: dekWrap,
    payload,
    aad,
  });

  // Zero the DEK buffer — best-effort, JS gives no guarantees.
  dek.fill(0);

  return {
    envelope,
    maskedPreview: maskKey(plaintext),
    fingerprint: fingerprintKey(plaintext),
    keyLength: plaintext.length,
    kekId: activeKekId,
  };
}

/**
 * Decrypt an envelope JSON string. Throws on AAD mismatch, tampered ciphertext,
 * or missing/wrong KEK.
 * @param {string} envelopeJson
 * @param {{expectedAad: string}} opts
 * @returns {{plaintext: string, kekId: string}}
 */
export function decryptEnvelope(envelopeJson, { expectedAad }) {
  let env;
  try {
    env = JSON.parse(envelopeJson);
  } catch {
    throw new Error('ENVELOPE_INVALID_JSON');
  }
  if (!env || env.v !== 1 || env.alg !== 'AES-256-GCM') {
    throw new Error('ENVELOPE_UNSUPPORTED_VERSION');
  }
  if (typeof expectedAad === 'string' && env.aad !== expectedAad) {
    throw new Error('ENVELOPE_AAD_MISMATCH');
  }
  const kek = loadKek(env.kek_id);

  let dek;
  try {
    dek = decryptPart(kek, env.dek_wrap, env.aad);
  } catch {
    throw new Error('ENVELOPE_DEK_UNWRAP_FAILED');
  }

  let plaintext;
  try {
    plaintext = decryptPart(dek, env.payload, env.aad).toString('utf8');
  } catch {
    throw new Error('ENVELOPE_PAYLOAD_DECRYPT_FAILED');
  } finally {
    dek.fill(0);
  }

  return { plaintext, kekId: env.kek_id };
}

/** Mask a key for display: first 7 + last 4, dots in the middle. */
export function maskKey(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed.length <= 11) return '•'.repeat(Math.max(4, trimmed.length));
  return `${trimmed.slice(0, 7)}•••••${trimmed.slice(-4)}`;
}

/** SHA-256 fingerprint (hex, first 32 chars) for dup-detect. Not reversible. */
export function fingerprintKey(raw) {
  return createHash('sha256').update(String(raw || ''), 'utf8').digest('hex').slice(0, 32);
}

/** Stable AAD builder. */
export function buildAad(userId, provider, slot = 'default') {
  return `${userId}:${provider}:${slot}`;
}
