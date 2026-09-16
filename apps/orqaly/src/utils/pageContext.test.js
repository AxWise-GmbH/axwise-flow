import { describe, it, expect } from 'vitest';
import { computePageContext } from './pageContext.js';

describe('computePageContext', () => {
  it('parses path-segment entities', () => {
    expect(computePageContext({ pathname: '/goals/g-123', search: '' })).toMatchObject({ entityType: 'goal', entityId: 'g-123' });
    expect(computePageContext({ pathname: '/dashboards/d1', search: '' })).toMatchObject({ entityType: 'dashboard', entityId: 'd1' });
  });

  it('parses query-param entities', () => {
    expect(computePageContext({ pathname: '/workflow', search: '?id=w9' })).toMatchObject({ entityType: 'workflow', entityId: 'w9' });
    expect(computePageContext({ pathname: '/task-manager', search: '?taskId=t7' })).toMatchObject({ entityType: 'task', entityId: 't7' });
    expect(computePageContext({ pathname: '/pulses', search: '?id=p2' })).toMatchObject({ entityType: 'pulse', entityId: 'p2' });
    expect(computePageContext({ pathname: '/agent-hub', search: '?agentId=a5' })).toMatchObject({ entityType: 'agent', entityId: 'a5' });
  });

  it('returns the full route and no entity for plain pages', () => {
    const ctx = computePageContext({ pathname: '/dashboard', search: '' });
    expect(ctx.route).toBe('/dashboard');
    expect(ctx.entityType).toBe('');
    expect(ctx.entityId).toBe('');
  });

  it('is safe on empty input', () => {
    expect(computePageContext(null)).toMatchObject({ route: '', entityType: '', entityId: '' });
  });
});
