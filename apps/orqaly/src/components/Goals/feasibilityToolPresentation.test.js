import { describe, expect, it } from 'vitest';
import { getFeasibilityToolPresentation } from './feasibilityToolPresentation.js';

const reportWithToolSuggestions = {
  feasibility: {
    tool_availability: {
      available: ['browser'],
      missing: ['github'],
    },
  },
};

describe('getFeasibilityToolPresentation', () => {
  it('honors the persisted No Tools policy over feasibility suggestions', () => {
    const presentation = getFeasibilityToolPresentation(
      { data: { tool_mode: 'no_tools' } },
      reportWithToolSuggestions
    );

    expect(presentation.noToolsPolicy).toBe(true);
    expect(presentation.availableTools).toEqual([]);
    expect(presentation.missingTools).toEqual([]);
    expect(presentation.metric).toMatchObject({
      label: 'Tools',
      value: 'None needed',
      valueColor: '#10B981',
    });
    expect(presentation.metric.detail.lines.join(' ')).toContain('No Tools');
    expect(presentation.reportLines.join(' ')).toContain('TOOL POLICY: NO TOOLS');
    expect(presentation.reportLines.join(' ')).not.toContain('MISSING TOOLS');
  });

  it('preserves missing and available tool details for goals that allow tools', () => {
    const presentation = getFeasibilityToolPresentation(
      { data: { tool_mode: 'with_tools' } },
      reportWithToolSuggestions
    );

    expect(presentation.noToolsPolicy).toBe(false);
    expect(presentation.availableTools).toEqual(['browser']);
    expect(presentation.missingTools).toEqual(['github']);
    expect(presentation.metric).toMatchObject({
      label: 'Tools Missing',
      value: '1 missing',
      valueColor: '#F59E0B',
    });
    expect(presentation.metric.detail.lines.join(' ')).toContain('github');
    expect(presentation.reportLines).toContain('MISSING TOOLS: github');
  });

  it('reports no missing tools when an enabled goal has no missing requirements', () => {
    const presentation = getFeasibilityToolPresentation(
      { data: { tool_mode: 'existing_only' } },
      { feasibility: { tool_availability: { available: ['browser'], missing: [] } } }
    );

    expect(presentation.metric).toMatchObject({
      label: 'Tools Missing',
      value: 'None',
      valueColor: '#10B981',
    });
  });
});
