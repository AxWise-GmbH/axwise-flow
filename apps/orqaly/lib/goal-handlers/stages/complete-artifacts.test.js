import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { acceptedNativeGoalFixture } from '../../_shared/native-goal-authority.test-fixture.js';
import {
  completeQualityGoalRevision,
  completionCandidateIdentitySet,
  completionDeliverableCandidates,
  finalCompletionArtifactDecision,
  isCodeDeliverable,
  selectCompletionDeliverables,
  shouldEnqueuePostCompletionOsjaReview,
  singleMarkdownArtifactContract,
  strictPrdOverviewBody,
  strictPrdRetrospective,
  updateStrictPrdSnapshot,
} from './complete.js';

describe('complete: deliverable classification', () => {
  it('does not label an unlanguaged diagram fence as code', () => {
    expect(isCodeDeliverable('```\nLead -> Qualified -> Proposal\n```', 'markdown')).toBe(false);
  });

  it('recognizes explicit code deliverables and language-tagged code fences', () => {
    expect(isCodeDeliverable('Implementation notes', 'code')).toBe(true);
    expect(isCodeDeliverable('```json\n{"stage":"qualified"}\n```', 'markdown')).toBe(true);
  });
});

describe('complete: strict PRD deterministic handoff', () => {
  const attestation = {
    score: 97,
    threshold: 95,
    requirement_count: 12,
    linked_test_count: 12,
    section_count: 18,
    open_decision_count: 1,
    artifact_hash: 'a'.repeat(64),
    scope_hash: 'b'.repeat(64),
  };

  it('builds the retrospective directly from the attestation', () => {
    expect(
      strictPrdRetrospective(attestation, [{ status: 'completed' }, { status: 'completed' }])
    ).toMatchObject({
      source: 'prd_quality_attestation',
      efficiency_score: 97,
    });
  });

  it('builds compact result-card metadata without another generated summary', () => {
    const overview = strictPrdOverviewBody(
      { title: 'ScopeConfirm' },
      [{ title: 'Final PRD', primary_url: null }],
      attestation
    );
    expect(overview).toMatchObject({
      tagline: 'Attested PRD',
      deliverables: [{ type: 'report', title: 'Final PRD', url: null }],
      risks_or_gaps: ['1 open decision(s) require owner resolution.'],
    });
    expect(overview.summary).toContain('12 requirements');
    expect(overview.summary).toContain('12 acceptance tests');
  });

  it('uses deliverable-neutral attestation copy for a governed workflow', () => {
    const workflowAttestation = {
      ...attestation,
      deliverable_profile: 'axwise_workflow',
      requirement_count: 0,
      linked_test_count: 0,
      section_count: 0,
    };
    const retrospective = strictPrdRetrospective(workflowAttestation, [{ status: 'completed' }]);
    const overview = strictPrdOverviewBody(
      { title: 'Estonia cat-food distribution' },
      [{ title: 'Final distribution plan', primary_url: null }],
      workflowAttestation
    );

    expect(retrospective.what_worked).toContain('exact deliverable');
    expect(retrospective.what_worked).not.toMatch(/\bPRD\b|traced requirements/i);
    expect(overview.tagline).toBe('Attested Deliverable');
    expect(overview.summary).not.toMatch(/\bPRD\b|acceptance tests|traces \d+ requirements/i);
    expect(overview.deliverables[0].description).toContain('Attested deliverable');
  });

  it('does not enqueue post-completion Osja mutation for an attested deliverable', () => {
    expect(
      shouldEnqueuePostCompletionOsjaReview({
        qualityApplicable: true,
        goalCost: 10,
        minimumCost: 0.001,
      })
    ).toBe(false);
    expect(
      shouldEnqueuePostCompletionOsjaReview({
        qualityApplicable: false,
        goalCost: 10,
        minimumCost: 0.001,
      })
    ).toBe(true);
  });
});

