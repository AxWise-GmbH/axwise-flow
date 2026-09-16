import { describe, expect, it } from 'vitest';
import { fmtCriterion, goalResultSummary } from './_goalFormat';

describe('fmtCriterion', () => {
  it('renders structured criteria without object coercion', () => {
    expect(fmtCriterion({ phase: 0, test: 'Define three Bremen SMB ICPs' })).toBe(
      'Define three Bremen SMB ICPs'
    );
  });

  it('keeps unknown primitive fields readable', () => {
    expect(fmtCriterion({ owner_role: 'GDPR Lead', required: true })).toBe(
      'owner role: GDPR Lead · required: true'
    );
  });
});

describe('goalResultSummary', () => {
  it('reads back the summary the board wrote', () => {
    expect(
      goalResultSummary({ data: { project_overview: { summary: '  A five sentence brief.  ' } } })
    ).toBe('A five sentence brief.');
  });

  it('never repeats the server own failure sentence at the user', () => {
    const goal = {
      data: {
        project_overview: {
          summary: 'Project Overview generation failed - see Work Log tab for raw deliverables.',
        },
      },
    };
    expect(goalResultSummary(goal)).toBeNull();
  });

  it('is null when there is no overview at all', () => {
    expect(goalResultSummary({ data: {} })).toBeNull();
    expect(goalResultSummary(null)).toBeNull();
  });
});
