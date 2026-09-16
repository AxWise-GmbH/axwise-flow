import { describe, expect, it } from 'vitest';
import {
  ADVANCED_GOAL_MODE_DESCRIPTION,
  SMART_REQUEST_STRUCTURED_DESCRIPTION,
  SMART_REQUEST_STRUCTURED_TITLE,
} from './goalModeCopy.js';

describe('goal mode copy', () => {
  it('does not claim that planning, team review, or approval already happened at intake', () => {
    expect(SMART_REQUEST_STRUCTURED_TITLE).toBe('Request ready to create');
    expect(SMART_REQUEST_STRUCTURED_DESCRIPTION).toContain('happen in the goal workflow');
    expect(SMART_REQUEST_STRUCTURED_DESCRIPTION).not.toMatch(/assembled|approved|completed/i);
  });

  it('describes Consilium as optional and phase-scoped', () => {
    expect(ADVANCED_GOAL_MODE_DESCRIPTION).toContain('optional Consilium phase review');
    expect(ADVANCED_GOAL_MODE_DESCRIPTION).toContain('when a board is linked');
  });
});
