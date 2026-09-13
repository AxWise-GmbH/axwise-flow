import { describe, expect, it, vi } from 'vitest';
import {
  AgenticControlPlaneError,
  createAgenticControlPlaneClient,
} from './agenticControlPlaneService';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('agenticControlPlaneService', () => {
  it('lists Agents through the published v1 route and forwards injected auth', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ version: 'orqaly_agent_list_v1', agents: [] })
    );
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://control.example.test/control/',
      fetchImpl,
      getAuthHeaders: async () => ({ 'X-Gateway-Session': 'short-lived-session' }),
    });

    await client.listAgents({ limit: 5, state: 'active' });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://control.example.test/control/v1/agents?limit=5&state=active',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({ 'X-Gateway-Session': 'short-lived-session' }),
      })
    );
  });

  it('submits the exact task-admission contract without inventing an idempotency header', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ version: 'orqaly_task_admission_result_v1', status: 'ready' })
    );
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://control.example.test',
      fetchImpl,
    });
    const request = {
      version: 'orqaly_task_admission_request_v1',
      task: { title: 'Prepare a comparison', description: '' },
      requestedSteps: [
        { stepKind: 'reason', descriptorKey: 'agent_reason_v1', connectionKey: null },
      ],
    };

    await client.admitTask(request);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://control.example.test/v1/task-admissions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        headers: expect.not.objectContaining({ 'Idempotency-Key': expect.anything() }),
      })
    );
  });

  it('uses the request idempotency key when materializing an Agent team', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ version: 'orqaly_materialization_result_v1' }, 201)
    );
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://control.example.test',
      fetchImpl,
    });
    const request = {
      version: 'orqaly_materialize_agent_request_v1',
      idempotencyKey: 'materialize-task-1',
    };

    await client.materializeAgentFromTask(request);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://control.example.test/v1/agents/from-task',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        headers: expect.objectContaining({ 'Idempotency-Key': 'materialize-task-1' }),
      })
    );
  });

  it('gets a single run and submits a plan version with both required headers', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ version: 'orqaly_run_detail_v1', run: {} }))
      .mockResolvedValueOnce(jsonResponse({ version: 'orqaly_plan_version_result_v1' }, 201));
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://control.example.test',
      fetchImpl,
    });

    await client.getRun('run/unsafe');
    const submission = {
      version: 'orqaly_plan_version_submission_v1',
      idempotencyKey: 'plan-version-1',
      plan: {},
    };
    await client.submitPlanVersion('run/unsafe', submission, 17);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://control.example.test/v1/runs/run%2Funsafe',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://control.example.test/v1/runs/run%2Funsafe/plan-versions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(submission),
        headers: expect.objectContaining({
          'Idempotency-Key': 'plan-version-1',
          'If-Match': '17',
        }),
      })
    );
  });

  it('lists pending approvals and sends a version-bound idempotent decision', async () => {
    const authoritativeApproval = {
      id: '99999999-9999-4999-8999-999999999999',
      presentation: { version: 'orqaly_approval_presentation_v1', steps: [{}] },
      controls: {
        approval: {
          approve: false,
          reject: false,
          reason: 'expired',
        },
      },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          version: 'orqaly_approval_list_v1',
          approvals: [authoritativeApproval],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          version: 'orqaly_approval_decision_result_v1',
          approvalId: 'approval/unsafe',
          status: 'approved',
        })
      );
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://control.example.test',
      fetchImpl,
    });

    const listed = await client.listApprovals({ limit: 20, status: 'pending' });
    expect(listed.approvals[0]).toEqual(authoritativeApproval);
    const decision = {
      version: 'orqaly_approval_decision_request_v1',
      idempotencyKey: 'approve-plan-1',
      decision: 'approve',
      reason: 'Reviewed in Agentic Control.',
    };
    await client.decideApproval('approval/unsafe', decision, 7);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://control.example.test/v1/approvals?limit=20&status=pending',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://control.example.test/v1/approvals/approval%2Funsafe/decision',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(decision),
        headers: expect.objectContaining({
          'Idempotency-Key': 'approve-plan-1',
          'If-Match': '7',
        }),
      })
    );
  });

  it('fails honestly when the control-plane URL is not configured', async () => {
    const client = createAgenticControlPlaneClient({ baseUrl: '', fetchImpl: vi.fn() });

    await expect(client.listAgents()).rejects.toMatchObject({
      name: 'AgenticControlPlaneError',
      code: 'CONTROL_PLANE_NOT_CONFIGURED',
    });
  });

  it('preserves the backend nested error code, details and request id', async () => {
    const client = createAgenticControlPlaneClient({
      baseUrl: 'https://control.example.test',
      fetchImpl: vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: 'run_version_conflict',
              requestId: 'request-123',
              details: { expected: 7, actual: 8 },
            },
          },
          409
        )
      ),
    });

    await expect(client.getRun('run-1')).rejects.toEqual(
      expect.objectContaining({
        message: 'Run version conflict.',
        status: 409,
        code: 'run_version_conflict',
        details: { expected: 7, actual: 8 },
        requestId: 'request-123',
      })
    );
    await expect(Promise.reject(new AgenticControlPlaneError('test'))).rejects.toBeInstanceOf(
      AgenticControlPlaneError
    );
  });
});
