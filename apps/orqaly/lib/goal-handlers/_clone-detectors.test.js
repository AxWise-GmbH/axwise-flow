/**
 * Tests for URL-clone goal detectors. Pure functions, no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import {
  isCloneRestyleGoal,
  isMultiSourceCloneGoal,
  extractUrls,
  goalTextOf,
  LANDING_PAGE_PATTERN,
  hasUnnegatedKeywordMatch,
} from './_clone-detectors.js';

describe('hasUnnegatedKeywordMatch', () => {
  const codePattern = /\b(api client|github repo|cli)\b/i;

  it('ignores explicitly negated legacy code keywords', () => {
    expect(
      hasUnnegatedKeywordMatch('Do not build an API client or GitHub repo.', codePattern)
    ).toBe(false);
  });

  it('keeps a separate positive request after a negated clause', () => {
    expect(
      hasUnnegatedKeywordMatch('Do not build an API client; instead create a CLI.', codePattern)
    ).toBe(true);
  });
});

describe('LANDING_PAGE_PATTERN', () => {
  it('does not classify a commercial conversion funnel as a web surface', () => {
    expect(
      LANDING_PAGE_PATTERN.test(
        'Define the Bremen conversion funnel, KPIs, measurement methodology, and risk matrix.'
      )
    ).toBe(false);
  });

  it.each([
    'Build an affiliate funnel for an iGaming offer',
    'Create a landing page for the Bremen campaign',
    'Design the pre-lander for the launch',
    'Publish a sales page for the new package',
  ])('preserves explicit landing-page surface detection: %s', (text) => {
    expect(LANDING_PAGE_PATTERN.test(text)).toBe(true);
  });
});

describe('extractUrls', () => {
  it('extracts explicit https URLs', () => {
    expect(extractUrls('Check https://stripe.com/connect for inspiration')).toEqual([
      'https://stripe.com/connect',
    ]);
  });

  it('extracts bare domains and prefixes https', () => {
    expect(extractUrls('Clone linear.app for me')).toEqual(['https://linear.app']);
  });

  it('extracts multiple URLs and dedupes', () => {
    const result = extractUrls('Read https://acme.com and acme.com and https://other.io');
    expect(result).toContain('https://acme.com');
    expect(result).toContain('https://other.io');
    expect(result).toHaveLength(2);
  });

  it('strips trailing punctuation', () => {
    expect(extractUrls('Visit https://stripe.com, then https://linear.app.')).toEqual([
      'https://stripe.com',
      'https://linear.app',
    ]);
  });

  it('returns empty array for text without URLs', () => {
    expect(extractUrls('Build me a landing page for a coffee shop')).toEqual([]);
  });
});

describe('goalTextOf', () => {
  it('handles string input', () => {
    expect(goalTextOf('foo bar')).toBe('foo bar');
  });

  it('joins title + description from goal row', () => {
    expect(goalTextOf({ title: 'foo', description: 'bar' })).toBe('foo bar');
  });

  it('handles missing description', () => {
    expect(goalTextOf({ title: 'foo' })).toBe('foo');
  });

  it('returns empty for nullish input', () => {
    expect(goalTextOf(null)).toBe('');
    expect(goalTextOf(undefined)).toBe('');
  });
});

describe('isCloneRestyleGoal', () => {
  it('detects a single-page clone with restyle keyword', () => {
    expect(
      isCloneRestyleGoal({
        title: 'Clone stripe.com/connect as a landing page',
        description: 'Use a new brand color and rebrand to Trellix',
      })
    ).toBe(true);
  });

  it('detects a clone via hex color override (no explicit restyle word)', () => {
    expect(
      isCloneRestyleGoal({
        title: 'Build a landing page based on https://linear.app',
        description: 'Primary color #7C3AED for the new brand',
      })
    ).toBe(true);
  });

  it('detects an affiliate / aggregate clone', () => {
    expect(
      isCloneRestyleGoal({
        title: 'Review the whole site at https://example.com and make an affiliate landing page',
        description: 'Use our brand colors',
      })
    ).toBe(true);
  });

  it('rejects when no URL is present', () => {
    expect(
      isCloneRestyleGoal({
        title: 'Make a landing page for a coffee shop',
        description: 'Use brand color #7C3AED',
      })
    ).toBe(false);
  });

  it('rejects when no landing-page keyword is present', () => {
    expect(
      isCloneRestyleGoal({
        title: 'Clone the database schema from https://example.com',
        description: 'Same style but new brand',
      })
    ).toBe(false);
  });

  it('rejects plain landing-page goals with a URL but no restyle intent', () => {
    expect(
      isCloneRestyleGoal({
        title: 'Build a landing page',
        description: 'See https://stripe.com for reference. Audience: developers.',
      })
    ).toBe(false);
  });

  it('rejects a commercial conversion-funnel document even with a comparison URL', () => {
    expect(
      isCloneRestyleGoal({
        title: 'Define a Bremen conversion funnel and KPI framework',
        description: 'Compare https://example.com and use our new brand terminology.',
      })
    ).toBe(false);
  });

  it('handles string input directly', () => {
    expect(
      isCloneRestyleGoal('Clone https://stripe.com landing page with new brand color #FF6600')
    ).toBe(true);
  });

  it('respects an explicit instruction not to clone a referenced website', () => {
    expect(
      isCloneRestyleGoal({
        title: 'Plan an Estonia campaign based on https://example.com website market signals',
        description:
          'Do not clone this website or build a landing page. Use our brand terminology.',
      })
    ).toBe(false);
  });

  it('keeps a distinct positive restyle instruction after a negated clause', () => {
    expect(
      isCloneRestyleGoal(
        'Do not clone https://old.example.com landing page; instead rebuild it with our brand.'
      )
    ).toBe(true);
  });
});

describe('isMultiSourceCloneGoal', () => {
  it('detects multi-page intent from "whole site"', () => {
    expect(
      isMultiSourceCloneGoal({
        title: 'Review the whole site https://example.com and make a landing page in our brand',
        description: 'Affiliate page',
      })
    ).toBe(true);
  });

  it('detects multi-page from "all pages" keyword', () => {
    expect(
      isMultiSourceCloneGoal({
        title: 'Aggregate all pages from https://docs.example.com into one affiliate landing page',
        description: 'New brand color #7C3AED',
      })
    ).toBe(true);
  });

  it('detects multi-page from multiple URLs', () => {
    expect(
      isMultiSourceCloneGoal({
        title: 'Clone landing page combining https://a.com and https://b.com',
        description: 'Use brand color #1E40AF',
      })
    ).toBe(true);
  });

  it('returns false for a single-URL clone goal', () => {
    expect(
      isMultiSourceCloneGoal({
        title: 'Clone landing page https://stripe.com/connect',
        description: 'Use brand color #7C3AED',
      })
    ).toBe(false);
  });

  it('returns false if not a clone goal at all', () => {
    expect(
      isMultiSourceCloneGoal({
        title: 'Build a landing page for a coffee shop',
        description: 'Audience: developers',
      })
    ).toBe(false);
  });
});
