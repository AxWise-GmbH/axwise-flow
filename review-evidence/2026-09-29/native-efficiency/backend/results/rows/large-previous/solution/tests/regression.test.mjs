import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {auditLabel} from '../src/job-types.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {record0, audit0} from '../src/catalog/record0.ts';

describe('RequestContext traceId migration regression tests', () => {
  test('end-to-end propagation through handle', () => {
    const job = {requestId: 'job-xyz-999', name: 'compile-artifact'};
    const result = handle('trace-abc-123', 'user-admin-42', job);

    // Root context validation: traceId exists, requestId compatibility member does not exist
    assert.equal(result.context.traceId, 'trace-abc-123');
    assert.equal(result.context.userId, 'user-admin-42');
    assert.equal('requestId' in result.context, false);
    assert.equal(result.context.requestId, undefined);

    // Middleware headers wire key
    assert.deepEqual(result.headers, {'x-request-id': 'trace-abc-123'});

    // Logging wire fields
    assert.deepEqual(result.logs, {
      requestId: 'trace-abc-123',
      userId: 'user-admin-42',
    });

    // Wire response: wire requestId preserves trace identifier
    assert.equal(result.body.requestId, 'trace-abc-123');

    // Worker payload: propagated through forkContext and describeJob
    assert.equal(result.body.payload.trace, 'trace-abc-123/worker');
    assert.equal(result.body.payload.requestId, 'job-xyz-999');
    assert.equal(result.body.payload.audit, 'job:job-xyz-999');
    assert.equal(result.body.payload.name, 'compile-artifact');
  });

  test('unrelated Job.requestId and auditLabel remain intact', () => {
    const job = {requestId: 'unrelated-job-id-555', name: 'data-sync'};
    const ctx = createContext('trace-primary', 'user-bob');

    assert.equal(auditLabel(job.requestId), 'job:unrelated-job-id-555');

    const jobDescription = describeJob(job, ctx);
    assert.equal(jobDescription.requestId, 'unrelated-job-id-555');
    assert.equal(jobDescription.trace, 'trace-primary');
    assert.equal(jobDescription.audit, 'job:unrelated-job-id-555');
    assert.equal(jobDescription.name, 'data-sync');
  });

  test('context creation and non-mutation with forkContext', () => {
    const initial = createContext('root-trace', 'user-alice');
    assert.equal(initial.traceId, 'root-trace');
    assert.equal(initial.userId, 'user-alice');
    assert.equal('requestId' in initial, false);

    const forked1 = forkContext(initial, 'subtask1');
    assert.equal(forked1.traceId, 'root-trace/subtask1');
    assert.equal(forked1.userId, 'user-alice');
    // Ensure initial context was not mutated
    assert.equal(initial.traceId, 'root-trace');

    const forked2 = forkContext(forked1, 'step2');
    assert.equal(forked2.traceId, 'root-trace/subtask1/step2');
    assert.equal(forked1.traceId, 'root-trace/subtask1');
    assert.equal(initial.traceId, 'root-trace');
  });

  test('traceSummary and plugin consumers receive traceId', () => {
    const ctx = createContext('trace-plugins-test', 'user-charlie');
    const summary = traceSummary(ctx);

    assert.equal(summary.length, 8);
    summary.forEach((pluginResult, idx) => {
      assert.deepEqual(pluginResult, {
        requestId: 'trace-plugins-test',
        tag: `plugin${idx}`,
        user: 'user-charlie',
      });
    });
  });

  test('catalog modules preserve independent RequestContext and requestId', () => {
    const catalogCtx = {requestId: 'cat-req-1', category: 'books'};
    const rec = record0(catalogCtx);
    assert.deepEqual(rec, {
      requestId: 'cat-req-1',
      category: 'books',
      label: 'record0:cat-req-1',
    });
    assert.equal(audit0('cat-audit-1'), 'audit0:cat-audit-1');
  });
});
