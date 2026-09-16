/**
 * Tests for resolvePostLoginRoute - decides where to navigate
 * the user after login based on cached/server UI mode.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { auth: {} },
  hasSupabase: () => false,
}));

vi.mock('../config/firebase', () => ({
  localAuth: {},
}));

const { resolvePostLoginRoute } = await import('./auth.js');

const SIMPLE_MODE_KEY = 'orchestratori_simple_mode';

beforeEach(() => {
  localStorage.clear();
});

describe('resolvePostLoginRoute', () => {
  it('returns /home when localStorage has simple=true and no fetchServerMode', async () => {
    localStorage.setItem(SIMPLE_MODE_KEY, 'true');
    const route = await resolvePostLoginRoute();
    expect(route).toBe('/home');
  });

  it('returns /home when localStorage has simple=false and no fetchServerMode (Home is the main page in both modes)', async () => {
    localStorage.setItem(SIMPLE_MODE_KEY, 'false');
    const route = await resolvePostLoginRoute();
    expect(route).toBe('/home');
  });

  it('prefers server simple over stale advanced localStorage on login', async () => {
    localStorage.setItem(SIMPLE_MODE_KEY, 'false');
    const fetchServerMode = vi.fn(async () => 'simple');
    const route = await resolvePostLoginRoute({ fetchServerMode });
    expect(route).toBe('/home');
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('true');
  });

  it('prefers server advanced over stale simple localStorage on login', async () => {
    localStorage.setItem(SIMPLE_MODE_KEY, 'true');
    const fetchServerMode = vi.fn(async () => 'advanced');
    const route = await resolvePostLoginRoute({ fetchServerMode });
    expect(route).toBe('/home');
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('false');
  });

  it('falls back to fetchServerMode when localStorage is empty', async () => {
    const fetchServerMode = vi.fn(async () => 'simple');
    const route = await resolvePostLoginRoute({ fetchServerMode });
    expect(route).toBe('/home');
    expect(fetchServerMode).toHaveBeenCalled();
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('true');
  });

  it('caches advanced to localStorage when server returns advanced', async () => {
    const fetchServerMode = vi.fn(async () => 'advanced');
    const route = await resolvePostLoginRoute({ fetchServerMode });
    expect(route).toBe('/home');
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('false');
  });

  it('defaults to /home when no cache and server returns null', async () => {
    const fetchServerMode = vi.fn(async () => null);
    const route = await resolvePostLoginRoute({ fetchServerMode });
    expect(route).toBe('/home');
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('true');
  });

  it('defaults to /home when no cache and no fetchServerMode supplied', async () => {
    const route = await resolvePostLoginRoute();
    expect(route).toBe('/home');
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('true');
  });

  it('defaults to /home when fetchServerMode throws', async () => {
    const fetchServerMode = vi.fn(async () => {
      throw new Error('network');
    });
    const route = await resolvePostLoginRoute({ fetchServerMode });
    expect(route).toBe('/home');
    expect(localStorage.getItem(SIMPLE_MODE_KEY)).toBe('true');
  });
});