describe('complete: atomic quality terminal transition', () => {
  const snapshot = {
    id: 'goal-atomic-1',
    user_id: 'user-1',
    status: 'pending_validation',
    updated_at: '2026-08-23T10:00:00.000Z',
    row_version: 17,
    data: { prd_quality_validation: { candidate_id: 'task-final-1' } },
    plan: { phases: [{ status: 'completed' }] },
  };
  const completionUpdatedAt = '2026-08-23T10:01:00.000Z';
  const attestation = {
    status: 'passed',
    artifact_hash: 'a'.repeat(64),
    scope_hash: 'b'.repeat(64),
  };
  const candidateSet = [{ id: 'task-final-1', artifact_hash: 'a'.repeat(64) }];
  const completionUpdates = {
    status: 'completed',
    data: {
      ...snapshot.data,
      prd_quality_attestation: attestation,
      completed_at: completionUpdatedAt,
    },
    retrospective: { source: 'prd_quality_attestation' },
  };

  it('passes the exact row, artifact, and attestation snapshot to the completion RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: 'completed',
        goal: {
          id: snapshot.id,
          status: 'completed',
          row_version: 18,
          data: completionUpdates.data,
          retrospective: completionUpdates.retrospective,
        },
      },
      error: null,
    });

    await expect(
      completeQualityGoalRevision(
        { rpc },
        {
          snapshot,
          completionUpdates,
          completionUpdatedAt,
          candidateId: 'task-final-1',
          candidateArtifact: '# Final artifact',
          candidateSet,
          attestation,
        }
      )
    ).resolves.toMatchObject({ status: 'completed' });

    expect(rpc).toHaveBeenCalledWith('complete_quality_goal_revision', {
      p_goal_id: snapshot.id,
      p_user_id: snapshot.user_id,
      p_expected_status: 'pending_validation',
      p_expected_updated_at: snapshot.updated_at,
      p_expected_row_version: 17,
      p_expected_data: snapshot.data,
      p_expected_plan: snapshot.plan,
      p_completion_data: completionUpdates.data,
      p_completion_retrospective: completionUpdates.retrospective,
      p_completion_updated_at: completionUpdatedAt,
      p_candidate_id: 'task-final-1',
      p_candidate_artifact: '# Final artifact',
      p_candidate_set: candidateSet,
      p_attestation: attestation,
    });
  });

  it.each(['already_completed', 'conflict'])('preserves the RPC %s outcome', async (status) => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status,
        reason: 'exact_cas_mismatch',
        ...(status === 'conflict'
          ? {}
          : {
              goal: {
                id: snapshot.id,
                status: 'completed',
                row_version: 18,
                data: completionUpdates.data,
                retrospective: completionUpdates.retrospective,
              },
            }),
      },
    });

    await expect(
      completeQualityGoalRevision(
        { rpc },
        {
          snapshot,
          completionUpdates,
          completionUpdatedAt,
          candidateId: 'task-final-1',
          candidateArtifact: '# Final artifact',
          candidateSet,
          attestation,
        }
      )
    ).resolves.toMatchObject({ status });
  });

  it('fails closed on RPC errors, invalid results, and a missing database version', async () => {
    const baseInput = {
      snapshot,
      completionUpdates,
      completionUpdatedAt,
      candidateId: 'task-final-1',
      candidateArtifact: '# Final artifact',
      candidateSet,
      attestation,
    };

    await expect(
      completeQualityGoalRevision(
        { rpc: vi.fn().mockResolvedValue({ error: { message: 'invariant violation' } }) },
        baseInput
      )
    ).rejects.toThrow('Atomic attested-deliverable completion failed: invariant violation');
    await expect(
      completeQualityGoalRevision(
        { rpc: vi.fn().mockResolvedValue({ data: { status: 'unexpected' } }) },
        baseInput
      )
    ).rejects.toThrow('returned an invalid result');
    await expect(
      completeQualityGoalRevision(
        { rpc: vi.fn().mockResolvedValue({ data: { status: 'completed' } }) },
        baseInput
      )
    ).rejects.toThrow('returned an invalid goal snapshot');

    const rpc = vi.fn();
    await expect(
      completeQualityGoalRevision(
        { rpc },
        { ...baseInput, snapshot: { ...snapshot, row_version: null } }
      )
    ).rejects.toThrow('requires an integer goal row_version');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('adopts an exact committed completion after an ambiguous RPC response failure', async () => {
    const committedGoal = {
      id: snapshot.id,
      status: 'completed',
      row_version: 18,
      data: completionUpdates.data,
      retrospective: completionUpdates.retrospective,
    };
    const query = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.single = vi.fn().mockResolvedValue({ data: committedGoal, error: null });
    const admin = {
      rpc: vi.fn().mockResolvedValue({ error: { message: 'response stream reset' } }),
      from: vi.fn(() => query),
    };

    await expect(
      completeQualityGoalRevision(admin, {
        snapshot,
        completionUpdates,
        completionUpdatedAt,
        candidateId: 'task-final-1',
        candidateArtifact: '# Final artifact',
        candidateSet,
        attestation,
      })
    ).resolves.toMatchObject({
      status: 'already_completed',
      recovered_from_rpc_error: true,
      goal: committedGoal,
    });
  });

  it('uses row_version in direct quality-state CAS updates and selects the next version', async () => {
    const query = {};
    query.update = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.select = vi.fn(() => query);
    query.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: snapshot.id, status: 'pending_validation', row_version: 18 },
      error: null,
    });
    const admin = { from: vi.fn(() => query) };

    await expect(
      updateStrictPrdSnapshot(admin, snapshot, { data: snapshot.data })
    ).resolves.toMatchObject({ row_version: 18 });
    expect(query.eq).toHaveBeenCalledWith('row_version', 17);
    expect(query.select).toHaveBeenCalledWith('id, status, data, updated_at, row_version');

    await expect(
      updateStrictPrdSnapshot(admin, { ...snapshot, row_version: undefined }, { data: {} })
    ).rejects.toThrow('requires an integer goal row_version');
  });
});

