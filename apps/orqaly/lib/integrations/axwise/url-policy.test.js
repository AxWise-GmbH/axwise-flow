import { describe, expect, it } from 'vitest';
import { isProductionLikeRuntime, normalizeAxwiseApiUrl } from './url-policy.js';

describe('AxWise API URL policy', () => {
  it('normalizes the configured base URL', () => {
    expect(normalizeAxwiseApiUrl('https://axwise.example/api/')).toBe('https://axwise.example/api');
  });

  it('allows localhost only for local development', () => {
    expect(normalizeAxwiseApiUrl('http://127.0.0.1:8791/api', { env: {} })).toBe(
      'http://127.0.0.1:8791/api'
    );
    expect(() =>
      normalizeAxwiseApiUrl('http://127.0.0.1:8791/api', {
        env: { VERCEL: '1', VERCEL_ENV: 'production' },
      })
    ).toThrow(/HTTPS|loopback/);
  });

  it('rejects private HTTPS destinations in Preview and Production', () => {
    for (const url of [
      'https://localhost/api',
      'https://10.1.2.3/api',
      'https://172.16.0.5/api',
      'https://192.168.1.2/api',
      'https://[::1]/api',
    ]) {
      expect(() => normalizeAxwiseApiUrl(url, { env: { VERCEL_ENV: 'preview' } })).toThrow(
        /loopback or a private network/
      );
    }
  });

  it('recognizes production-like runtimes', () => {
    expect(isProductionLikeRuntime({ VERCEL_ENV: 'production' })).toBe(true);
    expect(isProductionLikeRuntime({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(isProductionLikeRuntime({ NODE_ENV: 'production' })).toBe(true);
    expect(isProductionLikeRuntime({})).toBe(false);
  });
});
