import { describe, it, expect } from 'vitest';
import {
  ASSISTANT_BLOCK_DEFS,
  ASSISTANT_BLOCK_IDS,
  ASSISTANT_TIER_H,
  ASSISTANT_BLOCK_SPAN,
  ASSISTANT_BLOCK_TIER,
  BUILTIN_ASSISTANT_TEMPLATES,
} from './assistantTemplates';
import { templateMatches } from '../../utils/blockTemplates';

describe('ASSISTANT_BLOCK_DEFS', () => {
  it('has unique ids', () => {
    expect(new Set(ASSISTANT_BLOCK_IDS).size).toBe(ASSISTANT_BLOCK_IDS.length);
  });

  it('gives every block a valid span and a known height tier', () => {
    for (const b of ASSISTANT_BLOCK_DEFS) {
      expect([1, 2, 'full']).toContain(b.span);
      expect(Object.keys(ASSISTANT_TIER_H)).toContain(b.tier);
      expect(b.label).toBeTruthy();
    }
  });

  it('matches the Beginner wireframe order', () => {
    expect(ASSISTANT_BLOCK_IDS).toEqual([
      'communication',
      'chat',
      'conversations',
      'usage',
      'profile',
      'channels',
      'voice',
      'brief',
      'arena',
      'data',
      'contacts',
      'insights',
      'team',
    ]);
  });

  it('sizes the structural blocks per the wireframe', () => {
    expect(ASSISTANT_BLOCK_SPAN.communication).toBe('full');
    expect(ASSISTANT_BLOCK_TIER.communication).toBe('tall');
    expect(ASSISTANT_BLOCK_SPAN.chat).toBe('full');
    expect(ASSISTANT_BLOCK_TIER.chat).toBe('strip');
    expect(ASSISTANT_BLOCK_SPAN.conversations).toBe(2);
    expect(ASSISTANT_BLOCK_TIER.conversations).toBe('xl');
    expect(ASSISTANT_BLOCK_TIER.usage).toBe('xl');
    expect(ASSISTANT_BLOCK_SPAN.team).toBe('full');
    expect(ASSISTANT_BLOCK_TIER.team).toBe('medium');
    expect(ASSISTANT_BLOCK_SPAN.brief).toBe('full');
    expect(ASSISTANT_BLOCK_TIER.brief).toBe('strip');
  });

  it('puts the control cards on a taller tier than the data cards', () => {
    for (const id of ['profile', 'channels', 'voice'])
      expect(ASSISTANT_BLOCK_TIER[id]).toBe('control');
    for (const id of ['data', 'contacts', 'insights'])
      expect(ASSISTANT_BLOCK_TIER[id]).toBe('short');
  });

  it('uses the adjusted tier heights', () => {
    expect(ASSISTANT_TIER_H.xl).toBe(442); // conversation history, usage
    expect(ASSISTANT_TIER_H.control).toBe(411); // profile/channels/voice (+10% from 374)
    expect(ASSISTANT_TIER_H.short).toBe(317); // data/contacts/insights
    expect(ASSISTANT_TIER_H.medium).toBe(370); // team comms
    expect(ASSISTANT_TIER_H.tall).toBe(340); // communication activity
    expect(ASSISTANT_TIER_H.strip).toBe(84);
  });
});

describe('BUILTIN_ASSISTANT_TEMPLATES', () => {
  const beginner = BUILTIN_ASSISTANT_TEMPLATES.find((t) => t.id === 'builtin:beginner');

  it('ships a single built-in "Beginner" preset showing every block', () => {
    expect(BUILTIN_ASSISTANT_TEMPLATES).toHaveLength(1);
    expect(beginner.name).toBe('Beginner');
    expect(beginner.builtin).toBe(true);
    expect(beginner.order).toEqual(ASSISTANT_BLOCK_IDS);
    expect(beginner.hidden).toEqual([]);
    expect(beginner.widths).toEqual([]);
  });

  it('is the active template for the default (untouched) layout', () => {
    expect(templateMatches(beginner, new Set(), ASSISTANT_BLOCK_IDS, new Set())).toBe(true);
  });
});
