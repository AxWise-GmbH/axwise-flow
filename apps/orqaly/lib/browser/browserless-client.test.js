import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: vi.fn(),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), startTimer: () => () => {} }),
}));

import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { navigate, fillAndSubmit, click, extract, screenshot } from './browserless-client.js';

describe('browserless-client', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('navigate', () => {
    it('sends POST to /content with url', async () => {
      fetchWithRetry.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('<html>Hello</html>') });

      const result = await navigate('https://example.com', 'api-key');
      expect(result.html).toBe('<html>Hello</html>');
      expect(result.status).toBe(200);

      const [url] = fetchWithRetry.mock.calls[0];
      expect(url).toContain('/content?token=api-key');
    });

    it('passes waitForSelector option', async () => {
      fetchWithRetry.mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve('<html></html>') });

      await navigate('https://example.com', 'key', { waitForSelector: '#form' });
      const body = JSON.parse(fetchWithRetry.mock.calls[0][1].body);
      expect(body.waitForSelector.selector).toBe('#form');
    });

    it('throws on missing params', async () => {
      await expect(navigate('', 'key')).rejects.toThrow('Missing url or apiKey');
      await expect(navigate('url', '')).rejects.toThrow('Missing url or apiKey');
    });
  });

  describe('fillAndSubmit', () => {
    it('sends Puppeteer script to /function endpoint', async () => {
      fetchWithRetry.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ html: '<html>Success</html>', success: true }),
      });

      const result = await fillAndSubmit(
        'https://example.com/signup',
        [{ selector: '#email', value: 'test@test.com' }],
        'button[type="submit"]',
        'api-key',
      );
      expect(result.success).toBe(true);
      expect(result.html).toBe('<html>Success</html>');

      const [url, opts] = fetchWithRetry.mock.calls[0];
      expect(url).toContain('/function?token=api-key');
      const body = JSON.parse(opts.body);
      expect(body.code).toContain('#email');
      expect(body.code).toContain('test@test.com');
    });

    it('injects CAPTCHA token when provided', async () => {
      fetchWithRetry.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ html: '', success: true }),
      });

      await fillAndSubmit('https://x.com', [{ selector: '#e', value: 'v' }], 'button', 'key', 'captcha-token');
      const body = JSON.parse(fetchWithRetry.mock.calls[0][1].body);
      expect(body.code).toContain('captcha-token');
      expect(body.code).toContain('g-recaptcha-response');
    });

    it('returns error on HTTP failure', async () => {
      fetchWithRetry.mockResolvedValueOnce({
        ok: false, status: 500,
        text: () => Promise.resolve('Server error'),
      });

      const result = await fillAndSubmit('url', [{ selector: 'a', value: 'b' }], 'btn', 'key');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Browserless error');
    });

    it('throws on empty fields', async () => {
      await expect(fillAndSubmit('url', [], 'btn', 'key')).rejects.toThrow('No form fields');
    });
  });

  describe('click', () => {
    it('sends click script to /function', async () => {
      fetchWithRetry.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ html: '<html>Clicked</html>', success: true }),
      });

      const result = await click('https://x.com', '#btn', 'key');
      expect(result.success).toBe(true);
      const body = JSON.parse(fetchWithRetry.mock.calls[0][1].body);
      expect(body.code).toContain('#btn');
    });
  });

  describe('extract', () => {
    it('extracts text from selector', async () => {
      fetchWithRetry.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ text: 'API Key: sk-12345', success: true }),
      });

      const result = await extract('https://x.com/dashboard', '.api-key', 'key');
      expect(result.text).toBe('API Key: sk-12345');
      expect(result.success).toBe(true);
    });
  });

  describe('screenshot', () => {
    it('returns base64 PNG', async () => {
      const pngBuffer = Buffer.from('fake-png-data');
      fetchWithRetry.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(pngBuffer.buffer),
      });

      const result = await screenshot('https://x.com', 'key');
      expect(result.success).toBe(true);
      expect(result.base64).toBeTruthy();
    });

    it('returns failure on HTTP error', async () => {
      fetchWithRetry.mockResolvedValueOnce({ ok: false });
      const result = await screenshot('url', 'key');
      expect(result.success).toBe(false);
    });
  });
});
