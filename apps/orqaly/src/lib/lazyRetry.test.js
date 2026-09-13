import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { loadWithRetry, isStaleModuleError, RELOAD_FLAG } from './lazyRetry';

const MODULE = { default: 'Page' };

// The real failure this guards: a dep re-optimize invalidated the ?v= hash the
// tab still holds, so the URL 404s and retrying it can never succeed.
const staleError = () =>
  new Error(
    'error loading dynamically imported module: http://localhost:5177/node_modules/.vite/deps/@mui_icons-material_ChecklistOutlined.js?v=f1642ab6'
  );

let reload;
const realSessionStorage = window.sessionStorage;

beforeEach(() => {
  vi.useFakeTimers();
  reload = vi.fn();
  // jsdom's window.location.reload is not writable; replace the whole object.
  delete window.location;
  window.location = { reload, assign: vi.fn(), href: 'http://localhost:5176/hub' };
  window.sessionStorage.clear();
});

afterEach(() => {
  // The private-mode test swaps sessionStorage out; put the real one back so it
  // cannot leak into later tests.
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: realSessionStorage,
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Retries sleep 1500ms, so drive fake timers to completion and then report how
// the promise actually settled — `state` stays 'pending' for the reload path,
// which deliberately never resolves.
async function settle(promise) {
  const result = { state: 'pending', ok: undefined, err: undefined };
  promise.then(
    (v) => {
      result.state = 'ok';
      result.ok = v;
    },
    (e) => {
      result.state = 'err';
      result.err = e;
    }
  );
  await vi.runAllTimersAsync();
  await Promise.resolve();
  return result;
}

describe('isStaleModuleError', () => {
  it('matches the Vite dev, Vite build, and Safari wordings', () => {
    expect(isStaleModuleError(staleError())).toBe(true);
    expect(
      isStaleModuleError(new Error('Failed to fetch dynamically imported module: /assets/x.js'))
    ).toBe(true);
    expect(isStaleModuleError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isStaleModuleError(new Error('boom'))).toBe(false);
    expect(isStaleModuleError(undefined)).toBe(false);
  });
});

describe('loadWithRetry', () => {
  it('resolves on first success without reloading', async () => {
    const importFn = vi.fn().mockResolvedValue(MODULE);

    await expect(loadWithRetry(importFn)).resolves.toBe(MODULE);

    expect(importFn).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries a transient failure and resolves', async () => {
    const importFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValue(MODULE);

    const result = await settle(loadWithRetry(importFn));

    expect(result.ok).toBe(MODULE);
    expect(importFn).toHaveBeenCalledTimes(3);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when a stale module error outlives the retries', async () => {
    const importFn = vi.fn().mockRejectedValue(staleError());

    const result = await settle(loadWithRetry(importFn));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(RELOAD_FLAG)).toBe('1');
    // Stays pending so ErrorBoundaryPage cannot flash mid-reload.
    expect(result.state).toBe('pending');
  });

  it('rethrows instead of looping when the tab already used its reload', async () => {
    window.sessionStorage.setItem(RELOAD_FLAG, '1');
    const importFn = vi.fn().mockRejectedValue(staleError());

    const result = await settle(loadWithRetry(importFn));

    expect(result.err).toBeInstanceOf(Error);
    expect(reload).not.toHaveBeenCalled();
  });

  it('rethrows a non-stale error without reloading', async () => {
    const importFn = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await settle(loadWithRetry(importFn));

    expect(result.err?.message).toBe('boom');
    expect(reload).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RELOAD_FLAG)).toBeNull();
  });

  it('clears the flag on success so a later stale chunk still self-heals', async () => {
    window.sessionStorage.setItem(RELOAD_FLAG, '1');

    await loadWithRetry(vi.fn().mockResolvedValue(MODULE));

    expect(window.sessionStorage.getItem(RELOAD_FLAG)).toBeNull();
  });

  it('rethrows rather than reloading when sessionStorage is unavailable', async () => {
    // jsdom's Storage proxy ignores vi.spyOn on its methods, so swap the whole
    // object to simulate private-mode Safari, where every access throws.
    const throwing = new Error('private mode');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw throwing;
        },
        setItem: () => {
          throw throwing;
        },
        removeItem: () => {
          throw throwing;
        },
      },
    });
    const importFn = vi.fn().mockRejectedValue(staleError());

    const result = await settle(loadWithRetry(importFn));

    // Cannot cap the loop without storage, so surface the original error.
    expect(result.err?.message).toMatch(/error loading dynamically imported module/);
    expect(reload).not.toHaveBeenCalled();
  });
});
