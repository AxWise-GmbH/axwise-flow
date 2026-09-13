import { describe, it, expect } from 'vitest';
import { staggerSx } from './stagger';

describe('staggerSx', () => {
  it('returns the homeRowIn animation with a per-index delay when in view', () => {
    const sx = staggerSx(3, true, { step: 50, base: 0 });
    expect(sx.animation).toContain('homeRowIn');
    expect(sx.animationDelay).toBe('150ms');
    expect(sx.opacity).toBeUndefined();
  });

  it('honors base and step options', () => {
    expect(staggerSx(0, true, { step: 60, base: 100 }).animationDelay).toBe('100ms');
    expect(staggerSx(2, true, { step: 60, base: 100 }).animationDelay).toBe('220ms');
  });

  it('holds children hidden (opacity 0) until the container is in view', () => {
    const sx = staggerSx(1, false);
    expect(sx.opacity).toBe(0);
    expect(sx.animation).toBeUndefined();
  });

  it('caps the effective index for long lists via max', () => {
    // index 40 with default max 16 → delay capped at 16*50ms = 800ms
    expect(staggerSx(40, true, { step: 50 }).animationDelay).toBe('800ms');
    expect(staggerSx(40, true, { step: 50, max: 10 }).animationDelay).toBe('500ms');
  });

  it('always carries a reduced-motion branch that disables the animation', () => {
    const reduced = staggerSx(5, true)['@media (prefers-reduced-motion: reduce)'];
    expect(reduced).toEqual({ animation: 'none', opacity: 1, transform: 'none' });
  });
});
