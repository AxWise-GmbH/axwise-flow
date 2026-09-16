export function activeApproval(workflow) {
  const gate = workflow?.stages?.find(
    (stage) => ['gate_1', 'gate_2'].includes(stage.kind) && stage.status === 'awaiting_approval'
  );
  if (!gate) return null;
  const producerKind = gate.kind === 'gate_1' ? 'compile_scope' : 'planning';
  const producer = workflow.stages.find((stage) => stage.kind === producerKind);
  if (!producer?.outputArtifact) return null;
  return {
    kind: gate.kind === 'gate_1' ? 'scope' : 'plan',
    gate,
    producer,
    artifact: producer.outputArtifact,
  };
}

export function runProgress(workflow) {
  const stages = workflow?.stages || [];
  const terminal = stages.filter((stage) =>
    ['completed', 'completed_with_evidence_gaps', 'blocked', 'failed', 'cancelled'].includes(
      stage.status
    )
  ).length;
  return { completed: terminal, total: stages.length };
}

// Stage-only worker transitions do not increment run.rowVersion. Use only
// bounded public metadata from the existing selected-Goal poll, never bodies,
// attempts or history. Identical snapshots keep the same primitive effect key.
export function goalWorkflowViewRefreshKey(workflow) {
  if (!workflow?.run) return '';
  const reference = (artifact) =>
    artifact ? [artifact.artifactId, artifact.artifactHash, artifact.kind] : null;
  const run = workflow.run;
  const stages = workflow.stages || [];
  return JSON.stringify([
    run.id,
    run.rowVersion,
    run.status,
    run.evidenceReadiness,
    reference(run.finalArtifact),
    stages.length,
    // PublicWorkflowSnapshotSchema bounds the existing read to 120 stages.
    stages
      .slice(0, 120)
      .map((stage) => [
        stage.id,
        stage.ordinal,
        stage.kind,
        stage.stageKey,
        stage.rowVersion,
        stage.status,
        stage.inputHash,
        reference(stage.outputArtifact),
      ]),
  ]);
}

export function approvalIdempotencyKey(workflow, approval) {
  if (!workflow?.run?.id || !approval?.kind || !approval?.artifact?.artifactHash) return null;
  return `${workflow.run.id}:${approval.kind}:${approval.artifact.artifactHash}`;
}

export function artifactRefs(workflow, { includeExecution = false } = {}) {
  if (!workflow) return [];
  const visibleKinds = new Set([
    'compile_scope',
    'execute_research',
    'planning',
    'evaluation',
    'synthesis',
  ]);
  if (includeExecution) visibleKinds.add('execution');

  const seen = new Set();
  return workflow.stages
    .filter((stage) => visibleKinds.has(stage.kind) && stage.outputArtifact)
    .map((stage) => stage.outputArtifact)
    .filter((artifact) => {
      if (seen.has(artifact.artifactId)) return false;
      seen.add(artifact.artifactId);
      return true;
    });
}

export function stageDisplayName(stage) {
  if (!stage) return '';
  const labels = {
    compile_scope: 'Compile scope',
    gate_1: 'Scope approval',
    execute_research: 'Research',
    planning: 'Plan',
    gate_2: 'Plan approval',
    execution: 'Execution',
    evaluation: 'Evaluation',
    synthesis: 'Final artifact',
  };
  if (stage.kind === 'execution' && stage.stageKey) {
    return stage.stageKey
      .replace(/^execution[_-]?/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/^./, (character) => character.toUpperCase());
  }
  return labels[stage.kind] || stage.stageKey || stage.kind;
}

export function normalizedRunItems(response) {
  const items = response?.workflows || response?.runs || [];
  return items.map((item) => (item?.run ? item : { run: item })).filter((item) => item.run?.id);
}
