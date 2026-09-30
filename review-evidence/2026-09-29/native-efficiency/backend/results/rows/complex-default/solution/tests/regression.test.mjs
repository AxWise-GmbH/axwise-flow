import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {logFields} from '../src/logging.ts';
import {headers} from '../src/middleware.ts';
import {response} from '../src/response.ts';
import {work} from '../src/worker.ts';

describe('RequestContext traceId migration and propagation', () => {
  test('end-to-end propagation and unrelated Job identifier via handle()', () => {
    const trace = 'trace-root-42';
    const user = 'user-alice';
    const job = {requestId: 'job-task-99', name: 'process-data'};

    const result = handle(trace, user, job);

    // RequestContext should carry traceId and not have a requestId property
    assert.equal(result.context.traceId, trace);
    assert.equal(result.context.userId, user);
    assert.equal('requestId' in result.context, false);
    assert.equal(result.context.requestId, undefined);

    // Middleware headers should receive traceId
    assert.equal(result.headers['x-request-id'], trace);

    // Logging should output the traceId under existing key requestId
    assert.equal(result.logs.requestId, trace);
    assert.equal(result.logs.userId, user);

    // Top-level response wire body should retain requestId key with traceId value
    assert.equal(result.body.requestId, trace);

    // Payload should have trace identifier propagated to worker stage with /worker suffix
    assert.equal(result.body.payload.trace, `${trace}/worker`);

    // Unrelated Job identifier and audit label must remain intact
    assert.equal(result.body.payload.requestId, job.requestId);
    assert.equal(result.body.payload.audit, `job:${job.requestId}`);
    assert.equal(result.body.payload.name, job.name);
  });

  test('context-factory non-mutation and suffix chaining', () => {
    const initial = createContext('trace-init', 'user-bob');
    assert.equal(initial.traceId, 'trace-init');
    assert.equal(initial.userId, 'user-bob');
    assert.equal('requestId' in initial, false);

    const child = forkContext(initial, 'child');
    assert.equal(child.traceId, 'trace-init/child');
    assert.equal(child.userId, 'user-bob');
    assert.equal('requestId' in child, false);

    // Ensure non-mutation of initial context
    assert.equal(initial.traceId, 'trace-init');
    assert.notEqual(initial, child);

    const grandchild = forkContext(child, 'grandchild');
    assert.equal(grandchild.traceId, 'trace-init/child/grandchild');
    assert.equal(child.traceId, 'trace-init/child');
    assert.notEqual(child, grandchild);
  });

  test('individual stage consumers propagation and isolation', () => {
    const ctx = createContext('trace-stage-1', 'user-charlie');
    const job = {requestId: 'job-unrelated-77', name: 'sync-cache'};

    // headers consumer
    assert.deepEqual(headers(ctx), {'x-request-id': 'trace-stage-1'});

    // logFields consumer (destructuring and alias)
    assert.deepEqual(logFields(ctx), {requestId: 'trace-stage-1', userId: 'user-charlie'});

    // describeJob consumer
    const jobDesc = describeJob(job, ctx);
    assert.equal(jobDesc.trace, 'trace-stage-1');
    assert.equal(jobDesc.requestId, 'job-unrelated-77');
    assert.equal(jobDesc.audit, 'job:job-unrelated-77');
    assert.equal(jobDesc.name, 'sync-cache');

    // worker consumer
    const workerRes = work(ctx, job);
    assert.equal(workerRes.trace, 'trace-stage-1/worker');
    assert.equal(workerRes.requestId, 'job-unrelated-77');
    assert.equal(workerRes.audit, 'job:job-unrelated-77');
    assert.equal(workerRes.name, 'sync-cache');
    // Ensure parent ctx is unchanged after work()
    assert.equal(ctx.traceId, 'trace-stage-1');

    // response consumer
    const res = response(ctx, workerRes);
    assert.equal(res.requestId, 'trace-stage-1');
    assert.equal(res.payload, workerRes);
  });
});
