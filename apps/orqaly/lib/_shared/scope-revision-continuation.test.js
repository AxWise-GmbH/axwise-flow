import { describe, expect, it } from 'vitest';

import {
  pendingScopeRevisionToken,
  scopeRevisionContinuationPayload,
} from './scope-revision-continuation.js';

describe('scope revision continuation binding', () => {
  it('distinguishes no pending rebuild from a malformed pending rebuild', () => {
    expect(pendingScopeRevisionToken({ data: {} })).toBeUndefined();
    expect(scopeRevisionContinuationPayload({ data: {} })).toEqual({});

    const malformed = {
      data: { scope_revision: { status: 'pending_rebuild', revision_token: '   ' } },
    };
    expect(pendingScopeRevisionToken(malformed)).toBeNull();
    expect(scopeRevisionContinuationPayload(malformed)).toEqual({});
  });

  it('propagates the exact non-empty pending rebuild token', () => {
    const goal = {
      data: {
        scope_revision: {
          status: 'pending_rebuild',
          revision_token: 'revision-current',
        },
      },
    };

    expect(pendingScopeRevisionToken(goal)).toBe('revision-current');
    expect(scopeRevisionContinuationPayload(goal)).toEqual({
      scope_revision_token: 'revision-current',
    });
  });
});
