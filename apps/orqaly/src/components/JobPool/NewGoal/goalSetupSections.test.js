import { describe, it, expect } from 'vitest';
import { GOAL_SETUP_SECTIONS } from './goalSetupSections';

const byKey = (key) => GOAL_SETUP_SECTIONS.find((section) => section.key === key);
const ctx = (over = {}) => ({ orgId: null, orgs: [], target: null, axwise: {}, ...over });

describe('GOAL_SETUP_SECTIONS', () => {
  it('asks the four decisions, in the order a goal is aimed', () => {
    expect(GOAL_SETUP_SECTIONS.map((s) => s.key)).toEqual(['org', 'board', 'workforce', 'axwise']);
    expect(GOAL_SETUP_SECTIONS.map((s) => s.title)).toEqual([
      'Organization',
      'Consilium',
      'Team or agent',
      'AxWise',
    ]);
  });

  it('gives every section an icon and something to read', () => {
    GOAL_SETUP_SECTIONS.forEach((section) => {
      expect(section.icon).toBeTruthy();
      expect(section.desc.length).toBeGreaterThan(20);
    });
  });

  it('marks only the workspace as required - a goal has to live somewhere', () => {
    expect(GOAL_SETUP_SECTIONS.filter((s) => s.required).map((s) => s.key)).toEqual(['org']);
  });
});

describe('done predicates', () => {
  it('org is settled once a real workspace is picked', () => {
    const org = byKey('org');
    expect(org.done(ctx())).toBe(false);
    expect(org.done(ctx({ orgId: 'o1', orgs: [{ id: 'o1' }] }))).toBe(true);
  });

  // The drawer already guards against this - an orgId left over from a
  // workspace the user no longer has must not read as a settled choice.
  it('org is unsettled when the stored workspace is no longer in the list', () => {
    expect(byKey('org').done(ctx({ orgId: 'gone', orgs: [{ id: 'o1' }] }))).toBe(false);
  });

  it('board is settled only when the goal is aimed at a board', () => {
    const board = byKey('board');
    expect(board.done(ctx())).toBe(false);
    expect(board.done(ctx({ target: { type: 'consilium', id: 'c1' } }))).toBe(true);
    expect(board.done(ctx({ target: { type: 'team', id: 't1' } }))).toBe(false);
  });

  it('workforce covers a team, a lead and a lone agent', () => {
    const workforce = byKey('workforce');
    ['team', 'team_lead', 'agent'].forEach((type) => {
      expect(workforce.done(ctx({ target: { type, id: 'x' } }))).toBe(true);
    });
    expect(workforce.done(ctx({ target: { type: 'consilium', id: 'c1' } }))).toBe(false);
    expect(workforce.done(ctx())).toBe(false);
  });

  // One target, so the goal is aimed at a board or at a team, never both.
  it('board and workforce are never both settled', () => {
    [{ type: 'consilium' }, { type: 'team' }, { type: 'agent' }].forEach((target) => {
      const both = byKey('board').done(ctx({ target })) && byKey('workforce').done(ctx({ target }));
      expect(both).toBe(false);
    });
  });

  it('axwise follows the overlay actually being on, not merely allowed', () => {
    const axwiseSection = byKey('axwise');
    expect(axwiseSection.done(ctx({ axwise: { isAxwiseEnabled: true } }))).toBe(true);
    expect(
      axwiseSection.done(ctx({ axwise: { serverEnabled: true, isAxwiseEnabled: false } }))
    ).toBe(false);
    expect(axwiseSection.done(ctx({ axwise: undefined }))).toBe(false);
  });
});
