import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {record0} from '../src/catalog/record0.ts';

describe('Regression tests', () => {
  test('end-to-end propagation through app handle', () => {
    const trace = 'trace-abc-123';
    const user = 'user-xyz-456';
    const job = {requestId: 'job-job-789', name: 'background-job'};

    const res = handle(trace, user, job);

    // RequestContext has traceId and no requestId compatibility member
    assert.equal(res.context.traceId, trace);
    assert.equal(res.context.userId, user);
    assert.equal('requestId' in res.context, false);
    assert.equal(res.context.requestId, undefined);

    // Middleware headers use context.traceId
    assert.deepEqual(res.headers, {'x-request-id': trace});

    // Logging uses destructuring of traceId while keeping wire key requestId
    assert.deepEqual(res.logs, {requestId: trace, userId: user});

    // Outer response preserves wire key requestId with trace value
    assert.equal(res.body.requestId, trace);

    // Worker stage forks context with suffix and propagates traceId to describeJob
    assert.equal(res.body.payload.trace, `${trace}/worker`);

    // Unrelated Job.requestId and audit label remain unchanged
    assert.equal(res.body.payload.requestId, job.requestId);
    assert.equal(res.body.payload.audit, `job:${job.requestId}`);
    assert.equal(res.body.payload.name, job.name);
  });

  test('context creation, immutability, and forkContext suffixes', () => {
    const parent = createContext('trace-root', 'user-alpha');
    assert.equal(parent.traceId, 'trace-root');
    assert.equal(parent.userId, 'user-alpha');
    assert.equal('requestId' in parent, false);

    const child = forkContext(parent, 'child');
    // Non-mutation behavior
    assert.equal(parent.traceId, 'trace-root');
    assert.equal(child.traceId, 'trace-root/child');
    assert.equal(child.userId, 'user-alpha');
    assert.notEqual(parent, child);
    assert.equal('requestId' in child, false);

    const grandchild = forkContext(child, 'subchild');
    assert.equal(child.traceId, 'trace-root/child');
    assert.equal(grandchild.traceId, 'trace-root/child/subchild');
  });

  test('describeJob isolates unrelated Job identifier from context traceId', () => {
    const context = createContext('ctx-trace-999', 'user-beta');
    const job = {requestId: 'unrelated-job-id', name: 'compute-task'};

    const result = describeJob(job, context);
    assert.equal(result.requestId, 'unrelated-job-id');
    assert.equal(result.trace, 'ctx-trace-999');
    assert.equal(result.audit, 'job:unrelated-job-id');
    assert.equal(result.name, 'compute-task');
  });

  test('traceSummary in src/plugins/index.ts and plugin consumers preserve output keys', () => {
    const context = createContext('trace-plugin-test', 'user-plugin');
    const summary = traceSummary(context);

    assert.equal(Array.isArray(summary), true);
    assert.equal(summary.length, 8);
    summary.forEach((item, index) => {
      assert.deepEqual(item, {
        requestId: 'trace-plugin-test',
        tag: `plugin${index}`,
        user: 'user-plugin',
      });
    });
  });

  test('unrelated catalog module retains independent RequestContext and requestId', () => {
    const catalogContext = {requestId: 'cat-42', category: 'electronics'};
    const result = record0(catalogContext);
    assert.deepEqual(result, {
      requestId: 'cat-42',
      category: 'electronics',
      label: 'record0:cat-42',
    });
  });
});
