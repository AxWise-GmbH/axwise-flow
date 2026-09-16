import { describe, it, expect } from 'vitest';
import { deriveFacetOptions, mergeFacetOptions } from './facetOptions';

describe('deriveFacetOptions', () => {
  it('returns distinct scalar values sorted A-Z', () => {
    const items = [
      { provider: 'groq' },
      { provider: 'anthropic' },
      { provider: 'groq' },
      { provider: 'openai' },
    ];
    expect(deriveFacetOptions(items, 'provider')).toEqual([
      { value: 'anthropic', label: 'anthropic' },
      { value: 'groq', label: 'groq' },
      { value: 'openai', label: 'openai' },
    ]);
  });

  it('skips null / undefined / empty scalar values', () => {
    const items = [{ status: 'online' }, { status: '' }, { status: null }, {}];
    expect(deriveFacetOptions(items, 'status')).toEqual([
      { value: 'online', label: 'online' },
    ]);
  });

  it('unions array members across items when array=true', () => {
    const items = [
      { tags: ['a', 'b'] },
      { tags: ['b', 'c'] },
      { tags: [] },
      { tags: null },
      {},
    ];
    expect(deriveFacetOptions(items, 'tags', { array: true })).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
      { value: 'c', label: 'c' },
    ]);
  });

  it('coerces non-string members to strings', () => {
    const items = [{ tags: [1, 2] }, { tags: [2] }];
    expect(deriveFacetOptions(items, 'tags', { array: true })).toEqual([
      { value: '1', label: '1' },
      { value: '2', label: '2' },
    ]);
  });

  it('handles empty / missing input gracefully', () => {
    expect(deriveFacetOptions(undefined, 'x')).toEqual([]);
    expect(deriveFacetOptions([], 'x')).toEqual([]);
  });
});

describe('mergeFacetOptions', () => {
  it('overlays config label and color, config wins', () => {
    const derived = [
      { value: 'prompt-engineering', label: 'prompt-engineering' },
      { value: 'code-dev', label: 'code-dev' },
    ];
    const config = [
      { value: 'prompt-engineering', label: 'Prompt Engineering', color: '#7C3AED' },
    ];
    expect(mergeFacetOptions(derived, config)).toEqual([
      { value: 'prompt-engineering', label: 'Prompt Engineering', color: '#7C3AED' },
      { value: 'code-dev', label: 'code-dev' },
    ]);
  });

  it('retains derived-only values not present in config', () => {
    const derived = [{ value: 'x', label: 'x' }];
    expect(mergeFacetOptions(derived, [])).toEqual([{ value: 'x', label: 'x' }]);
  });

  it('handles missing config', () => {
    const derived = [{ value: 'x', label: 'x' }];
    expect(mergeFacetOptions(derived)).toEqual([{ value: 'x', label: 'x' }]);
  });
});
