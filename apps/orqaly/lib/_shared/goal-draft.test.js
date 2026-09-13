import { describe, it, expect } from 'vitest';
import { draftGoalCreateArgs, DEFAULT_GOAL_TITLE } from './goal-draft.js';

describe('draftGoalCreateArgs', () => {
  it('fills every field and reports them all as draft when the model states nothing', () => {
    const { args, draftFields } = draftGoalCreateArgs({});
    expect(args.title).toBe(DEFAULT_GOAL_TITLE);
    expect(args.budget_usd).toBe(10);
    expect(args.complexity).toBe('simple');
    expect(draftFields).toEqual(['title', 'budget_usd', 'complexity']);
  });

  it('derives a short title from the description and marks only the title as draft', () => {
    const { args, draftFields } = draftGoalCreateArgs({
      description: 'Build a landing page for the investor deck that converts visitors into calls',
      budget_usd: 25,
      complexity: 'simple',
    });
    expect(args.title.length).toBeLessThanOrEqual(61);
    expect(args.title.startsWith('Build a landing page')).toBe(true);
    expect(args.budget_usd).toBe(25);
    expect(draftFields).toEqual(['title']);
  });

  it('keeps a short description intact as the title without truncating it', () => {
    const { args } = draftGoalCreateArgs({ description: 'Ship the pricing page' });
    expect(args.title).toBe('Ship the pricing page');
  });

  it('leaves stated arguments alone and reports no drafts', () => {
    const { args, draftFields } = draftGoalCreateArgs({
      title: 'Q3 revenue push',
      description: 'Grow MRR',
      budget_usd: 40,
      complexity: 'medium',
    });
    expect(args.title).toBe('Q3 revenue push');
    expect(args.budget_usd).toBe(40);
    expect(args.complexity).toBe('complex'); // medium normalizes to complex
    expect(draftFields).toEqual([]);
  });

  it('treats an unusable budget as a draft default', () => {
    expect(draftGoalCreateArgs({ budget_usd: 'lots' }).args.budget_usd).toBe(10);
    expect(draftGoalCreateArgs({ budget_usd: 'lots' }).draftFields).toContain('budget_usd');
  });

  it('accepts the budget alias the bridge already supported', () => {
    const { args, draftFields } = draftGoalCreateArgs({ title: 'x', budget: 5 });
    expect(args.budget_usd).toBe(5);
    expect(draftFields).not.toContain('budget_usd');
  });

  it('passes unrelated arguments through untouched', () => {
    const { args } = draftGoalCreateArgs({ title: 'x', tool_mode: 'no_tools', org_id: 'o1' });
    expect(args.tool_mode).toBe('no_tools');
    expect(args.org_id).toBe('o1');
  });
});
