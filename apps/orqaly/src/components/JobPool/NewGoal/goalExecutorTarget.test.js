import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXECUTOR_PAYLOAD,
  executorPayloadForTarget,
  isScopedExecutorTarget,
} from './goalExecutorTarget';

describe('executorPayloadForTarget', () => {
  it('sends a goal with no target to the whole workspace', () => {
    expect(executorPayloadForTarget(null)).toEqual(DEFAULT_EXECUTOR_PAYLOAD);
    expect(executorPayloadForTarget({ type: 'organization', id: 'o1' })).toEqual(
      DEFAULT_EXECUTOR_PAYLOAD
    );
  });

  it('assigns a team directly', () => {
    expect(executorPayloadForTarget({ type: 'team', id: 't1' })).toEqual({
      executor_type: 'team',
      executor_id: 't1',
      concilium_id: null,
    });
  });

  // A lead is one agent, not the team behind them: 'team' would hand the goal
  // to the whole roster instead of the person picked.
  it('treats a team lead as a single agent', () => {
    expect(executorPayloadForTarget({ type: 'team_lead', id: 'lead1' })).toEqual({
      executor_type: 'agent',
      executor_id: 'lead1',
      concilium_id: null,
    });
  });

  it('routes a board through concilium_id, never executor_id', () => {
    expect(executorPayloadForTarget({ type: 'consilium', id: 'c1' })).toEqual({
      executor_type: 'consilium',
      executor_id: null,
      concilium_id: 'c1',
    });
  });

  // A type with no id would otherwise produce executor_type: 'team' with a null
  // executor_id, which the server accepts and silently runs org-wide.
  it('falls back to the workspace when the target is incomplete', () => {
    expect(executorPayloadForTarget({ type: 'team' })).toEqual(DEFAULT_EXECUTOR_PAYLOAD);
    expect(executorPayloadForTarget({ type: 'unknown', id: 'x' })).toEqual(
      DEFAULT_EXECUTOR_PAYLOAD
    );
  });

  it('knows when the goal is aimed narrower than the workspace', () => {
    expect(isScopedExecutorTarget(null)).toBe(false);
    expect(isScopedExecutorTarget({ type: 'agent', id: 'a1' })).toBe(true);
  });
});
