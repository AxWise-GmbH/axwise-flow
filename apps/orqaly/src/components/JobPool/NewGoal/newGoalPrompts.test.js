import { describe, expect, it } from 'vitest';
import { buildManualReviewFallback, formatAiError } from './newGoalPrompts';

describe('formatAiError', () => {
  it('turns a missing BYOK key into an actionable instruction', () => {
    // The generic "timed out" this replaced sent people looking at their
    // network instead of their API key settings.
    const message = formatAiError('BYOK_REQUIRED: this user has no LLM API key configured.');
    expect(message).toMatch(/Connect an LLM API key/i);
    expect(message).toMatch(/Settings/);
    expect(message).not.toMatch(/timed out/i);
  });

  it('names the specific environment variable that is missing', () => {
    expect(formatAiError('Missing GROQ_API_KEY')).toContain('GROQ_API_KEY');
    expect(formatAiError('OPENAI_API_KEY not configured')).toContain('OPENAI_API_KEY');
  });

  it('reassures that answers survive a timeout', () => {
    expect(formatAiError('Job timed out waiting for result')).toMatch(/answers are preserved/i);
  });

  it('explains a rate limit as something to wait out', () => {
    expect(formatAiError('429 Rate limit exceeded')).toMatch(/Wait a moment/i);
  });

  it('passes an unrecognized message through rather than swallowing it', () => {
    expect(formatAiError('Upstream exploded')).toBe('Upstream exploded');
  });

  it('offers manual entry when there is no message at all', () => {
    expect(formatAiError(null)).toMatch(/manual entry/i);
  });
});

describe('buildManualReviewFallback', () => {
  it('keeps the whole intake when analysis is unavailable', () => {
    const fallback = buildManualReviewFallback({
      goal: 'Launch a pricing page',
      challenges: 'No designer',
      timeline: '2 weeks',
      details: 'Must work on mobile',
    });

    expect(fallback.title).toBe('Launch a pricing page');
    // Nothing the user typed may be dropped on the fallback path.
    expect(fallback.requirements).toContain('No designer');
    expect(fallback.requirements).toContain('2 weeks');
    expect(fallback.requirements).toContain('Must work on mobile');
  });

  it('does not invent a deliverable it has no basis for', () => {
    const fallback = buildManualReviewFallback({ goal: 'Launch a pricing page' });
    expect(fallback.expectedResults).toBe('Launch a pricing page');
    expect(fallback.category).toBe('other');
    expect(fallback.priority).toBe('medium');
  });

  it('caps the title and takes it from the first meaningful line', () => {
    const fallback = buildManualReviewFallback({ goal: `\n\nFirst line\nSecond line` });
    expect(fallback.title).toBe('First line');
    expect(buildManualReviewFallback({ goal: 'x'.repeat(300) }).title).toHaveLength(100);
  });

  it('degrades to a placeholder rather than an empty title', () => {
    expect(buildManualReviewFallback({}).title).toBe('Untitled request');
  });
});
