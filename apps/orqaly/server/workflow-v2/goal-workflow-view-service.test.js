// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createGoalWorkflowViewService } from './goal-workflow-view-service.js';
import { GoalWorkflowViewResponseSchema } from '../../shared/workflow-v2/goal-workflow-view-contract.js';
import {
  goalViewId as id,
  goalViewOwner as owner,
  goalViewProjection,
} from '../../shared/workflow-v2/fixtures/goal-workflow-view.js';

function fixture(projection = goalViewProjection()) {
  const repository = {
    resolveExistingTenant: vi.fn().mockResolvedValue(id(1)),
    resolveTenant: vi.fn(),
    loadGoalWorkflowView: vi.fn().mockResolvedValue(projection),
    loadSnapshot: vi.fn(),
    loadArtifact: vi.fn(),
    applyTransition: vi.fn(),
    claimWorkflowWork: vi.fn(),
  };
  return { repository, service: createGoalWorkflowViewService({ repository }) };
}
describe('read-only owned Goal workflow view service', () => {
  it('resolves personal identity server-side and projects the exact owned run', async () => {
    const { repository, service } = fixture();
    const result = await service.read(
      { userId: owner, tenantId: id(99), organizationId: 'org_ignored' },
      id(2)
    );
    expect(repository.resolveExistingTenant).toHaveBeenCalledWith({ userId: owner });
    expect(repository.resolveTenant).not.toHaveBeenCalled();
    expect(repository.loadGoalWorkflowView).toHaveBeenCalledWith(id(1), owner, id(2));
    expect(GoalWorkflowViewResponseSchema.parse(result)).toBe(result);
    expect(result.workflow.source).toEqual({ kind: 'goal_run', id: id(2) });
    expect(result.workflow.outputs[0].reference).toEqual({
      family: 'canonical_artifact',
      runId: id(2),
      artifactId: id(4),
      artifactHash: 'b'.repeat(64),
      kind: 'final_markdown',
    });
    for (const name of ['loadSnapshot', 'loadArtifact', 'applyTransition', 'claimWorkflowWork'])
      expect(repository[name]).not.toHaveBeenCalled();
  });
  it('does no repository work without authentication', async () => {
    const { repository, service } = fixture();
    await expect(service.read(null, id(2))).rejects.toMatchObject({ status: 401 });
    expect(repository.resolveExistingTenant).not.toHaveBeenCalled();
    expect(repository.loadGoalWorkflowView).not.toHaveBeenCalled();
  });
  it('does not read when the signed-in identity has no tenant', async () => {
    const { repository, service } = fixture();
    repository.resolveExistingTenant.mockResolvedValue(null);
    await expect(service.read({ userId: owner }, id(2))).rejects.toMatchObject({ status: 403 });
    expect(repository.loadGoalWorkflowView).not.toHaveBeenCalled();
  });
  it('contains identity-driver failures without echoing database detail', async () => {
    const { repository, service } = fixture();
    repository.resolveExistingTenant.mockRejectedValue(new Error('PRIVATE_DATABASE_DETAIL'));
    await expect(service.read({ userId: owner }, id(2))).rejects.toMatchObject({
      status: 503,
      code: 'WORKFLOW_VIEW_UNAVAILABLE',
      message: 'Goal workflow metadata is unavailable.',
    });
    expect(repository.loadGoalWorkflowView).not.toHaveBeenCalled();
  });
  it('uses the same not-found response for owner/tenant misses', async () => {
    const { service } = fixture(null);
    await expect(service.read({ userId: owner }, id(2))).rejects.toMatchObject({
      status: 404,
      code: 'RUN_NOT_FOUND',
    });
  });
  const mutations = {
    'run identity': (p) => {
      p.snapshot.run.id = id(99);
    },
    tenant: (p) => {
      p.snapshot.run.tenantId = id(99);
    },
    owner: (p) => {
      p.snapshot.run.ownerUserId = 'user_other';
    },
    'duplicate stage': (p) => {
      p.snapshot.stages.push({ ...p.snapshot.stages[0] });
    },
    'artifact run': (p) => {
      p.artifactRecords[0].runId = id(99);
    },
    'artifact hash': (p) => {
      p.artifactRecords[0].artifactHash = 'd'.repeat(64);
    },
    'artifact kind': (p) => {
      p.artifactRecords[0].kind = 'scope';
    },
    'artifact id': (p) => {
      p.artifactRecords[0].artifactId = id(99);
    },
    'conflicting reference': (p) => {
      p.snapshot.stages[0].outputArtifact.artifactHash = 'd'.repeat(64);
    },
    'duplicate artifact': (p) => {
      p.artifactRecords.push({ ...p.artifactRecords[0] });
    },
    'duplicate lineage': (p) => {
      p.artifactRecords[0].sourceArtifactIds.push(id(5));
    },
    'malformed lineage': (p) => {
      p.artifactRecords[0].sourceArtifactIds = ['not-an-id'];
    },
    'wrong coverage': (p) => {
      p.coverage.outputs.loaded = 0;
    },
    'attempt payload': (p) => {
      p.snapshot.attempts = [{ inputPayload: 'PRIVATE_SECRET' }];
    },
    'unrequested approval history': (p) => {
      p.snapshot.approvals = [{ id: id(99) }];
    },
    'unrequested dependencies': (p) => {
      p.snapshot.dependencies = [{ stageId: id(3), dependsOnStageId: id(9) }];
    },
  };
  it.each(Object.entries(mutations))(
    'rejects %s without leaking raw parser or row content',
    async (_name, change) => {
      const projection = goalViewProjection();
      change(projection);
      const { service } = fixture(projection);
      await expect(service.read({ userId: owner }, id(2))).rejects.toMatchObject({
        code: 'WORKFLOW_VIEW_UNAVAILABLE',
        status: 503,
        message: 'Goal workflow metadata is unavailable.',
      });
    }
  );
  it('preserves missing metadata and unloaded coverage without inventing lineage', async () => {
    const projection = goalViewProjection();
    projection.artifactRecords = [];
    projection.coverage.outputs.complete = false;
    const { service } = fixture(projection),
      response = await service.read({ userId: owner }, id(2));
    expect(response.workflow.outputs[0]).toMatchObject({
      contentType: null,
      sourceArtifactIds: null,
      inputHash: null,
    });
    expect(response.coverage).toMatchObject({
      outputs: { complete: false },
      attempts: 'not_loaded',
      content: 'not_loaded',
    });
  });
});
