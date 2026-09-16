import { describe, expect, it } from 'vitest';

import { canonicalContractHash } from '../lib/agent-handlers/compact-agent-contracts.js';
import {
  nativeDecisionContractsFixture,
  nativeScopePacketFixture,
} from '../lib/agent-handlers/native-axwise-contract.test-fixture.js';
import {
  approvedApproval,
  buildContextApprovalSnapshot,
} from '../lib/goal-handlers/approval-audit.js';
import { selectWorkShapePlaybook } from '../lib/goal-handlers/work-shape-playbooks.js';
import {
  auditNativeGoalDatabase,
  classifyNativeGoalState,
  GOAL_AUDIT_COLUMNS,
  NATIVE_GOAL_AUDIT_CLASSIFICATION,
  runNativeGoalStateAudit,
} from './audit-native-goal-state.mjs';

function acceptedNativeGoal(status = 'planning') {
  const admission = {
    version: 'axwise_scope_admission_v1',
    work_types: ['research_analysis'],
    geographies: [],
    channels: [],
    success_criteria: ['The accepted report is complete'],
    required_capabilities: ['Research Analyst'],
    requested_actions: [
      {
        action: 'prepare the accepted research report',
        mode: 'prepare',
        side_effect: 'none',
        requires_authorization: false,
      },
    ],
  };
  const basePacket = nativeScopePacketFixture({ admission });
  const packetWithoutHash = {
    ...basePacket,
    deliverable: {
      ...basePacket.deliverable,
      type: 'research_report',
      title_prefix: '# Accepted research report',
      required_sections: ['Findings'],
    },
  };
  delete packetWithoutHash.scope_hash;
  const packet = {
    ...packetWithoutHash,
    scope_hash: canonicalContractHash(packetWithoutHash),
  };
  const contracts = nativeDecisionContractsFixture(packet);
  const goal = {
    id: 'goal-native-valid',
    status,
    data: {
      axwise_customer_intelligence: {
        scope_packet: contracts.scope_packet,
        scope_contract_binding: contracts.scope_contract_binding,
        scope_runtime_binding: contracts.scope_runtime_binding,
        scope_validation: contracts.scope_validation,
        axwise_scope_confirmation: contracts.scope_confirmation,
        research_execution_inputs_hash: contracts.research_execution_inputs_hash,
        generation: '1',
        updated_at: '2026-08-24T10:00:00.000Z',
      },
    },
  };
  const route = selectWorkShapePlaybook({ goal, scopePacket: packet });
  goal.data.work_shape_route = route;
  goal.data.scope_admission = {
    version: 1,
    status: 'accepted',
    state_key: 'axwise_customer_intelligence',
    scope_hash: packet.scope_hash,
    playbook_id: route.playbook_id,
    route_version: route.version,
    accepted_at: '2026-08-24T10:01:00.000Z',
    requires_authorization: route.requires_authorization,
    maximum_side_effect: route.maximum_side_effect,
    grants_authorization: false,
  };
  goal.data.goal_approvals = {
    context: approvedApproval('context', buildContextApprovalSnapshot(goal), 'user-1'),
  };
  return goal;
}

function missingPacketStrongNativeGoal(status, extraData = {}) {
  return {
    id: `goal-${status}`,
    status,
    updated_at: '2026-08-24T10:00:00.000Z',
    data: {
      scope_admission: {
        state_key: 'axwise_customer_intelligence',
        native_scope: true,
        status: 'queued',
      },
      ...extraData,
    },
  };
}

