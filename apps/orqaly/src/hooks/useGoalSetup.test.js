import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  getGoalSetup,
  resetGoalSetup,
  setGoalSetupOrg,
  setGoalSetupTarget,
  useGoalSetup,
} from './useGoalSetup';

describe('useGoalSetup', () => {
  beforeEach(() => resetGoalSetup());

  it('starts with no workspace and no target', () => {
    const { result } = renderHook(() => useGoalSetup());
    expect(result.current).toEqual({ orgId: null, target: null });
  });

  it('publishes a picked workspace to every reader', () => {
    const { result } = renderHook(() => useGoalSetup());
    act(() => setGoalSetupOrg('org-1'));
    expect(result.current.orgId).toBe('org-1');
    expect(getGoalSetup().orgId).toBe('org-1');
  });

  // A team belongs to one workspace, so a target that outlived the switch would
  // send the goal to a team the new workspace does not have.
  it('drops the target when the workspace changes', () => {
    const { result } = renderHook(() => useGoalSetup());
    act(() => setGoalSetupOrg('org-1'));
    act(() => setGoalSetupTarget({ type: 'team', id: 't1', label: 'Team: Ops' }));
    act(() => setGoalSetupOrg('org-2'));
    expect(result.current.target).toBeNull();
  });

  it('keeps the target when the same workspace is set again', () => {
    const { result } = renderHook(() => useGoalSetup());
    act(() => setGoalSetupOrg('org-1'));
    act(() => setGoalSetupTarget({ type: 'team', id: 't1', label: 'Team: Ops' }));
    act(() => setGoalSetupOrg('org-1'));
    expect(result.current.target).toMatchObject({ type: 'team', id: 't1' });
  });

  it('treats the whole workspace as no target at all', () => {
    const { result } = renderHook(() => useGoalSetup());
    act(() => setGoalSetupTarget({ type: 'organization', id: 'org-1' }));
    expect(result.current.target).toBeNull();
  });

  it('clears everything on reset, for a sign-out', () => {
    act(() => setGoalSetupOrg('org-1'));
    act(() => setGoalSetupTarget({ type: 'agent', id: 'a1' }));
    act(() => resetGoalSetup());
    expect(getGoalSetup()).toEqual({ orgId: null, target: null });
  });
});
