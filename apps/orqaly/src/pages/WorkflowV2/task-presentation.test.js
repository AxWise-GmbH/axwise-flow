import { describe, expect, it } from 'vitest';
import {
  compactTaskTitle,
  deliverableTitle,
  taskPlanSteps,
  taskStatusLabel,
} from './task-presentation.js';

describe('Task-first presentation', () => {
  it('separates task outcome from settled stages and technical success', () => {
    expect(taskStatusLabel('completed_with_evidence_gaps')).toBe(
      'Draft ready · verification needed'
    );
    expect(taskStatusLabel('completed', 'ready_with_gaps')).toBe(
      'Draft ready · verification needed'
    );
    expect(taskStatusLabel('completed', 'blocked')).toBe('Blocked · review needed');
    expect(taskStatusLabel('failed', 'ready')).toBe('Task failed · review needed');
    expect(taskStatusLabel('awaiting_gate_2')).toBe('Needs your plan approval');
  });
  it('uses the actual document title and bounds repeated long task text', () => {
    expect(deliverableTitle('# Vendor-neutral checklist\n\nBody', {}, 'Long request')).toBe(
      'Vendor-neutral checklist'
    );
    expect(deliverableTitle('', { deliverables: ['Launch checklist'] }, 'Request')).toBe(
      'Launch checklist'
    );
    expect(compactTaskTitle('Very long task request '.repeat(100)).length).toBeLessThanOrEqual(120);
  });
  it('matches only exact task stage IDs and preserves true dependencies and outputs', () => {
    const tasks = [
      { stageId: 'a', stageKey: 'research', title: 'Research', dependsOnStageKeys: [] },
      { stageId: 'b', stageKey: 'review', title: 'Review', dependsOnStageKeys: ['research'] },
    ];
    const steps = taskPlanSteps(tasks, [
      { id: 'a', status: 'completed', outputArtifact: { artifactId: 'output' } },
      { id: 'old-b', stageKey: 'review', status: 'completed' },
    ]);
    expect(steps[0].status).toBe('completed');
    expect(steps[0].outputArtifact).toEqual({ artifactId: 'output' });
    expect(steps[1].status).toBe('not_reported');
    expect(steps[1].dependencies).toEqual(['Research']);
    expect(steps[1].outputArtifact).toBeNull();
    expect(taskPlanSteps([...tasks].reverse()).map((task) => task.title)).toEqual([
      'Research',
      'Review',
    ]);
  });
});