describe('native goal state audit classifier', () => {
  it('leaves an unmarked goal on the legacy path', () => {
    expect(
      classifyNativeGoalState({
        id: 'goal-legacy',
        status: 'active',
        data: { axwise_customer_intelligence: { status: 'degraded' } },
      })
    ).toEqual({
      id: 'goal-legacy',
      status: 'active',
      classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.LEGACY,
      reasons: [],
    });
  });

  it('keeps a lone historical scope-admission state key legacy-compatible', () => {
    expect(
      classifyNativeGoalState({
        id: 'goal-ambiguous-historical',
        status: 'active',
        data: {
          scope_admission: {
            state_key: 'axwise_customer_intelligence',
            status: 'accepted',
          },
        },
      })
    ).toEqual({
      id: 'goal-ambiguous-historical',
      status: 'active',
      classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.LEGACY,
      reasons: [],
    });
  });

  it('classifies a malformed surviving scope packet as unsafe native state', () => {
    const finding = classifyNativeGoalState({
      id: 'goal-corrupt-native-packet',
      status: 'planning',
      data: {
        axwise_customer_intelligence: {
          scope_packet: { version: 'corrupt' },
        },
      },
    });

    expect(finding.classification).toBe(NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID);
    expect(finding.reasons).toEqual(expect.arrayContaining(['native_scope_contract_invalid']));
  });

  it('does not downgrade a downstream-attempt-only native row to legacy', () => {
    const finding = classifyNativeGoalState({
      id: 'goal-native-attempt-only',
      status: 'forming_team',
      data: {
        native_team_formation_attempt: { attempt_id: 'formation-attempt-1' },
      },
    });

    expect(finding.classification).toBe(NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID);
    expect(finding.reasons).toEqual(expect.arrayContaining(['native_active_authority_invalid']));
  });

  it('accepts a fully hash-bound native authority', () => {
    expect(classifyNativeGoalState(acceptedNativeGoal())).toEqual({
      id: 'goal-native-valid',
      status: 'planning',
      classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.VALID_NATIVE,
      reasons: [],
    });
  });

  it('flags accepted native authority that was moved back before Gate 1', () => {
    expect(classifyNativeGoalState(acceptedNativeGoal('analyzing'))).toEqual({
      id: 'goal-native-valid',
      status: 'analyzing',
      classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID,
      reasons: ['native_ready_authority_lifecycle_mismatch'],
    });
  });

  it('treats native feasibility as a downgrade, never an expected transition', () => {
    const finding = classifyNativeGoalState(missingPacketStrongNativeGoal('feasibility'));

    expect(finding.classification).toBe(NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID);
    expect(finding.reasons).toEqual(
      expect.arrayContaining(['native_active_authority_invalid', 'native_scope_contract_invalid'])
    );
  });

  it('treats a packet-less scope rebuild as an expected transition', () => {
    const finding = classifyNativeGoalState(
      missingPacketStrongNativeGoal('analyzing', {
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-current',
        },
        axwise_customer_intelligence: {
          status: 'revision_requested',
          scope_packet: null,
        },
      })
    );

    expect(finding.classification).toBe(NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID);
    expect(finding.reasons).toEqual(
      expect.arrayContaining(['native_scope_rebuild_in_progress', 'native_scope_contract_invalid'])
    );
  });

  it.each([undefined, '', '   '])(
    'fails closed when a pending scope rebuild has malformed token %j',
    (revisionToken) => {
      const scopeRevision = {
        version: 'orqaly_scope_revision_v1',
        status: 'pending_rebuild',
      };
      if (revisionToken !== undefined) scopeRevision.revision_token = revisionToken;
      const finding = classifyNativeGoalState(
        missingPacketStrongNativeGoal('analyzing', {
          scope_revision: scopeRevision,
        })
      );

      expect(finding.classification).toBe(NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID);
      expect(finding.reasons).toEqual(
        expect.arrayContaining([
          'native_scope_rebuild_token_missing',
          'native_scope_contract_invalid',
        ])
      );
      expect(finding.reasons).not.toContain('native_scope_rebuild_in_progress');
      expect(finding.reasons).not.toContain('native_scope_transition_in_progress');
    }
  );

  it('lets a malformed pending rebuild override otherwise valid native authority', () => {
    const goal = acceptedNativeGoal();
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
    };

    expect(classifyNativeGoalState(goal)).toMatchObject({
      classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID,
      reasons: ['native_scope_rebuild_token_missing'],
    });
  });

  it.each(['analyzing', 'researching_customer'])(
    'treats a valid pending rebuild in its owned %s state as transitional even with valid authority',
    (status) => {
      const goal = acceptedNativeGoal(status);
      goal.data.scope_revision = {
        version: 'orqaly_scope_revision_v1',
        status: 'pending_rebuild',
        revision_token: 'revision-current',
      };

      expect(classifyNativeGoalState(goal)).toMatchObject({
        classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID,
        reasons: ['native_scope_rebuild_in_progress'],
      });
    }
  );

  it('keeps a valid pending rebuild intentionally quarantined in an inactive state', () => {
    const goal = acceptedNativeGoal('needs_human');
    goal.data.scope_revision = {
      version: 'orqaly_scope_revision_v1',
      status: 'pending_rebuild',
      revision_token: 'revision-quarantined',
    };

    expect(classifyNativeGoalState(goal)).toMatchObject({
      classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID,
      reasons: ['native_scope_rebuild_inactive_or_quarantined'],
    });
  });

  it.each(['planning', 'active', 'pending_validation'])(
    'fails closed for a stale pending rebuild in downstream %s despite fully valid authority',
    (status) => {
      const goal = acceptedNativeGoal(status);
      goal.data.scope_revision = {
        version: 'orqaly_scope_revision_v1',
        status: 'pending_rebuild',
        revision_token: 'revision-stale-downstream',
      };

      expect(classifyNativeGoalState(goal)).toMatchObject({
        classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID,
        reasons: ['native_scope_rebuild_stale_downstream'],
      });
    }
  );

  it.each(['analyzing', 'researching_customer', 'awaiting_context_approval', 'awaiting_po_input'])(
    'keeps incomplete native scope state in %s out of the unsafe bucket',
    (status) => {
      expect(classifyNativeGoalState(missingPacketStrongNativeGoal(status)).classification).toBe(
        NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID
      );
    }
  );

  it.each(['paused', 'completed', 'failed', 'cancelled', 'needs_human'])(
    'reports invalid native state in inactive %s as quarantined',
    (status) => {
      const finding = classifyNativeGoalState(missingPacketStrongNativeGoal(status));

      expect(finding.classification).toBe(NATIVE_GOAL_AUDIT_CLASSIFICATION.EXPECTED_INVALID);
      expect(finding.reasons).toContain('native_goal_inactive_or_quarantined');
    }
  );

  it.each([
    'planning',
    'forming_team',
    'provisioning_tools',
    'estimating',
    'awaiting_approval',
    'authorizing_execution',
    'active',
    'pending_validation',
    'awaiting_tools',
  ])('fails closed for a packet-less native row in downstream state %s', (status) => {
    const finding = classifyNativeGoalState(missingPacketStrongNativeGoal(status));

    expect(finding.classification).toBe(NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID);
    expect(finding.reasons).toEqual(
      expect.arrayContaining(['native_active_authority_invalid', 'native_scope_contract_invalid'])
    );
  });

  it.each(['axwise_scope_packet_v2', 'axwise_scope_packet_v1'])(
    'fails closed for a wrong or structurally invalid %s packet in active execution',
    (version) => {
      const goal = missingPacketStrongNativeGoal('active', {
        axwise_customer_intelligence: {
          scope_packet: { version, scope_hash: 'not-a-valid-contract' },
        },
      });

      expect(classifyNativeGoalState(goal)).toMatchObject({
        classification: NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID,
        reasons: expect.arrayContaining(['native_scope_contract_invalid']),
      });
    }
  );

  it('does not let a stale rebuild marker excuse a row that is already active', () => {
    const finding = classifyNativeGoalState(
      missingPacketStrongNativeGoal('active', {
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-stale',
        },
      })
    );

    expect(finding.classification).toBe(NATIVE_GOAL_AUDIT_CLASSIFICATION.UNSAFE_INVALID);
    expect(finding.reasons).toContain('native_scope_rebuild_stale_downstream');
  });
});

