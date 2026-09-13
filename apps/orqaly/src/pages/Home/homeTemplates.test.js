import { describe, it, expect } from 'vitest';
import {
  HOME_BLOCK_IDS,
  BUILTIN_HOME_TEMPLATES,
  templateMatches,
  groupBlockRows,
} from './homeTemplates';

const byId = (id) => BUILTIN_HOME_TEMPLATES.find((t) => t.id === id);

describe('built-in home templates', () => {
  it('Advanced matches the drawn structure (Key Stats hidden, two paired rows)', () => {
    const adv = byId('builtin:default');
    expect(adv.name).toBe('Advanced');
    const visible = adv.order.filter((id) => !adv.hidden.includes(id));
    expect(visible).toEqual([
      'org_structure',
      'consilium',
      'activity',
      'communicator',
      'performance',
      'goals',
      'loops',
      'data_ops',
      'llm_usage',
    ]);
    expect(adv.hidden).toEqual(['org_metrics']);
    expect(adv.widths).toEqual(['activity', 'communicator', 'goals', 'loops']);
    // Rows match the wireframe: full, full, paired, full, paired, full, full.
    const rows = groupBlockRows(
      visible.map((id) => ({ id })),
      new Set(adv.widths)
    );
    expect(rows.map((r) => r.map((s) => s.id))).toEqual([
      ['org_structure'],
      ['consilium'],
      ['activity', 'communicator'],
      ['performance'],
      ['goals', 'loops'],
      ['data_ops'],
      ['llm_usage'],
    ]);
  });

  it('Beginner pairs Goals in Action | Activity then stacks Performance, LLM Usage, Data Operations', () => {
    const beginner = byId('builtin:beginner');
    const visible = beginner.order.filter((id) => !beginner.hidden.includes(id));
    expect(visible).toEqual(['goals', 'activity', 'performance', 'llm_usage', 'data_ops']);
    // Goals in Action + Activity render side by side (half width).
    expect(beginner.widths).toEqual(['goals', 'activity']);
    // Loops from Agents and Communicator are split off and hidden in Beginner.
    expect([...beginner.hidden].sort()).toEqual([
      'communicator',
      'consilium',
      'loops',
      'org_metrics',
      'org_structure',
    ]);
  });

  it('every built-in order references only real block ids and covers them all', () => {
    for (const tpl of BUILTIN_HOME_TEMPLATES) {
      expect([...tpl.order].sort()).toEqual([...HOME_BLOCK_IDS].sort());
      for (const h of tpl.hidden) expect(HOME_BLOCK_IDS).toContain(h);
      for (const w of tpl.widths) expect(HOME_BLOCK_IDS).toContain(w);
    }
  });
});

describe('groupBlockRows', () => {
  const defs = (ids) => ids.map((id) => ({ id }));

  it('pairs two consecutive half-width blocks into one row', () => {
    const rows = groupBlockRows(
      defs(['goals', 'activity', 'performance']),
      new Set(['goals', 'activity'])
    );
    expect(rows.map((r) => r.map((s) => s.id))).toEqual([['goals', 'activity'], ['performance']]);
  });

  it('a full block breaks a pending half into its own row', () => {
    const rows = groupBlockRows(
      defs(['goals', 'performance', 'activity']),
      new Set(['goals', 'activity'])
    );
    expect(rows.map((r) => r.map((s) => s.id))).toEqual([['goals'], ['performance'], ['activity']]);
  });

  it('a lone trailing half becomes its own row', () => {
    const rows = groupBlockRows(defs(['performance', 'goals']), new Set(['goals']));
    expect(rows.map((r) => r.map((s) => s.id))).toEqual([['performance'], ['goals']]);
  });

  it('all full width when the width set is empty (Default layout)', () => {
    const rows = groupBlockRows(defs(['goals', 'loops', 'activity', 'communicator']), new Set());
    expect(rows.map((r) => r.map((s) => s.id))).toEqual([
      ['goals'],
      ['loops'],
      ['activity'],
      ['communicator'],
    ]);
  });

  it('reproduces the Beginner wireframe rows', () => {
    const beginner = byId('builtin:beginner');
    const visible = defs(beginner.order.filter((id) => !beginner.hidden.includes(id)));
    const rows = groupBlockRows(visible, new Set(beginner.widths));
    expect(rows.map((r) => r.map((s) => s.id))).toEqual([
      ['goals', 'activity'],
      ['performance'],
      ['llm_usage'],
      ['data_ops'],
    ]);
  });
});

describe('templateMatches', () => {
  const beginner = byId('builtin:beginner');
  const widths = new Set(beginner.widths);

  it('matches when hidden, order and widths are identical', () => {
    expect(templateMatches(beginner, new Set(beginner.hidden), beginner.order, widths)).toBe(true);
  });

  it('ignores hidden-set ordering', () => {
    const reversed = new Set([...beginner.hidden].reverse());
    expect(templateMatches(beginner, reversed, beginner.order, widths)).toBe(true);
  });

  it('does not match when a block is differently hidden', () => {
    expect(templateMatches(beginner, new Set([]), beginner.order, widths)).toBe(false);
  });

  it('does not match when the order differs', () => {
    const swapped = [...beginner.order];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(templateMatches(beginner, new Set(beginner.hidden), swapped, widths)).toBe(false);
  });

  it('does not match when widths differ', () => {
    expect(templateMatches(beginner, new Set(beginner.hidden), beginner.order, new Set())).toBe(
      false
    );
  });

  it('returns false for a nullish template', () => {
    expect(templateMatches(null, new Set(), [], new Set())).toBe(false);
  });
});
