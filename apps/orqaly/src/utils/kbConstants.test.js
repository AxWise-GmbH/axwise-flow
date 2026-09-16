import { describe, it, expect } from 'vitest';
import { docToType } from './kbConstants.js';

describe('docToType', () => {
  it('maps phone and mail contacts', () => {
    expect(docToType({ contact_type: 'phone' })).toBe('Phone Contact');
    expect(docToType({ contact_type: 'mail' })).toBe('Mail Contact');
    expect(docToType({ metadata: { contact_type: 'email' } })).toBe('Mail Contact');
  });

  it('maps github offers', () => {
    expect(docToType({ category: 'github-offer' })).toBe('Github offers');
    expect(docToType({ tags: ['github-offer'] })).toBe('Github offers');
  });

  it('maps bookmarks (link docs under category bookmark)', () => {
    expect(docToType({ content_type: 'link', category: 'bookmark' })).toBe('Bookmarks');
    expect(docToType({ content_type: 'link', tags: ['bookmark'] })).toBe('Bookmarks');
  });

  it('classifies an agent-owned bookmark as Bookmarks, not Agent Memory', () => {
    // owner_type 'agent' would otherwise map to Agent Memory — the bookmark
    // branch must win for link docs tagged 'bookmark'.
    expect(
      docToType({ content_type: 'link', category: 'bookmark', owner_type: 'agent' })
    ).toBe('Bookmarks');
  });

  it('keeps github-offer links as Github offers, not Bookmarks', () => {
    expect(docToType({ content_type: 'link', category: 'github-offer' })).toBe('Github offers');
  });

  it('maps reports', () => {
    expect(docToType({ category: 'agent-report' })).toBe('Reports');
    expect(docToType({ category: 'goal-report' })).toBe('Reports');
  });

  it('maps agent memory', () => {
    expect(docToType({ owner_type: 'agent' })).toBe('Agent Memory');
    expect(docToType({ category: 'job-memory' })).toBe('Agent Memory');
  });

  it('maps goals', () => {
    expect(docToType({ category: 'goal-plan' })).toBe('Goals');
    expect(docToType({ tags: ['goal'] })).toBe('Goals');
  });

  it('falls back to Documents', () => {
    expect(docToType({ category: 'general' })).toBe('Documents');
    expect(docToType({})).toBe('Documents');
    expect(docToType(null)).toBe('Documents');
  });
});
