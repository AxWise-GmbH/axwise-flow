import { describe, expect, it, vi } from 'vitest';
import {
  nativeWorkflowBuilderEnabledFromEnvironment,
  solutionScheduleEnvironmentIdsFromEnvironment,
} from './native-workflow-config.js';
import { verifyNativeWorkflowReadiness } from './postgres-repository.js';
import {
  SolutionInputSchema,
  SolutionInvocationSchema,
} from '../../shared/workflow-v2/solution-contracts.js';
import { SolutionApplicationInvocationSchema } from '../../shared/workflow-v2/solution-application-key-contracts.js';
import { NativeDataSchema } from '../../shared/workflow-v2/native-workflow-contracts.js';

describe('additive native builder gate and input transport', () => {
  it('requires an explicit bounded schedule runtime allowlist when enabled, never all environments by omission', () => {
    expect(solutionScheduleEnvironmentIdsFromEnvironment({})).toEqual([]);
    expect(() =>
      solutionScheduleEnvironmentIdsFromEnvironment({ ORQALY_SOLUTION_SCHEDULES_ENABLED: 'true' })
    ).toThrow('required');
    expect(
      solutionScheduleEnvironmentIdsFromEnvironment({
        ORQALY_SOLUTION_SCHEDULES_ENABLED: 'true',
        ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS: '["orqaly-customer-webhook-preview-003"]',
      })
    ).toEqual(['orqaly-customer-webhook-preview-003']);
    expect(
      solutionScheduleEnvironmentIdsFromEnvironment({
        ORQALY_SOLUTION_SCHEDULES_ENABLED: 'true',
        ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS: '[]',
      })
    ).toEqual([]);
    for (const value of [
      'null',
      '{}',
      'true',
      '["*"]',
      '["https://runtime.example"]',
      '["runtime-003","runtime-003"]',
      '[1]',
      'not json',
      JSON.stringify(Array(101).fill('runtime-003')),
      JSON.stringify(['x'.repeat(8192)]),
    ])
      expect(() =>
        solutionScheduleEnvironmentIdsFromEnvironment({
          ORQALY_SOLUTION_SCHEDULES_ENABLED: 'true',
          ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS: value,
        })
      ).toThrow();
  });
  it.each([undefined, '', 'false'])('defaults safely off for %s', (value) =>
    expect(
      nativeWorkflowBuilderEnabledFromEnvironment({ ORQALY_NATIVE_WORKFLOW_BUILDER_ENABLED: value })
    ).toBe(false)
  );
  it('enables only exact true and rejects configuration typos', () => {
    expect(
      nativeWorkflowBuilderEnabledFromEnvironment({
        ORQALY_NATIVE_WORKFLOW_BUILDER_ENABLED: 'true',
      })
    ).toBe(true);
    for (const value of ['TRUE', '1', 'yes', true])
      expect(() =>
        nativeWorkflowBuilderEnabledFromEnvironment({
          ORQALY_NATIVE_WORKFLOW_BUILDER_ENABLED: value,
        })
      ).toThrow();
  });
  it('keeps the V1 scalar validator unchanged while carrying bounded nested JSON to per-Solution validation', () => {
    const input = { records: [{ amount: 10, tags: ['new'] }] };
    expect(SolutionInputSchema.safeParse(input).success).toBe(false);
    expect(SolutionInvocationSchema.safeParse({ mode: 'test', input }).success).toBe(true);
    expect(SolutionApplicationInvocationSchema.safeParse({ input }).success).toBe(true);
    expect(
      SolutionInvocationSchema.safeParse({ mode: 'test', input: { data: 'a'.repeat(16001) } })
        .success
    ).toBe(false);
    expect(
      SolutionApplicationInvocationSchema.safeParse({ input: JSON.parse('{"__proto__":{"a":1}}') })
        .success
    ).toBe(false);
  });
  it('rejects excessively nested contract schemas before recursive parser traversal', () => {
    let schema = { type: 'number' };
    for (let i = 0; i < 1000; i++) schema = { type: 'array', items: schema };
    expect(() => NativeDataSchema.safeParse(schema)).not.toThrow();
    expect(NativeDataSchema.safeParse(schema).success).toBe(false);
  });
});
describe('native migration015 readiness with no tenant data', () => {
  const fixture = (overrides = {}) => ({
    query: vi.fn().mockResolvedValue({
      rows: [
        {
          isolated_tables: 3,
          build_grants: true,
          api_grants: true,
          retest_grants: true,
          verification_grants: true,
          ...overrides,
        },
      ],
    }),
  });
  it.each([false, true])(
    'checks only schema/grants/RLS for api=%s, never reads customer data',
    async (api) => {
      const pool = fixture();
      await verifyNativeWorkflowReadiness(pool, { api });
      for (const [sql] of pool.query.mock.calls.slice(0, -1)) {
        expect(sql).toMatch(/^SELECT .* LIMIT 0$/);
        expect(sql).not.toContain('*');
      }
      const [sql, params] = pool.query.mock.calls.at(-1);
      expect(sql).toContain('c.relrowsecurity AND c.relforcerowsecurity');
      expect(sql).toContain('claim_native_workflow_retest(uuid)');
      expect(params).toEqual([api]);
      expect(
        pool.query.mock.calls.some(([query]) =>
          /\b(?:SET ROLE|ALTER|GRANT|set_config)\b/i.test(query)
        )
      ).toBe(false);
    }
  );
  it.each([
    { isolated_tables: 2 },
    { build_grants: false },
    { api_grants: false },
    { retest_grants: false },
    { verification_grants: false },
  ])('fails closed on missing isolation/grants %s', async (values) => {
    await expect(verifyNativeWorkflowReadiness(fixture(values), { api: true })).rejects.toThrow(
      'Native workflow migration/role isolation is incomplete'
    );
  });
  it('propagates missing migration without attempting repair or role escalation', async () => {
    const pool = fixture();
    pool.query.mockRejectedValueOnce(Object.assign(new Error('missing column'), { code: '42703' }));
    await expect(verifyNativeWorkflowReadiness(pool)).rejects.toMatchObject({ code: '42703' });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
