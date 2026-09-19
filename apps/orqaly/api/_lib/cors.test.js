import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cors, getAllowedOrigins } from './cors.js';

function makeRes() {
  const headers = {};
  return {
    headers,
    setHeader: (k, v) => {
      headers[k] = v;
    },
  };
}

const ORIGINAL_ENV = { ...process.env };

describe('getAllowedOrigins', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('falls back to the built-in prod + localhost list when ALLOWED_ORIGINS is unset', () => {
    delete process.env.ALLOWED_ORIGINS;
    const origins = getAllowedOrigins();
    expect(origins).toContain('https://orqanix.com');
    expect(origins).toContain('https://www.orqanix.com');
    expect(origins).toContain('https://orchestratori.orqanix.com');
    expect(origins).toContain('https://orchestratori.vercel.app');
    expect(origins).toContain('http://localhost:5176');
  });

  it('uses ALLOWED_ORIGINS when set, splitting and trimming', () => {
    process.env.ALLOWED_ORIGINS = ' https://a.example.com , https://b.example.com';
    expect(getAllowedOrigins()).toEqual(['https://a.example.com', 'https://b.example.com']);
  });
});

describe('cors', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ALLOWED_ORIGINS;
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('reflects the origin back for orqaly.com in production', () => {
    const res = makeRes();
    cors(res, { headers: { origin: 'https://orqanix.com' } });
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://orqanix.com');
  });

  it('reflects the origin back for the app subdomain', () => {
    const res = makeRes();
    cors(res, { headers: { origin: 'https://orchestratori.orqanix.com' } });
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://orchestratori.orqanix.com');
  });

  it('rejects an unrecognized origin in production, falling back to the first allowed origin', () => {
    const res = makeRes();
    cors(res, { headers: { origin: 'https://evil.example.com' } });
    expect(res.headers['Access-Control-Allow-Origin']).not.toBe('https://evil.example.com');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://orqanix.com');
  });

  it('rejects localhost origins in production once ALLOWED_ORIGINS is set to prod-only (as Vercel prod is configured)', () => {
    process.env.ALLOWED_ORIGINS = 'https://orqanix.com,https://orchestratori.orqanix.com';
    const res = makeRes();
    cors(res, { headers: { origin: 'http://localhost:5176' } });
    expect(res.headers['Access-Control-Allow-Origin']).not.toBe('http://localhost:5176');
  });

  it('allows localhost origins outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.VERCEL_ENV;
    process.env.ALLOWED_ORIGINS = 'https://orqanix.com';
    const res = makeRes();
    cors(res, { headers: { origin: 'http://localhost:5176' } });
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5176');
  });
});