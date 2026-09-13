import { describe, it, expect } from 'vitest';
import { assistantEntityTarget } from './assistantEntityTarget.js';

describe('assistantEntityTarget', () => {
  it('sends a goal to the detail dialog rather than a route', () => {
    expect(assistantEntityTarget({ type: 'goal', entityId: 'g1', route: '/goals/g1' })).toEqual({
      kind: 'goal',
      id: 'g1',
    });
  });

  it('routes any other entity that carries one', () => {
    expect(assistantEntityTarget({ type: 'workflow', deepLink: '/workflows/w1' })).toEqual({
      kind: 'route',
      route: '/workflows/w1',
    });
  });

  it('ignores a goal without an id and a non-app route', () => {
    expect(assistantEntityTarget({ type: 'goal' })).toBeNull();
    expect(assistantEntityTarget({ type: 'kb', route: 'https://example.com' })).toBeNull();
    expect(assistantEntityTarget(null)).toBeNull();
  });
});
