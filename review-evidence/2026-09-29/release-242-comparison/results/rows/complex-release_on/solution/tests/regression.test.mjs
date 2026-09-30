import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {auditLabel} from '../src/job-types.ts';
import {headers} from '../src/middleware.ts';
import {logFields} from '../src/logging.ts';
import {response} from '../src/response.ts';
import {work} from '../src/worker.ts';

describe('Regression tests: traceId propagation and Job identifier isolation', () => {
  test('end-to-end propagation through handle', () => {
    const trace = 'trace-xyz-123';
    const user = 'user-alice';
    const job = {requestId: 'job-job-456', name: 'compute-statistics'};

    const result = handle(trace, user, job);

    // RequestContext contains traceId, and no requestId member
    assert.equal(result.context.traceId, trace);
    assert.equal(result.context.userId, user);
    assert.equal(result.context.requestId, undefined);
    assert.equal('requestId' in result.context, false);

    // Wire / output keys remain requestId with trace identifier value
    assert.equal(result.headers['x-request-id'], trace);
    assert.equal(result.logs.requestId, trace);
    assert.equal(result.logs.userId, user);
    assert.equal(result.body.requestId, trace);

    // Unrelated Job identifier remains untouched
    assert.equal(result.body.payload.requestId, 'job-job-456');
    assert.equal(result.body.payload.name, 'compute-statistics');
    assert.equal(result.body.payload.audit, 'job:job-job-456');

    // Forked context suffix reaches worker stage
    assert.equal(result.body.payload.trace, `${trace}/worker`);
  });

  test('unrelated Job identifier remains unchanged in describeJob and auditLabel', () => {
    const ctx = createContext('trace-primary', 'user-bob');
    const job = {requestId: 'unrelated-job-999', name: 'export-csv'};

    const desc = describeJob(job, ctx);
    assert.equal(desc.requestId, 'unrelated-job-999');
    assert.equal(desc.trace, 'trace-primary');
    assert.equal(desc.audit, 'job:unrelated-job-999');
    assert.equal(desc.name, 'export-csv');

    assert.equal(auditLabel('audit-test-id'), 'job:audit-test-id');
  });

  test('context creation, forkContext suffixes, and non-mutation behavior', () => {
    const ctx1 = createContext('root-trace', 'user-test');
    assert.equal(ctx1.traceId, 'root-trace');
    assert.equal(ctx1.userId, 'user-test');
    assert.equal('requestId' in ctx1, false);

    const ctx2 = forkContext(ctx1, 'stage-1');
    assert.equal(ctx2.traceId, 'root-trace/stage-1');
    assert.equal(ctx2.userId, 'user-test');
    // Ensure ctx1 was not mutated
    assert.equal(ctx1.traceId, 'root-trace');

    const ctx3 = forkContext(ctx2, 'stage-2');
    assert.equal(ctx3.traceId, 'root-trace/stage-1/stage-2');
    assert.equal(ctx2.traceId, 'root-trace/stage-1');
    assert.equal(ctx1.traceId, 'root-trace');
  });

  test('trace identifier reaches individual pipeline stages', () => {
    const ctx = createContext('stage-trace', 'user-charlie');
    const job = {requestId: 'job-stage', name: 'stage-job'};

    // headers stage
    const headerResult = headers(ctx);
    assert.deepEqual(headerResult, {'x-request-id': 'stage-trace'});

    // logging stage
    const logResult = logFields(ctx);
    assert.deepEqual(logResult, {requestId: 'stage-trace', userId: 'user-charlie'});

    // worker stage
    const workerResult = work(ctx, job);
    assert.deepEqual(workerResult, {
      requestId: 'job-stage',
      trace: 'stage-trace/worker',
      audit: 'job:job-stage',
      name: 'stage-job'
    });

    // response stage
    const responseResult = response(ctx, workerResult);
    assert.deepEqual(responseResult, {
      requestId: 'stage-trace',
      payload: workerResult
    });
  });
});
