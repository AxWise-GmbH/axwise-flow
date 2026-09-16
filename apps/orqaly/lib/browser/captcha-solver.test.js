import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: vi.fn(),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), startTimer: () => () => {} }),
}));

import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { solveRecaptcha, solveHcaptcha, detectCaptcha } from './captcha-solver.js';

function mockJsonResponse(body) {
  return { ok: true, json: () => Promise.resolve(body) };
}

describe('captcha-solver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('solveRecaptcha', () => {
    it('submits and polls for solution', async () => {
      fetchWithRetry
        .mockResolvedValueOnce(mockJsonResponse({ status: 1, request: 'TASK-123' })) // submit
        .mockResolvedValueOnce(mockJsonResponse({ status: 0, request: 'CAPCHA_NOT_READY' })) // poll 1
        .mockResolvedValueOnce(mockJsonResponse({ status: 1, request: 'TOKEN-SOLVED', cost: '0.003' })); // poll 2

      const promise = solveRecaptcha('site-key', 'https://example.com', 'api-key');
      // Advance past both poll delays (2 × 5000ms)
      await vi.advanceTimersByTimeAsync(5000);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result.token).toBe('TOKEN-SOLVED');
      expect(fetchWithRetry).toHaveBeenCalledTimes(3);
    });

    it('throws on submit failure', async () => {
      fetchWithRetry.mockResolvedValueOnce(mockJsonResponse({ status: 0, request: 'ERROR_WRONG_USER_KEY' }));
      await expect(solveRecaptcha('sk', 'url', 'bad-key')).rejects.toThrow('2Captcha submit failed');
    });

    it('throws on missing params', async () => {
      await expect(solveRecaptcha('', 'url', 'key')).rejects.toThrow('Missing siteKey');
    });
  });

  describe('solveHcaptcha', () => {
    it('submits with hcaptcha method', async () => {
      fetchWithRetry
        .mockResolvedValueOnce(mockJsonResponse({ status: 1, request: 'HC-TASK' }))
        .mockResolvedValueOnce(mockJsonResponse({ status: 1, request: 'HC-TOKEN' }));

      const promise = solveHcaptcha('hc-site-key', 'https://site.com', 'api-key');
      await vi.advanceTimersByTimeAsync(5000);
      const result = await promise;
      expect(result.token).toBe('HC-TOKEN');

      // Verify submit used hcaptcha method
      const submitUrl = fetchWithRetry.mock.calls[0][0];
      expect(submitUrl).toContain('method=hcaptcha');
    });
  });

  describe('detectCaptcha', () => {
    it('detects reCAPTCHA v2 from class and data-sitekey', () => {
      const html = '<div class="g-recaptcha" data-sitekey="6Le-test"></div>';
      const result = detectCaptcha(html);
      expect(result.type).toBe('recaptcha');
      expect(result.siteKey).toBe('6Le-test');
    });

    it('detects hCaptcha from class and data-sitekey', () => {
      const html = '<div class="h-captcha" data-sitekey="hc-key-123"></div>';
      const result = detectCaptcha(html);
      expect(result.type).toBe('hcaptcha');
      expect(result.siteKey).toBe('hc-key-123');
    });

    it('detects reCAPTCHA from script src', () => {
      const html = '<script src="https://www.google.com/recaptcha/api.js?render=6Le-render-key"></script>';
      const result = detectCaptcha(html);
      expect(result.type).toBe('recaptcha_v3');
      expect(result.siteKey).toBe('6Le-render-key');
    });

    it('returns null for no CAPTCHA', () => {
      const result = detectCaptcha('<form><input type="text"></form>');
      expect(result.type).toBeNull();
      expect(result.siteKey).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(detectCaptcha('')).toEqual({ type: null, siteKey: null });
      expect(detectCaptcha(null)).toEqual({ type: null, siteKey: null });
    });
  });
});