describe('complete: explicit single Markdown artifact contract', () => {
  const goal = {
    title: 'Create the ScopeConfirm PRD as one Markdown file',
    description:
      'Produce exactly one self-contained Markdown file, beginning exactly “# PRD: ScopeConfirm”.',
  };

  it('recognizes the requested count and exact prefix', () => {
    expect(singleMarkdownArtifactContract(goal)).toEqual({
      required: true,
      requiredPrefix: '# PRD: ScopeConfirm',
    });
  });

  it('uses the accepted native title prefix instead of poisoned raw goal prose', () => {
    const nativeGoal = acceptedNativeGoalFixture();
    nativeGoal.title = 'RAW_NATIVE_COMPLETION_TITLE_POISON';
    nativeGoal.description =
      'Exactly one Markdown file beginning exactly “# RAW_NATIVE_PREFIX_POISON”.';

    expect(singleMarkdownArtifactContract(nativeGoal)).toEqual({
      required: true,
      requiredPrefix: '# PRD: ScopeConfirm',
    });
  });

  it('exposes only the exact final synthesis and keeps specialist notes internal', () => {
    const intermediate = {
      title: 'Define UX states',
      output: '## UX states\nSpecialist notes',
      deliverable_type: 'markdown',
      phase_index: 0,
    };
    const final = {
      title: 'Synthesize Unified ScopeConfirm PRD',
      output: '# PRD: ScopeConfirm\n\nComplete document',
      deliverable_type: 'markdown',
      phase_index: 3,
    };

    expect(selectCompletionDeliverables(goal, [intermediate, final])).toEqual([final]);
  });

  it('preserves normal multi-deliverable goals', () => {
    const deliverables = [{ title: 'Research' }, { title: 'Implementation' }];
    expect(selectCompletionDeliverables({ title: 'Launch a campaign' }, deliverables)).toBe(
      deliverables
    );
  });

  it('selects the final/latest synthesis for one canonical AxWise Markdown plan', () => {
    const governedGoal = {
      title: 'Estonia cat-food distribution plan',
      description: 'Prepare the approved distribution plan.',
      data: {
        scope_packet: {
          version: 'orqaly_scope_packet_v2',
          scope_ref: 'axwise:goal-2:decision-1',
          scope_hash: 'c'.repeat(64),
          intent: {
            objective: 'Prepare the distribution plan',
            problem: 'The channel sequence is undecided',
            desired_outcome: 'A final operational handoff',
            audiences: [],
            non_goals: [],
          },
          deliverable: {
            type: 'distribution_plan',
            count: 1,
            required_sections: [],
            presentation: 'markdown_artifact',
          },
          admission: {
            version: 'axwise_scope_admission_v1',
            work_types: ['procurement_logistics'],
            geographies: ['EE'],
            channels: ['retail'],
            success_criteria: ['A final distribution sequence is documented'],
            required_capabilities: ['logistics planning'],
            requested_actions: [],
          },
          ledger: {
            requirements: [],
            facts: [],
            assumptions: [],
            decisions: [],
            constraints: [],
          },
          acceptance: [],
        },
      },
    };
    const discovery = {
      title: 'Channel research',
      output: '# Research\n\nLong specialist notes.'.repeat(20),
      deliverable_type: 'markdown',
      phase_index: 1,
      updated_at: '2026-08-23T09:00:00.000Z',
    };
    const olderFinal = {
      title: 'Final distribution plan',
      output: '# Distribution plan\n\nOlder synthesis.',
      deliverable_type: 'markdown',
      phase_index: 3,
      updated_at: '2026-08-23T10:00:00.000Z',
    };
    const latestFinal = {
      title: 'Final distribution plan — revised synthesis',
      output: '# Distribution plan\n\nLatest synthesis.',
      deliverable_type: 'markdown',
      phase_index: 3,
      updated_at: '2026-08-23T11:00:00.000Z',
    };

    expect(singleMarkdownArtifactContract(governedGoal)).toEqual({
      required: true,
      requiredPrefix: null,
    });
    expect(
      selectCompletionDeliverables(governedGoal, [discovery, olderFinal, latestFinal])
    ).toEqual([latestFinal]);
  });

  it('uses stable identity rather than mutable timestamps to break an exact final tie', () => {
    const earlierId = {
      id: 'task-final-a',
      title: 'Final ScopeConfirm PRD',
      output: '# PRD: ScopeConfirm\n\nVersion A.',
      deliverable_type: 'markdown',
      phase_index: 3,
      created_at: '2026-08-23T09:00:00.000Z',
      executed_at: '2026-08-23T09:30:00.000Z',
      updated_at: '2026-08-23T10:00:00.000Z',
    };
    const laterId = {
      id: 'task-final-b',
      title: 'Final ScopeConfirm PRD',
      output: '# PRD: ScopeConfirm\n\nVersion B.',
      deliverable_type: 'markdown',
      phase_index: 3,
      created_at: '2026-08-23T11:00:00.000Z',
      executed_at: '2026-08-23T11:30:00.000Z',
      updated_at: '2026-08-23T12:00:00.000Z',
    };

    expect(selectCompletionDeliverables(goal, [laterId, earlierId])).toEqual([earlierId]);
    expect(
      selectCompletionDeliverables(goal, [
        {
          ...laterId,
          created_at: earlierId.created_at,
          executed_at: earlierId.executed_at,
          updated_at: earlierId.updated_at,
        },
        {
          ...earlierId,
          created_at: laterId.created_at,
          executed_at: laterId.executed_at,
          updated_at: laterId.updated_at,
        },
      ])
    ).toEqual([expect.objectContaining({ id: earlierId.id })]);
  });

  it('refuses the terminal transition when a second done final artifact appears after attestation', () => {
    const governedGoal = {
      title: 'Create the ScopeConfirm PRD as one Markdown file',
      description: 'Produce exactly one self-contained Markdown file.',
      data: {
        scope_packet: {
          version: 'orqaly_scope_packet_v2',
          deliverable: {
            type: 'product_requirements_document',
            count: 1,
            required_sections: [],
            presentation: 'markdown_artifact',
          },
        },
      },
    };
    const attested = {
      id: 'task-final-1',
      title: 'Synthesize Final ScopeConfirm PRD',
      output: '# PRD: ScopeConfirm\n\nAttested artifact.',
      deliverable_type: 'markdown',
      phase_index: 3,
      updated_at: '2026-08-23T10:00:00.000Z',
    };
    const raced = {
      id: 'task-final-2',
      title: 'Final ScopeConfirm PRD — concurrent result',
      output: '# PRD: ScopeConfirm\n\nConcurrent second artifact.',
      deliverable_type: 'markdown',
      phase_index: 3,
      updated_at: '2026-08-23T10:00:01.000Z',
    };
    const artifactHash = createHash('sha256').update(attested.output).digest('hex');

    expect(completionDeliverableCandidates(governedGoal, [attested])).toEqual([attested]);
    const decision = finalCompletionArtifactDecision({
      goal: governedGoal,
      candidates: [attested, raced],
      attestedCandidates: completionCandidateIdentitySet([attested]),
      attestedCandidate: attested,
      attestation: { artifact_hash: artifactHash, repair: { task_id: attested.id } },
    });

    expect(decision).toMatchObject({
      allowed: false,
      expected_count: 1,
      current_count: 2,
      candidate_id: raced.id,
      reasons: expect.arrayContaining([
        'completion_done_candidate_count_changed',
        'completion_artifact_count_changed',
        'completion_artifact_identity_changed',
        'completion_artifact_hash_changed',
      ]),
    });
  });

  it('does not let an exact-prefix artifact hide a malformed same-slot final duplicate', () => {
    const governedGoal = {
      title: 'Create the ScopeConfirm PRD as one Markdown file',
      description:
        'Produce exactly one self-contained Markdown file, beginning exactly "# PRD: ScopeConfirm".',
      data: {
        scope_packet: {
          version: 'orqaly_scope_packet_v2',
          deliverable: {
            type: 'product_requirements_document',
            count: 1,
            required_sections: [],
            presentation: 'markdown_artifact',
          },
        },
      },
    };
    const attested = {
      id: 'task-final-exact',
      title: 'Final ScopeConfirm PRD',
      output: '# PRD: ScopeConfirm\n\nAttested artifact.',
      deliverable_type: 'markdown',
      phase_index: 3,
    };
    const malformedDuplicate = {
      id: 'task-final-malformed',
      title: 'Final ScopeConfirm PRD — concurrent malformed result',
      output: '# ScopeConfirm\n\nA second final artifact with the wrong prefix.',
      deliverable_type: 'markdown',
      phase_index: 3,
    };
    const candidates = [attested, malformedDuplicate];
    const artifactHash = createHash('sha256').update(attested.output).digest('hex');

    expect(completionDeliverableCandidates(governedGoal, candidates)).toEqual(candidates);
    expect(selectCompletionDeliverables(governedGoal, candidates)).toEqual([attested]);
    expect(
      finalCompletionArtifactDecision({
        goal: governedGoal,
        candidates,
        attestedCandidates: completionCandidateIdentitySet(candidates),
        attestedCandidate: attested,
        attestation: { artifact_hash: artifactHash, repair: { task_id: attested.id } },
      })
    ).toMatchObject({
      allowed: false,
      expected_count: 1,
      current_count: 2,
      reasons: expect.arrayContaining(['completion_artifact_count_changed']),
    });
  });
});