describe('native goal state database audit', () => {
  it('paginates every goal while retaining only safe report fields', async () => {
    const rows = [
      { id: 'goal-legacy', status: 'completed', updated_at: '2026-08-24', data: {} },
      missingPacketStrongNativeGoal('needs_human'),
      missingPacketStrongNativeGoal('active'),
    ];
    const calls = [];
    const client = {
      from: (table) => ({
        select: (columns) => ({
          order: (orderedBy, options) => ({
            range: async (from, to) => {
              calls.push({ table, columns, orderedBy, options, from, to });
              return { data: rows.slice(from, to + 1), error: null };
            },
          }),
        }),
      }),
    };

    const result = await auditNativeGoalDatabase(client, { pageSize: 2 });

    expect(calls).toEqual([
      {
        table: 'goals',
        columns: GOAL_AUDIT_COLUMNS,
        orderedBy: 'id',
        options: { ascending: true },
        from: 0,
        to: 1,
      },
      {
        table: 'goals',
        columns: GOAL_AUDIT_COLUMNS,
        orderedBy: 'id',
        options: { ascending: true },
        from: 2,
        to: 3,
      },
    ]);
    expect(result.counts).toMatchObject({
      total: 3,
      legacy: 1,
      expected_transitional_or_quarantined_invalid: 1,
      unsafe_active_invalid: 1,
    });
    expect(result.findings.unsafe_active_invalid[0]).toEqual({
      id: 'goal-active',
      status: 'active',
      reasons: expect.arrayContaining(['native_scope_contract_invalid']),
    });
    for (const findings of Object.values(result.findings)) {
      for (const finding of findings) {
        expect(Object.keys(finding).sort()).toEqual(['id', 'reasons', 'status']);
      }
    }
  });

  it('returns a nonzero audit code and logs only safe row fields for unsafe state', async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async () => ({
              data: [missingPacketStrongNativeGoal('active')],
              error: null,
            }),
          }),
        }),
      }),
    };
    const output = [];
    const log = {
      log: (value) => output.push(String(value)),
      error: (value) => output.push(String(value)),
    };

    await expect(runNativeGoalStateAudit({ client, env: {}, log })).resolves.toBe(1);
    const finding = JSON.parse(output.find((line) => line.startsWith('{')));
    expect(Object.keys(finding).sort()).toEqual(['id', 'reasons', 'status']);
    expect(finding).toMatchObject({ id: 'goal-active', status: 'active' });
  });

  it('redacts database error details and returns the operational error code', async () => {
    const client = {
      from: () => ({
        select: () => ({
          order: () => ({
            range: async () => ({
              data: null,
              error: { message: 'credential-like database detail must not escape' },
            }),
          }),
        }),
      }),
    };
    const output = [];
    const log = {
      log: (value) => output.push(String(value)),
      error: (value) => output.push(String(value)),
    };

    await expect(runNativeGoalStateAudit({ client, env: {}, log })).resolves.toBe(2);
    expect(output.join('\n')).toBe('Native goal state audit could not read every goals page.');
  });
});
