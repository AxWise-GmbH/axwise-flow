import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readLandingVariant, writeLandingVariant } from './landingVariant';

describe('landingVariant', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to full when nothing is stored', () => {
    expect(readLandingVariant()).toBe('full');
  });

  it('round-trips a written variant', () => {
    writeLandingVariant('simple');
    expect(readLandingVariant()).toBe('simple');
  });

  it('normalizes unexpected stored values to full', () => {
    window.localStorage.setItem('orqaly_landing_variant', 'not-a-real-variant');
    expect(readLandingVariant()).toBe('full');
  });

  it('read does not throw when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => readLandingVariant()).not.toThrow();
    expect(readLandingVariant()).toBe('full');
    spy.mockRestore();
  });

  it('write does not throw when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => writeLandingVariant('simple')).not.toThrow();
    spy.mockRestore();
  });
});
