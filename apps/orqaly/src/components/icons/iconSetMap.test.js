import { describe, it, expect } from 'vitest';
import { resolveIconifyId, ICON_PHOSPHOR_MAP } from './iconSetMap';

describe('resolveIconifyId', () => {
  it('returns null for the default MUI set', () => {
    expect(resolveIconifyId('SmartToyOutlined', 'mui')).toBeNull();
  });

  it('returns null for an unmapped name', () => {
    expect(resolveIconifyId('TotallyUnknownIcon', 'outline')).toBeNull();
  });

  it('returns null when name or set is missing', () => {
    expect(resolveIconifyId('', 'outline')).toBeNull();
    expect(resolveIconifyId('SmartToyOutlined', '')).toBeNull();
  });

  it('maps the outline style to the Phosphor regular weight', () => {
    expect(resolveIconifyId('SmartToyOutlined', 'outline')).toBe('ph:robot');
    expect(resolveIconifyId('Close', 'outline')).toBe('ph:x');
  });

  it('maps the filled style to the Phosphor -fill weight', () => {
    expect(resolveIconifyId('SmartToyOutlined', 'filled')).toBe('ph:robot-fill');
    expect(resolveIconifyId('Close', 'filled')).toBe('ph:x-fill');
  });

  it('every map value is a non-empty kebab-case glyph string', () => {
    for (const [name, base] of Object.entries(ICON_PHOSPHOR_MAP)) {
      expect(typeof base, name).toBe('string');
      expect(base, name).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
