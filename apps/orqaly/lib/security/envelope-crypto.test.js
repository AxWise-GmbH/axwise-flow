/**
 * Roundtrip and tamper tests for envelope-crypto.
 * Uses a deterministic test KEK set in beforeAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  encryptEnvelope,
  decryptEnvelope,
  maskKey,
  fingerprintKey,
  buildAad,
} from './envelope-crypto.js';

const SAVED_ENV = {};

beforeAll(() => {
  SAVED_ENV.ORQ_KEK_V1 = process.env.ORQ_KEK_V1;
  SAVED_ENV.ORQ_KEK_ACTIVE = process.env.ORQ_KEK_ACTIVE;
  process.env.ORQ_KEK_V1 = randomBytes(32).toString('base64');
  process.env.ORQ_KEK_ACTIVE = 'ORQ_KEK_V1';
});

afterAll(() => {
  if (SAVED_ENV.ORQ_KEK_V1 === undefined) delete process.env.ORQ_KEK_V1;
  else process.env.ORQ_KEK_V1 = SAVED_ENV.ORQ_KEK_V1;
  if (SAVED_ENV.ORQ_KEK_ACTIVE === undefined) delete process.env.ORQ_KEK_ACTIVE;
  else process.env.ORQ_KEK_ACTIVE = SAVED_ENV.ORQ_KEK_ACTIVE;
});

describe('envelope-crypto', () => {
  const aad = buildAad('user-abc', 'llm:openai');

  it('roundtrips plaintext', () => {
    const { envelope } = encryptEnvelope({ plaintext: 'sk-proj-abcdef123456', aad });
    const { plaintext } = decryptEnvelope(envelope, { expectedAad: aad });
    expect(plaintext).toBe('sk-proj-abcdef123456');
  });

  it('produces mask + fingerprint + keyLength', () => {
    const out = encryptEnvelope({ plaintext: 'sk-proj-abcdef123456wXyZ', aad });
    expect(out.maskedPreview).toBe('sk-proj•••••wXyZ');
    expect(out.fingerprint).toHaveLength(32);
    expect(out.keyLength).toBe(24);
  });

  it('rejects AAD mismatch', () => {
    const { envelope } = encryptEnvelope({ plaintext: 'sk-abc', aad });
    expect(() =>
      decryptEnvelope(envelope, { expectedAad: buildAad('user-xyz', 'llm:openai') }),
    ).toThrow(/ENVELOPE_AAD_MISMATCH/);
  });

  it('rejects tampered payload ciphertext', () => {
    const { envelope } = encryptEnvelope({ plaintext: 'sk-abc', aad });
    const parsed = JSON.parse(envelope);
    const ctBuf = Buffer.from(parsed.payload.ct, 'base64');
    ctBuf[0] ^= 0xff;
    parsed.payload.ct = ctBuf.toString('base64');
    expect(() =>
      decryptEnvelope(JSON.stringify(parsed), { expectedAad: aad }),
    ).toThrow(/ENVELOPE_PAYLOAD_DECRYPT_FAILED/);
  });

  it('rejects tampered DEK wrap', () => {
    const { envelope } = encryptEnvelope({ plaintext: 'sk-abc', aad });
    const parsed = JSON.parse(envelope);
    const wrapBuf = Buffer.from(parsed.dek_wrap.ct, 'base64');
    wrapBuf[0] ^= 0xff;
    parsed.dek_wrap.ct = wrapBuf.toString('base64');
    expect(() =>
      decryptEnvelope(JSON.stringify(parsed), { expectedAad: aad }),
    ).toThrow(/ENVELOPE_DEK_UNWRAP_FAILED/);
  });

  it('rejects unsupported version', () => {
    const { envelope } = encryptEnvelope({ plaintext: 'sk-abc', aad });
    const parsed = JSON.parse(envelope);
    parsed.v = 999;
    expect(() =>
      decryptEnvelope(JSON.stringify(parsed), { expectedAad: aad }),
    ).toThrow(/ENVELOPE_UNSUPPORTED_VERSION/);
  });

  it('rejects missing KEK', () => {
    const parsed = JSON.parse(
      encryptEnvelope({ plaintext: 'sk-abc', aad }).envelope,
    );
    parsed.kek_id = 'ORQ_KEK_NONEXISTENT';
    expect(() =>
      decryptEnvelope(JSON.stringify(parsed), { expectedAad: aad }),
    ).toThrow(/KEK_MISSING/);
  });

  it('rejects empty plaintext / aad', () => {
    expect(() => encryptEnvelope({ plaintext: '', aad })).toThrow(/ENCRYPT_INVALID_INPUT/);
    expect(() => encryptEnvelope({ plaintext: 'sk', aad: '' })).toThrow(/ENCRYPT_INVALID_AAD/);
  });

  it('maskKey handles short strings safely', () => {
    expect(maskKey('abc')).toBe('••••');
    expect(maskKey('abcdefghijk')).toBe('•••••••••••');
    expect(maskKey('abcdefghijkl')).toBe('abcdefg•••••ijkl');
  });

  it('fingerprintKey is deterministic and hides plaintext', () => {
    const a = fingerprintKey('sk-secret');
    const b = fingerprintKey('sk-secret');
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
    expect(a).not.toContain('sk-secret');
  });
});
