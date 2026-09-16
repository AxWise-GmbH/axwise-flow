import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateTaskAdmission } from '../src/domain/admission.js';

const base = {
  version: 'orqaly_task_admission_request_v1',
  task: { title: 'Handle a generic operation', description: '' },
  requestedSteps: [{ stepKind: 'connector_write', descriptorKey: 'record_update' }],
};

test('admission exposes ready, customer-action, unsupported and plan-only states', () => {
  assert.equal(
    evaluateTaskAdmission(base, {
      executors: ['connector'],
      descriptors: ['record_update'],
      connections: [],
    }).status,
    'ready'
  );
  assert.equal(
    evaluateTaskAdmission(
      {
        ...base,
        requestedSteps: [{ ...base.requestedSteps[0], connectionKey: 'account_connection' }],
      },
      { executors: ['connector'], descriptors: ['record_update'], connections: [] }
    ).status,
    'needs_customer_action'
  );
  assert.equal(
    evaluateTaskAdmission(base, { executors: [], descriptors: [], connections: [] }).status,
    'unsupported'
  );
  assert.equal(
    evaluateTaskAdmission(
      { ...base, requestedSteps: [{ stepKind: 'reason', descriptorKey: 'analysis' }] },
      { executors: [], descriptors: [], connections: [] }
    ).status,
    'plan_only'
  );
});
