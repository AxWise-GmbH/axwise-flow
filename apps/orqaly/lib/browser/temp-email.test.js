import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/fetch.js', () => ({
  fetchWithRetry: vi.fn(),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), startTimer: () => () => {} }),
}));

import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createEmail, checkInbox, readMessage, extractVerificationLink } from './temp-email.js';

function mockJsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 400, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

describe('temp-email', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('createEmail', () => {
    it('creates email with domain, account, and token calls', async () => {
      fetchWithRetry
        .mockResolvedValueOnce(mockJsonResponse({ 'hydra:member': [{ domain: 'test.tm' }] }))
        .mockResolvedValueOnce(mockJsonResponse({ id: 'acc-1' }))
        .mockResolvedValueOnce(mockJsonResponse({ token: 'jwt-123' }));

      const result = await createEmail();
      expect(result.address).toMatch(/@test\.tm$/);
      expect(result.token).toBe('jwt-123');
      expect(result.password).toBeTruthy();
      expect(fetchWithRetry).toHaveBeenCalledTimes(3);
    });

    it('throws when no domains available', async () => {
      fetchWithRetry.mockResolvedValueOnce(mockJsonResponse({ 'hydra:member': [] }));
      await expect(createEmail()).rejects.toThrow('No email domains available');
    });

    it('throws when account creation fails', async () => {
      fetchWithRetry
        .mockResolvedValueOnce(mockJsonResponse({ 'hydra:member': [{ domain: 'test.tm' }] }))
        .mockResolvedValueOnce(mockJsonResponse({}, false));
      await expect(createEmail()).rejects.toThrow('Failed to create email account');
    });
  });

  describe('checkInbox', () => {
    it('returns mapped messages', async () => {
      fetchWithRetry.mockResolvedValueOnce(mockJsonResponse({
        'hydra:member': [{ id: 'msg-1', from: { address: 'a@b.com' }, subject: 'Verify', intro: 'Click here' }],
      }));
      const msgs = await checkInbox('jwt-123');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe('msg-1');
      expect(msgs[0].from).toBe('a@b.com');
      expect(msgs[0].subject).toBe('Verify');
    });

    it('returns empty array on failure', async () => {
      fetchWithRetry.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
      const msgs = await checkInbox('jwt');
      expect(msgs).toEqual([]);
    });

    it('throws when token is missing', async () => {
      await expect(checkInbox('')).rejects.toThrow('Missing email token');
    });
  });

  describe('readMessage', () => {
    it('returns message body', async () => {
      fetchWithRetry.mockResolvedValueOnce(mockJsonResponse({
        subject: 'Welcome', text: 'Hello!', html: ['<p>Hello!</p>'],
      }));
      const msg = await readMessage('jwt', 'msg-1');
      expect(msg.subject).toBe('Welcome');
      expect(msg.text).toBe('Hello!');
      expect(msg.html).toBe('<p>Hello!</p>');
    });

    it('throws on missing params', async () => {
      await expect(readMessage('', 'msg')).rejects.toThrow('Missing token or messageId');
    });
  });

  describe('extractVerificationLink', () => {
    it('extracts href link near verify keyword', () => {
      const html = '<a href="https://example.com/verify?token=abc123">Click to verify</a>';
      expect(extractVerificationLink(html)).toBe('https://example.com/verify?token=abc123');
    });

    it('extracts confirm link', () => {
      const html = '<p>Please <a href="https://app.io/confirm/xyz">confirm your email</a></p>';
      expect(extractVerificationLink(html)).toBe('https://app.io/confirm/xyz');
    });

    it('returns null when no verification link', () => {
      const html = '<a href="https://example.com/about">About us</a>';
      expect(extractVerificationLink(html)).toBeNull();
    });

    it('returns null for empty body', () => {
      expect(extractVerificationLink('')).toBeNull();
      expect(extractVerificationLink(null)).toBeNull();
    });

    it('finds plain text URLs near keywords', () => {
      const text = 'To activate your account visit https://service.io/activate/abc123 now.';
      expect(extractVerificationLink(text)).toBe('https://service.io/activate/abc123');
    });
  });
});
