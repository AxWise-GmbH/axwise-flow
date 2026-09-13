/**
 * Tests for lib/integrations/axwise/config.js - the single source of truth for
 * whether AxWise is enabled (AXWISE_ENABLE env) and what enforcement mode is active
 * (AXWISE_ENFORCE).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('axwise/config', () => {
  // Snapshot the original env so we can restore it after every test.
  const originalEnable = process.env.AXWISE_ENABLE;
  const originalEnforce = process.env.AXWISE_ENFORCE;

  afterEach(() => {
    // Restore original state - assignment works because vitest process.env is writable.
    if (originalEnable === undefined) {
      delete process.env.AXWISE_ENABLE;
    } else {
      process.env.AXWISE_ENABLE = originalEnable;
    }
    if (originalEnforce === undefined) {
      delete process.env.AXWISE_ENFORCE;
    } else {
      process.env.AXWISE_ENFORCE = originalEnforce;
    }
  });

  describe('isAxwiseEnabled', () => {
    it('returns true when AXWISE_ENABLE="true"', async () => {
      process.env.AXWISE_ENABLE = 'true';
      // Re-import so the module reads the fresh env.
      const { isAxwiseEnabled } = await import('./config.js');
      expect(isAxwiseEnabled()).toBe(true);
    });

    it('returns false when AXWISE_ENABLE is unset', async () => {
      delete process.env.AXWISE_ENABLE;
      const { isAxwiseEnabled } = await import('./config.js');
      expect(isAxwiseEnabled()).toBe(false);
    });

    it('returns false when AXWISE_ENABLE="false"', async () => {
      process.env.AXWISE_ENABLE = 'false';
      const { isAxwiseEnabled } = await import('./config.js');
      expect(isAxwiseEnabled()).toBe(false);
    });

    it('returns false for any other value', async () => {
      process.env.AXWISE_ENABLE = '1';
      const { isAxwiseEnabled } = await import('./config.js');
      expect(isAxwiseEnabled()).toBe(false);
    });
  });

  describe('axwiseEnforcement', () => {
    it('defaults to "shadow" when AXWISE_ENFORCE is unset', async () => {
      delete process.env.AXWISE_ENFORCE;
      const { axwiseEnforcement } = await import('./config.js');
      expect(axwiseEnforcement()).toBe('shadow');
    });

    it('returns "shadow" when explicitly set', async () => {
      process.env.AXWISE_ENFORCE = 'shadow';
      const { axwiseEnforcement } = await import('./config.js');
      expect(axwiseEnforcement()).toBe('shadow');
    });

    it('returns "authoritative" when set', async () => {
      process.env.AXWISE_ENFORCE = 'authoritative';
      const { axwiseEnforcement } = await import('./config.js');
      expect(axwiseEnforcement()).toBe('authoritative');
    });

    it('returns whatever string is set (no validation)', async () => {
      process.env.AXWISE_ENFORCE = 'bogus';
      const { axwiseEnforcement } = await import('./config.js');
      expect(axwiseEnforcement()).toBe('bogus');
    });
  });
});
