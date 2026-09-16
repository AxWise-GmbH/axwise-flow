import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_EVENT_TYPES } from '../../shared/workflow-v2/contracts.js';
import { WORKFLOW_TRANSITION_EVENT_TYPES } from './state-machine.js';
import {
  WORKFLOW_ACTIVITY_STAGE_KINDS,
  WORKFLOW_REMOTE_STAGE_KINDS,
  WORKFLOW_TRANSITION_CELLS,
} from './transition-table.js';

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function coveredStageKinds(eventType) {
  return sorted(new Set(
    WORKFLOW_TRANSITION_CELLS
      .filter((cell) => cell.eventType === eventType)
      .flatMap((cell) => cell.eligible.stageKinds)
      .filter((kind) => kind !== '*')
  ));
}

describe('workflow v2 transition-table completeness', () => {
  it('dispatches and documents every typed event with no extra event authority', () => {
    const typed = sorted(WORKFLOW_EVENT_TYPES);
    const dispatched = sorted(WORKFLOW_TRANSITION_EVENT_TYPES);
    const documented = sorted(new Set(
      WORKFLOW_TRANSITION_CELLS.map((cell) => cell.eventType)
    ));

    expect(dispatched).toEqual(typed);
    expect(documented).toEqual(typed);
  });

  it('covers every eligible activity kind, lifecycle state, and deterministic branch', () => {
    const activityKinds = sorted(WORKFLOW_ACTIVITY_STAGE_KINDS);
    const remoteKinds = sorted(WORKFLOW_REMOTE_STAGE_KINDS);

    expect(coveredStageKinds('ActivityStarted')).toEqual(activityKinds);
    expect(coveredStageKinds('ActivityCompleted')).toEqual(activityKinds);
    expect(coveredStageKinds('ActivityFailed')).toEqual(activityKinds);
    expect(coveredStageKinds('LeaseExpired')).toEqual(activityKinds);
    for (const eventType of [
      'ActivityDeferred',
      'ActivityDispatchAmbiguous',
      'ActivityRedispatchRequested',
    ]) {
      expect(coveredStageKinds(eventType)).toEqual(remoteKinds);
    }

    const completionBranches = Object.fromEntries(
      WORKFLOW_ACTIVITY_STAGE_KINDS.map((kind) => [
        kind,
        sorted(new Set(
          WORKFLOW_TRANSITION_CELLS
            .filter(
              (cell) =>
                cell.eventType === 'ActivityCompleted' &&
                cell.eligible.stageKinds.includes(kind)
            )
            .map((cell) => cell.eligible.branch || 'default')
        )),
      ])
    );
    expect(completionBranches).toEqual({
      compile_scope: ['default'],
      execute_research: ['blocked_report', 'ready', 'ready_with_gaps'],
      planning: ['default'],
      execution: ['execution_successors_remain', 'last_execution_stage'],
      evaluation: ['output_contract_satisfied', 'output_contract_unsatisfied'],
      synthesis: ['default'],
    });

    expect(
      sorted(
        WORKFLOW_TRANSITION_CELLS
          .filter((cell) => cell.eventType === 'ActivityFailed')
          .map((cell) => cell.eligible.branch)
      )
    ).toEqual(['nonretryable_or_limit_reached', 'retryable_below_limit']);
    expect(
      sorted(
        WORKFLOW_TRANSITION_CELLS
          .filter((cell) => cell.eventType === 'LeaseExpired')
          .map((cell) => cell.eligible.attemptStatuses.join(','))
      )
    ).toEqual(['polling', 'running']);
    expect(
      sorted(
        WORKFLOW_TRANSITION_CELLS
          .filter((cell) => cell.eventType === 'ApprovalGranted')
          .map((cell) => cell.eligible.branch)
      )
    ).toEqual(['exact_idempotent_duplicate', 'plan', 'scope']);
  });

  it('keeps the human transition table in exact cell-for-cell sync with machine metadata', () => {
    const markdown = readFileSync('docs/workflow-v2/TRANSITION_TABLE.md', 'utf8');
    const rows = [...markdown.matchAll(/^\| `([^`]+)` \| [^|\n]* \| `([^`]+)` \|/gmu)]
      .map((match) => ({ id: match[1], eventType: match[2] }));
    const expected = WORKFLOW_TRANSITION_CELLS.map(({ id, eventType }) => ({ id, eventType }));

    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows).toEqual(expected);
  });
});
