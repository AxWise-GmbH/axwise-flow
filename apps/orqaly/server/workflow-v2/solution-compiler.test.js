import { describe, expect, it } from 'vitest';
import { compileSolutionWorkflow, expectedSolutionOutput } from './solution-compiler.js';
import {
  CreateSolutionSchema,
  SolutionInputSchema,
  SolutionSpecSchema,
} from '../../shared/workflow-v2/solution-contracts.js';

const id = 'a9ae8baa-3bc2-4dc1-a151-f0449ee28dc7';
const spec = {
  kind: 'webhook_transform_v1',
  fields: [{ source: 'name', target: 'customer', transform: 'trim' }],
};
describe('customer solution compilation', () => {
  it('creates the actual three connected n8n nodes deterministically', () => {
    const result = compileSolutionWorkflow({ id, spec });
    expect(compileSolutionWorkflow({ id, spec })).toEqual(result);
    expect(result.workflow.nodes.map((node) => node.type)).toEqual([
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.set',
      'n8n-nodes-base.respondToWebhook',
    ]);
    expect(result.workflow.nodes[0].parameters.path).toBe(`solution-${id}`);
    expect(result.workflow.nodes[1].parameters.jsonOutput).toContain(
      '$json.body.input["name"].trim()'
    );
    expect(result.workflow.nodes[2].parameters.responseBody).toContain('$execution.id');
    expect(result.workflowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.workflow.settings.saveDataSuccessExecution).toBe('none');
  });
  it.each(['trim', 'lowercase', 'uppercase', 'copy'])(
    'supports %s using bounded field access',
    (transform) => {
      expect(() =>
        compileSolutionWorkflow({
          id,
          spec: { ...spec, fields: [{ ...spec.fields[0], transform }] },
        })
      ).not.toThrow();
    }
  );
  it.each(['__proto__', 'constructor', 'prototype', 'x;process.exit()', '$("Secret")', 'foo.bar'])(
    'rejects unsafe field %s',
    (source) => {
      expect(() =>
        SolutionSpecSchema.parse({
          ...spec,
          fields: [{ source, target: 'result', transform: 'copy' }],
        })
      ).toThrow();
    }
  );
  it('rejects arbitrary expressions, duplicate outputs and unknown capabilities', () => {
    expect(() =>
      SolutionSpecSchema.parse({ ...spec, fields: [...spec.fields, ...spec.fields] })
    ).toThrow();
    expect(() => SolutionSpecSchema.parse({ ...spec, code: 'return secret' })).toThrow();
    expect(() => SolutionSpecSchema.parse({ ...spec, kind: 'arbitrary_code' })).toThrow();
    expect(() =>
      CreateSolutionSchema.parse({ agentId: id, name: 'x', purpose: 'x', spec, tenantId: id })
    ).toThrow();
  });
  it('preserves scalar types and rejects missing/text-incompatible inputs', () => {
    expect(expectedSolutionOutput(spec, { name: ' Alice ' })).toEqual({ customer: 'Alice' });
    expect(() => expectedSolutionOutput(spec, { name: 2 })).toThrow('must be text');
    expect(() => expectedSolutionOutput(spec, {})).toThrow('Missing required');
    expect(
      expectedSolutionOutput(
        { ...spec, fields: [{ source: 'count', target: 'number', transform: 'copy' }] },
        { count: 2 }
      )
    ).toEqual({ number: 2 });
    expect(() => SolutionInputSchema.parse({ name: { nested: true } })).toThrow();
    expect(() => SolutionInputSchema.parse({ name: 'x'.repeat(4001) })).toThrow();
  });
});
