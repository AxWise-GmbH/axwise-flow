import { describe, it, expect } from 'vitest';
import { showsViewToggle } from './kbViewToggle';

describe('showsViewToggle', () => {
  it('hides the cards/table toggle on tabs that render their own content', () => {
    for (const tab of ['sources', 'monitor', 'github-offers', 'phone-contacts', 'mail-contacts']) {
      expect(showsViewToggle(tab)).toBe(false);
    }
  });

  it('shows the toggle when browsing a document category', () => {
    for (const tab of ['all', 'documents', 'goals', 'memory', 'reports']) {
      expect(showsViewToggle(tab)).toBe(true);
    }
  });
});
