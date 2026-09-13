import { afterEach, describe, expect, it } from 'vitest';
import { getAppUrl } from './stripe-connect.js';

const ORIGINAL_ENV = { ...process.env };

describe('getAppUrl', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('prefers VITE_APP_URL even when VERCEL_URL is also set', () => {
    process.env.VITE_APP_URL = 'https://orchestratori.orqaly.com';
    process.env.VERCEL_URL = 'orchestratori-abc123.vercel.app';
    expect(getAppUrl()).toBe('https://orchestratori.orqaly.com');
  });

  it('falls back to VERCEL_URL when VITE_APP_URL is unset', () => {
    delete process.env.VITE_APP_URL;
    process.env.VERCEL_URL = 'orchestratori-abc123.vercel.app';
    expect(getAppUrl()).toBe('https://orchestratori-abc123.vercel.app');
  });

  it('falls back to localhost when neither is set', () => {
    delete process.env.VITE_APP_URL;
    delete process.env.VERCEL_URL;
    expect(getAppUrl()).toBe('http://localhost:5176');
  });
});
