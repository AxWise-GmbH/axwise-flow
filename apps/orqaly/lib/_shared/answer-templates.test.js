import { describe, it, expect } from 'vitest';
import { ANSWER_TEMPLATES, getAnswerTemplate } from './answer-templates.js';
import { validateSlots } from './structured-llm.js';

describe('answer-templates', () => {
  it('exposes the brief template with a self-consistent schema and few-shot', () => {
    const t = getAnswerTemplate('brief');
    expect(t).toBeTruthy();
    expect(Object.keys(t.schema)).toEqual(['overview', 'focus_areas', 'risks', 'next_steps']);
    // Every few-shot output must itself satisfy the schema.
    for (const ex of t.fewShot) {
      const parsed = JSON.parse(ex.output);
      expect(validateSlots(t.schema, parsed).valid).toBe(true);
    }
  });

  it('renders deterministic markdown with every section', () => {
    const t = getAnswerTemplate('brief');
    const { title, content } = t.render({
      overview: 'Two initiatives are in flight.',
      focus_areas: ['Ship the landing page', 'Sustain growth'],
      risks: ['Landing page may be stalled'],
      next_steps: ['Confirm owner', 'Review spend'],
    });
    expect(title).toBe('Business brief');
    expect(content).toContain('## Overview');
    expect(content).toContain('Two initiatives are in flight.');
    expect(content).toContain('## Current Focus');
    expect(content).toContain('- Ship the landing page');
    expect(content).toContain('## Risks');
    expect(content).toContain('- Landing page may be stalled');
    expect(content).toContain('## Next Steps');
    expect(content).toContain('- Review spend');
    // Same input -> byte-identical output.
    const again = t.render({
      overview: 'Two initiatives are in flight.',
      focus_areas: ['Ship the landing page', 'Sustain growth'],
      risks: ['Landing page may be stalled'],
      next_steps: ['Confirm owner', 'Review spend'],
    });
    expect(again.content).toBe(content);
  });

  it('drops empty and whitespace-only bullet items', () => {
    const t = getAnswerTemplate('brief');
    const { content } = t.render({
      overview: 'x',
      focus_areas: ['Real item', '', '   '],
      risks: [],
      next_steps: ['Do it'],
    });
    expect(content).toContain('- Real item');
    expect(content).not.toMatch(/-\s*$/m); // no empty bullet line
  });

  it('returns null for an unknown kind', () => {
    expect(getAnswerTemplate('nope')).toBeNull();
    expect(getAnswerTemplate()).toBeNull();
  });

  it('registry object is exported for enumeration', () => {
    expect(ANSWER_TEMPLATES.brief.kind).toBe('brief');
  });
});
