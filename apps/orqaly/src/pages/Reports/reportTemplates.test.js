import { describe, it, expect } from 'vitest';
import { validateTemplate, SECTION_TYPES } from './reportTemplates';

describe('validateTemplate', () => {
  const goodSection = { type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'KPIs' };

  it('accepts a well-formed template', () => {
    expect(validateTemplate({ name: 'My Report', sections: [goodSection] })).toEqual({ ok: true });
  });

  it('rejects a missing name', () => {
    const r = validateTemplate({ sections: [goodSection] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/name/i);
  });

  it('rejects when there are no sections', () => {
    expect(validateTemplate({ name: 'X', sections: [] }).ok).toBe(false);
  });

  it('rejects an unknown section type', () => {
    const r = validateTemplate({ name: 'X', sections: [{ type: 'pie-of-pie', dataKey: 'kpis' }] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown type/i);
  });

  it('rejects a section without a dataKey', () => {
    const r = validateTemplate({ name: 'X', sections: [{ type: SECTION_TYPES.KPI_GRID }] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/dataKey/i);
  });

  it('rejects non-object input', () => {
    expect(validateTemplate(null).ok).toBe(false);
    expect(validateTemplate('nope').ok).toBe(false);
  });
});
