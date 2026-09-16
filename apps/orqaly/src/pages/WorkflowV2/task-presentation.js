const STATUS_LABELS = {
  requested: 'Queued',
  queued: 'Queued',
  running: 'Working on your task',
  awaiting_gate_1: 'Needs your scope approval',
  awaiting_gate_2: 'Needs your plan approval',
  completed: 'Result ready',
  completed_with_evidence_gaps: 'Draft ready · verification needed',
  blocked: 'Blocked · review needed',
  failed: 'Task failed · review needed',
  cancelled: 'Task cancelled',
};

export function taskStatusLabel(status, evidenceReadiness) {
  if (['failed', 'cancelled', 'blocked'].includes(status)) return STATUS_LABELS[status];
  if (evidenceReadiness === 'blocked') return STATUS_LABELS.blocked;
  if (status === 'completed' && evidenceReadiness === 'ready_with_gaps') {
    return STATUS_LABELS.completed_with_evidence_gaps;
  }
  return STATUS_LABELS[status] || String(status || 'Status unavailable').replaceAll('_', ' ');
}

export function compactTaskTitle(value, maxLength = 120) {
  const text = String(value || 'Your task')
    .replace(/\s+/gu, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text
    .slice(0, maxLength - 1)
    .replace(/\s+\S*$/u, '')
    .trimEnd()}…`;
}

export function deliverableTitle(markdown, scope, fallback) {
  const heading = String(markdown || '').match(/^#{1,2}\s+(.+)$/mu)?.[1];
  return compactTaskTitle(heading || scope?.deliverables?.[0] || scope?.objective || fallback);
}

export function taskPlanSteps(tasks = [], stages = []) {
  // Stable topological order makes upstream work visible before synthesis, without
  // implying that independent tasks execute in sequence. Dependencies remain explicit.
  const remaining = [...tasks];
  const ordered = [];
  const done = new Set();
  while (remaining.length) {
    const ready = remaining.filter((task) =>
      (task.dependsOnStageKeys || []).every((key) => done.has(key))
    );
    if (!ready.length) {
      ordered.push(...remaining);
      break;
    }
    for (const task of ready) {
      ordered.push(task);
      done.add(task.stageKey);
      remaining.splice(remaining.indexOf(task), 1);
    }
  }
  return ordered.map((task) => {
    // Only the immutable stage ID establishes task progress; a reused title/key is not proof.
    const stage = stages.find((candidate) => candidate.id && candidate.id === task.stageId);
    return {
      ...task,
      status: stage?.status || 'not_reported',
      outputArtifact: stage?.outputArtifact || null,
      dependencies: (task.dependsOnStageKeys || []).map(
        (key) => tasks.find((candidate) => candidate.stageKey === key)?.title || key
      ),
    };
  });
}
