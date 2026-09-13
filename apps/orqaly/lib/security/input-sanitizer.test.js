import { describe, it, expect } from 'vitest';
import { sanitizeText, severityOfFlag } from './input-sanitizer.js';

describe('sanitizeText — unicode hygiene', () => {
  it('returns cleaned text and no flags for plain ASCII', () => {
    const { cleaned, flags } = sanitizeText('OPENAI_API_KEY=sk-abc123\n');
    expect(cleaned).toBe('OPENAI_API_KEY=sk-abc123\n');
    expect(flags).toEqual([]);
  });

  it('strips BOM at start', () => {
    const { cleaned, flags } = sanitizeText('\uFEFFhello');
    expect(cleaned).toBe('hello');
    expect(flags).toContain('unicode:bom-stripped');
  });

  it('strips zero-width chars in the middle', () => {
    const { cleaned, flags } = sanitizeText('open\u200Bai\u200Cabc');
    expect(cleaned).toBe('openaiabc');
    expect(flags).toContain('unicode:zero-width-stripped');
  });

  it('strips RTL override (bidi control)', () => {
    const input = 'filename.\u202Egnp.exe';
    const { cleaned, flags } = sanitizeText(input);
    expect(cleaned).toBe('filename.gnp.exe');
    expect(flags).toContain('unicode:bidi-control-stripped');
    expect(severityOfFlag('unicode:bidi-control-stripped')).toBe('medium');
  });

  it('strips ASCII controls but keeps \\t \\n \\r', () => {
    const { cleaned, flags } = sanitizeText('foo\x00bar\tbaz\nqux\x07');
    expect(cleaned).toBe('foobar\tbaz\nqux');
    expect(flags).toContain('unicode:control-stripped');
  });

  it('flags mixed-script tokens (Latin + Cyrillic homoglyph)', () => {
    // Cyrillic 'а' (U+0430) mixed with Latin 'openai' → classic homoglyph
    const { flags } = sanitizeText('op\u0435nai_key=sk-a');
    expect(flags).toContain('unicode:mixed-script');
  });

  it('does not flag pure non-Latin text', () => {
    const { flags } = sanitizeText('Привет мир');
    expect(flags).not.toContain('unicode:mixed-script');
  });

  it('NFC-normalizes decomposed sequences', () => {
    const decomposed = 'cafe\u0301'; // 'cafe' + combining acute
    const { cleaned, flags } = sanitizeText(decomposed);
    expect(cleaned).toBe('café');
    expect(flags).toContain('unicode:nfc-normalized');
  });

  it('caps oversized input', () => {
    const huge = 'a'.repeat(200_000);
    const { cleaned, flags } = sanitizeText(huge, { maxLength: 100 });
    expect(cleaned.length).toBe(100);
    expect(flags).toContain('unicode:length-capped');
  });

  it('handles non-string input gracefully', () => {
    const { cleaned, flags } = sanitizeText(null);
    expect(cleaned).toBe('');
    expect(flags).toContain('unicode:non-string');
  });
});
